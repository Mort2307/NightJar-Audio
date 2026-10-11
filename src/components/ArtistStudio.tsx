import { useState } from 'react';
import { ArrowRight, Brush, CheckCircle2, ImagePlus, Mail, Palette, ShieldCheck, UserCircle2, UsersRound } from 'lucide-react';
import ArtistPortfolioManager from './ArtistPortfolioManager';

type Props = {
  notify: (message: string) => void;
  demoMode: boolean;
  onEditProfile: () => void;
  onMessages: () => void;
  onDirectory: () => void;
  completedCollaborations: number;
  messageUnreadCount: number;
};

export default function ArtistStudio({
  notify, demoMode, onEditProfile, onMessages, onDirectory,
  completedCollaborations, messageUnreadCount,
}: Props) {
  const [section, setSection] = useState<'overview' | 'portfolio'>('overview');
  return <section className="page-wrap role-studio-page nj-artist-studio" aria-label="Artist Studio">
    <header className="page-heading nj-artist-studio-heading">
      <div>
        <p className="eyebrow"><Brush size={16}/> ARTIST STUDIO</p>
        <h1>Your work deserves its own space.</h1>
        <p>Manage your visual portfolio and creative opportunities in one place. Your personal Nightjar identity and role description remain in your shared profile.</p>
      </div>
      <button type="button" className="secondary-button" onClick={onEditProfile}><UserCircle2 size={16}/> Edit Artist profile <ArrowRight size={15}/></button>
    </header>

    <nav className="nj-artist-studio-tabs" aria-label="Artist Studio sections">
      <button type="button" className={section==='overview'?'active':''} aria-current={section==='overview'?'page':undefined} onClick={()=>setSection('overview')}><Palette size={17}/> Overview</button>
      <button type="button" className={section==='portfolio'?'active':''} aria-current={section==='portfolio'?'page':undefined} onClick={()=>setSection('portfolio')}><ImagePlus size={17}/> My artwork</button>
    </nav>

    {section==='overview' && <>
      <div className="nj-artist-studio-intro"><span className="mini-label">YOUR ARTIST WORKSPACE</span><h2>Create. Present. Collaborate.</h2>
        <p>Everything related to artwork and commissions belongs here. Edit your personal details once in Profile, even when you have several Nightjar professional roles.</p></div>
      <div className="nj-artist-studio-actions">
        <button type="button" className="nj-artist-studio-action" onClick={()=>setSection('portfolio')}>
          <span className="nj-artist-studio-action-icon"><ImagePlus size={20}/></span>
          <span><strong>Manage my artwork</strong><small>Add portfolio pieces, check moderation status and remove work you no longer want to display.</small></span>
          <ArrowRight size={18}/>
        </button>
        <button type="button" className="nj-artist-studio-action" onClick={onEditProfile}>
          <span className="nj-artist-studio-action-icon"><UserCircle2 size={20}/></span>
          <span><strong>Professional profile</strong><small>Update mediums, commission types, tools, availability, turnaround and public presentation.</small></span>
          <ArrowRight size={18}/>
        </button>
        <button type="button" className="nj-artist-studio-action" onClick={onMessages}>
          <span className="nj-artist-studio-action-icon"><Mail size={20}/></span>
          <span><strong>Collaborator messages</strong><small>{messageUnreadCount ? messageUnreadCount + ' unread message' + (messageUnreadCount === 1?'':'s') + '. ' : ''}Talk with Writers, VAs and Audio Editors about real projects.</small></span>
          <ArrowRight size={18}/>
        </button>
        <button type="button" className="nj-artist-studio-action" onClick={onDirectory}>
          <span className="nj-artist-studio-action-icon"><UsersRound size={20}/></span>
          <span><strong>Meet collaborators</strong><small>Find Nightjar professionals and discover creative opportunities.</small></span>
          <ArrowRight size={18}/>
        </button>
      </div>
      <div className="nj-artist-studio-trust">
        <div><CheckCircle2 size={19}/><strong>{completedCollaborations} completed Nightjar collaboration{completedCollaborations===1?'':'s'}</strong></div>
        <p>Only work confirmed within Nightjar is counted here. Self-described skills and approved portfolio pieces remain separate.</p>
      </div>
      <div className="nj-artist-studio-trust">
        <div><ShieldCheck size={19}/><strong>Artists keep control of their work</strong></div>
        <p>Portfolio images require human-created work and publication-rights confirmations. Images stay private until the existing administrator review process approves them.</p>
      </div>
    </>}

    {section==='portfolio' && <div className="nj-artist-studio-portfolio" aria-label="Artwork management">
      <div className="nj-artist-studio-intro"><span className="mini-label">MY ARTWORK</span><h2>Portfolio and image approvals.</h2>
        <p>Review your public and pending pieces below. When you want to add a new piece, open the submission form; it does not need to occupy your profile or every visit to Artist Studio.</p></div>
      <ArtistPortfolioManager notify={notify} demoMode={demoMode} />
    </div>}
  </section>;
}
