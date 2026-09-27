import { useEffect, useState } from 'react';
import { nightjarCommunity } from '../platform/firebase-community';
import { ArrowRight, Heart, Mic2, Share2 } from 'lucide-react';

type CreatorProfileData = {
  userId: string;
  name: string;
  handle?: string | null;
  headline?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  initials?: string | null;
  followers?: number;
  releases?: any[];
  favouriteTags?: string[];
};

type Props = {
  creatorUserId: string | null;
  followingIds: string[];
  onToggleFollow: (creatorUserId: string) => Promise<void>;
  onPlayRelease: (release: any) => void;
  onClose: () => void;
  notify: (message: string) => void;
};

export default function CreatorProfile({ creatorUserId, followingIds, onToggleFollow, onPlayRelease, onClose, notify }: Props) {
  const [profile, setProfile] = useState<CreatorProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!creatorUserId) return;
    let cancelled = false;
    setLoading(true);
    void nightjarCommunity.getCreatorProfile(creatorUserId).then((data) => {
      if (!cancelled) setProfile(data?.creator ?? null);
    }).catch(() => {
      if (!cancelled) notify('Creator profile could not be loaded.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [creatorUserId]);

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
        <div className="creator-profile-hero"><span className="creator-profile-avatar">{profile.initials || 'NJ'}</span><div><h3>{profile.name}</h3><p>{profile.headline || 'Creator-led immersive audio.'}</p>{profile.pronouns && <small>{profile.pronouns}</small>}</div><button className="secondary-button" onClick={() => void onToggleFollow(profile.userId)}><Heart size={14} fill={following ? 'currentColor' : 'none'} /> {following ? 'Following' : 'Follow creator'}</button></div>
        {profile.bio && <p className="creator-profile-bio">{profile.bio}</p>}
        {!!profile.favouriteTags?.length && <div className="creator-profile-tags">{profile.favouriteTags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        <div className="creator-profile-releases"><div className="section-head"><div><span className="mini-label">CATALOGUE</span><h3>Released work</h3></div><button className="ghost-button" onClick={() => void share()}><Share2 size={14} /> Share</button></div>{profile.releases?.length ? profile.releases.map((release: any) => <article key={release.id} className="creator-profile-release"><div><strong>{release.title}</strong><span>{release.category || 'Audio'} · {release.durationMinutes ? release.durationMinutes + ' min' : 'Duration pending'}</span><p>{release.description || 'No description supplied.'}</p></div><button className="round-play" onClick={() => onPlayRelease(release)} aria-label={'Play ' + release.title}><ArrowRight size={15} /></button></article>) : <div className="people-empty"><Mic2 size={18} /><strong>No public releases yet.</strong><span>Check back as this creator publishes.</span></div>}</div>
      </div>}
    </section>
  </div>;
}
