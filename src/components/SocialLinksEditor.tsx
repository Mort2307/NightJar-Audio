import { useEffect, useState } from 'react';
import { Check, ExternalLink, ImagePlus, Link2, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { nightjarSocialLinks, type NightjarSocialLink } from '../platform/firebase-social-links';
import { nightjarMedia } from '../platform/firebase-media';
import { optimiseProfileImage } from '../platform/profile-image-optimizer';
import ContextHelp from './ContextHelp';
import './social-profile-links.css';

type EditorRow = NightjarSocialLink & { draft?:boolean; editing?:boolean };
type Props = { notify:(message:string)=>void; simulationMode?:boolean; readOnly?:boolean };

const PLATFORM_MARKS:Record<string,string> = {
  Instagram:'IG', TikTok:'TT', YouTube:'YT', X:'X', Bluesky:'BS',
  Threads:'TH', Facebook:'FB', Twitch:'TW', Reddit:'RD',
  Tumblr:'TM', SoundCloud:'SC', Spotify:'SP', Patreon:'PA',
  'Ko-fi':'KF', Linktree:'LT', Beacons:'BC', Carrd:'CR',
  OnlyFans:'OF', Fansly:'FN', Website:'↗',
};
const initialsFor=(platform:string)=>PLATFORM_MARKS[platform]??'↗';
const displayUrl=(url:string)=>{
  try {const parsed=new URL(url);return parsed.hostname.replace(/^www\./,'')+parsed.pathname.replace(/\/$/,'')+parsed.search;}
  catch{return url;}
};
const dataUrlFor=(file:File)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=()=>reject(new Error('Nightjar could not read that picture.'));
  reader.readAsDataURL(file);
});

export function SocialPicture({link}:{link:Pick<NightjarSocialLink,'photoUrl'|'platform'>}) {
  const [broken,setBroken]=useState(false);
  useEffect(()=>setBroken(false),[link.photoUrl]);
  return <span className="nj-social-thumb" aria-label={link.photoUrl&&!broken?link.platform+' profile photo':link.platform+' platform placeholder'}>
    {link.photoUrl&&!broken
      ? <img src={link.photoUrl} loading="lazy" decoding="async" alt={link.platform+' social profile picture'} referrerPolicy="no-referrer" onError={()=>setBroken(true)} />
      : <span className="nj-social-platform-mark" aria-hidden="true">{initialsFor(link.platform)}</span>}
  </span>;
}

export function SocialLinksDisplay({links}:{links?:NightjarSocialLink[]}) {
  if(!links?.length)return null;
  return <section className="nj-social-public" aria-label="Member social media links">
    <div className="nj-social-public-heading"><span className="mini-label">FIND ME ELSEWHERE</span><ContextHelp topic="social-avatar-protection"/></div>
    <div className="nj-social-list">
      {links.map((link)=><a key={link.id} className="nj-social-public-link" href={link.url}
        target="_blank" rel="noopener noreferrer nofollow ugc" title={'Open '+link.platform+' in a new tab'}>
        <SocialPicture link={link}/>
        <span className="nj-social-link-copy"><strong>{link.platform}</strong><small>{displayUrl(link.url)}</small></span>
        <ExternalLink size={15} aria-hidden="true"/>
      </a>)}
    </div>
  </section>;
}

export default function SocialLinksEditor({notify,simulationMode=false,readOnly=false}:Props) {
  const [rows,setRows]=useState<EditorRow[]>([]);
  const [cleanupIds,setCleanupIds]=useState<string[]>([]);
  const [loading,setLoading]=useState(true);
  const [busyId,setBusyId]=useState<string|null>(null);
  const disabled=simulationMode||readOnly;
  const refresh=async()=>{
    setLoading(true);
    try {
      if(simulationMode){setRows([]);setCleanupIds([]);return;}
      const data=await nightjarSocialLinks.listWithCleanup();
      setRows((data.links??[]).map((link)=>({...link,editing:false})));
      setCleanupIds(data.cleanupLinkIds??[]);
    }catch(error){notify(error instanceof Error?error.message:'Social links could not be loaded.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void refresh();},[simulationMode]);

  const edit=(id:string,patch:Partial<EditorRow>)=>setRows((prev)=>prev.map((row)=>row.id===id?{...row,...patch}:row));
  const add=()=>{
    if(rows.length>=12){notify('Nightjar allows up to 12 social profile links.');return;}
    setRows((prev)=>[...prev,{
      id:'new-'+crypto.randomUUID(), url:'', platform:'Website',photoUrl:null,photoStatus:null,
      editing:true,draft:true,
    }]);
  };
  const save=async(row:EditorRow)=>{
    if(disabled)return;
    if(!row.url.trim())return notify('Paste a full social profile link before saving.');
    setBusyId(row.id);
    try{
      const saved=await nightjarSocialLinks.save(row.url.trim(),row.draft?undefined:row.id);
      setRows((prev)=>prev.map((item)=>item.id===row.id?{...saved,editing:false}:item));
      notify('Social link saved to your Nightjar profile.');
    }catch(error){notify(error instanceof Error?error.message:'Social link was not saved.');}
    finally{setBusyId(null);}
  };
  const remove=async(row:EditorRow)=>{
    if(disabled)return;
    if(row.draft){setRows((prev)=>prev.filter((item)=>item.id!==row.id));return;}
    if(!window.confirm('Remove this social link and its profile picture from your Nightjar profile?'))return;
    setBusyId(row.id);
    try{
      const result=await nightjarSocialLinks.removeWithCleanup(row.id);
      if(!result.deleted)throw new Error('Nightjar could not confirm that the link was removed.');
      setRows((prev)=>prev.filter((item)=>item.id!==row.id));
      if(result.pendingCleanup)setCleanupIds(prev=>[...new Set([...prev,row.id])]);
      notify(result.pendingCleanup?'Social link hidden. Private photo deletion needs retrying below.':'Social link and its linked private photo removed.');
    }catch(error){notify(error instanceof Error?error.message:'Social link could not be removed.');}
    finally{setBusyId(null);}
  };
  const retryCleanup=async(id:string)=>{
    if(disabled)return;
    setBusyId(id);
    try{
      const result=await nightjarSocialLinks.retryCleanup(id);
      await refresh();
      notify(result.pendingCleanup?'Social image cleanup is still incomplete; retry or contact Nightjar support.':'Retired private social photo cleanup completed.');
    }catch(error){notify(error instanceof Error?error.message:'Social photo cleanup could not be confirmed.');}
    finally{setBusyId(null);}
  };
  const upload=async(row:EditorRow,file:File)=>{
    if(disabled || row.draft)return;
    setBusyId(row.id);
    try{
      const optimised=await optimiseProfileImage(file);
      const dataUrl=await dataUrlFor(optimised.file);
      const uploaded=await nightjarMedia.submitImage({
        kind:'social_avatar',targetId:row.id,dataUrl,contentType:optimised.file.type,fileName:optimised.file.name,
      });
      if(uploaded.status!=='pending')throw new Error('Nightjar did not confirm image review.');
      edit(row.id,{photoStatus:'pending'});
      notify('Your actual social profile photo has been uploaded and is awaiting Nightjar image approval.');
    }catch(error){notify(error instanceof Error?error.message:'Social profile picture could not be uploaded.');}
    finally{setBusyId(null);}
  };
  return <article className="panel premium-user-card nj-social-editor">
    <div className="premium-user-card-head">
      <div><span className="mini-label">SOCIAL PRESENCE</span><h2>Find me elsewhere.</h2></div><span className="nj-social-heading-icons"><Link2 size={18}/><ContextHelp topic="social-avatar-protection"/></span>
    </div>
    <p className="panel-note">Paste a social profile link, select Save, then tap + to add another. Each link is saved independently of your other profile edits.</p>
    <div className="nj-social-editor-list">
      {rows.map((row)=><div className="nj-social-editor-row" key={row.id}>
        <SocialPicture link={row}/>
        <div className="nj-social-edit-content">
          {row.editing
            ? <div className="nj-social-input-line">
                <input aria-label="Copy and paste your social media link here" type="url" value={row.url}
                  maxLength={500} placeholder="https://your-social-platform.com/your-profile"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={busyId===row.id||disabled}
                  onChange={(event)=>edit(row.id,{url:event.target.value})}/>
                <button className="primary-button" type="button" onClick={()=>void save(row)} disabled={busyId===row.id||disabled||!row.url.trim()}><Check size={14}/>{busyId===row.id?'Saving…':'Save'}</button>
                <button className="ghost-button" type="button" aria-label="Cancel editing this link" disabled={busyId===row.id} onClick={()=>row.draft?void remove(row):edit(row.id,{editing:false})}><X size={16}/></button>
              </div>
            : <div className="nj-social-saved-row">
                <a href={row.url} target="_blank" rel="noopener noreferrer nofollow ugc">
                  <strong>{row.platform}</strong><span>{displayUrl(row.url)}</span><ExternalLink size={14}/>
                </a>
                <button type="button" className="ghost-button" disabled={disabled||busyId===row.id} onClick={()=>edit(row.id,{editing:true})}>Edit</button>
                <button type="button" className="ghost-button" disabled={disabled||busyId===row.id} aria-label={'Remove '+row.platform+' link'} onClick={()=>void remove(row)}><Trash2 size={15}/></button>
              </div>}
          {!row.draft&&<div className="nj-social-photo-tools">
            <label className="nj-social-photo-upload"><ImagePlus size={13}/>{row.photoUrl?'Replace social profile photo':'Add actual social profile photo'}
              <input type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
                disabled={disabled||busyId===row.id} onChange={(event)=>{const file=event.target.files?.[0];event.currentTarget.value='';if(file)void upload(row,file);}}/>
            </label>
            {row.photoStatus==='pending'&&<small>Photo awaiting Nightjar image review · previous approved photo remains visible</small>}
            {row.photoStatus==='rejected'&&<small>The submitted photo was not approved. Upload a different photo.</small>}
            {row.photoCleanupPending&&<button type="button" className="ghost-button" disabled={disabled||busyId!==null} onClick={()=>void retryCleanup(row.id)}><RefreshCw size={13}/> Retry previous photo cleanup</button>}
          </div>}
        </div>
      </div>)}
      {cleanupIds.length>0&&<div className="nj-social-editor-note" role="status"><strong>Removed-link photo cleanup pending</strong>{cleanupIds.map(id=><button key={id} type="button" className="ghost-button" disabled={disabled||busyId!==null} onClick={()=>void retryCleanup(id)}><RefreshCw size={13}/> Retry private photo cleanup</button>)}</div>}
      {loading&&<p className="nj-social-editor-note">Loading your links…</p>}
      {!loading&&!rows.length&&<p className="nj-social-editor-note">No social profiles added yet.</p>}
    </div>
    <div className="nj-social-editor-actions">
      <button type="button" className="secondary-button" disabled={disabled||loading||rows.length>=12} onClick={add}><Plus size={17}/> Add another social link</button>
      <button type="button" className="ghost-button" disabled={loading||busyId!==null} onClick={()=>void refresh()}><RefreshCw size={14}/> Refresh photos</button>
    </div>
  </article>;
}
