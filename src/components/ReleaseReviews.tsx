import { useEffect, useRef, useState } from 'react';
import { Heart, MessageCircle, MessageSquare, Star, ThumbsUp, Trash2, X, Flag } from 'lucide-react';
import { nightjarReviews } from '../platform/firebase-reviews';
import { nightjarEngagement, type ReleaseReaction } from '../platform/firebase-engagement';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

type Props = {
  release: { id: string; title: string; creator?: string };
  onClose: () => void;
  notify: (message: string) => void;
  viewerRole?: string | null;
  currentUserId?: string | null;
  demoMode?: boolean;
  simulationMode?: boolean;
};

export default function ReleaseReviews({ release, onClose, notify, viewerRole = null, currentUserId = null, demoMode = false, simulationMode = false }: Props) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const [data, setData] = useState<any>({ reviews: [], averageRating: null, ratingCount: 0, myReview: null });
  const [community, setCommunity] = useState<any>({ comments: [], reactions: { likes: 0, loves: 0, total: 0, myReaction: null } });
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const [reactionSaving, setReactionSaving] = useState(false);

  useDialogFocusTrap(dialogRef, { onEscape: onClose });

  const canInteract = viewerRole === 'listener';

  const load = async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setData({
          reviews: [
            { id:'demo-review-1', reviewerName:'Jamie', rating:5, review:'Loved the pacing and the production detail.' },
            { id:'demo-review-2', reviewerName:'Lex', rating:4, review:'Strong performance and really clean audio.' },
          ],
          averageRating:4.5,
          ratingCount:2,
          myReview:null,
        });
        setCommunity({
          reactions:{ likes:18, loves:31, total:49, myReaction:null },
          comments:[
            { id:'demo-comment-1', userId:'demo-listener-jamie', commenterName:'Jamie', commenterHandle:'jamielistens', body:'That final scene landed perfectly. The pacing gave it room to breathe.', createdAt:new Date(Date.now()-4800000).toISOString() },
            { id:'demo-comment-2', userId:'demo-listener-lex', commenterName:'Lex', commenterHandle:'lexlistens', body:'The sound design on headphones is brilliant.', createdAt:new Date(Date.now()-2600000).toISOString() },
          ],
        });
      } else {
        const [reviews, engagement] = await Promise.all([
          nightjarReviews.list(release.id),
          nightjarEngagement.community(release.id),
        ]);
        setData(reviews);
        setCommunity(engagement);
        if (reviews.myReview) {
          setRating(reviews.myReview.rating ?? 5);
          setReview(reviews.myReview.review ?? '');
        }
      }
    } catch {
      notify('Release community could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [release.id, demoMode]);

  const react = async (reaction: Exclude<ReleaseReaction, null>) => {
    if (!canInteract) return notify('Listener accounts can Like or Love published releases.');
    if (demoMode && !simulationMode) return notify('Demo data is read-only. Start Listener Simulation to react.');
    const next: ReleaseReaction = community.reactions?.myReaction === reaction ? null : reaction;
    setReactionSaving(true);
    try {
      if (simulationMode) {
        setCommunity((current:any) => {
          const previous=current.reactions?.myReaction as ReleaseReaction;
          let likes=Number(current.reactions?.likes??0);
          let loves=Number(current.reactions?.loves??0);
          if(previous==='like')likes=Math.max(0,likes-1);
          if(previous==='love')loves=Math.max(0,loves-1);
          if(next==='like')likes+=1;
          if(next==='love')loves+=1;
          return { ...current, reactions:{ likes,loves,total:likes+loves,myReaction:next } };
        });
      } else {
        const nextData = await nightjarEngagement.setReaction(release.id, next);
        setCommunity(nextData);
      }
    } catch {
      notify('Reaction could not be updated.');
    } finally {
      setReactionSaving(false);
    }
  };

  const postComment = async () => {
    const body=comment.trim();
    if(!body)return;
    if (!canInteract) return notify('Listener accounts can comment on published releases.');
    if (demoMode && !simulationMode) return notify('Demo data is read-only. Start Listener Simulation to comment.');
    setCommentSaving(true);
    try {
      if (simulationMode) {
        const next={ id:'demo-comment-'+Date.now(), userId:currentUserId??'demo-self', commenterName:'You', commenterHandle:null, body, createdAt:new Date().toISOString() };
        setCommunity((current:any)=>({...current,comments:[...(current.comments??[]),next]}));
      } else {
        const result=await nightjarEngagement.comment(release.id,body);
        setCommunity((current:any)=>({...current,comments:[...(current.comments??[]),result.comment]}));
      }
      setComment('');
      notify('Comment published.');
    } catch {
      notify('Comment could not be published. You may need to wait before posting again.');
    } finally {
      setCommentSaving(false);
    }
  };

  const deleteComment = async (item:any) => {
    try {
      if(!demoMode)await nightjarEngagement.deleteComment(item.id);
      setCommunity((current:any)=>({...current,comments:(current.comments??[]).filter((commentItem:any)=>commentItem.id!==item.id)}));
      notify('Comment deleted.');
    } catch {
      notify('Comment could not be deleted.');
    }
  };

  const reportComment = async (item:any) => {
    const reason=window.prompt('What should Nightjar moderation review about this comment?')?.trim();
    if(reason==null)return;
    try {
      if(!demoMode)await nightjarEngagement.reportComment(item.id,reason);
      notify('Comment reported for Administrator review.');
    } catch {
      notify('Comment could not be reported.');
    }
  };

  const submitReview = async () => {
    if (!canInteract) return notify('Listener accounts can submit release reviews.');
    setSaving(true);
    try {
      if (demoMode && !simulationMode) {
        notify('Demo data is read-only. Start Listener Simulation to submit a review.');
        return;
      }
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

  return <div className="review-modal-backdrop" role="dialog" aria-modal="true" aria-label={'Community for ' + release.title}>
    <section ref={dialogRef} tabIndex={-1} className="review-modal release-community-modal">
      <header className="review-modal-head">
        <div><span className="mini-label">PUBLISHED WORK / COMMUNITY</span><h2>{release.title}</h2><p>{release.creator ?? 'Nightjar creator'}</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close release community"><X size={18}/></button>
      </header>

      <div className="release-community-summary">
        <button className={community.reactions?.myReaction==='like'?'active':''} disabled={reactionSaving||!canInteract} onClick={()=>void react('like')} aria-pressed={community.reactions?.myReaction==='like'}><ThumbsUp size={17} fill={community.reactions?.myReaction==='like'?'currentColor':'none'}/><span><strong>{community.reactions?.likes??0}</strong> Like{community.reactions?.likes===1?'':'s'}</span></button>
        <button className={community.reactions?.myReaction==='love'?'active':''} disabled={reactionSaving||!canInteract} onClick={()=>void react('love')} aria-pressed={community.reactions?.myReaction==='love'}><Heart size={17} fill={community.reactions?.myReaction==='love'?'currentColor':'none'}/><span><strong>{community.reactions?.loves??0}</strong> Love{community.reactions?.loves===1?'':'s'}</span></button>
        <div><MessageCircle size={17}/><span><strong>{community.comments?.length??0}</strong> comment{community.comments?.length===1?'':'s'}</span></div>
        <div><Star size={17} fill="currentColor"/><span><strong>{data.averageRating == null ? '—' : data.averageRating}</strong> / 5 · {data.ratingCount??0} review{data.ratingCount===1?'':'s'}</span></div>
      </div>

      <section className="release-comments-section">
        <div className="panel-title"><div><span className="mini-label">LISTENER COMMENTS</span><h3>Talk about the work.</h3></div><MessageCircle size={17}/></div>
        <p className="panel-note">Comments publish immediately under your Nightjar identity. They can be deleted by you and reported for Administrator review.</p>
        {canInteract && <div className="release-comment-compose">
          <textarea value={comment} maxLength={1200} onChange={(event)=>setComment(event.target.value)} placeholder="Leave a comment about the story, performance, writing, edit or production…"/>
          <div><small>{comment.length}/1200</small><button className="primary-button" disabled={commentSaving||!comment.trim()} onClick={()=>void postComment()}>{commentSaving?'Publishing…':'Publish comment'}</button></div>
        </div>}
        {!canInteract && <div className="release-community-readonly"><ShieldCheck size={14}/><span>Comments are visible to creative accounts, but only Listener accounts can post reactions or comments.</span></div>}
        <div className="release-comment-list">
          {loading ? <div className="people-empty">Loading comments…</div> : (community.comments??[]).length ? (community.comments??[]).map((item:any)=>{
            const mine=item.userId===currentUserId || (simulationMode&&item.commenterName==='You');
            return <article className="release-comment" key={item.id}><div className="release-comment-head"><div><strong>{item.commenterName??'Nightjar listener'}</strong><span>{item.commenterHandle?'@'+String(item.commenterHandle).replace(/^@/,''):''}{item.createdAt?' · '+new Date(item.createdAt).toLocaleString('en-GB'):''}</span></div><div>{mine?<button className="text-button" onClick={()=>void deleteComment(item)}><Trash2 size={11}/> Delete</button>:<button className="text-button" onClick={()=>void reportComment(item)}><Flag size={11}/> Report</button>}</div></div><p>{item.body}</p></article>;
          }) : <div className="people-empty"><MessageCircle size={17}/><strong>No comments yet.</strong><span>Listeners can start the conversation directly on this published work.</span></div>}
        </div>
      </section>

      <section className="release-reviews-section">
        <div className="panel-title"><div><span className="mini-label">FORMAL REVIEWS</span><h3>Ratings with moderation.</h3></div><Star size={17}/></div>
        {canInteract && <article className="research-panel review-compose">
          <p>Reviews are separate from comments: ratings and written reviews are moderated before public display.</p>
          <div className="review-stars" aria-label="Rating out of five">
            {[1,2,3,4,5].map((value) => <button key={value} type="button" className={value <= rating ? 'active' : ''} onClick={() => setRating(value)} aria-label={value + ' stars'}><Star size={20} fill={value <= rating ? 'currentColor' : 'none'}/></button>)}
          </div>
          <textarea value={review} onChange={(event) => setReview(event.target.value)} maxLength={1600} placeholder="Optional formal review of the story, performance, writing, edit and production."/>
          {data.myReview && <p className="review-own-status">Current submission: <strong>{data.myReview.status}</strong>{data.myReview.status === 'pending' ? ' · awaiting moderation' : ''}</p>}
          <button className="primary-button" disabled={saving} onClick={() => void submitReview()}>{saving ? 'Submitting…' : data.myReview ? 'Update review' : 'Submit review'}</button>
        </article>}

        <div className="review-list">
          {loading ? <div className="people-empty">Loading reviews…</div> : (data.reviews ?? []).length === 0 ? <div className="people-empty"><MessageSquare size={18}/><strong>No approved reviews yet.</strong><span>Approved Listener reviews will appear here.</span></div> : (data.reviews ?? []).map((item: any) => <article className="review-card" key={item.id}>
            <div><strong>{item.reviewerName ?? 'Nightjar listener'}</strong><span>{'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}</span></div>
            {item.review && <p>{item.review}</p>}
          </article>)}
        </div>
      </section>
    </section>
  </div>;
}
