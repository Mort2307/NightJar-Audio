import { firebaseAuth } from './firebase-auth';

export type PrivateCreateKind = 'creator-release' | 'artist-artwork' | 'editor-showcase';
const memory = new Map<string,string>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storageKey = (uid:string,kind:PrivateCreateKind) => 'nightjar.private-create.v1:'+uid+':'+kind;

// Operation IDs are random, account-bound request identifiers, not auth tokens.
// They contain no file contents, identity documents, profile data or URLs.
export function pendingPrivateCreateId(kind:PrivateCreateKind) {
  const uid=firebaseAuth.currentUser?.uid;
  if(!uid)throw new Error('Sign in to create a private Nightjar draft.');
  const key=storageKey(uid,kind);
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
export function clearPrivateCreateId(kind:PrivateCreateKind,id:string) {
  const uid=firebaseAuth.currentUser?.uid;
  if(!uid)return;
  const key=storageKey(uid,kind);
  if(memory.get(key)===id)memory.delete(key);
  try {if(window.localStorage.getItem(key)===id)window.localStorage.removeItem(key);}catch{}
}
