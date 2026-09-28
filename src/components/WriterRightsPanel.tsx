import { useEffect, useState } from 'react';
import { FileKey2, Save, ShieldCheck } from 'lucide-react';
import { nightjarScripts } from '../platform/firebase-scripts';

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRights({ ...defaultRights, ...(script?.rights ?? {}), aiTrainingAllowed: false });
    setMarketplace({ ...defaultMarketplace, ...(script?.marketplace ?? {}) });
  }, [script?.id, script?.rights, script?.marketplace]);

  const save = async () => {
    if (!script?.id) return;
    setSaving(true);
    try {
      if (simulationMode) {
        onUpdated({ ...script, rights: { ...rights, aiTrainingAllowed: false }, marketplace });
        notify('Simulation: rights and listing controls updated locally.');
      } else {
        const data = await nightjarScripts.updateRights(script.id, { ...rights, aiTrainingAllowed: false }, marketplace);
        onUpdated(data.script ?? script);
        notify('Rights and listing controls saved.');
      }
    } catch {
      notify('Rights and listing controls could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="research-panel writer-rights-panel">
    <div className="research-panel-head">
      <div><span className="mini-label">RIGHTS & LICENSING</span><h2>Your work stays attributable to you.</h2><p>Record the terms that matter before a manuscript moves into production. Nightjar keeps AI-training permission off.</p></div>
      <FileKey2 size={22}/>
    </div>

    <div className="rights-grid">
      <label>Copyright owner<input value={rights.copyrightOwner} onChange={(e) => setRights((r) => ({ ...r, copyrightOwner: e.target.value }))}/></label>
      <label>Licence type<select value={rights.licenceType} onChange={(e) => setRights((r) => ({ ...r, licenceType: e.target.value }))}><option value="none">No licence agreed</option><option value="non-exclusive">Non-exclusive</option><option value="exclusive">Exclusive</option></select></label>
      <label>Licence length<input value={rights.licenceLength ?? ''} onChange={(e) => setRights((r) => ({ ...r, licenceLength: e.target.value }))} placeholder="e.g. 12 months"/></label>
      <label>Marketplace visibility<select value={marketplace.visibility} onChange={(e) => setMarketplace((m: any) => ({ ...m, visibility: e.target.value }))}><option value="private">Private</option><option value="invitation">Invitation only</option><option value="marketplace">Marketplace</option><option value="unavailable">Unavailable</option><option value="licensed">Licensed</option></select></label>
      <label className="research-span-two">Public synopsis<textarea value={marketplace.synopsis ?? ''} onChange={(e) => setMarketplace((m: any) => ({ ...m, synopsis: e.target.value }))} placeholder="A protected public summary; never the full manuscript."/></label>
      <label>Genres<input value={(marketplace.genres ?? []).join(', ')} onChange={(e) => setMarketplace((m: any) => ({ ...m, genres: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 16) }))}/></label>
      <label>Tropes<input value={(marketplace.tropes ?? []).join(', ')} onChange={(e) => setMarketplace((m: any) => ({ ...m, tropes: e.target.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 24) }))}/></label>
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
