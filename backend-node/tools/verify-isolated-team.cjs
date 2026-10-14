const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { ManagedAgentWorkbenchClient } = require('../src/services/managedAgentWorkbenchClient');
const runtime = path.resolve(__dirname, '../../runtime');
const marker = path.join(runtime, 'team-verification.json');

async function main() {
  if (fs.existsSync(marker)) throw new Error('Execution already recorded; collect its existing session, never resubmit');
  const db = new Database(path.join(runtime, 'drama_generator.db'), { fileMustExist: true });
  try {
    const character = db.prepare('SELECT id,name,appearance,description,local_path,polished_prompt FROM characters WHERE id=2').get();
    const shots = db.prepare('SELECT id,title,action,dialogue,location,time,description,image_prompt FROM storyboards WHERE id BETWEEN 3 AND 6 ORDER BY storyboard_number').all().map(shot => {
      const desc = JSON.parse(shot.description || '{}');
      return { ...shot, description: Object.fromEntries(['branch','state_guard','state_effect','audio','transition','acceptance','spec','first_last_frames'].filter(key => key in desc).map(key => [key,desc[key]])) };
    });
    const mediaRows = [19, 20, 21, 36, 37].map(id => db.prepare('SELECT id,storyboard_id,local_path,status FROM image_generations WHERE id=?').get(id));
    const files = [character.local_path, ...mediaRows.map(row => row.local_path)].map(value => path.resolve(runtime, 'storage', value));
    const storage = path.resolve(runtime, 'storage') + path.sep;
    if (files.some(file => !file.startsWith(storage) || !fs.existsSync(file))) throw new Error('Missing or out-of-bounds reference');
    const scene = db.prepare('SELECT * FROM scenes WHERE id=1').get();
    const evidenceDir = path.join(runtime, 'evidence', 'scene-team-' + crypto.randomUUID());
    const run = { run_id: path.basename(evidenceDir), storyboard_id: 3, drama_id: 2, episode_id: 2,
      shot_key: 'scene-1', status: 'PENDING', stage: 'official-multiagent-audit', created_at: new Date().toISOString(),
      executions: [], candidates: [], costs: { currency: 'CNY', actual_cost_cny: null, billing_status: 'PENDING_SETTLEMENT',
        reservations: [{ kind: 'managed_agent', stage: 'scene-team-audit', reserved_cny: 10, actual_cost_cny: null }] } };
    function persist(execution) {
      if (execution) run.executions = [execution];
      fs.mkdirSync(evidenceDir, { recursive: true });
      fs.writeFileSync(marker, JSON.stringify(run, null, 2));
      const row = db.prepare('SELECT description FROM storyboards WHERE id=3').get();
      const desc = JSON.parse(row.description);
      const runs = desc.static_production_runs || [];
      const index = runs.findIndex(item => item.run_id === run.run_id);
      if (index === -1) runs.push(run); else runs[index] = run;
      desc.static_production_runs = runs;
      db.prepare('UPDATE storyboards SET description=? WHERE id=3').run(JSON.stringify(desc));
    }
    db.transaction(() => {
      const reserved = db.prepare('SELECT description FROM storyboards').all().flatMap(row => {
        try { return JSON.parse(row.description || '{}').static_production_runs || []; } catch (_) { return []; }
      }).flatMap(item => item.costs?.reservations || []).reduce((sum, item) => sum + Number(item.reserved_cny || 0), 0);
      if (reserved + 10 > 100) throw new Error('Existing non-video budget cannot fund team audit');
      persist();
    })();
    const client = new ManagedAgentWorkbenchClient({ root: evidenceDir, onExecution: persist });
    try {
      const response = await client.run({ agentId: 'agent-20261014170642-fd355', agentName: 'localminidrama-rebuild-director-20261015',
        environmentId: 'env-20261011083635-eeeu2', stage: 'scene-1-reference-and-continuity-audit', images: files,
        input: {
          instructions: 'Delegate to the real photography and continuity agents. Have the visual inspector compare actual candidate images 36 and 37 to the original identity reference, never using those rejected candidates as identity anchors. No image/video generation, scripts, network research or other paid tools. Do not redraft or renumber shots. Image order is original Lixia identity; scene; phone; tea glass; candidate36; candidate37. Original identity image is a face/body reference; its neutral clothing must not replace the LOOK01 costume in appearance. Explicitly correct any legacy mistaken character ID: Lixia=2, POV tourist=3. Return only JSON {execution_id,input_hash,decision,shot_reviews:[{storyboard_id,shot_key,identity_status,action_status,continuity_status,defects,correction}],reference_contract,unresolved,team_findings}. Statuses PASS/REVISE/UNKNOWN; UNKNOWN never permits generation. Cite actual observable media evidence, and report missing angles/visibility. Each specialist should return concise findings, then you reconcile the whole scene. Do not declare final producer approval.',
          context: { character, shots, scene, media: mediaRows, production_scope: 'Original first scene, four ordered shots 3/4/5/6',
            non_video_budget_cny: 100, warning_cny: 80, video_authorized: false,
            historical_unknown_task_ids: [23,24,25,26,27,29,30], rejected_candidates_are_not_references: [31,35,36,37] },
        } });
      const threads = await client.command(['agent','session','threads','list',response.execution.session_id,'--limit','100','--page-all'], 'threads');
      fs.writeFileSync(path.join(evidenceDir, 'thread-proof.json'), JSON.stringify(threads, null, 2), { flag: 'wx' });
      run.status = 'REVIEW_PENDING';
      run.result = response.result;
      run.message = 'Main reply received; independent child-thread and full-scene review still required';
      persist(response.execution);
      console.log(JSON.stringify({ run_id: run.run_id, session_id: response.execution.session_id, status: run.status, evidenceDir }));
    } catch (error) {
      run.status = 'BLOCKED'; run.message = error.message; persist(); throw error;
    }
  } finally { db.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
