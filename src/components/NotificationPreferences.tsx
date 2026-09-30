import { useEffect, useState } from 'react';
import { Bell, Save, ShieldCheck } from 'lucide-react';
import { nightjarNotifications } from '../platform/firebase-notifications';

type Props = { notify: (message: string) => void; simulationMode?: boolean };

const defaults = {
  displayMode: 'discreet',
  newReleases: true,
  followedProfiles: true,
  collaborations: true,
  payments: true,
  comments: true,
  messages: true,
  announcements: true,
};

export default function NotificationPreferences({ notify, simulationMode = false }: Props) {
  const [preferences, setPreferences] = useState<any>(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (simulationMode) {
      setPreferences(defaults);
      return;
    }
    void nightjarNotifications.preferences().then((data) => setPreferences({ ...defaults, ...(data.preferences ?? {}) })).catch(() => {});
  }, [simulationMode]);

  const save = async () => {
    setSaving(true);
    try {
      if (simulationMode) {
        notify('Simulation: notification preferences saved locally.');
      } else {
        const data = await nightjarNotifications.savePreferences(preferences);
        setPreferences(data.preferences ?? preferences);
        notify('Notification privacy preferences saved.');
      }
    } catch {
      notify('Notification preferences could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: string) => setPreferences((value: any) => ({ ...value, [key]: !value[key] }));

  return <section className="research-panel notification-preferences">
    <div className="research-panel-head"><div><span className="mini-label">NOTIFICATION PRIVACY</span><h2>Choose how discreet Nightjar should be.</h2><p>Control notification wording and which updates you want to receive.</p></div><Bell size={21}/></div>
    <label>Notification wording<select value={preferences.displayMode} onChange={(e) => setPreferences((value: any) => ({ ...value, displayMode: e.target.value }))}><option value="full">Full — show useful release/context detail</option><option value="discreet">Discreet — Nightjar wording without explicit detail</option><option value="minimal">Minimal — generic Nightjar notification only</option></select></label>
    <div className="notification-pref-grid">
      {[
        ['newReleases','New releases'],
        ['followedProfiles','People I follow'],
        ['collaborations','Collaboration updates'],
        ['payments','Payment updates'],
        ['comments','Comments / community'],
        ['messages','Private messages'],
        ['announcements','Nightjar announcements'],
      ].map(([key,label]) => <label className="rights-check" key={key}><input type="checkbox" checked={preferences[key] !== false} onChange={() => toggle(key)}/>{label}</label>)}
    </div>
    <div className="rights-ai-lock"><ShieldCheck size={16}/><div><strong>Discreet by default</strong><span>New accounts default to discreet wording rather than exposing adult-content detail on a lock screen.</span></div></div>
    <button className="primary-button" disabled={saving} onClick={() => void save()}><Save size={14}/> {saving ? 'Saving…' : 'Save notification preferences'}</button>
  </section>;
}
