const fs=require('node:fs');
const path=require('node:path');
const Database=require('better-sqlite3');
const {ManagedAgentWorkbenchClient}=require('../src/services/managedAgentWorkbenchClient');
const runtime=path.resolve(__dirname,'../../runtime');
const markerName=process.argv[2]||'team-verification.json';
if(!['team-verification.json','team-mounted-verification.json'].includes(markerName))throw new Error('Unknown team record');
const marker=path.join(runtime,markerName);
async function main(){
  const run=JSON.parse(fs.readFileSync(marker,'utf8')),execution=run.executions[0];
  if(!execution.session_id||!execution.submit_event_id)throw new Error('Existing submission cursor required; this command cannot send');
  execution.multiagent=JSON.parse(fs.readFileSync(path.join(runtime,'coordinator-definition.json'),'utf8').replace(/^\uFEFF/,'')).Result.Multiagent;
  const root=path.join(runtime,'evidence',run.run_id),db=new Database(path.join(runtime,'drama_generator.db'),{fileMustExist:true});
  function persist(value){
    if(value)run.executions=[value];
    fs.writeFileSync(marker,JSON.stringify(run,null,2));
    const desc=JSON.parse(db.prepare('SELECT description FROM storyboards WHERE id=3').get().description);
    const index=desc.static_production_runs.findIndex(item=>item.run_id===run.run_id);
    if(index<0)throw new Error('Original ledger record missing');
    desc.static_production_runs[index]=run;
    db.prepare('UPDATE storyboards SET description=? WHERE id=3').run(JSON.stringify(desc));
  }
  const client=new ManagedAgentWorkbenchClient({root,onExecution:persist}),prefix='team-resume-'+Date.now();
  try{
    run.status='RUNNING';run.message='Collecting the existing official Multi Agent turn';persist(execution);
    const response=await client.collect(execution,prefix);
    run.result=response.result;run.status='REVIEW_PENDING';run.message='Real main reply received; child evidence review pending';persist(response.execution);
    const threads=await client.command(['agent','session','threads','list',execution.session_id,'--limit','100','--page-all'],prefix+'-threads');
    fs.writeFileSync(path.join(root,'thread-proof.json'),JSON.stringify(threads,null,2));
    console.log(JSON.stringify({status:run.status,session_id:execution.session_id,result_event_id:execution.result_event_id,root}));
  }catch(error){run.status='BLOCKED';run.message=error.message;persist(execution);throw error;}
  finally{db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
