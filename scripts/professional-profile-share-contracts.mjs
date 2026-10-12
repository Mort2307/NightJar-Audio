import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => fs.readFileSync(path,'utf8');
const directory = read('src/components/ProfessionalLibrary.tsx');
const app = read('src/App.tsx');
const publicProfile = read('src/components/PublicProfile.tsx');
const sharing = read('src/platform/public-profile-share.ts');
const server = read('functions/src/index.ts');

// Everyone in the approved public professional collection must see the same
// labelled share action. Listener/member privacy and owner read-only preview
// remain outside the Directory share action.
assert.match(directory, /!readOnly&&category!=='listener'&&<button/, 'Share must not depend on the VA-only category');
assert.match(directory, /onRecommend\(person,category as LibraryRole\)/, 'Directory share must carry the exact category clicked');
assert.match(directory, /Share2 size=\{15\} aria-hidden="true"\/> Share/, 'Share action must be obvious on mobile and announced accessibly');
assert.match(directory, /data-profession=\{category\}/, 'Role-specific public cards must remain distinct');
assert.match(app, /onRecommend=\{\(person, selectedRole\) => void recommendCreator\(person as PublicDirectoryProfile, selectedRole\)\}/,
  'Directory dispatch must pass role rather than only primary account role');
assert.match(app, /selectedRole === 'creator'/, 'Legacy VA referral tracking must stay VA-only');
assert.match(app, /nightjarReferrals\.recommendCreator\(person\.userId\)/, 'VA referral integration preserved');
assert.match(app, /roles:Array\.isArray\(item\.roles\) \? item\.roles : \[item\.role\]/, 'Directory retains all approved account roles');
assert.match(app, /roleProfiles:item\.roleProfiles \?\? \{\}/, 'Directory preserves distinct profile role slices');
assert.match(app, /Share my profile/, 'Professional users can share their own profile');
assert.match(app, /profile\.publicProfile !== false/, 'Own-profile share must honour public/private visibility');
assert.match(publicProfile, /const role = profileRole as ShareableProfileRole/, 'Share from role chips must open the selected role');
assert.match(publicProfile, /!profile \|\| readOnlyPreview/, 'Read-only owner preview must not share an impersonated member');
assert.match(server, /if \(!data \|\| data\.publicProfile === false\) return null;/,
  'Server must not return private public-profile payloads');
assert.doesNotMatch(sharing, /\b(email|password|legal|authToken)\b/i,
  'Sharing must not serialise personal account credentials');

// Execute the actual production TypeScript link builder and share handler.
const compiled = ts.transpileModule(sharing, { compilerOptions:{
  target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS,
} }).outputText;
const scope = { exports:{}, navigator:{}, window:{ prompt(){} } };
vm.runInNewContext(compiled, scope, { timeout:1000 });
const { publicProfileUrl, shareNightjarProfile } = scope.exports;
for (const role of ['creator','writer','editor','artist','listener']) {
  const url = publicProfileUrl('https://nightjar-audio.web.app/', 'USER/+abc', role);
  assert.equal(url, 'https://nightjar-audio.web.app/people/USER%2F%2Babc?role='+role, role+' has stable escaped deep link');
}
let shareArgs = null;
const notices = [];
scope.navigator.share = async args => { shareArgs = args; };
const notify = message => notices.push(message);
await shareNightjarProfile({
  url:publicProfileUrl('https://nightjar-audio.web.app','u1','writer'),
  name:'Test Writer', roleLabel:'Writer', notify,
});
assert.equal(shareArgs.url, 'https://nightjar-audio.web.app/people/u1?role=writer');
assert.match(shareArgs.title, /Test Writer/);
assert.equal(notices.length, 0);
scope.navigator.share = undefined;
let copied = '';
scope.navigator.clipboard = {writeText:async text => { copied = text; }};
await shareNightjarProfile({url:publicProfileUrl('https://nightjar-audio.web.app','u2','artist'),name:'Test Artist',roleLabel:'Artist',notify});
assert.ok(copied.includes('/people/u2?role=artist'), 'fallback copies exact Artist profile link');
assert.ok(notices.at(-1).includes('copied'));
const priorMessages=notices.length;
scope.navigator.share = async () => {const err = new Error('cancel');err.name='AbortError';throw err;};
await shareNightjarProfile({url:'https://nightjar-audio.web.app/people/u3?role=editor',name:'Test Editor',roleLabel:'Audio Editor',notify});
assert.equal(notices.length,priorMessages, 'user cancelling share sheet must not be treated as error');
scope.navigator.share = async () => {throw new Error('denied');};
await shareNightjarProfile({url:'https://nightjar-audio.web.app/people/u3?role=editor',name:'Test Editor',roleLabel:'Audio Editor',notify});
assert.ok(notices.at(-1).includes('Unable'), 'real failure should be reported');

console.log('Nightjar professional sharing PASS: all four professions, selected role, URL encoding, native share/copy, privacy and referral guards');
