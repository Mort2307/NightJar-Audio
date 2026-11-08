import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../functions/src/didit.ts', import.meta.url), 'utf8');
const recovery = source.slice(source.indexOf('const recoverExistingDiditSession'), source.indexOf('// Approval from a correctly configured'));

for (const fragment of [
  "session_kind: 'user'",
  "vendor_data: uid",
  "workflow_id: DIDIT_WORKFLOW_ID.value()",
  "Deliberately omit status: inspect every lifecycle state returned for this account.",
  'if (payload.next)',
  "'Awaiting User'",
  "parsedUrl.protocol !== 'https:'",
  "item.session_kind === 'user' && item.vendor_data === uid",
  "['Not Started', 'In Progress', 'Resubmitted', 'Awaiting User'].includes(status)",
  "status === 'In Review'",
  "status === 'Approved'",
  "previous Didit session is ",
]) assert.ok(recovery.includes(fragment), 'Missing recovery contract: ' + fragment);

assert.ok(source.includes("status: outcomeUncertain ? 'CREATION_UNCERTAIN' : 'NOT_STARTED'"));
assert.ok(source.includes('const recovered = await recoverExistingDiditSession(uid);'));
assert.ok(source.includes('if (recovered) return recovered;'));
assert.ok(source.includes('No new verification was started'));

console.log('Didit abandoned-session recovery contracts passed.');
