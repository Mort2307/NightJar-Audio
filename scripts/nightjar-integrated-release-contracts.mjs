import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// This guards against a deceptively green integration that accidentally
// replaced an entire branch's edits with a different version of the same file.
const read=(path)=>readFileSync(path);
const string=(path)=>read(path).toString('utf8');
const manifest=JSON.parse(string('docs/NIGHTJAR_INTEGRATED_RC_MANIFEST.json'));
const sourcePrs=[293,294,296,297,298,299];
assert.deepEqual(manifest.includes.map(p=>p.pr),sourcePrs,'the candidate contains every reviewed source batch');
// Explicit, SHA-pinned subsequent feature edits: retain original RC manifest
// as provenance, while allowing only the reviewed calendar follow-up files.
const followup=JSON.parse(string('docs/NIGHTJAR_POST_RC_FOLLOWUPS.json'));
assert.equal(followup.pr,303,'calendar changes require their own PR review');
const allowedFollowups=new Set([
  'src/App.tsx',
  'src/components/PersonalCalendar.tsx',
  'src/components/personal-calendar.css',
]);
const overrides=new Map(followup.files.map(item=>[item.path,item]));
assert.deepEqual([...overrides.keys()].sort(),[...allowedFollowups].sort(),'reviewed calendar changes only');
for(const item of followup.files){
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  const source=manifest.includes.flatMap(pr=>pr.files).find(file=>file.path===item.path);
  assert.ok(source,'calendar override must originate from the six integrated batches');
  assert.equal(item.baselineSha,source.sha,'original PR blob reference must remain immutable');
}
// Independent, exact-blob-pinned repair. Keep the calendar baseline and original
// release candidate manifest immutable; do not grant a wildcard App.tsx exception.
const visibilityFollowup=JSON.parse(string('docs/NIGHTJAR_PROFILE_VISIBILITY_FOLLOWUP.json'));
assert.equal(visibilityFollowup.pr,311,'profile visibility change must be independently reviewed');
assert.deepEqual(visibilityFollowup.files.map(item=>item.path),['src/App.tsx'],
  'profile visibility follow-up cannot silently change unrelated RC files');
for(const item of visibilityFollowup.files){
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  const previous=overrides.get(item.path);
  assert.ok(previous,'profile follow-up must be anchored to an approved earlier override');
  assert.equal(item.baselineSha,previous.sha,'do not rewrite calendar/RC provenance');
  overrides.set(item.path,item);
}

// Separate, exact-blob-pinned professional intake fix (PR #314). This records
// the owner-reviewed UI change without altering any historic RC/provenance SHA.
const intakeFollowup=JSON.parse(string('docs/NIGHTJAR_PROFESSIONAL_INTAKE_FOLLOWUP.json'));
assert.equal(intakeFollowup.pr,314,'professional intake correction requires separate review');
assert.deepEqual(intakeFollowup.files.map(item=>item.path),
  ['src/App.tsx','scripts/admin-inbox-delete-ux-contracts.mjs'],
  'intake follow-up may change only the owner queue and its directly affected test');
for(const item of intakeFollowup.files){
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  const previous=overrides.get(item.path) ??
    manifest.includes.flatMap(pr=>pr.files).find(file=>file.path===item.path);
  assert.ok(previous,'intake follow-up must be anchored to the exact prior reviewed blob');
  assert.equal(item.baselineSha,previous.sha,'do not rewrite calendar/visibility/original RC provenance');
  overrides.set(item.path,item);
}

// PR #316 adds a tightly scoped owner Didit member operations workbox.
// Anchor only the new App blob to the exact reviewed PR #314 UI baseline;
// do not relax the original integrated source provenance.
const diditOpsFollowup=JSON.parse(string('docs/NIGHTJAR_DIDIT_MEMBER_OPS_FOLLOWUP.json'));
assert.equal(diditOpsFollowup.pr,316,'Didit member operations requires distinct review');
assert.deepEqual(diditOpsFollowup.files.map(item=>item.path),['src/App.tsx'],
  'owner Didit operations follow-up may change only the approved App surface');
for(const item of diditOpsFollowup.files){
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  const previous=overrides.get(item.path);
  assert.ok(previous,'Didit owner UI must anchor to the approved intake follow-up');
  assert.equal(item.baselineSha,previous.sha,'earlier accepted UI SHA cannot change');
  overrides.set(item.path,item);
}

// PR #317 corrects the async popup in the mandatory Didit gate while retaining
// every earlier reviewed App and release-candidate exact blob anchor.
const diditLinkFollowup=JSON.parse(string('docs/NIGHTJAR_DIDIT_DIRECT_LINK_FOLLOWUP.json'));
assert.equal(diditLinkFollowup.pr,317,'Didit direct-link correction requires separate review');
assert.deepEqual(diditLinkFollowup.files.map(item=>item.path),['src/App.tsx'],
  'Didit popup recovery may change only the reviewed App file');
for(const item of diditLinkFollowup.files){
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  const previous=overrides.get(item.path);
  assert.ok(previous,'popup-blocker follow-up must be anchored to approved Didit operations UI');
  assert.equal(item.baselineSha,previous.sha,'do not rewrite historical RC or previously approved UI SHAs');
  overrides.set(item.path,item);
}

// PR #319 adds an independent, narrowly-scoped, exact-blob UX parity import.
// Preserve all earlier human-first, calendar, Didit and integrated RC SHAs.
const parityFollowup=JSON.parse(string('docs/NIGHTJAR_16_ISSUE_PARITY_FOLLOWUP.json'));
assert.equal(parityFollowup.pr,319,'operational parity change requires its own review');
assert.deepEqual(parityFollowup.files.map(item=>item.path),['src/App.tsx'],
  'operational parity may change only the approved App import');
for(const item of parityFollowup.files){
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  const previous=overrides.get(item.path);
  assert.ok(previous,'parity UI must anchor to approved existing source');
  assert.equal(item.baselineSha,previous.sha,'historical Nightjar UI SHAs may not be rewritten');
  overrides.set(item.path,item);
}


// PR #320 updates the existing staged-delete test only to cover ambiguous
// async failures and accessible feedback. Keep its approved intake baseline
// and all older source/file attestations untouched.
const deleteFeedbackFollowup=JSON.parse(string('docs/NIGHTJAR_DELETE_FAILURE_FOLLOWUP.json'));
assert.equal(deleteFeedbackFollowup.pr,320,'deletion follow-up requires its own review');
assert.deepEqual(deleteFeedbackFollowup.files.map(item=>item.path),
  ['scripts/admin-inbox-delete-ux-contracts.mjs'],
  'deletion feedback may alter only its directly affected source contract');
for(const item of deleteFeedbackFollowup.files){
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  const previous=overrides.get(item.path);
  assert.ok(previous,'deletion follow-up must anchor to previously approved source');
  assert.equal(item.baselineSha,previous.sha,'do not change the intake/release candidate approved SHA');
  overrides.set(item.path,item);
}

// PR #324: deliberate multiline messaging follows the original reviewed PR
// #294 component, preserving all prior exact-blob approvals.
const messageFollowup=JSON.parse(string('docs/NIGHTJAR_MESSAGE_NEWLINE_FOLLOWUP.json'));
assert.equal(messageFollowup.pr,324,'message composer requires an independent PR');
assert.deepEqual(messageFollowup.files.map(item=>item.path),
  ['src/components/MessagingHub.tsx'],'cannot widen a composer-only change');
for(const item of messageFollowup.files) {
  const original=manifest.includes.flatMap(pr=>pr.files).find(entry=>entry.path===item.path);
  assert.ok(original,'message composer must exist in approved RC manifest');
  assert.equal(item.baselineSha,original.sha,'reviewed RC source must remain immutable');
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  overrides.set(item.path,item);
}

// PR #326: member-visible listening label only. The reviewed App.tsx PR #319
// hash remains immutable and no server-side access gate is changed.
const betaLabelFollowup=JSON.parse(string('docs/NIGHTJAR_BETA_LISTENING_LABEL_FOLLOWUP.json'));
assert.equal(betaLabelFollowup.pr,326);
assert.deepEqual(betaLabelFollowup.files.map(item=>item.path),['src/App.tsx']);
for(const item of betaLabelFollowup.files) {
  const previous=overrides.get(item.path);
  assert.ok(previous,'label is anchored to approved App UI');
  assert.equal(item.baselineSha,previous.sha,'do not rewrite historical RC hashes');
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  overrides.set(item.path,item);
}


// PR #331: same-session Didit document-recovery component mounted in the
// approved age gate. Keep the PR #326 UI exact blob immutable and allow only
// the explicitly reviewed App.tsx change for the new member panel.
const resubmissionFollowup=JSON.parse(string('docs/NIGHTJAR_DIDIT_RESUBMISSION_FOLLOWUP.json'));
assert.equal(resubmissionFollowup.pr,331,'Didit resubmission requires its own PR review');
assert.deepEqual(resubmissionFollowup.files.map(item=>item.path),['src/App.tsx'],
  'Didit resubmission must not silently change unrelated integrated RC files');
for(const item of resubmissionFollowup.files) {
  const previous=overrides.get(item.path);
  assert.ok(previous,'resubmission UI must be anchored to the approved existing App');
  assert.equal(item.baselineSha,previous.sha,'historical approved App blobs remain immutable');
  assert.match(item.sha,/^[0-9a-f]{40}$/);
  overrides.set(item.path,item);
}

const listed=new Set();
let originals=0;
for(const pr of manifest.includes){
  assert.match(pr.head,/^[0-9a-f]{40}$/,'original PR SHA is recorded');
  for(const entry of pr.files){
    assert.ok(!entry.path.startsWith('functions/')&&!entry.path.endsWith('.rules'),
      'integration must not change backend, data rules or authentication contracts');
    if(entry.path==='package.json'){
      assert.equal(entry.exception,'merged-validation-commands');
      continue;
    }
    assert.ok(!listed.has(entry.path),'a duplicate path would hide cross-PR changes: '+entry.path);
    listed.add(entry.path);
    const bytes=read(entry.path);
    const gitBlob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
    assert.equal(gitBlob,overrides.get(entry.path)?.sha ?? entry.sha,
      entry.path+' must match the original RC or an independently reviewed SHA-pinned follow-up');
    originals++;
  }
}
assert.equal(originals,29,'all 29 non-overlapping source files are included');
const pkg=JSON.parse(string('package.json'));
assert.match(pkg.scripts['validate:contracts'],/node scripts\/app-wide-human-first-contracts\.mjs/,
  'do not drop the readable UI QA suite from PR #296');
assert.match(pkg.scripts['validate:scroll'],/node scripts\/navigation-reveal-contracts\.mjs/,
  'do not drop navigation behaviour QA from PR #297');
assert.match(pkg.scripts['validate:contracts'],/node scripts\/nightjar-integrated-release-contracts\.mjs/,
  'every standard validation must run integrated provenance checks');

const app=string('src/App.tsx');
const main=string('src/main.tsx');
const messaging=string('src/components/MessagingHub.tsx');
const mobile=string('src/components/MobileNavigation.tsx');
const calendar=string('src/components/PersonalCalendar.tsx');
const layout=string('src/components/NightjarHomeLayout.tsx');
assert.match(main,/human-first-operational-ui\.css/,'shared Midnight Gold refinement loaded');
assert.match(messaging,/messaging-human-first\.css/,'Inbox polish loaded');
assert.match(messaging,/event\.key==='Enter'&&\(event\.ctrlKey\|\|event\.metaKey\)/,
  'message composer requires explicit Ctrl/Cmd+Enter to submit');
assert.doesNotMatch(messaging,/event\.key==='Enter'&&!event\.shiftKey/,
  'plain Enter must never auto-send a draft');
assert.match(messaging,/Enter for a new line · Ctrl\/Cmd\+Enter to send/,
  'message composer shortcut must be discoverable');
assert.match(app,/revealHomeSection\('catalogue'\)/,'Home navigation source changes present');
assert.match(layout,/revealHomeSection\('catalogue'\)/,'Home action uses shared reveal mechanism');
assert.match(mobile,/isMobileNavigationActive\(view, item\.view\)/,'related Profile/Calendar tabs correctly selected');
assert.match(calendar,/nightjarCalendar\.save\(\{id:editing \?\? undefined,title:title\.trim\(\),date:draftDate/,
  'calendar reschedule preserves original record identity');
assert.match(app,/isProfileSetupComplete\(profile\)/,'completed onboarding gate stays intact');
assert.match(app,/ageVerified/,'age verification still gates private role views');
assert.match(app,/playbackAccessReason\?: 'admin' \| 'credited_work' \| 'subscription' \| 'closed_beta_tester'/,
  'published audio cards type beta entitlements without mislabelling them as subscriptions');
assert.match(app,/track\.playbackAccessReason === 'closed_beta_tester' \? 'Included · beta tester'/,
  'a free beta grant shows a clear member-facing label');
assert.match(string('src/components/NightjarPlayer.tsx'),/playbackAccessReason\?: 'admin' \| 'credited_work' \| 'subscription' \| 'closed_beta_tester'/,
  'player data contract includes the beta reason without treating it as a paid subscription');

for(const file of [
  'docs/INBOX_HUMAN_FIRST_ACCEPTANCE.md',
  'docs/APP_WIDE_HUMAN_FIRST_BATCH_A_QA.md',
  'docs/APP_WIDE_NAVIGATION_BATCH_B_QA.md',
  'docs/APP_WIDE_MOBILE_NAV_BATCH_C_QA.md',
  'docs/APP_WIDE_CALENDAR_BATCH_D_QA.md',
  'docs/NIGHTJAR_INTEGRATED_RC_RELEASE_GATES.md',
])assert.ok(string(file).length>100,'acceptance document missing: '+file);
console.log('NightJar integrated RC: six source PRs, 29 exact blobs, both validation runners, role and safety gates PASS.');
