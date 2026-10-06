import { Brush, ImagePlus, MessageCircle, Sparkles, UsersRound } from 'lucide-react';
import { lazy, Suspense } from 'react';
import RoleDashboard, { type RoleDashboardAction } from './RoleDashboard';
import NightjarSkeleton from './NightjarSkeleton';

const ArtistPortfolioManager = lazy(() => import('./ArtistPortfolioManager'));
const CollaborationHub = lazy(() => import('./CollaborationHub'));

type Props = {
  profile: any;
  portfolioCount: number;
  completedCollaborations: number;
  messageUnreadCount: number;
  messageNeedsReplyCount: number;
  messageAwaitingReplyCount: number;
  accountStatus: 'active' | 'pending_review';
  actions: RoleDashboardAction[];
  notify: (message: string) => void;
  demoMode: boolean;
  simulationMode: boolean;
  demoSessionKey: number;
  onOpenProfile: () => void;
  onOpenMessages: () => void;
  onMessageUser: (userId: string, collaborationId?: string | null) => void;
};

export default function ArtistStudio({
  profile,
  portfolioCount,
  completedCollaborations,
  messageUnreadCount,
  messageNeedsReplyCount,
  messageAwaitingReplyCount,
  accountStatus,
  actions,
  notify,
  demoMode,
  simulationMode,
  demoSessionKey,
  onOpenProfile,
  onOpenMessages,
  onMessageUser,
}: Props) {
  const displayName = profile.displayName || 'Nightjar Artist';
  const headline = profile.roleHeadline || 'Human-made artwork for Nightjar stories and creators.';
  const services = Array.isArray(profile.roleSpecialties) ? profile.roleSpecialties : [];
  const strengths = Array.isArray(profile.roleSecondary) ? profile.roleSecondary : [];

  return <section className="page-wrap artist-studio-page">
    <header className="artist-studio-hero">
      <div className="artist-studio-mark"><Brush size={24}/></div>
      <div>
        <span className="eyebrow"><Sparkles size={13}/> ARTIST STUDIO</span>
        <h1>{displayName}</h1>
        <p>{headline}</p>
        <div className="creator-profile-tags">
          {services.slice(0,6).map((item:string)=><span key={item}>{item}</span>)}
        </div>
      </div>
      <div className="artist-studio-hero-actions">
        <button className="secondary-button" onClick={onOpenProfile}><Brush size={14}/> Edit Artist profile</button>
        <button className="secondary-button" onClick={onOpenMessages}><MessageCircle size={14}/> Messages{messageUnreadCount ? ' · '+messageUnreadCount : ''}</button>
      </div>
    </header>

    {accountStatus === 'pending_review' && <div className="admin-note"><Sparkles size={17}/><div><strong>ARTIST / PENDING REVIEW</strong><span>You can build your Nightjar identity now. Live professional collaboration and public portfolio publishing unlock after approval.</span></div></div>}

    <RoleDashboard
      eyebrow="ARTIST COMMAND CENTRE"
      title="Your artwork, portfolio and collaborations."
      description="Keep public visual work, professional identity and private creative conversations together without exposing briefs, source files or deal terms."
      metrics={[
        {label:'Portfolio',value:portfolioCount,detail:'Eligible / public Nightjar work'},
        {label:'Services',value:services.length,detail:'Creative services selected'},
        {label:'Collaborations',value:completedCollaborations,detail:'Completed on Nightjar'},
        {label:'Messages',value:messageUnreadCount,detail:messageNeedsReplyCount ? messageNeedsReplyCount+' need your reply' : messageAwaitingReplyCount ? messageAwaitingReplyCount+' awaiting reply' : 'Unread professional threads'},
      ]}
      actions={actions}
    />

    <div className="artist-studio-overview-grid">
      <article className="panel artist-studio-card">
        <span className="mini-label">VISUAL PRACTICE</span>
        <h2>{headline}</h2>
        <p>{profile.roleBio || 'Add your Artist role story so creators immediately understand your visual language, commission fit and working style.'}</p>
        {!!strengths.length && <div className="creator-profile-tags">{strengths.slice(0,8).map((item:string)=><span key={item}>{item}</span>)}</div>}
        <button className="ghost-button" onClick={onOpenProfile}>Strengthen Artist profile</button>
      </article>
      <article className="panel artist-studio-card">
        <span className="mini-label">COMMISSION STATUS</span>
        <h2>{profile.roleAvailability || 'Availability not set'}</h2>
        <p>Public availability is separate from private pricing, licensing terms and briefs. Keep deal-specific information inside Nightjar messaging.</p>
        <button className="ghost-button" onClick={onOpenMessages}>Open professional Inbox</button>
      </article>
      <article className="panel artist-studio-card">
        <span className="mini-label">HUMAN ARTWORK</span>
        <h2>Moderated before public display.</h2>
        <p>Nightjar portfolio submissions require a human-created attestation and remain private until image moderation approves them.</p>
        <ImagePlus size={20}/>
      </article>
    </div>

    <Suspense fallback={<NightjarSkeleton variant="cards" count={3} label="Loading Artist portfolio" />}>
      <ArtistPortfolioManager notify={notify} demoMode={demoMode}/>
    </Suspense>

    <section className="artist-studio-collaboration">
      <div className="section-head"><div><span className="mini-label">COLLABORATIONS</span><h2>Work with Nightjar professionals.</h2></div><UsersRound size={19}/></div>
      {accountStatus !== 'pending_review'
        ? <Suspense fallback={<NightjarSkeleton variant="list" count={3} label="Loading Artist collaborations" />}><CollaborationHub key={'artist-collab-'+demoSessionKey} role="artist" notify={notify} demoMode={demoMode} simulationMode={simulationMode} onMessageUser={onMessageUser}/></Suspense>
        : <div className="people-empty"><UsersRound size={18}/><strong>Professional collaboration access is pending.</strong><span>Finish your profile and portfolio preparation while your Artist application is reviewed.</span></div>}
    </section>
  </section>;
}
