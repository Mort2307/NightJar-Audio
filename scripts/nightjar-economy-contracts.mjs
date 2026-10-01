import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const gifts = read('functions/src/nightjars.ts');
const functions = read('functions/src/index.ts');
const giftUi = read('src/components/NightjarGiftPanel.tsx');
const rolesUi = read('src/components/ProfessionalRoleManager.tsx');
const accountUi = read('src/components/AccountAccess.tsx');

const checks = [
  ['Nightjar creator value is exactly £1', gifts.includes('const NIGHTJAR_VALUE_PENCE = 100')],
  ['pack sizes include 1/5/10/15/20', [1,5,10,15,20].every((count) => gifts.includes(`count: ${count},`))],
  ['gifts support all professional roles', ["'creator'","'writer'","'editor'","'artist'"].every((role) => gifts.includes(role))],
  ['gift ledger records one recipient user', gifts.includes('recipientUserId,') && gifts.includes("type: 'gift'")],
  ['gift ledger records recipient professional role', gifts.includes('recipientRole,')],
  ['purchasers cannot redeem Nightjars', gifts.includes('redeemableByPurchaser: false')],
  ['Nightjars do not expire', gifts.includes('expires: false')],
  ['listener-to-listener transfer is disabled', gifts.includes('transferableBetweenListeners: false')],
  ['gifting uses idempotency keys', gifts.includes('idempotencyKey')],
  ['gift clearing is delayed', gifts.includes('GIFT_CLEARANCE_DAYS') && gifts.includes('pending_clearance')],
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
  ['role manager can add multiple professions', rolesUi.includes('setSelected((items)=>') && rolesUi.includes('applyForProfessionalRoles(selected')],
];

const failed = checks.filter(([, pass]) => !pass);
if (failed.length) {
  console.error('NIGHTJAR ECONOMY / PROFESSIONAL ROLE CONTRACT FAILURES');
  for (const [label] of failed) console.error('-', label);
  process.exit(1);
}

for (const [label] of checks) console.log('✓', label);
console.log('Nightjar economy and professional-role contracts passed:', checks.length);
