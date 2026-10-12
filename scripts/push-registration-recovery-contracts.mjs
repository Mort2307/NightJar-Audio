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


assert.match(push, /async showPhoneNotification\(/, 'system notification helper exists for foreground FCM');
assert.match(push, /registration\.showNotification\(/, 'phone display uses the real service worker registration');
assert.match(push, /async checkPhoneDisplay\(/, 'direct OS notification check does not depend on FCM');
assert.match(preferences, /Check phone display/, 'device notification diagnostics can be invoked by the user');
assert.match(app, /nightjarPush\.showPhoneNotification\(/, 'foreground FCM messages request an OS notification');
const worker = fs.readFileSync('public/service-worker.js', 'utf8');
assert.match(worker, /return self\.registration\.showNotification\(/, 'background notification callback returns the notification promise');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const generator = fs.readFileSync('scripts/generate-nightjar-notification-badge.mjs', 'utf8');
assert.equal(packageJson.scripts.prebuild, 'node scripts/generate-nightjar-notification-badge.mjs', 'standard builds regenerate branded badge');
assert.equal(packageJson.scripts['prebuild:firebase'], 'node scripts/generate-nightjar-notification-badge.mjs', 'Firebase builds regenerate branded badge');
assert.match(generator,/sourcePath = 'public\/nightjar-home-192\.png'/,'badge generator uses the actual Nightjar logo asset');
assert.match(generator,/fs\.readFileSync\(sourcePath\)/,'badge generator reads source artwork');
assert.match(generator,/active<width\*height\*\.78/,'badge generator refuses solid white squares');

// Android status-bar icons require an alpha-only silhouette, not a square launcher icon.
const badgePath = '/nightjar-notification-badge.png';
const badge = fs.readFileSync('public' + badgePath);
assert.equal(badge.subarray(0,8).toString('hex'),'89504e470d0a1a0a','badge is a PNG');
assert.equal(badge.readUInt32BE(16),96,'badge is 96 pixels wide');
assert.equal(badge.readUInt32BE(20),96,'badge is 96 pixels high');
assert.equal(badge[25],6,'badge contains an alpha channel (RGBA)');
assert.match(push, /badge: '\/nightjar-notification-badge\.png'/,'foreground and phone test use the real Nightjar glyph');
assert.match(worker, /badge: '\/nightjar-notification-badge\.png'/,'background push uses the real Nightjar glyph');
assert.doesNotMatch(push, /badge: '\/nightjar-home-192\.png'/, 'no opaque square on foreground notifications');
assert.doesNotMatch(worker, /badge: '\/nightjar-home-192\.png'/, 'no opaque square on background notifications');

console.log('Nightjar explicit opt-in FCM, 401 recovery, per-device revocation and device-display contracts passed.');
