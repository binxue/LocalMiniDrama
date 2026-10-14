const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const LOOK_VERSION = 'LOOK01';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function localFile(root, value) {
  if (!value || /^https?:|^data:/i.test(String(value))) return null;
  const file = path.resolve(root, String(value).replace(/^\/+/, ''));
  if (!file.startsWith(path.resolve(root) + path.sep)) throw new Error('Character reference is outside storage');
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}
function getLookPackage(db, storyboardId, storageRoot) {
  const shot = db.prepare('SELECT s.characters,e.drama_id FROM storyboards s JOIN episodes e ON e.id=s.episode_id WHERE s.id=? AND s.deleted_at IS NULL').get(Number(storyboardId));
  if (!shot || Number(shot.drama_id) !== 2) return null;
  let ids;
  try { ids = JSON.parse(shot.characters || '[]').map(Number); } catch (_) { throw new Error('Invalid character binding'); }
  if (!ids.includes(2)) return null;
  const character = db.prepare('SELECT id,name,appearance,description,local_path,ref_image,extra_images FROM characters WHERE id=2 AND drama_id=2 AND deleted_at IS NULL').get();
  if (!character) throw new Error('Bound original character is missing');
  const original = localFile(storageRoot, character.local_path || character.ref_image);
  if (!original) throw new Error('Original LOOK01 identity reference is missing');
  const sourceHash = hash(fs.readFileSync(original));
  let reference = original;
  const transferManifest = process.env.LOCALMINIDRAMA_IDENTITY_TRANSFER_MANIFEST;
  if (transferManifest) {
    const transfer = JSON.parse(fs.readFileSync(transferManifest, 'utf8'));
    if (transfer.source_sha256 !== sourceHash || hash(fs.readFileSync(transfer.target)) !== transfer.target_sha256) throw new Error('Identity transfer no longer matches original');
    reference = transfer.target;
  }
  let extras = [];
  try { extras = JSON.parse(character.extra_images || '[]'); } catch (_) {}
  const excludedPaths = extras.map(value => localFile(storageRoot, value)).filter(Boolean);
  const excludedHashes = excludedPaths.map(file => hash(fs.readFileSync(file)));
  return { character_id: character.id, name: character.name, version: LOOK_VERSION, appearance: character.appearance,
    description: character.description, original_path: original, source_sha256: sourceHash, reference_path: reference,
    reference_sha256: hash(fs.readFileSync(reference)), reference_mime: /\.png$/i.test(reference) ? 'image/png' : 'image/jpeg',
    storage_root:storageRoot, excluded_hashes: excludedHashes, excluded_paths:excludedPaths };
}
function bindProviderReferences(look, references) {
  if (!look) return references;
  const approved = 'data:' + look.reference_mime + ';base64,' + fs.readFileSync(look.reference_path).toString('base64');
  const filtered = (references || []).filter(value => {
    if (look.storage_root && !/^https?:|^data:/i.test(String(value))) {
      const file = localFile(look.storage_root, value);
      if (file && (file === look.original_path || file === look.reference_path || look.excluded_paths.includes(file))) return false;
    }
    const match = String(value).match(/^data:[^;]+;base64,(.*)$/s);
    if (!match) return true;
    const digest = hash(Buffer.from(match[1], 'base64'));
    return digest !== look.reference_sha256 && digest !== look.source_sha256 && !look.excluded_hashes.includes(digest);
  });
  return [approved, ...filtered].slice(0, 10);
}
function publicLook(look) {
  return look ? { character_id:look.character_id,name:look.name,version:look.version,appearance:look.appearance,
    description:look.description,source_sha256:look.source_sha256,reference_sha256:look.reference_sha256,
    rule:'Identity and body proportions follow the original reference; neutral reference clothing does not replace LOOK01. Historical generated character images are not identity references.' } : null;
}
function enforce(result, look) {
  if (!look) return result;
  const identity = result?.character_consistency;
  if (!identity || identity.status !== 'PASS' || Number(identity.bound_character_id) !== look.character_id || identity.look_version !== look.version) {
    return { ...result, decision:'BLOCKED', character_consistency:identity || {status:'UNKNOWN',bound_character_id:look.character_id,look_version:look.version},
      identity_gate:'NOT_PASSED' };
  }
  return result;
}
function instruction(look) {
  return look ? 'The first attached image is the ORIGINAL Lixia identity reference. Verify identity/body/hair against it before composition. Costume follows LOOK01: '+look.appearance+'. Neutral reference clothing is not the scene costume. Return character_consistency:{status:PASS|REVISE|UNKNOWN,bound_character_id:2,look_version:LOOK01,issues:[]}. Missing or ambiguous identity evidence cannot PASS.' : '';
}
module.exports = {getLookPackage,bindProviderReferences,publicLook,enforce,instruction};
