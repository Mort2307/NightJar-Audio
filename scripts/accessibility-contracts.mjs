import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes:true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else if (/\.(tsx|html)$/.test(entry.name)) files.push(rel);
  }
};
walk('src');
files.push('index.html');

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  for (const match of source.matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt\s*=/.test(match[0])) failures.push(file + ': image missing alt attribute -> ' + match[0].slice(0,120));
  }
  for (const match of source.matchAll(/<[^>]+\brole=["']dialog["'][^>]*>/g)) {
    if (!/\baria-modal\s*=/.test(match[0])) failures.push(file + ': dialog missing aria-modal -> ' + match[0].slice(0,140));
  }
}

const css = fs.readFileSync(path.join(root,'src/styles/product-system.css'),'utf8');
if (!css.includes('prefers-reduced-motion')) failures.push('product-system.css: reduced-motion media query missing');
if (!css.includes('focus-visible')) failures.push('product-system.css: focus-visible styling missing');
if (!css.includes('.sr-only')) failures.push('product-system.css: screen-reader-only utility missing');

if (failures.length) {
  console.error('ACCESSIBILITY CONTRACT FAILURES');
  for (const failure of failures) console.error('-', failure);
  process.exit(1);
}
console.log('Nightjar accessibility contracts passed.');
