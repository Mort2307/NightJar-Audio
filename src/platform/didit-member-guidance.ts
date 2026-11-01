import type { DiditControlledStatus } from './firebase-didit-controlled';

/**
 * Member-safe Didit feedback. The only specific check failures we display are
 * sanitised, server-approved reason codes attached to the signed account result.
 * No raw provider warnings, identity fields, documents or risk signals here.
 */
export type DiditActionItem = {
  key: string;
  title: string;
  detail: string;
  certainty: 'confirmed' | 'action' | 'awaiting';
};

const providerGuidance: Record<string, {title:string;detail:string}> = {
  DOCUMENT_EXPIRED: {
    title: 'Your identity document is expired',
    detail: 'Didit flagged the expiry date. If a resubmission is offered in your existing session, use a current, accepted document.',
  },
  COULD_NOT_RECOGNIZE_DOCUMENT: {
    title: 'Didit could not read your document',
    detail: 'If Didit requests a new capture, use even lighting, keep all edges visible and avoid glare.',
  },
  DOCUMENT_TYPE_NOT_SUPPORTED: {
    title: 'Your document type is not accepted',
    detail: 'Check which documents the existing Didit workflow accepts. NightJar support can review regional document availability.',
  },
  NO_FACE_DETECTED: {
    title: 'A live face could not be detected',
    detail: 'If Didit offers a liveness retry, allow camera access and follow its on-screen positioning instructions.',
  },
  LOW_FACE_MATCH_SIMILARITY: {
    title: 'Didit could not confirm the face match',
    detail: 'NightJar support can review whether an authorised resubmission is needed. This is not a request to create a new paid check.',
  },
};

export function diditActionGuidance(
  status: DiditControlledStatus,
  options: {
    legalAccepted: boolean;
    legalAcknowledged: boolean;
    permission: boolean;
    hasLaunchUrl: boolean;
  },
): DiditActionItem[] {
  const items: DiditActionItem[] = [];
  if (status.providerVerified) {
    if (!options.legalAccepted) items.push({
      key:'notice', title:'Updated privacy notice needs acknowledgement',
      detail:'Read the current age-verification notice, tick its acknowledgement and save. Your approved ID check remains valid.',
      certainty:'action',
    });
    return items;
  }

  // An arbitrary provider string must never be shown as a diagnosis.
  const validatedCodes = Array.isArray(status.verificationIssues)
    ? status.verificationIssues.filter((code):code is string => typeof code === 'string')
    : [];
  for (const code of new Set(validatedCodes)) {
    const explanation=providerGuidance[code];
    if (!explanation) continue;
    items.push({key:'provider-'+code, ...explanation, certainty:'confirmed'});
  }
  if (status.authorised && !options.hasLaunchUrl) {
    if (!options.legalAccepted && !options.legalAcknowledged) items.push({
      key:'age-notice', title:'Age-verification privacy acknowledgement missing',
      detail:'Read the notice and tick the acknowledgement box before continuing.',
      certainty:'action',
    });
    if (!options.permission) items.push({
      key:'consent', title:'Permission to start the identity check not selected',
      detail:'Tick the one-time ID and facial/liveness consent box only when you are ready to start.',
      certainty:'action',
    });
    if (!items.length) items.push({
      key:'ready', title:'Ready for your chosen verification',
      detail:'You can start your existing permitted flow. Didit will request the identity document and camera steps it needs.',
      certainty:'action',
    });
    return items;
  }
  if (options.hasLaunchUrl) {
    items.push({
      key:'existing-session', title:'Your existing Didit check needs completing or reviewing',
      detail:'Open the existing secure Didit link. Only redo an ID photo or liveness check if Didit explicitly requests it. Return here to refresh your result.',
      certainty:'awaiting',
    });
  } else if (status.state === 'requires_review' || status.state === 'claimed') {
    items.push({
      key:'support-review', title:'Your existing verification needs NightJar support',
      detail:'A check has already been claimed, but no safe continuation link is available. Contact support; do not pay for another ID session.',
      certainty:'awaiting',
    });
  } else if (status.state === 'none') {
    items.push({
      key:'not-enabled', title:'Verification access needs checking',
      detail:'NightJar has not enabled a start route for this account. Contact support rather than attempting another paid check.',
      certainty:'awaiting',
    });
  } else {
    items.push({
      key:'awaiting', title:'Your Didit result is not confirmed yet',
      detail:'Refresh your NightJar status after completing Didit. If a check was declined or placed in review, NightJar support can inspect the provider reason.',
      certainty:'awaiting',
    });
  }
  return items;
}
