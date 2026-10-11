import { useState } from 'react';
import { CheckCircle2, FileAudio, LockKeyhole, UploadCloud } from 'lucide-react';
import { adminAudioUploadTest } from '../platform/firebase-audio-diagnostics';
import { nightjarAudioContentType, nightjarAudioFileProblem } from '../platform/audio-upload';

type UploadStage = 'READY' | 'STORAGE' | 'FINALIZE' | 'CLEANUP' | 'SUCCESS' | 'FAILED';

const sizeLabel = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2) + ' MB';

/**
 * Owner-only manual Firebase integration check. The picker is deliberately
 * unrestricted: if the phone had greyed out an audio file under audio/*,
 * this test allows the user to select it and examine its MIME and extension.
 */
export default function AdminAudioUploadTest() {
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<UploadStage>('READY');
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = file ? nightjarAudioFileProblem(file, 10) : null;
  const type = file ? nightjarAudioContentType(file) : null;

  const run = async () => {
    if (!file || busy || problem) return;
    setBusy(true);
    setProgress(0);
    setResult('');
    setStage('STORAGE');
    try {
      const response = await adminAudioUploadTest(file, setProgress, setStage);
      setStage('SUCCESS');
      setResult(`Verified ${sizeLabel(response.bytes)} of ${response.contentType} in the private Nightjar Firebase bucket. The server deleted the temporary test upload.`);
    } catch (error) {
      setStage('FAILED');
      setResult(error instanceof Error ? error.message : 'Audio upload test failed.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="panel nj-admin-audio-test" aria-label="Administrator audio upload diagnostics">
    <div className="nj-admin-audio-test-heading">
      <LockKeyhole size={22} aria-hidden="true"/>
      <div>
        <span className="mini-label">ADMIN TOOLS · PRIVATE AUDIO QUALITY ASSURANCE</span>
        <h2>Audio Upload Test</h2>
        <p>Try your own 5 MB audio file without creating a release, publishing it or asking a tester to help. The test checks your phone’s file picker, real Firebase Storage transfer, and server-side validation.</p>
      </div>
    </div>
    <div className="nj-admin-audio-test-warning">
      Use your own recording or a file you have permission to upload. Test files are private and deleted after verification. This checks the transfer and metadata pipeline, <strong>not a tester’s professional-role permissions</strong>.
    </div>
    <label className="nj-admin-audio-test-picker">
      <span><FileAudio size={17} aria-hidden="true"/> Select test audio · up to 10 MB</span>
      <input type="file" onChange={(event) => {
        const next = event.target.files?.[0] ?? null;
        setFile(next);
        setStage('READY');
        setProgress(0);
        setResult('');
      }}/>
    </label>
    {file && <div className="nj-admin-audio-test-file" aria-live="polite">
      <strong>{file.name}</strong>
      <span>Size: {sizeLabel(file.size)} · Device type: {file.type || '(not provided)'} · Nightjar type: {type || 'unrecognised'}</span>
      {problem && <p role="alert">{problem}</p>}
    </div>}
    <div className="nj-admin-audio-test-actions">
      <button className="primary-button" type="button" onClick={() => void run()} disabled={busy || !file || Boolean(problem)}>
        <UploadCloud size={17} aria-hidden="true"/>{busy ? 'Testing upload…' : 'Run private upload test'}
      </button>
      {stage === 'SUCCESS' && <span className="nj-admin-audio-test-success"><CheckCircle2 size={16}/> Test passed</span>}
    </div>
    {busy && <div className="nj-admin-audio-test-progress" role="status">
      <span>{stage === 'STORAGE' ? `Uploading to Firebase · ${progress}%` : stage === 'FINALIZE' ? 'Checking server metadata…' : 'Removing temporary audio…'}</span>
      <progress value={progress} max={100} aria-label="Firebase audio upload progress"/>
    </div>}
    {result && <div className={stage === 'FAILED' ? 'nj-admin-audio-test-result failed' : 'nj-admin-audio-test-result'} role="status">
      <strong>{stage === 'FAILED' ? 'Test failed · please share this diagnostic' : 'Firebase upload verification passed'}</strong>
      <p>{result}</p>
    </div>}
  </section>;
}
