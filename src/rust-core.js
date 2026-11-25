// The app's Rust code (rust/stm-core, built to WebAssembly by scripts/build-rust.mjs). New and changed features are
// written in Rust (the user's decision of 2026-11-25) and called from here: rustCall(name, args) → the function's
// result, or an Error with the function's message. The module is instantiated synchronously when this file loads,
// in the renderer and in Node alike (the page's CSP allows it with 'wasm-unsafe-eval').
import {WASM_BASE64} from './rust/stm-core.wasm.js';

const bytes=Uint8Array.from(atob(WASM_BASE64),c=>c.charCodeAt(0));
const {exports:wasm}=new WebAssembly.Instance(new WebAssembly.Module(bytes),{});
const encoder=new TextEncoder(),decoder=new TextDecoder();

export function rustCall(name,args={}){
 const request=encoder.encode(JSON.stringify({fn:name,args})),input=wasm.stm_alloc(request.length);
 // The memory may grow in a call: take a fresh view of the buffer each time.
 new Uint8Array(wasm.memory.buffer,input,request.length).set(request);
 const packed=wasm.stm_call(input,request.length);
 wasm.stm_free(input,request.length);
 const address=Number(packed>>32n),length=Number(packed&0xffffffffn);
 const answer=JSON.parse(decoder.decode(new Uint8Array(wasm.memory.buffer,address,length)));
 wasm.stm_free(address,length);
 if('error' in answer)throw new Error(answer.error);
 return answer.ok;
}

/** GPIO pins of an MCU family (rust/stm-core/src/family.rs): a new frozen array, never shared with a board's list. */
export const familyGpioPins=family=>Object.freeze(rustCall('family_gpio_pins',{family}));
/** Pinout settings a new STM32 project starts with (rust/stm-core/src/family.rs new_project_mcu): no pins, the
 *  family's default clock and "주변장치별 .c/.h로 생성" on (feature 51). A new object each call. */
export const newProjectMcu=family=>rustCall('new_project_mcu',{family});
/** The header CubeMX writes on top of a file it generates (rust/stm-core/src/explorer.rs; feature 56). */
const headers=new Map();
export function cubeHeader(file,brief){const key=file+'\n'+brief;if(!headers.has(key))headers.set(key,rustCall('cube_header',{file,brief}));return headers.get(key);}
/** Measuring the duty of a pin a program switches fast (rust/stm-core/src/duty.rs; feature 57). Called for every pin
 *  write of a running program, so these are the module's numeric exports, not JSON requests. */
export const duty=Object.freeze({slot:us=>wasm.stm_duty_slot(us),level:(slot,us,high)=>wasm.stm_duty_level(slot,us,high),frame:(slot,us)=>wasm.stm_duty_frame(slot,us),frequency:slot=>wasm.stm_duty_frequency(slot),reset:(slot,us)=>wasm.stm_duty_reset(slot,us)});
