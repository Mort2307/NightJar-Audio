import { ArrowRight, Brush, CheckCircle2, Crown, FileCheck2, FileText, Headphones, Heart, Mic2, Play, Share2, Star, type LucideIcon } from 'lucide-react';
import ContextHelp from './ContextHelp';

export type SpotlightPerson = {
  kind: 'creator' | 'writer' | 'editor' | 'artist' | 'listener';
  name: string;
  handle?: string | null;
  title?: string;
  edition?: string;
  detail?: string;
  initials?: string;
  targetId?: string;
  releaseId?: string | null;
  listenerRank?: number;
  weeklyTopSevenCount?: number;
  publicProfile?: boolean;
  imageUrl?: string | null;
};

type Props = {
  spotlights: SpotlightPerson[];
  spotlightMeta?: { listenerTopSevenCount: number; listenerSpotlightDay: number | null; listenerWeek: string | null };
  viewerUserId?: string | null;
  followingIds: string[];
  simulationMode?: boolean;
  simulationRole?: SpotlightPerson['kind'] | null;
  onProfile: (userId: string) => void;
  onFollow: (userId: string) => void | Promise<void>;
  onShare: (spotlight: SpotlightPerson) => void | Promise<void>;
  onListen?: (releaseId: string) => void;
};

const roles: Record<SpotlightPerson['kind'], { label: string; icon: LucideIcon; singular: string }> = {
  creator: { label: 'VA CREATOR', singular: 'voice', icon: Mic2 },
  writer: { label: 'WRITER', singular: 'story', icon: FileText },
  editor: { label: 'AUDIO EDITOR', singular: 'craft', icon: FileCheck2 },
  artist: { label: 'ARTIST', singular: 'vision', icon: Brush },
  listener: { label: 'LISTENER', singular: 'community', icon: Headphones },
};

const labelFor = (person: SpotlightPerson) => person.kind === 'listener'
  ? 'A listener who makes Nightjar matter'
  : person.kind === 'creator' ? 'The voice behind the feeling'
    : person.kind === 'writer' ? 'The imagination behind the words'
      : person.kind === 'editor' ? 'The craft behind the sound'
        : 'The artistry behind the world';

function PersonCard({ person, viewerUserId, followingIds, simulationMode, simulationRole, onProfile, onFollow, onShare, onListen }: Props & {person: SpotlightPerson}) {
  const role = roles[person.kind];
  const Icon = role.icon;
  const canVisit = person.publicProfile !== false && Boolean(person.targetId);
  const isSelf = Boolean(!simulationMode && viewerUserId && person.targetId === viewerUserId);
  const isDemoSelf = Boolean(simulationMode && simulationRole === person.kind);
  const followed = person.targetId ? followingIds.includes(person.targetId) : false;
  return <article className="nj-spotlight-card" data-role={person.kind} id={'spotlight-' + person.kind}>
    <button type="button" className="nj-spotlight-portrait nj-spotlight-portrait-trigger" aria-label={'Open '+person.name+' public profile'} disabled={!canVisit} onClick={()=>{if(person.targetId) onProfile(person.targetId);}}>
      {person.imageUrl && person.publicProfile !== false
        ? <>
          <img className="nj-spotlight-portrait-backdrop" src={person.imageUrl} alt="" aria-hidden="true" loading="lazy" decoding="async"/>
          <img className="nj-spotlight-portrait-img" src={person.imageUrl} alt={person.name + ' approved Nightjar profile portrait'} loading="lazy" decoding="async"/>
        </>
        : <span className="nj-spotlight-monogram" aria-hidden="true">{person.publicProfile === false ? 'NJ' : person.initials || person.name.slice(0,2).toUpperCase()}</span>}
    </button>
    <div className="nj-spotlight-story">
      <div className="nj-spotlight-portrait-stamp"><Icon size={17}/>{role.label}</div>
      <div className="nj-spotlight-eyebrow"><span><Star size={13} fill="currentColor"/> IN THE SPOTLIGHT</span><span>SPOTLIGHT DAY</span></div>
      <p className="nj-spotlight-editorial">{labelFor(person)}</p>
      <h3>{person.name}</h3>
      {person.handle && person.publicProfile !== false && <p className="nj-spotlight-handle">@{person.handle.replace(/^@/, '')}</p>}
      {person.title && <p className="nj-spotlight-headline">{person.title}</p>}
      <p className="nj-spotlight-story-text">{person.kind === 'listener'
        ? 'Here’s to the listeners who keep coming back for another story.'
        : person.detail || 'Meet one of the people behind Nightjar.'}</p>
      {person.kind === 'listener' && person.listenerRank && <div className="nj-spotlight-listener-recognition"><Headphones size={15}/> Previous-week listener recognition · Day {person.listenerRank} of {person.weeklyTopSevenCount ?? 7}</div>}
      {(isSelf || isDemoSelf) && <div className="nj-spotlight-personal-moment">
        <Star size={19} aria-hidden="true"/>
        <span><strong>{isDemoSelf ? 'SPOTLIGHT PREVIEW' : 'IT’S YOUR SPOTLIGHT DAY!'}</strong>
        <small>{isDemoSelf ? 'Illustrative role-testing view. Do not share demo identities.' : 'The stage is yours. Let’s make some noise and celebrate your Nightjar moment.'}</small></span>
      </div>}
      <div className="nj-spotlight-card-actions">
        {canVisit && <button type="button" className="primary-button" onClick={()=>onProfile(person.targetId!)}><ArrowRight size={15}/> {isSelf ? 'See my feature' : 'Meet '+(person.kind === 'listener' ? 'this listener' : 'the '+roles[person.kind].label.toLowerCase())}</button>}
        {person.releaseId && onListen && <button type="button" className="secondary-button" onClick={()=>onListen(person.releaseId!)}><Play size={14}/> Listen to their work</button>}
        {canVisit && person.targetId !== viewerUserId && <button type="button" className="secondary-button" onClick={()=>void onFollow(person.targetId!)}><Heart size={15} fill={followed ? 'currentColor' : 'none'}/>{followed ? 'Following' : 'Follow'}</button>}
        {canVisit && !simulationMode && <button type="button" className="secondary-button nj-spotlight-share" onClick={()=>void onShare(person)}><Share2 size={15}/>{isSelf ? 'Share my spotlight' : 'Share this spotlight'}</button>}
      </div>
    </div>
  </article>;
}

export default function SpotlightExperience(props: Props) {
  const available = props.spotlights.filter(p=>p?.kind && p?.name);
  // Editorial equality: the existing server-selected rotation chooses who
  // appears, while every profession now receives the same full-width card.
  const ordered = available;

  return <section className="spotlight-section section-wrap nj-spotlight-experience" aria-labelledby="daily-spotlights-title">
    <header className="nj-spotlight-section-head">
      <div className="nj-spotlight-section-kicker"><span className="nj-spotlight-kicker-icon"><Crown size={17}/></span> THE NIGHTJAR SPOTLIGHT <span className="nj-spotlight-live"><span/> LIVE TODAY</span></div>
      <h2 id="daily-spotlights-title">Meet today's <em>spotlight.</em> <ContextHelp topic="spotlight-rotation"/></h2>
      <p>A new day, another voice, writer, artist, editor or listener to get to know.</p>
      <div className="nj-spotlight-promises"><span><CheckCircle2 size={14}/> A place for every creative discipline</span><span><Star size={14} aria-hidden="true"/> Featured members rotate</span></div>
    </header>
    {ordered.length ? <>
      <div className="nj-spotlight-editorial-grid">
        {ordered.map(person=><PersonCard key={person.kind+':'+person.targetId} {...props} person={person}/>)}
      </div>
      <p className="nj-spotlight-outro"><Star size={14} aria-hidden="true"/> Everyone featured gets a day in the spotlight.</p>
    </> : <div className="nj-spotlight-empty"><Star size={24}/><strong>No spotlight today.</strong><p>Featured members appear here when an eligible profile is available.</p></div>}
  </section>;
}
