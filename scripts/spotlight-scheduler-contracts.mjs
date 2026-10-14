import assert from 'node:assert/strict';
import fs from 'node:fs';

const backend = fs.readFileSync('functions/src/index.ts', 'utf8');
const release = fs.readFileSync('.github/workflows/firebase-hosting-merge.yml', 'utf8');

assert.equal(fs.existsSync('.github/workflows/spotlight-scheduler.yml'), false,
  'The old GitHub Action invokes a retired appdeploy.ai endpoint and gets 403; remove it.');
assert.match(backend, /export const spotlightState = onCall\(/,
  'The authenticated Discover page must retain its own on-demand spotlight fallback.');
assert.match(backend, /export const notifyDailySpotlights = onSchedule\(\{[\s\S]*?schedule: '0 9 \* \* \*', timeZone: 'Europe\/London'/,
  'Native Firebase daily dispatch must follow UK local time, including BST.');
assert.match(backend, /const materializeSpotlightNotification = async/);
assert.match(backend, /collection\('notifications'\)\.doc\('spotlight_' \+ date \+ '_' \+ kind\)/,
  'Use per-day deduplicated in-app spotlight notifications.');
assert.match(backend, /collection\('notificationDispatches'\)\.doc\('spotlight_' \+ date\)/,
  'Avoid duplicate device pushes for spotlight roles.');
assert.match(release, /\[nightjar-native-spotlight-schedule-release\]/);
assert.match(release, /inputs\[scope\]=functions:selected/);
assert.match(release, /inputs\[function_names\]=notifyDailySpotlights/);
assert.match(release, /gh run watch "\$BACKEND_RUN_ID"/);
assert.match(release, /test ! -f \.github\/workflows\/spotlight-scheduler\.yml/);
assert.equal((release.match(/\[nightjar-native-spotlight-schedule-release\]/g) ?? []).length, 1,
  'The deploy trigger is one-time opt-in, not a recurring deploy.');

console.log('NightJar native Spotlight schedule and retired-403-action contracts PASS');
