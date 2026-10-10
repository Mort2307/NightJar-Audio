import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, AudioLines, BookOpenText, CheckCircle2, CircleAlert, FileAudio, Headphones, LockKeyhole, Mic2, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { nightjarAdministration, type NightjarMarketplaceVisibility } from '../platform/firebase-administration';

type PublicRelease = {
  id: string;
  title: string;
  creator: string;
  artworkUrl?: string | null;
  category?: string;
  duration?: string;
};

type PublicPerson = {
  userId: string;
  name: string;
  role: string;
  roles?: string[];
  handle?: string | null;
  headline?: string | null;
  avatarUrl?: string | null;
  avatarInitials?: string | null;
};

type Props = {
  publicReleases: PublicRelease[];
  publicProfiles: PublicPerson[];
  onOpenPublicProfile: (userId: string) => void;
  onOpenScriptAudit: () => void;
};

const RELEASE_STEPS = [
  { label: 'Create a release', detail: 'Build your title, category and discovery profile.' },
  { label: 'Upload the performance', detail: 'Add final audio, artwork and accessible transcript.' },
  { label: 'Confirm permissions', detail: 'Record credits, rights and collaborator consent.' },
  { label: 'Submit for review', detail: 'Nightjar moderation precedes public publication.' },
];

export default function CreatorLivePreviewOverview({ publicReleases, publicProfiles, onOpenPublicProfile, onOpenScriptAudit }: Props) {
  const people = useMemo(
    () => publicProfiles.filter((profile) => ['creator', 'writer', 'editor', 'artist'].some((role) => profile.role === role || profile.roles?.includes(role))),
    [publicProfiles],
  );

  const creators = useMemo(
    () => people.filter((person) => person.role === 'creator' || person.roles?.includes('creator')),
    [people],
  );

  const [audit, setAudit] = useState<{ eligible: number; diagnostics: NightjarMarketplaceVisibility[] } | null>(null);
  const [auditStatus, setAuditStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setAuditStatus('loading');
    void nightjarAdministration.previewScriptMarketplace()
      .then((data) => {
        if (cancelled) return;
        setAudit({
          eligible: Number(data.eligible ?? 0),
          diagnostics: Array.isArray(data.diagnostics) ? data.diagnostics : [],
        });
        setAuditStatus('ready');
      })
      .catch(() => { if (!cancelled) { setAudit(null); setAuditStatus('unavailable'); } });
    return () => { cancelled = true; };
  }, [refreshIndex]);

  const total = audit?.diagnostics.length ?? 0;
  const privateOrUnlisted = audit ? audit.diagnostics.filter((item) => !item.visibleToProfessionals).length : 0;

  return <div className="nj-creator-live-overview" aria-label="Real VA Creator workspace preview">
    <div className="nj-creator-live-overview-heading">
      <div>
        <span className="mini-label"><ShieldCheck size={14} /> LIVE CREATOR EXPERIENCE</span>
        <h2>Your next release starts here.</h2>
        <p>Explore the real Nightjar release workflow and public professional network. No fictional accounts, earnings or manuscripts are inserted into your preview.</p>
      </div>
      <span className="nj-creator-live-status"><CheckCircle2 size={15} /> Read-only</span>
    </div>

    <div className="nj-creator-live-metrics" aria-label="Genuine public Nightjar records">
      <div><span>Published catalogue entries loaded</span><strong>{publicReleases.length}</strong><small>Real public releases</small></div>
      <div><span>Public VA Creator profiles loaded</span><strong>{creators.length}</strong><small>Approved public profiles</small></div>
      <div><span>Professional profiles loaded</span><strong>{people.length}</strong><small>Actual directory entries</small></div>
    </div>

    <div className="nj-creator-live-grid">
      <section className="nj-creator-live-panel nj-creator-live-workflow">
        <div className="nj-creator-live-panel-head"><FileAudio size={19}/><div><span className="mini-label">RELEASE WORKSPACE</span><h3>From recording to release</h3></div></div>
        <div className="nj-creator-live-steps">
          {RELEASE_STEPS.map((step, index) => <div className="nj-creator-live-step" key={step.label}>
            <span className="nj-creator-live-step-number">{String(index + 1).padStart(2, '0')}</span>
            <div><strong>{step.label}</strong><small>{step.detail}</small></div>
          </div>)}
        </div>
        <div className="nj-creator-live-locked"><LockKeyhole size={16}/><span>The release editor belongs to an approved VA account. Your administrator view cannot create or alter somebody else's release.</span></div>
      </section>

      <section className="nj-creator-live-panel">
        <div className="nj-creator-live-panel-head"><Users size={19}/><div><span className="mini-label">REAL PEOPLE</span><h3>Creative network</h3></div></div>
        {people.length ? <div className="nj-creator-live-people">{people.slice(0, 4).map((person) => <button key={person.userId}
          type="button" className="nj-creator-live-person" onClick={() => onOpenPublicProfile(person.userId)}>
          <span className="nj-creator-live-avatar">{person.avatarUrl ? <img src={person.avatarUrl} alt="" loading="lazy"/> : (person.avatarInitials || person.name.slice(0,2).toUpperCase())}</span>
          <span className="nj-creator-live-person-copy"><strong>{person.name}</strong><small>{person.headline || (person.role === 'creator' ? 'VA Creator' : person.role === 'writer' ? 'Writer' : person.role === 'editor' ? 'Audio Editor' : 'Artist')}</small></span>
          <ArrowRight size={16} aria-hidden="true" />
        </button>)}</div> : <div className="nj-creator-live-empty"><Users size={21}/><strong>No public professional profiles returned.</strong><span>Approved creators and collaborators will appear here when their public profiles become available.</span></div>}
        <p className="nj-creator-live-panel-footnote">Public profiles only. Private messages and assigned collaborations are not displayed.</p>
      </section>
    </div>

    <section className="nj-creator-live-panel nj-creator-live-catalogue">
      <div className="nj-creator-live-panel-head"><Headphones size={19}/><div><span className="mini-label">ACTUAL RELEASES</span><h3>Published on Nightjar</h3></div></div>
      {publicReleases.length
        ? <div className="nj-creator-live-release-list">{publicReleases.slice(0, 4).map((release) => <article className="nj-creator-live-release" key={release.id}>
          <span className="nj-creator-live-release-art">{release.artworkUrl ? <img src={release.artworkUrl} alt="" loading="lazy"/> : <AudioLines size={21}/>}</span>
          <div><strong>{release.title}</strong><small>{release.creator} · {release.category || 'Audio'}{release.duration ? ' · ' + release.duration : ''}</small></div>
          <span className="nj-creator-live-published"><CheckCircle2 size={13}/> Public</span>
        </article>)}</div>
        : <div className="nj-creator-live-empty nj-creator-live-empty-horizontal"><Mic2 size={24}/><div><strong>No published releases returned by the live catalogue.</strong><span>Nightjar won't invent content. Audio becomes visible here after a genuine approved publication.</span></div></div>}
    </section>

    <section className="nj-creator-live-diagnostic" aria-label="Administrator-only manuscript visibility diagnostic">
      <div className="nj-creator-live-diagnostic-intro"><BookOpenText size={20}/><div>
        <span className="mini-label">OWNER DIAGNOSTIC · NOT SHOWN TO CREATORS</span>
        <strong>Where are the tester scripts?</strong>
        <p>{auditStatus === 'loading'
          ? 'Checking real manuscript visibility in the current Firebase project…'
          : auditStatus === 'unavailable'
            ? 'We could not check the admin listing rules right now. This is not proof that there are no manuscripts.'
            : total === 0
              ? 'No manuscripts were returned by the admin visibility check in this Firebase project.'
              : privateOrUnlisted > 0
                ? total + ' manuscript(s) checked. ' + privateOrUnlisted + ' are not marketplace-visible; ' + audit!.eligible + ' meet the listing requirements.'
                : audit!.eligible + ' manuscript(s) meet the marketplace listing requirements.'}</p>
      </div></div>
      <div className="nj-creator-live-diagnostic-actions">
        <button type="button" onClick={() => setRefreshIndex((value) => value + 1)} disabled={auditStatus === 'loading'}><RefreshCw size={15}/> Refresh</button>
        <button type="button" className="nj-creator-live-audit-link" onClick={onOpenScriptAudit}><CircleAlert size={15}/> Inspect visibility <ArrowRight size={15}/></button>
      </div>
    </section>
  </div>;
}
