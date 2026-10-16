import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Moon, Users, X } from 'lucide-react';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import ProfileConnections from './ProfileConnections';

export type ConnectionKind = 'followers'|'following';
type Props = {
  userId:string;
  displayName:string;
  initialKind:ConnectionKind;
  onBack:()=>void;
  onOpenProfile:(userId:string,role?:string)=>void;
  demoMode?:boolean;
};

/**
 * A separate, full-height navigation destination rather than an expandable
 * card hidden in a person's profile. Parent profile is unmounted while this
 * route is open so it cannot compete for focus.
 */
export default function ProfileConnectionsPage({
  userId,displayName,initialKind,onBack,onOpenProfile,demoMode=false,
}:Props) {
  const [kind,setKind] = useState<ConnectionKind>(initialKind);
  const pageRef=useRef<HTMLElement|null>(null);
  useDialogFocusTrap(pageRef,{onEscape:onBack});
  useEffect(()=>{
    const old=document.body.style.overflow;
    document.body.style.overflow='hidden';
    pageRef.current?.scrollTo({top:0,behavior:'auto'});
    return ()=>{document.body.style.overflow=old;};
  },[]);
  const switchTo=(next:ConnectionKind)=>{
    setKind(next);
    pageRef.current?.scrollTo({top:0,behavior:'auto'});
  };
  return <div className="nj-connections-page-backdrop" role="dialog" aria-modal="true" aria-label={kind==='followers'?'Followers page':'Following page'}>
    <main ref={pageRef} tabIndex={-1} className="nj-connections-page" id="nightjar-connections-page">
      <header className="nj-connections-page-top">
        <button type="button" className="nj-connections-page-back" onClick={onBack} aria-label="Back to profile"><ArrowLeft size={19} aria-hidden="true"/><span>Back to profile</span></button>
        <span className="nj-connections-page-brand"><Moon size={18} aria-hidden="true"/> NIGHTJAR</span>
        <button type="button" className="nj-connections-page-close" onClick={onBack} aria-label="Close connections page"><X size={19} aria-hidden="true"/></button>
      </header>
      <div className="nj-connections-page-content">
        <div className="nj-connections-page-heading">
          <span className="nj-connections-page-kicker"><Users size={15} aria-hidden="true"/> THE NIGHTJAR COMMUNITY</span>
          <h1>{kind==='followers'?'Followers':'Following'}</h1>
          <p>{kind==='followers'
            ? <>Discover who's following <strong>{displayName}</strong>.</>
            : <>Explore the people <strong>{displayName}</strong> follows.</>}</p>
        </div>
        <div role="tablist" className="nj-connections-page-tabs" aria-label="Profile connections">
          <button type="button" role="tab" id="nj-connections-followers-tab" aria-controls="nj-connections-list" aria-selected={kind==='followers'} onClick={()=>switchTo('followers')}>Followers</button>
          <button type="button" role="tab" id="nj-connections-following-tab" aria-controls="nj-connections-list" aria-selected={kind==='following'} onClick={()=>switchTo('following')}>Following</button>
        </div>
        <div id="nj-connections-list" role="tabpanel" aria-labelledby={kind==='followers'?'nj-connections-followers-tab':'nj-connections-following-tab'} tabIndex={0}>
          <ProfileConnections key={userId+':'+kind} userId={userId} kind={kind} embedded demoMode={demoMode}
            onClose={onBack} onOpenProfile={onOpenProfile}/>
        </div>
      </div>
    </main>
  </div>;
}
