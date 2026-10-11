import { useEffect, useState } from 'react';
import { BookOpen, CheckCircle2, LockKeyhole, RefreshCw, ShieldCheck, Users, XCircle } from 'lucide-react';
import { nightjarAdministration, type NightjarMarketplaceVisibility } from '../platform/firebase-administration';
import ScriptMarketplace from './ScriptMarketplace';

type Role = 'creator' | 'writer' | 'editor' | 'artist' | 'listener';
const roleNames: Record<Role, string> = {
  creator: 'VA Creator',
  writer: 'Writer',
  editor: 'Audio Editor',
  artist: 'Artist',
  listener: 'Listener',
};
const roles = Object.keys(roleNames) as Role[];

export default function AdminLiveMarketplacePreview({ notify }: { notify: (message: string) => void }) {
  const [role, setRole] = useState<Role>('creator');
  const [diagnostics, setDiagnostics] = useState<NightjarMarketplaceVisibility[]>([]);
  const [eligible, setEligible] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  const refresh = () => {
    setRevision((value) => value + 1);
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void nightjarAdministration.previewScriptMarketplace().then((data) => {
      if (cancelled) return;
      setDiagnostics(data.diagnostics ?? []);
      setEligible(data.eligible ?? 0);
    }).catch((cause) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : 'Live visibility could not be checked.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  return <section className="admin-live-preview" aria-label="Live role visibility preview">
    <header className="admin-live-preview-heading">
      <div className="admin-live-preview-heading-icon"><ShieldCheck size={23} aria-hidden="true"/></div>
      <div>
        <span className="mini-label">REAL RECORDS · READ ONLY · NO SIMULATION</span>
        <h2>See what is actually live.</h2>
        <p>Inspect the real public marketplace using the same listing endpoint as a signed-in Nightjar professional. This is a content-visibility preview, not an impersonation of an individual user.</p>
      </div>
      <button type="button" className="secondary-button" onClick={refresh} disabled={loading}><RefreshCw size={15}/>{loading ? 'Checking…' : 'Refresh live records'}</button>
    </header>

    <div className="admin-live-preview-roles" role="group" aria-label="Preview public discovery by account role">
      {roles.map((option) => <button key={option} type="button"
        className={role === option ? 'primary-button active' : 'secondary-button'}
        aria-pressed={role === option}
        onClick={() => setRole(option)}>{roleNames[option]}</button>)}
    </div>

    <div className="admin-live-preview-context">
      <Users size={18}/>
      <div><strong>{roleNames[role]} public-discovery perspective</strong>
      <p>{role === 'creator'
        ? 'This is the script marketplace available to approved VAs. Listed script titles, writers, genres, tropes and synopses are real Nightjar data.'
        : 'This is the same public marketplace listing data. Private role workspaces, assigned editorial scripts and personalised entitlements are not simulated.'}</p></div>
    </div>

    {loading ? <div className="people-empty"><RefreshCw size={18}/><strong>Checking actual Nightjar records…</strong></div>
      : error ? <div className="nj-role-save-error" role="alert"><strong>Could not inspect live records.</strong><p>{error}</p><button className="secondary-button" onClick={refresh}>Retry</button></div>
      : <div className="admin-live-preview-stats">
          <div><strong>{eligible}</strong><span>Scripts visible in the live marketplace</span></div>
          <div><strong>{diagnostics.length - eligible}</strong><span>Not yet visible</span></div>
          <div><strong>{diagnostics.length}</strong><span>Total manuscripts checked</span></div>
        </div>}

    <div className="admin-live-preview-marketplace">
      <ScriptMarketplace key={'admin-marketplace-' + revision} notify={notify} demoMode={false} simulationMode={false} readOnlyPreview />
    </div>

    <section className="admin-live-preview-diagnostics" aria-label="Why scripts are or are not visible">
      <div className="research-panel-head">
        <div><span className="mini-label">VISIBILITY EXPLANATIONS · ADMIN ONLY</span><h3>Why a tester script might not appear</h3><p>To be listed, the script must be Approved or Published, and the Writer must select Marketplace visibility. Manuscript text remains protected.</p></div>
        <LockKeyhole size={20}/>
      </div>
      {!loading && !error && diagnostics.length === 0 && <p>No manuscripts exist in the current Firebase project. Tester uploads won't appear here until saved to this backend.</p>}
      {!loading && !error && <div className="admin-live-preview-diagnostic-list">
        {diagnostics.map((item) => <article className="admin-live-preview-diagnostic" key={item.id}>
          <div className="nj-script-visibility-main">
            <span className="nj-script-visibility-icon">{item.visibleToProfessionals
              ? <CheckCircle2 size={18} aria-label="Visible in marketplace"/>
              : <XCircle size={18} aria-label="Not visible in marketplace"/>}</span>
            <div className="nj-script-visibility-info">
              <strong>{item.title}</strong>
              <span>Status: {item.status} · Listing: {item.visibility}</span>
              {!item.visibleToProfessionals && <p>{item.reasons.join(' · ')}</p>}
            </div>
          </div>
          <span className={item.visibleToProfessionals ? 'status-pill' : 'status-pill muted'}>{item.visibleToProfessionals ? 'Visible to VAs' : 'Not listed'}</span>
        </article>)}
      </div>}
    </section>
    <div className="admin-live-preview-safety"><BookOpen size={16}/><span>This preview cannot send enquiries, access private manuscript contents or act as another user. For exact user-specific editorial permissions, test with that authorised account.</span></div>
  </section>;
}
