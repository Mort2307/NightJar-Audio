import { useEffect, useRef, useState } from 'react';
import { BookOpenText, CheckCircle2, Play, RotateCcw, SkipBack, Timer } from 'lucide-react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import './transcript-sync.css';

/**
 * Human-timed transcription: no speech recognition, generative AI,
 * remote inference, model downloads or third-party transcription APIs.
 * Source audio is streamed through a normal private Nightjar playback URL.
 */
type TimedLine = { id: number; text: string; seconds: number | null };

type Props = {
  releaseId: string;
  audioAvailable: boolean;
  transcriptText?: string;
  language?: string;
  isAdmin?: boolean;
  simulationMode?: boolean;
  onSaved: (release: any) => void | Promise<void>;
};

const parseTimestamp = (stamp: string): number | null => {
  const numbers = stamp.split(':').map(Number);
  if (numbers.some((value) => !Number.isFinite(value))) return null;
  if (numbers.length < 2 || numbers.length > 3 || numbers[numbers.length - 1] >= 60) return null;
  if (numbers.length === 3 && numbers[1] >= 60) return null;
  return numbers.reduce((seconds, part) => seconds * 60 + part, 0);
};

const stamp = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = String(whole % 60).padStart(2, '0');
  return hh ? [hh, String(mm).padStart(2, '0'), ss].join(':') : [String(mm).padStart(2, '0'), ss].join(':');
};

const prepareText = (input: string): TimedLine[] => {
  const lines: TimedLine[] = [];
  for (const paragraph of input.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    const found = trimmed.match(/^\[((?:\d{1,2}:)?\d{1,3}:\d{2})\]\s*(.*)$/);
    const text = (found ? found[2] : trimmed).trim();
    if (!text) continue;
    const knownTime = found ? parseTimestamp(found[1]) : null;
    // Divide long prose into manageable spoken sentences, without changing
    // the actual words. Sound-effect cues and speaker-labelled lines stay intact.
    const parts = found || /^\[[^\]]+\]/.test(text) || /^[\p{L}\p{N} -]{1,35}:\s/u.test(text)
      ? [text]
      : text.split(/(?<=[.!?]["'’”]?)\s+(?=[“"'‘\p{Lu}\[])/u);
    for (const part of parts) {
      if (part.trim()) lines.push({ id: lines.length, text: part.trim(), seconds: parts.length === 1 ? knownTime : null });
    }
  }
  return lines;
};

export default function TranscriptSyncTool({
  releaseId, audioAvailable, transcriptText = '', language = 'en',
  isAdmin = false, simulationMode = false, onSaved,
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeSeconds = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [original, setOriginal] = useState(transcriptText);
  const [lines, setLines] = useState<TimedLine[]>(() => prepareText(transcriptText));
  const [cursor, setCursor] = useState(0);
  const [reviewed, setReviewed] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) return;
    setOriginal(transcriptText);
    setLines(prepareText(transcriptText));
  }, [transcriptText, open]);

  const start = async () => {
    if (!audioAvailable || simulationMode || loading) return;
    setLoading(true); setError(''); setNotice('');
    try {
      const playback = await nightjarCatalogue.syncAudioUrl(releaseId);
      setSourceUrl(playback.url);
      setOpen(true);
      setNotice('Press Play, then mark each line when it begins. You control the timing.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the private audio recording.');
    } finally { setLoading(false); }
  };

  const refreshAudio = async () => {
    if (loading || !open) return;
    setLoading(true); setError('');
    const previousPosition = audioRef.current?.currentTime ?? 0;
    try {
      const playback = await nightjarCatalogue.syncAudioUrl(releaseId);
      resumeSeconds.current = Number.isFinite(previousPosition) ? previousPosition : 0;
      setSourceUrl(playback.url);
      setNotice('Protected audio link refreshed. Your transcript lines and timing marks have been preserved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not renew your authorised audio link.');
    } finally { setLoading(false); }
  };

  const markLine = (index: number) => {
    const current = audioRef.current;
    if (!current || !Number.isFinite(current.currentTime)) {
      setError('Open the audio in this panel before marking timestamps.');
      return;
    }
    setError('');
    const seconds = Math.max(0, current.currentTime);
    setLines((prior) => prior.map((line, i) => i === index ? { ...line, seconds } : line));
    setCursor((prior) => index === prior && index < lines.length - 1 ? index + 1 : prior);
    setReviewed(false);
  };

  const offsetTime = (delta: number) => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + delta);
  };

  const updateLine = (index: number, patch: Partial<TimedLine>) => {
    setLines((prior) => prior.map((line, i) => i === index ? { ...line, ...patch } : line));
    setReviewed(false);
  };

  const save = async () => {
    if (saving || !reviewed || simulationMode) return;
    const valid = lines.filter((line) => line.text.trim());
    if (!valid.length || valid.some((line) => line.seconds === null || !Number.isFinite(line.seconds))) {
      setError('Give every line a timestamp before saving, including any sound cues.');
      return;
    }
    let previous = -1;
    for (const line of valid) {
      const second = Math.floor(line.seconds!);
      if (second < previous) {
        setError('The lines are out of order. Correct their timestamps before saving.');
        return;
      }
      previous = second;
    }
    const transcript = valid.map((line) => '[' + stamp(line.seconds!) + '] ' + line.text.trim()).join('\n');
    if (transcript.length > 120000) {
      setError('The timed transcript exceeds NightJar\'s 120,000-character limit.');
      return;
    }
    setSaving(true); setError('');
    try {
      const response = await nightjarCatalogue.saveSyncedTranscript(releaseId, transcript, language, true);
      await onSaved(response.release);
      setNotice('Timed transcript saved. The NightJar player can now follow the audio after release.');
      setOpen(false); setSourceUrl(''); setReviewed(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the timed transcript.');
    } finally { setSaving(false); }
  };

  const ready = lines.length > 0 && lines.every((line) => Boolean(line.text.trim()) && line.seconds !== null);
  return <div className="nj-transcript-sync-tool">
    <div className="nj-transcript-sync-intro">
      <strong><Timer size={16} aria-hidden="true"/> Sync Transcript</strong>
      <p>Listen and tap to mark the start of each line. NightJar adds timestamps for read-along playback without speech recognition or external processing.</p>
      <p>{isAdmin ? 'Administrators can synchronise recordings after submission, even if the creator skipped it.' : 'Completely optional. You can submit normally and NightJar administrators can add the timing later.'}</p>
    </div>
    {!open && <button className="secondary-button" type="button" disabled={!audioAvailable || loading || simulationMode}
      onClick={() => void start()}>
      <BookOpenText size={15} aria-hidden="true"/>{loading ? 'Opening private recording…' : 'Open manual Sync Transcript'}
    </button>}
    {simulationMode && <small>Manual sync requires real audio; fictional demo uploads are not playable.</small>}
    {notice && <p role="status">{notice}</p>}
    {error && <p className="nj-audio-review-error" role="alert">{error}</p>}
    {open && <section className="nj-transcript-sync-review" aria-label="Manual transcript synchronisation">
      <strong><Play size={16} aria-hidden="true"/> Play recording and mark lines</strong>
      <small>This private listening link lasts 10 minutes. If playback or seeking stops during a long recording, refresh it here without losing your work.</small>
      <audio ref={audioRef} controls preload="metadata" src={sourceUrl} aria-label="Private recording for transcript synchronisation"
        onLoadedMetadata={event => {
          const position = resumeSeconds.current;
          if (position !== null) {
            const duration = event.currentTarget.duration;
            event.currentTarget.currentTime = Math.max(0, Number.isFinite(duration) ? Math.min(position, Math.max(0, duration - 0.25)) : position);
            resumeSeconds.current = null;
          }
        }}/>
      <div className="nj-transcript-sync-actions">
        <button type="button" className="secondary-button" onClick={() => offsetTime(-5)}><SkipBack size={15}/> Back 5 seconds</button>
        <button type="button" className="secondary-button" disabled={loading} onClick={() => void refreshAudio()}>
          <RotateCcw size={15}/> {loading ? 'Renewing secure link…' : 'Refresh secure audio link'}
        </button>
        <button type="button" className="secondary-button" onClick={() => markLine(cursor)} disabled={!lines.length}>Mark current line</button>
        <button type="button" className="ghost-button" onClick={() => setCursor((index) => Math.max(0, index - 1))} disabled={cursor === 0}>Previous line</button>
      </div>
      <label className="nj-sync-source-label">Script or transcript text
        <textarea rows={5} value={original} maxLength={120000} onChange={(event) => setOriginal(event.target.value)}
          aria-label="Script text to prepare for manual timestamps"/>
      </label>
      <button className="secondary-button" type="button" disabled={!original.trim()} onClick={() => {
        if (!window.confirm('Prepare lines from the text above? Unsaved timing marks in this panel will be reset.')) return;
        setLines(prepareText(original)); setCursor(0); setReviewed(false);
      }}><RotateCcw size={15}/> Prepare lines from text</button>
      <p>Select any line to mark or correct its start time. A sentence is highlighted while you work. Edit the text without having to change the original writer manuscript.</p>
      <div className="nj-sync-line-list">
        {lines.map((line, index) => <div className={cursor === index ? 'nj-sync-line active' : 'nj-sync-line'} key={line.id}>
          <div className="nj-sync-line-head">
            <button type="button" className="ghost-button" onClick={() => setCursor(index)}>Line {index + 1}{cursor === index ? ' · current' : ''}</button>
            <label>Starts at (seconds)
              <input aria-label={'Start time for line ' + (index + 1)} type="number" min={0} step={0.1}
                value={line.seconds ?? ''} placeholder="Unmarked"
                onChange={(event) => updateLine(index, { seconds: event.target.value === '' ? null : Math.max(0, Number(event.target.value)) })}/>
            </label>
            <button type="button" className="secondary-button" onClick={() => markLine(index)}>Mark now</button>
          </div>
          <textarea rows={2} value={line.text} aria-label={'Text for line ' + (index + 1)}
            onChange={(event) => updateLine(index, { text: event.target.value })}/>
        </div>)}
      </div>
      <p>{lines.filter((line) => line.seconds !== null).length} of {lines.length} lines timed.</p>
      <label className="release-transcript-confirm">
        <input type="checkbox" checked={reviewed} disabled={!ready} onChange={(event) => setReviewed(event.target.checked)}/>
        <span><strong>I have checked the transcript timing against the finished recording.</strong>
          <small>Your original transcript is unchanged until you save.</small></span>
      </label>
      <div className="nj-transcript-sync-actions">
        <button type="button" className="primary-button" disabled={saving || !ready || !reviewed} onClick={() => void save()}>
          <CheckCircle2 size={15} aria-hidden="true"/>{saving ? 'Saving…' : 'Save timed transcript'}
        </button>
        <button type="button" className="ghost-button" disabled={saving} onClick={() => {setOpen(false); setSourceUrl(''); setError('');}}>Close without saving</button>
      </div>
    </section>}
  </div>;
}
