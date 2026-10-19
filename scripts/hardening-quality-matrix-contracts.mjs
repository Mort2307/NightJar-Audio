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
assert.match(hosting,/\[nightjar-hardening-qa-release\]/,'Do not ship Admin UI before deployed backend');
const gate=hosting.slice(hosting.indexOf('- name: Deploy hardening QA acceptance before Hosting'),hosting.indexOf('# Deploy paged Admin release queries'));
assert.match(gate,/adminGetQualityAcceptance,adminRecordQualityCheck/,'Deploy only exact QA callables');
assert.match(gate,/gh run watch/,'Hosting must wait for backend');
assert.doesNotMatch(gate,/\\\\\n/,'No double-backslash multiline shell commands');
console.log('PASS 36 evidence-only hardening acceptance cases, Admin-only persistence and backend-first deployment');
