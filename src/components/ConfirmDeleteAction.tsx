import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import './confirm-delete-action.css';

type Props = {
  label: string;
  itemName: string;
  description: string;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  iconOnly?: boolean;
  confirmLabel?: string;
};

export default function ConfirmDeleteAction({
  label, itemName, description, onConfirm, disabled = false, iconOnly = false,
  confirmLabel = 'Yes, remove',
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const execute = async () => {
    if (pending.current || !confirming || disabled) return;
    pending.current = true;
    setBusy(true);
    try {
      await onConfirm();
      setConfirming(false);
    } catch {
      // The caller owns the failure message; keep the panel open to permit a
      // deliberate retry instead of silently reporting a successful removal.
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <span className="nj-confirm-delete-action">
    {!confirming ? <button type="button" className="nj-delete-trigger" aria-label={label + ': ' + itemName}
      title={label + ': ' + itemName} disabled={disabled} onClick={() => setConfirming(true)}>
      <Trash2 size={16} aria-hidden="true"/>{!iconOnly && <span>{label}</span>}
    </button> : <span className="nj-delete-confirmation" role="group" aria-label={'Confirm ' + label + ': ' + itemName}>
      <strong>Are you sure?</strong>
      <span><b>{itemName}</b> — {description}</span>
      <span className="nj-delete-confirmation-buttons">
        <button type="button" className="ghost-button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        <button type="button" className="danger-button" disabled={busy} aria-busy={busy} onClick={() => void execute()}>
          {busy ? 'Removing…' : confirmLabel}
        </button>
      </span>
    </span>}
  </span>;
}
