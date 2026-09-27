import { BarChart3, Heart, Moon, Pause, Play, Sparkles } from 'lucide-react';
import RecommendationFeedback from './RecommendationFeedback';

type Release = { id: string; title?: string; creatorName?: string; creatorUserId?: string; durationMinutes?: number; category?: string; description?: string; audioUrl?: string | null; artworkUrl?: string | null; genre?: string; mood?: string; tags?: string[]; tropes?: string[]; };
type Props = { release: Release; playing: boolean; favourite: boolean; onPlay: () => void; onFavourite: () => void; notify?: (message: string) => void; onFeedback?: (kind: string) => void; showFeedback?: boolean; };

export default function LiveReleaseCard({ release, playing, favourite, onPlay, onFavourite, notify, onFeedback, showFeedback = true }: Props) {
  const title = String(release.title ?? 'Untitled release');
  return <article className="track-card">
    <div className="track-cover" style={release.artworkUrl ? { backgroundImage: 'url("' + release.artworkUrl + '")', backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
      <span className="track-index">{release.category || 'Audio'}</span>
      {!release.artworkUrl && <div className="track-cover-mark"><Moon size={22} /></div>}
      <button className="cover-play" disabled={!release.audioUrl} onClick={onPlay} aria-label={!release.audioUrl ? 'Audio not connected' : playing ? 'Pause ' + title : 'Play ' + title}>{playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}</button>
    </div>
    <div className="track-body">
      <div className="track-type"><span>{release.creatorName || 'Nightjar creator'}</span><span>{release.durationMinutes ? String(release.durationMinutes) + ' min' : '—'}</span></div>
      <h3>{title}</h3>
      <p>{release.description || 'No description supplied.'}</p>
      <div className="track-footer"><span className="creator-link">{release.audioUrl ? 'Playable audio' : 'Audio not connected'}</span><button className="icon-button" onClick={onFavourite} aria-label={favourite ? 'Remove favourite' : 'Add favourite'}><Heart size={16} fill={favourite ? 'currentColor' : 'none'} /></button></div>
      {showFeedback && <RecommendationFeedback release={release} compact notify={notify} onFeedback={onFeedback as any} />}
      <p className="recommendation-reason"><Sparkles size={12} />{release.genre || release.mood ? 'Tagged ' + [release.genre, release.mood].filter(Boolean).join(' · ') + '.' : 'A Nightjar release available for discovery.'}</p>
    </div>
  </article>;
}