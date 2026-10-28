import {partVector,partTransform} from './geometry.js';

// Development boards placed next to the STM32 board (component type 'devboard'): ESP32 38-pin boards and the
// Raspberry Pi 5. Drawn at real size like everything else (2.54 mm = 14 units), centred on the component position.
// Their pins are wire endpoints `devboard:<id>:<key>`; GPIOs are their own nets `signal:<id>.<GPIO>`, power pins join
// the common 3V3 / 5V / GND nets (the boards share the PC's USB ground).
const MM=14/2.54;
export const devboardPrefix=id=>`devboard:${id}:`;

// ESP32 38-pin boards (two 19-pin rows 22.86 mm = 9 pitches apart, ESP32-DevKitC V4 order, antenna end at the top and
// USB at the bottom): [DevKitC silkscreen, signal, NodeMCU-32S silkscreen].
const ESP32_LEFT=[['3V3','3V3','3V3'],['EN','EN','EN'],['VP','GPIO36','SVP'],['VN','GPIO39','SVN'],['34','GPIO34','P34'],['35','GPIO35','P35'],['32','GPIO32','P32'],['33','GPIO33','P33'],['25','GPIO25','P25'],['26','GPIO26','P26'],['27','GPIO27','P27'],['14','GPIO14','P14'],['12','GPIO12','P12'],['GND','GND','GND'],['13','GPIO13','P13'],['D2','GPIO9','SD2'],['D3','GPIO10','SD3'],['CMD','GPIO11','CMD'],['5V','5V','5V']];
const ESP32_RIGHT=[['GND','GND','GND'],['23','GPIO23','P23'],['22','GPIO22','P22'],['TX','GPIO1','TX'],['RX','GPIO3','RX'],['21','GPIO21','P21'],['GND','GND','GND'],['19','GPIO19','P19'],['18','GPIO18','P18'],['5','GPIO5','P5'],['17','GPIO17','P17'],['16','GPIO16','P16'],['4','GPIO4','P4'],['0','GPIO0','P0'],['2','GPIO2','P2'],['15','GPIO15','P15'],['D1','GPIO8','SD1'],['D0','GPIO7','SD0'],['CLK','GPIO6','CLK']];
const ESP32_FUNCTIONS={36:'ADC1_CH0',39:'ADC1_CH3',34:'ADC1_CH6',35:'ADC1_CH7',32:'ADC1_CH4 · TOUCH9',33:'ADC1_CH5 · TOUCH8',25:'ADC2_CH8 · DAC1',26:'ADC2_CH9 · DAC2',27:'ADC2_CH7 · TOUCH7',14:'ADC2_CH6 · TOUCH6 · HSPI_CLK',12:'ADC2_CH5 · TOUCH5 · HSPI_MISO',13:'ADC2_CH4 · TOUCH4 · HSPI_MOSI',23:'VSPI_MOSI',22:'I2C SCL (Wire 기본)',21:'I2C SDA (Wire 기본)',19:'VSPI_MISO',18:'VSPI_SCK',5:'VSPI_CS',17:'UART2 TX',16:'UART2 RX',4:'ADC2_CH0 · TOUCH0',0:'ADC2_CH1 · TOUCH1 · BOOT 버튼',2:'ADC2_CH2 · TOUCH2 · 보드 내장 파란 LED',15:'ADC2_CH3 · TOUCH3 · HSPI_CS',1:'UART0 TX (USB 시리얼)',3:'UART0 RX (USB 시리얼)'};
const ESP32_STRAPPING={0:'스트래핑 핀 — 부팅 때 LOW면 다운로드 모드(BOOT 버튼)',2:'스트래핑 핀 — 다운로드 모드 진입 때 LOW 또는 미연결이어야 함',5:'스트래핑 핀',12:'스트래핑 핀 — 부팅 때 HIGH면 플래시 전압이 1.8 V로 바뀌어 부팅 실패',15:'스트래핑 핀 — 부팅 로그 출력 설정'};
function esp32Notes(signal){
 const n=Number(/^GPIO(\d+)$/.exec(signal)?.[1]),notes=[];if(!Number.isInteger(n))return notes;
 if(ESP32_FUNCTIONS[n])notes.push({text:ESP32_FUNCTIONS[n]});
 if(n>=34)notes.push({text:'입력 전용 — 출력·내부 풀업 없음',warn:true});
 if(n>=6&&n<=11)notes.push({text:'사용 금지 — 보드 내장 SPI 플래시에 연결',warn:true});
 if(ESP32_STRAPPING[n])notes.push({text:ESP32_STRAPPING[n],warn:true});
 if([0,2,4,12,13,14,15,25,26,27].includes(n))notes.push({text:'ADC2 — Wi-Fi를 켜면 아날로그 입력으로 못 씀',warn:true});
 if(n===1||n===3)notes.push({text:'업로드·시리얼 모니터와 공유',warn:true});
 return notes;
}
function esp32Pins(silkscreen){
 return [...ESP32_LEFT.map((row,i)=>['L',i,row]),...ESP32_RIGHT.map((row,i)=>['R',i,row])].map(([side,i,[devkit,signal,nodemcu]])=>({key:side+(i+1),label:silkscreen==='nodemcu'?nodemcu:devkit,signal,x:(side==='L'?-1:1)*11.43*MM,y:(i-9)*14,notes:esp32Notes(signal)}));
}
// Raspberry Pi 40-pin header (physical pin → signal); odd pins on the inner row, even pins along the board edge.
const RPI_HEADER=['3V3','5V','GPIO2','5V','GPIO3','GND','GPIO4','GPIO14','GND','GPIO15','GPIO17','GPIO18','GPIO27','GND','GPIO22','GPIO23','3V3','GPIO24','GPIO10','GND','GPIO9','GPIO25','GPIO11','GPIO8','GND','GPIO7','GPIO0','GPIO1','GPIO5','GND','GPIO6','GPIO12','GPIO13','GND','GPIO19','GPIO16','GPIO26','GPIO20','GND','GPIO21'];
const RPI_FUNCTIONS={2:'I2C1 SDA · 보드에 1.8 kΩ 풀업(3.3 V)',3:'I2C1 SCL · 보드에 1.8 kΩ 풀업(3.3 V)',4:'GPCLK0',14:'UART0 TX',15:'UART0 RX',18:'PCM CLK · PWM0',12:'PWM0',13:'PWM1',19:'PCM FS · PWM1',20:'PCM DIN',21:'PCM DOUT',10:'SPI0 MOSI',9:'SPI0 MISO',11:'SPI0 SCLK',8:'SPI0 CE0',7:'SPI0 CE1',0:'ID_SD — HAT EEPROM 전용',1:'ID_SC — HAT EEPROM 전용'};
function rpiPins(){
 // Raspberry Pi mechanical drawing (85 × 56 mm): header centred 32.5 mm from the left edge, rows 3.5 ± 1.27 mm.
 return RPI_HEADER.map((signal,i)=>{const n=i+1,col=Math.floor(i/2),gpio=Number(/^GPIO(\d+)$/.exec(signal)?.[1]);
  const notes=Number.isInteger(gpio)?[...(RPI_FUNCTIONS[gpio]?[{text:RPI_FUNCTIONS[gpio],warn:gpio<2}]:[]),{text:'3.3 V 전용 — 5 V를 넣으면 고장',warn:true}]:[];
  return {key:'P'+n,label:`${n}번 ${signal}`,signal,number:n,x:(32.5+(col-9.5)*2.54-42.5)*MM,y:((n%2?4.77:2.23)-28)*MM,notes};});
}
export const DEVBOARD_MODELS=Object.freeze({
 'esp32-nodemcu-32s':Object.freeze({id:'esp32-nodemcu-32s',name:'NodeMCU-32S (ESP-32S)',short:'ESP32',kind:'esp32',chip:'ESP32',module:'ESP-32S',description:'Ai-Thinker ESP-32S 모듈 · 38핀 · 3.3 V · 강의 보드(NODEMCU ESP-32S V1.1)',w:28*MM,h:54*MM,file:'sketch.ino',language:'cpp',pins:Object.freeze(esp32Pins('nodemcu')),builtinLed:'GPIO2'}),
 'esp32-devkit-wroom32':Object.freeze({id:'esp32-devkit-wroom32',name:'ESP32 DevKit 38핀 (ESP32-WROOM-32)',short:'ESP32',kind:'esp32',chip:'ESP32',module:'ESP32-WROOM-32',description:'Espressif ESP32-WROOM-32 모듈 · 38핀 · 3.3 V · 핀 배열은 DevKitC V4 기준(실물 대조 필요)',w:28*MM,h:54*MM,file:'sketch.ino',language:'cpp',pins:Object.freeze(esp32Pins('devkit')),builtinLed:'GPIO2',unverified:'핀 배열 확인 필요 · DevKitC V4 배열과 표기로 그렸습니다.'}),
 'rpi5':Object.freeze({id:'rpi5',name:'Raspberry Pi 5',short:'RPI',kind:'rpi',chip:'BCM2712',description:'40핀 GPIO 헤더 · 3.3 V 로직 · 아날로그 입력 없음',w:85*MM,h:56*MM,file:'main.py',language:'python',pins:Object.freeze(rpiPins()),pullups:Object.freeze({GPIO2:1800,GPIO3:1800})})
});
export const DEVBOARD_IDS=Object.keys(DEVBOARD_MODELS);
export const devboardModel=part=>DEVBOARD_MODELS[part?.model];
export const MAX_DEVBOARDS=8;
export const POWER_SIGNALS=Object.freeze({'3V3':'signal:3V3','5V':'signal:5V',GND:'signal:GND'});
/** The net a board pin belongs to: its own GPIO net, a common power net, or null (EN). */
export function devboardNet(part,pin){if(POWER_SIGNALS[pin.signal])return POWER_SIGNALS[pin.signal];return /^GPIO\d+$/.test(pin.signal)?`signal:${part.id}.${pin.signal}`:null;}
const cache=new WeakMap();
/** Pins of a board component in circuit coordinates (`id` is the wire endpoint). */
export function devboardPins(part){
 const model=devboardModel(part);if(!model)return [];
 const key=[part.id,part.model,part.x,part.y,part.rotation,part.name].join('|'),cached=cache.get(part);if(cached?.key===key)return cached.pins;
 const prefix=devboardPrefix(part.id),pins=model.pins.map(p=>{const q=partVector({rotation:part.rotation},p.x,p.y);return {...p,id:prefix+p.key,x:part.x+q.x,y:part.y+q.y,board:part.id,label:`${part.name} · ${p.label}${p.signal!==p.label&&!p.label.endsWith(p.signal)?' / '+p.signal:''}`};});
 cache.set(part,{key,pins,byId:new Map(pins.map(p=>[p.id,p]))});return pins;
}
export function devboardPinInfo(id,components=[]){
 const match=/^devboard:([^:]+):/.exec(id),part=match&&components.find(p=>p.id===match[1]&&p.type==='devboard');
 if(!part)return null;devboardPins(part);return cache.get(part).byId.get(id)||null;
}
export function devboardBounds(part){
 const model=devboardModel(part),pts=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy])=>{const v=partVector({rotation:part.rotation},sx*model.w/2,sy*model.h/2);return {x:part.x+v.x,y:part.y+v.y};});
 return {left:Math.min(...pts.map(p=>p.x)),right:Math.max(...pts.map(p=>p.x)),top:Math.min(...pts.map(p=>p.y)),bottom:Math.max(...pts.map(p=>p.y))};
}
export const DEVBOARD_TEMPLATES=Object.freeze({
 esp32:'// ESP32 스케치 · 2번 핀(보드 내장 파란 LED)을 0.5초마다 켜고 끕니다.\nvoid setup() {\n  pinMode(2, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(2, HIGH);\n  delay(500);\n  digitalWrite(2, LOW);\n  delay(500);\n}\n',
 rpi:'# Raspberry Pi 5 · GPIO17(11번 핀)의 LED를 0.5초마다 켜고 끕니다.\nfrom gpiozero import LED\nfrom time import sleep\n\nled = LED(17)\nwhile True:\n    led.on()\n    sleep(0.5)\n    led.off()\n    sleep(0.5)\n'
});
/** A board name not used yet: ESP32-1, ESP32-2 … / RPI-1 … */
export function nextDevboardName(project,model){const names=new Set(project.components.map(p=>p.name));let n=1;while(names.has(`${model.short}-${n}`))n++;return `${model.short}-${n}`;}
/** Fields of a new board component, placed right of `right` (the right edge of what is on the canvas). */
export function newDevboardFields(project,modelId,right=430){
 const model=DEVBOARD_MODELS[modelId];if(!model)throw new Error('지원하지 않는 보드입니다.');
 if(project.components.filter(p=>p.type==='devboard').length>=MAX_DEVBOARDS)throw new Error(`보드는 ${MAX_DEVBOARDS}개까지 추가할 수 있습니다.`);
 return {type:'devboard',model:modelId,name:nextDevboardName(project,model),x:right+60+model.w/2,y:100+model.h/2,rotation:0,code:DEVBOARD_TEMPLATES[model.kind]};
}
/** Editor key of a board's program: `board/<id>/<file>` (never a firmware file name, which cannot contain '/'). */
export const boardFileKey=part=>`board/${part.id}/${devboardModel(part)?.file??'code.txt'}`;
export const isBoardFile=key=>typeof key==='string'&&key.startsWith('board/');
export const boardForFile=(project,key)=>isBoardFile(key)?project.components.find(p=>p.type==='devboard'&&boardFileKey(p)===key)??null:null;
/** Program files of the boards for the editor's file list: key, label `ESP32-1 · sketch.ino`, text. */
export function boardSourceFiles(project){return project.components.filter(p=>p.type==='devboard'&&devboardModel(p)).map(p=>({name:boardFileKey(p),label:`${p.name} · ${devboardModel(p).file}`,text:p.code,part:p}));}
export function removeDevboard(project,id){
 const prefix=devboardPrefix(id);project.wires=project.wires.filter(w=>![w.from,w.to].some(e=>e.startsWith(prefix)));project.components=project.components.filter(p=>p.id!==id);
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rect=(x,y,w,h,fill,rx=0,extra='')=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const text=(x,y,s,size,color,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${extra}>${esc(s)}</text>`;
function esp32Art(model){
 const w=model.w,h=model.h,x0=-w/2,y0=-h/2;let s=rect(x0,y0,w,h,'#1d2226',5,'stroke="#0c0f11" stroke-width="1.2" filter="url(#shadow)"');
 // Module: antenna area at the top edge, then the metal shield.
 const mw=18*MM,mx=-mw/2,my=y0+3;s+=rect(mx,my,mw,25.5*MM,'#203a2c',2,'stroke="#13241b"')+`<path d="M${mx+10} ${my+8}h${mw-20}v8h${-(mw-30)}v8h${mw-30}v8h${-(mw-20)}" fill="none" stroke="#c9a64e" stroke-width="2"/>`;
 s+=rect(mx+5,my+40,mw-10,25.5*MM-46,'#c9ced2',2,'stroke="#8e969c"')+text(0,my+82,model.module,8.5,'#4c555c','text-anchor="middle" font-weight="700"')+text(0,my+96,'WiFi · BT',6.5,'#59636a','text-anchor="middle"');
 // USB-UART chip, regulator, LEDs, EN/BOOT buttons and the micro-USB connector at the bottom edge.
 s+=rect(-15,52,30,30,'#16191b',2,'stroke="#2e3438"')+rect(-34,8,22,14,'#16191b',1)+rect(14,8,22,14,'#2a2f33',1);
 s+=`<circle cx="-26" cy="104" r="3.4" fill="#7a2525" class="devboard-power-led"/><circle cx="26" cy="104" r="3.4" fill="#21384f" class="devboard-led"/>`+text(-26,96,'PWR',5,'#cfd6db','text-anchor="middle"')+text(26,96,'IO2',5,'#cfd6db','text-anchor="middle"');
 for(const [x,label]of [[-36,'EN'],[36,'BOOT']])s+=rect(x-9,113,18,16,'#c8ccd0',2,'stroke="#7d858b"')+`<circle cx="${x}" cy="121" r="4.6" fill="#2a2f33"/>`+text(x,137,label,5.5,'#cfd6db','text-anchor="middle"');
 s+=rect(-22,h/2-25,44,30,'#b8bec3',3,'stroke="#7d858b"')+rect(-15,h/2-19,30,9,'#4a5157',1);
 for(const p of model.pins){const left=p.x<0;s+=rect(p.x-4.2,p.y-4.2,8.4,8.4,'#c9a64e',1.4,'stroke="#7d6326" stroke-width=".6"')+`<circle cx="${p.x}" cy="${p.y}" r="1.9" fill="#1d2226"/>`+text(p.x+(left?8:-8),p.y+2.4,p.label,6.2,'#e8ecef',`text-anchor="${left?'start':'end'}"`);}
 return s+text(0,y0-6,model.name,7,'#56636d','text-anchor="middle"');
}
function rpiArt(model){
 const w=model.w,h=model.h,x0=-w/2,y0=-h/2,X=mm=>x0+mm*MM,Y=mm=>y0+mm*MM;let s=rect(x0,y0,w,h,'#1f7a43',3*MM,'stroke="#11502a" stroke-width="1.2" filter="url(#shadow)"');
 for(const [x,y]of [[3.5,3.5],[61.5,3.5],[3.5,52.5],[61.5,52.5]])s+=`<circle cx="${X(x)}" cy="${Y(y)}" r="${1.4*MM}" fill="#e8d18a"/><circle cx="${X(x)}" cy="${Y(y)}" r="${1.1*MM}" fill="#f4f6f5"/>`;
 // SoC and RP1 under their lids, RAM, the USB / Ethernet block on the right and USB-C / micro-HDMI on the bottom edge.
 s+=rect(X(22),Y(21),15*MM,15*MM,'#b9c0c4',2,'stroke="#7e878c"')+text(X(29.5),Y(29.5),'BCM2712',8,'#3d474d','text-anchor="middle" font-weight="700"');
 s+=rect(X(42),Y(23),9*MM,9*MM,'#2b2f32',2)+text(X(46.5),Y(28.3),'RP1',7,'#c6ccd0','text-anchor="middle"')+rect(X(22),Y(39.5),15*MM,7*MM,'#25292c',1);
 for(const [y,hh]of [[2.5,15],[20.5,15]])s+=rect(X(69),Y(y),18*MM,hh*MM,'#9aa3a8',2,'stroke="#5f686d"')+rect(X(71),Y(y+3),14*MM,(hh-6)*MM,'#20262a',1);
 s+=rect(X(66),Y(38.5),21*MM,16*MM,'#b8bec2',2,'stroke="#6f777c"')+rect(X(68),Y(41),17*MM,11*MM,'#2c3236',1);
 for(const [x,ww]of [[6,9],[24,6.5],[37.5,6.5]])s+=rect(X(x),Y(50),ww*MM,7.5*MM,'#a9b0b5',2,'stroke="#6b7378"');
 s+=text(X(12),Y(16),'Raspberry Pi 5',10,'#e6f2ea','font-weight="700"')+`<circle cx="${X(3)}" cy="${Y(46)}" r="3.2" fill="#7a2525" class="devboard-power-led"/>`;
 const xs=model.pins.map(p=>p.x),ys=model.pins.map(p=>p.y);s+=rect(Math.min(...xs)-8,Math.min(...ys)-8,Math.max(...xs)-Math.min(...xs)+16,Math.max(...ys)-Math.min(...ys)+16,'#151819',1.5,'stroke="#050607"');
 for(const p of model.pins)s+=rect(p.x-3.4,p.y-3.4,6.8,6.8,p.number===1?'#e5c76d':'#c9a64e',p.number===1?.3:3.4);
 const first=model.pins[0],last=model.pins.at(-1);return s+text(first.x,first.y+16,'1',7,'#e6f2ea','text-anchor="middle"')+text(last.x,last.y-10,'40',7,'#e6f2ea','text-anchor="middle"');
}
/** The board drawing; selected boards get the same outline class as other parts. */
export function devboardSvg(part,selected=false){
 const model=devboardModel(part);if(!model)return '';
 return `<g class="devboard ${selected?'part-selected':''}" data-part="${part.id}" data-rotation="${part.rotation}" data-devboard="${part.model}" transform="${partTransform({...part,scale:1,scaleX:1,scaleY:1,skewX:0})}">${model.kind==='rpi'?rpiArt(model):esp32Art(model)}${text(0,-model.h/2-(model.kind==='rpi'?8:18),part.name,10,'#496477','text-anchor="middle" font-weight="700" class="devboard-name"')}</g>`;
}
/** On-board LEDs follow the board's GPIO (ESP32 GPIO2) and power. */
export function updateDevboardSvg(svg,project,result,running){
 for(const p of project.components){if(p.type!=='devboard')continue;const g=svg.querySelector(`[data-part="${p.id}"]`);if(!g)continue;const model=devboardModel(p);
  g.querySelector('.devboard-power-led')?.setAttribute('fill',running?'#ff4d4d':'#7a2525');
  const led=g.querySelector('.devboard-led');if(led&&model.builtinLed){const on=!!result&&!result.fault&&(result.voltage(`signal:${p.id}.${model.builtinLed}`)??0)>2;led.setAttribute('fill',on?'#4da3ff':'#21384f');led.style.filter=on?'drop-shadow(0 0 4px #4da3ff)':'';}
 }
}
