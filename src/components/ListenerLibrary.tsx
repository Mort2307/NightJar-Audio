import { useEffect, useMemo, useState } from 'react';
import { Bookmark, BookmarkPlus, Clock3, Eye, EyeOff, Heart, ListMusic, Play, Plus, Trash2, X } from 'lucide-react';
import { nightjarLibrary } from '../platform/firebase-library';
import { nightjarExperience, type MomentMark } from '../platform/firebase-experience';
import { demoLibrary } from '../demo/nightjarDemo';
import { readDemo, writeDemo } from '../demo/demoSession';

type Props = {
  onPlayRelease: (release: any) => void;
  onPlayMoment: (release: any, seconds: number) => void;
  notify: (message: string) => void;
  demoMode?: boolean;
  simulationMode?: boolean;
  onDiscoverCreators?: () => void;
};

export default function ListenerLibrary({ onPlayRelease, onPlayMoment, notify, demoMode = false, simulationMode = false, onDiscoverCreators }: Props) {
  const [library, setLibrary] = useState<any>({ history: [], continueListening: [], favourites: [], playlists: [] });
  const [tab, setTab] = useState<'continue' | 'history' | 'favourites' | 'playlists' | 'marks'>('continue');
  const [marks, setMarks] = useState<MomentMark[]>([]);
  const [marksLoading, setMarksLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setLibrary(readDemo('library', demoLibrary));
      } else {
        const data = await nightjarLibrary.load();
        setLibrary(data);
      }
    } catch {
      notify('Your listener library could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [demoMode]);
  useEffect(() => { if (simulationMode && !loading) writeDemo('library', library); }, [library, loading, simulationMode]);

  const loadMarks = async () => {
    if (demoMode) return;
    setMarksLoading(true);
    try { setMarks(await nightjarExperience.marks()); }
    catch { notify('Your Moment Marks could not be loaded.'); }
    finally { setMarksLoading(false); }
  };

  useEffect(() => {
    if (tab === 'marks') void loadMarks();
  }, [tab, demoMode]);

  const deleteMark = async (markId: string) => {
    if (demoMode) return notify('Moment Marks are available on your real NightJar account.');
    try {
      await nightjarExperience.deleteMark(markId);
      setMarks((current) => current.filter((item) => item.id !== markId));
      notify('Moment removed.');
    } catch { notify('Moment could not be removed.'); }
  };

  const available = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of [...(library.favourites ?? []), ...(library.history ?? [])]) {
      if (item?.id) map.set(String(item.id), item);
    }
    return Array.from(map.values());
  }, [library]);

  const dismiss = async (releaseId: string) => {
    if (demoMode && !simulationMode) return notify('Start Listener Simulation to change the demo library.');
    try {
      if (simulationMode) {
        setLibrary((current: any) => ({ ...current, continueListening: (current.continueListening ?? []).filter((item: any) => String(item.id) !== releaseId) }));
      } else {
        await nightjarLibrary.dismissContinue(releaseId);
        await load();
      }
      notify('Removed from Continue Listening.');
    } catch {
      notify('Continue Listening could not be updated.');
    }
  };

  const hideHistory = async (releaseId: string) => {
    if (demoMode && !simulationMode) return notify('Start Listener Simulation to change the demo library.');
    try {
      if (simulationMode) {
        setLibrary((current: any) => ({
          ...current,
          history: (current.history ?? []).filter((item: any) => String(item.id) !== releaseId),
          continueListening: (current.continueListening ?? []).filter((item: any) => String(item.id) !== releaseId),
        }));
      } else {
        await nightjarLibrary.hideHistory(releaseId);
        await load();
      }
      notify('Removed from your visible listening history.');
    } catch {
      notify('Listening history could not be updated.');
    }
  };

  const clearHistory = async () => {
    if (demoMode && !simulationMode) return notify('Start Listener Simulation to change the demo library.');
    if (!window.confirm('Clear your visible Nightjar listening history? This does not remove favourites or playlists.')) return;
    try {
      if (simulationMode) {
        setLibrary((current: any) => ({ ...current, history: [], continueListening: [] }));
      } else {
        await nightjarLibrary.clearHistory();
        await load();
      }
      notify('Visible listening history cleared.');
    } catch {
      notify('Listening history could not be cleared.');
    }
  };

  const createPlaylist = async () => {
    if (demoMode && !simulationMode) return notify('Start Listener Simulation to change the demo library.');
    if (!playlistTitle.trim()) return notify('Give the playlist a name first.');
    try {
      if (simulationMode) {
        setLibrary((current: any) => ({ ...current, playlists: [...(current.playlists ?? []), { id: 'demo-playlist-' + Date.now(), title: playlistTitle.trim(), releaseIds: selectedReleaseIds }] }));
      } else {
        await nightjarLibrary.savePlaylist(playlistTitle.trim(), selectedReleaseIds);
        await load();
      }
      setPlaylistTitle('');
      setSelectedReleaseIds([]);
      notify('Playlist saved.');
    } catch {
      notify('Playlist could not be saved.');
    }
  };

  const removePlaylist = async (playlistId: string) => {
    if (demoMode && !simulationMode) return notify('Start Listener Simulation to change the demo library.');
    if (!window.confirm('Delete this playlist?')) return;
    try {
      if (simulationMode) {
        setLibrary((current: any) => ({ ...current, playlists: (current.playlists ?? []).filter((item: any) => item.id !== playlistId) }));
      } else {
        await nightjarLibrary.deletePlaylist(playlistId);
        await load();
      }
      notify('Playlist deleted.');
    } catch {
      notify('Playlist could not be deleted.');
    }
  };

  const togglePlaylistProfileVisibility = async (playlist: any) => {
    if (demoMode && !simulationMode) return notify('Start Listener Simulation to change the demo library.');
    const next = playlist.publicOnProfile !== true;
    try {
      if (simulationMode) {
        const publicCount = (library.playlists ?? []).filter((item: any) => item.publicOnProfile).length;
        if (next && publicCount >= 6) return notify('You can share up to six playlists on your public profile.');
        setLibrary((current: any) => ({
          ...current,
          playlists: (current.playlists ?? []).map((item: any) => item.id === playlist.id ? { ...item, publicOnProfile: next } : item),
        }));
      } else {
        await nightjarLibrary.setPlaylistProfileVisibility(String(playlist.id), next);
        await load();
      }
      notify(next ? 'Playlist added to your public profile.' : 'Playlist removed from your public profile.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      notify(message.includes('six playlists') ? 'You can share up to six playlists on your public profile.' : 'Playlist visibility could not be updated.');
    }
  };

  const items = tab === 'continue'
    ? library.continueListening ?? []
    : tab === 'history'
      ? library.history ?? []
      : tab === 'favourites'
        ? library.favourites ?? []
        : [];

  return <section className="listener-library-shell">
    <div className="page-heading">
      <div><p className="eyebrow"><Bookmark size={14}/> YOUR LIBRARY</p><h1>Your listening, under your control.</h1><p>Continue where you left off, remove things you no longer care about, keep favourites separate and build your own playlists.</p>{onDiscoverCreators&&<button type="button" className="secondary-button" onClick={onDiscoverCreators}><Heart size={15}/> Discover creators and their work</button>}</div>
    </div>

    <div className="library-tabs">
      <button className={tab === 'continue' ? 'active' : ''} onClick={() => setTab('continue')}><Clock3 size={14}/> Continue Listening</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><ListMusic size={14}/> History</button>
      <button className={tab === 'favourites' ? 'active' : ''} onClick={() => setTab('favourites')}><Heart size={14}/> Favourites</button>
      <button className={tab === 'playlists' ? 'active' : ''} onClick={() => setTab('playlists')}><Bookmark size={14}/> Playlists</button>
      <button className={tab === 'marks' ? 'active' : ''} onClick={() => setTab('marks')}><BookmarkPlus size={14}/> Moment Marks</button>
      {tab === 'history' && (library.history ?? []).length > 0 && <button className="library-clear-history" onClick={() => void clearHistory()}><Trash2 size={13}/> Clear visible history</button>}
    </div>

    {loading ? <div className="people-empty">Loading your library…</div> : tab === 'marks' ? <div className="library-list" aria-label="Your private Moment Marks">
      {marksLoading ? <div className="people-empty">Loading saved moments…</div>
        : marks.length === 0 ? <div className="people-empty"><BookmarkPlus size={18}/><strong>No saved moments yet.</strong><span>Open a NightJar recording and tap Moment Mark at the exact point you want to revisit.</span></div>
        : marks.map((mark) => <article className="library-row" key={mark.id}>
          <button className="library-play" type="button" onClick={() => onPlayMoment(mark.release, mark.positionSeconds)}
            aria-label={'Play ' + mark.release.title + ' from ' + Math.floor(mark.positionSeconds / 60) + ' minutes'}>
            <Play size={15} fill="currentColor"/>
          </button>
          <div><strong>{mark.label || 'Saved moment'}</strong><span>{mark.release.title} · {Math.floor(mark.positionSeconds / 60)}:{String(Math.floor(mark.positionSeconds % 60)).padStart(2, '0')}</span><small>Private · saved on your account</small></div>
          <button type="button" className="ghost-button" onClick={() => void deleteMark(mark.id)}><Trash2 size={14}/> Remove</button>
        </article>)}
      {!demoMode && <button className="ghost-button" type="button" onClick={() => void loadMarks()}>Refresh saved moments</button>}
    </div> : tab !== 'playlists' ? <div className="library-list">
      {items.length === 0 ? <div className="people-empty"><ListMusic size={18}/><strong>Nothing here yet.</strong><span>Your library fills from real Nightjar listening and favourites.</span></div> : items.map((release: any) => <article className="library-row" key={release.id}>
        <button className="library-play" onClick={() => onPlayRelease(release)} aria-label={'Play ' + release.title}><Play size={15} fill="currentColor"/></button>
        <div><strong>{release.title}</strong><span>{release.creatorName ?? 'Nightjar creator'} · {release.category ?? 'Audio'}</span>{release.positionSeconds > 0 && <small>{Math.floor(release.positionSeconds / 60)} min listened</small>}</div>
        {tab === 'continue' && <button className="ghost-button" onClick={() => void dismiss(String(release.id))}><X size={13}/> Remove</button>}
        {tab === 'history' && <button className="ghost-button" onClick={() => void hideHistory(String(release.id))}><Trash2 size={13}/> Hide</button>}
      </article>)}
    </div> : <div className="playlist-workspace">
      <article className="research-panel">
        <div className="research-panel-head"><div><span className="mini-label">NEW PLAYLIST</span><h2>Build your own listening shelf.</h2></div><Plus size={20}/></div>
        <label>Playlist name<input value={playlistTitle} onChange={(e) => setPlaylistTitle(e.target.value)} placeholder="Late night favourites"/></label>
        <div className="playlist-picker">{available.length === 0 ? <span className="taste-empty">Favourite or listen to releases first.</span> : available.map((release: any) => <label key={release.id}><input type="checkbox" checked={selectedReleaseIds.includes(String(release.id))} onChange={(e) => setSelectedReleaseIds((ids) => e.target.checked ? Array.from(new Set([...ids, String(release.id)])) : ids.filter((id) => id !== String(release.id)))}/><span>{release.title}</span></label>)}</div>
        <button className="primary-button" onClick={() => void createPlaylist()}><Plus size={14}/> Save playlist</button>
      </article>
      <div className="playlist-privacy-note"><Eye size={15}/><div><strong>Playlists are private by default.</strong><span>Only playlists you explicitly share appear on your public Listener profile. Listening history and favourites remain private.</span></div></div>
      <div className="playlist-list">{(library.playlists ?? []).map((playlist: any) => <article className={playlist.publicOnProfile ? 'playlist-card public' : 'playlist-card'} key={playlist.id}><div><span>{playlist.releaseIds?.length ?? 0} releases · {playlist.publicOnProfile ? 'PUBLIC PROFILE' : 'PRIVATE'}</span><strong>{playlist.title}</strong></div><div className="playlist-card-actions"><button className={playlist.publicOnProfile ? 'secondary-button' : 'ghost-button'} onClick={() => void togglePlaylistProfileVisibility(playlist)}>{playlist.publicOnProfile ? <><EyeOff size={13}/> Remove from profile</> : <><Eye size={13}/> Share on profile</>}</button><button className="ghost-button" onClick={() => void removePlaylist(playlist.id)}><Trash2 size={13}/> Delete</button></div></article>)}</div>
    </div>}
  </section>;
}
