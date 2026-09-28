import { useEffect, useMemo, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { nightjarMedia } from '../platform/firebase-media';
import { nightjarCollaboration } from '../platform/firebase-collaboration';
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
  audioAvailable?: boolean;
  audioUrl?: string | null;
  artworkUrl?: string | null;
  artworkAssetId?: string | null;
  artworkStatus?: 'approved' | 'removed' | null;
  pendingArtworkAssetId?: string | null;
  pendingArtworkStatus?: 'pending' | 'rejected' | null;
  status?: string;
  moderationNote?: string | null;
  contributors?: { userId?: string | null; name: string; role: string }[];
  contentRating?: 'sfw' | 'suggestive' | 'adult' | 'explicit';
  seriesTitle?: string | null;
  episodeNumber?: number | null;
  nightjarOriginal?: boolean;
  productionNote?: string | null;
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

const readAudioDurationMinutes = (file: File) => new Promise<number | null>((resolve) => {
  const objectUrl = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.onloadedmetadata = () => {
    const seconds = Number(audio.duration);
    URL.revokeObjectURL(objectUrl);
    resolve(Number.isFinite(seconds) && seconds > 0 ? Number((seconds / 60).toFixed(1)) : null);
  };
  audio.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    resolve(null);
  };
  audio.src = objectUrl;
});

export default function CreatorAudioPipeline({ releases, accountStatus, canPublish, onRefresh, notify }: Props) {
  const [selectedRelease, setSelectedRelease] = useState<Release | null>(null);
  const [draft, setDraft] = useState({ title: '', description: '', category: '', genre: '', mood: '', tags: '', tropes: '' });
  const [audioBusy, setAudioBusy] = useState(false);
  const [artBusy, setArtBusy] = useState(false);
  const [creditDirectory, setCreditDirectory] = useState<any[]>([]);

  const current = selectedRelease ?? null;

  useEffect(() => {
    void nightjarCollaboration.directory()
      .then((data) => setCreditDirectory(data.people ?? []))
      .catch(() => setCreditDirectory([]));
  }, []);
  const statusLabel = current?.status === 'pending_review' ? 'IN MODERATION' : current?.status === 'released' ? 'LIVE' : current?.status === 'draft' ? 'DRAFT' : String(current?.status ?? 'NEW').toUpperCase();
  const statusHint = current?.status === 'pending_review'
    ? 'Your submission is with Nightjar moderation.'
    : current?.status === 'released'
      ? 'Published and available to age-verified listeners.'
      : current?.moderationNote
        ? current.moderationNote
        : 'A complete release can be submitted for moderation.';

  const complete = useMemo(() => Boolean(current?.title && current.description && current.audioAvailable && current.category), [current]);

  const setRelease = (patch: Partial<Release>) => setSelectedRelease((value) => value ? ({ ...value, ...patch }) : value);

  const updateContributor = (index: number, patch: Partial<{ name: string; role: string; userId?: string | null }>) => {
    if (!current) return;
    const contributors = [...(current.contributors ?? [])];
    const existing = contributors[index];
    contributors[index] = {
      name: patch.name ?? existing?.name ?? '',
      role: patch.role ?? existing?.role ?? 'Voice Actor',
      userId: patch.userId !== undefined ? patch.userId : existing?.userId ?? null,
    };
    setRelease({ contributors });
  };

  const addContributor = () => {
    if (!current || (current.contributors?.length ?? 0) >= 24) return;
    setRelease({ contributors: [...(current.contributors ?? []), { name: '', role: 'Voice Actor', userId: null }] });
  };

  const removeContributor = (index: number) => {
    if (!current) return;
    setRelease({ contributors: (current.contributors ?? []).filter((_, itemIndex) => itemIndex !== index) });
  };

  useEffect(() => {
    if (!current?.id || !current.pendingArtworkAssetId || current.pendingArtworkStatus !== 'pending') return;
    let cancelled = false;
    const pendingAssetId = current.pendingArtworkAssetId;
    const releaseId = current.id;

    const checkStatus = async () => {
      try {
        const status = await nightjarMedia.status(pendingAssetId);
        if (cancelled || status.status === 'pending') return;
        if (status.status === 'approved') {
          setSelectedRelease((value) => value?.id === releaseId ? {
            ...value,
            artworkAssetId: pendingAssetId,
            artworkUrl: status.publicUrl,
            artworkStatus: 'approved',
            pendingArtworkAssetId: null,
            pendingArtworkStatus: null,
          } : value);
        } else if (status.status === 'rejected' || status.status === 'removed') {
          setSelectedRelease((value) => value?.id === releaseId ? {
            ...value,
            pendingArtworkAssetId: null,
            pendingArtworkStatus: status.status === 'rejected' ? 'rejected' : null,
          } : value);
        }
        await onRefresh();
      } catch { /* moderation sync is non-blocking */ }
    };

    void checkStatus();
    const timer = window.setInterval(() => void checkStatus(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [current?.id, current?.pendingArtworkAssetId, current?.pendingArtworkStatus]);

  const createDraft = async () => {
    if (!draft.title.trim()) return notify('Give the release a title first.');
    try {
      const data = await nightjarCatalogue.create({
        title: draft.title,
        description: draft.description,
        category: draft.category,
        genre: draft.genre,
        mood: draft.mood,
        tags: draft.tags.split(',').map((item) => item.trim()).filter(Boolean),
        tropes: draft.tropes.split(',').map((item) => item.trim()).filter(Boolean),
        contentRating: 'adult',
        contributors: [],
      });
      const next = data.release as Release | undefined;
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
      if (kind === 'artwork') {
        const dataUrl = await readDataUrl(file);
        const image = await nightjarMedia.submitImage({
          kind: 'release_artwork',
          targetId: current.id,
          dataUrl,
          contentType: file.type,
          fileName: file.name,
        });
        setSelectedRelease({
          ...current,
          pendingArtworkAssetId: image.assetId,
          pendingArtworkStatus: 'pending',
        });
        await onRefresh();
        notify(current.artworkUrl
          ? 'Replacement artwork submitted for administrator approval. Your current approved artwork stays live until the replacement is approved.'
          : 'Artwork submitted for administrator approval. It cannot appear publicly until approved.');
        return;
      }

      const durationMinutes = await readAudioDurationMinutes(file);
      const data = await nightjarCatalogue.uploadAudio(current.id, file, durationMinutes);
      setSelectedRelease(data.release ?? { ...current, audioAvailable: true, ...(durationMinutes ? { durationMinutes } : {}) });
      await onRefresh();
      notify('Audio attached privately to the release.');
    } catch { notify(kind === 'audio' ? 'Audio upload failed.' : 'Artwork upload failed.'); }
    finally { if (kind === 'audio') setAudioBusy(false); else setArtBusy(false); }
  };

  const removeArtwork = async () => {
    if (!current?.id) return;
    setArtBusy(true);
    try {
      if (current.pendingArtworkAssetId) await nightjarMedia.removeOwnedImage(current.pendingArtworkAssetId);
      if (current.artworkAssetId) await nightjarMedia.removeOwnedImage(current.artworkAssetId);
      setSelectedRelease({
        ...current,
        artworkAssetId: null,
        artworkUrl: null,
        artworkStatus: null,
        pendingArtworkAssetId: null,
        pendingArtworkStatus: null,
      });
      await onRefresh();
      notify('Release artwork removed.');
    } catch { notify('Release artwork could not be removed.'); }
    finally { setArtBusy(false); }
  };

  const removeAudio = async () => {
    if (!current?.id) return;
    setAudioBusy(true);
    try {
      await nightjarCatalogue.removeAudio(current.id);
      setSelectedRelease({ ...current, audioAvailable: false, audioUrl: null, durationMinutes: 0 });
      await onRefresh();
      notify('Release audio removed.');
    } catch { notify('Release audio could not be removed.'); }
    finally { setAudioBusy(false); }
  };

  const deleteDraft = async () => {
    if (!current?.id || current.status === 'released') return;
    if (!window.confirm('Delete this release draft and its private audio?')) return;
    try {
      await nightjarCatalogue.remove(current.id);
      setSelectedRelease(null);
      await onRefresh();
      notify('Release draft removed.');
    } catch { notify('Release draft could not be removed.'); }
  };

  const saveMetadata = async () => {
    if (!current?.id) return;
    try {
      const data = await nightjarCatalogue.update(current.id, {
        ...current,
        tags: current.tags ?? [],
        tropes: current.tropes ?? [],
      });
      setSelectedRelease(data.release ?? current);
      await onRefresh();
      notify('Release metadata saved.');
    } catch { notify('Release metadata could not be saved.'); }
  };

  const submit = async () => {
    if (!current?.id) return;
    if (!complete) return notify('Add a title, description, category and audio before submitting.');
    if (!canPublish || accountStatus === 'pending_review') return notify('Creator publishing stays locked until your account is approved.');
    try {
      await nightjarCatalogue.submit(current.id);
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
            <label>Content level<select value={current.contentRating ?? 'adult'} onChange={(event) => setRelease({ contentRating: event.target.value as Release['contentRating'] })}><option value="sfw">SFW</option><option value="suggestive">Suggestive</option><option value="adult">Adult</option><option value="explicit">Explicit</option></select></label>
            <label>Series title<input value={current.seriesTitle ?? ''} onChange={(event) => setRelease({ seriesTitle: event.target.value || null })} placeholder="Optional series"/></label>
            <label>Episode number<input type="number" min="0" step="1" value={current.episodeNumber ?? ''} onChange={(event) => setRelease({ episodeNumber: event.target.value === '' ? null : Number(event.target.value) })} placeholder="Optional"/></label>
            <label className="pipeline-span-two">Production / behind-the-scenes note<textarea value={current.productionNote ?? ''} onChange={(event) => setRelease({ productionNote: event.target.value || null })} placeholder="Optional context about the people or process behind this release."/></label>
          </div>

          <section className="release-credits-editor">
            <div className="release-credits-head"><div><span className="mini-label">PRODUCTION CREDITS</span><strong>Credit everyone involved.</strong><p>Voice Actors, Writers, Audio Editors and other collaborators stay attached to the release.</p></div><button className="secondary-button" type="button" onClick={addContributor}>Add credit</button></div>
            <div className="release-credit-list">
              {(current.contributors ?? []).map((contributor, index) => <div className="release-credit-row" key={index}>
                <select value={contributor.role} onChange={(event) => updateContributor(index, { role: event.target.value })}>
                  <option>Voice Actor</option><option>Writer</option><option>Audio Editor</option><option>Producer</option><option>Director</option><option>Sound Designer</option><option>Cover Artist</option><option>Composer</option><option>Other</option>
                </select>
                <select value={contributor.userId ?? ''} onChange={(event) => {
                  const person = creditDirectory.find((item) => item.userId === event.target.value);
                  if (person) updateContributor(index, { userId: person.userId, name: person.name, role: person.role === 'writer' ? 'Writer' : person.role === 'editor' ? 'Audio Editor' : contributor.role });
                  else updateContributor(index, { userId: null });
                }}>
                  <option value="">Unlinked / external credit</option>
                  {creditDirectory.map((person) => <option key={person.userId} value={person.userId}>{person.name} · {person.role === 'editor' ? 'Audio Editor' : person.role === 'writer' ? 'Writer' : 'Creator'}</option>)}
                </select>
                <input value={contributor.name} onChange={(event) => updateContributor(index, { name: event.target.value })} placeholder="Credited name"/>
                <button className="ghost-button" type="button" onClick={() => removeContributor(index)}>Remove</button>
              </div>)}
              {!(current.contributors ?? []).length && <div className="people-empty"><strong>No additional credits yet.</strong><span>The primary Creator remains credited automatically. Add every other contributor here.</span></div>}
            </div>
          </section>

          <div className="pipeline-assets">
            <div className="asset-drop asset-drop-moderated"><Music2 size={18} /><strong>{audioBusy ? 'Working…' : current.audioAvailable ? 'Replace private audio' : 'Attach private audio'}</strong><span>MP3 / WAV / M4A / OGG / WebM · max 25 MB · direct public reads blocked</span><label className="secondary-button upload-label">{current.audioAvailable ? 'Replace audio' : 'Choose audio'}<input type="file" accept="audio/*" hidden disabled={audioBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, 'audio'); event.currentTarget.value = ''; }} /></label>{current.audioAvailable && <button className="ghost-button" disabled={audioBusy} onClick={()=>void removeAudio()}>Remove audio</button>}</div>
            <div className="asset-drop asset-drop-moderated"><ImagePlus size={18} /><strong>{artBusy ? 'Working…' : current.pendingArtworkStatus === 'pending' ? current.artworkUrl ? 'Replacement awaiting approval' : 'Artwork awaiting approval' : current.artworkUrl ? 'Replace approved artwork' : 'Attach artwork'}</strong><span>PNG / JPG / WebP · max 5 MB · administrator approval required</span><label className="secondary-button upload-label">{current.artworkUrl || current.pendingArtworkAssetId ? 'Replace' : 'Choose image'}<input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={artBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAsset(file, 'artwork'); event.currentTarget.value = ''; }} /></label>{(current.artworkUrl || current.artworkAssetId || current.pendingArtworkAssetId) && <button className="ghost-button" disabled={artBusy} onClick={()=>void removeArtwork()}>Remove artwork</button>}</div>
          </div>

          <div className="pipeline-footer"><span>{current.audioAvailable ? 'Private audio connected' : 'Audio missing'} · {current.pendingArtworkStatus === 'pending' ? current.artworkUrl ? 'Approved artwork live · replacement pending' : 'Artwork pending admin approval' : current.pendingArtworkStatus === 'rejected' ? current.artworkUrl ? 'Approved artwork live · replacement rejected' : 'Artwork rejected' : current.artworkUrl ? 'Approved artwork connected' : 'Artwork optional'}</span><div>{current.status !== 'released' && <button className="ghost-button" onClick={() => void deleteDraft()}>Delete draft</button>}<button className="secondary-button" onClick={() => void saveMetadata()}>Save draft</button><button className="primary-button" onClick={() => void submit()} disabled={!complete || current.status === 'pending_review' || current.status === 'released'}><Send size={14} /> Submit to moderation</button></div></div>
        </> : <div className="people-empty"><Mic2 size={19} /><strong>Select a release draft.</strong><span>The pipeline keeps upload, metadata and moderation state together.</span></div>}
      </div>
    </div>
  </article>;
}
