const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

// Reuses the research execution contract: version-bound, event-bound, non-Canon.
function prepareReview({ storyboard, media, storageRoot, planBytes, shotKey, agentId, sessionId }) {
  if (!storyboard || !media || media.storyboard_id !== storyboard.id || media.status !== 'completed') {
    throw new Error('Candidate must be completed and belong to this storyboard');
  }
  if (!agentId || !sessionId) throw new Error('Explicit Agent and session are required');
  const root = fs.realpathSync(storageRoot);
  const file = fs.realpathSync(path.resolve(root, media.local_path || ''));
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(file).isFile()) {
    throw new Error('Candidate must be a file inside media storage');
  }
  const planHash = hash(planBytes);
  if (planHash !== '7155cf62c528833f32fe0d3832027aacae6a86066bfddd7304d9c4a80bcc34a6') {
    throw new Error('Approved A/B plan hash mismatch');
  }
  const plan = JSON.parse(planBytes.toString('utf8'));
  const shot = plan.shots.find(item => item.key === shotKey);
  const expectedStoryboard = { s01_01A: 3, s01_01B: 4 }[shotKey];
  if (!shot || storyboard.id !== expectedStoryboard) throw new Error('Shot/storyboard mismatch');
  const description = JSON.parse(storyboard.description);
  if (!description.approval) throw new Error('Director approval record missing');
  const record = {
    execution_id: 'exec-' + crypto.randomUUID(), agent_id: agentId, session_id: sessionId,
    storyboard_id: storyboard.id, image_generation_id: media.id,
    local_path: media.local_path, media_sha256: hash(fs.readFileSync(file)),
    plan_sha256: planHash, shot_key: shotKey,
    approval_sha256: hash(JSON.stringify(description.approval)),
    execution_status: 'PENDING', submit_event_id: null, result_event_id: null,
    created_at: new Date().toISOString(),
  };
  const input = JSON.stringify({ execution_id: record.execution_id, image_generation_id: media.id,
    media_sha256: record.media_sha256, plan_sha256: planHash, shot });
  record.input_hash = hash(input);
  const prompt = [
    'Inspect the attached ACTUAL candidate first-frame image against the approved shot below.',
    'First-frame checks: action has not completed. Distinguish image suitability from video action and continuity.',
    'Do not run tools, create media, approve production, or infer unseen details. Return only JSON with:',
    JSON.stringify({ execution_id: record.execution_id, input_hash: record.input_hash,
      verdict: 'APPROVE|REVISE|BLOCKED', score: 0, observations: {}, recommendations: [] }),
    'Score must be 0-100. APPROVE is advisory only. Report visible defects and unassessable video requirements.',
    'Approved input: ' + input,
  ].join('\n');
  record.prompt = prompt;
  return { record, file };
}

function validateResult(record, send, events) {
  const submitted = (send.data || []).find(e => e.type === 'user.message' && e.id === record.submit_event_id);
  if (!submitted) throw new Error('Submission receipt missing');
  const text = (submitted.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const image = (submitted.content || []).find(c => c.type === 'image' && c.source?.file_id);
  if (text !== record.prompt || !image) throw new Error('Submission must contain the exact prompt and attached image');
  if (!Array.isArray(events.data) || events.next_page) throw new Error('Complete event page required');
  // Caller requests events strictly after the submitted cursor in ascending order.
  const rows = events.data;
  if (rows.some(e => e.type === 'user.message')) throw new Error('Concurrent turn: refuse ambiguous review');
  if (rows.some(e => ['session.error', 'session.status_failed', 'session.status_terminated', 'session.requires_action'].includes(e.type))) {
    throw new Error('Agent execution failed or requires action');
  }
  const idleIndex = rows.findIndex(e => e.type === 'session.status_idle');
  if (idleIndex < 0) throw new Error('Agent has not reached idle');
  const messages = rows.slice(0, idleIndex).filter(e => e.type === 'agent.message');
  if (!messages.length) throw new Error('Current Agent reply missing');
  const message = messages[messages.length - 1];
  if (!message.id) throw new Error('Result event id missing');
  const raw = (message.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const fence = String.fromCharCode(96).repeat(3);
  let json = raw.trim();
  if (json.startsWith(fence) && json.endsWith(fence)) {
    json = json.slice(fence.length, -fence.length).replace(/^json\s*/, '').trim();
  }
  const result = JSON.parse(json);
  if (result.execution_id !== record.execution_id || result.input_hash !== record.input_hash) {
    throw new Error('Stale or unbound Agent reply');
  }
  if (!['APPROVE', 'REVISE', 'BLOCKED'].includes(result.verdict) || !Number.isFinite(result.score)
      || result.score < 0 || result.score > 100 || !result.observations || typeof result.observations !== 'object'
      || Array.isArray(result.observations) || !Array.isArray(result.recommendations)
      || result.recommendations.some(x => typeof x !== 'string')) throw new Error('Invalid review schema');
  return {
    agent_type: 'visual-quality-inspector', execution_id: record.execution_id,
    image_generation_id: record.image_generation_id, verdict: result.verdict,
    score: result.score, observations: result.observations, recommendations: result.recommendations,
    checked_at: new Date().toISOString(),
    evidence: { source: 'managed-agent-events', agent_id: record.agent_id, session_id: record.session_id,
      submit_event_id: record.submit_event_id, result_event_id: message.id, input_hash: record.input_hash,
      media_sha256: record.media_sha256, plan_sha256: record.plan_sha256, approval_sha256: record.approval_sha256 },
  };
}
module.exports = { hash, prepareReview, validateResult };
