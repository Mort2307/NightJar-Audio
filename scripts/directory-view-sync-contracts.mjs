import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guard core account isolation, CAS writes, safe one-time migration and
// presentation of offline/conflict states. No live provider calls are made.
const backend = readFileSync('functions/src/index.ts', 'utf8');
const frontend = readFileSync('src/App.tsx', 'utf8');
const client = readFileSync('src/platform/firebase-directory-views.ts', 'utf8');
const workflow = readFileSync('.github/workflows/firebase-hosting-merge.yml', 'utf8');

for (const name of ['getMyDirectoryViews', 'saveMyDirectoryViews']) {
  const start = backend.indexOf('export const ' + name + ' = onCall');
  assert.ok(start > 0, name + ' must be a callable');
  const stop = backend.indexOf('export const ', start + 13);
  const scope = backend.slice(start, stop < 0 ? undefined : stop);
  assert.match(scope, /requireActiveIdentity\(request\)/);
  assert.match(scope, /requireAgeVerified\(identity\.uid\)/);
  assert.match(scope, /savedDirectoryViewsFor\(identity\.uid\)/);
  assert.match(client, new RegExp("'"+name+"'"));
}
const saveStart = backend.indexOf('export const saveMyDirectoryViews = onCall');
const saveStop = backend.indexOf('export const ', saveStart + 13);
const saveScope = backend.slice(saveStart, saveStop);
assert.match(saveScope, /db\.runTransaction\(async \(tx\) =>/);
assert.match(saveScope, /current\.revision !== expectedRevision/);
assert.match(saveScope, /tx\.set\(reference/);
assert.match(backend, /raw\.length > 8/);
assert.match(backend, /seen\.has\(id\)/);
assert.match(client, /legacyDirectoryViews/);
assert.match(frontend, /remote\.revision === 0 && legacy\.length/);
assert.match(frontend, /directoryViewsRevisionRef\.current/);
assert.match(frontend, /setDirectoryViewsSync\('conflict'\)/);
assert.match(frontend, /directoryViewsAccountRef\.current !== uid/);
assert.match(frontend, /directoryViewsSync === 'error'/);
assert.match(frontend, /Saved views sync with your Nightjar account across devices/);
assert.doesNotMatch(frontend, /Saved views stay on this signed-in account’s browser only/);
assert.match(workflow, /\[nightjar-account-sync-release\]/);
assert.match(workflow, /getMyDirectoryViews,saveMyDirectoryViews,saveMomentMark,deleteMomentMark/);
console.log('Private directory view sync, optimistic CAS and legacy migration contracts PASS');
