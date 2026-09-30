import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const libraryCall = httpsCallable<void, { history: any[]; continueListening: any[]; favourites: any[]; playlists: any[] }>(functions, 'listenerLibrary');
const dismissCall = httpsCallable<{ releaseId: string }, { releaseId: string; hidden: boolean }>(functions, 'dismissContinueListening');
const hideHistoryCall = httpsCallable<{ releaseId: string }, { releaseId: string; hidden: boolean }>(functions, 'hideHistoryItem');
const clearHistoryCall = httpsCallable<void, { cleared: boolean }>(functions, 'clearListenerHistory');
const savePlaylistCall = httpsCallable<{ playlistId?: string; title: string; releaseIds: string[] }, { playlist: any }>(functions, 'savePlaylist');
const deletePlaylistCall = httpsCallable<{ playlistId: string }, { deleted: boolean; playlistId: string }>(functions, 'deletePlaylist');
const setPlaylistProfileVisibilityCall = httpsCallable<{ playlistId: string; visible: boolean }, { playlistId: string; visible: boolean; featuredPortfolioIds: string[] }>(functions, 'setPlaylistProfileVisibility');

export const nightjarLibrary = {
  async load() {
    return (await libraryCall()).data;
  },

  async dismissContinue(releaseId: string) {
    return (await dismissCall({ releaseId })).data;
  },

  async hideHistory(releaseId: string) {
    return (await hideHistoryCall({ releaseId })).data;
  },

  async clearHistory() {
    return (await clearHistoryCall()).data;
  },

  async savePlaylist(title: string, releaseIds: string[], playlistId?: string) {
    return (await savePlaylistCall({ ...(playlistId ? { playlistId } : {}), title, releaseIds })).data;
  },

  async setPlaylistProfileVisibility(playlistId: string, visible: boolean) {
    return (await setPlaylistProfileVisibilityCall({ playlistId, visible })).data;
  },

  async deletePlaylist(playlistId: string) {
    return (await deletePlaylistCall({ playlistId })).data;
  },
};
