import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

const libraryCall = httpsCallable<void, { history: any[]; continueListening: any[]; favourites: any[]; playlists: any[] }>(functions, 'listenerLibrary');
const dismissCall = httpsCallable<{ releaseId: string }, { releaseId: string; hidden: boolean }>(functions, 'dismissContinueListening');
const savePlaylistCall = httpsCallable<{ playlistId?: string; title: string; releaseIds: string[] }, { playlist: any }>(functions, 'savePlaylist');
const deletePlaylistCall = httpsCallable<{ playlistId: string }, { deleted: boolean; playlistId: string }>(functions, 'deletePlaylist');

export const nightjarLibrary = {
  async load() {
    return (await libraryCall()).data;
  },

  async dismissContinue(releaseId: string) {
    return (await dismissCall({ releaseId })).data;
  },

  async savePlaylist(title: string, releaseIds: string[], playlistId?: string) {
    return (await savePlaylistCall({ ...(playlistId ? { playlistId } : {}), title, releaseIds })).data;
  },

  async deletePlaylist(playlistId: string) {
    return (await deletePlaylistCall({ playlistId })).data;
  },
};
