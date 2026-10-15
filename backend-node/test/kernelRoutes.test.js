const test=require('node:test'),assert=require('node:assert/strict'),DB=require('better-sqlite3');
const service=require('../src/services/scriptAssistantService');
test('kernel intent and revisions never load ordinary sources or historical revisions',async()=>{
 const db=new DB(':memory:');service.ensureTable(db);
 db.prepare("INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,created_at,updated_at,input_scope_json) VALUES('scope','rainforest','test',1,1,'completed',1,'now','now',?)").run(JSON.stringify({title:'内核隔离',source:{id:'kernel',kind:'core',text:'唯一故事内核',available:true}}));
 db.prepare("INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,status,created_at) VALUES('current','rainforest',1,'completed','now')").run();
 db.prepare("INSERT INTO script_assistant_batch_items(batch_id,episode_no,candidate_id,status,created_at,updated_at) VALUES('scope',1,'current','completed','now','now')").run();
 const insert=db.prepare("INSERT INTO script_assistant_revisions(revision_id,work_id,source_id,source_sha256,status,created_at,candidate_id,candidate_text) VALUES(?,'rainforest','candidate','sha','completed','now',?,?)");
 insert.run('visible','current','本轮修改');insert.run('forbidden','historical','旧剧本不得读取');
 assert.equal(service.kernelTestView(db,'scope').capabilities.scoped_conversation,1);
 const load=service.loadWork,revisions=service.revisions;
 service.loadWork=()=>{throw new Error('must not load historical manifest');};service.revisions=()=>{throw new Error('must not list historical revisions');};
 const response=()=>({statusCode:0,body:null,status(n){this.statusCode=n;return this;},json(x){this.body=x;}});
 try {
  const routes=require('../src/routes/scriptAssistant')(db,{},{}),req={socket:{remoteAddress:'127.0.0.1'},headers:{},params:{work_id:'rainforest'},query:{kernelTest:'scope',text:'加强第一集结尾'}};
  const intent=response();await routes.intent(req,intent);assert.equal(intent.statusCode,200);assert.equal(intent.body.data.intent.intent,'revise_episode');
  const versions=response();await routes.revisions(req,versions);assert.deepEqual(versions.body.data.revisions.map(r=>r.revision_id),['visible']);
  const wrong=response();await routes.intent({...req,params:{work_id:'other'}},wrong);assert.equal(wrong.statusCode,400);
 }finally{service.loadWork=load;service.revisions=revisions;db.close();}
});
