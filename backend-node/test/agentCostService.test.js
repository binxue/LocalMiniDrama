const test = require('node:test');
const assert = require('node:assert/strict');
const cost = require('../src/services/agentCostService');

test('cost stays unconfigured without an official price', () => {
  delete process.env.LOCALMINIDRAMA_AGENT_PRICES_JSON;
  const result = cost.calculate('doubao-seed-evolving-latest-version', { input_tokens: 100, output_tokens: 20 });
  assert.equal(result.status, 'unconfigured');
  assert.equal(result.amount, null);
});

test('configured cost subtracts cache input and supports partial usage', () => {
  process.env.LOCALMINIDRAMA_AGENT_PRICES_JSON = JSON.stringify({ demo: { input: 1, output: 2, cache_read: 0.5, currency: 'CNY', version: 'v1', source: 'https://example.com/pricing' } });
  const result = cost.calculate('demo', { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 100, missing_usage_requests: 1 });
  assert.equal(result.status, 'partial');
  assert.equal(result.amount, (900 + 400 + 50) / 1e6);
  assert.equal(result.range, null);
  delete process.env.LOCALMINIDRAMA_AGENT_PRICES_JSON;
});
