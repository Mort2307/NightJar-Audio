import { useEffect, useState } from 'react';
import { FileCheck2, Headphones, Heart, Share2, X } from 'lucide-react';
import { nightjarCommunity } from '../platform/firebase-community';
import { demoDirectory, demoTracks, demoWriterScripts } from '../demo/nightjarDemo';

type Props = {
  userId: string;
  followingIds: string[];
  onToggleFollow: (userId: string) => Promise<void>;
  onClose: () => void;
  notify: (message: string) => void;
  demoMode?: boolean;
};

const roleLabel = (role: string | null | undefined) => {
  if (role === 'editor') return 'Audio Editor';
  if (role === 'writer') return 'Writer';
  if (role === 'creator') return 'Creator';
  return 'Listener';
};

export default function PublicProfile({ userId, followingIds, onToggleFollow, onClose, notify, demoMode = false }: Props) {
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

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
        favouriteTags:['Cinematic','Story-led'],
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
    const url = window.location.origin + '/discover';
    try {
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

  return <div className="creator-profile-backdrop" role="dialog" aria-modal="true" aria-label="Nightjar public profile">
    <section className="creator-profile-modal">
      <header className="creator-profile-head">
        <div>
          <span className="mini-label">NIGHTJAR / {profile ? roleLabel(profile.role).toUpperCase() : 'PROFILE'}</span>
          <h2>{loading ? 'Loading profile…' : profile?.displayName ?? 'Nightjar profile'}</h2>
          <p>{profile?.handle ? '@' + String(profile.handle).replace(/^@/, '') : roleLabel(profile?.role)}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close public profile"><X size={18}/></button>
      </header>

      {profile && <div className="creator-profile-body">
        <div className="creator-profile-hero">
          <span className="creator-profile-avatar">{profile.avatarUrl ? <img className="avatar-approved-image" src={profile.avatarUrl} alt="" /> : profile.initials || 'NJ'}</span>
          <div>
            <h3>{profile.displayName}</h3>
            <p>{profile.headline || (profile.role === 'editor' ? 'Audio Editor on Nightjar.' : profile.role === 'listener' ? 'Part of the Nightjar listening community.' : 'Nightjar member.')}</p>
            {profile.pronouns && <small>{profile.pronouns}</small>}
          </div>
          <div className="writer-discovery-actions">
            <button className="secondary-button" onClick={() => void onToggleFollow(profile.userId)}><Heart size={14} fill={following ? 'currentColor' : 'none'}/> {following ? 'Following' : 'Follow'}</button>
            <button className="ghost-button" onClick={() => void share()}><Share2 size={14}/> Share</button>
          </div>
        </div>

        {profile.welcomeMessage && <p className="creator-profile-welcome">{profile.welcomeMessage}</p>}
        {profile.bio && <p className="creator-profile-bio">{profile.bio}</p>}

        {!!profile.roleFocus?.length && <div className="creator-profile-tags">{profile.roleFocus.map((item: string) => <span key={item}>{item}</span>)}</div>}
        {!!profile.favouriteTags?.length && <div className="creator-profile-tags">{profile.favouriteTags.map((item: string) => <span key={item}>{item}</span>)}</div>}

        <div className="writer-public-note">
          {profile.role === 'editor' ? <FileCheck2 size={16}/> : <Headphones size={16}/>}
          <div>
            <strong>{profile.role === 'editor' ? 'Public profile, private editorial work.' : 'Public profile.'}</strong>
            <p>{profile.role === 'editor'
              ? 'Nightjar can recognise this Audio Editor publicly without exposing assigned manuscripts, private notes or protected production work.'
              : 'This member chose to make their Nightjar profile visible to the community.'}</p>
          </div>
        </div>

        <div className="creator-profile-releases">
          <div className="section-head">
            <div>
              <span className="mini-label">PROFILE</span>
              <h3>{profile.followerCount ?? 0} followers</h3>
            </div>
          </div>
          {(profile.role === 'writer' || profile.role === 'editor') && <div className="public-credit-summary">
            <span>{profile.role === 'writer' ? (profile.publishedWorkCount ?? 0) + ' published scripts' : 'Audio Editor'}</span>
            <strong>{profile.creditedReleaseCount ?? 0} credited release{profile.creditedReleaseCount === 1 ? '' : 's'}</strong>
          </div>}
          {!!profile.creditedReleases?.length && <div className="public-credit-list">
            {profile.creditedReleases.slice(0,12).map((release:any)=><article key={release.id}>
              <div><strong>{release.title}</strong><span>{release.creatorName ?? 'Nightjar creator'}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div>
              <div className="track-credit-line">{(release.contributors ?? []).filter((credit:any)=>credit.userId===profile.userId).map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}</span>)}</div>
            </article>)}
          </div>}
        </div>
      </div>}
    </section>
  </div>;
}
