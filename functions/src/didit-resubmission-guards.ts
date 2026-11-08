/**
 * Pure, deterministic guards for one-step documentary ID resubmission.
 * No credentials, network access, DOB storage, or Firebase dependencies.
 */
export type DocumentResubmissionDecision =
  | { allowed:true; nodeId:string }
  | { allowed:false; reason:
      'provider_status'|'already_adult'|'missing_or_multiple_id_steps'|
      'unsupported_document_node'|'approved_id_without_adult_evidence'|'id_not_rejectable' };

const providerStates = new Set(['Approved','Declined','In Review','Kyc Expired','Abandoned']);

export function selectDocumentResubmission(
  decision:unknown, alreadyVerifiedAdult:boolean,
):DocumentResubmissionDecision {
  const value=decision && typeof decision === 'object' && !Array.isArray(decision)
    ? decision as Record<string,unknown> : {};
  if (!providerStates.has(String(value.status)))
    return {allowed:false,reason:'provider_status'};
  if (alreadyVerifiedAdult)
    return {allowed:false,reason:'already_adult'};
  const ids=Array.isArray(value.id_verifications) ? value.id_verifications : [];
  if(ids.length!==1) return {allowed:false,reason:'missing_or_multiple_id_steps'};
  const id=ids[0] && typeof ids[0]==='object' && !Array.isArray(ids[0])
    ? ids[0] as Record<string,unknown> : {};
  const node=id.node_id;
  if(typeof node !== 'string'||!/^feature_[a-zA-Z0-9_-]{2,100}$/.test(node) ||
    (id.verification_method && id.verification_method !== 'document'))
    return {allowed:false,reason:'unsupported_document_node'};
  // An Approved ID without DOB is likely a return-data/workflow issue.
  // Repeating it is costly and cannot reliably solve that misconfiguration.
  if(id.status==='Approved') return {allowed:false,reason:'approved_id_without_adult_evidence'};
  if(!['Declined','In Review','Not Finished','Expired'].includes(String(id.status)))
    return {allowed:false,reason:'id_not_rejectable'};
  return {allowed:true,nodeId:node};
}

export function canRequestNewReview(params:{
  accountStatus:string; providerRequests:number;memberRequests:number;
  requestStatus:string;lastProviderRequestMs:number;now:number;
}):boolean {
  const eligible=new Set(['PENDING_REVIEW','FAIL','ABANDONED','EXPIRED']);
  if (!eligible.has(params.accountStatus) || params.providerRequests>=2 ||
    params.memberRequests>=3 ||
    ['requested','processing','needs_manual_review'].includes(params.requestStatus))return false;
  return params.requestStatus!=='ready' ||
    params.lastProviderRequestMs+24*60*60*1000<=params.now;
}


export type DiditDocumentIssueCode =
  | 'image_blurry' | 'image_dark' | 'image_bright' | 'image_quality'
  | 'document_expired' | 'mrz_invalid' | 'nfc_mismatch'
  | 'adult_evidence_missing' | 'id_step_approved' | 'document_issue' | 'other_check';

export type DiditDocumentGuidance = {
  code:DiditDocumentIssueCode;
  title:string;
  explanation:string;
  action:string;
  canRetake:boolean;
};

const guidanceByWarning:Record<string,DiditDocumentGuidance> = {
  IMAGE_TOO_BLURRY:{code:'image_blurry',title:'The document photo was too blurry',
    explanation:'Didit could not read the document details clearly enough to rely on them.',
    action:'Clean the camera lens, hold the phone steady, let the camera focus, then take a fresh photo of the physical document.',canRetake:true},
  IMAGE_TOO_DARK:{code:'image_dark',title:'The document photo was too dark',
    explanation:'There was not enough even light for Didit to read the document reliably.',
    action:'Move into bright, even natural daylight. Avoid shadows across the document and do not cover any details.',canRetake:true},
  IMAGE_TOO_BRIGHT:{code:'image_bright',title:'The document photo was too bright or reflective',
    explanation:'Glare or overexposure obscured details Didit needs to inspect.',
    action:'Move out of direct sunlight, remove any plastic sleeve, change the angle slightly and retake in even light without glare.',canRetake:true},
  IMAGE_QUALITY_TOO_LOW:{code:'image_quality',title:'The document image did not meet the quality requirement',
    explanation:'The captured image was not clear enough for a reliable document check.',
    action:'Use the real document, fill the frame, keep all four corners visible and retake in even natural light.',canRetake:true},
  DOCUMENT_EXPIRED:{code:'document_expired',title:'The identity document has expired',
    explanation:'The expiry date on the document is in the past, so it cannot be used for this check.',
    action:'Use a current, unexpired physical identity document that NightJar’s verification flow accepts. Do not retry with the expired document.',canRetake:true},
  MRZ_VALIDATION_FAILED:{code:'mrz_invalid',title:'The machine-readable details could not be validated',
    explanation:'The printed machine-readable lines or their validation checks did not match what the document check expected.',
    action:'Retake the original document straight-on, with the full MRZ lines visible, sharp and free of glare. Do not cover or edit the lines.',canRetake:true},
  NFC_DATA_DOES_NOT_MATCH_OCR:{code:'nfc_mismatch',title:'The chip details did not match the printed document details',
    explanation:'The information read from the document chip differed from the visible printed details.',
    action:'Check that you are using your own original physical document and follow the phone’s chip-reading instructions. If the details genuinely differ, contact NightJar support rather than repeatedly retrying.',canRetake:false},
};

function warningCodes(value:unknown,depth=0):string[] {
  if(depth>5 || !value) return [];
  if(Array.isArray(value)) return value.flatMap(item=>warningCodes(item,depth+1)).slice(0,40);
  if(typeof value!=='object') return [];
  const item=value as Record<string,unknown>;
  const found:string[]=[];
  for(const key of ['code','warning_code','warningCode']) {
    if(typeof item[key]==='string') found.push(String(item[key]).trim().toUpperCase());
  }
  for(const key of ['warnings','warning_codes','warningCodes','codes']) {
    if(item[key]!==undefined) found.push(...warningCodes(item[key],depth+1));
  }
  return found.slice(0,40);
}

/** Returns only a whitelisted reason and safe user-facing instructions, never provider text or identity data. */
export function describeDiditDocumentIssue(
  decision:unknown, adultEvidenceConfirmed:boolean,
):DiditDocumentGuidance {
  const value=decision && typeof decision==='object' && !Array.isArray(decision)
    ? decision as Record<string,unknown> : {};
  const ids=Array.isArray(value.id_verifications) ? value.id_verifications : [];
  const id=ids.length===1 && ids[0] && typeof ids[0]==='object'
    ? ids[0] as Record<string,unknown> : {};
  for(const code of warningCodes(id)) {
    if(guidanceByWarning[code]) return guidanceByWarning[code];
  }
  if(value.status==='Approved' && !adultEvidenceConfirmed && ids.length===0) return {
    code:'adult_evidence_missing',title:'NightJar did not receive the required documentary 18+ evidence',
    explanation:'Didit returned an overall approval but no individual ID verification result that NightJar can use to confirm age. This is a provider/workflow result issue, not a problem with your photograph.',
    action:'Do not upload your ID again. NightJar needs to review the Didit workflow and result configuration first.',canRetake:false,
  };
  if(id.status==='Approved' && !adultEvidenceConfirmed) return {
    code:'adult_evidence_missing',title:'NightJar could not confirm the required 18+ evidence',
    explanation:'Didit approved the document step, but the result did not contain the documentary age evidence NightJar must receive. This is not a photo-quality problem.',
    action:'Do not retake or upload your ID again yet. NightJar needs to review the Didit workflow and result configuration first.',canRetake:false,
  };
  if(id.status==='Approved') return {
    code:'id_step_approved',title:'Your document step has passed',
    explanation:'The ID document itself is approved. The outstanding issue is in another part of the verification or its final result.',
    action:'Do not resubmit your document. NightJar must review the other check before asking you to do anything else.',canRetake:false,
  };
  if(ids.length===1) return {
    code:'document_issue',title:'The document check needs another look',
    explanation:'Didit did not approve the ID document step, but did not return a specific reason NightJar can safely explain.',
    action:'Use the document photo checklist below. If your document already meets every point, contact NightJar support so we can inspect the exact check rather than make you guess.',canRetake:true,
  };
  return {
    code:'other_check',title:'The outstanding issue is not confirmed as a document-photo problem',
    explanation:'NightJar cannot safely identify a document issue from the available result. Another verification check or a workflow setting may be responsible.',
    action:'Do not repeatedly upload your ID. NightJar support must review the individual Didit checks and explain the next step.',canRetake:false,
  };
}
