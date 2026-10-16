import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const commandPalette = readFileSync(new URL('../src/components/GlobalCommandPalette.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../src/components/NightjarHomeLayout.tsx', import.meta.url), 'utf8');

assert.match(commandPalette, /event\.key === 'Enter'/);
assert.match(commandPalette, /choose\(results\[0\]\)/);
assert.match(commandPalette, /!event\.nativeEvent\.isComposing/);
assert.match(home, /prefers-reduced-motion: reduce/);
assert.match(home, /if \(id === 'spotlights'\)/);
console.log('PASS: direct keyboard search, reduced-motion scroll and fixed Spotlight contracts');
