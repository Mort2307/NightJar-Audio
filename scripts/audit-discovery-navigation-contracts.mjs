import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const commandPalette = readFileSync(new URL('../src/components/GlobalCommandPalette.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/components/NightjarHomeLayout.tsx', import.meta.url), 'utf8');
const reveal = readFileSync(new URL('../src/platform/reveal-navigation.ts', import.meta.url), 'utf8');

assert.match(commandPalette, /event\.key === 'Enter'/);
assert.match(commandPalette, /choose\(results\[0\]\)/);
assert.match(commandPalette, /!event\.nativeEvent\.isComposing/);
assert.match(home, /revealHomeSection\('catalogue'\)/, 'Home Browse audio uses the shared reveal navigation');
assert.match(reveal, /prefers-reduced-motion: reduce/, 'destination scrolling still honours reduced-motion');
assert.match(home, /if \(id === 'spotlights'\)/);
console.log('PASS: direct keyboard search, reduced-motion scroll and fixed Spotlight contracts');
