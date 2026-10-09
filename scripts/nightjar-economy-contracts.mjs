import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const gifts = read('functions/src/nightjars.ts');
const functions = read('functions/src/index.ts');
const giftUi = read('src/components/NightjarGiftPanel.tsx');
const rolesUi = read('src/components/ProfessionalRoleManager.tsx');
const accountUi = read('src/components/AccountAccess.tsx');
const commercialUi = read('src/components/CreatorCapacityBank.tsx');
const commercialClient = read('src/platform/firebase-commercial.ts');

const checks = [
  ['Nightjar creator value is exactly Â£1', gifts.includes('const NIGHTJAR_VALUE_PENCE = 100')],
  ['pack sizes include 1/5/10/15/20', [1,5,10,15,20].every((count) => gifts.includes(`count: ${count},`))],
  ['gifts support all professional roles', ["'creator'","'writer'","'editor'","'artist'"].every((role) => gifts.includes(role))],
  ['gift ledger records one recipient user', gifts.includes('recipientUserId,') && gifts.includes("type: 'gift'")],
  ['gift ledger records recipient professional role', gifts.includes('recipientRole,')],
  ['purchasers cannot redeem Nightjars', gifts.includes('redeemableByPurchaser: false')],
  ['Nightjars do not expire', gifts.includes('expires: false')],
  ['listener-to-listener transfer is disabled', gifts.includes('transferableBetweenListeners: false')],
  ['gifting uses idempotency keys', gifts.includes('idempotencyKey')],
  ['gift clearing is delayed', gifts.includes('GIFT_CLEARANCE_DAYS') && gifts.includes('pending_clearance')],
  ['unspent wallet Nightjars remain an explicit creator-value liability', gifts.includes("collection('nightjarWallets')") && gifts.includes('outstandingWalletLiabilityPence')],
  ['multi-role application bank exists', functions.includes("db.collection('professionalApplications')")],
  ['professional applications accept multiple roles', functions.includes('submitProfessionalApplication') && functions.includes('requestedRoles')],
  ['controlled intake waves are recorded', functions.includes('reviewProfessionalApplication') && functions.includes('wave: wave || application.wave || null')],
  ['professional roles can be removed', functions.includes('removeProfessionalRole')],
  ['rejected professional roles are cleared from the active application bank', functions.includes("decision === 'rejected'") && functions.includes("? []") && functions.includes('const accountPendingRoles = remainingRequested')],
  ['professional workspaces can be switched', functions.includes('setActiveNightjarRole')],
  ['artist is a professional role', functions.includes("['creator','writer','editor','artist']")],
  ['Artist portfolios require human-created work attestation', functions.includes('humanCreatedAttestation') && functions.includes('not AI-generated imagery')],
  ['signup supports multiple professional selections', accountUi.includes('registrationRoles') && accountUi.includes("['listener', ...registrationRoles]")],
  ['gift UI lets multi-role recipients choose target profession', giftUi.includes('eligibleRoles.length > 1') && giftUi.includes('targetRole') && giftUi.includes('recipientRole: targetRole')],
  ['role manager can add multiple professions', /setSelected\(\(items\)\s*=>/.test(rolesUi) && rolesUi.includes('[...items, role]') && rolesUi.includes('applyForProfessionalRoles(selected')],
  ['creator compensation defaults to 50 percent', functions.includes('creatorPoolPercent') && functions.includes(': 50')],
  ['company profit allocation defaults to 30 percent', functions.includes('companyProfitPercent') && functions.includes(': 30')],
  ['core business fund defaults to 20 percent', functions.includes('businessFundPercent') && functions.includes(': 20')],
  ['commercial allocations must total 100 percent', functions.includes('allocations must total 100%')],
  ['current Creator monthly cap defaults to Â£3,000', functions.includes('creatorMonthlyCapPence') && functions.includes(': 300000')],
  ['safe Creator utilisation defaults to 70 percent', functions.includes('safeCreatorUtilizationPercent') && functions.includes(': 70')],
  ['Creator revenue uses a 90 day rolling window', functions.includes('revenueAveragingDays') && functions.includes(': 90')],
  ['Creator capacity includes a 20 percent downturn stress test', functions.includes('subscriberStressTestPercent') && functions.includes(': 20')],
  ['at least two Creator slots are kept banked by default', functions.includes('minimumBankedCreatorSlots') && functions.includes(': 2')],
  ['paid Creator slots never open automatically', functions.includes('automaticCreatorSlotOpening: false')],
  ['unsafe paid Creator slot activation is rejected server-side', functions.includes('setCreatorPaidSlotStatus') && functions.includes('safe Creator payroll capacity') && functions.includes('required banked Creator headroom')],
  ['unused Creator capacity rolls into Nightjar growth fund', functions.includes('growthAndStabilityFundContributionPence') && functions.includes('unusedCreatorCapacityPence')],
  ['Creator Capacity Bank exposes theoretical safe and banked capacity', commercialUi.includes('Theoretical capacity') && commercialUi.includes('Safe active capacity') && commercialUi.includes('Creator headroom in bank')],
  ['Creator paid-slot controls remain manual in the admin UI', commercialUi.includes('Release paid slot') && commercialUi.includes('Automatic slot opening is disabled')],
  ['commercial client exposes guarded paid-slot mutation', commercialClient.includes('setCreatorPaidSlotStatus') && commercialClient.includes('setCreatorPaidSlot')],
];

const failed = checks.filter(([, pass]) => !pass);
if (failed.length) {
  console.error('NIGHTJAR ECONOMY / PROFESSIONAL ROLE CONTRACT FAILURES');
  for (const [label] of failed) console.error('-', label);
  process.exit(1);
}

for (const [label] of checks) console.log('âœ“', label);
console.log('Nightjar economy and professional-role contracts passed:', checks.length);
