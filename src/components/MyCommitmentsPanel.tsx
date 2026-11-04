import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, FileCheck2, LoaderCircle, Send } from 'lucide-react';
import { nightjarAccount, type NightjarCommitmentAssignment, type NightjarCommitmentTask } from '../platform/firebase-account';

const roleName = (role: string) => role === 'creator' ? 'VA Creator' : role === 'writer' ? 'Writer' : role === 'editor' ? 'Audio Editor' : 'Artist';
const taskStateLabel = (state: string) => state === 'approved' ? 'Approved' : state === 'submitted' ? 'Awaiting review' : state === 'rejected' ? 'Changes requested' : state === 'cancelled' ? 'Cancelled' : state === 'excused' ? 'Excused' : state === 'in_progress' ? 'In progress' : 'Not started';

export default function MyCommitmentsPanel() {
  const [assignments, setAssignments] = useState<NightjarCommitmentAssignment[]>([]);
  const [eligible, setEligible] = useState(false);
  const [qualifyingRole, setQualifyingRole] = useState<string | null>(null);
  const [compensation, setCompensation] = useState<Array<{ periodId: string; periodStatus: string; amountPence: number; paidPence: number; outstandingPence: number; status: string; qualifyingRole: string | null; payments: Array<{ amountPence: number; reference: string; paidAt: string }> }>>([]);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { note: string; evidenceUrl: string }>>({});
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [commitments, eligibility, compensationResult] = await Promise.all([
        nightjarAccount.getMyCommitments(),
        nightjarAccount.getMyCommitmentEligibility(),
        nightjarAccount.getMyCreatorCompensation(),
      ]);
      setAssignments(commitments.assignments);
      setPeriodId(eligibility.periodId);
      setEligible(eligibility.eligible);
      setQualifyingRole(eligibility.qualifyingRole);
      setCompensation(compensationResult.compensation);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Your commitment records could not be loaded.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const submit = async (assignment: NightjarCommitmentAssignment, task: NightjarCommitmentTask) => {
    const key = assignment.id + '__' + task.id;
    const draft = drafts[key] ?? { note: '', evidenceUrl: '' };
    if (!draft.note.trim() && !draft.evidenceUrl.trim()) return;
    setSavingKey(key); setError('');
    try {
      await nightjarAccount.submitCommitmentEvidence({
        assignmentId: assignment.id, taskId: task.id,
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
        ...(draft.evidenceUrl.trim() ? { evidenceUrl: draft.evidenceUrl.trim() } : {}),
      });
      setDrafts((current) => ({ ...current, [key]: { note: '', evidenceUrl: '' } }));
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Evidence could not be submitted.');
    } finally { setSavingKey(''); }
  };
  const activeAssignments = assignments.filter((assignment) => !periodId || assignment.periodId === periodId);
  return <section className="panel nj-my-commitments" aria-label="My commitments">
    <header><div><span className="mini-label">CONTRIBUTOR COMMITMENTS</span><h2>My commitments</h2><p>Evidence is reviewed before a task counts as complete. Your eligibility is assessed separately for each approved role.</p></div><FileCheck2 size={20}/></header>
    {loading ? <p className="nj-commitment-loading" role="status"><LoaderCircle size={16}/> Loading your commitments…</p> : <>
      {periodId && <div className="nj-commitment-period"><span>Assessment period</span><strong>{periodId}</strong></div>}
      <div className={eligible ? 'nj-commitment-eligibility eligible' : 'nj-commitment-eligibility'}>
        {eligible ? <CheckCircle2 size={18}/> : <CircleAlert size={18}/>}
        <span><strong>{eligible ? 'Eligible for this period' : 'Not yet eligible'}</strong><small>{eligible ? (qualifyingRole ? roleName(qualifyingRole) + ' commitments are complete. You qualify for one individual share.' : 'Your completed role qualifies for one share.') : 'Complete and receive approval for every applicable mandatory task in at least one approved role.'}</small></span>
      </div>
      {error && <p className="nj-commitment-error" role="alert">{error}</p>}
      {!activeAssignments.length ? <div className="nj-commitment-empty"><strong>No commitments assigned for this period.</strong><small>Nightjar will show your role-specific tasks here once an administrator assigns a commitment plan.</small></div> :
        activeAssignments.map((assignment) => {
          const mandatory = assignment.tasks.filter((task) => task.mandatory && !['cancelled', 'excused'].includes(task.state));
          const completed = mandatory.filter((task) => task.state === 'approved').length;
          const percent = mandatory.length ? Math.floor(completed / mandatory.length * 100) : 0;
          return <article className="nj-commitment-role-card" key={assignment.id}>
            <div className="nj-commitment-role-head"><div><span className="mini-label">{assignment.periodId} / ROLE PLAN</span><h3>{roleName(assignment.role)}</h3></div><strong>{percent}%</strong></div>
            <div className="nj-commitment-progress"><span style={{ width: percent + '%' }}/></div>
            <small className="nj-commitment-progress-copy">{completed} of {mandatory.length} applicable mandatory tasks approved · Template v{assignment.templateVersion}</small>
            <div className="nj-commitment-task-list">
              {assignment.tasks.map((task) => {
                const key = assignment.id + '__' + task.id;
                const draft = drafts[key] ?? { note: '', evidenceUrl: '' };
                const canSubmit = assignment.periodStatus === 'open' && !['approved', 'cancelled', 'excused'].includes(task.state);
                return <div className="nj-commitment-task" key={task.id}>
                  <div className="nj-commitment-task-title"><span><strong>{task.title}</strong>{task.mandatory && <em>Mandatory</em>}</span><small data-state={task.state}>{taskStateLabel(task.state)}</small></div>
                  {task.description && <p>{task.description}</p>}
                  {task.reviewReason && <p className="nj-commitment-review-note">Reviewer note: {task.reviewReason}</p>}
                  {canSubmit && <div className="nj-commitment-evidence-form">
                    <textarea aria-label={'Evidence note for ' + task.title} rows={2} maxLength={2000} value={draft.note} placeholder="Describe the work completed or evidence supplied…" onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, note: event.target.value } }))}/>
                    <input aria-label={'Evidence link for ' + task.title} type="url" value={draft.evidenceUrl} placeholder="Optional evidence link (https://…)" onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, evidenceUrl: event.target.value } }))}/>
                    <button type="button" disabled={savingKey === key || (!draft.note.trim() && !draft.evidenceUrl.trim())} onClick={() => void submit(assignment, task)}><Send size={14}/>{savingKey === key ? 'Submitting…' : 'Submit evidence'}</button>
                  </div>}
                </div>;
              })}
            </div>
          </article>;
        })}
      {compensation.length > 0 && <article className="nj-member-compensation">
        <header><div><span className="mini-label">CREATOR POOL / YOUR RECORDS</span><h3>My compensation</h3><p>Only your own payout and payment records are shown here.</p></div></header>
        {compensation.map((record) => <div className="nj-member-compensation-row" key={record.periodId}>
          <div><strong>{record.periodId}</strong><small>{record.qualifyingRole ? roleName(record.qualifyingRole) + ' qualified' : 'Eligibility record'} · {record.status.replaceAll('_', ' ')}</small></div>
          <div><strong>{new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(record.amountPence / 100)}</strong><small>Paid {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(record.paidPence / 100)} · Outstanding {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(record.outstandingPence / 100)}</small></div>
          {record.payments.map((payment, index) => <small className="nj-member-payment-reference" key={payment.reference + index}>Payment: {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(payment.amountPence / 100)} · {payment.paidAt} · Ref {payment.reference}</small>)}
        </div>)}
      </article>}
      <button className="nj-commitment-refresh" type="button" onClick={() => void refresh()}>Refresh commitments</button>
    </>}
  </section>;
}
