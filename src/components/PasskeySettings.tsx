import { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { nightjarAuth } from '../platform/firebase-auth';
import { nightjarPasskeys } from '../platform/firebase-passkeys';

/** Passkeys are never enabled through a client-side boolean alone. */
export default function PasskeySettings({ simulationMode }: { simulationMode: boolean }) {
  const supported = nightjarPasskeys.supported();
  const [devices, setDevices] = useState<Array<{ id: string; label: string; createdAt: string | null; lastUsedAt: string | null }>>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    try {
      const list = await nightjarPasskeys.list();
      setDevices(list);
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
        setMessage('Your new passkey is ready. You can use it to sign in next time.');
      })}><Fingerprint size={16}/>{busy ? 'Confirming…' : 'Add passkey on this device'}</button>
      <p className="nj-settings-explanation"><ShieldCheck size={13}/> Keep your email and password available for account recovery. Changing or removing passkeys requires recent password verification.</p>
      {message && <p className="account-access-message" role="status">{message}</p>}
    </>}
  </div>;
}
