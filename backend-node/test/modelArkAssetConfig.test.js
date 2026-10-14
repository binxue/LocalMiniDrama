'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  unwrapModelArkAssetView,
  normalizeModelArkAssetStatus,
  assetUrlForVideo,
  parseSettingsJson,
  buildModelArkContext,
} = require('../src/services/modelArkAssetConfigService');

describe('modelArkAssetConfigService', () => {
  it('resolves local credentials only in backend call options; persisted settings contain no key material', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-credential-test-'));
    const file = path.join(dir, 'fixture.txt');
    fs.writeFileSync(file, 'AccessKeyId: test-only-ak\nSecretAccessKey: test-only-sk\n');
    const row = { id: 1, base_url: 'https://ark.cn-beijing.volcengineapi.com', settings: JSON.stringify({credential_file:file,asset_group_id:'test-only-group'}) };
    try {
      const ctx = buildModelArkContext({prepare:()=>({get:()=>row})});
      assert.equal(ctx.ready, true);
      assert.equal(ctx.callOpts.access_key_id, 'test-only-ak');
      assert.equal(ctx.callOpts.secret_access_key, 'test-only-sk');
      assert.equal(JSON.stringify(ctx.row).includes('test-only-sk'), false);
      fs.unlinkSync(file);
      assert.equal(buildModelArkContext({prepare:()=>({get:()=>row})}).ready, false);
    } finally { if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(dir); }
  });
  it('unwrapModelArkAssetView reads Result.Id', () => {
    const asset = unwrapModelArkAssetView({
      Result: { Id: 'asset-abc', Status: 'Available', Name: 'hero' },
    });
    assert.equal(asset.id, 'asset-abc');
    assert.equal(asset.status, 'active');
    assert.equal(asset.name, 'hero');
  });

  it('normalizeModelArkAssetStatus maps common values', () => {
    assert.equal(normalizeModelArkAssetStatus('Available'), 'active');
    assert.equal(normalizeModelArkAssetStatus('Processing'), 'processing');
    assert.equal(normalizeModelArkAssetStatus('Failed'), 'failed');
  });

  it('assetUrlForVideo builds asset:// from id', () => {
    assert.equal(assetUrlForVideo({ id: 'asset-xyz' }), 'asset://asset-xyz');
    assert.equal(assetUrlForVideo({ asset_url: 'asset://already' }), 'asset://already');
  });

  it('parseSettingsJson handles object or string', () => {
    assert.deepEqual(parseSettingsJson('{"auth_mode":"volc_sign"}'), { auth_mode: 'volc_sign' });
    assert.deepEqual(parseSettingsJson({ asset_group_id: 'g1' }), { asset_group_id: 'g1' });
  });
});
