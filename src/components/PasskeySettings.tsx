import { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { nightjarAuth } from '../platform/firebase-auth';
import { nightjarPasskeys } from '../platform/firebase-passkeys';
import { nightjarQuickUnlock } from '../platform/nightjar-quick-unlock';

/** Passkeys are never enabled through a client-side boolean alone. */
export default function PasskeySettings({ simulationMode }: { simulationMode: boolean }) {
  const supported = nightjarPasskeys.supported();
  const [devices, setDevices] = useState<Array<{ id: string; label: string; createdAt: string | null; lastUsedAt: string | null }>>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [quickUnlockEnabled, setQuickUnlockEnabled] = useState(() => {
    const uid = nightjarAuth.current()?.userId;
    return Boolean(uid && nightjarQuickUnlock.enabledFor(uid));
  });
  const [message, setMessage] = useState('');

  const refresh = async () => {
    try {
      const list = await nightjarPasskeys.list();
      setDevices(list);
      const uid = nightjarAuth.current()?.userId;
      if (uid && list.length === 0 && nightjarQuickUnlock.enabledFor(uid)) nightjarQuickUnlock.disable(uid);
      setQuickUnlockEnabled(Boolean(uid && list.length > 0 && nightjarQuickUnlock.enabledFor(uid)));
    } catch {
      setMessage('Passkeys could not be loaded. Check your connection.');
    }
  };
  useEffect(() => {
    if (!simulationMode) void refresh();
  }, [simulationMode]);

  const action = async (operation: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      if (!password) throw new Error('Enter your current Nightjar password to authorise changes to sign-in methods.');
      await nightjarAuth.reauthenticate(password);
      setPassword('');
      await operation();
      await refresh();
    } catch (error) {
      setPassword('');
      setMessage(error instanceof Error ? error.message : 'Passkey request failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="panel nj-settings-section nightjar-passkey-settings">
    <div className="nj-settings-section-head"><Fingerprint size={20} /><div><span className="mini-label">PASSWORDLESS SIGN-IN</span><h3>Face ID, fingerprint &amp; passkeys</h3></div></div>
    <p className="nj-settings-explanation">
      Use a passkey protected by your device's Face ID, fingerprint, Windows Hello or screen lock.
      Nightjar stores a public verification key, not your fingerprint or face data.
    </p>
    {!supported && <p className="nj-settings-explanation">Passkey setup needs a compatible browser and a secure HTTPS connection. Email and password remain available.</p>}
    {simulationMode ? <p className="nj-settings-explanation">Passkeys are unavailable during role simulation.</p> : <>
      <div className="nightjar-passkey-list">
        {devices.map(device => <div key={device.id} className="nightjar-passkey-device">
          <span><strong><KeyRound size={14} /> {device.label}</strong><small>Added {device.createdAt ? new Date(device.createdAt).toLocaleDateString('en-GB') : 'recently'}</small></span>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => void action(async () => {
            await nightjarPasskeys.remove(device.id);
            setMessage('Passkey removed. You can still sign in using your password.');
          })}><Trash2 size={14}/> Remove</button>
        </div>)}
        {!devices.length && <small>No passkeys registered to this Nightjar account yet.</small>}
      </div>
      <label className="admin-mail-field">Current Nightjar password (required to add or remove a passkey)
        <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)}/>
      </label>
      <button type="button" className="primary-button" disabled={!supported || busy || !password} onClick={() => void action(async () => {
        await nightjarPasskeys.register();
        const uid = nightjarAuth.current()?.userId;
        const enabled = uid ? nightjarQuickUnlock.enable(uid) : false;
        setQuickUnlockEnabled(enabled);
        setMessage(enabled
          ? 'Passkey registered. Nightjar will ask for biometrics immediately after its black logo splash screen on this device.'
          : 'Passkey registered. Enable launch unlock from this device to use it at startup.');
      })}><Fingerprint size={16}/>{busy ? 'Confirming…' : 'Add passkey and enable launch unlock'}</button>
      <label className="nightjar-passkey-quick-toggle">
        <input type="checkbox" checked={quickUnlockEnabled} disabled={!supported || busy || devices.length===0}
          onChange={event=>{
            const uid = nightjarAuth.current()?.userId;
            if (!uid) return;
            const next = event.target.checked ? nightjarQuickUnlock.enable(uid) : (nightjarQuickUnlock.disable(uid), false);
            setQuickUnlockEnabled(next);
            setMessage(next
              ? 'Biometric unlock enabled. It appears after the Nightjar logo splash on your next fresh app launch.'
              : 'Automatic launch unlock disabled on this device. Your passkey remains usable on the sign-in page.');
          }}/>
        <span><strong>Ask for biometrics when Nightjar opens</strong>
          <small>After the black Nightjar logo screen, prompt for your fingerprint, Face ID or passkey before opening the app. This preference is for this device only.</small></span>
      </label>
      <p className="nj-settings-explanation"><ShieldCheck size={13}/> Keep your email and password for recovery. Launch unlock uses a verified passkey, and cannot replace Nightjar age verification. Changing or removing passkeys requires recent password verification.</p>
      {message && <p className="account-access-message" role="status">{message}</p>}
    </>}
  </div>;
}
