import { useEffect, useRef, useState } from 'react';
import { nightjarCommunity } from '../platform/firebase-community';
import { ArrowRight, Handshake, Heart, MessageCircle, Mic2, Share2, ShieldCheck, Sparkles } from 'lucide-react';
import { demoCreators, demoTracks } from '../demo/nightjarDemo';
import { ROLE_PROFILE_CONFIG } from '../data/nightjarTaxonomy';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

type CreatorProfileData = {
  userId: string;
  name: string;
  handle?: string | null;
  headline?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  initials?: string | null;
  avatarUrl?: string | null;
  welcomeMessage?: string | null;
  followers?: number;
  followingCount?: number;
  completedCollaborations?: number;
  portfolioNote?: string | null;
  featuredReleases?: any[];
  activityBadges?: { id: string; label: string; detail: string }[];
  releases?: any[];
  favouriteTags?: string[];
  favouriteTropes?: string[];
  favouriteCategories?: string[];
  roleFocus?: string[];
  roleSpecialties?: string[];
  roleSecondary?: string[];
  roleAvailability?: string | null;
  roleDetailOne?: string | null;
  roleDetailTwo?: string | null;
};

type Props = {
  creatorUserId: string | null;
  followingIds: string[];
  onToggleFollow: (creatorUserId: string) => Promise<void>;
  onPlayRelease: (release: any) => void;
  onClose: () => void;
  notify: (message: string) => void;
  canMessage?: boolean;
  onMessage?: (userId: string) => void;
  demoMode?: boolean;
};

export default function CreatorProfile({ creatorUserId, followingIds, onToggleFollow, onPlayRelease, onClose, notify, canMessage = false, onMessage, demoMode = false }: Props) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  useDialogFocusTrap(dialogRef, { onEscape: onClose });

  useEffect(() => {
    if (!creatorUserId) return;
    let cancelled = false;
    setLoading(true);
    if (demoMode) {
      const creator = demoCreators.find((item) => item.userId === creatorUserId);
      const releases = demoTracks.filter((item) => item.creatorUserId === creatorUserId).map((item:any) => ({
        ...item,
        creatorName:item.creator,
        durationMinutes:Number.parseFloat(item.duration),
        description:item.descriptor,
      }));
      setProfile(creator ? {
        userId:creator.userId, name:creator.name, handle:creator.handle, headline:creator.note,
        bio:'Fictional Nightjar demo profile used to preview a populated creator experience.',
        initials:creator.initials, avatarUrl:null, welcomeMessage:'Welcome to my Nightjar demo profile.',
        followers:creator.followers, followingCount:42, completedCollaborations:4, portfolioNote:'A few releases that best represent my current Nightjar work.', featuredReleases:releases.slice(0,2), activityBadges:[{id:'published-creator',label:'Published Creator',detail:'Has released work in the Nightjar catalogue.'},{id:'completed-collaborator',label:'Completed Collaborator',detail:'Has completed Nightjar collaborations.'}], releases, favouriteTags:['Atmospheric','Story-led','After-hours tension'],
        roleFocus:['Voice performance','Narration','Audio production'],
        roleSpecialties:['Character roleplay','Narration','Dramatic performance'],
        roleSecondary:['Close-mic performance','Series work','Remote collaboration'],
        roleAvailability:'Open to collaborations',
        roleDetailOne:'Character-led performance with restrained, intimate delivery and cinematic pacing.',
        roleDetailTwo:'Broadcast-quality home setup with remote direction available.',
      } : null);
      setLoading(false);
      return;
    }
    void nightjarCommunity.getCreatorProfile(creatorUserId).then((data) => {
      if (!cancelled) setProfile(data?.creator ?? null);
    }).catch(() => {
      if (!cancelled) notify('Creator profile could not be loaded.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorUserId, demoMode]);

  if (!creatorUserId) return null;
  const following = followingIds.includes(creatorUserId);

  const share = async () => {
    if (!profile) return;
    const url = window.location.origin + '/people/' + encodeURIComponent(creatorUserId);
    const text = 'Discover ' + profile.name + ' on Nightjar — original immersive audio from an independent creator.';
    try {
      if (navigator.share) await navigator.share({ title: 'Nightjar · ' + profile.name, text, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text + ' ' + url); notify('Creator profile copied — ready to share.'); }
      else notify('Sharing is not available in this browser.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Creator profile sharing could not be opened.');
    }
  };

  return <div className="creator-profile-backdrop" role="dialog" aria-modal="true">
    <section ref={dialogRef} tabIndex={-1} className="creator-profile-modal">
      <header className="creator-profile-head"><div><span className="mini-label">NIGHTJAR / CREATOR</span><h2>{loading ? 'Loading creator…' : profile?.name ?? 'Creator profile'}</h2><p>{profile?.handle ? '@' + profile.handle.replace(/^@/, '') : 'Independent Nightjar creator'}</p></div><button className="icon-button" onClick={onClose}>×</button></header>
      {profile && <div className="creator-profile-body">
        <div className="creator-profile-hero"><span className="creator-profile-avatar">{profile.avatarUrl ? <img className="avatar-approved-image" src={profile.avatarUrl} alt="" /> : profile.initials || 'NJ'}</span><div><h3>{profile.name}</h3><p>{profile.headline || 'Creator-led immersive audio.'}</p>{profile.pronouns && <small>{profile.pronouns}</small>}</div><div className="writer-discovery-actions"><button className="secondary-button" onClick={() => void onToggleFollow(profile.userId)}><Heart size={14} fill={following ? 'currentColor' : 'none'} /> {following ? 'Following' : 'Follow creator'}</button>{canMessage && onMessage && <button className="secondary-button" onClick={()=>onMessage(profile.userId)}><MessageCircle size={14}/> Message</button>}</div></div>
        <div className="public-profile-metrics">
          <div><span>Followers</span><strong>{profile.followers ?? 0}</strong></div>
          <div><span>Following</span><strong>{profile.followingCount ?? 0}</strong></div>
          <div><span>Released work</span><strong>{profile.releases?.length ?? 0}</strong></div>
          <div><span>Collaborations</span><strong>{profile.completedCollaborations ?? 0}</strong></div>
        </div>
        {!!profile.activityBadges?.length && <div className="profile-activity-badges public-profile-badges">{profile.activityBadges.map((badge)=><span key={badge.id} title={badge.detail}><ShieldCheck size={12}/>{badge.label}</span>)}</div>}
        {profile.welcomeMessage && <p className="creator-profile-welcome">{profile.welcomeMessage}</p>}{profile.bio && <p className="creator-profile-bio">{profile.bio}</p>}
        {!!profile.favouriteTags?.length && <div className="creator-profile-tags">{profile.favouriteTags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        <section className="public-role-profile">
          <div className="public-role-profile-head"><div><span className="mini-label">CREATOR IDENTITY</span><h3>{ROLE_PROFILE_CONFIG.creator.title}</h3></div>{profile.roleAvailability && <strong>{profile.roleAvailability}</strong>}</div>
          {!!profile.roleFocus?.length && <div className="creator-profile-tags">{profile.roleFocus.map((item)=><span key={item}>{item}</span>)}</div>}
          {!!profile.roleSpecialties?.length && <div className="public-role-group"><span>{ROLE_PROFILE_CONFIG.creator.specialtiesLabel}</span><div className="creator-profile-tags">{profile.roleSpecialties.map((item)=><span key={item}>{item}</span>)}</div></div>}
          {!!profile.roleSecondary?.length && <div className="public-role-group"><span>{ROLE_PROFILE_CONFIG.creator.secondaryLabel}</span><div className="creator-profile-tags">{profile.roleSecondary.map((item)=><span key={item}>{item}</span>)}</div></div>}
          {!!profile.favouriteCategories?.length && <div className="public-role-group"><span>Relevant categories</span><div className="creator-profile-tags">{profile.favouriteCategories.map((item)=><span key={item}>{item}</span>)}</div></div>}
          {!!profile.favouriteTropes?.length && <div className="public-role-group"><span>Tropes & themes</span><div className="creator-profile-tags">{profile.favouriteTropes.map((item)=><span key={item}>{item}</span>)}</div></div>}
          {(profile.roleDetailOne || profile.roleDetailTwo) && <div className="public-role-copy">{profile.roleDetailOne && <div><strong>{ROLE_PROFILE_CONFIG.creator.detailOneLabel}</strong><p>{profile.roleDetailOne}</p></div>}{profile.roleDetailTwo && <div><strong>{ROLE_PROFILE_CONFIG.creator.detailTwoLabel}</strong><p>{profile.roleDetailTwo}</p></div>}</div>}
        </section>
        {(profile.portfolioNote || (profile.completedCollaborations ?? 0) > 0) && <section className="public-showcase-intro">
          {profile.portfolioNote && <p>{profile.portfolioNote}</p>}
          {(profile.completedCollaborations ?? 0) > 0 && <span><Handshake size={14}/>{profile.completedCollaborations} completed Nightjar collaboration{profile.completedCollaborations === 1 ? '' : 's'}</span>}
        </section>}
        {!!profile.featuredReleases?.length && <section className="creator-featured-releases">
          <div className="section-head"><div><span className="mini-label">FEATURED BY CREATOR</span><h3>Start here</h3></div><Sparkles size={17}/></div>
          {profile.featuredReleases.map((release:any)=><article key={release.id} className="creator-profile-release featured">
            <div><strong>{release.title}</strong><span>{release.category || 'Audio'} · {release.durationMinutes ? release.durationMinutes + ' min' : 'Duration pending'}</span><p>{release.description || 'No description supplied.'}</p></div>
            <button className="round-play" onClick={()=>onPlayRelease(release)} aria-label={'Play ' + release.title}><ArrowRight size={15}/></button>
          </article>)}
        </section>}
        <div className="creator-profile-releases"><div className="section-head"><div><span className="mini-label">FULL CATALOGUE</span><h3>Released work</h3></div><button className="ghost-button" onClick={() => void share()}><Share2 size={14} /> Share</button></div>{profile.releases?.length ? profile.releases.map((release: any) => <article key={release.id} className="creator-profile-release"><div><strong>{release.title}</strong><span>{release.category || 'Audio'} · {release.durationMinutes ? release.durationMinutes + ' min' : 'Duration pending'}</span><p>{release.description || 'No description supplied.'}</p></div><button className="round-play" onClick={() => onPlayRelease(release)} aria-label={'Play ' + release.title}><ArrowRight size={15} /></button></article>) : <div className="people-empty"><Mic2 size={18} /><strong>No public releases yet.</strong><span>Check back as this creator publishes.</span></div>}</div>
      </div>}
    </section>
  </div>;
}
