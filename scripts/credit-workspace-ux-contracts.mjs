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
// Off-platform invites are onboarding and claims, NOT account creation,
// professional approval, ID bypass, or a self-validating release credit.
const app=fs.readFileSync('src/App.tsx','utf8');
const account=fs.readFileSync('src/components/AccountPortal.tsx','utf8');
assert.ok(app.includes('nj-you-credit-shortcut'),'Credits must have a visible entry on main You page');
assert.ok(app.includes("setCreditWorkspaceOpen(true)") && app.includes("'/profile/credits'"),
  'Credits must open on a dedicated You subpage');
assert.ok(!app.includes('<details className="page-wrap nj-credit-workspace-disclosure"'),
  'Credit workspace must not remain embedded in profile editor');
for(const phrase of ['Contributor not on NightJar?','Copy invitation link',
  'No email is sent automatically','join as a member and claim','This link grants no role or gold moon']){
  assert.ok(ui.includes(phrase),'Missing off-platform invitation safeguards: '+phrase);
}
assert.ok(ui.includes('nightjar-audio.web.app/profile/credits?creditRelease=') &&
    ui.includes("encodeURIComponent(inviteSlotId.trim())"),'Shareable invite must contain only release and slot references');
assert.ok(!ui.includes('assignProfessionalRole') && !ui.includes('approvedProfessionalRoles:'),
  'Credit onboarding must not silently grant official creator status');
assert.ok(account.includes("destination.pathname !== '/profile/credits'") &&
  account.includes("['creditRelease','creditSlot']") &&
  account.includes('creditContinue ?? accountDestination(nextAccount)'),
  'Post sign-in invite continuation must be tightly allowlisted, not an open redirect');
assert.ok(app.includes("'/account?entry=signin'")&&app.includes('returnTo='),
  'An off-platform referral should survive normal account sign-in');
assert.ok(css.includes('.nj-you-credit-shortcut') && css.includes('.nj-credit-outside-invite'),
  'Main You launch and off-platform invite styling required');
console.log('PASS: credit workspace selectors, independent review, clear actions, accessible styling, manual fallback and honest real-account test guide.');
