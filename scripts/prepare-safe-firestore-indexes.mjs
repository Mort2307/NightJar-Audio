#!/usr/bin/env node
// Preserve *all* deployed indexes and field overrides before adding the exact
// NightJar release indexes. The result is for the release runner only: no repo
// file or production resource is altered by this read/merge operation.
import fs from 'node:fs';
const [remotePath,manifestPath,resultPath] = process.argv.slice(2);
if (!remotePath || !manifestPath || !resultPath) throw new Error('Usage: node scripts/prepare-safe-firestore-indexes.mjs remote.json manifest.json output.json');
const raw=JSON.parse(fs.readFileSync(remotePath,'utf8'));
const remote=raw.result??raw;
const local=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
for(const [label,value] of [['remote',remote],['manifest',local]]) {
  if (!Array.isArray(value.indexes) || !Array.isArray(value.fieldOverrides))
    throw new Error('Cannot safely inspect '+label+' indexes/field overrides: no deploy');
}
const shape = index => {
  const group=index.collectionGroup??index.name?.split('/collectionGroups/')[1]?.split('/')[0];
  const scope=index.queryScope??'COLLECTION';
  if (!group || !Array.isArray(index.fields) || !scope) throw new Error('Unknown existing composite index definition');
  const fields=index.fields.filter(f=>f.fieldPath!=='__name__').map(f=> {
    const mode=f.order ?? f.arrayConfig;
    if (!f.fieldPath || typeof mode!=='string') throw new Error('Unsupported Firestore index field mode');
    return {fieldPath:f.fieldPath,...(f.order?{order:f.order}:{arrayConfig:f.arrayConfig})};
  });
  return {collectionGroup:group,queryScope:scope,fields};
};
const key=i=>JSON.stringify(shape(i));
const allIndexes=new Map();
for(const index of [...remote.indexes,...local.indexes]) allIndexes.set(key(index),shape(index));
const fieldKey=f=>{
  if (!f.collectionGroup || !f.fieldPath || !Array.isArray(f.indexes)) throw new Error('Unsupported Firestore field override');
  return f.collectionGroup+'/'+f.fieldPath;
};
// Existing field-override records may include provider metadata or a different
// set/order of legitimate query scopes. Reconcile by ADDING requested indexes
// rather than replacing the deployed scope (the previous equality check caused
// an unnecessary abort for follows/targetUserId).
const normalizeOverride=field=>{
  const k=fieldKey(field);
  if (field.ttl !== undefined && typeof field.ttl !== 'boolean')
    throw new Error('Unrecognised TTL policy for '+k+'; preserving production by blocking deploy.');
  const indexes=field.indexes.map(index=>{
    const queryScope=index.queryScope;
    if (!['COLLECTION','COLLECTION_GROUP'].includes(queryScope))
      throw new Error('Unrecognised Firestore override scope '+k);
    const hasOrder=typeof index.order==='string';
    const hasArray=typeof index.arrayConfig==='string';
    if (Number(hasOrder)+Number(hasArray)!==1)
      throw new Error('Unrecognised Firestore override index mode '+k);
    return {queryScope,...(hasOrder?{order:index.order}:{arrayConfig:index.arrayConfig})};
  });
  return {collectionGroup:field.collectionGroup,fieldPath:field.fieldPath,
    ...(field.ttl===true?{ttl:true}:{}),indexes};
};
const overrides=new Map();
for(const field of remote.fieldOverrides) overrides.set(fieldKey(field),normalizeOverride(field));
for(const field of local.fieldOverrides){
  const k=fieldKey(field),requested=normalizeOverride(field),previous=overrides.get(k);
  if (!previous){ overrides.set(k,requested); continue; }
  // Preserve every existing query-mode configuration and active TTL policy.
  // Additional local entries may be added, but existing entries never deleted.
  const indexes=new Map([...previous.indexes,...requested.indexes]
    .map(index=>[JSON.stringify(index),index]));
  overrides.set(k,{collectionGroup:previous.collectionGroup,fieldPath:previous.fieldPath,
    ...(previous.ttl===true||requested.ttl===true?{ttl:true}:{}),
    indexes:[...indexes.values()]});
}
const result={indexes:[...allIndexes.values()],fieldOverrides:[...overrides.values()]};
fs.writeFileSync(resultPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log('Safe additive Firestore index candidate prepared; existing '+remote.indexes.length+' composite indexes and '+remote.fieldOverrides.length+' overrides preserved.');
