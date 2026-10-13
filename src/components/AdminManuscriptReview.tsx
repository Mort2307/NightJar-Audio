import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Clock3, FileText, LockKeyhole, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { nightjarScripts } from '../platform/firebase-scripts';
import './admin-manuscript-review.css';

type Decision = 'approved' | 'changes' | 'rejected';
type Props = {
  scripts: any[];
  loading: boolean;
  demoMode: boolean;
  onRefresh: () => Promise<void>;
  onReview: (script: any, decision: Decision, note: string) => Promise<void>;
};

const pendingStatus = (status: unknown) => ['Submitted', 'Under review'].includes(String(status ?? ''));
const readableError = (error: unknown) =>
  error instanceof Error ? error.message : 'Could not complete this request. Please retry.';

export default function AdminManuscriptReview({
  scripts, loading, demoMode, onRefresh, onReview,
}: Props) {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<any | null>(null);
  const [sourceFile, setSourceFile] = useState<{ fileName: string; url: string; expiresAt: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [sourcePreview, setSourcePreview] = useState<{ format: 'text' | 'pdf' | 'unavailable'; text?: string; truncated?: boolean; message?: string } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const pending = useMemo(() => scripts.filter((item) => pendingStatus(item.status)), [scripts]);
  const history = useMemo(() => scripts.filter((item) => !pendingStatus(item.status)), [scripts]);
  const shown = tab === 'pending' ? pending : history;
  const selected = scripts.find((item) => item.id === selectedId) ?? null;
  const isPending = !!selected && pendingStatus(selected.status);
  const marketplaceRequested = selected?.marketplace?.visibility === 'marketplace';
  const hasSynopsis = !!String(selected?.marketplace?.synopsis ?? '').trim();
  const rightsReady = selected?.rights?.ownershipAttested === true && selected?.rights?.contributorPermissionsConfirmed === true;
  const hasManuscript = !!String(preview?.content ?? '').trim() || sourcePreview?.format === 'pdf' || (sourcePreview?.format === 'text' && !!String(sourcePreview.text ?? '').trim());

  useEffect(() => {
    setPreview(null);
    setSourceFile(null);
    setSourcePreview(null);
    setViewerOpen(false);
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
        setSourcePreview({ format: 'text', text: String(selected.content ?? '') });
        setViewerOpen(true);
        return;
      }
      const data = await nightjarScripts.adminScriptPreview(selected.id);
      setPreview(data.script ?? null);
      setSourceFile(data.sourceFile ?? null);
      setSourcePreview(data.sourcePreview ?? (data.script?.content ? { format: 'text', text: data.script.content } : { format: 'unavailable', message: 'In-app document preview unavailable.' }));
      setViewerOpen(true);
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
      setViewerOpen(false);
      setNote('');
    } catch (cause) {
      setError('Review could not be saved: ' + readableError(cause));
    } finally {
      setDecisionBusy(false);
    }
  };


  return <section className="admin-manuscript-review" aria-label="Manuscript administration">
    <div className="manuscript-review-summary">
      <div><span className="mini-label">MANUSCRIPT VERIFICATION</span><h3>Scripts awaiting your decision</h3><p>A Writer's marketplace submission goes directly to this admin queue. No editorial handoff or Audio Editor assignment is part of marketplace approval. Full scripts remain protected.</p></div>
      <button className="secondary-button" disabled={loading} onClick={() => void onRefresh()}><RefreshCw size={15}/>{loading ? 'Loading…' : 'Refresh queue'}</button>
    </div>
    <div className="manuscript-review-tabs" role="group" aria-label="Manuscript queue filter">
      <button className={tab === 'pending' ? 'primary-button' : 'secondary-button'} aria-pressed={tab === 'pending'} onClick={() => { setTab('pending'); setSelectedId(null); }}>Awaiting admin review ({pending.length})</button>
      <button className={tab === 'history' ? 'primary-button' : 'secondary-button'} aria-pressed={tab === 'history'} onClick={() => { setTab('history'); setSelectedId(null); }}>Decision history & drafts ({history.length})</button>
    </div>
    {loading ? <div className="people-empty"><Clock3 size={20}/><strong>Loading manuscripts…</strong></div>
      : shown.length === 0 ? <div className="people-empty"><CheckCircle2 size={20}/><strong>{tab === 'pending' ? 'No manuscripts awaiting a decision' : 'No draft or reviewed manuscripts'}</strong><span>{tab === 'pending' ? 'All existing submitted scripts, including previously editor-assigned records, remain here until an admin decision.' : 'Previous decisions and drafts are separate from the actionable queue.'}</span></div>
      : <div className="manuscript-review-list">{shown.map((item) =>
        <article className={'manuscript-review-item' + (selectedId === item.id ? ' selected' : '')} key={item.id}>
          <div><strong>{item.title || 'Untitled manuscript'}</strong><span>{item.status} · version {item.version ?? 1} · {item.marketplace?.visibility === 'marketplace' ? 'Marketplace requested' : 'Private / other visibility'}</span>
          {item.lastEditorialComment && <small>Previous note: {item.lastEditorialComment}</small>}</div>
          <button className="secondary-button" aria-expanded={selectedId === item.id} onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}>{selectedId === item.id ? 'Close' : pendingStatus(item.status) ? 'Review manuscript' : 'View record'} <ArrowRight size={14}/></button>
        </article>)}</div>}
    {selected && <div className="manuscript-review-detail" aria-label="Selected manuscript review">
      <div className="manuscript-review-detail-head">
        <div><span className="mini-label">{isPending ? 'AWAITING A DECISION' : 'MANUSCRIPT RECORD'}</span><h3>{selected.title}</h3><p>{selected.status} · {marketplaceRequested ? 'Writer requested marketplace publication' : 'Writer has not selected marketplace visibility'}</p></div>
        <button className="primary-button" disabled={previewBusy} onClick={() => preview ? setViewerOpen(true) : void openPreview()}><LockKeyhole size={15}/>{previewBusy ? 'Opening…' : 'Open read-only viewer'}</button>
      </div>
      <div className="manuscript-review-facts">
        <span><ShieldCheck size={15}/> Rights confirmations: <strong>{rightsReady ? 'Confirmed' : 'Incomplete'}</strong></span>
        <span><BookOpen size={15}/> Marketplace synopsis: <strong>{hasSynopsis ? 'Provided' : 'Missing'}</strong></span>
      </div>
      {marketplaceRequested && hasSynopsis && <p className="manuscript-review-synopsis"><strong>Public synopsis</strong>{selected.marketplace.synopsis}</p>}
      {!rightsReady && <p className="manuscript-review-caution">The Writer must confirm ownership and contributor permissions before approval.</p>}
      {marketplaceRequested && !hasSynopsis && <p className="manuscript-review-caution">Marketplace visibility is selected, but the public synopsis is missing. Approval alone will not create a public listing.</p>}
      {isPending && <div className="manuscript-review-decisions">
        <p>Open the protected, read-only in-app viewer before deciding. Administrators may approve or return submissions, but cannot edit a Writer’s manuscript.</p>
        <label>Decision note (required when requesting changes or rejecting)<textarea value={note} maxLength={2000} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="Explain your decision to the Writer…"/></label>
        <div className="manuscript-review-actions">
          <button className="primary-button" disabled={!preview || !rightsReady || !hasManuscript || sourcePreview?.truncated === true || decisionBusy} onClick={() => void decide('approved')}><CheckCircle2 size={15}/>{decisionBusy ? 'Saving…' : 'Approve manuscript'}</button>
          <button className="secondary-button" disabled={!preview || !note.trim() || decisionBusy} onClick={() => void decide('changes')}>Request changes</button>
          <button className="secondary-button" disabled={!preview || !note.trim() || decisionBusy} onClick={() => void decide('rejected')}>Reject with reason</button>
        </div>
      </div>}
      {error && <p className="manuscript-review-error" role="alert">{error}</p>}
      {!isPending && <p className="manuscript-review-complete">No approval is needed here. This manuscript is {selected.status.toLowerCase()}.</p>}
    </div>}
    {viewerOpen && preview && <div className="manuscript-admin-reader-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setViewerOpen(false); }}>
      <section className="manuscript-admin-reader copy-locked" role="dialog" aria-modal="true" aria-label={'Read-only manuscript review: ' + String(preview.title ?? 'Manuscript')}
        onCopy={(event) => event.preventDefault()} onCut={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()}>
        <header className="manuscript-admin-reader-head">
          <div><span className="mini-label">NIGHTJAR · ADMINISTRATOR VIEW ONLY</span><h3>{preview.title || 'Untitled manuscript'}</h3><p><LockKeyhole size={14}/> Protected, read-only manuscript · no editing, copy or export controls</p></div>
          <button className="secondary-button" type="button" onClick={() => setViewerOpen(false)}><X size={16}/> Close viewer</button>
        </header>
        <div className="manuscript-admin-reader-watermark" aria-hidden="true">NIGHTJAR · ADMIN ONLY · {String(preview.id ?? '').slice(-10)}</div>
        <div className="manuscript-admin-reader-body" role="document">
          {String(preview.content ?? '').trim() && <div className="manuscript-admin-reader-text">{preview.content}</div>}
          {!String(preview.content ?? '').trim() && sourcePreview?.format === 'text' && <div className="manuscript-admin-reader-text">{sourcePreview.text}</div>}
          {sourcePreview?.format === 'pdf' && sourceFile?.url && <iframe
            title={'Read-only PDF manuscript: ' + String(preview.title ?? 'Script')}
            className="manuscript-admin-reader-pdf"
            src={sourceFile.url + '#toolbar=0&navpanes=0&scrollbar=1'}
            referrerPolicy="no-referrer"
            sandbox="allow-same-origin"
          />}
          {sourcePreview?.truncated && <p className="manuscript-review-caution">Only part of this manuscript could be displayed in-app. Do not approve based on an incomplete preview.</p>}
          {sourcePreview?.format === 'unavailable' && <p className="manuscript-review-caution">{sourcePreview.message || 'This file cannot be displayed in-app. Request an updated PDF or DOCX from the Writer rather than approving unseen content.'}</p>}
          {!String(preview.content ?? '').trim() && !sourceFile && !String(sourcePreview?.text ?? '').trim() && <p>No manuscript content was supplied.</p>}
        </div>
        <footer className="manuscript-admin-reader-foot"><span><ShieldCheck size={15}/> Admin access is logged · manuscript text remains private</span><button className="secondary-button" type="button" onClick={() => setViewerOpen(false)}>Return to review decision</button></footer>
      </section>
    </div>}
  </section>;
}
