import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {blankProject,validateProject} from '../src/project.js';
import {HAL_EXAMPLES,HAL_GUIDES,halExample,applyHalExample} from '../src/hal-examples.js';
import {SimulationSession} from '../src/session.js';
import {generateHal} from '../src/mcu-config.js';

const start=code=>{const p=blankProject();p.code=code;const output=[],s=new SimulationSession(p,{print:x=>output.push(x)});s.tick(0);return {s,output};};
test('new projects start as HAL without prebuilt circuits',()=>{
  const p=validateProject(blankProject());assert.equal(p.firmware.mode,'hal');assert.deepEqual(p.components,[]);assert.deepEqual(p.wires,[]);assert.deepEqual(p.mcu.pins,{});assert.match(p.code,/int main\(void\)/);assert.deepEqual(start(p.code).output,['HAL ready']);
});
test('every shipped HAL example has its configured circuit and runs without electrical faults',()=>{
  const counts={ldr:[2,4],ntc:[2,4],sht31:[1,4],mpu6050:[1,4],pir:[1,3],oled:[1,4],tft:[1,7],matrix:[1,5],servo:[1,3],motor:[1,5],stepper:[1,6],relay:[3,7],joystick:[1,5],encoder:[1,5],blink:[2,3],button:[3,5],exti:[2,3],uart:[1,4],timer:[2,3],adc:[2,3],temperature:[1,3],samples:[2,3],i2c:[1,4],spi:[1,6],language:[0,0],pwm:[2,3],ultrasonic:[3,6]};
  for(const kind of Object.keys(HAL_EXAMPLES)){const p=validateProject(halExample(kind));assert.deepEqual([p.components.length,p.wires.length],counts[kind],kind);assert.equal(p.firmware.mode,'hal');assert.ok(HAL_GUIDES[kind]);assert.doesNotMatch(p.code,/\bSerial\d*\.|\bsetup\s*\(|\bloop\s*\(/);const s=new SimulationSession(p);s.tick(0);s.tick(150);assert.equal(s.result.fault,false,kind);}
  for(const file of ['src/feature-examples.js','src/component-examples.js'])assert.equal(fs.existsSync(file),false);
});
test('applying a HAL example replaces circuit, code, pins and timing while retaining the document name',()=>{
  const p=halExample('uart');p.name='user circuit';p.simulation={stepMs:.5,pwmWaveform:true};p.firmware.files=[{name:'old.h',text:'// old source'}];const before=structuredClone(p),next=applyHalExample(p,'adc');
  assert.deepEqual(p,before);assert.deepEqual(next,{...halExample('adc'),name:p.name});assert.notDeepEqual(next.components,p.components);assert.notDeepEqual(next.wires,p.wires);assert.notDeepEqual(next.mcu,p.mcu);assert.notDeepEqual(next.simulation,p.simulation);assert.deepEqual(next.firmware.files,[]);next.components[0].name='changed';assert.notEqual(next.components[0].name,halExample('adc').components[0].name);
  const pwm=applyHalExample(next,'pwm');assert.deepEqual(pwm.simulation,{stepMs:.1,pwmWaveform:true});const language=applyHalExample(pwm,'language');assert.deepEqual(language.components,[]);assert.deepEqual(language.wires,[]);assert.deepEqual(language.simulation,{stepMs:1,pwmWaveform:false});
});
test('printf handles C integers, width, precision, strings, pointers and literal percent',()=>{
  const {output}=start('#include <stdio.h>\nint main(void){char label[]="HAL";int n=printf("%s %d %lu %04X %.1f %c %%",label,-7,4294967295,42,1.25,65);printf("count=%d",n);printf("%hhd %hu %+05d %-4s %.3s",255,-1,7,"x","hello");}');
  assert.deepEqual(output,['HAL -7 4294967295 002A 1.3 A %','count=30','-1 65535 +0007 x    hel']);
});
test('printf and puts reach the debug log without UART configuration or wiring',()=>{
  const {output}=start('int main(void){printf("value=%u\\n",42);puts("ready");printf("first\\nsecond\\n");}');assert.deepEqual(output,['value=42','ready','first\nsecond']);
});
test('invalid printf formats, pointers, lengths and missing values fail explicitly',()=>{
  for(const call of ['printf("%n",0)','printf("%d")','printf("%s",0)','printf("%99999d",1)','printf("%.99f",1.0)','printf("%ls","wide")','printf(42)'])assert.throws(()=>start('int main(void){'+call+';}'),/printf/);
  assert.throws(()=>start('int main(void){char bad[2]={65,66};printf("%s",bad);}'),/범위/);
});
test('HAL UART transmit logging works without a terminal but does not fabricate received bytes',()=>{
  const p=halExample('uart');p.components=[];p.wires=[];const events=[],s=new SimulationSession(p,{uart:e=>events.push(e)});s.tick(0);s.tick(30);assert.equal(s.inject('not wired','USART2'),0);assert.equal(s.buses.received.size,0);
  assert.equal(events[0].instance,'USART2');assert.equal(events[0].direction,'TX');assert.equal(String.fromCharCode(...events[0].bytes),'HAL UART ready\r\n');assert.equal(events.filter(e=>e.direction==='RX').length,0);
});
test('HAL UART traces timed RX and IT echo with port identity',()=>{
  const events=[],s=new SimulationSession(halExample('uart'),{uart:e=>events.push(e)});s.tick(0);s.tick(30);s.inject('OK','USART2');s.tick(30.5);assert.equal(events.filter(e=>e.direction==='RX').length,0);s.tick(40);
  assert.equal(events.filter(e=>e.direction==='RX').map(e=>String.fromCharCode(...e.bytes)).join(''),'OK');assert.equal(events.filter(e=>e.direction==='TX').slice(1).map(e=>String.fromCharCode(...e.bytes)).join(''),'OK');assert.ok(events.every(e=>e.instance==='USART2'));
});
test('HAL UART timeout and busy calls do not emit extra TX log events',()=>{
  const p=halExample('uart');p.code=p.code.replace('  HAL_UART_Transmit(&huart2, message, sizeof(message)-1, 100);','  HAL_UART_Transmit(&huart2, message, sizeof(message)-1, 0);\n  HAL_UART_Transmit_IT(&huart2, message, sizeof(message)-1);\n  HAL_UART_Transmit_IT(&huart2, message, sizeof(message)-1);');const events=[],s=new SimulationSession(p,{uart:e=>events.push(e)});s.tick(0);assert.equal(events.filter(e=>e.direction==='TX').length,1);
});
test('converted sensor and sampling examples produce measured HAL log values',()=>{
  for(const [kind,pattern]of [['temperature',/TMP36=25.0 C/],['samples',/sample\[7\]=204[78]/],['ultrasonic',/distance=100.0 cm/],['language',/average=25/]]){const output=[],s=new SimulationSession(halExample(kind),{print:x=>output.push(x),channels:kind==='ultrasonic'?['PA9']:undefined});s.tick(0);for(let t=5;t<=120;t+=5)s.tick(t);assert.match(output.join('\n'),pattern,kind);if(kind==='ultrasonic'){const echoPeak=Math.max(...s.wave.samples.map(x=>x.values[0]??0));assert.ok(echoPeak>3.1&&echoPeak<3.3,'ECHO divider limits the GPIO input voltage');}}
  const p=halExample('ultrasonic');p.wires=p.wires.filter(w=>w.to!=='part:demo:p1');const output=[],s=new SimulationSession(p,{print:x=>output.push(x)});s.tick(0);s.tick(100);assert.ok(output.includes('HC-SR04 timeout'));
});
test('the HAL button circuit follows presses and releases through its pull-up input',()=>{
  const output=[],s=new SimulationSession(halExample('button'),{print:x=>output.push(x)});s.tick(0);assert.equal(s.result.parts.led1.on,false);s.setPressed({b1:true});s.tick(101);assert.equal(s.result.parts.led1.on,true);s.setPressed({});s.tick(202);assert.equal(s.result.parts.led1.on,false);assert.deepEqual(output,['button=0','button=1','button=0']);
});
test('the HAL PWM example enables pulse simulation and its RC filter smooths PA0',()=>{
  const s=new SimulationSession(halExample('pwm'));s.tick(0);s.tick(100);const settled=s.wave.samples.filter(x=>x.micros>50000),pwm=settled.map(x=>x.values[0]),filtered=settled.map(x=>x.values[2]);assert.ok(Math.min(...pwm)<.1);assert.ok(Math.max(...pwm)>3.1);assert.ok(Math.min(...filtered)>1);assert.ok(Math.max(...filtered)<2.2);assert.equal(s.result.fault,false);
});
test('TIM base counter follows configured clock, stops, resumes, and wraps at ARR',()=>{
  const p=halExample('ultrasonic');p.mcu.peripherals.TIM2.period=999;p.code=generateHal(p.mcu).replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n HAL_TIM_Base_Start(&htim2);\n HAL_Delay(2);\n printf("%lu",__HAL_TIM_GET_COUNTER(&htim2));\n __HAL_TIM_SET_COUNTER(&htim2,900);\n HAL_Delay(1);\n printf("%lu",__HAL_TIM_GET_COUNTER(&htim2));\n HAL_TIM_Base_Stop(&htim2);\n HAL_Delay(3);\n printf("%lu",__HAL_TIM_GET_COUNTER(&htim2));');const output=[],s=new SimulationSession(p,{print:x=>output.push(x)});s.tick(0);s.tick(10);assert.deepEqual(output,['0','900','900']);
});
