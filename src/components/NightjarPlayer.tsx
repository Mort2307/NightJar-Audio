import { useEffect, useRef, useState } from 'react';
import { api } from '@appdeploy/client';
import { ChevronLeft, ChevronRight, Moon, Pause, Play, Volume2, X } from 'lucide-react';

export type NightjarPlayerTrack = {
  id: string;
  title: string;
  creator: string;
  duration?: string;
  category?: string;
  descriptor?: string;
  audioUrl?: string | null;
  artworkUrl?: string | null;
};

type Props = {
  track: NightjarPlayerTrack | null;
  queue?: NightjarPlayerTrack[];
  intent?: string;
  onSelectTrack?: (track: NightjarPlayerTrack) => void;
  onClose: () => void;
  notify: (message: string) => void;
};

const formatTime = (seconds: number) => !Number.isFinite(seconds) ? '0:00' : Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

export default function NightjarPlayer({ track, queue = [], intent = '', onSelectTrack, onClose, notify }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastProgressEvent = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [volume, setVolume] = useState(1);
  const [rememberedPosition, setRememberedPosition] = useState(0);

  const currentIndex = track ? queue.findIndex((item) => item.id === track.id) : -1;
  const previousTrack = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextTrack = currentIndex >= 0 && currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null;

  useEffect(() => {
    let cancelled = false;
    setRememberedPosition(0);
    const loadResume = async () => {
      if (!track?.id) return;
      try {
        const { data } = await api.get('/api/listening/resume/' + encodeURIComponent(track.id));
        if (!cancelled && typeof data?.positionSeconds === 'number') setRememberedPosition(Math.max(0, data.positionSeconds));
      } catch { /* resume is enhancement, never blocks playback */ }
    };
    void loadResume();
    return () => { cancelled = true; };
  }, [track?.id]);

  useEffect(() => {
    const node = audioRef.current;
    if (!node || !track?.audioUrl) return;
    lastProgressEvent.current = 0;
    setPosition(0);
    setDuration(1);
    setIsPlaying(false);
    void node.play().catch(() => notify('Press play to start this release.'));
    void api.post('/api/listening/event', { releaseId: track.id, eventType: 'start', positionSeconds: rememberedPosition || 0, durationSeconds: 0, intent }).catch(() => {});
    return () => { node.pause(); };
  }, [track?.id, track?.audioUrl]);

  useEffect(() => {
    const node = audioRef.current;
    if (!node || !rememberedPosition) return;
    const apply = () => {
      if (node.duration && rememberedPosition < node.duration) {
        node.currentTime = rememberedPosition;
        setPosition(rememberedPosition);
      }
    };
    if (node.readyState >= 1) apply();
    else node.addEventListener('loadedmetadata', apply, { once: true });
    return () => node.removeEventListener('loadedmetadata', apply);
  }, [rememberedPosition, track?.id]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  if (!track?.audioUrl) return null;

  const choose = (next: NightjarPlayerTrack | null) => {
    if (next && onSelectTrack) onSelectTrack(next);
    else if (!next) onClose();
  };

  return <div className="player-dock" role="region" aria-label="Nightjar audio player">
    <audio
      ref={audioRef}
      src={track.audioUrl}
      preload="metadata"
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 1)}
      onPlay={() => setIsPlaying(true)}
      onPause={(event) => { setIsPlaying(false); const node = event.currentTarget; if (node.currentTime > 0 && node.currentTime < (node.duration || Infinity) - 1) void api.post('/api/listening/event', { releaseId: track.id, eventType: 'pause', positionSeconds: node.currentTime, durationSeconds: node.duration || duration, intent }).catch(() => {}); }}
      onTimeUpdate={(event) => {
        const node = event.currentTarget;
        setPosition(node.currentTime);
        if (node.currentTime - lastProgressEvent.current >= 15) {
          lastProgressEvent.current = node.currentTime;
          void api.post('/api/listening/event', { releaseId: track.id, eventType: 'progress', positionSeconds: node.currentTime, durationSeconds: node.duration || duration, intent }).catch(() => {});
        }
      }}
      onEnded={() => {
        setIsPlaying(false);
        setPosition(duration);
        void api.post('/api/listening/event', { releaseId: track.id, eventType: 'complete', positionSeconds: duration, durationSeconds: duration, completed: true, intent }).catch(() => {});
        if (nextTrack && onSelectTrack) window.setTimeout(() => onSelectTrack(nextTrack), 350);
      }}
      onError={() => notify('Nightjar could not play this audio file.')}
    />
    <div className="dock-art">{track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <Moon size={16} />}</div>
    <div className="dock-copy"><span>{track.category || 'Audio'}</span><strong>{track.title}</strong><small>{track.creator}</small></div>
    <div className="dock-time">{formatTime(position)} / {formatTime(duration)}</div>
    <input className="dock-progress" type="range" min="0" max={duration} step="0.1" value={Math.min(position, duration)} onChange={(event) => { const value = Number(event.target.value); setPosition(value); if (audioRef.current) { audioRef.current.currentTime = value; void api.post('/api/listening/event', { releaseId: track.id, eventType: 'seek', positionSeconds: value, durationSeconds: audioRef.current.duration || duration, intent }).catch(() => {}); } }} aria-label="Playback position" />
    <div className="dock-nav">
      <button className="dock-nav-button" disabled={!previousTrack || !onSelectTrack} onClick={() => choose(previousTrack)} aria-label="Previous release"><ChevronLeft size={15} /></button>
      <button className="dock-play" onClick={() => { const node = audioRef.current; if (!node) return; if (node.paused) void node.play(); else node.pause(); }} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button>
      <button className="dock-nav-button" disabled={!nextTrack || !onSelectTrack} onClick={() => choose(nextTrack)} aria-label="Next release"><ChevronRight size={15} /></button>
    </div>
    <div className="dock-volume"><Volume2 size={15} /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" /></div>
    <button className="dock-close" onClick={onClose} aria-label="Close player"><X size={15} /></button>
  </div>;
}
