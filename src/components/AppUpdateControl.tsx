import { useState } from 'react';
import { CheckCircle2, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { applyNightjarUpdate, checkNightjarUpdate, type NightjarUpdateStatus } from '../platform/pwa';

export default function AppUpdateControl({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<NightjarUpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');

  const check = async () => {
    setChecking(true);
    setMessage('');
    try {
      const next = await checkNightjarUpdate();
      setStatus(next);
      if (!next.latestBuildId) setMessage('Nightjar could not confirm the latest deployed build. Check your connection and try again.');
      else if (next.updateAvailable) setMessage('A newer Nightjar build is available.');
      else setMessage('Nightjar is already up to date.');
    } finally {
      setChecking(false);
    }
  };

  if (compact) {
    return <div className="app-update-control compact">
      <button className="ghost-button" disabled={checking} onClick={()=>void check()}>
        <RefreshCw size={14}/>{checking ? 'Checking…' : 'Check for update'}
      </button>
      {status?.updateAvailable && <button className="primary-button" onClick={()=>void applyNightjarUpdate()}><Download size={14}/> Update now</button>}
      {message && <small>{message}</small>}
    </div>;
  }

  return <article className="panel premium-user-card app-update-card">
    <div className="premium-user-card-head">
      <div><span className="mini-label">APP & DEVICE</span><h2>Keep Nightjar current.</h2></div>
      <RefreshCw size={18}/>
    </div>
    <p className="panel-note">Use this if your installed app looks behind the website or you suspect an old cached build. Nightjar compares the build you are running with the latest deployed build before offering an update.</p>
    <div className="app-update-version-grid">
      <div><span>Running build</span><strong>{status?.currentBuiltAt ? new Date(status.currentBuiltAt).toLocaleString('en-GB') : new Date(__NIGHTJAR_BUILT_AT__).toLocaleString('en-GB')}</strong><small>Build ID {status?.currentBuildId ?? __NIGHTJAR_BUILD_ID__}</small></div>
      <div><span>Latest deployed</span><strong>{status?.latestBuiltAt ? new Date(status.latestBuiltAt).toLocaleString('en-GB') : 'Check to compare'}</strong><small>{status?.latestBuildId ? 'Build ID ' + status.latestBuildId : 'No comparison made yet'}</small></div>
    </div>
    {message && <div className={status?.updateAvailable ? 'app-update-result available' : 'app-update-result'}>{status?.updateAvailable ? <Download size={16}/> : <CheckCircle2 size={16}/>}<span>{message}</span></div>}
    <div className="app-update-actions">
      <button className="secondary-button" disabled={checking} onClick={()=>void check()}><RefreshCw size={14}/>{checking ? 'Checking Nightjar…' : 'Check for update'}</button>
      {status?.updateAvailable && <button className="primary-button" onClick={()=>void applyNightjarUpdate()}><Download size={14}/> Update Nightjar now</button>}
    </div>
    <div className="app-update-safety"><ShieldCheck size={14}/><span>Updating only clears Nightjar app caches and reloads the deployed application. It does not remove your account, profile or cloud data.</span></div>
  </article>;
}
