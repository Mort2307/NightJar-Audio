import { ArrowRight, Brush, FileCheck2, FileText, Heart, Headphones, MessageCircle, Mic2, Search, Share2, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import ContextHelp from './ContextHelp';

export type LibraryRole = 'creator' | 'writer' | 'editor' | 'artist';
export type LibraryCategory = 'all' | LibraryRole | 'listener';
type ProfileRole = LibraryRole | 'listener';

export type LibraryProfile = {
  userId: string;
  role: ProfileRole;
  roles?: ProfileRole[];
  name: string;
  handle?: string | null;
  headline?: string | null;
  bio?: string | null;
  nightjarTeam?: boolean;
  followerCount?: number;
  avatarUrl?: string | null;
  avatarInitials?: string | null;
  favouriteTags?: string[];
  roleSpecialties?: string[];
  roleAvailability?: string | null;
  roleProfiles?: Record<string, {
    roleHeadline?: string | null;
    roleBio?: string | null;
    roleFocus?: string[];
    roleSpecialties?: string[];
    roleSecondary?: string[];
    roleAvailability?: string | null;
    editorSoftware?: string[];
    artistMediums?: string[];
    creatorLanguages?: string[];
    writerScriptLengths?: string[];
  }>;
  releaseCount?: number;
  publishedWorkCount?: number;
  creditedReleaseCount?: number;
  completedCollaborations?: number;
  activityBadges?: Array<{ id: string; label: string; detail: string }>;
};

type Props = {
  profiles: LibraryProfile[];
  filteredProfiles: LibraryProfile[];
  category: LibraryCategory;
  onCategoryChange: (category: LibraryCategory) => void;
  onOpen: (userId: string, role: ProfileRole) => void;
  onFollow: (userId: string) => void | Promise<void>;
  followingIds: string[];
  onRecommend: (person: LibraryProfile, role: LibraryRole) => void | Promise<void>;
  onMessage: (userId: string) => void;
  canMessage: boolean;
  readOnly: boolean;
  audience?: 'listener' | 'professional';
  onSupport?: (person: LibraryProfile, role: LibraryRole) => void;
};

const categories: {id:LibraryRole;name:string;description:string;icon:LucideIcon}[] = [
  {id:'creator', name:'VA Creators', description:'Discover the voices and performers behind Nightjar', icon:Mic2},
  {id:'writer',name:'Writers',description:'Meet the people shaping the scripts and stories',icon:FileText},
  {id:'editor',name:'Audio Editors',description:'Explore the specialists behind the finished sound',icon:FileCheck2},
  {id:'artist',name:'Artists',description:'Find illustrators, designers and visual storytellers',icon:Brush},
];
const roleName:Record<ProfileRole,string> = {creator:'VA Creator',writer:'Writer',editor:'Audio Editor',artist:'Artist',listener:'Listener'};

export const belongsToLibraryCategory = (profile:LibraryProfile, category:ProfileRole) =>
  profile.role === category || Array.isArray(profile.roles) && profile.roles.includes(category);

function PersonCard({
  person, category, readOnly, followingIds, canMessage, audience, onOpen, onFollow, onRecommend, onMessage, onSupport,
}: {
  person:LibraryProfile;category:ProfileRole;readOnly:boolean;followingIds:string[];canMessage:boolean;audience:'listener'|'professional';
  onOpen:(id:string,role:ProfileRole)=>void;onFollow:(id:string)=>void|Promise<void>;
  onRecommend:(profile:LibraryProfile,role:LibraryRole)=>void|Promise<void>;onMessage:(id:string)=>void;
  onSupport?:(person:LibraryProfile,role:LibraryRole)=>void;
}) {
  const slice=person.roleProfiles?.[category] ?? {};
  const roleHeadline=slice.roleHeadline || (person.role===category ? person.headline : null)
    || (category==='creator' ? 'Independent Nightjar voice performer' : category==='writer' ? 'Nightjar writer'
      : category==='editor' ? 'Nightjar audio specialist' : category==='artist' ? 'Nightjar visual artist' : 'Nightjar community member');
  const summary=slice.roleBio || (person.role===category ? person.bio : null)
    || (category==='listener' ? 'Explore this member’s public community profile.' : 'Explore their public professional portfolio and credits.');
  const tags=[...(slice.roleFocus??[]),...(slice.roleSpecialties??[]),
    ...(category==='artist' ? slice.artistMediums??[] : category==='editor' ? slice.editorSoftware??[]
      : category==='creator' ? slice.creatorLanguages??[] : category==='writer' ? slice.writerScriptLengths??[] : []),
    ...(person.role===category ? person.roleSpecialties??[] : []),
  ].filter((tag,index,array)=>Boolean(tag) && array.indexOf(tag)===index).slice(0,5);
  const metric=category==='creator'
    ? `${person.releaseCount??0} releases`
    : category==='writer'
      ? `${person.publishedWorkCount??0} approved scripts`
      : category==='editor'
        ? `${person.creditedReleaseCount??0} release credits`
        : category==='artist'
          ? `${person.completedCollaborations??0} collaborations`
          : `${person.followerCount??0} followers`;
  const available=slice.roleAvailability || (person.role===category ? person.roleAvailability : null);
  const Icon=category==='listener' ? Headphones : categories.find(item=>item.id===category)?.icon??Users;
  return <article className="nj-pro-library-person" data-profession={category}>
    <div className="nj-pro-library-person-top"><div className="nj-pro-library-person-avatar">
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" loading="lazy" decoding="async"/>
        : <span>{person.avatarInitials || person.name.slice(0,2).toUpperCase()}</span>}
    </div><div className="nj-pro-library-person-title"><div className="nj-pro-library-person-role"><Icon size={13}/>{person.nightjarTeam ? 'Nightjar Team' : roleName[category]}</div>
      <h3>{person.name}</h3><small>{person.handle ? '@'+person.handle.replace(/^@/,'') : 'Nightjar member'}</small>
    </div></div>
    <strong className="nj-pro-library-headline">{roleHeadline}</strong>
    <p className="nj-pro-library-summary">{summary}</p>
    {!!tags.length&&<div className="nj-pro-library-tags">{tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
    {person.nightjarTeam ? <div className="nj-pro-library-verification"><ShieldCheck size={12}/>Official Nightjar Team</div> : !!person.activityBadges?.length&&<div className="nj-pro-library-verification"><ShieldCheck size={12}/>{person.activityBadges[0].label}</div>}
    <div className="nj-pro-library-meta"><span>{metric}</span><span>{available || 'View professional profile'}</span></div>
    <div className="nj-pro-library-actions">
      <button data-nj-preview-safe="true" className="primary-button" type="button" onClick={()=>onOpen(person.userId,category)}>
        {person.nightjarTeam ? 'Meet the Nightjar team' : audience==='listener' ? 'Explore their work' : 'View '+roleName[category]+' profile'} <ArrowRight size={14}/>
      </button>
      {!readOnly&&<button className="secondary-button" type="button" aria-label={followingIds.includes(person.userId)?'Unfollow '+person.name:'Follow '+person.name}
        onClick={()=>void onFollow(person.userId)}><Heart size={15} fill={followingIds.includes(person.userId)?'currentColor':'none'}/>{audience==='listener'?followingIds.includes(person.userId)?' Following':' Follow':null}</button>}
      {!readOnly&&audience==='listener'&&category!=='listener'&&onSupport&&<button className="secondary-button" type="button" onClick={()=>onSupport(person,category as LibraryRole)}>Support with Nightjars</button>}
      {!readOnly&&category!=='listener'&&<button className="secondary-button" type="button" aria-label={'Share '+person.name+' — '+roleName[category]+' profile'} onClick={()=>void onRecommend(person,category as LibraryRole)}><Share2 size={15} aria-hidden="true"/> Share</button>}
      {!readOnly&&canMessage&&category!=='listener'&&<button className="secondary-button" type="button" aria-label={'Message '+person.name} onClick={()=>onMessage(person.userId)}><MessageCircle size={15}/></button>}
    </div>
  </article>;
}

export default function ProfessionalLibrary({
  profiles,filteredProfiles,category,onCategoryChange,onOpen,onFollow,followingIds,onRecommend,onMessage,canMessage,readOnly,audience='professional',onSupport,
}:Props) {
  const uniqueProfessionals=new Set(profiles.filter(profile=>categories.some(({id})=>belongsToLibraryCategory(profile,id))).map(item=>item.userId)).size;
  const teamProfiles=profiles.filter(profile=>profile.nightjarTeam===true).slice().sort((a,b)=>a.name.localeCompare(b.name));
  const displayedCategories=category==='all' ? categories.map(c=>c.id)
    : category==='listener' ? ['listener'] as ProfileRole[] : [category];
  const totalMatching=category==='all'
    ? new Set(filteredProfiles.filter(profile=>categories.some(({id})=>belongsToLibraryCategory(profile,id))).map(item=>item.userId)).size
    : filteredProfiles.filter(profile=>belongsToLibraryCategory(profile,category)).length;
  return <div className="nj-pro-library">
    <div className="nj-pro-library-banner"><div><span className="mini-label">THE PEOPLE BEHIND NIGHTJAR</span>
      <h2>{audience==='listener'?'The Creator Collection':'The Professional Library'}</h2>
      <p>{audience==='listener' ? 'One community. Discover the voices, storytelling, sound and visual work you love. Follow for free, explore published work or choose to send Nightjars to show appreciation.' : 'One creative community, four distinct professions. Browse approved public profiles, portfolios and services—without losing the individuality of each creator.'}</p>
    </div><span className="nj-pro-library-total"><strong>{uniqueProfessionals}</strong><small>public professionals <ContextHelp topic="directory-counts"/></small></span></div>

    {category!=='listener'&&teamProfiles.length>0&&<section className="nj-pro-library-section nj-pro-library-team" aria-label="Meet the Nightjar team">
      <div className="nj-pro-library-section-head"><span className="nj-pro-library-section-icon"><ShieldCheck size={21}/></span><div><span className="mini-label">OFFICIAL NIGHTJAR TEAM</span><h2>Meet the people behind Nightjar</h2><p>Our team is part of this community too. Explore our public profiles, follow along and see who's helping Nightjar grow.</p></div><span className="nj-pro-library-section-count">{teamProfiles.length} {teamProfiles.length===1?'member':'members'}</span></div>
      <div className="nj-pro-library-grid">{teamProfiles.map(person=><PersonCard key={'team:'+person.userId} person={person} category="listener" readOnly={readOnly} followingIds={followingIds} canMessage={false} audience={audience} onOpen={onOpen} onFollow={onFollow} onRecommend={onRecommend} onMessage={onMessage}/>)}</div>
    </section>}

    <div className="nj-pro-library-navigation" role="group" aria-label="Professional library categories">
      <button type="button" className={category==='all'?'nj-pro-library-nav-item active':'nj-pro-library-nav-item'}
        aria-pressed={category==='all'} onClick={()=>onCategoryChange('all')}><Users size={21}/><span><strong>All professionals</strong><small>{uniqueProfessionals} people in the library</small></span><ArrowRight size={14}/></button>
      {categories.map(({id,name,description,icon:Icon})=>{
        const count=profiles.filter(profile=>belongsToLibraryCategory(profile,id)).length;
        return <button type="button" key={id} className={category===id?'nj-pro-library-nav-item active':'nj-pro-library-nav-item'}
          aria-pressed={category===id} onClick={()=>onCategoryChange(id)}><Icon size={21}/><span><strong>{name}</strong><small>{count} public {count===1?'profile':'profiles'} · {description}</small></span><ArrowRight size={14}/></button>;
      })}
      <button type="button" className={category==='listener'?'nj-pro-library-nav-item community active':'nj-pro-library-nav-item community'}
        aria-pressed={category==='listener'} onClick={()=>onCategoryChange('listener')}><Headphones size={21}/><span><strong>Listener community</strong><small>{profiles.filter(profile=>belongsToLibraryCategory(profile,'listener')).length} public member profiles</small></span><ArrowRight size={14}/></button>
    </div>

    <div className="nj-pro-library-results-label"><Search size={15}/><span>{totalMatching} matching public {totalMatching===1?'profile':'profiles'} · All role categories reflect the same approved Nightjar accounts</span></div>
    {displayedCategories.map(role=>{
      const list=filteredProfiles.filter(profile=>belongsToLibraryCategory(profile,role)).slice()
        .sort((a,b)=>a.name.localeCompare(b.name));
      const metadata=categories.find(item=>item.id===role);
      const Icon=role==='listener'?Headphones:metadata?.icon??Users;
      const title=metadata?.name??'Listener community';
      return <section className="nj-pro-library-section" key={role} id={'nightjar-library-'+role} aria-label={title}>
        <div className="nj-pro-library-section-head"><span className="nj-pro-library-section-icon"><Icon size={21}/></span>
          <div><span className="mini-label">CATEGORY · {role.toUpperCase()}</span><h2>{title}</h2>
            <p>{metadata?.description??'Public community profiles, interests and shared creativity'}</p></div>
          <span className="nj-pro-library-section-count">{list.length} {list.length===1?'member':'members'}</span>
        </div>
        {!!list.length?<div className="nj-pro-library-grid">
          {list.map(person=><PersonCard key={role+':'+person.userId} person={person} category={role} readOnly={readOnly}
            followingIds={followingIds} canMessage={canMessage} audience={audience} onSupport={onSupport} onOpen={onOpen} onFollow={onFollow} onRecommend={onRecommend} onMessage={onMessage}/>)}
        </div>:<div className="nj-pro-library-empty"><Icon size={20}/><strong>{category==='all'?'No public '+title.toLowerCase()+' yet':'No matching '+title.toLowerCase()}</strong>
          <p>{category==='all'?'This category will populate as approved Nightjar members publish their professional profiles.':'Try clearing the search, specialty or availability filters. Private profiles remain private.'}</p></div>}
      </section>;
    })}
  </div>;
}
