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
    assert.equal(gitBlob,entry.sha,entry.path+' must be byte-for-byte identical to its source PR');
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
