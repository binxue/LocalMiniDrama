const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const service = require('../src/services/scriptAssistantService');

test('script assistant builds a source-traceable bounded input and separates approval state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localminidrama-assistant-'));
  const script = path.join(dir, 'ep1.md');
  fs.writeFileSync(script, '# 第一集 v3\n右掌浅擦伤，黄色布标。\nCONDITIONAL PASS，非Canon。');
  const manifest = { works: [{ id: 'rainforest', title: '雨林', sources: [{ id: 'ep1', title: '第一集', kind: 'script', path: script, sha256: require('crypto').createHash('sha256').update(fs.readFileSync(script)).digest('hex') }] }] };
  const config = { script_assistant: { manifest_path: path.join(dir, 'sources.json') } };
  fs.writeFileSync(config.script_assistant.manifest_path, JSON.stringify(manifest));
  const work = service.loadWork(config, 'rainforest');
  const built = service.buildInput(work, [], '第一集和第三集之间有哪些连续性问题？');
  assert.match(built.input, /\[S:ep1:L1-3\]/);
  assert.ok(built.context.input_chars < 8000);
  assert.equal(service.summary(work).scripts[0].review_status, 'UNKNOWN');
  assert.equal(service.summary(work).scripts[0].canon, 'not_established');
});

test('script assistant rejects an unverified source hash', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'localminidrama-assistant-'));
  const script = path.join(dir, 'ep1.md'); fs.writeFileSync(script, 'source');
  const manifestPath = path.join(dir, 'sources.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ works: [{ id: 'w', title: 'W', sources: [{ id: 's', title: 'S', kind: 'script', path: script, sha256: 'bad' }] }] }));
  const work = service.loadWork({ script_assistant: { manifest_path: manifestPath } }, 'w');
  assert.equal(work.sources[0].available, false);
  assert.match(work.sources[0].error, /哈希/);
});
