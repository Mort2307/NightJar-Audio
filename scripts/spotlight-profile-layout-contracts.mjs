import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const load = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const home = load('src/components/NightjarHomeLayout.tsx');
const app = load('src/App.tsx');
const profile = load('src/components/PublicProfile.tsx');
const css = load('src/components/public-profile-premium.css');
const productCss = load('src/styles/product-system.css');

// The spotlight must be an always-visible editorial section, not a layout choice.
const list = home.match(/const allSections: SectionId\[\] = \[([^\]]+)\]/)?.[1] ?? '';
assert.ok(!list.includes('spotlights'), 'Spotlight must not be in editable home sections');
for (const preset of ['balanced', 'discovery', 'minimal']) {
  const layout = home.match(new RegExp(preset + ': \\{ order:\\[([^\\]]+)\\], hidden:\\[([^\\]]+)\\], collapsed:\\[([^\\]]+)\\]'))?.[0];
  assert.ok(layout, 'Missing preset ' + preset);
  assert.ok(!layout.includes("'spotlights'"), 'Preset cannot hide, reorder or collapse Spotlight: ' + preset);
}
assert.match(home, /allSections\.includes\(value as SectionId\)/, 'Saved orders must be filtered for legacy spotlight preferences');
assert.match(home, /if \(id === 'spotlights'\) return <section className="nj-home-spotlight-fixed"/, 'Spotlight must render unconditionally, without hide/collapse controls');
assert.match(productCss, /\.nj-personal-home > \.nj-home-spotlight-fixed\s*\{\s*order:-17/, 'Spotlight must be above all configurable Home content');
assert.ok(app.indexOf('<HomeSection id="spotlights"') > 0, 'Spotlight must be present in Home');
assert.ok(app.indexOf('<HomeSection id="spotlights"') < app.indexOf('<HomeSection id="featured"'), 'Spotlight must be before featured audio in DOM and keyboard order');
assert.equal((app.match(/<SpotlightExperience/g) ?? []).length, 1, 'Do not duplicate Spotlight');

// Public profile edits must preserve real member data, action permissions and social URLs.
for(const text of [
  'premium-public-profile-', 'profile.avatarUrl', 'profile.displayName',
  'onToggleFollow(profile.userId)', 'onMessage(profile.userId)', 'share()',
  'profile.socialLinks', 'profileMetrics.map', 'VoiceCallingCardPublic'
]) assert.ok(profile.includes(text), 'Public identity/action lost: ' + text);
assert.match(profile, /nj-public-profile-about/, 'Profiles need a distinct human introduction');
assert.match(profile, /nj-public-social-details/, 'External profile links should not dominate the introduction');
assert.match(profile, /nj-public-profile-privacy/, 'Informational disclaimer should be discreet but accessible');
assert.match(profile, /!!roleDetails\.creatorDirectionModes\?\.length \|\| !!roleDetails\.creatorDeliveryFormats\?\.length/, 'Unfilled production cards should not fill the profile');
assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/, 'Mobile metrics should use a compact 2-column layout');
assert.match(css, /prefers-reduced-motion/, 'Respect reduced motion');
assert.match(css, /focus-visible/, 'Preserve keyboard focus feedback');

console.log('PASS fixed first-place spotlight and themed creator profile hierarchy');
