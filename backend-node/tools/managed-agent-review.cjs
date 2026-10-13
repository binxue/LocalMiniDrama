// Native Node CLI. Runtime receipts belong outside the repository.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hash, prepareReview, validateResult } = require('../src/services/managedAgentReviewEvidence');
const backend = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const mode = args.shift();
const options = {};
while (args.length) {
  const key = args.shift();
  if (!key.startsWith('--') || !args.length) throw new Error('Options require explicit values');
  options[key.slice(2)] = args.shift();
}
const directory = path.resolve(options.output || '');
if (!options.output || directory === path.parse(directory).root || !path.relative(path.resolve(backend, '..'), directory).startsWith('..')) {
  throw new Error('--output must name an evidence directory outside the repository');
}
const recordPath = path.join(directory, 'execution.json');
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const save = (name, value, exclusive = false) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2), { flag: exclusive ? 'wx' : 'w', mode: 0o600 });
function cli(command) {
  if (!options['cli-entry']) throw new Error('--cli-entry must point to the installed arkcli scripts/run.js');
  const result = spawnSync(process.execPath, [options['cli-entry'], ...command, '--format', 'json',
    ...(options.profile ? ['--profile', options.profile] : [])], { encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  // Do not echo provider responses or stderr: they may contain credentials.
  if (result.error || result.status !== 0) throw new Error('arkcli failed; no automatic retry. Inspect authenticated CLI separately.');
  return JSON.parse(result.stdout);
}
function currentCandidate(record) {
  const Database = require('better-sqlite3');
  const db = new Database(path.join(backend, 'data/drama_generator.db'), { readonly: true, fileMustExist: true });
  try {
    const media = db.prepare('SELECT * FROM image_generations WHERE id = ?').get(record.image_generation_id);
    const sb = db.prepare('SELECT * FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(record.storyboard_id);
    if (!media || media.status !== 'completed' || media.storyboard_id !== record.storyboard_id || media.local_path !== record.local_path || !sb) throw new Error('Candidate changed');
    const root = fs.realpathSync(path.join(backend, 'data/storage'));
    const file = fs.realpathSync(path.resolve(root, media.local_path));
    const rel = path.relative(root, file);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('Unsafe media path');
    if (hash(fs.readFileSync(file)) !== record.media_sha256 || hash(JSON.stringify(JSON.parse(sb.description).approval)) !== record.approval_sha256) throw new Error('Candidate or approval changed; prepare a new review');
    return file;
  } finally { db.close(); }
}
async function main() {
  if (mode === 'prepare') {
    if (fs.existsSync(recordPath)) throw new Error('Evidence directory already contains an execution; use a new directory');
    const Database = require('better-sqlite3');
    const db = new Database(path.join(backend, 'data/drama_generator.db'), { readonly: true, fileMustExist: true });
    let prepared;
    try {
      prepared = prepareReview({
        storyboard: db.prepare('SELECT * FROM storyboards WHERE id = ? AND deleted_at IS NULL').get(Number(options.storyboard)),
        media: db.prepare('SELECT * FROM image_generations WHERE id = ?').get(Number(options.image)),
        storageRoot: path.join(backend, 'data/storage'), planBytes: fs.readFileSync(options.plan),
        shotKey: options.shot, agentId: options.agent, sessionId: options.session,
      });
    } finally { db.close(); }
    fs.mkdirSync(directory, { recursive: true });
    save('execution.json', prepared.record, true);
    fs.writeFileSync(path.join(directory, 'prompt.txt'), prepared.record.prompt, { flag: 'wx', mode: 0o600 });
    console.log('PREPARED: no Provider call, no database writes.');
    return;
  }
  const record = read('execution.json');
  const file = currentCandidate(record);
  if (mode === 'send') {
    if (options['authorize-agent-call'] !== 'yes') throw new Error('Explicit Agent call authorization required');
    if (record.execution_status !== 'PENDING') throw new Error('Already submitted or unknown: collect evidence, never resend');
    if (!process.env.ARK_API_KEY) {
      const auth = cli(['auth', 'status']);
      if (!auth.logged_in || auth.active_profile?.type !== 'platform') throw new Error('Authenticated Platform profile required');
    }
    const session = cli(['agent', 'session', 'get', record.session_id]);
    const metadata = session.Result || session.data || session;
    if ((metadata.agent_id || metadata.AgentId || metadata.Agent?.Id) !== record.agent_id
        || (metadata.Agent?.Name && metadata.Agent.Name !== 'film-visual-inspector')
        || !['idle', 'Idle'].includes(metadata.status || metadata.Status)) throw new Error('Agent/session mismatch or session not idle');
    save('session-before.json', session, true);
    record.execution_status = 'UNKNOWN'; // Persist BEFORE the billable write.
    record.submitted_at = new Date().toISOString();
    save('execution.json', record);
    const sent = cli(['agent', 'session', 'events', 'send', record.session_id,
      '--type', 'user.message', '--text', '@' + path.join(directory, 'prompt.txt'), '--image', '@' + file]);
    save('send.json', sent, true);
    const event = (sent.data || []).find(e => e.type === 'user.message' && e.id);
    if (!event) throw new Error('Send response lacks cursor; retain UNKNOWN and inspect events without resending');
    record.submit_event_id = event.id;
    record.execution_status = 'RUNNING';
    save('execution.json', record);
    console.log('SUBMITTED: run collect for this same directory. No generation requested.');
    return;
  }
  if (mode !== 'collect' || !record.submit_event_id) throw new Error('collect requires a recorded submission cursor');
  const events = cli(['agent', 'session', 'events', 'list', record.session_id,
    '--after', record.submit_event_id, '--order', 'asc', '--limit', '100', '--page-all']);
  save('events.json', events);
  const review = validateResult(record, read('send.json'), events);
  save('review.json', review);
  record.execution_status = 'COMPLETED';
  record.result_event_id = review.evidence.result_event_id;
  save('execution.json', record);
  if (options.import === 'yes') {
    currentCandidate(record);
    const response = await fetch('http://127.0.0.1:5679/api/v1/storyboards/' + record.storyboard_id + '/quality-check', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(review), signal: AbortSignal.timeout(15000),
    });
    const receipt = await response.json();
    if (!response.ok || !receipt.success) throw new Error('Import failed; retain review and repeat collect/import without resending');
    save('import.json', receipt);
  }
  console.log('REVIEW_COMPLETE: ' + review.verdict + '; advisory only, producer decision remains separate.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
