import { useState } from 'react';
import { Copy, ExternalLink, Send, Sparkles, Users } from 'lucide-react';
import { nightjarReferrals } from '../platform/firebase-referrals';

type Props = {
  notify:(message:string)=>void;
  demoMode?:boolean;
  simulationMode?:boolean;
};

export default function CreatorSuggestionBox({notify,demoMode=false,simulationMode=false}:Props) {
  const [open,setOpen]=useState(false);
  const [creatorName,setCreatorName]=useState('');
  const [publicUrl,setPublicUrl]=useState('');
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [inviteUrl,setInviteUrl]=useState('');

  const submit=async()=>{
    if(!creatorName.trim()) return notify('Add the Creator name first.');
    setBusy(true);
    try{
      if(demoMode&&!simulationMode){
        setInviteUrl(window.location.origin + '/account?entry=register&role=creator&ref=DEMO-CREATOR');
        notify('Demo Creator suggestion created locally.');
        return;
      }
      if(simulationMode){
        setInviteUrl(window.location.origin + '/account?entry=register&role=creator&ref=SIM-CREATOR');
        notify('Simulation Creator suggestion created locally.');
        return;
      }
      const data=await nightjarReferrals.suggestCreator({
        creatorName:creatorName.trim(),
        ...(publicUrl.trim()?{publicUrl:publicUrl.trim()}:{}),
        ...(note.trim()?{note:note.trim()}:{}),
      });
      setInviteUrl(window.location.origin + data.suggestion.recommendationPath);
      notify('Creator suggestion sent to Nightjar.');
    }catch(error){
      const message=error instanceof Error?error.message:'';
      notify(message.includes('valid http')?'Use a valid public Creator link beginning with http or https.':'Creator suggestion could not be sent.');
    }finally{
      setBusy(false);
    }
  };

  const copy=async()=>{
    if(!inviteUrl)return;
    try{
      await navigator.clipboard.writeText(inviteUrl);
      notify('Creator invitation link copied.');
    }catch{
      notify('Nightjar could not copy that link in this browser.');
    }
  };

  const share=async()=>{
    if(!inviteUrl)return;
    try{
      if(navigator.share) await navigator.share({title:'Join Nightjar as a Creator',text:'You were recommended to Nightjar. This link opens the Creator account path.',url:inviteUrl});
      else await copy();
    }catch(error){
      if(!(error instanceof DOMException&&error.name==='AbortError')) notify('Creator invitation sharing could not be opened.');
    }
  };

  return <section className={open?'creator-suggestion-box open':'creator-suggestion-box'}>
    <button type="button" className="creator-suggestion-toggle" onClick={()=>setOpen((value)=>!value)} aria-expanded={open}>
      <span><Users size={17}/></span>
      <div><strong>Know someone Nightjar should invite?</strong><small>Any Nightjar member can suggest a Creator and generate a dedicated Creator recommendation link.</small></div>
      <Sparkles size={16}/>
    </button>
    {open&&<div className="creator-suggestion-form">
      <div className="creator-suggestion-grid">
        <label>Creator name<input maxLength={120} value={creatorName} onChange={(event)=>setCreatorName(event.target.value)} placeholder="Creator / stage name"/></label>
        <label>Public link <span className="optional-label">optional</span><input type="url" maxLength={500} value={publicUrl} onChange={(event)=>setPublicUrl(event.target.value)} placeholder="https://their-public-profile.example"/></label>
        <label className="creator-suggestion-wide">Why recommend them? <span className="optional-label">optional</span><textarea maxLength={1200} value={note} onChange={(event)=>setNote(event.target.value)} placeholder="What makes this Creator a good fit for Nightjar?"/><small className="field-counter">{note.length}/1200</small></label>
      </div>
      <div className="creator-suggestion-actions">
        <button className="primary-button" disabled={busy||!creatorName.trim()} onClick={()=>void submit()}><Send size={13}/>{busy?'Sending…':'Suggest Creator'}</button>
        <span>Suggestions are reviewed by Nightjar. The generated link does not auto-approve a professional account.</span>
      </div>
      {inviteUrl&&<div className="creator-invite-link"><div><strong>Creator recommendation link ready</strong><span>{inviteUrl}</span></div><button className="secondary-button" onClick={()=>void copy()}><Copy size={13}/> Copy</button><button className="secondary-button" onClick={()=>void share()}><ExternalLink size={13}/> Share</button></div>}
    </div>}
  </section>;
}
