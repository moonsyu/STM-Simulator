// The app's Rust code (rust/stm-core, built to WebAssembly by scripts/build-rust.mjs). New and changed features are
// written in Rust (the user's decision of 2026-11-25) and called from here: rustCall(name, args) → the function's
// result, or an Error with the function's message. The module is instantiated synchronously when this file loads,
// in the renderer and in Node alike (the page's CSP allows it with 'wasm-unsafe-eval').
import {WASM_BASE64} from './rust/stm-core.wasm.js';

const bytes=Uint8Array.from(atob(WASM_BASE64),c=>c.charCodeAt(0));
// The module takes Math's transcendental functions from here (rust/stm-core/src/jsmath.rs): the numbers of code moved
// from JavaScript stay the same to the last digit.
const {exports:wasm}=new WebAssembly.Instance(new WebAssembly.Module(bytes),{math:{pow:Math.pow,exp:Math.exp,sin:Math.sin,cos:Math.cos,tan:Math.tan,atan:Math.atan,atan2:Math.atan2,hypot:Math.hypot}});
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

/** A Rust function of numbers that answers a number (the module's export `stm_<name>`): for what is called while a
 *  circuit is solved or drawn, where a JSON request for each call would be too slow. */
export const rustNumber=name=>{const f=wasm['stm_'+name];if(typeof f!=='function')throw new Error('stm-core: no numeric export '+name);return f;};
/** A Rust function that takes its arguments in order (the modules moved from JavaScript for feature 62). */
export const rustFn=(name,...args)=>rustCall(name,args);
const frozen=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(frozen);Object.freeze(value);}return value;};
/** The same for a function whose answer depends on its arguments only (names, table look-ups): each answer is asked
 *  for once and kept — these are called for every pin of every generated file and while a program runs. An answer
 *  that is an object or a list is frozen (it is shared by every caller). */
export function rustPure(name){
 const seen=new Map();
 return (...args)=>{
  const key=args.length===1&&typeof args[0]==='string'?args[0]:JSON.stringify(args);
  if(seen.has(key))return seen.get(key);
  const value=frozen(rustCall(name,args));seen.set(key,value);return value;
 };
}
// JSON has no NaN, no infinities and no `undefined`: where a module moved from JavaScript must tell them apart from null
// (a setting that is not a number is refused, not given its default), they travel as {"\u0001nf": "NaN"}.
const NF='\u0001nf';
/** A value for the Rust side with those kept: a number JSON cannot carry and an `undefined` argument or list item. */
export const sealed=v=>v===undefined?{[NF]:'undefined'}:typeof v==='number'?(Number.isFinite(v)?v:{[NF]:String(v)}):Array.isArray(v)?v.map(sealed):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).filter(([,x])=>typeof x!=='function').map(([k,x])=>[k,sealed(x)])):v;
const opened=v=>Array.isArray(v)?v.map(opened):v&&typeof v==='object'?(Object.hasOwn(v,NF)?(v[NF]==='undefined'?undefined:Number(v[NF])):Object.fromEntries(Object.entries(v).map(([k,x])=>[k,opened(x)]))):v;
/** A Rust function called with its arguments exactly as given (see `sealed`); its answer may hold such numbers too. */
export const rustExact=(name,...args)=>opened(rustCall(name,args.map(sealed)));
/** A table of a Rust module, read once and frozen. */
export const rustTable=name=>frozen(rustCall(name,[]));
/** Deep-freezes a value (tables built from a Rust answer). */
export const deepFreeze=frozen;
/** NaN for a number the Rust side could not send (JSON has no NaN: it arrives as null). */
export const orNaN=value=>value===null?NaN:value;
// A .ioc reader on the Rust side leaves `{"\u0001number": [raw, fallback]}` where the caller's own number reader is to
// be asked (it notes the values it cannot read, in the order they are asked for).
const NUMBER='\u0001number';
/** `value` with every such place filled by `number(raw, fallback)`, in the order of the keys. */
export function withNumbers(value,number){
 if(Array.isArray(value))return value.map(v=>withNumbers(v,number));
 if(!value||typeof value!=='object')return value;
 if(Object.hasOwn(value,NUMBER)){const [raw,fallback]=value[NUMBER];return number(raw===null?undefined:raw,fallback);}
 const out={};for(const [key,v]of Object.entries(value))out[key]=withNumbers(v,number);return out;
}
/** The entries of a .ioc whose key starts with one of the prefixes (what a reader on the Rust side needs). */
export const iocPart=(values,...prefixes)=>Object.fromEntries(Object.entries(values).filter(([key])=>prefixes.some(p=>key.startsWith(p))));
