const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ManagedAgentWorkbenchClient, parseAgentJson, redact } = require('../src/services/managedAgentWorkbenchClient');
test('billable send is preceded by durable UNKNOWN and binds actual attached-image receipt and current reply', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localminidrama-isolated-agent-test-'));
  const records = [], calls = [];
  let prompt = '', result;
  const client = new ManagedAgentWorkbenchClient({ root, onExecution: record => records.push(JSON.parse(JSON.stringify(record))) });
  client.command = async args => {
    calls.push(args);
    if (args[0] === 'auth') return { logged_in: true, active_profile: { type: 'platform' } };
    if (args[1] === 'agent') return { Result: { Id: 'agent-test-only', Name: 'film-visual-inspector', Model: { Id: 'model-test' } } };
    if (args[2] === 'create') return { Result: { Id: 'session-test-only' } };
    if (args[3] === 'send') {
      assert.equal(records.at(-1).execution_status, 'UNKNOWN');
      prompt = args[args.indexOf('--text') + 1];
      const binding = JSON.parse(prompt.split('Echo these exact binding fields: ')[1].split('\n')[0]);
      result = { ...binding, verdict: 'REVISE', score: 61, observations: { test: 'isolated fixture' }, recommendations: [] };
      return { data: [{ type: 'user.message', id: 'send-test-only', content: [{ type: 'text', text: prompt },
        { type: 'image', source: { file_id: 'file-test-only' } }] }] };
    }
    return { data: [{ id: 'usage-test-only', type: 'span.model_request_end', model_usage: { input_tokens: 100, output_tokens: 50 } },
      { id: 'reply-test-only', type: 'agent.message', content: [{ type: 'text', text: JSON.stringify(result) }] },
      { id: 'idle-test-only', type: 'session.status_idle' }] };
  };
  try {
    const image = path.join(root, 'fixture-image.jpg'); fs.writeFileSync(image, 'test-only-media');
    const output = await client.run({ agentId: 'agent-test-only', agentName: 'film-visual-inspector', environmentId: 'env-test-only',
      stage: 'review-test', images: [image], input: { instructions: 'Test fixture only', context: { image_generation_id: 999 } } });
    assert.equal(output.execution.result_event_id, 'reply-test-only');
    assert.equal(output.execution.submit_event_id, 'send-test-only');
    assert.equal(output.execution.actual_cost_cny, null);
    assert.equal(output.result.verdict, 'REVISE');
    assert.equal(calls.filter(args => args[3] === 'send').length, 1);
    assert.ok(calls.find(args => args[3] === 'list').includes('send-test-only'));
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep + 'localminidrama-isolated-agent-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test('narrative/invalid Agent JSON cannot become mock success; credential strings are redacted', () => {
  assert.throws(() => parseAgentJson('Agent unavailable; use historical 88 score'));
  assert.equal(redact('api_key=TEST_SECRET Bearer TEST_TOKEN').includes('TEST_SECRET'), false);
  assert.equal(redact('api_key=TEST_SECRET Bearer TEST_TOKEN').includes('TEST_TOKEN'), false);
});
