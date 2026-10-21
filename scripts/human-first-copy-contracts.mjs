import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const surfaces = {
  'src/App.tsx': [
    'Personalised from your explicit taste and current session intent',
    'Your recommendation graph is still forming.',
    'General popularity is kept separate from personalisation.',
    'Declared preferences carry more weight than observed behaviour.',
    'Every great audio starts with a creative team.',
    '<div className="orbit orbit-a" /><div className="orbit orbit-b" />',
  ],
  'src/components/PublicProfile.tsx': ['A curated member profile, not a behavioural dossier.'],
  'src/components/NightjarOnboarding.tsx': ['This is only the beginning.', 'A premium profile should feel intentional.'],
  'src/components/UserProfileStudio.tsx': ['Your evolving discovery fingerprint.', 'What belongs in your Nightjar orbit?'],
  'src/components/NightjarHomeLayout.tsx': ['Tap to tuck this section away'],
  'src/components/ListeningDiscoveryControls.tsx': ['No AI recommendations or extra provider fees.'],
  'src/components/SpotlightExperience.tsx': ['A moment to celebrate the people who listen, explore and give this community its heartbeat.'],
};
const problems = [];
for (const [file, phrases] of Object.entries(surfaces)) {
  const contents = readFileSync(path.join(root, file), 'utf8');
  for (const phrase of phrases) {
    if (contents.includes(phrase)) problems.push(`${file}: outdated member-facing copy "${phrase}"`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Human-first editorial copy contracts: passed');
}
