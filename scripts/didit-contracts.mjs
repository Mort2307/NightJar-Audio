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
  ["(hasVendorEcho && text(session.vendor_data) !== uid)", 'If Didit echoes vendor_data, it must match the Firebase UID'],
  ["(hasWorkflowEcho && text(session.workflow_id) !== DIDIT_WORKFLOW_ID.value())", 'If Didit echoes workflow_id, it must match the configured workflow'],
  ["sessionRef(sessionId)", 'Account-owned session binding is persisted'],
  ["failurePhase", 'Didit failure diagnostics identify the stage without exposing data'],
  ['session.workflowId !== payload.workflowId', 'Workflow scope check'],
  ["session.environment !== payload.environment", 'Environment scope check'],
  ["data?.environment === 'live'", 'Sandbox and live pass isolation'],
  ["data?.reverifyRequired !== true", 'Revocation enforcement'],
]) requireMarker(didit, marker, label);
requireMarker(backend, 'diditPass(data)', 'Protected audio checks Didit status');
requireMarker(backend, 'startDiditSession(identity.uid)', 'Didit session callable');
requireMarker(backend, "requireCurrentLegalAcceptance(identity.uid, 'age_assurance_notice')", 'The server must require recorded notice acknowledgement before beginning Didit');
requireMarker(backend, 'DIDIT_LIVE_PILOT_ADMINS_ONLY = true', 'Live Didit remains restricted to approved pilot accounts');
requireMarker(backend, "DIDIT_LIVE_PILOT_ADMINS_ONLY && !identity.admin && !individuallyApprovedPilot", 'Only admins or explicitly enrolled pilot members can launch Didit');
requireMarker(backend, "export const adminSetDiditPilotAccess", 'Authenticated administrator controls Didit pilot cohort');
requireMarker(backend, "diditPilotEnabled: enabled", 'Pilot enrolment is stored on the correct Firebase account');
requireMarker(backend, "const bypass = await temporaryAgeBypassFor(identity.uid)", 'Existing tester bypass is retained');
requireMarker(backend, "providerVerified: persistentlyVerified", 'Permanent provider pass remains distinct from temporary tester bypass');
requireMarker(backend, "diditPilotEligible: pilotAccess", 'Account-scoped verification invitation is communicated to the app');
requireMarker(backend, 'providerVerified: persistentlyVerified', 'Real Didit age pass is never conflated with tester bypass');
requireMarker(nightjars, 'diditPass(age.data())', 'Gift checks Didit status');
requireMarker(ui, 'Didit Age Verification', 'Didit user-facing age gate');
requireMarker(ui, 'Start my live Didit test', 'Admin has an in-app Didit test button');
requireMarker(ui, 'openAgeCheck(true)', 'Admin Didit test invokes real verified session start');
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
