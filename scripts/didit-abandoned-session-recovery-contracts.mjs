import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../functions/src/didit.ts', import.meta.url), 'utf8');
const recovery = source.slice(source.indexOf('const recoverExistingDiditSession'), source.indexOf('// Approval from a correctly configured'));

assert.match(recovery, /session_kind: 'user'[\\s\\S]*vendor_data: uid[\\s\\S]*workflow_id: DIDIT_WORKFLOW_ID\\.value\\(\\)/,
  'recovery must use exact user, account vendor_data and workflow filters');
assert.match(recovery, /item\\.session_kind === 'user' && item\\.vendor_data === uid/,
  'provider results must be independently bound to the signed-in member');
assert.match(recovery, /parsed\\.protocol === 'https:'[\\s\\S]*verify\\.didit\\.me/,
  'only HTTPS Didit-hosted continuation links may be returned');
assert.match(recovery, /status: 'Not Started,In Progress,In Review,Resubmitted,Abandoned,Expired,Declined,Approved,Kyc Expired'/,
  'lookup must detect terminal and review sessions so they cannot trigger duplicate paid creation');
assert.match(recovery, /\['Not Started', 'In Progress', 'Resubmitted'\]\.includes\(status\)/,
  'only member-actionable sessions may be resumed');
assert.match(recovery, /status === 'In Review'[\\s\\S]*status === 'Approved'[\\s\\S]*previous Didit session is /,
  'review, approved and inactive sessions must be handled without silently starting another session');
assert.match(source, /status: outcomeUncertain \\? 'CREATION_UNCERTAIN' : 'NOT_STARTED'[\\s\\S]*creationOutcomeUncertain: outcomeUncertain/,
  'ambiguous provider outcomes must remain durably marked uncertain');
assert.match(source, /const recovered = await recoverExistingDiditSession\\(uid\\);[\\s\\S]*if \\(recovered\\) return recovered;/,
  'existing provider sessions must be recovered before any new create claim');
assert.match(source, /if \\(existing\\.creationOutcomeUncertain === true[\\s\\S]*No new verification was started/,
  'unresolved ambiguous attempts must fail closed instead of creating another session');

console.log('Didit abandoned-session recovery contracts passed.');
