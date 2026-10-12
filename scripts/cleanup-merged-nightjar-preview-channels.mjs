import { execFileSync } from 'node:child_process';

// Limited, deterministic cleanup of *closed* PR previews only. Never delete
// the live channel, manual previews, or channels for open PRs.
const project = 'nightjar-audio';
const repository = process.env.GITHUB_REPOSITORY ?? '';
const token = process.env.GITHUB_TOKEN ?? '';
const currentPr = Number(process.env.NIGHTJAR_PREVIEW_PR ?? 0);
if (repository !== 'Mort2307/NightJar-Audio' || !token || !Number.isSafeInteger(currentPr) || currentPr < 1) {
  throw new Error('Nightjar preview cleanup needs the exact repository, GitHub token and current PR number.');
}
const cli = (args) => execFileSync('firebase', args, { encoding: 'utf8', stdio: ['ignore','pipe','pipe'], timeout: 45_000 });
const raw = JSON.parse(cli(['hosting:channel:list','--site',project,'--project',project,'--json']));
const channels = raw?.result?.channels;
if (!Array.isArray(channels)) throw new Error('Unrecognised Firebase Hosting channel response: cleanup aborted.');
let deleted = 0;
for (const channel of channels) {
  if (deleted >= 12) break;
  const id = String(channel.name ?? '').split('/').pop() ?? '';
  if (id === 'live') continue;
  const match = /^pr(\d+)(?:[-_]|$)/.exec(id);
  if (!match) continue;
  const number = Number(match[1]);
  if (!Number.isSafeInteger(number) || number === currentPr) continue;
  const response = await fetch('https://api.github.com/repos/' + repository + '/pulls/' + number, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  // If GitHub is down or the PR is not found, retain the preview; never guess.
  if (!response.ok) continue;
  const pr = await response.json();
  if (pr.state !== 'closed') continue;
  try {
    cli(['hosting:channel:delete',id,'--site',project,'--project',project,'--force']);
    console.log('Cleaned closed-PR Nightjar preview channel: ' + id);
    deleted++;
  } catch (error) {
    console.log('Could not clean preview ' + id + ': ' + String(error?.message ?? error).slice(0,160));
  }
}
console.log('Nightjar preview cleanup complete; closed PR channels deleted: ' + deleted + '. Production live channel untouched.');
