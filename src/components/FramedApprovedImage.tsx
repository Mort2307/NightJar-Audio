import {useEffect,useRef,useState, type CSSProperties} from 'react';
import {DEFAULT_IMAGE_FRAMING,frameGeometry,type ImageFraming} from '../platform/image-framing';

// A display-only viewport: never reads back pixel data or modifies approved bytes.
// Uses the same geometry as the member Image Studio preview.
type Props={
  src:string;
  alt:string;
  className?:string;
  imgClassName?:string;
  framing?:ImageFraming|null;
  defaultMode?:'fit'|'fill';
  absolute?:boolean;
  zIndex?:number;
  onLoad?:(image:HTMLImageElement)=>void;
};
const valid=(framing:ImageFraming|null|undefined):framing is ImageFraming=>
  !!framing&&(framing.mode==='fit'||framing.mode==='fill')
  &&[framing.zoom,framing.x,framing.y].every(Number.isFinite)
  &&framing.zoom>=1&&framing.zoom<=3
  &&Math.abs(framing.x)<=100&&Math.abs(framing.y)<=100;

export default function FramedApprovedImage({src,alt,className,imgClassName,framing,
  defaultMode='fit',absolute=false,zIndex,onLoad}:Props){
  const viewport=useRef<HTMLSpanElement|null>(null);
  const [size,setSize]=useState({width:0,height:0});
  const [natural,setNatural]=useState({width:0,height:0});
  useEffect(()=>{
    const element=viewport.current;
    if(!element)return;
    const measure=()=>{const rect=element.getBoundingClientRect();
      setSize({width:rect.width,height:rect.height});};
    measure();
    if(typeof ResizeObserver==='undefined'){
      window.addEventListener('resize',measure);
      return ()=>window.removeEventListener('resize',measure);
    }
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  useEffect(()=>setNatural({width:0,height:0}),[src]);
  const current:ImageFraming=valid(framing)?framing:{...DEFAULT_IMAGE_FRAMING,mode:defaultMode};
  const geometry=size.width>0&&size.height>0&&natural.width>0&&natural.height>0
    ?frameGeometry(natural.width,natural.height,size.width,size.height,current)
    :null;
  const imageStyle:CSSProperties=geometry
    ?{position:'absolute',inset:'auto',left:geometry.x,top:geometry.y,
      width:geometry.width,height:geometry.height,maxWidth:'none',maxHeight:'none',
      objectFit:'fill',objectPosition:'center',transform:'none'}
    :{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:current.mode==='fill'?'cover':'contain'};
  return <span ref={viewport} className={className}
    style={{position:absolute?'absolute':'relative',display:'block',
      inset:absolute?0:undefined,width:'100%',height:'100%',overflow:'hidden',
      background:'#151119',zIndex}}>
    <img src={src} alt={alt} className={imgClassName} loading="lazy" decoding="async"
      style={imageStyle} onLoad={event=>{
        const image=event.currentTarget;
        setNatural({width:image.naturalWidth,height:image.naturalHeight});
        onLoad?.(image);
      }}/>
  </span>;
}
