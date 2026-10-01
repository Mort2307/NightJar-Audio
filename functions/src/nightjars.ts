import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

const db = getFirestore();
const REGION = 'europe-west2';
const ELIGIBLE_RECIPIENT_ROLES = new Set(['creator', 'writer', 'editor', 'artist']);
const professionalRolesFor = (data: Record<string, any>) => {
  const approved = Array.isArray(data.approvedProfessionalRoles) ? data.approvedProfessionalRoles.map((value: unknown) => cleanText(value, 30)) : [];
  const legacy = cleanText(data.role, 30);
  if (ELIGIBLE_RECIPIENT_ROLES.has(legacy) && String(data.status ?? 'active') === 'active') approved.push(legacy);
  return Array.from(new Set(approved.filter((role) => ELIGIBLE_RECIPIENT_ROLES.has(role))));
};
const NIGHTJAR_VALUE_PENCE = 100;

export const NIGHTJAR_PACKS = [
  { count: 1, pricePence: 169 },
  { count: 5, pricePence: 749 },
  { count: 10, pricePence: 1449 },
  { count: 15, pricePence: 2149 },
  { count: 20, pricePence: 2799 },
] as const;

const cleanText = (value: unknown, max = 160) => String(value ?? '').trim().slice(0, max);

const requireIdentity = async (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to Nightjar first.');
  const uid = request.auth.uid;
  const account = await db.collection('accounts').doc(uid).get();
  if (!account.exists) throw new HttpsError('failed-precondition', 'Nightjar account not found.');
  const data = account.data() ?? {};
  if (data.status === 'suspended') throw new HttpsError('permission-denied', 'This Nightjar account is suspended.');
  const age = await db.collection('ageAssurance').doc(uid).get();
  if (age.data()?.verified !== true && data.testAccess !== true && data.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Age assurance is required before using Nightjar gifts.');
  }
  return { uid, account: data };
};

const requireAdmin = async (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  const identity = await requireIdentity(request);
  if (identity.account.role !== 'admin') throw new HttpsError('permission-denied', 'Administrator access required.');
  return identity;
};

const walletRef = (uid: string) => db.collection('nightjarWallets').doc(uid);
const earningsRef = (uid: string) => db.collection('nightjarCreatorEarnings').doc(uid);
const giftLedger = () => db.collection('nightjarGiftLedger');

export const nightjarGiftConfig = onCall({ region: REGION }, async () => ({
  unitCreatorValuePence: NIGHTJAR_VALUE_PENCE,
  packs: NIGHTJAR_PACKS.map((pack) => ({ ...pack })),
  eligibleRecipientRoles: [...ELIGIBLE_RECIPIENT_ROLES],
  rules: {
    oneRecipientPerGift: true,
    listenerToCreatorTransferOnly: true,
    transferableBetweenListeners: false,
    redeemableByPurchaser: false,
    expires: false,
  },
}));

export const myNightjarWallet = onCall({ region: REGION }, async (request) => {
  const identity = await requireIdentity(request);
  const snapshot = await walletRef(identity.uid).get();
  const data = snapshot.data() ?? {};
  return {
    balance: Number(data.balance ?? 0),
    purchased: Number(data.purchased ?? 0),
    gifted: Number(data.gifted ?? 0),
    refunded: Number(data.refunded ?? 0),
    creatorValueLiabilityPence: Number(data.balance ?? 0) * NIGHTJAR_VALUE_PENCE,
  };
});

export const sendNightjars = onCall({ region: REGION }, async (request) => {
  const sender = await requireIdentity(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const recipientUserId = cleanText(input.recipientUserId);
  const requestedRecipientRole = cleanText(input.recipientRole, 30);
  const quantity = Number(input.quantity);
  const note = cleanText(input.note, 280);
  const anonymous = input.anonymous === true;
  const idempotencyKey = cleanText(input.idempotencyKey, 120);

  if (!recipientUserId || recipientUserId === sender.uid) {
    throw new HttpsError('invalid-argument', 'Choose another Nightjar creator to support.');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new HttpsError('invalid-argument', 'Gift quantity must be a whole number from 1 to 100.');
  }
  if (!idempotencyKey) throw new HttpsError('invalid-argument', 'A gift idempotency key is required.');

  const recipientAccountRef = db.collection('accounts').doc(recipientUserId);
  const recipientProfileRef = db.collection('profiles').doc(recipientUserId);
  const ledgerRef = giftLedger().doc(idempotencyKey);

  const result = await db.runTransaction(async (tx) => {
    const [senderWallet, recipientAccount, recipientProfile, existingGift, recipientEarnings] = await Promise.all([
      tx.get(walletRef(sender.uid)),
      tx.get(recipientAccountRef),
      tx.get(recipientProfileRef),
      tx.get(ledgerRef),
      tx.get(earningsRef(recipientUserId)),
    ]);

    if (existingGift.exists) {
      const existing = existingGift.data() ?? {};
      if (existing.senderUserId !== sender.uid) throw new HttpsError('permission-denied', 'Gift key already used.');
      return {
        giftId: ledgerRef.id,
        quantity: Number(existing.quantity ?? 0),
        recipientUserId,
        creatorCreditPence: Number(existing.creatorCreditPence ?? 0),
        balance: Number(senderWallet.data()?.balance ?? 0),
        duplicate: true,
      };
    }

    const recipient = recipientAccount.data() ?? {};
    const recipientRoles = professionalRolesFor(recipient);
    const recipientRole = requestedRecipientRole && recipientRoles.includes(requestedRecipientRole)
      ? requestedRecipientRole
      : recipientRoles[0] ?? '';
    if (!recipientAccount.exists || recipient.status === 'suspended' || !recipientRole) {
      throw new HttpsError('failed-precondition', 'This profile is not currently eligible to receive Nightjars.');
    }

    const wallet = senderWallet.data() ?? {};
    const balance = Number(wallet.balance ?? 0);
    if (!Number.isFinite(balance) || balance < quantity) {
      throw new HttpsError('failed-precondition', 'You do not have enough Nightjars in your wallet.');
    }

    const creatorCreditPence = quantity * NIGHTJAR_VALUE_PENCE;
    const nextBalance = balance - quantity;
    tx.set(walletRef(sender.uid), {
      balance: nextBalance,
      gifted: Number(wallet.gifted ?? 0) + quantity,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const currentEarnings = recipientEarnings.data() ?? {};
    tx.set(earningsRef(recipientUserId), {
      recipientUserId,
      recipientRole,
      pendingNightjars: Number(currentEarnings.pendingNightjars ?? 0) + quantity,
      pendingPence: Number(currentEarnings.pendingPence ?? 0) + creatorCreditPence,
      lifetimeNightjars: Number(currentEarnings.lifetimeNightjars ?? 0) + quantity,
      lifetimePence: Number(currentEarnings.lifetimePence ?? 0) + creatorCreditPence,
      updatedAt: FieldValue.serverTimestamp(),
      ...(recipientEarnings.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });

    tx.create(ledgerRef, {
      type: 'gift',
      senderUserId: sender.uid,
      recipientUserId,
      recipientRole,
      recipientDisplayName: cleanText(recipientProfile.data()?.displayName, 120) || null,
      quantity,
      unitCreatorValuePence: NIGHTJAR_VALUE_PENCE,
      creatorCreditPence,
      anonymous,
      note: note || null,
      status: 'pending_clearance',
      createdAt: FieldValue.serverTimestamp(),
    });

    return { giftId: ledgerRef.id, quantity, recipientUserId, creatorCreditPence, balance: nextBalance, duplicate: false };
  });

  return result;
});

export const myNightjarEarnings = onCall({ region: REGION }, async (request) => {
  const identity = await requireIdentity(request);
  if (!professionalRolesFor(identity.account).length) {
    throw new HttpsError('permission-denied', 'This Nightjar account does not have an approved professional role that can receive gifts.');
  }
  const snapshot = await earningsRef(identity.uid).get();
  const data = snapshot.data() ?? {};
  return {
    pendingNightjars: Number(data.pendingNightjars ?? 0),
    pendingPence: Number(data.pendingPence ?? 0),
    clearedNightjars: Number(data.clearedNightjars ?? 0),
    clearedPence: Number(data.clearedPence ?? 0),
    lifetimeNightjars: Number(data.lifetimeNightjars ?? 0),
    lifetimePence: Number(data.lifetimePence ?? 0),
  };
});

// Testing/admin bridge. Live purchases must credit wallets from a verified payment webhook, not from the client.
export const adminGrantNightjars = onCall({ region: REGION }, async (request) => {
  const admin = await requireAdmin(request);
  const input = (request.data ?? {}) as Record<string, unknown>;
  const targetUserId = cleanText(input.targetUserId);
  const quantity = Number(input.quantity);
  const reason = cleanText(input.reason, 280);
  if (!targetUserId || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new HttpsError('invalid-argument', 'Target user and a whole-number quantity are required.');
  }

  const targetWallet = walletRef(targetUserId);
  const ledgerRef = giftLedger().doc();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(targetWallet);
    const data = snapshot.data() ?? {};
    tx.set(targetWallet, {
      balance: Number(data.balance ?? 0) + quantity,
      purchased: Number(data.purchased ?? 0) + quantity,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    tx.create(ledgerRef, {
      type: 'admin_credit',
      targetUserId,
      quantity,
      creatorValueLiabilityPence: quantity * NIGHTJAR_VALUE_PENCE,
      reason: reason || 'Nightjar testing credit',
      adminUserId: admin.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { targetUserId, quantity, ledgerId: ledgerRef.id };
});
