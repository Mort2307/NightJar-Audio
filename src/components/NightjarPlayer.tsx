import { useEffect, useMemo, useRef, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { nightjarListening } from '../platform/firebase-listening';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  nightjarAccessibility,
  type AccessibilityPreferences,
} from '../platform/firebase-accessibility';
import { BookOpenText, ChevronLeft, ChevronRight, Clock3, Moon, Pause, Play, Volume2, X } from 'lucide-react';

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
  transcriptAvailable?: boolean;
  transcriptLanguage?: string;
  transcriptWordCount?: number;
  playbackAllowed?: boolean;
  playbackAccessReason?: 'admin' | 'credited_work' | 'subscription' | 'subscription_required' | null;
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

type TranscriptCue = {
  id: string;
  timeSeconds: number | null;
  text: string;
};

const formatTime = (seconds: number) => !Number.isFinite(seconds) ? '0:00' : Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

const transcriptTime = (value: string) => {
  const parts = value.split(':').map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    if (seconds >= 60) return null;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    if (minutes >= 60 || seconds >= 60) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }
  return null;
};

const parseTranscript = (transcript: string): TranscriptCue[] => {
  const lines = transcript.replace(/\r\n?/g, '\n').split('\n');
  const cues: TranscriptCue[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim();
    if (text) cues.push({ id: 'p-' + cues.length, timeSeconds: null, text });
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const match = line.match(/^\[((?:\d{1,2}:)?\d{1,3}:\d{2})\]\s*(.*)$/);
    if (match) {
      flushParagraph();
      const timeSeconds = transcriptTime(match[1]);
      cues.push({
        id: 't-' + cues.length + '-' + (timeSeconds ?? 'x'),
        timeSeconds,
        text: match[2].trim() || '…',
      });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();

  return cues;
};

export default function NightjarPlayer({ track, queue = [], intent = '', onSelectTrack, onClose, notify, simulationMode = false }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastProgressEvent = useRef(0);
  const transcriptCueRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(1);
  const [volume, setVolume] = useState(1);
  const [rememberedPosition, setRememberedPosition] = useState(0);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(track?.audioUrl ?? null);
  const [sleepTimer, setSleepTimer] = useState<'off' | '10' | '15' | '30' | '45' | '60' | 'end'>('off');
  const sleepTimerTimeout = useRef<number | null>(null);
  const [accessibility, setAccessibility] = useState<AccessibilityPreferences>(DEFAULT_ACCESSIBILITY_PREFERENCES);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptLanguage, setTranscriptLanguage] = useState('en');
  const [transcriptError, setTranscriptError] = useState('');

  const currentIndex = track ? queue.findIndex((item) => item.id === track.id) : -1;
  const previousTrack = currentIndex > 0 ? queue[currentIndex - 1] : null;
  const nextTrack = currentIndex >= 0 && currentIndex < queue.length - 1 ? queue[currentIndex + 1] : null;
  const transcriptCues = useMemo(() => parseTranscript(transcriptText), [transcriptText]);
  const timedTranscript = useMemo(() => transcriptCues.some((cue) => cue.timeSeconds != null), [transcriptCues]);
  const activeTranscriptCueId = useMemo(() => {
    let active: TranscriptCue | null = null;
    for (const cue of transcriptCues) {
      if (cue.timeSeconds == null) continue;
      if (cue.timeSeconds <= position) active = cue;
      else break;
    }
    return active?.id ?? null;
  }, [transcriptCues, position]);

  const saveAccessibility = async (next: AccessibilityPreferences) => {
    setAccessibility(next);
    try {
      const saved = await nightjarAccessibility.save(next);
      setAccessibility(saved);
    } catch {
      notify('Nightjar could not save that accessibility preference yet.');
    }
  };

  const loadTranscript = async () => {
    if (!track?.id || transcriptBusy || transcriptText) return;
    if (simulationMode) {
      setTranscriptLanguage('en');
      setTranscriptText('[00:00] Nightjar transcript preview\n\n[00:08] This demonstration shows how timed text can follow playback while the listener reads.');
      return;
    }
    setTranscriptBusy(true);
    setTranscriptError('');
    try {
      const data = await nightjarCatalogue.transcript(track.id);
      setTranscriptText(data.transcript ?? '');
      setTranscriptLanguage(data.language || 'en');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setTranscriptError(message.includes('subscription')
        ? 'A Nightjar subscription is required to read this transcript.'
        : 'This transcript could not be opened.');
    } finally {
      setTranscriptBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (simulationMode) {
      setAccessibility(DEFAULT_ACCESSIBILITY_PREFERENCES);
      return;
    }
    void nightjarAccessibility.get()
      .then((preferences) => {
        if (!cancelled) setAccessibility(preferences);
      })
      .catch(() => {
        if (!cancelled) setAccessibility(DEFAULT_ACCESSIBILITY_PREFERENCES);
      });
    return () => { cancelled = true; };
  }, [simulationMode]);

  useEffect(() => {
    setTranscriptText('');
    setTranscriptError('');
    setTranscriptLanguage(track?.transcriptLanguage || 'en');
    const shouldOpen = Boolean(track?.transcriptAvailable) && accessibility.transcriptMode === 'always_open';
    setTranscriptOpen(shouldOpen);
    if (shouldOpen) void loadTranscript();
  }, [track?.id, track?.transcriptAvailable, accessibility.transcriptMode]);

  useEffect(() => {
    if (!transcriptOpen || !accessibility.transcriptFollowPlayback || !activeTranscriptCueId) return;
    transcriptCueRefs.current[activeTranscriptCueId]?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }, [activeTranscriptCueId, transcriptOpen, accessibility.transcriptFollowPlayback]);

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
    if (track?.playbackAllowed === false || track?.playbackAccessReason === 'subscription_required') {
      setPlaybackUrl(null);
      notify('A Nightjar subscription is required for work you are not credited on. Your own credited work remains included for you.');
      return () => { cancelled = true; };
    }
    if (!track?.id || track.audioUrl || !track.audioAvailable) return () => { cancelled = true; };
    void nightjarCatalogue.playback(track.id).then((data) => {
      if (!cancelled) setPlaybackUrl(data.url);
    }).catch((error) => {
      if (!cancelled) {
        setPlaybackUrl(null);
        const message = error instanceof Error ? error.message : '';
        notify(message.includes('subscription') ? 'A Nightjar subscription is required for work you are not credited on. Your own credited work remains included for you.' : 'Playback could not be opened for this release.');
      }
    });
    return () => { cancelled = true; };
  }, [track?.id, track?.audioAvailable, track?.audioUrl, track?.playbackAllowed, track?.playbackAccessReason, simulationMode]);

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

  const seekTo = (seconds: number) => {
    setPosition(seconds);
    if (!simulationMode && audioRef.current) audioRef.current.currentTime = seconds;
  };

  const toggleTranscript = () => {
    if (!track.transcriptAvailable && !simulationMode) {
      notify('A transcript has not been published for this release yet.');
      return;
    }
    const next = !transcriptOpen;
    setTranscriptOpen(next);
    if (next) void loadTranscript();
  };

  return <div className={transcriptOpen ? 'nightjar-player-shell transcript-open' : 'nightjar-player-shell'}>
    <div className="player-dock" role="region" aria-label="Nightjar audio player">
      {!simulationMode && <audio
        ref={audioRef}
        src={playbackUrl ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 1)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
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
        onError={() => notify('Nightjar could not play this audio file.')}
      />}
      <div className="dock-art">{track.artworkUrl ? <img src={track.artworkUrl} alt="" /> : <Moon size={16} />}</div>
      <div className="dock-copy"><span>{track.category || 'Audio'}</span><strong>{track.title}</strong><small>{track.creator}</small></div>
      <div className="dock-time">{formatTime(position)} / {formatTime(duration)}</div>
      <input className="dock-progress" type="range" min="0" max={duration} step="0.1" value={Math.min(position, duration)} onChange={(event) => seekTo(Number(event.target.value))} aria-label="Playback position" />
      <div className="dock-nav">
        <button className="dock-nav-button" disabled={!previousTrack || !onSelectTrack} onClick={() => choose(previousTrack)} aria-label="Previous release"><ChevronLeft size={15} /></button>
        <button className="dock-play" onClick={() => { if (simulationMode) { setIsPlaying((value) => !value); return; } const node = audioRef.current; if (!node) return; if (node.paused) void node.play(); else node.pause(); }} aria-label={isPlaying ? 'Pause' : 'Play'}>{isPlaying ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}</button>
        <button className="dock-nav-button" disabled={!nextTrack || !onSelectTrack} onClick={() => choose(nextTrack)} aria-label="Next release"><ChevronRight size={15} /></button>
      </div>
      <button
        className={transcriptOpen ? 'dock-transcript active' : 'dock-transcript'}
        type="button"
        onClick={toggleTranscript}
        aria-expanded={transcriptOpen}
        aria-controls="nightjar-transcript-panel"
        aria-label={transcriptOpen ? 'Hide transcript' : 'Show transcript'}
      >
        <BookOpenText size={15}/>
        <span>Transcript</span>
      </button>
      <div className="dock-volume"><Volume2 size={15} /><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume" /></div>
      <label className="dock-sleep"><Clock3 size={14}/><select value={sleepTimer} onChange={(event) => setSleepTimer(event.target.value as typeof sleepTimer)} aria-label="Sleep timer"><option value="off">Sleep off</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="end">End of audio</option></select></label>
      <button className="dock-close" onClick={onClose} aria-label="Close player"><X size={15} /></button>
    </div>

    {transcriptOpen && <aside
      id="nightjar-transcript-panel"
      className={[
        'nightjar-transcript-panel',
        'text-' + accessibility.transcriptTextSize,
        accessibility.transcriptHighContrast ? 'high-contrast' : '',
      ].filter(Boolean).join(' ')}
      aria-label={'Transcript for ' + track.title}
      lang={transcriptLanguage}
    >
      <header className="nightjar-transcript-head">
        <div>
          <span className="mini-label">ACCESSIBLE TEXT · READ ALONG</span>
          <h2>{track.title}</h2>
          <p>{timedTranscript ? 'Timed transcript · select a timestamp to jump playback.' : 'Full text transcript · available alongside playback.'}</p>
        </div>
        <button className="icon-button" type="button" onClick={() => setTranscriptOpen(false)} aria-label="Close transcript"><X size={17}/></button>
      </header>

      <div className="nightjar-transcript-controls" aria-label="Transcript preferences">
        <label>
          <input
            type="checkbox"
            checked={accessibility.transcriptMode === 'always_open'}
            onChange={(event) => void saveAccessibility({
              ...accessibility,
              transcriptMode: event.target.checked ? 'always_open' : 'on_demand',
            })}
          />
          Always open transcripts when available
        </label>
        <label>
          <input
            type="checkbox"
            checked={accessibility.transcriptFollowPlayback}
            onChange={(event) => void saveAccessibility({
              ...accessibility,
              transcriptFollowPlayback: event.target.checked,
            })}
          />
          Follow playback
        </label>
        <label>
          Text size
          <select
            value={accessibility.transcriptTextSize}
            onChange={(event) => void saveAccessibility({
              ...accessibility,
              transcriptTextSize: event.target.value as AccessibilityPreferences['transcriptTextSize'],
            })}
          >
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="extra_large">Extra large</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={accessibility.transcriptHighContrast}
            onChange={(event) => void saveAccessibility({
              ...accessibility,
              transcriptHighContrast: event.target.checked,
            })}
          />
          Higher transcript contrast
        </label>
      </div>

      <div className="nightjar-transcript-body" tabIndex={0}>
        {transcriptBusy && <div className="people-empty"><BookOpenText size={18}/><strong>Opening transcript…</strong></div>}
        {!transcriptBusy && transcriptError && <div className="people-empty"><strong>Transcript unavailable</strong><span>{transcriptError}</span></div>}
        {!transcriptBusy && !transcriptError && transcriptCues.map((cue) => (
          <div
            key={cue.id}
            ref={(node) => { transcriptCueRefs.current[cue.id] = node; }}
            className={cue.id === activeTranscriptCueId ? 'nightjar-transcript-cue active' : 'nightjar-transcript-cue'}
            aria-current={cue.id === activeTranscriptCueId ? 'true' : undefined}
          >
            {cue.timeSeconds != null && <button
              type="button"
              className="nightjar-transcript-time"
              onClick={() => seekTo(cue.timeSeconds as number)}
              aria-label={'Jump playback to ' + formatTime(cue.timeSeconds)}
            >
              {formatTime(cue.timeSeconds)}
            </button>}
            <p>{cue.text}</p>
          </div>
        ))}
      </div>
    </aside>}
  </div>;
}
