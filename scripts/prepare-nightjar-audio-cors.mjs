import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Preserve every existing CORS rule. Bucket CORS affects other Firebase
// Storage workflows as well as audio; never overwrite upload policies.
const [source, destination] = process.argv.slice(2);
if (!source || !destination) throw new Error('Usage: node prepare-nightjar-audio-cors.mjs <bucket-json> <output-json>');
const bucket = JSON.parse(readFileSync(source, 'utf8'));
assert.equal(bucket.name, 'nightjar-audio.firebasestorage.app', 'Refusing to change any other storage bucket.');
const original = bucket.cors ?? [];
assert.ok(Array.isArray(original), 'Unexpected existing CORS rules');
const origins = ['https://nightjar-audio.web.app', 'https://nightjar-audio.firebaseapp.com'];
const desired = {
  origin: origins,
  method: ['GET', 'HEAD'],
  responseHeader: ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges'],
  maxAgeSeconds: 3600,
};
const overlapping = (rule) => Array.isArray(rule.origin) && origins.every((origin) => rule.origin.includes(origin))
  && Array.isArray(rule.method) && rule.method.includes('GET')
  && Array.isArray(rule.responseHeader) && desired.responseHeader.every((header) => rule.responseHeader.includes(header));
const merged = original.some(overlapping) ? original : [...original, desired];
assert.ok(merged.length <= 100, 'Cloud Storage CORS rule limit reached; abort for manual review.');
for (const rule of original) {
  assert.ok(merged.includes(rule), 'Existing CORS policy must not be discarded.');
}
writeFileSync(destination, JSON.stringify(merged, null, 2) + '\n', { mode: 0o600 });
console.log('Nightjar audio EQ CORS prepared. Existing rules preserved: ' + original.length + ', resulting rules: ' + merged.length + '.');
console.log('Approved origins: ' + origins.join(', '));
