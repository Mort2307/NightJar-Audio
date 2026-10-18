import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src=(p)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const manuscript=src('src/components/AdminManuscriptReview.tsx');
const audio=src('src/components/ContentModeration.tsx');
const styles=src('src/components/admin-manuscript-review.css')+src('src/index.css');

assert.match(manuscript,/const PAGE_SIZE=15/);
assert.match(manuscript,/visibleRows=shown\.slice\(/);
assert.match(manuscript,/visibleRows\.map\(\(item\) =>/);
assert.match(manuscript,/changeQueuePage=\(page:number\)/);
assert.match(manuscript,/setSelectedId\(null\)/);
assert.match(manuscript,/aria-label="Manuscript review pages"/);
assert.match(audio,/const PAGE_SIZE=20/);
assert.match(audio,/displayedAudio=visibleAudio\.slice\(/);
assert.match(audio,/displayedAudio\.map\(\(release\) =>/);
assert.match(audio,/setSelected\(null\)/);
assert.match(audio,/aria-label="Audio review pages"/);
assert.match(styles,/flex-wrap:wrap/);
assert.match(manuscript,/aria-live="polite"/);
assert.match(audio,/aria-live="polite"/);
console.log('Admin queue bounded rendering and accessible pagination verified.');
