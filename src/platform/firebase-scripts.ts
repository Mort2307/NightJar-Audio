import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';
import { repairMojibakeDisplayData } from './text-integrity';

const functions = getFunctions(firebaseApp, 'europe-west2');

const listWriterCall = httpsCallable<void, { scripts: any[] }>(functions, 'listWriterScripts');
const createWriterCall = httpsCallable<{ title: string; content?: string }, { script: any }>(functions, 'createWriterScript');
const uploadWriterScriptCall = httpsCallable<{
  title?: string;
  fileName: string;
  contentType?: string;
  dataUrl: string;
}, { script: any }>(functions, 'uploadWriterScriptFile');
const updateWriterCall = httpsCallable<Record<string, unknown>, { script: any }>(functions, 'updateWriterScript');
const deleteWriterCall = httpsCallable<{ scriptId: string }, { deleted: boolean }>(functions, 'deleteWriterScript');
const versionCall = httpsCallable<{ scriptId: string }, { script: any; version: number }>(functions, 'createWriterScriptVersion');
const submitCall = httpsCallable<{ scriptId: string }, { script: any }>(functions, 'submitWriterScript');
const editorQueueCall = httpsCallable<void, { queue: any[] }>(functions, 'listEditorQueue');
const reviewCall = httpsCallable<{ scriptId: string; status: string; comment?: string }, { script: any }>(functions, 'reviewEditorScript');
const editorAccountsCall = httpsCallable<void, { editors: any[] }>(functions, 'listEditorAccounts');
const adminScriptsCall = httpsCallable<void, { scripts: any[] }>(functions, 'adminListScripts');
const adminScriptPreviewCall = httpsCallable<{ scriptId: string }, { script: any; sourceFile: { fileName: string; url: string; expiresAt: string } | null; sourcePreview: {format:'text'|'pdf'|'unavailable'; text?:string; truncated?:boolean; message?:string} }>(functions, 'getAdminScriptReview');
const reviewThreadCall = httpsCallable<{ scriptId: string }, { entries: any[]; scriptId: string }>(functions, 'listManuscriptReviewThread');
const postReviewEntryCall = httpsCallable<{ scriptId: string; body: string; visibility: 'internal'|'writer' }, { entry: any }>(functions, 'postManuscriptReviewEntry');
const adminReviewScriptCall = httpsCallable<{ scriptId: string; decision: 'approved' | 'changes' | 'rejected'; note: string }, { script: any; marketplaceVisible: boolean }>(functions, 'adminReviewWriterScript');
const assignEditorCall = httpsCallable<{ scriptId: string; editorUserId: string }, { script: any }>(functions, 'adminAssignEditor');
const protectedCatalogueCall = httpsCallable<void, { scripts: any[] }>(functions, 'listProtectedScripts');
const openProtectedCall = httpsCallable<{ scriptId: string }, any>(functions, 'openProtectedScript');
const permissionsCall = httpsCallable<{ scriptId: string }, { permissions: any[] }>(functions, 'listScriptPermissions');
const setPermissionCall = httpsCallable<Record<string, unknown>, any>(functions, 'setScriptPermission');
const rightsCall = httpsCallable<Record<string, unknown>, { script: any }>(functions, 'updateScriptRightsAndListing');
const marketplaceCall = httpsCallable<void, { scripts: any[] }>(functions, 'listScriptMarketplace');

export const nightjarScripts = {
  async writerScripts() {
    return repairMojibakeDisplayData((await listWriterCall()).data);
  },

  async create(title: string, content = '') {
    return (await createWriterCall({ title, content })).data;
  },

  async upload(input: { title?: string; fileName: string; contentType?: string; dataUrl: string }) {
    return (await uploadWriterScriptCall(input)).data;
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
    return repairMojibakeDisplayData((await editorQueueCall()).data);
  },

  async review(scriptId: string, status: string, comment = '') {
    return (await reviewCall({ scriptId, status, comment })).data;
  },

  async editorAccounts() {
    return repairMojibakeDisplayData((await editorAccountsCall()).data);
  },

  async adminScripts() {
    return repairMojibakeDisplayData((await adminScriptsCall()).data);
  },

  async manuscriptReviewThread(scriptId: string) {
    return (await reviewThreadCall({ scriptId })).data;
  },

  async postManuscriptReviewEntry(scriptId: string, body: string, visibility: 'internal'|'writer') {
    return (await postReviewEntryCall({ scriptId, body, visibility })).data;
  },

  async adminScriptPreview(scriptId: string) {
    return repairMojibakeDisplayData((await adminScriptPreviewCall({ scriptId })).data);
  },

  async adminReviewScript(scriptId: string, decision: 'approved' | 'changes' | 'rejected', note = '') {
    return (await adminReviewScriptCall({ scriptId, decision, note })).data;
  },

  async assignEditor(scriptId: string, editorUserId: string) {
    return (await assignEditorCall({ scriptId, editorUserId })).data;
  },

  async protectedCatalogue() {
    return repairMojibakeDisplayData((await protectedCatalogueCall()).data);
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

  async updateRights(scriptId: string, rights: Record<string, unknown>, marketplace: Record<string, unknown>) {
    return (await rightsCall({ scriptId, rights, marketplace })).data;
  },

  async marketplace() {
    return repairMojibakeDisplayData((await marketplaceCall()).data);
  },
};
