const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const Database=require('better-sqlite3');
const {ManagedAgentWorkbenchClient}=require('../src/services/managedAgentWorkbenchClient');
const runtime=path.resolve(__dirname,'../../runtime');
const marker=path.join(runtime,'team-mounted-verification.json');
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
async function main(){
  if(fs.existsSync(marker))throw new Error('Mounted review exists; collect it, never resend');
  const prior=JSON.parse(fs.readFileSync(path.join(runtime,'team-verification.json'),'utf8'));
  const previous=prior.executions[0];
  if(!previous.remote_completed||!previous.result_event_id)throw new Error('Prior turn must end before corrective media review');
  const root=path.join(runtime,'evidence','mounted-team-'+crypto.randomUUID());
  fs.mkdirSync(root,{recursive:true});
  const db=new Database(path.join(runtime,'drama_generator.db'),{fileMustExist:true});
  const mounts=JSON.parse(fs.readFileSync(path.join(runtime,'reference-transfer/session-resources.json'),'utf8').replace(/^\uFEFF/,'')).data;
  const definition=JSON.parse(fs.readFileSync(path.join(runtime,'coordinator-definition.json'),'utf8').replace(/^\uFEFF/,'')).Result;
  const previousFiles=prior.registered_file_submission.files;
  const files=previousFiles.map(file=>{
    const resource=mounts.find(item=>item.mount_path==='/mnt/session/uploads/'+file.filename && item.access==='read_only');
    if(!resource)throw new Error('Verified read-only mount missing');
    return {...file,file_id:resource.file_id,mount_path:resource.mount_path};
  });
  const character=db.prepare('SELECT id,name,appearance,description FROM characters WHERE id=2').get();
  const shots=db.prepare('SELECT id,title,action,dialogue,image_prompt FROM storyboards WHERE id BETWEEN 3 AND 6 ORDER BY storyboard_number').all();
  const context={character,shots,files,previous_execution_id:previous.execution_id,
    correction:'The previous delegated /workspace and /mnt/session/storage paths were invented and nonexistent. Only the six verified mount_path values are readable. Neutral reference clothing is not LOOK01 costume.'};
  const instructions='This is a new corrective review after files were mounted, NOT a repeat of an unknown generation task. Delegate to the real photography, continuity and visual-inspection specialists. Give every specialist the exact six mount_path values and expected hashes below; never rewrite them or claim a file is readable until a tool successfully reads it. Have one specialist verify sha256sum against the supplied SHA-256 values using read-only tools. Inspect actual images 36 and 37 against original Lixia=2 identity and LOOK01; tourist=3. No generated image is an identity anchor. No image/video generation, external APIs, network research or script rewriting. All files are read_only in this shared Session. Candidate36 is storyboard5/s01_03, candidate37 is storyboard6/s01_04. Return ONLY a JSON object, no prose and no Markdown, even if something fails: {execution_id,input_hash,decision,shot_reviews:[{storyboard_id,shot_key,identity_status,action_status,continuity_status,defects,correction}],reference_contract,unresolved,team_findings}. Status is PASS, REVISE or UNKNOWN. If unreadable use UNKNOWN with the exact error. Keep findings concise. Report still-frame starting-state compliance, not video motion. Preserve script, four-shot order, POV, glass-cup identity and cold rain lighting. Do not make producer acceptance decisions.';
  const input={instructions,context};
  const execution={execution_id:'exec-'+crypto.randomUUID(),agent_id:definition.Id,agent_name:definition.Name,model:definition.Model,multiagent:definition.Multiagent,
    input_hash:hash(JSON.stringify(input)),session_id:previous.session_id,submit_event_id:null,result_event_id:null,execution_status:'PENDING',started_at:new Date().toISOString(),
    media:files.map(file=>({filename:file.filename,sha256:file.sha256})),actual_cost_cny:null,billing_status:'PENDING_SETTLEMENT'};
  const run={run_id:path.basename(root),prior_run_id:prior.run_id,storyboard_id:3,episode_id:2,drama_id:2,shot_key:'scene-1',stage:'mounted-file-team-review',status:'PENDING',
    created_at:execution.started_at,executions:[execution],candidates:[],costs:{currency:'CNY',reservations:[],actual_cost_cny:null,billing_status:'PENDING_SETTLEMENT'}};
  function persist(value){
    if(value)run.executions=[value];
    fs.writeFileSync(marker,JSON.stringify(run,null,2));
    const desc=JSON.parse(db.prepare('SELECT description FROM storyboards WHERE id=3').get().description);
    const runs=desc.static_production_runs||[],index=runs.findIndex(item=>item.run_id===run.run_id);
    if(index<0)runs.push(run);else runs[index]=run;
    desc.static_production_runs=runs;
    db.prepare('UPDATE storyboards SET description=? WHERE id=3').run(JSON.stringify(desc));
  }
  const client=new ManagedAgentWorkbenchClient({root,onExecution:persist});
  try{
    const threads=await client.command(['agent','session','threads','list',execution.session_id,'--limit','100','--page-all'],'before-threads');
    if(!Array.isArray(threads.data)||threads.next_page||threads.data.some(thread=>['running','rescheduling'].includes(thread.status)))throw new Error('Prior child threads are not complete');
    db.transaction(()=>{
      const spent=db.prepare('SELECT description FROM storyboards').all().flatMap(row=>{try{return JSON.parse(row.description||'{}').static_production_runs||[];}catch(_){return [];}})
        .flatMap(item=>item.costs?.reservations||[]).reduce((sum,item)=>sum+Number(item.reserved_cny||0),0);
      if(spent+10>100)throw new Error('Non-video budget insufficient');
      run.costs.reservations.push({kind:'managed_agent',stage:run.stage,reserved_cny:10,actual_cost_cny:null});persist(execution);
    })();
    const prompt=instructions+'\nReturn only JSON. Echo these exact binding fields: '+JSON.stringify({execution_id:execution.execution_id,input_hash:execution.input_hash})+'\nApproved input: '+JSON.stringify(context);
    const promptFile=path.join(root,'mounted-review-prompt.txt');fs.writeFileSync(promptFile,prompt,{flag:'wx'});
    execution.execution_status='UNKNOWN';persist(execution);
    const receipt=await client.command(['agent','session','events','send',execution.session_id,'--type','user.message','--content','@'+promptFile],'send');
    const message=receipt.data?.find(event=>event.type==='user.message'&&event.id);
    if(!message||message.content.filter(item=>item.type==='text').map(item=>item.text).join('')!==prompt)throw new Error('Missing exact submission receipt; do not resend');
    execution.submit_event_id=message.id;execution.execution_status='RUNNING';run.status='RUNNING';persist(execution);
    const result=await client.collect(execution);
    run.result=result.result;run.status='REVIEW_PENDING';persist(result.execution);
    const ended=await client.command(['agent','session','threads','list',execution.session_id,'--limit','100','--page-all'],'ended-threads');
    fs.writeFileSync(path.join(root,'thread-proof.json'),JSON.stringify(ended,null,2),{flag:'wx'});
    console.log(JSON.stringify({status:run.status,session_id:execution.session_id,result_event_id:execution.result_event_id,root}));
  }catch(error){run.status='BLOCKED';run.message=error.message;persist(execution);throw error;}
  finally{db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
