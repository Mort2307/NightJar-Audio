import { useEffect, useMemo, useState } from 'react';
import { Bird, Check, Gift, X } from 'lucide-react';
import { nightjarGifts, type NightjarWallet } from '../platform/firebase-nightjars';

type Props = {
  recipientUserId: string;
  recipientName: string;
  recipientRole: string;
  onClose: () => void;
  notify: (message: string) => void;
};

const money = (pence: number) => new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
}).format(pence / 100);

export default function NightjarGiftPanel({ recipientUserId, recipientName, recipientRole, onClose, notify }: Props) {
  const [wallet, setWallet] = useState<NightjarWallet | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [anonymous, setAnonymous] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const creatorValuePence = quantity * 100;
  const canSend = Boolean(wallet && wallet.balance >= quantity && quantity >= 1 && quantity <= 100 && !sending);

  useEffect(() => {
    void nightjarGifts.wallet()
      .then(setWallet)
      .catch(() => notify('Your Nightjar wallet could not be loaded.'));
  }, []);

  const roleLabel = useMemo(() => {
    if (recipientRole === 'creator') return 'VA Creator';
    if (recipientRole === 'editor') return 'Audio Editor';
    if (recipientRole === 'artist') return 'Artist';
    return recipientRole === 'writer' ? 'Writer' : 'Creator';
  }, [recipientRole]);

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      const result = await nightjarGifts.send(recipientUserId, quantity, { note, anonymous });
      setWallet((current) => current ? { ...current, balance: result.balance, gifted: current.gifted + quantity } : current);
      setSent(true);
      notify(quantity === 1
        ? `1 Nightjar sent to ${recipientName}. £1.00 has been added to their creator earnings.`
        : `${quantity} Nightjars sent to ${recipientName}. ${money(result.creatorCreditPence)} has been added to their creator earnings.`);
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
          <p>Support {recipientName} · {roleLabel}</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close Nightjar gift panel"><X size={18}/></button>
      </header>

      <div className="creator-profile-body">
        <div className="nightjar-gift-recipient">
          <span className="nightjar-token-glyph" aria-hidden="true">
            <img src="/nightjar-token.png" alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            <Bird size={28}/>
          </span>
          <div>
            <strong>{recipientName}</strong>
            <small>Every Nightjar you send adds £1.00 to this creator's monthly earnings.</small>
          </div>
        </div>

        <div className="nightjar-wallet-summary">
          <span>Your wallet</span>
          <strong>{wallet ? wallet.balance : '…'} Nightjars</strong>
          <small>Nightjars do not expire. They can be gifted individually whenever you choose.</small>
        </div>

        {!sent ? <>
          <div className="nightjar-quantity-grid" aria-label="Choose number of Nightjars">
            {[1,2,3,5,10].map((value) =>
              <button type="button" key={value} className={quantity === value ? 'selected' : ''} onClick={() => setQuantity(value)}>
                <Bird size={16}/> {value}
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
          <p>{money(creatorValuePence)} has been added to {recipientName}'s creator earnings.</p>
          <button className="secondary-button" onClick={onClose}>Done</button>
        </div>}
      </div>
    </section>
  </div>;
}
