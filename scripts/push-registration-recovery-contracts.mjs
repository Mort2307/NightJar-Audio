import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const push = fs.readFileSync('src/platform/firebase-push.ts', 'utf8');
const preferences = fs.readFileSync('src/components/NotificationPreferences.tsx', 'utf8');
const backend = fs.readFileSync('functions/src/index.ts', 'utf8');

const status = push.slice(push.indexOf('  async status() {'), push.indexOf('  async repair() {'));
assert.match(status, /statusCall\(\)/, 'passive push status reads backend registration');
assert.doesNotMatch(status, /getToken\s*\(/, 'passive push status must never trigger FCM registration');
assert.doesNotMatch(status, /registerCall\s*\(/, 'status should not change device registration');
assert.match(push, /token-subscribe-failed/, 'FCM 401 errors are explained clearly');
assert.match(push, /rememberDevice\(registered\.data\.deviceId\)/, 'device id only persists after backend registration succeeds');
assert.match(push, /'nightjar\.push\.device\.v1\.' \+ uid/, 'device marker is scoped to account identity');
assert.match(push, /await unregisterCall\(\{ deviceId \}\)/, 'disable revokes backend device without another FCM subscription attempt');
assert.doesNotMatch(app, /nightjarPush\.enable\(\)\.catch/, 'sign-in must never auto-register FCM devices');
assert.match(preferences, /thisDeviceRegistered/, 'device-specific push state is visible');
assert.match(preferences, /Other devices are registered, but THIS phone is not/, 'other users devices are never presented as this device');
assert.match(preferences, /pushError/, 'push status errors are shown without crashing profile');
assert.match(preferences, /disabled=\{pushBusy \|\| !pushStatus\?\.thisDeviceRegistered\}/, 'disable action cannot revoke another device');
const begin = backend.indexOf('export const unregisterPushDevice = onCall');
const end = backend.indexOf('export const myPushNotificationStatus = onCall', begin);
assert.ok(begin !== -1 && end > begin, 'protected push revocation exists');
const revoke = backend.slice(begin, end);
assert.match(revoke, /requireActiveIdentity\(request\)/, 'revocation is authenticated');
assert.match(revoke, /accountRef\(identity\.uid\)\.collection\('pushDevices'\)/, 'revocation only accesses signed-in user devices');
assert.match(revoke, /\^\[0-9a-f\]\{16\}\$/, 'short device ids require strict validation');
assert.match(revoke, /doc\.id\.slice\(0, 16\) === shortId/, 'short device ids must match a stored device');
assert.match(revoke, /active:false/, 'revoked devices are marked inactive');
assert.doesNotMatch(revoke, /createUser|verifyIdToken|setCustomUserClaims/, 'push revocation must not change account privileges');

// Web Push setup inspection is optional, passive, transparent and actionable.
assert.match(push,/async diagnostics\(\)/,'FCM setup diagnostics are exposed');
assert.match(push,/pushSetupDiagnostics\(\)/,'FCM diagnostic uses the real browser environment');
assert.match(push,/fcmregistrations.googleapis.com|Firebase Cloud Messaging Registration API/,'Nightjar explains the FCM Registration API check');
assert.doesNotMatch(push.slice(push.indexOf('const pushSetupDiagnostics ='),push.indexOf('const describeFcmError =')),/getToken\(|registerCall\(/,'diagnostics do not register a push device');
assert.match(preferences,/Diagnose notification setup/,'a useful diagnostic action is visible beside Enable');
assert.match(preferences,/setPushError\(message\)/,'FCM enable error is retained for the user');
assert.match(preferences,/nj-push-diagnostics/,'setup guidance is visible on screen');

assert.match(status, /thisDeviceError: deviceId/, 'last FCM delivery error for current device must be surfaced');
assert.match(preferences, /'messaging\/mismatched-credential'/, 'sender ID mismatch must be explained to the device owner');
assert.match(preferences, /Repair this device/, 'affected owner has an explicit repair action');
assert.match(preferences, /senderMismatch \|\| !pushStatus\?\.thisDeviceRegistered/, 'repeated test requests blocked until sender mismatch is repaired');
const repair = push.slice(push.indexOf('  async repair() {'), push.indexOf('  async test() {'));
assert.ok(repair.indexOf('await statusCall()') < repair.indexOf('await unregisterCall({ deviceId })'), 'repair must verify mismatch before revoking registration');
assert.ok(repair.indexOf('await unregisterCall({ deviceId })') < repair.indexOf('await deleteToken(getMessaging(firebaseApp))'), 'repair must revoke current account device before deleting cached FCM token');
assert.ok(repair.indexOf('await deleteToken(getMessaging(firebaseApp))') < repair.indexOf('return this.enable()'), 'repair must clear cached token before explicit re-enrolment');
assert.doesNotMatch(status, /deleteToken|requestPermission|unregisterCall|registerCall|getToken/, 'passive status must not mutate device registration');


console.log('Nightjar explicit opt-in FCM, 401 recovery and per-device revocation contracts passed.');
