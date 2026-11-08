import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../functions/src/didit.ts', import.meta.url), 'utf8');

assert.match(source, /const recoverExistingDiditSession = async \(uid: string\)/,
  'provider-side recovery helper must exist');
assert.match(source, /session_kind: 'user'[\s\S]*vendor_data: uid[\s\S]*workflow_id: DIDIT_WORKFLOW_ID\.value\(\)/,
  'recovery must use exact user, account vendor_data and workflow filters');
assert.match(source, /item\.session_kind === 'user' && item\.vendor_data === uid/,
  'provider results must be independently bound to the signed-in member');
assert.match(source, /text\(item\.session_url, 2048\)/,
  'recovery must restore the provider-hosted continuation URL');
assert.match(source, /status: 'CREATION_UNCERTAIN'[\s\S]*creationOutcomeUncertain: outcomeUncertain/,
  'ambiguous provider outcomes must remain durably marked uncertain');
assert.match(source, /const recovered = await recoverExistingDiditSession\(uid\);[\s\S]*if \(recovered\) return recovered;/,
  'existing provider sessions must be recovered before any new create claim');
assert.match(source, /if \(existing\.creationOutcomeUncertain === true[\s\S]*No new verification was started/,
  'unresolved ambiguous attempts must fail closed instead of creating another session');
assert.doesNotMatch(source, /status: 'NOT_STARTED', creatingSinceMs: 0, updatedAt: FieldValue\.serverTimestamp\(\),\s*\}, \{ merge: true \}\);\s*\}\);\s*\/\/ Safe diagnostics/,
  'ambiguous provider failures must not be reset to a fresh-start state');

console.log('Didit abandoned-session recovery contracts passed.');
