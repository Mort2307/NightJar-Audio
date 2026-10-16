import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend=fs.readFileSync('functions/src/index.ts','utf8');
const client=fs.readFileSync('src/platform/firebase-didit-reuse.ts','utf8');
const member=fs.readFileSync('src/components/DiditExistingCheckRequest.tsx','utf8');
const owner=fs.readFileSync('src/components/AdminDiditReuseRequests.tsx','utf8');
const admin=fs.readFileSync('src/components/AdminDiditControlCentre.tsx','utf8');
const settings=fs.readFileSync('src/components/NightjarSettings.tsx','utf8');
const block=backend.slice(backend.indexOf('// Existing Didit KYC reuse coordination'),backend.indexOf('// One-off owner recovery'));
assert.ok(block.startsWith('// Existing Didit KYC reuse coordination'),'all re-use callables exist in an isolated backend section');
assert.match(block,/const diditReuseRef = \(uid: string\) => db.collection\('diditReuseRequests'\).doc\(uid\)/,'one request per authenticated account');
assert.match(block,/export const myDiditReuseRequest/,'member can query own enquiry');
assert.match(block,/export const requestDiditReuse/,'member can submit without a provider check');
assert.match(block,/export const withdrawDiditReuseRequest/,'member can withdraw consent');
assert.match(block,/export const adminListDiditReuseRequests/,'admin has follow-up queue');
assert.match(block,/export const adminReviewDiditReuseRequest/,'owner can triage requests safely');
assert.match(block,/requireActiveIdentity\(request\)/,'member identity is authenticated');
assert.match(block,/requireAdminIdentity\(request\)/,'owner listing and reviews are permission checked');
assert.match(block,/input.consent !== true \|\| input.previousCheck !== 'standalone'/,'explicit member consent is required');
assert.match(block,/DIDIT_VERIFICATION_PAUSED/,'requests are limited to ongoing maintenance');
assert.match(block,/maskSecurityEmail\(identity.email\)/,'admin queue does not expose full email unnecessarily');
assert.match(block,/db.runTransaction/,'duplicate requests are handled transactionally');
assert.match(block,/\['requested','investigating','waiting_for_member','approved_for_reuse'\]/,'requests are deduplicated including approved reuse requests');
assert.match(block,/memberConsent: false/,'member withdrawal revokes request consent');
assert.doesNotMatch(block,/startDiditSession\(|diditPass\(.*\)\s*\?\s*true|verified:\s*true|\.collection\('ageAssurance'\).doc\([^)]*\).set\(/,
  'support enquiries must never initiate a paid provider check or manufacture verification');
assert.doesNotMatch(block,/tx.set\(ageRef|status:\s*'COMPLETE'|DIDIT_API_KEY\.value\(\)/,
  'admin review cannot write age assurance or fetch provider PII');
assert.match(client,/myDiditReuseRequest/,'member state callable is typed');
assert.match(client,/adminListDiditReuseRequests/,'owner queue callable is typed');
assert.match(member,/I already completed a Didit check/,'user claims history and consents explicitly');
assert.match(member,/does not itself verify your identity/,'member cannot confuse support request with an approval');
assert.match(member,/Withdraw request/,'member may cancel consent');
assert.match(settings,/!administrator && !simulationMode && <details[^\n]*<DiditExistingCheckRequest/,'member settings exposes workflow outside simulation');
assert.match(admin,/<AdminDiditReuseRequests/,'queue is linked from Didit control centre');
assert.match(owner,/not<\/strong> an identity verification/i,'owner queue clearly distinguishes process from verification');
assert.match(owner,/No identity verification or Didit session was created/,'triage feedback guarantees no verification change');

assert.match(block, /type DiditReuseState = 'requested' \| 'investigating' \| 'waiting_for_member' \| 'approved_for_reuse' \| 'closed'/,
  'approval is a distinct support-request state, never a verified adult status');
assert.match(block,/reuseRequestApprovedAt: FieldValue.serverTimestamp\(\)/,
  'admin approvals record an auditable timestamp');
assert.match(block,/reuseRequestApprovedBy: identity.uid/,
  'admin approvals record the responsible verified administrator');
assert.match(block,/This enquiry is closed. The member must submit a fresh consented request/,
  'closed or withdrawn cases cannot be reopened without consent');
assert.match(block,/An active member-consented reuse request is required/,
  'member consent is required for approval');
assert.match(block,/Your account is NOT yet verified 18\+/,
  'member must not mistake a support approval for ID verification');
assert.match(owner,/Approve reuse request/,
  'administrator has a visible, explicit approval button');
assert.match(owner,/acknowledged\[uid\]/,
  'approval requires an explicit review acknowledgement');
assert.match(owner,/status==='approved_for_reuse' && !acknowledged\[uid\]/,
  'admin cannot submit approval unless they acknowledged the distinction');
assert.match(owner,/Member confirmation required/,
  'ambiguous awaiting-member terminology is explained');
assert.match(owner,/What do the review statuses mean/,
  'statuses have visible explanations');
assert.match(owner,/It does not verify the member/i,
  'approval does not grant age assurance');
assert.match(member,/Reuse request approved · not yet verified 18\+/,
  'member gets accurate state after admin approval');
assert.match(member,/Administrator approval means the request can proceed, not that you are verified/,
  'member cannot confuse review decision with provider approval');
assert.doesNotMatch(block,/tx\.set\(ageRef|status:\s*'COMPLETE'|verified:\s*true|startDiditSession\(/,
  'approval may never mark an account age-verified or start a paid provider session');
assert.match(backend,/const DIDIT_VERIFICATION_PAUSED = false/,'standard mandatory Didit verification is enabled; historic reuse enquiries cannot grant a pass');
console.log('Nightjar Didit existing-KYC member consent, triage and no-paid-session security contracts PASS.');
