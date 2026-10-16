import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const base=mkdtempSync(join(tmpdir(),'nightjar-index-guard-'));
try {
  const planned={indexes:[{collectionGroup:'verifiedCreditClaims',queryScope:'COLLECTION',fields:[
    {fieldPath:'claimantUserId',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'}]}]};
  const manifest=join(base,'tracked.json'),remote=join(base,'remote.json');
  writeFileSync(manifest,JSON.stringify(planned));
  const run=value=>{
    writeFileSync(remote,JSON.stringify(value));
    return spawnSync(process.execPath,['scripts/firestore-index-preservation-guard.mjs',remote,manifest],{encoding:'utf8'});
  };
  assert.equal(run({result:{indexes:[{name:'projects/p/databases/(default)/collectionGroups/verifiedCreditClaims/indexes/a',queryScope:'COLLECTION',fields:[
    {fieldPath:'claimantUserId',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'},
    {fieldPath:'__name__',order:'DESCENDING'}]}]}}).status,0,'managed indexes are preserved');
  assert.notEqual(run({result:{indexes:[{collectionGroup:'unmanagedLegacy',queryScope:'COLLECTION',fields:[{fieldPath:'x',order:'ASCENDING'}]}]}}).status,0,'unmanaged production index must block deployment');
  assert.notEqual(run({result:{unexpected:true}}).status,0,'unparseable remote metadata must block deployment');
  console.log('NightJar production Firestore index preservation guard PASS: managed, unmanaged and malformed cases.');
} finally {
  rmSync(base,{recursive:true,force:true});
}
