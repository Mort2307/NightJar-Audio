import { useEffect, useState } from 'react';
import { Check, LockKeyhole, ShieldCheck } from 'lucide-react';
import { nightjarAdministration, type NightjarManagedProfessionalRole } from '../platform/firebase-administration';

const options: { id: NightjarManagedProfessionalRole; label: string }[] = [
  { id: 'creator', label: 'VA Creator' },
  { id: 'writer', label: 'Writer' },
  { id: 'editor', label: 'Audio Editor' },
  { id: 'artist', label: 'Artist' },
];

type Member = {
  userId: string;
  name?: string;
  email?: string;
  role?: string;
  roles?: string[];
  pendingProfessionalRoles?: string[];
  status?: string;
};

export default function AdminMemberRoleSelector({
  member, demoMode, onSaved, notify, onClose,
}: {
  member: Member;
  demoMode: boolean;
  onSaved: (result: { approvedProfessionalRoles: NightjarManagedProfessionalRole[]; pendingProfessionalRoles: NightjarManagedProfessionalRole[]; activeRole: string }) => void | Promise<void>;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const current = options.map((option) => option.id).filter((role) => (member.roles ?? []).includes(role));
  const [selected, setSelected] = useState<NightjarManagedProfessionalRole[]>(current);
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(current), [member.userId, (member.roles ?? []).join('|')]);
  const changed = current.some((role) => !selected.includes(role)) || selected.some((role) => !current.includes(role));
  const removed = current.filter((role) => !selected.includes(role));
  const added = selected.filter((role) => !current.includes(role));
  const pending = options.map((option) => option.id).filter((role) => (member.pendingProfessionalRoles ?? []).includes(role));

  const save = async () => {
    if (saving || !changed) return;
    if (removed.length && !window.confirm('Remove ' + removed.map((role) => options.find((option) => option.id === role)?.label).join(', ') + ' from this account? Their published work and saved profile data remain intact, but their professional workspace access will be revoked.')) return;
    setSaving(true);
    try {
      const result = demoMode
        ? {
          approvedProfessionalRoles: selected,
          pendingProfessionalRoles: pending.filter((role) => !selected.includes(role)),
          activeRole: member.role && member.role !== 'listener' && !selected.includes(member.role as NightjarManagedProfessionalRole) ? 'listener' : member.role ?? 'listener',
        }
        : await nightjarAdministration.manageProfessionalRoles(member.userId, selected, current);
      await onSaved(result);
      notify(demoMode ? 'Simulation: professional roles updated locally.' : 'Professional access updated. Existing personal and professional profile data preserved.');
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to update professional roles. Refresh the directory and try again.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="nj-admin-multi-role" aria-label="Manage professional roles">
    <div className="nj-admin-multi-role-header">
      <div><strong>Manage Roles &amp; Access</strong><small>{member.name || member.email || 'Nightjar member'} · one identity, multiple professional profiles</small></div>
      <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>Close</button>
    </div>
    <p>Choose every profession this member should hold. These are independent permissions — selecting another role never replaces an existing one.</p>
    <div className="nj-admin-multi-role-options">
      <div className="nj-admin-multi-role-listener"><LockKeyhole size={16}/><span>Listener access</span><strong>Always included</strong></div>
      {options.map((option) => <label key={option.id} className={'nj-admin-multi-role-choice' + (selected.includes(option.id) ? ' selected' : '')}>
        <input type="checkbox" checked={selected.includes(option.id)} disabled={saving || member.status === 'suspended'} onChange={(event) => setSelected((roles) =>
          event.target.checked ? [...roles, option.id] : roles.filter((role) => role !== option.id)
        )}/>
        <span>{option.label}{pending.includes(option.id) && !current.includes(option.id) && <small>Awaiting approval</small>}</span>
        {selected.includes(option.id) && <Check size={17} aria-hidden="true"/>}
      </label>)}
    </div>
    <p className="nj-admin-multi-role-footnote"><ShieldCheck size={15}/> Permission changes are audited. Age verification or explicitly approved test access is required for new professional grants. Administrator status is managed separately.</p>
    <div className="nj-admin-multi-role-actions">
      <button type="button" className="primary-button" disabled={!changed || saving || member.status === 'suspended'} onClick={() => void save()}>{saving ? 'Saving access…' : 'Save selected roles'}</button>
      <button type="button" className="secondary-button" disabled={saving} onClick={onClose}>Cancel</button>
    </div>
  </section>;
}
