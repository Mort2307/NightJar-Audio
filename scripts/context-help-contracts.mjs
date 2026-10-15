import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(name, 'utf8');
const help = read('src/components/ContextHelp.tsx');
const style = read('src/components/context-help.css');
const glossary = read('src/components/HelpGlossary.tsx');
const settings = read('src/components/NightjarSettings.tsx');
const handshake = read('src/components/CollaborationHistoryButton.tsx');
const marketplace = read('src/components/ScriptMarketplace.tsx');
const offerActions = read('src/components/MarketplaceScriptActions.tsx');
const offers = read('src/components/ScriptLicenceWorkspace.tsx');
const writer = read('src/components/WriterRightsPanel.tsx');
const collaboration = read('src/components/CollaborationHub.tsx');
const admin = read('src/components/AdminManuscriptReview.tsx');
const creator = read('src/components/CreatorAudioPipeline.tsx');

for (const term of [
  'exclusive-licence', 'non-exclusive-licence', 'licence-choice', 'copyright', 'licence-term',
  'licence-price', 'licence-status', 'counteroffer', 'usage-rights',
  'marketplace-visibility', 'public-synopsis', 'protected-sample',
  'rights-confirmation', 'collaboration-count', 'collaboration-status',
  'protected-reader', 'admin-notes', 'writer-review', 'first-on-nightjar',
  'nightjar-original', 'transcript', 'verified-status',
]) assert.ok(help.includes("'"+term+"'"), 'Missing help topic: ' + term);

assert.match(help, /<Info size=\{14\} strokeWidth=\{1\.8\} aria-hidden="true"\/>/, 'Help marker is a small, theme-neutral information icon');
assert.match(style, /nj-context-help-trigger>svg\{display:block;width:14px;height:14px\}/, 'Visual help glyph stays discreet');
assert.match(help, /aria-expanded=\{open\}/);
assert.match(help, /aria-label=\{'What does '/);
assert.match(help, /event\.key === 'Escape'/);
assert.match(help, /document\.addEventListener\('pointerdown', onPointer\)/);
assert.match(help, /createPortal\(/, 'Popovers are not clipped by cards or scroll containers');
assert.match(style, /nj-context-help-panel\{position:fixed/);
assert.match(glossary, /Object\.keys\(NIGHTJAR_HELP\)/, 'Settings glossary includes every help topic');
assert.match(glossary, /Search explanations/);
assert.match(settings, /<HelpGlossary\/>/);

assert.match(handshake, /<span aria-hidden="true">🤝<\/span>/, 'Count uses the exact handshake emoji');
assert.match(handshake, /<span>\{count\}<\/span>/, 'Count remains visible');
assert.match(handshake, /topic="collaboration-count"/, 'Separate ℹ️ for the count');
assert.match(handshake, /setOpen\(true\)/, 'Verified public-work viewer remains clickable');

for (const [name, source] of [
  ['writer', writer], ['marketplace', marketplace], ['rights offers', offers],
  ['VA offer entry', offerActions], ['collaborations', collaboration], ['admin review', admin],
  ['creator releases', creator],
]) assert.match(source, /<ContextHelp topic=/, 'Missing contextual explanations in '+name);
assert.match(offers, /topic=\{o\.licenceType==='exclusive'\?'exclusive-licence':'non-exclusive-licence'\}/);
assert.match(writer, /topic="licence-choice"/);
assert.match(offerActions, /topic="licence-status"/);
assert.match(creator, /topic="first-on-nightjar"/);
assert.match(admin, /topic="writer-review"/);
assert.match(help, /Neither choice transfers copyright by itself/);
assert.match(help, /No one may record, copy or publish on this basis alone/);
console.log('NightJar ℹ️ contextual explanations, searchable glossary and 🤝 count contracts PASS');
