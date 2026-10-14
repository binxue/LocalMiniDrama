const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('snapshot target is the worktree root rather than the drive root', () => {
  assert.equal(require('../tools/prepare-isolated-runtime.cjs').targetRoot, path.resolve(__dirname, '../..'));
});

test('explicit isolated configuration binds its DB and never falls back when missing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'localminidrama-config-'));
  const before = process.env.LOCALMINIDRAMA_CONFIG_PATH;
  const modulePath = require.resolve('../src/config');
  try {
    const configPath = path.join(root, 'config.yaml');
    fs.writeFileSync(configPath, JSON.stringify({ app: { name: 'isolated-fixture' }, database: { path: path.join(root, 'test.db') } }));
    process.env.LOCALMINIDRAMA_CONFIG_PATH = configPath;
    delete require.cache[modulePath];
    const { loadConfig } = require(modulePath);
    assert.equal(loadConfig().database.path, path.join(root, 'test.db'));
    fs.unlinkSync(configPath);
    assert.throws(() => loadConfig(), /Explicit LocalMiniDrama configuration does not exist/);
  } finally {
    if (before === undefined) delete process.env.LOCALMINIDRAMA_CONFIG_PATH;
    else process.env.LOCALMINIDRAMA_CONFIG_PATH = before;
    delete require.cache[modulePath];
    fs.rmSync(root, { recursive: true, force: true });
  }
});
