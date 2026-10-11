import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Eye, FileCheck2, FileText, Headphones, ImagePlus, LockKeyhole, Mic2, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
import PublicProfile from './PublicProfile';

type Role = 'listener' | 'creator' | 'writer' | 'editor' | 'artist';
type Account = {
  userId?: string; name?: string; email?: string; handle?: string | null;
  role?: string; roles?: string[]; status?: string; avatarUrl?: string | null; publicProfile?: boolean;
};
type Result = { status: 'loading' | 'ready' | 'private' | 'error'; profile?: any; message?: string };
type Props = {
  accounts: Account[];
  initialUserId?: string | null;
  onRefreshAccounts: () => void | Promise<void>;
  notify: (message: string) => void;
};
const order: Role[] = ['listener','creator','writer','editor','artist'];
const labels: Record<Role,string> = { listener:'Listener',creator:'VA Creator',writer:'Writer',editor:'Audio Editor',artist:'Artist' };
const symbols = { listener:Headphones,creator:Mic2,writer:FileText,editor:FileCheck2,artist:ImagePlus };
const roleData = (profile:any, role:Role) => (profile?.roleProfiles?.[role] ?? (profile?.role === role ? profile : {})) as Record<string,any>;
const lines = (value:unknown) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
const approvedRoles = (account:Account):Role[] => {
  const stored = Array.isArray(account.roles) ? account.roles : [account.role ?? 'listener'];
  const valid = order.filter((role)=>role==='listener' || stored.includes(role));
  return valid.length ? valid : ['listener'];
};

export default function AdminLiveProfileViewer({ accounts, initialUserId, onRefreshAccounts, notify }:Props) {
  const [filter,setFilter] = useState('');
  const [selected,setSelected] = useState<string[]>(() => initialUserId ? [initialUserId] : []);
  const [results,setResults] = useState<Record<string,Result>>({});
  const [rolesByAccount,setRolesByAccount] = useState<Record<string,Role[]>>({});
  const [profileOpen,setProfileOpen] = useState<{userId:string;role:Role}|null>(null);
  const [refreshToken,setRefreshToken] = useState(0);

  useEffect(() => {
    if (initialUserId) setSelected((ids)=>ids.includes(initialUserId) ? ids : [initialUserId]);
  }, [initialUserId]);

  const members = useMemo(()=>accounts.filter((account)=>Boolean(account.userId) && account.role !== 'admin')
    .sort((a,b)=>String(a.name??'').localeCompare(String(b.name??''))),[accounts]);
  const matched = useMemo(()=>members.filter((account) =>
    [account.name,account.email,account.handle,...(account.roles??[])].join(' ').toLowerCase().includes(filter.trim().toLowerCase())
  ).slice(0,80),[members,filter]);
  const selectedAccounts = selected.map((id)=>members.find((account)=>account.userId===id)).filter((account):account is Account =>Boolean(account));

  useEffect(() => {
    let cancelled=false;
    if (!selected.length) return;
    setResults((prev)=>Object.fromEntries([...Object.entries(prev).filter(([id])=>!selected.includes(id)),...selected.map(id=>[id,{status:'loading' as const}])]));
    void Promise.all(selected.map(async (id)=>{
      try {
        // This is exactly the public endpoint used by the member profile
        // modal; we do not read accounts/{uid}/private or act as that user.
        const data=await nightjarCommunity.getPublicProfile(id);
        if (cancelled) return;
        const profile=data.profile;
        setResults((prev)=>({...prev,[id]:profile ? {status:'ready',profile} : {status:'private'}}));
      } catch (error) {
        if (!cancelled) setResults((prev)=>({...prev,[id]:{status:'error',message:error instanceof Error ? error.message : 'Public profile unavailable.'}]}));
      }
    }));
    return ()=>{cancelled=true;};
  },[selected.join('|'),refreshToken]);

  const toggleAccount=(id:string)=>{
    setSelected((prev)=>prev.includes(id) ? prev.filter(item=>item!==id)
      : prev.length>=3 ? (notify('Compare up to three real accounts at a time.'),prev) : [...prev,id]);
  };
  const toggleRole=(id:string,role:Role,available:Role[])=>{
    const current=rolesByAccount[id]??available;
    setRolesByAccount(prev=>({...prev,[id]:current.includes(role) ? current.filter(item=>item!==role) : order.filter(item=>current.includes(item)||item===role)}));
  };

  return <section className="nj-admin-profile-viewer" aria-label="Live member profile viewer">
    <header className="nj-profile-viewer-head">
      <div className="nj-profile-viewer-head-icon"><Eye size={23}/></div>
      <div><span className="mini-label">OWNER ONLY · LIVE FIREBASE · READ ONLY</span>
        <h2>Live Profile Viewer</h2>
        <p>Select one or more real member accounts, then choose which of their approved professional identities to inspect. No fictional data and no member impersonation.</p></div>
      <button type="button" className="secondary-button" onClick={()=>{void onRefreshAccounts();setRefreshToken(value=>value+1);}}><RefreshCw size={14}/> Refresh live data</button>
    </header>

    <div className="nj-profile-viewer-safety"><ShieldCheck size={18}/><div><strong>Actual public member experience</strong>
      <p>The preview uses Nightjar's real published profile endpoint and the same Public Profile component members open in the Directory. It cannot display private profiles, access individual inboxes or scripts, change member permissions or send gifts and follows. Private Studio dashboards require a signed-in authorised tester.</p></div></div>

    <div className="nj-profile-viewer-filters">
      <label><Search size={15}/><input type="search" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Find account by name, handle, role or email" aria-label="Search live member accounts"/></label>
      <span>{selected.length} of 3 selected · {members.length} account{members.length===1?'':'s'}</span>
    </div>
    <div className="nj-profile-viewer-account-list" aria-label="Live Nightjar accounts">
      {matched.map((account)=>{
        const id=account.userId!;
        const active=selected.includes(id);
        return <button type="button" key={id} className={active?'nj-profile-viewer-account selected':'nj-profile-viewer-account'} aria-pressed={active} onClick={()=>toggleAccount(id)}>
          <span className="nj-profile-viewer-avatar">{account.avatarUrl&&account.publicProfile!==false ? <img src={account.avatarUrl} alt="" loading="lazy"/>:(account.name??'N').slice(0,1).toUpperCase()}</span>
          <span className="nj-profile-viewer-account-detail"><strong>{account.name??'Nightjar member'}</strong><small>{account.handle?'@'+account.handle.replace(/^@/,''):account.email??'No public handle'} · {account.status??'Active'}</small>
            <span>{approvedRoles(account).map(role=>labels[role]).join(' · ')}</span></span>
          <span className={active?'nj-profile-viewer-check checked':'nj-profile-viewer-check'}>{active?<CheckCircle2 size={20}/>:<Eye size={17}/>}</span>
        </button>;
      })}
      {!matched.length&&<div className="people-empty"><Users size={20}/><strong>No matching real accounts</strong><p>Refresh the live account directory, or try another search.</p></div>}
    </div>

    {!selectedAccounts.length && <div className="nj-profile-viewer-welcome"><Eye size={25}/><h3>Choose a member to view their live profile.</h3><p>Compare up to three real accounts and inspect every approved role separately. Their published public profile will be rendered without simulation.</p></div>}

    <div className="nj-profile-viewer-compare">
      {selectedAccounts.map((account)=>{
        const id=account.userId!;
        const result=results[id]??{status:'loading'};
        const available=approvedRoles(account);
        const chosen=(rolesByAccount[id]??available).filter(role=>available.includes(role));
        const profile=result.profile;
        return <section className="nj-profile-viewer-member" key={id} aria-label={String(account.name??'Member')+' public role views'}>
          <header><div><span className="mini-label">LIVE ACCOUNT · {account.status?.toUpperCase()??'ACTIVE'}</span><h3>{account.name??'Nightjar member'}</h3><p>{account.publicProfile===false?'Private account':account.handle?'@'+account.handle.replace(/^@/,''):'Published profile'} · {available.length} approved role{available.length===1?'':'s'}</p></div>
          <button type="button" className="ghost-button" onClick={()=>toggleAccount(id)} aria-label={'Remove '+account.name+' from comparison'}><X size={16}/> Remove</button></header>
          <fieldset className="nj-profile-viewer-role-select"><legend>Choose the approved roles to inspect (multiple allowed)</legend>
            {available.map(role=>{const Icon=symbols[role];return <label key={role} className={chosen.includes(role)?'active':''}><input type="checkbox" checked={chosen.includes(role)} onChange={()=>toggleRole(id,role,available)}/><Icon size={16}/>{labels[role]}</label>;})}
          </fieldset>
          {result.status==='loading'&&<div className="nj-profile-viewer-status"><RefreshCw size={18}/><strong>Loading this member's published profile…</strong></div>}
          {result.status==='error'&&<div className="nj-profile-viewer-status" role="alert"><ShieldCheck size={18}/><strong>Could not load the public profile.</strong><p>{result.message}</p><button type="button" className="secondary-button" onClick={()=>setRefreshToken(n=>n+1)}>Retry</button></div>}
          {result.status==='private'&&<div className="nj-profile-viewer-status"><LockKeyhole size={20}/><strong>No public profile is available.</strong><p>This member may have a private, inactive, or unpublished profile. Nightjar deliberately does not reveal it in public preview.</p></div>}
          {result.status==='ready'&& <div className="nj-profile-viewer-roles">
            {chosen.map(role=>{
              const detail=roleData(profile,role);
              const specialties=[...lines(detail.roleFocus),...lines(detail.roleSpecialties)].filter((x,i,a)=>a.indexOf(x)===i).slice(0,6);
              const fallback=role==='listener'?'A listener in the Nightjar community.':role==='creator'?'Voice performance and original audio.':role==='writer'?'Stories and scripts.':role==='editor'?'Post-production and sound.':'Visual storytelling and artwork.';
              return <article className="nj-profile-viewer-role-card" key={role}>
                <div className="nj-profile-viewer-card-kicker"><span>REAL PUBLISHED DATA</span><span>{labels[role]}</span></div>
                <div className="nj-profile-viewer-identity">
                  <span className="nj-profile-viewer-big-avatar">{profile.avatarUrl?<img src={profile.avatarUrl} alt="" loading="lazy"/>:profile.avatarInitials??String(profile.displayName??'NJ').slice(0,2).toUpperCase()}</span>
                  <div><strong>{profile.displayName}</strong>{profile.handle&&<span>@{String(profile.handle).replace(/^@/,'')}</span>}</div>
                </div>
                <h4>{detail.roleHeadline || (role==='listener' ? profile.headline : null) || fallback}</h4>
                <p>{detail.roleBio || (role==='listener'?profile.bio:null) || 'No public biography for this role yet.'}</p>
                {!!specialties.length&&<div className="nj-profile-viewer-tags">{specialties.map((item)=> <span key={item}>{item}</span>)}</div>}
                {detail.roleAvailability&&<div className="nj-profile-viewer-availability"><CheckCircle2 size={14}/>{detail.roleAvailability}</div>}
                <button type="button" className="primary-button" onClick={()=>setProfileOpen({userId:id,role})}><Eye size={15}/> Open actual public profile <ArrowRight size={14}/></button>
              </article>;
            })}
            {!chosen.length&&<div className="nj-profile-viewer-status"><p>Select at least one approved role above to view its published identity.</p></div>}
          </div>}
        </section>;
      })}
    </div>

    {profileOpen&&<PublicProfile
      key={profileOpen.userId+':'+profileOpen.role}
      userId={profileOpen.userId}
      initialRole={profileOpen.role}
      readOnlyPreview
      followingIds={[]}
      onToggleFollow={async()=>{}}
      onClose={()=>setProfileOpen(null)}
      notify={notify}
      canMessage={false}
      canReact={false}
      demoMode={false}
    />}
  </section>;
}
