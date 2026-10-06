import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Rocket, ShieldCheck, XCircle } from 'lucide-react';
import { checkNightjarUpdate, type NightjarUpdateStatus } from '../platform/pwa';

type Props = {
  ageConfigured: boolean;
  ageEnvironment: string;
  temporaryAgeBypass: boolean;
  closedBeta: boolean;
  openSecurityAlerts: number;
  pendingImages: number;
  pendingApplications: number;
  pastDueSubscriptions: number;
};

type Gate = {
  label: string;
  detail: string;
  state: 'pass' | 'block' | 'warn' | 'manual';
};

export default function ReleaseReadinessDashboard({
  ageConfigured,
  ageEnvironment,
  temporaryAgeBypass,
  closedBeta,
  openSecurityAlerts,
  pendingImages,
  pendingApplications,
  pastDueSubscriptions,
}: Props) {
  const [updateStatus,setUpdateStatus]=useState<NightjarUpdateStatus|null>(null);
  const [checking,setChecking]=useState(false);

  const checkBuild=async()=>{
    setChecking(true);
    try { setUpdateStatus(await checkNightjarUpdate()); }
    finally { setChecking(false); }
  };

  useEffect(()=>{ void checkBuild(); },[]);

  const gates=useMemo<Gate[]>(()=>[
    {
      label:'Production age assurance',
      detail:ageConfigured ? 'A production age-assurance provider is configured.' : 'Production age assurance is not configured yet.',
      state:ageConfigured ? 'pass' : 'block',
    },
    {
      label:'Temporary age bypass',
      detail:temporaryAgeBypass ? 'This administrator session is still using temporary QA age access.' : 'This session is not using temporary QA age access.',
      state:temporaryAgeBypass ? 'block' : 'pass',
    },
    {
      label:'Registration mode',
      detail:closedBeta ? 'Closed Beta remains enabled. Keep this while testing; disable it deliberately for public registration.' : 'Public registration mode is enabled.',
      state:closedBeta ? 'block' : 'pass',
    },
    {
      label:'Security review queue',
      detail:openSecurityAlerts ? openSecurityAlerts+' open security alert'+(openSecurityAlerts===1?'':'s')+' still require human review.' : 'No open owner security alerts.',
      state:openSecurityAlerts ? 'warn' : 'pass',
    },
    {
      label:'Image moderation queue',
      detail:pendingImages ? pendingImages+' image'+(pendingImages===1?' is':'s are')+' awaiting moderation.' : 'No images awaiting moderation.',
      state:pendingImages ? 'warn' : 'pass',
    },
    {
      label:'Professional applications',
      detail:pendingApplications ? pendingApplications+' application'+(pendingApplications===1?' is':'s are')+' in the professional bank.' : 'No professional applications currently waiting.',
      state:pendingApplications ? 'warn' : 'pass',
    },
    {
      label:'Past-due subscriptions',
      detail:pastDueSubscriptions ? pastDueSubscriptions+' subscription'+(pastDueSubscriptions===1?' is':'s are')+' past due and excluded from confirmed cash planning.' : 'No past-due subscriptions reported.',
      state:pastDueSubscriptions ? 'warn' : 'pass',
    },
    {
      label:'Deployed app build',
      detail:updateStatus?.latestBuildId
        ? updateStatus.updateAvailable
          ? 'This browser is behind the latest deployed Nightjar build.'
          : 'This browser matches the latest deployed Nightjar build.'
        : 'The deployed build has not been confirmed from version.json yet.',
      state:updateStatus?.latestBuildId ? (updateStatus.updateAvailable ? 'warn' : 'pass') : 'manual',
    },
    {
      label:'Code, Functions & Firebase contracts',
      detail:'Runtime UI cannot certify local TypeScript, Functions builds, dependency audit or Firebase contract scripts. Run the release commands below before deployment.',
      state:'manual',
    },
  ],[ageConfigured,temporaryAgeBypass,closedBeta,openSecurityAlerts,pendingImages,pendingApplications,pastDueSubscriptions,updateStatus]);

  const blockers=gates.filter((gate)=>gate.state==='block').length;
  const warnings=gates.filter((gate)=>gate.state==='warn').length;
  const status=blockers ? 'BLOCKED' : warnings ? 'REVIEW' : 'RUNTIME CLEAR';

  return <section className="release-readiness-dashboard">
    <div className="release-readiness-hero">
      <div>
        <span className="mini-label">ADMIN / RELEASE GATE</span>
        <h2>Know what still stands between Nightjar and release.</h2>
        <p>Runtime readiness, operational queues and local build validation are kept deliberately separate. A green UI never substitutes for a successful build and contract run.</p>
      </div>
      <div className={'release-readiness-score '+(blockers?'blocked':warnings?'warning':'clear')}>
        <Rocket size={20}/>
        <strong>{status}</strong>
        <span>{blockers ? blockers+' launch blocker'+(blockers===1?'':'s') : warnings ? warnings+' operational warning'+(warnings===1?'':'s') : 'No runtime blockers detected'}</span>
      </div>
    </div>

    <div className="release-readiness-meta">
      <span>Age environment <strong>{ageEnvironment || 'unknown'}</strong></span>
      <span>Running build <strong>{__NIGHTJAR_BUILD_ID__}</strong></span>
      <span>Latest deployed <strong>{updateStatus?.latestBuildId ?? 'not checked'}</strong></span>
      <button className="ghost-button" disabled={checking} onClick={()=>void checkBuild()}><RefreshCw size={13}/>{checking?'Checking…':'Recheck deployed build'}</button>
    </div>

    <div className="release-readiness-grid">
      {gates.map((gate)=><article key={gate.label} className={'release-readiness-gate '+gate.state}>
        <span className="release-readiness-icon">
          {gate.state==='pass'?<CheckCircle2 size={16}/>:gate.state==='block'?<XCircle size={16}/>:gate.state==='warn'?<AlertTriangle size={16}/>:<ShieldCheck size={16}/>}
        </span>
        <div><strong>{gate.label}</strong><p>{gate.detail}</p></div>
        <em>{gate.state==='pass'?'PASS':gate.state==='block'?'BLOCKER':gate.state==='warn'?'REVIEW':'LOCAL CHECK'}</em>
      </article>)}
    </div>

    <article className="release-readiness-commands">
      <div><span className="mini-label">LOCAL RELEASE CERTIFICATION</span><h3>Run before a production deploy.</h3><p><code>npm run validate</code> → <code>npm run validate:launch</code> → Functions check/build/audit. The launch check is expected to fail while Closed Beta or the temporary age-assurance bypass remain enabled.</p></div>
      <div className="release-readiness-command-list">
        <code>npm run validate</code>
        <code>npm run validate:launch</code>
        <code>cd functions &amp;&amp; npm run check &amp;&amp; npm run build &amp;&amp; npm run audit:guard</code>
      </div>
    </article>
  </section>;
}
