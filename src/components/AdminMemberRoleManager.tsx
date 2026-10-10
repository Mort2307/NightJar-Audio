import { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { nightjarAdministration } from '../platform/firebase-administration';

type ProfessionalRole = 'creator' | 'writer' | 'editor' | 'artist';

const PROFESSIONAL_ROLES: { role: ProfessionalRole; label: string }[] = [
  { role: 'creator', label: 'VA Creator' },
  { role: 'writer', label: 'Writer' },
  { role: 'editor', label: 'Audio Editor' },
  { role: 'artist', label: 'Artist' },
];

type Props = {
  account: {
    userId?: string;
    name?: string;
    email?: string;
    roles?: string[];
    pendingProfessionalRoles?: string[];
    status?: string;
  };
  demoMode: boolean;
  notify: (message: string) => void;
  onChanged: () => Promise<void>;
};

export default function AdminMemberRoleManager({ account, demoMode, notify, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<ProfessionalRole[]>([]);
  const [busy, setBusy] = useState(false);
  const approved = new Set(account.roles ?? []);
  const pending = new Set(account.pendingProfessionalRoles ?? []);

  const save = async (action: 'queue' | 'approve') => {
    if (!account.userId || selected.length === 0 || busy || demoMode) return;
    setBusy(true);
    try {
      const result = await nightjarAdministration.manageProfessionalRoles(account.userId, selected, action);
      setSelected([]);
      if (result.changedRoles.length === 0) {
        notify('No change needed; these roles were already approved or queued.');
      } else if (action === 'approve') {
        notify('Approved ' + result.changedRoles.length + ' professional role(s). The member can switch workspaces from My Profile → Your Nightjar roles.');
      } else {
        notify('Professional roles added to the approval bank. This does not grant professional access or send an invitation.');
      }
      await onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Accept the current')) {
        notify('Professional approval needs the member to accept the current Nightjar Professional & Content Terms. Keep the role queued until they accept.');
      } else if (message.toLowerCase().includes('age')) {
        notify('This member needs age assurance or explicitly authorised private-beta tester access before professional approval.');
      } else {
        notify(message || 'Professional roles could not be updated.');
      }
    } finally {
      setBusy(false);
    }
  };

  return <section className="nj-admin-member-roles" aria-label={'Professional access for ' + (account.name || account.email || 'member')}>
    <button type="button" className="secondary-button nj-admin-member-roles-toggle"
      onClick={() => setExpanded((current) => !current)}
      aria-expanded={expanded}>
      <ShieldCheck size={15}/>
      Manage Writer / VA / other roles
      {expanded ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
    </button>
    {expanded && <div className="nj-admin-member-roles-body">
      <strong>Professional access · {account.name || account.email || 'Nightjar member'}</strong>
      <p>Listener access and existing approved work are preserved. Select one or several additional professional roles.</p>
      <div className="nj-admin-member-role-options">
        {PROFESSIONAL_ROLES.map(({ role, label }) => {
          const isApproved = approved.has(role);
          const isPending = pending.has(role);
          return <label key={role} className={isApproved ? 'approved' : isPending ? 'pending' : ''}>
            <input type="checkbox" disabled={busy || isApproved}
              checked={isApproved || selected.includes(role)}
              onChange={(event) => setSelected((items) =>
                event.target.checked ? [...items.filter((item) => item !== role), role] : items.filter((item) => item !== role))}/>
            <span><strong>{label}</strong><small>{isApproved ? 'Already approved' : isPending ? 'Awaiting approval' : 'Not assigned'}</small></span>
            {isApproved && <CheckCircle2 size={14}/>}
          </label>;
        })}
      </div>
      <div className="nj-admin-member-role-actions">
        <button type="button" className="secondary-button" disabled={busy || demoMode || !selected.length}
          onClick={() => void save('queue')}>Queue selected roles</button>
        <button type="button" className="primary-button" disabled={busy || demoMode || !selected.length || account.status === 'suspended'}
          onClick={() => void save('approve')}>{busy ? 'Saving roles…' : 'Approve selected roles'}</button>
      </div>
      <small>Approving requires this member's accepted professional terms and age assurance (or authorised beta access), and creates an audited approval event that may send Nightjar's professional welcome email. Queuing does not grant access or send an email. Existing roles are never overwritten. {demoMode ? 'This tool is disabled during Demo Mode.' : ''}</small>
    </div>}
  </section>;
}
