// Per-MCU-family profiles. `mcu.family` in a project selects one: the STM32F446RE (the original model) or the
// STM32F103RB (NUCLEO-F103RB). Everything that differs between the two (pin routes, how a pin gets an alternate
// function, IRQ names and numbers, DMA units, clocks, GPIO set) is in the profile, so the Pinout, validator, generator
// and interpreter share it. The data and the code are in Rust (rust/stm-core/src/mcu.rs; feature 62): this file is
// what the JavaScript callers import.
import {rustCall,rustFn,rustPure,deepFreeze} from './rust-core.js';

const T=rustCall('family_tables',[]);
const timerMaxOf=rustPure('family_timer_max'),clockValidOf=rustPure('family_clock_valid');
// A profile as the callers use it: `timerMax(id)` and `clock.valid(hz)` are functions.
const profileOf=(id,data)=>{
 const out={};
 for(const [key,value]of Object.entries(data)){
  if(key==='timerMax')out[key]=timer=>timerMaxOf(id,String(timer));
  else if(key==='clock')out[key]={...value,valid:hz=>typeof hz==='number'&&clockValidOf(id,hz)};
  else out[key]=value;
 }
 return deepFreeze(out);
};
export const FAMILIES=Object.freeze(Object.fromEntries(Object.entries(T.profiles).map(([id,data])=>[id,profileOf(id,data)])));
export const DEFAULT_FAMILY=T.default;
export function familyProfile(id=DEFAULT_FAMILY){const f=FAMILIES[id];if(!f)throw new Error(`지원하지 않는 MCU입니다: ${id}`);return f;}
const ROUTES=deepFreeze(T.routes);
/** Pin routes of every peripheral of a family, as {PERIPHERAL:{SIGNAL:[pins]}}. */
export function routesOf(id=DEFAULT_FAMILY){return ROUTES[familyProfile(id).id];}
export const serialIdsOf=id=>[...T.serialIds[familyProfile(id).id]];
export const timerIdsOf=id=>[...T.timerIds[familyProfile(id).id]];
export const irqNamesOf=id=>[...T.irqNames[familyProfile(id).id]];
/** F1: the remap option a peripheral's assigned signals select, or null when the pins mix options. */
export function remapFor(id,peripheral,assigned){
 const f=familyProfile(id),index=rustFn('remap_for',f.id,String(peripheral),assigned);
 return index===null?null:f.remaps[peripheral][index];
}
