import {terminalKeys,terminalLabel,nominalTerminals,attachments,rotatePoint} from './components.js';
import {BOARD,BB,FULL_BB,scaleXOf,scaleYOf,surfacePoint} from './geometry.js';
import {devboardPins,devboardPinInfo} from './devboards.js';
import {rustTable,rustExact} from './rust-core.js';
export {BOARD,BB,FULL_BB} from './geometry.js';
// The header pins of the boards and the holes of the breadboards are tables of the Rust side (rust/stm-core/src/pins.rs,
// feature 62: MB1136 per UM1724 Rev 17, FPB-RA6E1 per R20UT4960EG0100). What changes while the app runs — the active
// board's pin list, the lookups by a project's parts — is here.
const TABLES=rustTable('pin_tables');
export const ALIASES=TABLES.ALIASES;
export const canonicalPin = p => ALIASES[p] || p;
// Solder bridges open as delivered: these header pins do not reach the MCU. The pin keeps its label and is `NC`; `mcu`
// names the MCU pin behind the open bridge.
export const OPEN_BRIDGES=TABLES.OPEN_BRIDGES;
const NUCLEO_PINS=TABLES.NUCLEO_PINS,FPB_PINS=TABLES.FPB_PINS;
// The board outline (BOARD.w/h) of each board; the active board's is applied by setActiveBoard.
const BOARD_SIZES=TABLES.BOARD_SIZES,NUCLEO_SIZE={w:BOARD.w,h:BOARD.h};
// The active board's header pins (modules that import PINS see the board being edited).
export const PINS = [...NUCLEO_PINS];
/** What a header pin behind an open solder bridge is, for tooltips and the pin's notes. */
export const bridgeNote=p=>p?.bridge?`${p.bridge} 열림(기본) — ${p.mcu}에 연결되지 않음${['PA2','PA3'].includes(p.mcu)?' (ST-LINK 가상 COM 포트 전용)':['PC14','PC15'].includes(p.mcu)?' (32.768 kHz 수정 X2)':' (ST-LINK 8 MHz MCO 입력)'}`:'';
/** Header pins of a board: the F446RE layout with that board's signal differences applied (NUCLEO-F103RB: PD0/PD1 on
 *  CN7-29/31, PB11 on CN10-18). */
export function boardPins(boardId){
  if(boardId==='fpb-ra6e1')return FPB_PINS;
  return Object.hasOwn(TABLES.BOARD_PINS,boardId??'')?TABLES.BOARD_PINS[boardId]:NUCLEO_PINS;
}
// Every board's pins (ids differ between NUCLEO and FPB layouts; NUCLEO variants are overwritten by setActiveBoard).
export const PIN_BY_ID = new Map([...FPB_PINS,...NUCLEO_PINS].map(p=>[p.id,p]));
// Header pins of the board being edited: labels, the NC check and pin search follow it (NUCLEO-F103RB: PD0/PD1, PB11).
let activePins=NUCLEO_PINS,activeId;
/** The id of the board being edited, as setActiveBoard was given it (undefined before that: the NUCLEO-F446RE pins). */
export const activeBoard=()=>activeId;
export function setActiveBoard(boardId){
  activeId=boardId;
  const pins=boardPins(boardId);if(pins===activePins)return;activePins=pins;for(const p of pins)PIN_BY_ID.set(p.id,p);
  PINS.splice(0,PINS.length,...pins);Object.assign(BOARD,BOARD_SIZES[boardId]??NUCLEO_SIZE);
  GPIO_PINS.splice(0,GPIO_PINS.length,...(Object.hasOwn(TABLES.GPIO_BY_BOARD,boardId??'')?TABLES.GPIO_BY_BOARD[boardId]:TABLES.GPIO_PINS));
}
export const boardSize=boardId=>BOARD_SIZES[boardId]??NUCLEO_SIZE;
// MCU pins of the active board, including those behind an open solder bridge (the program still uses PA2/PA3 for the VCP).
export const GPIO_PINS=[...TABLES.GPIO_PINS];
/** Every GPIO name on any supported board (pin names the C runtime and circuit engine accept). */
export const ALL_GPIO_PINS=[...TABLES.ALL_GPIO_PINS];
// 400-point board: 30 rows of two 5-hole strips and a power rail pair on each side. 830-point board: columns 1-63 are
// vertical strips (a-e top block, f-j bottom block), four rail lines of 50 holes.
export const HOLES=[...TABLES.HOLES];
export const HOLE_BY_ID=new Map(HOLES.map(h=>[h.id,h]));
export const FULL_HOLES=[...TABLES.FULL_HOLES];
export const BREADBOARD_VARIANTS=Object.freeze({half:{frame:BB,holes:HOLES,points:400,label:'400홀'},full:{frame:FULL_BB,holes:FULL_HOLES,points:830,label:'830홀'}});
/** Model of a breadboard component: `variant:'full'` is the 830-point board, anything else the 400-point board. */
export const breadboardModel=part=>part?.variant==='full'?BREADBOARD_VARIANTS.full:BREADBOARD_VARIANTS.half;
const breadboardCache=new WeakMap();
export const breadboardPrefix=id=>`breadboard:${id}:`;
export function breadboardHoles(part){
  const key=[part.id,part.x,part.y,part.rotation,part.name,part.variant,scaleXOf(part),scaleYOf(part),part.skewX??0].join('|'),cached=breadboardCache.get(part);
  if(cached?.key===key)return cached.holes;
  // Where the holes are comes from the Rust side as x, y pairs in the order of the hole table.
  const {holes:local}=breadboardModel(part),prefix=breadboardPrefix(part.id),at=rustExact('breadboard_places',part.variant==='full',part.x,part.y,part.rotation??0,scaleXOf(part),scaleYOf(part),part.skewX??0);
  const holes=local.map((h,i)=>({...h,id:prefix+h.id,bus:prefix+h.bus,x:at[2*i],y:at[2*i+1],label:`${part.name} · ${h.label}`}));
  breadboardCache.set(part,{key,holes,byId:new Map(holes.map(h=>[h.id,h]))});return holes;
}
export function circuitHoles(components=[],surfaces){return [...(surfaces?.breadboard?.hidden?[]:HOLES.map(h=>surfacePoint(h,'breadboard',surfaces))),...components.filter(p=>p.type==='breadboard').flatMap(breadboardHoles)];}
export function holeInfo(id,components=[],surfaces){
  if(HOLE_BY_ID.has(id)&&!surfaces?.breadboard?.hidden)return surfacePoint(HOLE_BY_ID.get(id),'breadboard',surfaces);
  const match=/^breadboard:([^:]+):/.exec(id),part=match&&components.find(p=>p.id===match[1]&&p.type==='breadboard');
  if(!part)return null;breadboardHoles(part);return breadboardCache.get(part).byId.get(id)||null;
}
export function endpointInfo(id,components=[],surfaces) {
  if(PIN_BY_ID.has(id)&&!surfaces?.board?.hidden) {const p=surfacePoint(PIN_BY_ID.get(id),'board',surfaces);return {...p,label:`${p.header}-${p.number} · ${p.label}${p.bridge?' · '+bridgeNote(p):p.signal!==p.label?' / '+p.signal:''}`};}
  const hole=holeInfo(id,components,surfaces);if(hole)return hole;
  const board=devboardPinInfo(id,components);if(board)return board;
  const m=/^part:([^:]+):([a-d]|p\d+)$/.exec(id);
  if(m){const p=components.find(c=>c.id===m[1]);if(p&&terminalKeys(p).includes(m[2])){const t=nominalTerminals(p).find(t=>t.key===m[2]),anchor=attachments(p)[m[2]],point=anchor?endpointInfo(anchor,components,surfaces):null;return {id,x:point?.x??t.x,y:point?.y??t.y,label:`${p.name} ${terminalLabel(p,m[2])}`};}}
  return null;
}
export function endpoints(components,surfaces) {return [...(surfaces?.board?.hidden?[]:PINS.map(p=>surfacePoint(p,'board',surfaces))),...circuitHoles(components,surfaces),...components.filter(p=>p.type==='devboard').flatMap(devboardPins),...components.flatMap(p=>terminalKeys(p).map(t=>endpointInfo(`part:${p.id}:${t}`,components,surfaces)))];}
// A header pin wired to `name` (D0/D1, PA2/PA3, PC14/PC15 and PH0 have none: their solder bridges are open).
export function boardPin(name) {const p=PINS.find(p=>p.label===name&&p.signal!=='NC'&&['CN5','CN6','CN8','CN9'].includes(p.header))||PINS.find(p=>p.signal===canonicalPin(name));return p?.id;}
export const normalizePinQuery=q=>String(q).toUpperCase().replace(/\s+/g,'');
export function searchPins(query){const q=normalizePinQuery(query);if(!q)return [];const exact=activePins.filter(p=>p.signal===q||p.label===q||`${p.header}-${p.number}`===q);return exact.length?exact:activePins.filter(p=>p.signal.startsWith(q)||p.label.startsWith(q));}
