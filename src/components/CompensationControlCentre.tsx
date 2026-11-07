import { useCallback, useEffect, useRef, useState } from 'react';
import { Banknote, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { nightjarAccount, type NightjarCommitmentRole } from '../platform/firebase-account';

type Adjustment = { id: string; amountPence: number; reason: string; sourceReference: string };
type Settlement = {
  id: string; externalId: string; settledAt: string; sourceReference: string;
  grossPence: number; refundPence: number; chargebackPence: number; processorFeePence: number;
  vatPence: number; otherDeductionsPence: number; eligibleNetRevenuePence: number; status: string;
};
type Payout = { userId: string; displayName: string; amountPence: number; paidPence: number; outstandingPence: number; qualifyingRole: NightjarCommitmentRole | null; status: string };
type FinancePolicy = { id: string; policyId: string; effectiveFrom: string; version: number; subscriptionPricePence: number; creatorPoolPercent: number; nightjarPoolPercent: number; ownerPoolPercent: number; taxReservePercent: number; priceScope: string; status: string };
type PayoutPeriod = {
  period: { periodId: string; status: string; eligibleNetRevenuePence: number; creatorPoolPercent: number; creatorPoolPence: number; nightjarPoolPercent: number; nightjarPoolPence: number; ownerPoolPercent: number; ownerPoolPence: number; taxReservePercent: number; taxReservePoolPence: number; subscriptionPricePence: number; policyVersion: number; policyEffectiveFrom: string; eligibleCreatorCount: number; totalAllocatedPence: number; unallocatedCreatorPoolPence: number; nonCreatorRemainderPence: number };
  payouts: Payout[];
};
const today = (() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; })();
const month = today.slice(0, 7);
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const pence = (value: string) => {
  const input = value.trim();
  if (!input) return 0;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(input)) return Number.NaN;
  const result = Math.round(Number(input) * 100);
  return Number.isSafeInteger(result) ? result : Number.NaN;
};
const nonNegativeMoney = (value: string) => Number.isSafeInteger(pence(value)) && pence(value) >= 0;
const positiveMoney = (value: string) => Number.isSafeInteger(pence(value)) && pence(value) > 0;
const roleName = (role: string | null) => role === 'creator' ? 'VA Creator' : role === 'writer' ? 'Writer' : role === 'editor' ? 'Audio Editor' : role === 'artist' ? 'Artist' : 'Creative role';

export default function CompensationControlCentre() {
  const [periodId, setPeriodId] = useState(month);
  const [financePolicies, setFinancePolicies] = useState<FinancePolicy[]>([]);
  const [policyEffectiveMonth, setPolicyEffectiveMonth] = useState(month);
  const [policySubscriptionPrice, setPolicySubscriptionPrice] = useState('6.99');
  const [policyCreatorPercent, setPolicyCreatorPercent] = useState('50');
  const [policyNightjarPercent, setPolicyNightjarPercent] = useState('');
  const [policyOwnerPercent, setPolicyOwnerPercent] = useState('');
  const [policyTaxReservePercent, setPolicyTaxReservePercent] = useState('0');
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentReference, setAdjustmentReference] = useState('');
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriod | null>(null);
  const [commitmentPeriodStatus, setCommitmentPeriodStatus] = useState('missing');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [externalId, setExternalId] = useState('');
  const [settledAt, setSettledAt] = useState(today);
  const [sourceReference, setSourceReference] = useState('');
  const [gross, setGross] = useState('');
  const [refunds, setRefunds] = useState('0');
  const [chargebacks, setChargebacks] = useState('0');
  const [fees, setFees] = useState('0');
  const [vat, setVat] = useState('0');
  const [otherDeductions, setOtherDeductions] = useState('0');
  const [reconciliationNotes, setReconciliationNotes] = useState<Record<string, string>>({});
  const [paymentRefs, setPaymentRefs] = useState<Record<string, string>>({});
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [taxLedger, setTaxLedger] = useState<{
    ledger: { periodId: string; reservePence?: number; reserveNote?: string; confirmedLiabilityPence?: number; accountantReference?: string; paidPence?: number } | null;
    payments: Array<{ id: string; amountPence: number; reference: string; paidAt: string }>;
    estimates: Array<{ id: string; category: string; taxableBasePence: number; rateBasisPoints: number; estimatedTaxPence: number; sourceReference: string; note: string; recordedAt: unknown }>;
    reserveEntries: Array<{ id: string; reservePence: number; note: string; recordedAt: unknown; recordedByAdminUserId: string }>;
    liabilityEntries: Array<{ id: string; liabilityPence: number; accountantReference: string; recordedAt: unknown; recordedByAdminUserId: string }>;
  }>({ ledger: null, payments: [], estimates: [], reserveEntries: [], liabilityEntries: [] });
  const [taxEstimateCategory, setTaxEstimateCategory] = useState<'corporation_tax' | 'income_tax' | 'vat' | 'paye_ni' | 'other'>('other');
  const [taxEstimateBase, setTaxEstimateBase] = useState('');
  const [taxEstimateRate, setTaxEstimateRate] = useState('');
  const [taxEstimateSource, setTaxEstimateSource] = useState('');
  const [taxEstimateNote, setTaxEstimateNote] = useState('');
  const [taxReserve, setTaxReserve] = useState('');
  const [taxReserveNote, setTaxReserveNote] = useState('');
  const [taxLiability, setTaxLiability] = useState('');
  const [accountantReference, setAccountantReference] = useState('');
  const [taxPaymentAmount, setTaxPaymentAmount] = useState('');
  const [taxPaymentReference, setTaxPaymentReference] = useState('');
  const refreshRequestId = useRef(0);
  const refreshRef = useRef<() => Promise<void>>(async () => {});

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestId.current;
    setLoading(true); setError('');
    try {
      const [result, adjustmentResult, commitmentPeriods, policyResult] = await Promise.all([
        nightjarAccount.adminListRevenueSettlements(periodId),
        nightjarAccount.adminListRevenueAdjustments(periodId),
        nightjarAccount.adminListCommitmentPeriods(),
        nightjarAccount.adminListFinancePolicies(),
      ]);
      if (requestId !== refreshRequestId.current) return;
      setSettlements(result.settlements as Settlement[]);
      setAdjustments(adjustmentResult.adjustments as Adjustment[]);
      setCommitmentPeriodStatus(commitmentPeriods.periods.find((item) => item.id === periodId)?.status ?? 'missing');
      setFinancePolicies(policyResult.policies as FinancePolicy[]);
    } catch (cause) {
      if (requestId !== refreshRequestId.current) return;
      setSettlements([]); setAdjustments([]); setFinancePolicies([]); setCommitmentPeriodStatus('unavailable');
      setError(cause instanceof Error ? cause.message : 'Revenue settlements could not be loaded.');
    }
    try {
      const payout = await nightjarAccount.adminGetCreatorPayoutPeriod(periodId);
      if (requestId !== refreshRequestId.current) return;
      setPayoutPeriod(payout as PayoutPeriod);
    } catch (cause) {
      if (requestId !== refreshRequestId.current) return;
      setPayoutPeriod(null);
      const code = cause && typeof cause === 'object' && 'code' in cause ? String((cause as { code: unknown }).code) : '';
      if (code !== 'functions/not-found' && code !== 'not-found') {
        setError(cause instanceof Error ? cause.message : 'The payout ledger could not be loaded.');
      }
    }
    try {
      const tax = await nightjarAccount.adminGetTaxLedger(periodId);
      if (requestId !== refreshRequestId.current) return;
      setTaxLedger(tax);
      const latestEstimate = tax.estimates?.[0];
      if (latestEstimate) {
        const category = latestEstimate.category;
        setTaxEstimateCategory((['corporation_tax', 'income_tax', 'vat', 'paye_ni', 'other'] as string[]).includes(category)
          ? category as 'corporation_tax' | 'income_tax' | 'vat' | 'paye_ni' | 'other' : 'other');
        setTaxEstimateBase((latestEstimate.taxableBasePence / 100).toFixed(2));
        setTaxEstimateRate((latestEstimate.rateBasisPoints / 100).toString());
        setTaxEstimateSource('');
        setTaxEstimateNote('');
      } else {
        setTaxEstimateBase(''); setTaxEstimateRate(''); setTaxEstimateSource(''); setTaxEstimateNote('');
      }
      if (tax.ledger) {
        setTaxReserve((tax.ledger.reservePence === undefined ? '' : (tax.ledger.reservePence / 100).toFixed(2)));
        setTaxLiability((tax.ledger.confirmedLiabilityPence === undefined ? '' : (tax.ledger.confirmedLiabilityPence / 100).toFixed(2)));
        setTaxReserveNote(tax.ledger.reserveNote ?? '');
        setAccountantReference(tax.ledger.accountantReference ?? '');
      } else {
        setTaxReserve(''); setTaxLiability(''); setTaxReserveNote(''); setAccountantReference('');
      }
    } catch (cause) {
      if (requestId !== refreshRequestId.current) return;
      setTaxLedger({ ledger: null, payments: [], estimates: [], reserveEntries: [], liabilityEntries: [] });
      setError(cause instanceof Error ? cause.message : 'The tax ledger could not be loaded.');
    } finally { if (requestId === refreshRequestId.current) setLoading(false); }
  }, [periodId]);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    setSettlements([]); setAdjustments([]); setPayoutPeriod(null); setCommitmentPeriodStatus('missing');
    setExternalId(''); setSettledAt(periodId + '-01'); setSourceReference(''); setGross('');
    setRefunds('0'); setChargebacks('0'); setFees('0'); setVat('0'); setOtherDeductions('0');
    setReconciliationNotes({}); setPaymentRefs({}); setPaymentAmounts({});
    setTaxLedger({ ledger: null, payments: [], estimates: [], reserveEntries: [], liabilityEntries: [] }); setTaxReserve(''); setTaxReserveNote('');
    setTaxEstimateCategory('other'); setTaxEstimateBase(''); setTaxEstimateRate(''); setTaxEstimateSource(''); setTaxEstimateNote('');
    setTaxLiability(''); setAccountantReference(''); setTaxPaymentAmount(''); setTaxPaymentReference('');
  }, [periodId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(''); setMessage('');
    try { await action(); setMessage(success); await refreshRef.current(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The finance action could not be completed.'); }
    finally { setBusy(''); }
  };

  const recordSettlement = () => run('settlement', () => nightjarAccount.adminRecordRevenueSettlement({
    periodId, provider: 'stripe', externalId: externalId.trim(), settledAt,
    sourceReference: sourceReference.trim(), grossPence: pence(gross),
    refundPence: pence(refunds), chargebackPence: pence(chargebacks),
    processorFeePence: pence(fees), vatPence: pence(vat), otherDeductionsPence: pence(otherDeductions),
  }), 'Stripe settlement recorded for reconciliation.');

  const reconcile = (settlement: Settlement) => run('reconcile-' + settlement.id, () => nightjarAccount.adminReconcileRevenueSettlement({
    settlementId: settlement.id,
    reconciliationNote: reconciliationNotes[settlement.id] ?? '',
  }), 'Settlement reconciled.');

  const saveFinancePolicy = () => run('policy', () => nightjarAccount.adminCreateFinancePolicy({
    effectiveFrom: policyEffectiveMonth + '-01',
    subscriptionPricePence: pence(policySubscriptionPrice),
    creatorPoolPercent: Number(policyCreatorPercent),
    nightjarPoolPercent: Number(policyNightjarPercent),
    ownerPoolPercent: Number(policyOwnerPercent),
    taxReservePercent: Number(policyTaxReservePercent),
  }), 'Immutable finance policy saved. Existing subscriptions and Stripe prices were not changed.');

  const prepare = () => run('prepare', () => nightjarAccount.adminPrepareCreatorPayoutPeriod(periodId), 'Creator Pool calculation prepared as a draft.');
  const recordAdjustment = () => run('adjustment', () => nightjarAccount.adminRecordRevenueAdjustment({
    periodId, amountPence: pence(adjustmentAmount), reason: adjustmentReason.trim(), sourceReference: adjustmentReference.trim(),
  }), 'Audited revenue adjustment recorded.');

  const approve = () => run('approve', () => nightjarAccount.adminApproveCreatorPayoutPeriod(periodId), 'Creator Pool draft approved. Payments remain manual.');

  const recordPayment = (payout: Payout) => run('pay-' + payout.userId, () => nightjarAccount.adminRecordCreatorPayment({
    periodId, userId: payout.userId, amountPence: pence(paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)),
    reference: paymentRefs[payout.userId] ?? '', paidAt: today,
  }), 'Manual payment record added.');

  const taxEstimateRateBasisPoints = (() => {
    const rate = Number(taxEstimateRate);
    if (!taxEstimateRate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100 || Math.round(rate * 100) !== rate * 100) return Number.NaN;
    return Math.round(rate * 100);
  })();
  const taxEstimateValid = positiveMoney(taxEstimateBase)
    && Number.isInteger(taxEstimateRateBasisPoints) && taxEstimateRateBasisPoints >= 0 && taxEstimateRateBasisPoints <= 10000
    && taxEstimateSource.trim().length >= 4 && taxEstimateNote.trim().length >= 8;

  const saveTaxEstimate = () => run('tax-estimate', () => nightjarAccount.adminSetTaxEstimate({
    periodId, category: taxEstimateCategory, taxableBasePence: pence(taxEstimateBase),
    rateBasisPoints: taxEstimateRateBasisPoints, sourceReference: taxEstimateSource.trim(), note: taxEstimateNote.trim(),
  }), 'Explicit-assumption tax estimate saved. No confirmed liability or tax payment was changed.');

  const saveTaxReserve = () => run('tax-reserve', () => nightjarAccount.adminSetTaxReserve({
    periodId, reservePence: pence(taxReserve), note: taxReserveNote.trim(),
  }), 'Cash reserve recorded. This is not a tax calculation or payment.');

  const confirmTaxLiability = () => run('tax-liability', () => nightjarAccount.adminSetConfirmedTaxLiability({
    periodId, liabilityPence: pence(taxLiability), accountantReference: accountantReference.trim(),
  }), 'Accountant-confirmed tax liability recorded.');

  const recordTaxPayment = () => run('tax-payment', () => nightjarAccount.adminRecordTaxPayment({
    periodId, amountPence: pence(taxPaymentAmount), reference: taxPaymentReference.trim(), paidAt: today,
  }), 'Tax payment record added.');


  const reconciled = settlements.filter((item) => item.status === 'reconciled').length;
  const pending = settlements.length - reconciled;
  const sumSafePence = (values: number[]) => values.reduce<number | null>((sum, value) => sum !== null && Number.isSafeInteger(sum + value) ? sum + value : null, 0);
  const grossPence = sumSafePence(settlements.map((item) => item.grossPence));
  const eligibleNetPence = sumSafePence(settlements.filter((item) => item.status === 'reconciled').map((item) => item.eligibleNetRevenuePence));
  const settlementInputsValid = [gross, refunds, chargebacks, fees, vat, otherDeductions].every(nonNegativeMoney) && positiveMoney(gross);
  const settlementNetPreviewPence = settlementInputsValid ? pence(gross) - pence(refunds) - pence(chargebacks) - pence(fees) - pence(vat) - pence(otherDeductions) : null;
  const settlementCanRecord = settlementNetPreviewPence !== null && settlementNetPreviewPence >= 0;
  const adjustmentValid = Number.isSafeInteger(pence(adjustmentAmount)) && pence(adjustmentAmount) !== 0;
  const taxReserveValid = taxReserve.trim().length > 0 && nonNegativeMoney(taxReserve);
  const taxLiabilityValid = taxLiability.trim().length > 0 && nonNegativeMoney(taxLiability);
  const taxPaymentValid = positiveMoney(taxPaymentAmount);
  const policyPriceValid = positiveMoney(policySubscriptionPrice);
  const policyPercentages = [policyCreatorPercent, policyNightjarPercent, policyOwnerPercent, policyTaxReservePercent].map((value) => /^\d+$/.test(value.trim()) ? Number(value) : Number.NaN);
  const policyPercentagesValid = policyPercentages.every((value) => Number.isInteger(value) && value >= 0 && value <= 100);
  const policyPercentTotal = policyPercentagesValid ? policyPercentages.reduce((sum, value) => sum + value, 0) : null;
  const financePolicyForPeriod = financePolicies
    .filter((policy) => policy.effectiveFrom <= periodId + '-01' && policy.status === 'active')
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
  const effectivePolicyLabel = financePolicyForPeriod
    ? `v${financePolicyForPeriod.version} · ${financePolicyForPeriod.effectiveFrom}`
    : 'No effective policy';

  return <section className="nj-compensation-admin panel" aria-label="Compensation control centre">
    <header><div><span className="mini-label">NIGHTJAR / FINANCIAL CONTROL</span><h2>Compensation Control Centre</h2><p>Reconcile settled revenue, apply the saved allocation policy, approve the ledger and record payments manually.</p></div><WalletCards size={22}/></header>
    {error && <p className="nj-compensation-error" role="alert">{error}</p>}
    {message && <p className="nj-compensation-success" role="status">{message}</p>}
    <div className="nj-compensation-toolbar"><label>Finance period<input type="month" value={periodId} onChange={(event) => setPeriodId(event.target.value)}/></label><span>Commitment period: <strong>{commitmentPeriodStatus.replaceAll('_', ' ')}</strong></span><button type="button" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></div>

    <div className="nj-compensation-stats">
      <div><span>Recorded gross receipts</span><strong>{grossPence === null ? '—' : money(grossPence)}</strong></div>
      <div><span>Reconciled eligible net</span><strong>{eligibleNetPence === null ? '—' : money(eligibleNetPence)}</strong></div>
      <div><span>Settlements reconciled</span><strong>{reconciled} / {settlements.length}</strong></div>
    </div>

    <article className="nj-compensation-card nj-finance-policy-card">
      <span className="mini-label">00 / EFFECTIVE-DATED FINANCE POLICY</span>
      <h3>Subscription planning and pool allocation</h3>
      <p>Save a versioned policy for a future/current open month. Creator Pool, NightJar operations, Meg & Mike and the optional tax reserve must total exactly 100%. Existing payout periods keep their saved policy snapshot.</p>
      <div className="nj-compensation-stats">
        <div><span>Policy effective for selected period</span><strong>{effectivePolicyLabel}</strong></div>
        <div><span>Creator Pool</span><strong>{financePolicyForPeriod ? financePolicyForPeriod.creatorPoolPercent + '%' : 'Not configured'}</strong></div>
        <div><span>Subscription price assumption</span><strong>{financePolicyForPeriod ? money(financePolicyForPeriod.subscriptionPricePence) + ' / month' : 'Not configured'}</strong></div>
      </div>
      <div className="nj-compensation-form-grid">
        <label>Effective month<input type="month" min={month} value={policyEffectiveMonth} onChange={(event) => setPolicyEffectiveMonth(event.target.value)}/></label>
        <label>Monthly price for new subscribers (£)<input type="number" min="0.01" step="0.01" value={policySubscriptionPrice} onChange={(event) => setPolicySubscriptionPrice(event.target.value)}/></label>
        <label>Creator Pool (%)<input type="number" min="0" max="100" step="1" value={policyCreatorPercent} onChange={(event) => setPolicyCreatorPercent(event.target.value)}/></label>
        <label>NightJar operations pool (%)<input type="number" min="0" max="100" step="1" value={policyNightjarPercent} onChange={(event) => setPolicyNightjarPercent(event.target.value)}/></label>
        <label>Meg & Mike pool (%)<input type="number" min="0" max="100" step="1" value={policyOwnerPercent} onChange={(event) => setPolicyOwnerPercent(event.target.value)}/></label>
        <label>Tax reserve allocation (%) · optional<input type="number" min="0" max="100" step="1" value={policyTaxReservePercent} onChange={(event) => setPolicyTaxReservePercent(event.target.value)}/></label>
        <div className="nj-compensation-net-preview"><span>Allocation total</span><strong>{policyPercentTotal === null ? 'Enter whole percentages from 0 to 100.' : policyPercentTotal + '% / 100%'}</strong></div>
      </div>
      <p className="nj-compensation-footnote">The £ price is a planning value for new subscriptions only. Saving this policy does not create or change Stripe prices, update existing customer agreements or collect payment. The Meg & Mike pool is an accounting allocation, not an automatic founder payout. A non-zero tax reserve allocates cash to a bookkeeping bucket only; it is not a tax estimate, confirmed liability or payment.</p>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'policy' || !policyPriceValid || !policyPercentagesValid || policyPercentTotal !== 100 || !/^\d{4}-\d{2}$/.test(policyEffectiveMonth)} onClick={() => void saveFinancePolicy()}>{busy === 'policy' ? 'Saving policy…' : 'Save immutable finance policy'}</button>
      {!!financePolicies.length && <div className="nj-finance-policy-history">
        <h4>Saved policy versions</h4>
        {financePolicies.map((policy) => <div className="nj-settlement-row" key={policy.id}>
          <div className="nj-settlement-head"><strong>Version {policy.version} · {policy.effectiveFrom}</strong><span>{policy.status}</span></div>
          <div className="nj-settlement-amounts"><span>New subscription planning price {money(policy.subscriptionPricePence)}/month</span><span>Creator {policy.creatorPoolPercent}%</span><span>NightJar {policy.nightjarPoolPercent}%</span><span>Meg & Mike {policy.ownerPoolPercent}%</span><strong>Tax reserve {policy.taxReservePercent}%</strong></div>
        </div>)}
      </div>}
    </article>

    <article className="nj-compensation-card">
      <span className="mini-label">01 / STRIPE SETTLEMENT IMPORT</span><h3>Record a settled Stripe payout</h3>
      <p>This is an auditable manual source entry, not a live Stripe webhook. Enter figures from the Stripe payout/balance report. MRR and unpaid invoices are not accepted as cash received.</p>
      <div className="nj-compensation-form-grid">
        <label>Stripe payout / balance reference<input value={externalId} onChange={(event) => setExternalId(event.target.value)} placeholder="po_… or txn_…"/></label>
        <label>Settlement date<input type="date" value={settledAt} onChange={(event) => setSettledAt(event.target.value)}/></label>
        <label className="wide">Source report reference<input value={sourceReference} onChange={(event) => setSourceReference(event.target.value)} placeholder="Stripe payout reconciliation report / export reference"/></label>
        <label>Gross receipts (£)<input type="number" min="0" step="0.01" value={gross} onChange={(event) => setGross(event.target.value)}/></label>
        <label>Refunds (£)<input type="number" min="0" step="0.01" value={refunds} onChange={(event) => setRefunds(event.target.value)}/></label>
        <label>Chargebacks (£)<input type="number" min="0" step="0.01" value={chargebacks} onChange={(event) => setChargebacks(event.target.value)}/></label>
        <label>Processor fees (£)<input type="number" min="0" step="0.01" value={fees} onChange={(event) => setFees(event.target.value)}/></label>
        <label>VAT collected (£)<input type="number" min="0" step="0.01" value={vat} onChange={(event) => setVat(event.target.value)}/></label>
        <label>Other deductions (£)<input type="number" min="0" step="0.01" value={otherDeductions} onChange={(event) => setOtherDeductions(event.target.value)}/></label>
      </div>
      <div className="nj-compensation-net-preview"><span>Calculated eligible net revenue for this entry</span><strong>{settlementNetPreviewPence === null ? 'Enter valid amounts to two decimal places; deductions cannot be negative.' : settlementNetPreviewPence < 0 ? 'Deductions cannot exceed gross receipts.' : money(settlementNetPreviewPence)}</strong></div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'settlement' || !externalId.trim() || !sourceReference.trim() || !settlementCanRecord || settledAt.slice(0, 7) !== periodId} onClick={() => void recordSettlement()}>{busy === 'settlement' ? 'Recording…' : 'Record settlement'}</button>
    </article>

    <article className="nj-compensation-card nj-revenue-adjustments">
      <span className="mini-label">02 / AUDITED CORRECTIONS</span><h3>Revenue adjustment entries</h3>
      <p>Use a separate signed adjustment to correct a reconciled source figure. Original settlement records are never silently overwritten. Adjustments lock when the Creator Pool is prepared.</p>
      <div className="nj-compensation-form-grid">
        <label>Adjustment (£, negative or positive)<input type="number" step="0.01" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} placeholder="-12.50 or 12.50"/></label>
        <label>Source reference<input value={adjustmentReference} onChange={(event) => setAdjustmentReference(event.target.value)} placeholder="Correction report reference"/></label>
        <label className="wide">Reason<textarea rows={2} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Explain why this adjustment is required…"/></label>
      </div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'adjustment' || !adjustmentAmount || !adjustmentReference.trim() || adjustmentReason.trim().length < 8 || !adjustmentValid} onClick={() => void recordAdjustment()}>{busy === 'adjustment' ? 'Recording…' : 'Record audited adjustment'}</button>
      {adjustments.map((item) => <div className="nj-adjustment-row" key={item.id}><div><strong>{item.sourceReference}</strong><small>{item.reason}</small></div><strong>{money(item.amountPence)}</strong></div>)}
    </article>

    <article className="nj-compensation-card">
      <span className="mini-label">02 / RECONCILIATION</span><h3>Settlement register</h3>
      {loading ? <p>Loading settlement register…</p> : !settlements.length ? <p>No settled revenue has been recorded for this period.</p> : settlements.map((item) => <div className="nj-settlement-row" key={item.id}>
        <div className="nj-settlement-head"><strong>{item.externalId}</strong><span data-status={item.status}>{item.status.replaceAll('_', ' ')}</span></div>
        <small>{item.settledAt} · Source: {item.sourceReference}</small>
        <div className="nj-settlement-amounts"><span>Gross {money(item.grossPence)}</span><span>Refunds {money(item.refundPence)}</span><span>Chargebacks {money(item.chargebackPence)}</span><span>Fees {money(item.processorFeePence)}</span><span>VAT {money(item.vatPence)}</span><span>Other deductions {money(item.otherDeductionsPence)}</span><strong>Net {money(item.eligibleNetRevenuePence)}</strong></div>
        {item.status === 'pending_reconciliation' && <div className="nj-settlement-reconcile"><textarea rows={2} value={reconciliationNotes[item.id] ?? ''} onChange={(event) => setReconciliationNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Confirm the Stripe source report and explain the reconciliation…"/><button type="button" disabled={busy === 'reconcile-' + item.id || (reconciliationNotes[item.id] ?? '').trim().length < 8} onClick={() => void reconcile(item)}><CheckCircle2 size={14}/> Mark reconciled</button></div>}
      </div>)}
    </article>

    <article className="nj-compensation-card">
      <span className="mini-label">03 / CREATOR POOL</span><h3>Prepare equal-share calculation</h3>
      <p>Once the commitment period is closed and every settlement is reconciled, Nightjar applies the effective-dated Creator Pool percentage and divides that pool equally between eligible individuals. One individual receives one share regardless of role count.</p>
      {payoutPeriod ? <div className="nj-payout-period">
        <div className="nj-payout-period-status"><strong>{payoutPeriod.period.periodId} · {payoutPeriod.period.status.toUpperCase()}</strong><span>{payoutPeriod.period.eligibleCreatorCount} eligible individuals</span></div>
        <div className="nj-compensation-stats">
          <div><span>Eligible net revenue</span><strong>{money(payoutPeriod.period.eligibleNetRevenuePence)}</strong></div>
          <div><span>Creator Pool ({payoutPeriod.period.creatorPoolPercent}%)</span><strong>{money(payoutPeriod.period.creatorPoolPence)}</strong></div>
          <div><span>NightJar operations ({payoutPeriod.period.nightjarPoolPercent}%)</span><strong>{money(payoutPeriod.period.nightjarPoolPence)}</strong></div>
          <div><span>Meg & Mike pool ({payoutPeriod.period.ownerPoolPercent}%)</span><strong>{money(payoutPeriod.period.ownerPoolPence)}</strong></div>
          <div><span>Tax reserve allocation ({payoutPeriod.period.taxReservePercent}%)</span><strong>{money(payoutPeriod.period.taxReservePoolPence)}</strong></div>
          <div><span>Unallocated Creator Pool</span><strong>{money(payoutPeriod.period.unallocatedCreatorPoolPence)}</strong></div>
        </div>
        <div className="nj-compensation-unallocated"><CircleAlert size={16}/><span>These are policy allocations in the draft ledger, not bank movements. NightJar and Meg & Mike amounts are not automatic transfers or founder distributions. The Tax Reserve amount is not yet cash segregated or tax paid; record only an actual cash reserve in the separate tax ledger below.</span></div>
        {payoutPeriod.period.status === 'draft' && <button className="nj-compensation-primary" type="button" disabled={busy === 'approve'} onClick={() => void approve()}>{busy === 'approve' ? 'Approving…' : 'Approve payout ledger'}</button>}
        {payoutPeriod.payouts.map((payout) => <div className="nj-payout-row" key={payout.userId}>
          <div><strong>{payout.displayName || payout.userId}</strong><small>{roleName(payout.qualifyingRole)} · {payout.status} · Account {payout.userId}</small></div>
          <div><strong>{money(payout.amountPence)}</strong><small>Paid {money(payout.paidPence)} · Outstanding {money(payout.outstandingPence)}</small></div>
          {payoutPeriod.period.status === 'approved' && payout.outstandingPence > 0 && <div className="nj-payout-payment-form">
            <input aria-label="Manual payment reference" value={paymentRefs[payout.userId] ?? ''} onChange={(event) => setPaymentRefs((current) => ({ ...current, [payout.userId]: event.target.value }))} placeholder="Bank payment reference"/>
            <input aria-label="Manual payment amount in pounds" type="number" min="0.01" max={payout.outstandingPence / 100} step="0.01" value={paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [payout.userId]: event.target.value }))}/>
            <button type="button" disabled={busy === 'pay-' + payout.userId || !(paymentRefs[payout.userId] ?? '').trim() || !positiveMoney(paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)) || pence(paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)) > payout.outstandingPence} onClick={() => void recordPayment(payout)}><Banknote size={13}/> Record payment</button>
          </div>}
        </div>)}
      </div> : <div className="nj-compensation-empty"><ShieldCheck size={17}/><span>No payout ledger exists for this period yet. It will only be created after all source settlements are reconciled and the commitment period is closed.</span></div>}
      {!payoutPeriod && <><p className="nj-compensation-period-gate">{commitmentPeriodStatus === 'closed' ? 'Assessment period closed. Finance reconciliation can now be prepared.' : 'The matching commitment period must be closed and an effective finance policy must exist before a Creator Pool draft can be prepared.'}</p><button className="nj-compensation-primary" type="button" disabled={busy === 'prepare' || pending > 0 || !settlements.length || commitmentPeriodStatus !== 'closed' || !financePolicyForPeriod} onClick={() => void prepare()}>{busy === 'prepare' ? 'Preparing…' : 'Prepare Creator Pool draft'}</button></>}
    </article>
    <article className="nj-compensation-card nj-tax-ledger">
      <span className="mini-label">04 / TAX RESERVE & LIABILITY LEDGER</span><h3>Keep reserves separate from tax actually due</h3>
      <p>No tax rate is assumed. The Tax Reserve percentage above is a policy allocation only. Record cash here only after it has actually been set aside; then record an accountant-confirmed liability separately and actual tax payments against that liability.</p>
      <div className="nj-tax-estimate-panel">
        <h4>Transparent tax estimate</h4>
        <p>Enter the taxable base and rate supplied by your accountant or chosen planning assumption. NightJar performs the arithmetic only; it does not choose a tax regime, rate or deductible base.</p>
        <div className="nj-compensation-form-grid">
          <label>Estimate category<select value={taxEstimateCategory} onChange={(event) => setTaxEstimateCategory(event.target.value as typeof taxEstimateCategory)}>
            <option value="corporation_tax">Corporation tax</option><option value="income_tax">Income tax</option><option value="vat">VAT</option><option value="paye_ni">PAYE / National Insurance</option><option value="other">Other / planning estimate</option>
          </select></label>
          <label>Taxable base (£)<input type="number" min="0.01" step="0.01" value={taxEstimateBase} onChange={(event) => setTaxEstimateBase(event.target.value)} placeholder="Enter the base"/></label>
          <label>Assumed rate (%)<input type="number" min="0" max="100" step="0.01" value={taxEstimateRate} onChange={(event) => setTaxEstimateRate(event.target.value)} placeholder="No rate assumed"/></label>
          <label>Source reference<input value={taxEstimateSource} onChange={(event) => setTaxEstimateSource(event.target.value)} placeholder="Accountant note / planning source"/></label>
          <label className="wide">Assumption note<textarea rows={2} maxLength={1000} value={taxEstimateNote} onChange={(event) => setTaxEstimateNote(event.target.value)} placeholder="Record the period, tax basis and why this assumption is being used…"/></label>
        </div>
        <button className="nj-compensation-primary" type="button" disabled={busy === 'tax-estimate' || !taxEstimateValid} onClick={() => void saveTaxEstimate()}>{busy === 'tax-estimate' ? 'Calculating…' : 'Save tax estimate'}</button>
        {!!taxLedger.estimates.length && <div className="nj-tax-estimate-history">
          <h4>Saved estimates for {periodId}</h4>
          {taxLedger.estimates.map((estimate) => <div className="nj-settlement-row" key={estimate.id}>
            <div className="nj-settlement-head"><strong>{estimate.category.replaceAll('_', ' ')}</strong><span>{money(estimate.estimatedTaxPence)} estimate</span></div>
            <div className="nj-settlement-amounts"><span>Base {money(estimate.taxableBasePence)}</span><span>Assumed rate {(estimate.rateBasisPoints / 100).toFixed(2)}%</span><strong>{estimate.sourceReference}</strong></div>
            <small>{estimate.note}</small>
          </div>)}
        </div>}
      </div>
      <div className="nj-compensation-stats">
        <div><span>Cash reserve</span><strong>{money(taxLedger.ledger?.reservePence ?? 0)}</strong></div>
        <div><span>Confirmed liability</span><strong>{money(taxLedger.ledger?.confirmedLiabilityPence ?? 0)}</strong></div>
        <div><span>Recorded as paid</span><strong>{money(taxLedger.ledger?.paidPence ?? 0)}</strong></div>
      </div>
      <div className="nj-compensation-form-grid">
        <label>Actual cash set aside (£)<input type="number" min="0" step="0.01" value={taxReserve} onChange={(event) => setTaxReserve(event.target.value)} placeholder="Amount already reserved"/></label>
        <label className="wide">Reserve note<input value={taxReserveNote} onChange={(event) => setTaxReserveNote(event.target.value)} placeholder="Why this cash amount is being reserved"/></label>
      </div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'tax-reserve' || !taxReserveValid || taxReserveNote.trim().length < 8} onClick={() => void saveTaxReserve()}>{busy === 'tax-reserve' ? 'Saving…' : 'Save cash reserve'}</button>
      <div className="nj-compensation-form-grid nj-tax-liability-form">
        <label>Accountant-confirmed liability (£)<input type="number" min="0" step="0.01" value={taxLiability} onChange={(event) => setTaxLiability(event.target.value)} placeholder="Only after professional confirmation"/></label>
        <label>Accountant / HMRC reference<input value={accountantReference} onChange={(event) => setAccountantReference(event.target.value)} placeholder="Reference or source"/></label>
      </div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'tax-liability' || accountantReference.trim().length < 4 || !taxLiabilityValid} onClick={() => void confirmTaxLiability()}>{busy === 'tax-liability' ? 'Saving…' : 'Record confirmed liability'}</button>
      {!!taxLedger.ledger?.confirmedLiabilityPence && <div className="nj-compensation-form-grid nj-tax-liability-form">
        <label>Actual payment (£)<input type="number" min="0.01" step="0.01" value={taxPaymentAmount} onChange={(event) => setTaxPaymentAmount(event.target.value)} placeholder="Amount paid"/></label>
        <label>Payment reference<input value={taxPaymentReference} onChange={(event) => setTaxPaymentReference(event.target.value)} placeholder="Bank / HMRC payment reference"/></label>
      </div>}
      {!!taxLedger.ledger?.confirmedLiabilityPence && <button className="nj-compensation-primary" type="button" disabled={busy === 'tax-payment' || !taxPaymentReference.trim() || !taxPaymentValid} onClick={() => void recordTaxPayment()}>{busy === 'tax-payment' ? 'Recording…' : 'Record actual tax payment'}</button>}
      <h4>Cash reserve history</h4>
      {taxLedger.reserveEntries.map((entry) => <div className="nj-tax-payment-row" key={entry.id}><span>{entry.note}</span><strong>{money(entry.reservePence)}</strong></div>)}
      <h4>Confirmed liability history</h4>
      {taxLedger.liabilityEntries.map((entry) => <div className="nj-tax-payment-row" key={entry.id}><span>{entry.accountantReference}</span><strong>{money(entry.liabilityPence)}</strong></div>)}
      {taxLedger.payments.map((payment) => <div className="nj-tax-payment-row" key={payment.id}><span>{payment.paidAt} · {payment.reference}</span><strong>{money(payment.amountPence)}</strong></div>)}
    </article>
    <p className="nj-compensation-footnote">No bank transfers or automatic payouts are initiated here. This centre records reconciled source data, approved payout liabilities and payment references. Tax liabilities and payments require their own accountant-confirmed ledger.</p>
  </section>;
}
