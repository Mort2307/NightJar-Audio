// Credit UI acceptance contracts: visual affordances, guarded production
// actions and a non-simulated real-account test guide.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('src/components/VerifiedCreditWorkspace.tsx','utf8');
const css=fs.readFileSync('src/components/verified-credit-workspace.css','utf8');
const check=(text,pattern,message)=>assert.match(text,pattern,message);
for(const field of ['nj-credit-release','nj-credit-slot','nj-invite-release','nj-invite-slot','nj-invite-member-search']){
  check(ui,new RegExp('(?:id|htmlFor)="'+field+'"'),'Missing labelled picker '+field);
}
for(const text of [
  'Claim a release credit','Invite a contributor','Choose a published release',
  'Choose contributor name and role','Search their display name or @handle',
  'Have their account ID? Enter it instead','Your credit requests and invitations',
  'Review pending and historical claims','Resolve appeal with reason',
  'Approve verified credit','Revoke verified credit','Credited Listener',
  'Real-account acceptance, not a simulation.',
]) assert.ok(ui.includes(text),'Missing credit workspace feature: '+text);
for(const fn of ['verifiedCreditApi.claim','verifiedCreditApi.invite','verifiedCreditApi.invitationResponse',
  'verifiedCreditApi.uploaderResponse','verifiedCreditApi.adminDecision','verifiedCreditApi.appeal'])
  assert.ok(ui.includes(fn),'Credit actions must use account-bound production callables: '+fn);
check(ui,/inviteMemberManual\}\s*onClick=/,'Member account ID manual fallback must remain explicit');
check(ui,/\[item.claimantUserId,item.uploaderUserId\]\.includes\(currentUserId\)/,
  'Admin reviewer controls prevent self review in UI in addition to server policy');
for(const selector of [
  '.nj-verified-credits .nj-credit-card',
  '.nj-verified-credits select',
  '.nj-verified-credits .nj-credit-primary',
  '.nj-verified-credits .nj-credit-member-results',
  '.nj-verified-credits .nj-credit-claim',
  '.nj-credit-workspace-disclosure',
]) assert.ok(css.includes(selector),'Missing Midnight Gold credit layout style: '+selector);
check(css,/min-height:52px/,'Touch-friendly input height');
check(css,/prefers-reduced-motion/,'Reduced motion accommodation');
check(css,/:focus-visible/,'Keyboard focus support');
assert.ok(!ui.includes('simulationMode') && !ui.includes('mockCreditApi'),
  'Never falsely mark simulated flows as real account verification');
console.log('PASS: credit workspace selectors, independent review, clear actions, accessible styling, manual fallback and honest real-account test guide.');
