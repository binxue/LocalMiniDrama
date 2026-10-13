const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateResult } = require('../src/services/managedAgentReviewEvidence');
function fixture() {
  const record = { execution_id: 'exec-test', input_hash: 'input-test', prompt: 'Exact review prompt',
    submit_event_id: 'send-current', agent_id: 'agent-test', session_id: 'session-test', image_generation_id: 22 };
  const send = { data: [{ id: record.submit_event_id, type: 'user.message', content: [
    { type: 'text', text: record.prompt }, { type: 'image', source: { file_id: 'file-current' } },
  ] }] };
  const result = { execution_id: record.execution_id, input_hash: record.input_hash,
    verdict: 'REVISE', score: 61, observations: { cup: 'Handle visible' }, recommendations: ['Correct cup'] };
  const events = { data: [{ id: 'result-current', type: 'agent.message', content: [{ type: 'text', text: JSON.stringify(result) }] },
    { id: 'idle-current', type: 'session.status_idle' }] };
  return { record, send, events, result };
}
test('real event envelope produces advisory review bound to candidate and event ids', () => {
  const f = fixture();
  const review = validateResult(f.record, f.send, f.events);
  assert.equal(review.verdict, 'REVISE');
  assert.equal(review.image_generation_id, 22);
  assert.equal(review.evidence.result_event_id, 'result-current');
  assert.equal(review.evidence.submit_event_id, 'send-current');
  assert.equal(review.producer_decision, undefined);
});
test('text-only Agent call cannot count as visual review', () => {
  const f = fixture(); f.send.data[0].content.pop();
  assert.throws(() => validateResult(f.record, f.send, f.events), /attached image/);
});
test('submission receipt from another prompt is rejected', () => {
  const f = fixture(); f.send.data[0].content[0].text = 'Historical review';
  assert.throws(() => validateResult(f.record, f.send, f.events), /exact prompt/);
});
test('historical reply cannot masquerade as current execution', () => {
  const f = fixture(); f.result.execution_id = 'exec-old';
  f.events.data[0].content[0].text = JSON.stringify(f.result);
  assert.throws(() => validateResult(f.record, f.send, f.events), /Stale/);
});
test('wrong candidate input hash is rejected', () => {
  const f = fixture(); f.result.input_hash = 'old-candidate';
  f.events.data[0].content[0].text = JSON.stringify(f.result);
  assert.throws(() => validateResult(f.record, f.send, f.events), /Stale/);
});
test('running, paginated, failed and concurrent executions never become completed review', () => {
  for (const change of [
    f => f.events.data.pop(),
    f => { f.events.next_page = 'more'; },
    f => f.events.data.unshift({ type: 'session.error' }),
    f => f.events.data.unshift({ type: 'user.message' }),
  ]) {
    const f = fixture(); change(f);
    assert.throws(() => validateResult(f.record, f.send, f.events));
  }
});
test('missing result, invalid scores and invented verdict fail closed', () => {
  for (const change of [
    f => f.events.data.shift(),
    f => { f.result.score = 101; },
    f => { f.result.verdict = 'PASS'; },
  ]) {
    const f = fixture(); change(f);
    if (f.events.data[0]?.type === 'agent.message') f.events.data[0].content[0].text = JSON.stringify(f.result);
    assert.throws(() => validateResult(f.record, f.send, f.events));
  }
});
test('markdown JSON fences are accepted without accepting narrative outside JSON', () => {
  const f = fixture(); const fence = String.fromCharCode(96).repeat(3);
  f.events.data[0].content[0].text = fence + 'json\n' + JSON.stringify(f.result) + '\n' + fence;
  assert.equal(validateResult(f.record, f.send, f.events).score, 61);
});
