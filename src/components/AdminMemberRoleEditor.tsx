import { useEffect, useState } from 'react';
import { Check, ShieldCheck, Users, X } from 'lucide-react';
import type { NightjarManagedProfessionalRole } from '../platform/firebase-administration';

const PROFESSION_OPTIONS: { id: NightjarManagedProfessionalRole; name: string }[] = [
  { id: 'creator', name: 'VA Creator' },
  { id: 'writer', name: 'Writer' },
  { id: 'editor', name: 'Audio Editor' },
  { id: 'artist', name: 'Artist' },
];

const validRoles = (account: any) =>
  PROFESSION_OPTIONS.map((item) => item.id).filter((role) =>
    Array.isArray(account?.roles) && account.roles.includes(role)
  );

export default function AdminMemberRoleEditor({
  account,
  onSave,
  onQueue,
  onActiveRoleChange,
  onStatusChange,
  onTestAccessChange,
}: {
  account: any;
  onSave: (account: any, approvedRoles: NightjarManagedProfessionalRole[], previouslyApproved: NightjarManagedProfessionalRole[]) => Promise<void>;
  onQueue: (account: any, pendingRoles: NightjarManagedProfessionalRole[]) => Promise<void>;
  onActiveRoleChange: (account: any, role: 'listener' | NightjarManagedProfessionalRole) => Promise<void>;
  onStatusChange: (account: any, status: 'active' | 'pending_review' | 'suspended') => Promise<void>;
  onTestAccessChange: (account: any, enabled: boolean) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<NightjarManagedProfessionalRole[]>(() => validRoles(account));
  const [queueSelected, setQueueSelected] = useState<NightjarManagedProfessionalRole[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSelected(validRoles(account));
    setQueueSelected([]);
    setError('');
  }, [account.userId, JSON.stringify(account.roles)]);

  const approved = validRoles(account);
  const changed = selected.length !== approved.length || selected.some((role) => !approved.includes(role));
  const pending = Array.isArray(account.pendingProfessionalRoles)
    ? account.pendingProfessionalRoles.filter((role: string) => PROFESSION_OPTIONS.some((item) => item.id === role))
    : [];

  const queueRoles = async () => {
    if (busy || queueSelected.length === 0 || account.status === 'suspended') return;
    setBusy(true);
    setError('');
    try {
      await onQueue(account, queueSelected);
      setQueueSelected([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Professional roles could not be queued.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (busy || !changed) return;
    const removed = approved.filter((role) => !selected.includes(role));
    if (removed.length && !window.confirm('Remove ' + removed.map((role) => PROFESSION_OPTIONS.find((item) => item.id === role)?.name).join(', ') + ' access from this account? The member\'s existing creative work remains stored, but their role permissions will be withdrawn.')) return;
    setBusy(true);
    setError('');
    try {
      await onSave(account, selected, approved);
      setExpanded(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Role changes could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="people-row-role-management">
    <div className="people-row-current-roles">
      <span className="mini-label">ACCESS GRANTED</span>
      <div className="people-row-role-badges">
        <span>Listener</span>
        {approved.map((role) => <span key={role}>{PROFESSION_OPTIONS.find((item) => item.id === role)?.name}</span>)}
      </div>
      {pending.length > 0 && <small>Pending: {pending.map((role: string) => PROFESSION_OPTIONS.find((item) => item.id === role)?.name).join(', ')}</small>}
    </div>
    <div className="people-row-controls">
      <button type="button" className={expanded ? 'primary-button' : 'secondary-button'}
        aria-expanded={expanded} aria-label={'Manage multiple roles for ' + (account.name ?? account.email ?? 'this member')}
        onClick={() => { setExpanded((value) => !value); setError(''); }}>
        <Users size={15}/> {expanded ? 'Hide role manager' : 'Manage Roles & Access'}
      </button>
      <label>Active workspace
        <select disabled={busy} value={account.role ?? 'listener'}
          onChange={(event) => void onActiveRoleChange(account, event.target.value as 'listener' | NightjarManagedProfessionalRole)}>
          <option value="listener">Listener</option>
          {approved.map((role) => <option key={role} value={role}>{PROFESSION_OPTIONS.find((item) => item.id === role)?.name}</option>)}
        </select>
      </label>
      <label>Account status
        <select disabled={busy} value={account.status ?? 'active'}
          onChange={(event) => void onStatusChange(account, event.target.value as 'active' | 'pending_review' | 'suspended')}>
          <option value="active">Active</option>
          <option value="pending_review">Pending review</option>
          <option value="suspended">Suspended</option>
        </select>
      </label>
      <button type="button" className={account.testAccess ? 'secondary-button' : 'ghost-button'}
        disabled={busy} onClick={() => void onTestAccessChange(account, !account.testAccess)}>
        {account.testAccess ? 'Remove tester access' : 'Enable tester access'}
      </button>
    </div>
    {expanded && <div className="admin-member-multi-role-editor" role="group" aria-label="Select multiple professional roles">
      <div className="admin-member-multi-role-heading">
        <ShieldCheck size={17}/><div><strong>One account. Multiple professional roles.</strong>
        <small>Listener access stays enabled. Tick every profession this member should have; no second account is required.</small></div>
      </div>
      <div className="admin-member-multi-role-options">
        <label className="selected role-always-on"><input type="checkbox" checked readOnly disabled/> Listener <small>Always included</small></label>
        {PROFESSION_OPTIONS.map(({ id, name }) => <label key={id} className={selected.includes(id) ? 'selected' : ''}>
          <input type="checkbox" checked={selected.includes(id)} disabled={busy}
            onChange={(event) => setSelected((current) =>
              event.target.checked ? [...current, id] : current.filter((role) => role !== id)
            )}/>
          <span>{name}</span>{pending.includes(id) && <small>Requested</small>}
        </label>)}
      </div>
      <p>New role grants require verified age assurance or explicitly enabled temporary tester access. Every change is attributed to the administrator and recorded in the professional access history.</p>
      <div className="admin-member-queue-roles" role="group" aria-label="Queue professional roles for approval">
        <strong>Queue additional roles without granting access</strong>
        <p>Selected roles enter the approval inbox. The member must accept their own professional terms and pass age assurance before an administrator can approve them. No existing role is removed.</p>
        <div className="admin-member-multi-role-options">
          {PROFESSION_OPTIONS.filter(({ id }) => !approved.includes(id) && !pending.includes(id)).map(({ id, name }) => (
            <label key={id} className={queueSelected.includes(id) ? 'selected' : ''}>
              <input type="checkbox" checked={queueSelected.includes(id)} disabled={busy || account.status === 'suspended'}
                onChange={(event) => setQueueSelected((roles) =>
                  event.target.checked ? [...roles, id] : roles.filter((role) => role !== id)
                )}/>
              <span>{name}</span><small>Awaiting approval only</small>
            </label>
          ))}
        </div>
        {PROFESSION_OPTIONS.every(({ id }) => approved.includes(id) || pending.includes(id)) &&
          <small>All professional roles are already approved or queued.</small>}
        <button type="button" className="secondary-button" disabled={busy || !queueSelected.length || account.status === 'suspended'}
          onClick={() => void queueRoles()}>{busy ? 'Updating roles…' : 'Queue selected roles for review'}</button>
      </div>

      {error && <div className="nj-role-save-error" role="alert">{error}</div>}
      <div className="admin-member-multi-role-actions">
        <button type="button" className="ghost-button" disabled={busy} onClick={() => setSelected(approved)}><X size={15}/> Reset selection</button>
        <button type="button" className="primary-button" disabled={busy || !changed} onClick={() => void save()}>
          <Check size={16}/> {busy ? 'Saving roles…' : 'Save selected roles'}
        </button>
      </div>
    </div>}
  </div>;
}
