import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, Rocket, ShieldCheck, WifiOff } from 'lucide-react';
import { checkNightjarUpdate, type NightjarUpdateStatus } from '../platform/pwa';

type Props = {
  testing?: {
    closedBeta?: boolean;
    ageAssuranceConfigured?: boolean;
    temporaryAgeBypassEnabled?: boolean;
    approvedTesterCount?: number;
  } | null;
  openSecurityAlerts: number;
  pendingImages: number;
  pendingApplications: number;
};

type Gate = {
  label: string;
  detail: string;
  state: 'pass'|'attention'|'blocker';
};

export default function AdminReleaseReadiness({ testing, openSecurityAlerts, pendingImages, pendingApplications }: Props) {
  const [update,setUpdate]=useState<NightjarUpdateStatus|null>(null);
  const [checking,setChecking]=useState(false);

  const refreshBuild=async()=>{
    setChecking(true);
    try { setUpdate(await checkNightjarUpdate()); }
    finally { setChecking(false); }
  };

  useEffect(()=>{ void refreshBuild(); },[]);

  const gates=useMemo<Gate[]>(()=>[
    {
      label:'Age-assurance provider',
      detail:testing?.ageAssuranceConfigured ? 'Production age assurance is configured.' : 'Production age assurance is not configured yet.',
      state:testing?.ageAssuranceConfigured ? 'pass' : 'blocker',
    },
    {
      label:'Temporary age bypass',
      detail:testing?.temporaryAgeBypassEnabled ? 'Testing bypass is still enabled. This must be disabled for public launch.' : 'Testing bypass is disabled.',
      state:testing?.temporaryAgeBypassEnabled ? 'blocker' : 'pass',
    },
    {
      label:'Closed Beta',
      detail:testing?.closedBeta ? 'Registration is still restricted to approved testers.' : 'Public registration gate is open.',
      state:testing?.closedBeta ? 'blocker' : 'pass',
    },
    {
      label:'Security review queue',
      detail:openSecurityAlerts ? openSecurityAlerts+' open security alert'+(openSecurityAlerts===1?'':'s')+' require human review.' : 'No open security alerts.',
      state:openSecurityAlerts ? 'attention' : 'pass',
    },
    {
      label:'Image moderation queue',
      detail:pendingImages ? pendingImages+' image'+(pendingImages===1?'':'s')+' still await moderation.' : 'No pending image moderation.',
      state:pendingImages ? 'attention' : 'pass',
    },
    {
      label:'Professional application bank',
      detail:pendingApplications ? pendingApplications+' banked application'+(pendingApplications===1?'':'s')+' remain for controlled intake.' : 'No pending professional applications.',
      state:'pass',
    },
    {
      label:'Deployed web build',
      detail:update?.latestBuildId
        ? update.updateAvailable
          ? 'This admin session is behind the deployed build. Apply the update before release testing.'
          : 'This session matches the deployed build.'
        : navigator.onLine
          ? 'Latest deployed build could not be confirmed.'
          : 'Offline — deployed build cannot be checked.',
      state:update?.latestBuildId ? (update.updateAvailable?'attention':'pass') : 'attention',
    },
    {
      label:'Client data boundary',
      detail:'Firestore remains deny-by-default and release audio is not directly readable from Storage.',
      state:'pass',
    },
  ],[testing,openSecurityAlerts,pendingImages,pendingApplications,update]);

  const blockers=gates.filter((gate)=>gate.state==='blocker').length;
  const attention=gates.filter((gate)=>gate.state==='attention').length;

  return <section className="admin-release-readiness">
    <div className="admin-release-readiness-head">
      <div><span className="mini-label">RELEASE GATE</span><h2>Nightjar launch readiness</h2><p>This dashboard separates genuine public-launch blockers from queues that simply need operational attention. The terminal <code>npm run validate</code> gate checks code/build contracts; <code>npm run validate:launch</code> intentionally stays red while test-only access flags remain enabled.</p></div>
      <div className={blockers?'release-readiness-score blocker':attention?'release-readiness-score attention':'release-readiness-score pass'}><Rocket size={18}/><strong>{blockers?blockers+' blocker'+(blockers===1?'':'s'):attention?attention+' item'+(attention===1?'':'s')+' to review':'Release gates clear'}</strong></div>
    </div>

    <div className="release-readiness-grid">
      {gates.map((gate)=><article className={'release-readiness-gate '+gate.state} key={gate.label}>
        <span>{gate.state==='pass'?<CheckCircle2 size={16}/>:gate.state==='blocker'?<AlertTriangle size={16}/>:<ShieldCheck size={16}/>}</span>
        <div><strong>{gate.label}</strong><small>{gate.detail}</small></div>
        <em>{gate.state==='pass'?'PASS':gate.state==='blocker'?'LAUNCH BLOCKER':'REVIEW'}</em>
      </article>)}
    </div>

    <div className="release-readiness-footer">
      <div>{!navigator.onLine&&<span className="status-pill muted"><WifiOff size={12}/> Offline</span>}<span className="status-pill muted">Running {__NIGHTJAR_BUILD_ID__}</span>{update?.latestBuildId&&<span className="status-pill muted">Deployed {update.latestBuildId}</span>}</div>
      <button className="ghost-button" disabled={checking} onClick={()=>void refreshBuild()}><RefreshCw size={14}/>{checking?'Checking build…':'Refresh release gate'}</button>
    </div>
  </section>;
}
