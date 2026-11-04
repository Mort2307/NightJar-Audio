import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardList, FileCheck2, Lock, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarAccount, type NightjarCommitmentRole, type NightjarCommitmentTask } from '../platform/firebase-account';

type Template = { id: string; role: NightjarCommitmentRole; version: number; effectiveFrom: string; tasks: NightjarCommitmentTask[]; status: string };
type Period = { id: string; startDate: string; endDate: string; status: string };
type ReviewItem = {
  assignmentId: string; userId: string; periodId: string; role: NightjarCommitmentRole;
  pendingTasks: Array<{ id: string; title: string; evidenceIds: string[] }>;
  evidence: Array<{ taskId: string; evidenceId: string; note: string; evidenceUrl: string | null; submittedAt: string | null }>;
};
const roles: NightjarCommitmentRole[] = ['creator', 'writer', 'editor', 'artist'];
const roleName = (role: string) => role === 'creator' ? 'VA Creator' : role === 'writer' ? 'Writer' : role === 'editor' ? 'Audio Editor' : 'Artist';
const dateToday = new Date().toISOString().slice(0, 10);
const monthToday = dateToday.slice(0, 7);
const monthEnd = new Date(Date.UTC(new Date(dateToday).getUTCFullYear(), new Date(dateToday).getUTCMonth() + 1, 0)).toISOString().slice(0, 10);

export default function CommitmentControlCentre() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [templateRole, setTemplateRole] = useState<NightjarCommitmentRole>('creator');
  const [effectiveFrom, setEffectiveFrom] = useState(dateToday);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; description: string; mandatory: boolean; dueDay: string }>>([]);
  const [periodId, setPeriodId] = useState(monthToday);
  const [periodStart, setPeriodStart] = useState(monthToday + '-01');
  const [periodEnd, setPeriodEnd] = useState(monthEnd);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState<NightjarCommitmentRole>('creator');
  const [assignPeriod, setAssignPeriod] = useState(monthToday);
  const [assignTemplate, setAssignTemplate] = useState('');
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [exceptionReasons, setExceptionReasons] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [templateResult, periodResult, queueResult] = await Promise.all([
        nightjarAccount.adminListCommitmentTemplates(),
        nightjarAccount.adminListCommitmentPeriods(),
        nightjarAccount.adminListCommitmentReviewQueue(),
      ]);
      setTemplates(templateResult.templates as Template[]);
      setPeriods(periodResult.periods as Period[]);
      setQueue(queueResult.queue as ReviewItem[]);
      setAssignPeriod((current) => current || periodResult.periods.find((item) => item.status === 'open')?.id || monthToday);
      setAssignTemplate((current) => current || templateResult.templates[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Commitment controls could not be loaded.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setError(''); setMessage('');
    try { await action(); setMessage(success); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The requested action could not be completed.'); }
    finally { setBusy(''); }
  };
  const createTemplate = () => run('template', async () => {
    if (!tasks.length) throw new Error('Add at least one commitment task first.');
    const result = await nightjarAccount.adminCreateCommitmentTemplate({
      role: templateRole, effectiveFrom,
      tasks: tasks.map((task) => ({
        id: task.id.trim(), title: task.title.trim(), description: task.description.trim(),
        mandatory: task.mandatory, dueDay: task.dueDay ? Number(task.dueDay) : null,
      })),
    });
    setMessage('Created ' + result.templateId);
    setTasks([]);
  }, 'New immutable template version created.');
  const createPeriod = () => run('period', () => nightjarAccount.adminCreateCommitmentPeriod({ periodId, startDate: periodStart, endDate: periodEnd }), 'Assessment period created.');
  const assign = () => run('assign', () => nightjarAccount.adminAssignCommitmentTemplate({ periodId: assignPeriod, userId: assignUserId.trim(), role: assignRole, templateId: assignTemplate }), 'Commitment plan assigned.');
  const review = (item: ReviewItem, taskId: string, decision: 'approved' | 'rejected') => {
    const reason = reviewReasons[item.assignmentId + '__' + taskId] ?? '';
    return run(item.assignmentId + '__' + taskId, () => nightjarAccount.adminReviewCommitmentTask({
      assignmentId: item.assignmentId, taskId, decision, ...(reason.trim() ? { reason: reason.trim() } : {}),
    }), decision === 'approved' ? 'Evidence approved.' : 'Evidence returned for changes.');
  };
  const exception = (item: ReviewItem) => run('exception-' + item.assignmentId, () => nightjarAccount.adminSetCommitmentException({
    assignmentId: item.assignmentId, reason: exceptionReasons[item.assignmentId] ?? '',
  }), 'Documented eligibility exception recorded.');

  return <section className="nj-commitment-admin panel" aria-label="Commitment control centre">
    <header><div><span className="mini-label">NIGHTJAR / ADMIN OPERATIONS</span><h2>Commitment Control Centre</h2><p>Versioned role plans, period assignments, evidence review and auditable eligibility exceptions.</p></div><ShieldCheck size={21}/></header>
    {error && <p className="nj-commitment-admin-error" role="alert">{error}</p>}
    {message && <p className="nj-commitment-admin-message" role="status">{message}</p>}
    <div className="nj-commitment-admin-toolbar"><span>{loading ? 'Loading controls…' : templates.length + ' templates · ' + periods.length + ' periods · ' + queue.length + ' assignments awaiting review'}</span><button type="button" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button></div>

    <div className="nj-commitment-admin-grid">
      <article className="nj-commitment-admin-card">
        <span className="mini-label">01 / POLICY</span><h3>Create a role template</h3><p>Published versions are immutable. New changes create a new version and apply prospectively.</p>
        <label>Creative role<select value={templateRole} onChange={(event) => setTemplateRole(event.target.value as NightjarCommitmentRole)}>{roles.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}</select></label>
        <label>Effective from<input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)}/></label>
        <div className="nj-commitment-admin-subhead"><strong>Tasks ({tasks.length}/40)</strong><button type="button" disabled={tasks.length >= 40} onClick={() => setTasks((current) => [...current, { id: 'task-' + (current.length + 1), title: '', description: '', mandatory: true, dueDay: '' }])}><Plus size={14}/> Add task</button></div>
        {tasks.map((task, index) => <div className="nj-commitment-template-task" key={index}>
          <label>Task title<input maxLength={120} value={task.title} onChange={(event) => setTasks((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} placeholder="What must be completed?"/></label>
          <label>Task ID<input maxLength={60} value={task.id} onChange={(event) => setTasks((current) => current.map((item, i) => i === index ? { ...item, id: event.target.value } : item))}/></label>
          <label>Description<textarea rows={2} maxLength={500} value={task.description} onChange={(event) => setTasks((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))}/></label>
          <div className="nj-commitment-task-options"><label><input type="checkbox" checked={task.mandatory} onChange={(event) => setTasks((current) => current.map((item, i) => i === index ? { ...item, mandatory: event.target.checked } : item))}/> Mandatory</label><label>Due day <input type="number" min="1" max="31" value={task.dueDay} onChange={(event) => setTasks((current) => current.map((item, i) => i === index ? { ...item, dueDay: event.target.value } : item))} placeholder="Optional"/></label><button type="button" onClick={() => setTasks((current) => current.filter((_, i) => i !== index))}>Remove</button></div>
        </div>)}
        <button className="nj-commitment-admin-primary" type="button" disabled={busy === 'template' || !tasks.length || tasks.some((task) => !task.id.trim() || !task.title.trim())} onClick={() => void createTemplate()}>{busy === 'template' ? 'Publishing…' : 'Publish new template version'}</button>
      </article>

      <article className="nj-commitment-admin-card">
        <span className="mini-label">02 / PERIODS & ASSIGNMENTS</span><h3>Set up a monthly cycle</h3><p>Create the assessment period, then assign the appropriate immutable template to each approved individual role.</p>
        <label>Period ID (YYYY-MM)<input value={periodId} onChange={(event) => setPeriodId(event.target.value)} maxLength={7}/></label>
        <div className="nj-commitment-admin-two"><label>Starts<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)}/></label><label>Ends<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)}/></label></div>
        <button className="nj-commitment-admin-primary" type="button" disabled={busy === 'period'} onClick={() => void createPeriod()}>{busy === 'period' ? 'Creating…' : 'Create assessment period'}</button>
        <hr/>
        <label>Open period<select value={assignPeriod} onChange={(event) => setAssignPeriod(event.target.value)}>{periods.filter((item) => item.status === 'open').map((item) => <option key={item.id} value={item.id}>{item.id} · {item.startDate} to {item.endDate}</option>)}</select></label>
        <label>Template<select value={assignTemplate} onChange={(event) => setAssignTemplate(event.target.value)}>{templates.map((item) => <option key={item.id} value={item.id}>{roleName(item.role)} v{item.version} · {item.effectiveFrom}</option>)}</select></label>
        <label>Member account UID<input value={assignUserId} onChange={(event) => setAssignUserId(event.target.value)} placeholder="Firebase account UID"/></label>
        <label>Role<select value={assignRole} onChange={(event) => setAssignRole(event.target.value as NightjarCommitmentRole)}>{roles.map((role) => <option key={role} value={role}>{roleName(role)}</option>)}</select></label>
        <button className="nj-commitment-admin-primary" type="button" disabled={busy === 'assign' || !assignUserId.trim() || !assignTemplate || !assignPeriod} onClick={() => void assign()}>{busy === 'assign' ? 'Assigning…' : 'Assign commitment plan'}</button>
        <div className="nj-commitment-period-list">{periods.map((period) => <div key={period.id}><span>{period.id} · {period.startDate} – {period.endDate}</span><strong>{period.status}</strong>{period.status === 'open' && <button type="button" onClick={() => void run('close-' + period.id, () => nightjarAccount.adminCloseCommitmentPeriod(period.id), 'Assessment period closed.') }><Lock size={12}/> Close</button>}</div>)}</div>
      </article>
    </div>

    <article className="nj-commitment-admin-card nj-commitment-review">
      <span className="mini-label">03 / EVIDENCE REVIEW</span><h3>Submission queue</h3><p>Only approved evidence completes a mandatory task. Every decision is recorded with reviewer identity and timestamp.</p>
      {!queue.length && !loading ? <div className="nj-commitment-admin-empty"><Check size={17}/> No submissions awaiting review.</div> : queue.map((item) => <div className="nj-commitment-review-item" key={item.assignmentId}>
        <div className="nj-commitment-review-head"><strong>{roleName(item.role)} · {item.periodId}</strong><small>Account {item.userId}</small></div>
        {item.pendingTasks.map((task) => <div className="nj-commitment-review-task" key={task.id}>
          <strong>{task.title}</strong>
          {item.evidence.filter((evidence) => evidence.taskId === task.id).map((evidence) => <div className="nj-commitment-evidence-view" key={evidence.evidenceId}>{evidence.note && <p>{evidence.note}</p>}{evidence.evidenceUrl && <a href={evidence.evidenceUrl} target="_blank" rel="noreferrer">Open submitted evidence</a>}</div>)}
          <textarea rows={2} maxLength={1000} value={reviewReasons[item.assignmentId + '__' + task.id] ?? ''} onChange={(event) => setReviewReasons((current) => ({ ...current, [item.assignmentId + '__' + task.id]: event.target.value }))} placeholder="Optional feedback; required when rejecting…"/>
          <div className="nj-commitment-review-actions"><button type="button" disabled={busy === item.assignmentId + '__' + task.id} onClick={() => void review(item, task.id, 'approved')}><Check size={13}/> Approve evidence</button><button type="button" disabled={busy === item.assignmentId + '__' + task.id || (reviewReasons[item.assignmentId + '__' + task.id] ?? '').trim().length < 8} onClick={() => void review(item, task.id, 'rejected')}>Return for changes</button></div>
        </div>)}
        <div className="nj-commitment-exception"><label>Eligibility exception reason<textarea rows={2} value={exceptionReasons[item.assignmentId] ?? ''} onChange={(event) => setExceptionReasons((current) => ({ ...current, [item.assignmentId]: event.target.value }))} placeholder="Document Nightjar-caused cancellation or exceptional circumstances…"/></label><button type="button" disabled={busy === 'exception-' + item.assignmentId || (exceptionReasons[item.assignmentId] ?? '').trim().length < 8} onClick={() => void exception(item)}>Approve documented exception</button></div>
      </div>)}
    </article>
  </section>;
}
