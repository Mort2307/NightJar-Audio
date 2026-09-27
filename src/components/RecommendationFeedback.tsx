import { useState } from 'react';
import { api } from '@appdeploy/client';
import { Ban, ChevronDown, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react';

type Props = {
  releaseId: string;
  compact?: boolean;
  notify: (message: string) => void;
  onFeedback?: (signal: string) => void;
};

const OPTIONS = [
  { signal: 'more_like_this', label: 'More like this', icon: ThumbsUp },
  { signal: 'less_like_this', label: 'Less like this', icon: ThumbsDown },
  { signal: 'not_for_me', label: 'Not for me', icon: Ban },
] as const;

export default function RecommendationFeedback({ releaseId, compact = false, notify, onFeedback }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const send = async (signal: string, label: string) => {
    if (busy) return;
    setBusy(signal);
    try {
      await api.post('/api/taste/feedback', { releaseId, signal });
      setChosen(signal);
      onFeedback?.(signal);
      notify(label + ' — Nightjar will adjust your recommendations.');
    } catch {
      notify('Nightjar could not save that preference.');
    } finally {
      setBusy(null);
      setOpen(false);
    }
  };

  if (compact) {
    return <div className="recommendation-feedback compact">
      <button className="ghost-button" disabled={Boolean(busy)} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Sparkles size={13} /> {chosen ? 'Preference saved' : 'Tune this'}
        <ChevronDown size={12} />
      </button>
      {open && <div className="recommendation-feedback-menu" role="menu">
        {OPTIONS.map(({ signal, label, icon: Icon }) => <button key={signal} role="menuitem" disabled={Boolean(busy)} onClick={() => void send(signal, label)}><Icon size={13} />{label}</button>)}
      </div>}
    </div>;
  }

  return <div className="recommendation-feedback" aria-label="Tune recommendation">
    <span><Sparkles size={12} /> Tune discovery</span>
    <div>{OPTIONS.map(({ signal, label, icon: Icon }) => <button key={signal} disabled={Boolean(busy)} className={chosen === signal ? 'active' : ''} onClick={() => void send(signal, label)}><Icon size={13} />{label}</button>)}</div>
  </div>;
}
