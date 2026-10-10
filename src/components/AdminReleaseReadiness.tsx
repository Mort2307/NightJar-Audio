import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, RefreshCw, Rocket, ShieldCheck, WifiOff } from 'lucide-react';
import { checkNightjarUpdate, type NightjarUpdateStatus } from '../platform/pwa';

type GateId = 'age' | 'bypass' | 'beta' | 'security' | 'images' | 'applications' | 'build' | 'rules';

type Props = {
  testing?: {
    closedBeta?: boolean;
    ageAssuranceConfigured?: boolean;
    temporaryAgeBypassEnabled?: boolean;
    approvedTesterCount?: number;
  } | null;
  provider?: {
    configured: boolean;
    environment: 'live' | 'sandbox';
    providerVerified: boolean;
  } | null;
  openSecurityAlerts: number;
  pendingImages: number;
  pendingApplications: number;
  onOpenDidit: () => void;
  onOpenTesters: () => void;
  onOpenSecurityAlerts: () => void;
  onOpenImages: () => void;
  onOpenApplications: () => void;
  onOpenAppUpdates: () => void;
};

type Gate = {
  id: GateId;
  label: string;
  detail: string;
  state: 'pass' | 'attention' | 'blocker';
  next: string[];
  actionLabel?: string;
  action?: () => void;
};

export default function AdminReleaseReadiness({
  testing, provider, openSecurityAlerts, pendingImages, pendingApplications,
  onOpenDidit, onOpenTesters, onOpenSecurityAlerts, onOpenImages, onOpenApplications, onOpenAppUpdates,
}: Props) {
  const [update, setUpdate] = useState<NightjarUpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [selected, setSelected] = useState<GateId | null>(null);

  const refreshBuild = async () => {
    setChecking(true);
    try { setUpdate(await checkNightjarUpdate()); }
    finally { setChecking(false); }
  };

  useEffect(() => { void refreshBuild(); }, []);

  // Secret Manager write != deployed Function binding != a passed real age check.
  // The backend launch-attestation marker is deliberately separate from provider connectivity.
  const liveDiditConnected = provider?.configured === true && provider.environment === 'live';
  const ageReady = liveDiditConnected && testing?.ageAssuranceConfigured === true;
  const gates: Gate[] = [
    {
      id: 'age',
      label: 'Age-assurance provider',
      detail: ageReady
        ? 'Production provider readiness is attested. Review end-to-end evidence before launch.'
        : liveDiditConnected
          ? 'Live Didit is connected. Signed 18+ verification and release acceptance remain outstanding.'
          : 'Live Didit is not confirmed in the currently deployed backend. Saved credentials alone do not activate it.',
      state: ageReady ? 'pass' : 'blocker',
      next: [
        'Check that the selected published Didit workflow actually declines under-18 applicants.',
        'Validate the deployed startAgeAssurance, diditWebhook and processDiditWebhook Functions with live Secret Manager bindings.',
        'Enrol one tester, run a consented real 18+ check, and confirm the signed callback grants the correct Firebase account access.',
        'Sign out and check another device: valid approval must persist; a rejected, sandbox or revoked check must not grant access.',
        'Record evidence and complete legal/security sign-off before marking the public-launch gate clear.',
      ],
      actionLabel: 'Open Didit verification controls',
      action: onOpenDidit,
    },
    {
      id: 'bypass',
      label: 'Temporary age bypass',
      detail: testing?.temporaryAgeBypassEnabled === true
        ? 'Private-beta bypass remains enabled. Keep it while the invited tester pilot is running.'
        : testing?.temporaryAgeBypassEnabled === false
          ? 'Testing bypass is disabled in the current backend.'
          : 'The deployed backend has not reported its temporary bypass state.',
      state: testing?.temporaryAgeBypassEnabled === false ? 'pass' : 'blocker',
      next: [
        'Keep the existing allowlisted tester bypass during the Didit pilot—do not interrupt ongoing testing.',
        'After live signed Didit approval, under-18 rejection, revocation and cross-device persistence are proven, review every remaining temporary-access account.',
        'For an approved public release only, remove the backend TESTING_AGE_ASSURANCE_BYPASS flag, validate with non-verified accounts and deploy the reviewed Functions.',
        'Never offer an admin button that silently disables age-safety rules for all users.',
      ],
      actionLabel: 'Open Didit pilot and verification controls',
      action: onOpenDidit,
    },
    {
      id: 'beta',
      label: 'Closed Beta',
      detail: testing?.closedBeta === true
        ? 'Registration is restricted to approved testers. This does not prevent another private-beta deployment.'
        : testing?.closedBeta === false
          ? 'Closed-beta registration restriction is disabled.'
          : 'The deployed backend has not reported its registration mode.',
      state: testing?.closedBeta === false ? 'pass' : 'blocker',
      next: [
        'Continue inviting and managing testers through the existing allowlist while finalising age checks.',
        'Before opening public registration, complete legal, payment, abuse-reporting, safeguarding and end-to-end mobile checks.',
        'Only after explicit public-launch approval, change the backend CLOSED_BETA setting in a reviewed release and verify sign-up, age enforcement and account isolation.',
      ],
      actionLabel: 'Open approved tester management',
      action: onOpenTesters,
    },
    {
      id: 'security',
      label: 'Security review queue',
      detail: openSecurityAlerts ? `${openSecurityAlerts} open security alert${openSecurityAlerts === 1 ? '' : 's'} require human review.` : 'No open security alerts.',
      state: openSecurityAlerts ? 'attention' : 'pass',
      next: [
        openSecurityAlerts ? 'Inspect the flagged accounts and supporting evidence.' : 'The security-alert queue currently has no open items.',
        'Investigate genuinely suspicious activity without assuming every alert is a confirmed breach.',
        'Resolve or escalate cases only after reviewing the supporting record.',
      ],
      actionLabel: 'Open security alert review',
      action: onOpenSecurityAlerts,
    },
    {
      id: 'images',
      label: 'Image moderation queue',
      detail: pendingImages ? `${pendingImages} image${pendingImages === 1 ? '' : 's'} awaiting moderation.` : 'No pending image moderation.',
      state: pendingImages ? 'attention' : 'pass',
      next: [
        pendingImages ? 'Review each pending image at full size.' : 'There are no images waiting for approval.',
        'Approve only imagery that meets Nightjar’s rules; reject inappropriate or unsafe uploads.',
        'Check public and professional profiles after a moderation decision.',
      ],
      actionLabel: 'Open image moderation',
      action: onOpenImages,
    },
    {
      id: 'applications',
      label: 'Professional application bank',
      detail: pendingApplications ? `${pendingApplications} new application${pendingApplications === 1 ? '' : 's'} await a decision.` : 'No pending professional applications.',
      state: 'pass',
      next: [
        'Review only outstanding applications; previously approved users belong in Already Approved.',
        'Approve VA, Writer, Audio Editor and Artist roles independently without changing a suspended account’s status.',
        'Professional intake is an operational choice, not permission to bypass launch safety checks.',
      ],
      actionLabel: 'Open application bank',
      action: onOpenApplications,
    },
    {
      id: 'build',
      label: 'Deployed web build',
      detail: update?.latestBuildId
        ? update.updateAvailable
          ? 'This session is behind its current Hosting channel. Update before testing.'
          : 'This session matches the deployed build on its current Hosting channel.'
        : navigator.onLine ? 'Could not confirm the build deployed to this Hosting channel.' : 'Offline — cannot verify the deployed build.',
      state: update?.latestBuildId ? update.updateAvailable ? 'attention' : 'pass' : 'attention',
      next: [
        'Compare the running and deployed build IDs. A match proves only this browser is current for its Hosting channel—not that the latest GitHub code is in production.',
        'If there is an update, open the app update controls and apply it; retest refresh and installed PWA launch.',
        'For a live release, separately confirm the source commit, backend Function revisions, security rules and age restrictions.',
      ],
      actionLabel: 'Open app update controls',
      action: onOpenAppUpdates,
    },
    {
      id: 'rules',
      label: 'Client data boundary',
      detail: 'Source rules use deny-by-default access. Deployed rules and signed release-audio access still need runtime checks.',
      state: 'attention',
      next: [
        'Inspect the currently deployed Firestore and Storage rules, not only the local source files.',
        'Confirm ordinary clients cannot read other members’ private records, identity data, or audio masters.',
        'Prove that protected audio playback and transcripts require a valid server-authorised age and subscription state.',
        'Keep a passing test record for unauthorized and suspended accounts before any public launch.',
      ],
    },
  ];

  const blockers = gates.filter(gate => gate.state === 'blocker').length;
  const attention = gates.filter(gate => gate.state === 'attention').length;
  const active = gates.find(gate => gate.id === selected);

  return <section className="admin-release-readiness" aria-label="Nightjar release readiness checklist">
    <div className="admin-release-readiness-head">
      <div>
        <span className="mini-label">RELEASE GATE</span>
        <h2>Nightjar launch readiness</h2>
        <p>Select any card for the exact next steps and a direct action. Public-launch blockers do not prevent a controlled beta update. <code>npm run validate:launch</code> must stay blocked while test-only access flags remain enabled.</p>
      </div>
      <div className={blockers ? 'release-readiness-score blocker' : attention ? 'release-readiness-score attention' : 'release-readiness-score pass'}>
        <Rocket size={18} />
        <strong>{blockers ? `${blockers} public-launch blocker${blockers === 1 ? '' : 's'}` : attention ? `${attention} item${attention === 1 ? '' : 's'} to review` : 'Release gates clear'}</strong>
      </div>
    </div>

    <div className="release-readiness-grid">
      {gates.map(gate => <button
        type="button" key={gate.id}
        className={`release-readiness-gate ${gate.state}${selected === gate.id ? ' selected' : ''}`}
        aria-expanded={selected === gate.id}
        aria-controls="nightjar-release-next-steps"
        onClick={() => setSelected(current => current === gate.id ? null : gate.id)}
      >
        <span className="release-readiness-state-icon">
          {gate.state === 'pass' ? <CheckCircle2 size={17}/> : gate.state === 'blocker' ? <AlertTriangle size={17}/> : <ShieldCheck size={17}/>}
        </span>
        <span className="release-readiness-copy"><strong>{gate.label}</strong><small>{gate.detail}</small><span className="release-readiness-open">View next steps <ChevronDown size={14} aria-hidden="true"/></span></span>
        <em>{gate.state === 'pass' ? 'PASS' : gate.state === 'blocker' ? 'LAUNCH BLOCKER' : 'REVIEW'}</em>
      </button>)}
    </div>

    {active && <section id="nightjar-release-next-steps" className="release-readiness-next" aria-live="polite" aria-labelledby="nightjar-release-next-title">
      <div className="release-readiness-next-heading">
        <div><span className="mini-label">WHAT HAPPENS NEXT</span><h3 id="nightjar-release-next-title">{active.label}</h3><p>{active.detail}</p></div>
        <button className="ghost-button" type="button" onClick={() => setSelected(null)} aria-label="Close next steps">Close</button>
      </div>
      <ol>{active.next.map(step => <li key={step}>{step}</li>)}</ol>
      {active.action && <button className="primary-button" type="button" onClick={active.action}>{active.actionLabel}<ArrowRight size={15} aria-hidden="true"/></button>}
      {active.id === 'rules' && <div className="release-readiness-rules-links">
        <a href="https://console.firebase.google.com/project/nightjar-audio/firestore/rules" target="_blank" rel="noopener noreferrer">Inspect deployed Firestore rules <ArrowRight size={13}/></a>
        <a href="https://console.firebase.google.com/project/nightjar-audio/storage" target="_blank" rel="noopener noreferrer">Inspect Firebase Storage <ArrowRight size={13}/></a>
      </div>}
    </section>}

    <div className="release-readiness-footer">
      <div>{!navigator.onLine && <span className="status-pill muted"><WifiOff size={12}/> Offline</span>}
        <span className="status-pill muted">Running {__NIGHTJAR_BUILD_ID__}</span>
        {update?.latestBuildId && <span className="status-pill muted">Channel deployed {update.latestBuildId}</span>}
      </div>
      <button className="ghost-button" type="button" disabled={checking} onClick={() => void refreshBuild()}><RefreshCw size={14}/>{checking ? 'Checking build…' : 'Refresh build status'}</button>
    </div>
  </section>;
}
