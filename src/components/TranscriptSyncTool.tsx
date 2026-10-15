import { useState } from 'react';
import { BookOpenText, CheckCircle2, RefreshCw, Sparkles } from 'lucide-react';
import { nightjarCatalogue } from '../platform/firebase-catalogue';
import './transcript-sync.css';

/**
 * Zero paid-AI-API design: recognition runs on the operator's own device.
 * No private recording is sent to an AI transcription service. The JS runtime
 * and open model files are downloaded over HTTPS on first use.
 *
 * AI-generated spoken text is deliberately REVIEW REQUIRED: it may omit
 * effects, invent phrases, mishear names or disagree with a writer's script.
 */
type SyncWord = { text: string; timestamp: [number, number | null] };
type SpeechResult = { text?: string; chunks?: SyncWord[] };
type InferenceFn = (audio: string, options: Record<string, unknown>) => Promise<SpeechResult>;
type Progress = { status?: string; progress?: number; file?: string };

type Props = {
  releaseId: string;
  audioAvailable: boolean;
  transcriptText?: string;
  language?: string;
  sourceUrl?: string | null;
  sourceFile?: File | null;
  isAdmin?: boolean;
  simulationMode?: boolean;
  onSaved: (release: any) => void | Promise<void>;
};

let transcriberPromise: Promise<InferenceFn> | null = null;

async function loadLocalTranscriber(onProgress: (message: string) => void): Promise<InferenceFn> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      // Installed and lockfile-pinned: bundled as a lazy app chunk, never execute
      // arbitrary CDN JavaScript with access to a listener's private audio.
      // Model weights/WASM download separately on first use; inference is local.
      const module = await import('@huggingface/transformers');
      const hasGpu = Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
      const options = {
        progress_callback: (event: Progress) => {
          if (event.status === 'progress' && Number.isFinite(event.progress)) {
            onProgress('Downloading local speech model · ' + Math.round(Number(event.progress)) + '%');
          } else if (event.status === 'ready') {
            onProgress('Speech model ready. Analysing the recording on this device…');
          }
        },
      };
      if (hasGpu) {
        try {
          return await module.pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
            ...options, device: 'webgpu',
          }) as InferenceFn;
        } catch {
          onProgress('Graphics acceleration unavailable. Trying on-device CPU processing…');
        }
      }
      return await module.pipeline('automatic-speech-recognition', 'onnx-community/whisper-tiny.en', {
        ...options, device: 'wasm',
      }) as InferenceFn;
    })().catch((error) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

function timedLines(words: SyncWord[]): string {
  const output: string[] = [];
  let text = '';
  let start = 0;
  let lastEnd = 0;
  let count = 0;
  const flush = () => {
    if (!text.trim()) return;
    const seconds = Math.max(0, Math.floor(start));
    const hh = Math.floor(seconds / 3600);
    const mm = Math.floor((seconds % 3600) / 60);
    const ss = String(seconds % 60).padStart(2, '0');
    const stamp = hh ? [hh, String(mm).padStart(2, '0'), ss].join(':') : [String(mm).padStart(2, '0'), ss].join(':');
    output.push('[' + stamp + '] ' + text.trim());
    text = '';
    count = 0;
  };
  for (const word of words) {
    const spoken = String(word?.text ?? '').trim();
    const at = Number(word?.timestamp?.[0]);
    if (!spoken || !Number.isFinite(at) || at < 0) continue;
    if (text && (at - lastEnd > 1.15 || count >= 11)) flush();
    if (!text) start = at;
    text += (text ? ' ' : '') + spoken;
    count += 1;
    const end = Number(word?.timestamp?.[1]);
    lastEnd = Number.isFinite(end) && end >= at ? end : at;
    if (/[.!?]["'’]?$/u.test(spoken) && count >= 4) flush();
  }
  flush();
  return output.join('\n');
}

function normaliseWords(text: string) {
  return text.toLowerCase().replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/gm, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}
function approximateAgreement(original: string, recognised: string): number | null {
  const source = normaliseWords(original);
  if (!source.length) return null;
  const spoken = normaliseWords(recognised);
  const counts = new Map<string, number>();
  spoken.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));
  let matched = 0;
  source.forEach((word) => {
    const left = counts.get(word) ?? 0;
    if (left) { matched++; counts.set(word, left - 1); }
  });
  return Math.round(matched / source.length * 100);
}

export default function TranscriptSyncTool({
  releaseId, audioAvailable, transcriptText = '', language = 'en', sourceUrl,
  sourceFile, isAdmin = false, simulationMode = false, onSaved,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [agreement, setAgreement] = useState<number | null>(null);

  const start = async () => {
    if (!audioAvailable || busy || saving || simulationMode) return;
    setBusy(true); setError(''); setMessage('Preparing on-device speech recognition…');
    setReviewed(false);
    try {
      if (language && !/^en(?:-|$)/i.test(language)) {
        throw new Error('The free local model currently supports English recordings. Do not run an English-only model on another language.');
      }
      const recogniser = await loadLocalTranscriber(setMessage);
      let input = '';
      let temporaryUrl: string | null = null;
      try {
        if (sourceFile) {
          temporaryUrl = URL.createObjectURL(sourceFile);
          input = temporaryUrl;
        } else if (sourceUrl) {
          input = sourceUrl;
        } else {
          setMessage('Requesting a private, short-lived audio link…');
          input = (await nightjarCatalogue.syncAudioUrl(releaseId)).url;
        }
        setMessage('Listening locally and generating timestamps. This can be slow on phones…');
        const output = await recogniser(input, {
          return_timestamps: 'word',
          chunk_length_s: 30,
          stride_length_s: 5,
          task: 'transcribe',
        });
        const lines = timedLines(output.chunks ?? []);
        if (!lines) throw new Error('No reliably timed speech was found. The original transcript has not been changed.');
        if (lines.length > 120000) throw new Error('The generated transcript is too long. Please divide the recording into smaller parts.');
        setAgreement(approximateAgreement(transcriptText, output.text || lines));
        setDraft(lines);
        setMessage('Timed transcript generated. Review the spoken words and timings before saving.');
      } finally {
        if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
      }
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'This browser could not run the speech model.';
      setError(detail + ' Your original transcript is unchanged. Try a desktop browser or use manual timestamps.');
    } finally { setBusy(false); }
  };

  const save = async () => {
    if (!draft?.trim() || !reviewed || busy || saving || simulationMode) return;
    setSaving(true); setError('');
    try {
      const response = await nightjarCatalogue.saveSyncedTranscript(releaseId, draft, language || 'en', true);
      await onSaved(response.release);
      setMessage('Timed transcript saved. Nightjar listeners can use read-along once this release is published.');
      setDraft(null);
      setAgreement(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Nightjar could not save the timed transcript.');
    } finally { setSaving(false); }
  };

  return <div className="nj-transcript-sync-tool">
    <div className="nj-transcript-sync-intro">
      <strong><Sparkles size={16} aria-hidden="true"/> Sync Transcript</strong>
      <p>Nightjar can recognise speech and create timed read-along lines on your device, without a paid AI transcription API. First use downloads a sizeable free model. Desktop recommended for long recordings.</p>
      <p>{isAdmin ? 'Admin sync also works on already-submitted recordings. The recording remains private during processing.' : 'You can skip syncing and submit normally. Admins can add the timing later.'}</p>
    </div>
    <button type="button" className="secondary-button"
      disabled={!audioAvailable || busy || saving || simulationMode}
      onClick={() => void start()}>
      <RefreshCw size={15} aria-hidden="true"/>{busy ? 'Synchronising on this device…' : draft ? 'Regenerate timing' : 'Sync Transcript'}
    </button>
    {simulationMode && <small>Available with a real uploaded recording, not fictional demo audio.</small>}
    {message && <p role="status" aria-live="polite">{message}</p>}
    {error && <p role="alert" className="nj-audio-review-error">{error}</p>}
    {draft !== null && <div className="nj-transcript-sync-review">
      <strong><BookOpenText size={15} aria-hidden="true"/> Review synchronised text</strong>
      {agreement !== null && <p>Approximate word agreement with the supplied transcript: <strong>{agreement}%</strong>. This is a rough comparison, not an accuracy guarantee. Check any missing or changed dialogue.</p>}
      <p>The words below come from speech recognition, not a forced alignment of the original script. Sound effects, names and pauses may need corrections. Edits here are not saved until you confirm.</p>
      <label>Timed transcript preview
        <textarea rows={10} maxLength={120000} value={draft} onChange={(event) => { setDraft(event.target.value); setReviewed(false); }}/>
      </label>
      <label className="release-transcript-confirm">
        <input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/>
        <span><strong>I have checked this timed text against the finished audio.</strong>
          <small>Correct any speech-recognition mistakes before publishing.</small></span>
      </label>
      <div className="nj-transcript-sync-actions">
        <button type="button" className="primary-button" disabled={!reviewed || saving || !draft.trim()} onClick={() => void save()}>
          <CheckCircle2 size={15} aria-hidden="true"/>{saving ? 'Saving timing…' : 'Save timed transcript'}
        </button>
        <button type="button" className="ghost-button" disabled={saving} onClick={() => { setDraft(null); setReviewed(false); }}>Discard generated text</button>
      </div>
    </div>}
  </div>;
}
