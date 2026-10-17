import { useEffect, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import TranscriptSyncTool from './TranscriptSyncTool';
import { demoCreatorDashboard, demoTracks } from '../demo/nightjarDemo';
import { readDemo, writeDemo } from '../demo/demoSession';
import { BookOpenText, Check, Eye, FileAudio, MessageSquare, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
  demoMode?: boolean;
  onDeleted?: (releaseId: string) => void;
  onMessageCreator?: (userId: string) => void;
};

export default function ContentModeration({ open, onClose, notify, demoMode = false, onDeleted, onMessageCreator }: Props) {
  const [queue, setQueue] = useState<any[]>([]);
  const [audioLibrary, setAudioLibrary] = useState<any[]>([]);
  const [auditMode, setAuditMode] = useState<'all' | 'pending'>('all');
  const [libraryTruncated, setLibraryTruncated] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [nightjarOriginal, setNightjarOriginal] = useState(false);
  const [originalCommissionConfirmed, setOriginalCommissionConfirmed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reviewDecision,setReviewDecision] = useState<'approved'|'changes'|'rejected'|null>(null);
  const [reviewNote,setReviewNote] = useState('');
  const [reviewBusy,setReviewBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      if (demoMode) {
        setQueue(readDemo('creatorDashboard', demoCreatorDashboard).releases.filter((release: any) => release.status === 'pending_review').map((release: any) => ({
          ...release,
          creatorName: 'Aria Vale',
          creatorHandle: 'ariavale',
        })));
        const demoAttached = readDemo('creatorDashboard', demoCreatorDashboard).releases
          .filter((release: any) => release.audioAvailable === true)
          .map((release: any) => ({...release,creatorName:'Aria Vale',creatorHandle:'ariavale'}));
        setAudioLibrary(demoAttached);
        setLibraryTruncated(false);
        setSelected(null);
        return;
      }
      const [pending, audit] = await Promise.all([
        nightjarCatalogue.moderationQueue(),
        nightjarCatalogue.adminAudioLibrary(),
      ]);
      setQueue(pending.releases ?? []);
      setAudioLibrary(audit.releases ?? []);
      setLibraryTruncated(audit.truncated === true);
      setSelected((prior:any)=>prior ? (audit.releases ?? []).find((item:any)=>item.id===prior.id) ?? (pending.releases ?? []).find((item:any)=>item.id===prior.id) ?? null : null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load real audio attachments.');
      notify('Nightjar could not load the live audio review library.');
    }
    finally { setLoading(false); }
  };

  useEffect(() => { if (open) void load(); }, [open, demoMode]);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setPreviewError('');
    setPreviewLoading(false);
    setNightjarOriginal(selected?.nightjarOriginal === true);
    setOriginalCommissionConfirmed(false);
    if (!selected?.id || !selected.audioAvailable || demoMode) return () => { cancelled = true; };
    setPreviewLoading(true);
    void nightjarCatalogue.adminPreview(selected.id).then((data) => {
      if (!cancelled) setPreviewUrl(data.url);
    }).catch((error) => {
      if (!cancelled) setPreviewError(error instanceof Error ? error.message : 'Could not access private audio.');
    }).finally(() => {if (!cancelled) setPreviewLoading(false);});
    return () => { cancelled = true; };
  }, [selected?.id, selected?.audioAvailable, demoMode]);

  const decide = async (decision: 'approved' | 'changes' | 'rejected') => {
    if (!selected?.id) return;
    if (decision === 'approved' && !demoMode && Boolean(String(selected.transcriptText ?? '').trim()) && selected.transcriptAccessibilityReviewed !== true) {
      notify('The creator supplied an optional transcript but has not confirmed its accuracy.');
      return;
    }
    if (decision === 'approved' && nightjarOriginal && !originalCommissionConfirmed) {
      notify('Nightjar Original is reserved for commissioned and paid-for productions. Confirm that Nightjar funded this recording, or leave Original unchecked.');
      return;
    }
    const note = reviewNote.trim();
    if (decision !== 'approved' && !note) { notify('Enter a reason before requesting changes or rejecting a release.'); return; }
    setReviewBusy(true);
    try {
      if (demoMode) {
        const dashboard = readDemo('creatorDashboard', demoCreatorDashboard);
        const status = decision === 'approved' ? selected.scheduledAt ? 'scheduled' : 'released' : decision === 'changes' ? 'draft' : 'rejected';
        const releases = dashboard.releases.map((release: any) => release.id === selected.id ? { ...release, status, moderationNote: note } : release);
        writeDemo('creatorDashboard', { ...dashboard, releases });
        if (decision === 'approved' && !selected.scheduledAt) {
          const tracks = readDemo('tracks', demoTracks);
          writeDemo('tracks', [...tracks.filter((track: any) => track.id !== selected.id), {
            id: selected.id, title: selected.title, creator: selected.creatorName || 'Aria Vale',
            creatorUserId: 'demo-creator-aria', duration: String(selected.durationMinutes || 0) + ' min',
            category: selected.category || 'Audio', descriptor: selected.description || 'Demo release',
            genre: selected.genre || '', tags: selected.tags || [], tropes: selected.tropes || [],
            contributors: selected.contributors || [], contentRating: selected.contentRating || 'adult',
            audioAvailable: selected.audioAvailable === true, audioUrl: null, artworkUrl: null,
          }]);
        }
        setQueue((items) => items.filter((item) => item.id !== selected.id));
        setSelected(null);
        setReviewDecision(null);setReviewNote('');
        notify(decision === 'approved' ? 'Demo release approved locally.' : decision === 'changes' ? 'Demo changes request recorded locally.' : 'Demo release rejected locally.');
        return;
      }
      await nightjarCatalogue.moderate(selected.id, decision, note, decision === 'approved' && nightjarOriginal, decision === 'approved' && nightjarOriginal && originalCommissionConfirmed);
      await load();
      setSelected(null);
      setReviewDecision(null);setReviewNote('');
      notify(decision === 'approved' ? selected.scheduledAt ? 'Release approved and scheduled. It will remain private until publication.' : 'Release approved and published.' : decision === 'changes' ? 'Changes requested from the creator.' : 'Release rejected.');
    } catch (error) { notify(error instanceof Error ? error.message : 'Moderation decision could not be saved.'); }
    finally { setReviewBusy(false); }
  };

  const removeSelected = async () => {
    if (!selected?.id || removing) return;
    const release = selected;
    if (!window.confirm('Permanently remove “' + String(release.title ?? 'this recording') + '” from Nightjar? Audio and artwork will be deleted and public access stopped. This cannot be undone.')) return;
    setRemoving(true);
    try {
      if (demoMode) {
        setQueue((items) => items.filter((item) => item.id !== release.id));
        setAudioLibrary((items) => items.filter((item) => item.id !== release.id));
      } else {
        const result = await nightjarCatalogue.adminRemove(release.id);
        if (result.deleted !== true) throw new Error('The server could not verify the removal.');
        await load();
      }
      setSelected(null);
      setPreviewUrl(null);
      onDeleted?.(release.id);
      notify('Recording removed. Audio and artwork are no longer available.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to remove this recording.');
    } finally { setRemoving(false); }
  };

  const visibleAudio = auditMode === 'pending' ? queue : audioLibrary;
  const formatted = (date:unknown) => date ? new Date(String(date)).toLocaleString('en-GB') : 'Date unavailable';
  const formattedScheduled = (release:any) => release.scheduledAt ? new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:release.scheduledTimeZone || 'Europe/London'}).format(new Date(release.scheduledAt))+' ('+(release.scheduledTimeZone || 'Europe/London')+')' : 'As soon as approved';
  if (!open) return null;
  return <div className="admin-panel-modal" role="dialog" aria-modal="true">
    <section className="moderation-modal">
      <div className="admin-modal-head"><div><span className="mini-label">ADMINISTRATION / CONTENT · AUDIO REVIEW</span><h2>Audio Library &amp; Release Moderation</h2><p>{demoMode ? 'Fictional audio and moderation records; actions are simulation only.' : 'Listen to real uploaded audio before or after submission. Files attached to drafts appear here but are NOT moderation submissions. Only submitted releases can be approved.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Close audio review"><X size={18} /></button></div>
      <div className="nj-audio-review-tabs" role="group" aria-label="Audio review views">
        <button type="button" className={auditMode === 'all' ? 'primary-button' : 'secondary-button'} aria-pressed={auditMode === 'all'} onClick={()=>{setAuditMode('all');setSelected(null);}}>All attached audio ({audioLibrary.length})</button>
        <button type="button" className={auditMode === 'pending' ? 'primary-button' : 'secondary-button'} aria-pressed={auditMode === 'pending'} onClick={()=>{setAuditMode('pending');setSelected(null);}}>Awaiting moderation ({queue.length})</button>
        <button type="button" className="ghost-button" disabled={loading} onClick={()=>void load()}>Refresh uploads</button>
      </div>
      {auditMode === 'all' && <p className="nj-audio-review-help">An uploaded recording is initially just a private draft attachment. It enters the approval queue only when the Creator submits their completed release. You can inspect both stages here.</p>}
      {libraryTruncated && <p className="nj-audio-review-help">Showing the most recent matches from the first 1,000 release records. Additional records may require a more specific audit.</p>}
      {loadError && <p role="alert" className="nj-audio-review-error">{loadError}</p>}
      <div className="moderation-layout">
        <aside className="moderation-queue">{loading ? <div className="people-empty">Loading live audio records…</div> : visibleAudio.length ? visibleAudio.map((release) => <button key={release.id} className={selected?.id === release.id ? 'moderation-item active' : 'moderation-item'} onClick={() => setSelected(release)}><FileAudio size={16} /><span><strong>{release.title || 'Untitled release'}</strong><small>{release.creatorName || 'Creator'} · {release.category || 'Audio'}</small><small className={release.status === 'pending_review' ? 'nj-audio-review-queue-status pending' : 'nj-audio-review-queue-status'}>{release.status === 'scheduled' ? 'APPROVED · AWAITING RELEASE TIME' : release.status === 'pending_review' ? 'AWAITING MODERATION' : release.status === 'draft' ? 'DRAFT · AUDIO ATTACHED' : String(release.status ?? 'Unknown').replaceAll('_',' ').toUpperCase()}</small></span></button>) : <div className="people-empty"><Check size={18}/><strong>{auditMode === 'pending' ? 'No releases awaiting moderation' : 'No attached audio records found'}</strong><span>{auditMode === 'pending' ? 'Audio attached to a private draft will be listed under All attached audio.' : 'Check that a creator completed Firebase audio verification, then refresh.'}</span></div>}</aside>
        <article className="moderation-preview">{selected ? <><div className="moderation-preview-head"><div><span className="mini-label">{selected.category || 'AUDIO'}</span><h3>{selected.title}</h3><p>By {selected.creatorName || 'Nightjar creator'} · {selected.creatorHandle ? '@' + selected.creatorHandle.replace(/^@/, '') : 'handle not set'}</p></div>{previewLoading && <p role="status">Opening signed, private Nightjar audio preview…</p>}{previewError && <p role="alert" className="nj-audio-review-error">{previewError}</p>}{previewUrl && <audio key={selected.id} className="moderation-audio" controls src={previewUrl} preload="none" />}{!selected.audioAvailable && <p>No verified audio is attached to this release.</p>}</div><div className="moderation-copy"><div className={selected.status === 'pending_review' ? 'nj-audio-review-state pending' : 'nj-audio-review-state'}><strong>{selected.status === 'pending_review' ? 'Submitted · ready for moderation review' : selected.status === 'draft' ? 'Private draft · NOT submitted for moderation' : selected.status === 'released' ? 'Approved · live in Nightjar catalogue' : 'Not currently awaiting moderation'}</strong><span>Updated: {formatted(selected.updatedAt)}{selected.submittedAt ? ' · Submitted: ' + formatted(selected.submittedAt) : ''}{selected.audioByteSize ? ' · Audio ' + (selected.audioByteSize / (1024 * 1024)).toFixed(2) + ' MB' : ''}</span></div><p>{selected.description || 'No description.'}</p><div className="nj-admin-release-plan"><strong>Creator publication preference</strong><span>{formattedScheduled(selected)}</span><small>{selected.scheduledAt ? 'Approval now will schedule publication, not make the recording public.' : 'Approval will publish immediately.'}</small></div>{selected.releaseDistribution && selected.releaseDistribution !== 'standard' && <p className="nj-admin-release-distribution"><strong>Creator-declared label:</strong> First on NightJar <small>This debut label does not restrict other publishing. Nightjar Original is only for commissioned and paid-for productions.</small></p>}{selected.productionNote && <p><strong>Behind the scenes:</strong> {selected.productionNote}</p>}
          <section className="moderation-transcript-review">
            <div className="moderation-transcript-head">
              <div><span className="mini-label">ACCESSIBILITY TRANSCRIPT</span><strong><BookOpenText size={15}/> Final-release text alternative</strong></div>
              <span className={String(selected.transcriptText ?? '').trim() && selected.transcriptAccessibilityReviewed === true ? 'status-pill' : 'status-pill muted'}>
                {String(selected.transcriptText ?? '').trim() ? selected.transcriptAccessibilityReviewed === true ? 'CREATOR REVIEWED' : 'VERIFY TEXT' : 'OPTIONAL · NONE'}
              </span>
            </div>
            {String(selected.transcriptText ?? '').trim()
              ? <pre className="moderation-transcript-copy">{String(selected.transcriptText)}</pre>
              : <div className="people-empty"><BookOpenText size={16}/><strong>No transcript supplied.</strong><span>Transcripts are optional. You may approve this recording without one.</span></div>}
            <small>{selected.transcriptLanguage || 'en'} · {Math.max(0, Number(selected.transcriptWordCount ?? 0)).toLocaleString('en-GB')} words</small>
            {selected.audioAvailable === true && <TranscriptSyncTool
              key={selected.id}
              releaseId={selected.id}
              audioAvailable={selected.audioAvailable === true}
              transcriptText={selected.transcriptText}
              language={selected.transcriptLanguage}
              isAdmin
              simulationMode={demoMode}
              onSaved={async saved => {
                setSelected((prior: any) => prior?.id === selected.id ? { ...prior, ...saved } : prior);
                await load();
                notify('Timed transcript saved; the creator does not need to resubmit.');
              }}
            />}
          </section>
          <div className="moderation-tags">{[...(selected.tags || []), ...(selected.tropes || [])].map((tag:string) => <span key={tag}>{tag}</span>)}</div>{!!selected.contributors?.length && <div className="moderation-credit-list">{selected.contributors.map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}: {credit.name}</span>)}</div>}{selected.status === 'pending_review' && <div className="nj-original-paid-gate">
              <label className="rights-check moderation-original-check"><input type="checkbox" checked={nightjarOriginal} onChange={(e)=>{setNightjarOriginal(e.target.checked);setOriginalCommissionConfirmed(false);}}/> Designate as a Nightjar Original (paid for and commissioned by Nightjar only)</label>
              {nightjarOriginal && <label className="rights-check"><input type="checkbox" checked={originalCommissionConfirmed} onChange={(e)=>setOriginalCommissionConfirmed(e.target.checked)}/> I confirm Nightjar commissioned and paid for this production. A creator premiering independently does not qualify.</label>}
            </div>}</div>{selected.status === 'pending_review' && <div className="nj-admin-decision">
            <div className="moderation-actions">
              <button type="button" className="secondary-button" onClick={()=>{setReviewDecision('changes');setReviewNote('');}}><MessageSquare size={14}/> Request changes</button>
              <button type="button" className="ghost-button" onClick={()=>{setReviewDecision('rejected');setReviewNote('');}}><X size={14}/> Reject</button>
              <button type="button" className="primary-button" disabled={!demoMode && Boolean(String(selected.transcriptText ?? '').trim()) && selected.transcriptAccessibilityReviewed !== true} onClick={()=>{setReviewDecision('approved');setReviewNote('');}}><Check size={14}/> {selected.scheduledAt?'Approve & schedule':'Approve & publish'}</button>
            </div>
            {reviewDecision && <section className="nj-admin-decision-editor" aria-label="Moderation decision and message">
              <h4>{reviewDecision==='approved' ? selected.scheduledAt ? 'Approve for the scheduled release' : 'Approve and publish now' : reviewDecision==='changes'?'Request changes from the creator':'Reject this recording'}</h4>
              <p>{reviewDecision==='approved'
                ? selected.scheduledAt ? 'Nightjar will keep this approved audio private until '+formattedScheduled(selected)+'.' : 'Approval will make this recording available to eligible Nightjar listeners.'
                : 'The creator must receive a clear reason and will be able to reply in Nightjar Messages.'}</p>
              <label>{reviewDecision==='approved'?'Note to creator (optional)':'Explain your decision (required)'}
                <textarea rows={4} value={reviewNote} maxLength={1200} onChange={(event)=>setReviewNote(event.target.value)} placeholder={reviewDecision==='approved'?'A courtesy note from Nightjar…':'Explain what needs correcting and why…'} />
              </label>
              <div><button type="button" className="secondary-button" disabled={reviewBusy} onClick={()=>setReviewDecision(null)}>Cancel</button>
                <button type="button" className="primary-button" disabled={reviewBusy || (reviewDecision!=='approved'&&!reviewNote.trim())} onClick={()=>void decide(reviewDecision)}>{reviewBusy?'Saving decision…':'Confirm & notify creator'}</button>
              </div>
            </section>}
          </div>}{selected.status !== 'pending_review' && <p className="nj-audio-review-help">Listening is for administrator quality checks only. Moderation decisions unlock after the creator submits the completed release.</p>}
        <div className="nj-admin-creator-contact">
          <strong>Discuss this submission with the creator</strong>
          <p>Approval and rejection notes are also sent to the creator's Nightjar Inbox. You can open a direct conversation at any time.</p>
          <button type="button" className="secondary-button" disabled={!selected.creatorUserId} onClick={() => selected.creatorUserId && onMessageCreator?.(String(selected.creatorUserId))}>Message creator in Nightjar</button>
        </div>
        <div className="nj-admin-recording-removal"><p>Administrator control · remove a test upload, submitted work or published recording.</p><button type="button" className="ghost-button nj-work-remove-button" disabled={removing} onClick={() => void removeSelected()}>{removing ? 'Removing recording…' : 'Remove recording permanently'}</button></div></> : <div className="people-empty"><Eye size={19} /><strong>Select a release.</strong><span>Moderation shows the actual audio and metadata together.</span></div>}</article>
      </div>
    </section>
  </div>;
}
