// Public-launch release gates. These are explicit owner attestations, never
// inferred from a green build, payment simulator or successfully deployed UI.
// Keep beta builds unaffected: this policy runs only via validate:launch.
export const launchAttestations = Object.freeze([
  {
    key: 'NIGHTJAR_DIDIT_LIVE_VERIFIED',
    description: 'Existing approved Didit 18+ sessions, revocation and failed/pending cases were independently checked without unnecessary new paid sessions.',
  },
  {
    key: 'NIGHTJAR_ADULT_PAYMENT_PROVIDER_APPROVED',
    description: 'An adult-content-compatible live payment provider is contracted and permitted to process this product.',
  },
  {
    key: 'NIGHTJAR_PAYOUT_SETTLEMENT_VERIFIED',
    description: 'Actual payout, settlement, refund and cancellation flows were independently tested and approved.',
  },
  {
    key: 'NIGHTJAR_UK_LEGAL_REVIEW_APPROVED',
    description: 'Independent UK legal review of copyright/licensing, consumer terms, privacy and age-assurance disclosures was completed.',
  },
  {
    key: 'NIGHTJAR_SECURITY_PRIVACY_REVIEW_APPROVED',
    description: 'Protected media, administrator access, historical repository secrets and account/role isolation were reviewed and remedied.',
  },
  {
    key: 'NIGHTJAR_REAL_DEVICE_ACCEPTANCE_APPROVED',
    description: 'Blocking QA checks were recorded with real test accounts on mobile and desktop, including upload/retry and protected-content boundaries.',
  },
  {
    key: 'NIGHTJAR_OWNER_PUBLIC_LAUNCH_APPROVED',
    description: 'NightJar owners explicitly authorised leaving closed beta after reviewing unresolved issues and release evidence.',
  },
]);

export function assessLaunchReadiness({
  clientBypass = false,
  backendBypass = false,
  closedBeta = true,
  diditLiveProviderGateFound = false,
  attestations = {},
} = {}) {
  const failures = [];
  if (clientBypass || backendBypass) {
    failures.push('An age-assurance test bypass is still enabled; public launch must fail closed.');
  }
  if (closedBeta) {
    failures.push('Closed beta remains enabled. Do not open public registration until all gates pass.');
  }
  if (!diditLiveProviderGateFound) {
    failures.push('The signed live-provider Didit age-decision gate could not be verified in source.');
  }
  for (const {key, description} of launchAttestations) {
    if (attestations[key] !== 'true') {
      failures.push(key + ': ' + description);
    }
  }
  return failures;
}
