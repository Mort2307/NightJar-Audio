import { useMemo, useState } from 'react';
import { ArrowRight, Heart, Search, Users } from 'lucide-react';

type Creator = { userId: string; name: string; handle?: string | null; followers?: number; releases?: number; initials?: string; note?: string; };
type Props = { creators: Creator[]; onOpen: (creatorUserId: string) => void; };

export default function CreatorDirectory({ creators, onOpen }: Props) {
  const [query, setQuery] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return creators;
    return creators.filter((creator) => [creator.name, creator.handle, creator.note].filter(Boolean).join(' ').toLowerCase().includes(term));
  }, [creators, query]);
  return <section className="page-wrap">
    <div className="page-heading"><div><p className="eyebrow">THE CREATOR NETWORK</p><h1>Voices with a world behind them.</h1><p>Discover independent creators building original catalogues for the Nightjar audience.</p></div></div>
    <div className="creator-directory-toolbar"><label className="creator-search"><Search size={15}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creators, handles or focus…" aria-label="Search creators" /></label><span className="mini-label">{filtered.length} OF {creators.length} CREATORS</span></div>
    <div className="creator-directory">{filtered.map((creator, index) => <article className="creator-profile" key={creator.userId}><div className="profile-number">{String(index + 1).padStart(2,'0')}</div><span className="avatar-xl">{creator.initials || creator.name.slice(0,2).toUpperCase()}</span><div className="profile-main"><div className="profile-heading"><div><h2>{creator.name}</h2><span>{creator.handle ? '@' + creator.handle.replace(/^@/,'') : 'Handle not set'}</span></div><button className="icon-button" onClick={() => setSavedId(savedId === creator.userId ? null : creator.userId)} aria-label={savedId === creator.userId ? 'Unsave creator' : 'Save creator'}><Heart size={17} fill={savedId === creator.userId ? 'currentColor' : 'none'} /></button></div><p>{creator.note || 'Nightjar creator profile.'}</p><div className="profile-stats"><span><strong>{creator.followers ?? 0}</strong> followers</span><span><strong>{creator.releases ?? 0}</strong> releases</span></div></div><button className="round-arrow" onClick={() => onOpen(creator.userId)} aria-label={'Open ' + creator.name + ' profile'}><ArrowRight size={18} /></button></article>)}</div>
    {!filtered.length && <div className="people-empty"><Users size={18}/><strong>{creators.length ? 'No creators match that search.' : 'No approved creator profiles yet.'}</strong><span>{creators.length ? 'Try another name, handle or creative focus.' : 'Creator discovery will populate from approved public accounts.'}</span></div>}
  </section>;
}