import {boardPin,PIN_BY_ID,HOLE_BY_ID} from './pins.js';
import {terminalKeys,TWO_PIN_TYPES,MULTI_PIN_TYPES,normalizeAngle} from './components.js';
export const BLINK=`// D13 = PA5 · GPIO 출력으로 LED를 깜빡입니다.
void setup() {
  pinMode(D13, OUTPUT);
}

void loop() {
  digitalWrite(D13, HIGH);
  delay(500);
  digitalWrite(D13, LOW);
  delay(500);
}`;
export function blankProject(){return {format:'stm32-circuit-lab',version:2,name:'새 회로',components:[],wires:[],code:BLINK};}
const wire=(id,from,to,color='#23a68a')=>({id,from,to,color});
export function example(which='blink'){
  const p=blankProject();p.name='01 · LED 깜빡이기';
  p.components=[{id:'r1',name:'R1',type:'resistor',value:330,x:795,y:226,rotation:0,span:42,attachA:'bb:e:8',attachB:'bb:f:8'},{id:'led1',name:'LED1',type:'led',color:'red',x:872,y:254,rotation:90,span:56,attachA:'bb:j:8',attachB:'bb:j:12'}];
  p.wires=[wire('w1',boardPin('D13'),'bb:a:8'),wire('w2',boardPin('GND'),'rail:R:-:1','#4e647b'),wire('w3','rail:R:-:10','bb:h:12','#4e647b')];
  if(which==='button'){
    p.name='02 · 버튼으로 LED 켜기';
    p.components.push({id:'b1',name:'SW1',type:'button',x:795,y:380,rotation:0,attachments:{a:'bb:e:18',b:'bb:f:18',c:'bb:e:20',d:'bb:f:20'}});
    p.wires.push(wire('w4',boardPin('D2'),'bb:a:18','#8064d8'),wire('w5','bb:j:18','rail:R:-:16','#4e647b'));
    p.code=`// 실행 후 빵판 위 버튼을 누르고 계세요.
void setup() {
  pinMode(D13, OUTPUT);
  pinMode(D2, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(D2) == LOW) {
    digitalWrite(D13, HIGH);
  } else {
    digitalWrite(D13, LOW);
  }
  delay(20);
}`;
  }
  if(which==='divider'){
    p.name='03 · 분압과 아날로그 입력';
    p.components=[{id:'r1',name:'R1',type:'resistor',value:10000,x:795,y:226,rotation:0,span:42,attachA:'bb:e:8',attachB:'bb:f:8'},{id:'r2',name:'R2',type:'resistor',value:10000,x:872,y:275,rotation:90,span:98,attachA:'bb:j:8',attachB:'bb:j:15'}];
    p.wires=[wire('w1',boardPin('3V3'),'bb:a:8','#dd654c'),wire('w2',boardPin('GND'),'bb:h:15','#4e647b'),wire('w3',boardPin('A0'),'bb:h:8','#8064d8')];
    p.code=`// 10 kΩ / 10 kΩ 분압: 약 1.65 V, ADC 약 2048
void setup() {
  pinMode(A0, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.println(analogRead(A0));
  delay(500);
}`;
  }
  return p;
}
export function validateProject(data){
  if(!data||data.format!=='stm32-circuit-lab'||![1,2].includes(data.version))throw new Error('지원하지 않는 회로 파일 형식입니다.');
  if(typeof data.name!=='string'||data.name.length>120||typeof data.code!=='string'||data.code.length>50000)throw new Error('회로 이름 또는 코드가 올바르지 않습니다.');
  if(!Array.isArray(data.components)||data.components.length>100||!Array.isArray(data.wires)||data.wires.length>500)throw new Error('부품 100개, 배선 500개까지 지원합니다.');
  const ids=new Set(),safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,64}$/.test(s);
  const base=id=>PIN_BY_ID.has(id)||HOLE_BY_ID.has(id);
  const components=data.components.map(p=>{
    if(!safeId(p.id)||ids.has(p.id))throw new Error('부품 ID가 중복되거나 올바르지 않습니다.');ids.add(p.id);
    if(![...TWO_PIN_TYPES,...MULTI_PIN_TYPES].includes(p.type)||typeof p.name!=='string'||p.name.length>80)throw new Error('지원하지 않는 부품입니다.');
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1200||p.y<0||p.y>780||!Number.isFinite(p.rotation)||(data.version===1?![0,1].includes(p.rotation):p.rotation<0||p.rotation>=360))throw new Error('부품 좌표 또는 회전 각도가 올바르지 않습니다.');
    const q={id:p.id,name:p.name,type:p.type,x:p.x,y:p.y,rotation:data.version===1?p.rotation*90:p.rotation};
    if(TWO_PIN_TYPES.includes(p.type)){
      q.span=p.span??70;if(!Number.isFinite(q.span)||q.span<4||q.span>1000)throw new Error('부품 다리 간격이 올바르지 않습니다.');
      for(const k of ['attachA','attachB'])if(p[k]!=null){if(!base(p[k]))throw new Error('존재하지 않는 부품 연결점입니다.');q[k]=p[k];}
      if(q.attachA&&q.attachA===q.attachB)throw new Error('두 다리를 같은 구멍에 꽂을 수 없습니다.');
      if(data.version===1&&q.attachA&&q.attachB){const a=PIN_BY_ID.get(q.attachA)||HOLE_BY_ID.get(q.attachA),b=PIN_BY_ID.get(q.attachB)||HOLE_BY_ID.get(q.attachB);q.x=(a.x+b.x)/2;q.y=(a.y+b.y)/2;q.span=Math.hypot(b.x-a.x,b.y-a.y);q.rotation=normalizeAngle(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);}
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
    return q;
  });
  const end=id=>{if(base(id))return true;const m=/^part:([^:]+):([a-d]|p\d+)$/.exec(id);const p=m&&components.find(p=>p.id===m[1]);return !!p&&terminalKeys(p).includes(m[2]);};
  const wireIds=new Set();
  const wires=data.wires.map(w=>{
    if(!safeId(w.id)||wireIds.has(w.id)||!end(w.from)||!end(w.to)||w.from===w.to||!/^#[0-9a-fA-F]{6}$/.test(w.color))throw new Error('배선 정보가 올바르지 않습니다.');
    wireIds.add(w.id);return {id:w.id,from:w.from,to:w.to,color:w.color};
  });
  return {format:data.format,version:2,name:data.name,code:data.code,components,wires};
}
