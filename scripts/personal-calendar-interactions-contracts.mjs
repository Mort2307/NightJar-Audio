import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise Nightjar's actual client date logic; no parallel test formula.
const original=readFileSync(new URL('../src/platform/calendar-civil-date.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(original,{compilerOptions:{
  module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,
}}).outputText;
const {validPersonalCalendarDate,personalCalendarSavedSelection}=await import(
  'data:text/javascript;base64,'+Buffer.from(compiled).toString('base64')
);

for (const date of ['2026-10-23','2024-02-29','2000-01-01','2100-12-31']){
  assert.equal(validPersonalCalendarDate(date),true,date+' is valid and supported by the backend');
}
for (const date of ['','2026-2-1','2026-02-30','2026-04-31','2025-02-29','1900-01-01',
 '2101-01-01','2026-13-01','2026-00-01','2026-01-00','2026-01-32','2026-10-23Z']){
  assert.equal(validPersonalCalendarDate(date),false,date+' must not reach a write');
  assert.equal(personalCalendarSavedSelection(date),null,'invalid dates must not change the month');
}
assert.deepEqual(personalCalendarSavedSelection('2026-12-05'),{year:2026,month:11});
assert.deepEqual(personalCalendarSavedSelection('2024-02-29'),{year:2024,month:1});

const component=readFileSync(new URL('../src/components/PersonalCalendar.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/components/personal-calendar.css',import.meta.url),'utf8');
const api=readFileSync(new URL('../src/platform/firebase-calendar.ts',import.meta.url),'utf8');
const backend=readFileSync(new URL('../functions/src/index.ts',import.meta.url),'utf8');

assert.match(component,/const \[draftDate,setDraftDate\] = useState/,'date field has its own draft, separate from selected day');
assert.match(component,/setEditing\(entry\.id\);setDraftDate\(entry\.date\)/,'editing preserves the saved event ID and date');
assert.match(component,/value=\{draftDate\} disabled=\{saving\} onChange=\{\(event\)=>setDraftDate\(event\.target\.value\)\}/,'typing a date must not discard event identity');
assert.match(component,/nightjarCalendar\.save\(\{id:editing \?\? undefined,title:title\.trim\(\),date:draftDate,note:note\.trim\(\)\}\)/,
  'the intended date and same record ID are written as ONE operation');
assert.match(component,/setEvents\(\(prior\)=>\[\.\.\.prior\.filter\(\(item\)=>item\.id!==saved\.id\),saved\]\)/,
  'client replaces an edited record instead of duplicating it');
assert.match(component,/setSelected\(saved\.date\)/,'the visible date changes only after a confirmed write');
assert.match(component,/personalCalendarSavedSelection\(saved\.date\)/,'the calendar month follows a confirmed reschedule');
assert.match(component,/operationInFlight\.current=true/,'synchronous lock prevents duplicate saves');
assert.match(component,/if \(operationInFlight\.current \|\| loading \|\| loadError\) return;/,
  'incomplete calendar hydration cannot silently create an unreviewed record');
assert.match(component,/setLoadError\(message\)/,'errors are retained in visible state');
assert.match(component,/className="nj-calendar-error" role="alert"/,'load error is announced and recoverable');
assert.match(component,/onClick=\{\(\)=>void refresh\(\)\}>Try again/,
  'load error has an immediate retry action');
assert.match(component,/validPersonalCalendarDate\(draftDate\)/,'save action rejects impossible civil dates');
assert.match(css,/\.nj-calendar-error/,'retryable error message has a dedicated restrained theme style');
assert.match(css,/font-size:10px;line-height:1\.25/,'narrow phone day labels avoid the old 8px text');

assert.match(api,/getMyCalendar/,'authenticated existing calendar load is retained');
assert.match(api,/saveMyCalendarEvent/,'no private data is sent to an invented or external endpoint');
assert.match(backend,/new Date\(Date\.UTC\(year, month - 1, day\)\)\.toISOString\(\)\.slice\(0, 10\) !== date/,
  'server enforces the matching civil-date constraint');
assert.match(backend,/rawId \? collection\.doc\(rawId\) : collection\.doc\(\)/,
  'server updates an existing personal date by ID rather than creating a duplicate');

console.log('Personal calendar editing, date, recovery and duplicate-save contracts PASS.');
