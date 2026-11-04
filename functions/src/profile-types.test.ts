import assert from 'node:assert/strict';
import test from 'node:test';
import { isNightjarProfileType, normaliseProfileTypeRecord } from './profile-types';

test('profile type allowlist accepts only the five supported profile types', () => {
  assert.equal(isNightjarProfileType('listener'), true);
  assert.equal(isNightjarProfileType('creator'), true);
  assert.equal(isNightjarProfileType('writer'), true);
  assert.equal(isNightjarProfileType('editor'), true);
  assert.equal(isNightjarProfileType('artist'), true);
  assert.equal(isNightjarProfileType('admin'), false);
  assert.equal(isNightjarProfileType('moderator'), false);
});

test('profile metadata is bounded, deduplicated and private by default', () => {
  const result = normaliseProfileTypeRecord('writer', {
    enabled: true,
    headline: '  Writer  ',
    bio: '  Profile biography  ',
    specialties: [' Audio drama ', 'Audio drama', '', 'Copywriting'],
    portfolioItemIds: ['item-1', 'item-1', ''],
  });
  assert.equal(result.enabled, true);
  assert.equal(result.visibility, 'private');
  assert.equal(result.headline, 'Writer');
  assert.equal(result.bio, 'Profile biography');
  assert.deepEqual(result.specialties, ['Audio drama', 'Copywriting']);
  assert.deepEqual(result.portfolioItemIds, ['item-1']);
  assert.equal(result.schemaVersion, 1);
});

test('profile presentation metadata does not contain professional approval fields', () => {
  const result = normaliseProfileTypeRecord('creator', {
    enabled: true,
    visibility: 'public',
    // Unknown properties are ignored by the normaliser.
    approved: true,
    role: 'creator',
    compensationEligible: true,
  } as never);
  assert.equal('approved' in result, false);
  assert.equal('role' in result, false);
  assert.equal('compensationEligible' in result, false);
  assert.equal(result.visibility, 'public');
});

test('invalid visibility values fall back to private', () => {
  const result = normaliseProfileTypeRecord('artist', {
    enabled: true,
    visibility: 'everyone' as never,
  });
  assert.equal(result.visibility, 'private');
});
