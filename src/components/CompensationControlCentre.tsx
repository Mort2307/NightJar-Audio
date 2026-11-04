import { useCallback, useEffect, useState } from 'react';
import { Banknote, CheckCircle2, CircleAlert, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { nightjarAccount, type NightjarCommitmentRole } from '../platform/firebase-account';

type Settlement = {
  id: string; externalId: string; settledAt: string; sourceReference: string;
  grossPence: number; refundPence: number; chargebackPence: number; processorFeePence: number;
  vatPence: number; otherDeductionsPence: number; eligibleNetRevenuePence: number; status: string;
};
type Payout = { userId: string; amountPence: number; paidPence: number; outstandingPence: number; qualifyingRole: NightjarCommitmentRole | null; status: string };
type PayoutPeriod = {
  period: { periodId: string; status: string; eligibleNetRevenuePence: number; creatorPoolPercent: number; creatorPoolPence: number; eligibleCreatorCount: number; totalAllocatedPence: number; unallocatedCreatorPoolPence: number; nonCreatorRemainderPence: number };
  payouts: Payout[];
};
const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);
const money = (pence: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const pence = (value: string) => Math.round((Number(value) || 0) * 100);
const roleName = (role: string | null) => role === 'creator' ? 'VA Creator' : role === 'writer' ? 'Writer' : role === 'editor' ? 'Audio Editor' : role === 'artist' ? 'Artist' : 'Creative role';

export default function CompensationControlCentre() {
  const [periodId, setPeriodId] = useState(month);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [payoutPeriod, setPayoutPeriod] = useState<PayoutPeriod | null>(null);
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

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await nightjarAccount.adminListRevenueSettlements(periodId);
      setSettlements(result.settlements as Settlement[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Revenue settlements could not be loaded.');
    }
    try {
      const payout = await nightjarAccount.adminGetCreatorPayoutPeriod(periodId);
      setPayoutPeriod(payout as PayoutPeriod);
    } catch {
      setPayoutPeriod(null);
    } finally { setLoading(false); }
  }, [periodId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(''); setMessage('');
    try { await action(); setMessage(success); await refresh(); }
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
  const approve = () => run('approve', () => nightjarAccount.adminApproveCreatorPayoutPeriod(periodId), 'Creator Pool draft approved. Payments remain manual.');

  const recordPayment = (payout: Payout) => run('pay-' + payout.userId, () => nightjarAccount.adminRecordCreatorPayment({
    periodId, userId: payout.userId, amountPence: pence(paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)),
    reference: paymentRefs[payout.userId] ?? '', paidAt: today,
  }), 'Manual payment record added.');

  const reconciled = settlements.filter((item) => item.status === 'reconciled').length;
  const pending = settlements.length - reconciled;
  const grossPence = settlements.reduce((sum, item) => sum + item.grossPence, 0);
  const eligibleNetPence = settlements.filter((item) => item.status === 'reconciled').reduce((sum, item) => sum + item.eligibleNetRevenuePence, 0);

  return <section className="nj-compensation-admin panel" aria-label="Compensation control centre">
    <header><div><span className="mini-label">NIGHTJAR / FINANCIAL CONTROL</span><h2>Compensation Control Centre</h2><p>Reconcile settled revenue, prepare the 50% Creator Pool, approve the ledger and record payments manually.</p></div><WalletCards size={22}/></header>
    {error && <p className="nj-compensation-error" role="alert">{error}</p>}
    {message && <p className="nj-compensation-success" role="status">{message}</p>}
    <div className="nj-compensation-toolbar"><label>Finance period<input value={periodId} onChange={(event) => setPeriodId(event.target.value)} maxLength={7} placeholder="YYYY-MM"/></label><button type="button" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></div>

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
          <div><strong>{payout.userId}</strong><small>{roleName(payout.qualifyingRole)} · {payout.status}</small></div>
          <div><strong>{money(payout.amountPence)}</strong><small>Paid {money(payout.paidPence)} · Outstanding {money(payout.outstandingPence)}</small></div>
          {payoutPeriod.period.status === 'approved' && payout.outstandingPence > 0 && <div className="nj-payout-payment-form">
            <input aria-label="Manual payment reference" value={paymentRefs[payout.userId] ?? ''} onChange={(event) => setPaymentRefs((current) => ({ ...current, [payout.userId]: event.target.value }))} placeholder="Bank payment reference"/>
            <input aria-label="Manual payment amount in pounds" type="number" min="0.01" max={payout.outstandingPence / 100} step="0.01" value={paymentAmounts[payout.userId] ?? (payout.outstandingPence / 100).toFixed(2)} onChange={(event) => setPaymentAmounts((current) => ({ ...current, [payout.userId]: event.target.value }))}/>
            <button type="button" disabled={busy === 'pay-' + payout.userId || !(paymentRefs[payout.userId] ?? '').trim()} onClick={() => void recordPayment(payout)}><Banknote size={13}/> Record payment</button>
          </div>}
        </div>)}
      </div> : <div className="nj-compensation-empty"><ShieldCheck size={17}/><span>No payout ledger exists for this period yet. It will only be created after all source settlements are reconciled and the commitment period is closed.</span></div>}
      {!payoutPeriod && <button className="nj-compensation-primary" type="button" disabled={busy === 'prepare' || pending > 0 || !settlements.length} onClick={() => void prepare()}>{busy === 'prepare' ? 'Preparing…' : 'Prepare Creator Pool draft'}</button>}
    </article>
    <p className="nj-compensation-footnote">No bank transfers or automatic payouts are initiated here. This centre records reconciled source data, approved payout liabilities and payment references. Tax liabilities and payments require their own accountant-confirmed ledger.</p>
  </section>;
}
