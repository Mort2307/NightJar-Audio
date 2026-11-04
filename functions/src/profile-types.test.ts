import assert from 'node:assert/strict';
import test from 'node:test';
import { isNightjarProfileType, normaliseProfileTypeRecord, normaliseProfileTypeSettings } from './profile-types';

test('profile type allowlist accepts only the five supported profile types', () => {
  assert.equal(isNightjarProfileType('listener'), true);
  assert.equal(isNightjarProfileType('creator'), true);
  assert.equal(isNightjarProfileType('writer'), true);
  assert.equal(isNightjarProfileType('editor'), true);
  assert.equal(isNightjarProfileType('artist'), true);
  assert.equal(isNightjarProfileType('admin'), false);
  assert.equal(isNightjarProfileType('moderator'), false);
});

test('profile settings default to disabled and private', () => {
  assert.deepEqual(normaliseProfileTypeRecord('writer', {}), {
    type: 'writer', enabled: false, visibility: 'private', schemaVersion: 1,
  });
});

test('profile settings accept only supported visibility values', () => {
  assert.equal(normaliseProfileTypeRecord('artist', { enabled: true, visibility: 'public' }).visibility, 'public');
  assert.equal(normaliseProfileTypeRecord('artist', { enabled: true, visibility: 'unlisted' }).visibility, 'unlisted');
  assert.equal(normaliseProfileTypeRecord('artist', { enabled: true, visibility: 'everyone' as never }).visibility, 'private');
});

test('settings normalisation ignores unknown roles and malformed entries', () => {
  const settings = normaliseProfileTypeSettings({
    writer: { enabled: true, visibility: 'public' },
    admin: { enabled: true, visibility: 'public' },
    artist: 'not-an-object',
  });
  assert.deepEqual(Object.keys(settings), ['writer']);
  assert.equal(settings.writer?.enabled, true);
});
