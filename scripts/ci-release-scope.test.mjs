import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyRelease, requiresBackendAudit } from './ci-release-scope.mjs';

test('safe browser-only Didit navigation and matching documentation',()=>{
 assert.deepEqual(classifyRelease(['src/App.tsx','src/components/DiditControlledLiveCheck.tsx','scripts/didit-mandatory-gate-contracts.mjs']),{backendChanged:false,changedCount:3});
});
test('backend, package, rules and rewrite changes always require audit',()=>{
 for(const filename of ['functions/src/index.ts','functions/package-lock.json','functions/package.json','functions/scripts/check.mjs','firebase.json','firestore.rules','storage.rules','firestore.indexes.json','.firebaserc'])
  assert.equal(requiresBackendAudit([filename]),true,filename);
});
test('unverifiable release scope fails closed',()=>{
 for(const invalid of [[], [''], ['src/App.tsx',null],null])assert.throws(()=>classifyRelease(invalid));
});
test('audit is preserved in every backend-changing pipeline and monitored independently',()=>{
 const validation=readFileSync('.github/workflows/validate.yml','utf8');
 const preflight=readFileSync('.github/workflows/nightjar-pr-preflight.yml','utf8');
 const monitor=readFileSync('.github/workflows/functions-dependency-security.yml','utf8');
 assert.match(validation,/Audit Firebase Functions production dependencies[\s\S]*?if: steps\.scope\.outputs\.backend_changed == 'true'[\s\S]*?npm run audit:guard/);
 assert.match(preflight,/Run npm run audit:guard[\s\S]*?if: steps\.scope\.outputs\.backend_changed == 'true'[\s\S]*?npm run audit:guard/);
 assert.match(monitor,/schedule:/);
 assert.match(monitor,/npm run audit:guard/);
});
