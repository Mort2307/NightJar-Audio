import assert from 'node:assert/strict';
import test from 'node:test';
import { isNightjarProfileType, normaliseProfileTypeRecord, normaliseProfileTypeSettings, resolveVisibleProfileTypes } from './profile-types';

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


test('legacy accounts retain existing approved public profile visibility', () => {
  const visible = resolveVisibleProfileTypes(['creator', 'writer'], {}, false);
  assert.deepEqual(visible, ['listener', 'creator', 'writer']);
});

test('unapproved professional profile types are never exposed', () => {
  const settings = normaliseProfileTypeSettings({
    creator: { enabled: true, visibility: 'public' },
    writer: { enabled: true, visibility: 'public' },
  });
  const visible = resolveVisibleProfileTypes(['writer'], settings, true);
  assert.deepEqual(visible, ['writer']);
});

test('private profiles are excluded, unlisted profiles are direct-link only', () => {
  const settings = normaliseProfileTypeSettings({
    listener: { enabled: true, visibility: 'private' },
    creator: { enabled: true, visibility: 'unlisted' },
    writer: { enabled: true, visibility: 'public' },
  });
  assert.deepEqual(resolveVisibleProfileTypes(['creator', 'writer'], settings, true), ['creator', 'writer']);
  assert.deepEqual(resolveVisibleProfileTypes(['creator', 'writer'], settings, true, { directory: true }), ['writer']);
});

test('owner preview can inspect hidden approved profiles but never unapproved roles', () => {
  const settings = normaliseProfileTypeSettings({
    creator: { enabled: false, visibility: 'private' },
    writer: { enabled: false, visibility: 'private' },
  });
  assert.deepEqual(resolveVisibleProfileTypes(['creator'], settings, true, { ownerPreview: true }), ['listener', 'creator']);
});
