import { useEffect, useState } from 'react';
import { Laptop2, RefreshCw, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { nightjarAuthSecurity, type SignInActivity } from '../platform/firebase-auth-security';

export default function AccountSecurityActivity() {
  const [activity,setActivity]=useState<SignInActivity[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  const load=async()=>{
    setLoading(true);
    setError('');
    try {
      const data=await nightjarAuthSecurity.myActivity();
      setActivity(Array.isArray(data?.activity) ? data.activity.filter((item): item is SignInActivity => Boolean(item && typeof item === 'object')) : []);
    } catch {
      setError('Nightjar could not load recent sign-in activity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(()=>{ void load(); },[]);

  return <article className="panel premium-user-card account-security-activity">
    <div className="premium-user-card-head">
      <div><span className="mini-label">ACCOUNT SECURITY</span><h2>Recent Nightjar sign-ins.</h2></div>
      <ShieldCheck size={18}/>
    </div>
    <p className="panel-note">Only successful Nightjar account-portal sign-ins are shown here. A new browser/app profile is highlighted so you can spot something you do not recognise. Passwords and credential contents are never stored.</p>
    <div className="account-signin-activity-list">
      {loading && <div className="people-empty"><RefreshCw size={17}/><strong>Checking recent sign-ins…</strong></div>}
      {!loading && error && <div className="people-empty"><ShieldQuestion size={17}/><strong>{error}</strong><button className="ghost-button" onClick={()=>void load()}>Try again</button></div>}
      {!loading && !error && activity.slice(0,8).map((item)=><div className={item.newDevice?'account-signin-row new-device':'account-signin-row'} key={item.id}>
        <span><Laptop2 size={15}/></span>
        <div><strong>{item.newDevice?'New app / browser profile':'Recognised app / browser profile'}</strong><small>{item.clientPlatform || 'Client details unavailable'}{item.createdAt?' · '+new Date(item.createdAt).toLocaleString('en-GB'):''}</small></div>
        {item.newDevice && <em>NEW</em>}
      </div>)}
      {!loading && !error && activity.length===0 && <div className="people-empty"><ShieldCheck size={17}/><strong>No successful sign-in activity recorded yet.</strong><span>This list starts filling as verified account-portal sign-ins occur.</span></div>}
    </div>
    <div className="app-update-actions"><button className="ghost-button" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/> Refresh sign-in activity</button></div>
  </article>;
}
