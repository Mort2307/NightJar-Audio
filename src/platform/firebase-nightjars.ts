import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from './firebase-auth';

const functions = getFunctions(firebaseApp, 'europe-west2');

export type NightjarPack = {
  count: number;
  pricePence: number;
};

export type NightjarGiftConfig = {
  unitCreatorValuePence: number;
  checkoutConfigured: boolean;
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
  byRole: Record<string, { pendingNightjars?: number; pendingPence?: number; clearedNightjars?: number; clearedPence?: number; lifetimeNightjars?: number; lifetimePence?: number }>;
};


export type AdminNightjarPayoutOverview = {
  recipients: Array<{
    userId: string;
    displayName: string;
    roles: string[];
    pendingNightjars: number;
    pendingPence: number;
    clearedNightjars: number;
    clearedPence: number;
    lifetimeNightjars: number;
    lifetimePence: number;
    byRole: Record<string, { pendingNightjars?: number; pendingPence?: number; clearedNightjars?: number; clearedPence?: number; lifetimeNightjars?: number; lifetimePence?: number }>;
  }>;
  totals: {
    pendingNightjars: number;
    pendingPence: number;
    clearedNightjars: number;
    clearedPence: number;
    lifetimeNightjars: number;
    lifetimePence: number;
  };
};

export type NightjarGiftHistoryItem = {
  id: string;
  type: string;
  senderUserId: string | null;
  recipientUserId: string | null;
  recipientRole: string | null;
  recipientDisplayName: string | null;
  quantity: number;
  unitCreatorValuePence: number;
  creatorCreditPence: number;
  anonymous: boolean;
  note: string | null;
  status: string | null;
  clearsAtMs: number | null;
  createdAt: string | null;
  clearedAt: string | null;
};

const configCall = httpsCallable<void, NightjarGiftConfig>(functions, 'nightjarGiftConfig');
const walletCall = httpsCallable<void, NightjarWallet>(functions, 'myNightjarWallet');
const earningsCall = httpsCallable<void, NightjarEarnings>(functions, 'myNightjarEarnings');
const historyCall = httpsCallable<void, { sent: NightjarGiftHistoryItem[]; received: NightjarGiftHistoryItem[] }>(functions, 'myNightjarGiftHistory');
const sendCall = httpsCallable<{
  recipientUserId: string;
  recipientRole?: 'creator' | 'writer' | 'editor' | 'artist';
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
const adminPayoutOverviewCall = httpsCallable<void, AdminNightjarPayoutOverview>(functions, 'adminNightjarPayoutOverview');
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
  async history() {
    return (await historyCall()).data;
  },
  async send(recipientUserId: string, quantity: number, options: { recipientRole?: 'creator' | 'writer' | 'editor' | 'artist'; note?: string; anonymous?: boolean; idempotencyKey?: string } = {}) {
    const idempotencyKey = options.idempotencyKey ?? (
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'gift-' + Date.now() + '-' + Math.random().toString(36).slice(2)
    );
    return (await sendCall({
      recipientUserId,
      recipientRole: options.recipientRole,
      quantity,
      note: options.note,
      anonymous: options.anonymous,
      idempotencyKey,
    })).data;
  },
  async adminPayoutOverview() {
    return (await adminPayoutOverviewCall()).data;
  },
  async adminGrant(targetUserId: string, quantity: number, reason?: string) {
    return (await adminGrantCall({ targetUserId, quantity, reason })).data;
  },
};
