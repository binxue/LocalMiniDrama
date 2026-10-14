const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');
const Database = require('better-sqlite3');
const runtime = path.resolve(__dirname, '../../runtime');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const root = path.join(runtime, 'reference-transfer');
  if (fs.existsSync(root)) throw new Error('Transfer package already exists; reuse it');
  const db = new Database(path.join(runtime, 'drama_generator.db'), {readonly:true,fileMustExist:true});
  let character;
  try { character = db.prepare('SELECT id,name,local_path FROM characters WHERE id=2').get(); }
  finally { db.close(); }
  const source = path.resolve(runtime, 'storage', character.local_path);
  if (!source.startsWith(path.join(runtime,'storage')+path.sep)) throw new Error('Invalid reference location');
  const bytes = fs.readFileSync(source), before = sha256(bytes);
  const original = await sharp(bytes).metadata();
  const converted = await sharp(bytes).jpeg({quality:85,chromaSubsampling:'4:4:4'}).toBuffer();
  const metadata = await sharp(converted).metadata();
  if (metadata.width!==original.width || metadata.height!==original.height) throw new Error('Reference dimensions changed');
  fs.mkdirSync(root);
  const target = path.join(root,'lixia-original-identity-transfer.jpg');
  fs.writeFileSync(target,converted,{flag:'wx'});
  const manifest = {character_id:character.id,source,source_sha256:before,source_bytes:bytes.length,
    target,target_sha256:sha256(converted),target_bytes:converted.length,width:metadata.width,height:metadata.height,
    transform:'PNG to JPEG quality 85, 4:4:4; no crop, resize, retouch, redraw or generation',
    original_unchanged:sha256(fs.readFileSync(source))===before,remote_file_id:null,upload_status:'NOT_SUBMITTED'};
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  console.log(JSON.stringify(manifest));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
