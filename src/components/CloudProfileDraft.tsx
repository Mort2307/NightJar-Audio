import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { nightjarProfileDrafts, type ProfileDraftScope } from '../platform/firebase-profile-drafts';
import './cloud-profile-draft.css';

export type ProfileDraftController = {flush:()=>Promise<boolean>;clear:()=>Promise<void>};
type Props={
  role:'listener'|'creator'|'writer'|'editor'|'artist'|'admin';
  profile:Record<string,any>;
  dirty:boolean;
  setProfile:(update:(current:any)=>any)=>void;
  register:(controller:ProfileDraftController|null)=>void;
  notify:(message:string)=>void;
};

// Keep private, device-independent form drafts separate from a published
// profile. Only member-editable fields are included; photos and permissions
// are saved by their own Nightjar backend workflows.
const fields=[
  'displayName','handle','pronouns','headline','bio','welcomeMessage',
  'favouriteTags','favouriteTropes','favouriteCategories','publicProfile','avatarInitials','avatarTone',
  'roleFocus','roleSpecialties','roleSecondary','roleAvailability','roleHeadline',
  'roleBio','roleDetailOne','roleDetailTwo','portfolioNote','featuredPortfolioIds',
  'creatorLanguages','creatorDirectionModes','creatorDeliveryFormats','creatorTurnaround','creatorEquipment',
  'writerScriptLengths','writerCollaborationPreferences','writerTurnaround','writerRightsNote',
  'editorSoftware','editorProjectTypes','editorDeliveryFormats','editorCollaborationPreferences',
  'editorTurnaround','editorExperienceYears','editorSkillLevels',
  'artistMediums','artistDeliveryFormats','artistTurnaround','artistSoftware','listenerCommunityStyle',
];
const selected=(profile:Record<string,any>):Record<string,unknown>=>Object.fromEntries(
  fields.filter((field)=>typeof profile?.[field]!=='undefined').map((field)=>[field,profile[field]])
);

export default function CloudProfileDraft({role,profile,dirty,setProfile,register,notify}:Props){
  const scope=('profile-'+role) as ProfileDraftScope;
  const [ready,setReady]=useState(false);
  const [status,setStatus]=useState<'loading'|'saved'|'saving'|'unsaved'|'conflict'|'offline'>('loading');
  const [remote,setRemote]=useState<Record<string,unknown>|null>(null);
  const revisionRef=useRef(0);
  const signatureRef=useRef('');
  const inFlightRef=useRef<Promise<boolean>|null>(null);
  const conflictRef=useRef(false);
  const profileRef=useRef(profile);
  const dirtyRef=useRef(dirty);
  profileRef.current=profile;
  dirtyRef.current=dirty;
  const startedRef=useRef(false);
  const stoppedRef=useRef(false);
  const signature=JSON.stringify(selected(profile));

  const flush=async():Promise<boolean>=>{
    if(!ready||conflictRef.current||stoppedRef.current)return false;
    const previous=inFlightRef.current;
    if(previous){
      const complete=await previous;
      if(!complete)return false;
      if(inFlightRef.current===previous)inFlightRef.current=null;
    }
    if(!dirtyRef.current)return true;
    const payload=selected(profileRef.current);
    const current=JSON.stringify(payload);
    if(current===signatureRef.current){setStatus('saved');return true;}
    setStatus('saving');
    const save=(async()=>{
      try{
        const result=await nightjarProfileDrafts.save(scope,payload,revisionRef.current);
        if(stoppedRef.current)return false;
        if(!result.saved){
          setRemote(result.payload);
          revisionRef.current=result.revision;
          conflictRef.current=true;
          setStatus('conflict');
          return false;
        }
        revisionRef.current=result.revision;
        signatureRef.current=current;
        setStatus('saved');
        return true;
      }catch(error){
        if(!stoppedRef.current){
          setStatus('offline');
          notify('Your profile changes could not sync across devices. Please check the connection before leaving.');
        }
        return false;
      }
    })();
    inFlightRef.current=save;
    try{return await save;}finally{if(inFlightRef.current===save)inFlightRef.current=null;}
  };

  const clear=async()=>{
    // Called only after an explicit successful profile Save in Nightjar. An
    // in-flight save must settle before we remove the private working copy.
    if(inFlightRef.current)await inFlightRef.current;
    const result=await nightjarProfileDrafts.clear(scope,revisionRef.current);
    if(!result.cleared){
      // Another device edited in the meantime. Keep its newer draft intact.
      notify('Your profile saved, but a newer working draft exists on another device.');
    }else{
      revisionRef.current=0;
      signatureRef.current=JSON.stringify(selected(profileRef.current));
      setStatus('saved');
    }
  };

  useEffect(()=>{
    startedRef.current=false;
    stoppedRef.current=false;
    let cancelled=false;
    void nightjarProfileDrafts.get(scope).then((draft)=>{
      if(cancelled)return;
      revisionRef.current=draft.revision;
      if(draft.payload){
        if(dirtyRef.current){
          setRemote(draft.payload);conflictRef.current=true;setStatus('conflict');
        }else{
          setProfile((current:any)=>({...current,...draft.payload}));
          signatureRef.current=JSON.stringify(draft.payload);
          setStatus('saved');
        }
      }else{
        signatureRef.current=JSON.stringify(selected(profileRef.current));
        setStatus('saved');
      }
      startedRef.current=true;setReady(true);
    }).catch(()=>{
      if(cancelled)return;
      setReady(false);setStatus('offline');
    });
    return()=>{cancelled=true;stoppedRef.current=true;};
  },[scope]);

  useEffect(()=>{
    if(!ready||!startedRef.current||conflictRef.current||!dirty)return;
    if(signature===signatureRef.current)return;
    setStatus('unsaved');
    const timer=window.setTimeout(()=>{void flush();},900);
    return()=>window.clearTimeout(timer);
  },[signature,dirty,ready,scope]);

  useEffect(()=>{
    if(!ready)return;
    const controller:ProfileDraftController={flush,clear};
    register(controller);
    return()=>register(null);
  },[ready,scope,signature]);

  const loadRemote=()=>{
    if(!remote)return;
    setProfile((current:any)=>({...current,...remote}));
    signatureRef.current=JSON.stringify(remote);
    conflictRef.current=false;
    setRemote(null);
    setStatus('saved');
  };
  const keepMyEdits=()=>{
    conflictRef.current=false;
    setRemote(null);
    setStatus('unsaved');
    // Version was set to the remote revision. Next change/sync is an explicit
    // intentional replacement of the other device's working draft.
    void flush();
  };
  const retry=async()=>{
    setStatus('loading');
    try{
      const draft=await nightjarProfileDrafts.get(scope);
      revisionRef.current=draft.revision;
      if(draft.payload){
        setRemote(draft.payload);conflictRef.current=true;setStatus('conflict');
      }else{
        signatureRef.current=JSON.stringify(selected(profileRef.current));
        conflictRef.current=false;setStatus('saved');
      }
      startedRef.current=true;setReady(true);
    }catch{setStatus('offline');}
  };

  return <div className={'nj-cloud-profile-draft '+(status==='conflict'?'is-conflict':'')} aria-live="polite" role="status">
    {status==='offline'?<CloudOff size={17}/>:status==='conflict'?<AlertTriangle size={17}/>:<Cloud size={17}/>}
    <span>{status==='saved'?'Account draft synced · available on phone and PC'
      :status==='saving'?'Saving this role profile to your account…'
      :status==='unsaved'?'Changes pending cloud save…'
      :status==='conflict'?'This role profile was edited on another device. Choose which version to keep.'
      :status==='offline'?'Unable to contact Nightjar. Changes are not synced yet.'
      :'Checking for your saved account draft…'}</span>
    {status==='conflict'&&<div className="nj-cloud-draft-choices">
      <button type="button" className="secondary-button" onClick={loadRemote}>Use latest saved version</button>
      <button type="button" className="ghost-button" onClick={keepMyEdits}>Keep these edits</button>
    </div>}
    {status==='offline'&&<button type="button" className="ghost-button" onClick={()=>void retry()}><RefreshCw size={14}/> Retry</button>}
  </div>;
}
