import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const sw=read('public/service-worker.js');
const app=read('src/App.tsx');
const protection=read('functions/src/index.ts');
const accountAccess=read('src/components/AccountAccess.tsx');
const authSecurity=read('src/platform/firebase-auth-security.ts');
const pwa=read('src/platform/pwa.ts');
const vite=read('vite.config.ts');
const hosting=read('firebase.json');
const failures=[];

if (!sw.includes("url.pathname.startsWith('/assets/')")) failures.push('service worker must explicitly restrict static-asset caching');
if (/caches\.put\([^\n]*(script|manuscript|account|profile|firebase|functions)/i.test(sw)) failures.push('service worker appears to cache protected/dynamic Nightjar data');
if (!app.includes('possible_screenshot_key')) failures.push('protected reader possible screenshot signal is missing');
if (!app.includes('possible_capture_shortcut')) failures.push('protected reader capture-shortcut signal is missing');
if (!app.includes('native_screenshot_detected')) failures.push('native screenshot bridge event is missing');
if (!protection.includes('detectionConfidence')) failures.push('server protection evidence confidence classification is missing');
if (!protection.includes('no automatic') && !app.includes('no automatic freeze')) failures.push('human-review security principle is not visible in app code');
if (!protection.includes('recordAuthenticationAttempt')) failures.push('authentication-attempt backend logging is missing');
if (!protection.includes('passwordCaptured: false')) failures.push('authentication security records must explicitly state that passwords are not captured');
if (!protection.includes("category: 'authentication'")) failures.push('authentication alerts must remain a distinct security-alert category');
if (!accountAccess.includes('nightjarAuthSecurity.recordFailure')) failures.push('Nightjar account portal is not reporting observed failed sign-ins');
if (!authSecurity.includes('nightjar_client_observed')) failures.push('authentication evidence quality must be explicit about client-observed scope');
if (!protection.includes('recordAuthenticationSuccess')) failures.push('successful sign-in security telemetry is missing');
if (!protection.includes("collection('trustedAuthDevices')")) failures.push('trusted authentication device tracking is missing');
if (!protection.includes("subtype:'new_device_signin'")) failures.push('new-device sign-ins must notify the account owner');
if (!protection.includes('listMyAuthenticationEvents')) failures.push('members must be able to review their own authentication history');
if (!authSecurity.includes('recordSuccess')) failures.push('account client does not report successful sign-ins');
if (!pwa.includes('getRegistrations()') || !pwa.includes('registration.unregister()')) failures.push('force update must reset stale service-worker registrations');
if (!pwa.includes('Promise.all(keys.map((key) => caches.delete(key)))')) failures.push('force update must clear legacy Cache Storage, not only one cache prefix');
if (!sw.includes("type === 'SKIP_WAITING'")) failures.push('service worker must support explicit update activation');
if (!pwa.includes("fetch('/version.json")) failures.push('manual update check must compare against the deployed build manifest');
if (!vite.includes("fileName: 'version.json'")) failures.push('Nightjar build must emit the update version manifest');
if (!hosting.includes('"source": "/version.json"') || !hosting.includes('no-store,max-age=0,must-revalidate')) failures.push('version manifest must be served without cache');

if (failures.length) {
  console.error('SECURITY CONTRACT FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar security contracts passed.');
