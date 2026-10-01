import { useEffect, useMemo, useState } from 'react';
import { Check, Gift, X } from 'lucide-react';
import { nightjarGifts, type NightjarWallet } from '../platform/firebase-nightjars';

type GiftRecipientRole = 'creator' | 'writer' | 'editor' | 'artist';

type Props = {
  recipientUserId: string;
  recipientName: string;
  recipientRole: string;
  recipientRoles?: string[];
  onClose: () => void;
  notify: (message: string) => void;
};

const money = (pence: number) => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
}).format(pence / 100);

const roleLabel = (role: string) => {
  if (role === 'creator') return 'VA Creator';
  if (role === 'editor') return 'Audio Editor';
  if (role === 'artist') return 'Artist';
  return role === 'writer' ? 'Writer' : 'Professional';
};

export default function NightjarGiftPanel({ recipientUserId, recipientName, recipientRole, recipientRoles = [], onClose, notify }: Props) {
  const [wallet, setWallet] = useState<NightjarWallet | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [anonymous, setAnonymous] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const eligibleRoles = useMemo<GiftRecipientRole[]>(() => Array.from(new Set(
    [recipientRole, ...recipientRoles]
      .map((role) => String(role))
      .filter((role): role is GiftRecipientRole => ['creator','writer','editor','artist'].includes(role)),
  )), [recipientRole, recipientRoles]);

  const [targetRole, setTargetRole] = useState<GiftRecipientRole>(() => eligibleRoles[0] ?? 'creator');

  useEffect(() => {
    if (!eligibleRoles.includes(targetRole)) setTargetRole(eligibleRoles[0] ?? 'creator');
  }, [eligibleRoles, targetRole]);

  const creatorValuePence = quantity * 100;
  const canSend = Boolean(wallet && eligibleRoles.length > 0 && wallet.balance >= quantity && quantity >= 1 && quantity <= 100 && !sending);

  useEffect(() => {
    void nightjarGifts.wallet()
      .then(setWallet)
      .catch(() => notify('Your Nightjar wallet could not be loaded.'));
  }, []);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const result = await nightjarGifts.send(recipientUserId, quantity, {
        recipientRole: targetRole,
        note,
        anonymous,
      });
      setWallet((current) => current ? { ...current, balance: result.balance, gifted: current.gifted + quantity } : current);
      setSent(true);
      notify(quantity === 1
        ? `1 Nightjar sent to ${recipientName} as ${roleLabel(targetRole)}. £1.00 has been added to their creator earnings.`
        : `${quantity} Nightjars sent to ${recipientName} as ${roleLabel(targetRole)}. ${money(result.creatorCreditPence)} has been added to their creator earnings.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Nightjars could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return <div className="creator-profile-backdrop" role="dialog" aria-modal="true" aria-label="Send Nightjars">
    <section className="creator-profile-modal nightjar-gift-modal">
      <header className="creator-profile-head">
        <div>
          <span className="mini-label">NIGHTJAR / SUPPORT GIFT</span>
          <h2>Send Nightjars</h2>
          <p>Support {recipientName} · {roleLabel(targetRole)}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close Nightjar gift panel"><X size={18}/></button>
      </header>

      <div className="creator-profile-body">
        <div className="nightjar-gift-recipient">
          <span className="nightjar-token-glyph" aria-hidden="true">
            <img src="/nightjar-token.svg" alt="" />
          </span>
          <div>
            <strong>{recipientName}</strong>
            <small>Every Nightjar you send adds £1.00 to this professional's monthly earnings.</small>
          </div>
        </div>

        {eligibleRoles.length > 1 && <div className="nightjar-recipient-role-picker">
          <span className="mini-label">SUPPORT WHICH ROLE?</span>
          <div>{eligibleRoles.map((role) => <button type="button" key={role} className={targetRole === role ? 'selected' : ''} aria-pressed={targetRole === role} onClick={() => setTargetRole(role)}>{roleLabel(role)}</button>)}</div>
          <small>Nightjars are credited one-to-one to the professional role you choose, even when one person has multiple Nightjar roles.</small>
        </div>}

        <div className="nightjar-wallet-summary">
          <span>Your wallet</span>
          <strong>{wallet ? wallet.balance : '…'} Nightjars</strong>
          <small>Nightjars do not expire. They can be gifted individually whenever you choose.</small>
        </div>

        {!sent ? <>
          <div className="nightjar-quantity-grid" aria-label="Choose number of Nightjars">
            {[1,2,3,5,10].map((value) =>
              <button type="button" key={value} className={quantity === value ? 'selected' : ''} onClick={() => setQuantity(value)}>
                <img className="nightjar-token-inline" src="/nightjar-token.svg" alt="" /> {value}
              </button>
            )}
          </div>

          <label className="account-access-field">
            <span>Custom amount</span>
            <input type="number" min={1} max={100} step={1} value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} />
          </label>

          <div className="nightjar-gift-value">
            <span>{quantity} Nightjar{quantity === 1 ? '' : 's'}</span>
            <strong>{money(creatorValuePence)} creator support</strong>
          </div>

          <label className="account-access-field">
            <span>Optional message</span>
            <textarea maxLength={280} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a short thank-you or support message." />
          </label>

          <label className="nightjar-anonymous-toggle">
            <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
            <span>Send anonymously</span>
          </label>

          {wallet && wallet.balance < quantity && <p className="panel-note">You need {quantity - wallet.balance} more Nightjar{quantity - wallet.balance === 1 ? '' : 's'} for this gift.</p>}

          <button className="primary-button" disabled={!canSend} onClick={() => void send()}>
            <Gift size={16}/> {sending ? 'Sending…' : `Send ${quantity} Nightjar${quantity === 1 ? '' : 's'}`}
          </button>
        </> : <div className="nightjar-gift-success">
          <Check size={28}/>
          <h3>Nightjars sent</h3>
          <p>{money(creatorValuePence)} has been added to {recipientName}'s {roleLabel(targetRole)} earnings.</p>
          <button className="secondary-button" onClick={onClose}>Done</button>
        </div>}
      </div>
    </section>
  </div>;
}
