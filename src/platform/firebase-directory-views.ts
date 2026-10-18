import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

export type DirectoryViewRole = 'all' | 'creator' | 'writer' | 'editor' | 'artist' | 'listener';
export type SavedDirectoryView = {
  id: string; name: string; query: string; role: DirectoryViewRole;
  tag: string; availability: string;
};
export type DirectoryViewsSnapshot = { revision: number; views: SavedDirectoryView[] };
export type SavedDirectoryViewsSnapshot = DirectoryViewsSnapshot & { saved: boolean };

const functions = getFunctions(firebaseApp, 'europe-west2');
const load = httpsCallable<void, DirectoryViewsSnapshot>(functions, 'getMyDirectoryViews');
const save = httpsCallable<{views: SavedDirectoryView[]; expectedRevision: number}, SavedDirectoryViewsSnapshot>(functions, 'saveMyDirectoryViews');

const roles = new Set<DirectoryViewRole>(['all', 'creator', 'writer', 'editor', 'artist', 'listener']);
// Older builds saved browser-only views. Strictly select known fields before
// migrating; never submit arbitrary JSON from browser storage to Firebase.
export const legacyDirectoryViews = (input: unknown): SavedDirectoryView[] => {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const result: SavedDirectoryView[] = [];
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = String(entry.id ?? '').slice(0, 80);
    const name = String(entry.name ?? '').slice(0, 160);
    const query = String(entry.query ?? '').slice(0, 120);
    const role = String(entry.role ?? 'all') as DirectoryViewRole;
    const tag = String(entry.tag ?? 'all').slice(0, 100);
    const availability = String(entry.availability ?? 'all').slice(0, 100);
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !name.trim() || !roles.has(role) || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, name, query, role, tag, availability });
    if (result.length >= 8) break;
  }
  return result;
};

export const nightjarDirectoryViews = {
  async get() { return (await load()).data; },
  async save(views: SavedDirectoryView[], expectedRevision: number) {
    return (await save({ views, expectedRevision })).data;
  },
};
