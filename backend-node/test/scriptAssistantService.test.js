const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const service = require('../src/services/scriptAssistantService');

test('kernel-only test never opens the historical manifest or links previous candidates', () => {
  const managed = require('../src/services/managedAgentService');
  const original = managed.createTask;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kernel-only-'));
  const kernel = path.join(dir, 'kernel.md'); fs.writeFileSync(kernel, '唯一内核：第一人称互动冒险，阿棠。');
  const db = new Database(':memory:'); service.ensureTable(db);
  let input;
  managed.createTask = (_db, _log, args) => { input = args.input; return { task_id: 'isolated-plan' }; };
  try {
    const b = service.createKernelTest(db, { error() {} }, { script_assistant: { manifest_path: '/must-not-open-history.json' } }, 'rainforest', kernel);
    db.prepare("UPDATE script_assistant_batches SET status='paused' WHERE batch_id=?").run(b.batch_id);
    const view = service.kernelTestView(db, b.batch_id);
    assert.equal(view.source.text, '唯一内核：第一人称互动冒险，阿棠。');
    assert.match(input, /唯一故事输入/);
    assert.equal(view.candidates[0].continuity_source_candidate_id, null);
    assert.equal(view.candidates.length, 1);
  } finally { managed.createTask = original; }
});

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

test('repeated active batch request reuses the existing batch instead of scheduling duplicate work', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,current_episode,total_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run('batch-existing', 'w', '写第4到5集', 4, 5, 'running', 4, 2, now, now);
  const result = service.createBatch(db, { error() {} }, {}, 'w', '写第4到5集', 4, 5);
  assert.equal(result.batch_id, 'batch-existing');
  assert.equal(db.prepare('SELECT count(*) n FROM script_assistant_batches').get().n, 1);
});

test('batch range validates more than the legacy five episode limit without scheduling work', () => {
  assert.deepEqual(service._validateBatchRange(4, 10), { start: 4, end: 10, total: 7 });
  assert.throws(() => service._validateBatchRange(1, 51), /1–50集/);
});

test('episode planning selects only the requested episode section', () => {
  const plan = '第1集：钥匙出现，结尾发现脚印。\n第2集：主角追踪脚印，雨夜冲突升级。\n第3集：揭开身份并留下新钩子。';
  assert.equal(service._episodePlanning(plan, 2), '第2集：主角追踪脚印，雨夜冲突升级。');
  assert.equal(service._episodePlanning(plan, 9), plan);
});

test('single episode professional plan preserves final constraints instead of truncating them', () => {
  const plan = 'Producer策划：\n' + '人物和场次依据。'.repeat(650) + '\n硬约束：九点白灯两闪，钥匙由周野保管。';
  assert.equal(service._episodePlanning(plan, 1), plan);
  assert.match(service._episodePlanning(plan, 1), /硬约束：九点白灯两闪/);
});

test('batch schema preserves awaiting recovery as a paused, resumable state', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,current_episode,total_count,completed_count,created_at,updated_at,error_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run('batch-recovery', 'w', '继续写', 2, 3, 'paused', 2, 2, 1, now, now, 'Writer 尚无可验证正文');
  db.prepare(`INSERT INTO script_assistant_batch_items(batch_id,episode_no,candidate_id,status,error_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .run('batch-recovery', 2, 'cand-recovery', 'awaiting_recovery', 'Writer 尚无可验证正文', now, now);
  db.prepare(`INSERT INTO script_assistant_batch_items(batch_id,episode_no,candidate_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`)
    .run('batch-recovery', 3, 'cand-next', 'queued', now, now);
  const batch = service.batches(db, 'w')[0];
  assert.equal(batch.status, 'paused');
  assert.equal(batch.completed_count, 1);
  assert.equal(batch.items[0].status, 'awaiting_recovery');
  assert.equal(batch.items[1].status, 'queued');
});

test('completed candidate clears stale batch error without changing the count', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,current_episode,total_count,completed_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run('batch-stale-error', 'w', '继续写', 2, 2, 'paused', 2, 1, 1, now, now);
  db.prepare(`INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,title,status,candidate_text,candidate_sha256,created_at) VALUES(?,?,?,?,?,?,?,?)`)
    .run('cand-done', 'w', 2, '第2集', 'completed', '正文', require('crypto').createHash('sha256').update('正文').digest('hex'), now);
  db.prepare(`INSERT INTO script_assistant_batch_items(batch_id,episode_no,candidate_id,status,error_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`)
    .run('batch-stale-error', 2, 'cand-done', 'completed', 'Writer 尚无可验证正文', now, now);
  service.batches(db, 'w');
  const item = db.prepare('SELECT status,error_text FROM script_assistant_batch_items WHERE batch_id=?').get('batch-stale-error');
  const batch = db.prepare('SELECT completed_count FROM script_assistant_batches WHERE batch_id=?').get('batch-stale-error');
  assert.equal(item.status, 'completed');
  assert.equal(item.error_text, null);
  assert.equal(batch.completed_count, 1);
});

test('episode review accepts the Chinese 评定 heading used by a completed Editor', async () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  const text = 'adapted candidate';
  const sha = require('crypto').createHash('sha256').update(text).digest('hex');
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,title,status,candidate_text,candidate_sha256,editor_task_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)`)
    .run('adapted-candidate', 'adapted-intake', 1, '第1集', 'reviewing', text, sha, 'editor-adapted', now);
  db.prepare(`INSERT INTO managed_agent_tasks(task_id,work_id,agent_id,task_status,input_version,input_text,output_text,candidate_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .run('writer-adapted', 'adapted-intake', 'agent-20261011131619-47ft8', 'completed', 'input', 'input', text, 'adapted-candidate', now, now);
  db.prepare(`INSERT INTO managed_agent_tasks(task_id,work_id,agent_id,task_status,input_version,input_text,output_text,candidate_id,candidate_sha256,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run('editor-adapted', 'adapted-intake', 'agent-20261011131710-ncebb', 'completed', 'input', 'input', '**评定：CONDITIONAL PASS**\n\n证据', 'adapted-candidate:editor', sha, now, now);
  const recovered = await service.recoverEpisodeCandidate(db, {}, {}, 'adapted-candidate');
  assert.equal(recovered.status, 'completed');
  assert.match(recovered.editor_review, /CONDITIONAL PASS/);
  db.prepare('UPDATE managed_agent_tasks SET output_text=? WHERE task_id=?').run('**CONDITIONAL PASS**\n\n五项具体问题', 'editor-adapted');
  db.prepare("UPDATE script_assistant_episode_candidates SET status='reviewing',editor_review=NULL WHERE candidate_id='adapted-candidate'").run();
  const standalone = await service.recoverEpisodeCandidate(db, {}, {}, 'adapted-candidate');
  assert.equal(standalone.status, 'completed');
  assert.equal(standalone.approval_status, 'not_approved');
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
  assert.equal(service.classifyCreativeRequest('写第5到第8集').status, 'ready');
  assert.equal(service.classifyCreativeRequest('按现在的剧情写下一集').status, 'ready');
  assert.equal(service.classifyCreativeRequest('按照规划把全集写完').reason, '需要先确认总集数和分集规划');
  assert.deepEqual(service.classifyCreativeRequest('按照规划把全集写完', [{ id: 'plan', kind: 'continuity', available: true, text: '本剧共 5 集。' }]), { intent: 'create_all', status: 'ready', total_episodes: 5 });
});

test('new episode candidate and batch tables are isolated from revisions', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='script_assistant_episode_candidates'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='script_assistant_batches'").get());
  assert.equal(db.prepare('SELECT count(*) n FROM script_assistant_revisions').get().n, 0);
  const columns = db.prepare('PRAGMA table_info(script_assistant_batches)').all().map(c => c.name);
  assert.ok(columns.includes('planning_status'));
  assert.ok(columns.includes('planning_output'));
});

test('registered original and adaptation works persist source hashes without Agent calls', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  const original = service.registerWork(db, { work_id: 'original-lamp', title: '灯下约定', kind: 'original', premise: '女主在旧车站寻找失踪哥哥。' });
  assert.equal(original.title, '灯下约定');
  assert.equal(service.works({ script_assistant: {} }, db).find(w => w.id === 'original-lamp').title, '灯下约定');
  const adaptation = service.registerWork(db, { work_id: 'adapted-lamp', title: '合法测试改编', kind: 'adaptation', premise: '改编短篇的悬疑主线。', source_text: '第一章：雨夜有人敲门。', source_label: 'lawful-fixture.txt' });
  assert.equal(adaptation.sources.find(s => s.kind === 'source').available, true);
  assert.throws(() => service.registerWork(db, { work_id: 'bad-adapt', title: '缺原文', kind: 'adaptation', premise: '设定' }), /原文/);
});

test('new episode continuity context only reads the latest completed candidate', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,title,status,candidate_text,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('cand-completed', 'w', 1, '第1集', 'completed', '已完成正文', now);
  assert.equal(service._latestEpisodeContext(db, 'w', 1), '已完成正文');
  assert.equal(service._latestEpisodeContext(db, 'w', 2), '');
});

test('explicit continuity source rejects a changed prior candidate', () => {
  const db = new Database(':memory:'); service.ensureTable(db);
  const text = '前集正文'; const sha = require('crypto').createHash('sha256').update(text).digest('hex');
  db.prepare('INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,title,status,candidate_text,candidate_sha256,created_at) VALUES(?,?,?,?,?,?,?,?)').run('prev','w',1,'第1集','completed',text,sha,new Date().toISOString());
  db.prepare('INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,title,status,continuity_source_candidate_id,continuity_source_sha256,created_at) VALUES(?,?,?,?,?,?,?,?)').run('next','w',2,'第2集','queued','prev','changed',new Date().toISOString());
  assert.throws(() => service._continuityContext(db, db.prepare('SELECT * FROM script_assistant_episode_candidates WHERE candidate_id=?').get('next')), /连续性来源/);
});

test('new episode prompt includes available story bible and episode plan sources', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localminidrama-episode-context-'));
  const bible = path.join(dir, 'bible.md'); const plan = path.join(dir, 'plan.md');
  fs.writeFileSync(bible, '女主林岚，守灯人。'); fs.writeFileSync(plan, '第一集：铜钥匙出现。');
  const manifest = { works: [{ id: 'w', title: '灯塔邮局', sources: [
    { id: 'bible', title: '故事设定', kind: 'core', path: bible, sha256: require('crypto').createHash('sha256').update(fs.readFileSync(bible)).digest('hex') },
    { id: 'plan', title: '分集规划', kind: 'continuity', path: plan, sha256: require('crypto').createHash('sha256').update(fs.readFileSync(plan)).digest('hex') },
  ] }] };
  const manifestPath = path.join(dir, 'sources.json'); fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const work = service.loadWork({ script_assistant: { manifest_path: manifestPath } }, 'w');
  const selected = work.sources.filter(s => s.available && ['core', 'continuity', 'script', 'character'].includes(s.kind));
  const context = selected.map(s => `${s.title} (${s.kind}):\n${s.text}`).join('\n');
  assert.match(context, /女主林岚/); assert.match(context, /铜钥匙出现/);
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
