// Nightjar Didit wiring and security contracts. Runs after node scripts/apply-didit-integration.mjs.
import fs from 'node:fs';
const read = path => fs.readFileSync(path, 'utf8');
const backend = read('functions/src/index.ts');
const didit = read('functions/src/didit.ts');
const ui = read('src/App.tsx');
const nightjars = read('functions/src/nightjars.ts');
const hosting = JSON.parse(read('firebase.json'));
const failures = [];
const requireMarker = (value, marker, label) => { if (!value.includes(marker)) failures.push(label); };
for (const [marker,label] of [
  ['request.rawBody', 'Didit raw webhook bytes'],
  ['X-Signature-V2','Signed V2 webhook verification'],
  ["text(request.get('X-Signature'))", 'Strong raw-body signature fallback'],
  ['timingSafeEqual','Constant-time HMAC comparison'],
  ['Math.abs(Date.now()/1000 - dispatched) > 300','Five-minute replay protection'],
  ['diditWebhookEvents', 'Durable idempotent event ledger'],
  ['onDocumentCreated', 'Asynchronous webhook processor'],
  ["vendor_data: uid", 'Firebase UID binding'],
  ['session.workflowId !== payload.workflowId', 'Workflow scope check'],
  ["session.environment !== payload.environment", 'Environment scope check'],
  ["data?.environment === 'live'", 'Sandbox and live pass isolation'],
  ["data?.reverifyRequired !== true", 'Revocation enforcement'],
]) requireMarker(didit, marker, label);
requireMarker(backend, 'diditPass(data)', 'Protected audio checks Didit status');
requireMarker(backend, 'startDiditSession(identity.uid)', 'Didit session callable');
requireMarker(nightjars, 'diditPass(age.data())', 'Gift checks Didit status');
requireMarker(ui, 'Didit Age Verification', 'Didit user-facing age gate');
const rewrite = hosting.hosting?.rewrites?.find(item => item.source === '/api/webhooks/didit');
if (rewrite?.function?.functionId !== 'diditWebhook') failures.push('Didit Firebase Hosting route is missing');
if (ui.includes('Yoti') || backend.includes('AGE_ASSURANCE_CONFIGURED')) failures.push('Retired age provider is still active');
if (failures.length) {
  console.error('NIGHTJAR DIDIT CONTRACT FAIL');
  failures.forEach(item => console.error('-', item));
  process.exit(1);
}
console.log('Nightjar Didit wiring/security contracts PASS');
