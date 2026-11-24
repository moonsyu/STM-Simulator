import {partVector,BOARD} from './geometry.js';
import {boardPins,bridgeNote} from './pins.js';
import {BOARD_CATALOG} from './boards.js';

// More STM32 boards placed next to the main board (component type 'devboard'), centred on the component position.
// Their pins are wire endpoints `devboard:<id>:<key>`; the supply pins join the common 3V3 / 5V / GND nets, every other
// pin is the board's own net `signal:<id>.<signal>`.
export const devboardPrefix=id=>`devboard:${id}:`;

export const DEVBOARD_MODELS={};
// More STM32 boards (NUCLEO-64): the same header pins as the main board, centred on the component position. Each one
// keeps its own main.c, pin settings and sources; editing one swaps it with the main board (stm32-boards.js).
const STM32_NOTES={PA5:'LD2 사용자 LED (보드 내장)',PC13:'B1 USER 버튼 (보드 내장, 누르면 LOW)',PA2:'USART2 TX — ST-LINK 가상 COM 포트',PA3:'USART2 RX — ST-LINK 가상 COM 포트',PA13:'SWDIO — ST-LINK 디버그 연결',PA14:'SWCLK — ST-LINK 디버그 연결'};
function stm32Pins(boardId){
 const cx=BOARD.x+BOARD.w/2,cy=BOARD.y+BOARD.h/2;
 return boardPins(boardId).map(p=>({key:`${p.header}:${p.number}`,label:`${p.header}-${p.number} ${p.label}`,signal:p.signal==='AGND'?'GND':p.signal,header:p.header,number:p.number,x:p.x-cx,y:p.y-cy,notes:STM32_NOTES[p.signal]?[{text:STM32_NOTES[p.signal],warn:['PA13','PA14'].includes(p.signal)}]:p.bridge?[{text:bridgeNote(p),warn:true}]:p.signal==='NC'?[{text:'연결 없음'}]:[]}));
}
// Renesas RA boards are main boards only (not added as a second board of a circuit).
for(const board of BOARD_CATALOG.filter(b=>b.vendor!=='renesas')){
 let pins;
 // Pins are computed on first use: pins.js imports this module, so the header list is not ready while it loads.
 DEVBOARD_MODELS[board.id]=Object.freeze({id:board.id,name:board.name,short:'STM32',kind:'stm32',chip:board.mcu,mcuFamily:board.mcuFamily,description:`${board.mcu} · ${board.core} · 코드·핀 설정·소스를 보드마다 따로 저장`,w:BOARD.w,h:BOARD.h,file:'main.c',language:'c',get pins(){return pins??=Object.freeze(stm32Pins(board.id));},builtinLed:'PA5'});
}
Object.freeze(DEVBOARD_MODELS);
export const DEVBOARD_IDS=Object.keys(DEVBOARD_MODELS);
export const devboardModel=part=>DEVBOARD_MODELS[part?.model];
export const MAX_DEVBOARDS=8;
export const POWER_SIGNALS=Object.freeze({'3V3':'signal:3V3','5V':'signal:5V',GND:'signal:GND'});
/** The net a board pin belongs to: its own net, a common power net, or null (NC). */
export function devboardNet(part,pin){
 if(POWER_SIGNALS[pin.signal])return POWER_SIGNALS[pin.signal];
 // STM32 boards: the board supply pins are the main board's 3.3 V / 5 V nets, every other pin (GPIO, NRST, BOOT0, E5V …)
 // is the board's own net, as `<signal>` is on the main board.
 if(devboardModel(part)?.kind==='stm32')return pin.signal==='NC'?null:STM32_COMMON.has(pin.signal)?`signal:${pin.signal}`:`signal:${part.id}.${pin.signal}`;
 return null;
}
/** Main-board nets every STM32 board shares (fixed supplies); the rest of a board's signals are its own. */
export const STM32_COMMON=new Set(['3V3','5V','GND','VDD','AVDD','IOREF','U5V']);
const cache=new WeakMap();
// A board's placement: rotation, and the size of an STM32 board that was the (resized) main board.
const frame=part=>({rotation:part.rotation,scale:part.scale,scaleX:part.scaleX,scaleY:part.scaleY});
/** Pins of a board component in circuit coordinates (`id` is the wire endpoint). */
export function devboardPins(part){
 const model=devboardModel(part);if(!model)return [];
 const key=[part.id,part.model,part.x,part.y,part.rotation,part.name,part.scale,part.scaleX,part.scaleY].join('|'),cached=cache.get(part);if(cached?.key===key)return cached.pins;
 const prefix=devboardPrefix(part.id),pins=model.pins.map(p=>{const q=partVector(frame(part),p.x,p.y);return {...p,id:prefix+p.key,x:part.x+q.x,y:part.y+q.y,board:part.id,label:`${part.name} · ${p.label}${p.signal!==p.label&&!p.label.endsWith(p.signal)?' / '+p.signal:''}`};});
 cache.set(part,{key,pins,byId:new Map(pins.map(p=>[p.id,p]))});return pins;
}
export function devboardPinInfo(id,components=[]){
 const match=/^devboard:([^:]+):/.exec(id),part=match&&components.find(p=>p.id===match[1]&&p.type==='devboard');
 if(!part)return null;devboardPins(part);return cache.get(part).byId.get(id)||null;
}
export function devboardBounds(part){
 const model=devboardModel(part),pts=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy])=>{const v=partVector(frame(part),sx*model.w/2,sy*model.h/2);return {x:part.x+v.x,y:part.y+v.y};});
 return {left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
}
/** A board name not used yet: STM32-1, STM32-2 … */
export function nextDevboardName(project,model){const names=new Set(project.components.map(p=>p.name));let n=1;while(names.has(`${model.short}-${n}`))n++;return `${model.short}-${n}`;}
export function removeDevboard(project,id){
 const prefix=devboardPrefix(id);project.wires=project.wires.filter(w=>![w.from,w.to].some(e=>e.startsWith(prefix)));project.components=project.components.filter(p=>p.id!==id);
}

/** STM32 boards: LD2 follows the board's PA5, as on the main board. */
export function updateDevboardSvg(svg,project,result){
 for(const p of project.components){if(p.type!=='devboard')continue;const g=svg.querySelector(`[data-part="${p.id}"]`);if(!g)continue;
  const ld2=g.querySelector('.stm32-led');if(ld2){const on=!!result&&!result.fault&&(result.voltage(`signal:${p.id}.PA5`)??0)>1.8;ld2.setAttribute('fill',on?'#64e66b':'#89a486');ld2.style.filter=on?'drop-shadow(0 0 5px #59dc65)':'';}
 }
}
