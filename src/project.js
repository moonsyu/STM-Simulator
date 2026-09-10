import {PIN_BY_ID,holeInfo} from './pins.js';
import {terminalKeys,TWO_PIN_TYPES,MULTI_PIN_TYPES,normalizeAngle} from './components.js';
import {defaultMcu,validateMcu} from './mcu-config.js';
import {DEFAULT_BOARD_ID,getBoard} from './boards.js';
export function blankProject(){return {format:'stm32-circuit-lab',version:2,name:'새 회로',components:[],wires:[],mcu:{...defaultMcu(),pins:{}},firmware:{mode:'hal',files:[]},code:'#include "main.h"\n#include <stdio.h>\n\nint main(void) {\n  HAL_Init();\n  printf("HAL ready\\n");\n  while (1) {\n    HAL_Delay(1000);\n  }\n}\n'};}
export function validateProject(data){
  if(!data||data.format!=='stm32-circuit-lab'||![1,2].includes(data.version))throw new Error('지원하지 않는 회로 파일 형식입니다.');
  if(typeof data.name!=='string'||data.name.length>120||typeof data.code!=='string'||data.code.length>50000)throw new Error('회로 이름 또는 코드가 올바르지 않습니다.');
  if(!Array.isArray(data.components)||data.components.length>100||!Array.isArray(data.wires)||data.wires.length>500)throw new Error('부품 100개, 배선 500개까지 지원합니다.');
  const ids=new Set(),safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(s);
  if(data.boardId!==undefined&&!getBoard(data.boardId))throw new Error('지원하지 않는 보드입니다.');
  if(data.components.filter(p=>p?.type==='breadboard').length>8)throw new Error('추가 빵판은 8개까지 지원합니다.');
  const base=id=>PIN_BY_ID.has(id)||!!holeInfo(id,data.components);
  const components=data.components.map(p=>{
    if(!safeId(p.id)||ids.has(p.id))throw new Error('부품 ID가 중복되거나 올바르지 않습니다.');ids.add(p.id);
    if(![...TWO_PIN_TYPES,...MULTI_PIN_TYPES,'breadboard'].includes(p.type)||typeof p.name!=='string'||p.name.length>80)throw new Error('지원하지 않는 부품입니다.');
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>6000||p.y<0||p.y>6000||!Number.isFinite(p.rotation)||(data.version===1?![0,1].includes(p.rotation):p.rotation<0||p.rotation>=360))throw new Error('부품 좌표 또는 회전 각도가 올바르지 않습니다.');
    const q={id:p.id,name:p.name,type:p.type,x:p.x,y:p.y,rotation:data.version===1?p.rotation*90:p.rotation};
    if(TWO_PIN_TYPES.includes(p.type)){
      q.span=p.span??70;if(!Number.isFinite(q.span)||q.span<4||q.span>1000)throw new Error('부품 다리 간격이 올바르지 않습니다.');
      for(const k of ['attachA','attachB'])if(p[k]!=null){if(!base(p[k]))throw new Error('존재하지 않는 부품 연결점입니다.');q[k]=p[k];}
      if(q.attachA&&q.attachA===q.attachB)throw new Error('두 다리를 같은 구멍에 꽂을 수 없습니다.');
      if(data.version===1&&q.attachA&&q.attachB){const a=PIN_BY_ID.get(q.attachA)||holeInfo(q.attachA,data.components),b=PIN_BY_ID.get(q.attachB)||holeInfo(q.attachB,data.components);q.x=(a.x+b.x)/2;q.y=(a.y+b.y)/2;q.span=Math.hypot(b.x-a.x,b.y-a.y);q.rotation=normalizeAngle(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);}
    }else{
      const map=data.version===1?{...(p.attachA?{a:p.attachA}:{}),...(p.attachB?{b:p.attachB}:{})}:p.attachments||{};
      if(!map||typeof map!=='object'||Array.isArray(map))throw new Error('부품 핀 연결 정보가 올바르지 않습니다.');
      const keys=terminalKeys(q),used=new Set(),clean={};for(const [key,id]of Object.entries(map)){if(!keys.includes(key)||!base(id)||used.has(id))throw new Error('다핀 부품 연결점이 중복되거나 올바르지 않습니다.');used.add(id);clean[key]=id;}
      if(Object.keys(clean).length)q.attachments=clean;
    }
    if(p.type==='resistor'){if(!Number.isFinite(p.value)||p.value<1||p.value>10000000)throw new Error('저항 범위는 1 Ω~10 MΩ입니다.');q.value=p.value;}
    if(p.type==='led'){if(!['red','green','blue','yellow'].includes(p.color))throw new Error('LED 색상이 올바르지 않습니다.');q.color=p.color;}
    const number=(key,min,max)=>{if(!Number.isFinite(p[key])||p[key]<min||p[key]>max)throw new Error(`${p.name}: ${key} 범위는 ${min}~${max}입니다.`);q[key]=p[key];};
    if(p.type==='capacitor')number('value',0.001,100000);
    if(p.type==='potentiometer'){number('value',1,1e7);number('position',0,100);}
    if(p.type==='slide'){if(![0,1].includes(p.position))throw new Error('스위치 위치가 올바르지 않습니다.');q.position=p.position;}
    if(p.type==='temperature')number('temperature',-40,125);
    if(p.type==='ultrasonic')number('distance',2,400);
    if(p.type==='uart'){number('baud',300,2000000);if(!Number.isInteger(p.baud))throw new Error('UART 속도는 정수여야 합니다.');}
    if(p.type==='i2c'){number('address',8,119);if(!Number.isInteger(p.address))throw new Error('I²C 주소는 정수여야 합니다.');}
    return q;
  });
  const end=id=>{if(base(id))return true;const m=/^part:([^:]+):([a-d]|p\d+)$/.exec(id);const p=m&&components.find(p=>p.id===m[1]);return !!p&&terminalKeys(p).includes(m[2]);};
  const wireIds=new Set();
  const wires=data.wires.map(w=>{
    if(!safeId(w.id)||wireIds.has(w.id)||!end(w.from)||!end(w.to)||w.from===w.to||!/^#[0-9a-fA-F]{6}$/.test(w.color))throw new Error('배선 정보가 올바르지 않습니다.');
    wireIds.add(w.id);return {id:w.id,from:w.from,to:w.to,color:w.color};
  });
  const project={format:data.format,version:2,name:data.name,code:data.code,components,wires};
  if(data.boardId!==undefined)project.boardId=data.boardId;
  if(data.mcu!==undefined)project.mcu=validateMcu(data.mcu);
  if(data.firmware!==undefined){
    if(!data.firmware||!['sketch','hal'].includes(data.firmware.mode)||!Array.isArray(data.firmware.files)||data.firmware.files.length>40)throw new Error('펌웨어 소스 설정이 올바르지 않습니다.');
    const names=new Set();let size=data.code.length;
    const files=data.firmware.files.map(f=>{if(!f||typeof f.name!=='string'||! /^[\w.-]+\.[ch]$/.test(f.name)||f.name==='main.c'||names.has(f.name)||typeof f.text!=='string')throw new Error('소스 파일 이름/내용을 확인하세요.');names.add(f.name);size+=f.text.length;return {name:f.name,text:f.text};});
    if(size>300000)throw new Error('HAL 소스 전체는 300 KB 이하로 선택하세요.');
    if(data.firmware.mode==='hal'&&!project.mcu)throw new Error('HAL 프로젝트에는 핀 설정이 필요합니다.');
    project.firmware={mode:data.firmware.mode,files};
  }
  if(data.simulation!==undefined){const s=data.simulation;if(!s||typeof s!=='object'||![.1,.5,1,5,20].includes(s.stepMs)||typeof s.pwmWaveform!=='boolean')throw new Error('시뮬레이션 시간 설정이 올바르지 않습니다.');project.simulation={stepMs:s.stepMs,pwmWaveform:s.pwmWaveform};}
  return project;
}
export function projectForBoard(id=DEFAULT_BOARD_ID){if(!getBoard(id))throw new Error('지원하지 않는 보드입니다.');return {...blankProject(),boardId:id};}
// Compare document contents, not the file-save flag. Saving does not make a circuit blank.
export function hasBoardChanges(project){
 const normalize=p=>{const q=validateProject(p);return {...q,boardId:q.boardId??DEFAULT_BOARD_ID,simulation:q.simulation??{stepMs:1,pwmWaveform:false}};};
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
 return JSON.stringify(stable(normalize(project)))!==JSON.stringify(stable(normalize(projectForBoard(project.boardId??DEFAULT_BOARD_ID))));
}
