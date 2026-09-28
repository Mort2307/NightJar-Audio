import { useEffect, useRef, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { nightjarListening } from '../platform/firebase-listening';
import { ChevronLeft, ChevronRight, Clock3, Moon, Pause, Play, RotateCcw, RotateCw, Volume2, X } from 'lucide-react';

export type NightjarPlayerTrack = {
  id: string;
  title: string;
  creator: string;
  duration?: string;
  category?: string;
  descriptor?: string;
  audioAvailable?: boolean;
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
  simulationMode?: boolean;
};

const formatTime = (seconds: number) => !Number.isFinite(seconds) ? '0:00' : Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

export default function NightjarPlayer({ track, queue = [], intent = '', onSelectTrack, onClose, notify, simulationMode = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastProgressEvent = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [volume, setVolume] = useState(() => Math.max(0, Math.min(1, Number(window.localStorage.getItem('nightjar.player.volume') ?? 1) || 0)));
  const [speed, setSpeed] = useState(() => {
    const saved = Number(window.localStorage.getItem('nightjar.player.speed'));
    return [0.75, 1, 1.25, 1.5, 2].includes(saved) ? saved : 1;
  });
  const [buffering, setBuffering] = useState(false);
  const [rememberedPosition, setRememberedPosition] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(track?.audioUrl ?? null);
  const [sleepTimer, setSleepTimer] = useState<'off' | '10' | '15' | '30' | '45' | '60' | 'end'>('off');
  const sleepTimerTimeout = useRef<number | null>(null);

  const currentIndex = track ? queue.findIndex((item) => item.id === track.id) : -1;
  const previousTrack = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextTrack = currentIndex >= 0 && currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null;

  useEffect(() => {
    if (simulationMode) {
      setRememberedPosition(0);
      return;
    }
    let cancelled = false;
    setRememberedPosition(0);
    const loadResume = async () => {
      if (!track?.id) return;
      try {
        const data = await nightjarListening.resume(track.id);
        if (!cancelled && typeof data.positionSeconds === 'number') setRememberedPosition(Math.max(0, data.positionSeconds));
      } catch { /* resume is enhancement, never blocks playback */ }
    };
    void loadResume();
    return () => { cancelled = true; };
  }, [track?.id, simulationMode]);

  useEffect(() => {
    if (simulationMode) {
      setPlaybackUrl(null);
      return;
    }
    let cancelled = false;
    setPlaybackUrl(track?.audioUrl ?? null);
    if (!track?.id || track.audioUrl || !track.audioAvailable) return () => { cancelled = true; };
    void nightjarCatalogue.playback(track.id).then((data) => {
      if (!cancelled) setPlaybackUrl(data.url);
    }).catch(() => {
      if (!cancelled) {
        setPlaybackUrl(null);
        notify('Age-verified playback could not be opened for this release.');
      }
    });
    return () => { cancelled = true; };
  }, [track?.id, track?.audioAvailable, track?.audioUrl, simulationMode]);

  useEffect(() => {
    if (simulationMode) {
      const minutes = Number.parseFloat(String(track?.duration ?? ''));
      setPosition(0);
      setDuration(Number.isFinite(minutes) && minutes > 0 ? minutes * 60 : 30 * 60);
      setIsPlaying(false);
      return;
    }
    const node = audioRef.current;
    if (!node || !playbackUrl || !track?.id) return;
    lastProgressEvent.current = 0;
    setPosition(0);
    setDuration(1);
    setIsPlaying(false);
    void node.play().catch(() => notify('Press play to start this release.'));
    void nightjarListening.record({ releaseId: track.id, eventType: 'start', positionSeconds: rememberedPosition || 0, durationSeconds: 0, intent }).catch(() => {});
    return () => { node.pause(); };
  }, [track?.id, playbackUrl, simulationMode]);

  useEffect(() => {
    if (simulationMode) return;
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
  }, [rememberedPosition, track?.id, simulationMode]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => { window.localStorage.setItem('nightjar.player.volume', String(volume)); }, [volume]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
    window.localStorage.setItem('nightjar.player.speed', String(speed));
  }, [speed, playbackUrl]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !track) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title: track.title, artist: track.creator, album: 'Nightjar', artwork: track.artworkUrl ? [{ src: track.artworkUrl }] : [] });
    session.playbackState = isPlaying ? 'playing' : 'paused';
    const seek = (offset: number) => {
      const node = audioRef.current;
      if (simulationMode) setPosition((value) => Math.max(0, Math.min(duration, value + offset)));
      else if (node) node.currentTime = Math.max(0, Math.min(node.duration || duration, node.currentTime + offset));
    };
    session.setActionHandler('play', () => { if (simulationMode) setIsPlaying(true); else void audioRef.current?.play(); });
    session.setActionHandler('pause', () => { if (simulationMode) setIsPlaying(false); else audioRef.current?.pause(); });
    session.setActionHandler('seekbackward', (details) => seek(-(details.seekOffset ?? 15)));
    session.setActionHandler('seekforward', (details) => seek(details.seekOffset ?? 15));
    session.setActionHandler('previoustrack', previousTrack && onSelectTrack ? () => onSelectTrack(previousTrack) : null);
    session.setActionHandler('nexttrack', nextTrack && onSelectTrack ? () => onSelectTrack(nextTrack) : null);
    return () => {
      for (const action of ['play', 'pause', 'seekbackward', 'seekforward', 'previoustrack', 'nexttrack'] as MediaSessionAction[]) session.setActionHandler(action, null);
    };
  }, [track?.id, track?.title, track?.creator, track?.artworkUrl, isPlaying, duration, simulationMode, previousTrack?.id, nextTrack?.id, onSelectTrack]);

  useEffect(() => {
    if (!simulationMode || !isPlaying) return;
    const timer = window.setInterval(() => {
      setPosition((current) => {
        const next = Math.min(duration, current + 1);
        if (next >= duration) {
          setIsPlaying(false);
          if (sleepTimer === 'end') setSleepTimer('off');
          else if (nextTrack && onSelectTrack) window.setTimeout(() => onSelectTrack(nextTrack), 250);
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [simulationMode, isPlaying, duration, sleepTimer, nextTrack?.id]);

  useEffect(() => {
    if (sleepTimerTimeout.current != null) {
      window.clearTimeout(sleepTimerTimeout.current);
      sleepTimerTimeout.current = null;
    }
    if (sleepTimer === 'off' || sleepTimer === 'end') return;
    const minutes = Number(sleepTimer);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    sleepTimerTimeout.current = window.setTimeout(() => {
      if (simulationMode) setIsPlaying(false);
      else audioRef.current?.pause();
      setSleepTimer('off');
      notify('Sleep timer finished. Playback paused.');
    }, minutes * 60 * 1000);
    return () => {
      if (sleepTimerTimeout.current != null) window.clearTimeout(sleepTimerTimeout.current);
      sleepTimerTimeout.current = null;
    };
  }, [sleepTimer, simulationMode]);

  if (!track || (!track.audioAvailable && !track.audioUrl)) return null;

  const choose = (next: NightjarPlayerTrack | null) => {
    if (next && onSelectTrack) onSelectTrack(next);
    else if (!next) onClose();
  };
  const skip = (offset: number) => {
    if (simulationMode) setPosition((value) => Math.max(0, Math.min(duration, value + offset)));
    else if (audioRef.current) audioRef.current.currentTime = Math.max(0, Math.min(audioRef.current.duration || duration, audioRef.current.currentTime + offset));
  };

  return <div className="player-dock" role="region" aria-label="Nightjar audio player">
    {!simulationMode && <audio
      ref={audioRef}
      src={playbackUrl ?? undefined}
      preload="metadata"
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 1)}
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onWaiting={() => setBuffering(true)}
      onCanPlay={() => setBuffering(false)}
      onTimeUpdate={(event) => {
        const node = event.currentTarget;
        setPosition(node.currentTime);
        if (node.currentTime - lastProgressEvent.current >= 15) {
          lastProgressEvent.current = node.currentTime;
          void nightjarListening.record({ releaseId: track.id, eventType: 'progress', positionSeconds: node.currentTime, durationSeconds: node.duration || duration, intent }).catch(() => {});
        }
      }}
      onEnded={() => {
        setIsPlaying(false);
        setPosition(duration);
        void nightjarListening.record({ releaseId: track.id, eventType: 'complete', positionSeconds: duration, durationSeconds: duration, completed: true, intent }).catch(() => {});
        if (sleepTimer === 'end') {
          setSleepTimer('off');
          return;
        }
        if (nextTrack && onSelectTrack) window.setTimeout(() => onSelectTrack(nextTrack), 350);
      }}
      onError={() => { setBuffering(false); notify('Nightjar could not play this audio file. Try reopening the release.'); }}
    />}
    <div className="dock-art">{track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <Moon size={16} />}</div>
    <div className="dock-copy"><span>{buffering ? 'BUFFERING…' : track.category || 'Audio'}</span><strong>{track.title}</strong><small>{track.creator}</small></div>
    <div className="dock-time">{formatTime(position)} / {formatTime(duration)}</div>
    <input className="dock-progress" type="range" min="0" max={duration} step="0.1" value={Math.min(position, duration)} onChange={(event) => { const value = Number(event.target.value); setPosition(value); if (!simulationMode && audioRef.current) audioRef.current.currentTime = value; }} aria-label="Playback position" />
    <div className="dock-nav">
      <button className="dock-nav-button" disabled={!previousTrack || !onSelectTrack} onClick={() => choose(previousTrack)} aria-label="Previous release"><ChevronLeft size={15} /></button>
      <button className="dock-nav-button" onClick={() => skip(-15)} aria-label="Back 15 seconds"><RotateCcw size={17} /><span>15</span></button>
      <button className="dock-play" onClick={() => { if (simulationMode) { setIsPlaying((value) => !value); return; } const node = audioRef.current; if (!node) return; if (node.paused) void node.play(); else node.pause(); }} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button>
      <button className="dock-nav-button" onClick={() => skip(15)} aria-label="Forward 15 seconds"><RotateCw size={17} /><span>15</span></button>
      <button className="dock-nav-button" disabled={!nextTrack || !onSelectTrack} onClick={() => choose(nextTrack)} aria-label="Next release"><ChevronRight size={15} /></button>
    </div>
    <div className="dock-volume"><Volume2 size={15} /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" /></div>
    <label className="dock-speed"><span>Speed</span><select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Playback speed"><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
    <label className="dock-sleep"><Clock3 size={14}/><select value={sleepTimer} onChange={(event) => setSleepTimer(event.target.value as typeof sleepTimer)} aria-label="Sleep timer"><option value="off">Sleep off</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="end">End of audio</option></select></label>
    <button className="dock-close" onClick={onClose} aria-label="Close player"><X size={15} /></button>
  </div>;
}
