const test=require('node:test'),assert=require('node:assert/strict'),Database=require('better-sqlite3');
const plan=require('../src/services/creativePlanService');
const fixture=()=>({schema:'creative-plan/v1',story:'隔离测试故事，非Agent产物',characters:'甲想找到信；乙想保管信',episodes:[1,2].map(n=>({episode_no:n,title:`测试${n}`,goal:'找到证据',conflict:'信被锁住',reversal:'收件人是自己',hook:'锁内传出声音',continuity:'钥匙仍由乙保管',requirements:'90秒，两场',scenes:['门口','信箱旁'],beats:['发现','受阻','行动'],plots:[{scene:'信箱旁',action:`本集${n}专有行动`,result:'获得线索',emotion:'悬念'}]}))});
test('planning validates every requested episode, unique numbers, scenes and beats',()=>{
  assert.equal(plan.validatePlan(fixture(),1,2).episodes.length,2);
  assert.throws(()=>plan.validatePlan(fixture(),1,3),/未覆盖第3集/);
  const x=fixture();x.episodes[1].episode_no=1;assert.throws(()=>plan.validatePlan(x,1,2),/重复/);
  const y=fixture();y.episodes[0].scenes=[];assert.throws(()=>plan.validatePlan(y,1,2),/scenes/);
});
test('Writer gets exact selected episode instead of truncating whole plot',()=>{
  const raw='Producer\n```json\n'+JSON.stringify(fixture())+'\n```\n专家原始输出';
  const p=plan.parsePlan(raw,1,2);const input=plan.episodeInput(p,2);
  assert.match(input,/本集2专有行动/);assert.doesNotMatch(input,/本集1专有行动/);
  assert.match(input,/甲想找到信/);assert.throws(()=>plan.episodeInput(p,3),/缺少第3集/);
  assert.equal(plan.parsePlan('只有笼统全剧方向',1,2),null);
});
test('planning versions persist, reject stale edits and preserve Agent source and candidate approval',()=>{
  const db=new Database(':memory:');require('../src/services/scriptAssistantService').ensureTable(db);
  const raw='```json\n'+JSON.stringify(fixture())+'\n```';
  db.prepare("INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,created_at,updated_at,planning_output) VALUES('b','w','test',1,2,'completed',2,'now','now',?)").run(raw);
  db.prepare("INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,status,approval_status,created_at) VALUES('c','w',1,'completed','not_approved','now')").run();
  const v=plan.view(db,'b');const p=fixture();p.episodes[0].hook='新钩子';
  const saved=plan.save(db,'b',{plan:p,expected_source_sha256:v.source_sha256});
  assert.equal(saved.plan.episodes[0].hook,'新钩子');assert.equal(plan.view(db,'b').version_id,saved.version_id);
  assert.throws(()=>plan.save(db,'b',{plan:p,expected_source_sha256:v.source_sha256}),/版本已变化/);
  assert.equal(db.prepare("SELECT planning_output FROM script_assistant_batches WHERE batch_id='b'").get().planning_output,raw);
  assert.equal(db.prepare("SELECT approval_status FROM script_assistant_episode_candidates WHERE candidate_id='c'").get().approval_status,'not_approved');
  db.prepare("UPDATE script_assistant_batches SET status='running' WHERE batch_id='b'").run();
  assert.throws(()=>plan.save(db,'b',{plan:p,expected_source_sha256:v.source_sha256,expected_version_id:saved.version_id}),/正在执行/);
});
test('Editor materials use the current saved plan version and exact episode expert design',()=>{
  const db=new Database(':memory:');require('../src/services/scriptAssistantService').ensureTable(db);
  const fence=String.fromCharCode(96).repeat(3)+'json\n';
  const raw=fence+JSON.stringify(fixture())+'\n'+String.fromCharCode(96).repeat(3);
  db.prepare("INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,created_at,updated_at,planning_output) VALUES('b','w','test',1,2,'completed',2,'now','now',?)").run(raw);
  const expert=fence+JSON.stringify({schema:'expert-design/v1',global:'全剧原则',episodes:[{episode_no:1,design:'第一集专属设计'},{episode_no:2,design:'第二集专属设计'}]})+'\n'+String.fromCharCode(96).repeat(3);
  db.prepare("UPDATE script_assistant_batches SET planning_expert_outputs_json=? WHERE batch_id='b'").run(JSON.stringify([expert]));
  const current=plan.view(db,'b'), edited=fixture();edited.episodes[1].goal='保存后的第二集目标';
  plan.save(db,'b',{plan:edited,expected_source_sha256:current.source_sha256});
  const materials=plan.episodeMaterials(db,'b',2);
  assert.match(materials.plan,/保存后的第二集目标/);
  assert.doesNotMatch(materials.plan,/本集1专有行动/);
  assert.equal(materials.plan_sha256,plan.view(db,'b').plan_sha256);
  assert.match(materials.expert_designs[0],/第二集专属设计/);
  assert.doesNotMatch(materials.expert_designs[0],/第一集专属设计/);
});
test('episode execution sends only its structured episode plan and expert design to Writer and Editor',async()=>{
  const db=new Database(':memory:'),service=require('../src/services/scriptAssistantService'),managed=require('../src/services/managedAgentService');service.ensureTable(db);
  service.registerWork(db,{work_id:'plan-input-test',title:'规划输入测试',kind:'original',premise:'隔离故事设定'});
  const episode={...fixture().episodes[1],plots:[{scene:'雨棚下',action:'第二集独有动作：打开封缄盒',result:'发现潮湿的收据',emotion:'怀疑升级'}]};
  const selected={schema:'creative-plan/v1',story:'统一故事：信件穿过雨夜。',characters:'甲寻找收据；乙保护寄件人身份。',episodes:[episode]};
  const planRaw='```json\n'+JSON.stringify(selected)+'\n```';
  const expertRaw='```json\n'+JSON.stringify({schema:'expert-design/v1',global:'专家通用原则：所有信息必须由动作呈现。',episodes:[{episode_no:2,design:'第二集专属设计：让收据先被水浸，再由封缄盒留下因果证据。'}]})+'\n```';
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,current_episode,total_count,planning_status,planning_output,planning_expert_outputs_json,created_at,updated_at) VALUES('batch-input-test','plan-input-test','创作第二集',2,2,'queued',2,1,'completed',?,?,?,?)`).run(planRaw,JSON.stringify([expertRaw]),now,now);
  db.prepare(`INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,title,status,request,created_at) VALUES('candidate-input-test','plan-input-test',2,'第2集','queued','按策划创作',?)`).run(now);
  db.prepare(`INSERT INTO script_assistant_batch_items(batch_id,episode_no,candidate_id,status,created_at,updated_at) VALUES('batch-input-test',2,'candidate-input-test','queued',?,?)`).run(now,now);
  const calls=[],tasks=new Map(),originalCreate=managed.createTask,originalGet=managed.getTask;
  managed.createTask=(_db,_log,args)=>{calls.push(args);const task_id=`mock-task-${calls.length}`;tasks.set(task_id,{task_id,task_status:'completed',output_text:args.agent_id==='agent-20261011131619-47ft8'?'完整的第二集测试剧本。':'评定：CONDITIONAL PASS\n证据：正文落实本集独有规划。',agent_id:args.agent_id,work_id:args.work_id,candidate_sha256:args.candidate_sha256});return {task_id};};
  managed.getTask=(_db,id)=>tasks.get(id)||null;
  try{
    await service._executeBatch(db,{error(){}},{},'batch-input-test');
    assert.equal(calls.length,2);
    const writer=calls.find(c=>c.agent_id==='agent-20261011131619-47ft8');
    const editor=calls.find(c=>c.agent_id==='agent-20261011131710-ncebb');
    for(const input of [writer.input,editor.input]){
      assert.match(input,/第二集独有动作：打开封缄盒/);
      assert.match(input,/第二集专属设计：让收据先被水浸/);
      assert.doesNotMatch(input,/第一集专属/);
      assert.doesNotMatch(input,/第一集的动作/);
    }
    const candidate=db.prepare("SELECT * FROM script_assistant_episode_candidates WHERE candidate_id='candidate-input-test'").get();
    assert.equal(candidate.status,'completed');
    assert.match(candidate.plan_input_snapshot,/第二集独有动作：打开封缄盒/);
    assert.match(candidate.expert_input_snapshot,/第二集专属设计/);
    assert.equal(candidate.planning_sha256,plan.view(db,'batch-input-test').plan_sha256);
    assert.equal(candidate.approval_status,'not_approved');
    assert.match(candidate.editor_review,/CONDITIONAL PASS/);
  }finally{managed.createTask=originalCreate;managed.getTask=originalGet;db.close();}
});
test('new range batch reuses a complete plan and expert work without creating new Agent tasks',async()=>{
  const db=new Database(':memory:'),service=require('../src/services/scriptAssistantService'),managed=require('../src/services/managedAgentService');service.ensureTable(db);
  service.registerWork(db,{work_id:'plan-reuse-test',title:'策划复用测试',kind:'original',premise:'独立故事设定'});
  const full={schema:'creative-plan/v1',story:'统一故事设定：一座灯塔每晚收到来自未来的信。',characters:'黎夏寻找寄信人；沈岸试图保护信件来源。',episodes:Array.from({length:5},(_,i)=>({...fixture().episodes[0],episode_no:i+1,title:`第${i+1}集`,goal:`第${i+1}集目标`,plots:[{scene:`第${i+1}集场景`,action:`第${i+1}集专属行动`,result:'得到新线索',emotion:'悬念递增'}]}))};
  const expert={schema:'expert-design/v1',global:'保持每次揭示都有因果证据。',episodes:Array.from({length:5},(_,i)=>({episode_no:i+1,design:`第${i+1}集专家设计`}))};
  const fence=String.fromCharCode(96).repeat(3);
  const producerOutput=`Producer策划：\n${fence}json\n${JSON.stringify(full)}\n${fence}`;
  const expertOutput=`專家(agent-relationship)：\n${fence}json\n${JSON.stringify(expert)}\n${fence}`;
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,planning_status,planning_task_id,planning_output,planning_expert_task_ids_json,planning_expert_outputs_json,created_at,updated_at)
    VALUES('source-plan-batch','plan-reuse-test','原完整策划',1,5,'completed',5,'completed','producer-original',?,'["relationship-original"]',?,?,?)`)
    .run(producerOutput,JSON.stringify([expertOutput]),now,now);
  const originalCreate=managed.createTask;
  managed.createTask=()=>{throw new Error('复用完整策划时不应创建Producer、专家、Writer或Editor任务');};
  try{
    const created=service.createBatch(db,{error(){}},{},'plan-reuse-test','按规划写第3到4集',3,4,null,{planningOnly:true});
    await new Promise(resolve=>setImmediate(resolve));
    const batch=db.prepare('SELECT * FROM script_assistant_batches WHERE batch_id=?').get(created.batch_id);
    assert.equal(batch.planning_status,'completed');
    assert.equal(batch.planning_only,1);
    assert.equal(batch.planning_task_id,'producer-original');
    assert.equal(batch.planning_expert_task_ids_json,'["relationship-original"]');
    assert.equal(db.prepare('SELECT count(*) n FROM managed_agent_tasks').get().n,0);
    const view=plan.view(db,created.batch_id);
    assert.deepEqual(view.plan.episodes.map(ep=>ep.episode_no),[3,4]);
    assert.match(view.plan.episodes[0].plots[0].action,/第3集专属行动/);
    assert.doesNotMatch(JSON.stringify(view.plan),/第1集专属行动|第2集专属行动|第5集专属行动/);
    assert.equal(view.versions[0].actor,'system_reuse');
    const materials=plan.episodeMaterials(db,created.batch_id,4);
    assert.match(materials.expert_designs[0],/第4集专家设计/);
    assert.doesNotMatch(materials.expert_designs[0],/第1集专家设计|第2集专家设计|第3集专家设计|第5集专家设计/);
    assert.equal(db.prepare('SELECT status FROM script_assistant_batches WHERE batch_id=?').get(created.batch_id).status,'paused');
    assert.equal(db.prepare('SELECT count(*) n FROM script_assistant_batch_items WHERE batch_id=?').get(created.batch_id).n,2);
  }finally{managed.createTask=originalCreate;db.close();}
});
test('legacy projections only expose exact sections and never synthesize plot events',()=>{
  const raw='# 全剧方向\n只有第一集。\n## 人物目标\n甲要找信。\n## 节拍\n开门。';const s=plan.legacySections(raw);
  assert.match(s.characters,/甲要找信/);assert.match(s.beats,/开门/);assert.equal(plan.parsePlan(raw,1,50),null);
});
test('planning-only stops before Writer; explicit start pins the plan and rejects a duplicate start',async()=>{
  const db=new Database(':memory:'),service=require('../src/services/scriptAssistantService');service.ensureTable(db);
  const raw='```json\n'+JSON.stringify(fixture())+'\n```';
  db.prepare("INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,created_at,updated_at,planning_output,planning_status,planning_only) VALUES('b','w','test',1,2,'queued',2,'now','now',?,'completed',1)").run(raw);
  await service._executeBatch(db,{error(){}},{},'b');
  assert.equal(db.prepare("SELECT status FROM script_assistant_batches WHERE batch_id='b'").get().status,'paused');
  assert.equal(db.prepare('SELECT count(*) n FROM managed_agent_tasks').get().n,0);
  const v=plan.view(db,'b');assert.throws(()=>service.startPlannedBatch(db,{}, {},'b',{plan_sha256:'stale'}),/已变化/);
  service.startPlannedBatch(db,{}, {},'b',{plan_sha256:v.plan_sha256});
  assert.throws(()=>service.startPlannedBatch(db,{}, {},'b',{plan_sha256:v.plan_sha256}),/不重复/);
  // Prevent the scheduled empty fixture batch from entering production.
  db.prepare("UPDATE script_assistant_batches SET status='paused' WHERE batch_id='b'").run();
});
test('expert design selection excludes other episodes and rejects a missing/duplicate design',()=>{
  const raw='```json\n'+JSON.stringify({schema:'expert-design/v1',global:'专业通用原则',episodes:[{episode_no:1,design:'甲集'},{episode_no:2,design:'乙集'}]})+'\n```';
  assert.match(plan.expertInput(raw,2),/乙集/);assert.doesNotMatch(plan.expertInput(raw,2),/甲集/);
  assert.throws(()=>plan.expertInput(raw,3),/未覆盖/);assert.equal(plan.expertInput('历史原始设计',1),null);
  assert.match(plan.expertInput('历史原始设计',1,{allowLegacy:true}),/历史原始设计/);
});

test('starting a plan cannot overlap another active or unknown Writer',()=>{
  const db=new Database(':memory:'),service=require('../src/services/scriptAssistantService');service.ensureTable(db);
  const raw='```json\n'+JSON.stringify(fixture())+'\n```';
  db.prepare("INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,created_at,updated_at,planning_output,planning_status,planning_only) VALUES('p','w','test',1,2,'paused',2,'now','now',?,'completed',1)").run(raw);
  db.prepare("INSERT INTO script_assistant_episode_candidates(candidate_id,work_id,episode_no,status,created_at) VALUES('active','w',2,'awaiting_recovery','now')").run();
  const view=plan.view(db,'p');
  assert.throws(()=>service.startPlannedBatch(db,{}, {},'p',{plan_sha256:view.plan_sha256}),/已有创作或待恢复任务/);
  assert.equal(db.prepare("SELECT planning_only FROM script_assistant_batches WHERE batch_id='p'").get().planning_only,1);
  assert.equal(db.prepare('SELECT count(*) n FROM managed_agent_tasks').get().n,0);db.close();
});

test('planning recovery retains the original stage and never schedules invalid plans',async()=>{
 const db=new Database(':memory:'),service=require('../src/services/scriptAssistantService');service.ensureTable(db);
 const immediate=global.setImmediate;let scheduled=0;global.setImmediate=()=>{scheduled++;return 1;};
 try {
  for(const [id,expertIds,expected] of [['producer','[]','running'],['expert','["original-expert"]','experts']]) {
   db.prepare("INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,created_at,updated_at,planning_status,planning_task_id,planning_expert_task_ids_json) VALUES(?,'w','test',1,1,'paused',1,'now','now','awaiting_recovery','original-producer',?)").run(id,expertIds);
   const resumed=await service.resumeBatch(db,{}, {},id);assert.equal(resumed.planning_status,expected);assert.equal(resumed.planning_task_id,'original-producer');assert.equal(resumed.planning_expert_task_ids_json,expertIds);
  }
  db.prepare("UPDATE script_assistant_batches SET status='paused',planning_status='needs_planning' WHERE batch_id='producer'").run();
  await assert.rejects(service.resumeBatch(db,{}, {},'producer'),/先补全或修正方案/);assert.equal(scheduled,2);assert.equal(db.prepare('SELECT count(*) n FROM managed_agent_tasks').get().n,0);
 } finally {global.setImmediate=immediate;db.close();}
});

test('pause during Producer completion prevents submission of experts and Writer',async()=>{
 const db=new Database(':memory:'),service=require('../src/services/scriptAssistantService'),managed=require('../src/services/managedAgentService');service.ensureTable(db);
 db.prepare("INSERT INTO script_assistant_batches(batch_id,work_id,request,episode_start,episode_end,status,total_count,created_at,updated_at,planning_status,planning_task_id) VALUES('pause-plan','w','test',1,2,'queued',2,'now','now','running','producer')").run();
 const get=managed.getTask,create=managed.createTask;let calls=0;
 managed.getTask=()=>{db.prepare("UPDATE script_assistant_batches SET status='paused' WHERE batch_id='pause-plan'").run();return {task_id:'producer',task_status:'completed',input_text:'creative-plan/v1',output_text:'```json\n'+JSON.stringify(fixture())+'\n```'};};
 managed.createTask=()=>{calls++;throw new Error('Paused plan must not submit another task');};
 try {await service._executeBatch(db,{}, {},'pause-plan');assert.equal(calls,0);const b=db.prepare("SELECT * FROM script_assistant_batches WHERE batch_id='pause-plan'").get();assert.equal(b.status,'paused');assert.equal(b.planning_task_id,'producer');}
 finally {managed.getTask=get;managed.createTask=create;db.close();}
});
