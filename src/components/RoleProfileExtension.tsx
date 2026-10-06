import { Handshake, Search, Sparkles } from 'lucide-react';
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

const roleEyebrow: Record<SupportedRole,string> = {
  listener:'LISTENER SIGNATURE',
  creator:'VA CREATOR IDENTITY',
  writer:'WRITER IDENTITY',
  artist:'ARTIST IDENTITY',
};

const roleIntro: Record<SupportedRole,string> = {
  listener:'Your Listener profile is not a lesser profile. Shape the moods, discovery style and public collections that make your Nightjar presence recognisably yours.',
  creator:'Your performance identity sits on top of your personal profile: what you perform, how you work and what you want to make next.',
  writer:'Your writing identity presents style, formats and collaboration preferences while protected manuscripts remain private.',
  artist:'Your creative identity presents style, services and commission preferences while private briefs and source files stay private.',
};

export default function RoleProfileExtension({ role, profile, setProfile, portfolioOptions, completedCollaborations }: Props) {
  const [query,setQuery]=useState('');
  const config=ROLE_PROFILE_CONFIG[role as ProfileRoleKey];
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

  return <section className="premium-role-extension">
    <div className="premium-role-extension-head">
      <div><span className="mini-label">{roleEyebrow[role]}</span><h2>{config.title}</h2><p>{roleIntro[role]}</p></div>
      <Sparkles size={20}/>
    </div>

    <article className="panel premium-role-positioning">
      <span className="mini-label">ROLE POSITIONING</span>
      <div className="premium-role-positioning-grid">
        <label>Role-specific headline<input maxLength={140} value={profile.roleHeadline ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleHeadline:event.target.value}))} placeholder={role==='listener'?'A line that captures your Nightjar vibe':'A professional line for this role'}/><small className="field-counter">{String(profile.roleHeadline ?? '').length}/140</small></label>
        <label>About this role<textarea maxLength={1200} value={profile.roleBio ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleBio:event.target.value}))} placeholder={role==='listener'?'What kind of listener are you, and what do you enjoy discovering?':'Tell people what you bring to this role and how you like to work.'}/><small className="field-counter">{String(profile.roleBio ?? '').length}/1200</small></label>
      </div>
    </article>

    <div className="premium-role-extension-grid">
      <article className="panel premium-role-extension-card">
        <span className="mini-label">ROLE SIGNATURE</span>
        <SearchableMultiSelect label={config.focusLabel} options={ROLE_FOCUS_OPTIONS[role]} values={profile.roleFocus ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleFocus:values}))}/>
        <SearchableMultiSelect label={config.specialtiesLabel} options={config.specialtiesOptions} values={profile.roleSpecialties ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSpecialties:values}))}/>
        <SearchableMultiSelect label={config.secondaryLabel} options={config.secondaryOptions} values={profile.roleSecondary ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSecondary:values}))}/>
        {config.availabilityLabel && <label>{config.availabilityLabel}<select value={profile.roleAvailability ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleAvailability:event.target.value}))}><option value="">Not specified</option>{config.availabilityOptions.map((option)=><option key={option} value={option}>{option}</option>)}</select></label>}
      </article>

      <article className="panel premium-role-extension-card">
        <span className="mini-label">ROLE STORY</span>
        <label>{config.detailOneLabel}<textarea maxLength={600} value={profile.roleDetailOne ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailOne:event.target.value}))} placeholder={config.detailOnePlaceholder}/></label>
        <label>{config.detailTwoLabel}<textarea maxLength={600} value={profile.roleDetailTwo ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailTwo:event.target.value}))} placeholder={config.detailTwoPlaceholder}/></label>
        {role !== 'listener' && <div className="premium-role-proof"><Handshake size={16}/><span><strong>{completedCollaborations} completed collaboration{completedCollaborations===1?'':'s'}</strong><small>Platform-recorded collaboration history</small></span></div>}
      </article>
    </div>

    <article className="panel premium-role-showcase">
      <div className="premium-role-showcase-head">
        <div><span className="mini-label">{role === 'listener' ? 'CURATED PUBLIC SPACE' : 'PUBLIC SHOWCASE'}</span><h3>{role === 'listener' ? 'Shared playlists' : 'Choose what leads your profile.'}</h3><p>{role === 'listener' ? 'Public playlists make a Listener profile feel curated without exposing private listening history, favourites or playback behaviour.' : 'Feature up to six pieces of verified Nightjar work. Platform credits stay distinct from self-description.'}</p></div>
        {role !== 'listener' && <span className="profile-collaboration-badge"><Handshake size={13}/>{completedCollaborations} collaborations</span>}
      </div>
      <label>Showcase note <span className="optional-label">optional</span><textarea maxLength={400} value={profile.portfolioNote ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,portfolioNote:event.target.value}))} placeholder={role==='listener'?'A note about the playlists you choose to share.':'Introduce the work you want people to notice first.'}/></label>
      {portfolioOptions.length>6&&<label className="profile-portfolio-search"><Search size={14}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search eligible showcase work…"/></label>}
      <div className="premium-role-showcase-options">
        {filtered.map((item:any)=>{
          const selected=featuredIds.includes(item.id);
          const atLimit=!selected&&featuredIds.length>=6;
          return <label key={item.id} className={selected?'selected':''}><input type="checkbox" checked={selected} disabled={atLimit} onChange={(event)=>toggleFeatured(item.id,event.target.checked)}/><span><strong>{item.title}</strong><small>{item.subtitle || (role==='listener'?'Public playlist':'Nightjar verified work')}</small></span><em>{selected?'FEATURED':role==='listener'?'PUBLIC':'VERIFIED'}</em></label>;
        })}
        {!portfolioOptions.length&&<div className="people-empty"><Sparkles size={17}/><strong>{role==='listener'?'No public playlists yet.':'No verified showcase work yet.'}</strong><span>{role==='listener'?'Create a playlist in Library, then choose whether to share it here.':'Published or credited work will appear automatically when it becomes eligible.'}</span></div>}
      </div>
    </article>
  </section>;
}
