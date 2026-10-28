import {CATALOG_DEFS,CATALOG_BY_TYPE} from './catalog-defs.js';
import {DEVICE_RANGES,DEVICE_ADDRESSES} from './device-defs.js';
import {PIN_BY_ID,holeInfo} from './pins.js';
import {terminalKeys,TWO_PIN_TYPES,MULTI_PIN_TYPES,normalizeAngle} from './components.js';
import {generateHal,defaultMcu,validateMcu} from './mcu-config.js';
import {expandC} from './c-format.js';
import {DEFAULT_BOARD_ID,START_BOARD_ID,getBoard} from './boards.js';
import {validScale} from './geometry.js';
import {validateNoise} from './signals.js';
import {validCardImage,SD_SIZES} from './sdcard.js';
import {validCameraImage,CAMERA_PATTERNS} from './camera.js';
import {DEVBOARD_MODELS,MAX_DEVBOARDS,devboardPinInfo} from './devboards.js';
export function blankProject(family){const mcu={...defaultMcu(family),pins:{}};return {format:'stm32-circuit-lab',version:2,name:'새 회로',components:[],wires:[],surfaces:{board:{hidden:true},breadboard:{hidden:true}},mcu,firmware:{mode:'hal',files:[]},code:expandC(generateHal(mcu).replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n  printf("HAL ready\\n");'))};}
// Complete example circuits explicitly include the legacy board and breadboard.
export function exampleProject(){const p=blankProject();delete p.surfaces;return p;}
export function validateProject(data){
  if(!data||data.format!=='stm32-circuit-lab'||![1,2].includes(data.version))throw new Error('지원하지 않는 회로 파일 형식입니다.');
  if(typeof data.name!=='string'||data.name.length>120||typeof data.code!=='string'||data.code.length>300000)throw new Error('회로 이름 또는 코드가 올바르지 않습니다.');
  if(!Array.isArray(data.components)||data.components.length>100||!Array.isArray(data.wires)||data.wires.length>500)throw new Error('부품 100개, 배선 500개까지 지원합니다.');
  const ids=new Set(),safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(s);
  if(data.boardId!==undefined&&!getBoard(data.boardId))throw new Error('지원하지 않는 보드입니다.');
  if(data.components.filter(p=>p?.type==='breadboard').length>8)throw new Error('추가 빵판은 8개까지 지원합니다.');
  if(data.components.filter(p=>p?.type==='devboard').length>MAX_DEVBOARDS)throw new Error(`보드는 ${MAX_DEVBOARDS}개까지 추가할 수 있습니다.`);
  const base=id=>(data.surfaces?.board?.hidden!==true&&PIN_BY_ID.has(id))||!!holeInfo(id,data.components,data.surfaces)||!!devboardPinInfo(id,data.components);
  const components=data.components.map(p=>{
    if(!safeId(p.id)||ids.has(p.id))throw new Error('부품 ID가 중복되거나 올바르지 않습니다.');ids.add(p.id);
    if(![...TWO_PIN_TYPES,...MULTI_PIN_TYPES,'breadboard','devboard'].includes(p.type)||typeof p.name!=='string'||p.name.length>80)throw new Error('지원하지 않는 부품입니다.');
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||!Number.isFinite(p.rotation)||(data.version===1?![0,1].includes(p.rotation):p.rotation<0||p.rotation>=360))throw new Error('부품 좌표 또는 회전 각도가 올바르지 않습니다.');
    const q={id:p.id,name:p.name,type:p.type,x:p.x,y:p.y,rotation:data.version===1?p.rotation*90:p.rotation};
    if(p.type==='breadboard'&&p.variant!==undefined){if(p.variant!=='full')throw new Error('지원하지 않는 빵판 종류입니다.');q.variant='full';}
    // ESP32 / Raspberry Pi boards keep their own program text and, for lecture examples, the fixed-run scenario id.
    if(p.type==='devboard'){
      if(!Object.hasOwn(DEVBOARD_MODELS,p.model))throw new Error(p.name+': 지원하지 않는 보드입니다.');
      if(typeof p.code!=='string'||p.code.length>100000)throw new Error(p.name+': 보드 코드는 100 KB 이하의 텍스트여야 합니다.');
      if(p.scenario!==undefined&&!safeId(p.scenario))throw new Error(p.name+': 실행 시나리오 정보를 확인하세요.');
      // An ESP32 board plugged into a breadboard: header pin key → hole.
      const keys=new Set(DEVBOARD_MODELS[p.model].kind==='esp32'?DEVBOARD_MODELS[p.model].pins.map(pin=>pin.key):[]),used=new Set(),attached={};
      for(const [key,id]of Object.entries(p.attachments||{})){if(!keys.has(key)||used.has(id)||!holeInfo(id,data.components,data.surfaces))throw new Error(p.name+': 보드 핀의 빵판 연결 정보를 확인하세요.');used.add(id);attached[key]=id;}
      return {...q,model:p.model,code:p.code,...(p.scenario!==undefined?{scenario:p.scenario}:{}),...(Object.keys(attached).length?{attachments:attached}:{})};
    }
    if(p.scale!==undefined)q.scale=validScale(p.scale);
    for(const key of ['scaleX','scaleY'])if(p[key]!==undefined)q[key]=validScale(p[key]);
    if(p.skewX!==undefined){if(!Number.isFinite(p.skewX)||Math.abs(p.skewX)>=90)throw new Error('장치 변형 정보를 확인하세요.');q.skewX=p.skewX;}
    if(CATALOG_DEFS[p.type])for(const [key,value]of Object.entries(CATALOG_DEFS[p.type].defaults)){const input=p[key]??value;if(typeof value==='number'&&(!Number.isFinite(input)||Math.abs(input)>1e7))throw new Error(p.name+': '+key+' 값을 확인하세요.');if(typeof value==='string'&&typeof input!=='string')throw new Error(p.name+': '+key+' 값을 확인하세요.');q[key]=input;}
    if(CATALOG_DEFS[p.type]){
      const family=CATALOG_BY_TYPE[p.type].family,ranges={...({resistor:{value:[1,1e7]},potentiometer:{value:[1,1e7],position:[0,100]},capacitor:{value:[.001,100000]},slide:{position:[0,p.type.includes('dp3t')?2:1]},temperature:{temperature:[-40,125]},ultrasonic:{distance:[2,400]},dc_supply:{voltage:[6,24]},uart:{baud:[300,2000000]},rs485:{baud:[300,2000000]},dht11:{temperature:[0,50],humidity:[20,90]},dht22:{temperature:[-40,80],humidity:[0,100]}})[family],...DEVICE_RANGES[family]};
      for(const [key,[min,max]]of Object.entries(ranges)){if(q[key]<min||q[key]>max)throw new Error(p.name+': '+key+' 범위는 '+min+'~'+max+'입니다.');}
      if(family==='slide'&&!Number.isInteger(q.position))throw new Error('스위치 위치는 정수입니다.');
      if(family==='i2c'&&(!Number.isInteger(q.address)||q.address<8||q.address>119))throw new Error('I2C 주소를 확인하세요.');
      if(DEVICE_ADDRESSES[family]&&!DEVICE_ADDRESSES[family].includes(q.address))throw new Error(p.name+': 지원하지 않는 I2C 주소입니다.');
      if(family==='led'&&!['red','green','blue','yellow'].includes(q.color))throw new Error('LED 색상을 확인하세요.');
      if(family==='sd'&&(!SD_SIZES.includes(q.sizeMB)||!validCardImage(q.cardImage)))throw new Error(p.name+': SD 카드 용량(64/128/256 MB) 또는 카드 이미지(4 MB 이하)를 확인하세요.');
      if(family==='dcmi'&&(!CAMERA_PATTERNS.includes(q.pattern)||!validCameraImage(q.image)))throw new Error(p.name+': 카메라 패턴 또는 이미지(data URL, 1.5 MB 이하)를 확인하세요.');
    }
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
    if(p.type==='dc_supply')number('voltage',6,24);
    if(p.type==='capacitor')number('value',0.001,100000);
    if(p.type==='potentiometer'){number('value',1,1e7);number('position',0,100);}
    if(p.type==='slide'){if(![0,1].includes(p.position))throw new Error('스위치 위치가 올바르지 않습니다.');q.position=p.position;}
    if(p.type==='temperature')number('temperature',-40,125);
    if(p.type==='ultrasonic')number('distance',2,400);
    if(p.type==='uart'){number('baud',300,2000000);if(!Number.isInteger(p.baud))throw new Error('UART 속도는 정수여야 합니다.');}
    if(p.type==='i2c'){number('address',8,119);if(!Number.isInteger(p.address))throw new Error('I²C 주소는 정수여야 합니다.');}
    for(const [key,[min,max]] of Object.entries(DEVICE_RANGES[p.type]||{})){number(key,min,max);if(['switch','motion'].includes(key)||p.type==='encoder'&&key==='position')if(!Number.isInteger(p[key]))throw new Error(p.name+': 정수 값을 입력하세요.');}
    if(DEVICE_ADDRESSES[p.type]){if(!DEVICE_ADDRESSES[p.type].includes(p.address))throw new Error(p.name+': 지원하지 않는 I²C 주소입니다.');q.address=p.address;}
    return q;
  });
  const end=id=>{if(base(id))return true;const m=/^part:([^:]+):([a-d]|p\d+)$/.exec(id);const p=m&&components.find(p=>p.id===m[1]);return !!p&&terminalKeys(p).includes(m[2]);};
  const wireIds=new Set();
  const wires=data.wires.map(w=>{
    if(!safeId(w.id)||wireIds.has(w.id)||!end(w.from)||!end(w.to)||w.from===w.to||!/^#[0-9a-fA-F]{6}$/.test(w.color))throw new Error('배선 정보가 올바르지 않습니다.');
    if(w.points!==undefined&&(!Array.isArray(w.points)||w.points.length>32||w.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))))throw new Error('배선 꺾임점은 유효한 좌표로 32개까지 지원합니다.');
    wireIds.add(w.id);return {id:w.id,from:w.from,to:w.to,color:w.color,...(w.points?{points:w.points.map(p=>({x:p.x,y:p.y}))}:{})};
  });
  const project={format:data.format,version:2,name:data.name,code:data.code,components,wires};
  if(data.boardId!==undefined)project.boardId=data.boardId;
  if(data.surfaces!==undefined){
    if(!data.surfaces||typeof data.surfaces!=='object'||Array.isArray(data.surfaces))throw new Error('보드 크기 설정을 확인하세요.');
    project.surfaces={};for(const key of ['board','breadboard'])if(data.surfaces[key]!==undefined){
      const source=data.surfaces[key];if(!source||typeof source!=='object'||Array.isArray(source))throw new Error('보드 크기 설정을 확인하세요.');
      const surface={};if(source.hidden!==undefined){if(typeof source.hidden!=='boolean')throw new Error('장치 표시 설정을 확인하세요.');surface.hidden=source.hidden;}for(const field of ['scale','scaleX','scaleY'])if(source[field]!==undefined)surface[field]=validScale(source[field]);
      for(const field of ['x','y'])if(source[field]!==undefined){if(!Number.isFinite(source[field]))throw new Error('보드 위치를 확인하세요.');surface[field]=source[field];}
      project.surfaces[key]=surface;
    }
  }
  if(data.mcu!==undefined){project.mcu=validateMcu(data.mcu);const board=getBoard(data.boardId??DEFAULT_BOARD_ID);if(project.mcu.family!==board.mcuFamily)throw new Error(`${board.name} 보드에는 ${board.mcuFamily} 핀 설정이 필요합니다 (${project.mcu.family}).`);}
  if(data.firmware!==undefined){
    if(!data.firmware||!['sketch','hal'].includes(data.firmware.mode)||!Array.isArray(data.firmware.files)||data.firmware.files.length>40)throw new Error('펌웨어 소스 설정이 올바르지 않습니다.');
    const names=new Set();let size=data.code.length;
    const files=data.firmware.files.map(f=>{if(!f||typeof f.name!=='string'||! /^[\w.-]+\.(c|h|cpp|hpp|cc)$/.test(f.name)||f.name.toLowerCase()==='main.c'||names.has(f.name.toLowerCase())||typeof f.text!=='string')throw new Error('소스 파일 이름/내용을 확인하세요.');names.add(f.name.toLowerCase());size+=f.text.length;return {name:f.name,text:f.text};});
    if(size>300000)throw new Error('HAL 소스 전체는 300 KB 이하로 선택하세요.');
    if(data.firmware.mode==='hal'&&!project.mcu)throw new Error('HAL 프로젝트에는 핀 설정이 필요합니다.');
    project.firmware={mode:data.firmware.mode,files};
  }
  if(data.simulation!==undefined){const s=data.simulation;if(!s||typeof s!=='object'||![.1,.5,1,5,20].includes(s.stepMs)||typeof s.pwmWaveform!=='boolean')throw new Error('시뮬레이션 시간 설정이 올바르지 않습니다.');project.simulation={stepMs:s.stepMs,pwmWaveform:s.pwmWaveform};if(s.noise!==undefined)project.simulation.noise=validateNoise(s.noise);}
  if(data.ide!==undefined){
    const s=data.ide,names=new Set(['main.c',...(project.firmware?.files||[]).map(f=>f.name)]);
    if(!s||!Array.isArray(s.breakpoints)||s.breakpoints.length>1000||!Array.isArray(s.watches)||s.watches.length>20)throw new Error('디버그 설정을 확인하세요.');
    if(s.breakpoints.some(b=>!b||!names.has(b.file)||!Number.isInteger(b.line)||b.line<1||b.line>50000)||s.watches.some(w=>typeof w!=='string'||!w.trim()||w.length>250))throw new Error('중단점 또는 감시식이 올바르지 않습니다.');
    project.ide={breakpoints:s.breakpoints.map(b=>({file:b.file,line:b.line})),watches:[...s.watches]};
    if(s.native!==undefined){const n=s.native;if(!n||!['simulator','emulator','arm','host'].includes(n.target)||!['Debug','Release'].includes(n.configuration))throw new Error('IDE 실행 대상 설정을 확인하세요.');project.ide.native={target:n.target,configuration:n.configuration};}
  }
  if(data.deviceDocs!==undefined){
    const docs=data.deviceDocs;if(!docs||!Array.isArray(docs.bindings)||docs.bindings.length>100)throw new Error('장치 Docs 연결 정보를 확인하세요.');
    const map=value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>100||Object.entries(value).some(([k,v])=>!safeId(k)||!safeId(v)))throw new Error('장치 Docs 매핑을 확인하세요.');return {...value};};
    const keys=new Set();project.deviceDocs={bindings:docs.bindings.map(b=>{if(!b||!safeId(b.key)||keys.has(b.key)||!safeId(b.type)||typeof b.api!=='string'||b.api.length>100)throw new Error('장치 Docs 식별자를 확인하세요.');keys.add(b.key);const out={key:b.key,type:b.type,api:b.api,mode:b.mode==='baremetal'?'baremetal':'hal',parts:map(b.parts),pins:map(b.pins),peripherals:map(b.peripherals)};
      // slot: stable name prefix of inserted globals; added: what Docs itself created, restored on removal.
      if(b.slot!==undefined){if(!Number.isInteger(b.slot)||b.slot<0||b.slot>999)throw new Error('장치 Docs 식별자를 확인하세요.');out.slot=b.slot;}
      if(b.added!==undefined){const a=b.added;if(!a||typeof a!=='object'||Array.isArray(a))throw new Error('장치 Docs 기록을 확인하세요.');out.added={};for(const k of ['pins','peripherals','nvic','parts','boards','wires']){const list=a[k]??[];if(!Array.isArray(list)||list.length>500||list.some(v=>!safeId(v)))throw new Error('장치 Docs 기록을 확인하세요.');out.added[k]=[...list];}}
      return out;})};
    for(const key of ['checksum','headerChecksum','inlineChecksum'])if(docs[key]!==undefined){if(typeof docs[key]!=='string'||!/^[a-f0-9]{1,8}$/.test(docs[key]))throw new Error('장치 Docs 소스 정보를 확인하세요.');project.deviceDocs[key]=docs[key];}
  }
  return project;
}
/** An empty circuit on the start board (NUCLEO-F103RB); the board itself is added from the empty-circuit guide. */
export function startProject(){const board=getBoard(START_BOARD_ID);return {...blankProject(board.mcuFamily),boardId:board.id};}
export function projectForBoard(id=DEFAULT_BOARD_ID){const board=getBoard(id);if(!board)throw new Error('지원하지 않는 보드입니다.');return {...blankProject(board.mcuFamily),boardId:id,surfaces:{board:{hidden:false},breadboard:{hidden:true}}};}
// Compare document contents, not the file-save flag. Saving does not make a circuit blank.
export function hasBoardChanges(project){
 const normalize=p=>{const q=validateProject(p);return {...q,boardId:q.boardId??DEFAULT_BOARD_ID,simulation:q.simulation??{stepMs:1,pwmWaveform:false}};};
 const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
 const current=JSON.stringify(stable(normalize(project)));return [blankProject(),startProject(),projectForBoard(project.boardId??DEFAULT_BOARD_ID)].every(base=>current!==JSON.stringify(stable(normalize(base))));
}
