import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const helper=read('src/platform/reveal-navigation.ts');
const app=read('src/App.tsx');
const home=read('src/components/NightjarHomeLayout.tsx');
const scroll=read('src/platform/scroll-navigation.ts');

// The new action waits for actual React-rendered, accessible section state,
// instead of assuming a fixed 40–60ms timer will finish any delayed mount.
assert.match(helper,/window\.dispatchEvent\(new CustomEvent\(eventName,\{detail:sectionId\}\)\)/);
assert.match(helper,/new MutationObserver\(tryScroll\)/);
assert.match(helper,/\.getAttribute\('aria-expanded'\)!=='true'/);
assert.match(helper,/target\.getClientRects\(\)\.length===0/);
assert.match(helper,/observer\?\.disconnect\(\)/);
assert.match(helper,/window\.setTimeout\(cleanup,5000\)/);
assert.match(helper,/prefers-reduced-motion: reduce/);
assert.match(helper,/target\.scrollIntoView\(\{behavior:quiet\?'auto':'smooth',block:'start'\}\)/);
assert.doesNotMatch(helper,/addEventListener\(['"]click['"]/,'do not register global click handlers');

// Home and Workspace continue to use existing account-scoped controls.
assert.match(home,/window\.addEventListener\('nightjar:open-home-section', open\)/);
assert.match(home,/window\.addEventListener\('nightjar:open-workspace-section',reveal\)/);
assert.match(home,/id=\{'nightjar-workspace-'\+sectionId\}/,'workspace must have stable DOM anchor');
assert.match(home,/onClick=\{\(\)=>revealHomeSection\('catalogue'\)\}/,'Browse audio opens hidden/closed catalogue');
assert.doesNotMatch(home,/window\.setTimeout\(\(\)=>document\.getElementById\('nightjar-home-catalogue'\)/,'Browse audio must not guess a render delay');

// Distinct Creator and Writer dashboards reveal their OWN section.
assert.match(app,/onClick:\(\)=>revealWorkspaceSection\('creator-release-pipeline'\)/);
assert.match(app,/onClick:\(\)=>revealWorkspaceSection\('creator-listening-insights'\)/);
assert.match(app,/creatorOnly\?revealWorkspaceSection\('creator-collaborations'\):openProfileEditor\(\)/);
assert.match(app,/onClick:\(\)=>revealWorkspaceSection\('writer-collaborations'\)/);
assert.match(app,/onClick=\{\(\)=>revealWorkspaceSection\('writer-rights'\)\}/);
assert.match(app,/onClick=\{\(\) => revealHomeSection\('catalogue'\)\}/);
assert.match(app,/onClick=\{\(\) => revealHomeSection\('recommended'\)\}/);
assert.match(scroll,/export const scrollNightjarToTop/,'real route navigation scroll policy unchanged');
console.log('Nightjar reveal-and-scroll navigation source contracts PASS.');
