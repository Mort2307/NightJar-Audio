import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const functionsDir=path.join(root,'functions/src');
const functionFiles=fs.readdirSync(functionsDir).filter((name)=>name.endsWith('.ts'));
const functionSources=functionFiles.map((name)=>fs.readFileSync(path.join(functionsDir,name),'utf8'));
const functionsSource=functionSources.join('\n');
const platformDir=path.join(root,'src/platform');
const platformFiles=fs.readdirSync(platformDir).filter((name)=>name.endsWith('.ts'));

const exported=new Set(
  [...functionsSource.matchAll(/export\s+const\s+([A-Za-z0-9_]+)\s*=\s*onCall\b/g)].map((match)=>match[1]),
);
// Recognise named handlers returned by an explicitly exported callable factory.
// Both the factory's declaration and each handler's onCall declaration must exist.
for (const match of functionsSource.matchAll(/export\s+const\s*\{([^}]+)\}\s*=\s*(build[A-Za-z0-9_]+)\s*\(/g)) {
  const [, members, factory] = match;
  if (!new RegExp('export\\s+function\\s+' + factory + '\\b').test(functionsSource)) continue;
  for (const member of members.split(',')) {
    const name = member.trim();
    if (/^[A-Za-z_$][\\w$]*$/.test(name) &&
        new RegExp('const\\s+' + name + '\\s*=\\s*onCall\\s*\\(').test(functionsSource) &&
        new RegExp('return\\s*\\{[^}]*\\b' + name + '\\b').test(functionsSource)) {
      exported.add(name);
    }
  }
}

const referenced=[];
for(const file of platformFiles){
  const source=fs.readFileSync(path.join(platformDir,file),'utf8');
  for(const match of source.matchAll(/httpsCallable(?:<[^;]+?>)?\(functions,\s*['"]([^'"]+)['"]\)/gs)){
    referenced.push({file,name:match[1]});
  }
}

const missing=referenced.filter((entry)=>!exported.has(entry.name));
if(missing.length){
  console.error('FIREBASE CALLABLE CONTRACT FAILURES');
  for(const item of missing) console.error('-',item.file,'references missing callable',item.name);
  process.exit(1);
}

const requiredRoleContracts=[
  ['postReleaseComment',"requireActiveIdentity(request)"],
  ['setReleaseCommentReaction',"requireActiveIdentity(request)"],
  ['setReleaseReaction',"requireAccountRole(request, ['listener'])"],
  ['submitReleaseReview',"requireAccountRole(request, ['listener'])"],
  ['listMessageConversations',"requireCreativeMessagingIdentity(request)"],
  ['startDirectConversation',"requireCreativeMessagingIdentity(request)"],
  ['sendDirectMessage',"requireCreativeMessagingIdentity(request)"],
];

for(const [name,guard] of requiredRoleContracts){
  const start=functionsSource.indexOf('export const '+name);
  if(start<0){
    console.error('FIREBASE CALLABLE CONTRACT FAIL: required callable missing',name);
    process.exit(1);
  }
  const next=functionsSource.indexOf('\nexport const ',start+1);
  const block=functionsSource.slice(start,next<0?functionsSource.length:next);
  if(!block.includes(guard)){
    console.error('FIREBASE CALLABLE CONTRACT FAIL:',name,'is missing expected role guard:',guard);
    process.exit(1);
  }
}

console.log('Nightjar Firebase callable contracts passed:',referenced.length,'client callable references verified.');
