import { useEffect, useMemo, useState } from 'react';
import { Check, FileKey2, RefreshCw, ShieldCheck } from 'lucide-react';
import { NIGHTJAR_LEGAL_DOCUMENTS, type NightjarLegalDocumentId } from '../legal/nightjarLegal';
import { nightjarLegal, type LegalAgreementStatus } from '../platform/firebase-legal';

export default function LegalAgreementPanel() {
  const [documents,setDocuments]=useState<LegalAgreementStatus[]>([]);
  const [selected,setSelected]=useState<Record<string,boolean>>({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');

  const load=async()=>{
    setLoading(true);
    try{
      const data=await nightjarLegal.status();
      setDocuments(data.documents??[]);
      setSelected({});
    }catch{setMessage('Nightjar could not load your legal agreement record.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{void load();},[]);

  const outstanding=useMemo(()=>documents.filter((doc)=>!doc.accepted),[documents]);

  const acceptSelected=async()=>{
    const payload=outstanding
      .filter((doc)=>selected[doc.id])
      .map((doc)=>({id:doc.id as NightjarLegalDocumentId,version:doc.version,accepted:true as const}));
    if(!payload.length)return;
    setSaving(true);setMessage('');
    try{
      await nightjarLegal.accept(payload,'profile_legal_centre');
      setMessage('Nightjar recorded your acceptance of the selected current documents.');
      await load();
    }catch(error){setMessage(error instanceof Error?error.message:'Legal acceptance could not be saved.');}
    finally{setSaving(false);}
  };

  return <article className="panel legal-agreement-panel">
    <div className="professional-role-head">
      <div><span className="mini-label">LEGAL & PERMISSIONS</span><h2>Your Nightjar agreements</h2><p>Nightjar keeps versioned evidence of the documents you have agreed to. Optional marketing and push-notification permissions remain separate choices.</p></div>
      <FileKey2 size={19}/>
    </div>

    <div className="legal-agreement-list" aria-busy={loading}>
      {documents.map((doc)=><article key={doc.id} className={doc.accepted?'legal-agreement-row accepted':'legal-agreement-row'}>
        <div className="legal-agreement-state">{doc.accepted?<Check size={16}/>:<ShieldCheck size={16}/>}</div>
        <div>
          <strong>{doc.title}</strong>
          <span>Version {doc.version}{doc.acceptedAt?' · accepted '+new Date(doc.acceptedAt).toLocaleString('en-GB'):''}</span>
          <a href={doc.path} target="_blank" rel="noreferrer">Read current document</a>
        </div>
        {doc.accepted?<span className="status-pill">CURRENT</span>:<label className="rights-check"><input type="checkbox" checked={selected[doc.id]===true} onChange={(event)=>setSelected((current)=>({...current,[doc.id]:event.target.checked}))}/><span>Accept current version</span></label>}
      </article>)}
      {!loading&&!documents.length&&<div className="people-empty"><FileKey2 size={17}/><strong>No agreement record returned.</strong><span>Refresh to retry the protected legal status service.</span></div>}
    </div>

    <div className="legal-agreement-actions">
      <button className="ghost-button" disabled={loading||saving} onClick={()=>void load()}><RefreshCw size={13}/> Refresh</button>
      <button className="primary-button" disabled={saving||!outstanding.some((doc)=>selected[doc.id])} onClick={()=>void acceptSelected()}><Check size={13}/>{saving?'Saving…':'Accept selected current documents'}</button>
    </div>
    {message&&<p className="panel-note" role="status">{message}</p>}
    <div className="legal-beta-warning compact"><ShieldCheck size={15}/><div><strong>Private-beta documents</strong><span>Current beta terms are operationally versioned. Final public operator details, consumer terms and specialist UK legal review remain a launch requirement.</span></div></div>
  </article>;
}
