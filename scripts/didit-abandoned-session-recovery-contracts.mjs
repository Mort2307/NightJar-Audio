import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../functions/src/didit.ts', import.meta.url), 'utf8');
const recovery = source.slice(source.indexOf('const recoverExistingDiditSession'), source.indexOf('// Approval from a correctly configured'));

for (const fragment of [
  "session_kind: 'user'",
  "vendor_data: uid",
  "workflow_id: DIDIT_WORKFLOW_ID.value()",
  "status: 'Not Started,In Progress,In Review,Resubmitted,Abandoned,Expired,Declined,Approved,Kyc Expired'",
  'if (payload.next)',
  "parsedUrl.protocol !== 'https:'",
  "item.session_kind === 'user' && item.vendor_data === uid",
  "parsed.protocol === 'https:'",
  "['Not Started', 'In Progress', 'Resubmitted'].includes(status)",
  "status === 'In Review'",
  "status === 'Approved'",
  "previous Didit session is ",
]) assert.ok(recovery.includes(fragment), 'Missing recovery contract: ' + fragment);

assert.ok(source.includes("status: outcomeUncertain ? 'CREATION_UNCERTAIN' : 'NOT_STARTED'"));
assert.ok(source.includes('const recovered = await recoverExistingDiditSession(uid);'));
assert.ok(source.includes('if (recovered) return recovered;'));
assert.ok(source.includes('No new verification was started'));

console.log('Didit abandoned-session recovery contracts passed.');
