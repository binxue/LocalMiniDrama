const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALLOWED_AGENTS = new Set([
  'agent-20261011131513-17rey',
  'agent-20261011131619-47ft8',
  'agent-20261011131626-3w9ao',
  'agent-20261011131703-mbc7o',
  'agent-20261011131710-ncebb',
]);

function now() { return new Date().toISOString(); }
function sha(value) { return crypto.createHash('sha256').update(value || '').digest('hex'); }
function parseJson(text) { return JSON.parse(text); }
function redact(text) { return String(text || '').replace(/ark-[\w-]{12,}/g, 'ark-REDACTED').replace(/Bearer\s+\S+/gi, 'Bearer REDACTED'); }
function cliPath() {
  if (process.env.ARKCLI_BINARY) return process.env.ARKCLI_BINARY;
  if (process.platform !== 'win32') return 'arkcli';
  const binary = path.join(process.env.APPDATA || '', 'npm/node_modules/@volcengine/ark-cli/bin/arkcli-windows-amd64.exe');
  if (!fs.existsSync(binary)) throw new Error('设置 ARKCLI_BINARY 为已安装 CLI 可执行文件路径');
  return binary;
}

async function runArk(args, timeout = 30000) {
  const env = { ...process.env, ARKCLI_NO_UPDATE_NOTIFIER: '1', ARKCLI_CALLER_TYPE: 'ai_agent', ARKCLI_CALLER_NAME: 'localminidrama', ARKCLI_SKILL_NAME: 'arkcli-agent' };
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      const child = execFile(cliPath(), args, { env, timeout, maxBuffer: 20 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
        if (err) { err.stderr = stderr; reject(err); } else resolve({ stdout, stderr });
      });
      // CLI write commands inspect non-TTY stdin. Explicit EOF prevents waiting forever.
      child.stdin.end();
    });
  }
  catch (err) { throw new Error(redact(err.stderr || (err.killed ? `Ark CLI timeout after ${timeout}ms` : err.code) || 'Ark CLI 调用失败')); }
  return result.stdout || '';
}

function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS managed_agent_tasks (
    task_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, agent_id TEXT NOT NULL, session_id TEXT,
    task_status TEXT NOT NULL, input_version TEXT NOT NULL, output_version TEXT,
    input_text TEXT NOT NULL, output_text TEXT, events_json TEXT NOT NULL DEFAULT '[]',
    usage_json TEXT NOT NULL DEFAULT '{}', error_text TEXT, created_at TEXT NOT NULL,
    completed_at TEXT, updated_at TEXT NOT NULL
  )`);
  const columns = new Set(db.prepare('PRAGMA table_info(managed_agent_tasks)').all().map(c => c.name));
  for (const column of ['model_id', 'session_create_json', 'send_json', 'attempt_id', 'episode_id', 'revision_id', 'source_sha256', 'candidate_sha256', 'context_hash', 'task_mode']) {
    if (!columns.has(column)) db.exec(`ALTER TABLE managed_agent_tasks ADD COLUMN ${column} TEXT`);
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_managed_agent_session_unique ON managed_agent_tasks(session_id) WHERE session_id IS NOT NULL");
}

function row(db, id) {
  const r = db.prepare('SELECT * FROM managed_agent_tasks WHERE task_id = ?').get(id);
  if (!r) return null;
  return { ...r, events: parseJson(r.events_json) || [], usage: parseJson(r.usage_json) || {} };
}

function update(db, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const values = keys.map(k => fields[k]);
  db.prepare(`UPDATE managed_agent_tasks SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE task_id = ?`)
    .run(...values, now(), id);
}

async function createSession(agentId, title) {
  const out = await runArk(['agent', 'session', 'create', '--agent-id', agentId, '--environment-id', process.env.ARK_AGENT_ENVIRONMENT_ID || 'env-20261011083635-eeeu2', '--title', title, '--format', 'json'], 60000);
  const json = parseJson(out);
  const result = json?.Result || json?.result;
  if (!result?.Id) throw new Error('Managed Agent Session 创建未返回 session id');
  return { id: result.Id, model: result.Agent?.Model?.Id, raw: json };
}

async function sendMessage(sessionId, text) {
  return runArk(['agent', 'session', 'events', 'send', sessionId, '--type', 'user.message', '--text', text, '--format', 'json'], 60000);
}

const EVENTS_LIST_TIMEOUT = 120000;

async function poll(sessionId, onEvents, maxPolls = 40) {
  let events = [];
  const deadline = Date.now() + 300000;
  let pollError = null;
  for (let i = 0; i < maxPolls; i += 1) {
    if (Date.now() >= deadline) break;
    let data;
    try {
      const out = await runArk(['--page-all', '--page-limit', '10', 'agent', 'session', 'events', 'list', sessionId, '--order', 'asc', '--limit', '100', '--format', 'json'], EVENTS_LIST_TIMEOUT);
      data = parseJson(out)?.data || [];
    } catch (err) {
      pollError = redact(err.message);
      break;
    }
    events = [...new Map([...events, ...data].map(e => [e.id, e])).values()];
    onEvents(events);
    if (events.some(e => ['session.status_idle', 'session.status_failed', 'session.status_terminated', 'session.error', 'session.requires_action'].includes(e.type))) break;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  return { events, pollError };
}

function extract(events) {
  const messages = events.filter(e => e.type === 'agent.message');
  const text = messages.flatMap(e => e.content || []).filter(c => c.type === 'text').map(c => c.text || '').join('\n');
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, requests: 0, missing_usage_requests: 0 };
  for (const e of events.filter(e => e.type === 'span.model_request_end')) {
    usage.requests += 1;
    if (!e.model_usage) usage.missing_usage_requests += 1;
    usage.input_tokens += Number(e.model_usage?.input_tokens || 0);
    usage.output_tokens += Number(e.model_usage?.output_tokens || 0);
    usage.cache_read_input_tokens += Number(e.model_usage?.cache_read_input_tokens || 0);
  }
  usage.unfinished_requests = Math.max(0, events.filter(e => e.type === 'span.model_request_start').length - usage.requests);
  return { text, usage, messages: messages.length, terminal: events.at(-1)?.type || null };
}

async function execute(db, log, taskId) {
  const task = row(db, taskId);
  if (!task || task.task_status !== 'queued') return;
  try {
    update(db, taskId, { task_status: 'starting' });
    const session = await createSession(task.agent_id, `LocalMiniDrama ${task.work_id} ${taskId}`);
    const sessionId = session.id;
    update(db, taskId, { session_id: sessionId, model_id: session.model || null, session_create_json: JSON.stringify(session.raw), task_status: 'submitted' });
    const sent = await sendMessage(sessionId, task.input_text);
    update(db, taskId, { send_json: sent });
    update(db, taskId, { task_status: 'running' });
    const polled = await poll(sessionId, data => {
      const partial = extract(data);
      update(db, taskId, { events_json: JSON.stringify(data), usage_json: JSON.stringify(partial.usage) });
    });
    const events = polled.events;
    const result = extract(events);
    const idle = events.some(e => e.type === 'session.status_idle');
    const failed = events.some(e => ['session.status_failed', 'session.status_terminated', 'session.error'].includes(e.type) || (e.type === 'span.model_request_end' && e.is_error));
    const status = failed ? 'failed' : (idle && result.text.trim() ? 'completed' : 'incomplete');
    const recoveryError = polled.pollError ? `事件回查暂时失败，Session 仍可恢复：${polled.pollError}` : `云端终态 ${result.terminal || 'unknown'}，正文消息=${result.messages}`;
    update(db, taskId, { task_status: status, output_text: result.text || null, output_version: result.text ? sha(result.text) : null, events_json: JSON.stringify(events), usage_json: JSON.stringify(result.usage), error_text: status === 'completed' ? null : recoveryError, completed_at: status === 'completed' || status === 'failed' ? now() : null });
    log.info('Managed Agent task finished', { task_id: taskId, status, session_id: sessionId });
  } catch (err) {
    update(db, taskId, { task_status: 'failed', error_text: redact(err.message), completed_at: now() });
    log.error('Managed Agent task failed', { task_id: taskId, error: err.message });
  }
}

function createTask(db, log, { agent_id: agentId, work_id: workId, input, orchestration = false, episode_id: episodeId = null, revision_id: revisionId = null, source_sha256: sourceSha = null, candidate_sha256: candidateSha = null, context_hash: contextHash = null, attempt_id: attemptId = `att_${crypto.randomUUID()}` }) {
  ensureTable(db);
  if (!ALLOWED_AGENTS.has(agentId)) throw new Error('agent_id 不在已部署的 LocalMiniDrama Agent 白名单中');
  if (!workId || typeof input !== 'string' || !input.trim()) throw new Error('work_id 和 input 必填');
  if (typeof workId !== 'string' || workId.length > 100 || input.length > 8000) throw new Error('work_id 最长100字符，input 最长8000字符');
  if (/[A-Za-z]:\\/.test(input)) throw new Error('禁止把 Windows 本地路径传入云端任务');
  if (db.prepare('SELECT 1 FROM managed_agent_tasks WHERE attempt_id = ?').get(attemptId)) throw new Error('attempt_id 已存在，禁止重复提交');
  const insert = db.transaction(() => {
    if (db.prepare("SELECT count(*) n FROM managed_agent_tasks WHERE task_status IN ('queued','starting','submitted','running')").get().n) throw new Error('已有进行中的 Agent 任务');
    const chatLimit = Number(process.env.LOCALMINIDRAMA_CHAT_DAILY_LIMIT || 0);
    if (!orchestration && chatLimit > 0 && db.prepare("SELECT count(*) n FROM managed_agent_tasks WHERE task_mode = 'chat' AND created_at >= ?").get(new Date(Date.now() - 86400000).toISOString()).n >= chatLimit) throw new Error(`聊天额度已达到配置上限（${chatLimit}/24小时），请等待滚动窗口恢复`);
    const taskId = `mat_${crypto.randomUUID()}`;
    const stamp = now();
    db.prepare(`INSERT INTO managed_agent_tasks (task_id, work_id, agent_id, task_status, input_version, input_text, attempt_id, episode_id, revision_id, source_sha256, candidate_sha256, context_hash, task_mode, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(taskId, workId, agentId, sha(input), input, attemptId, episodeId, revisionId, sourceSha, candidateSha, contextHash, orchestration ? 'orchestration' : 'chat', stamp, stamp);
    return taskId;
  });
  const taskId = insert();
  setImmediate(() => execute(db, log, taskId));
  return row(db, taskId);
}

function getTask(db, taskId) { ensureTable(db); return row(db, taskId); }
async function refreshTask(db, taskId) {
  const task = getTask(db, taskId);
  if (!task || !task.session_id) throw new Error('没有可回查的 Session');
  let out;
  try {
    out = await runArk(['--page-all', '--page-limit', '10', 'agent', 'session', 'events', 'list', task.session_id, '--order', 'asc', '--limit', '100', '--format', 'json'], EVENTS_LIST_TIMEOUT);
  } catch (err) {
    update(db, taskId, { error_text: `事件回查暂时失败，Session 仍可恢复：${redact(err.message)}` });
    return row(db, taskId);
  }
  const events = [...new Map([...(task.events || []), ...(parseJson(out).data || [])].map(e => [e.id, e])).values()];
  const result = extract(events);
  const idle = events.some(e => e.type === 'session.status_idle');
  const failed = events.some(e => ['session.error', 'session.status_failed', 'session.status_terminated'].includes(e.type) || (e.type === 'span.model_request_end' && e.is_error));
  const status = failed ? 'failed' : idle && result.text.trim() ? 'completed' : task.task_status;
  update(db, taskId, { task_status: status, events_json: JSON.stringify(events), usage_json: JSON.stringify(result.usage), output_text: result.text || null, output_version: result.text ? sha(result.text) : null,
    error_text: status === 'completed' ? null : task.error_text, completed_at: ['completed', 'failed'].includes(status) ? task.completed_at || now() : null });
  return row(db, taskId);
}
function listTasks(db, limit = 50) { ensureTable(db); return db.prepare('SELECT * FROM managed_agent_tasks ORDER BY created_at DESC LIMIT ?').all(Math.min(Math.max(Number(limit) || 50, 1), 200)).map(r => ({ ...r, events: undefined, usage: parseJson(r.usage_json) || {} })); }

function recoverOnStartup(db, log) {
  ensureTable(db);
  const stamp = now();
  const recoverable = db.prepare("UPDATE managed_agent_tasks SET task_status = 'awaiting_recovery', error_text = ?, updated_at = ?, completed_at = NULL WHERE session_id IS NOT NULL AND task_status IN ('queued', 'starting', 'submitted', 'running')")
    .run('服务重启后保留云端 Session，等待只读回查', stamp);
  const interrupted = db.prepare("UPDATE managed_agent_tasks SET task_status = 'interrupted', error_text = ?, updated_at = ?, completed_at = ? WHERE session_id IS NULL AND task_status IN ('queued', 'starting', 'submitted', 'running')")
    .run('服务重启时任务尚未创建云端 Session', stamp, stamp);
  const result = { changes: recoverable.changes + interrupted.changes, recoverable: recoverable.changes, interrupted: interrupted.changes };
  if (result.changes) log.warn('Managed Agent tasks interrupted after restart', { count: result.changes });
  return result.changes;
}

module.exports = { ensureTable, createTask, getTask, listTasks, refreshTask, recoverOnStartup, ALLOWED_AGENTS, extract };
