import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, Heart, Moon, RotateCcw, Users, X } from 'lucide-react';
import { nightjarCommunity, type PublicConnectionResult } from '../platform/firebase-community';

type Kind = 'followers' | 'following';
type Props = {
  userId: string;
  kind: Kind;
  onClose: () => void;
  onOpenProfile: (userId: string, role?: string) => void;
  demoMode?: boolean;
  embedded?: boolean;
};
const titleFor = (kind: Kind) => kind === 'followers' ? 'Followers' : 'Following';

export default function ProfileConnections({userId,kind,onClose,onOpenProfile,demoMode=false,embedded=false}:Props) {
  const [data,setData] = useState<PublicConnectionResult|null>(null);
  const [loading,setLoading] = useState(!demoMode);
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  useEffect(()=>{
    if(demoMode) {setLoading(false);setData(null);return;}
    let current=true;
    setLoading(true);setError('');setData(null);
    void nightjarCommunity.listPublicProfileConnections(userId,kind)
      .then(value=>{if(current)setData(value);})
      .catch(()=>{if(current)setError('This connection list could not be loaded right now.');})
      .finally(()=>{if(current)setLoading(false);});
    return ()=>{current=false;};
  },[userId,kind,demoMode,reload]);

  return <section className="nj-connection-sheet" aria-labelledby="nj-connection-sheet-title" aria-busy={loading}>
    {!embedded && <header>
      <span className="nj-connection-heading"><Users size={18} aria-hidden="true"/><span>
        <small>THE NIGHTJAR COMMUNITY</small>
        <strong id="nj-connection-sheet-title">{titleFor(kind)}</strong>
      </span></span>
      <button className="nj-connection-close" type="button" onClick={onClose} aria-label="Close connections"><X size={18}/></button>
    </header>}
    {loading && <p role="status" className="nj-connection-state">Finding publicly visible members…</p>}
    {error && <div className="nj-connection-state" role="status">
      <p>{error}</p>
      <button className="secondary-button" type="button" onClick={()=>setReload(x=>x+1)}><RotateCcw size={14}/> Try again</button>
    </div>}
    {demoMode && <p className="nj-connection-state">Simulation profiles are illustrative; they do not have real follower connections.</p>}
    {!loading && data && <>
      <p className="nj-connection-description">Profiles visible to the NightJar community. Private, unavailable or suspended accounts are never listed.</p>
      {data.people.length ? <div className="nj-connection-people">
        {data.people.map(person=><button key={person.userId} type="button" className="nj-connection-person" onClick={()=>onOpenProfile(person.userId,person.role)}>
          <span className="nj-connection-avatar">{person.avatarUrl?<img src={person.avatarUrl} alt="" loading="lazy" decoding="async"/>:(person.initials || person.name.slice(0,2).toUpperCase())}</span>
          <span className="nj-connection-person-copy">
            <strong>{person.name}{person.official && <Moon size={14} aria-label="Official NightJar Creator"/>}</strong>
            <small>{person.handle ? '@'+person.handle.replace(/^@/,'')+' · ' : ''}{person.role === 'creator' ? 'Voice Actor' : person.role === 'editor' ? 'Audio Editor' : person.role.charAt(0).toUpperCase()+person.role.slice(1)}</small>
          </span>
          <ArrowRight size={17} aria-hidden="true"/>
        </button>)}
      </div> : <p className="nj-connection-state">No publicly visible members to display here yet.</p>}
      {data.hasMore && <p className="nj-connection-note"><Heart size={13}/> Showing a selection of publicly visible connections. More may exist.</p>}
    </>}
    {!embedded && <button type="button" className="nj-connection-footer" onClick={onClose}>Return to profile <ChevronDown size={15} aria-hidden="true"/></button>}
  </section>;
}
