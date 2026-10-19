import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(path,'utf8');
const matrix = read('docs/nightjar-hardening-acceptance-2026-10-18.md');
const data = read('src/data/hardening-acceptance.ts');
const ui = read('src/components/AdminQualityCentre.tsx');
const backend = read('functions/src/nightjar-quality.ts');
const hosting = read('.github/workflows/firebase-hosting-merge.yml');
const ids = [...matrix.matchAll(/^\| ([A-Z][0-9]+) \|/gm)].map(match=>match[1]);
assert.equal(ids.length,36,'The human acceptance checklist must remain 36 distinct cases');
assert.equal(new Set(ids).size,36,'Hardening case IDs must be unique');
for(const id of ids){
  const key = 'hardening_'+id;
  assert.ok(data.includes('"id": "'+key+'"'),'Missing frontend case '+id);
  assert.ok(backend.includes("'"+key+"'"),'Missing backend record whitelist '+id);
}
assert.match(ui,/matrix === 'hardening'/,'Must offer a separate hardening matrix, not 55 scrolling rows');
assert.match(ui,/hardeningAcceptance\.find\(/,'Tester must see safe scenario instructions');
assert.match(ui,/nightjarQuality\.record\(selected,decision,evidence\.trim\(\)\)/,'Each case remains manually signed off');
assert.match(backend,/status==='pass'&&evidence\.length<20/,'Prevent unevidenced pass');
assert.match(backend,/requireAdmin\(request\)/,'Only Admin can read and record acceptance');
assert.match(hosting, /- name: Deploy Quality Centre callables before Hosting/, 'Existing Quality Centre backend-first release gate remains present');
const gate=hosting.slice(hosting.indexOf('- name: Deploy Quality Centre callables before Hosting'),hosting.indexOf('# Single explicitly consented live normal Didit check'));
assert.match(gate,/adminGetQualityAcceptance,adminRecordQualityCheck/,'Deploy exact QA callables');
assert.ok(gate.includes('nightjar-quality.ts'),'Deploy backend for changed whitelist');
assert.match(gate,/gh run watch/,'Hosting must wait for backend');
assert.doesNotMatch(hosting,/Deploy hardening QA acceptance before Hosting/,'Never dispatch duplicate QA deployment');
console.log('PASS 36 evidence-only hardening acceptance cases, Admin-only persistence and backend-first deployment');
