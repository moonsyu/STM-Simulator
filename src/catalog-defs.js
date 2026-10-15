import {DEVICE_CATALOG} from './device-catalog-data.js';
import {DEVICE_DEFS} from './device-defs.js';
import {L298_DEFS} from './l298n.js';
export const catalogType=id=>'ref_'+id.replaceAll('-','_');
export const CATALOG_BY_TYPE=Object.fromEntries(DEVICE_CATALOG.filter(v=>!['board','breadboard'].includes(v.family)).map(v=>[catalogType(v.id),v]));
const defaults={resistor:{value:330},led:{color:'red'},button:{switch:0},potentiometer:{value:10000,position:50},slide:{position:0},capacitor:{value:100},uart:{baud:9600},rs485:{baud:9600},i2c:{address:80},temperature:{temperature:25},ultrasonic:{distance:100},dc_supply:{voltage:12}};
// Map simulator-model contacts to the physical variant's contact numbers. Additional contacts
// remain separate until their explicit tie, address, reset or signal behavior is installed.
export const CONTACT_MAPS={
 'resistor-axial-2':{a:1,b:2},'led-tht-2':{a:1,b:2},'button-2':{a:1,b:2,c:1,d:2},'button-4':{a:1,b:2,c:3,d:4},'button-module-3':{a:1,b:3,c:1,d:3},
 'lcd-parallel-16':Array.from({length:16},(_,i)=>i+1),'ldr-bare-2':{a:1,b:2},'ntc-bare-2':{a:1,b:2},
 'sht31-grove-4':[1,2,3,4],'sht31-breakout-7':[1,2,4,3],'mpu6050-8':[1,2,4,3],'pir-3':[1,3,2],
 'oled-i2c-4':[1,2,4,3],'st7735-8':[1,2,5,4,3,6,7],'matrix-10':[1,2,4,5,3],
 'servo-3':[1,2,3],'servo-feedback-4':[1,2,3,4],'dc-motor-2':{a:1,b:2},'relay-module-6':[1,2,3,4,5,6],
 'joystick-module-5':[1,2,3,4,5],'encoder-module-5':[1,2,3,4,5],
 'l298n-module-13':Array.from({length:13},(_,i)=>i+1),'l298n-bare-15':[4,8,9,6,5,7,10,12,11,2,3,13,14],
 'l298p-bare-20':[6,1,12,8,7,9,13,15,14,4,5,16,17],'dc-supply-2':{a:1,b:2},
 'uart-cable-4':[1,2,3,4],'uart-cable-6':[3,1,4,5],'i2c-eeprom-8':[8,4,5,6],'i2c-eeprom-5':[4,2,3,1],
 'spi-eeprom-8':[8,4,1,6,5,2],'pot-bare-3':[1,2,3],'pot-module-3':[2,3,1],'slide-spdt-3':[1,2,3],
 'rgb-common-anode-4':[1,2,3,4],'rgb-common-cathode-4':[1,4,2,3],
 'capacitor-ceramic-2':{a:1,b:2},'capacitor-electrolytic-2':{a:1,b:2},'diode-axial-2':{a:1,b:2},
 'buzzer-active-2':{a:1,b:2},'buzzer-active-module-3':{a:1,b:3},'buzzer-passive-2':{a:1,b:2},'buzzer-passive-module-3':{a:1,b:3},
 'sevenseg-common-cathode-10':Array.from({length:10},(_,i)=>i+1),'sevenseg-common-anode-10':Array.from({length:10},(_,i)=>i+1),
 'tmp36-to92-3':[1,2,3],'hcsr04-4':[1,2,3,4]
};
export function catalogMap(type){const v=CATALOG_BY_TYPE[type],m=CONTACT_MAPS[v?.id];return Array.isArray(m)?Object.fromEntries(m.map((n,i)=>['p'+(i+1),'p'+n])):m?Object.fromEntries(Object.entries(m).map(([k,n])=>[k,'p'+n])):null;}
export function catalogGeometry(v){
 const n=v.pins.length,id=v.id,f=v.family;
 let body={width:Math.max(56,n*14+12),height:56},terminals=[];
 const row=(count,y,start=0)=>Array.from({length:count},(_,i)=>[(i-(count-1)/2)*14+start,y]);
 const dip=(count,h=56)=>[...row(Math.ceil(count/2),h/2+14),...row(Math.floor(count/2),-h/2-14).reverse()];
 if(n===2){body={width:64,height:46};terminals=[[-35,0],[35,0]];}
 else if(id==='button-4'){body={width:42,height:28};terminals=[[-28,-14],[28,-14],[-28,14],[28,14]];}
 else if(id==='i2c-eeprom-5'){body={width:42,height:28};terminals=[[-14,28],[0,28],[14,28],[14,-28],[-14,-28]];}
 else if(/eeprom-8|l298p-bare-20/.test(id)){body={width:n/2*14+14,height:42};terminals=dip(n,42);}
 else if(id==='ov2640-camera'){body={width:140,height:98};terminals=Array.from({length:18},(_,i)=>[(Math.floor(i/2)-4)*14,56+(i%2)*14]);}
 else if(id==='motor-driver-hat'){body={width:294,height:168};terminals=[...row(5,98,-98),...row(3,-98,-98).slice(0,1),[-42,-98],[-28,-98],[28,-98],[42,-98],[-84,-98],...Array.from({length:40},(_,i)=>[(Math.floor(i/2)-9.5)*14,49+(i%2)*14])];}
 else if(id==='matrix-10'){body={width:112,height:112};terminals=[...Array.from({length:5},(_,i)=>[-70,(i-2)*14]),...Array.from({length:5},(_,i)=>[70,(i-2)*14])];}
 else if(id.startsWith('slide-dp')){body={width:n/2*14+14,height:28};terminals=[...row(n/2,-28),...row(n/2,28)];}
 else if(f==='sevenseg'&&n>=10){body={width:n>=12?168:70,height:70};terminals=dip(n,70);}
 else if(id==='l298n-module-13'){body={width:140,height:112};terminals=[...row(3,-70),...row(6,70),[-84,-14],[-84,0],[84,-14],[84,0]];}
 else if(id==='relay-module-6'){body={width:98,height:70};terminals=[[-63,-14],[-63,0],[-63,14],[63,-14],[63,0],[63,14]];}
 else if(id==='stepper-driver-11'){body={width:126,height:84};terminals=[...row(4,56,-28),[49,56],[63,56],...row(5,-56)];}
 else {
  if(['lcd','oled','tft','sevenseg'].includes(f))body={width:f==='lcd'?242:144,height:f==='tft'?182:84};
  if(['servo','dc_motor','stepper'].includes(f))body={width:100,height:84};
  if(f==='ultrasonic')body={width:126,height:56};
  if(id==='l298n-bare-15')body={width:224,height:70};
  terminals=row(n,body.height/2+14);
 }
 return {body,terminals,pinY:body.height/2+14};
}
export const CATALOG_TWO_PIN=Object.keys(CATALOG_BY_TYPE).filter(type=>CATALOG_BY_TYPE[type].pins.length===2);
export const CATALOG_DEFS=Object.fromEntries(Object.entries(CATALOG_BY_TYPE).map(([type,v])=>[type,{name:v.name,prefix:v.id.split('-')[0].toUpperCase(),icon:'▦',hint:`${v.pin_count??'조립'}핀 · ${v.interface}`,labels:v.pins,defaults:{...(defaults[v.family]||{}),...(DEVICE_DEFS[v.family]?.defaults||L298_DEFS[v.family]?.defaults||{}),...(['dht11','dht22'].includes(v.family)?{temperature:25,humidity:50}:{}),...(v.family==='slide'?{position:0}:{})},help:v.appearance+' '+v.notes,...catalogGeometry(v)}]));

// The same scope notes appear beside the example and its device-specific Docs.
export const CATALOG_SCOPE={
 'ds18b20-to92-3':'1-Wire 리셋·Skip ROM·750 ms 변환·스크래치패드·CRC를 실행합니다. 단일 센서와 외부 전원을 사용합니다.',
 'ds18b20-probe-3':'1-Wire 리셋·Skip ROM·750 ms 변환·스크래치패드·CRC를 실행합니다. 단일 센서와 외부 전원을 사용합니다.',
 'dht11-module-3':'시작 신호와 40비트 온습도·체크섬을 GPIO로 읽습니다. 초기 2초 대기 후 측정합니다.',
 'dht22-module-3':'시작 신호와 40비트 온습도·체크섬을 GPIO로 읽습니다. 초기 2초 대기 후 측정합니다.',
 'urm09-trig-3':'한 GPIO를 출력에서 입력으로 전환하여 트리거와 거리 비례 Echo 폭을 측정합니다.',
 'can-transceiver-6':'기본 예제는 CAN1 내부 루프백입니다. 표준 ID·필터·FIFO 송수신을 검사합니다. NORMAL 모드에서는 외부 상대 노드를 모델링하지 않아 ACK 오류 32가 발생합니다.',
 'max98357a-9':'I2S2 16 kHz·16비트 스테레오 PCM 전송, SD의 채널 선택·정지, 프레임 수와 주파수를 확인합니다. 소리 버튼은 측정 주파수의 시험음을 재생하며 스피커의 전력·음향 특성은 계산하지 않습니다.',
 'ov2640-camera':'PA8 XCLK·리셋·전원·SCCB 배선과 센서 뱅크의 PID/VER 읽기를 실행합니다. 영상 캡처와 DCMI 픽셀 출력은 포함하지 않습니다.',
 'sd-storage-board':'SPI CMD0/8/55/41/58 초기화 및 OCR 응답을 실행합니다. 블록 데이터와 파일시스템 읽기/쓰기는 포함하지 않습니다.'
};
