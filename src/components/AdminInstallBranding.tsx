import { useEffect, useState } from 'react';
import { ImagePlus, RefreshCw, ShieldCheck } from 'lucide-react';
import { nightjarMedia } from '../platform/firebase-media';
import { syncApprovedNightjarIcons } from '../platform/branding-icons';

type Branding = Awaited<ReturnType<typeof nightjarMedia.getBranding>>;

export default function AdminInstallBranding({
  notify,
  simulationMode = false,
}: {
  notify: (message: string) => void;
  simulationMode?: boolean;
}) {
  const [data, setData] = useState<Branding | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    try {
      setData(await nightjarMedia.getBranding());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check Nightjar branding.');
    }
  };

  useEffect(() => {
    if (!simulationMode) void refresh();
  }, [simulationMode]);

  const generate = async () => {
    if (simulationMode || busy || data?.logoStatus !== 'approved') return;
    if (!window.confirm('Create Nightjar installation icons using the current approved Nightjar logo? This updates the icons served to new installs. Existing installed apps may need to be reinstalled to refresh their launcher icon.')) return;
    setBusy(true);
    setError('');
    try {
      const result = await syncApprovedNightjarIcons();
      await refresh();
      notify(result.pendingCleanup
        ? 'New Nightjar icons are live. Old private icon cleanup needs retrying in Admin branding.'
        : 'Nightjar approved installation icons generated (version ' + result.version + '). Test the live manifest before releasing.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not generate branded app icons.');
    } finally {
      setBusy(false);
    }
  };

  const retryCleanup = async () => {
    if (simulationMode || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await nightjarMedia.retryBrandLogoCleanup();
      await refresh();
      notify(result.pendingCleanup
        ? 'Some retired icon files remain; retry or investigate before release.'
        : 'Retired brand icon files cleaned up successfully.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not retry retired icon cleanup.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="research-panel nj-install-branding" aria-label="Nightjar installed app branding">
    <div className="research-panel-head">
      <div>
        <span className="mini-label">APP INSTALL · APPROVED NIGHTJAR BRAND</span>
        <h2>Use the Nightjar logo for installs</h2>
        <p>Generate 192px, 512px and maskable launcher icons from the image already approved in Image Moderation. No generic placeholder branding.</p>
      </div>
      <ImagePlus size={22}/>
    </div>
    {simulationMode && <p role="status">Demo mode is read-only. Return to live Administrator mode to generate real installation icons.</p>}
    {error && <p role="alert">{error}</p>}
    {data && <div className="nj-install-branding-status">
      <div><ShieldCheck size={17}/><strong>Approved logo:</strong> {data.logoStatus === 'approved' ? 'Yes' : 'Not yet'}</div>
      <div><strong>Generated launcher icons:</strong> {data.installIconsReady ? 'Ready' : 'Not generated'}</div>
      <div><strong>Icon version:</strong> {data.iconVersion ?? 'Not generated'}</div>
      {(data.iconCleanupPending || data.logoCleanupPending) && <div role="status"><strong>Private branding cleanup:</strong> Incomplete. Current approved branding remains available.</div>}
    </div>}
    <div className="nj-install-branding-actions">
      <button type="button" className="primary-button"
        disabled={simulationMode || busy || data?.logoStatus !== 'approved'}
        onClick={() => void generate()}>{busy ? 'Generating Nightjar icons…' : 'Generate approved install icons'}</button>
      {(data?.iconCleanupPending || data?.logoCleanupPending) && <button type="button" className="secondary-button" disabled={busy || simulationMode}
        onClick={() => void retryCleanup()}><RefreshCw size={15}/> Retry old branding cleanup</button>}
      <button type="button" className="secondary-button" disabled={busy || simulationMode}
        onClick={() => void refresh()}><RefreshCw size={15}/> Refresh branding status</button>
    </div>
    <p className="access-fine">Approval remains mandatory. The app manifest will fall back to its packaged icon files until generated versions exist. Test Chrome/Android and iOS install icons and existing installed PWAs before a public release.</p>
    <a href="/app-manifest.webmanifest" target="_blank" rel="noreferrer">Inspect Nightjar install manifest</a>
  </section>;
}
