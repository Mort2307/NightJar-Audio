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
  const layout = home.split('\n').find(line => line.trimStart().startsWith(preset + ': { order:'));
  assert.ok(layout?.includes('hidden:') && layout?.includes('collapsed:'), 'Preset must specify optional sections');
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

const cinema = load('src/styles/midnight-gold-cinema.css');
const main = load('src/main.tsx');
const directory = load('src/components/ProfessionalLibrary.tsx');
assert.match(main, /import '\.\/styles\/midnight-gold-cinema\.css';/, 'Cinematic structural CSS must actually load');
assert.ok(main.indexOf('midnight-gold-cinema.css') < main.indexOf('vision-access.css'), 'Accessibility palette layer must load after cinematic CSS');
assert.match(cinema, /\.nj-personal-home>\.nj-home-spotlight-fixed\s*\{\s*order:-30/, 'Spotlight must precede home toolbar and shortcuts visually');
assert.match(cinema, /\.nj-cinema-profile-cover/, 'Creator portraits need true top-of-page cinematic covers');
assert.match(cinema, /\.nj-profile-avatar-frame/, 'Portrait must overlap the cinematic cover');
assert.match(cinema, /\.nj-cinema-profile-tabs/, 'Profile must expose working section navigation');
assert.match(cinema, /\.public-featured-work>article:has\(>img/, 'Published release artwork must be visually prominent');
assert.match(cinema, /\.nj-spotlight-editorial-grid\s*\{[\s\S]*?scroll-snap-type:x mandatory/, 'Spotlight should be swipeable on phones');
assert.match(cinema, /\.nj-cinema-banner-lowres/, 'Low-resolution approved avatars must never be blurred as giant cover photos');
assert.match(profile, /naturalWidth < 480/, 'Cover image resolution must be checked at load time');
assert.match(profile, /id="nj-cinema-work"/, 'Work tab has a real scroll target');
assert.match(profile, /id="nj-cinema-about"/, 'About tab has a real scroll target');
assert.match(profile, /id="nj-cinema-collaborate"/, 'Collaborate tab has a real scroll target');
assert.match(profile, /release\.artworkUrl/, 'Real approved catalogue artwork is used');
assert.match(directory, /Array\.isArray\(person\.approvedProfessionalRoles\) && person\.approvedProfessionalRoles\.length > 0/, 'Directory verified crescent must require server-approved professional membership');
assert.match(cinema, /data-nightjar-vision/, 'Alternate low-vision palettes must remain usable');

// Third-pass production polish: structural consistency from the October mobile recording.
const polish = load('src/styles/midnight-gold-refinement.css');
const oldCreator = load('src/components/CreatorProfile.tsx');
assert.match(main, /import '\.\/styles\/midnight-gold-refinement\.css';/, 'Refinement must be imported');
assert.ok(main.indexOf('midnight-gold-refinement.css') < main.indexOf('vision-access.css'), 'Vision Access stylesheet must remain the final colour override');
assert.match(profile, /className="nj-cinema-optional-details"/, 'Public profile optional genres and interests must be collapsible');
assert.match(profile, /Specialties, genres & preferences/, 'Advanced specialties remain discoverable');
assert.match(profile, /id="nj-cinema-work"/, 'Publication content remains the primary profile landing');
assert.match(oldCreator, /nj-cinema-creator-legacy/, 'CreatorProfile alternate route must use consistent premium layout');
assert.match(oldCreator, /nj-cinema-legacy-cover/, 'Alternate CreatorProfile needs a cinematic cover');
assert.match(oldCreator, /nj-cinema-legacy-release-art/, 'Alternate CreatorProfile uses existing release artwork');
assert.match(polish, /\.nj-up-transcript-body/, 'Player reading view receives layout refinements');
assert.match(polish, /\.nj-spotlight-section-head/, 'Home spotlight hierarchy receives spacing refinements');
assert.match(polish, /\.nj-mobile-nav/, 'Mobile navigation size and touch targeting are refined');
assert.match(polish, /data-nightjar-vision/, 'Accessible alternative vision modes remain supported');
assert.match(polish, /prefers-reduced-motion/, 'Reduced motion remains supported');

// A card may crop its decorative background, but never the member's actual portrait.
const spotlight = load('src/components/SpotlightExperience.tsx');
const velvet = load('src/styles/nightjar-velvet-interaction.css');
assert.match(spotlight, /className="nj-spotlight-portrait-backdrop"[^>]*alt=""/, 'Spotlight blur layer must remain decorative and unannounced');
assert.match(spotlight, /className="nj-spotlight-portrait-img"[^>]*alt=/, 'Retain one accessible foreground portrait');
assert.match(productCss, /\.nj-spotlight-portrait-backdrop\s*\{[^}]*object-fit:cover;[^}]*filter:blur\(/, 'The ambient backdrop should fill the card');
assert.match(productCss, /\.nj-spotlight-portrait-img\s*\{[^}]*object-fit:contain;/, 'Entire Spotlight photo must stay in view');
const portraitEnd=spotlight.indexOf('</button>',spotlight.indexOf('className="nj-spotlight-portrait nj-spotlight-portrait-trigger"'));
const storyStart=spotlight.indexOf('<div className="nj-spotlight-story">',portraitEnd);
assert.ok(portraitEnd>0&&storyStart>portraitEnd,'Spotlight card layout is recognisable');
assert.doesNotMatch(spotlight.slice(spotlight.indexOf('className="nj-spotlight-portrait nj-spotlight-portrait-trigger"'),portraitEnd),
  /nj-spotlight-portrait-stamp/, 'Role badge must not cover the approved portrait');
assert.match(spotlight.slice(storyStart,storyStart+150),
  /nj-spotlight-portrait-stamp/, 'Role badge appears in adjacent editorial text');
assert.match(productCss,/\.nj-spotlight-portrait-stamp \{position:static;/,
  'Spotlight role badge does not use absolute artwork overlay coordinates');
assert.doesNotMatch(velvet, /\.nj-spotlight-portrait-trigger:hover \.nj-spotlight-portrait-img\s*\{\s*transform:scale/, 'Hover must not re-crop faces');

console.log('PASS fixed first-place spotlight and themed creator profile hierarchy');
