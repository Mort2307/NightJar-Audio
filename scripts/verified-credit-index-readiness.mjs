#!/usr/bin/env node
// Read-only check using gcloud's Firestore REST-derived full index metadata.
// Until ALL newly declared composite indexes are READY, code depending on them
// must not be made available through Cloud Functions or Hosting.
import fs from 'node:fs';
const [statesPath,manifestPath]=process.argv.slice(2);
if(!statesPath||!manifestPath) throw new Error('Usage: node scripts/verified-credit-index-readiness.mjs states.json manifest.json');
const states=JSON.parse(fs.readFileSync(statesPath,'utf8'));
const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
if(!Array.isArray(states)||!Array.isArray(manifest.indexes))throw new Error('Unrecognized production Firestore index state output.');
const key=(index)=>{
  const group=index.collectionGroup??index.name?.split('/collectionGroups/')[1]?.split('/')[0];
  if(!group||!index.queryScope||!Array.isArray(index.fields))throw new Error('Unrecognized Firestore index specification.');
  return [group,index.queryScope,...index.fields.filter(f=>f.fieldPath!=='__name__').map(f=>{
    if(!f.fieldPath||!f.order&&!f.arrayConfig)throw new Error('Unknown Firestore index field type.');
    return f.fieldPath+':'+(f.order??f.arrayConfig);
  })].join('|');
};
const actual=new Map(states.map(index=>[key(index),index.state]));
let pending=[];
for(const expected of manifest.indexes.filter(i=>i.collectionGroup==='verifiedCreditClaims')){
  const state=actual.get(key(expected));
  if(state!=='READY')pending.push({index:key(expected),state:state??'MISSING'});
}
if(pending.length) {
  console.error('BLOCKED: Firestore indexes not ready: '+JSON.stringify(pending));
  process.exit(2);
}
console.log('PASS: all verified-credit composite indexes are READY in Firestore.');
