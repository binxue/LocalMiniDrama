const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const service = require('../src/services/managedAgentService');

test('managed agent tasks persist input version and do not accept unknown agents', () => {
  const db = new Database(':memory:');
  service.ensureTable(db);
  assert.throws(() => service.createTask(db, { info() {}, error() {} }, { agent_id: 'agent-unknown', work_id: 'w', input: 'x' }), /白名单/);
  const stamp = new Date().toISOString();
  db.prepare(`INSERT INTO managed_agent_tasks (task_id, work_id, agent_id, task_status, input_version, input_text, created_at, updated_at) VALUES ('mat_test', 'm1-test', 'agent-20261011131513-17rey', 'queued', ?, '短任务', ?, ?)`)
    .run(require('crypto').createHash('sha256').update('短任务').digest('hex'), stamp, stamp);
  const task = service.getTask(db, 'mat_test');
  assert.match(task.task_id, /^mat_/);
  assert.equal(task.input_version.length, 64);
  assert.equal(task.task_status, 'queued');
  service.recoverOnStartup(db, { warn() {} });
  assert.equal(service.getTask(db, task.task_id).task_status, 'interrupted');
  db.close();
});

test('events preserve missing usage and extract only actual agent messages', () => {
  const result = service.extract([
    { type: 'agent.thinking', content: [{ type: 'text', text: 'not output' }] },
    { type: 'span.model_request_start' },
    { type: 'span.model_request_end' },
    { type: 'span.model_request_start' },
    { type: 'agent.message', content: [{ type: 'text', text: 'actual output' }] },
    { type: 'session.status_idle' },
  ]);
  assert.equal(result.text, 'actual output');
  assert.equal(result.usage.missing_usage_requests, 1);
  assert.equal(result.usage.unfinished_requests, 1);
  assert.equal(service.extract([{ type: 'session.status_idle' }]).text, '');
});

test('task isolation fields and attempt id prevent cross-version reuse', () => {
  const db = new Database(':memory:');
  service.ensureTable(db);
  const stamp = new Date().toISOString();
  db.prepare(`INSERT INTO managed_agent_tasks (task_id, work_id, agent_id, session_id, task_status, input_version, input_text, attempt_id, episode_id, revision_id, source_sha256, candidate_sha256, context_hash, created_at, updated_at) VALUES (?, ?, ?, ?, 'incomplete', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run('mat_a', 'rainforest', 'agent-20261011131619-47ft8', 'ses_a', 'a'.repeat(64), 'writer', 'att_a', 'ep3', 'rev_v2', 's'.repeat(64), null, 'c'.repeat(64), stamp, stamp);
  assert.throws(() => db.prepare('INSERT INTO managed_agent_tasks (task_id, work_id, agent_id, session_id, task_status, input_version, input_text, attempt_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('mat_b', 'other', 'agent-20261011131710-ncebb', 'ses_a', 'queued', 'b'.repeat(64), 'editor', 'att_b', stamp, stamp), /UNIQUE/);
  assert.equal(service.getTask(db, 'mat_a').revision_id, 'rev_v2');
  assert.equal(service.getTask(db, 'mat_a').agent_id, 'agent-20261011131619-47ft8');
  db.close();
});

test('Windows local paths are rejected before cloud submission', () => {
  const db = new Database(':memory:');
  service.ensureTable(db);
  assert.throws(() => service.createTask(db, { info() {}, error() {} }, { agent_id: 'agent-20261011131513-17rey', work_id: 'w', input: '读取 H:\\互动剧\\雨林\\故事.md' }), /Windows 本地路径/);
  db.close();
});

test('restart keeps tasks with cloud sessions recoverable', () => {
  const db = new Database(':memory:');
  service.ensureTable(db);
  const stamp = new Date().toISOString();
  db.prepare(`INSERT INTO managed_agent_tasks (task_id, work_id, agent_id, session_id, task_status, input_version, input_text, attempt_id, created_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?), (?, ?, ?, NULL, 'running', ?, ?, ?, ?, ?)`)
    .run('mat_session', 'a', 'agent-20261011131513-17rey', 'ses_a', 'a'.repeat(64), 'x', 'att_a', stamp, stamp, 'mat_no_session', 'b', 'agent-20261011131513-17rey', 'b'.repeat(64), 'y', 'att_b', stamp, stamp);
  service.recoverOnStartup(db, { warn() {} });
  assert.equal(service.getTask(db, 'mat_session').task_status, 'awaiting_recovery');
  assert.equal(service.getTask(db, 'mat_session').completed_at, null);
  assert.equal(service.getTask(db, 'mat_no_session').task_status, 'interrupted');
  db.close();
});
