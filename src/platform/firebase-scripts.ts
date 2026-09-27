import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listWriterCall = httpsCallable<void, { scripts: any[] }>(functions, 'listWriterScripts');
const createWriterCall = httpsCallable<{ title: string; content?: string }, { script: any }>(functions, 'createWriterScript');
const updateWriterCall = httpsCallable<Record<string, unknown>, { script: any }>(functions, 'updateWriterScript');
const deleteWriterCall = httpsCallable<{ scriptId: string }, { deleted: boolean }>(functions, 'deleteWriterScript');
const versionCall = httpsCallable<{ scriptId: string }, { script: any; version: number }>(functions, 'createWriterScriptVersion');
const submitCall = httpsCallable<{ scriptId: string }, { script: any }>(functions, 'submitWriterScript');
const editorQueueCall = httpsCallable<void, { queue: any[] }>(functions, 'listEditorQueue');
const reviewCall = httpsCallable<{ scriptId: string; status: string; comment?: string }, { script: any }>(functions, 'reviewEditorScript');
const editorAccountsCall = httpsCallable<void, { editors: any[] }>(functions, 'listEditorAccounts');
const adminScriptsCall = httpsCallable<void, { scripts: any[] }>(functions, 'adminListScripts');
const assignEditorCall = httpsCallable<{ scriptId: string; editorUserId: string }, { script: any }>(functions, 'adminAssignEditor');
const protectedCatalogueCall = httpsCallable<void, { scripts: any[] }>(functions, 'listProtectedScripts');
const openProtectedCall = httpsCallable<{ scriptId: string }, any>(functions, 'openProtectedScript');
const permissionsCall = httpsCallable<{ scriptId: string }, { permissions: any[] }>(functions, 'listScriptPermissions');
const setPermissionCall = httpsCallable<Record<string, unknown>, any>(functions, 'setScriptPermission');

export const nightjarScripts = {
  async writerScripts() {
    return (await listWriterCall()).data;
  },

  async create(title: string, content = '') {
    return (await createWriterCall({ title, content })).data;
  },

  async update(scriptId: string, input: Record<string, unknown>) {
    return (await updateWriterCall({ ...input, scriptId })).data;
  },

  async remove(scriptId: string) {
    return (await deleteWriterCall({ scriptId })).data;
  },

  async createVersion(scriptId: string) {
    return (await versionCall({ scriptId })).data;
  },

  async submit(scriptId: string) {
    return (await submitCall({ scriptId })).data;
  },

  async editorQueue() {
    return (await editorQueueCall()).data;
  },

  async review(scriptId: string, status: string, comment = '') {
    return (await reviewCall({ scriptId, status, comment })).data;
  },

  async editorAccounts() {
    return (await editorAccountsCall()).data;
  },

  async adminScripts() {
    return (await adminScriptsCall()).data;
  },

  async assignEditor(scriptId: string, editorUserId: string) {
    return (await assignEditorCall({ scriptId, editorUserId })).data;
  },

  async protectedCatalogue() {
    return (await protectedCatalogueCall()).data;
  },

  async openProtected(scriptId: string) {
    return (await openProtectedCall({ scriptId })).data;
  },

  async permissions(scriptId: string) {
    return (await permissionsCall({ scriptId })).data;
  },

  async setPermission(scriptId: string, input: Record<string, unknown>) {
    return (await setPermissionCall({ ...input, scriptId })).data;
  },
};
