const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {enforce,bindProviderReferences}=require('../src/services/characterConsistencyService');
test('composition PASS cannot override missing, wrong-character or failed identity evidence',()=>{
  const look={character_id:2,version:'LOOK01'};
  for(const identity of [undefined,{status:'UNKNOWN',bound_character_id:2,look_version:'LOOK01'},{status:'PASS',bound_character_id:3,look_version:'LOOK01'},{status:'PASS',bound_character_id:2,look_version:'LOOK02'}]){
    const raw={decision:'PASS',character_consistency:identity};
    assert.equal(enforce(raw,look).decision,'BLOCKED');
    assert.equal(raw.decision,'PASS');
  }
  assert.equal(enforce({decision:'REVISE',character_consistency:{status:'PASS',bound_character_id:2,look_version:'LOOK01'}},look).decision,'REVISE');
});
test('actual provider references include the original and exclude historical generated identity images',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lmd-identity-test-'));
  try{
    const original=Buffer.from('original-fixture'),drifted=Buffer.from('drifted-fixture'),scene=Buffer.from('scene-fixture');
    const file=path.join(root,'original.png');fs.writeFileSync(file,original);
    const driftFile=path.join(root,'drifted.png');fs.writeFileSync(driftFile,drifted);
    const sceneFile=path.join(root,'scene.png');fs.writeFileSync(sceneFile,scene);
    const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
    const look={storage_root:root,original_path:file,reference_path:file,reference_mime:'image/png',reference_sha256:digest(original),excluded_hashes:[digest(drifted)],excluded_paths:[driftFile]};
    const data=b=>'data:image/png;base64,'+b.toString('base64');
    const refs=bindProviderReferences(look,[data(drifted),data(scene),data(original)]);
    assert.deepEqual(refs,[data(original),data(scene)]);
    assert.deepEqual(bindProviderReferences(look,['drifted.png','original.png','scene.png']),[data(original),'scene.png']);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
