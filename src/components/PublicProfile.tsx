import { useEffect, useRef, useState } from 'react';
import { Bird, BookOpenText, Brush, ChevronDown, FileCheck2, Headphones, Heart, ImagePlus, ListMusic, MessageCircle, Mic2, Moon, Share2, ShieldCheck, Sparkles, ThumbsUp, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
import { demoDirectory, demoTracks, demoWriterScripts } from '../demo/nightjarDemo';
import { ROLE_PROFILE_CONFIG, type ProfileRoleKey } from '../data/nightjarTaxonomy';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import { nightjarReferrals } from '../platform/firebase-referrals';
import { publicProfileUrl, shareNightjarProfile, type ShareableProfileRole } from '../platform/public-profile-share';
import NightjarGiftPanel from './NightjarGiftPanel';
import NightjarFinancePreview from './NightjarFinancePreview';
import { MEMBER_PAYMENT_FEATURES_ENABLED } from '../platform/nightjar-financial-visibility';
import PublicEditorShowcase from './PublicEditorShowcase';
import PublicWriterPortfolio from './PublicWriterPortfolio';
import { SocialLinksDisplay } from './SocialLinksEditor';
import FramedApprovedImage from './FramedApprovedImage';
import CollaborationHistoryButton from './CollaborationHistoryButton';
import { VoiceCallingCardPublic } from './VoiceCallingCard';
import './public-profile-premium.css';

type Props = {
  userId: string;
  followingIds: string[];
  onToggleFollow: (userId: string) => Promise<void>;
  onOpenConnections: (userId:string,kind:'followers'|'following',displayName:string)=>void;
  onClose: () => void;
  notify: (message: string) => void;
  canMessage?: boolean;
  onMessage?: (userId: string) => void;
  onCommunityRelease?: (release: any) => void;
  canReact?: boolean;
  reactionByRelease?: Record<string, 'like'|'love'>;
  onReaction?: (releaseId:string, reaction:'like'|'love') => void;
  communityByRelease?: Record<string,{likes:number;loves:number;comments:number}>;
  demoMode?: boolean;
  initialRole?: string;
  readOnlyPreview?: boolean;
  focusArtworkId?: string | null;
};

const roleLabel = (role: string | null | undefined) => {
  if (role === 'editor') return 'Audio Editor';
  if (role === 'writer') return 'Writer';
  if (role === 'creator') return 'VA Creator';
  if (role === 'artist') return 'Artist';
  return 'Listener';
};

export default function PublicProfile({ userId, followingIds, onToggleFollow, onOpenConnections, onClose, notify, canMessage = false, onMessage, onCommunityRelease, canReact = false, reactionByRelease = {}, onReaction, communityByRelease = {}, demoMode = false, initialRole = '', readOnlyPreview = false, focusArtworkId:focusArtworkIdProp=null }: Props) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [giftOpen, setGiftOpen] = useState(false);
  const [selectedProfileRole, setSelectedProfileRole] = useState<string | null>(initialRole);
  const focusArtworkId = focusArtworkIdProp ?? new URLSearchParams(window.location.search).get('artwork');

  useDialogFocusTrap(dialogRef, { onEscape: onClose });
  useEffect(()=>{
    const old=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.scrollTo({top:0,behavior:'auto'});
    return ()=>{document.body.style.overflow=old;};
  },[userId]);
  const goToSection=(id:string)=>{
    const root=dialogRef.current,target=root?.querySelector<HTMLElement>('#'+id);
    if(!root||!target)return;
    const y=target.getBoundingClientRect().top-root.getBoundingClientRect().top+root.scrollTop-72;
    root.scrollTo({top:Math.max(0,y),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  useEffect(() => {
    // Direct-open public profiles must start at the TOP, not at the
    // background page's previous scroll position.
    dialogRef.current?.scrollTo({ top:0, behavior:'instant' });
    dialogRef.current?.focus({ preventScroll:true });
  }, [userId, initialRole]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    if (demoMode) {
      const person = demoDirectory.find((item) => item.userId === userId);
      const creditedReleases = demoTracks.filter((release:any) => (release.contributors ?? []).some((credit:any) => credit.userId === userId));
      const writer = demoWriterScripts.find((script:any) => script.id && userId === 'demo-writer-mara');
      setProfile(person ? {
        userId:person.userId, displayName:person.name, handle:String(person.name).toLowerCase().replace(/[^a-z0-9]+/g,''),
        role:person.role, initials:person.name.split(' ').map((part:string)=>part[0]).join('').slice(0,2),
        headline:person.role === 'writer' ? 'Character-led Writer with protected licensing controls.' : person.role === 'editor' ? 'Audio Editor focused on dialogue, mixing and production polish.' : 'Nightjar creative profile.',
        bio:'Fictional Nightjar demo profile used for Simulation Mode.', welcomeMessage:'Thanks for exploring this Nightjar demo profile.',
        publicProfile:true, followerCount:person.role === 'writer' ? 486 : 352,
        publishedWorkCount:writer ? 3 : 0, creditedReleaseCount:creditedReleases.length, creditedReleases,
        roleFocus:person.role === 'writer' ? ['Script writing','Dialogue writing'] : person.role === 'editor' ? ['Audio editing','Mixing'] : person.role === 'artist' ? ['Illustration','Cover artwork','Character art'] : person.role === 'creator' ? ['Voice performance','Narration','Audio production'] : ['Discovery','Supporting creators'],
        roleSpecialties:person.role === 'writer' ? ['Dialogue','Character development'] : person.role === 'editor' ? ['Dialogue editing','Noise cleanup / restoration','Breath / mouth-click cleanup','Mixing','Mastering','Binaural / spatial production'] : person.role === 'artist' ? ['Cover artwork','Character illustration','Digital painting'] : person.role === 'creator' ? ['Character roleplay','Narration','Dramatic performance'] : ['Late-night','Story-first','Atmospheric'],
        roleSecondary:person.role === 'writer' ? ['Single-voice script','Series / episodic'] : person.role === 'editor' ? ['Series consistency','Remote handoff','Detailed notes','Room-tone repair','Broadcast-ready delivery'] : person.role === 'artist' ? ['Atmospheric artwork','Dark / moody artwork','Long-form collaboration'] : person.role === 'creator' ? ['Close-mic performance','Series work','Remote collaboration'] : ['Hidden gems','Series'],
        roleAvailability:person.role === 'writer' ? 'Open to commissions' : person.role === 'editor' ? 'Open for bookings' : person.role === 'artist' ? 'Open for commissions' : person.role === 'creator' ? 'Open to collaborations' : '',
        roleHeadline:person.role === 'writer' ? 'Dialogue-first Writer · Character development · Collaborative scripts' : person.role === 'editor' ? 'Dialogue Editor · Restoration · Immersive Audio' : person.role === 'artist' ? 'Atmospheric Artist · Covers · Character illustration' : person.role === 'creator' ? 'Cinematic VA · Character-led performance · Intimate delivery' : 'Late-night listener · Story-first · Atmospheric',
        roleBio:person.role === 'writer' ? 'Character-led scripts with strong dialogue, clear emotional progression and room for performer interpretation.' : person.role === 'editor' ? 'Dialogue-first post-production with a clean, natural finish and careful restoration work.' : person.role === 'artist' ? 'Painterly visual storytelling for covers, character work and atmospheric promotional artwork.' : person.role === 'creator' ? 'Character-led voice performance with intimate delivery, cinematic pacing and collaborative production instincts.' : 'Long-form character stories, atmosphere, slow builds and independent creators are what make Nightjar feel like home.',
        roleDetailOne:person.role === 'writer' ? 'Dialogue-first work with strong character progression.' : person.role === 'editor' ? 'Organised remote handoff with labelled revisions, timestamped notes and non-destructive project delivery.' : person.role === 'artist' ? 'Painterly digital illustration with cinematic lighting and strong character silhouettes.' : person.role === 'creator' ? 'Character-led performance with restrained, intimate delivery and cinematic pacing.' : 'Late-night stories, atmosphere and independent creators.',
        roleDetailTwo:person.role === 'writer' ? 'Collaboration and licensing stay inside protected Nightjar workflows.' : person.role === 'editor' ? 'Dialogue-heavy, binaural and recurring series work are the sweet spot.' : person.role === 'artist' ? 'Open to cover, character and promotional commissions through Nightjar.' : person.role === 'creator' ? 'Broadcast-quality home setup with remote direction available.' : 'Always happy to discover smaller creators.',
        ...(person.role === 'creator' ? {
          creatorLanguages:['English · UK','Northern English'],
          creatorDirectionModes:['Self-directed','Live direction','Written direction / notes'],
          creatorDeliveryFormats:['Raw WAV','Cleaned dialogue','Multiple takes','Pickups included','Series continuity'],
          creatorTurnaround:'3–5 days',
          creatorEquipment:'Broadcast-quality home booth · BEACN microphone · remote direction available.',
        } : person.role === 'writer' ? {
          writerScriptLengths:['Short · 500–1,500 words','Medium · 1,500–4,000 words','Series / episodic'],
          writerCollaborationPreferences:['VA-led commissions','Collaborative outlining','Long-running series','Licensing existing scripts'],
          writerTurnaround:'1–2 weeks',
          writerRightsNote:'Open to licensed catalogue work and commissioned originals through protected Nightjar workflows.',
        } : person.role === 'artist' ? {
          artistMediums:['Digital painting','Illustration','Typography'],
          artistDeliveryFormats:['Cover artwork','Square social artwork','Portrait artwork','Series visual system'],
          artistTurnaround:'1–2 weeks',
          artistSoftware:['Procreate','Adobe Photoshop'],
        } : person.role === 'listener' ? {
          listenerCommunityStyle:['Recommendations welcome','Playlist curator','Independent-creator supporter','Series follower'],
        } : {}),
        ...(person.role === 'editor' ? {
          editorSoftware:['Reaper','iZotope RX','Adobe Audition'],
          editorProjectTypes:['Single-voice roleplay','Multi-voice audio drama','ASMR / close-mic audio','Binaural / spatial scenes','Series / episodic production','Restoration / rescue edits'],
          editorDeliveryFormats:['WAV master','24-bit delivery','48 kHz delivery','Separate stems','Dialogue stem','Loudness-matched master','Platform-ready final'],
          editorCollaborationPreferences:['VAs / performers','Writers','Long-term series teams','One-off commissions','First-time creators'],
          editorTurnaround:'3–5 days',
          editorExperienceYears:6,
          editorSkillLevels:{'Dialogue editing':'Specialist','Noise cleanup / restoration':'Specialist','Breath / mouth-click cleanup':'Specialist','Mixing':'Experienced','Mastering':'Experienced','Binaural / spatial production':'Experienced'},
          editorShowcaseSamples:[
            {id:'dialogue-rescue',title:'Dialogue restoration',beforeLabel:'Room noise, mouth clicks, uneven level',afterLabel:'Clean dialogue master',techniques:['Noise reduction','Click repair','EQ','De-essing']},
            {id:'immersive-scene',title:'Immersive scene build',beforeLabel:'Dry mono performance',afterLabel:'Spatial scene-ready mix',techniques:['Room tone','Ambience','Binaural staging','Dynamics']},
          ],
        } : {}),
        favouriteTags:['Cinematic','Story-led'],
        portfolioNote:person.role === 'listener' ? 'A few playlists I chose to share publicly.' : 'A small selection of work that represents what I do on Nightjar.',
        completedCollaborations:['writer','editor','creator'].includes(person.role) ? 4 : 0,
        activityBadges:person.role === 'creator'
          ? [{id:'published-creator',label:'Published Creator',detail:'Has released work in the Nightjar catalogue.'},{id:'completed-collaborator',label:'Completed Collaborator',detail:'Has completed Nightjar collaborations.'}]
          : person.role === 'writer'
            ? [{id:'published-writer',label:'Published Writer',detail:'Has published writing recorded by Nightjar.'},{id:'completed-collaborator',label:'Completed Collaborator',detail:'Has completed Nightjar collaborations.'}]
            : person.role === 'editor'
              ? [{id:'credited-editor',label:'Credited Audio Editor',detail:'Has public Nightjar release credits.'},{id:'completed-collaborator',label:'Completed Collaborator',detail:'Has completed Nightjar collaborations.'}]
              : [],
        featuredWork:person.role === 'writer' || person.role === 'editor' ? creditedReleases.slice(0,2) : person.role === 'creator' ? demoTracks.filter((release:any)=>release.creatorUserId===person.userId).slice(0,2) : [],
        publicPlaylists:person.role === 'listener' ? [{id:'demo-public-playlist',title:'Late-night slow burns',releaseCount:Math.min(4,demoTracks.length),releases:demoTracks.slice(0,4).map((release:any)=>({...release,creatorName:release.creator}))}] : [],
      } : null);
      setLoading(false);
      return;
    }
    void nightjarCommunity.getPublicProfile(userId).then((data) => {
      if (!cancelled) setProfile(data.profile ?? null);
    }).catch(() => {
      if (!cancelled) {
        setProfile(null);
        setLoadError(navigator.onLine
          ? 'Nightjar could not load this public profile from the protected service.'
          : 'You are offline. Public profiles need a connection because Nightjar does not cache protected account data.');
        notify('Public profile could not be loaded.');
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId, demoMode, retryKey]);

  useEffect(() => {
    if (!focusArtworkId || !profile?.artistPortfolio?.some((item: any) => String(item.id) === focusArtworkId)) return;
    const timer = window.setTimeout(() => {
      document.getElementById('nightjar-artwork-' + focusArtworkId)?.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [profile, selectedProfileRole, focusArtworkId]);

  const share = async () => {
    if (!profile || readOnlyPreview) return;
    if (demoMode) {
      notify('Simulation profiles cannot be shared outside Nightjar.');
      return;
    }
    const role = profileRole as ShareableProfileRole;
    let url = publicProfileUrl(window.location.origin, userId, role);
    if (role === 'creator') {
      try {
        const recommendation = await nightjarReferrals.recommendCreator(userId);
        if (typeof recommendation.path === 'string' && recommendation.path.startsWith('/') && !recommendation.path.startsWith('//')) {
          url = window.location.origin + recommendation.path + (recommendation.path.includes('?') ? '&' : '?') + 'role=creator';
        }
      } catch {
        // Keep the public role-specific URL available if referral tracking fails.
      }
    }
    await shareNightjarProfile({ url, name: String(profile.displayName || 'Nightjar creator'),
      roleLabel: profile.nightjarTeam === true ? 'Nightjar Team' : roleLabel(profileRole), notify });
  };

  const following = Boolean(profile?.userId && followingIds.includes(profile.userId));
  const availableProfileRoles: string[] = Array.from(new Set<string>(
    (Array.isArray(profile?.roles) && profile.roles.length ? profile.roles : [profile?.role ?? 'listener'])
      .map((role: unknown) => String(role))
      .filter((role: string) => ['creator','listener','writer','editor','artist'].includes(role)),
  ));
  const profileRole = ((selectedProfileRole && availableProfileRoles.includes(selectedProfileRole)
    ? selectedProfileRole
    : (profile?.role && availableProfileRoles.includes(String(profile.role)) ? String(profile.role) : availableProfileRoles[0] ?? 'listener'))) as ProfileRoleKey;
  const roleConfig = ROLE_PROFILE_CONFIG[profileRole];
  // Official crescent follows the server's approved professional roles across
  // EVERY connected role tab, including Listener. Release credits alone do not count.
  const approvedProfessionalRoles = Array.isArray(profile?.approvedProfessionalRoles)
    ? profile.approvedProfessionalRoles.filter((role:unknown) => ['creator','writer','editor','artist'].includes(String(role)))
    : [];
  const hasNightjarApproval = !profile?.nightjarTeam && approvedProfessionalRoles.length > 0;
  const isCreditedListener = !hasNightjarApproval && Array.isArray(profile?.verifiedCredits) && profile.verifiedCredits.length > 0;
  const roleDetails = profile?.roleProfiles && typeof profile.roleProfiles === 'object' && profile.roleProfiles[profileRole]
    ? profile.roleProfiles[profileRole]
    : profile ?? {};
  const memberTagline = String(profile?.headline || roleDetails?.roleHeadline || '').trim();
  const bannerFromCustom = profile?.headerImageMode === 'custom' && Boolean(profile?.bannerUrl);
  const bannerFromPortrait = profile?.headerImageMode !== 'cinematic' && profile?.headerImageMode !== 'custom' && Boolean(profile?.avatarUrl);
  const roleFeaturedWork = (profile?.featuredWorkByRole?.[profileRole] ?? profile?.featuredWork ?? []) as any[];
  const roleCreditedReleases = (profile?.creditedReleasesByRole?.[profileRole] ?? profile?.creditedReleases ?? []) as any[];
  const profileMetrics = profile ? (
    profileRole === 'creator'
      ? [
          ['Followers', profile.followerCount ?? 0],
          ['Following', profile.followingCount ?? 0],
          ['Released work', profile.releaseCount ?? 0],
          ['Collaborations', profile.completedCollaborations ?? 0],
        ]
      : profileRole === 'writer'
        ? [
            ['Followers', profile.followerCount ?? 0],
            ['Following', profile.followingCount ?? 0],
            ['Published scripts', profile.publishedWorkCount ?? 0],
            ['Release credits', profile.creditedReleaseCount ?? 0],
            ['Collaborations', profile.completedCollaborations ?? 0],
          ]
        : profileRole === 'editor'
          ? [
              ['Followers', profile.followerCount ?? 0],
              ['Release credits', profile.creditedReleaseCount ?? 0],
              ['Collaborations', profile.completedCollaborations ?? 0],
              ['Specialist skills', Object.values(roleDetails.editorSkillLevels ?? {}).filter((level) => level === 'Specialist').length],
            ]
          : profileRole === 'artist'
            ? [
                ['Followers', profile.followerCount ?? 0],
                ['Following', profile.followingCount ?? 0],
                ['Portfolio pieces', profile.artistPortfolio?.length ?? 0],
                ['Collaborations', profile.completedCollaborations ?? 0],
              ]
            : [
                ['Followers', profile.followerCount ?? 0],
                ['Following', profile.followingCount ?? 0],
                ['Profile tags', profile.favouriteTags?.length ?? 0],
              ]
  ) : [];


  return <div className="creator-profile-backdrop nj-full-profile-route" role="dialog" aria-modal="true" aria-label="Nightjar public profile">
    <section ref={dialogRef} tabIndex={-1} className={"creator-profile-modal premium-public-profile premium-public-profile-"+profileRole}>
      <header className="creator-profile-head">
        <div className="nj-cinema-profile-back"><span aria-hidden="true">☾</span><span className="mini-label">NIGHTJAR <span aria-hidden="true">/</span> {profile?.nightjarTeam ? 'TEAM' : profile ? roleLabel(profileRole).toUpperCase() : 'PROFILE'}</span></div>
        <button className="icon-button" onClick={onClose} aria-label="Close public profile"><X size={18}/></button>
      </header>

      {!loading && loadError && <div className="public-profile-load-failure"><ShieldCheck size={20}/><div><strong>Profile temporarily unavailable</strong><p>{loadError}</p></div><button className="secondary-button" onClick={()=>setRetryKey((value)=>value+1)}>Try again</button></div>}
      {!loading && !loadError && !profile && <div className="public-profile-load-failure"><ShieldCheck size={20}/><div><strong>Profile not available</strong><p>This profile is private, unavailable or no longer active.</p></div></div>}
      {readOnlyPreview && <div className="nj-profile-viewer-modal-note"><ShieldCheck size={15}/> Admin live public profile view · original member data · all actions disabled</div>}
      {profile && <div className="creator-profile-body">
        <div className="creator-profile-hero nj-cinema-profile-hero">
          <div className={'nj-cinema-profile-cover'+(bannerFromCustom ? ' nj-cinema-cover-custom' : bannerFromPortrait ? ' nj-cinema-cover-portrait' : ' nj-cinema-cover-branded')} aria-hidden="true">
            {(bannerFromCustom || bannerFromPortrait) && <FramedApprovedImage
              className="nj-profile-hero-banner" absolute
              src={bannerFromCustom ? profile.bannerUrl : profile.avatarUrl} alt=""
              framing={bannerFromCustom ? profile.bannerFraming : profile.avatarFraming}
              defaultMode={bannerFromCustom?'fit':'fill'}
              onLoad={(image)=>{if(image.naturalWidth < 480 || image.naturalHeight < 320)
                image.classList.add('nj-cinema-banner-lowres');}} />}
            <span className="nj-cinema-profile-cover-shade"/>
            <span className="nj-cinema-cover-words"><small>NIGHTJAR / {roleLabel(profileRole).toUpperCase()}</small><em>{memberTagline || (profileRole === 'listener' ? 'Stay curious.' : 'Stories you can feel.')}</em></span>
            <span className="nj-cinema-cover-moon">☾</span>
          </div>
          <span className="nj-profile-avatar-frame">
            <span className="creator-profile-avatar">{profile.avatarUrl
              ? <FramedApprovedImage imgClassName="avatar-approved-image" src={profile.avatarUrl}
                  framing={profile.avatarFraming} defaultMode="fill" alt="" />
              : profile.initials || 'NJ'}</span>
            {isCreditedListener && <span className="nj-credited-listener-label" title="Verified release contribution; not official professional onboarding">🎧 Credited Listener</span>}
             {hasNightjarApproval && <details className="nj-official-creator-badge">
              <summary aria-label="NightJar-approved professional — badge details" title="NightJar-approved professional"><Moon size={18} aria-hidden="true"/></summary>
              <span role="note">Official NightJar-approved professional: {approvedProfessionalRoles.map((role:string)=>roleLabel(role)).join(', ')}. Badge eligibility comes from NightJar onboarding approval, not release credits or profile claims.</span>
            </details>}
          </span>
          <div className="nj-profile-primary-identity">
            <span className="nj-profile-hero-eyebrow"><Sparkles size={13} aria-hidden="true"/> {profileRole === "listener" ? "THE NIGHTJAR COMMUNITY" : "MEET THE MAKER"}</span>
            <h3>{profile.displayName}</h3>
            {profile.handle && <span className="nj-cinema-profile-handle">@{String(profile.handle).replace(/^@/, '')}</span>}
            <p>{roleDetails.roleHeadline || profile.headline || (profileRole === 'editor' ? 'Audio Editor on Nightjar.' : profileRole === 'listener' ? 'A curated corner of the Nightjar listening community.' : 'Nightjar member.')}</p>
            {profile.pronouns && <small>{profile.pronouns}</small>}
            {profile.nightjarTeam === true && <div className="profile-activity-badges public-profile-badges"><span><ShieldCheck size={12}/>Official Nightjar Team</span></div>}
            {availableProfileRoles.length > 0 && <div className="profile-role-chips" role="tablist" aria-label="Professional roles">{availableProfileRoles.map((role:string)=><button type="button" role="tab" aria-selected={profileRole===role} data-nightjar-scroll-top className={profileRole===role?'active':''} key={role} onClick={()=>{ setSelectedProfileRole(role); dialogRef.current?.scrollTo({top:0,behavior:'auto'}); }}>{profile.nightjarTeam === true ? 'Nightjar Team' : roleLabel(role)}</button>)}</div>}
          </div>
          <div className="writer-discovery-actions">
            {!readOnlyPreview && <button className="secondary-button" onClick={() => void onToggleFollow(profile.userId)}><Heart size={14} fill={following ? 'currentColor' : 'none'}/> {following ? 'Following' : 'Follow'}</button>}
            {canMessage && onMessage && (profile.roles ?? [profile.role]).some((role:string)=>['creator','writer','editor','artist'].includes(role)) && <button className="secondary-button" onClick={() => onMessage(profile.userId)}><MessageCircle size={14}/> Message</button>}
            {!readOnlyPreview && (profile.roles ?? [profile.role]).some((role:string)=>['creator','writer','editor','artist'].includes(role)) && <button className="secondary-button" onClick={() => setGiftOpen(true)}><Bird size={14}/> Support creator</button>}
            {!readOnlyPreview && <button className="ghost-button" onClick={() => void share()}><Share2 size={14}/> Share</button>}
          </div>
        </div>

        <div className="public-profile-metrics" aria-label="Public profile highlights">
          {profileMetrics.map(([label, value]) => {
            const kind = label === 'Followers' ? 'followers' : label === 'Following' ? 'following' : null;
            const target = ['Released work','Published scripts','Release credits','Portfolio pieces'].includes(String(label))
              ? 'nj-cinema-work'
              : ['Collaborations','Specialist skills'].includes(String(label))
                ? 'nj-cinema-collaborate' : null;
            return kind || target
              ? <button type="button" className="nj-profile-metric-button" key={String(label)}
                  aria-label={kind ? 'View '+String(label).toLowerCase()+' of '+String(profile.displayName) : 'Explore '+String(label).toLowerCase()}
                  onClick={()=>kind ? onOpenConnections(profile.userId,kind,profile.displayName) : goToSection(target!)}>
                  <strong>{value}</strong><span>{label}</span>
                </button>
              : <div key={String(label)}><strong>{value}</strong><span>{label}</span></div>;
          })}
        </div>
        <nav className="nj-cinema-profile-tabs" aria-label="Profile sections">
          <button type="button" onClick={()=>goToSection('nj-cinema-work')}>Work</button>
          {(profile.welcomeMessage || profile.bio) && <button type="button" onClick={()=>goToSection('nj-cinema-about')}>About</button>}
          <button type="button" onClick={()=>goToSection('nj-cinema-collaborate')}>Collaborate</button>
          {!!profile.socialLinks?.length && <button type="button" onClick={()=>goToSection('nj-cinema-links')}>Links</button>}
        </nav>

        {(profile.welcomeMessage || profile.bio) && <section id="nj-cinema-about" className="nj-public-profile-about" aria-label="About this member">
          <div className="nj-public-profile-about-heading"><span className="mini-label">BEHIND THE PROFILE</span><Sparkles size={16} aria-hidden="true"/></div>
          {profile.welcomeMessage && <p className="creator-profile-welcome">{profile.welcomeMessage}</p>}
          {profile.bio && <p className="creator-profile-bio">{profile.bio}</p>}
        </section>}
        {!!profile.socialLinks?.length && <details id="nj-cinema-links" className="nj-public-social-details">
          <summary><span>Find {profileRole === 'listener' ? 'this member' : 'this creator'} elsewhere <small>{profile.socialLinks.length} {profile.socialLinks.length === 1 ? 'link' : 'links'}</small></span><ChevronDown size={18} aria-hidden="true"/></summary>
          <SocialLinksDisplay links={profile.socialLinks} />
        </details>}

        {!!profile.activityBadges?.length && <div className="profile-activity-badges public-profile-badges">
          {profile.activityBadges.map((badge:any)=><span key={badge.id} title={badge.detail}><ShieldCheck size={12}/>{badge.label}</span>)}
        </div>}

        {(!!roleDetails.roleFocus?.length || !!profile.favouriteTags?.length) && <details className="nj-cinema-optional-details">
          <summary><span>Interests & creative focus</span><ChevronDown size={16} aria-hidden="true"/></summary>
          <div className="nj-cinema-optional-details-body">
            {!!roleDetails.roleFocus?.length && <div className="creator-profile-tags">{roleDetails.roleFocus.map((item: string) => <span key={item}>{item}</span>)}</div>}
            {!!profile.favouriteTags?.length && <div className="creator-profile-tags">{profile.favouriteTags.map((item: string) => <span key={item}>{item}</span>)}</div>}
          </div>
        </details>}

        <section id="nj-cinema-collaborate" className="public-role-profile">
          <div className="public-role-profile-head"><div><span className="mini-label">{roleLabel(profileRole).toUpperCase()} IDENTITY</span><h3>{roleConfig.title}</h3></div>{roleDetails.roleAvailability && <strong>{roleDetails.roleAvailability}</strong>}</div>
          <p>{roleDetails.roleBio || roleConfig.description}</p>
          {(!!roleDetails.roleSpecialties?.length || !!roleDetails.roleSecondary?.length || !!profile.favouriteCategories?.length || !!profile.favouriteTropes?.length) && <details className="nj-cinema-optional-details">
            <summary><span>Specialties, genres & preferences</span><ChevronDown size={16} aria-hidden="true"/></summary>
            <div className="nj-cinema-optional-details-body">
              {!!roleDetails.roleSpecialties?.length && <div className="public-role-group"><span>{roleConfig.specialtiesLabel}</span><div className="creator-profile-tags">{roleDetails.roleSpecialties.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
              {!!roleDetails.roleSecondary?.length && <div className="public-role-group"><span>{roleConfig.secondaryLabel}</span><div className="creator-profile-tags">{roleDetails.roleSecondary.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
              {!!profile.favouriteCategories?.length && <div className="public-role-group"><span>{profileRole === 'listener' ? 'Favourite categories' : 'Relevant categories'}</span><div className="creator-profile-tags">{profile.favouriteCategories.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
              {!!profile.favouriteTropes?.length && <div className="public-role-group"><span>{profileRole === 'listener' ? 'Favourite tropes' : 'Tropes & themes'}</span><div className="creator-profile-tags">{profile.favouriteTropes.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
            </div>
          </details>}
          {(roleDetails.roleDetailOne || roleDetails.roleDetailTwo) && <div className="public-role-copy">{roleDetails.roleDetailOne && <div><strong>{roleConfig.detailOneLabel}</strong><p>{roleDetails.roleDetailOne}</p></div>}{roleDetails.roleDetailTwo && <div><strong>{roleConfig.detailTwoLabel}</strong><p>{roleDetails.roleDetailTwo}</p></div>}</div>}
        </section>

        {profileRole === 'creator' && <VoiceCallingCardPublic creatorUserId={userId} demoMode={demoMode} readOnly={readOnlyPreview} />}
        {profileRole === 'creator' && <section className="role-public-professional creator-public-professional">
          <div className="role-public-professional-head"><div><span className="mini-label">VA CREATOR PROFILE</span><h3>Performance & recording craft</h3><p>A working snapshot for listeners and collaborators — voice identity, direction style and delivery without exposing private production files or contact details.</p></div><Mic2 size={19}/></div>
          <div className="role-public-fact-grid">
            <div><span>Availability</span><strong>{roleDetails.roleAvailability || 'Ask first'}</strong></div>
            <div><span>Turnaround</span><strong>{roleDetails.creatorTurnaround || 'Project dependent'}</strong></div>
            <div><span>Released work</span><strong>{profile.releaseCount ?? 0}</strong></div>
            <div><span>Collaborations</span><strong>{profile.completedCollaborations ?? 0}</strong></div>
          </div>
          {!!roleDetails.creatorLanguages?.length && <div className="role-public-detail-card"><span className="mini-label">VOICE RANGE</span><h4>Languages, accents & dialects</h4><div className="creator-profile-tags">{roleDetails.creatorLanguages.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          {(!!roleDetails.creatorDirectionModes?.length || !!roleDetails.creatorDeliveryFormats?.length) && <div className="role-public-two-column">
            {!!roleDetails.creatorDirectionModes?.length && <div className="role-public-detail-card"><span className="mini-label">DIRECTION</span><h4>How they like to work</h4><div className="creator-profile-tags">{roleDetails.creatorDirectionModes.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
            {!!roleDetails.creatorDeliveryFormats?.length && <div className="role-public-detail-card"><span className="mini-label">DELIVERY</span><h4>What they can hand off</h4><div className="creator-profile-tags">{roleDetails.creatorDeliveryFormats.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          </div>}
          {roleDetails.creatorEquipment && <div className="role-public-note"><strong>Studio / equipment</strong><p>{roleDetails.creatorEquipment}</p></div>}
        </section>}

        {profileRole === 'writer' && <section className="role-public-professional writer-public-professional">
          <div className="role-public-professional-head"><div><span className="mini-label">WRITER PROFILE</span><h3>Author, formats & rights posture</h3><p>Useful commissioning context without exposing drafts, manuscript text, private rates or protected deal terms.</p></div><BookOpenText size={19}/></div>
          <div className="role-public-fact-grid">
            <div><span>Availability</span><strong>{roleDetails.roleAvailability || 'Ask first'}</strong></div>
            <div><span>Turnaround</span><strong>{roleDetails.writerTurnaround || 'Project dependent'}</strong></div>
            <div><span>Published scripts</span><strong>{profile.publishedWorkCount ?? 0}</strong></div>
            <div><span>Release credits</span><strong>{profile.creditedReleaseCount ?? 0}</strong></div>
          </div>
          <div className="role-public-two-column">
            <div className="role-public-detail-card"><span className="mini-label">SCRIPT SCALE</span><h4>Typical lengths</h4>{roleDetails.writerScriptLengths?.length?<div className="creator-profile-tags">{roleDetails.writerScriptLengths.map((item:string)=><span key={item}>{item}</span>)}</div>:<p>Script lengths not listed yet.</p>}</div>
            <div className="role-public-detail-card"><span className="mini-label">COLLABORATION</span><h4>Best working fit</h4>{roleDetails.writerCollaborationPreferences?.length?<div className="creator-profile-tags">{roleDetails.writerCollaborationPreferences.map((item:string)=><span key={item}>{item}</span>)}</div>:<p>Collaboration preferences not listed yet.</p>}</div>
          </div>
          {roleDetails.writerRightsNote && <div className="role-public-note"><strong>Rights / licensing note</strong><p>{roleDetails.writerRightsNote}</p></div>}
        </section>}

        {profileRole === 'artist' && <section className="role-public-professional artist-public-professional">
          <div className="role-public-professional-head"><div><span className="mini-label">ARTIST PROFILE</span><h3>Visual practice & commission fit</h3><p>Public creative capability and approved work — private briefs, source files and licensing negotiations stay private.</p></div><Brush size={19}/></div>
          <div className="role-public-fact-grid">
            <div><span>Availability</span><strong>{roleDetails.roleAvailability || 'Ask first'}</strong></div>
            <div><span>Turnaround</span><strong>{roleDetails.artistTurnaround || 'Project dependent'}</strong></div>
            <div><span>Portfolio pieces</span><strong>{profile.artistPortfolio?.length ?? 0}</strong></div>
            <div><span>Collaborations</span><strong>{profile.completedCollaborations ?? 0}</strong></div>
          </div>
          <div className="role-public-two-column">
            <div className="role-public-detail-card"><span className="mini-label">MEDIUMS</span><h4>How they make</h4>{roleDetails.artistMediums?.length?<div className="creator-profile-tags">{roleDetails.artistMediums.map((item:string)=><span key={item}>{item}</span>)}</div>:<p>Mediums not listed yet.</p>}</div>
            <div className="role-public-detail-card"><span className="mini-label">DELIVERABLES</span><h4>What they can produce</h4>{roleDetails.artistDeliveryFormats?.length?<div className="creator-profile-tags">{roleDetails.artistDeliveryFormats.map((item:string)=><span key={item}>{item}</span>)}</div>:<p>Deliverables not listed yet.</p>}</div>
          </div>
          {!!roleDetails.artistSoftware?.length && <div className="role-public-detail-card"><span className="mini-label">TOOLS</span><h4>Software & tools</h4><div className="creator-profile-tags">{roleDetails.artistSoftware.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          {!!profile.featuredArtistPortfolio?.length && <div className="public-artist-featured"><span className="mini-label">FEATURED ARTWORK</span><div className="public-artist-featured-grid">{profile.featuredArtistPortfolio.map((item:any)=><article key={item.id}>{item.imageUrl&&<FramedApprovedImage src={item.imageUrl} alt={item.title}
   framing={item.imageFraming?.assetId===item.imageAssetId?item.imageFraming:null} defaultMode="fit"
   className="nj-approved-featured-image" />}<div><strong>{item.title}</strong>{item.commissionType&&<small>{item.commissionType}</small>}<p>{item.description}</p></div></article>)}</div></div>}
        </section>}

        {profileRole === 'listener' && <section className="role-public-professional listener-public-professional">
          <div className="role-public-professional-head"><div><span className="mini-label">LISTENER SIGNATURE</span><h3>A curated member profile, not a behavioural dossier.</h3><p>This space is made from information the Listener deliberately chose to share. Private listening history, favourites, completion data and library contents are not exposed.</p></div><Headphones size={19}/></div>
          <div className="role-public-fact-grid">
            <button type="button" className="nj-role-metric-link" onClick={()=>onOpenConnections(profile.userId,'followers',profile.displayName)} aria-label="View followers"><span>Followers</span><strong>{profile.followerCount ?? 0}</strong></button>
            <button type="button" className="nj-role-metric-link" onClick={()=>onOpenConnections(profile.userId,'following',profile.displayName)} aria-label="View following"><span>Following</span><strong>{profile.followingCount ?? 0}</strong></button>
            <div><span>Public playlists</span><strong>{profile.publicPlaylists?.length ?? 0}</strong></div>
            <div><span>Shared interests</span><strong>{(profile.favouriteTags?.length ?? 0)+(profile.favouriteCategories?.length ?? 0)}</strong></div>
          </div>
          {!!roleDetails.listenerCommunityStyle?.length && <div className="role-public-detail-card"><span className="mini-label">COMMUNITY STYLE</span><h4>How they like to take part</h4><div className="creator-profile-tags">{roleDetails.listenerCommunityStyle.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          <div className="listener-public-privacy"><ShieldCheck size={15}/><span>Only deliberate public profile choices are shown here.</span></div>
        </section>}

        {profileRole === 'editor' && <section className="editor-public-professional">
          <div className="editor-public-heading">
            <div><span className="mini-label">EDITOR PROFESSIONAL PROFILE</span><h3>Production capability</h3><p>Useful working detail for VAs, Writers and production teams — without exposing private client files, manuscripts or revision notes.</p></div>
            <FileCheck2 size={18}/>
          </div>
          <div className="editor-public-facts">
            <div><span>Availability</span><strong>{roleDetails.roleAvailability || 'Ask first'}</strong></div>
            <div><span>Typical turnaround</span><strong>{roleDetails.editorTurnaround || 'Project dependent'}</strong></div>
            <div><span>Experience</span><strong>{Number(roleDetails.editorExperienceYears) > 0 ? roleDetails.editorExperienceYears + ' years' : 'Not stated'}</strong></div>
            <div><span>Verified releases</span><strong>{profile.creditedReleaseCount ?? 0}</strong></div>
          </div>

          <div className="editor-public-columns">
            <div className="editor-public-card">
              <span className="mini-label">TOOLS</span>
              <h4>DAWs & production tools</h4>
              {!!roleDetails.editorSoftware?.length ? <div className="creator-profile-tags">{roleDetails.editorSoftware.map((item:string)=><span key={item}>{item}</span>)}</div> : <p>Production tools not listed yet.</p>}
            </div>
            <div className="editor-public-card">
              <span className="mini-label">PROJECT FIT</span>
              <h4>Best suited to</h4>
              {!!roleDetails.editorProjectTypes?.length ? <div className="creator-profile-tags">{roleDetails.editorProjectTypes.map((item:string)=><span key={item}>{item}</span>)}</div> : <p>Project preferences not listed yet.</p>}
            </div>
            <div className="editor-public-card">
              <span className="mini-label">DELIVERY</span>
              <h4>Technical handoff</h4>
              {!!roleDetails.editorDeliveryFormats?.length ? <div className="creator-profile-tags">{roleDetails.editorDeliveryFormats.map((item:string)=><span key={item}>{item}</span>)}</div> : <p>Delivery formats not listed yet.</p>}
            </div>
          </div>

          {!!roleDetails.roleSpecialties?.length && <div className="editor-public-skills">
            <div><span className="mini-label">SKILL MATRIX</span><h4>Editing services & proficiency</h4><p>Proficiency is self-described. Verified credits below show work actually published through Nightjar.</p></div>
            <div className="editor-public-skill-list">{roleDetails.roleSpecialties.map((skill:string)=><div key={skill}><span>{skill}</span><strong>{roleDetails.editorSkillLevels?.[skill] || 'Available'}</strong></div>)}</div>
          </div>}

          {!!roleDetails.editorCollaborationPreferences?.length && <div className="editor-collaboration-fit">
            <span className="mini-label">COLLABORATION FIT</span>
            <div className="creator-profile-tags">{roleDetails.editorCollaborationPreferences.map((item:string)=><span key={item}>{item}</span>)}</div>
          </div>}

          {!!profile.editorShowcaseSamples?.length && <div className="editor-process-showcase">
            <div><span className="mini-label">BEFORE / AFTER SHOWCASE</span><h4>What the edit changes</h4><p>Simulation samples demonstrate the profile format. Live public audio samples will only be shown when the editor has permission to publish the source material.</p></div>
            <div className="editor-process-grid">{profile.editorShowcaseSamples.map((sample:any)=><article key={sample.id}>
              <strong>{sample.title}</strong>
              <div className="editor-process-compare"><span><em>RAW</em>{sample.beforeLabel}</span><span><em>EDITED</em>{sample.afterLabel}</span></div>
              {!!sample.techniques?.length && <div className="creator-profile-tags">{sample.techniques.map((item:string)=><span key={item}>{item}</span>)}</div>}
            </article>)}</div>
          </div>}
        </section>}

        {(roleDetails.portfolioNote || (profile.completedCollaborations ?? 0) > 0) && <section className="public-showcase-intro">
          {roleDetails.portfolioNote && <p>{roleDetails.portfolioNote}</p>}
          {(profile.completedCollaborations ?? 0) > 0 && <CollaborationHistoryButton userId={userId} displayName={profile.displayName ?? 'Nightjar member'} count={profile.completedCollaborations ?? 0} demoMode={demoMode} />}
        </section>}

        <details className="nj-public-profile-privacy">
          <summary><ShieldCheck size={16} aria-hidden="true"/> Profile privacy and visibility <ChevronDown size={16} aria-hidden="true"/></summary>
          <div className="writer-public-note">
          {profileRole === 'editor' ? <FileCheck2 size={16}/> : <Headphones size={16}/>}
          <div>
            <strong>{profileRole === 'editor'
              ? 'Public production identity, private client work.'
              : profileRole === 'writer'
                ? 'Public writing identity, protected manuscripts.'
                : profileRole === 'artist'
                  ? 'Public artist identity, private commission details.'
                  : profileRole === 'listener'
                    ? 'Community identity without listening-history exposure.'
                    : 'Public VA Creator identity.'}</strong>
            <p>{profileRole === 'editor'
              ? 'Nightjar shows skills, availability and credited public releases without exposing assigned manuscripts, private notes or client files.'
              : profileRole === 'writer'
                ? 'Writing focus, availability and public credits can be discovered without exposing protected script text or private licensing discussions.'
                : profileRole === 'artist'
                  ? 'Style, portfolio work and commission availability can be discovered without exposing private briefs, source files or client discussions.'
                  : profileRole === 'listener'
                    ? 'Only the profile details this listener deliberately chose to publish are shown here. Private listening history and library activity stay private.'
                    : 'VA Creator identity, public catalogue work and collaboration information are presented separately from private account data.'}</p>
          </div>
        </div>
        </details>

        {profileRole === 'listener' && <section className="premium-listener-signature">
          <div className="premium-listener-signature-head">
            <div><span className="mini-label">LISTENER SIGNATURE</span><h3>A profile built around taste, not status.</h3><p>Listeners get the same profile care as professionals. This space shows only the interests and collections this person deliberately chose to make public — never private listening history.</p></div>
            <Headphones size={19}/>
          </div>
          <div className="premium-listener-groups">
            <div><strong>Moods & tags</strong>{profile.favouriteTags?.length ? <div className="creator-profile-tags">{profile.favouriteTags.slice(0,8).map((item:string)=><span key={item}>{item}</span>)}</div> : <p>Still shaping their Nightjar world.</p>}</div>
            <div><strong>Categories</strong>{profile.favouriteCategories?.length ? <div className="creator-profile-tags">{profile.favouriteCategories.slice(0,8).map((item:string)=><span key={item}>{item}</span>)}</div> : <p>No public categories selected yet.</p>}</div>
            <div><strong>Tropes & themes</strong>{profile.favouriteTropes?.length ? <div className="creator-profile-tags">{profile.favouriteTropes.slice(0,8).map((item:string)=><span key={item}>{item}</span>)}</div> : <p>No public themes selected yet.</p>}</div>
          </div>
        </section>}

        {profileRole === 'artist' && <section className="public-artist-portfolio">
          <div className="section-head"><div><span className="mini-label">ARTIST PORTFOLIO</span><h3>Approved visual work</h3></div></div>
          {!!profile.artistPortfolio?.length ? <div className="public-artist-grid">
            {profile.artistPortfolio.map((item:any)=><article key={item.id} id={'nightjar-artwork-' + item.id} className={focusArtworkId === item.id ? 'nightjar-notification-target' : undefined}>
              {item.imageUrl && <button type="button" className="public-artist-image" onClick={()=>window.open(item.imageUrl,'_blank','noopener,noreferrer')} aria-label={'Open '+item.title+' full size'}><FramedApprovedImage src={item.imageUrl} alt={item.title} defaultMode="fit"
   framing={item.imageFraming?.assetId===item.imageAssetId?item.imageFraming:null}/></button>}
              <div><strong>{item.title}</strong>{item.commissionType&&<small>{item.commissionType}</small>}{item.description&&<p>{item.description}</p>}{!!item.tags?.length&&<div className="creator-profile-tags">{item.tags.map((tag:string)=><span key={tag}>{tag}</span>)}</div>}</div>
            </article>)}
          </div> : <div className="people-empty"><ImagePlus size={18}/><strong>No approved portfolio pieces yet</strong><span>This Artist has not published moderated artwork to their Nightjar portfolio yet.</span></div>}
        </section>}

        <div id="nj-cinema-work" className="creator-profile-releases">
          <div className="section-head">
            <div>
              <span className="mini-label">{profileRole === 'listener' ? 'COMMUNITY' : 'PUBLIC WORK'}</span>
              <h3>{profileRole === 'writer'
                ? 'Writing portfolio'
                : profileRole === 'editor'
                  ? 'Production credits'
                  : profileRole === 'artist'
                    ? 'Artist portfolio'
                    : profileRole === 'creator'
                      ? 'VA Creator catalogue'
                      : 'Listener profile'}</h3>
            </div>
          </div>
          {profileRole === 'creator' && !!roleFeaturedWork.length && <div className="public-featured-work">
            <span className="mini-label">FEATURED</span>
            {roleFeaturedWork.map((release:any)=><article key={release.id}>
              {release.artworkUrl && <FramedApprovedImage className="nj-cinema-work-art" src={release.artworkUrl} alt=""
   framing={release.artworkFraming?.assetId===release.artworkAssetId?release.artworkFraming:null} defaultMode="fit"/>}
              <div><strong>{release.title}</strong><span>{release.creatorName ?? profile.displayName}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div>
              <div className="track-credit-line">{(profile.verifiedCredits ?? []).filter((credit:any)=>credit.releaseId===release.id).map((credit:any)=><span key={credit.id}>{credit.releaseRole}</span>)}</div>
              <div className="public-work-community-actions"><span className="profile-release-community-counts"><span><ThumbsUp size={11}/>{communityByRelease[String(release.id)]?.likes ?? release.communityLikeCount ?? 0}</span><span><Heart size={11}/>{communityByRelease[String(release.id)]?.loves ?? release.communityLoveCount ?? 0}</span><span><MessageCircle size={11}/>{communityByRelease[String(release.id)]?.comments ?? release.communityCommentCount ?? 0}</span></span>{canReact && onReaction && <><button className={reactionByRelease[String(release.id)]==='like'?'ghost-button active-community-action':'ghost-button'} onClick={()=>onReaction(String(release.id),'like')}><ThumbsUp size={12} fill={reactionByRelease[String(release.id)]==='like'?'currentColor':'none'}/> Like</button><button className={reactionByRelease[String(release.id)]==='love'?'ghost-button active-community-action':'ghost-button'} onClick={()=>onReaction(String(release.id),'love')}><Heart size={12} fill={reactionByRelease[String(release.id)]==='love'?'currentColor':'none'}/> Love</button></>}{onCommunityRelease && <button className="ghost-button public-work-community-button" onClick={()=>onCommunityRelease(release)}><MessageCircle size={12}/> Comments</button>}</div>
            </article>)}
          </div>}
          {profileRole === 'listener' && !!profile.publicPlaylists?.length && <div className="public-playlist-list">
            <span className="mini-label">SHARED PLAYLISTS</span>
            {profile.publicPlaylists.map((playlist:any)=><article key={playlist.id}>
              <div className="public-playlist-head"><ListMusic size={16}/><div><strong>{playlist.title}</strong><span>{playlist.releaseCount ?? 0} release{playlist.releaseCount === 1 ? '' : 's'}</span></div></div>
              {!!playlist.releases?.length && <div className="public-playlist-preview">{playlist.releases.slice(0,4).map((release:any)=><button type="button" key={release.id} onClick={()=>onCommunityRelease?.(release)} disabled={!onCommunityRelease}><span>{release.title}</span><small>{release.creatorName ?? 'Nightjar creator'} · Community</small></button>)}</div>}
            </article>)}
          </div>}
          {(profileRole === 'writer' || profileRole === 'editor') && !!roleFeaturedWork.length && <div className="public-featured-work">
            <span className="mini-label">FEATURED {profileRole === 'writer' ? 'WRITING' : 'PRODUCTION'} CREDITS</span>
            {roleFeaturedWork.map((release:any)=><article key={'featured-'+release.id}>
              <div><strong>{release.title}</strong><span>{release.creatorName ?? 'Nightjar creator'}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div>
              <div className="track-credit-line">{(profile.verifiedCredits ?? []).filter((credit:any)=>credit.releaseId===release.id && (profileRole==='writer' ? credit.releaseRole==='Writer' : ['Audio Editor','Sound Designer','Producer'].includes(credit.releaseRole))).map((credit:any)=><span key={credit.id}>{credit.releaseRole}</span>)}</div>
            </article>)}
          </div>}
          {profileRole === 'writer' && <PublicWriterPortfolio items={profile.writerPortfolio ?? []} />}
                    {profileRole === 'editor' && <PublicEditorShowcase items={profile.editorPortfolio ?? []} />}
          {(profileRole === 'writer' || profileRole === 'editor') && <div className="public-credit-summary">
            <span>{profileRole === 'writer' ? (profile.publishedWorkCount ?? 0) + ' published scripts' : 'Audio Editor'}</span>
            <strong>{profile.creditedReleaseCount ?? 0} credited release{profile.creditedReleaseCount === 1 ? '' : 's'}</strong>
          </div>}
          {profileRole === 'listener' && !!roleCreditedReleases.length && <div className="public-credit-list" aria-label="Verified credited releases">
            <span className="mini-label">🎧 VERIFIED RELEASE CREDITS</span>
            {roleCreditedReleases.slice(0,12).map((release:any)=><article key={'listener-credit-'+release.id}>
              <div><strong>{release.title}</strong><span>{release.creatorName ?? 'NightJar creator'}</span></div>
              <div className="track-credit-line">{(profile.verifiedCredits ?? []).filter((credit:any)=>credit.releaseId===release.id).map((credit:any)=><span key={credit.id}>{credit.releaseRole}</span>)}</div>
              {onCommunityRelease && <button type="button" className="ghost-button" onClick={()=>onCommunityRelease(release)}>Open release</button>}
            </article>)}
          </div>}
          {(profileRole === 'writer' || profileRole === 'editor') && !!roleCreditedReleases.length && <div className="public-credit-list">
            {roleCreditedReleases.slice(0,12).map((release:any)=><article key={release.id}>
              <div><strong>{release.title}</strong><span>{release.creatorName ?? 'Nightjar creator'}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div>
              <div className="track-credit-line">{(profile.verifiedCredits ?? []).filter((credit:any)=>credit.releaseId===release.id).map((credit:any)=><span key={credit.id}>{credit.releaseRole}</span>)}</div>
              <div className="public-work-community-actions"><span className="profile-release-community-counts"><span><ThumbsUp size={11}/>{communityByRelease[String(release.id)]?.likes ?? release.communityLikeCount ?? 0}</span><span><Heart size={11}/>{communityByRelease[String(release.id)]?.loves ?? release.communityLoveCount ?? 0}</span><span><MessageCircle size={11}/>{communityByRelease[String(release.id)]?.comments ?? release.communityCommentCount ?? 0}</span></span>{canReact && onReaction && <><button className={reactionByRelease[String(release.id)]==='like'?'ghost-button active-community-action':'ghost-button'} onClick={()=>onReaction(String(release.id),'like')}><ThumbsUp size={12} fill={reactionByRelease[String(release.id)]==='like'?'currentColor':'none'}/> Like</button><button className={reactionByRelease[String(release.id)]==='love'?'ghost-button active-community-action':'ghost-button'} onClick={()=>onReaction(String(release.id),'love')}><Heart size={12} fill={reactionByRelease[String(release.id)]==='love'?'currentColor':'none'}/> Love</button></>}{onCommunityRelease && <button className="ghost-button public-work-community-button" onClick={()=>onCommunityRelease(release)}><MessageCircle size={12}/> Comments</button>}</div>
            </article>)}
          </div>}
        </div>
      </div>}
    </section>
    {giftOpen && profile && (MEMBER_PAYMENT_FEATURES_ENABLED ? <NightjarGiftPanel recipientUserId={profile.userId} recipientName={profile.displayName} recipientRole={String(profileRole)} recipientRoles={Array.isArray(profile.roles)?profile.roles:[]} notify={notify} onClose={() => setGiftOpen(false)} /> : <NightjarFinancePreview kind="support" recipientName={profile.displayName} onClose={() => setGiftOpen(false)} />)}
  </div>;
}
