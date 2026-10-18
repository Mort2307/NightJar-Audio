import { useEffect, useState } from 'react';
import { FileAudio, LoaderCircle, Send, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { nightjarEditorPortfolio, type EditorPortfolioItem } from '../platform/firebase-editor-portfolio';
import { nightjarAudioFileProblem } from '../platform/audio-upload';
import StudioFormDraftSync from './StudioFormDraftSync';

type Props = { notify: (message: string) => void; demoMode?: boolean };



export default function EditorShowcaseManager({ notify, demoMode = false }: Props) {
  const [items, setItems] = useState<EditorPortfolioItem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [services, setServices] = useState('');
  const [techniques, setTechniques] = useState('');
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [permissionsConfirmed, setPermissionsConfirmed] = useState(false);
  const [permissionNote, setPermissionNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryItemId, setRetryItemId] = useState<string | null>(null);
  const [fileInputNonce, setFileInputNonce] = useState(0);
  const [draftClearSignal, setDraftClearSignal] = useState(0);

  const load = async () => {
    if (demoMode) {
      setItems([{
        id:'demo-editor-showcase',ownerUserId:'demo-editor-sam',title:'Dialogue rescue',description:'Before/after dialogue restoration example.',
        services:['Dialogue editing','Restoration'],techniques:['Noise cleanup','Click repair','EQ'],status:'published',
        beforeAudioAvailable:true,afterAudioAvailable:true,rightsConfirmed:true,contributorPermissionsConfirmed:true,clientPermissionNote:'Demo permission',createdAt:null,submittedAt:null,moderatedAt:null,publishedAt:null,updatedAt:null,
      }]);
      return;
    }
    try { setItems((await nightjarEditorPortfolio.mine()).items ?? []); }
    catch { notify('Editor showcase could not be loaded.'); }
  };

  useEffect(() => { void load(); }, [demoMode]);

  const create = async () => {
    if (!title.trim()) return notify('Give the showcase item a title.');
    const audioProblem = (afterFile ? nightjarAudioFileProblem(afterFile, 20) : null)
      || (beforeFile ? nightjarAudioFileProblem(beforeFile, 20) : null);
    if (audioProblem) return notify(audioProblem);
    if (!rightsConfirmed || !permissionsConfirmed) return notify('Confirm your rights and contributor/client permission first.');
    setBusy(true);
    try {
      if (demoMode) {
        notify('Simulation: Editor showcase created locally and sent to moderation.');
        return;
      }
      let itemId = retryItemId;
      let existing: EditorPortfolioItem | undefined;
      if (itemId) {
        existing = ((await nightjarEditorPortfolio.mine()).items ?? []).find(item => item.id === itemId);
        if (!existing) throw new Error('The private showcase draft is no longer available.');
        if (existing.status === 'pending_review' || existing.status === 'published') {
          setRetryItemId(null);
          setDraftClearSignal(value => value + 1);
          setTitle('');setDescription('');setServices('');setTechniques('');setPermissionNote('');
          setBeforeFile(null);setAfterFile(null);setFileInputNonce(value => value + 1);
          setRightsConfirmed(false);setPermissionsConfirmed(false);
          await load();
          notify('Showcase was already submitted. No duplicate has been created.');
          return;
        }
        if (!['draft','changes','rejected'].includes(existing.status)) throw new Error('This showcase can no longer be edited.');
      }
      if (!existing?.afterAudioAvailable && !afterFile) {
        notify('Select the finished / after audio sample to continue this private draft.');
        return;
      }
      if (!itemId) {
        const created = await nightjarEditorPortfolio.create({
          title:title.trim(),
          description:description.trim(),
          services:services.split(',').map(x=>x.trim()).filter(Boolean).slice(0,16),
          techniques:techniques.split(',').map(x=>x.trim()).filter(Boolean).slice(0,20),
          rightsConfirmed:true,
          contributorPermissionsConfirmed:true,
          clientPermissionNote:permissionNote.trim(),
        });
        itemId = created.item.id;
        setRetryItemId(itemId);
      }
      // The server remains authoritative about which private slot is attached.
      // Never reupload an already-confirmed slot after a lost response.
      if (beforeFile && !existing?.beforeAudioAvailable) {
        await nightjarEditorPortfolio.upload(itemId,'before',beforeFile);
      }
      if (afterFile && !existing?.afterAudioAvailable) {
        await nightjarEditorPortfolio.upload(itemId,'after',afterFile);
      }
      await nightjarEditorPortfolio.submit(itemId);
      setRetryItemId(null);
      setDraftClearSignal(value => value + 1);
      setTitle('');setDescription('');setServices('');setTechniques('');
      setBeforeFile(null);setAfterFile(null);setFileInputNonce(value => value + 1);
      setRightsConfirmed(false);setPermissionsConfirmed(false);setPermissionNote('');
      await load();
      notify('Editor showcase submitted for moderation.');
    } catch (error) {
      await load();
      const detail = error instanceof Error ? error.message : '';
      notify((detail ? detail + ' ' : '') + 'If a private draft is listed below, choose Resume upload rather than creating another item.');
    } finally { setBusy(false); }
  };

  const submitExisting = async (itemId: string) => {
    if (demoMode || busy) return;
    setBusy(true);
    try {
      const current = ((await nightjarEditorPortfolio.mine()).items ?? []).find(item => item.id === itemId);
      if (!current) throw new Error('Showcase draft no longer exists.');
      if (current.status === 'pending_review' || current.status === 'published') {
        notify('Showcase is already submitted; no duplicate created.');
      } else if (current.status === 'draft' && current.afterAudioAvailable) {
        await nightjarEditorPortfolio.submit(itemId);
        notify('Showcase submitted for moderation.');
      } else {
        throw new Error('The showcase requires a finished audio sample before submission.');
      }
      await load();
    } catch {
      await load();
      notify('Submission could not be confirmed. Check the private showcase status before trying again.');
    } finally { setBusy(false); }
  };

  const remove = async (itemId: string) => {
    if (demoMode) return setItems((value)=>value.filter((item)=>item.id!==itemId));
    setBusy(true);
    try { await nightjarEditorPortfolio.remove(itemId); await load(); notify('Editor showcase item removed.'); }
    catch { notify('Editor showcase item could not be removed.'); }
    finally { setBusy(false); }
  };

  return <section className="panel editor-showcase-manager">
    <div className="professional-role-head">
      <div><span className="mini-label">AUDIO EDITOR · SHOWCASE</span><h2>Let people hear the work.</h2><p>Upload a finished sample, with an optional before clip for comparison. Every sample stays private until Nightjar moderation approves it.</p></div>
      <FileAudio size={20}/>
    </div>

    {retryItemId && <div className="admin-note">
      <strong>Recovering your existing Editor showcase draft</strong>
      <span>Choose only missing audio, reconfirm your permissions and submit the same private record.</span>
      <button type="button" className="ghost-button" disabled={busy} onClick={() => {
        setRetryItemId(null);setTitle('');setDescription('');setServices('');setTechniques('');setPermissionNote('');
        setBeforeFile(null);setAfterFile(null);setFileInputNonce(value => value + 1);
        setRightsConfirmed(false);setPermissionsConfirmed(false);
        setDraftClearSignal(value => value + 1);
      }}>Start a different showcase</button>
    </div>}
    <div className="editor-showcase-form">
      <div className="editor-showcase-wide">
        <StudioFormDraftSync scope="form-editor-showcase" demoMode={demoMode} clearSignal={draftClearSignal}
          value={{title,description,services,techniques,permissionNote}}
          onRestore={draft => {
            setTitle(draft.title ?? '');setDescription(draft.description ?? '');
            setServices(draft.services ?? '');setTechniques(draft.techniques ?? '');
            setPermissionNote(draft.permissionNote ?? '');
            // Consent is always renewed for each submission.
            setRightsConfirmed(false);setPermissionsConfirmed(false);
          }} />
      </div>
      <label>Showcase title<input maxLength={140} value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g. Dialogue restoration · before & after"/></label>
      <label>Services<input value={services} onChange={(e)=>setServices(e.target.value)} placeholder="Dialogue editing, restoration, mixing"/></label>
      <label className="editor-showcase-wide">Description<textarea maxLength={1200} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="Explain the problem, your approach and what changed."/></label>
      <label>Techniques<input value={techniques} onChange={(e)=>setTechniques(e.target.value)} placeholder="RX cleanup, EQ, de-click, dynamics"/></label>
      <label>Permission note<input maxLength={500} value={permissionNote} onChange={(e)=>setPermissionNote(e.target.value)} placeholder="Optional internal note: client approved portfolio use on…"/></label>
      <label>Before audio <span className="optional-label">optional</span><input key={"before-"+fileInputNonce} type="file" onChange={(e)=>setBeforeFile(e.target.files?.[0] ?? null)}/></label>
      <label>Finished / after audio<input key={"after-"+fileInputNonce} type="file" onChange={(e)=>setAfterFile(e.target.files?.[0] ?? null)}/></label>
      <label className="rights-check editor-showcase-wide"><input type="checkbox" checked={rightsConfirmed} onChange={(e)=>setRightsConfirmed(e.target.checked)}/><span>I own or control the rights needed to upload and publicly showcase these samples.</span></label>
      <label className="rights-check editor-showcase-wide"><input type="checkbox" checked={permissionsConfirmed} onChange={(e)=>setPermissionsConfirmed(e.target.checked)}/><span>I have permission from any client, performer or other contributor whose work/voice appears in the sample.</span></label>
      <div className="rights-ai-lock editor-showcase-wide"><ShieldCheck size={15}/><div><strong>Private until approved</strong><span>Direct storage reads are blocked. Nightjar only exposes approved samples through short-lived signed playback links.</span></div></div>
      <button className="primary-button editor-showcase-wide" disabled={busy || !rightsConfirmed || !permissionsConfirmed} onClick={()=>void create()}>{busy?<><LoaderCircle size={14}/> Working…</>:<><UploadCloud size={14}/> Upload & submit showcase</>}</button>
    </div>

    <div className="editor-showcase-list">
      {items.map((item)=><article key={item.id}>
        <div><span className="mini-label">{item.status.replaceAll('_',' ').toUpperCase()}</span><strong>{item.title}</strong><p>{item.description}</p><div className="creator-profile-tags">{[...(item.services??[]),...(item.techniques??[])].slice(0,8).map((x)=><span key={x}>{x}</span>)}</div><small>{item.beforeAudioAvailable?'Before + after':'Finished sample'} · {item.status==='published'?'Public on your profile':'Not public yet'}</small></div>
        <div>{item.status==='draft'&&<button type="button" className="secondary-button" disabled={busy} onClick={() => {
          setRetryItemId(item.id);setTitle(item.title);setDescription(item.description);
          setServices((item.services??[]).join(', '));setTechniques((item.techniques??[]).join(', '));
          setPermissionNote(item.clientPermissionNote??'');
          setBeforeFile(null);setAfterFile(null);setFileInputNonce(value=>value+1);
          setRightsConfirmed(false);setPermissionsConfirmed(false);
        }}>Resume upload</button>}{item.status==='draft'&&item.afterAudioAvailable&&<button className="secondary-button" disabled={busy} onClick={()=>void submitExisting(item.id)}><Send size={13}/> Submit</button>}{item.status!=='pending_review'&&<button className="ghost-button" disabled={busy} onClick={()=>void remove(item.id)}><Trash2 size={13}/> Remove</button>}</div>
      </article>)}
      {!items.length&&<div className="people-empty"><FileAudio size={17}/><strong>No showcase samples yet.</strong><span>Add finished work or a before/after comparison alongside your verified Nightjar credits.</span></div>}
    </div>
  </section>;
}
