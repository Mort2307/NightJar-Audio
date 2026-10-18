import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend=readFileSync(new URL('../functions/src/index.ts',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/platform/firebase-profile-drafts.ts',import.meta.url),'utf8');
const sync=readFileSync(new URL('../src/components/StudioFormDraftSync.tsx',import.meta.url),'utf8');
const artist=readFileSync(new URL('../src/components/ArtistPortfolioManager.tsx',import.meta.url),'utf8');
const editor=readFileSync(new URL('../src/components/EditorShowcaseManager.tsx',import.meta.url),'utf8');

for(const [scope, fields] of [
  ['form-editor-showcase', ['title','description','services','techniques','permissionNote']],
  ['form-artist-portfolio', ['title','description','tags','commissionType']],
]){
  assert.match(backend,new RegExp("'"+scope+"':new Set\\(\\["));
  for(const field of fields)assert.match(backend,new RegExp("'"+field+"'"));
  assert.ok(api.includes("'"+scope+"'"), scope+' must be typed at callable boundary');
  assert.ok(sync.includes('scope: StudioDraftScope'));
}
assert.match(backend,/if\(scope\.startsWith\('form-'\)\)await requireAgeVerified\(identity\.uid\)/);
assert.match(backend,/if\(current\.revision!==expectedRevision\)/);
assert.match(backend,/if\(current\.revision!==expectedRevision\)return \{cleared:false/);
const allowlist=backend.slice(backend.indexOf('const STUDIO_DRAFT_FIELDS:'),backend.indexOf('const profileDraftScope'));
for (const forbidden of ['File','file','rightsConfirmed','permissionsConfirmed','humanCreated','audioBytes','dataUrl']) {
  assert.ok(!allowlist.includes("'"+forbidden+"'"), forbidden+' must not persist in metadata drafts');
}
assert.match(sync,/result\.saved/);
assert.match(sync,/setStatus\('conflict'\)/);
assert.match(sync,/Unsynced form details/);
assert.match(sync,/Selected files cannot be recovered/);
assert.match(artist,/scope="form-artist-portfolio"/);
assert.match(editor,/scope="form-editor-showcase"/);
assert.match(artist,/setDraftClearSignal/);
assert.match(editor,/setDraftClearSignal/);
console.log('Studio draft scope, permission, conflict and loss-warning contracts passed');
