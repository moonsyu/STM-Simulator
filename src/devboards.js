import {BOARD} from './geometry.js';
import {BOARD_CATALOG} from './boards.js';
import {rustTable,rustFn,rustExact,rustPure} from './rust-core.js';
import {partView} from './components.js';

// More STM32 boards placed next to the main board (component type 'devboard'), centred on the component position.
// Their pins are wire endpoints `devboard:<id>:<key>`; the supply pins join the common 3V3 / 5V / GND nets, every other
// pin is the board's own net `signal:<id>.<signal>`.
// The pins, nets, places and names are worked out in Rust (rust/stm-core/src/devboards.rs, feature 62); this file
// keeps the answers by board part and draws.
const TABLES=rustTable('devboard_tables');
export const devboardPrefix=id=>`devboard:${id}:`;

export const DEVBOARD_MODELS={};
// More STM32 boards (NUCLEO-64): the same header pins as the main board, centred on the component position. Each one
// keeps its own main.c, pin settings and sources; editing one swaps it with the main board (stm32-boards.js).
// Renesas RA boards are main boards only (not added as a second board of a circuit).
for(const board of BOARD_CATALOG.filter(b=>b.vendor!=='renesas')){
 let pins;
 // Pins are computed on first use: pins.js imports this module, so the header list is not ready while it loads.
 DEVBOARD_MODELS[board.id]=Object.freeze({id:board.id,name:board.name,short:'STM32',kind:'stm32',chip:board.mcu,mcuFamily:board.mcuFamily,description:`${board.mcu} · ${board.core} · 코드·핀 설정·소스를 보드마다 따로 저장`,w:BOARD.w,h:BOARD.h,file:'main.c',language:'c',get pins(){return pins??=Object.freeze(rustFn('devboard_model_pins',board.id,BOARD.x,BOARD.y,BOARD.w,BOARD.h));},builtinLed:'PA5'});
}
Object.freeze(DEVBOARD_MODELS);
export const DEVBOARD_IDS=Object.keys(DEVBOARD_MODELS);
export const devboardModel=part=>DEVBOARD_MODELS[part?.model];
export const MAX_DEVBOARDS=TABLES.MAX_DEVBOARDS;
export const POWER_SIGNALS=TABLES.POWER_SIGNALS;
const netOf=rustPure('devboard_net');
/** The net a board pin belongs to: its own net, a common power net, or null (NC). */
export function devboardNet(part,pin){const signal=pin.signal;return netOf(devboardModel(part)?.kind==='stm32',part?.id,signal);}
/** Main-board nets every STM32 board shares (fixed supplies); the rest of a board's signals are its own. */
export const STM32_COMMON=new Set(TABLES.STM32_COMMON);
const cache=new WeakMap(),sent=new WeakMap();
// What the Rust side reads of a model's pins to place and name them.
const pinsSent=model=>{if(!sent.has(model))sent.set(model,model.pins.map(p=>({x:p.x,y:p.y,label:p.label,signal:p.signal})));return sent.get(model);};
/** Pins of a board component in circuit coordinates (`id` is the wire endpoint). */
export function devboardPins(part){
 const model=devboardModel(part);if(!model)return [];
 const key=[part.id,part.model,part.x,part.y,part.rotation,part.name,part.scale,part.scaleX,part.scaleY].join('|'),cached=cache.get(part);if(cached?.key===key)return cached.pins;
 const prefix=devboardPrefix(part.id),at=rustExact('devboard_part_pins',partView(part),pinsSent(model));
 const pins=model.pins.map((p,i)=>({...p,id:prefix+p.key,x:at.places[2*i],y:at.places[2*i+1],board:part.id,label:at.labels[i]}));
 cache.set(part,{key,pins,byId:new Map(pins.map(p=>[p.id,p]))});return pins;
}
export function devboardPinInfo(id,components=[]){
 const match=/^devboard:([^:]+):/.exec(id),part=match&&components.find(p=>p.id===match[1]&&p.type==='devboard');
 if(!part)return null;devboardPins(part);return cache.get(part).byId.get(id)||null;
}
export function devboardBounds(part){const model=devboardModel(part);return rustExact('devboard_bounds',partView(part),model.w,model.h);}
/** A board name not used yet: STM32-1, STM32-2 … */
export function nextDevboardName(project,model){return rustFn('devboard_next_name',project.components.map(p=>p.name),model.short);}
export function removeDevboard(project,id){
 const prefix=devboardPrefix(id);project.wires=project.wires.filter(w=>![w.from,w.to].some(e=>e.startsWith(prefix)));project.components=project.components.filter(p=>p.id!==id);
}

/** STM32 boards: LD2 follows the board's PA5, as on the main board. */
export function updateDevboardSvg(svg,project,result){
 for(const p of project.components){if(p.type!=='devboard')continue;const g=svg.querySelector(`[data-part="${p.id}"]`);if(!g)continue;
  const ld2=g.querySelector('.stm32-led');if(ld2){const on=!!result&&!result.fault&&(result.voltage(`signal:${p.id}.PA5`)??0)>1.8;ld2.setAttribute('fill',on?'#64e66b':'#89a486');ld2.style.filter=on?'drop-shadow(0 0 5px #59dc65)':'';}
 }
}
