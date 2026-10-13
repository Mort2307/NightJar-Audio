import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Clock3, FileCheck2, FileText, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarScripts } from '../platform/firebase-scripts';
import './admin-manuscript-review.css';

type Decision = 'approved' | 'changes' | 'rejected';
type Props = {
  scripts: any[];
  editors: any[];
  loading: boolean;
  demoMode: boolean;
  onRefresh: () => Promise<void>;
  onReview: (script: any, decision: Decision, note: string) => Promise<void>;
  onAssignEditor: (scriptId: string, editorUserId: string) => Promise<void>;
  notify: (message: string) => void;
};

const pendingStatus = (status: unknown) => ['Submitted', 'Under review'].includes(String(status ?? ''));
const readableError = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not complete this request. Please retry.';

export default function AdminManuscriptReview({
  scripts, editors, loading, demoMode, onRefresh, onReview, onAssignEditor, notify,
}: Props) {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [sourceFile, setSourceFile] = useState<{ fileName: string; url: string; expiresAt: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const pending = useMemo(() => scripts.filter((item) => pendingStatus(item.status)), [scripts]);
  const history = useMemo(() => scripts.filter((item) => !pendingStatus(item.status)), [scripts]);
  const shown = tab === 'pending' ? pending : history;
  const selected = scripts.find((item) => item.id === selectedId) ?? null;
  const isPending = !!selected && pendingStatus(selected.status);
  const marketplaceRequested = selected?.marketplace?.visibility === 'marketplace';
  const hasSynopsis = !!String(selected?.marketplace?.synopsis ?? '').trim();
  const rightsReady = selected?.rights?.ownershipAttested === true && selected?.rights?.contributorPermissionsConfirmed === true;
  const hasManuscript = !!String(preview?.content ?? '').trim() || !!preview?.sourceFile;

  useEffect(() => {
    setPreview(null);
    setSourceFile(null);
    setError('');
    setNote('');
  }, [selectedId]);

  const openPreview = async () => {
    if (!selected) return;
    setPreviewBusy(true);
    setError('');
    try {
      if (demoMode) {
        setPreview(selected);
        setSourceFile(null);
        return;
      }
      const data = await nightjarScripts.adminScriptPreview(selected.id);
      setPreview(data.script ?? null);
      setSourceFile(data.sourceFile ?? null);
    } catch (cause) {
      setError('Protected preview could not be opened: ' + readableError(cause));
    } finally {
      setPreviewBusy(false);
    }
  };

  const decide = async (decision: Decision) => {
    if (!selected || !isPending || !preview || decisionBusy) return;
    if (decision !== 'approved' && !note.trim()) {
      setError('Please explain the changes requested or the reason for rejection.');
      return;
    }
    if (decision === 'approved' && (!rightsReady || !hasManuscript)) {
      setError('Approval needs confirmed rights and a manuscript source. Ask the Writer to complete these first.');
      return;
    }
    if (decision === 'approved' && marketplaceRequested && !hasSynopsis &&
      !window.confirm('No public synopsis is saved. Approve the protected manuscript anyway? The marketplace listing will remain hidden until the Writer adds a synopsis.')) return;
    setDecisionBusy(true);
    setError('');
    try {
      await onReview(selected, decision, note.trim());
      setSelectedId(null);
      setPreview(null);
      setNote('');
    } catch (cause) {
      setError('Review could not be saved: ' + readableError(cause));
    } finally {
      setDecisionBusy(false);
    }
  };

  const assign = async (scriptId: string, editorUserId: string) => {
    if (!editorUserId) return;
    setAssigningId(scriptId);
    setError('');
    try {
      await onAssignEditor(scriptId, editorUserId);
      notify('Optional Audio Editor assignment saved.');
    } catch (cause) {
      setError('Editor assignment failed: ' + readableError(cause));
    } finally {
      setAssigningId(null);
    }
  };

  return <section className="admin-manuscript-review" aria-label="Manuscript administration">
    <div className="manuscript-review-summary">
      <div><span className="mini-label">MANUSCRIPT VERIFICATION</span><h3>Scripts awaiting your decision</h3><p>A Writer's marketplace submission goes directly to this admin queue. An Audio Editor is optional, not a gate to approval. Full scripts remain protected.</p></div>
      <button className="secondary-button" disabled={loading} onClick={() => void onRefresh()}><RefreshCw size={15}/>{loading ? 'Loading…' : 'Refresh queue'}</button>
    </div>
    <div className="manuscript-review-tabs" role="group" aria-label="Manuscript queue filter">
      <button className={tab === 'pending' ? 'primary-button' : 'secondary-button'} aria-pressed={tab === 'pending'} onClick={() => { setTab('pending'); setSelectedId(null); }}>Awaiting admin review ({pending.length})</button>
      <button className={tab === 'history' ? 'primary-button' : 'secondary-button'} aria-pressed={tab === 'history'} onClick={() => { setTab('history'); setSelectedId(null); }}>Decision history & drafts ({history.length})</button>
    </div>
    {loading ? <div className="people-empty"><Clock3 size={20}/><strong>Loading manuscripts…</strong></div>
      : shown.length === 0 ? <div className="people-empty"><CheckCircle2 size={20}/><strong>{tab === 'pending' ? 'No manuscripts awaiting a decision' : 'No draft or reviewed manuscripts'}</strong><span>{tab === 'pending' ? 'Submitted scripts will appear here automatically, including ones already waiting for an editor.' : 'Previous decisions and drafts are separate from the actionable queue.'}</span></div>
      : <div className="manuscript-review-list">{shown.map((item) =>
        <article className={'manuscript-review-item' + (selectedId === item.id ? ' selected' : '')} key={item.id}>
          <div><strong>{item.title || 'Untitled manuscript'}</strong><span>{item.status} · version {item.version ?? 1} · {item.marketplace?.visibility === 'marketplace' ? 'Marketplace requested' : 'Private / other visibility'}</span>
          {item.lastEditorialComment && <small>Previous note: {item.lastEditorialComment}</small>}</div>
          <button className="secondary-button" aria-expanded={selectedId === item.id} onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}>{selectedId === item.id ? 'Close' : pendingStatus(item.status) ? 'Review manuscript' : 'View details'} <ArrowRight size={14}/></button>
        </article>)}</div>}
    {selected && <div className="manuscript-review-detail" aria-label="Selected manuscript review">
      <div className="manuscript-review-detail-head">
        <div><span className="mini-label">{isPending ? 'AWAITING A DECISION' : 'MANUSCRIPT RECORD'}</span><h3>{selected.title}</h3><p>{selected.status} · {marketplaceRequested ? 'Writer requested marketplace publication' : 'Writer has not selected marketplace visibility'}</p></div>
        <button className="secondary-button" disabled={previewBusy} onClick={() => void openPreview()}><LockKeyhole size={15}/>{previewBusy ? 'Opening…' : preview ? 'Refresh protected preview' : 'Open protected manuscript'}</button>
      </div>
      <div className="manuscript-review-facts">
        <span><ShieldCheck size={15}/> Rights confirmations: <strong>{rightsReady ? 'Confirmed' : 'Incomplete'}</strong></span>
        <span><BookOpen size={15}/> Marketplace synopsis: <strong>{hasSynopsis ? 'Provided' : 'Missing'}</strong></span>
        <span><FileCheck2 size={15}/> Editor: <strong>{selected.editorUserId ? 'Assigned' : 'Not required'}</strong></span>
      </div>
      {marketplaceRequested && hasSynopsis && <p className="manuscript-review-synopsis"><strong>Public synopsis</strong>{selected.marketplace.synopsis}</p>}
      {!rightsReady && <p className="manuscript-review-caution">The Writer must confirm ownership and contributor permissions before approval.</p>}
      {marketplaceRequested && !hasSynopsis && <p className="manuscript-review-caution">Marketplace visibility is selected, but the public synopsis is missing. Approval alone will not create a public listing.</p>}
      {preview && <div className="manuscript-review-source">
        <span className="mini-label">PROTECTED CONTENT · ADMIN ONLY</span>
        {String(preview.content ?? '').trim() && <pre>{preview.content}</pre>}
        {sourceFile && <a className="secondary-button" href={sourceFile.url} target="_blank" rel="noreferrer"><FileText size={16}/> Open uploaded {sourceFile.fileName} <ArrowRight size={14}/></a>}
        {!String(preview.content ?? '').trim() && !sourceFile && <p>No manuscript source found. Approval is unavailable.</p>}
        {sourceFile && <small>Protected download link expires ten minutes after opening the preview.</small>}
      </div>}
      {isPending && <div className="manuscript-review-decisions">
        <p>Check the manuscript before choosing a decision. Approving a marketplace submission publishes only its synopsis and listing—not its protected text.</p>
        <label>Decision note (required when requesting changes or rejecting)<textarea value={note} maxLength={2000} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="Explain your decision to the Writer…"/></label>
        <div className="manuscript-review-actions">
          <button className="primary-button" disabled={!preview || !rightsReady || !hasManuscript || decisionBusy} onClick={() => void decide('approved')}><CheckCircle2 size={15}/>{decisionBusy ? 'Saving…' : 'Approve manuscript'}</button>
          <button className="secondary-button" disabled={!preview || !note.trim() || decisionBusy} onClick={() => void decide('changes')}>Request changes</button>
          <button className="secondary-button" disabled={!preview || !note.trim() || decisionBusy} onClick={() => void decide('rejected')}>Reject with reason</button>
        </div>
      </div>}
      {isPending && editors.length > 0 && <details className="manuscript-review-editor">
        <summary>Optional: assign an Audio Editor for additional feedback</summary>
        <label>Audio Editor
          <select value={selected.editorUserId ?? ''} disabled={assigningId === selected.id} onChange={(event) => void assign(selected.id, event.target.value)}>
            <option value="">Not assigned</option>
            {editors.map((editor) => <option key={editor.userId} value={editor.userId}>{editor.name ?? editor.email ?? editor.userId}</option>)}
          </select>
        </label>
        <small>Assignment does not publish the script or remove it from admin review.</small>
      </details>}
      {error && <p className="manuscript-review-error" role="alert">{error}</p>}
      {!isPending && <p className="manuscript-review-complete">No approval is needed here. This manuscript is {selected.status.toLowerCase()}.</p>}
    </div>}
  </section>;
