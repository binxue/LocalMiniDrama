const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const Database = require('better-sqlite3');
const { snapshot, targetRoot, hash } = require('./prepare-isolated-runtime.cjs');
const runtime = path.join(targetRoot, 'runtime');
const evidence = JSON.parse(fs.readFileSync(path.join(runtime, 'snapshot.json'), 'utf8'));
const sourceDb = new Database(path.join(evidence.source, 'backend-node/data/drama_generator.db'), { readonly: true, fileMustExist: true });
try {
  const current = snapshot(sourceDb);
  const status = execFileSync('git', ['-C', evidence.source, 'status', '--porcelain=v1'], { encoding: 'utf8', windowsHide: true });
  const unchangedMedia = evidence.media.every(file => {
    const relative = path.relative(path.join(runtime, 'storage'), path.join(runtime, file.path));
    return hash(fs.readFileSync(path.join(evidence.source, 'backend-node/data/storage', relative))) === file.sha256;
  });
  const result = { at: new Date().toISOString(), source_tables_equal: JSON.stringify(current) === JSON.stringify(evidence.source_tables),
    source_git_status_equal: status === evidence.source_status, source_media_equal: unchangedMedia,
    source_quick_check: sourceDb.pragma('quick_check', { simple: true }) };
  fs.writeFileSync(path.join(runtime, 'source-preservation-final.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.source_tables_equal || !result.source_git_status_equal || !result.source_media_equal || result.source_quick_check !== 'ok') process.exitCode = 1;
} finally { sourceDb.close(); }
