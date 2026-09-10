import {terminalKeys,terminalLabel,nominalTerminals,attachments,rotatePoint} from './components.js';
// MB1136, UM1724 Rev 17, Figure 24 / Tables 19 and 29.
// Default A4/A5 solder bridges: PC1/PC0. Hardware jumper behavior is not modeled.
export const ALIASES = Object.freeze({D0:'PA3',D1:'PA2',D2:'PA10',D3:'PB3',D4:'PB5',D5:'PB4',D6:'PB10',D7:'PA8',D8:'PA9',D9:'PC7',D10:'PB6',D11:'PA7',D12:'PA6',D13:'PA5',D14:'PB9',D15:'PB8',A0:'PA0',A1:'PA1',A2:'PA4',A3:'PB0',A4:'PC1',A5:'PC0',LED_BUILTIN:'PA5',USER_BUTTON:'PC13'});
export const canonicalPin = p => ALIASES[p] || p;
export const BOARD = {x:45,y:48,w:440,h:532};
export const BB = {x:632,y:68,w:342,h:538,startY:128,step:14};
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
header('CN7',cn7odd,69,277,15,i=>2*i+1);
header('CN7',cn7even,86,277,15,i=>2*i+2);
header('CN10',cn10odd,444,277,15,i=>2*i+1);
header('CN10',cn10even,461,277,15,i=>2*i+2);
header('CN6',['NC','IOREF',['RESET','NRST'],'3V3','5V','GND','GND','VIN'],132,307,17);
header('CN8',Object.keys(ALIASES).filter(k=>/^A\d$/.test(k)).map(k=>[k,ALIASES[k]]),132,457,17);
header('CN5',[['D15','PB8'],['D14','PB9'],['AREF','AVDD'],'GND',...['D13','D12','D11','D10','D9','D8'].map(k=>[k,ALIASES[k]])],396,280,15,i=>10-i);
header('CN9',['D7','D6','D5','D4','D3','D2','D1','D0'].map(k=>[k,ALIASES[k]]),396,450,15,i=>8-i);
export const PINS = Object.freeze(headers);
export const PIN_BY_ID = new Map(PINS.map(p=>[p.id,p]));
export const GPIO_PINS = [...new Set(PINS.map(p=>p.signal).filter(s=>/^P[A-H]\d+$/.test(s)))].sort();
export const HOLES = [];
const letters='abcdefghij';
for(let row=1;row<=30;row++)for(let c=0;c<10;c++) {
  HOLES.push({id:`bb:${letters[c]}:${row}`,label:`${letters[c].toUpperCase()}${row}`,x:BB.x+86+c*14+(c>=5?28:0),y:BB.startY+(row-1)*14,bus:`bb:${c<5?'L':'R'}:${row}`});
}
for(const side of ['L','R'])for(const sign of ['+','-'])for(let n=1;n<=25;n++) {
  const x=BB.x+(side==='L'?22:300)+(sign==='-'?14:0);
  // Power rails are each one continuous conductor, despite gaps in the holes.
  HOLES.push({id:`rail:${side}:${sign}:${n}`,label:`${side==='L'?'왼쪽':'오른쪽'} ${sign} 전원 레일 ${n}`,x,y:BB.startY+(n-1)*14+Math.floor((n-1)/5)*14,bus:`rail:${side}:${sign}`});
}
export const HOLE_BY_ID = new Map(HOLES.map(h=>[h.id,h]));
const breadboardCache=new WeakMap();
export const breadboardPrefix=id=>`breadboard:${id}:`;
export function breadboardHoles(part){
  const key=[part.id,part.x,part.y,part.rotation,part.name].join('|'),cached=breadboardCache.get(part);
  if(cached?.key===key)return cached.holes;
  const prefix=breadboardPrefix(part.id),holes=HOLES.map(h=>{const q=rotatePoint(h.x-(BB.x+BB.w/2),h.y-(BB.y+BB.h/2),part.rotation);return {...h,id:prefix+h.id,bus:prefix+h.bus,x:part.x+q.x,y:part.y+q.y,label:`${part.name} · ${h.label}`};});
  breadboardCache.set(part,{key,holes,byId:new Map(holes.map(h=>[h.id,h]))});return holes;
}
export function circuitHoles(components=[]){return [...HOLES,...components.filter(p=>p.type==='breadboard').flatMap(breadboardHoles)];}
export function holeInfo(id,components=[]){
  if(HOLE_BY_ID.has(id))return HOLE_BY_ID.get(id);
  const match=/^breadboard:([^:]+):/.exec(id),part=match&&components.find(p=>p.id===match[1]&&p.type==='breadboard');
  if(!part)return null;breadboardHoles(part);return breadboardCache.get(part).byId.get(id)||null;
}
export function endpointInfo(id,components=[]) {
  if(PIN_BY_ID.has(id)) {const p=PIN_BY_ID.get(id);return {...p,label:`${p.header}-${p.number} · ${p.label}${p.signal!==p.label?' / '+p.signal:''}`};}
  const hole=holeInfo(id,components);if(hole)return hole;
  const m=/^part:([^:]+):([a-d]|p\d+)$/.exec(id);
  if(m){const p=components.find(c=>c.id===m[1]);if(p&&terminalKeys(p).includes(m[2])){const t=nominalTerminals(p).find(t=>t.key===m[2]),anchor=attachments(p)[m[2]],point=anchor?(PIN_BY_ID.get(anchor)||holeInfo(anchor,components)):null;return {id,x:point?.x??t.x,y:point?.y??t.y,label:`${p.name} ${terminalLabel(p,m[2])}`};}}
  return null;
}
export function endpoints(components) {return [...PINS,...circuitHoles(components),...components.flatMap(p=>terminalKeys(p).map(t=>endpointInfo(`part:${p.id}:${t}`,components)))];}
export function boardPin(name) {const p=PINS.find(p=>p.label===name&&['CN5','CN6','CN8','CN9'].includes(p.header))||PINS.find(p=>p.signal===canonicalPin(name));return p?.id;}
export const normalizePinQuery=q=>String(q).toUpperCase().replace(/\s+/g,'');
export function searchPins(query){const q=normalizePinQuery(query);if(!q)return [];const exact=PINS.filter(p=>p.signal===q||p.label===q||`${p.header}-${p.number}`===q);return exact.length?exact:PINS.filter(p=>p.signal.startsWith(q)||p.label.startsWith(q));}
