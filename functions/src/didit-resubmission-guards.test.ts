import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { selectDocumentResubmission, canRequestNewReview, describeDiditDocumentIssue } from './didit-resubmission-guards.js';

const base={status:'Declined',id_verifications:[{
  node_id:'feature_ocr_1',verification_method:'document',status:'Declined',
}]};
test('only a single failed documentary OCR node may be resubmitted',()=>{
  assert.deepEqual(selectDocumentResubmission(base,false),{allowed:true,nodeId:'feature_ocr_1'});
  for(const status of ['Not Started','In Progress','Resubmitted','Expired'])
    assert.equal(selectDocumentResubmission({...base,status},false).allowed,false);
  assert.equal(selectDocumentResubmission({...base,status:'Approved'},true).allowed,false);
});
test('overall Approved with a Declined documentary ID step is eligible for same-session OCR resubmission',()=>{
  const decision={status:'Approved',id_verifications:[{
    node_id:'feature_ocr_1',verification_method:'document',status:'Declined',
  }]};
  assert.deepEqual(selectDocumentResubmission(decision,false),{allowed:true,nodeId:'feature_ocr_1'});
  assert.equal(selectDocumentResubmission(decision,true).allowed,false);
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

test('known image warnings produce clear, safe member instructions',()=>{
  const cases=[
    ['IMAGE_TOO_BLURRY','image_blurry','focus'],
    ['IMAGE_TOO_DARK','image_dark','natural daylight'],
    ['IMAGE_TOO_BRIGHT','image_bright','glare'],
    ['DOCUMENT_EXPIRED','document_expired','unexpired'],
    ['MRZ_VALIDATION_FAILED','mrz_invalid','MRZ'],
    ['NFC_DATA_DOES_NOT_MATCH_OCR','nfc_mismatch','chip'],
  ] as const;
  for(const [warning,code,word] of cases){
    const result=describeDiditDocumentIssue({id_verifications:[{
      status:'Declined',warnings:[{code:warning,message:'PRIVATE PROVIDER TEXT'}],
    }]},false);
    assert.equal(result.code,code);
    assert.match(result.action,new RegExp(word,'i'));
    assert.equal(JSON.stringify(result).includes('PRIVATE PROVIDER TEXT'),false);
  }
});
test('approved ID without age evidence is not presented as a photo problem',()=>{
  const result=describeDiditDocumentIssue({id_verifications:[{status:'Approved'}]},false);
  assert.equal(result.code,'adult_evidence_missing');
  assert.equal(result.canRetake,false);
  assert.match(result.action,/Do not retake/);
});
test('other-check and unknown provider reasons do not invent a document failure',()=>{
  const result=describeDiditDocumentIssue({id_verifications:[],status:'Declined'},false);
  assert.equal(result.code,'other_check');
  assert.equal(result.canRetake,false);
});

test('overall approval without any ID verification step requires NightJar configuration review',()=>{
  const result=describeDiditDocumentIssue({status:'Approved',id_verifications:[]},false);
  assert.equal(result.code,'adult_evidence_missing');
  assert.equal(result.canRetake,false);
  assert.match(result.action,/Do not upload your ID again/);
});
test('warning codes supplied as strings are safely mapped',()=>{
  const result=describeDiditDocumentIssue({
    id_verifications:[{status:'Declined',warnings:['IMAGE_TOO_BLURRY']}],
  },false);
  assert.equal(result.code,'image_blurry');
});

test('unreadable document warning explains the possible missing side or unsupported subtype',()=>{
  const result=describeDiditDocumentIssue({
    id_verifications:[{status:'Declined',warnings:[{code:'COULD_NOT_RECOGNIZE_DOCUMENT'}]}],
  },false);
  assert.equal(result.canRetake,true);
  assert.match(result.title,/could not read/i);
  assert.match(result.action,/required details|side that contains/i);
  assert.match(result.action,/document type is enabled/i);
});

test('unsupported document types are identified as workflow configuration, not poor photography',()=>{
  for(const warning of ['DOCUMENT_TYPE_NOT_SUPPORTED','DOCUMENT_NOT_SUPPORTED_FOR_APPLICATION']){
    const result=describeDiditDocumentIssue({
      id_verifications:[{status:'Declined',warnings:[{code:warning,message:'PRIVATE PROVIDER TEXT'}]}],
    },false);
    assert.equal(result.code,'document_unsupported');
    assert.match(result.title,/not enabled/i);
    assert.match(result.explanation,/workflow/i);
    assert.match(result.action,/do not keep retrying/i);
    assert.equal(JSON.stringify(result).includes('PRIVATE PROVIDER TEXT'),false);
  }
});
