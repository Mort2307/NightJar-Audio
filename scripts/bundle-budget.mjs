import fs from 'node:fs';
import path from 'node:path';

const dist=path.join(process.cwd(),'dist');
const assets=path.join(dist,'assets');
if (!fs.existsSync(assets)) {
  console.error('BUNDLE BUDGET FAIL: dist/assets does not exist. Build Nightjar before running the bundle budget.');
  process.exit(1);
}

const files=fs.readdirSync(assets).map((name)=>({
  name,
  path:path.join(assets,name),
  bytes:fs.statSync(path.join(assets,name)).size,
}));

const js=files.filter((file)=>file.name.endsWith('.js'));
const css=files.filter((file)=>file.name.endsWith('.css'));
const totalJs=js.reduce((sum,file)=>sum+file.bytes,0);
const totalCss=css.reduce((sum,file)=>sum+file.bytes,0);
const biggestJs=Math.max(0,...js.map((file)=>file.bytes));

const mb=(bytes)=>(bytes/1024/1024).toFixed(2)+' MB';
console.log('Nightjar bundle:', js.length,'JS chunks /',css.length,'CSS chunks');
console.log('Total JS:',mb(totalJs),'| largest chunk:',mb(biggestJs),'| total CSS:',mb(totalCss));

const failures=[];
if (biggestJs > 1.5*1024*1024) failures.push('largest JavaScript chunk exceeds 1.50 MB');
if (totalJs > 3.5*1024*1024) failures.push('total JavaScript exceeds 3.50 MB');
if (totalCss > 750*1024) failures.push('total CSS exceeds 750 KB');

if (failures.length) {
  console.error('BUNDLE BUDGET FAILURES');
  failures.forEach((failure)=>console.error('-',failure));
  process.exit(1);
}
console.log('Nightjar bundle budget passed.');
