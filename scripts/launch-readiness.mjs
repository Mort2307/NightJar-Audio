import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx','utf8');
const backend = fs.readFileSync('functions/src/index.ts','utf8');

const clientBypass = /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(app);
const backendBypass = /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(backend);
const closedBeta = /const CLOSED_BETA\s*=\s*true/.test(backend);
const diditIntegrationWired = backend.includes('startDiditSession(identity.uid)') && backend.includes('diditPass(data)');
const liveConfigAcknowledged = process.env.DIDIT_LIVE_CONFIG_ACK === 'yes';
const failures = [];

if (clientBypass || backendBypass) {
  failures.push('Testing age-assurance bypass is still enabled. Set TESTING_AGE_ASSURANCE_BYPASS = false before public launch.');
}

if (closedBeta) {
  failures.push('Closed Beta registration is still enabled. Set CLOSED_BETA = false before public launch.');
}

if (!diditIntegrationWired) failures.push('Didit age-verification session and status functions are not wired.');
if (!liveConfigAcknowledged) failures.push('Before public launch verify Didit live credentials, the 18+ workflow, age-decision evidence, signed webhook and completion status. DIDIT_LIVE_CONFIG_ACK=yes is only an operator attestation.');

if (failures.length) {
  console.error('LAUNCH READINESS FAIL');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}

console.log('✓ Testing age-assurance bypass disabled.');
console.log('✓ Closed Beta registration disabled.');
console.log('✓ Didit integration wired and manual operator live-configuration attestation supplied.');
console.log('Nightjar launch-readiness access gates passed.');
