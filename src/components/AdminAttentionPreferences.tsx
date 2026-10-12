import { useEffect, useState } from 'react';
import { BellRing, Save, ShieldCheck } from 'lucide-react';
import { nightjarNotifications } from '../platform/firebase-notifications';

type AdminKey =
  'professionalApplications' | 'releases' | 'scripts' | 'images' | 'reviews' |
  'editorPortfolio' | 'reports' | 'security' | 'suggestions' | 'billing';

const options: { key: AdminKey; label: string; detail: string }[] = [
  { key: 'professionalApplications', label: 'Creator and professional applications', detail: 'VA Creator, Writer, Editor and Artist approval requests' },
  { key: 'releases', label: 'Audio release approvals', detail: 'New recordings submitted to moderation' },
  { key: 'scripts', label: 'Writer manuscript intake', detail: 'Unassigned scripts submitted to the editorial queue' },
  { key: 'images', label: 'Image verification', detail: 'Profile images, release covers, artwork and other pending uploads' },
  { key: 'reviews', label: 'Listener review moderation', detail: 'Submitted reviews awaiting an Administrator' },
  { key: 'editorPortfolio', label: 'Editor showcase review', detail: 'Before-and-after audio and showcase items requiring approval' },
  { key: 'reports', label: 'Flagged comments and messages', detail: 'Reports requiring a moderation decision' },
  { key: 'security', label: 'Security and safeguarding alerts', detail: 'New security evidence requiring human review' },
  { key: 'suggestions', label: 'Creator recommendations', detail: 'New recommendations submitted by Nightjar members' },
  { key: 'billing', label: 'Subscription issues', detail: 'Subscriptions moving into failed or overdue states' },
];

const defaults = Object.fromEntries(options.map(option => [option.key, true])) as Record<AdminKey, boolean>;

export default function AdminAttentionPreferences({ notify }: { notify: (message: string) => void }) {
  const [prefs, setPrefs] = useState<Record<AdminKey, boolean>>(defaults);
  const [pending, setPending] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void nightjarNotifications.adminPreferences()
      .then(data => { if (active) setPrefs({ ...defaults, ...data.preferences }); })
      .catch(() => { if (active) setError('Could not load Administrator alert preferences. Try reopening Notifications.'); })
      .finally(() => { if (active) setPending(false); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const result = await nightjarNotifications.saveAdminPreferences(prefs);
      setPrefs({ ...defaults, ...result.preferences });
      notify('Administrator phone alert preferences saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save Administrator preferences.');
    } finally { setSaving(false); }
  };

  return <section className="research-panel nj-admin-attention-prefs" aria-label="Administrator attention alerts">
    <div className="research-panel-head">
      <div>
        <span className="mini-label">ADMINISTRATORS ONLY · ATTENTION ALERTS</span>
        <h2>Know when Nightjar needs you.</h2>
        <p>Choose which new review tasks trigger a push notification on your registered devices. These controls are separate from normal Listener and Creator notifications.</p>
      </div>
      <BellRing size={22}/>
    </div>
    <div className="rights-ai-lock">
      <ShieldCheck size={16}/>
      <div>
        <strong>Only verified Nightjar Administrators</strong>
        <span>In-app moderation queues remain visible even if a phone-alert category is switched off. Notification content stays discreet on the lock screen.</span>
      </div>
    </div>
    {error && <p className="access-fine" role="alert">{error}</p>}
    <div className="notification-pref-grid">
      {options.map(option =>
        <label className="rights-check" key={option.key}>
          <input
            type="checkbox"
            checked={prefs[option.key]}
            disabled={pending || saving}
            onChange={event => setPrefs(value => ({ ...value, [option.key]: event.target.checked }))}
          />
          <span><strong>{option.label}</strong><small style={{ display: 'block', opacity: 0.78 }}>{option.detail}</small></span>
        </label>
      )}
    </div>
    <div className="push-device-actions">
      <button type="button" className="ghost-button" disabled={pending || saving} onClick={() => setPrefs(defaults)}>Enable all alerts</button>
      <button type="button" className="ghost-button" disabled={pending || saving} onClick={() => setPrefs(Object.fromEntries(options.map(o => [o.key, false])) as Record<AdminKey,boolean>)}>Mute phone alerts</button>
      <button type="button" className="primary-button" disabled={pending || saving} onClick={() => void save()}><Save size={15}/> {saving ? 'Saving…' : 'Save Administrator alerts'}</button>
    </div>
    <p className="access-fine">Alerts are generated when an item newly enters an actionable state; edits to an already pending item do not produce repeated alerts. Each Administrator chooses their own preferences.</p>
  </section>;
}
