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
type PayoutPeriod = {
  period: { periodId: string; status: string; eligibleNetRevenuePence: number; creatorPoolPercent: number; creatorPoolPence: number; eligibleCreatorCount: number; totalAllocatedPence: number; unallocatedCreatorPoolPence: number; nonCreatorRemainderPence: number };
  payouts: Payout[];
};
const today = (() => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; })();
const month = today.slice(0, 7);
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const pence = (value: string) => Math.round((Number(value) || 0) * 100);
const roleName = (role: string | null) => role === 'creator' ? 'VA Creator' : role === 'writer' ? 'Writer' : role === 'editor' ? 'Audio Editor' : role === 'artist' ? 'Artist' : 'Creative role';

export default function CompensationControlCentre() {
  const [periodId, setPeriodId] = useState(month);
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
  const [taxLedger, setTaxLedger] = useState<{ ledger: { periodId: string; reservePence?: number; reserveNote?: string; confirmedLiabilityPence?: number; accountantReference?: string; paidPence?: number } | null; payments: Array<{ id: string; amountPence: number; reference: string; paidAt: string }> }>({ ledger: null, payments: [] });
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
      const [result, adjustmentResult, commitmentPeriods] = await Promise.all([
        nightjarAccount.adminListRevenueSettlements(periodId),
        nightjarAccount.adminListRevenueAdjustments(periodId),
        nightjarAccount.adminListCommitmentPeriods(),
      ]);
      if (requestId !== refreshRequestId.current) return;
      setSettlements(result.settlements as Settlement[]);
      setAdjustments(adjustmentResult.adjustments as Adjustment[]);
      setCommitmentPeriodStatus(commitmentPeriods.periods.find((item) => item.id === periodId)?.status ?? 'missing');
    } catch (cause) {
      if (requestId !== refreshRequestId.current) return;
      setSettlements([]); setAdjustments([]); setCommitmentPeriodStatus('unavailable');
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
      setTaxLedger({ ledger: null, payments: [] });
      setError(cause instanceof Error ? cause.message : 'The tax ledger could not be loaded.');
    } finally { if (requestId === refreshRequestId.current) setLoading(false); }
  }, [periodId]);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);
  useEffect(() => {
    setSettlements([]); setAdjustments([]); setPayoutPeriod(null); setCommitmentPeriodStatus('missing');
    setExternalId(''); setSettledAt(periodId + '-01'); setSourceReference(''); setGross('');
    setRefunds('0'); setChargebacks('0'); setFees('0'); setVat('0'); setOtherDeductions('0');
    setReconciliationNotes({}); setPaymentRefs({}); setPaymentAmounts({});
    setTaxLedger({ ledger: null, payments: [] }); setTaxReserve(''); setTaxReserveNote('');
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

  const prepare = () => run('prepare', () => nightjarAccount.adminPrepareCreatorPayoutPeriod(periodId), 'Creator Pool calculation prepared as a draft.');
  const recordAdjustment = () => run('adjustment', () => nightjarAccount.adminRecordRevenueAdjustment({
    periodId, amountPence: pence(adjustmentAmount), reason: adjustmentReason.trim(), sourceReference: adjustmentReference.trim(),
  }), 'Audited revenue adjustment recorded.');

  const approve = () => run('approve', () => nightjarAccount.adminApproveCreatorPayoutPeriod(periodId), 'Creator Pool draft approved. Payments remain manual.');

  const recordPayment = (payout: Payout) => run('pay-' + payout.userId, () => nightjarAccount.adminRecordCreatorPayment({
    periodId, userId: payout.userId, amountPence: pence(paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)),
    reference: paymentRefs[payout.userId] ?? '', paidAt: today,
  }), 'Manual payment record added.');

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
  const grossPence = settlements.reduce((sum, item) => sum + item.grossPence, 0);
  const eligibleNetPence = settlements.filter((item) => item.status === 'reconciled').reduce((sum, item) => sum + item.eligibleNetRevenuePence, 0);

  return <section className="nj-compensation-admin panel" aria-label="Compensation control centre">
    <header><div><span className="mini-label">NIGHTJAR / FINANCIAL CONTROL</span><h2>Compensation Control Centre</h2><p>Reconcile settled revenue, prepare the 50% Creator Pool, approve the ledger and record payments manually.</p></div><WalletCards size={22}/></header>
    {error && <p className="nj-compensation-error" role="alert">{error}</p>}
    {message && <p className="nj-compensation-success" role="status">{message}</p>}
    <div className="nj-compensation-toolbar"><label>Finance period<input type="month" value={periodId} onChange={(event) => setPeriodId(event.target.value)}/></label><span>Commitment period: <strong>{commitmentPeriodStatus.replaceAll('_', ' ')}</strong></span><button type="button" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></div>

    <div className="nj-compensation-stats">
      <div><span>Recorded gross receipts</span><strong>{money(grossPence)}</strong></div>
      <div><span>Reconciled eligible net</span><strong>{money(eligibleNetPence)}</strong></div>
      <div><span>Settlements reconciled</span><strong>{reconciled} / {settlements.length}</strong></div>
    </div>

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
      <div className="nj-compensation-net-preview"><span>Calculated eligible net revenue for this entry</span><strong>{money(pence(gross) - pence(refunds) - pence(chargebacks) - pence(fees) - pence(vat) - pence(otherDeductions))}</strong></div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'settlement' || !externalId.trim() || !sourceReference.trim() || !gross || settledAt.slice(0, 7) !== periodId} onClick={() => void recordSettlement()}>{busy === 'settlement' ? 'Recording…' : 'Record settlement'}</button>
    </article>

    <article className="nj-compensation-card nj-revenue-adjustments">
      <span className="mini-label">02 / AUDITED CORRECTIONS</span><h3>Revenue adjustment entries</h3>
      <p>Use a separate signed adjustment to correct a reconciled source figure. Original settlement records are never silently overwritten. Adjustments lock when the Creator Pool is prepared.</p>
      <div className="nj-compensation-form-grid">
        <label>Adjustment (£, negative or positive)<input type="number" step="0.01" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} placeholder="-12.50 or 12.50"/></label>
        <label>Source reference<input value={adjustmentReference} onChange={(event) => setAdjustmentReference(event.target.value)} placeholder="Correction report reference"/></label>
        <label className="wide">Reason<textarea rows={2} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Explain why this adjustment is required…"/></label>
      </div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'adjustment' || !adjustmentAmount || !adjustmentReference.trim() || adjustmentReason.trim().length < 8 || pence(adjustmentAmount) === 0} onClick={() => void recordAdjustment()}>{busy === 'adjustment' ? 'Recording…' : 'Record audited adjustment'}</button>
      {adjustments.map((item) => <div className="nj-adjustment-row" key={item.id}><div><strong>{item.sourceReference}</strong><small>{item.reason}</small></div><strong>{money(item.amountPence)}</strong></div>)}
    </article>

    <article className="nj-compensation-card">
      <span className="mini-label">02 / RECONCILIATION</span><h3>Settlement register</h3>
      {loading ? <p>Loading settlement register…</p> : !settlements.length ? <p>No settled revenue has been recorded for this period.</p> : settlements.map((item) => <div className="nj-settlement-row" key={item.id}>
        <div className="nj-settlement-head"><strong>{item.externalId}</strong><span data-status={item.status}>{item.status.replaceAll('_', ' ')}</span></div>
        <small>{item.settledAt} · Source: {item.sourceReference}</small>
        <div className="nj-settlement-amounts"><span>Gross {money(item.grossPence)}</span><span>Refunds {money(item.refundPence)}</span><span>Chargebacks {money(item.chargebackPence)}</span><span>Fees {money(item.processorFeePence)}</span><span>VAT {money(item.vatPence)}</span><strong>Net {money(item.eligibleNetRevenuePence)}</strong></div>
        {item.status === 'pending_reconciliation' && <div className="nj-settlement-reconcile"><textarea rows={2} value={reconciliationNotes[item.id] ?? ''} onChange={(event) => setReconciliationNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Confirm the Stripe source report and explain the reconciliation…"/><button type="button" disabled={busy === 'reconcile-' + item.id || (reconciliationNotes[item.id] ?? '').trim().length < 8} onClick={() => void reconcile(item)}><CheckCircle2 size={14}/> Mark reconciled</button></div>}
      </div>)}
    </article>

    <article className="nj-compensation-card">
      <span className="mini-label">03 / CREATOR POOL</span><h3>Prepare equal-share calculation</h3>
      <p>Once the commitment period is closed and every settlement is reconciled, Nightjar calculates 50% of eligible net revenue and divides it equally between eligible individuals. One individual receives one share regardless of role count.</p>
      {payoutPeriod ? <div className="nj-payout-period">
        <div className="nj-payout-period-status"><strong>{payoutPeriod.period.periodId} · {payoutPeriod.period.status.toUpperCase()}</strong><span>{payoutPeriod.period.eligibleCreatorCount} eligible individuals</span></div>
        <div className="nj-compensation-stats">
          <div><span>Eligible net revenue</span><strong>{money(payoutPeriod.period.eligibleNetRevenuePence)}</strong></div>
          <div><span>Creator Pool (50%)</span><strong>{money(payoutPeriod.period.creatorPoolPence)}</strong></div>
          <div><span>Unallocated Creator Pool</span><strong>{money(payoutPeriod.period.unallocatedCreatorPoolPence)}</strong></div>
        </div>
        <div className="nj-compensation-unallocated"><CircleAlert size={16}/><span>The remaining 50% ({money(payoutPeriod.period.nonCreatorRemainderPence)}) is deliberately unallocated. Nightjar operations, founder distributions and tax reserves are separate decisions and are not inferred from 50/50 ownership.</span></div>
        {payoutPeriod.period.status === 'draft' && <button className="nj-compensation-primary" type="button" disabled={busy === 'approve'} onClick={() => void approve()}>{busy === 'approve' ? 'Approving…' : 'Approve payout ledger'}</button>}
        {payoutPeriod.payouts.map((payout) => <div className="nj-payout-row" key={payout.userId}>
          <div><strong>{payout.displayName || payout.userId}</strong><small>{roleName(payout.qualifyingRole)} · {payout.status} · Account {payout.userId}</small></div>
          <div><strong>{money(payout.amountPence)}</strong><small>Paid {money(payout.paidPence)} · Outstanding {money(payout.outstandingPence)}</small></div>
          {payoutPeriod.period.status === 'approved' && payout.outstandingPence > 0 && <div className="nj-payout-payment-form">
            <input aria-label="Manual payment reference" value={paymentRefs[payout.userId] ?? ''} onChange={(event) => setPaymentRefs((current) => ({ ...current, [payout.userId]: event.target.value }))} placeholder="Bank payment reference"/>
            <input aria-label="Manual payment amount in pounds" type="number" min="0.01" max={payout.outstandingPence / 100} step="0.01" value={paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [payout.userId]: event.target.value }))}/>
            <button type="button" disabled={busy === 'pay-' + payout.userId || !(paymentRefs[payout.userId] ?? '').trim()} onClick={() => void recordPayment(payout)}><Banknote size={13}/> Record payment</button>
          </div>}
        </div>)}
      </div> : <div className="nj-compensation-empty"><ShieldCheck size={17}/><span>No payout ledger exists for this period yet. It will only be created after all source settlements are reconciled and the commitment period is closed.</span></div>}
      {!payoutPeriod && <><p className="nj-compensation-period-gate">{commitmentPeriodStatus === 'closed' ? 'Assessment period closed. Finance reconciliation can now be prepared.' : 'The matching commitment period must be closed before a Creator Pool draft can be prepared.'}</p><button className="nj-compensation-primary" type="button" disabled={busy === 'prepare' || pending > 0 || !settlements.length || commitmentPeriodStatus !== 'closed'} onClick={() => void prepare()}>{busy === 'prepare' ? 'Preparing…' : 'Prepare Creator Pool draft'}</button></>}
    </article>
    <article className="nj-compensation-card nj-tax-ledger">
      <span className="mini-label">04 / TAX RESERVE & LIABILITY LEDGER</span><h3>Keep reserves separate from tax actually due</h3>
      <p>No tax rate is assumed. Record a cash reserve separately from an accountant-confirmed liability, then record actual tax payments against that liability.</p>
      <div className="nj-compensation-stats">
        <div><span>Cash reserve</span><strong>{money(taxLedger.ledger?.reservePence ?? 0)}</strong></div>
        <div><span>Confirmed liability</span><strong>{money(taxLedger.ledger?.confirmedLiabilityPence ?? 0)}</strong></div>
        <div><span>Recorded as paid</span><strong>{money(taxLedger.ledger?.paidPence ?? 0)}</strong></div>
      </div>
      <div className="nj-compensation-form-grid">
        <label>Cash reserve (£)<input type="number" min="0" step="0.01" value={taxReserve} onChange={(event) => setTaxReserve(event.target.value)} placeholder="Set manually"/></label>
        <label className="wide">Reserve note<input value={taxReserveNote} onChange={(event) => setTaxReserveNote(event.target.value)} placeholder="Why this cash amount is being reserved"/></label>
      </div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'tax-reserve' || taxReserveNote.trim().length < 8} onClick={() => void saveTaxReserve()}>{busy === 'tax-reserve' ? 'Saving…' : 'Save cash reserve'}</button>
      <div className="nj-compensation-form-grid nj-tax-liability-form">
        <label>Accountant-confirmed liability (£)<input type="number" min="0" step="0.01" value={taxLiability} onChange={(event) => setTaxLiability(event.target.value)} placeholder="Only after professional confirmation"/></label>
        <label>Accountant / HMRC reference<input value={accountantReference} onChange={(event) => setAccountantReference(event.target.value)} placeholder="Reference or source"/></label>
      </div>
      <button className="nj-compensation-primary" type="button" disabled={busy === 'tax-liability' || accountantReference.trim().length < 4 || !taxLiability} onClick={() => void confirmTaxLiability()}>{busy === 'tax-liability' ? 'Saving…' : 'Record confirmed liability'}</button>
      {!!taxLedger.ledger?.confirmedLiabilityPence && <div className="nj-compensation-form-grid nj-tax-liability-form">
        <label>Actual payment (£)<input type="number" min="0.01" step="0.01" value={taxPaymentAmount} onChange={(event) => setTaxPaymentAmount(event.target.value)} placeholder="Amount paid"/></label>
        <label>Payment reference<input value={taxPaymentReference} onChange={(event) => setTaxPaymentReference(event.target.value)} placeholder="Bank / HMRC payment reference"/></label>
      </div>}
      {!!taxLedger.ledger?.confirmedLiabilityPence && <button className="nj-compensation-primary" type="button" disabled={busy === 'tax-payment' || !taxPaymentReference.trim() || !taxPaymentAmount} onClick={() => void recordTaxPayment()}>{busy === 'tax-payment' ? 'Recording…' : 'Record actual tax payment'}</button>}
      {taxLedger.payments.map((payment) => <div className="nj-tax-payment-row" key={payment.id}><span>{payment.paidAt} · {payment.reference}</span><strong>{money(payment.amountPence)}</strong></div>)}
    </article>
    <p className="nj-compensation-footnote">No bank transfers or automatic payouts are initiated here. This centre records reconciled source data, approved payout liabilities and payment references. Tax liabilities and payments require their own accountant-confirmed ledger.</p>
  </section>;
}
