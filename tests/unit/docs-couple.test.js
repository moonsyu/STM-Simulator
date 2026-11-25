// Feature 51: a new STM32 project generates a pair of .c/.h files per peripheral, and a device's Docs example applied
// to such a project has its init code in gpio.c / i2c.c … (the generator writes it from the Pinout settings Docs
// changed): main.c includes the pair and calls its init function instead of defining them. The installer is in Rust
// (rust/stm-core/src/docs_regions.rs).
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {applyDeviceExample,removeDeviceExample} from '../../src/device-assistance.js';
import {docsRegions,regionBody} from '../../src/device-code-insertion.js';
import {cFunctions} from '../../src/c-source-edit.js';
import {PART_DEFS} from '../../src/components.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {compileHal} from '../../src/hal-source.js';
import {halFiles} from '../../src/peripheral-files.js';
import {DEVICE_RECIPES} from '../../src/device-docs-data.js';
import {newProjectMcu} from '../../src/rust-core.js';
import {defaultMcu} from '../../src/mcu-config.js';
import {consoleSink} from './helpers/console.js';
import {oneFileBlank} from './helpers/one-file.js';

const USER_LINE='  int keepMe = 7; /* 학생 코드 */';
function withParts(p,...parts){
  p.code=p.code.replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n'+USER_LINE);
  for(const [type,id='sel',extra={}]of parts)p.components.push({id,type,name:type.toUpperCase(),x:800,y:350,rotation:0,span:70,...PART_DEFS[type]?.defaults,...(type==='resistor'?{value:10000}:{}),...(type==='led'?{color:'red'}:{}),...extra});
  return p;
}
const part=id=>({type:'part',id});
const apply=(p,id,options)=>applyDeviceExample(p,part(id),options).project;
const regions=(code,tag)=>docsRegions(code).regions.filter(r=>!tag||r.tag===tag);
const body=(code,tag,role)=>{const r=regions(code,tag).find(r=>r.role===role);return r?regionBody(code,r):null;};
const defined=code=>cFunctions(code).map(f=>f.name);
const pair=(project,name)=>halFiles(project).find(f=>f.name.split('/').at(-1)===name)?.text??null;
const roundTrip=p=>validateProject(JSON.parse(JSON.stringify(p)));
function run(project,ms=600){const out=[],s=new SimulationSession(project,consoleSink(out));for(let t=0;t<=ms;t+=10)s.tick(t);return {out,fault:s.result.fault,parts:s.result.parts};}

describe('a new STM32 project generates per-peripheral files',()=>{
  test('the settings of a new project come from Rust: the default clock, no pins, the option on',()=>{
    for(const family of ['STM32F446RE','STM32F103RB'])assert.deepEqual(newProjectMcu(family),{...defaultMcu(family),coupleFiles:true});
    assert.notEqual(newProjectMcu('STM32F446RE'),newProjectMcu('STM32F446RE'));
    assert.throws(()=>newProjectMcu('R7FA6E10F'),/지원하지 않는 MCU입니다: R7FA6E10F/);
  });
  test('blank project: main.c includes gpio.h and usart.h, the init functions are in the pairs, it runs',()=>{
    for(const p of [blankProject(),projectForBoard('nucleo-f103rb')]){
      assert.equal(p.mcu.coupleFiles,true);
      assert.match(p.code,/#include "main\.h"\n#include "usart\.h"\n#include "gpio\.h"/);
      assert.deepEqual(defined(p.code).filter(n=>/^MX_/.test(n)),[]);assert.doesNotMatch(p.code,/^UART_HandleTypeDef huart2;/m);
      assert.match(p.code,/MX_GPIO_Init\(\);\s*MX_USART2_UART_Init\(\);/);assert.match(p.code,/printf\("HAL ready\\n"\);/);
      assert.match(pair(p,'usart.c'),/UART_HandleTypeDef huart2;[^]*void MX_USART2_UART_Init\(void\) \{/);assert.match(pair(p,'gpio.c'),/void MX_GPIO_Init\(void\) \{/);
      assert.deepEqual(p.firmware.files,[],'the pairs are generated, not stored');
      assert.deepEqual(validateProject(p),p);
      assert.deepEqual(run(p,100).out,['HAL ready']);
    }
  });
  test('a saved project without the option stays as one file',()=>{
    const old=oneFileBlank();assert.equal('coupleFiles' in old.mcu,false);
    const loaded=roundTrip(old);assert.equal('coupleFiles' in loaded.mcu,false);assert.equal(loaded.code,old.code);
    assert.ok(defined(loaded.code).includes('MX_GPIO_Init'));assert.deepEqual(halFiles(loaded),[]);
  });
});

describe('Docs apply with per-peripheral files',()=>{
  test('GPIO device: nothing of MX_GPIO_Init in main.c — gpio.c has the pin; removing gives the project back',()=>{
    const original=withParts(blankProject(),['led']),project=apply(original,'sel'),code=project.code;
    assert.deepEqual(defined(code).filter(n=>/^MX_/.test(n)),[]);assert.doesNotMatch(code,/GPIO_InitStruct|static void MX_/);
    assert.equal(body(code,'led:sel','MX_GPIO_Init'),null);assert.match(body(code,'led:sel','LOOP'),/HAL_GPIO_TogglePin\(GPIOA, GPIO_PIN_5\)/);
    assert.match(pair(project,'gpio.c'),/GPIO_InitStruct\.Pin = [^;]*GPIO_PIN_5[^]*HAL_GPIO_Init\(GPIOA, &GPIO_InitStruct\)/);
    assert.deepEqual(project.firmware.files,[]);assert.ok(code.includes(USER_LINE));
    assert.doesNotThrow(()=>compileHal(code,halFiles(project),project.mcu.family));
    const seen=new Set(),s=new SimulationSession(project,{print(){}});for(let t=0;t<=1200;t+=50){s.tick(t);seen.add(s.result.parts.sel?.on);}
    assert.deepEqual([...seen].sort(),[false,true],'the LED blinks');
    assert.equal(JSON.stringify(apply(roundTrip(project),'sel')),JSON.stringify(project),'applying again changes nothing');
    const removed=removeDeviceExample(project,part('sel')).project;
    assert.equal(removed.code.replace(/(\/\* USER CODE BEGIN 3 \*\/)\s*HAL_Delay\(500\);/,'$1'),original.code.replace(/(\/\* USER CODE BEGIN 3 \*\/)\s*HAL_Delay\(500\);/,'$1'));
    assert.deepEqual(removed.mcu,original.mcu);assert.doesNotMatch(pair(removed,'gpio.c'),/GPIO_PIN_5/);
  });
  test('I2C device: main.c includes i2c.h and calls MX_I2C1_Init; the handle and the function are in i2c.c',()=>{
    const project=apply(withParts(blankProject(),['sht31']),'sel'),code=project.code;
    assert.match(body(code,'sht31:sel','INC_i2c'),/^#include "i2c\.h"\n$/);assert.match(body(code,'sht31:sel','MX_I2C1_Init_CALL'),/^\s*MX_I2C1_Init\(\);\n$/);
    assert.ok(code.indexOf('#include "i2c.h"')<code.indexOf('int main(void)'));
    const main=cFunctions(code).find(f=>f.name==='main').body;
    assert.ok(main.indexOf('MX_I2C1_Init();')>main.indexOf('MX_GPIO_Init();')&&main.indexOf('MX_I2C1_Init();')<main.indexOf('USER CODE BEGIN 2'));
    for(const role of ['MX_I2C1_Init','MX_I2C1_Init_PROTO','HANDLE_hi2c1','MX_GPIO_Init'])assert.equal(body(code,'sht31:sel',role),null,role);
    assert.doesNotMatch(code,/I2C_HandleTypeDef hi2c1;|static void MX_/);
    assert.match(pair(project,'i2c.c'),/I2C_HandleTypeDef hi2c1;[^]*void MX_I2C1_Init\(void\) \{[^]*HAL_I2C_Init\(&hi2c1\)/);
    assert.match(pair(project,'i2c.h'),/extern I2C_HandleTypeDef hi2c1;[^]*void MX_I2C1_Init\(void\);/);
    const {out,fault}=run(project,1500);assert.ok(!fault);assert.ok(out.some(l=>/SHT31/.test(l)),out.join('|'));
    // A second device on the bus shares the include and the call; they go to it when the first is removed.
    let two=withParts(blankProject(),['sht31','a'],['sht31','b',{address:0x45}]);two=apply(two,'a');two=apply(two,'b');
    assert.equal(regions(two.code).filter(r=>r.role==='INC_i2c').length,1);assert.equal(regions(two.code).filter(r=>r.role==='MX_I2C1_Init_CALL').length,1);
    const {project:left,report}=removeDeviceExample(two,part('a'));
    assert.ok(report.retagged>=2);assert.ok(regions(left.code,'sht31:b').some(r=>r.role==='INC_i2c'));assert.ok(regions(left.code,'sht31:b').some(r=>r.role==='MX_I2C1_Init_CALL'));
    assert.ok(left.mcu.peripherals.I2C1?.enabled);assert.ok(!run(left,300).fault);
    const none=removeDeviceExample(left,part('b')).project;
    assert.doesNotMatch(none.code,/STM-DOCS|i2c\.h|MX_I2C1_Init/);assert.equal(pair(none,'i2c.c'),null);
  });
  test('F103RB ADC device: the ADC clock is set in front of the call Docs adds',()=>{
    const project=apply(withParts(projectForBoard('nucleo-f103rb'),['potentiometer']),'sel'),call=body(project.code,'potentiometer:sel','MX_ADC1_Init_CALL');
    assert.match(call,/HAL_RCCEx_PeriphCLKConfig\(&\w+\)[^]*\}\s*MX_ADC1_Init\(\);/);
    assert.match(pair(project,'adc.c'),/void MX_ADC1_Init\(void\) \{/);assert.doesNotMatch(project.code,/static void MX_ADC1_Init|ADC_HandleTypeDef hadc1;/);
    const {out,fault}=run(project,1200);assert.ok(!fault);assert.ok(out.some(l=>/^ADC=/.test(l)),out.join('|'));
  });
  test('a main.c that still defines its init functions (the box ticked, not generated yet) is extended as before',()=>{
    const p=withParts(oneFileBlank(),['led']);p.mcu.coupleFiles=true;
    const code=apply(p,'sel').code;
    assert.match(body(code,'led:sel','MX_GPIO_Init'),/HAL_GPIO_Init\(GPIOA, &GPIO_InitStruct\)/);assert.doesNotMatch(code,/#include "gpio\.h"/);
  });
  test('register-level example: the body goes into MX_GPIO_Init of gpio.c, which is stored; removing takes it out',()=>{
    const original=withParts(blankProject(),['led']),{project,binding}=applyDeviceExample(original,part('sel'),{mode:'baremetal',api:'all'});
    assert.equal(binding.mode,'baremetal');assert.equal(project.ide.native.target,'arm');
    assert.doesNotMatch(project.code,/static void MX_GPIO_Init|GPIOA->MODER/);assert.match(body(project.code,'led:sel','LOOP'),/GPIOA->BSRR/);
    assert.deepEqual(project.firmware.files.map(f=>[f.name,f.origin]),[['Core/Src/gpio.c','gen']]);
    const gpio=project.firmware.files[0].text,fn=cFunctions(gpio).find(f=>f.name==='MX_GPIO_Init'),r=docsRegions(gpio).regions.find(x=>x.tag==='led:sel'&&x.role==='MX_GPIO_Init');
    assert.ok(r&&r.start>fn.open&&r.end<fn.end,'the region is inside MX_GPIO_Init');assert.match(regionBody(gpio,r),/RCC->AHB1ENR\s*\|=\s*RCC_AHB1ENR_GPIOAEN[^]*GPIOA->MODER/);
    assert.equal(JSON.stringify(applyDeviceExample(roundTrip(project),part('sel'),{mode:'baremetal',api:'all'}).project),JSON.stringify(project),'applying again changes nothing');
    const removed=removeDeviceExample(project,part('sel')).project;
    assert.deepEqual(removed.firmware.files,[]);assert.doesNotMatch(removed.code,/STM-DOCS|BSRR/);assert.equal(removed.ide.native.target,'simulator');
  });
  test('every Docs recipe: the same output as in a one-file project, nothing defined twice, idempotent',()=>{
    const failures=[];
    for(const type of Object.keys(DEVICE_RECIPES)){
      try{
        const target=type==='board'?{type:'surface',id:'board'}:part('sel'),parts=type==='board'?[]:[[type]];
        const {project}=applyDeviceExample(withParts(blankProject(),...parts),target),one=applyDeviceExample(withParts(oneFileBlank(),...parts),target).project;
        validateProject(project);
        if(project.firmware.files.length)throw new Error('stored files '+project.firmware.files.map(f=>f.name).join(','));
        if(!project.code.includes(USER_LINE))throw new Error('user code lost');
        if(/static void MX_\w+_Init/.test(project.code))throw new Error('an init function in main.c');
        // A handle of main.c is one no pair defines (CAN, I2S: peripherals the Pinout does not generate).
        const sources=halFiles(project).filter(f=>f.name.endsWith('.c')).map(f=>f.text).join('\n');
        for(const m of project.code.matchAll(/^(\w+_HandleTypeDef) (\w+);/gm))if(sources.includes(m[0]))throw new Error(m[2]+' is defined twice');
        if(JSON.stringify(applyDeviceExample(roundTrip(project),target).project)!==JSON.stringify(project))throw new Error('second apply changed the project');
        const a=run(project,400),b=run(one,400);
        if(a.fault)throw new Error('circuit fault');
        if(JSON.stringify(a.out)!==JSON.stringify(b.out))throw new Error('output differs: '+JSON.stringify(a.out.slice(0,3))+' / '+JSON.stringify(b.out.slice(0,3)));
        if(JSON.stringify(a.parts)!==JSON.stringify(b.parts))throw new Error('part states differ');
      }catch(e){failures.push(`${type}: ${e.message.slice(0,200)}`);}
    }
    assert.deepEqual(failures,[],failures.join('\n'));
  });
});
