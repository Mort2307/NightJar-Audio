import {
  BookOpenText,
  Brush,
  Clapperboard,
  Headphones,
  Heart,
  Mic2,
  Search,
  Sparkles,
  Star,
  UsersRound,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import SearchableMultiSelect from './SearchableMultiSelect';
import { ROLE_FOCUS_OPTIONS, ROLE_PROFILE_CONFIG, type ProfileRoleKey } from '../data/nightjarTaxonomy';

type SupportedRole = 'listener' | 'creator' | 'writer' | 'artist';

type Props = {
  role: SupportedRole;
  profile: any;
  setProfile: (updater: any) => void;
  portfolioOptions: any[];
  completedCollaborations: number;
};

const meta = {
  listener: {
    eyebrow:'LISTENER SHELF',
    title:'Your listening world, curated by you.',
    intro:'A Listener profile should feel like a beautifully curated shelf, not a blank account. Share the moods, themes and public playlists you want people to know you for without exposing private listening history.',
    identity:'LISTENING SIGNATURE',
    story:'WHY I LISTEN',
    showcase:'PUBLIC SHELF',
    showcaseTitle:'Collections worth sharing',
    showcaseCopy:'Choose public playlists that say something about your taste. Private playback, favourites and listening history stay private.',
    icon:Headphones,
  },
  creator: {
    eyebrow:'VA PERFORMANCE PROFILE',
    title:'Your voice is the product — present it like one.',
    intro:'Give listeners and collaborators a fast read on your performance style, recording strengths, creative range and the work you want to make next.',
    identity:'PERFORMANCE RANGE',
    story:'STUDIO & DIRECTION',
    showcase:'FEATURED PERFORMANCE',
    showcaseTitle:'Lead with the work that sounds most like you',
    showcaseCopy:'Feature up to six Nightjar releases. Verified releases remain visibly distinct from self-described skills.',
    icon:Mic2,
  },
  writer: {
    eyebrow:'WRITER DESK',
    title:'Show the craft without exposing the manuscript.',
    intro:'Present your genres, script formats, collaboration style and commission availability while the actual manuscript stays inside Nightjar’s protected writing workflow.',
    identity:'WRITING CRAFT',
    story:'WORKING STYLE',
    showcase:'PUBLISHED WORK',
    showcaseTitle:'Put your strongest produced writing first',
    showcaseCopy:'Feature verified Nightjar writing credits without making protected drafts or private deal terms public.',
    icon:BookOpenText,
  },
  artist: {
    eyebrow:'ARTIST STUDIO',
    title:'Make the visual identity as intentional as the audio.',
    intro:'Show creators your style, commission fit and visual strengths with an artwork-first profile that keeps private briefs, source files and licensing negotiations out of public view.',
    identity:'VISUAL PRACTICE',
    story:'COMMISSIONS & FIT',
    showcase:'PORTFOLIO',
    showcaseTitle:'Curate the work that defines your style',
    showcaseCopy:'Feature eligible Nightjar artwork and credits while private project files remain protected.',
    icon:Brush,
  },
} satisfies Record<SupportedRole,Record<string,any>>;

const roleMetrics = (role:SupportedRole, profile:any, completedCollaborations:number, portfolioOptions:any[]) => {
  if (role === 'listener') return [
    ['Moods',(profile.roleSpecialties ?? []).length,'Public listening moods'],
    ['Discovery',(profile.roleSecondary ?? []).length,'Ways you like to explore'],
    ['Shared',(portfolioOptions ?? []).length,'Eligible public playlists'],
  ];
  if (role === 'creator') return [
    ['Performance',(profile.roleSpecialties ?? []).length,'Specialties selected'],
    ['Production',(profile.roleSecondary ?? []).length,'Recording strengths'],
    ['Collaborations',completedCollaborations,'Completed on Nightjar'],
  ];
  if (role === 'writer') return [
    ['Writing',(profile.roleSpecialties ?? []).length,'Craft specialties'],
    ['Formats',(profile.roleSecondary ?? []).length,'Script formats'],
    ['Collaborations',completedCollaborations,'Completed on Nightjar'],
  ];
  return [
    ['Services',(profile.roleSpecialties ?? []).length,'Art services'],
    ['Strengths',(profile.roleSecondary ?? []).length,'Creative strengths'],
    ['Collaborations',completedCollaborations,'Completed on Nightjar'],
  ];
};

export default function RoleProfileExtension({ role, profile, setProfile, portfolioOptions, completedCollaborations }: Props) {
  const [query,setQuery]=useState('');
  const config=ROLE_PROFILE_CONFIG[role as ProfileRoleKey];
  const presentation=meta[role];
  const Icon=presentation.icon;
  const filtered=useMemo(()=>{
    const needle=query.trim().toLowerCase();
    if(!needle) return portfolioOptions;
    return portfolioOptions.filter((item:any)=>[item.title,item.subtitle,item.type].filter(Boolean).join(' ').toLowerCase().includes(needle));
  },[query,portfolioOptions]);

  const featuredIds:string[]=Array.isArray(profile.featuredPortfolioIds)?profile.featuredPortfolioIds:[];
  const toggleFeatured=(id:string,checked:boolean)=>setProfile((current:any)=>{
    const ids=Array.isArray(current.featuredPortfolioIds)?current.featuredPortfolioIds:[];
    return {...current,featuredPortfolioIds:checked?[...ids,id].slice(0,6):ids.filter((value:string)=>value!==id)};
  });

  return <section className={'premium-role-extension role-experience role-experience-'+role}>
    <header className="role-experience-hero">
      <div className="role-experience-icon"><Icon size={23}/></div>
      <div>
        <span className="mini-label">{presentation.eyebrow}</span>
        <h2>{presentation.title}</h2>
        <p>{presentation.intro}</p>
        <div className="role-experience-status">
          {role !== 'listener' && <span>{profile.roleAvailability || 'Availability not set'}</span>}
          {role === 'listener' && <span>Public taste only · private history stays private</span>}
        </div>
      </div>
    </header>

    <div className="role-experience-metrics">
      {roleMetrics(role,profile,completedCollaborations,portfolioOptions).map(([label,value,detail])=>
        <div key={String(label)}><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
      )}
    </div>

    <article className="panel premium-role-positioning role-experience-positioning">
      <div className="role-experience-card-title"><Sparkles size={16}/><div><span className="mini-label">ROLE POSITIONING</span><strong>{role === 'listener' ? 'How people recognise your taste' : 'How collaborators understand your work'}</strong></div></div>
      <div className="premium-role-positioning-grid">
        <label>Role-specific headline<input maxLength={140} value={profile.roleHeadline ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleHeadline:event.target.value}))} placeholder={role==='listener'?'Late-night listener · story-first · atmospheric':role==='creator'?'Character VA · intimate delivery · cinematic performance':role==='writer'?'Dialogue-first Writer · character-led scripts':'Atmospheric Artist · covers · character illustration'}/><small className="field-counter">{String(profile.roleHeadline ?? '').length}/140</small></label>
        <label>About this role<textarea maxLength={1200} value={profile.roleBio ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleBio:event.target.value}))} placeholder={role==='listener'?'What makes a release earn a place on your shelf?':role==='creator'?'Describe your performance identity and what collaborators can expect.':role==='writer'?'Describe your writing voice, formats and creative strengths.':'Describe your visual language, favourite briefs and creative approach.'}/><small className="field-counter">{String(profile.roleBio ?? '').length}/1200</small></label>
      </div>
    </article>

    <div className="premium-role-extension-grid role-experience-grid">
      <article className="panel premium-role-extension-card">
        <div className="role-experience-card-title">
          {role==='listener'?<Heart size={16}/>:role==='creator'?<Clapperboard size={16}/>:role==='writer'?<BookOpenText size={16}/>:<Brush size={16}/>}
          <div><span className="mini-label">{presentation.identity}</span><strong>{config.title}</strong></div>
        </div>
        <SearchableMultiSelect label={config.focusLabel} options={ROLE_FOCUS_OPTIONS[role]} values={profile.roleFocus ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleFocus:values}))}/>
        <SearchableMultiSelect label={config.specialtiesLabel} options={config.specialtiesOptions} values={profile.roleSpecialties ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSpecialties:values}))}/>
        <SearchableMultiSelect label={config.secondaryLabel} options={config.secondaryOptions} values={profile.roleSecondary ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSecondary:values}))}/>
        {config.availabilityLabel && <label>{config.availabilityLabel}<select value={profile.roleAvailability ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleAvailability:event.target.value}))}><option value="">Not specified</option>{config.availabilityOptions.map((option)=><option key={option} value={option}>{option}</option>)}</select></label>}
      </article>

      <article className="panel premium-role-extension-card role-experience-story">
        <div className="role-experience-card-title">
          {role==='listener'?<Star size={16}/>:<UsersRound size={16}/>}
          <div><span className="mini-label">{presentation.story}</span><strong>{role==='listener'?'Give recommendations some personality':'Set expectations before the first message'}</strong></div>
        </div>
        <label>{config.detailOneLabel}<textarea maxLength={600} value={profile.roleDetailOne ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailOne:event.target.value}))} placeholder={config.detailOnePlaceholder}/></label>
        <label>{config.detailTwoLabel}<textarea maxLength={600} value={profile.roleDetailTwo ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailTwo:event.target.value}))} placeholder={config.detailTwoPlaceholder}/></label>
        {role !== 'listener' && <div className="premium-role-proof"><UsersRound size={16}/><span><strong>{completedCollaborations} completed collaboration{completedCollaborations===1?'':'s'}</strong><small>Nightjar-recorded collaboration history, not a self-entered claim.</small></span></div>}
        {role === 'listener' && <div className="premium-role-proof"><Headphones size={16}/><span><strong>Private listening stays private</strong><small>Only profile choices and playlists you deliberately publish can appear publicly.</small></span></div>}
      </article>
    </div>

    <article className="panel premium-role-showcase role-experience-showcase">
      <div className="premium-role-showcase-head">
        <div><span className="mini-label">{presentation.showcase}</span><h3>{presentation.showcaseTitle}</h3><p>{presentation.showcaseCopy}</p></div>
        {role !== 'listener' && <span className="profile-collaboration-badge"><UsersRound size={13}/>{completedCollaborations} collaborations</span>}
      </div>
      <label>Showcase note <span className="optional-label">optional</span><textarea maxLength={400} value={profile.portfolioNote ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,portfolioNote:event.target.value}))} placeholder={role==='listener'?'Why these collections belong on your public shelf.':role==='creator'?'What should a new listener hear first?':role==='writer'?'What should collaborators understand about these credits?':'What ties this portfolio together?'}/></label>
      {portfolioOptions.length>6&&<label className="profile-portfolio-search"><Search size={14}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search eligible showcase work…"/></label>}
      <div className="premium-role-showcase-options">
        {filtered.map((item:any)=>{
          const selected=featuredIds.includes(item.id);
          const atLimit=!selected&&featuredIds.length>=6;
          return <label key={item.id} className={selected?'selected':''}><input type="checkbox" checked={selected} disabled={atLimit} onChange={(event)=>toggleFeatured(item.id,event.target.checked)}/><span><strong>{item.title}</strong><small>{item.subtitle || (role==='listener'?'Public playlist':'Nightjar verified work')}</small></span><em>{selected?'FEATURED':role==='listener'?'PUBLIC':'VERIFIED'}</em></label>;
        })}
        {!portfolioOptions.length&&<div className="people-empty"><Icon size={17}/><strong>{role==='listener'?'No public playlists yet.':role==='artist'?'No eligible portfolio work yet.':'No verified showcase work yet.'}</strong><span>{role==='listener'?'Create a playlist in Library, then choose whether to share it here.':role==='creator'?'Published releases will appear automatically when eligible.':role==='writer'?'Produced writing credits will appear automatically when eligible.':'Approved Nightjar artwork and credits will appear when eligible.'}</span></div>}
      </div>
    </article>
  </section>;
}
