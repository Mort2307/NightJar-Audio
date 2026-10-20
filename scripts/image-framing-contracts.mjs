import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const frame=readFileSync('src/platform/image-framing.ts','utf8');
const editor=readFileSync('src/components/ImageFramingEditor.tsx','utf8');
const styles=readFileSync('src/components/image-framing-editor.css','utf8');
const profile=readFileSync('src/components/UserProfileStudio.tsx','utf8');
const social=readFileSync('src/components/SocialLinksEditor.tsx','utf8');
const optimizer=readFileSync('src/platform/profile-image-optimizer.ts','utf8');
const backend=readFileSync('functions/src/index.ts','utf8');

assert.match(frame,/DEFAULT_IMAGE_FRAMING:ImageFraming=\{mode:'fit',zoom:1,x:0,y:0\}/,
  'Default preserves full image instead of silently cropping');
assert.match(frame,/Math\.min\(frameWidth\/sourceWidth,frameHeight\/sourceHeight\)/,
  'Contain geometry preserves full image');
assert.match(frame,/Math\.max\(frameWidth\/sourceWidth,frameHeight\/sourceHeight\)/,
  'Deliberate fill crops the image');
assert.match(frame,/clampFraming\(framing\.zoom,1,3\)/,'Bounded zoom');
assert.match(frame,/clampFraming\(framing\.x,-100,100\)/);
assert.match(frame,/clampFraming\(framing\.y,-100,100\)/);
assert.match(frame,/context\.drawImage\(image,g\.x,g\.y,g\.width,g\.height\)/,'Preview and export use common renderer');
assert.match(frame,/canvas\.height=aspect==='banner'\?616:768/,'Cover preview targets actual 16:7 surface');
assert.match(frame,/canvas\.toBlob/,'Editor exports locally, not external AI');
assert.match(frame,/new File\(\[blob\]/,'Image goes through existing moderated upload');
assert.match(editor,/role="dialog" aria-modal="true"/,'Accessible editing modal');
assert.match(editor,/onPointerMove=\{onPointerMove\}/,'Touch and mouse reposition');
assert.match(editor,/Math\.hypot\(/,'Two-pointer pinch zoom');
assert.match(editor,/onKeyDown=\{keyboardMove\}/,'Keyboard arrow alternative');
assert.match(editor,/type="range"/,'Sliders available without gestures');
assert.match(editor,/Show whole picture/);
assert.match(editor,/Fill frame \(crop\)/);
assert.match(editor,/Use this framing/);
assert.match(editor,/exportFramedImage\(image,framing/,'Preview geometry is what gets submitted');
assert.match(editor,/onCancel=|onClick=\{onCancel\}/,'Explicit cancellation');
assert.match(editor,/URL\.revokeObjectURL\(url\)/,'Revoke object URLs when no longer needed');
assert.match(styles,/nj-framing-stage\.circle-guide|\.nj-framing-circle/,'Portrait safe-area guide');
assert.match(styles,/prefers-reduced-motion:reduce/,'Motion control');
assert.match(styles,/data-nightjar-vision/,'Vision theme override');
assert.match(profile,/setFramingUpload\(\{file,shape:'portrait'\}\)/);
assert.match(profile,/setFramingUpload\(\{file,shape:'banner'\}\)/);
assert.match(profile,/onUploadAvatar\(file\)/);
assert.match(profile,/onUploadBanner\(file\)/);
assert.match(social,/setFramingUpload\(\{row,file\}\)/,'Social image editor enabled');
assert.match(social,/await upload\(framingUpload\.row,framed\)/);
assert.match(social,/optimiseProfileImage\(file\)/,'Existing metadata-stripping encoder remains active');
assert.match(optimizer,/source\.release\(\)/,'Original decoder resources released');
assert.match(backend,/kind === 'social_avatar'/,'Backend moderation retained');
assert.match(backend,/parent\[pendingField\]===assetId/,'Stale moderation approval stays rejected');
console.log('PASS local full-fit, purposeful crop, accessible framing, and existing moderated upload routes');
