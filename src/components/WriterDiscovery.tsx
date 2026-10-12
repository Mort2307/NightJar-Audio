import { useEffect, useMemo, useState } from 'react';
import { nightjarCommunity } from '../platform/firebase-community';
import { demoDirectory } from '../demo/nightjarDemo';
import { FileText, Heart, Search, Share2, ShieldCheck, X } from 'lucide-react';
import { ROLE_PROFILE_CONFIG } from '../data/nightjarTaxonomy';
import CollaborationHistoryButton from './CollaborationHistoryButton';

type Writer = {
  userId: string;
  name: string;
  handle?: string | null;
  headline?: string | null;
  bio?: string | null;
  initials?: string | null;
  avatarUrl?: string | null;
  welcomeMessage?: string | null;
  pronouns?: string | null;
  roleFocus?: string[];
  favouriteTags?: string[];
  favouriteTropes?: string[];
  favouriteCategories?: string[];
  roleSpecialties?: string[];
  roleSecondary?: string[];
  roleAvailability?: string | null;
  roleDetailOne?: string | null;
  roleDetailTwo?: string | null;
  followerCount?: number;
  followingCount?: number;
  publishedWorkCount?: number;
  creditedReleaseCount?: number;
  creditedReleases?: any[];
  completedCollaborations?: number;
  portfolioNote?: string | null;
  featuredWork?: any[];
  activityBadges?: { id: string; label: string; detail: string }[];
};

type Props = {
  followingIds: string[];
  onToggleFollow: (userId: string) => Promise<void>;
  notify: (message: string) => void;
  demoMode?: boolean;
};

export default function WriterDiscovery({ followingIds, onToggleFollow, notify, demoMode = false }: Props) {
  const [writers, setWriters] = useState<Writer[]>([]);
  const [selected, setSelected] = useState<Writer | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    if (demoMode) {
      setWriters(demoDirectory.filter((person) => person.role === 'writer').map((person) => ({
        userId: person.userId, name: person.name, handle: person.name.toLowerCase().replaceAll(' ', ''),
        initials: person.name.split(' ').map((part) => part[0]).join(''),
        headline: 'Fictional Nightjar writer profile', publishedWorkCount: person.userId === 'demo-writer-mara' ? 3 : 1,
        bio: 'A sample profile for testing writer discovery and follows.',
        favouriteTags: ['Dialogue-heavy','Story-led'],
        favouriteTropes: ['Slow burn','Mutual pining'],
        favouriteCategories: ['Erotic romance','Audio drama'],
        roleFocus: ['Script writing','Dialogue writing'],
        roleSpecialties: ['Dialogue','Character development','Romance'],
        roleSecondary: ['Single-voice script','Series / episodic'],
        roleAvailability: 'Open to commissions',
        roleDetailOne: 'Dialogue-first writing with strong character progression.',
        roleDetailTwo: 'Licensing and collaboration stay inside protected Nightjar workflows.',
        followerCount: 486,
        followingCount: 76,
        completedCollaborations: person.userId === 'demo-writer-mara' ? 3 : 1,
        portfolioNote: 'A few credited productions that show the kind of writing I most enjoy.',
        featuredWork: [],
        activityBadges: [
          { id:'published-writer', label:'Published Writer', detail:'Has published writing recorded by Nightjar.' },
          { id:'completed-collaborator', label:'Completed Collaborator', detail:'Has completed Nightjar collaborations.' },
        ],
      })));
      setLoading(false);
      return () => { cancelled = true; };
    }
    setLoading(true);
    void nightjarCommunity.listWriters().then((data) => {
      if (!cancelled) setWriters(data?.writers ?? []);
    }).catch(() => {
      if (!cancelled) notify('Writer discovery could not be loaded.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [demoMode]);

  const specialtyOptions = useMemo(() => Array.from(new Set(
    writers.flatMap((writer) => [...(writer.roleSpecialties ?? []), ...(writer.roleFocus ?? []), ...(writer.favouriteTags ?? [])]),
  )).sort((a, b) => a.localeCompare(b)), [writers]);
  const availabilityOptions = useMemo(() => Array.from(new Set(
    writers.map((writer) => writer.roleAvailability).filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b)), [writers]);
  const filteredWriters = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return writers.filter((writer) => {
      const searchable = [
        writer.name,
        writer.handle,
        writer.headline,
        writer.bio,
        writer.roleAvailability,
        ...(writer.roleFocus ?? []),
        ...(writer.roleSpecialties ?? []),
        ...(writer.roleSecondary ?? []),
        ...(writer.favouriteTags ?? []),
        ...(writer.favouriteTropes ?? []),
        ...(writer.favouriteCategories ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      if (needle && !searchable.includes(needle)) return false;
      if (specialtyFilter !== 'all' && ![...(writer.roleSpecialties ?? []), ...(writer.roleFocus ?? []), ...(writer.favouriteTags ?? [])].includes(specialtyFilter)) return false;
      if (availabilityFilter !== 'all' && writer.roleAvailability !== availabilityFilter) return false;
      return true;
    });
  }, [writers, query, specialtyFilter, availabilityFilter]);

  const share = async (writer: Writer) => {
    if (demoMode) return notify('Fictional demo profiles cannot be shared outside Nightjar.');
    const url = window.location.origin + '/discover#writer-discovery-title';
    const text = 'Meet ' + writer.name + ' on Nightjar — a writer creating work for immersive audio.';
    try {
      if (navigator.share) await navigator.share({ title: 'Nightjar · ' + writer.name, text, url });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text + ' ' + url); notify('Writer profile copied — ready to share.'); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) notify('Writer sharing could not be opened.');
    }
  };

  const openWriter = async (writer: Writer) => {
    if (demoMode) {
      setSelected(writer);
      return;
    }
    try {
      const data = await nightjarCommunity.getPublicProfile(writer.userId);
      const profile = data?.profile ?? {};
      setSelected({
        ...writer,
        ...profile,
        name: profile.displayName ?? writer.name,
      });
    } catch {
      notify('Writer profile could not be loaded.');
    }
  };

  return <>
    <section className="writer-discovery-section section-wrap" aria-labelledby="writer-discovery-title">
      <div className="section-head"><div><p className="eyebrow"><FileText size={14}/> WRITERS</p><h2 id="writer-discovery-title">Meet the people behind the words.</h2></div><span className="mini-label">{filteredWriters.length} OF {writers.length} PUBLIC WRITERS</span></div>
      <p className="section-copy">Search by writer, trope, specialty, format or availability without exposing protected manuscript text. Public identity and credited work stay separate from private production material.</p>
      <div className="role-directory-tools">
        <label className="creator-directory-search"><Search size={16}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search writer, trope, specialty…"/></label>
        <select value={specialtyFilter} onChange={(event)=>setSpecialtyFilter(event.target.value)}><option value="all">All specialties</option>{specialtyOptions.map((option)=><option value={option} key={option}>{option}</option>)}</select>
        <select value={availabilityFilter} onChange={(event)=>setAvailabilityFilter(event.target.value)}><option value="all">Any availability</option>{availabilityOptions.map((option)=><option value={option} key={option}>{option}</option>)}</select>
      </div>
      {loading ? <div className="people-empty">Loading writers…</div> : <div className="writer-discovery-grid">{filteredWriters.map((writer) => <article className="writer-discovery-card" key={writer.userId}><span className="writer-discovery-avatar">{writer.avatarUrl ? <img className="avatar-approved-image" src={writer.avatarUrl} alt="" loading="lazy" decoding="async" /> : writer.initials || 'NJ'}</span><div><h3>{writer.name}</h3><span>{writer.handle ? '@' + writer.handle.replace(/^@/, '') : 'Writer'}</span><p>{writer.headline || writer.bio || 'An independent Nightjar writer.'}</p>{writer.roleAvailability && <span className="creator-availability-pill">{writer.roleAvailability}</span>}{!![...(writer.roleSpecialties??[]),...(writer.roleFocus??[])].length && <div className="writer-focus-list">{[...(writer.roleSpecialties??[]),...(writer.roleFocus??[])].slice(0,4).map((item) => <span key={item}>{item}</span>)}</div>}<small>{writer.publishedWorkCount ?? 0} public-facing works</small></div><div className="writer-discovery-actions"><button className="secondary-button" onClick={() => void openWriter(writer)}>Explore writer</button><button className="ghost-button" onClick={() => void onToggleFollow(writer.userId)}><Heart size={14} fill={followingIds.includes(writer.userId) ? 'currentColor' : 'none'}/> {followingIds.includes(writer.userId) ? 'Following' : 'Follow'}</button><button className="ghost-button" onClick={() => void share(writer)}><Share2 size={14}/> Share</button></div></article>)}</div>}
      {!loading && !writers.length && <div className="people-empty"><FileText size={18}/><strong>No public writers yet.</strong><span>Writer profiles will appear here as they choose to be discoverable.</span></div>}
      {!loading && writers.length > 0 && !filteredWriters.length && <div className="people-empty"><Search size={18}/><strong>No writers match those filters.</strong><span>Try another specialty, availability state or search term.</span></div>}
    </section>

    {selected && <div className="creator-profile-backdrop" role="dialog" aria-modal="true" aria-label="Writer profile">
      <section className="creator-profile-modal">
        <header className="creator-profile-head"><div><span className="mini-label">NIGHTJAR / WRITER</span><h2>{selected.name}</h2><p>{selected.handle ? '@' + selected.handle.replace(/^@/, '') : 'Independent Nightjar writer'}</p></div><button className="icon-button" onClick={() => setSelected(null)} aria-label="Close writer profile"><X size={18}/></button></header>
        <div className="creator-profile-body">
          <div className="creator-profile-hero"><span className="creator-profile-avatar">{selected.avatarUrl ? <img className="avatar-approved-image" src={selected.avatarUrl} alt="" /> : selected.initials || 'NJ'}</span><div><h3>{selected.name}</h3><p>{selected.headline || 'Writer for immersive audio.'}</p>{selected.pronouns && <small>{selected.pronouns}</small>}</div><div className="writer-discovery-actions"><button className="secondary-button" onClick={() => void onToggleFollow(selected.userId)}><Heart size={14} fill={followingIds.includes(selected.userId) ? 'currentColor' : 'none'}/> {followingIds.includes(selected.userId) ? 'Following' : 'Follow writer'}</button><button className="ghost-button" onClick={() => void share(selected)}><Share2 size={14}/> Share</button></div></div>
          {selected.welcomeMessage && <p className="creator-profile-welcome">{selected.welcomeMessage}</p>}{selected.bio && <p className="creator-profile-bio">{selected.bio}</p>}
          <div className="public-profile-metrics">
            <div><span>Followers</span><strong>{selected.followerCount ?? 0}</strong></div>
            <div><span>Following</span><strong>{selected.followingCount ?? 0}</strong></div>
            <div><span>Published scripts</span><strong>{selected.publishedWorkCount ?? 0}</strong></div>
            <div><span>Release credits</span><strong>{selected.creditedReleaseCount ?? 0}</strong></div>
            <div><span>Collaborations</span><CollaborationHistoryButton userId={selected.userId} displayName={selected.name} count={selected.completedCollaborations ?? 0} demoMode={demoMode} compact /></div>
          </div>
          {!!selected.activityBadges?.length && <div className="profile-activity-badges public-profile-badges">{selected.activityBadges.map((badge)=><span key={badge.id} title={badge.detail}><ShieldCheck size={12}/>{badge.label}</span>)}</div>}
          {!!selected.roleFocus?.length && <div className="creator-profile-tags">{selected.roleFocus.map((item) => <span key={item}>{item}</span>)}</div>}
          {!!selected.favouriteTags?.length && <div className="creator-profile-tags">{selected.favouriteTags.map((item) => <span key={item}>{item}</span>)}</div>}
          <section className="public-role-profile">
            <div className="public-role-profile-head"><div><span className="mini-label">WRITER IDENTITY</span><h3>{ROLE_PROFILE_CONFIG.writer.title}</h3></div>{selected.roleAvailability && <strong>{selected.roleAvailability}</strong>}</div>
            <p>{ROLE_PROFILE_CONFIG.writer.description}</p>
            {!!selected.roleSpecialties?.length && <div className="public-role-group"><span>{ROLE_PROFILE_CONFIG.writer.specialtiesLabel}</span><div className="creator-profile-tags">{selected.roleSpecialties.map((item)=><span key={item}>{item}</span>)}</div></div>}
            {!!selected.roleSecondary?.length && <div className="public-role-group"><span>{ROLE_PROFILE_CONFIG.writer.secondaryLabel}</span><div className="creator-profile-tags">{selected.roleSecondary.map((item)=><span key={item}>{item}</span>)}</div></div>}
            {!!selected.favouriteCategories?.length && <div className="public-role-group"><span>Relevant categories</span><div className="creator-profile-tags">{selected.favouriteCategories.map((item)=><span key={item}>{item}</span>)}</div></div>}
            {!!selected.favouriteTropes?.length && <div className="public-role-group"><span>Tropes & themes</span><div className="creator-profile-tags">{selected.favouriteTropes.map((item)=><span key={item}>{item}</span>)}</div></div>}
            {(selected.roleDetailOne || selected.roleDetailTwo) && <div className="public-role-copy">{selected.roleDetailOne && <div><strong>{ROLE_PROFILE_CONFIG.writer.detailOneLabel}</strong><p>{selected.roleDetailOne}</p></div>}{selected.roleDetailTwo && <div><strong>{ROLE_PROFILE_CONFIG.writer.detailTwoLabel}</strong><p>{selected.roleDetailTwo}</p></div>}</div>}
          </section>
          {(selected.portfolioNote || (selected.completedCollaborations ?? 0) > 0) && <section className="public-showcase-intro">
            {selected.portfolioNote && <p>{selected.portfolioNote}</p>}
            {(selected.completedCollaborations ?? 0) > 0 && <CollaborationHistoryButton userId={selected.userId} displayName={selected.name} count={selected.completedCollaborations ?? 0} demoMode={demoMode} />}
          </section>}
          <div className="writer-public-note"><FileText size={16}/><div><strong>Public writing identity, protected manuscripts.</strong><p>Nightjar shows public profile metadata and credits without exposing private manuscript text, collaboration permissions, protected drafts or private deal terms.</p></div></div>
          <div className="creator-profile-releases">
            <div className="section-head"><div><span className="mini-label">PUBLIC WORK</span><h3>Writing portfolio</h3></div></div>
            {!!selected.featuredWork?.length && <div className="public-featured-work"><span className="mini-label">FEATURED BY WRITER</span>{selected.featuredWork.map((release:any)=><article key={release.id}><div><strong>{release.title}</strong><span>{release.creatorName ?? 'Nightjar creator'}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div><div className="track-credit-line">{(release.contributors ?? []).filter((credit:any)=>credit.userId===selected.userId).map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}</span>)}</div></article>)}</div>}
            {!!selected.creditedReleases?.length && <div className="public-credit-list">{selected.creditedReleases.slice(0,12).map((release:any)=><article key={release.id}><div><strong>{release.title}</strong><span>{release.creatorName ?? 'Nightjar creator'}{release.seriesTitle ? ' · ' + release.seriesTitle : ''}</span></div><div className="track-credit-line">{(release.contributors ?? []).filter((credit:any)=>credit.userId===selected.userId).map((credit:any)=><span key={credit.role + ':' + credit.name}>{credit.role}</span>)}</div></article>)}</div>}
            {!selected.creditedReleases?.length && <div className="people-empty"><FileText size={18}/><strong>{selected.publishedWorkCount ?? 0} published script{selected.publishedWorkCount === 1 ? '' : 's'}.</strong><span>Protected script text is never exposed here. Release credits will appear when published work is linked to a Nightjar release.</span></div>}
          </div>
        </div>
      </section>
    </div>}
  </>;
}
