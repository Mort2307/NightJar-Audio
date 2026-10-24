import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const trustedMetadata=spawnSync(npmCommand,['view','body-parser@2.4.0','dist.integrity','--json'],{encoding:'utf8',shell:false});
console.log('RELEASE_METADATA_BODY_PARSER_2_4_0',trustedMetadata.status===0?trustedMetadata.stdout.trim():'unavailable');

const result = spawnSync(npmCommand, ['audit', '--omit=dev', '--audit-level=moderate', '--json'], {
  encoding: 'utf8',
  shell: false,
});

let report;
try {
  report = JSON.parse(result.stdout || '{}');
} catch {
  console.error('Could not parse npm audit JSON output.');
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const knownGhsa = 'GHSA-w5hq-g745-h8pq';
const vulnerabilities = report.vulnerabilities ?? {};
const uuidFinding = vulnerabilities.uuid;

const advisoryIds = (vulnerability) => {
  const ids = new Set();
  for (const via of Array.isArray(vulnerability?.via) ? vulnerability.via : []) {
    if (!via || typeof via !== 'object') continue;
    const url = String(via.url ?? '');
    const match = url.match(/GHSA-[A-Za-z0-9-]+/i);
    if (match) ids.add(match[0].toUpperCase());
  }
  return ids;
};

const allowedPackages = new Set();
if (uuidFinding) {
  const ids = advisoryIds(uuidFinding);
  if (ids.size === 1 && ids.has(knownGhsa)) {
    allowedPackages.add('uuid');
    for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
      const via = Array.isArray(vulnerability?.via) ? vulnerability.via : [];
      if (via.includes('uuid')) allowedPackages.add(name);
    }
  }
}

const unexpected = Object.entries(vulnerabilities)
  .filter(([name, vulnerability]) => {
    const severity = String(vulnerability?.severity ?? '').toLowerCase();
    if (!['moderate', 'high', 'critical'].includes(severity)) return false;
    return !allowedPackages.has(name);
  });

if (unexpected.length) {
  console.error('Unexpected production dependency vulnerabilities detected:');
  for (const [name, vulnerability] of unexpected) {
    console.error('-', name, vulnerability.severity, vulnerability.range ?? '');
  }
  process.exit(1);
}

if (allowedPackages.size) {
  console.warn(
    'Known reviewed upstream advisory remains:',
    knownGhsa,
    'via',
    [...allowedPackages].join(' -> '),
  );
  console.warn(
    'Nightjar does not override this dependency major. Recheck when firebase-admin / @google-cloud/storage updates.',
  );
}

console.log('Nightjar Functions dependency audit guard passed.');
