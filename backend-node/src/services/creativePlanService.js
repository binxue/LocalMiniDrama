const crypto = require('crypto');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const PLAN_CONTRACT = `策划交付格式：输出一个 fenced json 对象，schema="creative-plan/v1"。
字段 story（统一故事设定字符串）、characters（人物目标与关系字符串）、episodes（数组）。
每集包含 episode_no（整数）、title、goal（剧情及人物目标）、conflict、reversal、hook、continuity（继承事实与结束状态）、requirements（时长/场景/表达约束），以上为非空字符串；scenes、beats为非空字符串数组；plots为非空数组，每项包含 scene、action、result、emotion（均非空字符串）。
必须覆盖用户要求的每一集，不以一句全剧方向代替分集设计；剧情按因果推进。互动作品在requirements/continuity中明确选择、后果、汇合和状态。只返回本范围规划，后续仍为候选。`;

function validatePlan(plan, start, end) {
  if (plan?.schema !== 'creative-plan/v1') throw new Error('规划格式必须为creative-plan/v1');
  const text = (value, label) => { if (typeof value !== 'string' || !value.trim() || value.length > 12000) throw new Error(`${label}不能为空且最多12000字符`); };
  text(plan.story, '故事设定'); text(plan.characters, '人物关系');
  if (!Array.isArray(plan.episodes) || plan.episodes.length > 50) throw new Error('分集规划必须为不超过50集的数组');
  const seen = new Set();
  for (const ep of plan.episodes) {
    if (!Number.isInteger(ep.episode_no) || ep.episode_no < start || ep.episode_no > end || seen.has(ep.episode_no)) throw new Error('规划集数无效、超出范围或重复');
    seen.add(ep.episode_no);
    for (const key of ['title','goal','conflict','reversal','hook','continuity','requirements']) text(ep[key], `第${ep.episode_no}集${key}`);
    for (const key of ['scenes','beats']) {
      if (!Array.isArray(ep[key]) || !ep[key].length || ep[key].length > 100) throw new Error(`第${ep.episode_no}集缺少${key}`);
      ep[key].forEach(v => text(v, key));
    }
    if (!Array.isArray(ep.plots) || !ep.plots.length || ep.plots.length > 100) throw new Error(`第${ep.episode_no}集缺少剧情拆解`);
    for (const plot of ep.plots) for (const key of ['scene','action','result','emotion']) text(plot[key], key);
  }
  for (let n = start; n <= end; n++) if (!seen.has(n)) throw new Error(`规划未覆盖第${n}集`);
  if (JSON.stringify(plan).length > 180000) throw new Error('规划超出保存范围');
  return plan;
}

function parsePlan(raw, start, end) {
  const text = String(raw || '').trim();
  const candidates = [...text.matchAll(/```json\s*([\s\S]*?)```/gi)].map(m => m[1]);
  if (text.startsWith('{')) candidates.push(text);
  for (const candidate of candidates) {
    let plan; try { plan = JSON.parse(candidate); } catch { continue; }
    if (plan?.schema === 'creative-plan/v1') return validatePlan(plan, start, end);
  }
  return null;
}

function episodeInput(plan, episodeNo) {
  const ep = plan.episodes.find(e => e.episode_no === episodeNo);
  if (!ep) throw new Error(`缺少第${episodeNo}集规划，不能提交Writer`);
  return JSON.stringify({ schema: plan.schema, story: plan.story, characters: plan.characters, episode: ep }, null, 2);
}

function episodeMaterials(db, batchId, episodeNo) {
  const current = view(db, batchId);
  const batch = db.prepare('SELECT episode_start,episode_end FROM script_assistant_batches WHERE batch_id=?').get(batchId);
  if (!batch) throw new Error('策划批次不存在');
  const allowLegacy = batch.episode_start === batch.episode_end;
  const expertDesigns = current.expert_outputs
    .map(raw => expertInput(raw, episodeNo, { allowLegacy }))
    .filter(Boolean);
  return {
    plan: current.plan ? episodeInput(current.plan, episodeNo) : null,
    plan_sha256: current.plan_sha256,
    version_id: current.version_id,
    expert_designs: expertDesigns,
  };
}

function expertInput(raw, episodeNo, { allowLegacy = false } = {}) {
  for (const match of String(raw || '').matchAll(/```json\s*([\s\S]*?)```/gi)) {
    let data; try { data = JSON.parse(match[1]); } catch { continue; }
    if (data.schema !== 'expert-design/v1') continue;
    const episodes = data.episodes;
    if (typeof data.global !== 'string' || !Array.isArray(episodes)) throw new Error('专家资料格式无效');
    const matches = episodes.filter(e => e.episode_no === episodeNo);
    if (matches.length !== 1 || typeof matches[0].design !== 'string' || !matches[0].design.trim()) throw new Error(`专家设计未覆盖第${episodeNo}集`);
    return `统一专业设计：${data.global}\n第${episodeNo}集专业设计：${matches[0].design}`;
  }
  // A completed runtime task may predate the structured expert-design/v1
  // response contract. Keep that raw, auditable advice usable only when the
  // caller explicitly opts in; strict validation remains the default for new
  // multi-episode planning.
  if (allowLegacy && String(raw || '').trim()) return String(raw).trim();
  return null;
}

// A projection of exact source sections, not invented plot rows or an AI result.
function legacySections(raw) {
  const result = { outline: [], characters: [], beats: [] };
  const sections = String(raw || '').split(/(?=^#{1,3}\s)/m);
  for (const section of sections) {
    const heading = section.split('\n')[0];
    if (/人物|关系|Relationship/.test(heading)) result.characters.push(section);
    else if (/节拍|场次|选择|互动|汇合|Interactive/.test(heading)) result.beats.push(section);
    else result.outline.push(section);
  }
  return Object.fromEntries(Object.entries(result).map(([key, values]) => [key, values.join('\n').trim()]));
}

function ensureTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS script_assistant_plan_versions (
    version_id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, previous_version_id TEXT,
    source_sha256 TEXT NOT NULL, plan_sha256 TEXT NOT NULL, plan_json TEXT NOT NULL,
    actor TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL
  )`);
}
function view(db, batchId) {
  ensureTable(db);
  const batch = db.prepare('SELECT * FROM script_assistant_batches WHERE batch_id=?').get(batchId);
  if (!batch) throw new Error('策划批次不存在');
  const versions = db.prepare('SELECT * FROM script_assistant_plan_versions WHERE batch_id=? ORDER BY rowid DESC').all(batchId);
  let plan = null, issue = null;
  try { plan = versions.length ? validatePlan(JSON.parse(versions[0].plan_json), batch.episode_start, batch.episode_end) : parsePlan(batch.planning_output, batch.episode_start, batch.episode_end); } catch (e) { issue = e.message; }
  return { batch_id: batchId, source_sha256: digest(batch.planning_output || ''), version_id: versions[0]?.version_id || null,
    plan_sha256: plan ? digest(JSON.stringify(plan)) : null, plan, issue,
    legacy: plan ? null : legacySections(batch.planning_output), raw: batch.planning_output || '',
    expert_outputs: JSON.parse(batch.planning_expert_outputs_json || '[]'),
    range: [batch.episode_start, batch.episode_end], versions: versions.map(({plan_json, ...v}) => v) };
}
function save(db, batchId, { plan, expected_source_sha256, expected_version_id = null, note = '' }) {
  ensureTable(db);
  return db.transaction(() => {
    const current = view(db, batchId);
    if (current.source_sha256 !== expected_source_sha256 || current.version_id !== expected_version_id) throw new Error('策划版本已变化，请刷新后再保存');
    const b = db.prepare('SELECT status FROM script_assistant_batches WHERE batch_id=?').get(batchId);
    const pending = db.prepare("SELECT 1 FROM script_assistant_batch_items i JOIN script_assistant_episode_candidates c ON c.candidate_id=i.candidate_id WHERE i.batch_id=? AND c.status IN ('writing','reviewing','awaiting_recovery')").get(batchId);
    if (['queued','running','pause_requested'].includes(b.status) || pending) throw new Error('创作正在执行或等待恢复，不能改变本次策划');
    validatePlan(plan, ...current.range);
    const id = `plan_${crypto.randomUUID()}`, json = JSON.stringify(plan);
    db.prepare('INSERT INTO script_assistant_plan_versions VALUES(?,?,?,?,?,?,?,?,?)').run(id,batchId,current.version_id,current.source_sha256,digest(json),json,'user',String(note).slice(0,2000),new Date().toISOString());
    db.prepare("UPDATE script_assistant_batches SET planning_status='completed',error_text=NULL WHERE batch_id=? AND planning_only=1 AND status='paused'").run(batchId);
    return view(db, batchId);
  })();
}
module.exports = { PLAN_CONTRACT, validatePlan, parsePlan, episodeInput, episodeMaterials, expertInput, legacySections, ensureTable, view, save };
