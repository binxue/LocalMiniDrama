// Versioned, provider-specific pricing helpers. Unknown means exactly that:
// it is never converted to zero or treated as settled spend.
const PRICING_VERSION = 'ark-2026-10-14-account-query-v1';

const CATALOG = Object.freeze({
  'doubao-seedream-5-0-pro-260628': {
    provider: 'volcengine', modality: 'image', pricing_version: PRICING_VERSION,
    source: 'Volcengine Ark model pricing (2026-10-14); product schedule supplied by producer',
    kind: 'per_image', price_1500_cny: 0.30, price_above_1500_cny: 0.60,
    reference_after_first_cny: 0.02,
  },
  'doubao-seedream-5-0-flash-260915': {
    provider: 'volcengine', modality: 'image', pricing_version: PRICING_VERSION,
    source: 'Volcengine Ark model pricing (2026-10-14); product schedule supplied by producer',
    kind: 'per_image', price_cny: 0.12,
  },
});
// Video models are recognized for ledger attribution, but no local price is
// asserted until Ark returns a matching schedule for the account and mode.
const VIDEO_MODELS = Object.freeze([
  'doubao-seedance-2-0-260128', 'doubao-seedance-2-0-mini-260615',
  'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-5',
]);

function imageEstimate({ model, size, referenceCount = 0 }) {
  const spec = CATALOG[model];
  if (!spec || spec.modality !== 'image') return unknown(model, 'IMAGE_PRICE_NOT_CONFIGURED');
  const [width, height] = String(size || '').toLowerCase().split('x').map(Number);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return unknown(model, 'OUTPUT_SIZE_UNKNOWN');
  const longest = Math.max(width, height);
  const base = spec.price_cny ?? (longest <= 1500 ? spec.price_1500_cny : spec.price_above_1500_cny);
  const refs = Math.max(0, Number(referenceCount) || 0);
  const reference = spec.reference_after_first_cny ? Math.max(0, refs - 1) * spec.reference_after_first_cny : 0;
  return { estimated_cost_cny: Number((base + reference).toFixed(6)), pricing_status: 'ESTIMATED',
    pricing_version: spec.pricing_version, provider: spec.provider, model, usage: { output_size: `${width}x${height}`, reference_images: refs },
    breakdown: { image_cny: base, reference_images_cny: reference } };
}

function tokenEstimate({ model, inputTokens, outputTokens, cacheReadInputTokens = 0, rates, pricingVersion }) {
  if (!model || !Number.isFinite(Number(inputTokens)) || !Number.isFinite(Number(outputTokens)) || !rates) return unknown(model, 'TOKEN_PRICE_UNKNOWN');
  const input = Math.max(0, Number(inputTokens));
  const output = Math.max(0, Number(outputTokens));
  const cache = Math.min(input, Math.max(0, Number(cacheReadInputTokens) || 0));
  const uncached = input - cache;
  if (![rates.input, rates.output, rates.cache].every(Number.isFinite)) return unknown(model, 'TOKEN_PRICE_UNKNOWN');
  const amount = (uncached * rates.input + output * rates.output + cache * rates.cache) / 1000;
  return { estimated_cost_cny: Number(amount.toFixed(8)), pricing_status: 'ESTIMATED', pricing_version: pricingVersion || PRICING_VERSION,
    model, usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: cache },
    breakdown: { input_cny: uncached * rates.input / 1000, output_cny: output * rates.output / 1000, cache_cny: cache * rates.cache / 1000 } };
}

function unknown(model, reason) {
  return { estimated_cost_cny: null, pricing_status: 'UNKNOWN', pricing_version: PRICING_VERSION, model: model || null, unknown_reason: reason };
}

function videoEstimate({ model, completionTokens, pricing }) {
  if (!model || !Number.isFinite(Number(completionTokens)) || !pricing || !Number.isFinite(Number(pricing.perThousandCompletionTokens))) return unknown(model, 'VIDEO_PRICE_OR_USAGE_UNKNOWN');
  const tokens = Math.max(0, Number(completionTokens));
  return { estimated_cost_cny: Number((tokens * pricing.perThousandCompletionTokens / 1000).toFixed(8)), pricing_status: 'ESTIMATED', pricing_version: pricing.version || PRICING_VERSION,
    model, usage: { completion_tokens: tokens }, breakdown: { completion_cny: tokens * pricing.perThousandCompletionTokens / 1000 } };
}

module.exports = { CATALOG, VIDEO_MODELS, PRICING_VERSION, imageEstimate, tokenEstimate, videoEstimate, unknown };
