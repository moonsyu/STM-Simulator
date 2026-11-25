// Feature 57: a GPIO output the program switches faster than the screen is drawn is shown with its duty — an LED on it
// looks dimmer, as on a real board, instead of flickering with whatever level the pin had when a frame was drawn. The
// simulators did that for timer PWM pins only. The measuring is in Rust (rust/stm-core/src/duty.rs); a slow blink
// (HAL_Delay of 500 ms) stays a blink.
import {duty} from './rust-core.js';

export class PinDuty{
 constructor(){this.slots=new Map();this.highVolts=new Map();}
 /** A program wrote `value` volts to `pin` at `us` (µs of simulated time). */
 level(pin,us,value){
  let slot=this.slots.get(pin);if(slot===undefined){slot=duty.slot(us);this.slots.set(pin,slot);}
  if(value>0)this.highVolts.set(pin,value);
  duty.level(slot,us,value>0?1:0);
 }
 /** The pin is not driven by plain writes any more (a timer output, an input): nothing is measured until it is. */
 clear(pin,us){const slot=this.slots.get(pin);if(slot!==undefined)duty.reset(slot,us);}
 /** Ends the frame at `us`. → the GPIO states to show: `gpio` with the fast pins as averaged outputs (`pwm: {duty,
  *  frequency}`, `value` the average voltage, as a timer PWM pin has them), or null when no pin switched fast. */
 frame(gpio,us){
  let view=null;
  for(const [pin,slot]of this.slots){
   const share=duty.frame(slot,us),g=gpio[pin];
   if(share<=0||share>=1||g?.mode!=='OUTPUT'||g.pwm)continue;
   view??={...gpio};view[pin]={...g,value:(this.highVolts.get(pin)??3.3)*share,pwm:{duty:share,frequency:duty.frequency(slot)}};
  }
  return view;
 }
}
/** The result a frame shows: the electrical state of the averaged solve with what the session added to its own
 *  result (display contents, device states) kept. */
export function shownResult(result,averaged){
 if(!averaged||averaged.fault)return result;
 const parts={...result.parts};
 // A part keeps the shape the session gave it (a servo's or a display's state replaces the plain reading): only what
 // it already shows is taken from the averaged solve.
 for(const [id,read]of Object.entries(averaged.parts)){
  const own=parts[id];if(!own){parts[id]=read;continue;}
  // The electrical reading, and for an LED (or a part of LEDs) whether it is lit; a device's own state stays.
  const lights=read.led||(read.channels&&Object.values(read.channels).some(c=>c.led));
  const next={...own};for(const key of lights?['voltage','current','power','on','channels']:['voltage','current','power'])if(key in own&&read[key]!==undefined)next[key]=read[key];parts[id]=next;
 }
 return {...result,...averaged,parts};
}
