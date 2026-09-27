import { FileText, LockKeyhole, ShieldCheck } from 'lucide-react';
import ScriptAccessManager from './ScriptAccessManager';

type Props = {
  draftTitle: string;
  scripts: any[];
  selected: any | null;
  onDraftTitleChange: (value: string) => void;
  onSelect: (script: any) => void;
  onCreate: () => void | Promise<void>;
  onSave: () => void | Promise<void>;
  onVersion: () => void | Promise<void>;
  onSubmit: () => void | Promise<void>;
  onOpenProtected: (scriptId: string) => void | Promise<void>;
  notify: (message: string) => void;
};

export default function WriterStudio({ draftTitle, scripts, selected, onDraftTitleChange, onSelect, onCreate, onSave, onVersion, onSubmit, onOpenProtected, notify }: Props) {
  const editable = Boolean(selected && ['Draft', 'Revision requested', 'Rejected'].includes(String(selected.status ?? 'Draft')));

  return <section className="page-wrap role-studio-page">
    <div className="page-heading"><div><p className="eyebrow"><FileText size={14}/> WRITER STUDIO</p><h1>Write it. Protect it.</h1><p>Live manuscripts, version history and controlled editorial handoff.</p></div></div>
    <div className="writer-create-card"><div><span className="mini-label">NEW SCRIPT</span><h2>Start a manuscript</h2><p>Every new script begins private.</p></div><div className="writer-create-form"><input value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} placeholder="Working title"/><button className="primary-button" onClick={() => void onCreate()}>Create draft <FileText size={15}/></button></div></div>
    <div className="writer-layout">
      <aside className="writer-library">
        {scripts.map((script:any)=><button key={script.id} className={selected?.id===script.id?'library-item active':'library-item'} onClick={()=>onSelect(script)}><span>{script.status}</span><strong>{script.title}</strong><em>v{script.version}</em></button>)}
        {!scripts.length&&<div className="people-empty"><FileText size={18}/><strong>No manuscripts yet.</strong><span>Create a script to begin.</span></div>}
      </aside>
      {selected ? <div className="writer-editor-stack"><article className="writer-editor-card">
        <div className="editor-toolbar"><div><span className="mini-label">MANUSCRIPT</span><input disabled={!editable} value={selected.title??''} onChange={event=>onSelect({...selected,title:event.target.value})}/></div><span className="status-pill">{selected.status} · v{selected.version}</span></div>
        {!editable && <div className="writer-lock-note"><ShieldCheck size={15}/><span>This manuscript is read-only while it is submitted, under review or approved. Editorial workflow controls its status.</span></div>}
        <textarea disabled={!editable} className="script-editor" value={selected.content??''} onChange={event=>onSelect({...selected,content:event.target.value})} placeholder="Begin writing…"/>
        <div className="editor-actions"><button className="secondary-button" disabled={!editable} onClick={()=>void onSave()}>Save</button><button className="secondary-button" disabled={!editable} onClick={()=>void onVersion()}>Record version</button><button className="primary-button" disabled={!editable || !String(selected.content ?? '').trim()} onClick={()=>void onSubmit()}>Submit to editorial</button><button className="ghost-button" onClick={()=>void onOpenProtected(selected.id)}><LockKeyhole size={14}/> Protected reader</button></div>
        {selected.contentHash && <div className="script-fingerprint"><ShieldCheck size={13}/><span>Manuscript fingerprint</span><code>{String(selected.contentHash).slice(0,16)}…</code></div>}
      </article>
      <ScriptAccessManager scriptId={String(selected.id)} notify={notify}/>
      </div> : <div className="writer-editor-card"><div className="people-empty"><FileText size={18}/><strong>Select a manuscript.</strong><span>Choose a live script from your library.</span></div></div>}
    </div>
  </section>;
}
