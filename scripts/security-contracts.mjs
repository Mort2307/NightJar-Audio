import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const sw=read('public/service-worker.js');
const app=read('src/App.tsx');
const protection=read('functions/src/index.ts');
const failures=[];

if (!sw.includes("url.pathname.startsWith('/assets/')")) failures.push('service worker must explicitly restrict static-asset caching');
if (/caches\.put\([^\n]*(script|manuscript|account|profile|firebase|functions)/i.test(sw)) failures.push('service worker appears to cache protected/dynamic Nightjar data');
if (!app.includes('possible_screenshot_key')) failures.push('protected reader possible screenshot signal is missing');
if (!app.includes('possible_capture_shortcut')) failures.push('protected reader capture-shortcut signal is missing');
if (!app.includes('native_screenshot_detected')) failures.push('native screenshot bridge event is missing');
if (!protection.includes('detectionConfidence')) failures.push('server protection evidence confidence classification is missing');
if (!protection.includes('no automatic') && !app.includes('no automatic freeze')) failures.push('human-review security principle is not visible in app code');

if (failures.length) {
  console.error('SECURITY CONTRACT FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar security contracts passed.');
