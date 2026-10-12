import { useEffect, useRef, useState } from 'react';
import { Brush, FileText, Mic2, Scissors, ShieldCheck, X } from 'lucide-react';
import { nightjarAccount, type NightjarProfessionalRole, type ProfessionalRoleState, type NightjarApplicationDraft } from '../platform/firebase-account';
import { nightjarLegal, type LegalAgreementStatus } from '../platform/firebase-legal';
import { readDemo, writeDemo } from '../demo/demoSession';

type Props = {
  notify: (message: string) => void;
  onRoleChanged?: (activeRole: string) => void;
  compact?: boolean;
  simulationMode?: boolean;
  initialRole?: 'listener' | NightjarProfessionalRole;
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
  simulationMode = false,
  initialRole = 'listener',
}: Props) {
  const [state, setState] = useState<ProfessionalRoleState | null>(null);
  const [selected, setSelected] = useState<NightjarProfessionalRole[]>([]);
  const applicationDetailsRef = useRef<HTMLDivElement | null>(null);
  const [statement, setStatement] = useState('');
  const [experience, setExperience] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [socialUrl, setSocialUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<NightjarProfessionalRole | null>(null);
  // Legal consent is specific to the member and current document versions.
  // An unavailable status service must not hide already-approved workspaces.
  const [legalDocuments, setLegalDocuments] = useState<LegalAgreementStatus[] | null>(null);
  const [legalError, setLegalError] = useState('');
  const [termsConfirmed, setTermsConfirmed] = useState(false);
  const [draftHydrated,setDraftHydrated]=useState(simulationMode);
  const [draftSync,setDraftSync]=useState<'saved'|'waiting'|'saving'|'error'>('saved');
  const cloudRevision=useRef(0);
  const draftTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const draftWrite=useRef<Promise<void>>(Promise.resolve());
  const autosaveReady=useRef(false);
  const draftChangeCounter=useRef(0);
  const draftTouched=useRef(false);
  const submitted=useRef(false);
  const stopAutosave=useRef(false);
  const demoInitialState: ProfessionalRoleState = {
    listener: true,
    approvedProfessionalRoles: initialRole === 'listener' ? [] : [initialRole],
    pendingProfessionalRoles: [],
    activeRole: initialRole,
    applicationStatus: null,
  };
  const demoInitialTerms: LegalAgreementStatus[] = [{
    id: 'professional_terms', version: '2026-10-09.1',
    title: 'Nightjar Professional & Content Terms', path: '/legal/professional',
    requiredForAccount: false, requiredForProfessional: true,
    accepted: false, acceptedVersion: null, acceptedAt: null,
  }];
  const persistDemoRoles = (next: ProfessionalRoleState) => {
    writeDemo('professionalRoleQa', next);
    setState(next);
  };
  const missingProfessionalTerms = (legalDocuments ?? []).filter(
    (document) => document.requiredForProfessional && !document.accepted,
  );

  const load = async () => {
    setLoading(true);
    setLoadError('');
    if (simulationMode) {
      const prior = readDemo('professionalRoleQa', demoInitialState);
      const requestedRole: NightjarProfessionalRole | null = initialRole === 'listener' ? null : initialRole;
      const approved: NightjarProfessionalRole[] = !requestedRole || prior.approvedProfessionalRoles.includes(requestedRole)
        ? prior.approvedProfessionalRoles
        : [...prior.approvedProfessionalRoles, requestedRole];
      const next = { ...prior, approvedProfessionalRoles: approved, activeRole: initialRole };
      persistDemoRoles(next);
      setLegalDocuments(readDemo('professionalRoleQaTerms', demoInitialTerms));
      setLegalError('');
      setLoading(false);
      return;
    }
    const [roles, legal] = await Promise.allSettled([
      nightjarAccount.professionalRoles(),
      nightjarLegal.status(),
    ]);
    if (roles.status === 'fulfilled') {
      setState(roles.value);
    } else {
      setLoadError('Your roles could not be loaded. Please retry.');
    }
    if (legal.status === 'fulfilled') {
      setLegalDocuments(legal.value.documents);
      setLegalError('');
    } else {
      setLegalDocuments(null);
      setLegalError('Professional terms could not be checked. Refresh before submitting an application.');
    }
    setLoading(false);
  };

  useEffect(()=>{
    if(simulationMode)return;
    let cancelled=false;
    void nightjarAccount.getApplicationDraft().then(({draft,revision})=>{
      if(cancelled)return;
      cloudRevision.current=revision;
      if(draft && !draftTouched.current){
        setSelected(draft.selectedRoles??[]);
        setStatement(draft.statement??'');
        setExperience(draft.experience??'');
        setPortfolioUrl(draft.portfolioUrl??'');
        setSocialUrl(draft.socialUrl??'');
      }
      setDraftHydrated(true);
    }).catch((error)=>{
      if(cancelled)return;
      setDraftHydrated(true);
      setDraftSync('error');
      notify(error instanceof Error?error.message:'Nightjar could not load the cloud application draft.');
    });
    return()=>{cancelled=true;};
  },[simulationMode]);

  useEffect(()=>{
    if(!draftHydrated||simulationMode||submitted.current||stopAutosave.current)return;
    if(!autosaveReady.current){autosaveReady.current=true;return;}
    const version=++draftChangeCounter.current;
    const snapshot:NightjarApplicationDraft={
      selectedRoles:selected,statement,experience,portfolioUrl,socialUrl,
    };
    setDraftSync('waiting');
    if(draftTimer.current)clearTimeout(draftTimer.current);
    draftTimer.current=setTimeout(()=>{
      draftTimer.current=null;
      setDraftSync('saving');
      const next=draftWrite.current.catch(()=>undefined).then(async()=>{
        if(submitted.current||stopAutosave.current)return;
        const result=await nightjarAccount.saveApplicationDraft(snapshot,cloudRevision.current);
        cloudRevision.current=result.revision;
        if(version===draftChangeCounter.current)setDraftSync('saved');
      }).catch((error)=>{
        if(version===draftChangeCounter.current)setDraftSync('error');
        console.warn('Nightjar application cloud draft could not sync',error);
      });
      draftWrite.current=next;
    },900);
    return()=>{if(draftTimer.current){clearTimeout(draftTimer.current);draftTimer.current=null;}};
  },[selected,statement,experience,portfolioUrl,socialUrl,draftHydrated,simulationMode]);

  useEffect(()=>()=>{
    stopAutosave.current=true;
    if(draftTimer.current)clearTimeout(draftTimer.current);
  },[]);

  useEffect(() => {
    void load();
    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', refreshWhenActive);
    return () => document.removeEventListener('visibilitychange', refreshWhenActive);
  }, []);

  const toggle = (role: NightjarProfessionalRole) => {
    draftTouched.current=true;
    submitted.current=false;
    setSelected((items) =>
      items.includes(role)
        ? items.filter((item) => item !== role)
        : [...items, role],
    );
  };

  const acceptProfessionalTerms = async () => {
    if (!legalDocuments) {
      notify('Professional agreements could not be checked. Use Check for updates and try again.');
      return false;
    }
    if (!missingProfessionalTerms.length) return true;
    if (!termsConfirmed) {
      notify('Read the current professional terms and tick the agreement box before requesting or opening professional workspaces.');
      return false;
    }
    if (simulationMode) {
      const updated = legalDocuments.map(document => document.requiredForProfessional
        ? { ...document, accepted: true, acceptedVersion: document.version, acceptedAt: new Date().toISOString() }
        : document);
      writeDemo('professionalRoleQaTerms', updated);
      setLegalDocuments(updated);
      setTermsConfirmed(false);
      return true;
    }
    await nightjarLegal.accept(
      missingProfessionalTerms.map(({ id, version }) => ({ id, version, accepted: true as const })),
      'professional-role-upgrade',
    );
    const updated = await nightjarLegal.status();
    setLegalDocuments(updated.documents);
    setTermsConfirmed(false);
    if (updated.documents.some((document) => document.requiredForProfessional && !document.accepted)) {
      notify('Some current professional agreements still require acceptance.');
      return false;
    }
    return true;
  };

  const apply = async () => {
    if (!selected.length) {
      notify('Choose at least one professional role.');
      return;
    }

    setBusy(true);
    try {
      if (!(await acceptProfessionalTerms())) return;
      if (simulationMode) {
        const pending = Array.from(new Set([...(state?.pendingProfessionalRoles ?? []), ...selected]));
        persistDemoRoles({
          ...(state ?? demoInitialState),
          pendingProfessionalRoles: pending,
          applicationStatus: 'pending_review',
        });
        notify('Simulation: professional application added to the local review queue.');
      } else {
        submitted.current=true;
        if(draftTimer.current){clearTimeout(draftTimer.current);draftTimer.current=null;}
        await draftWrite.current;
        if(draftSync==='error') throw new Error('Nightjar could not safely sync your application draft. Refresh the form to load its newest saved version before submitting.');
        const result = await nightjarAccount.applyForProfessionalRoles(selected, {
          statement,
          experience,
          portfolioUrl,
          socialUrl,
        });
        cloudRevision.current=0; // A submitted application clears its unsubmitted draft.
        setDraftSync('saved');
        notify(result.message);
      }
      setConfirmRemove(null);
      setSelected([]);
      setStatement('');
      setExperience('');
      setPortfolioUrl('');
      setSocialUrl('');
      if (!simulationMode) await load();
    } catch (error) {
      submitted.current=false;
      notify(error instanceof Error ? error.message : 'Professional application could not be stored.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (role: NightjarProfessionalRole) => {
    setBusy(true);
    try {
      if (simulationMode) {
        const next: ProfessionalRoleState = {
          ...(state ?? demoInitialState),
          approvedProfessionalRoles: (state?.approvedProfessionalRoles ?? []).filter(item => item !== role),
          pendingProfessionalRoles: (state?.pendingProfessionalRoles ?? []).filter(item => item !== role),
          activeRole: state?.activeRole === role ? 'listener' : state?.activeRole ?? 'listener',
        };
        persistDemoRoles(next);
        if (state?.activeRole === role) onRoleChanged?.('listener');
        notify('Simulation: ' + labels[role] + ' removed from the local account.');
      } else {
        await nightjarAccount.removeProfessionalRole(role);
        notify(labels[role] + ' removed from this account.');
        await load();
      }
      setConfirmRemove(null);
    } catch {
      notify('That professional role could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  const activate = async (role: 'listener' | NightjarProfessionalRole) => {
    setBusy(true);
    try {
      if (role !== 'listener' && !(await acceptProfessionalTerms())) return;
      if (simulationMode) {
        if (role !== 'listener' && !state?.approvedProfessionalRoles.includes(role)) {
          notify('Simulation: approve this professional role before opening its workspace.');
          return;
        }
        persistDemoRoles({ ...(state ?? demoInitialState), activeRole: role });
        onRoleChanged?.(role);
      } else {
        const result = await nightjarAccount.setActiveRole(role);
        onRoleChanged?.(result.activeRole);
        await load();
      }
    } catch {
      notify('That workspace could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const approveSimulatedApplication = (role: NightjarProfessionalRole) => {
    if (!simulationMode || !state?.pendingProfessionalRoles.includes(role)) return;
    persistDemoRoles({
      ...state,
      approvedProfessionalRoles: Array.from(new Set([...state.approvedProfessionalRoles, role])),
      pendingProfessionalRoles: state.pendingProfessionalRoles.filter(item => item !== role),
      applicationStatus: state.pendingProfessionalRoles.length === 1 ? 'approved' : 'pending_review',
    });
    notify('Simulation: ' + labels[role] + ' approved locally. Select Use role to open the workspace.');
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
    <div ref={applicationDetailsRef} className="professional-role-application-fields" aria-label="Professional application details">
      {!simulationMode && <p className="nj-account-draft-status" role="status">{draftSync==='saving' ? 'Saving your application draft to Nightjar…' : draftSync==='waiting' ? 'New changes · saving shortly' : draftSync==='error' ? 'Cloud sync interrupted or another device has a newer draft. Refresh before submitting.' : 'Draft saved to your account · continue on any device'}</p>}
      <label>
        About your work
        <textarea
          maxLength={2400}
          value={statement}
          onChange={(event) => {draftTouched.current=true;submitted.current=false;setStatement(event.target.value);}}
        />
      </label>
      <label>
        Experience
        <textarea
          maxLength={1600}
          value={experience}
          onChange={(event) => {draftTouched.current=true;submitted.current=false;setExperience(event.target.value);}}
        />
      </label>
      <div className="profile-inline-fields">
        <label>
          Portfolio URL
          <input
            value={portfolioUrl}
            onChange={(event) => {draftTouched.current=true;submitted.current=false;setPortfolioUrl(event.target.value);}}
          />
        </label>
        <label>
          Public link
          <input
            value={socialUrl}
            onChange={(event) => {draftTouched.current=true;submitted.current=false;setSocialUrl(event.target.value);}}
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
    </div>
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
      {selected.length > 0 && <button
        type="button"
        className="secondary-button professional-role-scroll-to-application"
        onClick={() => applicationDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      >
        Continue to application details for {selected.length} selected {selected.length === 1 ? 'role' : 'roles'}
      </button>}
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

      {simulationMode && <div className="nj-role-qa-inline" role="status">
        <strong>INTERACTIVE ACCOUNT TEST · LOCAL ONLY</strong>
        <span>Try consent, multiple applications, approval, role removal and workspace switching without changing a real Nightjar account. This does not test server authorization.</span>
      </div>}
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
      {legalError && <div className="professional-terms-upgrade" role="alert">
        <strong>Professional agreement status unavailable</strong>
        <p>{legalError} Your existing approved workspaces and Listener access are unchanged.</p>
        <a href="/legal">View Nightjar Legal Centre</a>
        <button type="button" className="secondary-button" disabled={loading || busy} onClick={() => void load()}>Retry legal status</button>
      </div>}
      {missingProfessionalTerms.length > 0 && <div className="professional-terms-upgrade">
        <strong>Accept professional terms to request or use new roles</strong>
        <p>Open and read the current documents. Your agreement is recorded against the specific versions below; approval is still controlled by Nightjar administrators.</p>
        {missingProfessionalTerms.map((document) => (
          <a key={document.id} href={document.path} target="_blank" rel="noreferrer">
            {document.title} · version {document.version}
          </a>
        ))}
        <label className="professional-terms-consent">
          <input type="checkbox" checked={termsConfirmed} disabled={busy} onChange={(event) => setTermsConfirmed(event.target.checked)}/>
          <span>I have read and agree to these professional terms and applicable account documents.</span>
        </label>
        <button type="button" className="secondary-button" disabled={!termsConfirmed || busy}
          onClick={() => void (async () => {
            setBusy(true);
            try {
              if (await acceptProfessionalTerms()) notify('Your current professional agreements have been recorded. Administrator approval is still required for new roles.');
            } catch (error) {
              notify(error instanceof Error ? error.message : 'Professional agreements could not be recorded.');
            } finally {
              setBusy(false);
            }
          })()}>
          {busy ? 'Saving agreement…' : 'Accept professional terms'}
        </button>
      </div>}
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
            <div className="professional-role-actions">
              {simulationMode && <button type="button" className="primary-button" disabled={busy} onClick={() => approveSimulatedApplication(role)}>Simulate approval</button>}
              <button className="ghost-button" disabled={busy} onClick={() => void remove(role)}><X size={14} /> Withdraw</button>
            </div>
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
