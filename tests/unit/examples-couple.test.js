// Feature 51: an example opens with "주변장치별 .c/.h로 생성" on and its code already divided — the MX_*_Init functions and
// handles are in gpio.c, i2c.c …; an init the example wrote by hand is a stored (edited) file of the project. The
// dividing code is in Rust (rust/stm-core/src/couple.rs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHalExample,allHalExamples,halExampleFor,tidyExampleSource,coupleExample,consoleExample} from '../../src/hal-examples.js';
import {applyLectureExample,LECTURE_EXAMPLES} from '../../src/lecture-examples.js';
import {applyDeviceExample,removeDeviceExample} from '../../src/device-assistance.js';
import {docsRegions} from '../../src/device-code-insertion.js';
import {blankProject,validateProject} from '../../src/project.js';
import {cFunctions} from '../../src/c-source-edit.js';
import {compileHal} from '../../src/hal-source.js';
import {halFiles,peripheralFiles} from '../../src/peripheral-files.js';
import {importFirmware} from '../../src/firmware-import.js';
import {exportIoc} from '../../src/ioc-export.js';
import {PART_DEFS} from '../../src/components.js';
import {SimulationSession} from '../../src/session.js';
import {consoleSink} from './helpers/console.js';

const BOARDS=[['nucleo-f446re','STM32F446RE'],['nucleo-f103rb','STM32F103RB']];
const open=(boardId,family,kind,options)=>validateProject(applyHalExample({...blankProject(family),boardId},kind,options));
const mx=code=>cFunctions(code).map(f=>f.name).filter(n=>/^MX_\w+_Init$/.test(n));
const stored=p=>p.firmware.files.filter(f=>f.origin==='gen').map(f=>f.name);
const run=(project,ms=400)=>{const out=[],s=new SimulationSession(project,consoleSink(out));for(let t=0;t<=ms;t+=10)s.tick(t);return {out,fault:s.result.fault};};

test('every HAL example opens divided on both boards and builds for the interpreter',()=>{
 const failures=[],kept={};
 for(const [boardId,family]of BOARDS)for(const kind of Object.keys(allHalExamples())){
  let p;try{p=open(boardId,family,kind);}catch{continue;} // an example this board does not have
  try{
   if(p.mcu.coupleFiles!==true)throw new Error('the option is off');
   if(mx(p.code).length)throw new Error('main.c defines '+mx(p.code).join(', '));
   if(/^\w+_HandleTypeDef \w+;/m.test(p.code)){const sources=halFiles(p).filter(f=>f.name.endsWith('.c')).map(f=>f.text).join('\n');
    for(const m of p.code.matchAll(/^(\w+_HandleTypeDef) (\w+);/gm))if(sources.includes(m[0]))throw new Error(m[2]+' is defined twice');}
   compileHal(p.code,halFiles(p),family);
   for(const name of stored(p))(kept[name]??=[]).push(boardId.slice(7)+':'+kind);
  }catch(e){failures.push(`${boardId}:${kind}: ${e.message.slice(0,160)}`);}
 }
 assert.deepEqual(failures,[],failures.join('\n'));
 // Only the examples that set a peripheral up by hand keep a file of their own.
 assert.deepEqual(kept,{'Core/Src/gpio.c':['f446re:ref_servo_feedback_4','f446re:ref_rgb_common_anode_4','f446re:ref_sevenseg_common_anode_10'],'Core/Src/adc.c':['f446re:adc_dma_scan','f103rb:adc_dma_scan']});
});

test('blink: main.c includes the pairs, gpio.c and usart.c are generated from the settings, the console prints',()=>{
 const p=open('nucleo-f446re','STM32F446RE','blink');
 assert.match(p.code,/#include "main\.h"\n#include "usart\.h"\n#include "gpio\.h"/);assert.deepEqual(stored(p),[]);
 assert.match(p.code,/MX_GPIO_Init\(\);[^]*MX_USART2_UART_Init\(\);[^]*USER CODE BEGIN 2/);assert.match(p.code,/int _write\(int file, char \*ptr, int len\)/);
 const files=Object.fromEntries(halFiles(p).map(f=>[f.name,f.text]));
 assert.deepEqual(Object.keys(files),['usart.h','usart.c','gpio.h','gpio.c']);
 assert.match(files['gpio.c'],/GPIO_PIN_5/);assert.match(files['usart.c'],/huart2\.Init\.BaudRate = 115200;/);
 // Without the console (the Docs recipes, previews): the same division, no USART2.
 const plain=open('nucleo-f446re','STM32F446RE','blink',{console:false});
 assert.equal(plain.mcu.coupleFiles,true);assert.doesNotMatch(plain.code,/usart\.h|_write/);assert.match(plain.code,/#include "gpio\.h"/);
});

test('an init the example wrote by hand keeps its body in a stored pair; the console pins are added to it',()=>{
 const p=open('nucleo-f446re','STM32F446RE','adc_dma_scan'),adc=p.firmware.files.find(f=>f.name==='Core/Src/adc.c');
 assert.equal(adc.origin,'gen');assert.equal(adc.base,peripheralFiles(p.mcu).find(f=>f.name==='adc.c').text,'what the generator writes for the settings');
 assert.notEqual(adc.text,adc.base);assert.match(adc.text,/USER CODE END ADC1_Init 0 \*\/\n[^]*HAL_ADC_Init\(&hadc1\)[^]*USER CODE BEGIN ADC1_Init 2/);
 const rgb=open('nucleo-f446re','STM32F446RE','ref_rgb_common_anode_4'),gpio=rgb.firmware.files.find(f=>f.name==='Core/Src/gpio.c');
 assert.match(gpio.text,/HAL_GPIO_Init\(GPIOB, &GPIO_InitStruct\);\n {2}\{\n[^]*GPIO_InitStruct\.Pin = GPIO_PIN_2;[^]*GPIO_AF7_USART2;[^]*\}\n {2}\/\* USER CODE BEGIN GPIO_Init 2 \*\//,'the USART2 pins are set up at the end of the hand-written MX_GPIO_Init');
 assert.ok(!run(rgb).fault);
});

test('dividing is safe to repeat and leaves a main.c it cannot divide as one file',()=>{
 const one=tidyExampleSource(halExampleFor('i2c','nucleo-f446re')),divided=coupleExample(one);
 assert.equal(one.mcu.coupleFiles,undefined);assert.equal(divided.mcu.coupleFiles,true);assert.notEqual(divided.code,one.code);
 assert.equal(coupleExample(divided),divided,'already divided');
 // A handle defined another way would be defined twice: the example stays as it is.
 const odd={...one,code:one.code.replace(/^I2C_HandleTypeDef hi2c1;/m,'I2C_HandleTypeDef hi2c1 = {0};')};
 assert.notEqual(odd.code,one.code);assert.equal(coupleExample(odd),odd);
 // The console on a one-file example is the function, its prototype and the handle in main.c, as before.
 const console=consoleExample(structuredClone(one));
 assert.match(console.code,/^UART_HandleTypeDef huart2;/m);assert.match(console.code,/^void MX_USART2_UART_Init\(void\) \{/m);assert.doesNotMatch(console.code,/usart\.h/);
 assert.doesNotThrow(()=>compileHal(console.code,[],console.mcu.family));
});

test('lecture examples: the main board and the other STM32 boards open divided',()=>{
 assert.ok(LECTURE_EXAMPLES.length>0);
 for(const {id} of LECTURE_EXAMPLES){
  const {project}=applyLectureExample(id),programs=[project,...project.components.filter(c=>c.type==='devboard'&&c.firmware?.mode==='hal'&&c.mcu)];
  for(const p of programs){
   if(p.firmware?.mode!=='hal')continue;
   assert.equal(p.mcu.coupleFiles,true,id);assert.deepEqual(mx(p.code),[],id);
   assert.doesNotThrow(()=>compileHal(p.code,halFiles({firmware:p.firmware,mcu:p.mcu,code:p.code}),p.mcu.family),id);
  }
 }
});

test('Docs on an example with a stored gpio.c: the device\'s pin setup is added to that file as a region',()=>{
 const p=open('nucleo-f446re','STM32F446RE','ref_rgb_common_anode_4');
 p.components.push({id:'extra',type:'led',name:'LED',x:900,y:420,rotation:0,span:70,...PART_DEFS.led?.defaults,color:'red'});
 const before=p.firmware.files.find(f=>f.name==='Core/Src/gpio.c').text;
 const applied=applyDeviceExample(p,{type:'part',id:'extra'}).project,gpio=applied.firmware.files.find(f=>f.name==='Core/Src/gpio.c').text;
 const region=docsRegions(gpio).regions.find(r=>r.tag==='led:extra'&&r.role==='MX_GPIO_Init');
 assert.ok(region,'a Docs region in gpio.c');assert.match(gpio.slice(region.start,region.end),/HAL_GPIO_Init\(GPIO[A-C], &GPIO_InitStruct\)/);
 assert.equal(gpio.slice(0,region.start)+gpio.slice(region.end),before,'the hand-written body is untouched');
 assert.deepEqual(mx(applied.code),[]);assert.doesNotThrow(()=>compileHal(applied.code,halFiles(applied),applied.mcu.family));assert.ok(!run(applied).fault);
 const removed=removeDeviceExample(applied,{type:'part',id:'extra'}).project;
 assert.equal(removed.firmware.files.find(f=>f.name==='Core/Src/gpio.c').text,before);assert.deepEqual(removed.mcu,p.mcu);
});

test('a CubeMX .ioc brought into a new project follows its own "CoupleFile"',()=>{
 const start=blankProject(),{coupleFiles:_on,...oneFile}=start.mcu;
 const off=importFirmware(start,[{name:'project.ioc',text:exportIoc(oneFile)}]).project;
 assert.equal('coupleFiles' in off.mcu,false);assert.ok(mx(off.code).includes('MX_GPIO_Init'),'main.c is one file again');assert.doesNotMatch(off.code,/#include "gpio\.h"/);
 const on=importFirmware(start,[{name:'project.ioc',text:exportIoc(start.mcu)}]).project;
 assert.equal(on.mcu.coupleFiles,true);assert.deepEqual(mx(on.code),[]);
});
