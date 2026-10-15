import { ArrowRight, BookOpenText, Brush, CheckCircle2, FileCheck2, Headphones, Heart, Mic2, Play, Sparkles, type LucideIcon } from 'lucide-react';
import { belongsToLibraryCategory, type LibraryCategory, type LibraryProfile, type LibraryRole } from './ProfessionalLibrary';
import ContextHelp from './ContextHelp';

type ReleaseCredit = { userId?: string | null; role?: string | null; name?: string | null };
export type DiscoverableRelease = {
  id: string; title: string; creator?: string; creatorUserId?: string | null;
  genre?: string; category?: string; descriptor?: string;
  contributors?: ReleaseCredit[];
};
type Props = {
  profiles: LibraryProfile[];
  releases: DiscoverableRelease[];
  followingIds: string[];
  category: LibraryCategory;
  onCategoryChange: (category: LibraryCategory) => void;
  onOpen: (userId: string, role: LibraryRole) => void;
  onFollow: (userId: string) => void | Promise<void>;
  onPlayRelease: (releaseId: string) => void;
  readOnly: boolean;
};

const sections: Array<{role: LibraryRole; name:string; detail:string; icon:LucideIcon}> = [
  { role:'creator',name:'The voices',detail:'Performers and immersive audio',icon:Mic2 },
  { role:'writer',name:'The stories',detail:'Scripts, characters and worlds',icon:BookOpenText },
  { role:'editor',name:'The sound',detail:'Production, mixing and editing',icon:FileCheck2 },
  { role:'artist',name:'The artwork',detail:'Covers, illustration and design',icon:Brush },
];
const roleForCredit = (role: string): LibraryRole | null => {
  const text=role.trim().toLowerCase();
  if (['writer','scriptwriter','script writer','author'].includes(text)) return 'writer';
  if (['audio editor','editor','sound designer','sound design','audio engineer','mixing engineer','producer'].includes(text)) return 'editor';
  if (['artist','illustrator','cover artist','cover illustrator','cover design','artwork'].includes(text)) return 'artist';
  if (['voice actor','va creator','narrator','narration','performer','voice artist'].includes(text)) return 'creator';
  return null;
};

/** Only published catalogue releases and public, approved credited identities. */
export const publicCreativeCredits = (release:DiscoverableRelease, profiles:LibraryProfile[]) => {
  const byId=new Map(profiles.map(p=>[p.userId,p]));
  const credits:Array<{person:LibraryProfile;role:LibraryRole}>=[];
  const add=(userId:string|undefined|null, role:LibraryRole)=>{
    if(!userId)return;
    const person=byId.get(userId);
    if(!person||!belongsToLibraryCategory(person,role)||credits.some(p=>p.person.userId===userId&&p.role===role))return;
    credits.push({person,role});
  };
  add(release.creatorUserId,'creator');
  for(const credit of release.contributors??[]) {
    const role=roleForCredit(String(credit.role??''));
    if (role) add(credit.userId,role);
  }
  return credits;
};

export default function ListenerCreatorDiscovery({profiles,releases,followingIds,category,onCategoryChange,onOpen,onFollow,onPlayRelease,readOnly}:Props) {
  const professionals=profiles.filter(profile=>sections.some(section=>belongsToLibraryCategory(profile,section.role)));
  const following=professionals.filter(profile=>followingIds.includes(profile.userId)).sort((a,b)=>a.name.localeCompare(b.name));
  const creditedWork=releases.map(release=>({release,credits:publicCreativeCredits(release,profiles)}))
    .filter(item=>item.credits.length>0).slice(0,4);
  const openProfile=(person:LibraryProfile)=>{
    const firstRole=sections.find(section=>belongsToLibraryCategory(person,section.role))?.role??'creator';
    onOpen(person.userId,firstRole);
  };

  return <section className="nj-listener-discovery" aria-label="Discover Nightjar creators and their work">
    <header className="nj-listener-discovery-hero">
      <div className="nj-listener-discovery-copy">
        <div className="nj-listener-discovery-eyebrow"><Sparkles size={16}/> THE NIGHTJAR CREATOR COLLECTION</div>
        <h2>Find the people behind <em>what you love.</em> <ContextHelp topic="creator-discovery"/></h2>
        <p>Love the performance, the writing, the sound or the artwork? Discover who made it, explore their public work and decide how you’d like to support them.</p>
        <div className="nj-listener-discovery-value">
          <span><Heart size={15}/> Follow for free</span><span><BookOpenText size={15}/> Explore real published work</span><span><CheckCircle2 size={15}/> Support is always your choice</span>
        </div>
      </div>
      <div className="nj-listener-discovery-seal" aria-hidden="true"><Headphones size={38}/><span>DISCOVER</span><strong>THE MAKERS</strong><span>OF NIGHTJAR</span></div>
    </header>

    <div className="nj-listener-discovery-categories" aria-label="Explore creators by their work">
      {sections.map(({role,name,detail,icon:Icon})=>{
        const count=professionals.filter(person=>belongsToLibraryCategory(person,role)).length;
        return <button type="button" key={role} aria-pressed={category===role} className={category===role?'nj-listener-discovery-category active':'nj-listener-discovery-category'} onClick={()=>onCategoryChange(role)}>
          <span className="nj-listener-discovery-category-icon"><Icon size={21}/></span>
          <strong>{name}</strong><small>{detail}</small><span>{count} {count===1?'person':'people'} <ArrowRight size={14}/></span>
        </button>;
      })}
    </div>

    {!!following.length&&<section className="nj-listener-discovery-following" aria-labelledby="nj-listener-following-title">
      <div className="nj-listener-discovery-subhead"><div><span className="mini-label">YOUR PEOPLE</span><h3 id="nj-listener-following-title">Creators you follow</h3><p>Keep the makers you value in easy reach.</p></div><span>{following.length} following</span></div>
      <div className="nj-listener-discovery-follow-list">{following.slice(0,8).map(person=><article key={person.userId}>
        <button type="button" className="nj-listener-discovery-follow-profile" onClick={()=>openProfile(person)}>
          <span className="nj-listener-discovery-avatar">{person.avatarUrl?<img src={person.avatarUrl} alt="" loading="lazy"/>:(person.avatarInitials||person.name.slice(0,2).toUpperCase())}</span>
          <span><strong>{person.name}</strong><small>{sections.filter(c=>belongsToLibraryCategory(person,c.role)).map(c=>c.name).join(' · ')}</small></span>
        </button>
        {!readOnly&&<button type="button" className="ghost-button" onClick={()=>void onFollow(person.userId)} aria-label={'Unfollow '+person.name}><Heart size={15} fill="currentColor"/> Following</button>}
      </article>)}</div>
    </section>}

    {!!creditedWork.length&&<section className="nj-listener-discovery-work" aria-labelledby="nj-listener-work-title">
      <div className="nj-listener-discovery-subhead"><div><span className="mini-label">REAL RELEASES · REAL CREDITS</span><h3 id="nj-listener-work-title">Meet the makers through their work</h3><p>Start with a released Nightjar production, then explore the credited professionals behind it.</p></div></div>
      <div className="nj-listener-discovery-work-grid">{creditedWork.map(({release,credits})=><article key={release.id} className="nj-listener-discovery-release">
        <span className="mini-label">{release.genre||release.category||'NIGHTJAR AUDIO'}</span>
        <h4>{release.title}</h4>
        <div className="nj-listener-discovery-credit-list">{credits.slice(0,5).map(({person,role})=><button key={person.userId+':'+role} type="button" onClick={()=>onOpen(person.userId,role)}>
          {person.name}<small>{role==='creator'?'VA Creator':role==='writer'?'Writer':role==='editor'?'Audio Editor':'Artist'}</small>
        </button>)}</div>
        <button type="button" className="secondary-button" onClick={()=>onPlayRelease(release.id)}><Play size={14}/> Explore this release</button>
      </article>)}</div>
    </section>}

  </section>;
}
