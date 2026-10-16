// Production read-only safety check. Existing indexes not represented in the
// tracked manifest MUST NOT be deleted by Firebase's index reconciliation.
// Fail closed if CLI output cannot be inspected reliably.
import fs from 'node:fs';
const [remotePath,manifestPath] = process.argv.slice(2);
if (!remotePath || !manifestPath) throw new Error('Usage: node scripts/firestore-index-preservation-guard.mjs <remote.json> <manifest.json>');
const raw=JSON.parse(fs.readFileSync(remotePath,'utf8'));
const remote=raw?.result ?? raw;
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if (!Array.isArray(remote?.indexes) || !Array.isArray(manifest?.indexes)) {
  throw new Error('Cannot safely interpret current Firestore indexes; no index deployment permitted.');
}
const normalize=(index)=>{
  const scope=String(index.queryScope ?? index.query_scope ?? 'COLLECTION').toUpperCase();
  const group=String(index.collectionGroup ?? index.collection_group ?? index.name?.split('/collectionGroups/')[1]?.split('/')[0] ?? '');
  if (!group) throw new Error('Unknown existing Firestore index collection group.');
  const fields=(index.fields ?? []).filter(field=>field.fieldPath !== '__name__').map(field=>{
    const path=field.fieldPath ?? field.field_path;
    const mode=field.order ?? field.arrayConfig ?? field.array_config ?? field.vectorConfig ?? field.vector_config;
    if (!path || !mode || typeof mode !== 'string') throw new Error('Unknown existing index field configuration for '+group);
    return path+':'+mode.toUpperCase();
  });
  return group+'/'+scope+'/'+fields.join(',');
};
const planned=new Set(manifest.indexes.map(normalize));
const unmanaged=remote.indexes.map(normalize).filter(key=>!planned.has(key));
if (unmanaged.length) {
  console.error('BLOCKED: production has '+unmanaged.length+' existing unmanaged Firestore composite index(es).');
  console.error('Import/reconcile existing indexes into firestore.indexes.json before any production index deployment.');
  process.exit(1);
}
console.log('PASS: all existing production composite indexes are represented in the release manifest; no unmanaged deletion.');
