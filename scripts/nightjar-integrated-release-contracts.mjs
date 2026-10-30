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
assert.match(app,/revealHomeSection\('catalogue'\)/,'Home navigation source changes present');
assert.match(layout,/revealHomeSection\('catalogue'\)/,'Home action uses shared reveal mechanism');
assert.match(mobile,/isMobileNavigationActive\(view, item\.view\)/,'related Profile/Calendar tabs correctly selected');
assert.match(calendar,/nightjarCalendar\.save\(\{id:editing \?\? undefined,title:title\.trim\(\),date:draftDate/,
  'calendar reschedule preserves original record identity');
assert.match(app,/isProfileSetupComplete\(profile\)/,'completed onboarding gate stays intact');
assert.match(app,/ageVerified/,'age verification still gates private role views');

for(const file of [
  'docs/INBOX_HUMAN_FIRST_ACCEPTANCE.md',
  'docs/APP_WIDE_HUMAN_FIRST_BATCH_A_QA.md',
  'docs/APP_WIDE_NAVIGATION_BATCH_B_QA.md',
  'docs/APP_WIDE_MOBILE_NAV_BATCH_C_QA.md',
  'docs/APP_WIDE_CALENDAR_BATCH_D_QA.md',
  'docs/NIGHTJAR_INTEGRATED_RC_RELEASE_GATES.md',
])assert.ok(string(file).length>100,'acceptance document missing: '+file);
console.log('NightJar integrated RC: six source PRs, 29 exact blobs, both validation runners, role and safety gates PASS.');
