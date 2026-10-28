import {terminalKeys,terminalLabel,nominalTerminals,attachments,rotatePoint} from './components.js';
import {BOARD,BB,FULL_BB,scaleXOf,scaleYOf,partVector,surfacePoint} from './geometry.js';
import {devboardPins,devboardPinInfo} from './devboards.js';
export {BOARD,BB,FULL_BB} from './geometry.js';
// MB1136, UM1724 Rev 17, Figure 24 / Tables 19 and 29.
// Default A4/A5 solder bridges: PC1/PC0. Hardware jumper behavior is not modeled.
export const ALIASES = Object.freeze({D0:'PA3',D1:'PA2',D2:'PA10',D3:'PB3',D4:'PB5',D5:'PB4',D6:'PB10',D7:'PA8',D8:'PA9',D9:'PC7',D10:'PB6',D11:'PA7',D12:'PA6',D13:'PA5',D14:'PB9',D15:'PB8',A0:'PA0',A1:'PA1',A2:'PA4',A3:'PB0',A4:'PC1',A5:'PC0',LED_BUILTIN:'PA5',USER_BUTTON:'PC13'});
export const canonicalPin = p => ALIASES[p] || p;
const headers = [];
function header(name, values, x, y, step, numbering) {
  values.forEach((v,i)=>{
    const [label,signal=label] = Array.isArray(v)?v:[v];
    const number=numbering?numbering(i):i+1;
    headers.push({id:`board:${name}:${number}`,header:name,number,label,signal,x,y:y+i*step});
  });
}
const cn7odd=['PC10','PC12','VDD','BOOT0','NC','NC','PA13','PA14','PA15','GND','PB7','PC13','PC14','PC15','PH0','PH1','VBAT','PC2','PC3'];
const cn7even=['PC11','PD2','E5V','GND','NC','IOREF','NRST','3V3','5V','GND','GND','VIN','NC','PA0','PA1','PA4','PB0','PC1','PC0'];
const cn10odd=['PC9','PB8','PB9','AVDD','GND','PA5','PA6','PA7','PB6','PC7','PA9','PA8','PB10','PB4','PB5','PB3','PA10','PA2','PA3'];
const cn10even=['PC8','PC6','PC5','U5V','NC','PA12','PA11','PB12','NC','GND','PB2','PB1','PB15','PB14','PB13','AGND','PC4','NC','NC'];
// Header positions in mm from the board's top-left corner (UM1724 Figure 5), 2.54 mm pitch = 14 units:
// ST morpho CN7 at 3.26/5.80 mm and CN10 at 64.22/66.76 mm, top row 31.74 mm (bottom row 77.46 mm);
// Arduino CN6/CN8 at 10.87 mm and CN5/CN9 at 59.13 mm (48.26 mm apart), CN5 0.4 pitch below the morpho grid
// and 4.06 mm (160 mil) above CN9.
const MM=14/2.54,hx=mm=>BOARD.x+mm*MM,top=BOARD.y+31.74*MM;
header('CN7',cn7odd,hx(3.26),top,14,i=>2*i+1);
header('CN7',cn7even,hx(5.80),top,14,i=>2*i+2);
header('CN10',cn10odd,hx(64.22),top,14,i=>2*i+1);
header('CN10',cn10even,hx(66.76),top,14,i=>2*i+2);
header('CN6',['NC','IOREF',['RESET','NRST'],'3V3','5V','GND','GND','VIN'],hx(10.87),top+4*14,14);
header('CN8',Object.keys(ALIASES).filter(k=>/^A\d$/.test(k)).map(k=>[k,ALIASES[k]]),hx(10.87),top+13*14,14);
header('CN5',[['D15','PB8'],['D14','PB9'],['AREF','AVDD'],'GND',...['D13','D12','D11','D10','D9','D8'].map(k=>[k,ALIASES[k]])],hx(59.13),top+.4*14,14,i=>10-i);
header('CN9',['D7','D6','D5','D4','D3','D2','D1','D0'].map(k=>[k,ALIASES[k]]),hx(59.13),top+11*14,14,i=>8-i);
export const PINS = Object.freeze(headers);
// NUCLEO-F103RB uses the same MB1136 board; UM1724 table 29 lists CN7-29/31 as PD0/PD1 (no port H on the F103)
// and CN10-18 as PB11 (VCAP1 on the F446RE, left unconnected).
const BOARD_SIGNALS={'nucleo-f103rb':{'board:CN7:29':'PD0','board:CN7:31':'PD1','board:CN10:18':'PB11'}};
const boardPinCache=new Map();
/** Header pins of a board: the F446RE layout with that board's signal differences applied. */
export function boardPins(boardId){
  const over=BOARD_SIGNALS[boardId];if(!over)return PINS;
  if(!boardPinCache.has(boardId))boardPinCache.set(boardId,Object.freeze(PINS.map(p=>over[p.id]?Object.freeze({...p,label:over[p.id],signal:over[p.id]}):p)));
  return boardPinCache.get(boardId);
}
export const PIN_BY_ID = new Map(PINS.map(p=>[p.id,p]));
// Header pins of the board being edited: labels, the NC check and pin search follow it (NUCLEO-F103RB: PD0/PD1, PB11).
let activePins=PINS;
export function setActiveBoard(boardId){const pins=boardPins(boardId);if(pins===activePins)return;activePins=pins;for(const p of pins)PIN_BY_ID.set(p.id,p);}
export const GPIO_PINS = [...new Set(PINS.map(p=>p.signal).filter(s=>/^P[A-H]\d+$/.test(s)))].sort();
/** Every GPIO name on any supported board (pin names the C runtime and circuit engine accept). */
export const ALL_GPIO_PINS = [...new Set([...GPIO_PINS,...Object.values(BOARD_SIGNALS).flatMap(o=>Object.values(o))])].sort();
export const HOLES = [];
const letters='abcdefghij';
for(let row=1;row<=30;row++)for(let c=0;c<10;c++) {
  HOLES.push({id:`bb:${letters[c]}:${row}`,label:`${letters[c].toUpperCase()}${row}`,x:BB.x+73.5+c*14+(c>=5?28:0),y:BB.startY+(row-1)*14,bus:`bb:${c<5?'L':'R'}:${row}`});
}
for(const side of ['L','R'])for(const sign of ['+','-'])for(let n=1;n<=25;n++) {
  const x=BB.x+(side==='L'?19.5:267.5)+(sign==='-'?14:0);
  // Power rails are each one continuous conductor, despite gaps in the holes.
  HOLES.push({id:`rail:${side}:${sign}:${n}`,label:`${side==='L'?'왼쪽':'오른쪽'} ${sign} 전원 레일 ${n}`,x,y:BB.startY+(n-1)*14+Math.floor((n-1)/5)*14,bus:`rail:${side}:${sign}`});
}
export const HOLE_BY_ID = new Map(HOLES.map(h=>[h.id,h]));
// 830-point board: columns 1-63 are vertical strips (a-e top block, f-j bottom block).
// Each of the four rail lines (top/bottom, +/-) is one continuous conductor of 50 holes in groups of 5.
export const FULL_HOLES = [];
for(let col=1;col<=FULL_BB.columns;col++)for(let c=0;c<10;c++){
  const top=c<5,y=(top?FULL_BB.rows.a:FULL_BB.rows.f)+(c%5)*FULL_BB.step;
  FULL_HOLES.push({id:`bb:${letters[c]}:${col}`,label:`${letters[c].toUpperCase()}${col}`,x:FULL_BB.left+(col-1)*FULL_BB.step,y,bus:`bb:${top?'T':'B'}:${col}`});
}
for(const side of ['T','B'])for(const [i,sign] of ['+','-'].entries())for(let n=1;n<=50;n++){
  const column=3+(n-1)+Math.floor((n-1)/5);
  FULL_HOLES.push({id:`rail:${side}:${sign}:${n}`,label:`${side==='T'?'위쪽':'아래쪽'} ${sign} 전원 레일 ${n}`,x:FULL_BB.left+(column-1)*FULL_BB.step,y:FULL_BB.rails[side][i],bus:`rail:${side}:${sign}`});
}
export const BREADBOARD_VARIANTS=Object.freeze({half:{frame:BB,holes:HOLES,points:400,label:'400홀'},full:{frame:FULL_BB,holes:FULL_HOLES,points:830,label:'830홀'}});
/** Model of a breadboard component: `variant:'full'` is the 830-point board, anything else the 400-point board. */
export const breadboardModel=part=>part?.variant==='full'?BREADBOARD_VARIANTS.full:BREADBOARD_VARIANTS.half;
const breadboardCache=new WeakMap();
export const breadboardPrefix=id=>`breadboard:${id}:`;
export function breadboardHoles(part){
  const key=[part.id,part.x,part.y,part.rotation,part.name,part.variant,scaleXOf(part),scaleYOf(part),part.skewX??0].join('|'),cached=breadboardCache.get(part);
  if(cached?.key===key)return cached.holes;
  const {frame,holes:local}=breadboardModel(part),prefix=breadboardPrefix(part.id),holes=local.map(h=>{const q=partVector(part,h.x-(frame.x+frame.w/2),h.y-(frame.y+frame.h/2));return {...h,id:prefix+h.id,bus:prefix+h.bus,x:part.x+q.x,y:part.y+q.y,label:`${part.name} · ${h.label}`};});
  breadboardCache.set(part,{key,holes,byId:new Map(holes.map(h=>[h.id,h]))});return holes;
}
export function circuitHoles(components=[],surfaces){return [...(surfaces?.breadboard?.hidden?[]:HOLES.map(h=>surfacePoint(h,'breadboard',surfaces))),...components.filter(p=>p.type==='breadboard').flatMap(breadboardHoles)];}
export function holeInfo(id,components=[],surfaces){
  if(HOLE_BY_ID.has(id)&&!surfaces?.breadboard?.hidden)return surfacePoint(HOLE_BY_ID.get(id),'breadboard',surfaces);
  const match=/^breadboard:([^:]+):/.exec(id),part=match&&components.find(p=>p.id===match[1]&&p.type==='breadboard');
  if(!part)return null;breadboardHoles(part);return breadboardCache.get(part).byId.get(id)||null;
}
export function endpointInfo(id,components=[],surfaces) {
  if(PIN_BY_ID.has(id)&&!surfaces?.board?.hidden) {const p=surfacePoint(PIN_BY_ID.get(id),'board',surfaces);return {...p,label:`${p.header}-${p.number} · ${p.label}${p.signal!==p.label?' / '+p.signal:''}`};}
  const hole=holeInfo(id,components,surfaces);if(hole)return hole;
  const board=devboardPinInfo(id,components);if(board)return board;
  const m=/^part:([^:]+):([a-d]|p\d+)$/.exec(id);
  if(m){const p=components.find(c=>c.id===m[1]);if(p&&terminalKeys(p).includes(m[2])){const t=nominalTerminals(p).find(t=>t.key===m[2]),anchor=attachments(p)[m[2]],point=anchor?endpointInfo(anchor,components,surfaces):null;return {id,x:point?.x??t.x,y:point?.y??t.y,label:`${p.name} ${terminalLabel(p,m[2])}`};}}
  return null;
}
export function endpoints(components,surfaces) {return [...(surfaces?.board?.hidden?[]:PINS.map(p=>surfacePoint(p,'board',surfaces))),...circuitHoles(components,surfaces),...components.filter(p=>p.type==='devboard').flatMap(devboardPins),...components.flatMap(p=>terminalKeys(p).map(t=>endpointInfo(`part:${p.id}:${t}`,components,surfaces)))];}
export function boardPin(name) {const p=PINS.find(p=>p.label===name&&['CN5','CN6','CN8','CN9'].includes(p.header))||PINS.find(p=>p.signal===canonicalPin(name));return p?.id;}
export const normalizePinQuery=q=>String(q).toUpperCase().replace(/\s+/g,'');
export function searchPins(query){const q=normalizePinQuery(query);if(!q)return [];const exact=activePins.filter(p=>p.signal===q||p.label===q||`${p.header}-${p.number}`===q);return exact.length?exact:activePins.filter(p=>p.signal.startsWith(q)||p.label.startsWith(q));}
