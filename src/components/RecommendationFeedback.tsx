import { useState } from 'react';
import { api } from '@appdeploy/client';
import { EyeOff, ThumbsDown, ThumbsUp } from 'lucide-react';

export type RecommendationSignal = 'more_like_this' | 'less_like_this' | 'not_for_me';

type Props = {
  release: {
    id: string | number;
    category?: string | null;
    tags?: string[];
    tropes?: string[];
  };
  onFeedback?: (signal: RecommendationSignal) => void;
  notify: (message: string) => void;
};

export default function RecommendationFeedback({ release, onFeedback, notify }: Props) {
  const [busy, setBusy] = useState<RecommendationSignal | null>(null);

  const send = async (signal: RecommendationSignal) => {
    if (busy) return;
    setBusy(signal);
    try {
      await api.post('/api/taste/event', {
        eventType: signal,
        contentId: String(release.id),
        category: release.category ?? null,
        tags: [...(release.tags ?? []), ...(release.tropes ?? [])].slice(0, 12),
      });
      onFeedback?.(signal);
      notify(signal === 'more_like_this' ? 'Nightjar will favour more work like this.' : signal === 'less_like_this' ? 'Nightjar will reduce similar recommendations.' : 'This release will be removed from your current recommendations.');
    } catch {
      notify('Recommendation feedback could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  return <div className="recommendation-feedback" role="group" aria-label="Tune this recommendation">
    <button disabled={Boolean(busy)} onClick={() => void send('more_like_this')} aria-label="More like this"><ThumbsUp size={13}/> More like this</button>
    <button disabled={Boolean(busy)} onClick={() => void send('less_like_this')} aria-label="Less like this"><ThumbsDown size={13}/> Less like this</button>
    <button disabled={Boolean(busy)} onClick={() => void send('not_for_me')} aria-label="Not for me"><EyeOff size={13}/> Not for me</button>
  </div>;
}
