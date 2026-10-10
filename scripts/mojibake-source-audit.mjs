import fs from 'node:fs';
import path from 'node:path';

// Source hygiene: legacy concatenated UTF-8/Windows-1252 text must never
// reach customers as hard-coded product copy. Deliberate repair examples are
// restricted to tests and the dedicated repair utility.
const roots = ['src', 'functions/src'];
const excluded = new Set(['src/platform/text-integrity.ts']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.html', '.css', '.json']);
const knownCorruption = /Â[£€·©®]|Ã[\u0080-\u00ff]|â[€™œ‚€¦„–—]|ï»¿|\uFFFD/g;

const files = [];
const crawl = (folder) => {
  if (!fs.existsSync(folder)) return;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const candidate = path.join(folder, entry.name);
    if (entry.isDirectory()) crawl(candidate);
    else if (entry.isFile() && extensions.has(path.extname(candidate)) && !excluded.has(candidate.replaceAll('\\', '/'))) files.push(candidate);
  }
};
roots.forEach(crawl);

const errors = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(knownCorruption)) {
    const line = source.slice(0, match.index).split('\n').length;
    errors.push(file + ':' + line + ' contains ' + JSON.stringify(match[0]));
  }
}
if (errors.length) {
  console.error('Nightjar encoding audit failed:\n' + errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Nightjar source encoding audit passed (' + files.length + ' production files).');
}
