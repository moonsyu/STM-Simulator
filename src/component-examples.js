import {blankProject} from './project.js';
import {PART_DEFS,TWO_PIN_TYPES} from './components.js';
import {boardPin} from './pins.js';
import {findMount,applyMount} from './placement.js';
import {featureExample} from './feature-examples.js';
export function componentExample(type){
 if(['uart','i2c','spi'].includes(type))return featureExample(type);
 const def=PART_DEFS[type];if(!def)throw new Error('지원하지 않는 예제입니다.');
 const project=blankProject();project.name=def.name+' 실습';
 const part={id:'demo',type,name:def.prefix+'1',x:type==='sevenseg'?795:type==='ultrasonic'?848:844,y:type==='sevenseg'||['potentiometer','slide','temperature'].includes(type)?310:303,rotation:90,...def.defaults};
 if(TWO_PIN_TYPES.includes(type))part.span=70;
 applyMount(part,findMount(part));project.components.push(part);
 let id=0;const pin=key=>`part:demo:${key}`,wire=(a,b,color='#23a68a')=>project.wires.push({id:'w'+(++id),from:a,to:b,color});
 const power=(key,name)=>wire(boardPin(name),pin(key),name==='GND'?'#4e647b':'#dd654c');
 const series=(key,name,index=0,value=330)=>{const r={id:'r'+index,name:'R'+(index+1),type:'resistor',x:555,y:155+index*59,span:56,rotation:0,value};project.components.push(r);wire(boardPin(name),`part:${r.id}:a`);wire(`part:${r.id}:b`,pin(key));};
 let setup='',loop='delay(100);';
 if(type==='potentiometer'||type==='temperature'){
   power(type==='potentiometer'?'p1':'p3','GND');power(type==='potentiometer'?'p3':'p1','3V3');wire(pin('p2'),boardPin('A0'));
   setup='pinMode(A0, INPUT);\n  Serial.begin(115200);';loop=type==='temperature'?'float voltage = analogRead(A0) * 3.3 / 4095;\n  Serial.println((voltage - 0.5) * 100);\n  delay(200);':'Serial.println(analogRead(A0));\n  delay(200);';
 }
 if(type==='slide'){power('p1','GND');power('p3','3V3');wire(pin('p2'),boardPin('D2'));setup='pinMode(D2, INPUT);\n  pinMode(D13, OUTPUT);';loop='digitalWrite(D13, digitalRead(D2));\n  delay(20);';}
 if(['diode','capacitor','buzzer'].includes(type)){
   power('b','GND');if(type==='buzzer')wire(boardPin('D13'),pin('a'));else series('a','D13',0,type==='capacitor'?1000:330);
   setup='pinMode(D13, OUTPUT);';loop='digitalWrite(D13, HIGH);\n  delay(500);\n  digitalWrite(D13, LOW);\n  delay(500);';
 }
 if(type==='rgb'){
   power('p2','GND');['p1','p3','p4'].forEach((key,i)=>series(key,['D9','D10','D11'][i],i));setup=['D9','D10','D11'].map(p=>`pinMode(${p}, OUTPUT);`).join('\n  ');
   loop='digitalWrite(D9, HIGH);\n  digitalWrite(D10, LOW);\n  digitalWrite(D11, LOW);\n  delay(500);\n  digitalWrite(D9, LOW);\n  digitalWrite(D10, HIGH);\n  delay(500);\n  digitalWrite(D10, LOW);\n  digitalWrite(D11, HIGH);\n  delay(500);\n  digitalWrite(D9, HIGH);\n  digitalWrite(D10, HIGH);\n  delay(500);';
 }
 if(type==='sevenseg'){
   power('p3','GND');const keys=['p7','p6','p4','p2','p1','p9','p10','p5'];keys.forEach((key,i)=>series(key,'D'+(i+2),i));setup=keys.map((_,i)=>`pinMode(D${i+2}, OUTPUT);\n  digitalWrite(D${i+2}, HIGH);`).join('\n  ');
 }
 if(type==='ultrasonic'){
   power('p1','5V');power('p4','GND');wire(boardPin('D9'),pin('p2'));wire(pin('p3'),boardPin('D8'));
   setup='pinMode(D9, OUTPUT);\n  pinMode(D8, INPUT);\n  Serial.begin(115200);';loop='digitalWrite(D9, LOW);\n  delayMicroseconds(2);\n  digitalWrite(D9, HIGH);\n  delayMicroseconds(10);\n  digitalWrite(D9, LOW);\n  long duration = pulseIn(D8, HIGH, 30000);\n  Serial.println(duration / 58);\n  delay(100);';
 }
 project.code=`// ${def.name} · 오른쪽 속성에서 값과 연결을 확인하세요.\nvoid setup() {\n  ${setup}\n}\n\nvoid loop() {\n  ${loop}\n}`;return project;
}
