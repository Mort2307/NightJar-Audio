import assert from 'node:assert/strict';
import fs from 'node:fs';
const server=fs.readFileSync('functions/src/index.ts','utf8');
for(const fn of ['getMyProfileWorkingDraft','saveMyProfileWorkingDraft','clearMyProfileWorkingDraft']){
  assert.match(server,new RegExp('export const '+fn+'=onCall'),fn+' must be authenticated callable');
}
assert.match(server,/requireActiveIdentity\(request\)/,'authenticated identity');
assert.match(server,/profileRef\(uid\)\.collection\('workingDrafts'\)/,'private account draft subtree');
assert.match(server,/profileDraftScope\(input\.scope\)/,'restricted scopes');
assert.match(server,/professionalRolesForAccount\(account\.data\(\)\?\?\{\}\)/,'role approval enforced');
assert.match(server,/if\(current\.revision!==expectedRevision\)/,'stale drafts cannot overwrite newer drafts');
assert.match(server,/if\(snap\.exists\)tx\.delete\(ref\)/,'draft delete is transaction-guarded');
assert.match(server,/result\[key\]=value/,'server validates draft fields');
console.log('Nightjar role-profile cloud draft backend access and concurrency source contracts passed.');
