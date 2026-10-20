/**
 * NightJar member-controlled image framing. Entirely local: approved images,
 * moderation state, age checks and Storage permissions remain unchanged.
 */
export type FramingMode = 'fit' | 'fill';
export type ImageFraming = {mode:FramingMode;zoom:number;x:number;y:number};
export const DEFAULT_IMAGE_FRAMING:ImageFraming={mode:'fit',zoom:1,x:0,y:0};
export const clampFraming=(value:number,min:number,max:number)=>
  Math.min(max,Math.max(min,Number.isFinite(value)?value:min));

export function frameGeometry(
  sourceWidth:number,sourceHeight:number,frameWidth:number,frameHeight:number,
  framing:ImageFraming,
){
  if(![sourceWidth,sourceHeight,frameWidth,frameHeight].every(value=>Number.isFinite(value)&&value>0))
    throw new Error('This image has invalid dimensions.');
  const scale=(framing.mode==='fill'
    ?Math.max(frameWidth/sourceWidth,frameHeight/sourceHeight)
    :Math.min(frameWidth/sourceWidth,frameHeight/sourceHeight))*clampFraming(framing.zoom,1,3);
  const width=sourceWidth*scale,height=sourceHeight*scale;
  const extraX=Math.max(0,width-frameWidth);
  const extraY=Math.max(0,height-frameHeight);
  const x=(frameWidth-width)/2 - extraX*clampFraming(framing.x,-100,100)/200;
  const y=(frameHeight-height)/2 - extraY*clampFraming(framing.y,-100,100)/200;
  return {x,y,width,height,extraX,extraY,scale};
}

export function paintFramedImage(
  context:CanvasRenderingContext2D,image:CanvasImageSource,
  sourceWidth:number,sourceHeight:number,frameWidth:number,frameHeight:number,
  framing:ImageFraming,
){
  const g=frameGeometry(sourceWidth,sourceHeight,frameWidth,frameHeight,framing);
  context.clearRect(0,0,frameWidth,frameHeight);
  // Solid Midnight Gold backing is intentional for users who choose to
  // preserve the full picture rather than cutting it to the target shape.
  context.fillStyle='#151119';
  context.fillRect(0,0,frameWidth,frameHeight);
  context.imageSmoothingEnabled=true;
  context.imageSmoothingQuality='high';
  context.drawImage(image,g.x,g.y,g.width,g.height);
  return g;
}

export async function exportFramedImage(
  image:HTMLImageElement,framing:ImageFraming,aspect:'square'|'banner',fileName:string,
):Promise<File>{
  const canvas=document.createElement('canvas');
  canvas.width=aspect==='banner'?1408:768;
  canvas.height=aspect==='banner'?616:768; // Matches Nightjar's 16:7 cover frame.
  const context=canvas.getContext('2d');
  if(!context)throw new Error('Your browser cannot prepare a framed photo.');
  paintFramedImage(context,image,image.naturalWidth,image.naturalHeight,
    canvas.width,canvas.height,framing);
  const encode=(type:string,quality:number)=>new Promise<Blob>((resolve,reject)=>
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not prepare the edited image.')),type,quality));
  let blob=await encode('image/webp',.9);
  if(blob.type!=='image/webp')blob=await encode('image/jpeg',.9);
  if(!['image/jpeg','image/webp'].includes(blob.type))
    throw new Error('Your browser could not create a supported edited picture.');
  const name=(fileName.replace(/\.[^.]+$/,'').slice(0,100)||'nightjar-image')+'-framed'+
    (blob.type==='image/webp'?'.webp':'.jpg');
  return new File([blob],name,{type:blob.type,lastModified:Date.now()});
}
