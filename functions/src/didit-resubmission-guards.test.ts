import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { selectDocumentResubmission, canRequestNewReview } from './didit-resubmission-guards.js';

const base={status:'Declined',id_verifications:[{
  node_id:'feature_ocr_1',verification_method:'document',status:'Declined',
}]};
test('only a single failed documentary OCR node may be resubmitted',()=>{
  assert.deepEqual(selectDocumentResubmission(base,false),{allowed:true,nodeId:'feature_ocr_1'});
  for(const status of ['Not Started','In Progress','Resubmitted','Expired'])
    assert.equal(selectDocumentResubmission({...base,status},false).allowed,false);
  assert.equal(selectDocumentResubmission({...base,status:'Approved'},true).allowed,false);
});
test('missing DOB on an Approved ID requires configuration review, not another charge',()=>{
  assert.deepEqual(selectDocumentResubmission({
    status:'Approved',id_verifications:[{node_id:'feature_ocr_1',status:'Approved'}],
  },false),{allowed:false,reason:'approved_id_without_adult_evidence'});
});
test('ambiguous, missing, non-document and unattempted ID checks fail closed',()=>{
  for(const ids of [[],[base.id_verifications[0],base.id_verifications[0]],
    [{node_id:'https://evil.example',status:'Declined'}],
    [{node_id:'feature_ocr_1',verification_method:'wallet',status:'Declined'}],
    [{node_id:'feature_ocr_1',status:'Not Started'}]]) {
    assert.equal(selectDocumentResubmission({...base,id_verifications:ids},false).allowed,false);
  }
});
test('member requests are bounded, serialized, and have a cooldown',()=>{
  const initial={accountStatus:'PENDING_REVIEW',providerRequests:0,memberRequests:0,
    requestStatus:'none',lastProviderRequestMs:0,now:1000000000};
  assert.equal(canRequestNewReview(initial),true);
  for(const change of [
    {accountStatus:'COMPLETE'}, {accountStatus:'PENDING'}, {providerRequests:2}, {memberRequests:3},
    {requestStatus:'processing'},{requestStatus:'requested'},
    {requestStatus:'needs_manual_review'},
    {requestStatus:'ready',lastProviderRequestMs:initial.now-100},
  ]) assert.equal(canRequestNewReview({...initial,...change}),false);
  assert.equal(canRequestNewReview({...initial,requestStatus:'ready',lastProviderRequestMs:initial.now-90000000}),true);
});
