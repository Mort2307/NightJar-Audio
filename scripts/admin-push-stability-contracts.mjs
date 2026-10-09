import fs from 'node:fs';
const read = path => fs.readFileSync(path, 'utf8');
const app = read('src/App.tsx');
const push = read('src/platform/firebase-push.ts');
const css = read('src/index.css');
const functions = read('functions/src/index.ts');
const html = read('index.html');
const worker = read('public/service-worker.js');
const hosting = JSON.parse(read('firebase.json'));

const requireText = (text, marker, label) => {
  if (!text.includes(marker)) throw new Error('Nightjar admin/push contract FAIL: ' + label);
};
requireText(app, "createPortal(<div className=\"admin-page admin-portal-root\">", 'admin dialogs portal directly to document.body');
requireText(app, "Back to Admin", 'every tile workspace must have a Back to Admin control');
requireText(app, "openAdminPanel('didit')", 'Didit accessible from Admin tile');
requireText(app, "openAdminPanel('notifications')", 'Push controls accessible from Admin tile');
requireText(app, "openAdminPanel('branding')", 'Approved logo install controls accessible from Admin tile');
requireText(app, "syncApprovedNightjarIcons()", 'Admin icon generator connected');
requireText(css, "ADMIN PORTAL SAFETY FIX", 'portal CSS keeps dialogs visible outside document scroll');
const statusStart=push.indexOf('  async status() {');
const statusEnd=push.indexOf('  async test() {',statusStart);
if(statusStart<0||statusEnd<0||/getToken\s*\(/.test(push.slice(statusStart,statusEnd)))
  throw new Error('Nightjar admin/push contract FAIL: status must never subscribe to FCM');
if(app.includes("void nightjarPush.enable().catch")) throw new Error('Nightjar admin/push contract FAIL: do not auto-subscribe to FCM on login');
requireText(push, "token-subscribe-failed", 'FCM HTTP 401 must be explained without breaking Nightjar');
requireText(push, "rememberDevice(registered.data.deviceId)", 'Push registration stored only after backend success');
requireText(functions, "const shortId = cleanText(input.deviceId", 'Signed-in user can revoke own push device');
requireText(functions, "export const brandInstallManifest", 'Generated approved logo manifest');
requireText(functions, "export const syncBrandIconVariants", 'Approved logo icon upload callable');
requireText(html, "/app-manifest.webmanifest?v=13", 'Browser install uses dynamic approved manifest');
requireText(worker, "icon: '/brand-logo'", 'Notification icon uses Nightjar logo');
for(const [source,functionId] of [
  ['/app-manifest.webmanifest','brandInstallManifest'],
  ['/app-icons/nightjar-192.png','brandIcon192'],
  ['/app-icons/nightjar-512.png','brandIcon512'],
  ['/app-icons/nightjar-maskable-512.png','brandIconMaskable512']
]){
  if(!hosting.hosting.rewrites.some(item=>item.source===source&&item.function?.functionId===functionId))
    throw new Error('Nightjar admin/push contract FAIL: missing Hosting rewrite '+source);
}
requireText(functions,"const TESTING_AGE_ASSURANCE_BYPASS = true;", 'Preserve tester bypass');
requireText(functions,"const CLOSED_BETA = true;", 'Preserve closed beta');
requireText(functions,"const DIDIT_LIVE_PILOT_ADMINS_ONLY = true;", 'Preserve chargeable Didit admin pilot');
console.log('Nightjar admin navigation, FCM resilience and branded icon contracts PASS.');

