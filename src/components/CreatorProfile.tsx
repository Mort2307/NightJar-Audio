import { useEffect, useState } from 'react';
import { nightjarCommunity } from '../platform/firebase-community';
import { ArrowRight, Heart, Mic2, Share2 } from 'lucide-react';
import { demoCreators, demoTracks } from '../demo/nightjarDemo';
import { ROLE_PROFILE_CONFIG } from '../data/nightjarTaxonomy';

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
  demoMode?: boolean;
};

export default function CreatorProfile({ creatorUserId, followingIds, onToggleFollow, onPlayRelease, onClose, notify, demoMode = false }: Props) {
  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [loading, setLoading] = useState(false);

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
        followers:creator.followers, followingCount:42, releases, favouriteTags:['Atmospheric','Story-led','After-hours tension'],
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
    const url = window.location.origin + '/creators';
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
    <section className="creator-profile-modal">
      <header className="creator-profile-head"><div><span className="mini-label">NIGHTJAR / CREATOR</span><h2>{loading ? 'Loading creator…' : profile?.name ?? 'Creator profile'}</h2><p>{profile?.handle ? '@' + profile.handle.replace(/^@/, '') : 'Independent Nightjar creator'}</p></div><button className="icon-button" onClick={onClose}>×</button></header>
      {profile && <div className="creator-profile-body">
        <div className="creator-profile-hero"><span className="creator-profile-avatar">{profile.avatarUrl ? <img className="avatar-approved-image" src={profile.avatarUrl} alt="" /> : profile.initials || 'NJ'}</span><div><h3>{profile.name}</h3><p>{profile.headline || 'Creator-led immersive audio.'}</p>{profile.pronouns && <small>{profile.pronouns}</small>}</div><button className="secondary-button" onClick={() => void onToggleFollow(profile.userId)}><Heart size={14} fill={following ? 'currentColor' : 'none'} /> {following ? 'Following' : 'Follow creator'}</button></div>
        <div className="public-profile-metrics">
          <div><span>Followers</span><strong>{profile.followers ?? 0}</strong></div>
          <div><span>Following</span><strong>{profile.followingCount ?? 0}</strong></div>
          <div><span>Released work</span><strong>{profile.releases?.length ?? 0}</strong></div>
        </div>
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
        <div className="creator-profile-releases"><div className="section-head"><div><span className="mini-label">CATALOGUE</span><h3>Released work</h3></div><button className="ghost-button" onClick={() => void share()}><Share2 size={14} /> Share</button></div>{profile.releases?.length ? profile.releases.map((release: any) => <article key={release.id} className="creator-profile-release"><div><strong>{release.title}</strong><span>{release.category || 'Audio'} · {release.durationMinutes ? release.durationMinutes + ' min' : 'Duration pending'}</span><p>{release.description || 'No description supplied.'}</p></div><button className="round-play" onClick={() => onPlayRelease(release)} aria-label={'Play ' + release.title}><ArrowRight size={15} /></button></article>) : <div className="people-empty"><Mic2 size={18} /><strong>No public releases yet.</strong><span>Check back as this creator publishes.</span></div>}</div>
      </div>}
    </section>
  </div>;
}
