import assert from 'node:assert/strict';
import { assessLaunchReadiness, launchAttestations } from './launch-readiness-policy.mjs';

const approved = Object.fromEntries(launchAttestations.map(({key}) => [key, 'true']));
const ready = {
  clientBypass: false,
  backendBypass: false,
  closedBeta: false,
  diditLiveProviderGateFound: true,
  attestations: approved,
};
assert.equal(assessLaunchReadiness(ready).length, 0, 'A fully attested operator release can pass the policy');

for (const {key} of launchAttestations) {
  const attestations = {...approved, [key]: undefined};
  assert.ok(assessLaunchReadiness({...ready, attestations}).some(message => message.includes(key)), key + ' must fail closed');
  assert.ok(assessLaunchReadiness({...ready, attestations: {...approved, [key]: 'TRUE'}}).some(message => message.includes(key)), key + ' must accept only explicit true');
}
assert.ok(assessLaunchReadiness({...ready, clientBypass: true}).some(x => x.includes('age-assurance')));
assert.ok(assessLaunchReadiness({...ready, backendBypass: true}).some(x => x.includes('age-assurance')));
assert.ok(assessLaunchReadiness({...ready, closedBeta: true}).some(x => x.includes('Closed beta')));
assert.ok(assessLaunchReadiness({...ready, diditLiveProviderGateFound: false}).some(x => x.includes('Didit')));
assert.ok(assessLaunchReadiness({...ready, attestations: {}}).length >= launchAttestations.length);
assert.ok(launchAttestations.some(item => /payment/i.test(item.description)));
assert.ok(launchAttestations.some(item => /legal/i.test(item.description)));
assert.ok(launchAttestations.some(item => /real test accounts/i.test(item.description)));

console.log('Public-launch gate fails closed unless provider, legal, security, human QA and owner approvals are all explicit.');
