const test = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const service = require('../src/services/scriptAssistantService');
const managed = require('../src/services/managedAgentService');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
for (const verdict of ['评定：CONDITIONAL PASS\n证据：钩子有明确因果。', '收到，稍后审核']) {
  test(`candidate revision uses full frozen source and validates Editor: ${verdict}`, async () => {
    const db = new Database(':memory:'); service.ensureTable(db);
    service.registerWork(db,{work_id:'revision-chain',title:'隔离程序测试',kind:'original',premise:'测试资料，非真实创作'});
    const original='完整原文中的因果动作。'.repeat(600), revised=original+'修改后的钩子。';
    db.prepare("INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,title,status,candidate_text,candidate_sha256,editor_review,created_at) VALUES('c','revision-chain',2,'第二集','completed',?,?,?,'now')").run(original,sha(original),'本候选专属审核意见');
    db.prepare("INSERT INTO script_assistant_revisions(revision_id,work_id,source_id,source_sha256,status,created_at,revision_request,candidate_id,source_text_snapshot,source_title) VALUES('r','revision-chain','candidate:c',?,'queued','now','加强钩子','c',?,'第二集')").run(sha(original),original);
    const create=managed.createTask,get=managed.getTask,calls=[],tasks=new Map();
    managed.createTask=(_db,_log,args)=>{ calls.push(args); const id='stub-'+calls.length; tasks.set(id,{task_id:id,task_status:'completed',output_text:calls.length===1?'保留原有行动，只加强结尾。':calls.length===2?revised:verdict});return {task_id:id}; };
    managed.getTask=(_db,id)=>tasks.get(id);
    try {
      await service._executeRevision(db,{error(){}},{},'r');
      assert.equal(calls.length,3);
      for(const call of calls) { assert.ok(call.input.includes(original)); assert.equal(call.source_sha256,sha(original)); }
      assert.match(calls[0].input,/本候选专属审核意见/);
      assert.ok(calls[2].input.includes(revised));
      const result=db.prepare("SELECT * FROM script_assistant_revisions WHERE revision_id='r'").get();
      assert.equal(result.status,verdict.startsWith('评定')?'completed':'failed');
      assert.equal(result.candidate_text,revised);
      assert.equal(result.approval_status,'not_approved');
      assert.equal(db.prepare("SELECT candidate_text FROM script_assistant_episode_candidates WHERE candidate_id='c'").get().candidate_text,original);
    } finally { managed.createTask=create;managed.getTask=get;db.close(); }
  });
}

test('unknown existing revision blocks another paid candidate revision', () => {
  const db=new Database(':memory:');service.ensureTable(db);
  const body='隔离测试原文';
  db.prepare("INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,status,candidate_text,candidate_sha256,created_at) VALUES('c','w',2,'completed',?,?,'now')").run(body,sha(body));
  for(const status of ['awaiting_recovery','awaiting_next_authorization']) {
    db.prepare("DELETE FROM script_assistant_revisions").run();
    db.prepare("INSERT INTO script_assistant_revisions(revision_id,work_id,source_id,source_sha256,status,created_at) VALUES('pending','w','candidate:c',?,?,'now')").run(sha(body),status);
    assert.throws(()=>service.createCandidateRevision(db,{}, {},'w','c','强化结尾'),/不能重复提交/);
    assert.equal(db.prepare('SELECT count(*) n FROM managed_agent_tasks').get().n,0);
    assert.equal(db.prepare('SELECT count(*) n FROM script_assistant_revisions').get().n,1);
  }
  db.close();
});
test('another edit continues latest completed revision without replacing the original', () => {
  const db=new Database(':memory:');service.ensureTable(db);
  const original='原始候选',updated='上一轮新增的因果动作';
  db.prepare("INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,status,candidate_text,candidate_sha256,created_at) VALUES('c','w',2,'completed',?,?,'now')").run(original,sha(original));
  db.prepare("INSERT INTO script_assistant_revisions(revision_id,work_id,source_id,source_sha256,status,created_at,candidate_id,candidate_text,candidate_sha256) VALUES('r1','w','candidate:c',?,'completed','now','c',?,?)").run(sha(original),updated,sha(updated));
  const immediate=global.setImmediate;global.setImmediate=()=>1;
  try {
    const next=service.createCandidateRevision(db,{}, {},'w','c','再加强结尾');
    assert.equal(next.source_id,'revision:r1');assert.equal(next.source_text_snapshot,updated);assert.equal(next.source_sha256,sha(updated));
    assert.equal(db.prepare("SELECT candidate_text FROM script_assistant_episode_candidates WHERE candidate_id='c'").get().candidate_text,original);
  } finally {global.setImmediate=immediate;db.close();}
});
test('Editor recovery submits full source exactly once and preserves an existing task', () => {
  const db=new Database(':memory:');service.ensureTable(db);const source='冻结原文。'.repeat(1600),text='修改正文。'.repeat(1600);
  db.prepare("INSERT INTO script_assistant_revisions(revision_id,work_id,source_id,source_sha256,status,created_at,writer_task_id,source_text_snapshot) VALUES('r','w','candidate:c',?,'awaiting_recovery','now','writer',?)").run(sha(source),source);
  const create=managed.createTask,get=managed.getTask;let calls=0;
  managed.getTask=()=>({task_status:'completed',work_id:'w',revision_id:'r',source_sha256:sha(source),output_text:text});
  managed.createTask=(_db,_log,args)=>{calls++;assert.ok(args.input.includes(source));assert.ok(args.input.includes(text));assert.equal(args.candidate_sha256,sha(text));assert.equal(args.candidate_id,'revision:r:editor');return {task_id:'editor'};};
  try {
    assert.equal(service.createEditorRecovery(db,{},'r').editor_task_id,'editor');
    assert.equal(service.createEditorRecovery(db,{},'r').editor_task_id,'editor');assert.equal(calls,1);
    assert.equal(db.prepare("SELECT approval_status FROM script_assistant_revisions WHERE revision_id='r'").get().approval_status,'not_approved');
  } finally {managed.createTask=create;managed.getTask=get;db.close();}
});
