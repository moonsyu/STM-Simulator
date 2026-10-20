// Camera sensor model (OV2640 subset): output size/format from the SCCB registers the firmware
// wrote, test-pattern / user-image frame generation, and sensor byte streams for DCMI capture.
export const CAMERA_PATTERNS=['colorbars','gradient','ball','image'];
export const CAMERA_FPS=15;
// DSP bank (0xFF=0): 0xDA IMAGE_MODE bit4 JPEG, bits3:2 0=YUV422 1=RAW10 2=RGB565, bit0 byte swap;
// 0x5A/0x5B/0x5C ZMOW/ZMOH/ZMHH output size in units of 4 pixels.
export function cameraConfig(state){
 const dsp=state?.cameraBanks?.[0]??new Uint8Array(256),mode=dsp[0xda],zmow=dsp[0x5a],zmoh=dsp[0x5b],zmhh=dsp[0x5c];
 let width=(zmow+((zmhh&3)<<8))*4,height=(zmoh+(((zmhh>>2)&1)<<8))*4;if(!width||!height){width=160;height=120;}
 const format=mode&0x10?'JPEG':((mode>>2)&3)===2?'RGB565':((mode>>2)&3)===1?'RAW10':'YUV422';
 return {width,height,format,swap:!!(mode&1)};
}
const BARS=[[255,255,255],[255,255,0],[0,255,255],[0,255,0],[255,0,255],[255,0,0],[0,0,255],[0,0,0]];
// RGBA frame for a pattern at frame index n.
export function renderFrame(width,height,pattern='colorbars',n=0,image=null){
 const rgba=new Uint8ClampedArray(width*height*4);
 const put=(i,r,g,b)=>{rgba[i]=r;rgba[i+1]=g;rgba[i+2]=b;rgba[i+3]=255;};
 if(pattern==='image'&&image?.rgba){for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=Math.min(image.width-1,Math.floor(x*image.width/width)),sy=Math.min(image.height-1,Math.floor(y*image.height/height)),s=(sy*image.width+sx)*4;put((y*width+x)*4,image.rgba[s],image.rgba[s+1],image.rgba[s+2]);}return rgba;}
 if(pattern==='gradient'){for(let y=0;y<height;y++)for(let x=0;x<width;x++){const v=(x*256/width+n*8)&255,w=(y*256/height)&255;put((y*width+x)*4,v,w,255-v);}return rgba;}
 if(pattern==='ball'){
  const r=Math.max(4,Math.round(Math.min(width,height)/8)),span=(len,k)=>{const range=len-2*r,p=(k%(2*range));return r+(p<range?p:2*range-p);},cx=span(width,n*3),cy=span(height,n*2);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const d=(x-cx)**2+(y-cy)**2,i=(y*width+x)*4;if(d<=r*r)put(i,255,96+Math.round(100*(1-d/(r*r))),32);else put(i,16,24+((x>>3)+(y>>3)&1)*16,48);}
  return rgba;
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const c=BARS[Math.min(7,Math.floor(x*8/width))];put((y*width+x)*4,...c);}
 return rgba;
}
export const rgb565=(r,g,b)=>((r&0xf8)<<8)|((g&0xfc)<<3)|(b>>3);
// Bytes as they appear on the DVP bus (and therefore in memory after DCMI DMA).
export function sensorBytes(cfg,rgba,n=0){
 const {width,height,format,swap}=cfg;
 if(format==='JPEG'){const text=[...`STM-Simulator ${width}x${height} frame ${n}`].map(c=>c.charCodeAt(0));return Uint8Array.from([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xfe,0,text.length+2,...text,0xff,0xd9]);}
 if(format==='RGB565'||format==='RAW10'){const out=new Uint8Array(width*height*2);for(let p=0,i=0;p<width*height;p++,i+=4){const v=rgb565(rgba[i],rgba[i+1],rgba[i+2]);out[p*2+(swap?1:0)]=v>>8;out[p*2+(swap?0:1)]=v&255;}return out;}
 const out=new Uint8Array(width*height*2),yuv=i=>{const r=rgba[i],g=rgba[i+1],b=rgba[i+2];return [Math.round(.299*r+.587*g+.114*b),Math.round(128-.169*r-.331*g+.5*b),Math.round(128+.5*r-.419*g-.081*b)];};
 for(let p=0;p<width*height;p+=2){const a=yuv(p*4),b=yuv(p*4+4);out.set([a[0],Math.round((a[1]+b[1])/2),b[0],Math.round((a[2]+b[2])/2)],p*2);}return out;
}
// Synchronous decoder for uncompressed BMP data URLs (24/32-bit). Other formats are decoded by the UI
// (or decodeImageAsync in a browser) and supplied with session.camera.setImage(partId,imageData).
export function decodeImageSync(dataUrl){
 const m=/^data:image\/(?:bmp|x-ms-bmp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl||'');if(!m)return null;
 const bytes=Uint8Array.from(atob(m[1]),c=>c.charCodeAt(0)),dv=new DataView(bytes.buffer);if(bytes[0]!==0x42||bytes[1]!==0x4d)return null;
 const offset=dv.getUint32(10,true),width=dv.getInt32(18,true),h=dv.getInt32(22,true),bpp=dv.getUint16(28,true),height=Math.abs(h);if(![24,32].includes(bpp)||width<1||height<1||width*height>1<<20)return null;
 const stride=Math.ceil(width*bpp/32)*4,rgba=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const row=h>0?height-1-y:y,s=offset+row*stride+x*bpp/8,d=(y*width+x)*4;rgba[d]=bytes[s+2];rgba[d+1]=bytes[s+1];rgba[d+2]=bytes[s];rgba[d+3]=255;}
 return {width,height,rgba};
}
export async function decodeImageAsync(dataUrl){
 const sync=decodeImageSync(dataUrl);if(sync)return sync;if(typeof createImageBitmap!=='function'||typeof fetch!=='function')return null;
 const bitmap=await createImageBitmap(await (await fetch(dataUrl)).blob()),w=Math.min(bitmap.width,640),h=Math.min(bitmap.height,480);
 const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h}),ctx=canvas.getContext('2d');
 ctx.drawImage(bitmap,0,0,w,h);const data=ctx.getImageData(0,0,w,h);return {width:w,height:h,rgba:data.data};
}
export const validCameraImage=v=>v===''||typeof v==='string'&&v.length<=1500000&&/^data:image\/(png|jpeg|gif|webp|bmp|x-ms-bmp);base64,[A-Za-z0-9+/=]+$/.test(v);
