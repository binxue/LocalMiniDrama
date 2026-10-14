const { test } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { resolveSd2RegisterProvider, registerCharacterJimengMaterialAsset } = require('../src/services/characterLibraryService');
const { ensureArkOpenApiBasePath } = require('../src/services/modelArkAssetProxyService');
test('explicit Ark entry cannot fall back to a configured third-party hub or upload with missing credentials', async () => {
  const db = new Database(':memory:');
  const cfg = { jimeng_material_hub: { token: 'test-only-hub' } };
  try {
    assert.equal(resolveSd2RegisterProvider(cfg, db, null).provider, 'hub');
    const route = resolveSd2RegisterProvider(cfg, db, null, 'model_ark');
    assert.equal(route.provider, null);
    const result = await registerCharacterJimengMaterialAsset(db, null, cfg, 2, 'model_ark');
    assert.equal(result.ok, false);
    assert.match(result.error, /未配置火山角色库/);
    // No characters table: reaching preparation or upload would fail this test.
  } finally { db.close(); }
});
test('official signed asset traffic uses the control plane; custom relays remain unchanged', () => {
  assert.equal(ensureArkOpenApiBasePath('https://ark.cn-beijing.volces.com/api/v3', true), 'https://ark.cn-beijing.volcengineapi.com');
  assert.equal(ensureArkOpenApiBasePath('https://ark.cn-beijing.volcengineapi.com', true), 'https://ark.cn-beijing.volcengineapi.com');
  assert.equal(ensureArkOpenApiBasePath('https://ark.ap-southeast-1.byteplusapi.com/api/v3', true), 'https://ark.ap-southeast-1.byteplusapi.com');
  assert.equal(ensureArkOpenApiBasePath('https://relay.example/asset', true), 'https://relay.example/asset');
  assert.equal(ensureArkOpenApiBasePath('https://ark.cn-beijing.volces.com/api/v3', false), 'https://ark.cn-beijing.volces.com/api/v3');
});
