import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, Layers3 } from 'lucide-react';
import { nightjarAccount, type NightjarProfessionalRole, type ProfessionalRoleState } from '../platform/firebase-account';
import './creator-workflow.css';

type MemberRole = 'listener' | NightjarProfessionalRole;

type Props = {
  activeRole: MemberRole;
  onSwitch: (role: MemberRole) => void;
  onManageRoles: () => void;
};

const roleNames: Record<MemberRole, string> = {
  listener: 'Listener',
  creator: 'VA Creator',
  writer: 'Writer',
  editor: 'Audio Editor',
  artist: 'Artist',
};

export default function WorkspaceSwitcher({ activeRole, onSwitch, onManageRoles }: Props) {
  const [roles, setRoles] = useState<ProfessionalRoleState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void nightjarAccount.professionalRoles()
      .then((result) => {
        if (!cancelled) {
          setRoles(result);
          setError('');
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your approved workspaces. Try again.');
      });
    return () => { cancelled = true; };
  }, [activeRole]);

  const switchTo = async (target: MemberRole) => {
    if (!roles || busy || (target !== 'listener' && !roles.approvedProfessionalRoles.includes(target))) return;
    if (target === activeRole) { setOpen(false); return; }
    setBusy(true);
    setError('');
    try {
      const result = await nightjarAccount.setActiveRole(target);
      if (result.activeRole !== target) throw new Error('Nightjar did not confirm the workspace switch.');
      setOpen(false);
      onSwitch(target);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to switch workspaces. Try again.');
    } finally {
      setBusy(false);
    }
  };

  // Approved workspaces only; selecting an option never adds or removes an account role.
  const choices: MemberRole[] = ['listener', ...(roles?.approvedProfessionalRoles ?? [])];
  return <section className="nj-workspace-switcher" aria-label="Switch your Nightjar workspace">
    <div className="nj-workspace-switcher-leading"><Layers3 size={18} aria-hidden="true" />
      <div><small>YOU ARE WORKING AS</small><strong>{roleNames[activeRole]}</strong></div>
    </div>
    <div className="nj-workspace-switcher-actions">
      <button type="button" className="secondary-button" disabled={busy || !roles} aria-expanded={open} aria-controls="nj-workspace-choices" onClick={() => setOpen((value) => !value)}>
        {busy ? 'Switching…' : 'Switch workspace'} <ChevronDown size={15}/>
      </button>
      <button type="button" className="ghost-button" onClick={onManageRoles}>Manage roles <ArrowRight size={14}/></button>
    </div>
    {open && <div className="nj-workspace-choices" id="nj-workspace-choices" role="group" aria-label="Approved workspaces">
      {choices.map((choice) => <button type="button" key={choice} disabled={busy} className={choice === activeRole ? 'is-active' : ''} onClick={() => void switchTo(choice)}>
        {roleNames[choice]} {choice === activeRole ? '· Current' : ''}
      </button>)}
    </div>}
    {error && <p className="nj-workspace-error" role="alert">{error}</p>}
    <small className="nj-workspace-helper">One account, multiple approved workspaces. Switching never deletes your profile or recordings.</small>
  </section>;
}
