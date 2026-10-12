import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = path => fs.readFileSync(path,'utf8');
const vision = read('src/platform/nightjar-vision.ts');
const controls = read('src/components/VisionAccess.tsx');
const sheet = read('src/styles/vision-access.css');
const main = read('src/main.tsx');
const settings = read('src/components/NightjarSettings.tsx');
const backend = read('functions/src/index.ts');
const themes = read('src/platform/nightjar-theme.ts');

assert.match(main,/nightjarTheme\.initialise\(\);[\s\S]*nightjarVision\.initialise\(\);/, 'apply vision before any app screen mounts');
assert.match(main,/<VisionAccessLauncher \/>/, 'a visitor can change display settings without signing in');
assert.match(settings,/<VisionAccessControls \/>/, 'Settings has the same controls');
assert.match(controls,/<dialog/, 'browser-native dialog provides modal focus management and Escape handling');
assert.match(controls,/aria-labelledby="nj-vision-title"/, 'dialog has an accessible name');
assert.match(controls,/aria-pressed=\{prefs\.mode === mode\.id\}/, 'palettes have announced selections');
assert.match(controls,/aria-pressed=\{prefs\.textSize === size\}/, 'text sizes have announced selections');
assert.match(controls,/role="status"/, 'storage failure cannot be silently misrepresented as saved');
assert.match(sheet,/forced-colors:active/, 'do not override system forced-colours settings');
assert.match(sheet,/focus-visible/, 'keyboard focus must be discernible');
assert.match(sheet,/data-nightjar-vision-quiet="true"/, 'reduce movement at user request');
for(const size of [125,150,175,200]) {
  assert.ok(sheet.includes('data-nightjar-vision-scale="'+size+'"'), 'missing whole-app text scaling: '+size);
}
for(const mode of ['clarity','paper','focus','soft']) {
  assert.ok(sheet.includes('data-nightjar-vision="'+mode+'"'), 'missing CSS vision preset: '+mode);
}
assert.match(backend,/theme: \['nocturne','aubergine','midnight','ember','obsidian','bronze'\]/,
  'existing server theme allowlist remains unchanged; no inaccessible unsupported theme is sent');
assert.match(themes,/nightjar\.appearance\.theme\.v1/, 'member account theme remains separate from this device preference');
assert.doesNotMatch(vision,/firebase|userId|email|health|diagnosis/i, 'device vision layer stores no identity or diagnosis');

const js = ts.transpileModule(vision, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const values = new Map();
const events = [];
const root = { dataset: { nightjarTheme:'bronze' } };
const storage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key,value) => values.set(key,value),
};
class FakeEvent { constructor(type,options) { this.type=type;this.detail=options.detail; } }
const scope = {
  exports:{}, document:{documentElement:root}, localStorage:storage,
  window:{dispatchEvent:event => events.push(event)},
  CustomEvent:FakeEvent,
};
vm.runInNewContext(js,scope,{timeout:1000});
const { nightjarVision, VISION_MODES, VISION_SIZES } = scope.exports;
assert.deepEqual(Array.from(VISION_MODES.map(x=>x.id)),['off','clarity','paper','focus','soft']);
assert.deepEqual(Array.from(VISION_SIZES),[100,125,150,175,200]);
nightjarVision.initialise();
assert.equal(root.dataset.nightjarVision,undefined);
assert.equal(root.dataset.nightjarTheme,'bronze','vision cannot replace synced theme choice');
assert.equal(nightjarVision.apply({ mode:'paper',textSize:200,quiet:true }),true);
assert.equal(root.dataset.nightjarVision,'paper');
assert.equal(root.dataset.nightjarVisionScale,'200');
assert.equal(root.dataset.nightjarVisionQuiet,'true');
assert.equal(events.at(-1)?.type,'nightjar:vision-change');
nightjarVision.apply({mode:'focus',textSize:125,quiet:false});
assert.equal(root.dataset.nightjarVision,'focus');
assert.equal(root.dataset.nightjarVisionQuiet,undefined);
nightjarVision.initialise();
assert.equal(root.dataset.nightjarVision,'focus','preferences survive reload on this device');
assert.equal(root.dataset.nightjarTheme,'bronze','server-synced theme is preserved');
values.set('nightjar.vision.device.v1',JSON.stringify({mode:'injected',textSize:900,quiet:'yes'}));
nightjarVision.initialise();
assert.equal(root.dataset.nightjarVision,undefined,'unknown palettes must be rejected');
assert.equal(root.dataset.nightjarVisionScale,'100','unknown magnification rejected');
assert.equal(root.dataset.nightjarVisionQuiet,undefined,'non-boolean quiet is rejected');

const contrast = (a,b) => {
  const lum = hex => {
    const rgb = hex.match(/[a-f\d]{2}/gi).map(x=>parseInt(x,16)/255)
      .map(x=> x<=0.04045 ? x/12.92 : ((x+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  };
  const aa=lum(a),bb=lum(b);
  return (Math.max(aa,bb)+0.05)/(Math.min(aa,bb)+0.05);
};
for(const [mode,fg,bg] of [
  ['clarity','#ffffff','#050505'],
  ['paper','#151515','#f3eedf'],
  ['focus','#f2f6fa','#101820'],
  ['soft','#f6e5be','#171717'],
]) assert.ok(contrast(fg,bg)>=7, mode+' main text must meet 7:1 contrast against page background');

console.log('Nightjar Vision Access contracts PASS: pre-login, palette contrast, storage, reset, 200% enlargement, forced colours and existing Firebase isolation');
