import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Clock3,
  FileCheck2,
  Handshake,
  Headphones,
  MessageCircle,
  Scissors,
  ShieldCheck,
  Sparkles,
  Wrench,
} from 'lucide-react';
import SearchableMultiSelect from './SearchableMultiSelect';
import CollaborationHub from './CollaborationHub';
import RoleDashboard, { type RoleDashboardAction } from './RoleDashboard';
import EditorShowcaseManager from './EditorShowcaseManager';
import { scrollNightjarToTop } from '../platform/scroll-navigation';
import {
  EDITOR_COLLABORATION_OPTIONS,
  EDITOR_DELIVERY_OPTIONS,
  EDITOR_PROFICIENCY_OPTIONS,
  EDITOR_PROJECT_TYPE_OPTIONS,
  EDITOR_SOFTWARE_OPTIONS,
  EDITOR_TURNAROUND_OPTIONS,
  ROLE_PROFILE_CONFIG,
} from '../data/nightjarTaxonomy';

type EditorStudioTab = 'overview' | 'profile' | 'portfolio' | 'projects' | 'collaborations';

type Props = {
  profile: any;
  setProfile: (updater: any) => void;
  profileLoading: boolean;
  profileDirty: boolean;
  profileBaseline: any | null;
  onSaveProfile: () => Promise<void>;
  onRevertProfile: () => void;
  profilePortfolioOptions: any[];
  completedCollaborations: number;
  editorQueue: any[];
  editorSelected: any | null;
  setEditorSelected: (value: any | null) => void;
  onReviewScript: (status: string) => Promise<void>;
  accountStatus: 'active' | 'pending_review';
  messageUnreadCount: number;
  messageNeedsReplyCount: number;
  messageAwaitingReplyCount: number;
  actions: RoleDashboardAction[];
  demoMode: boolean;
  simulationMode: boolean;
  demoSessionKey: number;
  notify: (message: string) => void;
  onOpenMessages: () => void;
  onMessageUser: (userId: string, collaborationId?: string | null) => void;
};

const tabLabel: Record<EditorStudioTab, string> = {
  overview: 'Overview',
  profile: 'Professional Profile',
  portfolio: 'Portfolio & Credits',
  projects: 'Projects',
  collaborations: 'Collaborations',
};

export default function EditorStudio({
  profile,
  setProfile,
  profileLoading,
  profileDirty,
  profileBaseline,
  onSaveProfile,
  onRevertProfile,
  profilePortfolioOptions,
  completedCollaborations,
  editorQueue,
  editorSelected,
  setEditorSelected,
  onReviewScript,
  accountStatus,
  messageUnreadCount,
  messageNeedsReplyCount,
  messageAwaitingReplyCount,
  actions,
  demoMode,
  simulationMode,
  demoSessionKey,
  notify,
  onOpenMessages,
  onMessageUser,
}: Props) {
  const [tab, setTab] = useState<EditorStudioTab>('overview');
  const [portfolioQuery, setPortfolioQuery] = useState('');
  const roleConfig = ROLE_PROFILE_CONFIG.editor;
  const selectedFeaturedIds: string[] = Array.isArray(profile.featuredPortfolioIds) ? profile.featuredPortfolioIds : [];
  const filteredPortfolioOptions = useMemo(() => {
    const query = portfolioQuery.trim().toLowerCase();
    if (!query) return profilePortfolioOptions;
    return profilePortfolioOptions.filter((item: any) =>
      [item.title, item.subtitle, item.type].filter(Boolean).join(' ').toLowerCase().includes(query),
    );
  }, [portfolioQuery, profilePortfolioOptions]);

  const specialistSkills = Object.values(profile.editorSkillLevels ?? {}).filter((level) => level === 'Specialist').length;
  const verifiedCredits = profilePortfolioOptions.length;
  const displayName = profile.displayName || 'Audio Editor';
  const professionalHeadline = profile.roleHeadline || 'Audio editing · dialogue · production polish';
  const professionalBio = profile.roleBio || '';
  const availability = profile.roleAvailability || 'Availability not set';

  const selectTab = (next: EditorStudioTab) => {
    setTab(next);
    scrollNightjarToTop();
  };

  const toggleFeatured = (id: string, checked: boolean) => {
    setProfile((current: any) => {
      const ids = Array.isArray(current.featuredPortfolioIds) ? current.featuredPortfolioIds : [];
      return {
        ...current,
        featuredPortfolioIds: checked ? [...ids, id].slice(0, 6) : ids.filter((value: string) => value !== id),
      };
    });
  };

  const moveFeatured = (id: string, direction: -1 | 1) => {
    setProfile((current: any) => {
      const ids = [...(current.featuredPortfolioIds ?? [])];
      const index = ids.indexOf(id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= ids.length) return current;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return { ...current, featuredPortfolioIds: ids };
    });
  };

  const saveBar = <div className="editor-studio-savebar">
    <div>
      <strong>{profileDirty ? 'Professional profile has unsaved changes.' : 'Professional profile is up to date.'}</strong>
      <span>{profileDirty ? 'Save when you are happy with the public-facing Editor details.' : 'Your current Editor profile is saved.'}</span>
    </div>
    <div>
      {profileDirty && profileBaseline && <button type="button" className="ghost-button" onClick={onRevertProfile} disabled={profileLoading}>Revert</button>}
      <button type="button" className="primary-button" onClick={() => void onSaveProfile()} disabled={profileLoading || !profileDirty}>
        <Check size={14}/>{profileLoading ? 'Saving…' : profileDirty ? 'Save Editor profile' : 'Saved'}
      </button>
    </div>
  </div>;

  return <section className="page-wrap editor-studio-page">
    <div className="editor-studio-hero">
      <div className="editor-studio-identity">
        <span className="editor-studio-avatar">
          {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" loading="lazy" decoding="async"/> : profile.avatarInitials || displayName.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <span className="eyebrow"><Scissors size={14}/> AUDIO EDITOR STUDIO</span>
          <h1>{displayName}</h1>
          <p className="editor-studio-headline">{professionalHeadline}</p>
          <div className="editor-studio-status-row">
            <span className="status-pill">{availability}</span>
            {accountStatus === 'pending_review' && <span className="status-pill muted">Professional access pending review</span>}
          </div>
        </div>
      </div>
      <div className="editor-studio-hero-actions">
        <button className="secondary-button" onClick={() => selectTab('profile')}><Wrench size={14}/> Edit professional profile</button>
        <button className="secondary-button" onClick={onOpenMessages}><MessageCircle size={14}/> Messages{messageUnreadCount > 0 ? ' · ' + messageUnreadCount : ''}</button>
      </div>
    </div>

    <div className="editor-studio-metrics">
      <button type="button" onClick={() => selectTab('portfolio')} aria-label="Open Editor portfolio and verified credits"><span>Verified credits</span><strong>{verifiedCredits}</strong><small>Nightjar release credits</small><ArrowRight size={14} aria-hidden="true"/></button>
      <button type="button" onClick={() => selectTab('collaborations')} aria-label="Open Editor collaborations"><span>Collaborations</span><strong>{completedCollaborations}</strong><small>Completed on Nightjar</small><ArrowRight size={14} aria-hidden="true"/></button>
      <button type="button" onClick={() => selectTab('profile')} aria-label="Open professional profile and specialist skills"><span>Specialist skills</span><strong>{specialistSkills}</strong><small>Self-described</small><ArrowRight size={14} aria-hidden="true"/></button>
      <button type="button" onClick={() => selectTab('profile')} aria-label="Open professional profile and turnaround settings"><span>Turnaround</span><strong>{profile.editorTurnaround || '—'}</strong><small>Typical estimate</small><ArrowRight size={14} aria-hidden="true"/></button>
    </div>

    <nav className="editor-studio-tabs" aria-label="Editor Studio sections">
      {(Object.keys(tabLabel) as EditorStudioTab[]).map((item) =>
        <button key={item} className={tab === item ? 'active' : ''} onClick={() => selectTab(item)}>{tabLabel[item]}</button>
      )}
    </nav>

    <div id="editor-studio-content" className="editor-studio-content">
      {tab === 'overview' && <>
        {accountStatus === 'pending_review' && <div className="admin-note"><Sparkles size={17}/><div><strong>AUDIO EDITOR / PENDING REVIEW</strong><span>Your professional profile can be completed now. Assigned projects, private professional messaging and collaboration tools unlock after approval.</span></div></div>}
        <RoleDashboard
          eyebrow="EDITOR COMMAND CENTRE"
          title="Your production work, profile and opportunities."
          description="Editor Studio keeps your public professional identity and private assigned work in the same role workspace without exposing client material."
          metrics={[
            {label:'Assigned',value:editorQueue.length,detail:'Current project queue',destination:'Editor projects',onClick:()=>selectTab('projects')},
            {label:'In review',value:editorQueue.filter((item:any)=>String(item.status).toLowerCase().includes('review')).length,detail:'Active decisions',destination:'Editor projects',onClick:()=>selectTab('projects')},
            {label:'Collaborations',value:completedCollaborations,detail:'Completed on Nightjar',destination:'Editor collaborations',onClick:()=>selectTab('collaborations')},
            {label:'Messages',value:messageUnreadCount,detail:messageNeedsReplyCount ? messageNeedsReplyCount + ' need your reply' : messageAwaitingReplyCount ? messageAwaitingReplyCount + ' awaiting reply' : 'Unread private threads',destination:'professional messages',onClick:onOpenMessages},
          ]}
          actions={actions}
        />

        <div className="editor-studio-overview-grid">
          <article className="panel editor-studio-summary-card">
            <span className="mini-label">PROFESSIONAL SNAPSHOT</span>
            <h2>{professionalHeadline}</h2>
            <p>{professionalBio || 'Add a professional Editor introduction so VAs and Writers immediately understand what you do and how you work.'}</p>
            <div className="creator-profile-tags">
              {(profile.roleSpecialties ?? []).slice(0, 8).map((item: string) => <span key={item}>{item}</span>)}
            </div>
            <button className="ghost-button" onClick={() => selectTab('profile')}>Strengthen profile <ArrowRight size={13}/></button>
          </article>

          <article className="panel editor-studio-summary-card">
            <span className="mini-label">CURRENT WORK</span>
            <h2>{editorQueue.length ? editorQueue.length + ' active assignment' + (editorQueue.length === 1 ? '' : 's') : 'Queue clear'}</h2>
            <p>{editorQueue.length ? 'Assigned manuscripts are waiting in your controlled project workspace.' : 'New assigned work will appear here without exposing unassigned manuscripts.'}</p>
            <button className="ghost-button" onClick={() => selectTab('projects')}>Open projects <ArrowRight size={13}/></button>
          </article>

          <article className="panel editor-studio-summary-card">
            <span className="mini-label">PUBLIC CREDIBILITY</span>
            <h2>{verifiedCredits} verified release credit{verifiedCredits === 1 ? '' : 's'}</h2>
            <p>Verified credits come from published Nightjar releases rather than self-entered claims.</p>
            <button className="ghost-button" onClick={() => selectTab('portfolio')}>Curate portfolio <ArrowRight size={13}/></button>
          </article>
        </div>

        <section className="editor-studio-services-preview">
          <div className="section-head"><div><span className="mini-label">SERVICES</span><h2>What you can help with</h2></div><Wrench size={17}/></div>
          {(profile.roleSpecialties ?? []).length ? <div className="editor-service-grid">{(profile.roleSpecialties ?? []).map((skill: string) =>
            <article key={skill}><strong>{skill}</strong><span>{profile.editorSkillLevels?.[skill] || 'Available'}</span></article>
          )}</div> : <div className="people-empty"><Wrench size={17}/><strong>No editing services selected yet.</strong><span>Add services in Professional Profile so collaborators can find you for the right work.</span></div>}
        </section>
      </>}

      {tab === 'profile' && <>
        <div className="editor-studio-section-heading">
          <div><span className="mini-label">PUBLIC PROFESSIONAL IDENTITY</span><h2>Present yourself as an Editor.</h2><p>Your personal name, handle, avatar and pronouns live in User Profile. Everything below belongs specifically to your Audio Editor role.</p></div>
          <ShieldCheck size={20}/>
        </div>

        <div className="editor-profile-form-grid">
          <article className="panel editor-profile-form-card editor-profile-form-card-wide">
            <span className="mini-label">POSITIONING</span>
            <label>Professional headline<input maxLength={140} value={profile.roleHeadline ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleHeadline:event.target.value}))} placeholder="e.g. Dialogue Editor · Restoration · Immersive Audio"/><small className="field-counter">{String(profile.roleHeadline ?? '').length}/140</small></label>
            <label>About your editing<textarea maxLength={1200} value={profile.roleBio ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleBio:event.target.value}))} placeholder="Describe your editing approach, the work you enjoy and what collaborators can expect."/><small className="field-counter">{String(profile.roleBio ?? '').length}/1200</small></label>
            <div className="editor-professional-grid">
              <label>Booking availability<select value={profile.roleAvailability ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleAvailability:event.target.value}))}><option value="">Not specified</option>{roleConfig.availabilityOptions.map((option)=><option key={option} value={option}>{option}</option>)}</select></label>
              <label>Typical turnaround<select value={profile.editorTurnaround ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,editorTurnaround:event.target.value}))}><option value="">Project dependent / not specified</option>{EDITOR_TURNAROUND_OPTIONS.map((option)=><option value={option} key={option}>{option}</option>)}</select></label>
              <label>Years actively editing<input type="number" min="0" max="60" inputMode="numeric" value={profile.editorExperienceYears ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,editorExperienceYears:event.target.value === '' ? '' : Math.min(60,Math.max(0,Number(event.target.value)))}))} placeholder="e.g. 6"/></label>
            </div>
          </article>

          <article className="panel editor-profile-form-card editor-profile-form-card-wide">
            <span className="mini-label">SERVICES & CAPABILITY</span>
            <SearchableMultiSelect label={roleConfig.specialtiesLabel} options={roleConfig.specialtiesOptions} values={profile.roleSpecialties ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSpecialties:values}))}/>
            <SearchableMultiSelect label={roleConfig.secondaryLabel} options={roleConfig.secondaryOptions} values={profile.roleSecondary ?? []} onChange={(values)=>setProfile((current:any)=>({...current,roleSecondary:values}))}/>
            <SearchableMultiSelect label="DAWs & production tools" options={EDITOR_SOFTWARE_OPTIONS} values={profile.editorSoftware ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorSoftware:values}))}/>
            <SearchableMultiSelect label="Project types I want to edit" options={EDITOR_PROJECT_TYPE_OPTIONS} values={profile.editorProjectTypes ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorProjectTypes:values}))}/>
            <SearchableMultiSelect label="Delivery capabilities" options={EDITOR_DELIVERY_OPTIONS} values={profile.editorDeliveryFormats ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorDeliveryFormats:values}))}/>
            <SearchableMultiSelect label="Best collaboration fit" options={EDITOR_COLLABORATION_OPTIONS} values={profile.editorCollaborationPreferences ?? []} onChange={(values)=>setProfile((current:any)=>({...current,editorCollaborationPreferences:values}))}/>
          </article>

          <article className="panel editor-profile-form-card">
            <span className="mini-label">WORKFLOW</span>
            <label>{roleConfig.detailOneLabel}<textarea maxLength={600} value={profile.roleDetailOne ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailOne:event.target.value}))} placeholder={roleConfig.detailOnePlaceholder}/></label>
            <label>{roleConfig.detailTwoLabel}<textarea maxLength={600} value={profile.roleDetailTwo ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,roleDetailTwo:event.target.value}))} placeholder={roleConfig.detailTwoPlaceholder}/></label>
          </article>

          <article className="panel editor-profile-form-card">
            <span className="mini-label">SKILL MATRIX</span>
            <h3>Self-described proficiency</h3>
            <p className="panel-note">This is deliberately separate from Nightjar Verified Credits. It tells collaborators where you feel strongest without pretending Nightjar has independently certified a score.</p>
            {(profile.roleSpecialties ?? []).length ? <div className="editor-skill-matrix-list">{(profile.roleSpecialties ?? []).map((skill:string)=><label key={skill}><span>{skill}</span><select value={profile.editorSkillLevels?.[skill] ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,editorSkillLevels:{...(current.editorSkillLevels??{}),[skill]:event.target.value}}))}><option value="">Not stated</option>{EDITOR_PROFICIENCY_OPTIONS.map((level)=><option key={level} value={level}>{level}</option>)}</select></label>)}</div> : <div className="people-empty"><strong>Choose services first.</strong><span>Your selected editing services become the rows in this matrix.</span></div>}
          </article>
        </div>
        {saveBar}
      </>}

      {tab === 'portfolio' && <>
        <div className="editor-studio-section-heading">
          <div><span className="mini-label">PORTFOLIO & CREDITS</span><h2>Let the work prove the skill.</h2><p>Feature up to six verified Nightjar credits. Self-entered external claims remain visually separate from platform-verified work.</p></div>
          <Headphones size={20}/>
        </div>

        <article className="panel editor-portfolio-curator">
          <label>Portfolio introduction<textarea maxLength={400} value={profile.portfolioNote ?? ''} onChange={(event)=>setProfile((current:any)=>({...current,portfolioNote:event.target.value}))} placeholder="A short introduction to the work you want collaborators to notice first."/></label>
          {profilePortfolioOptions.length > 6 && <label className="profile-portfolio-search"><input value={portfolioQuery} onChange={(event)=>setPortfolioQuery(event.target.value)} placeholder="Search verified credits…"/></label>}
          <div className="editor-credit-picker">
            {filteredPortfolioOptions.map((item:any)=>{
              const selected = selectedFeaturedIds.includes(item.id);
              const atLimit = !selected && selectedFeaturedIds.length >= 6;
              return <label key={item.id} className={selected ? 'editor-credit-option selected' : 'editor-credit-option'}>
                <input type="checkbox" checked={selected} disabled={atLimit} onChange={(event)=>toggleFeatured(item.id,event.target.checked)}/>
                <span><strong>{item.title}</strong><small>{item.subtitle || 'Nightjar verified credit'}</small></span>
                <em>{selected ? 'FEATURED' : 'VERIFIED'}</em>
              </label>;
            })}
            {!profilePortfolioOptions.length && <div className="people-empty"><FileCheck2 size={17}/><strong>No verified Editor credits yet.</strong><span>Published releases that credit this account as an Editor will appear here automatically.</span></div>}
          </div>

          {!!selectedFeaturedIds.length && <div className="editor-featured-order">
            <span className="mini-label">FEATURED ORDER</span>
            {selectedFeaturedIds.map((id,index)=>{
              const item=profilePortfolioOptions.find((option:any)=>option.id===id);
              if(!item) return null;
              return <div key={id}><span>{index+1}</span><div><strong>{item.title}</strong><small>{item.subtitle}</small></div><div><button className="ghost-button" disabled={index===0} onClick={()=>moveFeatured(id,-1)}>Up</button><button className="ghost-button" disabled={index===selectedFeaturedIds.length-1} onClick={()=>moveFeatured(id,1)}>Down</button><button className="ghost-button" onClick={()=>toggleFeatured(id,false)}>Remove</button></div></div>;
            })}
          </div>}
        </article>

        <EditorShowcaseManager notify={notify} demoMode={demoMode} />
        {saveBar}
      </>}

      {tab === 'projects' && <>
        <div className="editor-studio-section-heading">
          <div><span className="mini-label">PRIVATE PROJECT WORKSPACE</span><h2>Assigned production work.</h2><p>Only work explicitly assigned to this Editor account appears here. Public profile visitors never see this queue.</p></div>
          <FileCheck2 size={20}/>
        </div>
        <div className="editor-queue-grid editorial-queue">
          {editorQueue.map((script:any)=><button key={script.id} className={editorSelected?.id===script.id?'editor-queue-card active':'editor-queue-card'} onClick={()=>setEditorSelected(script)}>
            <div className="editor-status-line"><span>{script.status ?? 'Submitted'}</span><strong>v{script.version ?? 1}</strong></div>
            <h2>{script.title}</h2>
            <p>{script.lastEditorialComment || 'No editorial note recorded yet.'}</p>
          </button>)}
        </div>
        {!editorQueue.length && <div className="people-empty"><FileCheck2 size={18}/><strong>No assigned projects.</strong><span>New work appears here only after controlled assignment.</span></div>}
        {editorSelected && <article className="panel-card editorial-review-panel">
          <div className="panel-title"><div><span className="mini-label">CURRENT REVIEW</span><h2>{editorSelected.title}</h2></div><span className="status-pill">{editorSelected.status}</span></div>
          <p className="panel-note">{editorSelected.lastEditorialComment || 'No previous editorial note.'}</p>
          <div className="script-card-actions">
            <button className="secondary-button" onClick={()=>void onReviewScript('Under review')}>Mark under review</button>
            <button className="secondary-button" onClick={()=>void onReviewScript('Revision requested')}>Request revision</button>
            <button className="primary-button" onClick={()=>void onReviewScript('Approved')}>Approve</button>
            <button className="ghost-button" onClick={()=>void onReviewScript('Rejected')}>Reject</button>
          </div>
        </article>}
        <div className="protection-banner"><ShieldCheck size={18}/><div><strong>PRIVATE BY DEFAULT</strong><span>Assigned files, editorial notes and client material stay inside the controlled production workspace. Public Editor profiles expose capability and credits, not client files.</span></div></div>
      </>}

      {tab === 'collaborations' && <>
        <div className="editor-studio-section-heading">
          <div><span className="mini-label">COLLABORATION NETWORK</span><h2>Work with VAs and Writers.</h2><p>Requests, proposals and completed collaborations stay attached to the professional role rather than cluttering the personal user profile.</p></div>
          <Handshake size={20}/>
        </div>
        {accountStatus !== 'pending_review'
          ? <CollaborationHub key={'editor-studio-collab-' + demoSessionKey} role="editor" notify={notify} demoMode={demoMode} simulationMode={simulationMode} onMessageUser={onMessageUser}/>
          : <div className="people-empty"><Clock3 size={18}/><strong>Collaboration access is pending.</strong><span>You can finish your professional profile while the Audio Editor application is reviewed.</span></div>}
      </>}
    </div>
  </section>;
}
