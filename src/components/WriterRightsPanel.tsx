import { useEffect, useState } from 'react';
import { FileKey2, Save, ShieldCheck } from 'lucide-react';
import { nightjarScripts } from '../platform/firebase-scripts';
import { parseListingTags } from '../platform/listing-tags';

type Props = {
  script: any;
  onUpdated: (script: any) => void;
  notify: (message: string) => void;
  simulationMode?: boolean;
};

const defaultRights = {
  copyrightOwner: 'Writer',
  writerRetainsCopyright: true,
  licenceType: 'none',
  licenceLength: '',
  adaptationApprovalRequired: true,
  significantEditsApprovalRequired: true,
  castingApprovalRequired: false,
  finalAudioApprovalRequired: false,
  aiTrainingAllowed: false,
  commercialUse: false,
  ownershipAttested: false,
  contributorPermissionsConfirmed: false,
  withdrawalTerms: '',
};

const defaultMarketplace = {
  visibility: 'private',
  synopsis: '',
  genres: [],
  tropes: [],
  commissionPricePence: null,
  collaborationWanted: false,
  editorWanted: false,
};

export default function WriterRightsPanel({ script, onUpdated, notify, simulationMode = false }: Props) {
  const [rights, setRights] = useState(defaultRights);
  const [marketplace, setMarketplace] = useState<any>(defaultMarketplace);
  // Keep comma-separated fields as raw text while typing. Trimming on each
  // onChange discarded trailing spaces and prevented multi-word genres/tropes.
  const [genresDraft, setGenresDraft] = useState('');
  const [tropesDraft, setTropesDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setRights({ ...defaultRights, ...(script?.rights ?? {}), aiTrainingAllowed: false });
    setMarketplace({ ...defaultMarketplace, ...(script?.marketplace ?? {}) });
    setGenresDraft((script?.marketplace?.genres ?? []).join(', '));
    setTropesDraft((script?.marketplace?.tropes ?? []).join(', '));
  }, [script?.id, script?.rights, script?.marketplace]);

  const save = async (listApproved = false) => {
    if (!script?.id) return;
    if (listApproved && !['Approved','Published'].includes(String(script.status ?? ''))) {
      notify('Nightjar must approve your manuscript before it can appear in the Creator Marketplace.');
      return;
    }
    if (listApproved && (!marketplace.synopsis?.trim() || rights.ownershipAttested !== true || rights.contributorPermissionsConfirmed !== true)) {
      notify('Add a public synopsis and confirm ownership and contributor permissions before listing for creators.');
      return;
    }
    setSaving(true);
    // Normalise only when saving, never while the user is editing.
    const nextMarketplace = {
      ...marketplace,
      ...(listApproved ? {visibility:'marketplace'} : {}),
      genres: parseListingTags(genresDraft, 16),
      tropes: parseListingTags(tropesDraft, 24),
    };
    try {
      if (simulationMode) {
        onUpdated({ ...script, rights: { ...rights, aiTrainingAllowed: false }, marketplace: nextMarketplace });
        notify(listApproved ? 'Simulation: this approved script is now listed for creators.' : 'Simulation: rights and listing controls updated locally.');
      } else {
        const data = await nightjarScripts.updateRights(script.id, { ...rights, aiTrainingAllowed: false }, nextMarketplace);
        onUpdated(data.script ?? script);
        notify(listApproved ? 'Your approved script is now listed in the Creator Marketplace. Your full manuscript remains private.' : 'Rights and listing controls saved.');
      }
    } catch {
      notify('Rights and listing controls could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submitForNightjarReview = async () => {
    if (!script?.id || submitting || saving) return;
    if (!['Draft','Revision requested','Rejected'].includes(String(script.status ?? 'Draft'))) {
      notify('This manuscript is already submitted or approved. No second submission is needed.');
      return;
    }
    if (!rights.ownershipAttested || !rights.contributorPermissionsConfirmed) {
      notify('Please confirm manuscript ownership and contributor permissions before submission.');
      document.getElementById('writer-rights-attest')?.scrollIntoView({behavior:'smooth',block:'center'});
      return;
    }
    if (!String(script.content ?? '').trim() && !script.sourceFile?.fileName) {
      notify('Write or upload your manuscript before submitting.');
      return;
    }
    const nextMarketplace = {...marketplace, genres:parseListingTags(genresDraft,16), tropes:parseListingTags(tropesDraft,24)};
    setSubmitting(true);
    try {
      if (simulationMode) {
        onUpdated({...script,status:'Submitted',rights:{...rights,aiTrainingAllowed:false},marketplace:nextMarketplace});
        notify('Simulation: manuscript submitted for NightJar approval, without an editor assignment.');
      } else {
        // Save both the current manuscript and these rights values, then ask the
        // server to confirm that the workflow actually changed to Submitted.
        await nightjarScripts.update(script.id, {title:script.title, content:script.content ?? ''});
        await nightjarScripts.updateRights(script.id, {...rights,aiTrainingAllowed:false}, nextMarketplace);
        const result = await nightjarScripts.submit(script.id);
        if (result.script?.status !== 'Submitted') throw new Error('The server did not confirm submission. Check your script status before retrying.');
        onUpdated(result.script);
        notify('Submitted for NightJar approval. Your full manuscript is still private. An Audio Editor is not required.');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Submission could not be confirmed. Your manuscript is still saved privately.');
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="research-panel writer-rights-panel">
    <div className="research-panel-head">
      <div><span className="mini-label">RIGHTS & LICENSING</span><h2>Your work stays attributable to you.</h2><p>Record the terms that matter before a manuscript moves into production. Nightjar keeps AI-training permission off.</p></div>
      <FileKey2 size={22}/>
    </div>

    <div className="nj-writer-marketplace-journey" role="status">
      <strong>Script to Creator Marketplace</strong>
      <p>{['Approved','Published'].includes(String(script.status ?? ''))
        ? marketplace.visibility === 'marketplace' && Boolean(String(marketplace.synopsis ?? '').trim()) ? 'Approved and listed for Creator discovery. Your synopsis is public; the full manuscript stays protected.' : 'Your manuscript is approved. Add a public synopsis and use the action below to release its listing to Voice Actors.'
        : ['Submitted','Under review'].includes(String(script.status ?? '')) ? 'Your script is awaiting Nightjar approval. Assigning an Audio Editor is optional. You may set Marketplace visibility now and the synopsis will go live only after approval.'
        : 'Your uploaded manuscript is a private draft, not a submission. Confirm the two permissions below, then choose Submit for NightJar review. Marketplace visibility and Audio Editor assignment are both optional.'}</p>
      {['Draft','Revision requested','Rejected'].includes(String(script.status ?? 'Draft')) && <>
        <div className="nj-writer-rights-quick" id="writer-rights-attest">
          <label className="rights-check"><input type="checkbox" checked={rights.ownershipAttested === true} onChange={e=>setRights(current=>({...current,ownershipAttested:e.target.checked}))}/><span>I own/control the manuscript rights needed for this submission.</span></label>
          <label className="rights-check"><input type="checkbox" checked={rights.contributorPermissionsConfirmed === true} onChange={e=>setRights(current=>({...current,contributorPermissionsConfirmed:e.target.checked}))}/><span>I have permission for any protected contributions by others.</span></label>
        </div>
        <button className="primary-button nj-writer-submit-button" type="button" disabled={submitting || saving} onClick={()=>void submitForNightjarReview()}><Save size={14}/>{submitting?'Submitting securely…':'Submit for NightJar review'}</button>
        <small>This sends the protected manuscript to administrators. Saving a draft or uploading a file does not submit it. Audio Editors are optional.</small>
      </>}
      {['Approved','Published'].includes(String(script.status ?? '')) && (marketplace.visibility !== 'marketplace' || !String(marketplace.synopsis ?? '').trim()) &&
        <button className="primary-button" type="button" disabled={saving} onClick={()=>void save(true)}><Save size={14}/> {saving?'Listing…':'List approved script for creators'}</button>}
    </div>

    <div className="rights-grid">
      <label>Copyright owner<input value={rights.copyrightOwner} onChange={(e) => setRights((r) => ({ ...r, copyrightOwner: e.target.value }))}/></label>
      <label>Licence type<select value={rights.licenceType} onChange={(e) => setRights((r) => ({ ...r, licenceType: e.target.value }))}><option value="none">No licence agreed</option><option value="non-exclusive">Non-exclusive</option><option value="exclusive">Exclusive</option></select></label>
      <label>Licence length<input value={rights.licenceLength ?? ''} onChange={(e) => setRights((r) => ({ ...r, licenceLength: e.target.value }))} placeholder="e.g. 12 months"/></label>
      <label>Marketplace visibility<select value={marketplace.visibility} onChange={(e) => setMarketplace((m: any) => ({ ...m, visibility: e.target.value }))}><option value="private">Private</option><option value="invitation">Invitation only</option><option value="marketplace">Marketplace</option><option value="unavailable">Unavailable</option><option value="licensed">Licensed</option></select></label>
      <label className="research-span-two">Public synopsis<textarea value={marketplace.synopsis ?? ''} onChange={(e) => setMarketplace((m: any) => ({ ...m, synopsis: e.target.value }))} placeholder="A protected public summary; never the full manuscript."/></label>
      <label>Genres<input value={genresDraft} onChange={(event) => setGenresDraft(event.target.value)} placeholder="Dark romance, Romantic fantasy" aria-describedby="nightjar-genres-help"/><small id="nightjar-genres-help">Separate genres with commas. Spaces inside each genre are supported.</small></label>
      <label>Tropes<input value={tropesDraft} onChange={(event) => setTropesDraft(event.target.value)} placeholder="Enemies to lovers, Found family" aria-describedby="nightjar-tropes-help"/><small id="nightjar-tropes-help">Separate tropes with commas. Multi-word phrases are preserved.</small></label>
      <label>Indicative commission price (£)<input type="number" min="0" step="0.01" value={marketplace.commissionPricePence == null ? '' : marketplace.commissionPricePence / 100} onChange={(e) => setMarketplace((m: any) => ({ ...m, commissionPricePence: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) }))}/></label>
      <label className="rights-check"><input type="checkbox" checked={rights.writerRetainsCopyright} onChange={(e) => setRights((r) => ({ ...r, writerRetainsCopyright: e.target.checked }))}/> Writer retains copyright</label>
      <label className="rights-check"><input type="checkbox" checked={rights.adaptationApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, adaptationApprovalRequired: e.target.checked }))}/> Adaptation approval required</label>
      <label className="rights-check"><input type="checkbox" checked={rights.significantEditsApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, significantEditsApprovalRequired: e.target.checked }))}/> Significant edits require approval</label>
      <label className="rights-check"><input type="checkbox" checked={rights.castingApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, castingApprovalRequired: e.target.checked }))}/> Casting approval required</label>
      <label className="rights-check"><input type="checkbox" checked={rights.finalAudioApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, finalAudioApprovalRequired: e.target.checked }))}/> Final audio approval required</label>
      <label className="rights-check"><input type="checkbox" checked={rights.commercialUse} onChange={(e) => setRights((r) => ({ ...r, commercialUse: e.target.checked }))}/> Commercial use included in licence</label>
      <label className="rights-check"><input type="checkbox" checked={marketplace.collaborationWanted} onChange={(e) => setMarketplace((m: any) => ({ ...m, collaborationWanted: e.target.checked }))}/> Open to creator collaboration</label>
      <label className="rights-check"><input type="checkbox" checked={marketplace.editorWanted} onChange={(e) => setMarketplace((m: any) => ({ ...m, editorWanted: e.target.checked }))}/> Looking for Audio Editor</label>
      <label className="research-span-two">Withdrawal terms<textarea value={rights.withdrawalTerms ?? ''} onChange={(e) => setRights((r) => ({ ...r, withdrawalTerms: e.target.value }))} placeholder="Agreed conditions under which the licence may be withdrawn."/></label>
    </div>

    <div className="rights-ai-lock"><ShieldCheck size={16}/><div><strong>AI training permission: OFF</strong><span>Protected manuscripts are not made available for AI training through this control.</span></div></div>
    <button className="primary-button" disabled={saving} onClick={() => void save()}><Save size={14}/> {saving ? 'Saving…' : 'Save rights & listing'}</button>
  </section>;
}
