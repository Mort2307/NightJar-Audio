import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const base=mkdtempSync(join(tmpdir(),'nightjar-index-guard-'));
try {
  const planned={fieldOverrides:[{collectionGroup:'signInActivity',fieldPath:'retentionUntil',ttl:true,indexes:[]}],indexes:[{collectionGroup:'verifiedCreditClaims',queryScope:'COLLECTION',fields:[
    {fieldPath:'claimantUserId',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'}]}]};
  const manifest=join(base,'tracked.json'),remote=join(base,'remote.json');
  writeFileSync(manifest,JSON.stringify(planned));
  const run=value=>{
    writeFileSync(remote,JSON.stringify(value));
    return spawnSync(process.execPath,['scripts/firestore-index-preservation-guard.mjs',remote,manifest],{encoding:'utf8'});
  };
  assert.equal(run({result:{fieldOverrides:[{collectionGroup:'signInActivity',fieldPath:'retentionUntil',ttl:true,indexes:[]}],indexes:[{name:'projects/p/databases/(default)/collectionGroups/verifiedCreditClaims/indexes/a',queryScope:'COLLECTION',fields:[
    {fieldPath:'claimantUserId',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'},
    {fieldPath:'__name__',order:'DESCENDING'}]}]}}).status,0,'managed indexes are preserved');
  assert.notEqual(run({result:{fieldOverrides:[{collectionGroup:'signInActivity',fieldPath:'retentionUntil',ttl:true,indexes:[]}],indexes:[{collectionGroup:'unmanagedLegacy',queryScope:'COLLECTION',fields:[{fieldPath:'x',order:'ASCENDING'}]}]}}).status,0,'unmanaged production index must block deployment');
  assert.notEqual(run({result:{indexes:[],fieldOverrides:[{collectionGroup:'unknownTTL',fieldPath:'policy',ttl:true,indexes:[]}]}}).status,0,
    'unmanaged TTL policy must block index deployment');
  assert.notEqual(run({result:{unexpected:true}}).status,0,'unparseable remote metadata must block deployment');
  const merged=join(base,'safe-indexes.json');
  const remoteValue={result:{fieldOverrides:[
    {collectionGroup:'signInActivity',fieldPath:'retentionUntil',ttl:true,indexes:[]},
    {collectionGroup:'existingPrivate',fieldPath:'expireOn',ttl:true,indexes:[]},
  ],indexes:[{collectionGroup:'existingPrivate',queryScope:'COLLECTION',fields:[
    {fieldPath:'accountId',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'}]}]}};
  writeFileSync(remote,JSON.stringify(remoteValue));
  const prepared=spawnSync(process.execPath,['scripts/prepare-safe-firestore-indexes.mjs',remote,manifest,merged],{encoding:'utf8'});
  assert.equal(prepared.status,0,'Additive index preparation should succeed without deleting live configurations: '+prepared.stderr);
  const union=JSON.parse((await import('node:fs')).readFileSync(merged,'utf8'));
  assert.equal(union.indexes.length,2,'Must retain production indexes and add requested credit indexes');
  assert.equal(union.fieldOverrides.length,2,'Must retain production TTL policies');
  assert.equal(spawnSync(process.execPath,['scripts/firestore-index-preservation-guard.mjs',remote,merged],{encoding:'utf8'}).status,0,
    'Read-only preservation guard should accept safe union');

  // Regression from the real production block: a deployed follows override
  // differs from the tracked manifest. The release must preserve its existing
  // index + TTL while safely ADDING the requested query scope.
  const overlapManifest=join(base,'overlap-manifest.json');
  const overlapRemote=join(base,'overlap-remote.json');
  const overlapResult=join(base,'overlap-union.json');
  writeFileSync(overlapManifest,JSON.stringify({indexes:[],fieldOverrides:[{
    collectionGroup:'follows',fieldPath:'targetUserId',
    indexes:[{queryScope:'COLLECTION_GROUP',order:'ASCENDING'}],
  }]}));
  writeFileSync(overlapRemote,JSON.stringify({result:{indexes:[],fieldOverrides:[{
    collectionGroup:'follows',fieldPath:'targetUserId',ttl:true,
    indexes:[{queryScope:'COLLECTION',order:'DESCENDING'}],
  }]}}));
  const overlap=spawnSync(process.execPath,
    ['scripts/prepare-safe-firestore-indexes.mjs',overlapRemote,overlapManifest,overlapResult],{encoding:'utf8'});
  assert.equal(overlap.status,0,
    'Different existing production follows override must be retained, not block safe additive release: '+overlap.stderr);
  const overlapUnion=JSON.parse((await import('node:fs')).readFileSync(overlapResult,'utf8'));
  assert.equal(overlapUnion.fieldOverrides.length,1);
  assert.equal(overlapUnion.fieldOverrides[0].ttl,true,'Existing TTL stays enabled');
  assert.deepEqual(overlapUnion.fieldOverrides[0].indexes,[
    {queryScope:'COLLECTION',order:'DESCENDING'},
    {queryScope:'COLLECTION_GROUP',order:'ASCENDING'},
  ],'Existing scope retained and new scope added');
  assert.equal(spawnSync(process.execPath,
    ['scripts/firestore-index-preservation-guard.mjs',overlapRemote,overlapResult],{encoding:'utf8'}).status,0,
    'Final additive candidate must pass production preservation guard');
  const unknownTtl=join(base,'unknown-ttl.json');
  writeFileSync(unknownTtl,JSON.stringify({result:{indexes:[],fieldOverrides:[{
    collectionGroup:'follows',fieldPath:'targetUserId',ttl:{unexpected:'yes'},indexes:[],
  }]}}));
  assert.notEqual(spawnSync(process.execPath,
    ['scripts/prepare-safe-firestore-indexes.mjs',unknownTtl,overlapManifest,join(base,'unsafe-indexes.json')],
    {encoding:'utf8'}).status,0,'Unrecognised production TTL schema must fail closed');

  const states=join(base,'states.json');
  const credit={name:'projects/p/databases/(default)/collectionGroups/verifiedCreditClaims/indexes/one',
    queryScope:'COLLECTION',fields:[
      {fieldPath:'claimantUserId',order:'ASCENDING'},{fieldPath:'createdAt',order:'DESCENDING'},
      {fieldPath:'__name__',order:'DESCENDING'}],state:'CREATING'};
  const readystate=()=>spawnSync(process.execPath,['scripts/verified-credit-index-readiness.mjs',states,manifest],{encoding:'utf8'});
  writeFileSync(states,JSON.stringify([credit]));
  assert.notEqual(readystate().status,0,'A building index cannot enable production credit queries');
  credit.state='READY';
  writeFileSync(states,JSON.stringify([credit]));
  assert.equal(readystate().status,0,'A fully built index may enable release');
  writeFileSync(states,JSON.stringify([]));
  assert.notEqual(readystate().status,0,'Missing indexes must block deployment');
    console.log('NightJar production Firestore index preservation guard PASS: managed, unmanaged and malformed cases.');
} finally {
  rmSync(base,{recursive:true,force:true});
}
