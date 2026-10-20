import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, RefreshCcw, X, ZoomIn } from 'lucide-react';
import { clampFraming, DEFAULT_IMAGE_FRAMING, exportFramedImage, frameGeometry, paintFramedImage, type ImageFraming } from '../platform/image-framing';
import './image-framing-editor.css';

type Props={
  file:File;
  shape:'portrait'|'social'|'banner'|'release'|'script'|'artwork';
  onCancel:()=>void;
  onApply:(framed:File)=>Promise<void>|void;
};

const pictureTypes=['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif'];
const displayName={portrait:'Profile portrait',social:'Social profile photo',banner:'Profile cover',release:'Release cover artwork',script:'Manuscript cover artwork',artwork:'Artist portfolio artwork'};
const sizeOf=(shape:Props['shape'],image:HTMLImageElement|null)=>{
  if(shape==='banner')return {width:800,height:350};
  if(shape==='artwork'&&image){
    const scale=480/Math.max(image.naturalWidth,image.naturalHeight);
    return {width:Math.max(1,Math.round(image.naturalWidth*scale)),
      height:Math.max(1,Math.round(image.naturalHeight*scale))};
  }
  return {width:480,height:480};
};

export default function ImageFramingEditor({file,shape,onCancel,onApply}:Props){
  const [framing,setFraming]=useState<ImageFraming>(DEFAULT_IMAGE_FRAMING);
  const [image,setImage]=useState<HTMLImageElement|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const closeRef=useRef<HTMLButtonElement|null>(null);
  const pointers=useRef(new Map<number,{x:number;y:number}>());
  const lastDistance=useRef<number|null>(null);
  const dimensions=sizeOf(shape,image);

  useEffect(()=>{
    let active=true;
    if(file.size===0||file.size>20*1024*1024){
      setError('Choose a photo larger than zero and smaller than 20 MB.');
      return;
    }
    if(file.type && !pictureTypes.includes(file.type)){
      setError('Use a JPG, PNG, WebP or browser-supported HEIC/AVIF picture.');
      return;
    }
    const url=URL.createObjectURL(file);
    const picture=new Image();
    picture.decoding='async';
    picture.onload=()=>{
      if(!active)return;
      if(!picture.naturalWidth||!picture.naturalHeight||
          picture.naturalWidth*picture.naturalHeight>64_000_000){
        setError('This photo is too large or cannot be decoded safely.');
        return;
      }
      setImage(picture);
    };
    picture.onerror=()=>{if(active)setError('This picture could not be opened. Try a JPG or PNG.');};
    picture.src=url;
    return ()=>{active=false;URL.revokeObjectURL(url);};
  },[file]);

  useEffect(()=>{
    if(!image||!canvasRef.current)return;
    const canvas=canvasRef.current;
    const context=canvas.getContext('2d');
    if(!context){setError('This browser cannot display the cropping guide.');return;}
    paintFramedImage(context,image,image.naturalWidth,image.naturalHeight,
      canvas.width,canvas.height,framing,shape==='artwork'?'transparent':'midnight');
  },[image,framing,dimensions.width,dimensions.height]);

  useEffect(()=>{
    closeRef.current?.focus();
    const escape=(event:KeyboardEvent)=>{
      if(event.key==='Escape'&&!busy){event.preventDefault();onCancel();}
    };
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[onCancel,busy]);

  const geometry=image?frameGeometry(image.naturalWidth,image.naturalHeight,dimensions.width,dimensions.height,framing):null;
  const gesturePoint=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    return {x:(event.clientX-rect.left)*dimensions.width/rect.width,
      y:(event.clientY-rect.top)*dimensions.height/rect.height};
  };
  const onPointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(busy||!image)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId,gesturePoint(event));
    lastDistance.current=null;
  };
  const onPointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const previous=pointers.current.get(event.pointerId);
    if(!previous||busy||!image)return;
    const next=gesturePoint(event);
    pointers.current.set(event.pointerId,next);
    const coords=[...pointers.current.values()];
    if(coords.length>=2){
      const distance=Math.hypot(coords[0].x-coords[1].x,coords[0].y-coords[1].y);
      if(lastDistance.current&&lastDistance.current>1)
        setFraming(f=>({...f,zoom:clampFraming(f.zoom*distance/lastDistance.current!,1,3)}));
      lastDistance.current=distance;
      return;
    }
    lastDistance.current=null;
    if(!geometry)return;
    setFraming(f=>({
      ...f,
      x:geometry.extraX>0?clampFraming(f.x-(next.x-previous.x)/geometry.extraX*200,-100,100):f.x,
      y:geometry.extraY>0?clampFraming(f.y-(next.y-previous.y)/geometry.extraY*200,-100,100):f.y,
    }));
  };
  const stopPointer=(event:ReactPointerEvent<HTMLDivElement>)=>{
    pointers.current.delete(event.pointerId);
    lastDistance.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const apply=async()=>{
    if(!image||busy)return;
    setBusy(true);setError('');
    try{
      const framed=await exportFramedImage(image,framing,shape==='banner'?'banner':shape==='artwork'?'artwork':'square',file.name);
      await onApply(framed);
    }catch(cause){setError(cause instanceof Error?cause.message:'Image framing could not be completed.');}
    finally{setBusy(false);}
  };
  const keyboardMove=(event:ReactKeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    const offset=event.shiftKey?15:5;
    setFraming(f=>({
      ...f,
      x:clampFraming(f.x+(event.key==='ArrowLeft'?-offset:event.key==='ArrowRight'?offset:0),-100,100),
      y:clampFraming(f.y+(event.key==='ArrowUp'?-offset:event.key==='ArrowDown'?offset:0),-100,100),
    }));
  };
  return createPortal(
    <div className="nj-framing-backdrop" role="presentation">
      <section className="nj-framing-dialog" role="dialog" aria-modal="true" aria-labelledby="nj-frame-title" aria-describedby="nj-frame-hint">
        <header className="nj-framing-header">
          <div><span className="mini-label">NIGHTJAR IMAGE STUDIO</span><h2 id="nj-frame-title">Adjust {displayName[shape].toLowerCase()}</h2></div>
          <button ref={closeRef} type="button" className="ghost-button" aria-label="Cancel photo changes" disabled={busy} onClick={onCancel}><X size={19}/></button>
        </header>
        <p id="nj-frame-hint">Move the picture inside the gold guide. Choose <strong>Show whole picture</strong> to keep everything, or <strong>Fill frame</strong> to crop deliberately. The preview shows what will be submitted for review.</p>
        <div className={'nj-framing-stage '+(shape==='portrait'?'circle-guide':shape==='artwork'?'is-artwork':'')}
          style={{aspectRatio:shape==='banner'?'16 / 7':shape==='artwork'?`${dimensions.width} / ${dimensions.height}`:'1 / 1',
            ...(shape==='artwork'?{width:`min(100%, calc(44dvh * ${dimensions.width/dimensions.height}))`}:{})}}
          role="group" tabIndex={0} aria-label="Photo frame. Drag to move, pinch to zoom, or use arrow keys and sliders."
          onKeyDown={keyboardMove} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={stopPointer} onPointerCancel={stopPointer} onLostPointerCapture={stopPointer}>
          <canvas ref={canvasRef} width={dimensions.width} height={dimensions.height} aria-hidden="true"/>
          <span className="nj-framing-thirds" aria-hidden="true"/>
          {shape==='portrait'&&<span className="nj-framing-circle" aria-hidden="true"/>}
          {!image&&!error&&<span className="nj-framing-loading" role="status">Preparing your picture…</span>}
        </div>
        <div className="nj-framing-mode" role="group" aria-label="Photo framing mode">
          <button type="button" className={framing.mode==='fit'?'active':''} aria-pressed={framing.mode==='fit'} disabled={busy||!image}
            onClick={()=>setFraming(f=>({...f,mode:'fit',zoom:1,x:0,y:0}))}>Show whole picture</button>
          <button type="button" className={framing.mode==='fill'?'active':''} aria-pressed={framing.mode==='fill'} disabled={busy||!image}
            onClick={()=>setFraming(f=>({...f,mode:'fill',zoom:1,x:0,y:0}))}>Fill frame (crop)</button>
        </div>
        <div className="nj-framing-sliders">
          <label><span><ZoomIn size={15}/> Scale / zoom <strong>{Math.round(framing.zoom*100)}%</strong></span>
            <input type="range" min="1" max="3" step=".05" value={framing.zoom} disabled={busy||!image}
              onChange={e=>setFraming(f=>({...f,zoom:Number(e.target.value)}))}/></label>
          <label><span>Move left / right</span><input type="range" min="-100" max="100" step="5" value={framing.x}
              disabled={busy||!image||!geometry?.extraX} onChange={e=>setFraming(f=>({...f,x:Number(e.target.value)}))}/></label>
          <label><span>Move up / down</span><input type="range" min="-100" max="100" step="5" value={framing.y}
              disabled={busy||!image||!geometry?.extraY} onChange={e=>setFraming(f=>({...f,y:Number(e.target.value)}))}/></label>
        </div>
        {shape==='artwork'&&<p className="nj-framing-note">Artist artwork keeps its original proportions and transparency. Zooming can intentionally trim the edges; Reset restores the full composition.</p>}
        {shape==='banner'&&<p className="nj-framing-note">Profile headers vary by screen width. Keep important text and faces inside the centre guide.</p>}
        {shape==='portrait'&&<p className="nj-framing-note">The round gold outline is the avatar's safe area. Corner details may fall outside the circular display.</p>}
        {error&&<p role="alert" className="nj-framing-error">{error}</p>}
        <footer className="nj-framing-actions">
          <button type="button" className="ghost-button" disabled={busy} onClick={()=>setFraming(DEFAULT_IMAGE_FRAMING)}><RefreshCcw size={15}/> Reset</button>
          <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" className="primary-button" disabled={busy||!image||Boolean(error)} onClick={()=>void apply()}>
            <Check size={15}/> {busy?'Preparing…':'Use this framing'}</button>
        </footer>
        <small className="nj-framing-note">Editing happens on your device. Only the prepared image is uploaded, and existing NightJar moderation still applies.</small>
      </section>
    </div>,
    document.body,
  );
}
