import test from 'node:test';
import assert from 'node:assert/strict';
import {deviceExamplePreview,deviceDescriptionText} from '../src/device-example-preview.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {fixture,execute} from '../scripts/docs-audit/runtime.mjs';
import {halExample} from '../src/hal-examples.js';
import {mainOnlyRecipe} from '../src/device-inline-example.js';
import {assess} from '../scripts/docs-audit/oracles.mjs';

test('Docs wiring instructions follow both allocated pins and peripheral names',()=>{
 const binding={pins:{PA5:'PA6',PA2:'PA9',PA3:'PA10'},peripherals:{TIM2:'TIM3',USART2:'USART1'}};
 assert.equal(deviceDescriptionText('TIM2 CH1 PA5 · USART2 PA2(TX)/PA3(RX)',binding),'TIM3 CH1 PA6 · USART1 PA9(TX)/PA10(RX)');
});

test('old LED Docs preview uses the actual remapped GPIO and drives that LED',()=>{
 const {project,target}=fixture('led');project.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:'reservedOutput'};
 const {project:p,binding}=applyDeviceExample(project,target,{api:'HAL_GPIO_WritePin'}),pin=binding.pins.PA5;
 assert.notEqual(pin,'PA5');const preview=deviceExamplePreview(p,'led',{api:'HAL_GPIO_WritePin',binding});
 assert.ok(preview.includes(`HAL_GPIO_WritePin(GPIO${pin[1]}, GPIO_PIN_${Number(pin.slice(2))}, GPIO_PIN_SET)`));
 assert.equal(execute(p,{end:30}).frames.at(-1).parts.selected.on,true);
});

test('old servo Docs preview uses the allocated timer and current clock prescaler',()=>{
 const {project,target}=fixture('servo');project.mcu.peripherals.TIM2={enabled:true,mode:'base',prescaler:0,period:65535,pulse:0};
 const {project:p,binding}=applyDeviceExample(project,target),timer=binding.peripherals.TIM2;
 assert.notEqual(timer,'TIM2');const preview=deviceExamplePreview(p,'servo',{api:'HAL_TIM_PWM_Start',binding});
 assert.match(preview,new RegExp('HAL_TIM_PWM_Start\\(\\(*&h'+timer.toLowerCase()));
 const setup=deviceExamplePreview(p,'servo',{api:'HAL_TIM_PWM_Init',binding});
 assert.ok(setup.includes(`h${timer.toLowerCase()}.Init.Prescaler = ${p.mcu.peripherals[timer].prescaler};`));
 const e=execute(p,{end:3000});assert.equal(e.error,null);assert.ok(e.frames.some(f=>Math.abs(f.parts.selected.angle-90)<5));
});

test('old SHT31 Docs preview follows selected I2C address before and after apply',()=>{
 const {project,target}=fixture('sht31');project.components[0].address=0x45;
 const preview=deviceExamplePreview(project,'sht31',{api:'HAL_I2C_Master_Transmit',part:project.components[0]});assert.match(preview,/0x45\s*<<\s*1/);assert.doesNotMatch(preview,/0x44\s*<<\s*1/);
 const applied=applyDeviceExample(project,target).project,e=execute(applied,{end:3500});assert.equal(e.error,null);assert.ok(e.printed.some(p=>/45\.0 C RH=70\.0/.test(p.text)));
});

test('Docs input polling ignores startup and preserves the configured falling edge',()=>{
 const original=halExample('exti'),p=mainOnlyRecipe(original);assert.match(original.code,/void HAL_GPIO_EXTI_Callback/);
 const e=execute(p,{end:3000,onTick:({time,session})=>{if([1100,2300].includes(time))session.setPressed({USER:time===1100});}});
 assert.equal(e.error,null);assert.equal(e.printed.filter(v=>v.text==='EXTI PC13').length,1);
 assert.ok(e.printed.find(v=>v.text==='EXTI PC13').atMs>=1090);
});

for(const type of ['stepper','l298n'])test(type+' combined GPIO masks follow split-port automatic wiring',()=>{
 const {project,target}=fixture(type),occupied=type==='stepper'?'PB3':'PB4';
 project.mcu.pins[occupied]={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',initial:0,label:'keep'};
 const {project:p,binding}=applyDeviceExample(project,target);
 assert.notEqual(binding.pins[occupied][1],'B');assert.match(p.code,/docsGpioState/);
 const steps=[],e=execute(p,{onTick:({session})=>{const n=session.viewResult?.parts.selected?.steps;if(n!==undefined)steps.push(n);}}),result=assess(type,e);
 if(type==='stepper'){assert.ok(Math.max(...steps)>=95);assert.ok(steps.some((n,i)=>i>0&&n<steps[i-1]));assert.ok(e.printed.some(v=>v.text.includes('direction=-1')));assert.equal(e.error,null);}
 else assert.equal(result.passed,true,JSON.stringify(result.checks.filter(c=>!c.passed)));
 assert.ok(e.frames.every(f=>!f.pins[occupied]?.value),'reserved output is untouched');
 const preview=deviceExamplePreview(p,type,{binding});assert.match(preview,/docsGpioState/);
});
