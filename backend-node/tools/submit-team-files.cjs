const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { ManagedAgentWorkbenchClient } = require('../src/services/managedAgentWorkbenchClient');
const runtime = path.resolve(__dirname, '../../runtime');
const marker = path.join(runtime,'team-verification.json');
async function main() {
  const run = JSON.parse(fs.readFileSync(marker,'utf8'));
  const execution = run.executions[0];
  if (execution.submit_event_id || run.registered_file_submission) throw new Error('Existing submission or attempt must be collected, never resent');
  const root = path.join(runtime,'evidence',run.run_id);
  const db = new Database(path.join(runtime,'drama_generator.db'),{fileMustExist:true});
  function persist(value) {
    if(value) run.executions=[value];
    fs.writeFileSync(marker,JSON.stringify(run,null,2));
    const desc=JSON.parse(db.prepare('SELECT description FROM storyboards WHERE id=3').get().description);
    const index=desc.static_production_runs.findIndex(item=>item.run_id===run.run_id);
    if(index<0)throw new Error('Original budget reservation missing');
    desc.static_production_runs[index]=run;
    db.prepare('UPDATE storyboards SET description=? WHERE id=3').run(JSON.stringify(desc));
  }
  const client=new ManagedAgentWorkbenchClient({root,onExecution:persist});
  try {
    const history=await client.command(['agent','session','events','list',execution.session_id,'--limit','100','--page-all'],'registered-file-history');
    if(history.next_page || (history.data!=null && (!Array.isArray(history.data)||history.data.length)))throw new Error('Session history is not empty; no new message');
    const transfer=JSON.parse(fs.readFileSync(path.join(runtime,'reference-transfer/manifest.json'),'utf8'));
    const uploaded=JSON.parse(fs.readFileSync(path.join(runtime,'reference-transfer/upload-result.json'),'utf8').replace(/^\uFEFF/,''));
    if(uploaded.status!=='active'||uploaded.filename!==path.basename(transfer.target)||uploaded.bytes!==transfer.target_bytes)throw new Error('Original identity transfer is not verified active');
    const before=fs.readFileSync(path.join(root,execution.execution_id+'-bounded-prompt.txt'),'utf8');
    const instructions=before.split('\nReturn only JSON. Echo these exact binding fields: ')[0];
    const context=JSON.parse(before.split('\nApproved input: ')[1]);
    const allFiles=JSON.parse(fs.readFileSync(path.join(runtime,'file-reuse-audit.json'),'utf8').replace(/^\uFEFF/,'')).data;
    const files=[{id:uploaded.id,filename:uploaded.filename,sha256:transfer.target_sha256,source_sha256:transfer.source_sha256}];
    for(const row of context.media){
      const local=path.join(runtime,'storage',row.local_path),filename=path.basename(local),bytes=fs.readFileSync(local);
      const remote=allFiles.find(file=>file.status==='active'&&file.filename===filename&&file.bytes===bytes.length);
      if(!remote)throw new Error('No active reusable file for '+filename);
      const actual=await client.command(['agent','file','get',remote.id],'registered-file-'+row.id);
      const value=actual.data||actual;
      if(value.id!==remote.id||value.status!=='active'||value.filename!==filename||value.bytes!==bytes.length)throw new Error('File metadata changed');
      files.push({id:remote.id,filename,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
    }
    context.reference_files=files;
    context.identity_transfer=transfer;
    const hash=crypto.createHash('sha256').update(JSON.stringify({instructions,context})).digest('hex');
    run.registered_file_submission={at:new Date().toISOString(),previous_input_hash:execution.input_hash,files,reason:'No user event exists; use active files without repeating the unknown PNG upload'};
    execution.input_hash=hash;
    execution.media=files.map(file=>({filename:file.filename,sha256:file.sha256}));
    execution.execution_status='UNKNOWN';
    const prompt=instructions+'\nReturn only JSON. Echo these exact binding fields: '+JSON.stringify({execution_id:execution.execution_id,input_hash:hash})+'\nApproved input: '+JSON.stringify(context);
    const file=path.join(root,'registered-files-prompt.txt');fs.writeFileSync(file,prompt,{flag:'wx'});
    persist(execution);
    const args=['agent','session','events','send',execution.session_id,'--type','user.message','--content','@'+file];
    for(const media of files)args.push('--image',media.id);
    const receipt=await client.command(args,'registered-files-send');
    const message=receipt.data?.find(event=>event.type==='user.message'&&event.id);
    const receivedFiles=message?.content?.filter(item=>item.type==='image').map(item=>item.source?.file_id);
    if(!message||message.content.filter(item=>item.type==='text').map(item=>item.text).join('')!==prompt||JSON.stringify(receivedFiles)!==JSON.stringify(files.map(item=>item.id)))throw new Error('Submission binding failed; do not resend');
    execution.submit_event_id=message.id;execution.file_ids=receivedFiles;execution.execution_status='RUNNING';persist(execution);
    const response=await client.collect(execution,'registered-files-collect');
    run.result=response.result;run.status='REVIEW_PENDING';run.message='Real main reply received; verify child threads and whole-scene quality';persist(response.execution);
    const threads=await client.command(['agent','session','threads','list',execution.session_id,'--limit','100','--page-all'],'registered-files-threads');
    fs.writeFileSync(path.join(root,'thread-proof.json'),JSON.stringify(threads,null,2),{flag:'wx'});
    console.log(JSON.stringify({status:run.status,session_id:execution.session_id,result_event_id:execution.result_event_id}));
  }catch(error){run.status='BLOCKED';run.message=error.message;execution.error={code:error.code||'TEAM_FILES_FAILED',message:error.message,evidence:error.evidence||null};persist(execution);throw error;}
  finally{db.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
