import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const platformDir=path.join(root,'src','platform');
const functionsSource=fs.readFileSync(path.join(root,'functions','src','index.ts'),'utf8');
const exported=new Set([...functionsSource.matchAll(/export const ([A-Za-z0-9_]+)\s*=/g)].map((match)=>match[1]));

const callableNames=[];
for(const name of fs.readdirSync(platformDir)){
  if(!name.endsWith('.ts')) continue;
  const source=fs.readFileSync(path.join(platformDir,name),'utf8');
  for(const match of source.matchAll(/\(functions,\s*['"]([A-Za-z0-9_]+)['"]\)/g)){
    callableNames.push({file:'src/platform/'+name,name:match[1]});
  }
}

const duplicates=[...functionsSource.matchAll(/export const ([A-Za-z0-9_]+)\s*=/g)]
  .map((match)=>match[1])
  .reduce((map,name)=>map.set(name,(map.get(name)??0)+1),new Map());
const duplicateExports=[...duplicates.entries()].filter(([,count])=>count>1);
const missing=callableNames.filter((item)=>!exported.has(item.name));

const required=[
  'releaseReactionState','releaseCommunity','setReleaseReaction','postReleaseComment','deleteOwnReleaseComment','reportReleaseComment',
  'listMessageConversations','startDirectConversation','listDirectMessages','sendDirectMessage',
  'setDirectMessageBlock','reportDirectMessage','adminListCommunityReports','adminResolveCommunityReport',
];
const absentRequired=required.filter((name)=>!exported.has(name));

if(missing.length || duplicateExports.length || absentRequired.length){
  console.error('FIREBASE CONTRACT FAILURES');
  for(const item of missing) console.error('-',item.file,'references missing callable',item.name);
  for(const [name,count] of duplicateExports) console.error('- duplicate Firebase export',name,'x'+count);
  for(const name of absentRequired) console.error('- required Nightjar callable missing:',name);
  process.exit(1);
}

console.log('Nightjar Firebase callable contracts passed:',callableNames.length,'client callables checked.');
