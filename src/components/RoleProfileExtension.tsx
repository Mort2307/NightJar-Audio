import { BookOpenText, Brush, FileCheck2, Handshake, Headphones, Mic2, Search, Sparkles, UsersRound, WandSparkles, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import SearchableMultiSelect from './SearchableMultiSelect';
import {
  ARTIST_DELIVERY_OPTIONS,
  ARTIST_MEDIUM_OPTIONS,
  ARTIST_TURNAROUND_OPTIONS,
  CREATOR_DELIVERY_OPTIONS,
  CREATOR_DIRECTION_OPTIONS,
  CREATOR_TURNAROUND_OPTIONS,
  EDITOR_COLLABORATION_OPTIONS,
  EDITOR_DELIVERY_OPTIONS,
  EDITOR_PROFICIENCY_OPTIONS,
  EDITOR_PROJECT_TYPE_OPTIONS,
  EDITOR_SOFTWARE_OPTIONS,
  EDITOR_TURNAROUND_OPTIONS,
  LISTENER_COMMUNITY_OPTIONS,
  ROLE_FOCUS_OPTIONS,
  ROLE_PROFILE_CONFIG,
  WRITER_COLLABORATION_OPTIONS,
  WRITER_LENGTH_OPTIONS,
  WRITER_TURNAROUND_OPTIONS,
  type ProfileRoleKey,
} from '../data/nightjarTaxonomy';

type SupportedRole = 'listener' | 'creator' | 'writer' | 'editor' | 'artist';

type Props = {
  role: SupportedRole;
  profile: any;
  setProfile: (updater: any) => void;
  portfolioOptions: any[];
  completedCollaborations: number;
};

const roleMeta = {
  listener: {
    eyebrow:'LISTENER SIGNATURE',
    title:'Your listening identity should feel curated, not generic.',
    copy:'Build a public taste profile around what you choose to share while private listening history, favourites and playback behaviour stay private.',
    icon:Headphones,
  },
  creator: {
    eyebrow:'VA CREATOR STUDIO',
    title:'Present the performer, the voice and the recording craft.',
    copy:'A VA profile should tell collaborators what you sound like, how you take direction, how you deliver and what kind of productions you want to make.',
    icon:Mic2,
  },
  writer: {
    eyebrow:'WRITER PORTFOLIO',
    title:'Show the author without exposing the manuscript.',
    copy:'Present voice, formats, commission fit, turnaround and rights posture while drafts, private terms and protected scripts stay inside Writer Studio.',
    icon:BookOpenText,
  },
  editor: {
    eyebrow:'AUDIO EDITOR PROFILE',
    title:'Present production skill with the same confidence as the work itself.',
    copy:'Show services, tools, project fit, delivery capability and workflow without exposing private client files, manuscripts or revision notes.',
    icon:FileCheck2,
  },
  artist: {
    eyebrow:'ARTIST PORTFOLIO',
    title:'Make visual craft and commission fit obvious.',
    copy:'Show mediums, deliverables, style, turnaround and collaboration fit while private briefs, source files and deal terms remain protected.',
    icon:Brush,
  },
} as const;

export default function RoleProfileExtension({ role, profile, setProfile, portfolioOptions, completedCollaborations }: Props) {
  const [query,setQuery]=useState('');
  const config=ROLE_PROFILE_CONFIG[role as ProfileRoleKey];
  const meta=roleMeta[role];
  const Icon=meta.icon;
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

  const displayName = String(profile.displayName || (role === 'listener' ? 'Nightjar Listener' : role === 'creator' ? 'VA Creator' : role === 'writer' ? 'Writer' : role === 'editor' ? 'Audio Editor' : 'Artist'));
  const initials = profile.avatarInitials || displayName.split(/\s+/).map((part:string)=>part[0]).join('').slice(0,2).toUpperCase() || 'NJ';
  const roleName = role === 'creator' ? 'VA Creator' : role === 'writer' ? 'Writer' : role === 'editor' ? 'Audio Editor' : role === 'artist' ? 'Artist' : 'Listener';
  const turnaround = role === 'creator'
    ? profile.creatorTurnaround
    : role === 'writer'
      ? profile.writerTurnaround
      : role === 'editor'
        ? profile.editorTurnaround
        : role === 'artist'
          ? profile.artistTurnaround
          : null;
  const sharedInterestCount = [
    ...(Array.isArray(profile.roleFocus) ? profile.roleFocus : []),
    ...(Array.isArray(profile.roleSpecialties) ? profile.roleSpecialties : []),
    ...(Array.isArray(profile.roleSecondary) ? profile.roleSecondary : []),
  ].length;
  const headline = profile.roleHeadline || (role === 'listener'
    ? 'A curated corner of Nightjar.'
    : role === 'creator'
      ? 'Performance, voice and recording craft.'
      : role === 'writer'
        ? 'Writing voice, formats and collaboration.'
        : role === 'editor'
          ? 'Production craft, technical delivery and collaboration.'
          : 'Visual craft, commissions and creative collaboration.');

  const positioning=<article className={'panel premium-role-positioning premium-role-positioning-'+role}>
    <div className="premium-role-card-title"><span><Icon size={17}/></span><div><span className="mini-label">ROLE POSITIONING</span><h3>Give this role its own voice.</h3></div></div>
    <div className="premium-role-positioning-grid">
      <label>Role-specific headline<input maxLength={140} value={profile.roleHeadline ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleHeadline:event.target.value}))} placeholder={role==='listener'?'Late-night listener · Slow burns · Hidden gems':role==='creator'?'Character VA · Intimate performance · Audio drama':role==='writer'?'Dialogue-first Writer · Character-led scripts':'Atmospheric Artist · Covers · Character illustration'}/><small className="field-counter">{String(profile.roleHeadline ?? '').length}/140</small></label>
      <label>About this role<textarea maxLength={1200} value={profile.roleBio ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleBio:event.target.value}))} placeholder={role==='listener'?'What makes a great Nightjar listen for you?':role==='creator'?'Describe your performance identity and how you like to work.':role==='writer'?'Describe your writing voice, themes and collaboration style.':'Describe your visual style and the briefs you love.'}/><small className="field-counter">{String(profile.roleBio ?? '').length}/1200</small></label>
    </div>
  </article>;

  const commonSignature=<article className={'panel premium-role-extension-card premium-role-signature-'+role}>
    <span className="mini-label">ROLE SIGNATURE</span>
    <SearchableMultiSelect label={config.focusLabel} options={ROLE_FOCUS_OPTIONS[role]} values={profile.roleFocus ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleFocus:values}))}/>
    <SearchableMultiSelect label={config.specialtiesLabel} options={config.specialtiesOptions} values={profile.roleSpecialties ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSpecialties:values}))}/>
    <SearchableMultiSelect label={config.secondaryLabel} options={config.secondaryOptions} values={profile.roleSecondary ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSecondary:values}))}/>
    {config.availabilityLabel && <label>{config.availabilityLabel}<select value={profile.roleAvailability ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleAvailability:event.target.value}))}><option value="">Not specified</option>{config.availabilityOptions.map((option)=><option key={option} value={option}>{option}</option>)}</select></label>}
  </article>;

  const roleSpecific = role === 'creator'
    ? <article className="panel premium-role-extension-card premium-role-specialist-card creator">
        <div className="premium-role-card-title"><span><Mic2 size={17}/></span><div><span className="mini-label">PERFORMANCE & DELIVERY</span><h3>How you sound. How you work.</h3></div></div>
        <SearchableMultiSelect label="Languages, accents & dialects" options={[]} values={profile.creatorLanguages ?? []} onChange={(values)=>setProfile((current:any)=>({...current,creatorLanguages:values}))} allowCreate createLabel="Add language / accent"/>
        <SearchableMultiSelect label="Direction styles I work with" options={CREATOR_DIRECTION_OPTIONS} values={profile.creatorDirectionModes ?? []} onChange={(values)=>setProfile((current:any)=>({...current,creatorDirectionModes:values}))}/>
        <SearchableMultiSelect label="Delivery options" options={CREATOR_DELIVERY_OPTIONS} values={profile.creatorDeliveryFormats ?? []} onChange={(values)=>setProfile((current:any)=>({...current,creatorDeliveryFormats:values}))}/>
        <label>Typical turnaround<select value={profile.creatorTurnaround ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,creatorTurnaround:event.target.value}))}><option value="">Project dependent / not stated</option>{CREATOR_TURNAROUND_OPTIONS.map((option)=><option key={option}>{option}</option>)}</select></label>
        <label>Studio / equipment note<textarea maxLength={300} value={profile.creatorEquipment ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,creatorEquipment:event.target.value}))} placeholder="Microphone, recording space, remote direction capability or useful production notes. No private contact details."/></label>
      </article>
    : role === 'writer'
      ? <article className="panel premium-role-extension-card premium-role-specialist-card writer">
          <div className="premium-role-card-title"><span><BookOpenText size={17}/></span><div><span className="mini-label">AUTHOR & RIGHTS</span><h3>What you write and how you collaborate.</h3></div></div>
          <SearchableMultiSelect label="Typical script lengths" options={WRITER_LENGTH_OPTIONS} values={profile.writerScriptLengths ?? []} onChange={(values)=>setProfile((current:any)=>({...current,writerScriptLengths:values}))}/>
          <SearchableMultiSelect label="Collaboration fit" options={WRITER_COLLABORATION_OPTIONS} values={profile.writerCollaborationPreferences ?? []} onChange={(values)=>setProfile((current:any)=>({...current,writerCollaborationPreferences:values}))}/>
          <label>Typical turnaround<select value={profile.writerTurnaround ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,writerTurnaround:event.target.value}))}><option value="">Project dependent / not stated</option>{WRITER_TURNAROUND_OPTIONS.map((option)=><option key={option}>{option}</option>)}</select></label>
          <label>Public rights / licensing note<textarea maxLength={500} value={profile.writerRightsNote ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,writerRightsNote:event.target.value}))} placeholder="e.g. Open to licensed catalogue scripts and commissioned originals. Keep rates and private deal terms inside Nightjar."/></label>
        </article>
      : role === 'editor'
        ? <article className="panel premium-role-extension-card premium-role-specialist-card editor">
            <div className="premium-role-card-title"><span><Wrench size={17}/></span><div><span className="mini-label">SERVICES & CAPABILITY</span><h3>Production tools, project fit and delivery.</h3></div></div>
            <SearchableMultiSelect label="DAWs & production tools" options={EDITOR_SOFTWARE_OPTIONS} values={profile.editorSoftware ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorSoftware:values}))}/>
            <SearchableMultiSelect label="Project types I want to edit" options={EDITOR_PROJECT_TYPE_OPTIONS} values={profile.editorProjectTypes ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorProjectTypes:values}))}/>
            <SearchableMultiSelect label="Delivery capabilities" options={EDITOR_DELIVERY_OPTIONS} values={profile.editorDeliveryFormats ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorDeliveryFormats:values}))}/>
            <SearchableMultiSelect label="Best collaboration fit" options={EDITOR_COLLABORATION_OPTIONS} values={profile.editorCollaborationPreferences ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorCollaborationPreferences:values}))}/>
            <label>Typical turnaround<select value={profile.editorTurnaround ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,editorTurnaround:event.target.value}))}><option value="">Project dependent / not stated</option>{EDITOR_TURNAROUND_OPTIONS.map((option)=><option key={option}>{option}</option>)}</select></label>
            <label>Years actively editing<input type="number" min="0" max="60" inputMode="numeric" value={profile.editorExperienceYears ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,editorExperienceYears:event.target.value === '' ? '' : Math.min(60,Math.max(0,Number(event.target.value)))}))}/></label>
            {Array.isArray(profile.roleSpecialties) && profile.roleSpecialties.length > 0 && <div className="editor-skill-matrix-editor"><span className="mini-label">SKILL MATRIX</span><div className="editor-skill-matrix-list">{(Array.isArray(profile.roleSpecialties) ? profile.roleSpecialties : []).map((skill:string)=><label key={skill}><span>{skill}</span><select value={profile.editorSkillLevels?.[skill] ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,editorSkillLevels:{...(current.editorSkillLevels??{}),[skill]:event.target.value}}))}><option value="">Not stated</option>{EDITOR_PROFICIENCY_OPTIONS.map((level)=><option key={level} value={level}>{level}</option>)}</select></label>)}</div></div>}
          </article>
      : role === 'artist'
        ? <article className="panel premium-role-extension-card premium-role-specialist-card artist">
            <div className="premium-role-card-title"><span><WandSparkles size={17}/></span><div><span className="mini-label">VISUAL PRACTICE</span><h3>Medium, deliverables and commission fit.</h3></div></div>
            <SearchableMultiSelect label="Mediums & disciplines" options={ARTIST_MEDIUM_OPTIONS} values={profile.artistMediums ?? []} onChange={(values)=>setProfile((current:any)=>({...current,artistMediums:values}))}/>
            <SearchableMultiSelect label="Deliverables" options={ARTIST_DELIVERY_OPTIONS} values={profile.artistDeliveryFormats ?? []} onChange={(values)=>setProfile((current:any)=>({...current,artistDeliveryFormats:values}))}/>
            <SearchableMultiSelect label="Tools / software" options={[]} values={profile.artistSoftware ?? []} onChange={(values)=>setProfile((current:any)=>({...current,artistSoftware:values}))} allowCreate createLabel="Add tool / software"/>
            <label>Typical turnaround<select value={profile.artistTurnaround ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,artistTurnaround:event.target.value}))}><option value="">Project dependent / not stated</option>{ARTIST_TURNAROUND_OPTIONS.map((option)=><option key={option}>{option}</option>)}</select></label>
          </article>
        : <article className="panel premium-role-extension-card premium-role-specialist-card listener">
            <div className="premium-role-card-title"><span><UsersRound size={17}/></span><div><span className="mini-label">COMMUNITY STYLE</span><h3>How you like to exist in Nightjar.</h3></div></div>
            <SearchableMultiSelect label="Community style" options={LISTENER_COMMUNITY_OPTIONS} values={profile.listenerCommunityStyle ?? []} onChange={(values)=>setProfile((current:any)=>({...current,listenerCommunityStyle:values}))}/>
            <div className="premium-listener-privacy-card"><Headphones size={17}/><div><strong>Private listening stays private.</strong><span>Your actual listening history, favourites, completion behaviour and private library are never turned into public profile content. Only what you deliberately select here is public.</span></div></div>
          </article>;

  return <section className={'premium-role-extension premium-role-extension-'+role}>
    <div className="premium-role-extension-head">
      <div><span className="mini-label">{meta.eyebrow}</span><h2>{meta.title}</h2><p>{meta.copy}</p></div>
      <Icon size={22}/>
    </div>

    <section className={'role-profile-hero role-profile-hero-'+role}>
      <div className="role-profile-hero-main">
        <span className="role-profile-hero-avatar" data-tone={profile.avatarTone || 'plum'}>
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" loading="lazy" decoding="async"/> : initials}
        </span>
        <div className="role-profile-hero-copy">
          <span className="mini-label">{role === 'listener' ? 'PREMIUM MEMBER PROFILE' : 'PROFESSIONAL PROFILE'}</span>
          <h3>{displayName}</h3>
          <p>{headline}</p>
          <div className="role-profile-hero-status">
            <span>{roleName}</span>
            {role !== 'listener' && <span>{profile.roleAvailability || 'Availability not set'}</span>}
          </div>
        </div>
        <Icon size={21}/>
      </div>
      <div className="role-profile-hero-metrics">
        {role === 'listener' ? <>
          <div><span>Shared interests</span><strong>{sharedInterestCount}</strong><small>Chosen profile signals</small></div>
          <div><span>Featured playlists</span><strong>{featuredIds.length}</strong><small>Deliberately public</small></div>
          <div><span>Community style</span><strong>{(profile.listenerCommunityStyle ?? []).length}</strong><small>Selected preferences</small></div>
          <div><span>Privacy</span><strong>Private</strong><small>Listening history stays private</small></div>
        </> : <>
          <div><span>Verified showcase</span><strong>{portfolioOptions.length}</strong><small>Eligible Nightjar work</small></div>
          <div><span>Collaborations</span><strong>{completedCollaborations}</strong><small>Platform-recorded</small></div>
          <div><span>Specialties</span><strong>{(profile.roleSpecialties ?? []).length}</strong><small>Public capability</small></div>
          <div><span>Turnaround</span><strong>{turnaround || '—'}</strong><small>Typical estimate</small></div>
        </>}
      </div>
    </section>

    {positioning}

    <div className="premium-role-extension-grid premium-role-bespoke-grid">
      {commonSignature}
      {roleSpecific}
    </div>

    <article className="panel premium-role-extension-card premium-role-story-card">
      <span className="mini-label">{role==='listener'?'YOUR NIGHTJAR NOTE':role==='creator'?'PERFORMANCE NOTES':role==='writer'?'WRITING & COLLABORATION':role==='editor'?'WORKFLOW & COLLABORATION':'STYLE & COMMISSION NOTES'}</span>
      <div className="premium-role-story-grid">
        <label>{config.detailOneLabel}<textarea maxLength={600} value={profile.roleDetailOne ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailOne:event.target.value}))} placeholder={config.detailOnePlaceholder}/></label>
        <label>{config.detailTwoLabel}<textarea maxLength={600} value={profile.roleDetailTwo ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailTwo:event.target.value}))} placeholder={config.detailTwoPlaceholder}/></label>
      </div>
      {role !== 'listener' && <div className="premium-role-proof"><Handshake size={16}/><span><strong>{completedCollaborations} completed collaboration{completedCollaborations===1?'':'s'}</strong><small>Platform-recorded collaboration history · not a self-entered claim</small></span></div>}
    </article>

    <article className={'panel premium-role-showcase premium-role-showcase-'+role}>
      <div className="premium-role-showcase-head">
        <div><span className="mini-label">{role === 'listener' ? 'PUBLIC PLAYLISTS' : 'VERIFIED SHOWCASE'}</span><h3>{role === 'listener' ? 'The playlists you choose to put your name on.' : role==='creator'?'Lead with the performances that represent you.':role==='writer'?'Lead with produced writing credits.':role==='editor'?'Lead with credited production work.':'Lead with the visual work that represents you.'}</h3><p>{role === 'listener' ? 'Share a few favourites without making your listening history public.' : 'Feature up to six eligible Nightjar items. Verified work stays visually separate from self-description.'}</p></div>
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
        {!portfolioOptions.length&&<div className="people-empty"><Sparkles size={17}/><strong>{role==='listener'?'No public playlists yet.':'No eligible verified showcase work yet.'}</strong><span>{role==='listener'?'Create a playlist in Library, then choose whether to share it here.':'Eligible Nightjar work will appear automatically as releases, credits or portfolio items are approved.'}</span></div>}
      </div>
    </article>
  </section>;
}
