const fs = require('node:fs');
const path = require('node:path');
const runtime = path.resolve(__dirname, '../../runtime');

async function main() {
  const run = JSON.parse(fs.readFileSync(path.join(runtime, 'team-mounted-verification.json'), 'utf8'));
  const execution = run.executions[0];
  if (execution.execution_status !== 'COMPLETED' || !execution.result_event_id
      || run.result.execution_id !== execution.execution_id || run.result.input_hash !== execution.input_hash) {
    throw new Error('Bound real completed review required');
  }
  const evidenceRoot = path.join(runtime, 'evidence', run.run_id);
  const childIds = ['sthr-20261014174120-xkwim', 'sthr-20261014174120-mxs79', 'sthr-20261014174120-bq81h'];
  const childProof = childIds.map(id => {
    const filename = fs.readdirSync(evidenceRoot).find(name => name.startsWith('child-proof-' + id + '-'));
    if (!filename) throw new Error('Missing child evidence: ' + id);
    const events = JSON.parse(JSON.parse(fs.readFileSync(path.join(evidenceRoot, filename), 'utf8')).stdout).data;
    const end = events.filter(event => event.type === 'session.thread_status_idle').at(-1);
    if (end?.stop_reason?.type !== 'end_turn' || !events.some(event => event.type === 'agent.message')) {
      throw new Error('Child did not complete: ' + id);
    }
    return { thread_id: id, evidence_file: filename, stop_reason: end.stop_reason };
  });
  const responses = [];
  for (const shot of run.result.shot_reviews) {
    const mediaId = { 5:36, 6:37 }[shot.storyboard_id];
    if (!mediaId || shot.identity_status !== 'REVISE') throw new Error('Unexpected media review binding');
    const body = {
      agent_type: 'chief-director', execution_id:execution.execution_id,
      verdict:'REVISE', image_generation_id:mediaId,
      observations:{ ...shot, team_findings:run.result.team_findings,
        reference_contract:run.result.reference_contract,
        unresolved_identity_disagreement:'Continuity reported identity match; visual inspector rejected it. No identity PASS or producer acceptance is established.',
        frozen_standard:'Original script approximately 25 years old; do not apply inferred 20-year-old/少女/病娇 personality or age changes.' },
      recommendations:[shot.correction],
      evidence:{ session_id:execution.session_id, submit_event_id:execution.submit_event_id,
        result_event_id:execution.result_event_id, input_hash:execution.input_hash,
        child_threads:childProof, media_hashes:execution.media, raw_evidence_root:evidenceRoot },
    };
    const response = await fetch('http://127.0.0.1:5681/api/v1/storyboards/' + shot.storyboard_id + '/quality-check', {
      method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || result.code && result.code !== 200) throw new Error(JSON.stringify(result));
    responses.push({storyboard_id:shot.storyboard_id,image_generation_id:mediaId,response:result});
  }
  fs.writeFileSync(path.join(runtime,'mounted-team-import.json'),JSON.stringify({run_id:run.run_id,responses},null,2));
  console.log(JSON.stringify(responses));
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
