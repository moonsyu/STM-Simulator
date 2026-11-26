// UART / USART of the Pinout screen: pin routes (STM32F446RE LQFP64, DS10693 tables 10/11), handle names, and giving
// pins to a UART. The code is in Rust (rust/stm-core/src/periph.rs; feature 62): this file is what the JavaScript
// callers import.
import {rustFn,rustPure,rustTable} from './rust-core.js';

const T=rustTable('serial_tables');
export const SERIAL_ROUTES=T.routes;
export const SERIAL_IDS=T.ids;
const name=id=>typeof id==='string'?id:String(id);
const isSerialOf=rustPure('is_serial'),handleOf=rustPure('serial_handle'),afOf=rustPure('serial_af'),functionOf=rustPure('serial_function');
export const isSerial=id=>isSerialOf(name(id));
export const serialHandle=id=>handleOf(name(id));
export const serialAf=id=>afOf(name(id));
/** The UART a pin function belongs to (USART2_TX → USART2), or undefined. */
export const serialFunction=fn=>functionOf(name(fn))??undefined;

// What a changed configuration brings back into the caller's object: only the entries that differ are replaced, as
// the JavaScript did (an untouched pin keeps its object).
function adopt(target,next){
 for(const key of Object.keys(target))if(!(key in next))delete target[key];
 for(const [key,value]of Object.entries(next))if(JSON.stringify(target[key])!==JSON.stringify(value))target[key]=value;
}
/** Gives `pin` to the TX or RX of a UART (the pin that had the signal is released) and turns the UART on. Changes
 *  `config` in place. */
export function assignSerialPin(config,id,role,pin,routes=SERIAL_ROUTES){
 const next=rustFn('assign_serial_pin',{pins:config.pins,peripherals:{[id]:config.peripherals[id]}},id,role,pin,{[id]:routes[id]});
 adopt(config.pins,next.pins);config.peripherals[id]=next.peripherals[id];
}
/** The configuration with a UART turned on (TX/RX on free pins) or off (its pins released): a new object.
 *  remaps (F1 AFIO): TX/RX move together, so a whole free remap option is chosen instead of the first free pin per role. */
export function setSerialEnabled(config,id,enabled,routes=SERIAL_ROUTES,remaps=null){
 if(!routes[id])throw new Error('지원하지 않는 UART/USART입니다.');
 const part=rustFn('set_serial_enabled',{pins:config.pins,peripherals:{[id]:config.peripherals[id]},nvic:{[id+'_IRQn']:config.nvic[id+'_IRQn']}},id,!!enabled,{[id]:routes[id]},remaps??null);
 const next=structuredClone(config);
 adopt(next.pins,part.pins);next.peripherals[id]=part.peripherals[id];
 if(part.nvic?.[id+'_IRQn'])next.nvic[id+'_IRQn']=part.nvic[id+'_IRQn'];
 return next;
}
