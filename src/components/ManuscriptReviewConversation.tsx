import { useCallback, useEffect, useState } from 'react';
import { LockKeyhole, MessageCircle, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { nightjarScripts } from '../platform/firebase-scripts';
import './manuscript-review-conversation.css';

type Entry = {
  id: string; kind: string; visibility: 'internal'|'writer';
  authorUserId: string|null; authorLabel: string;
  body: string; createdAt: string|null;
};
type Props = {
  scriptId: string;
  audience: 'admin'|'writer';
  notify: (message: string) => void;
  demoMode?: boolean;
  simulationMode?: boolean;
};
export default function ManuscriptReviewConversation({ scriptId, audience, notify, demoMode=false, simulationMode=false }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'internal'|'writer'>('writer');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    try {
      if (demoMode) {
        if (!silent) setEntries([]);
        return;
      }
      const data = await nightjarScripts.manuscriptReviewThread(scriptId);
      setEntries(data.entries ?? []);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The review conversation could not be loaded.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [scriptId, demoMode]);

  useEffect(() => {
    setEntries([]);
    setBody('');
    setError('');
    void refresh();
    if (demoMode) return;
    const interval = window.setInterval(() => void refresh(true), 30000);
    return () => window.clearInterval(interval);
  }, [refresh, demoMode]);

  const send = async () => {
    if (!body.trim() || sending) return;
    if (demoMode && !simulationMode) { notify('Demo records cannot be messaged. Start simulation to test this conversation.'); return; }
    setSending(true);
    try {
      const next:Entry = demoMode
        ? { id:'demo-thread-'+Date.now(), body:body.trim(), authorUserId:null, authorLabel: audience==='admin'?'NightJar Team':'Writer', visibility:audience==='admin'?visibility:'writer', kind:visibility==='internal'?'note':'message', createdAt:new Date().toISOString() }
        : (await nightjarScripts.postManuscriptReviewEntry(scriptId, body.trim(), audience==='admin'?visibility:'writer')).entry;
      setEntries(items => [...items, next]);
      setBody('');
      setError('');
      notify(audience==='admin' && visibility==='internal' ? 'Private NightJar review note saved.' : 'Manuscript review message sent.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Message could not be sent.');
    } finally { setSending(false); }
  };

  return <section className="manuscript-review-thread" aria-label={audience==='admin'?'Manuscript notes and writer conversation':'NightJar manuscript review messages'}>
    <header className="manuscript-review-thread-head">
      <div><span className="mini-label">{audience==='admin'?'ADMIN NOTES & WRITER MESSAGES':'NIGHTJAR REVIEW CONVERSATION'}</span>
        <h3>{audience==='admin'?'Keep each decision in context.':'Discuss your manuscript with NightJar.'}</h3>
        <p>{audience==='admin'?'Private team notes stay hidden from the writer. Replies marked “Message Writer” are visible to the writer.':'Ask questions, reply to requested changes and keep everything attached to this manuscript.'}</p></div>
      <button type="button" className="secondary-button" disabled={loading} onClick={() => void refresh()}><RefreshCw size={14}/>{loading?'Loading…':'Refresh'}</button>
    </header>
    <div className="manuscript-review-thread-items" role="log" aria-live="polite" aria-relevant="additions text">
      {!loading && entries.length===0 && <p className="manuscript-review-thread-empty">No messages yet. This manuscript now has a dedicated review conversation.</p>}
      {entries.map(entry => <article className={'manuscript-review-thread-entry '+(entry.visibility==='internal'?'internal':'writer-visible')} key={entry.id}>
        <div className="manuscript-review-thread-meta">
          <strong>{entry.visibility==='internal'?<><LockKeyhole size={13}/> Private NightJar note</>:<><MessageCircle size={13}/> {entry.authorLabel||'NightJar review message'}</>}</strong>
          <time>{entry.createdAt?new Date(entry.createdAt).toLocaleString('en-GB'):'Now'}</time>
        </div><p>{entry.body}</p>
      </article>)}
    </div>
    {audience==='admin' && <fieldset className="manuscript-review-thread-switch">
      <legend>Who can see this?</legend>
      <label><input type="radio" checked={visibility==='writer'} onChange={()=>setVisibility('writer')}/> Message Writer</label>
      <label><input type="radio" checked={visibility==='internal'} onChange={()=>setVisibility('internal')}/> Internal admin note only</label>
    </fieldset>}
    <label className="manuscript-review-thread-compose">{audience==='admin'&&visibility==='internal'?'Private administrator note':'Message'}
      <textarea value={body} maxLength={2400} rows={3} placeholder={audience==='admin'&&visibility==='internal'?'Review observations, follow-up actions or internal checks…':'Write a message about this manuscript…'} onChange={event=>setBody(event.target.value)}/>
    </label>
    {error && <p className="manuscript-review-error" role="alert">{error}</p>}
    <footer><span><ShieldCheck size={14}/> {audience==='admin'&&visibility==='internal'?'Visible to authorised NightJar admins only':'Visible to the manuscript Writer and NightJar admins'}</span>
      <button type="button" className="primary-button" disabled={sending||!body.trim()} onClick={()=>void send()}><Send size={14}/>{sending?'Sending…':audience==='admin'&&visibility==='internal'?'Save private note':'Send message'}</button>
    </footer>
  </section>;
}
