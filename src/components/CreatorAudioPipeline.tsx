import { useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import { Check, ImagePlus, Mic2, Music2, Send, UploadCloud } from 'lucide-react';

type Release = {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  genre?: string;
  mood?: string;
  tags?: string[];
  tropes?: string[];
  durationMinutes?: number;
  audioUrl?: string | null;
  artworkUrl?: string | null;
  status?: string;
  moderationNote?: string | null;
};

type Props = {
  releases: Release[];
  accountStatus: 'active' | 'pending_review';
  canPublish: boolean;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
};

const readDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function CreatorAudioPipeline({ releases, accountStatus, canPublish, onRefresh, notify }: Props) {
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', category: '', genre: '', mood: '', tags: '', tropes: '' });
  const [audioBusy, setAudioBusy] = useState(false);
  const [artBusy, setArtBusy] = useState(false);

  const current = selectedRelease ?? null;
  const statusLabel = current?.status === 'pending_review' ? 'IN MODERATION' : current?.status === 'released' ? 'LIVE' : current?.status === 'draft' ? 'DRAFT' : String(current?.status ?? 'NEW').toUpperCase();
  const statusHint = current?.status === 'pending_review'
    ? 'Your submission is with Nightjar moderation.'
    : current?.status === 'released'
      ? 'Published and available to age-verified listeners.'
      : current?.moderationNote
        ? current.moderationNote
        : 'A complete release can be submitted for moderation.';

  const complete = useMemo(() => Boolean(current?.title && current.description && current.audioUrl && current.category), [current]);

  const setRelease = (patch: Partial<Release>) => setSelectedRelease((value) => value ? ({ ...value, ...patch }) : value);

  const createDraft = async () => {
    if (!draft.title.trim()) return notify('Give the release a title first.');
    try {
      const { data } = await api.post('/api/creator/releases', {
        title: draft.title,
        description: draft.description,
        category: draft.category,
        genre: draft.genre,
        mood: draft.mood,
        tags: draft.tags.split(',').map((item) => item.trim()).filter(Boolean),
        tropes: draft.tropes.split(',').map((item) => item.trim()).filter(Boolean),
      });
      const next = data?.release as Release | undefined;
      setDraft({ title: '', description: '', category: '', genre: '', mood: '', tags: '', tropes: '' });
      if (next) setSelectedRelease(next);
      await onRefresh();
      notify('Release draft created.');
    } catch { notify('Release draft could not be created.'); }
  };

  const uploadAsset = async (file: File, kind: 'audio' | 'artwork') => {
    const max = kind === 'audio' ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > max) return notify(kind === 'audio' ? 'Audio must be 25 MB or smaller.' : 'Artwork must be 5 MB or smaller.');
    const allowedAudio = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/ogg', 'audio/webm'];
    const allowedImage = ['image/png', 'image/jpeg', 'image/webp'];
    if (kind === 'audio' && !allowedAudio.includes(file.type)) return notify('Use MP3, WAV, M4A, OGG or WebM audio.');
    if (kind === 'artwork' && !allowedImage.includes(file.type)) return notify('Use PNG, JPG or WebP artwork.');
    if (!current?.id) return notify('Create the release draft before uploading its assets.');

    if (kind === 'audio') setAudioBusy(true); else setArtBusy(true);
    try {
      const dataUrl = await readDataUrl(file);
      const { data } = await api.post('/api/creator/assets', { releaseId: current.id, kind, dataUrl, contentType: file.type, fileName: file.name });
      setRelease({ audioUrl: kind === 'audio' ? data?.url ?? null : current.audioUrl, artworkUrl: kind === 'artwork' ? data?.url ?? null : current.artworkUrl });
      await onRefresh();
      notify(kind === 'audio' ? 'Audio attached to the release.' : 'Artwork attached to the release.');
    } catch { notify(kind === 'audio' ? 'Audio upload failed.' : 'Artwork upload failed.'); }
    finally { if (kind === 'audio') setAudioBusy(false); else setArtBusy(false); }
  };

  const saveMetadata = async () => {
    if (!current?.id) return;
    try {
      const { data } = await api.put('/api/creator/releases/' + current.id, {
        ...current,
        tags: current.tags ?? [],
        tropes: current.tropes ?? [],
      });
      setSelectedRelease(data?.release ?? current);
      await onRefresh();
      notify('Release metadata saved.');
    } catch { notify('Release metadata could not be saved.'); }
  };

  const submit = async () => {
    if (!current?.id) return;
    if (!complete) return notify('Add a title, description, category and audio before submitting.');
    if (!canPublish || accountStatus === 'pending_review') return notify('Creator publishing stays locked until your account is approved.');
    try {
      await api.post('/api/creator/releases/' + current.id + '/publish');
      await onRefresh();
      const refreshed = releases.find((item) => item.id === current.id);
      setSelectedRelease(refreshed ?? { ...current, status: 'pending_review' });
      notify('Release submitted to Nightjar moderation.');
    } catch { notify('Release could not be submitted for moderation.'); }
  };

  return <article className="creator-pipeline-card panel-card">
    <div className="creator-pipeline-header">
      <div>
        <span className="mini-label">CREATOR → CATALOGUE</span>
        <h2>Build a release properly.</h2>
        <p>Real audio, real metadata, explicit discovery tags and a controlled publishing handoff.</p>
      </div>
      <span className="status-pill"><Mic2 size={12} /> {statusLabel}</span>
    </div>

    <div className="creator-pipeline-grid">
      <aside className="pipeline-library">
        <div className="pipeline-list">{releases.map((release) => <button key={release.id} className={current?.id === release.id ? 'pipeline-release active' : 'pipeline-release'} onClick={() => setSelectedRelease(release)}><strong>{release.title || 'Untitled release'}</strong><span>{release.status || 'draft'}</span></button>)}</div>
        {!releases.length && <div className="people-empty"><Music2 size={18} /><strong>No release drafts yet.</strong><span>Create the first piece of Nightjar’s launch catalogue.</span></div>}
        <div className="pipeline-create">
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="New release title" />
          <button className="primary-button" onClick={() => void createDraft()}><UploadCloud size={14} /> Start release</button>
        </div>
      </aside>

      <div className="pipeline-editor">
        {current ? <>
          <div className="pipeline-status"><div><span>{statusLabel}</span><strong>{statusHint}</strong></div><Check size={18} /></div>
          <div className="pipeline-form-grid">
            <label>Title<input value={current.title ?? ''} onChange={(event) => setRelease({ title: event.target.value })} /></label>
            <label>Category<input value={current.category ?? ''} onChange={(event) => setRelease({ category: event.target.value })} placeholder="Story, performance, soundscape…" /></label>
            <label>Genre<input value={current.genre ?? ''} onChange={(event) => setRelease({ genre: event.target.value })} /></label>
            <label>Mood<input value={current.mood ?? ''} onChange={(event) => setRelease({ mood: event.target.value })} /></label>
            <label className="pipeline-span-two">Description<textarea value={current.description ?? ''} onChange={(event) => setRelease({ description: event.target.value })} placeholder="What should a listener know before pressing play?" /></label>
            <label>Tags<input value={(current.tags ?? []).join(', ')} onChange={(event) => setRelease({ tags: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Whisper, cinematic, character-led…" /></label>
            <label>Tropes<input value={(current.tropes ?? []).join(', ')} onChange={(event) => setRelease({ tropes: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} placeholder="Slow burn, suspense…" /></label>
          </div>

          <div className="pipeline-assets">
            <label className="asset-drop"><Music2 size={18} /><strong>{audioBusy ? 'Uploading audio…' : current.audioUrl ? 'Replace audio' : 'Attach audio'}</strong><span>MP3 / WAV / M4A / OGG / WebM · max 25 MB</span><input type="file" accept="audio/*" disabled={audioBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, 'audio'); event.currentTarget.value = ''; }} /></label>
            <label className="asset-drop"><ImagePlus size={18} /><strong>{artBusy ? 'Uploading artwork…' : current.artworkUrl ? 'Replace artwork' : 'Attach artwork'}</strong><span>PNG / JPG / WebP · max 5 MB</span><input type="file" accept="image/*" disabled={artBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, 'artwork'); event.currentTarget.value = ''; }} /></label>
          </div>

          <div className="pipeline-footer"><span>{current.audioUrl ? 'Audio connected' : 'Audio missing'} · {current.artworkUrl ? 'Artwork connected' : 'Artwork optional'}</span><div><button className="secondary-button" onClick={() => void saveMetadata()}>Save draft</button><button className="primary-button" onClick={() => void submit()} disabled={!complete || current.status === 'pending_review' || current.status === 'released'}><Send size={14} /> Submit to moderation</button></div></div>
        </> : <div className="people-empty"><Mic2 size={19} /><strong>Select a release draft.</strong><span>The pipeline keeps upload, metadata and moderation state together.</span></div>}
      </div>
    </div>
  </article>;
}
