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
