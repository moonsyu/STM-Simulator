import {CATALOG_DEFS,CATALOG_TWO_PIN,CATALOG_BY_TYPE,CONTACT_MAPS,LEGACY_PHYSICAL,catalogType} from './catalog-defs.js';
import {L298_DEFS} from './l298n.js';
import {DEVICE_DEFS} from './device-defs.js';
import {scaleXOf,scaleYOf} from './geometry.js';
// Geometry shared by rendering, hit testing, mounting and project validation.
// Lead spacing of the small two-lead parts: legs bent close to the body as on a real breadboard. Radial parts
// (LED, LDR, NTC, capacitors, 2-pin button) stand on legs two holes apart (lead, free hole, lead: three holes);
// axial resistors and diodes and the 12 mm buzzers take three pitches (four holes). A DC motor stands on the two tabs
// at its end (four pitches apart); a battery holder keeps its own spacing.
const LEAD_SPANS={led:28,ldr:28,ntc:28,capacitor:28,button:28,resistor:42,diode:42,buzzer:42,passive_buzzer:42,dc_motor:56};
export const fixedLeadSpan=p=>LEAD_SPANS[CATALOG_BY_TYPE[p?.type]?.family??p?.type]??null;
export const TWO_PIN_TYPES=[...CATALOG_TWO_PIN,'resistor','led','capacitor','diode','buzzer','passive_buzzer','ldr','ntc','dc_motor','dc_supply'];
export const MULTI_PIN_TYPES=[...Object.keys(CATALOG_DEFS).filter(t=>!CATALOG_TWO_PIN.includes(t)),'l298n','button','lcd','potentiometer','slide','rgb','sevenseg','temperature','ultrasonic','uart','i2c','spi',...Object.keys(DEVICE_DEFS).filter(t=>!['ldr','ntc'].includes(t))];
export const PART_DEFS={
 ...CATALOG_DEFS,
 ...DEVICE_DEFS,...L298_DEFS,
 uart:{name:'외부 UART 터미널',prefix:'UART',icon:'↔',hint:'4핀 · 외부 장치 배선 연습',defaults:{baud:9600},labels:['VCC','GND','TX','RX'],help:'외부 UART 장치 연결을 연습하는 선택 부품입니다. VCC→3V3, GND→GND, TX→보드 RX(PA3), RX→보드 TX(PA2)로 교차 배선하고 코드와 부품의 baud를 맞추세요. 하단 직렬 모니터 탭에서 외부 UART 장치 → USART2를 선택합니다. 기본 USART2 통신은 이 부품 없이 내장 ST-LINK VCP로 가능합니다.'},
 i2c:{name:'I²C 메모리',prefix:'I2C',icon:'▦',hint:'4핀 · 실물 8핀 EEPROM 중 VCC·GND·SDA·SCL만 쓰는 간이 모델 · 주소 / 256 B',defaults:{address:80},labels:['VCC','GND','SDA','SCL'],help:'256바이트 범용 메모리 모델입니다. 3.3 V, GND, SDA(PB9), SCL(PB8)를 연결하세요. 모듈에 10 kΩ 풀업을 포함합니다. 첫 전송 바이트가 메모리 위치이고 이후 바이트가 데이터입니다.'},
 spi:{name:'SPI 메모리',prefix:'SPI',icon:'⇄',hint:'6핀 · 실물 8핀 EEPROM 중 WP·HOLD를 뺀 간이 모델 · CS / 256 B',defaults:{},labels:['VCC','GND','CS','SCK','MOSI','MISO'],help:'256바이트 범용 메모리 모델입니다. CS LOW 상태에서 명령 0x02(쓰기) 또는 0x03(읽기), 1바이트 주소, 데이터를 전송합니다. 기본 핀은 SCK PA5, MOSI PA7, MISO PA6입니다. CS는 별도로 GPIO로 제어하세요.'},
 potentiometer:{name:'가변저항',prefix:'VR',icon:'◉',hint:'3핀 · 저항 / 위치 조절',defaults:{value:10000,position:50},labels:['1','2 · WIPER','3'],help:'1–3은 전체 저항, 2는 가변 접점입니다. 1을 GND, 3을 3.3 V, 2를 ADC에 연결하면 조절 위치에 따라 전압이 바뀝니다.'},
 slide:{name:'슬라이드 스위치',prefix:'SW',icon:'▣',hint:'3핀 · 연결 방향 유지',defaults:{position:0},labels:['A','COM','B'],help:'COM을 A 또는 B에 연결하는 SPDT 스위치입니다. 실행 중 몸체를 클릭하거나 속성에서 연결 방향을 바꿀 수 있습니다.'},
 rgb:{name:'RGB LED',prefix:'RGB',icon:'◉',hint:'4핀 · 공통 음극',defaults:{},labels:['R (+)','K (−)','G (+)','B (+)'],help:'공통 음극 K를 GND에 연결하세요. R·G·B에는 각각 직렬 저항이 필요하며 채널 전류에 따라 혼합색을 표시합니다.'},
 capacitor:{name:'커패시터',prefix:'C',icon:'⊣',hint:'2핀 · 충전 / 방전',defaults:{value:100},help:'비극성 커패시터 모델입니다. 용량 단위는 µF이며 파형 탭에서 선택한 0.1~20 ms 간격으로 RC 충전·방전을 계산합니다. 실행을 다시 시작하면 초기 전압은 0 V입니다.'},
 diode:{name:'다이오드',prefix:'D',icon:'▶',hint:'2핀 · A → K 정류',defaults:{},help:'첫 번째 다리가 A, 띠가 있는 두 번째 다리가 K입니다. 순방향 전압 0.7 V의 학습용 모델이며 역방향 항복은 계산하지 않습니다.'},
 buzzer:{name:'능동 부저',prefix:'BZ',icon:'◔',hint:'2핀 · 전압에 따른 소리',defaults:{},help:'첫 다리는 +, 두 번째는 −입니다. 2 V 이상에서 동작하는 능동 부저 모델입니다. 상단의 소리 버튼을 켜면 실행 중 울립니다.'},
 passive_buzzer:{name:'수동 부저',prefix:'PBZ',icon:'◔',hint:'2핀 · PWM 주파수 / 멜로디',defaults:{},help:'PWM 또는 GPIO 사각파로 구동하는 수동 피에조 부저입니다. +를 출력 핀, −를 GND에 연결하세요. 2 V 이상 HIGH와 0.8 V 이하 LOW가 반복될 때 20~2000 Hz 신호의 음높이를 재현합니다. DC와 듀티 0%·100%에서는 지속음이 나지 않습니다. PWM 파형 설정과 상단 소리 버튼을 켜세요(예제는 PWM 파형 자동 설정). 1 MΩ 부하의 학습용 모델이며 공진·실제 음압은 계산하지 않습니다.'},
 sevenseg:{name:'7세그먼트',prefix:'DISP',icon:'8',hint:'10핀 · 공통 음극',defaults:{},labels:['e','d','K1','c','dp','b','a','K2','f','g'],help:'K1·K2는 내부 연결된 공통 음극입니다. a–g·dp에 각각 직렬 저항을 연결하세요. 각 세그먼트의 전류에 따라 점등합니다.'},
 temperature:{name:'온도 센서',prefix:'TMP',icon:'♧',hint:'TMP36 · 아날로그 출력',defaults:{temperature:25},labels:['VS','VOUT','GND'],help:'TMP36 전달식 모델입니다. VS 2.7–5.5 V, VOUT = 0.5 + 0.01 × 온도(°C)입니다. 실행 중 온도를 바꾸고 ADC로 측정할 수 있습니다.'},
 ultrasonic:{name:'초음파 센서',prefix:'US',icon:'◉',hint:'HC-SR04 · 거리 조절',defaults:{distance:100},labels:['VCC','TRIG','ECHO','GND'],help:'VCC 5 V와 GND를 연결하고 TRIG에 10 µs 이상 HIGH 펄스를 주세요. ECHO에 연결한 입력에서 pulseIn(pin, HIGH)로 거리 × 58 µs를 읽습니다. 20 ms 화면에서 µs 파형을 직접 재현하지 않는 거리 모델입니다.'}
};
export const LCD_LABELS=['VSS','VDD','VO','RS','R/W','E','DB0','DB1','DB2','DB3','DB4','DB5','DB6','DB7','A','K'];
export const WIRE_COLORS=[
  ['#23a68a','초록'],['#dd654c','빨강'],['#4e647b','검정'],['#8064d8','보라'],
  ['#2786d7','파랑'],['#ebbd2b','노랑'],['#ee8735','주황'],['#df68ac','분홍'],
  ['#8b603e','갈색'],['#edf2f5','흰색'],
  ['#f4a6a6','파스텔 빨강'],['#f6c28b','파스텔 주황'],['#f5e6a1','파스텔 노랑'],
  ['#b8dfa4','파스텔 연두'],['#a4d8c5','파스텔 민트'],['#a9d6ed','파스텔 하늘'],
  ['#b4bbed','파스텔 파랑'],['#cdb4e8','파스텔 보라'],['#edbad5','파스텔 분홍'],['#d8c5b4','파스텔 베이지']
];
export const normalizeAngle=n=>((n%360)+360)%360;
export function terminalKeys(p){if(p.electricalPins)return p.electricalPins;return p.type==='breadboard'?[]:p.type==='button'?['a','b','c','d']:p.type==='lcd'?LCD_LABELS.map((_,i)=>'p'+(i+1)):PART_DEFS[p.type]?.labels?PART_DEFS[p.type].labels.map((_,i)=>'p'+(i+1)):['a','b'];}
export function attachments(p){return TWO_PIN_TYPES.includes(p.type)?{...(p.attachA?{[CATALOG_TWO_PIN.includes(p.type)?'p1':'a']:p.attachA}:{}),...(p.attachB?{[CATALOG_TWO_PIN.includes(p.type)?'p2':'b']:p.attachB}:{})}:p.attachments||{};}
export function terminalLabel(p,key){
 if(p.type==='lcd')return `${Number(key.slice(1))} · ${LCD_LABELS[Number(key.slice(1))-1]}`;
 if(p.type==='button')return ({a:'A1',c:'A2',b:'B1',d:'B2'})[key];
 if(PART_DEFS[p.type]?.labels)return PART_DEFS[p.type].labels[Number(key.slice(1))-1];
 return ['led','diode'].includes(p.type)?(key==='a'?'A (+)':'K (−)'):['buzzer','passive_buzzer','dc_supply'].includes(p.type)?(key==='a'?'+':'−'):key.toUpperCase();
}
function rawTerminals(p){
 if(p.type==='breadboard')return [];
 if(p.type==='button')return [{key:'a',x:-14,y:-14},{key:'b',x:14,y:-14},{key:'c',x:-14,y:14},{key:'d',x:14,y:14}];
 if(p.type==='lcd')return LCD_LABELS.map((_,i)=>({key:'p'+(i+1),x:(i-7.5)*14,y:44}));
 if(CATALOG_TWO_PIN.includes(p.type))return [{key:'p1',x:-(p.span??70)/2,y:0},{key:'p2',x:(p.span??70)/2,y:0}];
 // A basic part with a pin map to its real part has its pins where that part's pins are.
 const real=physicalPins(p.type);if(real)return real.map(([x,y],i)=>({key:'p'+(i+1),x,y}));
 if(PART_DEFS[p.type]?.terminals)return PART_DEFS[p.type].terminals.map(([x,y],i)=>({key:'p'+(i+1),x,y}));
 if(p.type==='sevenseg')return terminalKeys(p).map((key,i)=>({key,x:i<5?(i-2)*14:(7-i)*14,y:i<5?35:-35}));
 if(PART_DEFS[p.type]?.labels){const keys=terminalKeys(p);return keys.map((key,i)=>({key,x:(i-(keys.length-1)/2)*14,y:PART_DEFS[p.type].pinY??(p.type==='ultrasonic'?32:28)}));}
 const half=(p.span??70)/2;return [{key:'a',x:-half,y:0},{key:'b',x:half,y:0}];
}
/** Pin positions of a basic multi-pin part taken from the real part it is drawn as, when the pins it uses stand in one
 * row (null otherwise: a basic part on two pin rows of a DIP keeps its own row). */
export function physicalPins(type){
 const id=LEGACY_PHYSICAL[type],map=id&&CONTACT_MAPS[id];if(!Array.isArray(map)||CATALOG_BY_TYPE[type])return null;
 const pins=map.map(n=>CATALOG_DEFS[catalogType(id)].terminals[n-1]);return pins.every(t=>t[1]===pins[0][1])?pins:null;
}
export function rotatePoint(x,y,angle){const r=angle*Math.PI/180;return {x:x*Math.cos(r)-y*Math.sin(r),y:x*Math.sin(r)+y*Math.cos(r)};}
export function localTerminals(p){const x=scaleXOf(p),y=scaleYOf(p),k=Math.tan((p.skewX??0)*Math.PI/180);return rawTerminals(p).map(t=>({...t,x:t.x*x+t.y*y*k,y:t.y*y}));}
export function nominalTerminals(p){return localTerminals(p).map(t=>{const v=rotatePoint(t.x,t.y,p.rotation);return {...t,x:p.x+v.x,y:p.y+v.y};});}
export function detachPart(p){delete p.attachA;delete p.attachB;delete p.attachments;}
export function assignAttachments(p,map){detachPart(p);if(TWO_PIN_TYPES.includes(p.type)){const keys=CATALOG_TWO_PIN.includes(p.type)?['p1','p2']:['a','b'];if(map[keys[0]])p.attachA=map[keys[0]];if(map[keys[1]])p.attachB=map[keys[1]];}else if(Object.keys(map).length)p.attachments={...map};}
