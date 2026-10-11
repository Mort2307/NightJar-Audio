import { Accessibility, ArrowRight, Bell, CalendarDays, BookOpenText, CreditCard, FileText, LockKeyhole, LogOut, Palette, Settings2, ShieldCheck, UserCircle2 } from 'lucide-react';
import AccessibilityPreferences from './AccessibilityPreferences';
import AppUpdateControl from './AppUpdateControl';
import NotificationPreferences from './NotificationPreferences';
import ThemePreferences from './ThemePreferences';
import PasskeySettings from './PasskeySettings';
import AdminAudioUploadTest from './AdminAudioUploadTest';

type Props = {
  email?: string | null;
  administrator: boolean;
  simulationMode: boolean;
  onProfile: () => void;
  onCalendar: () => void;
  onRoles: () => void;
  onProtection: () => void;
  onAdmin: () => void;
  onSignOut: () => void;
  notify: (message: string) => void;
};

export default function NightjarSettings({ email, administrator, simulationMode, onProfile, onCalendar, onRoles, onProtection, onAdmin, onSignOut, notify }: Props) {
  return (
    <section className="page-section nj-settings-page" aria-labelledby="nightjar-settings-title">
      <div className="nj-settings-heading">
        <span className="eyebrow"><Settings2 size={15} /> ACCOUNT PREFERENCES</span>
        <h1 id="nightjar-settings-title">Settings.</h1>
        <p>Personal preferences and account controls in one place, regardless of which Nightjar workspace you're using.</p>
      </div>

      <div className="nj-settings-grid">
        <section className="panel nj-settings-section" aria-labelledby="nj-settings-account">
          <div className="nj-settings-section-head"><UserCircle2 size={19} /><div><span className="mini-label">PERSONAL</span><h2 id="nj-settings-account">Account and profile</h2></div></div>
          {email && <p className="nj-settings-identity">Signed in as <strong>{email}</strong></p>}
          <button type="button" className="nj-settings-link" onClick={onCalendar}><span><strong><CalendarDays size={15}/> My calendar</strong><small>Local date and time, personal dates and scheduled release plans</small></span><ArrowRight size={17} aria-hidden="true" /></button>
          <button type="button" className="nj-settings-link" onClick={onProfile}><span><strong>Edit my profile</strong><small>Avatar, personal details, visibility and professional identity</small></span><ArrowRight size={17} aria-hidden="true" /></button>
          {!administrator && <button type="button" className="nj-settings-link" onClick={onRoles}><span><strong>Professional roles</strong><small>Add or switch approved Writer, VA, Editor and Artist identities</small></span><ArrowRight size={17} aria-hidden="true" /></button>}
          {administrator && <button type="button" className="nj-settings-link" onClick={onAdmin}><span><strong>Administrator workspace</strong><small>People, moderation, permissions and platform controls</small></span><ArrowRight size={17} aria-hidden="true" /></button>}
          <button type="button" className="nj-settings-link" onClick={onSignOut}><span><strong>Sign out</strong><small>Safely end this Nightjar session</small></span><LogOut size={17} aria-hidden="true" /></button>
        </section>

        <section className="panel nj-settings-section" aria-labelledby="nj-settings-privacy">
          <div className="nj-settings-section-head"><LockKeyhole size={19} /><div><span className="mini-label">SECURITY</span><h2 id="nj-settings-privacy">Privacy and safety</h2></div></div>
          <PasskeySettings simulationMode={simulationMode}/>
          <button type="button" className="nj-settings-link" onClick={onProtection}><span><strong>Protection Centre</strong><small>Account safety, reporting and protected evidence</small></span><ArrowRight size={17} aria-hidden="true" /></button>
          <a className="nj-settings-link" href="/legal/privacy"><span><strong>Privacy notice</strong><small>How Nightjar handles your information</small></span><ArrowRight size={17} aria-hidden="true" /></a>
          <a className="nj-settings-link" href="/legal/terms"><span><strong>Terms and conditions</strong><small>Platform responsibilities and access terms</small></span><ArrowRight size={17} aria-hidden="true" /></a>
        </section>

        <section className="panel nj-settings-section" aria-labelledby="nj-settings-display">
          <div className="nj-settings-section-head"><Palette size={19} /><div><span className="mini-label">EXPERIENCE</span><h2 id="nj-settings-display">Appearance and playback</h2></div></div>
          <ThemePreferences simulationMode={simulationMode} notify={notify}/>
          <div className="nj-settings-info"><BookOpenText size={17}/><span>Audio transcript defaults, text size and playback-following preferences can be configured under Accessibility below.</span></div>
        </section>

        <section className="panel nj-settings-section" aria-labelledby="nj-settings-billing">
          <div className="nj-settings-section-head"><CreditCard size={19} /><div><span className="mini-label">MEMBERSHIP</span><h2 id="nj-settings-billing">Subscription and billing</h2></div></div>
          <p className="nj-settings-explanation">Subscription management will appear here once live payment processing is enabled. No charges or billing controls are implied by the testing interface.</p>
        </section>
      </div>

      {administrator && !simulationMode && <div className="nj-settings-tools"><AdminAudioUploadTest/></div>}
      <div className="nj-settings-tools">
        <div className="nj-settings-tool-heading"><Bell size={19}/><div><span className="mini-label">COMMUNICATIONS</span><h2>Notifications</h2></div></div>
        <NotificationPreferences notify={notify} simulationMode={simulationMode} />
      </div>
      <div className="nj-settings-tools">
        <div className="nj-settings-tool-heading"><Accessibility size={19}/><div><span className="mini-label">READABILITY</span><h2>Accessibility and transcripts</h2></div></div>
        {simulationMode ? <p className="nj-settings-explanation">Live account preferences are not changed during role simulation.</p> : <AccessibilityPreferences />}
      </div>
      <div className="nj-settings-tools">
        <div className="nj-settings-tool-heading"><ShieldCheck size={19}/><div><span className="mini-label">APP & DEVICE</span><h2>Updates and support</h2></div></div>
        <article className="panel nj-settings-section"><AppUpdateControl compact /><button type="button" className="nj-settings-link" onClick={onProtection}><span><strong>Report a problem</strong><small>Technical issues, abuse or other concerns</small></span><ArrowRight size={17} aria-hidden="true" /></button><a className="nj-settings-link" href="/legal"><span><strong>Legal centre</strong><small>All Nightjar policies and legal documents</small></span><FileText size={17} aria-hidden="true"/></a></article>
      </div>
    </section>
  );
}
