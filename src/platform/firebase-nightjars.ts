import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type NightjarPack = {
  count: number;
  pricePence: number;
};

export type NightjarGiftConfig = {
  unitCreatorValuePence: number;
  packs: NightjarPack[];
  eligibleRecipientRoles: string[];
  rules: {
    oneRecipientPerGift: boolean;
    listenerToCreatorTransferOnly: boolean;
    transferableBetweenListeners: boolean;
    redeemableByPurchaser: boolean;
    expires: boolean;
  };
};

export type NightjarWallet = {
  balance: number;
  purchased: number;
  gifted: number;
  refunded: number;
  creatorValueLiabilityPence: number;
};

export type NightjarEarnings = {
  pendingNightjars: number;
  pendingPence: number;
  clearedNightjars: number;
  clearedPence: number;
  lifetimeNightjars: number;
  lifetimePence: number;
};

const configCall = httpsCallable<void, NightjarGiftConfig>(functions, 'nightjarGiftConfig');
const walletCall = httpsCallable<void, NightjarWallet>(functions, 'myNightjarWallet');
const earningsCall = httpsCallable<void, NightjarEarnings>(functions, 'myNightjarEarnings');
const sendCall = httpsCallable<{
  recipientUserId: string;
  quantity: number;
  note?: string;
  anonymous?: boolean;
  idempotencyKey: string;
}, {
  giftId: string;
  quantity: number;
  recipientUserId: string;
  creatorCreditPence: number;
  balance: number;
  duplicate: boolean;
}>(functions, 'sendNightjars');
const adminGrantCall = httpsCallable<{
  targetUserId: string;
  quantity: number;
  reason?: string;
}, {
  targetUserId: string;
  quantity: number;
  ledgerId: string;
}>(functions, 'adminGrantNightjars');

export const nightjarGifts = {
  async config() {
    return (await configCall()).data;
  },
  async wallet() {
    return (await walletCall()).data;
  },
  async earnings() {
    return (await earningsCall()).data;
  },
  async send(recipientUserId: string, quantity: number, options: { note?: string; anonymous?: boolean; idempotencyKey?: string } = {}) {
    const idempotencyKey = options.idempotencyKey ?? (
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'gift-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    return (await sendCall({
      recipientUserId,
      quantity,
      note: options.note,
      anonymous: options.anonymous,
      idempotencyKey,
    })).data;
  },
  async adminGrant(targetUserId: string, quantity: number, reason?: string) {
    return (await adminGrantCall({ targetUserId, quantity, reason })).data;
  },
};
