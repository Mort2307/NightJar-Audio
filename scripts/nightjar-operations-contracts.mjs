import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
const frontend = fs.readFileSync('src/platform/firebase-push.ts', 'utf8');
const preferences = fs.readFileSync('src/components/NotificationPreferences.tsx', 'utf8');
const sw = fs.readFileSync('public/service-worker.js', 'utf8');
const roles = fs.readFileSync('src/components/AdminMemberRoleEditor.tsx', 'utf8');
const roleApplications = fs.readFileSync('src/components/ProfessionalRoleManager.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
const readiness = fs.readFileSync('src/components/AdminReleaseReadiness.tsx', 'utf8');

test('test push targets one short-ID device belonging to the authenticated account', () => {
  const delivery = backend.slice(backend.indexOf('const deliverPushNotification ='), backend.indexOf('export const registerPushDevice ='));
  const sender = backend.slice(backend.indexOf('export const sendTestPushNotification ='), backend.indexOf('const createNotification ='));
  assert.match(delivery, /targetDeviceId\?: string/);
  assert.match(delivery, /devices\.docs\.filter\(\(doc\) => doc\.id\.slice\(0, 16\) === targetDeviceId\)/);
  assert.match(delivery, /const doc = tokenDocs\[index\]/);
  assert.match(sender, /\^\[0-9a-f\]\{16\}\$/);
  assert.match(sender, /deliverPushNotification\(identity\.uid, payload, displayMode, ref\.id, targetDeviceId \|\| undefined\)/);
  assert.match(frontend, /testCall\(\{ deviceId \}\)/);
  assert.match(frontend, /savedDevice\(\)/);
  assert.match(preferences, /Test this device only/);
});

test('service worker never opens an off-origin route from a notification', async () => {
  const listeners = new Map();
  let target = null;
  const self = {
    location: { origin: 'https://nightjar-audio.web.app' },
    addEventListener: (name, callback) => listeners.set(name, callback),
    clients: { matchAll: async () => [], openWindow: async (route) => { target = route; } },
  };
  vm.runInNewContext(sw, { self, URL, importScripts: () => { throw new Error('SDK unavailable'); } }, { filename: 'service-worker.js' });
  const onClick = listeners.get('notificationclick');
  assert.equal(typeof onClick, 'function');
  const simulate = async (route) => {
    let promise;
    onClick({ notification: { data: { route }, close: () => {} }, waitUntil: (p) => { promise = p; } });
    await promise;
    return target;
  };
  assert.equal(await simulate('//malicious.example/login'), '/discover');
  assert.equal(await simulate('https://malicious.example'), '/discover');
  assert.equal(await simulate('/\\malicious.example'), '/discover');
  assert.equal(await simulate('/library?section=voices'), '/library?section=voices');
});

test('admin account controls show errors and serialize role, status and tester mutations', () => {
  assert.match(roles, /const applyAccountChange = async/);
  assert.match(roles, /if \(busy\) return;/);
  for (const name of ['onActiveRoleChange', 'onStatusChange', 'onTestAccessChange']) {
    assert.match(roles, new RegExp('applyAccountChange\\(\\(\\) => ' + name + '\\('));
  }
  assert.match(roles, /\{error && <div className="nj-role-save-error" role="alert">/);
});

test('launch readiness never treats unsigned-off payments and legal review as cleared', () => {
  assert.match(readiness, /id: 'payments'[\s\S]*?state: 'blocker'/);
  assert.match(readiness, /id: 'legal'[\s\S]*?state: 'blocker'/);
  assert.match(readiness, /state: pendingApplications \? 'attention' : 'pass'/);
  assert.match(readiness, /onOpenFinance/);
  assert.match(readiness, /onOpenLegalReadiness/);
});

test('professional applications expose a mobile-friendly continuation instead of requiring keyboard Tab', () => {
  assert.match(roleApplications, /professional-role-scroll-to-application/);
  assert.match(roleApplications, /applicationDetailsRef\\.current\\?\\.scrollIntoView/);
  assert.match(roleApplications, /aria-label="Professional application details"/);
  assert.match(css, /\\.professional-role-application-fields[\\s\\S]*?scroll-margin-top/);
  assert.match(css, /\\.professional-role-scroll-to-application[\\s\\S]*?min-height: 44px/);
});
