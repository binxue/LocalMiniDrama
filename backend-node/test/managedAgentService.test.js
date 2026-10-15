const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const service = require('../src/services/managedAgentService');

test('episode Writer sessions receive a controlled single-turn system override', () => {
  const args = service._sessionArgs('agent-20261011131619-47ft8', 'episode', { controlledEpisodeAgent: true });
  const index = args.indexOf('--agent-overrides');
  assert.ok(index >= 0);
  const override = JSON.parse(args[index + 1]);
  assert.deepEqual(override.Skills, []);
  assert.deepEqual(override.Tools, []);
  assert.match(override.System, /不得调用工具/);
});

test('episode Editor sessions use the same controlled override as Writer', () => {
  const args = service._sessionArgs('agent-20261011131710-ncebb', 'episode-editor', { controlledEpisodeAgent: true });
  const index = args.indexOf('--agent-overrides');
  assert.ok(index >= 0);
  const override = JSON.parse(args[index + 1]);
  assert.deepEqual(override.Skills, []);
  assert.deepEqual(override.Tools, []);
  assert.match(override.System, /PASS、CONDITIONAL PASS 或 FAIL/);
});

test('batch Producer planning sessions receive a controlled single-turn override', () => {
  const args = service._sessionArgs('agent-20261011131513-17rey', 'batch-plan', { controlledEpisodeAgent: true });
  const index = args.indexOf('--agent-overrides');
  const override = JSON.parse(args[index + 1]);
  assert.deepEqual(override.Skills, []);
  assert.deepEqual(override.Tools, []);
  assert.match(override.System, /Producer 只返回可执行策划/);
});

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


test('native team completion requires verified idle child threads',()=>{
 const events=[{type:'session.thread_created'},{type:'agent.message'},{type:'session.status_idle',stop_reason:{type:'end_turn'}}];
 assert.equal(service._teamComplete(events,null),false);
 assert.equal(service._teamComplete(events,[]),false);
 assert.equal(service._teamComplete(events,[{status:'running'}]),false);
 assert.equal(service._teamComplete(events,[{status:'rescheduling'}]),false);
 assert.equal(service._teamComplete(events,[{status:'idle'},{status:'idle'}]),true);
 assert.equal(service._teamComplete([...events,{type:'session.thread_status_terminated'}],[{status:'idle'}]),false);
 assert.equal(service._teamComplete([{type:'agent.message'}],null),true);
});

test('team token aggregation deduplicates shared stream events without mixing outputs',()=>{
 const main={id:'main-end',type:'span.model_request_end',model_usage:{input_tokens:10,output_tokens:4}};
 const child={id:'child-end',type:'span.model_request_end',model_usage:{input_tokens:20,output_tokens:6}};
 const usage=service._teamUsage([main],{a:[main,child],b:[child]});
 assert.equal(usage.requests,2);assert.equal(usage.input_tokens,30);assert.equal(usage.output_tokens,10);
});

test('ordinary agent sessions inherit deployed capabilities without empty overrides', () => {
  const args = service._sessionArgs('agent-20261011131513-17rey', 'ordinary');
  assert.equal(args.includes('--agent-overrides'), false);
  assert.deepEqual(args.slice(-2), ['--format', 'json']);
});

test('idle native child awaiting tool action is not completed',()=>{
 const events=[{type:'session.thread_created'}],threads=[{id:'child',status:'idle'}];
 const waiting={type:'session.status_idle',stop_reason:{type:'requires_action',event_ids:['tool']}};
 assert.equal(service._teamComplete(events,threads,{child:[waiting]}),false);
 assert.equal(service._teamComplete(events,[{...threads[0],stop_reason:{type:'requires_action'}}]),false);
 assert.equal(service._teamComplete(events,threads,{child:[waiting,{type:'session.status_idle',stop_reason:{type:'end_turn'}}]}),true);
 assert.equal(service._teamComplete(events,threads,{child:[{type:'session.status_terminated'}]}),false);
 assert.equal(service._teamComplete([...events,{type:'session.thread_status_idle',session_thread_id:'child',stop_reason:{type:'requires_action'}}],threads),false);
});

test('queued execution is claimed once and uncertain submission remains recoverable',()=>{
 const db=new Database(':memory:');service.ensureTable(db);
 const stamp=new Date().toISOString();
 const insert=db.prepare("INSERT INTO managed_agent_tasks(task_id,work_id,agent_id,task_status,input_version,input_text,created_at,updated_at,session_id) VALUES(?,'w','agent','queued','sha','input',?,?,?)");
 insert.run('with-session',stamp,stamp,'ses-known');insert.run('no-session',stamp,stamp,null);
 assert.equal(service._claimTask(db,'with-session'),true);
 assert.equal(service._claimTask(db,'with-session'),false);
 assert.equal(service._recordExecutionError(db,'with-session',new Error('message response timeout')),true);
 const task=service.getTask(db,'with-session');
 assert.equal(task.task_status,'awaiting_recovery');assert.equal(task.session_id,'ses-known');assert.equal(task.completed_at,null);
 assert.equal(service._claimTask(db,'with-session'),false);
 assert.equal(service._recordExecutionError(db,'no-session',new Error('creation rejected')),false);
 assert.equal(service.getTask(db,'no-session').task_status,'failed');db.close();
});

test('independent SQLite connections cannot both claim the same paid task',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'agent-claim-'));
 const a=new Database(path.join(dir,'tasks.db')),b=new Database(path.join(dir,'tasks.db'));
 try {
  service.ensureTable(a);const stamp=new Date().toISOString();
  a.prepare("INSERT INTO managed_agent_tasks(task_id,work_id,agent_id,task_status,input_version,input_text,created_at,updated_at) VALUES('shared','w','agent','queued','sha','input',?,?)").run(stamp,stamp);
  assert.equal(service._claimTask(a,'shared'),true);
  assert.equal(service._claimTask(b,'shared'),false);
  assert.equal(service.getTask(b,'shared').task_status,'starting');
 }finally{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});}
});
