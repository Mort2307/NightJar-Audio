import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const runPureModule = (file) => {
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length ?? 0, 0, file + ': TypeScript diagnostics');
  const module = { exports: {} };
  new Function('module', 'exports', result.outputText)(module, module.exports);
  return module.exports;
};

const { repairMojibakeText, repairMojibakeDisplayData, restoreTranscriptApostrophes } =
  runPureModule('src/platform/text-integrity.ts');
const { parseListingTags } = runPureModule('src/platform/listing-tags.ts');

for (const [input, expected] of [
  ['Â£3,000', '£3,000'],
  ['Â€10', '€10'],
  ['â‚¬10', '€10'],
  ['Approved Â· no pending role', 'Approved · no pending role'],
  ['âœ“ Passed â€” all done', '✓ Passed — all done'],
  ['Itâ€™s ready â€“ 10am', 'It’s ready – 10am'],
  ['AndrÃ©', 'André'],
  ['FranÃ§aise', 'Française'],
  ['Moon Jelly · VA Creator · Writer', 'Moon Jelly · VA Creator · Writer'],
  ['£5,000 â€“ â‚¬10,000', '£5,000 – €10,000'],
  ['ÃƒÂ©', 'é'],
]) {
  assert.equal(repairMojibakeText(input), expected, 'repair: ' + input);
}
const original = {
  id: 'Â£-raw-id',
  profile: {
    displayName: 'AndrÃ© Â· VA',
    headline: 'Voice actor â€“ romance',
    roles: ['creator', 'writer'],
    favouriteTropes: ['Enemies to Lovers', 'Second chance â€“ fate'],
    portfolioUrl: 'https://example.org/a/Â£',
    body: 'Author intentionally quoted Â£',
    content: 'Protected script content keeps Â£ unchanged',
    about: 'Retain raw unrelated fields Â£',
  },
  financial: { grossPence: 10000 },
};
const repaired = repairMojibakeDisplayData(original);
assert.notEqual(repaired, original, 'presentation creates a new object');
assert.equal(original.profile.displayName, 'AndrÃ© Â· VA', 'source record must be unchanged');
assert.equal(repaired.profile.displayName, 'André · VA');
assert.equal(repaired.profile.headline, 'Voice actor – romance');
assert.deepEqual(repaired.profile.favouriteTropes, ['Enemies to Lovers', 'Second chance – fate']);
assert.equal(repaired.id, 'Â£-raw-id', 'IDs are not modified');
assert.equal(repaired.profile.portfolioUrl, original.profile.portfolioUrl, 'URLs are not modified');
assert.equal(repaired.profile.body, original.profile.body, 'author text is not rewritten automatically');
assert.equal(repaired.profile.content, original.profile.content, 'scripts are not rewritten');
assert.equal(repaired.profile.about, original.profile.about, 'unrecognised fields are not mutated');

// Production regression: a reviewed audio transcript displayed literal HTML
// entities such as `you&#39;re` instead of the author's apostrophe.
for (const [original, expected] of [
  ['you&#39;re here', "you're here"],
  ['It&#x27;s alright', "It's alright"],
  ['we&apos;re safe', "we're safe"],
  ['It&#8217;s late', 'It’s late'],
  ['you&lsquo;re here', 'you‘re here'],
]) {
  assert.equal(restoreTranscriptApostrophes(original), expected, 'restore transcript punctuation: ' + original);
}
const escapedTranscript = {
  releases: [{
    id: 'release-1',
    transcriptText: 'I wasn&#39;t sure, but you&#39;re here. <b>Keep as text</b> &lt;private&gt;',
    description: 'Creator notes &#39; may intentionally be encoded',
  }],
  transcript: 'You&#39;ve heard the recording.',
  body: 'Messages deliberately containing &#39; remain unchanged',
  scriptText: 'Protected script &#39; remains unchanged',
  url: 'https://example.com/&#39;',
};
const cleanedTranscript = repairMojibakeDisplayData(escapedTranscript);
assert.equal(cleanedTranscript.releases[0].transcriptText, "I wasn't sure, but you're here. <b>Keep as text</b> &lt;private&gt;");
assert.equal(cleanedTranscript.transcript, "You've heard the recording.");
assert.equal(cleanedTranscript.releases[0].description, escapedTranscript.releases[0].description);
assert.equal(cleanedTranscript.body, escapedTranscript.body);
assert.equal(cleanedTranscript.scriptText, escapedTranscript.scriptText);
assert.equal(cleanedTranscript.url, escapedTranscript.url);
assert.equal(escapedTranscript.releases[0].transcriptText.includes('&#39;'), true, 'raw record must not change');

assert.deepEqual(
  parseListingTags('Dark Romance, Enemies to Lovers, Second Chance Romance', 16),
  ['Dark Romance', 'Enemies to Lovers', 'Second Chance Romance'],
);
assert.deepEqual(parseListingTags(' Dark   Romance ,Dark Romance,  ', 16), ['Dark Romance']);
assert.deepEqual(parseListingTags('Romance, Fantasy, Horror', 2), ['Romance', 'Fantasy']);
assert.deepEqual(parseListingTags('  ', 16), []);

const rights = fs.readFileSync('src/components/WriterRightsPanel.tsx', 'utf8');
assert.match(rights, /value=\{genresDraft\}/, 'genres input preserves typing state');
assert.match(rights, /onChange=\{\(event\) => setGenresDraft\(event\.target\.value\)\}/, 'genre spaces are never trimmed per keystroke');
assert.match(rights, /value=\{tropesDraft\}/, 'tropes input preserves typing state');
assert.match(rights, /onChange=\{\(event\) => setTropesDraft\(event\.target\.value\)\}/, 'trope spaces are never trimmed per keystroke');
assert.match(rights, /genres: parseListingTags\(genresDraft, 16\)/, 'genres normalised on save');
assert.match(rights, /tropes: parseListingTags\(tropesDraft, 24\)/, 'tropes normalised on save');
assert.doesNotMatch(rights, /value=\{\(marketplace\.genres \?\? \[\]\)\.join\(', '\)\}/, 'old destructive genre input removed');

const administration = fs.readFileSync('src/platform/firebase-administration.ts', 'utf8');
const community = fs.readFileSync('src/platform/firebase-community.ts', 'utf8');
const catalogue = fs.readFileSync('src/platform/firebase-catalogue.ts', 'utf8');
const scripts = fs.readFileSync('src/platform/firebase-scripts.ts', 'utf8');
for (const [file, value] of [['administration', administration], ['community', community], ['catalogue', catalogue], ['scripts', scripts]]) {
  assert.match(value, /repairMojibakeDisplayData/, 'display recovery is connected: ' + file);
}

console.log('Nightjar encoding, legacy text preservation and multi-word genre/trope contracts passed.');
