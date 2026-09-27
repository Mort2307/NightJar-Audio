import { useEffect, useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import { Ban, Check, Eye, FileAudio, History, MessageSquare, RotateCcw, ShieldAlert, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  notify: (message: string) => void;
};

type Scope = 'pending_review' | 'released' | 'held' | 'taken_down' | 'rejected';

const scopes: { value: Scope; label: string }[] = [
  { value: 'pending_review', label: 'Pending' },
  { value: 'released', label: 'Live' },
  { value: 'held', label: 'Held' },
  { value: 'taken_down', label: 'Taken down' },
  { value: 'rejected', label: 'Rejected' },
];

export default function ContentModeration({ open, onClose, notify }: Props) {
  const [library, setLibrary] = useState<any[]>([]);
  const [scope, setScope] = useState<Scope>('pending_review');
  const [selected, setSelected] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [reasonCode, setReasonCode] = useState('content_policy');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const queue = useMemo(() => library.filter((release) => release.status === scope), [library, scope]);
  const scopeCounts = useMemo(() => Object.fromEntries(scopes.map((item) => [item.value, library.filter((release) => release.status === item.value).length])), [library]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/api/admin/release-library');
      setLibrary(data?.releases ?? []);
    } catch { notify('Release moderation library could not be loaded.'); }
    finally { setLoading(false); }
  };

  const loadHistory = async (releaseId: string) => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get('/api/admin/releases/' + encodeURIComponent(releaseId) + '/moderation-history');
      setHistory(data?.history ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { if (open) void load(); }, [open]);
  useEffect(() => {
    setSelected(null);
    setHistory([]);
  }, [scope]);
  useEffect(() => {
    if (!selected?.id) {
      setHistory([]);
      return;
    }
    setReasonCode('content_policy');
    void loadHistory(String(selected.id));
  }, [selected?.id]);

  const decide = async (decision: 'approved' | 'changes' | 'rejected') => {
    if (!selected?.id || actionBusy) return;
    const note = decision === 'changes' ? (window.prompt('What should the creator change?') ?? '') : (window.prompt('Moderator note (optional)') ?? '');
    setActionBusy(true);
    try {
      await api.post('/api/admin/releases/' + selected.id + '/moderate', {
        decision,
        note,
        reasonCode: decision === 'approved' ? 'approved' : reasonCode,
      });
      await load();
      setSelected(null);
      notify(decision === 'approved' ? 'Release approved and published.' : decision === 'changes' ? 'Changes requested from the creator.' : 'Release rejected.');
    } catch { notify('Moderation decision could not be saved.'); }
    finally { setActionBusy(false); }
  };

  const lifecycle = async (action: 'hold' | 'restore' | 'takedown') => {
    if (!selected?.id || actionBusy) return;
    const note = window.prompt(action === 'restore' ? 'Restoration note (optional)' : action === 'hold' ? 'Why is this release being placed on hold?' : 'Why is this release being taken down?') ?? '';
    if (action !== 'restore' && !note.trim()) {
      notify('Add a short reason before removing a live release.');
      return;
    }
    setActionBusy(true);
    try {
      const { data } = await api.post('/api/admin/releases/' + selected.id + '/lifecycle', { action, note, reasonCode });
      await load();
      setSelected(data?.release ?? null);
      if (data?.release?.id) await loadHistory(String(data.release.id));
      notify(action === 'hold' ? 'Release placed on hold and removed from the public catalogue.' : action === 'takedown' ? 'Release taken down from the public catalogue.' : 'Release restored to the public catalogue.');
    } catch {
      notify('Release lifecycle action could not be saved.');
    } finally {
      setActionBusy(false);
    }
  };

  const selectedStatus = String(selected?.status ?? '');

  if (!open) return null;
  return <div className="admin-panel-modal" role="dialog" aria-modal="true">
    <section className="moderation-modal">
      <div className="admin-modal-head">
        <div><span className="mini-label">ADMINISTRATION / CONTENT</span><h2>Release moderation</h2><p>Review submissions and control the live catalogue. Every decision, hold, takedown and restoration is retained in the audit trail.</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close moderation"><X size={18} /></button>
      </div>

      <div className="moderation-scope-tabs" role="tablist" aria-label="Release moderation status">
        {scopes.map((item) => <button key={item.value} className={scope === item.value ? 'active' : ''} onClick={() => setScope(item.value)} role="tab" aria-selected={scope === item.value}>{item.label}<span>{scopeCounts[item.value] ?? 0}</span></button>)}
      </div>

      <div className="moderation-layout">
        <aside className="moderation-queue">
          {loading ? <div className="people-empty">Loading moderation library…</div> : queue.length ? queue.map((release) => <button key={release.id} className={selected?.id === release.id ? 'moderation-item active' : 'moderation-item'} onClick={() => setSelected(release)}><FileAudio size={16} /><span><strong>{release.title}</strong><small>{release.creatorName || 'Creator'} · {release.category || 'Audio'}</small></span></button>) : <div className="people-empty"><Check size={18} /><strong>No {scopes.find((item) => item.value === scope)?.label.toLowerCase()} releases.</strong><span>Nothing currently needs attention in this status.</span></div>}
        </aside>

        <article className="moderation-preview">
          {selected ? <>
            <div className="moderation-preview-head">
              <div><span className="mini-label">{selected.category || 'AUDIO'} · {selectedStatus.replace(/_/g, ' ').toUpperCase()}</span><h3>{selected.title}</h3><p>By {selected.creatorName || 'Nightjar creator'} · {selected.creatorHandle ? '@' + selected.creatorHandle.replace(/^@/, '') : 'handle not set'}</p></div>
              {selected.audioUrl && <audio className="moderation-audio" controls src={selected.audioUrl} />}
            </div>
            <div className="moderation-copy"><p>{selected.description || 'No description.'}</p><div className="moderation-tags">{[...(selected.tags || []), ...(selected.tropes || [])].map((tag:string) => <span key={tag}>{tag}</span>)}</div></div>

            <label className="moderation-reason">Decision reason<select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}><option value="content_policy">Content policy</option><option value="metadata">Metadata / labelling</option><option value="audio_quality">Audio quality</option><option value="rights">Rights / provenance</option><option value="safety">Safety concern</option><option value="other">Other</option></select></label>

            {selectedStatus === 'pending_review' && <div className="moderation-actions"><button disabled={actionBusy} className="secondary-button" onClick={() => void decide('changes')}><MessageSquare size={14} /> Request changes</button><button disabled={actionBusy} className="ghost-button" onClick={() => void decide('rejected')}><X size={14} /> Reject</button><button disabled={actionBusy} className="primary-button" onClick={() => void decide('approved')}><Check size={14} /> Approve & publish</button></div>}

            {selectedStatus === 'released' && <div className="moderation-actions lifecycle-actions"><button disabled={actionBusy} className="secondary-button" onClick={() => void lifecycle('hold')}><ShieldAlert size={14}/> Place on hold</button><button disabled={actionBusy} className="danger-button" onClick={() => void lifecycle('takedown')}><Ban size={14}/> Take down</button></div>}
            {selectedStatus === 'held' && <div className="moderation-actions lifecycle-actions"><button disabled={actionBusy} className="secondary-button" onClick={() => void lifecycle('restore')}><RotateCcw size={14}/> Restore live</button><button disabled={actionBusy} className="danger-button" onClick={() => void lifecycle('takedown')}><Ban size={14}/> Take down</button></div>}
            {selectedStatus === 'taken_down' && <div className="moderation-actions lifecycle-actions"><button disabled={actionBusy} className="secondary-button" onClick={() => void lifecycle('restore')}><RotateCcw size={14}/> Restore live</button></div>}

            <section className="moderation-history" aria-label="Moderation history">
              <div className="moderation-history-head"><span><History size={14}/> Audit trail</span><small>{historyLoading ? 'Loading…' : history.length + ' event' + (history.length === 1 ? '' : 's')}</small></div>
              {history.length ? history.map((item) => <div className="moderation-history-row" key={item.id ?? item.createdAt}><div><strong>{String(item.decision ?? 'decision').replace(/_/g, ' ')}</strong><span>{String(item.reasonCode ?? 'other').replace(/_/g, ' ')}</span></div><p>{item.note || 'No moderator note.'}</p><small>{item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB') : 'Recorded event'}</small></div>) : <div className="moderation-history-empty">No previous moderation events for this release.</div>}
            </section>
          </> : <div className="people-empty"><Eye size={19} /><strong>Select a release.</strong><span>Review its audio, metadata, current status and complete moderation history.</span></div>}
        </article>
      </div>
    </section>
  </div>;
}
