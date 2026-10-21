import {getFunctions,httpsCallable} from 'firebase/functions';
import {firebaseApp} from './firebase-auth';
import type {ImageFraming} from './image-framing';

export type ApprovedWorkKind='release_artwork'|'script_artwork'|'artist_portfolio';
export type ApprovedWorkFraming=ImageFraming&{assetId:string};
const saveCall=httpsCallable<
  ApprovedWorkFraming&{kind:ApprovedWorkKind;targetId:string},
  {kind:ApprovedWorkKind;targetId:string;framing:ApprovedWorkFraming}
>(getFunctions(firebaseApp,'europe-west2'),'saveApprovedWorkFraming');

// Only this one authenticated callable updates focal metadata; other edits,
// legal assertions, image approval and Storage stay on their existing routes.
export const nightjarWorkFraming={
  async save(kind:ApprovedWorkKind,targetId:string,framing:ApprovedWorkFraming){
    return (await saveCall({...framing,kind,targetId})).data;
  },
};
