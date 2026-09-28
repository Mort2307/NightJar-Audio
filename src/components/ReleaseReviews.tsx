import { useEffect, useState } from 'react';
import { MessageSquare, Star, X } from 'lucide-react';
import { nightjarReviews } from '../platform/firebase-reviews';

type Props = {
  release: { id: string; title: string; creator?: string };
  onClose: () => void;
  notify: (message: string) => void;
  simulationMode?: boolean;
};

export default function ReleaseReviews({ release, onClose, notify, simulationMode = false }: Props) {
  const [data, setData] = useState<any>({ reviews: [], averageRating: null, ratingCount: 0, myReview: null });
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      if (simulationMode) {
        setData({
          reviews: [
            { id:'demo-review-1', reviewerName:'Jamie', rating:5, review:'Loved the pacing and the production detail.' },
            { id:'demo-review-2', reviewerName:'Lex', rating:4, review:'Strong performance and really clean audio.' },
          ],
          averageRating:4.5,
          ratingCount:2,
          myReview:null,
        });
      } else {
        const next = await nightjarReviews.list(release.id);
        setData(next);
        if (next.myReview) {
          setRating(next.myReview.rating ?? 5);
          setReview(next.myReview.review ?? '');
        }
      }
    } catch {
      notify('Reviews could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [release.id, simulationMode]);

  const submit = async () => {
    setSaving(true);
    try {
      if (simulationMode) {
        const next = { id:'demo-own-review', reviewerName:'You', rating, review, status:'pending' };
        setData((current: any) => ({ ...current, myReview: next }));
        notify('Simulation: review submitted locally for moderation.');
      } else {
        const next = await nightjarReviews.submit(release.id, rating, review);
        setData((current: any) => ({ ...current, myReview: next.review }));
        notify('Review submitted for moderation.');
      }
    } catch {
      notify('Review could not be submitted.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="review-modal-backdrop" role="dialog" aria-modal="true" aria-label={'Reviews for ' + release.title}>
    <section className="review-modal">
      <header className="review-modal-head">
        <div><span className="mini-label">LISTENER REVIEWS</span><h2>{release.title}</h2><p>{release.creator ?? 'Nightjar creator'}</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close reviews"><X size={18}/></button>
      </header>

      <div className="review-summary">
        <Star size={19} fill="currentColor"/>
        <strong>{data.averageRating == null ? 'No public rating yet' : data.averageRating + ' / 5'}</strong>
        <span>{data.ratingCount ?? 0} approved review{data.ratingCount === 1 ? '' : 's'}</span>
      </div>

      <article className="research-panel review-compose">
        <span className="mini-label">YOUR REVIEW</span>
        <p>Ratings and comments apply to this release, not to a creator's personal worth. Written reviews are moderated before they appear publicly.</p>
        <div className="review-stars" aria-label="Rating out of five">
          {[1,2,3,4,5].map((value) => <button key={value} type="button" className={value <= rating ? 'active' : ''} onClick={() => setRating(value)} aria-label={value + ' stars'}><Star size={20} fill={value <= rating ? 'currentColor' : 'none'}/></button>)}
        </div>
        <textarea value={review} onChange={(event) => setReview(event.target.value)} maxLength={1600} placeholder="Optional review of the story, performance, audio and production."/>
        {data.myReview && <p className="review-own-status">Current submission: <strong>{data.myReview.status}</strong>{data.myReview.status === 'pending' ? ' · awaiting moderation' : ''}</p>}
        <button className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? 'Submitting…' : data.myReview ? 'Update review' : 'Submit review'}</button>
      </article>

      <div className="review-list">
        {loading ? <div className="people-empty">Loading reviews…</div> : (data.reviews ?? []).length === 0 ? <div className="people-empty"><MessageSquare size={18}/><strong>No approved reviews yet.</strong><span>Be the first listener to leave thoughtful feedback.</span></div> : (data.reviews ?? []).map((item: any) => <article className="review-card" key={item.id}>
          <div><strong>{item.reviewerName ?? 'Nightjar listener'}</strong><span>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span></div>
          {item.review && <p>{item.review}</p>}
        </article>)}
      </div>
    </section>
  </div>;
}
