import { useEffect, useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import { Heart, Search } from 'lucide-react';

type FollowingProfile = {
  userId: string;
  role?: string | null;
  name: string;
  handle?: string | null;
  headline?: string | null;
  publicProfile?: boolean;
};

type Props = {
  followingIds: string[];
  onToggleFollow: (profileUserId: string) => Promise<void>;
  notify: (message: string) => void;
};

export default function FollowingList({ followingIds, onToggleFollow, notify }: Props) {
  const [profiles, setProfiles] = useState<FollowingProfile[]>([]);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.get('/api/following').then(({ data }) => {
      if (!cancelled) setProfiles(data?.profiles ?? []);
    }).catch(() => {
      if (!cancelled) notify('Your following list could not be loaded.');
    });
    return () => { cancelled = true; };
  }, [followingIds.join('|')]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return profiles.filter((profile) => !search || [profile.name, profile.handle, profile.headline, profile.role].filter(Boolean).some((value) => String(value).toLowerCase().includes(search)));
  }, [profiles, query]);

  const unfollow = async (userId: string) => {
    setBusyId(userId);
    try {
      await onToggleFollow(userId);
      setProfiles((items) => items.filter((item) => item.userId !== userId));
    } finally {
      setBusyId(null);
    }
  };

  return <article className="panel following-panel">
    <div className="section-head"><div><p className="eyebrow"><Heart size={14}/> FOLLOWING</p><h2>Your support network.</h2></div><span className="mini-label">{profiles.length} FOLLOWING</span></div>
    <p className="panel-note">These follows belong to your account and are independent of your identity or declared taste.</p>
    {profiles.length > 5 && <label className="profile-search following-search"><Search size={14}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search who you follow…" aria-label="Search profiles you follow"/></label>}
    <div className="following-list">
      {filtered.map((profile) => <div className="following-row" key={profile.userId}>
        <span className="following-avatar">{profile.name.slice(0,2).toUpperCase()}</span>
        <span><strong>{profile.name}</strong><small>{profile.publicProfile === false ? 'Private profile' : profile.handle ? '@' + profile.handle.replace(/^@/, '') : profile.role || 'Nightjar profile'}</small></span>
        <button className="secondary-button with-icon" disabled={busyId === profile.userId} onClick={() => void unfollow(profile.userId)}><Heart size={14} fill="currentColor"/> Following</button>
      </div>)}
      {!filtered.length && <div className="people-empty"><Heart size={17}/><strong>{profiles.length ? 'No matches.' : 'You are not following anyone yet.'}</strong><span>Explore the community and support as many profiles as you choose.</span></div>}
    </div>
  </article>;
}
