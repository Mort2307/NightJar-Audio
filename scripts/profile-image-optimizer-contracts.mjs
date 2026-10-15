import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// Exercise the actual browser compressor with controlled canvas and decoder fakes.
// No external service or paid image API is involved.
const source = fs.readFileSync('src/platform/profile-image-optimizer.ts', 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  reportDiagnostics: true,
});
assert.equal(output.diagnostics?.length ?? 0, 0, 'photo optimiser must compile cleanly');
const module = { exports: {} };
new Function('module', 'exports', output.outputText)(module, module.exports);
const { optimiseProfileImage, profileImageDimensions, PROFILE_IMAGE_TARGET_BYTES, PROFILE_IMAGE_MAX_EDGE } = module.exports;

assert.deepEqual(profileImageDimensions(4000, 3000), { width: 768, height: 576 });
assert.deepEqual(profileImageDimensions(200, 150), { width: 200, height: 150 }, 'small images are never upscaled');
assert.deepEqual(profileImageDimensions(400, 3000), { width: 102, height: 768 });

let closed = 0;
let codecWebp = true;
let drawCalls = [];
let ctx = null;
const context = {
  clearRect() {},
  fillRect() { this.fills = (this.fills || 0) + 1; },
  drawImage(image, x, y, width, height) { drawCalls.push({ width, height }); },
  imageSmoothingEnabled: false,
  imageSmoothingQuality: 'low',
  fillStyle: '',
  fills: 0,
};
globalThis.createImageBitmap = async (file, options) => {
  assert.equal(options.imageOrientation, 'from-image', 'image orientation must be honoured');
  return { width: 4000, height: 3000, close: () => { closed++; } };
};
globalThis.document = {
  createElement(type) {
    assert.equal(type, 'canvas');
    return {
      width: 0,
      height: 0,
      getContext(type) {
        assert.equal(type, '2d');
        ctx = context;
        return context;
      },
      toBlob(callback, type) {
        const mime = type === 'image/webp' && !codecWebp ? 'image/png' : type;
        callback(new Blob([new Uint8Array(170 * 1024)], { type: mime }));
      },
    };
  },
};

const original = new File([new Uint8Array(4 * 1024 * 1024)], 'user-camera-photo.jpg', { type: 'image/jpeg' });
const result = await optimiseProfileImage(original);
assert.equal(result.file.type, 'image/webp');
assert.equal(result.file.name, 'user-camera-photo.webp');
assert.equal(result.width, 768);
assert.equal(result.height, 576);
assert.equal(result.originalBytes, original.size);
assert.equal(result.outputBytes, result.file.size);
assert.ok(result.outputBytes <= PROFILE_IMAGE_TARGET_BYTES, 'transmitted photo stays within size budget');
assert.equal(Math.max(result.width, result.height), PROFILE_IMAGE_MAX_EDGE);
assert.ok(result.outputBytes < result.originalBytes, 'large source compresses before upload');
assert.ok(drawCalls.length > 0, 'image is rendered to canvas');
assert.equal(ctx.imageSmoothingQuality, 'high', 'downsampling is high-quality');
assert.equal(closed, 1, 'decoded bitmap is released');

codecWebp = false;
drawCalls = [];
const jpegResult = await optimiseProfileImage(original);
assert.equal(jpegResult.file.type, 'image/jpeg', 'non-WebP browsers fall back to JPEG');
assert.equal(jpegResult.file.name, 'user-camera-photo.jpg');
assert.ok(context.fills > 0, 'JPEG fallback draws an opaque background for transparent photos');
assert.equal(closed, 2);

await assert.rejects(
  () => optimiseProfileImage(new File(['text'], 'unknown.gif', { type: 'image/gif' })),
  /Choose a JPG/,
  'unsupported formats cannot bypass the encoder',
);
await assert.rejects(
  () => optimiseProfileImage(new File([new Uint8Array(21 * 1024 * 1024)], 'oversized.jpg', { type: 'image/jpeg' })),
  /smaller than 20 MB/,
  'oversized input is rejected before decoding',
);
assert.equal(closed, 2, 'rejected inputs are not decoded');

// Never silently send originals, even if an encoder cannot meet the size ceiling.
codecWebp = true;
globalThis.document.createElement = () => ({
  width: 0,
  height: 0,
  getContext() { return context; },
  toBlob(callback, type) { callback(new Blob([new Uint8Array(PROFILE_IMAGE_TARGET_BYTES + 5000)], { type })); },
});
await assert.rejects(() => optimiseProfileImage(original), /could not be reduced enough/);
assert.equal(closed, 3, 'decoded image gets released on failed compression');

const app = fs.readFileSync('src/App.tsx', 'utf8');
const studio = fs.readFileSync('src/components/UserProfileStudio.tsx', 'utf8');
assert.match(app, /optimiseProfileImage\(file\)/, 'portrait upload invokes local optimisation');
assert.match(app, /readFileDataUrl\(resultImage\.file\)/, 'only optimised bytes reach the callable');
assert.match(app, /contentType: resultImage\.file\.type/, 'declared content type matches compressed file');
assert.match(studio, /Optimising photo/, 'the interface provides progress feedback');
const contextHelp = fs.readFileSync('src/components/ContextHelp.tsx', 'utf8');
assert.match(studio, /ContextHelp topic="profile-photo"/, 'profile optimisation explanation is available on demand');
assert.match(contextHelp, /'profile-photo': \{title:.*NightJar resizes and optimises photos/, 'profile help discloses the optimisation process');
console.log('Nightjar profile photo compression contracts passed.');
