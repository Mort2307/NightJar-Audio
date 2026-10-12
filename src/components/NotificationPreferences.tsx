import { useEffect, useState } from 'react';
import { Bell, RefreshCw, Save, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { nightjarNotifications } from '../platform/firebase-notifications';
import { nightjarPush, type PushSetupDiagnostics } from '../platform/firebase-push';

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
  const [pushStatus, setPushStatus] = useState<any | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PushSetupDiagnostics | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  useEffect(() => {
    if (simulationMode) {
      setPreferences(defaults);
      return;
    }
    void nightjarNotifications.preferences().then((data) => setPreferences({ ...defaults, ...(data.preferences ?? {}) })).catch(() => {});
  }, [simulationMode]);

  const refreshPush = async () => {
    if (simulationMode) {
      setPushStatus({ configured:true, supported:true, browserPermission:'granted', activeDeviceCount:1, thisDeviceRegistered:true, devices:[], standalone:true });
      setPushError(null);
      return;
    }
    try {
      setPushStatus(await nightjarPush.status());
    } catch (error) {
      setPushError(error instanceof Error ? error.message.slice(0, 200) : 'A Nightjar push service call failed.');
      setPushStatus({ configured:nightjarPush.configured(), supported:await nightjarPush.supported().catch(()=>false), browserPermission:nightjarPush.permission(), activeDeviceCount:0, thisDeviceRegistered:false, devices:[] });
    }
  };

  useEffect(() => { void refreshPush(); }, [simulationMode]);

  const inspectPush = async () => {
    setDiagnosing(true);
    try { setDiagnostics(await nightjarPush.diagnostics()); }
    catch (error) { setPushError(error instanceof Error ? error.message : 'Cannot inspect this browser.'); }
    finally { setDiagnosing(false); }
  };

  const enablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      if (simulationMode) notify('Simulation: this device is now registered for push notifications.');
      else {
        await nightjarPush.enable();
        notify('Push notifications enabled for this device.');
      }
      await refreshPush();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Push notifications could not be enabled.';
      setPushError(message);
      notify('Notifications could not be enabled. See the diagnostics below.');
      if (!simulationMode) await inspectPush();
    } finally { setPushBusy(false); }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      if (!simulationMode) await nightjarPush.disable();
      notify('Nightjar push disabled for this device.');
      await refreshPush();
    } catch {
      notify('Nightjar could not disable push on this device.');
    } finally { setPushBusy(false); }
  };

  const testPush = async () => {
    setPushBusy(true);
    try {
      if (simulationMode) notify('Simulation: test push sent.');
      else {
        const result = await nightjarPush.test();
        notify(result.sent ? 'Firebase accepted a test push for THIS device. Check its notifications to confirm it appeared.' : 'The test push was not accepted. Check this device’s delivery status below.');
      }
      await refreshPush();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Nightjar could not send the test push.');
    } finally { setPushBusy(false); }
  };

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

    <section className="push-device-panel">
      <div className="push-device-head">
        <Smartphone size={18}/>
        <div>
          <strong>Phone / device push</strong>
          <span>
            {!pushStatus ? 'Checking this device…'
              : pushError ? 'Nightjar push service error: ' + pushError
              : !pushStatus.configured ? 'Firebase Web Push still needs its VAPID public key configured.'
              : !pushStatus.supported ? 'This browser does not support Nightjar web push.'
              : pushStatus.browserPermission === 'denied' ? 'Notifications are blocked in this browser or device settings.'
              : pushStatus.thisDeviceError ? 'This phone could not check its Firebase push token: ' + pushStatus.thisDeviceError
              : pushStatus.thisDeviceRegistered ? 'Push is enabled on THIS device. ' + pushStatus.activeDeviceCount + ' total registered device(s).'
              : pushStatus.activeDeviceCount > 0 ? 'Other devices are registered, but THIS phone is not. Enable it here.'
              : 'This device is not registered for Nightjar push yet.'}
          </span>
        </div>
        <span className={pushStatus?.thisDeviceRegistered ? 'status-pill' : 'status-pill muted'}>
          {pushStatus?.thisDeviceRegistered ? 'THIS PHONE ON' : 'THIS PHONE OFF'}
        </span>
      </div>
      <div className="push-device-actions">
        <button className="secondary-button" disabled={pushBusy || !pushStatus?.configured || !pushStatus?.supported} onClick={() => void enablePush()}>
          <Bell size={14}/> Enable on this device
        </button>
        <button className="secondary-button" disabled={pushBusy || !pushStatus?.thisDeviceRegistered} onClick={() => void testPush()}>
          <Send size={14}/> Test this device only
        </button>
        <button className="ghost-button" disabled={pushBusy || !pushStatus?.thisDeviceRegistered} onClick={() => void disablePush()}>
          Disable this device
        </button>
        <button className="ghost-button" disabled={pushBusy} onClick={() => void refreshPush()}>
          <RefreshCw size={14}/> Refresh status
        </button>
        <button className="secondary-button" disabled={pushBusy || diagnosing} onClick={() => void inspectPush()}>
          <ShieldCheck size={14}/> {diagnosing ? 'Checking setup…' : 'Diagnose notification setup'}
        </button>
      </div>
      {pushError && <div className="nj-push-diagnostic-error" role="alert"><strong>Notification registration needs attention</strong><p>{pushError}</p><small>Push is optional; Nightjar and your in-app notifications remain available.</small></div>}
      {diagnostics && <section className="nj-push-diagnostics" aria-label="Nightjar push configuration diagnostics">
        <strong>Device and Firebase checks</strong>
        <div className="nj-push-diagnostic-grid">
          <span>Firebase project <b>{diagnostics.projectId}</b></span>
          <span>HTTPS <b>{diagnostics.https ? 'Yes' : 'No'}</b></span>
          <span>VAPID public key <b>{!diagnostics.vapidConfigured ? 'Missing' : diagnostics.vapidFormatOk ? 'Present' : 'Invalid format'}</b></span>
          <span>Service worker <b>{diagnostics.workerActive ? 'Active' : 'Inactive'}</b></span>
          <span>Web Push support <b>{diagnostics.browserSupported ? 'Supported' : 'Unavailable'}</b></span>
          <span>Phone permission <b>{diagnostics.browserPermission}</b></span>
        </div>
        <p>These checks are read-only. They never re-subscribe your device or expose a private device token.</p>
        <ol>{diagnostics.advice.map((advice)=> <li key={advice}>{advice}</li>)}</ol>
        <a href="https://console.cloud.google.com/apis/library/fcmregistrations.googleapis.com?project=nightjar-audio" target="_blank" rel="noopener noreferrer">Open Nightjar's FCM Registration API settings ↗</a>
        <a href="https://console.firebase.google.com/project/nightjar-audio/settings/cloudmessaging" target="_blank" rel="noopener noreferrer">Open Nightjar's Web Push certificates ↗</a>
      </section>}
      {!pushStatus?.supported && /iphone|ipad|ipod/i.test(navigator.userAgent) &&
        <p className="access-fine">On iPhone, install Nightjar on your Home Screen from Safari, then open the installed app to enable notifications. iOS web push is available on supported iOS versions.</p>}
      {pushStatus?.thisDeviceRegistered && <p className="access-fine">Tests are sent only to this signed-in device, not every device linked to your account. Firebase acceptance is not proof of on-screen delivery; confirm the notification appeared with the app in the background.</p>}
      {pushStatus?.devices?.length > 0 && <div className="push-device-list">
        {pushStatus.devices.map((device:any)=><div key={device.id}>
          <span><strong>{device.platform}</strong><small>{device.standalone ? 'Installed app' : 'Browser'} · {device.active ? 'Active' : 'Inactive'}</small></span>
          <small>{device.lastDeliveredAt ? 'Last push ' + new Date(device.lastDeliveredAt).toLocaleString('en-GB') : device.lastError ? 'Last error: ' + device.lastError : 'No delivery recorded yet'}</small>
        </div>)}
      </div>}
    </section>

    <button className="primary-button" disabled={saving} onClick={() => void save()}><Save size={14}/> {saving ? 'Saving…' : 'Save notification preferences'}</button>
  </section>;
}
