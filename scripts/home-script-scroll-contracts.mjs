import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const marketplace=readFileSync(new URL('../src/components/ScriptMarketplace.tsx',import.meta.url),'utf8');
const navigate=app.slice(app.indexOf('  const navigate = (nextView: View) => {'),app.indexOf('  const openCreditedReleases =',app.indexOf('  const navigate = (nextView: View) => {')));
const deepLink=app.slice(app.indexOf("      if (target.pathname === '/discover')"),app.indexOf("      const person = target.pathname.match",app.indexOf("      if (target.pathname === '/discover')")));
const pop=app.slice(app.indexOf('    const onPop = () => {'),app.indexOf("    window.addEventListener('popstate', onPop)"));

assert.match(navigate,/setFocusedContentScriptId\(null\)/,'ordinary tabs must remove stale script targets');
assert.match(navigate,/setFocusedContentReleaseId\(null\)/,'ordinary tabs must remove stale release targets');
assert.match(navigate,/window\.location\.pathname \+ window\.location\.search !== path/,'reselecting Home must clear old ?script queries');
assert.match(deepLink,/navigate\('discover'\);[\s\S]*setFocusedContentScriptId\(valid\(scriptId\)\)/,'real notification links restore script focus after ordinary navigation');
assert.match(pop,/setFocusedContentScriptId\(topLevel === 'discover' \? validContentId\(routeParams\.get\('script'\)\) : null\)/,'history navigation uses its own URL instead of stale target');
assert.match(marketplace,/jumpedToScriptId = useRef<string \| null>\(null\)/);
assert.match(marketplace,/jumpedToScriptId\.current === focusScriptId/,'repeat marketplace renders cannot redirect scroll');
assert.match(marketplace,/if \(!focusScriptId\) \{[\s\S]*jumpedToScriptId\.current = null/);
assert.match(marketplace,/prefers-reduced-motion: reduce/);
assert.match(marketplace,/nightjar-notification-target/,'intentional deep link retains original card highlight');
console.log('Home deep-link navigation and one-shot marketplace focus contracts passed.');
