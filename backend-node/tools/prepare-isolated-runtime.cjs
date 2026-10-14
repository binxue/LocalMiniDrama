const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const yaml = require('js-yaml');

const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const targetRoot = path.resolve(__dirname, '../..');
const sourceRoot = path.resolve(process.argv[2] || 'H:/localminidrama-clean');
const runtime = path.join(targetRoot, 'runtime');
function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
}
function snapshot(db) {
  return db.transaction(() => Object.fromEntries(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(({ name }) => {
      const rows = db.prepare('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid').all();
      return [name, { rows: rows.length, sha256: hash(JSON.stringify(rows)) }];
    })
  ))();
}
function copyTree(source, target, manifest) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Refusing linked media: ' + from);
    if (entry.isDirectory()) copyTree(from, to, manifest);
    else if (entry.isFile()) {
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
      const digest = hash(fs.readFileSync(from));
      if (hash(fs.readFileSync(to)) !== digest) throw new Error('Media copy hash mismatch');
      manifest.push({ path: path.relative(runtime, to), sha256: digest, bytes: fs.statSync(to).size });
    }
  }
}
async function main() {
  if (sourceRoot === targetRoot || fs.existsSync(runtime)) throw new Error('Runtime must be a fresh independent directory');
  const backend = path.join(sourceRoot, 'backend-node');
  const config = yaml.load(fs.readFileSync(path.join(backend, 'configs/config.yaml'), 'utf8'));
  const sourceDbPath = path.resolve(backend, config.database.path);
  const sourceStorage = path.resolve(backend, config.storage.local_path);
  const source = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    const before = snapshot(source);
    if (source.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Source DB check failed');
    fs.mkdirSync(runtime);
    const dbPath = path.join(runtime, 'drama_generator.db');
    await source.backup(dbPath);
    const copy = new Database(dbPath, { readonly: true, fileMustExist: true });
    let copied;
    try {
      copied = snapshot(copy);
      if (copy.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Snapshot DB check failed');
    } finally { copy.close(); }
    const media = [];
    copyTree(sourceStorage, path.join(runtime, 'storage'), media);
    const after = snapshot(source);
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    const same = JSON.stringify(before) === JSON.stringify(copied);
    const evidence = {
      at: new Date().toISOString(), source: sourceRoot, target: targetRoot,
      source_head: git(sourceRoot, ['rev-parse', 'HEAD']).trim(),
      source_status: git(sourceRoot, ['status', '--porcelain=v1']),
      source_tables: before, copied_tables: copied, source_unchanged_during_copy: unchanged,
      snapshot_matches_source: same, media, paid_calls: 0,
    };
    fs.writeFileSync(path.join(runtime, 'snapshot.json'), JSON.stringify(evidence, null, 2), { flag: 'wx' });
    if (!unchanged || !same) throw new Error('Concurrent source writes detected; retained snapshot requires review');
    config.database.path = dbPath;
    config.storage.local_path = path.join(runtime, 'storage');
    config.storage.base_url = 'http://127.0.0.1:5681/static';
    config.server.port = 5681;
    config.server.host = '127.0.0.1';
    config.server.cors_origins = ['http://127.0.0.1:3015'];
    config.server.insecure_tls = false;
    if (config.vendor_lock) config.vendor_lock.enabled = false;
    fs.writeFileSync(path.join(runtime, 'config.yaml'), yaml.dump(config), { flag: 'wx' });
    console.log(JSON.stringify({ runtime, tables: Object.keys(copied).length, media_files: media.length,
      source_unchanged: unchanged, snapshot_matches_source: same, paid_calls: 0 }));
  } finally { source.close(); }
}
module.exports = { snapshot, targetRoot, hash };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
