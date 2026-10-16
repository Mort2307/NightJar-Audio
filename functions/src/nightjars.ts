import { getFirestore, FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { diditPass } from './didit';

const db = () => getFirestore();
const REGION = 'europe-west2';
const TESTING_AGE_ASSURANCE_BYPASS = false; // Mandatory approved 18+ Didit access, including gifts.
const GIFT_CLEARANCE_DAYS = 7;
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
  const account = await db().collection('accounts').doc(uid).get();
  if (!account.exists) throw new HttpsError('failed-precondition', 'Nightjar account not found.');
  const data = account.data() ?? {};
  if (data.status === 'suspended') throw new HttpsError('permission-denied', 'This Nightjar account is suspended.');
  const age = await db().collection('ageAssurance').doc(uid).get();
  const temporaryTestAccess = TESTING_AGE_ASSURANCE_BYPASS && (data.testAccess === true || data.role === 'admin');
  if (!diditPass(age.data()) && !temporaryTestAccess) {
    throw new HttpsError('permission-denied', 'Age assurance is required before using Nightjar gifts.');
  }
  return { uid, account: data };
};

const requireAdmin = async (request: { auth?: { uid: string; token: Record<string, unknown> } | null }) => {
  const identity = await requireIdentity(request);
  if (identity.account.role !== 'admin') throw new HttpsError('permission-denied', 'Administrator access required.');
  return identity;
};

const walletRef = (uid: string) => db().collection('nightjarWallets').doc(uid);
const earningsRef = (uid: string) => db().collection('nightjarCreatorEarnings').doc(uid);
const giftLedger = () => db().collection('nightjarGiftLedger');

export const nightjarGiftConfig = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request); // Beta embargo: never reveal future gift-pack prices to members.
  return {
  unitCreatorValuePence: NIGHTJAR_VALUE_PENCE,
  checkoutConfigured: false,
  packs: NIGHTJAR_PACKS.map((pack) => ({ ...pack })),
  eligibleRecipientRoles: [...ELIGIBLE_RECIPIENT_ROLES],
  rules: {
    oneRecipientPerGift: true,
    listenerToCreatorTransferOnly: true,
    transferableBetweenListeners: false,
    redeemableByPurchaser: false,
    expires: false,
  },
  };
});

export const myNightjarWallet = onCall({ region: REGION }, async (request) => {
  const identity = await requireAdmin(request); // Beta embargo: administrator-only until payment launch.
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
  const sender = await requireAdmin(request); // Beta embargo: administrator-only until payment launch.
  const input = (request.data ?? {}) as Record<string, unknown>;
  const recipientUserId = cleanText(input.recipientUserId);
  const requestedRecipientRole = cleanText(input.recipientRole, 30);
  const quantity = Number(input.quantity);
  const note = cleanText(input.note, 280);
  const anonymous = input.anonymous === true;
  const idempotencyKey = cleanText(input.idempotencyKey, 120);

  if (!recipientUserId || recipientUserId === sender.uid) {
    throw new HttpsError('invalid-argument', 'Choose another Nightjar professional to support.');
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new HttpsError('invalid-argument', 'Gift quantity must be a whole number from 1 to 100.');
  }
  if (!idempotencyKey) throw new HttpsError('invalid-argument', 'A gift idempotency key is required.');

  const recipientAccountRef = db().collection('accounts').doc(recipientUserId);
  const recipientProfileRef = db().collection('profiles').doc(recipientUserId);
  const ledgerRef = giftLedger().doc(idempotencyKey);

  const result = await db().runTransaction(async (tx) => {
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
    if (!recipientAccount.exists || recipient.status === 'suspended' || !recipientRoles.length) {
      throw new HttpsError('failed-precondition', 'This profile is not currently eligible to receive Nightjars.');
    }
    if (requestedRecipientRole && !recipientRoles.includes(requestedRecipientRole)) {
      throw new HttpsError('failed-precondition', 'That professional role is not approved for this Nightjar recipient.');
    }
    if (!requestedRecipientRole && recipientRoles.length > 1) {
      throw new HttpsError('invalid-argument', 'Choose which professional role this Nightjar gift supports.');
    }
    const recipientRole = requestedRecipientRole || recipientRoles[0];

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
    const byRole = currentEarnings.byRole && typeof currentEarnings.byRole === 'object' ? { ...currentEarnings.byRole } : {};
    const roleEarnings = byRole[recipientRole] && typeof byRole[recipientRole] === 'object' ? { ...byRole[recipientRole] } : {};
    byRole[recipientRole] = {
      pendingNightjars: Number(roleEarnings.pendingNightjars ?? 0) + quantity,
      pendingPence: Number(roleEarnings.pendingPence ?? 0) + creatorCreditPence,
      clearedNightjars: Number(roleEarnings.clearedNightjars ?? 0),
      clearedPence: Number(roleEarnings.clearedPence ?? 0),
      lifetimeNightjars: Number(roleEarnings.lifetimeNightjars ?? 0) + quantity,
      lifetimePence: Number(roleEarnings.lifetimePence ?? 0) + creatorCreditPence,
    };
    tx.set(earningsRef(recipientUserId), {
      recipientUserId,
      pendingNightjars: Number(currentEarnings.pendingNightjars ?? 0) + quantity,
      pendingPence: Number(currentEarnings.pendingPence ?? 0) + creatorCreditPence,
      lifetimeNightjars: Number(currentEarnings.lifetimeNightjars ?? 0) + quantity,
      lifetimePence: Number(currentEarnings.lifetimePence ?? 0) + creatorCreditPence,
      byRole,
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
      clearsAtMs: Date.now() + GIFT_CLEARANCE_DAYS * 24 * 60 * 60 * 1000,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { giftId: ledgerRef.id, quantity, recipientUserId, creatorCreditPence, balance: nextBalance, duplicate: false };
  });

  if (!result.duplicate) {
    const senderProfile = await db().collection('profiles').doc(sender.uid).get();
    const senderName = anonymous
      ? 'An anonymous Nightjar listener'
      : cleanText(senderProfile.data()?.displayName, 80) || 'A Nightjar listener';
    await db().collection('accounts').doc(recipientUserId).collection('notifications').doc().set({
      type:'payment',
      subtype:'nightjar_gift',
      title: quantity === 1 ? 'You received a Nightjar' : `You received ${quantity} Nightjars`,
      message: `${senderName} sent support worth £${(result.creatorCreditPence / 100).toFixed(2)}. It has been added to your pending professional earnings.`,
      giftId:result.giftId,
      quantity,
      creatorCreditPence:result.creatorCreditPence,
      recipientRole:requestedRecipientRole || null,
      read:false,
      createdAt:FieldValue.serverTimestamp(),
    });
  }

  return result;
});

export const myNightjarEarnings = onCall({ region: REGION }, async (request) => {
  const identity = await requireAdmin(request); // Beta embargo: administrator-only until payment launch.
  const snapshot = await earningsRef(identity.uid).get();
  const data = snapshot.data() ?? {};
  return {
    pendingNightjars: Number(data.pendingNightjars ?? 0),
    pendingPence: Number(data.pendingPence ?? 0),
    clearedNightjars: Number(data.clearedNightjars ?? 0),
    clearedPence: Number(data.clearedPence ?? 0),
    lifetimeNightjars: Number(data.lifetimeNightjars ?? 0),
    lifetimePence: Number(data.lifetimePence ?? 0),
    byRole: data.byRole && typeof data.byRole === 'object' ? data.byRole : {},
  };
});

export const myNightjarGiftHistory = onCall({ region: REGION }, async (request) => {
  const identity = await requireAdmin(request); // Beta embargo: administrator-only until payment launch.
  const [sentSnapshot, receivedSnapshot] = await Promise.all([
    giftLedger().where('senderUserId', '==', identity.uid).limit(250).get(),
    giftLedger().where('recipientUserId', '==', identity.uid).limit(250).get(),
  ]);
  const present = (doc: QueryDocumentSnapshot) => {
    const data = doc.data() ?? {};
    return {
      id: doc.id,
      type: data.type ?? 'gift',
      senderUserId: data.senderUserId ?? null,
      recipientUserId: data.recipientUserId ?? null,
      recipientRole: data.recipientRole ?? null,
      recipientDisplayName: data.recipientDisplayName ?? null,
      quantity: Number(data.quantity ?? 0),
      unitCreatorValuePence: Number(data.unitCreatorValuePence ?? NIGHTJAR_VALUE_PENCE),
      creatorCreditPence: Number(data.creatorCreditPence ?? 0),
      anonymous: data.anonymous === true,
      note: data.note ?? null,
      status: data.status ?? null,
      clearsAtMs: Number(data.clearsAtMs ?? 0) || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      clearedAt: data.clearedAt?.toDate?.()?.toISOString?.() ?? null,
    };
  };
  const newestFirst = (a: ReturnType<typeof present>, b: ReturnType<typeof present>) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''));
  return {
    sent: sentSnapshot.docs.map(present).sort(newestFirst),
    received: receivedSnapshot.docs.map(present).sort(newestFirst),
  };
});

export const clearMatureNightjarGifts = onSchedule({
  region: REGION,
  schedule: 'every day 03:15',
  timeZone: 'Europe/London',
}, async () => {
  const snapshot = await giftLedger().where('status', '==', 'pending_clearance').limit(500).get();
  const mature = snapshot.docs.filter((doc) => Number(doc.data()?.clearsAtMs ?? 0) > 0 && Number(doc.data()?.clearsAtMs ?? 0) <= Date.now());

  for (const gift of mature) {
    await db().runTransaction(async (tx) => {
      const currentGift = await tx.get(gift.ref);
      const giftData = currentGift.data() ?? {};
      if (!currentGift.exists || giftData.status !== 'pending_clearance' || Number(giftData.clearsAtMs ?? 0) > Date.now()) return;

      const recipientUserId = cleanText(giftData.recipientUserId);
      const recipientRole = cleanText(giftData.recipientRole, 30);
      const quantity = Number(giftData.quantity ?? 0);
      const creatorCreditPence = Number(giftData.creatorCreditPence ?? quantity * NIGHTJAR_VALUE_PENCE);
      if (!recipientUserId || !recipientRole || quantity <= 0 || creatorCreditPence <= 0) {
        tx.set(gift.ref, { status:'clearance_error', updatedAt:FieldValue.serverTimestamp() }, { merge:true });
        return;
      }

      const earningsDocument = earningsRef(recipientUserId);
      const earningsSnapshot = await tx.get(earningsDocument);
      const earnings = earningsSnapshot.data() ?? {};
      const byRole = earnings.byRole && typeof earnings.byRole === 'object' ? { ...earnings.byRole } : {};
      const roleEarnings = byRole[recipientRole] && typeof byRole[recipientRole] === 'object' ? { ...byRole[recipientRole] } : {};

      byRole[recipientRole] = {
        ...roleEarnings,
        pendingNightjars: Math.max(0, Number(roleEarnings.pendingNightjars ?? 0) - quantity),
        pendingPence: Math.max(0, Number(roleEarnings.pendingPence ?? 0) - creatorCreditPence),
        clearedNightjars: Number(roleEarnings.clearedNightjars ?? 0) + quantity,
        clearedPence: Number(roleEarnings.clearedPence ?? 0) + creatorCreditPence,
      };

      tx.set(earningsDocument, {
        pendingNightjars: Math.max(0, Number(earnings.pendingNightjars ?? 0) - quantity),
        pendingPence: Math.max(0, Number(earnings.pendingPence ?? 0) - creatorCreditPence),
        clearedNightjars: Number(earnings.clearedNightjars ?? 0) + quantity,
        clearedPence: Number(earnings.clearedPence ?? 0) + creatorCreditPence,
        byRole,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge:true });
      tx.set(gift.ref, {
        status:'cleared',
        clearedAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
      }, { merge:true });
    });
  }
});

export const adminNightjarPayoutOverview = onCall({ region: REGION }, async (request) => {
  await requireAdmin(request);
  const [snapshot, walletSnapshot] = await Promise.all([
    db().collection('nightjarCreatorEarnings').limit(1000).get(),
    db().collection('nightjarWallets').limit(5000).get(),
  ]);
  const outstandingWalletNightjars = walletSnapshot.docs.reduce((total, doc) => {
    const balance = Number(doc.data()?.balance ?? 0);
    return total + (Number.isFinite(balance) && balance > 0 ? Math.floor(balance) : 0);
  }, 0);
  const recipients = await Promise.all(snapshot.docs.map(async (doc) => {
    const [profile, account] = await Promise.all([
      db().collection('profiles').doc(doc.id).get(),
      db().collection('accounts').doc(doc.id).get(),
    ]);
    const data = doc.data() ?? {};
    return {
      userId:doc.id,
      displayName:cleanText(profile.data()?.displayName, 80) || cleanText(account.data()?.email, 160) || 'Nightjar professional',
      roles:professionalRolesFor(account.data() ?? {}),
      pendingNightjars:Number(data.pendingNightjars ?? 0),
      pendingPence:Number(data.pendingPence ?? 0),
      clearedNightjars:Number(data.clearedNightjars ?? 0),
      clearedPence:Number(data.clearedPence ?? 0),
      lifetimeNightjars:Number(data.lifetimeNightjars ?? 0),
      lifetimePence:Number(data.lifetimePence ?? 0),
      byRole:data.byRole && typeof data.byRole === 'object' ? data.byRole : {},
    };
  }));
  recipients.sort((a,b)=>b.clearedPence-a.clearedPence || b.pendingPence-a.pendingPence);
  return {
    recipients,
    totals:{
      ...recipients.reduce((totals,item)=>({
        pendingNightjars:totals.pendingNightjars+item.pendingNightjars,
        pendingPence:totals.pendingPence+item.pendingPence,
        clearedNightjars:totals.clearedNightjars+item.clearedNightjars,
        clearedPence:totals.clearedPence+item.clearedPence,
        lifetimeNightjars:totals.lifetimeNightjars+item.lifetimeNightjars,
        lifetimePence:totals.lifetimePence+item.lifetimePence,
      }),{pendingNightjars:0,pendingPence:0,clearedNightjars:0,clearedPence:0,lifetimeNightjars:0,lifetimePence:0}),
      outstandingWalletNightjars,
      outstandingWalletLiabilityPence:outstandingWalletNightjars*NIGHTJAR_VALUE_PENCE,
    },
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
  await db().runTransaction(async (tx) => {
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
