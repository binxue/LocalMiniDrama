const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { ManagedAgentWorkbenchClient } = require('../src/services/managedAgentWorkbenchClient');
const runtime = path.resolve(__dirname, '../../runtime');
const marker = path.join(runtime, 'team-verification.json');
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
async function main() {
  const run = JSON.parse(fs.readFileSync(marker, 'utf8'));
  const execution = run.executions[0];
  if (execution.error?.code !== 'ENAMETOOLONG' || execution.submit_event_id || run.local_send_recovery) throw new Error('Only the proven local process-start failure is recoverable here');
  const root = path.join(runtime, 'evidence', run.run_id);
  const db = new Database(path.join(runtime, 'drama_generator.db'), { fileMustExist: true });
  function persist(value) {
    if (value) run.executions = [value];
    fs.writeFileSync(marker, JSON.stringify(run, null, 2));
    const desc = JSON.parse(db.prepare('SELECT description FROM storyboards WHERE id=3').get().description);
    const index = desc.static_production_runs.findIndex(item => item.run_id === run.run_id);
    if (index < 0) throw new Error('Original reservation missing');
    desc.static_production_runs[index] = run;
    db.prepare('UPDATE storyboards SET description=? WHERE id=3').run(JSON.stringify(desc));
  }
  const client = new ManagedAgentWorkbenchClient({ root, onExecution: persist });
  try {
    const history = await client.command(['agent','session','events','list',execution.session_id,'--limit','100','--page-all'], 'local-recovery-history');
    if (history.next_page || (history.data != null && (!Array.isArray(history.data) || history.data.length))) throw new Error('Session has history; no recovery submission is permitted');
    const savedPrompt = fs.readFileSync(path.join(root, execution.execution_id + '-prompt.txt'), 'utf8');
    const instructions = savedPrompt.split('\nReturn only JSON. Echo these exact binding fields: ')[0];
    const context = JSON.parse(savedPrompt.split('\nApproved input: ')[1]);
    context.shots = context.shots.map(shot => {
      const desc = JSON.parse(shot.description || '{}');
      return { ...shot, description: Object.fromEntries(['branch','state_guard','state_effect','audio','transition','acceptance','spec','first_last_frames'].filter(key => key in desc).map(key => [key,desc[key]])) };
    });
    const input = { instructions, context };
    run.local_send_recovery = { reason: 'ENAMETOOLONG before child process creation; empty remote event history verified', previous_input_hash: execution.input_hash, at: new Date().toISOString() };
    execution.input_hash = hash(JSON.stringify(input));
    execution.previous_errors = [...(execution.previous_errors || []), execution.error];
    delete execution.error;
    const prompt = instructions + '\nReturn only JSON. Echo these exact binding fields: ' + JSON.stringify({execution_id:execution.execution_id,input_hash:execution.input_hash}) + '\nApproved input: ' + JSON.stringify(context);
    const promptFile = path.join(root, execution.execution_id + '-bounded-prompt.txt');
    fs.writeFileSync(promptFile,prompt,{flag:'wx'});
    const files = [context.character.local_path, ...context.media.map(row => row.local_path)].map(value => path.join(runtime,'storage',value));
    const args = ['agent','session','events','send',execution.session_id,'--type','user.message','--content','@'+promptFile];
    for (const file of files) args.push('--image','@'+file);
    execution.execution_status = 'UNKNOWN';
    persist(execution);
    const receipt = await client.command(args, 'local-recovery-send');
    const submitted = receipt.data?.find(event => event.type==='user.message' && event.id);
    if (!submitted || submitted.content.filter(item=>item.type==='text').map(item=>item.text).join('')!==prompt) throw new Error('Missing bound submission receipt; do not resend');
    const attachments = submitted.content.filter(item=>item.type==='image' && item.source?.file_id);
    if (attachments.length!==files.length) throw new Error('Missing image evidence; do not resend');
    execution.submit_event_id = submitted.id;
    execution.file_ids = attachments.map(item=>item.source.file_id);
    execution.execution_status = 'RUNNING';
    persist(execution);
    const response = await client.collect(execution, 'local-recovery');
    run.result = response.result;
    const threads = await client.command(['agent','session','threads','list',execution.session_id,'--limit','100','--page-all'], 'local-recovery-threads');
    run.status = 'REVIEW_PENDING'; run.message = 'Main result received; child-thread proof and whole-scene acceptance pending';
    fs.writeFileSync(path.join(root,'thread-proof.json'),JSON.stringify(threads,null,2),{flag:'wx'});
    persist(response.execution);
    console.log(JSON.stringify({status:run.status,session_id:execution.session_id,result_event_id:execution.result_event_id,root}));
  } catch(error) {
    run.status='BLOCKED';run.message=error.message;
    execution.error = { code:error.code || 'TEAM_SEND_FAILED', message:error.message, evidence:error.evidence || null };
    persist(execution);throw error;
  }
  finally { db.close(); }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
