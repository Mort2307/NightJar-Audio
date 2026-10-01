import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type ArtistPortfolioItem = {
  id: string;
  ownerUserId: string;
  title: string;
  description: string;
  tags: string[];
  commissionType: string | null;
  status: string;
  imageUrl: string | null;
  imageStatus: string | null;
  pendingImageAssetId: string | null;
  pendingImageStatus: string | null;
  createdAt: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
};

const createCall = httpsCallable<{
  title: string;
  description?: string;
  tags?: string[];
  commissionType?: string;
}, { item: ArtistPortfolioItem }>(functions, 'createArtistPortfolioItem');

const listMineCall = httpsCallable<void, { items: ArtistPortfolioItem[] }>(functions, 'myArtistPortfolio');
const removeCall = httpsCallable<{ itemId: string }, { removed: boolean; itemId: string }>(functions, 'removeArtistPortfolioItem');

export const nightjarArtists = {
  async createItem(input: { title: string; description?: string; tags?: string[]; commissionType?: string }) {
    return (await createCall(input)).data;
  },
  async mine() {
    return (await listMineCall()).data;
  },
  async remove(itemId: string) {
    return (await removeCall({ itemId })).data;
  },
};
