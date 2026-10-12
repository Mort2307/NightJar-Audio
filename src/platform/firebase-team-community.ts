import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';
import { repairMojibakeDisplayData } from './text-integrity';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type TeamTopic = 'news' | 'celebration' | 'you_said_we_did';
export type TeamPostStatus = 'draft' | 'published' | 'archived';
export type TeamPost = {
  id: string; topic: TeamTopic; title: string; body: string; creatorName: string;
  status: TeamPostStatus; publishedAt: string | null; updatedAt: string | null; revision: number;
};
export type TeamFeedback = {
  id: string; topic: string; message: string; status: 'new' | 'reviewed';
  createdAt: string | null; memberName: string;
};
export type TeamPostDraft = {
  id?: string; expectedRevision?: number; topic: TeamTopic;
  title: string; body: string; creatorName: string; status: TeamPostStatus;
};

const listCall = httpsCallable<void, { posts: TeamPost[]; feedback: TeamFeedback[] }>(functions,'listNightjarTeamUpdates');
const saveCall = httpsCallable<TeamPostDraft, {id:string;revision:number;status:TeamPostStatus}>(functions,'saveNightjarTeamUpdate');
const feedbackCall = httpsCallable<{topic:string;message:string},{received:boolean}>(functions,'submitNightjarTeamFeedback');
const reviewCall = httpsCallable<{id:string},{reviewed:boolean}>(functions,'reviewNightjarTeamFeedback');

export const nightjarTeamCommunity = {
  async list() { return repairMojibakeDisplayData((await listCall()).data); },
  async save(draft: TeamPostDraft) { return (await saveCall(draft)).data; },
  async sendFeedback(topic:string,message:string) { return (await feedbackCall({topic,message})).data; },
  async reviewFeedback(id:string) { return (await reviewCall({id})).data; },
};
