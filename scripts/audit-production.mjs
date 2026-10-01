import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['audit', '--omit=dev', '--audit-level=high', '--json'], {
  encoding: 'utf8',
  shell: false,
});

let report;
try {
  report = JSON.parse(result.stdout || '{}');
} catch {
  console.error('Could not parse npm production audit JSON output.');
  if (result.stdout) console.error(result.stdout);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const serious = Object.entries(vulnerabilities).filter(([, vulnerability]) => {
  const severity = String(vulnerability?.severity ?? '').toLowerCase();
  return severity === 'high' || severity === 'critical';
});

if (serious.length) {
  console.error('Nightjar deployable dependency vulnerabilities detected:');
  for (const [name, vulnerability] of serious) {
    console.error('-', name, vulnerability.severity, vulnerability.range ?? '');
  }
  process.exit(1);
}

const metadata = report.metadata?.vulnerabilities ?? {};
console.log(
  'Nightjar production dependency audit passed.',
  'critical=' + Number(metadata.critical ?? 0),
  'high=' + Number(metadata.high ?? 0),
  'moderate=' + Number(metadata.moderate ?? 0),
);
