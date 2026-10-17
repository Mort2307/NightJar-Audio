import { useEffect, useState } from 'react';
import { FileKey2, Save, ShieldCheck } from 'lucide-react';
import { nightjarScripts } from '../platform/firebase-scripts';
import ContextHelp from './ContextHelp';
import './writer-submission-guide.css';
import { parseListingTags } from '../platform/listing-tags';

type Props = {
  script: any;
  onUpdated: (script: any) => void;
  submitManuscript: () => Promise<boolean>;
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
  previewExcerpt: '',
  genres: [],
  tropes: [],
  commissionPricePence: null,
  collaborationWanted: false,
  editorWanted: false,
};

export default function WriterRightsPanel({ script, onUpdated, submitManuscript, notify, simulationMode = false }: Props) {
  const [rights, setRights] = useState(defaultRights);
  const [marketplace, setMarketplace] = useState<any>(defaultMarketplace);
  // Keep comma-separated fields as raw text while typing. Trimming on each
  // onChange discarded trailing spaces and prevented multi-word genres/tropes.
  const [genresDraft, setGenresDraft] = useState('');
  const [tropesDraft, setTropesDraft] = useState('');
  const [askingPriceDraft, setAskingPriceDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setRights({ ...defaultRights, ...(script?.rights ?? {}), aiTrainingAllowed: false });
    setMarketplace({ ...defaultMarketplace, ...(script?.marketplace ?? {}) });
    setGenresDraft((script?.marketplace?.genres ?? []).join(', '));
    setTropesDraft((script?.marketplace?.tropes ?? []).join(', '));
    const storedPrice = script?.marketplace?.commissionPricePence;
    setAskingPriceDraft(typeof storedPrice === 'number' && storedPrice > 0 ? (storedPrice / 100).toFixed(2) : '');
  }, [script?.id, script?.rights, script?.marketplace]);

  const parseWriterPrice = (): number | null | undefined => {
    const value = askingPriceDraft.trim();
    if (!value) return null; // Writers may choose "contact for pricing".
    if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value)) return undefined;
    const pence = Math.round(Number(value) * 100);
    return Number.isSafeInteger(pence) && pence >= 100 && pence <= 10000000 ? pence : undefined;
  };
  const save = async (listApproved = false) => {
    if (!script?.id || saving || submitting) return;
    const askingPrice = parseWriterPrice();
    if (askingPrice === undefined) { notify('Enter a valid asking price between £1 and £100,000, or leave the field blank.'); return; }
    if (listApproved && !['Approved','Published'].includes(String(script.status ?? ''))) {
      notify('NightJar must approve your manuscript before you list it for creators.');
      return;
    }
    if (listApproved && (!String(marketplace.synopsis ?? '').trim() || rights.ownershipAttested !== true || rights.contributorPermissionsConfirmed !== true)) {
      notify('Add a public synopsis and confirm ownership and contributor permissions before listing for creators.');
      return;
    }
    setSaving(true);
    // Normalise only when saving, never while the user is editing.
    const nextMarketplace = {
      ...marketplace,
      ...(listApproved ? { visibility: 'marketplace' } : {}),
      genres: parseListingTags(genresDraft, 16),
      tropes: parseListingTags(tropesDraft, 24),
      commissionPricePence: askingPrice,
    };
    try {
      if (simulationMode) {
        onUpdated({ ...script, rights: { ...rights, aiTrainingAllowed: false }, marketplace: nextMarketplace });
        notify(listApproved ? 'Simulation: approved manuscript listed for creators.' : 'Simulation: rights and listing controls updated locally.');
      } else {
        const data = await nightjarScripts.updateRights(script.id, { ...rights, aiTrainingAllowed: false }, nextMarketplace);
        onUpdated(data.script ?? script);
        notify(listApproved ? 'Approved manuscript listed. Only the Writer-selected synopsis is public; the full manuscript remains protected.' : 'Rights and listing controls saved.');
      }
    } catch {
      notify('Rights and listing controls could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submitForNightJarReview = async () => {
    if (!script?.id || saving || submitting) return;
    const askingPrice = parseWriterPrice();
    if (askingPrice === undefined) { notify('Enter a valid asking price between £1 and £100,000, or leave the field blank.'); return; }
    if (!['Draft', 'Revision requested', 'Rejected'].includes(String(script.status ?? 'Draft'))) {
      notify('This manuscript is already submitted or approved.');
      return;
    }
    if (rights.ownershipAttested !== true || rights.contributorPermissionsConfirmed !== true) {
      notify('Confirm ownership and contributor permissions in Rights & Licensing first.');
      document.getElementById('writer-rights-attest')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!String(script.content ?? '').trim() && !script.sourceFile?.fileName) {
      notify('Write or upload a manuscript before submitting it for review.');
      return;
    }
    setSubmitting(true);
    try {
      const listing = {
        ...marketplace,
        commissionPricePence: askingPrice,
        genres: parseListingTags(genresDraft, 16),
        tropes: parseListingTags(tropesDraft, 24),
      };
      if (simulationMode) {
        onUpdated({ ...script, status: 'Submitted', rights: { ...rights, aiTrainingAllowed: false }, marketplace: listing });
        notify('Simulation: protected manuscript submitted directly for NightJar approval.');
      } else {
        // Save the latest in-panel rights before the canonical Writer Studio
        // submission handler persists edited manuscript text and submits it.
        // The server must return status Submitted before we show success.
        await nightjarScripts.updateRights(script.id, { ...rights, aiTrainingAllowed: false }, listing);
        const confirmed = await submitManuscript();
        if (!confirmed) return;
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Submission could not be completed. Your private draft remains available.');
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="research-panel writer-rights-panel" id="writer-rights-review">
    <div className="research-panel-head">
      <div><span className="mini-label">RIGHTS & LICENSING</span><h2>Your work stays attributable to you.</h2><p>Record the licensing and approval terms that matter before a manuscript moves into production.</p></div>
      <FileKey2 size={22}/>
    </div>

    <div className="nj-writer-review-journey" role="status">
      <strong>One clear path: manuscript → rights → NightJar review → optional creator listing</strong>
      <p>{['Approved','Published'].includes(String(script.status ?? ''))
        ? marketplace.visibility === 'marketplace' && String(marketplace.synopsis ?? '').trim()
          ? 'Approved and listed. Your synopsis is discoverable while the full manuscript remains protected.'
          : 'NightJar approved this manuscript. You control whether to publish an optional Creator Marketplace listing.'
        : ['Submitted','Under review'].includes(String(script.status ?? ''))
          ? 'Submitted to NightJar. Your protected manuscript is awaiting an administrator decision; an Audio Editor is not required.'
          : 'Your manuscript is a private draft until you confirm the permissions below and submit. Saving or uploading alone does not send it for review.'}</p>

      {['Approved','Published'].includes(String(script.status ?? '')) &&
        (marketplace.visibility !== 'marketplace' || !String(marketplace.synopsis ?? '').trim()) &&
        <button type="button" className="primary-button" disabled={saving || submitting} onClick={() => void save(true)}>
          <Save size={15}/>{saving ? 'Listing…' : 'List approved script for creators'}
        </button>}
      <small>Editor involvement is optional. NightJar cannot publish a full manuscript through this listing control.</small>
    </div>

    <section className="nj-writer-essential-steps" aria-label="Required steps before manuscript submission">
      <div className="nj-writer-steps-heading">
        <span className="mini-label">JUST THREE ESSENTIALS</span>
        <h3>Ready to send your script for review?</h3>
        <p>You're not expected to fill in every box. Only the manuscript and the two declarations below are needed to submit privately to NightJar. The extra licensing and marketplace settings are optional.</p>
      </div>
      <ol className="nj-writer-essential-checklist">
        <li className={String(script.content??'').trim()||script.sourceFile?.fileName?'complete':'needs-action'}>
          <span aria-hidden="true">{String(script.content??'').trim()||script.sourceFile?.fileName?'✓':'1'}</span>
          <div><strong>Manuscript uploaded or written</strong><small>{String(script.content??'').trim()||script.sourceFile?.fileName?'Manuscript attached — ready.':'Write your manuscript or choose an existing TXT, Word or PDF file in Writer Studio first.'}</small></div>
        </li>
        <li className={rights.ownershipAttested?'complete':'needs-action'}>
          <span aria-hidden="true">{rights.ownershipAttested?'✓':'2'}</span>
          <div><strong>Confirm your copyright authority</strong><small>Required — tick only if you wrote the work or hold the rights necessary for this submission.</small></div>
        </li>
        <li className={rights.contributorPermissionsConfirmed?'complete':'needs-action'}>
          <span aria-hidden="true">{rights.contributorPermissionsConfirmed?'✓':'3'}</span>
          <div><strong>Confirm contributor permissions</strong><small>Required — confirm that you have permission for any other person's protected contribution included in the work.</small></div>
        </li>
      </ol>
      <div className="nj-writer-required-declarations" id="writer-rights-attest">
        <strong>Required declarations · 2 to complete</strong>
              <label className="rights-check research-span-two"><input type="checkbox" checked={rights.ownershipAttested === true} onChange={(e) => setRights((r) => ({ ...r, ownershipAttested: e.target.checked }))}/><span><strong>Ownership / authority confirmed</strong> <ContextHelp topic="rights-confirmation"/> — I wrote this manuscript or otherwise control the rights needed to submit and license it through the selected Nightjar workflow.</span></label>
              <label className="rights-check research-span-two"><input type="checkbox" checked={rights.contributorPermissionsConfirmed === true} onChange={(e) => setRights((r) => ({ ...r, contributorPermissionsConfirmed: e.target.checked }))}/><span><strong>Contributor permissions confirmed</strong> <ContextHelp topic="rights-confirmation"/> — where another person’s protected contribution appears, I have the permission required for the use I am proposing.</span></label>
      </div>
      {['Draft','Revision requested','Rejected'].includes(String(script.status ?? 'Draft')) && <div className="nj-writer-essential-submit">
        <button type="button" className="primary-button"
          disabled={saving || submitting || !Boolean(String(script.content??'').trim()||script.sourceFile?.fileName) || !rights.ownershipAttested || !rights.contributorPermissionsConfirmed}
          onClick={()=>void submitForNightJarReview()}>
          <ShieldCheck size={15}/>{submitting?'Submitting securely…':'Submit privately for NightJar review'}
        </button>
        <p>{Boolean(String(script.content??'').trim()||script.sourceFile?.fileName) && rights.ownershipAttested && rights.contributorPermissionsConfirmed
          ? 'All three essentials are ready. An administrator will review your script before anything can be published.'
          : 'Submission remains unavailable until all three essentials above are complete. Your draft can still be saved safely.'}</p>
      </div>}
    </section>

    <details className="nj-writer-advanced-rights" aria-label="Optional licensing and creator marketplace choices">
      <summary>
        <span><strong>Optional · Advanced rights, pricing and creator marketplace</strong><small>Choose these only when relevant. You can keep the defaults and edit them later.</small></span><span aria-hidden="true">⌄</span>
      </summary>
      <div className="rights-grid">
      <label><span className="nj-term-label">Copyright owner <ContextHelp topic="copyright"/></span><input value={rights.copyrightOwner} onChange={(e) => setRights((r) => ({ ...r, copyrightOwner: e.target.value }))}/></label>
      <label><span className="nj-term-label">Licence type <ContextHelp topic="licence-choice"/></span><select value={rights.licenceType} onChange={(e) => setRights((r) => ({ ...r, licenceType: e.target.value }))}><option value="none">No licence agreed</option><option value="non-exclusive">Non-exclusive</option><option value="exclusive">Exclusive</option></select></label>
      <label><span className="nj-term-label">Licence length <ContextHelp topic="licence-term"/></span><input value={rights.licenceLength ?? ''} onChange={(e) => setRights((r) => ({ ...r, licenceLength: e.target.value }))} placeholder="e.g. 12 months"/></label>
      <label><span className="nj-term-label">Marketplace visibility <ContextHelp topic="marketplace-visibility"/></span><select value={marketplace.visibility} onChange={(e) => setMarketplace((m: any) => ({ ...m, visibility: e.target.value }))}><option value="private">Private</option><option value="invitation">Invitation only</option><option value="marketplace">Marketplace</option><option value="unavailable">Unavailable</option><option value="licensed">Licensed</option></select></label>
      <label><span className="nj-term-label">Your script asking price (£, optional) <ContextHelp topic="licence-price"/></span><input type="number" min="1" max="100000" step=".01" inputMode="decimal" value={askingPriceDraft} onChange={(e)=>setAskingPriceDraft(e.target.value)} placeholder="Contact for price" /><small>Your own asking price, shown on approved marketplace listings. You control this amount; it is negotiable and separate from Nightjar's internal finances.</small></label>
      <label className="research-span-two"><span className="nj-term-label">Public synopsis <ContextHelp topic="public-synopsis"/></span><textarea value={marketplace.synopsis ?? ''} onChange={(e) => setMarketplace((m: any) => ({ ...m, synopsis: e.target.value }))} placeholder="A protected public summary; never the full manuscript."/></label>
      <label className="research-span-two"><span className="nj-term-label">Optional protected VA sample <ContextHelp topic="protected-sample"/></span><textarea value={marketplace.previewExcerpt ?? ''} maxLength={3200} onChange={(e)=>setMarketplace((m:any)=>({...m,previewExcerpt:e.target.value}))} placeholder="Paste only the extract you expressly authorise VAs to preview. The entire original manuscript stays private."/><small>Writer-selected extract · shown only inside the protected VA sample viewer · up to 3,200 characters. Leave blank to disable samples.</small></label>
      <label>Genres<input value={genresDraft} onChange={(event) => setGenresDraft(event.target.value)} placeholder="Dark romance, Romantic fantasy" aria-describedby="nightjar-genres-help"/><small id="nightjar-genres-help">Separate genres with commas. Spaces inside each genre are supported.</small></label>
      <label>Tropes<input value={tropesDraft} onChange={(event) => setTropesDraft(event.target.value)} placeholder="Enemies to lovers, Found family" aria-describedby="nightjar-tropes-help"/><small id="nightjar-tropes-help">Separate tropes with commas. Multi-word phrases are preserved.</small></label>
      <label className="rights-check"><input type="checkbox" checked={rights.writerRetainsCopyright} onChange={(e) => setRights((r) => ({ ...r, writerRetainsCopyright: e.target.checked }))}/> <span className="nj-term-label">Writer retains copyright <ContextHelp topic="copyright"/></span></label>
      <label className="rights-check"><input type="checkbox" checked={rights.adaptationApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, adaptationApprovalRequired: e.target.checked }))}/> <span className="nj-term-label">Adaptation approval required <ContextHelp topic="adaptation-approval"/></span></label>
      <label className="rights-check"><input type="checkbox" checked={rights.significantEditsApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, significantEditsApprovalRequired: e.target.checked }))}/> Significant edits require approval</label>
      <label className="rights-check"><input type="checkbox" checked={rights.castingApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, castingApprovalRequired: e.target.checked }))}/> Casting approval required</label>
      <label className="rights-check"><input type="checkbox" checked={rights.finalAudioApprovalRequired} onChange={(e) => setRights((r) => ({ ...r, finalAudioApprovalRequired: e.target.checked }))}/> Final audio approval required</label>
      <label className="rights-check"><input type="checkbox" checked={rights.commercialUse} onChange={(e) => setRights((r) => ({ ...r, commercialUse: e.target.checked }))}/> <span className="nj-term-label">Commercial use included in licence <ContextHelp topic="commercial-use"/></span></label>


      <label className="rights-check"><input type="checkbox" checked={marketplace.collaborationWanted} onChange={(e) => setMarketplace((m: any) => ({ ...m, collaborationWanted: e.target.checked }))}/> Open to creator collaboration</label>
      <label className="rights-check"><input type="checkbox" checked={marketplace.editorWanted} onChange={(e) => setMarketplace((m: any) => ({ ...m, editorWanted: e.target.checked }))}/> Looking for Audio Editor</label>
      <label className="research-span-two"><span className="nj-term-label">Withdrawal terms <ContextHelp topic="withdrawal-terms"/></span><textarea value={rights.withdrawalTerms ?? ''} onChange={(e) => setRights((r) => ({ ...r, withdrawalTerms: e.target.value }))} placeholder="Agreed conditions under which the licence may be withdrawn."/></label>
      </div>
    </details>

    <button className="primary-button" disabled={saving} onClick={() => void save()}><Save size={14}/> {saving ? 'Saving…' : 'Save rights & listing'}</button>
  </section>;
}
