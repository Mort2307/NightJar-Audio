// Nightjar Didit wiring and security contracts. Runs as part of the consolidated private-beta validation.
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
  ['verifiedAdultFromDecision(value.decision)', 'Approved KYC requires verified 18+ ID evidence'],
  ["id.status !== 'Approved'", 'Only approved ID checks count as adult evidence'],
  ['payload.adultEvidence === true', 'Adult evidence checked before any live verified pass'],
  ['(session.applicationId && session.applicationId !== payload.applicationId)', 'Provider application bound on webhooks'],
  ['X-Signature-V2','Signed V2 webhook verification'],
  ["text(request.get('X-Signature'))", 'Strong raw-body signature fallback'],
  ['timingSafeEqual','Constant-time HMAC comparison'],
  ['Math.abs(Date.now()/1000 - dispatched) > 300','Five-minute replay protection'],
  ['const dispatched = Number(value.timestamp);', 'Replay clock comes from signed payload'],
  ['headerTimestamp !== dispatched', 'Unsigned header must agree with signed timestamp'],
  ['diditWebhookEvents', 'Durable idempotent event ledger'],
  ['onDocumentCreated', 'Asynchronous webhook processor'],
  ["vendor_data: uid", 'Firebase UID binding'],
  ["sandbox_scenario: 'approve'", 'Sandbox-only Didit scenario forces failure on a live application key'],
  ["session.session_kind !== 'user'", 'Reject non-user Didit sessions'],
  ["request.get('X-Didit-Test-Webhook')", 'Signed Didit test deliveries cannot change a real account'],
  ["(hasVendorEcho && text(session.vendor_data) !== uid)", 'Any echoed vendor_data must match the authenticated Firebase UID'],
  ["(hasWorkflowEcho && text(session.workflow_id) !== DIDIT_WORKFLOW_ID.value())", 'Any echoed workflow_id must match the configured workflow'],
  ["sessionRef(sessionId)", 'Server-owned UID and workflow session binding persists'],
  ["failurePhase", 'Sanitized Didit failure phase exists'],
  ['session.workflowId !== payload.workflowId', 'Workflow scope check'],
  ["session.environment !== payload.environment", 'Environment scope check'],
  ["data?.environment === 'live'", 'Sandbox and live pass isolation'],
  ["data?.reverifyRequired !== true", 'Revocation enforcement'],
]) requireMarker(didit, marker, label);
requireMarker(backend, 'diditPass(data)', 'Protected audio checks Didit status');
requireMarker(backend, 'startDiditSession(identity.uid)', 'Didit session callable');
requireMarker(backend, "const requireAgeVerified = async", 'Nightjar adult content is gated');
requireMarker(backend, "temporaryBypass: false", 'Explicitly no tester bypass');
requireMarker(backend, "diditMode() !== 'live'", 'Require a live provider for member age sessions');
requireMarker(backend, "providerVerified: verified", 'Client provider status follows real pass');
if (backend.includes("const TESTING_AGE_ASSURANCE_BYPASS = true")) failures.push('Legacy test bypass remains');
if (nightjars.includes("const TESTING_AGE_ASSURANCE_BYPASS = true")) failures.push('Legacy gifts bypass remains');
requireMarker(nightjars, 'diditPass(age.data())', 'Gift checks Didit status');
requireMarker(ui, 'Didit Age Verification', 'Didit user-facing age gate');
requireMarker(ui, 'Verify my age with Didit', 'Every account can initiate a live Didit check');
requireMarker(ui, 'onClick={() => void openAgeCheck()}', 'Account holder explicitly initiates Didit');
const rewrite = hosting.hosting?.rewrites?.find(item => item.source === '/api/webhooks/didit');
if (rewrite?.function?.functionId !== 'diditWebhook') failures.push('Didit Firebase Hosting route is missing');
if (ui.includes('Yoti') || backend.includes('AGE_ASSURANCE_CONFIGURED')) failures.push('Retired age provider is still active');
if (/const dispatched\s*=\s*Number\(request\.get\('X-Timestamp'\)\)/.test(didit)) {
  failures.push('Replay clock must not come from the unsigned X-Timestamp header');
}
if (failures.length) {
  console.error('NIGHTJAR DIDIT CONTRACT FAIL');
  failures.forEach(item => console.error('-', item));
  process.exit(1);
}
console.log('Nightjar Didit wiring/security contracts PASS');
