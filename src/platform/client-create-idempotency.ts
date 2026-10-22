import { firebaseAuth } from './firebase-auth';

export type PrivateCreateKind = 'creator-release' | 'artist-artwork' | 'editor-showcase' | 'writer-draft' | 'writer-upload';
const memory = new Map<string,string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storageKey = (uid:string,kind:PrivateCreateKind,fingerprint='') => 'nightjar.private-create.v1:'+uid+':'+kind+(fingerprint?':'+fingerprint:'');

// Operation IDs are random, account-bound request identifiers, not auth tokens.
// They contain no file contents, identity documents, profile data or URLs.
export function pendingPrivateCreateId(kind:PrivateCreateKind,fingerprint='') {
  const uid=firebaseAuth.currentUser?.uid;
  if(!uid)throw new Error('Sign in to create a private Nightjar draft.');
  if(fingerprint && !/^[0-9a-f]{64}$/i.test(fingerprint))throw new Error('Invalid private upload receipt.');
  const key=storageKey(uid,kind,fingerprint);
  let id=memory.get(key);
  if(!id) {
    try { const candidate=window.localStorage.getItem(key);if(candidate && UUID.test(candidate))id=candidate; }
    catch { /* private storage unavailable; keep same-page id */ }
  }
  if(!id)id=crypto.randomUUID();
  memory.set(key,id);
  try {window.localStorage.setItem(key,id);}catch{ /* memory fallback */ }
  return id;
}
export function clearPrivateCreateId(kind:PrivateCreateKind,id:string,fingerprint='') {
  const uid=firebaseAuth.currentUser?.uid;
  if(!uid)return;
  const key=storageKey(uid,kind,fingerprint);
  if(memory.get(key)===id)memory.delete(key);
  try {if(window.localStorage.getItem(key)===id)window.localStorage.removeItem(key);}catch{}
}
