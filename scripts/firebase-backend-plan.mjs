#!/usr/bin/env node
// Read-only, conservative deployment candidate planner.
// Nightjar Functions use shared helpers in a large index.ts. Never auto-deploy.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import ts from '../functions/node_modules/typescript/lib/typescript.js';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 }).trimEnd();
const hasExport = (node) => !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

export function parseIndex(source) {
  const file = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (file.parseDiagnostics.length) throw new Error('Functions index.ts has syntax errors; cannot propose a deployment.');
  const exported = new Map();
  const shared = [];
  for (const node of file.statements) {
    let names = [];
    if (ts.isVariableStatement(node) && hasExport(node)) {
      names = node.declarationList.declarations.flatMap((d) => ts.isIdentifier(d.name) ? [d.name.text] : []);
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && hasExport(node) && node.name) {
      names = [node.name.text];
    } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause) && !node.isTypeOnly) {
      names = node.exportClause.elements.filter((e) => !e.isTypeOnly).map((e) => e.name.text);
    }
    const bodyHash = sha256(node.getFullText(file));
    if (names.length) {
      for (const name of names) {
        if (exported.has(name)) throw new Error('Duplicate export ' + name + '; cannot safely plan.');
        exported.set(name, bodyHash);
      }
    } else {
      shared.push(node.getFullText(file));
    }
  }
  return { exported, sharedHash: sha256(shared.join('\n')) };
}

export function batches(names, size = 10) {
  if (!Number.isInteger(size) || size < 1 || size > 20) throw new Error('Batch size must be 1–20.');
  const sorted = [...new Set(names)].sort();
  return Array.from({ length: Math.ceil(sorted.length / size) }, (_, i) =>
    sorted.slice(i * size, (i + 1) * size));
}

export function analyseChange({ baseSource, headSource, changedFiles, base, head, batchSize = 10 }) {
  const touchedBackend = changedFiles.filter((path) => path.startsWith('functions/') || path === 'firebase.json');
  const result = {
    base, head,
    changedBackendFiles: touchedBackend,
    directExportChanges: [],
    removedExports: [],
    sharedImpact: [],
    candidates: [],
    batches: [],
    mode: 'none',
    note: 'Suggestions are advisory and never trigger a deployment.',
  };
  if (!touchedBackend.length) return result;
  if (baseSource == null || headSource == null) {
    result.mode = 'review-required';
    result.sharedImpact.push('The baseline or target Functions index could not be read.');
    return result;
  }
  const before = parseIndex(baseSource);
  const after = parseIndex(headSource);
  if (before.sharedHash !== after.sharedHash) {
    result.sharedImpact.push('Shared imports, helpers, types or initialization changed in functions/src/index.ts.');
  }
  const other = touchedBackend.filter((path) => path !== 'functions/src/index.ts');
  if (other.length) {
    result.sharedImpact.push('Other backend configuration, dependencies or modules changed: ' + other.join(', '));
  }
  const changed = [...new Set([...before.exported.keys(), ...after.exported.keys()])]
    .filter((name) => before.exported.get(name) !== after.exported.get(name)).sort();
  result.directExportChanges = changed;
  result.removedExports = changed.filter((name) => !after.exported.has(name));
  if (result.removedExports.length) {
    result.sharedImpact.push('Exports were removed or renamed. Review live function retention/deletion manually.');
  }
  if (result.sharedImpact.length) {
    result.mode = 'review-required';
    return result;
  }
  if (changed.length === 0) {
    result.mode = 'review-required';
    result.sharedImpact.push('Backend changed but no export statement change was reliably identified.');
    return result;
  }
  result.mode = 'direct-export-candidates';
  result.candidates = changed;
  result.batches = batches(changed, batchSize);
  return result;
}

function parseOptions(argv) {
  const options = { batchSize: 10 };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!['--base', '--head', '--output', '--summary', '--batch-size'].includes(key)) throw new Error('Unknown option: ' + key);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error('Missing value for ' + key);
    options[key.slice(2).replace(/-([a-z])/g, (_, x) => x.toUpperCase())] = value;
  }
  options.batchSize = Number(options.batchSize);
  if (!options.base) throw new Error('Supply --base <known Git SHA>.');
  return options;
}

const tick = String.fromCharCode(96);
const safeCell = (value) => String(value).replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');

export function markdownPlan(plan) {
  const lines = [
    '### Nightjar backend release candidates — advisory only',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Base commit | ' + safeCell(plan.base) + ' |',
    '| Compared commit | ' + safeCell(plan.head) + ' |',
    '| Classification | **' + safeCell(plan.mode) + '** |',
    '| Changed backend files | ' + plan.changedBackendFiles.length + ' |',
    '| Changed export statements | ' + plan.directExportChanges.length + ' |',
    '',
  ];
  if (plan.sharedImpact.length) {
    lines.push('**Shared impact / human review required:**');
    for (const reason of plan.sharedImpact) lines.push('- ' + safeCell(reason));
    lines.push('');
  }
  if (plan.directExportChanges.length) lines.push('Changed named exports: ' + plan.directExportChanges.map((n) => tick + n + tick).join(', '), '');
  if (plan.batches.length) {
    lines.push('**Candidate batches (maximum 20 each; manual approval required):**', '');
    plan.batches.forEach((group, idx) => lines.push(
      '- Batch ' + (idx + 1) + ': ' + tick + group.join(',') + tick,
    ));
  } else if (plan.mode === 'none') {
    lines.push('No backend source change was detected. No Functions deployment indicated by this comparison.', '');
  } else {
    lines.push('No complete deployable batch was inferred. Manually assess affected functions.', '');
  }
  lines.push('**Important:** This is a source-diff heuristic, not a dependency or runtime guarantee. A changed export may be called by other exports. Compare against the last relevant backend deployment, not merely the latest merge, before approving any release.', '');
  return lines.join('\n');
}

function main() {
  const args = parseOptions(process.argv.slice(2));
  const base = git('rev-parse', '--verify', args.base + '^{commit}');
  const head = git('rev-parse', '--verify', (args.head || 'HEAD') + '^{commit}');
  const changedFiles = git('diff', '--name-only', '--diff-filter=ACDMRT', base, head, '--').split('\n').filter(Boolean);
  const readVersion = (commit, path) => {
    try { return git('show', commit + ':' + path); } catch { return null; }
  };
  const result = analyseChange({
    baseSource: readVersion(base, 'functions/src/index.ts'),
    headSource: readVersion(head, 'functions/src/index.ts'),
    changedFiles, base, head, batchSize: args.batchSize,
  });
  const markdown = markdownPlan(result);
  process.stdout.write(markdown + '\n');
  if (args.output) fs.writeFileSync(args.output, JSON.stringify(result, null, 2) + '\n');
  if (args.summary) fs.appendFileSync(args.summary, markdown + '\n');
}

if (process.argv[1]?.endsWith('/firebase-backend-plan.mjs')) {
  try { main(); } catch (error) { console.error('BACKEND PLANNER FAILED: ' + error.message); process.exitCode = 1; }
}
