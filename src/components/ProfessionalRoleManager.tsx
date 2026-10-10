import { useEffect, useState } from 'react';
import { Brush, FileText, Mic2, Scissors, ShieldCheck, X } from 'lucide-react';
import { nightjarAccount, type NightjarProfessionalRole, type ProfessionalRoleState } from '../platform/firebase-account';

type Props = {
  notify: (message: string) => void;
  onRoleChanged?: (activeRole: string) => void;
  compact?: boolean;
};

const labels: Record<NightjarProfessionalRole, string> = {
  creator: 'VA Creator',
  writer: 'Writer',
  editor: 'Audio Editor',
  artist: 'Artist',
};

export default function ProfessionalRoleManager({
  notify,
  onRoleChanged,
  compact = false,
}: Props) {
  const [state, setState] = useState<ProfessionalRoleState | null>(null);
  const [selected, setSelected] = useState<NightjarProfessionalRole[]>([]);
  const [statement, setStatement] = useState('');
  const [experience, setExperience] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [socialUrl, setSocialUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<NightjarProfessionalRole | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      setState(await nightjarAccount.professionalRoles());
    } catch {
      setLoadError('Your roles could not be loaded. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refreshWhenActive);
    return () => document.removeEventListener('visibilitychange', refreshWhenActive);
  }, []);

  const toggle = (role: NightjarProfessionalRole) =>
    setSelected((items) =>
      items.includes(role)
        ? items.filter((item) => item !== role)
        : [...items, role],
    );

  const apply = async () => {
    if (!selected.length) {
      notify('Choose at least one professional role.');
      return;
    }

    setBusy(true);
    try {
      const result = await nightjarAccount.applyForProfessionalRoles(selected, {
        statement,
        experience,
        portfolioUrl,
        socialUrl,
      });
      notify(result.message);
      setConfirmRemove(null);
      setSelected([]);
      setStatement('');
      setExperience('');
      setPortfolioUrl('');
      setSocialUrl('');
      await load();
    } catch {
      notify('Professional application could not be stored.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role: NightjarProfessionalRole) => {
    setBusy(true);
    try {
      await nightjarAccount.removeProfessionalRole(role);
      notify(labels[role] + ' removed from this account.');
      setConfirmRemove(null);
      await load();
    } catch {
      notify('That professional role could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async (role: 'listener' | NightjarProfessionalRole) => {
    setBusy(true);
    try {
      const result = await nightjarAccount.setActiveRole(role);
      onRoleChanged?.(result.activeRole);
      await load();
    } catch {
      notify('That workspace could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const roles: NightjarProfessionalRole[] = ['creator', 'writer', 'editor', 'artist'];
  const available = roles.filter(
    (role) =>
      !state?.approvedProfessionalRoles.includes(role)
      && !state?.pendingProfessionalRoles.includes(role),
  );

  const icon = (role: NightjarProfessionalRole) =>
    role === 'creator'
      ? <Mic2 size={17} />
      : role === 'writer'
        ? <FileText size={17} />
        : role === 'editor'
          ? <Scissors size={17} />
          : <Brush size={17} />;

  const applicationFields = selected.length > 0 ? (
    <>
      <label>
        About your work
        <textarea
          maxLength={2400}
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
        />
      </label>
      <label>
        Experience
        <textarea
          maxLength={1600}
          value={experience}
          onChange={(event) => setExperience(event.target.value)}
        />
      </label>
      <div className="profile-inline-fields">
        <label>
          Portfolio URL
          <input
            value={portfolioUrl}
            onChange={(event) => setPortfolioUrl(event.target.value)}
          />
        </label>
        <label>
          Public link
          <input
            value={socialUrl}
            onChange={(event) => setSocialUrl(event.target.value)}
          />
        </label>
      </div>
      <button
        className="primary-button"
        disabled={busy}
        onClick={() => void apply()}
      >
        {busy ? 'Saving…' : 'Store application'}
      </button>
    </>
  ) : null;

  const applicationPicker = (
    <>
      <span className="mini-label">ADD PROFESSIONAL ROLES</span>
      <h3>Apply for another role</h3>
      <div className="professional-role-picker">
        {available.map((role) => (
          <button
            type="button"
            key={role}
            aria-pressed={selected.includes(role)}
            className={selected.includes(role) ? 'selected' : ''}
            onClick={() => toggle(role)}
          >
            {icon(role)}
            <span><strong>{labels[role]}</strong></span>
          </button>
        ))}
      </div>
      {applicationFields}
    </>
  );

  if (!state) {
    return (
      <article className={compact ? 'panel professional-role-manager compact' : 'panel professional-role-manager'} aria-busy={loading}>
        <h2>My Roles</h2>
        <p role={loadError ? 'alert' : 'status'}>{loadError || 'Loading your approved and pending roles…'}</p>
        {loadError && <button type="button" className="secondary-button" onClick={() => void load()}>Retry loading roles</button>}
      </article>
    );
  }

  return (
    <article className={compact ? 'panel professional-role-manager compact' : 'panel professional-role-manager'}>
      <div className="professional-role-head">
        <div>
          <span className="mini-label">ONE ACCOUNT · MULTIPLE CREATIVE ROLES</span>
          <h2>My Roles</h2>
          <p>Listener access is always available. Professional roles are approved separately and can be combined on one account.</p>
        </div>
        <ShieldCheck size={20} />
      </div>

      <div className="professional-role-status-summary">
        <p className="panel-note" aria-live="polite">
          {state.approvedProfessionalRoles.length} approved professional role{state.approvedProfessionalRoles.length === 1 ? '' : 's'}
          {' / '}
          {state.pendingProfessionalRoles.length} awaiting review.
          Your Listener role is always available.
        </p>
        <button type="button" className="secondary-button" onClick={() => void load()} disabled={busy || loading}>
          {loading ? 'Checking…' : 'Check for updates'}
        </button>
      </div>
      {loadError && <p role="alert">{loadError}</p>}
      {state.applicationStatus === 'rejected' && <p className="panel-note">Your previous professional application was not approved. You can apply again for any available role.</p>}

      <div className="professional-role-list">
        <div className="professional-role-row">
          <div>
            <strong>Listener</strong>
            <small>Always available.</small>
          </div>
          <button
            className="secondary-button"
            disabled={busy || state?.activeRole === 'listener'}
            onClick={() => void activate('listener')}
          >
            {state?.activeRole === 'listener' ? 'Active' : 'Use role'}
          </button>
        </div>

        {state?.approvedProfessionalRoles.map((role) => (
          <div className="professional-role-row approved" key={role}>
            <span>{icon(role)}</span>
            <div>
              <strong>{labels[role]}</strong>
              <small>Approved professional role.</small>
            </div>
            <div className="professional-role-actions">
              <button
                className="secondary-button"
                disabled={busy || state.activeRole === role}
                onClick={() => void activate(role)}
              >
                {state.activeRole === role ? 'Active' : 'Use role'}
              </button>
              {confirmRemove === role ? (
                <div className="professional-role-confirm">
                  <small>Removing an approved role removes access to its workspace. Continue?</small>
                  <button type="button" className="ghost-button" disabled={busy} onClick={() => void remove(role)}>Confirm removal</button>
                  <button type="button" className="secondary-button" disabled={busy} onClick={() => setConfirmRemove(null)}>Cancel</button>
                </div>
              ) : (
                <button
                  type="button"
                  className="ghost-button"
                  disabled={busy}
                  onClick={() => setConfirmRemove(role)}
                >
                  <X size={14} /> Remove
                </button>
              )}
            </div>
          </div>
        ))}

        {state?.pendingProfessionalRoles.map((role) => (
          <div className="professional-role-row pending" key={role}>
            <span>{icon(role)}</span>
            <div>
              <strong>{labels[role]}</strong>
              <small>Pending Nightjar review. This workspace will be available only after approval.</small>
            </div>
            <button
              className="ghost-button"
              disabled={busy}
              onClick={() => void remove(role)}
            >
              <X size={14} /> Withdraw
            </button>
          </div>
        ))}
      </div>

      {available.length > 0 && (
        compact ? (
          <details className="professional-application-box compact-disclosure">
            <summary>Apply for another professional role</summary>
            <div className="compact-disclosure-body">
              {applicationPicker}
            </div>
          </details>
        ) : (
          <div className="professional-application-box">
            {applicationPicker}
            <p className="panel-note">Select one or several professions. Your request goes to Nightjar administrators for review; no professional access is granted automatically.</p>
          </div>
        )
      )}
    </article>
  );
}
