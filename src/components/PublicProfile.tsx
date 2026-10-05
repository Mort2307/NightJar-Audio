import { useEffect, useRef, useState } from 'react';
import { Bird, FileCheck2, Handshake, Headphones, Heart, ImagePlus, ListMusic, MessageCircle, Share2, ShieldCheck, ThumbsUp, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
import { demoDirectory, demoTracks, demoWriterScripts } from '../demo/nightjarDemo';
import { ROLE_PROFILE_CONFIG, type ProfileRoleKey } from '../data/nightjarTaxonomy';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';
import { nightjarReferrals } from '../platform/firebase-referrals';
import NightjarGiftPanel from './NightjarGiftPanel';

type Props = {
  userId: string;
  followingIds: string[];
  onToggleFollow: (userId: string) => Promise<void>;
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
};

const roleLabel = (role: string | null | undefined) => {
  if (role === 'editor') return 'Audio Editor';
  if (role === 'writer') return 'Writer';
  if (role === 'creator') return 'VA Creator';
  if (role === 'artist') return 'Artist';
  return 'Listener';
};

export default function PublicProfile({ userId, followingIds, onToggleFollow, onClose, notify, canMessage = false, onMessage, onCommunityRelease, canReact = false, reactionByRelease = {}, onReaction, communityByRelease = {}, demoMode = false }: Props) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [giftOpen, setGiftOpen] = useState(false);
  const [selectedProfileRole, setSelectedProfileRole] = useState<string | null>(null);

  useDialogFocusTrap(dialogRef, { onEscape: onClose });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        roleFocus:person.role === 'writer' ? ['Script writing','Dialogue writing'] : person.role === 'editor' ? ['Audio editing','Mixing'] : [],
        roleSpecialties:person.role === 'writer' ? ['Dialogue','Character development'] : person.role === 'editor' ? ['Dialogue editing','Noise cleanup / restoration','Breath / mouth-click cleanup','Mixing','Mastering','Binaural / spatial production'] : ['Story-first','Atmospheric'],
        roleSecondary:person.role === 'writer' ? ['Single-voice script','Series / episodic'] : person.role === 'editor' ? ['Series consistency','Remote handoff','Detailed notes','Room-tone repair','Broadcast-ready delivery'] : ['Hidden gems','Series'],
        roleAvailability:person.role === 'writer' ? 'Open to commissions' : person.role === 'editor' ? 'Open for bookings' : '',
        roleDetailOne:person.role === 'writer' ? 'Dialogue-first work with strong character progression.' : person.role === 'editor' ? 'Organised remote handoff with labelled revisions, timestamped notes and non-destructive project delivery.' : 'Late-night stories, atmosphere and independent creators.',
        roleDetailTwo:person.role === 'writer' ? 'Collaboration and licensing stay inside protected Nightjar workflows.' : person.role === 'editor' ? 'Dialogue-heavy, binaural and recurring series work are the sweet spot.' : 'Always happy to discover smaller creators.',
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
      if (!cancelled) notify('Public profile could not be loaded.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId, demoMode]);

  const share = async () => {
    if (!profile) return;
    const text = `Discover ${profile.displayName} on Nightjar — ${roleLabel(profile.role)}.`;
    let url = window.location.origin + '/people/' + encodeURIComponent(userId);
    try {
      if (profile.role === 'creator' && !demoMode) {
        const recommendation = await nightjarReferrals.recommendCreator(userId);
        url = window.location.origin + recommendation.path;
      }
      if (navigator.share) await navigator.share({ title: 'Nightjar · ' + profile.displayName, text, url });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text + ' ' + url);
        notify('Profile copied — ready to share.');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Profile sharing could not be opened.');
    }
  };

  const following = Boolean(profile?.userId && followingIds.includes(profile.userId));
  const availableProfileRoles: string[] = Array.from(new Set<string>(
    (Array.isArray(profile?.roles) && profile.roles.length ? profile.roles : [profile?.role ?? 'listener'])
      .map((role: unknown) => String(role))
      .filter((role: string) => ['creator','listener','writer','editor','artist'].includes(role)),
  ));
  const profileRole = ((selectedProfileRole && availableProfileRoles.includes(selectedProfileRole)
    ? selectedProfileRole
    : availableProfileRoles[0] ?? 'listener')) as ProfileRoleKey;
  const roleConfig = ROLE_PROFILE_CONFIG[profileRole];
  const roleDetails = profile?.roleProfiles && typeof profile.roleProfiles === 'object' && profile.roleProfiles[profileRole]
    ? profile.roleProfiles[profileRole]
    : profile ?? {};
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


  return <div className="creator-profile-backdrop" role="dialog" aria-modal="true" aria-label="Nightjar public profile">
    <section ref={dialogRef} tabIndex={-1} className="creator-profile-modal">
      <header className="creator-profile-head">
        <div>
          <span className="mini-label">NIGHTJAR / {profile ? roleLabel(profileRole).toUpperCase() : 'PROFILE'}</span>
          <h2>{loading ? 'Loading profile…' : profile?.displayName ?? 'Nightjar profile'}</h2>
          <p>{profile?.handle ? '@' + String(profile.handle).replace(/^@/, '') : roleLabel(profileRole)}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close public profile"><X size={18}/></button>
      </header>

      {profile && <div className="creator-profile-body">
        <div className="creator-profile-hero">
          <span className="creator-profile-avatar">{profile.avatarUrl ? <img className="avatar-approved-image" src={profile.avatarUrl} alt="" loading="lazy" decoding="async" /> : profile.initials || 'NJ'}</span>
          <div>
            <h3>{profile.displayName}</h3>
            <p>{profile.headline || (profile.role === 'editor' ? 'Audio Editor on Nightjar.' : profile.role === 'listener' ? 'Part of the Nightjar listening community.' : 'Nightjar member.')}</p>
            {profile.pronouns && <small>{profile.pronouns}</small>}
            {availableProfileRoles.length > 0 && <div className="profile-role-chips" aria-label="Professional roles">{availableProfileRoles.map((role:string)=><button type="button" className={profileRole===role?'active':''} key={role} onClick={()=>setSelectedProfileRole(role)}>{roleLabel(role)}</button>)}</div>}
          </div>
          <div className="writer-discovery-actions">
            <button className="secondary-button" onClick={() => void onToggleFollow(profile.userId)}><Heart size={14} fill={following ? 'currentColor' : 'none'}/> {following ? 'Following' : 'Follow'}</button>
            {canMessage && onMessage && (profile.roles ?? [profile.role]).some((role:string)=>['creator','writer','editor','artist'].includes(role)) && <button className="secondary-button" onClick={() => onMessage(profile.userId)}><MessageCircle size={14}/> Message</button>}
            {(profile.roles ?? [profile.role]).some((role:string)=>['creator','writer','editor','artist'].includes(role)) && <button className="secondary-button" onClick={() => setGiftOpen(true)}><Bird size={14}/> Send Nightjars</button>}
            <button className="ghost-button" onClick={() => void share()}><Share2 size={14}/> Share</button>
          </div>
        </div>

        {profile.welcomeMessage && <p className="creator-profile-welcome">{profile.welcomeMessage}</p>}
        {profile.bio && <p className="creator-profile-bio">{profile.bio}</p>}

        <div className="public-profile-metrics">
          {profileMetrics.map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}
        </div>

        {!!profile.activityBadges?.length && <div className="profile-activity-badges public-profile-badges">
          {profile.activityBadges.map((badge:any)=><span key={badge.id} title={badge.detail}><ShieldCheck size={12}/>{badge.label}</span>)}
        </div>}

        {!!roleDetails.roleFocus?.length && <div className="creator-profile-tags">{roleDetails.roleFocus.map((item: string) => <span key={item}>{item}</span>)}</div>}
        {!!profile.favouriteTags?.length && <div className="creator-profile-tags">{profile.favouriteTags.map((item: string) => <span key={item}>{item}</span>)}</div>}

        <section className="public-role-profile">
          <div className="public-role-profile-head"><div><span className="mini-label">{roleLabel(profileRole).toUpperCase()} IDENTITY</span><h3>{roleConfig.title}</h3></div>{roleDetails.roleAvailability && <strong>{roleDetails.roleAvailability}</strong>}</div>
          <p>{roleConfig.description}</p>
          {!!roleDetails.roleSpecialties?.length && <div className="public-role-group"><span>{roleConfig.specialtiesLabel}</span><div className="creator-profile-tags">{roleDetails.roleSpecialties.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          {!!roleDetails.roleSecondary?.length && <div className="public-role-group"><span>{roleConfig.secondaryLabel}</span><div className="creator-profile-tags">{roleDetails.roleSecondary.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          {!!profile.favouriteCategories?.length && <div className="public-role-group"><span>{profileRole === 'listener' ? 'Favourite categories' : 'Relevant categories'}</span><div className="creator-profile-tags">{profile.favouriteCategories.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          {!!profile.favouriteTropes?.length && <div className="public-role-group"><span>{profileRole === 'listener' ? 'Favourite tropes' : 'Tropes & themes'}</span><div className="creator-profile-tags">{profile.favouriteTropes.map((item:string)=><span key={item}>{item}</span>)}</div></div>}
          {(roleDetails.roleDetailOne || roleDetails.roleDetailTwo) && <div className="public-role-copy">{roleDetails.roleDetailOne && <div><strong>{roleConfig.detailOneLabel}</strong><p>{roleDetails.roleDetailOne}</p></div>}{roleDetails.roleDetailTwo && <div><strong>{roleConfig.detailTwoLabel}</strong><p>{roleDetails.roleDetailTwo}</p></div>}</div>}
        </section>

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
          {(profile.completedCollaborations ?? 0) > 0 && <span><Handshake size={14}/>{profile.completedCollaborations} completed Nightjar collaboration{profile.completedCollaborations === 1 ? '' : 's'}</span>}
        </section>}

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

        {profileRole === 'artist' && <section className="public-artist-portfolio">
          <div className="section-head"><div><span className="mini-label">ARTIST PORTFOLIO</span><h3>Approved visual work</h3></div></div>
          {!!profile.artistPortfolio?.length ? <div className="public-artist-grid">
            {profile.artistPortfolio.map((item:any)=><article key={item.id}>
              {item.imageUrl && <button type="button" className="public-artist-image" onClick={()=>window.open(item.imageUrl,'_blank','noopener,noreferrer')} aria-label={'Open '+item.title+' full size'}><img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async"/></button>}
              <div><strong>{item.title}</strong>{item.commissionType&&<small>{item.commissionType}</small>}{item.description&&<p>{item.description}</p>}{!!item.tags?.length&&<div className="creator-profile-tags">{item.tags.map((tag:string)=><span key={tag}>{tag}</span>)}</div>}</div>
            </article>)}
          </div> : <div className="people-empty"><ImagePlus size={18}/><strong>No approved portfolio pieces yet</strong><span>This Artist has not published moderated artwork to their Nightjar portfolio yet.</span></div>}
        </section>}

        <div className="creator-profile-releases">
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
          {profileRole === 'creator' && !!profile.featuredWork?.length && <div className="public-featured-work">
            <span className="mini-label">FEATURED</span>
            {profile.featuredWork.map((release:any)=><article key={release.id}>
              <div><strong>{release.title}</strong><span>{release.creatorName ?? profile.displayName}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div>
              <div className="track-credit-line">{(release.contributors ?? []).filter((credit:any)=>credit.userId===profile.userId).map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}</span>)}</div>
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
          {(profileRole === 'writer' || profileRole === 'editor') && <div className="public-credit-summary">
            <span>{profileRole === 'writer' ? (profile.publishedWorkCount ?? 0) + ' published scripts' : 'Audio Editor'}</span>
            <strong>{profile.creditedReleaseCount ?? 0} credited release{profile.creditedReleaseCount === 1 ? '' : 's'}</strong>
          </div>}
          {(profileRole === 'writer' || profileRole === 'editor') && !!profile.creditedReleases?.length && <div className="public-credit-list">
            {profile.creditedReleases.slice(0,12).map((release:any)=><article key={release.id}>
              <div><strong>{release.title}</strong><span>{release.creatorName ?? 'Nightjar creator'}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div>
              <div className="track-credit-line">{(release.contributors ?? []).filter((credit:any)=>credit.userId===profile.userId).map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}</span>)}</div>
              <div className="public-work-community-actions"><span className="profile-release-community-counts"><span><ThumbsUp size={11}/>{communityByRelease[String(release.id)]?.likes ?? release.communityLikeCount ?? 0}</span><span><Heart size={11}/>{communityByRelease[String(release.id)]?.loves ?? release.communityLoveCount ?? 0}</span><span><MessageCircle size={11}/>{communityByRelease[String(release.id)]?.comments ?? release.communityCommentCount ?? 0}</span></span>{canReact && onReaction && <><button className={reactionByRelease[String(release.id)]==='like'?'ghost-button active-community-action':'ghost-button'} onClick={()=>onReaction(String(release.id),'like')}><ThumbsUp size={12} fill={reactionByRelease[String(release.id)]==='like'?'currentColor':'none'}/> Like</button><button className={reactionByRelease[String(release.id)]==='love'?'ghost-button active-community-action':'ghost-button'} onClick={()=>onReaction(String(release.id),'love')}><Heart size={12} fill={reactionByRelease[String(release.id)]==='love'?'currentColor':'none'}/> Love</button></>}{onCommunityRelease && <button className="ghost-button public-work-community-button" onClick={()=>onCommunityRelease(release)}><MessageCircle size={12}/> Comments</button>}</div>
            </article>)}
          </div>}
        </div>
      </div>}
    </section>
    {giftOpen && profile && <NightjarGiftPanel recipientUserId={profile.userId} recipientName={profile.displayName} recipientRole={String(profileRole)} recipientRoles={Array.isArray(profile.roles)?profile.roles:[]} notify={notify} onClose={() => setGiftOpen(false)} />}
  </div>;
}
