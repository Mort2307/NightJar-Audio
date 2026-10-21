import { useEffect, useMemo, useRef, useState } from 'react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import { nightjarListening } from '../platform/firebase-listening';
import { nightjarExperience } from '../platform/firebase-experience';
import {
  DEFAULT_ACCESSIBILITY_PREFERENCES,
  nightjarAccessibility,
  type AccessibilityPreferences,
} from '../platform/firebase-accessibility';
import { AudioLines, BookmarkPlus, BookOpenText, ChevronDown, ChevronLeft, ChevronRight, Clock3, Headphones, Minimize2, Maximize2, Pause, Play, Settings2, Volume2, X } from 'lucide-react';
import { useNightjarEqualizer } from '../hooks/useNightjarEqualizer';
import { useNightjarMediaSession } from '../hooks/useNightjarMediaSession';
import './nightjar-player-premium.css';
import ContextHelp from './ContextHelp';
import FramedApprovedImage from './FramedApprovedImage';

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
  artworkAssetId?: string | null;
  artworkFraming?: {assetId:string;mode:'fit'|'fill';zoom:number;x:number;y:number}|null;
  nightjarOriginal?: boolean;
  releaseDistribution?: 'standard' | 'nightjar_first';
  studioNoteForReleaseId?: string | null;
  contributors?: Array<{ name?: string; role?: string; userId?: string | null }>;
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
  initialTranscriptOpen?: boolean;
  initialSeekSeconds?: number | null;
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

export default function NightjarPlayer({ track, queue = [], intent = '', onSelectTrack, onClose, notify, simulationMode = false, initialTranscriptOpen = false, initialSeekSeconds = null }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const miniPlayerButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastProgressEvent = useRef(0);
  const listeningSessionId = useRef(crypto.randomUUID());
  const startedListeningSession = useRef('');
  const transcriptCueRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const transcriptRequestRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [minimised, setMinimised] = useState(false);
  useEffect(() => { if (minimised) miniPlayerButtonRef.current?.focus(); }, [minimised]);
  const [momentOpen, setMomentOpen] = useState(false);
  const [momentLabel, setMomentLabel] = useState('');
  const [momentSaving, setMomentSaving] = useState(false);
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
  const [artworkFailed, setArtworkFailed] = useState(false);
  const [showEq, setShowEq] = useState(false);
  const [showTextOptions, setShowTextOptions] = useState(false);
  const [transcriptHeight, setTranscriptHeight] = useState(() => {
    try { const value = Number(window.localStorage.getItem('nightjar.player.transcript-height.v1')); return Number.isFinite(value) && value >= 160 && value <= 520 ? value : 290; }
    catch { return 290; }
  });
  const dragRef = useRef<{ y: number; height: number } | null>(null);
  const transcriptHeightRef = useRef(transcriptHeight);
  const equalizer = useNightjarEqualizer(audioRef);
  const writerCredit = track?.contributors?.find((credit) => credit.role === 'Writer' && credit.name?.trim())?.name ?? '';
  const artwork = track?.artworkUrl && !artworkFailed ? track.artworkUrl : '/nightjar-home-512.png';
  const studioNotes = track && !track.studioNoteForReleaseId
    ? queue.filter(item => item.studioNoteForReleaseId === track.id && item.audioAvailable).slice(0, 12)
    : [];
  const studioNoteParent = track?.studioNoteForReleaseId
    ? queue.find(item => item.id === track.studioNoteForReleaseId) : null;

  useEffect(() => {
    // Full player acts as a modal; mini-player leaves the page scrollable.
    const previousOverflow = document.body.style.overflow;
    if (!minimised) document.body.style.overflow = 'hidden';
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!minimised) setMinimised(true);
        else onClose();
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', dismiss);
    };
  }, [onClose, minimised]);

  // Hardware Previous/Next should never route a subscriber to a release they
  // cannot play or to an audio card with no uploaded media.
  const playableQueue = queue.filter((item) => (item.audioAvailable || item.audioUrl)
    && item.playbackAllowed !== false
    && item.playbackAccessReason !== 'subscription_required');
  const currentIndex = track ? playableQueue.findIndex((item) => item.id === track.id) : -1;
  const previousTrack = currentIndex > 0 ? playableQueue[currentIndex - 1] : null;
  const nextTrack = currentIndex >= 0 && currentIndex < playableQueue.length - 1 ? playableQueue[currentIndex + 1] : null;

  useNightjarMediaSession({
    track: track ? { id: track.id, title: track.title, creator: track.creator, artworkUrl: track.artworkUrl } : null,
    previousTrack, nextTrack, enabled: !simulationMode && Boolean(track?.id),
    playing: isPlaying, position, duration,
    audio: () => audioRef.current,
    onSelectTrack: onSelectTrack as ((next: { id: string; title: string; creator: string }) => void) | undefined,
    onClose,
  });
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

  const loadTranscript = async (force = false) => {
    if (!track?.id || (!force && (transcriptBusy || transcriptText))) return;
    const requestId = ++transcriptRequestRef.current;
    const releaseId = track.id;
    if (simulationMode) {
      setTranscriptLanguage('en');
      setTranscriptText('[00:00] Nightjar transcript preview\n\n[00:08] This demonstration shows how timed text can follow playback while the listener reads.');
      return;
    }
    setTranscriptBusy(true);
    setTranscriptError('');
    try {
      const data = await nightjarCatalogue.transcript(releaseId);
      if (requestId !== transcriptRequestRef.current) return;
      setTranscriptText(data.transcript ?? '');
      setTranscriptLanguage(data.language || 'en');
    } catch (error) {
      if (requestId !== transcriptRequestRef.current) return;
      const message = error instanceof Error ? error.message : '';
      setTranscriptError(message.includes('subscription')
        ? 'A Nightjar subscription is required to read this transcript.'
        : 'This transcript could not be opened.');
    } finally {
      if (requestId === transcriptRequestRef.current) setTranscriptBusy(false);
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
    transcriptRequestRef.current += 1;
    setTranscriptText('');
    setTranscriptError('');
    setArtworkFailed(false);
    setTranscriptLanguage(track?.transcriptLanguage || 'en');
    const shouldOpen = Boolean(track?.transcriptAvailable || simulationMode)
      && (initialTranscriptOpen || accessibility.transcriptMode === 'always_open');
    setTranscriptOpen(shouldOpen);
    if (shouldOpen) void loadTranscript(true);
  }, [track?.id, track?.transcriptAvailable, accessibility.transcriptMode, initialTranscriptOpen, simulationMode]);

  useEffect(() => {
    if (!transcriptOpen || !accessibility.transcriptFollowPlayback || !activeTranscriptCueId) return;
    const cue = transcriptCueRefs.current[activeTranscriptCueId];
    const scrollbox = cue?.closest('.nj-up-transcript-body');
    if (cue && scrollbox) {
      const top = cue.offsetTop - scrollbox.clientHeight / 2 + cue.clientHeight / 2;
      scrollbox.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
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
    listeningSessionId.current = crypto.randomUUID();
    startedListeningSession.current = '';
    setPosition(0);
    setDuration(1);
    setIsPlaying(false);
    if (!initialTranscriptOpen) {
      void node.play().catch(() => notify('Press play to start this release.'));
    }
    return () => { node.pause(); };
  }, [track?.id, playbackUrl, simulationMode, initialTranscriptOpen]);

  useEffect(() => {
    if (simulationMode) return;
    const node = audioRef.current;
    if (!node || !rememberedPosition || initialSeekSeconds !== null) return;
    const apply = () => {
      if (node.duration && rememberedPosition < node.duration) {
        node.currentTime = rememberedPosition;
        setPosition(rememberedPosition);
      }
    };
    if (node.readyState >= 1) apply();
    else node.addEventListener('loadedmetadata', apply, { once: true });
    return () => node.removeEventListener('loadedmetadata', apply);
  }, [rememberedPosition, track?.id, simulationMode, initialSeekSeconds]);

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

  return <div className={minimised ? 'nj-up-root is-minimised' : 'nj-up-root'}>
    <div className="nj-up-scrim" aria-hidden="true" />
    {minimised && <section className="nj-mini-player" role="region" aria-label="Nightjar mini-player">
      <img src={artwork} alt="" onError={()=>setArtworkFailed(true)} />
      <div className="nj-mini-player-info"><strong>{track.title}</strong><small>{track.creator} · {formatTime(position)}</small></div>
      <button type="button" ref={miniPlayerButtonRef} className="nj-mini-play" onClick={()=>{
        if (simulationMode) {setIsPlaying(v=>!v);return;}
        const node=audioRef.current;if(!node)return;
        if(node.paused) void node.play().catch(()=>notify('Playback could not start.'));
        else node.pause();
      }} aria-label={isPlaying?'Pause audio':'Resume audio'}>{isPlaying?<Pause size={19} fill="currentColor"/>:<Play size={19} fill="currentColor"/>}</button>
      <button type="button" onClick={()=>setMinimised(false)} aria-label="Expand audio player"><Maximize2 size={19}/></button>
      <button type="button" onClick={onClose} aria-label="Stop and close audio"><X size={19}/></button>
      <div className="nj-mini-progress" role="progressbar" aria-label="Listening progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100 * position / Math.max(duration,1))}><span style={{width:Math.min(100,100*position/Math.max(duration,1))+'%'}}/></div>
    </section>}
    <section className="nj-up-sheet" role="region" aria-hidden={minimised} aria-label={'Nightjar player: ' + track.title}>
      <div className="nj-up-grip" aria-hidden="true"/>
      <div className="nj-up-header">
        <div className="nj-up-cover">
          {track.artworkUrl && !artworkFailed && track.artworkFraming?.assetId===track.artworkAssetId
            ? <FramedApprovedImage src={artwork} alt="Release cover artwork" defaultMode="fit"
                framing={track.artworkFraming}/>
            : <img src={artwork} alt={track.artworkUrl && !artworkFailed ? 'Release cover artwork' : 'Nightjar default cover artwork'}
                onError={()=>setArtworkFailed(true)}/>}
        </div>
        <div className="nj-up-identity">
          <span className="nj-up-kicker">{track.category || 'Audio'}</span>
          <h2>{track.title}</h2>
          <p>{track.creator}</p>
          {(track.nightjarOriginal || track.releaseDistribution === 'nightjar_first') && <div className="nj-up-release-badges" aria-label="Recording release distinctions">
            {track.nightjarOriginal && <span className="nj-up-release-badge">Nightjar Original</span>}
            {track.releaseDistribution === 'nightjar_first' && <span className="nj-up-release-badge">First on Nightjar</span>}
          </div>}
          {writerCredit && <small>Written by {writerCredit}</small>}
        </div>
        <div className="nj-up-header-actions">
          <button className="nj-up-close" type="button" onClick={()=>setMinimised(true)} aria-label="Minimise player and keep listening"><Minimize2 size={20}/></button>
          <button className="nj-up-close" type="button" onClick={onClose} aria-label="Stop and close audio player"><X size={20}/></button>
        </div>
      </div>
      {!simulationMode && <audio
        ref={audioRef}
        src={playbackUrl ?? undefined}
        preload="metadata"
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 1);
          if (initialSeekSeconds !== null && Number.isFinite(initialSeekSeconds) && initialSeekSeconds >= 0) {
            const target = Math.min(Math.max(0, initialSeekSeconds), Math.max(0, (event.currentTarget.duration || 1) - 0.1));
            event.currentTarget.currentTime = target;
            setPosition(target);
          }
        }}
        onPlay={(event) => {
          setIsPlaying(true);
          equalizer.resumeProcessing();
          if (startedListeningSession.current !== listeningSessionId.current) {
            startedListeningSession.current = listeningSessionId.current;
            const node = event.currentTarget;
            void nightjarListening.record({
              releaseId: track.id, eventType: 'start', sessionId: listeningSessionId.current,
              positionSeconds: node.currentTime, durationSeconds: node.duration || 0, intent,
            }).catch(() => {});
          }
        }}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => {
          const node = event.currentTarget;
          setPosition(node.currentTime);
          if (!node.paused && !node.seeking && node.currentTime - lastProgressEvent.current >= 15) {
            lastProgressEvent.current = node.currentTime;
            void nightjarListening.record({ releaseId: track.id, eventType: 'progress', sessionId: listeningSessionId.current, positionSeconds: node.currentTime, durationSeconds: node.duration || duration, intent }).catch(() => {});
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setPosition(duration);
          void nightjarListening.record({ releaseId: track.id, eventType: 'complete', sessionId: listeningSessionId.current, positionSeconds: duration, durationSeconds: duration, completed: true, intent }).catch(() => {});
          if (sleepTimer === 'end') { setSleepTimer('off'); return; }
          if (nextTrack && onSelectTrack) window.setTimeout(() => onSelectTrack(nextTrack), 350);
        }}
        onError={() => notify('Nightjar could not play this audio file.')}
      />}
      <div className="nj-up-progress">
        <input type="range" min="0" max={Math.max(duration, 1)} step="0.1" value={Math.min(position, duration)}
          onChange={(event) => seekTo(Number(event.target.value))}
          style={{ '--nj-up-fill': Math.min(100, 100 * position / Math.max(duration, 1)) + '%' } as React.CSSProperties}
          aria-label="Playback position" />
        <div className="nj-up-times"><span>{formatTime(position)}</span><span>{formatTime(duration)}</span></div>
      </div>
      <div className="nj-up-transport" aria-label="Playback controls">
        <button type="button" className="nj-up-skip" onClick={() => previousTrack ? choose(previousTrack) : seekTo(Math.max(0, position - 15))}
          aria-label={previousTrack ? 'Previous release' : 'Rewind 15 seconds'}><ChevronLeft size={25}/><small>{previousTrack ? 'PREV' : '15'}</small></button>
        <button type="button" className="nj-up-play" onClick={() => { if (simulationMode) { setIsPlaying((v) => !v); return; } const node = audioRef.current; if (!node) return; if (node.paused) void node.play().catch(() => notify('Playback could not start.')); else node.pause(); }}
          aria-label={isPlaying ? 'Pause playback' : 'Play audio'}>{isPlaying ? <Pause size={31} fill="currentColor"/> : <Play size={31} fill="currentColor"/>}</button>
        <button type="button" className="nj-up-skip" onClick={() => nextTrack ? choose(nextTrack) : seekTo(Math.min(duration, position + 15))}
          aria-label={nextTrack ? 'Next release' : 'Forward 15 seconds'}><ChevronRight size={25}/><small>{nextTrack ? 'NEXT' : '15'}</small></button>
      </div>
      <div className="nj-up-tools">
        <label className="nj-up-volume"><Volume2 size={18} aria-hidden="true"/><input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} aria-label="Volume"/></label>
        <button className={showEq ? 'nj-up-tool active' : 'nj-up-tool'} type="button" onClick={() => setShowEq((v) => !v)} aria-expanded={showEq} aria-controls="nj-up-eq"><AudioLines size={17}/> EQ</button>
        <button type="button" className="nj-up-tool" onClick={() => setMomentOpen((open) => !open)}
          aria-expanded={momentOpen} aria-controls="nightjar-moment-mark"><BookmarkPlus size={17}/> Moment Mark</button>
        <label className="nj-up-sleep"><Clock3 size={17}/><select value={sleepTimer} onChange={(event) => setSleepTimer(event.target.value as typeof sleepTimer)} aria-label="Sleep timer"><option value="off">Sleep off</option><option value="10">10 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="45">45 min</option><option value="60">60 min</option><option value="end">End of audio</option></select><ChevronDown size={14}/></label>
      </div>
      {momentOpen && <form id="nightjar-moment-mark" className="nj-moment-editor" onSubmit={(event) => {
        event.preventDefault();
        if (!track || momentSaving) return;
        if (simulationMode) { notify('Simulation: moment saved in preview only.'); setMomentOpen(false); return; }
        setMomentSaving(true);
        void nightjarExperience.saveMark(track.id, position, momentLabel.trim() || 'Saved moment').then(() => {
          notify('Moment saved privately. Find it under Library → Moment Marks.');
          setMomentLabel('');
          setMomentOpen(false);
        }).catch((error) => {
          notify(error instanceof Error ? error.message : 'Moment could not be saved.');
        }).finally(() => setMomentSaving(false));
      }}>
        <strong>Save this exact moment · {formatTime(position)}</strong>
        <label>Private label <input value={momentLabel} maxLength={80} onChange={(event) => setMomentLabel(event.target.value)}
          placeholder="A scene to revisit" /></label>
        <button className="primary-button" type="submit" disabled={momentSaving}>{momentSaving ? 'Saving…' : 'Save Moment Mark'}</button>
      </form>}
      {showEq && <div id="nj-up-eq" className="nj-up-eq">
        <div className="nj-up-eq-head"><div><strong>Audio equalizer <ContextHelp topic="audio-equalizer"/></strong><small>Choose a preset to turn EQ on automatically.</small></div>
          <button type="button" className={equalizer.enabled ? 'nj-up-eq-enable on' : 'nj-up-eq-enable'} onClick={() => void equalizer.toggle()} aria-pressed={equalizer.enabled} disabled={equalizer.busy || simulationMode} aria-busy={equalizer.busy}>{simulationMode ? 'Live only' : equalizer.busy ? 'Connecting…' : equalizer.enabled ? 'EQ ACTIVE · On' : 'EQ Off · Enable'}</button>
        </div>
        <div className="nj-up-presets" aria-label="Equalizer presets">
          {(['flat', 'voice', 'warm', 'bright'] as const).map((preset) => <button key={preset} type="button" className={equalizer.preset === preset ? 'active' : ''} onClick={() => equalizer.applyPreset(preset)} aria-pressed={equalizer.preset === preset}>{preset === 'voice' ? 'Voice' : preset === 'warm' ? 'Warmth' : preset === 'bright' ? 'Clarity' : 'Flat'}</button>)}
        </div>
        <div className="nj-up-eq-bands">{(['bass', 'mid', 'treble'] as const).map((band) => <label key={band}><span>{band === 'mid' ? 'Mids' : band === 'treble' ? 'Treble' : 'Bass'} <strong>{equalizer.levels[band] > 0 ? '+' : ''}{equalizer.levels[band]} dB</strong></span><input type="range" min="-12" max="12" step="1" value={equalizer.levels[band]} onChange={(event) => equalizer.updateBand(band, Number(event.target.value))} aria-label={band + ' EQ gain in decibels'}/></label>)}</div>
        {simulationMode && <p className="nj-up-eq-message" role="status">Audio EQ works on actual Nightjar recordings. Simulation mode has no audio stream to process.</p>}
        {equalizer.message && <p className="nj-up-eq-message" role="status">{equalizer.message}</p>}
      </div>}
      {(studioNotes.length > 0 || studioNoteParent) && <div className="nj-studio-notes-player" aria-label="Studio Notes and behind-the-scenes audio">
        <h3><Headphones size={16} aria-hidden="true"/> Studio Notes · Behind the Mic</h3>
        {studioNotes.length > 0 && <p>Hear the stories and creative moments behind this recording.</p>}
        {studioNotes.map(item => <button type="button" className="secondary-button" key={item.id}
          disabled={!onSelectTrack} onClick={() => onSelectTrack?.(item)}>
          <Play size={14} aria-hidden="true"/> {item.title}
        </button>)}
        {studioNoteParent && <button type="button" className="secondary-button" disabled={!onSelectTrack}
          onClick={() => onSelectTrack?.(studioNoteParent)}><ChevronLeft size={15}/> Back to {studioNoteParent.title}</button>}
      </div>}
      <div className="nj-up-section-toggle">
        <span><Headphones size={17}/> Now playing</span>
        <button type="button" className={transcriptOpen ? 'nj-up-transcript-toggle on' : 'nj-up-transcript-toggle'}
          onClick={toggleTranscript} aria-expanded={transcriptOpen} aria-controls="nightjar-transcript-panel"
          aria-pressed={transcriptOpen} disabled={!track.transcriptAvailable && !simulationMode}>
          <BookOpenText size={17}/> Transcript <span className="nj-up-switch" aria-hidden="true"/><strong>{transcriptOpen ? 'On' : 'Off'}</strong>
        </button>
      </div>
      {transcriptOpen && <section
        id="nightjar-transcript-panel"
        className={['nj-up-transcript', 'text-' + accessibility.transcriptTextSize, accessibility.transcriptHighContrast ? 'high-contrast' : ''].filter(Boolean).join(' ')}
        aria-label={'Transcript for ' + track.title} lang={transcriptLanguage}>
        <div className="nj-up-transcript-resizer"
          role="slider" tabIndex={0} aria-label="Transcript height" aria-valuemin={160} aria-valuemax={520} aria-valuenow={transcriptHeight}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              const next = Math.min(520, Math.max(160, transcriptHeight + (event.key === 'ArrowUp' ? 24 : -24)));
              transcriptHeightRef.current = next;
              setTranscriptHeight(next);
              try { window.localStorage.setItem('nightjar.player.transcript-height.v1', String(next)); } catch {}
            }
          }}
          onPointerDown={(event) => { dragRef.current = { y: event.clientY, height: transcriptHeight }; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => {
            if (!dragRef.current) return;
            const next = Math.min(520, Math.max(160, dragRef.current.height + dragRef.current.y - event.clientY));
            transcriptHeightRef.current = next;
            setTranscriptHeight(next);
          }}
          onPointerUp={(event) => {
            if (!dragRef.current) return;
            dragRef.current = null;
            try { window.localStorage.setItem('nightjar.player.transcript-height.v1', String(transcriptHeightRef.current)); } catch {}
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => { dragRef.current = null; }}
        ><span aria-hidden="true"/></div>
        <div className="nj-up-transcript-heading"><span><BookOpenText size={17}/> Read along {timedTranscript ? '· timed' : ''}</span>
          <button type="button" onClick={() => setShowTextOptions((v) => !v)} aria-expanded={showTextOptions} aria-controls="nj-up-text-options" aria-label="Transcript reading preferences"><Settings2 size={17}/></button>
        </div>
        {showTextOptions && <div className="nj-up-text-options" id="nj-up-text-options">
          <label>Text size <select value={accessibility.transcriptTextSize} onChange={(event) => void saveAccessibility({ ...accessibility, transcriptTextSize: event.target.value as AccessibilityPreferences['transcriptTextSize'] })}><option value="standard">Standard</option><option value="large">Large</option><option value="extra_large">Extra large</option></select></label>
          <label><input type="checkbox" checked={accessibility.transcriptFollowPlayback} onChange={(event) => void saveAccessibility({ ...accessibility, transcriptFollowPlayback: event.target.checked })}/> Follow playback</label>
          <label><input type="checkbox" checked={accessibility.transcriptHighContrast} onChange={(event) => void saveAccessibility({ ...accessibility, transcriptHighContrast: event.target.checked })}/> High contrast</label>
          <label><input type="checkbox" checked={accessibility.transcriptMode === 'always_open'} onChange={(event) => void saveAccessibility({ ...accessibility, transcriptMode: event.target.checked ? 'always_open' : 'on_demand' })}/> Open transcripts automatically</label>
        </div>}
        <div className="nj-up-transcript-body" style={{ height: Math.min(transcriptHeight, Math.max(160, window.innerHeight * .48)) }} tabIndex={0}>
          {transcriptBusy && <p role="status">Opening the transcript…</p>}
          {!transcriptBusy && transcriptError && <p role="alert">{transcriptError}</p>}
          {!transcriptBusy && !transcriptError && !transcriptCues.length && <p>There is no transcript text available for this recording yet.</p>}
          {!transcriptBusy && !transcriptError && transcriptCues.map((cue) => <div key={cue.id} ref={(node) => { transcriptCueRefs.current[cue.id] = node; }}
            className={cue.id === activeTranscriptCueId ? 'nj-up-cue active' : 'nj-up-cue'} aria-current={cue.id === activeTranscriptCueId ? 'true' : undefined}>
            {cue.timeSeconds != null && <button type="button" className="nj-up-cue-time" onClick={() => seekTo(cue.timeSeconds as number)} aria-label={'Jump playback to ' + formatTime(cue.timeSeconds)}>{formatTime(cue.timeSeconds)}</button>}
            <p>{cue.text}</p>
          </div>)}
        </div>
      </section>}
      {!track.transcriptAvailable && !simulationMode && <div className="nj-up-transcript-unavailable"><BookOpenText size={14}/> Transcript not published for this recording.</div>}
    </section>
  </div>;
}
