import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Clock3, Heart, ListMusic, Play, Plus, Trash2, X } from 'lucide-react';
import { nightjarLibrary } from '../platform/firebase-library';

type Props = {
  onPlayRelease: (release: any) => void;
  notify: (message: string) => void;
};

export default function ListenerLibrary({ onPlayRelease, notify }: Props) {
  const [library, setLibrary] = useState<any>({ history: [], continueListening: [], favourites: [], playlists: [] });
  const [tab, setTab] = useState<'continue' | 'history' | 'favourites' | 'playlists'>('continue');
  const [loading, setLoading] = useState(true);
  const [playlistTitle, setPlaylistTitle] = useState('');
  const [selectedReleaseIds, setSelectedReleaseIds] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await nightjarLibrary.load();
      setLibrary(data);
    } catch {
      notify('Your listener library could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const available = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of [...(library.favourites ?? []), ...(library.history ?? [])]) {
      if (item?.id) map.set(String(item.id), item);
    }
    return Array.from(map.values());
  }, [library]);

  const dismiss = async (releaseId: string) => {
    try {
      await nightjarLibrary.dismissContinue(releaseId);
      await load();
      notify('Removed from Continue Listening.');
    } catch {
      notify('Continue Listening could not be updated.');
    }
  };

  const hideHistory = async (releaseId: string) => {
    try {
      await nightjarLibrary.hideHistory(releaseId);
      await load();
      notify('Removed from your visible listening history.');
    } catch {
      notify('Listening history could not be updated.');
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('Clear your visible Nightjar listening history? This does not remove favourites or playlists.')) return;
    try {
      await nightjarLibrary.clearHistory();
      await load();
      notify('Visible listening history cleared.');
    } catch {
      notify('Listening history could not be cleared.');
    }
  };

  const createPlaylist = async () => {
    if (!playlistTitle.trim()) return notify('Give the playlist a name first.');
    try {
      await nightjarLibrary.savePlaylist(playlistTitle.trim(), selectedReleaseIds);
      setPlaylistTitle('');
      setSelectedReleaseIds([]);
      await load();
      notify('Playlist saved.');
    } catch {
      notify('Playlist could not be saved.');
    }
  };

  const removePlaylist = async (playlistId: string) => {
    if (!window.confirm('Delete this playlist?')) return;
    try {
      await nightjarLibrary.deletePlaylist(playlistId);
      await load();
      notify('Playlist deleted.');
    } catch {
      notify('Playlist could not be deleted.');
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
      <div><p className="eyebrow"><Bookmark size={14}/> YOUR LIBRARY</p><h1>Your listening, under your control.</h1><p>Continue where you left off, remove things you no longer care about, keep favourites separate and build your own playlists.</p></div>
    </div>

    <div className="library-tabs">
      <button className={tab === 'continue' ? 'active' : ''} onClick={() => setTab('continue')}><Clock3 size={14}/> Continue Listening</button>
      <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}><ListMusic size={14}/> History</button>
      <button className={tab === 'favourites' ? 'active' : ''} onClick={() => setTab('favourites')}><Heart size={14}/> Favourites</button>
      <button className={tab === 'playlists' ? 'active' : ''} onClick={() => setTab('playlists')}><Bookmark size={14}/> Playlists</button>
      {tab === 'history' && (library.history ?? []).length > 0 && <button className="library-clear-history" onClick={() => void clearHistory()}><Trash2 size={13}/> Clear visible history</button>}
    </div>

    {loading ? <div className="people-empty">Loading your library…</div> : tab !== 'playlists' ? <div className="library-list">
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
      <div className="playlist-list">{(library.playlists ?? []).map((playlist: any) => <article className="playlist-card" key={playlist.id}><div><span>{playlist.releaseIds?.length ?? 0} releases</span><strong>{playlist.title}</strong></div><button className="ghost-button" onClick={() => void removePlaylist(playlist.id)}><Trash2 size={13}/> Delete</button></article>)}</div>
    </div>}
  </section>;
}
