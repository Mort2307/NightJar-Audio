import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const css = fs.readFileSync('src/index.css', 'utf8');
const market = fs.readFileSync('src/components/ScriptMarketplace.tsx', 'utf8');

assert.match(app, /type TestingMode = 'off' \| 'demo' \| 'simulation' \| 'live'/, 'session supports a separate live role view');
assert.match(app, /mode === 'live' \? 'live'|parsed\?\.mode === 'live' \? 'live'/, 'live mode persists across refresh');
assert.match(app, /const liveRolePreview = role === 'admin' && Boolean\(previewRole\) && !simulationMode && !demoMode/, 'only signed-in admins can enter non-demo read-only preview');
assert.match(app, /const selectPreviewRole = \(next: PreviewRole\) => \{[\s\S]*?setDemoMode\(false\)/, 'role switching explicitly turns off fictional data');
assert.match(app, /LIVE ROLE VIEW · REAL DATA · READ ONLY/, 'admin toolbar cannot claim simulation');
assert.match(app, /View live Listener/, 'the owner can choose the actual Listener UI');
assert.match(app, /View live VA Creator/, 'the owner can choose the actual Creator UI');
assert.match(app, /const creatorOnly = effectiveRole === 'creator' && !liveRolePreview/, 'admin preview does not become an authorised Creator account');
assert.match(app, /!liveRolePreview && \['creator','writer','editor','artist'\]/, 'preview does not load private messaging UI');
assert.match(app, /if \(!user \|\| !ageVerified \|\| !professional \|\| !professionalActive \|\| liveRolePreview\)/, 'preview avoids private conversations endpoint');
assert.match(app, /nightjar-read-only-preview/, 'view interaction boundary is mounted');
assert.match(app, /onClickCapture=\{\(event\) => \{ if \(liveRolePreview/, 'clicks that could mutate data are blocked');
assert.match(app, /onKeyDownCapture=\{\(event\) => \{ if \(liveRolePreview/, 'keyboard mutation paths are blocked');
assert.match(app, /onSubmitCapture=\{\(event\) => \{ if \(liveRolePreview/, 'form submissions are blocked');
assert.match(app, /readOnlyPreview=\{canAdmin && !demoMode\}/, 'Script Marketplace uses read-only public listings');
assert.match(market, /if \(readOnlyPreview\)/, 'interest cannot be submitted from admin perspective');
assert.match(app, /<AdminLiveMarketplacePreview/, 'actual script-visibility audit remains available');
assert.match(css, /\.nightjar-live-role-banner/, 'obvious live status marker is styled');

console.log('Nightjar actual-data admin role view contracts passed (source-level only).');
