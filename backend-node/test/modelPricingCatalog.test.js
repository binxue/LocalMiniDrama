const test = require('node:test');
const assert = require('node:assert/strict');
const { imageEstimate, tokenEstimate, videoEstimate } = require('../src/services/modelPricingCatalog');

test('Seedream Pro uses output tier and charges references after first', () => {
  const result = imageEstimate({ model: 'doubao-seedream-5-0-pro-260628', size: '1440x2560', referenceCount: 3 });
  assert.equal(result.estimated_cost_cny, 0.64);
  assert.equal(result.pricing_status, 'ESTIMATED');
});

test('unpriced image provider remains UNKNOWN', () => {
  assert.equal(imageEstimate({ model: 'gpt-image-2', size: '1024x1024' }).pricing_status, 'UNKNOWN');
});

test('token pricing accounts for cache hits', () => {
  const result = tokenEstimate({ model: 'example', inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 400,
    rates: { input: 0.8, output: 2.7, cache: 0.24 }, pricingVersion: 'ark-test-v1' });
  assert.equal(result.estimated_cost_cny, 1.926);
});

test('video estimate requires provider price and usage', () => {
  assert.equal(videoEstimate({ model: 'doubao-seedance-2-0-mini-260615', completionTokens: 1000 }).pricing_status, 'UNKNOWN');
  assert.equal(videoEstimate({ model: 'doubao-seedance-2-0-mini-260615', completionTokens: 1000,
    pricing: { perThousandCompletionTokens: 0.12, version: 'ark-test-v1' } }).estimated_cost_cny, 0.12);
});
