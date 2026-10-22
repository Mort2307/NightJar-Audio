import fs from 'node:fs';
import { assessLaunchReadiness, launchAttestations } from './launch-readiness-policy.mjs';

// This command is an explicit PUBLIC-LAUNCH gate, not a regular beta build.
// Setting CI green, ticking a UI box, or simulating £6.99 subscription revenue
// does not constitute approval to collect payments or open registrations.
const app = fs.readFileSync('src/App.tsx', 'utf8');
const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
const didit = fs.readFileSync('functions/src/didit.ts', 'utf8');

const failures = assessLaunchReadiness({
  clientBypass: /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(app),
  backendBypass: /const TESTING_AGE_ASSURANCE_BYPASS\s*=\s*true/.test(backend),
  closedBeta: /const CLOSED_BETA\s*=\s*true/.test(backend),
  // Static source presence is only a minimal guard: operator verification is
  // still separately required and is never inferred from this code check.
  diditLiveProviderGateFound: backend.includes('diditPass(data)') && didit.includes("data?.environment === 'live'"),
  attestations: process.env,
});

if (failures.length) {
  console.error('NIGHTJAR PUBLIC LAUNCH BLOCKED (' + failures.length + ' outstanding gates)');
  for (const failure of failures) console.error('- ' + failure);
  console.error('Keep closed beta and mandatory approved Didit unchanged. Do not set an attestation until documented human/provider evidence exists.');
  process.exitCode = 1;
} else {
  console.log('NightJar launch gate declarations complete (' + launchAttestations.length + ' human/provider attestations).');
  console.log('Confirm exact production GitHub commit, Firebase backend revisions, Hosting release, and independent evidence before enabling public registration.');
}
