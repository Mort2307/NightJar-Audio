import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync('functions/src/index.ts', 'utf8');
const media = readFileSync('src/platform/firebase-media.ts', 'utf8');
const writer = readFileSync('src/components/WriterScriptArtwork.tsx', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const marketplace = readFileSync('src/components/ScriptMarketplace.tsx', 'utf8');

const checks = [
  ['script artwork is an accepted moderated media kind', () => {
    assert.match(backend, /type ModeratedImageKind = [^;]*'script_artwork'/);
    assert.match(media, /type ImageKind = [^;]*'script_artwork'/);
    assert.match(backend, /if \(kind === 'script_artwork'\) \{[\s\S]*?writerUserId !== identity\.uid/);
  }],
  ['a pending image is linked separately to its manuscript', () => {
    assert.match(backend, /if \(kind === 'script_artwork'\) \{[\s\S]*?pendingArtworkAssetId: assetId,[\s\S]*?pendingArtworkStatus: 'pending'/);
    assert.match(backend, /script\.data\(\)\?\.pendingArtworkAssetId !== assetId/);
  }],
  ['rejection leaves current script artwork and editorial status intact', () => {
    const rejected = backend.slice(backend.indexOf("if (decision === 'rejected')"), backend.indexOf("const url = publicImageUrl(assetId)", backend.indexOf("if (decision === 'rejected')")));
    assert.match(rejected, /asset\.kind === 'script_artwork'/);
    assert.match(rejected, /pendingArtworkStatus: 'rejected'/);
    assert.doesNotMatch(rejected, /artworkUrl: null/);
  }],
  ['approval promotes the approved image rather than the manuscript', () => {
    const approved = backend.slice(backend.indexOf("if (asset.kind === 'script_artwork' && asset.targetId)", backend.indexOf("const url = publicImageUrl(assetId)")), backend.indexOf("if (asset.ownerUserId)", backend.indexOf("const url = publicImageUrl(assetId)")));
    assert.match(approved, /artworkUrl: url/);
    assert.match(approved, /artworkStatus: 'approved'/);
    assert.doesNotMatch(approved, /status: 'Published'|status: 'Approved'/);
  }],
  ['only approved cover artwork is exposed on script metadata and the marketplace', () => {
    assert.match(backend, /artworkUrl: data\.artworkStatus === 'approved' \? data\.artworkUrl \?\? null : null/);
    assert.match(marketplace, /script\.artworkUrl && <img/);
  }],
  ['new and existing writer manuscripts support image uploads', () => {
    assert.match(app, /attachNewWriterArtwork\(data\.script\)/);
    assert.match(app, /Optional cover image for this new script/);
    assert.match(app, /<WriterScriptArtwork/);
    assert.match(writer, /kind: 'script_artwork'/);
    assert.match(writer, /Remove approved artwork/);
  }],
  ['script artwork is visible in the existing admin image queue', () => {
    assert.match(app, /asset\.kind === 'script_artwork' \? 'Script artwork'/);
    assert.match(backend, /Manuscript artwork approved/);
    assert.match(backend, /Manuscript artwork not approved/);
  }],
];

for (const [name, check] of checks) {
  check();
  process.stdout.write('PASS script-artwork: ' + name + '\n');
}
