const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const service = require('../src/services/scriptAssistantService');

test('script assistant builds a source-traceable bounded input and separates approval state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localminidrama-assistant-'));
  const script = path.join(dir, 'ep1.md');
  fs.writeFileSync(script, '# 第一集 v3\n右掌浅擦伤，黄色布标。\nCONDITIONAL PASS，非Canon。');
  const manifest = { works: [{ id: 'rainforest', title: '雨林', sources: [{ id: 'ep1', title: '第一集', kind: 'script', path: script, sha256: require('crypto').createHash('sha256').update(fs.readFileSync(script)).digest('hex') }] }] };
  const config = { script_assistant: { manifest_path: path.join(dir, 'sources.json') } };
  fs.writeFileSync(config.script_assistant.manifest_path, JSON.stringify(manifest));
  const work = service.loadWork(config, 'rainforest');
  const built = service.buildInput(work, [], '第一集和第三集之间有哪些连续性问题？');
  assert.match(built.input, /\[S:ep1:L1-3\]/);
  assert.ok(built.context.input_chars < 8000);
  assert.equal(service.summary(work).scripts[0].review_status, 'UNKNOWN');
  assert.equal(service.summary(work).scripts[0].canon, 'not_established');
});

test('script assistant rejects an unverified source hash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localminidrama-assistant-'));
  const script = path.join(dir, 'ep1.md'); fs.writeFileSync(script, 'source');
  const manifestPath = path.join(dir, 'sources.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ works: [{ id: 'w', title: 'W', sources: [{ id: 's', title: 'S', kind: 'script', path: script, sha256: 'bad' }] }] }));
  const work = service.loadWork({ script_assistant: { manifest_path: manifestPath } }, 'w');
  assert.equal(work.sources[0].available, false);
  assert.match(work.sources[0].error, /哈希/);
});

test('classifyCreativeRequest routes natural language without model calls', () => {
  assert.deepEqual(service.classifyCreativeRequest('帮我优化第三集', [{ id: 'ep3', available: true }]), { intent: 'revise_episode', status: 'ready', episode: 3, available_scripts: ['ep3'] });
  assert.equal(service.classifyCreativeRequest('按现在的剧情写下一集').intent, 'next_episode');
  assert.equal(service.classifyCreativeRequest('写第5到第8集').status, 'clarification_required');
  assert.equal(service.classifyCreativeRequest('按照规划把全集写完').reason, '需要先确认总集数和分集规划');
});

test('new episode candidate and batch tables are isolated from revisions', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='script_assistant_episode_candidates'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='script_assistant_batches'").get());
  assert.equal(db.prepare('SELECT count(*) n FROM script_assistant_revisions').get().n, 0);
});

test('revision review decisions persist without changing approval state', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  db.prepare(`INSERT INTO script_assistant_revisions(revision_id,work_id,source_id,source_sha256,status,candidate_sha256,approval_status,created_at) VALUES('rev1','w','ep3','source','completed','candidate','not_approved',?)`).run(new Date().toISOString());
  const saved = service.saveReviewDecision(db, 'rev1', 'change-1', 'revise', '需要补充证据', { source_sha256: 'source', candidate_sha256: 'candidate' });
  service.saveReviewDecision(db, 'rev1', 'change-1', 'undecided', '撤销决定', { source_sha256: 'source', candidate_sha256: 'candidate' });
  assert.equal(saved[0].action, 'revise'); assert.equal(saved[0].source_sha256, 'source');
  assert.equal(service.reviewDecisions(db, 'rev1')[0].action, 'undecided');
  assert.equal(db.prepare('SELECT count(*) n FROM script_assistant_review_decision_events').get().n, 2);
  assert.equal(service.reviewDecisions(db, 'rev1').length, 1);
  assert.equal(db.prepare('SELECT approval_status FROM script_assistant_revisions WHERE revision_id=?').get('rev1').approval_status, 'not_approved');
  assert.throws(() => service.saveReviewDecision(db, 'rev1', 'change-1', 'accept', '', { source_sha256: 'source', candidate_sha256: 'different' }), /版本/);
  assert.throws(() => service.approveRevision(db, 'rev1', 'test', {source_sha256:'source',candidate_sha256:'candidate'}), /审核/);
  assert.throws(() => service.approveRevision(db, 'rev1', 'test', {source_sha256:'source',candidate_sha256:'stale'}), /版本/);
  const candidate = 'isolated candidate'; const sha = require('crypto').createHash('sha256').update(candidate).digest('hex');
  db.prepare('UPDATE script_assistant_revisions SET candidate_text=?,candidate_sha256=?,editor_task_id=? WHERE revision_id=?').run(candidate, sha, 'editor-fail', 'rev1');
  db.prepare(`INSERT INTO managed_agent_tasks(task_id,work_id,agent_id,task_status,input_version,input_text,output_text,revision_id,candidate_sha256,source_sha256,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run('editor-fail','w','agent-20261011131710-ncebb','completed','input','input','复审结论：FAIL','rev1',sha,'source',new Date().toISOString(),new Date().toISOString());
  assert.throws(() => service.approveRevision(db,'rev1','test',{source_sha256:'source',candidate_sha256:sha}),/审核/);
  assert.equal(db.prepare('SELECT approval_status FROM script_assistant_revisions WHERE revision_id=?').get('rev1').approval_status,'not_approved');
});
