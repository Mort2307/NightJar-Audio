import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = (name) => fs.readFileSync(name, 'utf8');
const gate = source('src/components/AdminReleaseReadiness.tsx');
const app = source('src/App.tsx');
const styles = source('src/index.css');
const backend = source('functions/src/index.ts');
const launch = source('scripts/launch-readiness.mjs');

for (const id of ['age','bypass','beta','security','images','applications','build','rules']) {
  assert.match(gate, new RegExp("id: '" + id + "'"), 'missing interactive launch gate: ' + id);
}
assert.match(gate, /<button\s+type="button" key=\{gate.id\}/, 'launch cards must be actual keyboard-accessible buttons');
assert.match(gate, /aria-expanded=\{selected === gate.id\}/, 'launch cards must announce expanded state');
assert.match(gate, /aria-controls="nightjar-release-next-steps"/, 'launch cards should expose their next steps');
assert.match(gate, /active.next.map\(step => <li/, 'gate instructions are itemized');
assert.match(gate, /onClick=\{active.action\}/, 'selected gate must offer a connected in-app action');
assert.match(gate, /onOpenDidit/, 'age and bypass blockers can open Didit controls');
assert.match(gate, /onOpenTesters/, 'closed-beta gate can open tester management');
assert.match(gate, /onOpenSecurityAlerts/, 'alerts can open owner security review');
assert.match(gate, /onOpenImages/, 'image moderation gate can open the queue');
assert.match(gate, /onOpenApplications/, 'role applications can open the pending bank');
assert.match(gate, /onOpenAppUpdates/, 'PWA update gate can open account update controls');
assert.match(gate, /const liveDiditConnected = provider\?\.configured === true && provider\.environment === 'live'/, 'source must check actual live provider state');
assert.match(gate, /testing\?\.ageAssuranceConfigured === true/, 'live key alone cannot attest public-launch acceptance');
assert.match(app, /provider=\{\{ configured: ageConfigured, environment: ageEnvironment, providerVerified: ageProviderVerified \}\}/, 'gate receives authenticated backend ageStatus');
assert.match(app, /id="nightjar-admin-didit"/, 'Didit actions have a working destination');
assert.match(app, /id="nightjar-admin-testers"/, 'tester actions have a working destination');
assert.match(app, /onOpenImages=\{\(\) => openAdminPanel\('images'\)\}/, 'clicking image action opens real moderation workpage');
assert.match(app, /onOpenApplications=\{\(\) => openAdminPanel\('approvals'\)\}/, 'clicking applications opens real workpage');
assert.match(styles, /\.release-readiness-gate:focus-visible/, 'keyboard focus must be clearly visible');
assert.match(styles, /@media \(max-width: 460px\)/, 'narrow mobile gate layout is present');
assert.match(backend, /const TESTING_AGE_ASSURANCE_BYPASS = true/, 'beta bypass remains enabled');
assert.match(backend, /const CLOSED_BETA = true/, 'closed beta remains active');
assert.match(launch, /livePilotReviewed = process.env.NIGHTJAR_DIDIT_LIVE_VERIFIED === 'true'/, 'launch attestation cannot be silently bypassed');
console.log('Nightjar owner release-gate clickable navigation and private-beta safety contracts PASS (source-level only).');
