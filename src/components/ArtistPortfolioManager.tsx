import { useEffect, useState } from 'react';
import { ImagePlus, LoaderCircle, Trash2, ChevronDown } from 'lucide-react';
import { nightjarArtists, type ArtistPortfolioItem } from '../platform/firebase-artists';
import { nightjarMedia } from '../platform/firebase-media';
import StudioFormDraftSync from './StudioFormDraftSync';

type Props = {
  notify: (message: string) => void;
  demoMode?: boolean;
};

const readFileDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function ArtistPortfolioManager({ notify, demoMode = false }: Props) {
  const [items, setItems] = useState<ArtistPortfolioItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [commissionType, setCommissionType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [humanCreated, setHumanCreated] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [permissionsConfirmed, setPermissionsConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retryItemId, setRetryItemId] = useState<string | null>(null);
  const [draftClearSignal, setDraftClearSignal] = useState(0);

  const load = async () => {
    if (demoMode) {
      setItems([{
        id:'demo-artist-piece-1', ownerUserId:'demo-artist-lena', title:'Midnight Window', description:'Fictional cover-art example for Artist Simulation.', tags:['Atmospheric','Cover art'], commissionType:'Cover artwork', status:'published', imageUrl:null, imageStatus:'approved', pendingImageAssetId:null, pendingImageStatus:null, createdAt:null, publishedAt:null, updatedAt:null,
      }]);
      return;
    }
    try {
      const data = await nightjarArtists.mine();
      setItems(data.items ?? []);
    } catch {
      notify('Artist portfolio could not be loaded.');
    }
  };

  useEffect(() => { void load(); }, [demoMode]);

  const submit = async () => {
    if (!title.trim()) return notify('Give the artwork a title first.');
    if (!file) return notify('Choose the artwork image you want to submit.');
    if (!humanCreated) return notify('Confirm that this is your own human-created artwork before submitting.');
    if (!rightsConfirmed || !permissionsConfirmed) return notify('Confirm your publication rights and any required client, subject or collaborator permissions.');
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) return notify('Use PNG, JPG or WebP artwork.');
    if (file.size > 5 * 1024 * 1024) return notify('Portfolio artwork must be 5 MB or smaller.');
    if (demoMode) {
      setItems(current => [{
        id:'demo-artist-piece-'+Date.now(),ownerUserId:'demo-artist-lena',title:title.trim(),description:description.trim(),
        tags:tags.split(',').map(tag=>tag.trim()).filter(Boolean).slice(0,12),
        commissionType:commissionType.trim()||null,status:'draft',imageUrl:null,imageStatus:null,
        pendingImageAssetId:'demo-pending-'+Date.now(),pendingImageStatus:'pending',
        createdAt:new Date().toISOString(),publishedAt:null,updatedAt:new Date().toISOString(),
      },...current]);
      setDraftClearSignal(value => value + 1);
      setTitle('');setDescription('');setTags('');setCommissionType('');setFile(null);
      setHumanCreated(false);setRightsConfirmed(false);setPermissionsConfirmed(false);
      setFormOpen(false);
      notify('Simulation: artwork entered the fictional image-moderation queue.');
      return;
    }

    setBusy(true);
    try {
      // Retry with the existing account-owned private item. A lost response to
      // submitImage can still mean the image is already awaiting moderation.
      let itemId = retryItemId;
      if (itemId) {
        const mine = (await nightjarArtists.mine()).items ?? [];
        const existing = mine.find(item => item.id === itemId);
        if (!existing || existing.status !== 'draft') throw new Error('Artwork draft is no longer available.');
        if (existing.pendingImageAssetId || existing.imageUrl) {
          setRetryItemId(null);
          setDraftClearSignal(value => value + 1);
          await load();
          notify('Artwork is already with moderation. No duplicate was submitted.');
          return;
        }
      } else {
        const created = await nightjarArtists.createItem({
          title:title.trim(),
          description:description.trim(),
          tags:tags.split(',').map(tag=>tag.trim()).filter(Boolean).slice(0,12),
          commissionType:commissionType.trim(),
          humanCreatedAttestation:true,
          rightsConfirmed:true,
          contributorPermissionsConfirmed:true,
        });
        itemId = created.item.id;
        setRetryItemId(itemId);
      }
      const dataUrl = await readFileDataUrl(file);
      await nightjarMedia.submitImage({
        kind:'artist_portfolio',
        targetId:itemId!,
        dataUrl,
        contentType:file.type,
        fileName:file.name,
      });
      setRetryItemId(null);
      setDraftClearSignal(value => value + 1);
      setTitle('');setDescription('');setTags('');setCommissionType('');setFile(null);
      setHumanCreated(false);setRightsConfirmed(false);setPermissionsConfirmed(false);
      await load();
      setFormOpen(false);
      notify('Artwork submitted. It stays private until an administrator approves the image.');
    } catch {
      await load();
      notify('Upload could not be confirmed. If the private draft appears below, choose Resume image upload rather than creating another piece.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (itemId:string) => {
    if (demoMode) {
      setItems((current)=>current.filter((item)=>item.id!==itemId));
      notify('Simulation: portfolio item removed locally.');
      return;
    }
    setBusy(true);
    try {
      await nightjarArtists.remove(itemId);
      setItems((current)=>current.filter((item)=>item.id!==itemId));
      notify('Portfolio item removed.');
    } catch {
      notify('Portfolio item could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  return <article className="panel artist-portfolio-manager">
    <div className="professional-role-head">
      <div><span className="mini-label">ARTIST / PUBLIC PORTFOLIO</span><h2>Visual artwork</h2><p>Show Nightjar creators real examples of your work. Portfolio pieces must be human-created; every image remains private until administrator image moderation approves it.</p></div>
      <ImagePlus size={20}/>
    </div>

    <StudioFormDraftSync scope="form-artist-portfolio" demoMode={demoMode} clearSignal={draftClearSignal}
      value={{title,description,tags,commissionType}}
      onRestore={draft => {
        setTitle(draft.title ?? '');setDescription(draft.description ?? '');
        setTags(draft.tags ?? '');setCommissionType(draft.commissionType ?? '');
        setHumanCreated(false);setRightsConfirmed(false);setPermissionsConfirmed(false);
      }} />
    <button type="button" className="secondary-button nj-artist-artwork-toggle" aria-expanded={formOpen} onClick={()=>setFormOpen(current=>!current)}><ImagePlus size={16}/>{formOpen?'Close upload form':'Add new artwork'}<ChevronDown size={15}/></button>
    {retryItemId && <div className="admin-note">
      <strong>Recovering an existing private artwork draft</strong>
      <span>Re-select the image and reconfirm permissions. This reuses the original record.</span>
      <button type="button" className="ghost-button" disabled={busy} onClick={() => {
        setRetryItemId(null);setTitle('');setDescription('');setTags('');setCommissionType('');
        setFile(null);setHumanCreated(false);setRightsConfirmed(false);setPermissionsConfirmed(false);
        setDraftClearSignal(value => value + 1);
      }}>Start a separate artwork</button>
    </div>}
    {formOpen && <div className="artist-portfolio-form">
      <label>Artwork title<input maxLength={120} value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g. Neon After Midnight"/></label>
      <label>Commission type<input maxLength={80} value={commissionType} onChange={(e)=>setCommissionType(e.target.value)} placeholder="Cover artwork, character portrait…"/></label>
      <label className="artist-form-wide">Description<textarea maxLength={600} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="A short public note about the piece, style or brief."/></label>
      <label>Tags<input value={tags} onChange={(e)=>setTags(e.target.value)} placeholder="Atmospheric, fantasy, painterly"/></label>
      <label>Artwork image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e)=>setFile(e.target.files?.[0] ?? null)}/></label>
      <label className="nightjar-anonymous-toggle artist-form-wide"><input type="checkbox" checked={humanCreated} onChange={(e)=>setHumanCreated(e.target.checked)}/><span>I confirm this is my own human-created artwork and is not AI-generated.</span></label>
      <label className="rights-check artist-form-wide"><input type="checkbox" checked={rightsConfirmed} onChange={(e)=>setRightsConfirmed(e.target.checked)}/><span>I own or control the rights needed to display this artwork publicly on Nightjar.</span></label>
      <label className="rights-check artist-form-wide"><input type="checkbox" checked={permissionsConfirmed} onChange={(e)=>setPermissionsConfirmed(e.target.checked)}/><span>I have any required client, subject, model or collaborator permission for this public portfolio use.</span></label>
      <button className="primary-button artist-form-wide" disabled={busy || !humanCreated || !rightsConfirmed || !permissionsConfirmed} onClick={()=>void submit()}>{busy?<><LoaderCircle size={15}/> Submitting…</>:<><ImagePlus size={15}/> Submit for moderation</>}</button>
    </div>}

    <div className="nj-artist-portfolio-summary"><strong>{items.length} artwork piece{items.length===1?'':'s'}</strong><span>{items.filter(item=>item.status==='published').length} public · {items.filter(item=>item.status!=='published').length} private or awaiting review</span></div>
    <div className="artist-portfolio-grid">
      {items.map((item)=><article key={item.id} className="artist-portfolio-card">
        <div className="artist-portfolio-image">{item.imageUrl?<img src={item.imageUrl} alt={item.title} loading="lazy" decoding="async"/>:<div><ImagePlus size={22}/><span>{item.pendingImageStatus==='pending'?'Awaiting image approval':item.pendingImageStatus==='rejected'?'Image rejected':'No public image yet'}</span></div>}</div>
        <div><strong>{item.title}</strong>{item.commissionType&&<small>{item.commissionType}</small>}<p>{item.description}</p>{!!item.tags?.length&&<div className="creator-profile-tags">{item.tags.map((tag)=><span key={tag}>{tag}</span>)}</div>}<em>{item.status==='published'?'Public':'Private / moderation pending'}</em></div>
        {item.status==='draft' && !item.pendingImageAssetId && !item.imageUrl && <button type="button" className="secondary-button" disabled={busy} onClick={() => {
          setRetryItemId(item.id);setTitle(item.title);setDescription(item.description);
          setTags((item.tags ?? []).join(', '));setCommissionType(item.commissionType ?? '');
          setFile(null);setHumanCreated(false);setRightsConfirmed(false);setPermissionsConfirmed(false);
          setFormOpen(true);
        }}>Resume image upload</button>}
        <button className="ghost-button" disabled={busy} onClick={()=>void remove(item.id)}><Trash2 size={14}/> Remove</button>
      </article>)}
      {!items.length&&<div className="people-empty"><ImagePlus size={18}/><strong>No portfolio pieces yet</strong><span>Add a few strong examples so VA Creators, Writers and Audio Editors can understand your visual style.</span></div>}
    </div>
  </article>;
}
