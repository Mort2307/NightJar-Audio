import fs from 'node:fs';
import zlib from 'node:zlib';
import assert from 'node:assert/strict';

// Generate the Android badge from Nightjar's REAL, committed brand artwork.
// Android expects a monochrome alpha mask in the status bar, not square app art.
const sourcePath = 'public/nightjar-home-192.png';
const badgePath = 'public/nightjar-notification-badge.png';
const size = 96;
const signature = Buffer.from('89504e470d0a1a0a', 'hex');

function chunks(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(signature), 'Nightjar source must be a PNG');
  let offset = 8;
  const out = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert.ok(offset + 12 + length <= bytes.length, 'PNG chunk bounds');
    out.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length) });
    offset += length + 12;
    if (type === 'IEND') break;
  }
  return out;
}

function decodePng(input) {
  const parts = chunks(input);
  const ihdr = parts.find(x => x.type === 'IHDR')?.data;
  assert.ok(ihdr?.length === 13, 'Nightjar PNG needs IHDR');
  const width = ihdr.readUInt32BE(0), height = ihdr.readUInt32BE(4);
  const depth = ihdr[8], type = ihdr[9];
  assert.ok(width > 16 && height > 16 && width <= 2048 && height <= 2048, 'Source logo resolution');
  assert.equal(depth, 8, 'Source must be an 8-bit PNG');
  assert.ok([2, 3, 6].includes(type), 'Source must be indexed, RGB or RGBA');
  assert.equal(ihdr[12], 0, 'Interlaced PNG is not supported');
  const channels = type === 6 ? 4 : type === 2 ? 3 : 1;
  const palette = parts.find(x => x.type === 'PLTE')?.data;
  if (type === 3) assert.ok(palette?.length >= 3, 'Indexed PNG needs a palette');
  const transparency = parts.find(x => x.type === 'tRNS')?.data;
  const data = zlib.inflateSync(Buffer.concat(parts.filter(x => x.type === 'IDAT').map(x => x.data)));
  const stride = width * channels;
  assert.equal(data.length, height * (1 + stride), 'Source PNG scanline length');
  const pixels = new Uint8Array(width * height * 4);
  let prior = new Uint8Array(stride), scan = new Uint8Array(stride), ptr = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c, da = Math.abs(p-a), db = Math.abs(p-b), dc = Math.abs(p-c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = data[ptr++];
    for (let i = 0; i < stride; i++) {
      const raw = data[ptr++], left = i >= channels ? scan[i-channels] : 0;
      const up = prior[i], topLeft = i >= channels ? prior[i-channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up)/2)
          : filter === 4 ? paeth(left, up, topLeft) : (()=>{throw Error('Unsupported PNG filter')})();
      scan[i] = (raw + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const src = x * channels, dest = (y * width + x) * 4;
      if (type === 3) {
        const idx = scan[src];
        pixels[dest] = palette[idx*3];
        pixels[dest+1] = palette[idx*3+1];
        pixels[dest+2] = palette[idx*3+2];
        pixels[dest+3] = transparency?.[idx] ?? 255;
      } else {
        pixels[dest] = scan[src];
        pixels[dest+1] = scan[src+1];
        pixels[dest+2] = scan[src+2];
        pixels[dest+3] = type === 6 ? scan[src+3] : 255;
      }
    }
    const swap = prior; prior = scan; scan = swap;
  }
  return { width, height, pixels };
}

const crcTable = Array.from({length:256}, (_,n)=>{
  let c=n; for (let i=0;i<8;i++) c=(c&1) ? (0xedb88320^(c>>>1)) : c>>>1;
  return c>>>0;
});
function crc(bytes) {
  let c=0xffffffff;
  for (const n of bytes) c = (crcTable[(c^n)&255] ^ (c>>>8))>>>0;
  return (c^0xffffffff)>>>0;
}
function pngChunk(type,body) {
  const tb=Buffer.from(type), out=Buffer.alloc(12+body.length);
  out.writeUInt32BE(body.length,0); tb.copy(out,4); body.copy(out,8);
  out.writeUInt32BE(crc(Buffer.concat([tb,body])),8+body.length);
  return out;
}
function encodePng(width,height,pixels) {
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=6;
  const raw=Buffer.alloc(height*(1+width*4));
  for(let y=0;y<height;y++) {
    raw[y*(1+width*4)]=0;
    Buffer.from(pixels.subarray(y*width*4,(y+1)*width*4)).copy(raw,y*(1+width*4)+1);
  }
  return Buffer.concat([signature,pngChunk('IHDR',ihdr),
    pngChunk('IDAT',zlib.deflateSync(raw,{level:9})),pngChunk('IEND',Buffer.alloc(0))]);
}

function badgeFromLogo({width,height,pixels}) {
  const intensity=i=>Math.max(pixels[i],pixels[i+1],pixels[i+2]);
  let background=0,edgeCount=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    if(x<width*.06||x>=width*.94||y<height*.06||y>=height*.94) {
      background+=intensity((y*width+x)*4);edgeCount++;
    }
  }
  background/=edgeCount;
  const low=Math.max(28,background+29), high=low+56;
  const mask=new Float64Array(width*height);
  let minX=width,minY=height,maxX=-1,maxY=-1,active=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const i=(y*width+x)*4;
    const alpha=(pixels[i+3]/255)*Math.max(0,Math.min(1,(intensity(i)-low)/(high-low)));
    mask[y*width+x]=alpha;
    if(alpha>=.4) {
      active++;minX=Math.min(x,minX);minY=Math.min(y,minY);
      maxX=Math.max(x,maxX);maxY=Math.max(y,maxY);
    }
  }
  assert.ok(active>width*height*.03,'No visible Nightjar mark in the source PNG');
  assert.ok(active<width*height*.78,'Badge mask is too full; would form a white square');
  const spanW=maxX-minX+1,spanH=maxY-minY+1;
  const scale=Math.min(size*.82/spanW,size*.82/spanH);
  const drawW=spanW*scale,drawH=spanH*scale;
  const offsetX=(size-drawW)/2,offsetY=(size-drawH)/2;
  const out=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const sx=(x+.5-offsetX)/scale+minX-.5,sy=(y+.5-offsetY)/scale+minY-.5;
    const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
    let alpha=0;
    for(let j=0;j<=1;j++)for(let i=0;i<=1;i++) {
      const xx=ix+i,yy=iy+j;
      if(xx<0||xx>=width||yy<0||yy>=height)continue;
      alpha+=mask[yy*width+xx]*(i?fx:1-fx)*(j?fy:1-fy);
    }
    const idx=(y*size+x)*4;
    out[idx]=255;out[idx+1]=255;out[idx+2]=255;
    out[idx+3]=Math.round(Math.min(1,Math.max(0,alpha))*255);
  }
  return {pixels:out,active,bounds:[minX,minY,maxX,maxY]};
}
const original=decodePng(fs.readFileSync(sourcePath));
const badge=badgeFromLogo(original);
fs.writeFileSync(badgePath,encodePng(size,size,badge.pixels));
console.log('Nightjar: generated real-logo Android notification badge from '+sourcePath+
  ' (source '+original.width+'x'+original.height+', foreground '+badge.active+' px).');
