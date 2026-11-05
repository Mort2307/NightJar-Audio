import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const packageJson = JSON.parse(read('package.json'));
const acceptance = read('docs/nightjar-release-acceptance.md');
const scripts = packageJson.scripts ?? {};

// These are the fourteen NOT-RUN workstreams from the 16-row acceptance matrix.
// Didit (#2) and Notifications (#15) remain separately user-confirmed, but still
// require the complete recorded matrix; they are deliberately not counted here.
const workstreams = [
  { id: 1, label: 'Sign-in & recovery', contracts: ['auth-entry-ux-contracts.mjs', 'passkey-security-contracts.mjs', 'nested-route-recovery-contracts.mjs', 'refresh-route-contracts.mjs'] },
  { id: 3, label: 'Legal & consent', contracts: ['legal-didit-beta-contracts.mjs', 'creator-copyright-terms-contracts.mjs'] },
  { id: 4, label: 'Listener Home', contracts: ['spotlight-profile-layout-contracts.mjs', 'audit-discovery-navigation-contracts.mjs', 'home-script-scroll-contracts.mjs'] },
  { id: 5, label: 'Discovery/search', contracts: ['audit-discovery-navigation-contracts.mjs', 'professional-profile-share-contracts.mjs', 'profile-connections-contracts.mjs', 'directory-official-moon-contracts.mjs'] },
  { id: 6, label: 'Audio playback', contracts: ['listening-experience-contracts.mjs', 'unified-premium-player-contracts.mjs', 'player-media-session-eq-contracts.mjs', 'optional-release-transcript-backend-contracts.mjs', 'transcript-sync-contracts.mjs'] },
  { id: 7, label: 'Public profiles', contracts: ['directory-official-moon-contracts.mjs', 'admin-community-profile-contracts.mjs', 'profile-connections-contracts.mjs', 'professional-profile-share-contracts.mjs'] },
  { id: 8, label: 'VA Creator Studio', contracts: ['audio-upload-contracts.mjs', 'creator-release-autosave-contracts.mjs', 'studio-upload-recovery-contracts.mjs', 'media-finalize-concurrency-contracts.mjs'] },
  { id: 9, label: 'Writer Studio', contracts: ['manuscript-approval-workflow-contracts.mjs', 'writer-marketplace-moderation-contracts.mjs', 'admin-writer-review-message-contracts.mjs', 'writer-upload-idempotency-contracts.mjs'] },
  { id: 10, label: 'Editor Studio', contracts: ['audio-upload-contracts.mjs', 'editor-moderation-atomic-contracts.mjs', 'professional-profile-share-contracts.mjs', 'approved-work-framing-contracts.mjs'] },
  { id: 11, label: 'Artist Studio', contracts: ['admin-community-profile-contracts.mjs', 'approved-work-framing-contracts.mjs', 'profile-connections-contracts.mjs', 'professional-profile-share-contracts.mjs'] },
  { id: 12, label: 'Community & messaging', contracts: ['community-contracts.mjs', 'nightjar-team-community-contracts.mjs', 'admin-writer-review-message-contracts.mjs', 'notification-create-dedupe-contracts.mjs'] },
  { id: 13, label: 'Credited member flows', contracts: ['verified-credit-release-contracts.mjs', 'credit-workspace-ux-contracts.mjs', 'verified-credit-index-guard-tests.mjs'] },
  { id: 14, label: 'Admin credit moderation', contracts: ['verified-credit-release-contracts.mjs', 'credit-workspace-ux-contracts.mjs', 'verified-credit-index-guard-tests.mjs', 'admin-server-pagination-contracts.mjs'] },
  { id: 16, label: 'Responsive/accessibility', contracts: ['accessibility-contracts.mjs', 'vision-access-contracts.mjs', 'mobile-touch-layout-contracts.mjs', 'app-wide-human-first-contracts.mjs'] },
];

// Resolve the npm validation graph rather than assuming every script is called
// directly by "validate". This prevents new workstream contracts becoming orphaned.
const reachable = new Set();
const pending = ['validate'];
while (pending.length) {
  const name = pending.pop();
  if (reachable.has(name)) continue;
  reachable.add(name);
  const command = scripts[name];
  assert.ok(command, 'Missing npm validation script: ' + name);
  for (const match of command.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
    if (!reachable.has(match[1])) pending.push(match[1]);
  }
}
const validationCommands = [...reachable].map((name) => scripts[name] ?? '').join('\n');

for (const item of workstreams) {
  const rowPrefix = '| ' + item.id + ' | ' + item.label + ' |';
  assert.ok(acceptance.split('\n').some((line) => line.startsWith(rowPrefix)),
    'Acceptance matrix row missing or renamed: #' + item.id + ' ' + item.label);
  for (const contract of item.contracts) {
    const path = 'scripts/' + contract;
    assert.ok(fs.existsSync(path), 'Mapped contract file is missing: ' + path);
    assert.ok(validationCommands.includes('node ' + path),
      'Mapped contract is not reachable from npm run validate: ' + path);
  }
}

assert.ok(acceptance.includes('| 2 | Mandatory Didit |'),
  'Didit remains a separately tracked acceptance workstream');
assert.ok(acceptance.includes('| 15 | Notifications |'),
  'Notifications remain a separately tracked acceptance workstream');
assert.match(acceptance, /does \*\*not\*\* verify real identity providers[\s\S]*?push delivery to actual devices/,
  'Acceptance instructions must distinguish automated contracts from real provider/device evidence');
assert.match(acceptance, /never put personal identities, ID documents or live access tokens/,
  'Acceptance records must not contain member PII or credentials');

console.log('NightJar 14-workstream coverage map and validation wiring PASS.');
