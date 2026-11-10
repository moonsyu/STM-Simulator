import {readElement,checkRange} from './hal-memory.js';
// DAC (NUCLEO-F446RE) on the built-in interpreter: OUT1 (PA4) / OUT2 (PA5) drive their pin with DOR / 4095 × 3.3 V.
// Without a trigger HAL_DAC_SetValue appears at once; with a timer TRGO trigger each update event moves the data (and
// the noise / triangle wave) to the output, and HAL_DAC_Start_DMA feeds the data from memory through the linked DMA
// stream (DAC1 = DMA1 stream 5, DAC2 = stream 6, channel 7). The software trigger converts once per HAL_DAC_Start.
const TRIGGERS={0:'NONE',0x04:'T6_TRGO',0x0c:'T8_TRGO',0x14:'T7_TRGO',0x1c:'T5_TRGO',0x24:'T2_TRGO',0x2c:'T4_TRGO',0x34:'EXT_IT9',0x3c:'SOFTWARE'};
export const DAC_HAL_CONSTANTS={DAC:'DAC',DAC_CHANNEL_1:0,DAC_CHANNEL_2:0x10,DAC_ALIGN_12B_R:0,DAC_ALIGN_12B_L:4,DAC_ALIGN_8B_R:8,DAC_OUTPUTBUFFER_ENABLE:0,DAC_OUTPUTBUFFER_DISABLE:2,
 ...Object.fromEntries(Object.entries(TRIGGERS).map(([v,n])=>['DAC_TRIGGER_'+n,Number(v)])),
 ...Object.fromEntries(Array.from({length:12},(_,i)=>[`DAC_TRIANGLEAMPLITUDE_${2**(i+1)-1}`,i<<8])),
 ...Object.fromEntries(Array.from({length:12},(_,i)=>[i?`DAC_LFSRUNMASK_BITS${i}_0`:'DAC_LFSRUNMASK_BIT0',i<<8])),
 HAL_DAC_STATE_RESET:0,HAL_DAC_STATE_READY:1,HAL_DAC_STATE_BUSY:2,HAL_DAC_STATE_TIMEOUT:3,HAL_DAC_STATE_ERROR:4,HAL_DAC_ERROR_NONE:0,HAL_DAC_ERROR_DMAUNDERRUNCH1:1,HAL_DAC_ERROR_DMAUNDERRUNCH2:2};
// Highest update rate the circuit simulator follows (each sample re-solves the circuit); the emulator has no such limit.
const MAX_HZ=5000;
export class HalDac{
 constructor(hal){this.hal=hal;this.ch=[null,null];this.inited=false;}
 handle(ptr,r){
  const h=r.get(r.pointerCell(ptr));if(h?.type!=='DAC_HandleTypeDef')throw new Error('DAC_HandleTypeDef 포인터가 필요합니다.');
  if(this.hal.field(h,'Instance')!=='DAC'||!this.hal.config.peripherals.DAC?.enabled)throw new Error('DAC: Pinout & Configuration에서 DAC를 활성화하세요.');return h;
 }
 index(v){if(v!==0&&v!==0x10)throw new Error('DAC 채널은 DAC_CHANNEL_1 또는 DAC_CHANNEL_2입니다.');return v?1:0;}
 channel(i){const c=this.ch[i];if(!c)throw new Error(`DAC: HAL_DAC_ConfigChannel(DAC_CHANNEL_${i+1})이 필요합니다.`);return c;}
 output(c,r){
  const v=c.dor/4095*3.3;if(r.gpio[c.pin]?.mode==='OUTPUT'&&r.gpio[c.pin].value===v)return;
  r.api.beforeChange?.(r.microTime);r.gpio[c.pin]={mode:'OUTPUT',value:v};r.api.changed?.(r.microTime);
 }
 // One triggered conversion: DOR = DHR (+ wave), as the emulator's dac.js.
 convert(c,r){
  const mask=(1<<(c.amp+1))-1;let v=c.dhr;
  if(c.wave==='NOISE'){const l=c.lfsr,fb=((l>>11)^(l>>5)^(l>>3)^l)&1;c.lfsr=((l<<1)|fb)&0xfff;v=Math.min(0xfff,v+(c.lfsr&mask));}
  else if(c.wave==='TRIANGLE'){const t=c.tri;v=Math.min(0xfff,v+t.v);if(t.up){if(t.v>=mask){t.up=false;t.v--;}else t.v++;}else if(t.v<=0){t.up=true;t.v++;}else t.v--;}
  c.dor=v;this.output(c,r);
 }
 // Update period (µs) of the TRGO timer of a channel's trigger, or null while that timer is not counting.
 timerUs(c){
  const id=/^T(\d)_TRGO$/.exec(c.trigger)?.[1];if(!id)return null;const t=this.hal.timerModel,s=t.states.get('TIM'+id);
  if(!s?.active)return null;if(s.trgo!==32)throw new Error(`DAC ${c.name}: TIM${id}의 TRGO를 Update Event로 설정하세요(HAL_TIMEx_MasterConfigSynchronization, Pinout TIM${id} Trigger Event Selection).`);
  const hz=t.hz(s)/t.period(s);if(hz>MAX_HZ)throw new Error(`DAC ${c.name}: 회로 시뮬레이터는 DAC 갱신을 ${MAX_HZ} Hz까지 따라갑니다(현재 TIM${id} ${Math.round(hz)} Hz). Prescaler/Period를 키우거나 펌웨어 에뮬레이터로 실행하세요.`);
  return 1e6/hz;
 }
 // A started channel with a timer trigger begins when its timer counts (poll), one conversion per update event.
 arm(c,r){
  if(c.running||!c.on||!/_TRGO$/.test(c.trigger))return;const us=this.timerUs(c);if(us===null)return;c.running=true;const gen=++c.gen,hal=this.hal;
  if(c.dma){const self=this,dma=hal.dma,d=c.dma;dma.start(r,d.link,{count:d.count,itemUs:us,item:i=>{self.convert(c,r);c.dhr=self.align(readElement(r,d.ptr,i,d.width),d.align);},
   onHalf:function*(){yield* hal.userCall(r,c.i?'HAL_DACEx_ConvHalfCpltCallbackCh2':'HAL_DAC_ConvHalfCpltCallbackCh1',[c.handle]);},onComplete:function*(){yield* hal.userCall(r,c.i?'HAL_DACEx_ConvCpltCallbackCh2':'HAL_DAC_ConvCpltCallbackCh1',[c.handle]);},
   onDone:()=>{if(!d.link.st.circular){dma.stop(d.link.st);c.dma=null;c.running=false;}}});return;}
  const tick=()=>{if(gen!==c.gen||!c.on)return;if(this.timerUs(c)===null){c.running=false;return;}this.convert(c,r);r.event(r.microTime/1000+us/1000,tick);};
  r.event(r.microTime/1000+us/1000,tick);
 }
 poll(r){for(const c of this.ch)if(c&&c.on&&!c.running)this.arm(c,r);}
 align(v,align){if(align===4)return (v>>>4)&0xfff;if(align===8)return (v&0xff)<<4;if(align===0)return v&0xfff;throw new Error('DAC 정렬은 DAC_ALIGN_12B_R / 12B_L / 8B_R입니다.');}
 // HAL_DAC_IRQHandler (in the generated TIM6_DAC_IRQHandler) serves the DMA underrun interrupt, which this model never
 // raises: the call is accepted and does nothing.
 invoke(name,args,r){if(name!=='HAL_DAC_IRQHandler')return null;this.handle(args[0],r);return (function*(){return 0;})();}
 call(name,args,r){
  if(!/^HAL_DAC(Ex)?_/.test(name))return undefined;
  const hal=this.hal,[a,b,c,d,e]=args,h=this.handle(a,r);
  if(name==='HAL_DAC_Init'){hal.callback(r,'HAL_DAC_MspInit',[a]);this.inited=true;if(h.fields.State)h.fields.State.value=1;return 0;}
  if(!this.inited)throw new Error('DAC: HAL_DAC_Init이 필요합니다.');
  if(name==='HAL_DAC_ConfigChannel'){
   const i=this.index(c),cfg=r.get(r.pointerCell(b)),trigger=TRIGGERS[hal.field(cfg,'DAC_Trigger')];if(!trigger)throw new Error('DAC_Trigger 값을 확인하세요.');
   if(this.ch[i]?.on)throw new Error(`DAC_CHANNEL_${i+1}: 채널을 멈춘 뒤 설정하세요.`);
   if(['T8_TRGO','EXT_IT9'].includes(trigger))throw new Error(`DAC ${trigger}: 내장 해석기는 TIM6/7/2/4/5 TRGO와 소프트웨어 트리거를 지원합니다. ARM GCC 시뮬레이터로 실행하세요.`);
   this.ch[i]={i,name:'OUT'+(i+1),pin:hal.pinFor('DAC_OUT'+(i+1)),trigger,wave:null,amp:0,dhr:0,dor:0,lfsr:0xaaa,tri:{v:0,up:true},on:false,running:false,gen:0,handle:a,dma:null};return 0;
  }
  if(name==='HAL_DACEx_TriangleWaveGenerate'||name==='HAL_DACEx_NoiseWaveGenerate'){
   const ch=this.channel(this.index(b));if(!Number.isInteger(c)||c<0||c>0xb00||c&0xff)throw new Error('DAC 진폭은 DAC_TRIANGLEAMPLITUDE_* / DAC_LFSRUNMASK_*입니다.');
   if(ch.trigger==='NONE')throw new Error(`DAC ${ch.name}: 파형 생성은 트리거가 있어야 합니다(DAC_Trigger).`);
   ch.wave=name.includes('Triangle')?'TRIANGLE':'NOISE';ch.amp=c>>8;return 0;
  }
  if(name==='HAL_DAC_SetValue'){const ch=this.channel(this.index(b));ch.dhr=this.align(d,c);if(ch.on&&ch.trigger==='NONE'){ch.dor=ch.dhr;this.output(ch,r);}return 0;}
  if(name==='HAL_DAC_GetValue')return this.channel(this.index(b)).dor;
  if(name==='HAL_DAC_Start'||name==='HAL_DAC_Start_DMA'){
   const ch=this.channel(this.index(b));if(ch.on)return 2;
   if(name==='HAL_DAC_Start_DMA'){
    if(!/_TRGO$/.test(ch.trigger))throw new Error(`DAC ${ch.name}: DMA 출력은 타이머 TRGO 트리거로 씁니다(Pinout DAC Trigger).`);
    const req='DAC'+(ch.i+1),link=hal.dma.check(hal.dma.linked(r,h,'DMA_Handle'+(ch.i+1),req),req,0x40),w=hal.dma.widths(link.h);
    if(!Number.isInteger(d)||d<1||d>65535)throw new Error('DAC DMA 길이는 1~65535입니다.');checkRange(r,c,d*w.mem,'DAC DMA 버퍼');
    ch.dma={link,ptr:c,count:d,width:w.mem,align:e};
   }
   ch.on=true;ch.dor=ch.trigger==='NONE'?ch.dhr:ch.dor;this.output(ch,r);if(ch.trigger==='SOFTWARE')this.convert(ch,r);this.arm(ch,r);return 0;
  }
  if(name==='HAL_DAC_Stop'||name==='HAL_DAC_Stop_DMA'){
   const ch=this.channel(this.index(b));ch.on=false;ch.running=false;ch.gen++;if(ch.dma){hal.dma.stop(ch.dma.link.st);ch.dma=null;}
   r.api.beforeChange?.(r.microTime);r.gpio[ch.pin]={mode:'ANALOG',value:0};r.api.changed?.(r.microTime);return 0;
  }
  if(name==='HAL_DAC_MspInit'||name==='HAL_DAC_MspDeInit')return 0;
  throw new Error(`${name}: 내장 해석기에서 지원하지 않는 DAC 함수입니다. ARM GCC 시뮬레이터로 실행하세요.`);
 }
}
