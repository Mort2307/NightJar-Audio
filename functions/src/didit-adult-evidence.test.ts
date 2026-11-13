import test from 'node:test';
import assert from 'node:assert/strict';
import { diditDocumentBirthDateReturned, verifiedAdultFromDecision } from './didit-adult-evidence.js';

const at = new Date('2026-11-13T12:00:00.000Z');
const decision = (id: Record<string, unknown> | null) => ({
  id_verifications: id ? [id] : [],
});
const documentEvidence = (overrides: Record<string, unknown> = {}) => ({
  status: 'Approved',
  verification_method: 'document',
  date_of_birth: '2008-11-13',
  ...overrides,
});

test('accepts an approved document DOB at exactly the 18th birthday', () => {
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence()), at), true);
  assert.equal(diditDocumentBirthDateReturned(decision(documentEvidence())), true);
});

test('accepts an approved document DOB older than 18', () => {
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ date_of_birth: '1990-02-28' })), at), true);
});

test('rejects a person who is one day short of 18', () => {
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ date_of_birth: '2008-11-14' })), at), false);
});

test('rejects ID lookup, wallet and missing verification methods', () => {
  for (const verification_method of ['id_lookup', 'wallet', undefined, null]) {
    assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ verification_method })), at), false);
    assert.equal(diditDocumentBirthDateReturned(decision(documentEvidence({ verification_method }))), false);
  }
});

test('rejects generic approval, decline and malformed calendar dates', () => {
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ status: 'In Review' })), at), false);
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ status: 'Declined' })), at), false);
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ date_of_birth: '2008-02-30' })), at), false);
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ date_of_birth: '2008-2-03' })), at), false);
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence({ date_of_birth: '2027-01-01' })), at), false);
});

test('fails closed for absent, malformed and invalid-time decisions', () => {
  assert.equal(verifiedAdultFromDecision(null, at), false);
  assert.equal(verifiedAdultFromDecision({ id_verifications: null }, at), false);
  assert.equal(verifiedAdultFromDecision({ id_verifications: [null, 'invalid'] }, at), false);
  assert.equal(verifiedAdultFromDecision(decision(documentEvidence()), new Date('invalid')), false);
});
