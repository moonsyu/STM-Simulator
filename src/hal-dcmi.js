import {cameraConfig,renderFrame,sensorBytes,decodeImageSync,decodeImageAsync,CAMERA_FPS} from './camera.js';
import {writeBytes,byteLength} from './hal-memory.js';
// DCMI + DMA capture from the OV2640 camera model into the user's frame buffer, line by line.
// Pixel data pins are not routed on the LQFP64 board model (they collide with I2C1); the camera must
// be powered, clocked from MCO (PA8) and out of reset/power-down, and SCCB configures size/format.
export const DCMI_CONSTANTS={DCMI:'DCMI',DCMI_MODE_CONTINUOUS:0,DCMI_MODE_SNAPSHOT:2,DCMI_SYNCHRO_HARDWARE:0,DCMI_SYNCHRO_EMBEDDED:0x10,DCMI_PCKPOLARITY_FALLING:0,DCMI_PCKPOLARITY_RISING:0x20,
 DCMI_VSPOLARITY_LOW:0,DCMI_VSPOLARITY_HIGH:0x80,DCMI_HSPOLARITY_LOW:0,DCMI_HSPOLARITY_HIGH:0x40,DCMI_CR_ALL_FRAME:0,DCMI_CR_ALTERNATE_2_FRAME:0x100,DCMI_CR_ALTERNATE_4_FRAME:0x200,
 DCMI_EXTEND_DATA_8B:0,DCMI_JPEG_DISABLE:0,DCMI_JPEG_ENABLE:8,DCMI_BSM_ALL:0,DCMI_OEBS_ODD:0,DCMI_LSM_ALL:0,DCMI_OELS_ODD:0,
 DCMI_IT_FRAME:1,DCMI_IT_OVR:2,DCMI_IT_ERR:4,DCMI_IT_VSYNC:8,DCMI_IT_LINE:16,HAL_DCMI_STATE_RESET:0,HAL_DCMI_STATE_READY:1,HAL_DCMI_STATE_BUSY:2,HAL_DCMI_STATE_SUSPENDED:4,HAL_DCMI_ERROR_NONE:0,HAL_DCMI_ERROR_OVR:1,HAL_DCMI_ERROR_SYNC:2,HAL_DCMI_ERROR_TIMEOUT:0x20};
export class HalDcmi{
 constructor(hal){this.hal=hal;this.images=new Map();this.frames=new Map();this.capture=null;this.it=0;this.api=this.publicApi();}
 publicApi(){return {setImage:(partId,image)=>{if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||!(image.rgba?.length>=image.width*image.height*4))throw new Error('카메라 이미지 형식을 확인하세요.');this.images.set(partId,image);},frame:partId=>this.frames.get(partId)??null,cameras:()=>this.cameras().map(p=>p.id)};}
 cameras(){return this.hal.buses.project.components.filter(p=>p.catalogVariant==='ov2640-camera');}
 camera(){const bus=this.hal.buses;return this.cameras().find(p=>bus.powered(p));}
 image(p){
  if(this.images.has(p.id))return this.images.get(p.id);if(!p.image)return null;
  const sync=decodeImageSync(p.image);if(sync){this.images.set(p.id,sync);return sync;}
  if(!this.decoding?.has(p.id)){(this.decoding??=new Set()).add(p.id);decodeImageAsync(p.image).then(img=>{if(img)this.images.set(p.id,img);}).catch(()=>{});}
  return null;
 }
 framePeriod(){return 1e6/CAMERA_FPS;}
 // The sensor view at time `us` (also used for the live preview while no capture runs).
 sensorFrame(p,us){
  const n=Math.floor(us/this.framePeriod()),cached=this.frames.get(p.id),cfg=cameraConfig(this.hal.buses.devices.state(p)),pattern=p.pattern||'colorbars';
  if(cached&&cached.index===n&&cached.width===cfg.width&&cached.height===cfg.height&&cached.format===cfg.format&&cached.pattern===pattern&&cached.hasImage===!!this.images.get(p.id))return cached;
  const frame={width:cfg.width,height:cfg.height,format:cfg.format,swap:cfg.swap,pattern,index:n,at:n*this.framePeriod(),hasImage:false,rgba:null};
  const img=pattern==='image'?this.image(p):null;frame.hasImage=!!img;frame.rgba=renderFrame(cfg.width,cfg.height,img||pattern!=='image'?pattern:'colorbars',n,img);
  this.frames.set(p.id,frame);return frame;
 }
 update(result,micros){
  if(!result)return;for(const p of this.cameras()){const powered=this.hal.buses.powered(p);if(!powered)continue;const f=this.sensorFrame(p,micros);
   (result.parts[p.id]??={}).frame={width:f.width,height:f.height,format:f.format,rgba:f.rgba,index:f.index,captured:this.lastCaptured?.part===p.id?this.lastCaptured.index:null,pattern:f.pattern};}
 }
 handle(ptr,r){const h=r.get(r.pointerCell(ptr));if(h?.type!=='DCMI_HandleTypeDef')throw new Error('DCMI_HandleTypeDef 포인터가 필요합니다.');return h;}
 invoke(name,args,r){if(name==='HAL_DCMI_IRQHandler'){this.handle(args[0],r);return this.hal.drain(r,'DCMI_IRQn');}return null;}
 call(name,args,r){
  if(!name.startsWith('HAL_DCMI_')&&!name.startsWith('__HAL_DCMI_')&&name!=='__HAL_RCC_DCMI_CLK_ENABLE')return undefined;
  const hal=this.hal,[a,b,c,d]=args;if(name==='__HAL_RCC_DCMI_CLK_ENABLE')return 0;
  const h=this.handle(a,r),set=(k,v)=>h.fields[k].value=v;
  if(name==='HAL_DCMI_Init'){
   if(hal.field(h,'Instance')!=='DCMI'||!hal.config.peripherals.DCMI?.enabled)throw new Error('DCMI: Pinout & Configuration에서 DCMI를 활성화하세요.');
   const init=hal.field(h,'Init'),get=k=>hal.field(init,k);if(get('SynchroMode')||get('ExtendedDataMode')||get('CaptureRate'))throw new Error('DCMI: 하드웨어 동기, 8비트, 모든 프레임 캡처를 지원합니다.');
   this.jpeg=!!get('JPEGMode');hal.callback(r,'HAL_DCMI_MspInit',[a]);set('State',1);set('ErrorCode',0);this.handlePtr=a;this.inited=h;return 0;
  }
  if(this.inited!==h)throw new Error('DCMI: HAL_DCMI_Init이 필요합니다.');
  if(name==='__HAL_DCMI_ENABLE_IT'){this.it|=b;return 0;}if(name==='__HAL_DCMI_DISABLE_IT'){this.it&=~b;return 0;}
  if(name==='HAL_DCMI_GetState')return h.fields.State.value;if(name==='HAL_DCMI_GetError')return h.fields.ErrorCode.value;
  if(name==='HAL_DCMI_Stop'||name==='HAL_DCMI_DeInit'){if(this.capture){this.capture.active=false;hal.dma.stop(this.capture.st);this.capture=null;}set('State',name==='HAL_DCMI_DeInit'?0:1);return 0;}
  if(name==='HAL_DCMI_Suspend'){if(this.capture)this.capture.suspended=true;set('State',4);return 0;}
  if(name==='HAL_DCMI_Resume'){if(this.capture)this.capture.suspended=false;set('State',2);return 0;}
  if(name==='HAL_DCMI_Start_DMA'){
   if(this.capture)return 2;if(![0,2].includes(b))throw new Error('DCMI_MODE_CONTINUOUS 또는 DCMI_MODE_SNAPSHOT을 사용하세요.');if(!Number.isInteger(d)||d<1||d>0x3fffc)throw new Error('DCMI DMA 길이(32비트 워드 수)를 확인하세요.');
   const link=hal.dma.check(hal.dma.linked(r,h,'DMA_Handle','DCMI'),'DCMI',0),capacity=Math.min(d*4,byteLength(r,c));
   hal.noticeIrq.add('DCMI_IRQn');this.it|=1|4|2;const cap={active:true,snapshot:b===2,buffer:c,capacity,st:link.st,ptr:a,frames:0};this.capture=cap;set('State',2);
   Object.assign(link.st,{busy:true,count:d,index:0,remaining:d,gen:link.st.gen+1});link.h.fields.State.value=2;
   const start=Math.ceil((r.microTime+1)/this.framePeriod())*this.framePeriod();r.event(start/1000,()=>this.frame(r,cap,start));return 0;
  }
  if(name==='HAL_DCMI_ConfigCrop'||name==='HAL_DCMI_EnableCrop'||name==='HAL_DCMI_DisableCrop')return 0;
  throw new Error(`지원하지 않는 HAL API: ${name}`);
 }
 job(r,cap,cb,args=[]){const hal=this.hal;return function*(){yield* hal.userCall(r,cb,[cap.ptr,...args]);};}
 frame(r,cap,start){
  const hal=this.hal;if(this.capture!==cap||!cap.active)return;
  const p=this.camera();
  if(!p||cap.suspended){r.event((start+this.framePeriod())/1000,()=>this.frame(r,cap,start+this.framePeriod()));return;}// no VSYNC: DCMI keeps waiting
  const f=this.sensorFrame(p,start),cfg={width:f.width,height:f.height,format:f.format,swap:f.swap},bytes=sensorBytes(cfg,f.rgba,f.index);
  if(this.jpeg!==(cfg.format==='JPEG'))r.warn(`[DCMI] JPEGMode(${this.jpeg?'ENABLE':'DISABLE'})와 카메라 출력 형식(${cfg.format})이 다릅니다.`);
  if(this.it&8)hal.queue('DCMI_IRQn',this.job(r,cap,'HAL_DCMI_VsyncEventCallback'),'DCMI:vsync');
  const lines=cfg.format==='JPEG'?1:cfg.height,lineBytes=Math.ceil(bytes.length/lines),lineUs=this.framePeriod()*.9/lines,chunk=this.it&16?1:Math.max(1,Math.floor(500/lineUs));let line=0,overrun=false;
  const step=()=>{
   if(this.capture!==cap||!cap.active)return;
   const end=Math.min(lines,line+chunk);
   for(;line<end;line++){
    const off=line*lineBytes,part=bytes.subarray(off,Math.min(bytes.length,off+lineBytes)),room=Math.max(0,cap.capacity-off),write=part.subarray(0,room);
    if(write.length)writeBytes(r,cap.buffer,off,[...write]);if(write.length<part.length)overrun=true;
    cap.st.remaining=Math.max(0,cap.st.count-Math.ceil(Math.min(cap.capacity,off+part.length)/4));
    if(this.it&16)hal.queue('DCMI_IRQn',this.job(r,cap,'HAL_DCMI_LineEventCallback'),'DCMI:line');
   }
   if(line<lines){r.event((start+(line+chunk>lines?lines:line+chunk)*lineUs)/1000,step);return;}
   cap.frames++;this.lastCaptured={part:p.id,index:f.index,bytes:Math.min(bytes.length,cap.capacity),width:cfg.width,height:cfg.height,format:cfg.format};
   hal.buses.report(r,'DCMI',`frame ${f.index} · ${cfg.width}×${cfg.height} ${cfg.format} · ${Math.min(bytes.length,cap.capacity)} B${overrun?' · buffer overrun':''}`);
   if(overrun){const h=r.get(r.pointerCell(cap.ptr));h.fields.ErrorCode.value|=1;hal.queue('DCMI_IRQn',this.job(r,cap,'HAL_DCMI_ErrorCallback'),'DCMI:error');}
   if(this.it&1)hal.queue('DCMI_IRQn',this.job(r,cap,'HAL_DCMI_FrameEventCallback'),'DCMI:frame');
   if(cap.snapshot){cap.active=false;this.capture=null;cap.st.busy=false;cap.st.handle&&(cap.st.handle.fields.State.value=1);r.get(r.pointerCell(cap.ptr)).fields.State.value=1;}
   else{cap.st.remaining=cap.st.count;const next=start+this.framePeriod();r.event(next/1000,()=>this.frame(r,cap,next));}
  };
  r.event((start+Math.min(lines,chunk)*lineUs)/1000,step);
 }
}
