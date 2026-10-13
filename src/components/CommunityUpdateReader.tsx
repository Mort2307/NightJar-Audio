import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { communityUpdates, type CommunityUpdate } from '../platform/firebase-community-updates';
import './community-updates.css';

export default function CommunityUpdateReader({id,onClose}:{id:string;onClose:()=>void}){
 const [update,setUpdate]=useState<CommunityUpdate|null>(null);
 const [error,setError]=useState('');
 useEffect(()=>{
  let cancelled=false;setUpdate(null);setError('');
  void communityUpdates.get(id).then(data=>{if(!cancelled)setUpdate(data);})
   .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'Unable to open this update.');});
  return ()=>{cancelled=true;};
 },[id]);
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 },[onClose]);
 return <div className="nj-community-reader-scrim" onMouseDown={event=>{if(event.currentTarget===event.target)onClose();}}>
  <article className="nj-community-reader" role="dialog" aria-modal="true" aria-labelledby="community-update-title">
   <button className="nj-community-reader-close" type="button" onClick={onClose} aria-label="Close announcement"><X size={20}/></button>
   <div className="nj-community-reader-label"><BellRing size={19}/> NEWS FROM NIGHTJAR</div>
   {error?<p role="alert">{error}</p>:!update?<p role="status">Opening NightJar update…</p>:<>
    {update.test&&<p><strong>PRIVATE TEST — only you can view this copy.</strong></p>}
    <h2 id="community-update-title">{update.title}</h2>
    {update.createdAt&&<time dateTime={update.createdAt}>{new Date(update.createdAt).toLocaleDateString('en-GB',{year:'numeric',month:'long',day:'numeric'})}</time>}
    <div className="nj-community-reader-body">{update.body}</div>
    <button className="secondary-button" type="button" onClick={onClose}>Back to NightJar</button>
   </>}
  </article>
 </div>;
}
