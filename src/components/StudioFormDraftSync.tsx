import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { nightjarProfileDrafts, type StudioDraftScope } from '../platform/firebase-profile-drafts';

type FormFields = Record<string, string>;
type Props = {
  scope: StudioDraftScope;
  value: FormFields;
  onRestore: (value: FormFields) => void;
  clearSignal: number;
  demoMode?: boolean;
};

const asFields = (payload: Record<string, unknown> | null): FormFields =>
  Object.fromEntries(Object.entries(payload ?? {}).filter(([, value]) => typeof value === 'string')) as FormFields;
const signature = (fields: FormFields) => JSON.stringify(fields);
const isEmpty = (fields: FormFields) => Object.values(fields).every(value => !value.trim());

/**
 * Private account-scoped metadata autosave. The backend owns each scope and
 * performs compare-and-swap on revision. File inputs and permission/rights
 * checkboxes deliberately never leave this page's live component state.
 */
export default function StudioFormDraftSync({ scope, value, onRestore, clearSignal, demoMode = false }: Props) {
  const [status, setStatus] = useState<'loading' | 'saved' | 'saving' | 'pending' | 'conflict' | 'offline' | 'demo'>('loading');
  const [remote, setRemote] = useState<FormFields | null>(null);
  const [ready, setReady] = useState(false);
  const revision = useRef(0);
  const synced = useRef('');
  const current = useRef(value);
  const restore = useRef(onRestore);
  const conflict = useRef(false);
  const clearing = useRef(false);
  const request = useRef<Promise<boolean> | null>(null);
  const previousClearSignal = useRef(clearSignal);
  const loaded = useRef(false);
  // Every async operation belongs to one role/form scope. An old response must
  // never restore fields or start another save after a scope or mode switch.
  const session = useRef({ scope, demoMode, generation: 0 });
  if (session.current.scope !== scope || session.current.demoMode !== demoMode) {
    session.current = { scope, demoMode, generation: session.current.generation + 1 };
    revision.current = 0;
    synced.current = '';
    conflict.current = false;
    clearing.current = false;
    loaded.current = false;
    request.current = null;
    previousClearSignal.current = clearSignal;
  }
  const sessionValid = (generation: number) =>
    session.current.generation === generation && session.current.scope === scope && !session.current.demoMode;
  current.current = value;
  restore.current = onRestore;
  const serialized = signature(value);

  const load = async () => {
    const generation = session.current.generation;
    if (!sessionValid(generation)) { if (demoMode) setStatus('demo'); return; }
    loaded.current = false;
    setReady(false);
    setStatus('loading');
    try {
      const draft = await nightjarProfileDrafts.get(scope);
      if (!sessionValid(generation) || clearing.current) return;
      revision.current = draft.revision;
      const saved = asFields(draft.payload);
      if (draft.payload && !isEmpty(current.current) && signature(saved) !== signature(current.current)) {
        setRemote(saved);
        conflict.current = true;
        setStatus('conflict');
      } else {
        if (draft.payload) restore.current(saved);
        synced.current = draft.payload ? signature(saved) : isEmpty(current.current) ? signature(current.current) : '{}';
        setRemote(null);
        setStatus(draft.payload || isEmpty(current.current) ? 'saved' : 'pending');
        conflict.current = false;
      }
      loaded.current = true;
      setReady(true);
    } catch {
      if (!sessionValid(generation) || clearing.current) return;
      setStatus('offline');
      setReady(false);
    }
  };

  // One outstanding CAS write per scope. Recheck the latest form after every
  // response so typing during a network request is not wrongly marked Saved.
  const flush = async (): Promise<boolean> => {
    const generation = session.current.generation;
    if (!sessionValid(generation) || demoMode || !ready || !loaded.current || conflict.current || clearing.current) return false;
    if (request.current) return request.current;
    const work = (async () => {
      try {
        while (sessionValid(generation) && loaded.current && !clearing.current && !conflict.current) {
          const payload = { ...current.current };
          const before = signature(payload);
          if (before === synced.current) {
            setStatus('saved');
            return true;
          }
          setStatus('saving');
          const result = await nightjarProfileDrafts.save(scope, payload, revision.current);
          if (!sessionValid(generation)) return false;
          // Clear-on-submit waits for this write. Its CAS must use the revision
          // acknowledged by the server, even when clearing began in-flight.
          revision.current = result.revision;
          if (!result.saved) {
            conflict.current = true;
            setRemote(asFields(result.payload));
            setStatus('conflict');
            return false;
          }
          synced.current = before;
          if (clearing.current) return true;
        }
      } catch {
        if (sessionValid(generation) && !clearing.current) setStatus('offline');
        return false;
      }
      return false;
    })();
    request.current = work;
    try { return await work; }
    finally { if (request.current === work) request.current = null; }
  };

  useEffect(() => {
    if (demoMode) { setStatus('demo'); return; }
    const generation = session.current.generation;
    clearing.current = false;
    setRemote(null);
    void load();
    return () => {
      if (!sessionValid(generation)) return;
      // Invalidating before an in-flight server acknowledgement resolves also
      // prevents its response from restoring the next form's fields.
      session.current = { ...session.current, generation: generation + 1 };
      loaded.current = false;
      clearing.current = true;
      request.current = null;
    };
  }, [scope, demoMode]);

  useEffect(() => {
    if (!ready || !loaded.current || demoMode || conflict.current || clearing.current || serialized === synced.current) return;
    setStatus('pending');
    const timer = window.setTimeout(() => { void flush(); }, 1000);
    return () => window.clearTimeout(timer);
  }, [serialized, ready, scope, demoMode]);

  useEffect(() => {
    if (previousClearSignal.current === clearSignal || demoMode) return;
    previousClearSignal.current = clearSignal;
    const generation = session.current.generation;
    if (!sessionValid(generation)) return;
    clearing.current = true;
    void (async () => {
      try {
        const pending = request.current;
        if (pending) await pending;
        if (!sessionValid(generation)) return;
        // Never delete a newer device's edits after this device submits.
        const result = await nightjarProfileDrafts.clear(scope, revision.current);
        if (!sessionValid(generation)) return;
        revision.current = result.revision;
        if (!result.cleared) {
          const latest = await nightjarProfileDrafts.get(scope);
          if (!sessionValid(generation)) return;
          conflict.current = true;
          setRemote(asFields(latest.payload));
          setStatus('conflict');
        } else {
          synced.current = signature(current.current);
          conflict.current = false;
          setRemote(null);
          setStatus('saved');
        }
      } catch { if (sessionValid(generation)) setStatus('offline'); }
      finally { if (sessionValid(generation)) clearing.current = false; }
    })();
  }, [clearSignal, scope, demoMode]);

  const useSaved = () => {
    if (!remote) return;
    restore.current(remote);
    synced.current = signature(remote);
    conflict.current = false;
    setRemote(null);
    setStatus('saved');
  };
  const keepMine = () => {
    conflict.current = false;
    setRemote(null);
    setStatus('pending');
    void flush();
  };

  if (demoMode) return null;
  return <div className="nj-cloud-profile-draft" role="status" aria-live="polite">
    {status === 'conflict' ? <AlertTriangle size={16} /> : status === 'offline' ? <CloudOff size={16} /> : <Cloud size={16} />}
    <span>{status === 'saved' ? 'Form details saved privately to your Nightjar account.'
      : status === 'saving' ? 'Saving form details to your account…'
      : status === 'pending' ? 'Unsynced form details — keep this page open until saved.'
      : status === 'conflict' ? 'Another device changed this form. Choose which details to keep.'
      : status === 'offline' ? 'Details are NOT synced. Reconnect and retry before leaving.'
      : 'Checking your private working form…'}</span>
    {status === 'conflict' && <div className="nj-cloud-draft-choices">
      <button type="button" className="secondary-button" onClick={useSaved}>Use saved details</button>
      <button type="button" className="ghost-button" onClick={keepMine}>Keep my details</button>
    </div>}
    {status === 'offline' && <button type="button" className="ghost-button" onClick={() => void load()}>
      <RefreshCw size={14} /> Reconnect
    </button>}
    <small>Selected files cannot be recovered from cloud drafts. Re-select audio or artwork after refresh. Rights confirmations are required on every submission.</small>
  </div>;
}
