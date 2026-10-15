import assert from 'node:assert/strict';
import fs from 'node:fs';

const index=fs.readFileSync('functions/src/index.ts','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const component=fs.readFileSync('src/components/DiditControlledLiveCheck.tsx','utf8');
const settings=fs.readFileSync('src/components/NightjarSettings.tsx','utf8');
const admin=fs.readFileSync('src/components/AdminDiditReuseRequests.tsx','utf8');
const client=fs.readFileSync('src/platform/firebase-didit-controlled.ts','utf8');
const didit=fs.readFileSync('functions/src/didit.ts','utf8');
const workflow=fs.readFileSync('.github/workflows/firebase-hosting-merge.yml','utf8');
const start=index.indexOf('// Closed-beta, ONE-USE normal live KYC:');
const end=index.indexOf('// Reusable KYC preparation:',start);
assert.ok(start>=0&&end>start,'one-use exception must be separate from public Didit starter');
const code=index.slice(start,end);
const functionBlock=(name,next) => {
  const a=code.indexOf('export const '+name+' = onCall');
  const b=code.indexOf('export const '+next+' = onCall',a+10);
  assert.ok(a>=0&&b>a,name+' is bounded independently');
  return code.slice(a,b);
};
const grant=functionBlock('adminAuthoriseDiditControlledCheck','myDiditControlledCheck');
const status=functionBlock('myDiditControlledCheck','startMyDiditControlledCheck');
const launch=code.slice(code.indexOf('export const startMyDiditControlledCheck = onCall'));
assert.match(grant,/requireAdminIdentity\(request\)/,'only admin may authorise live account check');
assert.match(grant,/getAuth\(\)\.getUser\(uid\)/,'grant validates actual signed-in user');
assert.match(grant,/authRecord\.emailVerified/,'member email must be verified');
assert.match(grant,/grant\.exists/,'grant cannot be recreated after claim');
assert.match(grant,/tx\.create\(ref/,'grant is durable and one-use');
assert.match(grant,/reuse\.data\(\)\?\.status !== 'approved_for_reuse'/,"member\'s existing consented review is prerequisite");
assert.match(grant,/reuse\.data\(\)\?\.memberConsent !== true/,'member consent is still active');
assert.match(grant,/acknowledgedCharge/,'admin separately acknowledges possible live charge');
assert.doesNotMatch(grant,/startDiditSession\(|DIDIT_API_KEY\.value\(|\.status\(200\)|verified:\s*true/,'admin authorisation cannot start a paid session or grant 18+ status');

assert.match(status,/requireActiveIdentity\(request\)/,'client reads only own grant and session');
assert.match(status,/controlledDiditRef\(identity\.uid\)/,'no caller-selected target');
assert.match(status,/previous\.uid === identity\.uid/,'resume URL must be bound to same signed-in user');
assert.match(status,/return \{[\s\S]*?authorised, state: status, providerVerified/,'members see real authorised state');

assert.match(launch,/requireActiveIdentity\(request\)/,'start requires verified signed-in account');
assert.match(launch,/DIDIT_VERIFICATION_PAUSED/,'one-use exception works only while public Didit is paused');
assert.match(launch,/diditMode\(\) !== 'live'/,'never mislabel sandbox');
assert.match(launch,/explicitConsent !== true/,'member separately confirms a real check');
assert.match(launch,/await requireCurrentLegalAcceptance\(identity\.uid, 'age_assurance_notice'\)/,'server-stored notice acknowledgement required');
assert.match(launch,/tx\.get\(grantRef\)/,'server grants are checked atomically');
assert.match(launch,/grant\.data\(\)\?\.attempts !== 0/,'retries cannot open additional billable check');
assert.match(launch,/consent\.data\(\)\?\.memberConsent !== true/,'withdrawn requests cannot start checks');
assert.match(launch,/state:'claimed', attempts:1/,'claim before provider start');
assert.ok(launch.indexOf("state:'claimed', attempts:1") < launch.indexOf('await startDiditSession(identity.uid)'),
  'durable claim must precede provider API');
assert.match(launch,/state:'requires_review'/,'provider timeouts are never blindly retried');
assert.match(launch,/throw new HttpsError\('unavailable'/,'provider errors require support review');
assert.doesNotMatch(launch,/tx\.set\(ageRef|status:\s*'COMPLETE'|testMode:\s*true|console\.(log|error)/,
  'pilot cannot fabricate age confirmation or log identity data');
assert.match(didit,/uid !== payload\.vendorData/,'Didit webhook still binds signed approval to account UID');
assert.match(index,/const DIDIT_VERIFICATION_PAUSED = true/,'global kill switch remains active');
assert.match(app,/const DIDIT_VERIFICATION_PAUSED = true/,'public UI remains paused');
assert.match(app,/if \(DIDIT_VERIFICATION_PAUSED && !\(adminPilot && role === 'admin'\)\)/,
  'normal members cannot evade the public UI pause');
assert.match(settings,/<DiditControlledLiveCheck \/>/,'one-use check shows in Settings');
assert.ok(settings.indexOf('<DiditControlledLiveCheck />') < settings.indexOf('nj-settings-master-disclosure'),
  'invitation must appear at the top of Settings and not behind nested dropdowns');
assert.match(component,/nightjarDiditControlled\.start\(\)/,'member chooses when to start');
assert.match(component,/window\.confirm\(/,'member must confirm possible charge');
assert.match(component,/nightjarLegal\.accept/,'member can record legal acceptance');
assert.match(component,/Start my one-time Didit ID check/,'clear signed-in member call-to-action');
assert.match(component,/Open secure Didit verification/,'member gets a usable external link after start');
assert.match(component,/\.providerVerified/,'real provider success is distinguished from test bypass');
assert.match(admin,/authoriseOneLiveCheck/,'owner can authorise a specific member');
assert.match(admin,/Authorise one live ID check/,'owner sees explicit opt-in action');
assert.match(admin,/Didit may charge Nightjar/,'admin fee notice is clear');
assert.match(client,/adminAuthoriseDiditControlledCheck/,'typed grant callable exists');
assert.match(client,/myDiditControlledCheck/,'typed status callable exists');
assert.match(client,/startMyDiditControlledCheck/,'typed start callable exists');
assert.match(workflow,/\[nightjar-didit-controlled-check-release\]/,'backend-first deploy is mandatory');
console.log('One-use account-bound Didit normal live check, durable charge guard, UX and public pause contracts PASS.');
