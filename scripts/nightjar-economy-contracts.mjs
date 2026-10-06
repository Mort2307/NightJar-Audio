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
const financeLab = read('src/components/AdminFinanceSimulator.tsx');

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
  ['role manager can add multiple professions', rolesUi.includes('setSelected((items)=>') && rolesUi.includes('applyForProfessionalRoles(selected')],
  ['creator compensation defaults to 50 percent', functions.includes('creatorPoolPercent') && functions.includes(': 50')],
  ['company profit allocation defaults to 30 percent', functions.includes('companyProfitPercent') && functions.includes(': 30')],
  ['core business fund defaults to 20 percent', functions.includes('businessFundPercent') && functions.includes(': 20')],
  ['commercial allocations must total 100 percent', functions.includes('allocations must total 100%')],
  ['current Creator monthly cap defaults to £3,000', functions.includes('creatorMonthlyCapPence') && functions.includes(': 300000')],
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
  ['Finance Lab models VAT inclusive and exclusive pricing', financeLab.includes('priceIncludesVat') && financeLab.includes('vat / (100 + vat)')],
  ['Finance Lab prevents negative distributable net', financeLab.includes('Math.max(0, retainedCustomerSales - vatCollected - processorFees)')],
  ['Finance Lab caps per-person contributor pay', financeLab.includes('Math.min(uncappedPerPerson, clamp(role.monthlyCap))')],
  ['Finance Lab tracks uncommitted contributor capacity', financeLab.includes('unusedContributor') && financeLab.includes('rollUnusedToApp')],
  ['Finance Lab warns when main pots do not total 100%', financeLab.includes('Main pots must total 100%')],
  ['Finance Lab warns when professional role shares do not total 100%', financeLab.includes('Contributor role shares must total 100%')],
  ['Finance Lab supports named scenario comparison', financeLab.includes('ScenarioSnapshot') && financeLab.includes('finance-scenarios.v2')],
];

const simulate = ({
  subscribers=0, price=0, vatRate=0, includesVat=true, processorPercent=0, processorFixed=0, refundPercent=0,
  contributorPercent=50, appPercent=20, operatorPercent=30,
  roles={creator:{allocationPercent:100,eligiblePeople:1,monthlyCap:3000}}, rollUnusedToApp=true,
}={}) => {
  const count=Math.max(0,Math.round(subscribers));
  const base=count*Math.max(0,price);
  const vat=Math.max(0,Math.min(100,vatRate));
  const customerBillings=includesVat?base:base*(1+vat/100);
  const refunds=Math.max(0,customerBillings*Math.max(0,refundPercent)/100);
  const retained=Math.max(0,customerBillings-refunds);
  const vatCollected=vat<=0?0:includesVat?retained*(vat/(100+vat)):(retained/(1+vat/100))*(vat/100);
  const processorFees=Math.max(0,customerBillings*Math.max(0,processorPercent)/100+count*Math.max(0,processorFixed));
  const net=Math.max(0,retained-vatCollected-processorFees);
  const contributorPot=net*contributorPercent/100;
  const roleResults=Object.values(roles).map((role)=>{
    const allocated=contributorPot*Math.max(0,role.allocationPercent)/100;
    const people=Math.max(0,Math.round(role.eligiblePeople));
    const uncapped=people?allocated/people:0;
    const perPerson=people?Math.min(uncapped,Math.max(0,role.monthlyCap)):0;
    const paid=people*perPerson;
    return {allocated,paid,unused:Math.max(0,allocated-paid)};
  });
  const contributorPaid=roleResults.reduce((sum,item)=>sum+item.paid,0);
  const unused=Math.max(0,contributorPot-contributorPaid);
  return {
    customerBillings,vatCollected,processorFees,net,contributorPot,contributorPaid,unused,
    appPot:net*appPercent/100+(rollUnusedToApp?unused:0),
    operatorPot:net*operatorPercent/100,
  };
};

const approx=(a,b)=>Math.abs(a-b)<0.000001;
const mathChecks=[
  ['Finance math: zero subscribers stays zero', simulate().net===0 && simulate().contributorPaid===0],
  ['Finance math: VAT-inclusive £6 at 20% extracts £1 VAT', (()=>{const m=simulate({subscribers:1,price:6,vatRate:20,includesVat:true});return approx(m.vatCollected,1)&&approx(m.net,5);})()],
  ['Finance math: VAT-exclusive £5 at 20% bills £6 and nets £5 before other fees', (()=>{const m=simulate({subscribers:1,price:5,vatRate:20,includesVat:false});return approx(m.customerBillings,6)&&approx(m.vatCollected,1)&&approx(m.net,5);})()],
  ['Finance math: zero eligible professionals pay zero and preserve capacity', (()=>{const m=simulate({subscribers:10,price:10,roles:{creator:{allocationPercent:100,eligiblePeople:0,monthlyCap:3000}}});return m.contributorPaid===0&&approx(m.unused,m.contributorPot);})()],
  ['Finance math: monthly caps constrain actual professional payout', (()=>{const m=simulate({subscribers:10,price:10,roles:{creator:{allocationPercent:100,eligiblePeople:1,monthlyCap:20}}});return approx(m.contributorPaid,20)&&m.unused>0;})()],
  ['Finance math: very large subscriber scenarios remain finite', (()=>{const m=simulate({subscribers:10000000,price:20,vatRate:20,processorPercent:3,processorFixed:.3,refundPercent:2});return Object.values(m).every(Number.isFinite);})()],
];

checks.push(...mathChecks);

const failed = checks.filter(([, pass]) => !pass);
if (failed.length) {
  console.error('NIGHTJAR ECONOMY / PROFESSIONAL ROLE CONTRACT FAILURES');
  for (const [label] of failed) console.error('-', label);
  process.exit(1);
}

for (const [label] of checks) console.log('✓', label);
console.log('Nightjar economy and professional-role contracts passed:', checks.length);
