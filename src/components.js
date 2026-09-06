// Geometry shared by rendering, hit testing, mounting and project validation.
export const TWO_PIN_TYPES=['resistor','led','capacitor','diode','buzzer'];
export const MULTI_PIN_TYPES=['button','lcd','potentiometer','slide','rgb','sevenseg','temperature','ultrasonic'];
export const PART_DEFS={
 potentiometer:{name:'가변저항',prefix:'VR',icon:'◉',hint:'3핀 · 저항 / 위치 조절',defaults:{value:10000,position:50},labels:['1','2 · WIPER','3'],help:'1–3은 전체 저항, 2는 가변 접점입니다. 1을 GND, 3을 3.3 V, 2를 ADC에 연결하면 조절 위치에 따라 전압이 바뀝니다.'},
 slide:{name:'슬라이드 스위치',prefix:'SW',icon:'▣',hint:'3핀 · 연결 방향 유지',defaults:{position:0},labels:['A','COM','B'],help:'COM을 A 또는 B에 연결하는 SPDT 스위치입니다. 실행 중 몸체를 클릭하거나 속성에서 연결 방향을 바꿀 수 있습니다.'},
 rgb:{name:'RGB LED',prefix:'RGB',icon:'◉',hint:'4핀 · 공통 음극',defaults:{},labels:['R (+)','K (−)','G (+)','B (+)'],help:'공통 음극 K를 GND에 연결하세요. R·G·B에는 각각 직렬 저항이 필요하며 채널 전류에 따라 혼합색을 표시합니다.'},
 capacitor:{name:'커패시터',prefix:'C',icon:'⊣',hint:'2핀 · 충전 / 방전',defaults:{value:100},help:'비극성 커패시터 모델입니다. 용량 단위는 µF이며 20 ms 시간 간격의 RC 충전·방전을 계산합니다. 실행을 다시 시작하면 초기 전압은 0 V입니다.'},
 diode:{name:'다이오드',prefix:'D',icon:'▶',hint:'2핀 · A → K 정류',defaults:{},help:'첫 번째 다리가 A, 띠가 있는 두 번째 다리가 K입니다. 순방향 전압 0.7 V의 학습용 모델이며 역방향 항복은 계산하지 않습니다.'},
 buzzer:{name:'능동 부저',prefix:'BZ',icon:'◔',hint:'2핀 · 전압에 따른 소리',defaults:{},help:'첫 다리는 +, 두 번째는 −입니다. 2 V 이상에서 동작하는 능동 부저 모델입니다. 상단의 소리 버튼을 켜면 실행 중 울립니다.'},
 sevenseg:{name:'7세그먼트',prefix:'DISP',icon:'8',hint:'10핀 · 공통 음극',defaults:{},labels:['e','d','K1','c','dp','b','a','K2','f','g'],help:'K1·K2는 내부 연결된 공통 음극입니다. a–g·dp에 각각 직렬 저항을 연결하세요. 각 세그먼트의 전류에 따라 점등합니다.'},
 temperature:{name:'온도 센서',prefix:'TMP',icon:'♧',hint:'TMP36 · 아날로그 출력',defaults:{temperature:25},labels:['VS','VOUT','GND'],help:'TMP36 전달식 모델입니다. VS 2.7–5.5 V, VOUT = 0.5 + 0.01 × 온도(°C)입니다. 실행 중 온도를 바꾸고 ADC로 측정할 수 있습니다.'},
 ultrasonic:{name:'초음파 센서',prefix:'US',icon:'◉',hint:'HC-SR04 · 거리 조절',defaults:{distance:100},labels:['VCC','TRIG','ECHO','GND'],help:'VCC 5 V와 GND를 연결하고 TRIG에 10 µs 이상 HIGH 펄스를 주세요. ECHO에 연결한 입력에서 pulseIn(pin, HIGH)로 거리 × 58 µs를 읽습니다. 20 ms 화면에서 µs 파형을 직접 재현하지 않는 거리 모델입니다.'}
};
export const LCD_LABELS=['VSS','VDD','VO','RS','R/W','E','DB0','DB1','DB2','DB3','DB4','DB5','DB6','DB7','A','K'];
export const WIRE_COLORS=[
  ['#23a68a','초록'],['#dd654c','빨강'],['#4e647b','검정'],['#8064d8','보라'],
  ['#2786d7','파랑'],['#ebbd2b','노랑'],['#ee8735','주황'],['#df68ac','분홍'],
  ['#8b603e','갈색'],['#edf2f5','흰색']
];
export const normalizeAngle=n=>((n%360)+360)%360;
export function terminalKeys(p){return p.type==='button'?['a','b','c','d']:p.type==='lcd'?LCD_LABELS.map((_,i)=>'p'+(i+1)):PART_DEFS[p.type]?.labels?PART_DEFS[p.type].labels.map((_,i)=>'p'+(i+1)):['a','b'];}
export function attachments(p){return TWO_PIN_TYPES.includes(p.type)?{...(p.attachA?{a:p.attachA}:{}),...(p.attachB?{b:p.attachB}:{})}:p.attachments||{};}
export function terminalLabel(p,key){
 if(p.type==='lcd')return `${Number(key.slice(1))} · ${LCD_LABELS[Number(key.slice(1))-1]}`;
 if(p.type==='button')return ({a:'A1',c:'A2',b:'B1',d:'B2'})[key];
 if(PART_DEFS[p.type]?.labels)return PART_DEFS[p.type].labels[Number(key.slice(1))-1];
 return ['led','diode'].includes(p.type)?(key==='a'?'A (+)':'K (−)'):p.type==='buzzer'?(key==='a'?'+':'−'):key.toUpperCase();
}
export function localTerminals(p){
 if(p.type==='button')return [{key:'a',x:-21,y:-14},{key:'b',x:21,y:-14},{key:'c',x:-21,y:14},{key:'d',x:21,y:14}];
 if(p.type==='lcd')return LCD_LABELS.map((_,i)=>({key:'p'+(i+1),x:(i-7.5)*14,y:44}));
 if(p.type==='sevenseg')return terminalKeys(p).map((key,i)=>({key,x:i<5?(i-2)*14:(7-i)*14,y:i<5?35:-35}));
 if(PART_DEFS[p.type]?.labels){const keys=terminalKeys(p);return keys.map((key,i)=>({key,x:(i-(keys.length-1)/2)*14,y:p.type==='ultrasonic'?32:28}));}
 const half=(p.span??70)/2;return [{key:'a',x:-half,y:0},{key:'b',x:half,y:0}];
}
export function rotatePoint(x,y,angle){const r=angle*Math.PI/180;return {x:x*Math.cos(r)-y*Math.sin(r),y:x*Math.sin(r)+y*Math.cos(r)};}
export function nominalTerminals(p){return localTerminals(p).map(t=>{const v=rotatePoint(t.x,t.y,p.rotation);return {...t,x:p.x+v.x,y:p.y+v.y};});}
export function detachPart(p){delete p.attachA;delete p.attachB;delete p.attachments;}
export function assignAttachments(p,map){detachPart(p);if(TWO_PIN_TYPES.includes(p.type)){p.attachA=map.a;p.attachB=map.b;}else p.attachments={...map};}
