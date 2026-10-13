import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type ListeningBoundaries = { excludedRatings: string[]; hiddenTerms: string[] };
export type MomentMark = {
  id: string; releaseId: string; label: string; positionSeconds: number;
  createdAt?: string | null; release: any;
};
export type ProductionItem = {
  id: string; role: 'creator' | 'writer' | 'editor' | 'artist';
  kind: string; title: string; status: string;
  createdAt?: string | null; updatedAt?: string | null;
};

const loadBoundaries = httpsCallable<void, { preferences: ListeningBoundaries }>(functions, 'getMyListeningBoundaries');
const saveBoundaries = httpsCallable<ListeningBoundaries, { preferences: ListeningBoundaries }>(functions, 'saveMyListeningBoundaries');
const loadMarks = httpsCallable<void, { marks: MomentMark[] }>(functions, 'listMomentMarks');
const saveMark = httpsCallable<{ releaseId: string; positionSeconds: number; label: string }, { saved: boolean; markId: string }>(functions, 'saveMomentMark');
const removeMark = httpsCallable<{ markId: string }, { deleted: boolean }>(functions, 'deleteMomentMark');
const setVoice = httpsCallable<{ releaseId: string | null }, { releaseId: string | null }>(functions, 'saveVoiceCallingCard');
const loadVoice = httpsCallable<{ creatorUserId: string }, { release: any | null; releaseId: string | null }>(functions, 'getVoiceCallingCard');
const loadTimeline = httpsCallable<void, { entries: ProductionItem[] }>(functions, 'myProductionTimeline');

export const nightjarExperience = {
  async boundaries() { return (await loadBoundaries()).data.preferences; },
  async saveBoundaries(value: ListeningBoundaries) { return (await saveBoundaries(value)).data.preferences; },
  async marks() { return (await loadMarks()).data.marks; },
  async saveMark(releaseId: string, positionSeconds: number, label: string) {
    return (await saveMark({ releaseId, positionSeconds, label })).data;
  },
  async deleteMark(markId: string) { return (await removeMark({ markId })).data; },
  async saveVoiceCard(releaseId: string | null) { return (await setVoice({ releaseId })).data; },
  async voiceCard(creatorUserId: string) { return (await loadVoice({ creatorUserId })).data; },
  async timeline() { return (await loadTimeline()).data.entries; },
};
