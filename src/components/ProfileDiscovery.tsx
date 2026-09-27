import { useEffect, useMemo, useState } from 'react';
import { api } from '@appdeploy/client';
import { Heart, Search, Users } from 'lucide-react';

type PublicProfile = {
  userId: string;
  role?: string | null;
  name: string;
  handle?: string | null;
  headline?: string | null;
  bio?: string | null;
  pronouns?: string | null;
  initials?: string | null;
  roleFocus?: string[];
  followers?: number;
};

type Props = {
  followingIds: string[];
  onToggleFollow: (profileUserId: string) => Promise<void>;
  onOpenCreator?: (profileUserId: string) => void;
  notify: (message: string) => void;
};

const roleLabel = (role?: string | null) => {
  if (role === 'creator') return 'Creator';
  if (role === 'writer') return 'Writer';
  if (role === 'editor') return 'Editor';
  if (role === 'admin') return 'Administrator';
  return 'Listener';
};

export default function ProfileDiscovery({ followingIds, onToggleFollow, onOpenCreator, notify }: Props) {
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.get('/api/profiles').then(({ data }) => {
      if (!cancelled) setProfiles(data?.profiles ?? []);
    }).catch(() => {
      if (!cancelled) notify('Community profiles could not be loaded.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return profiles.filter((profile) => {
      if (role !== 'all' && profile.role !== role) return false;
      if (!search) return true;
      return [profile.name, profile.handle, profile.headline, profile.bio, ...(profile.roleFocus ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search));
    });
  }, [profiles, query, role]);

  const toggle = async (profileUserId: string) => {
    if (busyId) return;
    setBusyId(profileUserId);
    try {
      await onToggleFollow(profileUserId);
    } finally {
      setBusyId(null);
    }
  };

  return <section className="profile-discovery panel-card" aria-labelledby="community-discovery-title">
    <div className="section-head">
      <div>
        <p className="eyebrow"><Users size={14} /> COMMUNITY</p>
        <h2 id="community-discovery-title">Find people worth supporting.</h2>
      </div>
      <span className="mini-label">{filtered.length} PROFILES</span>
    </div>
    <p className="section-copy">Follow as many public Nightjar profiles as you choose. Following is a support signal, not an identity label.</p>
    <div className="profile-discovery-tools">
      <label className="profile-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names, handles, bios or focus…" aria-label="Search community profiles" /></label>
      <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Filter community by role">
        <option value="all">All roles</option>
        <option value="creator">Creators</option>
        <option value="writer">Writers</option>
        <option value="listener">Listeners</option>
        <option value="editor">Editors</option>
      </select>
    </div>
    {loading ? <div className="people-empty">Loading community…</div> : filtered.length ? <div className="profile-discovery-grid">
      {filtered.map((profile) => {
        const following = followingIds.includes(profile.userId);
        return <article className="profile-discovery-card" key={profile.userId}>
          <span className="profile-discovery-avatar">{profile.initials || profile.name.slice(0, 2).toUpperCase()}</span>
          <div className="profile-discovery-copy">
            <div><span className="mini-label">{roleLabel(profile.role)}</span><h3>{profile.name}</h3><small>{profile.handle ? '@' + profile.handle.replace(/^@/, '') : 'Public Nightjar profile'}</small></div>
            <p>{profile.headline || profile.bio || 'Nightjar community member.'}</p>
            <div className="profile-discovery-meta"><span>{profile.followers ?? 0} followers</span>{profile.roleFocus?.slice(0, 2).map((item) => <span key={item}>{item}</span>)}</div>
          </div>
          <div className="profile-discovery-actions">
            {profile.role === 'creator' && onOpenCreator && <button className="ghost-button" onClick={() => onOpenCreator(profile.userId)}>View profile</button>}
            <button className={following ? 'secondary-button with-icon active' : 'secondary-button with-icon'} disabled={busyId === profile.userId} onClick={() => void toggle(profile.userId)} aria-pressed={following}>
              <Heart size={15} fill={following ? 'currentColor' : 'none'} /> {following ? 'Following' : 'Follow'}
            </button>
          </div>
        </article>;
      })}
    </div> : <div className="people-empty"><Search size={18}/><strong>No matching public profiles.</strong><span>Try another search or role filter.</span></div>}
  </section>;
}
