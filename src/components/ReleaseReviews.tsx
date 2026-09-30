import { useEffect, useRef, useState } from 'react';
import { Flag, Heart, MessageSquare, Star, ThumbsUp, Trash2, X } from 'lucide-react';
import { nightjarReviews } from '../platform/firebase-reviews';
import { nightjarEngagement } from '../platform/firebase-engagement';
import { useDialogFocusTrap } from '../hooks/useDialogFocusTrap';

type Props = {
  release: { id: string; title: string; creator?: string };
  onClose: () => void;
  notify: (message: string) => void;
  demoMode?: boolean;
  simulationMode?: boolean;
  viewerRole?: string | null;
  currentUserId?: string | null;
  onCommunityChanged?: (summary: { likes:number; loves:number; total:number; comments:number }) => void;
};

export default function ReleaseReviews({
  release,
  onClose,
  notify,
  demoMode = false,
  simulationMode = false,
  viewerRole = null,
  currentUserId = null,
  onCommunityChanged,
}: Props) {
  const canCommunityInteract = viewerRole === 'listener';
  const dialogRef = useRef<HTMLElement | null>(null);
  const [tab, setTab] = useState<'comments' | 'reviews'>('comments');
  const [reviews, setReviews] = useState<any>({ reviews: [], averageRating: null, ratingCount: 0, myReview: null });
  const [community, setCommunity] = useState<any>({ comments: [], reactions: { likes:0, loves:0, total:0, myReaction:null }, canInteract:canCommunityInteract });
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingReview, setSavingReview] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [reacting, setReacting] = useState(false);

  useDialogFocusTrap(dialogRef, { onEscape: onClose });

  const load = async () => {
    setLoading(true);
    try {
      if (demoMode) {
        setReviews({
          reviews: [
            { id:'demo-review-1', reviewerName:'Jamie', rating:5, review:'Loved the pacing and the production detail.' },
            { id:'demo-review-2', reviewerName:'Lex', rating:4, review:'Strong performance and really clean audio.' },
          ],
          averageRating:4.5,
          ratingCount:2,
          myReview:null,
        });
        setCommunity({
          comments:[
            { id:'demo-comment-1', userId:'demo-listener-jamie', commenterName:'Jamie', commenterHandle:'jamielistens', body:'The final few minutes landed really well.', createdAt:new Date(Date.now()-3600000).toISOString() },
            { id:'demo-comment-2', userId:'demo-listener-lex', commenterName:'Lex', commenterHandle:'lexlistens', body:'Would absolutely listen to another episode in this series.', createdAt:new Date(Date.now()-1800000).toISOString() },
          ],
          reactions:{ likes:18, loves:37, total:55, myReaction:null },
          canInteract:canCommunityInteract,
        });
        onCommunityChanged?.({ likes:18, loves:37, total:55, comments:2 });
      } else {
        const [reviewData, communityData] = await Promise.all([
          nightjarReviews.list(release.id),
          nightjarEngagement.community(release.id),
        ]);
        setReviews(reviewData);
        setCommunity(communityData);
        onCommunityChanged?.({
          likes:Number(communityData.reactions?.likes ?? 0),
          loves:Number(communityData.reactions?.loves ?? 0),
          total:Number(communityData.reactions?.total ?? 0),
          comments:Number(communityData.comments?.length ?? 0),
        });
        if (reviewData.myReview) {
          setRating(reviewData.myReview.rating ?? 5);
          setReview(reviewData.myReview.review ?? '');
        }
      }
    } catch {
      notify('Release community could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [release.id, demoMode]);

  const submitReview = async () => {
    if (!canCommunityInteract) return notify('Listener accounts can submit public reviews.');
    setSavingReview(true);
    try {
      if (demoMode && !simulationMode) return notify('Demo data is read-only. Start Listener Simulation to submit a review.');
      if (simulationMode) {
        const next = { id:'demo-own-review', reviewerName:'You', rating, review, status:'pending' };
        setReviews((current:any)=>({ ...current, myReview:next }));
        notify('Simulation: review submitted locally for moderation.');
      } else {
        const next = await nightjarReviews.submit(release.id, rating, review);
        setReviews((current:any)=>({ ...current, myReview:next.review }));
        notify('Review submitted for moderation.');
      }
    } catch {
      notify('Review could not be submitted.');
    } finally {
      setSavingReview(false);
    }
  };

  const submitComment = async () => {
    const body = comment.trim();
    if (!canCommunityInteract) return notify('Listener accounts can comment on published work.');
    if (!body) return;
    setSavingComment(true);
    try {
      if (demoMode && !simulationMode) return notify('Demo data is read-only. Start Listener Simulation to comment.');
      if (simulationMode) {
        const next={ id:'demo-comment-'+Date.now(), userId:currentUserId ?? 'demo-listener', commenterName:'You', commenterHandle:'you', body, createdAt:new Date().toISOString() };
        const nextComments=[...(community.comments??[]),next];
        setCommunity((current:any)=>({ ...current, comments:nextComments }));
        onCommunityChanged?.({ likes:Number(community.reactions?.likes??0), loves:Number(community.reactions?.loves??0), total:Number(community.reactions?.total??0), comments:nextComments.length });
      } else {
        const next=await nightjarEngagement.comment(release.id,body);
        const nextComments=[...(community.comments??[]),next.comment];
        const nextReactions=next.reactions ?? community.reactions;
        setCommunity((current:any)=>({ ...current, comments:nextComments, reactions:nextReactions }));
        onCommunityChanged?.({
          likes:Number(nextReactions?.likes??0),
          loves:Number(nextReactions?.loves??0),
          total:Number(nextReactions?.total??0),
          comments:Number(next.commentCount ?? nextComments.length),
        });
      }
      setComment('');
      notify('Comment posted.');
    } catch {
      notify('Comment could not be posted.');
    } finally {
      setSavingComment(false);
    }
  };

  const react = async (reaction:'like'|'love') => {
    if (!canCommunityInteract) return notify('Listener accounts can react to published work.');
    if (reacting) return;
    setReacting(true);
    try {
      const nextReaction = community.reactions?.myReaction === reaction ? null : reaction;
      if (demoMode && !simulationMode) return notify('Demo data is read-only. Start Listener Simulation to react.');
      if (simulationMode) {
        const previous=community.reactions?.myReaction;
        let likes=Number(community.reactions?.likes??0);
        let loves=Number(community.reactions?.loves??0);
        if(previous==='like') likes=Math.max(0,likes-1);
        if(previous==='love') loves=Math.max(0,loves-1);
        if(nextReaction==='like') likes+=1;
        if(nextReaction==='love') loves+=1;
        setCommunity((current:any)=>({...current,reactions:{likes,loves,total:likes+loves,myReaction:nextReaction||null}}));
        onCommunityChanged?.({ likes, loves, total:likes+loves, comments:Number(community.comments?.length??0) });
      } else {
        const next=await nightjarEngagement.setReaction(release.id,nextReaction);
        setCommunity((current:any)=>({ ...current, ...next }));
        onCommunityChanged?.({ likes:Number(next.reactions?.likes??0), loves:Number(next.reactions?.loves??0), total:Number(next.reactions?.total??0), comments:Number(next.comments?.length??community.comments?.length??0) });
      }
    } catch {
      notify('Reaction could not be updated.');
    } finally {
      setReacting(false);
    }
  };

  const deleteComment = async (item:any) => {
    if (!window.confirm('Delete this comment?')) return;
    try {
      if (!simulationMode) await nightjarEngagement.deleteComment(item.id);
      const nextComments=(community.comments??[]).filter((entry:any)=>entry.id!==item.id);
      setCommunity((current:any)=>({ ...current, comments:nextComments }));
      onCommunityChanged?.({ likes:Number(community.reactions?.likes??0), loves:Number(community.reactions?.loves??0), total:Number(community.reactions?.total??0), comments:nextComments.length });
      notify('Comment deleted.');
    } catch {
      notify('Comment could not be deleted.');
    }
  };

  const reportComment = async (item:any) => {
    const reason=window.prompt('Why are you reporting this comment?') ?? '';
    if (!reason.trim()) return;
    try {
      if (!simulationMode) await nightjarEngagement.reportComment(item.id,reason);
      notify('Comment reported for administrator review.');
    } catch {
      notify('Comment could not be reported.');
    }
  };

  return <div className="review-modal-backdrop" role="dialog" aria-modal="true" aria-label={'Community for ' + release.title}>
    <section ref={dialogRef} tabIndex={-1} className="review-modal release-community-modal">
      <header className="review-modal-head">
        <div><span className="mini-label">PUBLISHED WORK / COMMUNITY</span><h2>{release.title}</h2><p>{release.creator ?? 'Nightjar creator'}</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Close release community"><X size={18}/></button>
      </header>

      <div className="release-community-reactions">
        <div><span className="mini-label">LISTENER REACTIONS</span><strong>{community.reactions?.total ?? 0} reaction{community.reactions?.total === 1 ? '' : 's'}</strong></div>
        <button type="button" className={community.reactions?.myReaction==='like'?'active':''} disabled={!canCommunityInteract||reacting} onClick={()=>void react('like')}><ThumbsUp size={16} fill={community.reactions?.myReaction==='like'?'currentColor':'none'}/> Like <span>{community.reactions?.likes ?? 0}</span></button>
        <button type="button" className={community.reactions?.myReaction==='love'?'active':''} disabled={!canCommunityInteract||reacting} onClick={()=>void react('love')}><Heart size={16} fill={community.reactions?.myReaction==='love'?'currentColor':'none'}/> Love <span>{community.reactions?.loves ?? 0}</span></button>
      </div>

      <div className="release-community-tabs" role="tablist" aria-label="Release community sections">
        <button role="tab" aria-selected={tab==='comments'} className={tab==='comments'?'active':''} onClick={()=>setTab('comments')}><MessageSquare size={14}/> Comments <span>{community.comments?.length ?? 0}</span></button>
        <button role="tab" aria-selected={tab==='reviews'} className={tab==='reviews'?'active':''} onClick={()=>setTab('reviews')}><Star size={14}/> Reviews <span>{reviews.ratingCount ?? 0}</span></button>
      </div>

      {tab==='comments' && <>
        {canCommunityInteract && <article className="research-panel release-comment-compose">
          <span className="mini-label">JOIN THE CONVERSATION</span>
          <p>Comments publish directly. Keep discussion about the work itself and use Report if something crosses a line.</p>
          <textarea value={comment} onChange={(event)=>setComment(event.target.value)} maxLength={1200} placeholder="Comment on this published work…"/>
          <div><small>{comment.length}/1200</small><button className="primary-button" disabled={savingComment||!comment.trim()} onClick={()=>void submitComment()}>{savingComment?'Posting…':'Post comment'}</button></div>
        </article>}
        <div className="release-comment-list">
          {loading ? <div className="people-empty">Loading comments…</div> : !(community.comments??[]).length ? <div className="people-empty"><MessageSquare size={18}/><strong>No comments yet.</strong><span>Listener discussion will appear here without affecting creator compensation.</span></div> : (community.comments??[]).map((item:any)=><article className="release-comment-card" key={item.id}>
            <div className="release-comment-head"><div><strong>{item.commenterName ?? 'Nightjar listener'}</strong><span>{item.commenterHandle ? '@'+String(item.commenterHandle).replace(/^@/,'') : 'Listener'}{item.createdAt ? ' · '+new Date(item.createdAt).toLocaleString('en-GB') : ''}</span></div><div>{currentUserId && item.userId===currentUserId ? <button className="icon-button" onClick={()=>void deleteComment(item)} aria-label="Delete your comment"><Trash2 size={13}/></button> : <button className="icon-button" onClick={()=>void reportComment(item)} aria-label="Report comment"><Flag size={13}/></button>}</div></div>
            <p>{item.body}</p>
          </article>)}
        </div>
      </>}

      {tab==='reviews' && <>
        <div className="review-summary">
          <Star size={19} fill="currentColor"/>
          <strong>{reviews.averageRating == null ? 'No public rating yet' : reviews.averageRating + ' / 5'}</strong>
          <span>{reviews.ratingCount ?? 0} approved review{reviews.ratingCount === 1 ? '' : 's'}</span>
        </div>
        {canCommunityInteract && <article className="research-panel review-compose">
          <span className="mini-label">YOUR REVIEW</span>
          <p>Formal reviews are moderated before publication. Ratings apply to this release, not to a person's worth.</p>
          <div className="review-stars" aria-label="Rating out of five">
            {[1,2,3,4,5].map((value)=><button key={value} type="button" className={value<=rating?'active':''} onClick={()=>setRating(value)} aria-label={value+' stars'}><Star size={20} fill={value<=rating?'currentColor':'none'}/></button>)}
          </div>
          <textarea value={review} onChange={(event)=>setReview(event.target.value)} maxLength={1600} placeholder="Optional review of the story, performance, audio and production."/>
          <small>{review.length}/1600</small>
          {reviews.myReview && <p className="review-own-status">Current submission: <strong>{reviews.myReview.status}</strong>{reviews.myReview.status==='pending'?' · awaiting moderation':''}</p>}
          <button className="primary-button" disabled={savingReview} onClick={()=>void submitReview()}>{savingReview?'Submitting…':reviews.myReview?'Update review':'Submit review'}</button>
        </article>}
        <div className="review-list">
          {loading ? <div className="people-empty">Loading reviews…</div> : !(reviews.reviews??[]).length ? <div className="people-empty"><MessageSquare size={18}/><strong>No approved reviews yet.</strong><span>Formal Listener reviews will appear here after moderation.</span></div> : (reviews.reviews??[]).map((item:any)=><article className="review-card" key={item.id}><div><strong>{item.reviewerName ?? 'Nightjar listener'}</strong><span>{'★'.repeat(item.rating)}{'☆'.repeat(5-item.rating)}</span></div>{item.review&&<p>{item.review}</p>}</article>)}
        </div>
      </>}
    </section>
  </div>;
}
