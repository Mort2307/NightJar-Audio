import { useEffect, useState } from 'react';
import { CheckCircle2, ImagePlus, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { nightjarMedia } from '../platform/firebase-media';
import './writer-script-artwork.css';

type Props = {
  script: any;
  onUpdated: (script: any) => void;
  notify: (message: string) => void;
  simulationMode?: boolean;
};

const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxImageBytes = 5 * 1024 * 1024;

const readImageDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error('Could not read the selected image.'));
  reader.onload = () => typeof reader.result === 'string'
    ? resolve(reader.result)
    : reject(new Error('The image could not be prepared.'));
  reader.readAsDataURL(file);
});

export default function WriterScriptArtwork({ script, onUpdated, notify, simulationMode = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const approved = script.artworkStatus === 'approved' && !!script.artworkUrl;
  const pendingId = String(script.pendingArtworkAssetId ?? '');
  const pending = !!pendingId && script.pendingArtworkStatus === 'pending';

  useEffect(() => {
    if (!pending || simulationMode) return;
    let mounted = true;
    let checking = false;

    const checkStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const state = await nightjarMedia.status(pendingId);
        if (!mounted) return;
        if (state.status === 'approved') {
          onUpdated({
            ...script,
            artworkAssetId: pendingId,
            artworkUrl: state.publicUrl,
            artworkStatus: 'approved',
            pendingArtworkAssetId: null,
            pendingArtworkStatus: null,
          });
        } else if (state.status === 'rejected' || state.status === 'removed') {
          onUpdated({
            ...script,
            pendingArtworkAssetId: null,
            pendingArtworkStatus: state.status === 'rejected' ? 'rejected' : null,
          });
        }
      } catch {
        // The moderation state remains private; a later check can retry.
      } finally {
        checking = false;
      }
    };

    void checkStatus();
    const interval = window.setInterval(() => void checkStatus(), 25000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [pending, pendingId, script, onUpdated, simulationMode]);

  const upload = async (file: File) => {
    if (!allowedTypes.has(file.type)) {
      setLocalError('Please select a PNG, JPG or WebP image.');
      return;
    }
    if (!file.size || file.size > maxImageBytes) {
      setLocalError('Choose an image larger than 0 bytes and no more than 5 MB.');
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      if (simulationMode) {
        onUpdated({ ...script, pendingArtworkAssetId: 'demo-script-image-' + Date.now(), pendingArtworkStatus: 'pending' });
        notify('Simulation: manuscript artwork is awaiting image approval locally.');
        return;
      }
      const dataUrl = await readImageDataUrl(file);
      const result = await nightjarMedia.submitImage({
        kind: 'script_artwork',
        targetId: script.id,
        fileName: file.name,
        contentType: file.type,
        dataUrl,
      });
      onUpdated({ ...script, pendingArtworkAssetId: result.assetId, pendingArtworkStatus: 'pending' });
      notify(approved
        ? 'Replacement artwork sent for review. Your current approved image stays live.'
        : 'Manuscript artwork sent for administrator approval. Your script status is unchanged.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'The artwork could not be uploaded.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (assetId: string, isApproved: boolean) => {
    if (!window.confirm(isApproved
      ? 'Remove the approved artwork from this manuscript? The script itself will stay published.'
      : 'Cancel this pending artwork submission?')) return;
    setBusy(true);
    setLocalError('');
    try {
      if (!simulationMode) await nightjarMedia.removeOwnedImage(assetId);
      onUpdated(isApproved ? {
        ...script,
        artworkAssetId: null,
        artworkUrl: null,
        artworkStatus: null,
      } : {
        ...script,
        pendingArtworkAssetId: null,
        pendingArtworkStatus: null,
      });
      notify(isApproved ? 'Manuscript artwork removed; the script remains available.' : 'Pending artwork submission cancelled.');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Could not remove this artwork.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="research-panel writer-script-artwork" aria-label="Manuscript cover artwork">
    <div className="research-panel-head">
      <div>
        <span className="mini-label">SCRIPT ARTWORK · OPTIONAL</span>
        <h2>Give your story a face.</h2>
        <p>Add or replace artwork before or after editorial approval, even once published. All new images require administrator approval.</p>
      </div>
      <ImagePlus size={22} aria-hidden="true"/>
    </div>
    <div className="writer-script-artwork-layout">
      <div className="writer-script-artwork-preview">
        {approved
          ? <img src={script.artworkUrl} alt={'Approved artwork for ' + String(script.title ?? 'manuscript')} loading="lazy"/>
          : <div className="writer-script-artwork-placeholder"><ImagePlus size={30} aria-hidden="true"/><span>No approved artwork yet</span></div>}
      </div>
      <div className="writer-script-artwork-controls">
        {approved && <span className="writer-script-artwork-status approved"><CheckCircle2 size={15}/> Approved artwork · visible on script listings</span>}
        {pending && <span className="writer-script-artwork-status pending"><ShieldCheck size={15}/> {approved ? 'Replacement image under review' : 'Image awaiting admin approval'}</span>}
        {!pending && script.pendingArtworkStatus === 'rejected' && <span className="writer-script-artwork-status rejected">Previous image not approved. Choose another.</span>}
        <label className={'secondary-button writer-script-artwork-upload' + (busy ? ' disabled' : '')}>
          <UploadCloud size={16}/>
          {busy ? 'Processing artwork…' : pending ? 'Replace pending image' : approved ? 'Submit replacement image' : 'Add script image'}
          <input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) void upload(file);
            }}/>
        </label>
        <small>PNG, JPG or WebP · up to 5 MB. Pending artwork stays private; it never holds up the manuscript.</small>
        {pending && <button className="ghost-button" type="button" disabled={busy} onClick={() => void remove(pendingId, false)}><Trash2 size={14}/> Cancel pending image</button>}
        {approved && script.artworkAssetId && <button className="ghost-button" type="button" disabled={busy} onClick={() => void remove(String(script.artworkAssetId), true)}><Trash2 size={14}/> Remove approved artwork</button>}
        {localError && <p className="writer-script-artwork-error" role="alert">{localError}</p>}
      </div>
    </div>
  </section>;
}
