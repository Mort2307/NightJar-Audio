import { useState } from 'react';
import { Ban, Minus, MoreHorizontal, Sparkles } from 'lucide-react';
import { api } from '@appdeploy/client';

type FeedbackKind = 'more_like_this' | 'less_like_this' | 'not_for_me';
type Props = {
  release: { id: string; creatorUserId?: string | null; category?: string | null; genre?: string | null; mood?: string | null; tags?: string[]; tropes?: string[] };
  compact?: boolean;
  notify?: (message: string) => void;
  onFeedback?: (kind: FeedbackKind) => void;
};

const labels: Record<FeedbackKind, string> = { more_like_this: 'More like this', less_like_this: 'Less like this', not_for_me: 'Not for me' };

export default function RecommendationFeedback({ release, compact = false, notify, onFeedback }: Props) {
  const [saving, setSaving] = useState<FeedbackKind | null>(null);
  const [saved, setSaved] = useState<FeedbackKind | null>(null);
  const send = async (kind: FeedbackKind) => {
    if (saving) return;
    setSaving(kind);
    try {
      await api.post('/api/taste/feedback', { feedback: kind, releaseId: release.id, creatorUserId: release.creatorUserId ?? null, category: release.category ?? null, genre: release.genre ?? null, mood: release.mood ?? null, tags: release.tags ?? [], tropes: release.tropes ?? [] });
      setSaved(kind);
      onFeedback?.(kind);
      notify?.(kind === 'not_for_me' ? 'We’ll keep this release out of your recommendations.' : 'Nightjar noted: ' + labels[kind].toLowerCase() + '.');
    } catch { notify?.('Nightjar could not save that preference yet.'); }
    finally { setSaving(null); }
  };
  return <div className={compact ? 'recommendation-feedback compact' : 'recommendation-feedback'} aria-label="Recommendation feedback">
    <span className="recommendation-feedback-label"><Sparkles size={12} /> Tune this</span>
    <button type="button" className={saved === 'more_like_this' ? 'active' : ''} disabled={!!saving} onClick={() => void send('more_like_this')} aria-label={labels.more_like_this} title={labels.more_like_this}><MoreHorizontal size={14} />{!compact && 'More'}</button>
    <button type="button" className={saved === 'less_like_this' ? 'active' : ''} disabled={!!saving} onClick={() => void send('less_like_this')} aria-label={labels.less_like_this} title={labels.less_like_this}><Minus size={14} />{!compact && 'Less'}</button>
    <button type="button" className={saved === 'not_for_me' ? 'active' : ''} disabled={!!saving} onClick={() => void send('not_for_me')} aria-label={labels.not_for_me} title={labels.not_for_me}><Ban size={14} />{!compact && 'Not for me'}</button>
  </div>;
}