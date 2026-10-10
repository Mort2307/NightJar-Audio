import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx','utf8');
const backend = fs.readFileSync('functions/src/index.ts','utf8');

const clientBypass = /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(app);
const backendBypass = /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(backend);
const closedBeta = /const CLOSED_BETA\s*=\s*true/.test(backend);
const didit = fs.readFileSync('functions/src/didit.ts', 'utf8');
const liveEvidenceRequired = backend.includes('diditPass(data)') && didit.includes("data?.environment === 'live'");
const livePilotReviewed = process.env.NIGHTJAR_DIDIT_LIVE_VERIFIED === 'true';
const failures = [];

if (clientBypass || backendBypass) {
  failures.push('Testing age-assurance bypass is still enabled. Set TESTING_AGE_ASSURANCE_BYPASS = false before public launch.');
}

if (closedBeta) {
  failures.push('Closed Beta registration is still enabled. Set CLOSED_BETA = false before public launch.');
}

if (!liveEvidenceRequired || !livePilotReviewed) {
  failures.push('Didit production 18+ assurance is not certified. Require live signed evidence, tested webhook and explicit NIGHTJAR_DIDIT_LIVE_VERIFIED=true release attestation.');
}

if (failures.length) {
  console.error('LAUNCH READINESS FAIL');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}

console.log('✓ Testing age-assurance bypass disabled.');
console.log('✓ Closed Beta registration disabled.');
console.log('✓ Live Didit age evidence and operator release attestation confirmed.');
console.log('Nightjar launch-readiness access gates passed.');
