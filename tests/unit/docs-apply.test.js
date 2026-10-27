// Docs apply/remove: per-device STM-DOCS markers, BareMetal apply, MX_*_Init placement,
// removal after edits (with/without circuit), idempotent re-apply and legacy projects.
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {applyDeviceExample,removeDeviceExample} from '../../src/device-assistance.js';
import {docsRegions,regionBody} from '../../src/device-code-insertion.js';
import {cFunctions,maskC} from '../../src/c-source-edit.js';
import {PART_DEFS} from '../../src/components.js';
import {blankProject,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {compileHal} from '../../src/hal-source.js';
import {wiringTopology} from '../../src/device-docs-data.js';
import {boardPin} from '../../src/pins.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const USER_LINE='  int keepMe = 7; /* 학생 코드 */';
function projectWith(...parts){
  const p=blankProject();p.code=p.code.replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n'+USER_LINE);
  for(const [type,id='sel',extra={}]of parts)p.components.push({id,type,name:type.toUpperCase(),x:800,y:350,rotation:0,span:70,...PART_DEFS[type]?.defaults,...(type==='led'?{color:'red'}:{}),...extra});
  return p;
}
const part=id=>({type:'part',id});
const apply=(p,id,options)=>applyDeviceExample(p,part(id),options).project;
const regions=(code,tag)=>docsRegions(code).regions.filter(r=>!tag||r.tag===tag);
const body=(code,tag,role)=>{const r=regions(code,tag).find(r=>r.role===role);return r?regionBody(code,r):null;};
const fn=(code,name)=>cFunctions(code).find(f=>f.name===name);
const inside=(code,tag,role,name)=>{const r=regions(code,tag).find(r=>r.role===role),f=fn(code,name);return !!(r&&f&&r.start>f.open&&r.end<f.end);};
const withoutDefaultDelay=code=>code.replace(/(\/\* USER CODE BEGIN 3 \*\/)\s*HAL_Delay\(500\);([ \t]*\n[ \t]*)(\/\* USER CODE END 3 \*\/)/,'$1$2$3');
const roundTrip=p=>validateProject(JSON.parse(JSON.stringify(p)));
function blinkStates(project,id){const s=new SimulationSession(project,{print:()=>{}}),seen=new Set();for(let t=0;t<=1200;t+=50){s.tick(t);seen.add(s.result.parts[id]?.on);}return [...seen].sort();}

describe('Docs apply: CubeMX init functions',()=>{
  test('GPIO setup goes into MX_GPIO_Init, user code into USER CODE sections',()=>{
    const {project}=applyDeviceExample(projectWith(['led']),part('sel'));const code=project.code,main=fn(code,'main');
    assert.ok(inside(code,'led:sel','MX_GPIO_Init','MX_GPIO_Init'));assert.match(body(code,'led:sel','MX_GPIO_Init'),/HAL_GPIO_Init\(GPIOA, &GPIO_InitStruct\)/);
    assert.doesNotMatch(maskC(main.body),/HAL_GPIO_Init|__HAL_RCC_GPIO/,'no GPIO setup inline in main');
    assert.ok(inside(code,'led:sel','LOOP','main'));assert.ok(code.indexOf('STM-DOCS BEGIN led:sel LOOP')>code.indexOf('/* USER CODE BEGIN 3 */'));
    assert.equal((code.match(/GPIO_InitTypeDef GPIO_InitStruct/g)||[]).length,1,'reuses the function GPIO_InitStruct');
  });
  test('missing MX_GPIO_Init is created in Cube style and called after SystemClock_Config',()=>{
    const p=projectWith(['led']);p.code='#include "main.h"\n#include <stdio.h>\nvoid SystemClock_Config(void);\n\nint main(void) {\n  HAL_Init();\n  SystemClock_Config();\n  while (1) {\n  }\n}\n\nvoid SystemClock_Config(void) {\n}\n';
    const code=applyDeviceExample(p,part('sel')).project.code,main=fn(code,'main').body;
    assert.match(code,/static void MX_GPIO_Init\(void\);/);assert.ok(fn(code,'MX_GPIO_Init'));assert.ok(inside(code,'led:sel','MX_GPIO_Init','MX_GPIO_Init'));
    assert.ok(main.indexOf('MX_GPIO_Init();')>main.indexOf('SystemClock_Config();'));assert.doesNotThrow(()=>compileHal(code));
  });
  test('peripheral init goes into MX_<PERIPH>_Init: created when absent, extended when present',()=>{
    const created=apply(projectWith(['sht31']),'sel').code;
    assert.ok(regions(created,'sht31:sel').some(r=>r.role==='MX_I2C1_Init'));assert.match(body(created,'sht31:sel','MX_I2C1_Init'),/static void MX_I2C1_Init\(void\) \{[\s\S]*HAL_I2C_Init\(&hi2c1\)/);
    assert.match(body(created,'sht31:sel','MX_I2C1_Init_PROTO'),/static void MX_I2C1_Init\(void\);/);assert.match(body(created,'sht31:sel','HANDLE_hi2c1'),/I2C_HandleTypeDef hi2c1;/);
    const main=fn(created,'main').body;assert.ok(main.indexOf('MX_I2C1_Init();')>main.indexOf('MX_GPIO_Init();')&&main.indexOf('MX_I2C1_Init();')<main.indexOf('USER CODE BEGIN 2'));
    const p=projectWith(['sht31']);p.code=p.code.replace('static void MX_GPIO_Init(void);','static void MX_GPIO_Init(void);\nstatic void MX_I2C1_Init(void);\nI2C_HandleTypeDef hi2c1;').replace('  MX_GPIO_Init();','  MX_GPIO_Init();\n  MX_I2C1_Init();').replace('int __io_putchar','static void MX_I2C1_Init(void) {\n  /* 사용자 초기화 */\n}\n\nint __io_putchar');
    const extended=apply(p,'sel').code;
    assert.ok(inside(extended,'sht31:sel','MX_I2C1_Init','MX_I2C1_Init'),'body region inside the existing function');assert.match(extended,/사용자 초기화/);
    assert.equal((extended.match(/MX_I2C1_Init\(\);/g)||[]).length,1);assert.equal((extended.match(/I2C_HandleTypeDef hi2c1;/g)||[]).length,1);
    assert.doesNotThrow(()=>compileHal(extended));
  });
});

describe('Docs apply: BareMetal mode',()=>{
  test('register example replaces HAL code for single and "all" apply',()=>{
    for(const api of ['all','gpio-write']){
      const {project,binding}=applyDeviceExample(projectWith(['led']),part('sel'),{mode:'baremetal',api});const code=project.code;
      assert.equal(binding.mode,'baremetal');assert.equal(project.ide.native.target,'arm');
      assert.match(body(code,'led:sel','LOOP'),/GPIOA->BSRR = \(?1UL << 5/);assert.doesNotMatch(code,/HAL_GPIO_TogglePin|HAL_GPIO_Init/);
      assert.match(body(code,'led:sel','MX_GPIO_Init'),/RCC->AHB1ENR\s*\|=\s*RCC_AHB1ENR_GPIOAEN[\s\S]*GPIOA->MODER/);assert.ok(inside(code,'led:sel','MX_GPIO_Init','MX_GPIO_Init'));
    }
    const pot=apply(projectWith(['potentiometer']),'sel',{mode:'baremetal',api:'all'}).code;
    assert.match(body(pot,'potentiometer:sel','MX_ADC1_Init'),/RCC->APB2ENR\s*\|=\s*RCC_APB2ENR_ADC1EN/);assert.match(body(pot,'potentiometer:sel','LOOP'),/ADC1->SQR3/);
  });
  test('removing the last BareMetal example returns to the circuit simulator target',()=>{
    const bare=apply(projectWith(['led']),'sel',{mode:'baremetal',api:'all'}),r=removeDeviceExample(bare,part('sel'));
    assert.equal(r.project.ide.native.target,'simulator');assert.doesNotMatch(r.project.code,/STM-DOCS|BSRR/);
  });
});

describe('Docs remove',()=>{
  test('remove after editing inside the region restores the original code and pin setup',()=>{
    const original=projectWith(['led']),applied=apply(original,'sel');
    applied.code=applied.code.replace(/(STM-DOCS BEGIN led:sel LOOP[^\n]*\n)/,'$1    int myCounter = 0; /* 내 수정 */\n').replace('HAL_Delay(500);\n    /* STM-DOCS END led:sel LOOP','HAL_Delay(100);\n    /* STM-DOCS END led:sel LOOP');
    assert.match(applied.code,/내 수정/);
    const {project,report}=removeDeviceExample(applied,part('sel'));
    assert.equal(project.code,withoutDefaultDelay(original.code));assert.deepEqual(report.missing,[]);assert.ok(report.removed>=2);
    assert.deepEqual(project.mcu.pins,{});assert.deepEqual(project.deviceDocs.bindings,[]);
    assert.ok(project.components.some(c=>c.type==='ref_resistor_axial_2'),'code-only removal keeps the circuit');assert.doesNotThrow(()=>compileHal(project.code));
  });
  test('remove with circuit deletes the parts and wires Docs added, keeps the selected part',()=>{
    const original=projectWith(['led'],['button','other']);original.surfaces.board.hidden=false;original.wires=[{id:'userWire',from:'part:other:a',to:boardPin('GND'),color:'#123456'}];
    const applied=apply(original,'sel'),codeOnly=removeDeviceExample(applied,part('sel'),{circuit:false}).project,full=removeDeviceExample(applied,part('sel'),{circuit:true});
    assert.ok(applied.components.length>codeOnly.components.length-1&&codeOnly.wires.length===applied.wires.length);
    const p=full.project;assert.ok(p.components.some(c=>c.id==='sel')&&p.components.some(c=>c.id==='other'));
    assert.ok(!p.components.some(c=>c.type==='resistor'),'series resistor removed');assert.ok(p.wires.some(w=>w.id==='userWire'),'user wire kept');
    assert.ok(!p.wires.some(w=>/^docs/.test(w.id)));assert.ok(full.report.removedParts>=1&&full.report.removedWires>=1);
  });
  test('several devices applied, one removed: the others stay byte-identical and keep running',()=>{
    let p=projectWith(['led','led1'],['sht31','sht1'],['potentiometer','pot1']);for(const id of ['led1','sht1','pot1'])p=apply(p,id);
    const keep=['led:led1','potentiometer:pot1'].flatMap(tag=>regions(p.code,tag).map(r=>p.code.slice(r.start,r.end)));
    const {project,report}=removeDeviceExample(p,part('sht1'),{circuit:true});
    for(const text of keep)assert.ok(project.code.includes(text));
    assert.doesNotMatch(project.code,/hi2c1|MX_I2C1_Init|SHT31/);assert.equal(project.mcu.peripherals.I2C1,undefined);assert.equal(project.mcu.pins.PB8,undefined);
    assert.deepEqual(report.missing,[]);assert.ok(project.code.includes(USER_LINE));
    const out=[],s=new SimulationSession(project,{print:v=>out.push(v)});for(let t=0;t<=1200;t+=50)s.tick(t);
    assert.ok(out.some(l=>/^PA5=/.test(l))&&out.some(l=>/^ADC=/.test(l)));assert.ok(!out.some(l=>/SHT31/.test(l)));
    const uf=wiringTopology(project);assert.equal(uf.find(boardPin('PA0')),uf.find('part:pot1:p2'),'other device wiring intact');
  });
  test('a shared peripheral moves to the remaining device instead of disappearing',()=>{
    let p=projectWith(['sht31','a'],['sht31','b',{address:0x45}]);p=apply(p,'a');p=apply(p,'b');
    assert.equal(regions(p.code).filter(r=>r.role==='MX_I2C1_Init').length,1);
    const {project,report}=removeDeviceExample(p,part('a'));
    assert.ok(report.retagged>=3);assert.ok(regions(project.code,'sht31:b').some(r=>r.role==='MX_I2C1_Init'));assert.ok(project.mcu.peripherals.I2C1?.enabled);
    const out=[],s=new SimulationSession(project,{print:v=>out.push(v)});for(let t=0;t<=600;t+=50)s.tick(t);assert.ok(out.some(l=>/SHT31=/.test(l)),out.join('\n'));
    const last=removeDeviceExample(project,part('b')).project;assert.deepEqual(last.mcu.peripherals,{});assert.deepEqual(last.mcu.pins,{});assert.doesNotMatch(last.code,/STM-DOCS|hi2c1/);
  });
  test('a deleted marker is reported and the code around it is left untouched',()=>{
    const p=apply(projectWith(['led']),'sel');p.code=p.code.replace(/[ \t]*\/\* STM-DOCS END led:sel LOOP \*\/\n/,'');
    const {project,report}=removeDeviceExample(p,part('sel'));
    assert.match(report.missing.join(),/LOOP/);assert.match(project.code,/STM-DOCS BEGIN led:sel LOOP/);assert.match(project.code,/HAL_GPIO_TogglePin/);
    assert.doesNotMatch(project.code,/STM-DOCS BEGIN led:sel MX_GPIO_Init/,'intact regions are still removed');
    assert.throws(()=>applyDeviceExample(p,part('sel')),/손상/,'re-apply refuses instead of duplicating');
  });
  test('removing a device without an applied example fails clearly',()=>{
    assert.throws(()=>removeDeviceExample(projectWith(['led']),part('sel')),/적용된 Docs 예제가 없습니다/);
  });
  test('applyDeviceExample dispatches action "remove" (the app.js apply callback path)',()=>{
    const p=apply(projectWith(['led']),'sel'),r=applyDeviceExample(p,part('sel'),{action:'remove',circuit:true});
    assert.equal(r.action,'remove');assert.equal(r.file,'main.c');assert.equal(r.binding.key,'sel');assert.deepEqual(r.project.deviceDocs.bindings,[]);
  });
});

describe('Docs re-apply',()=>{
  test('re-applying is idempotent and replaces edited regions instead of duplicating',()=>{
    const first=apply(projectWith(['led']),'sel');assert.equal(JSON.stringify(apply(roundTrip(first),'sel')),JSON.stringify(first));
    const edited=structuredClone(first);edited.code=edited.code.replace('HAL_Delay(500);\n    /* STM-DOCS END','HAL_Delay(5);\n    /* STM-DOCS END');
    assert.equal(apply(edited,'sel').code,first.code);
    const switched=apply(first,'sel',{mode:'baremetal',api:'all'});assert.equal(regions(switched.code,'led:sel').filter(r=>r.role==='LOOP').length,1);assert.doesNotMatch(switched.code,/TogglePin/);
    assert.equal(apply(switched,'sel').code,first.code,'switching back to HAL restores the HAL regions');
  });
  test('apply → remove → apply gives the same code as a single apply',()=>{
    const once=apply(projectWith(['led'],['sht31','s']),'sel');const twice=apply(removeDeviceExample(once,part('sel')).project,'sel');
    assert.equal(twice.code,once.code);
  });
});

describe('Docs legacy projects (0.23–0.26.0 shared regions)',()=>{
  const legacy=()=>validateProject(JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/docs-legacy-0.26.0.json'),'utf8')));
  test('unedited legacy regions are migrated to per-device markers on removal',()=>{
    const {project,report}=removeDeviceExample(legacy(),part('led1'));
    assert.equal(report.legacy,true);assert.doesNotMatch(project.code,/STM DEVICE DOCS|TogglePin/);assert.ok(regions(project.code,'sht31:sht1').some(r=>r.role==='LOOP'));
    assert.ok(project.code.includes(USER_LINE));assert.equal(project.mcu.pins.PA5,undefined);assert.doesNotThrow(()=>compileHal(project.code));
  });
  test('edited legacy regions fall back to content matching',()=>{
    const p=legacy();p.code=p.code.replace('/* STM DEVICE DOCS STEP BEGIN */','/* STM DEVICE DOCS STEP BEGIN */\n    // 내 메모');
    const {project,report}=removeDeviceExample(p,part('led1'));
    assert.equal(report.legacy,true);assert.deepEqual(report.missing,[]);assert.doesNotMatch(project.code,/TogglePin|GPIO_PIN_5/);
    assert.match(project.code,/내 메모/);assert.match(project.code,/SHT31=/);assert.doesNotThrow(()=>compileHal(project.code));
    const again=applyDeviceExample(p,part('led1')).project;assert.equal((again.code.match(/TogglePin/g)||[]).length,1,'re-apply on edited legacy code does not duplicate');
  });
});

// Real ST HAL/CMSIS build and Cortex-M4 emulator run (skipped without the toolchain).
const require=createRequire(import.meta.url);
const gcc=process.env.ARM_GCC||'/home/claude/tools/xpack-arm-none-eabi-gcc-14.2.1-1.1/bin/arm-none-eabi-gcc'+(process.platform==='win32'?'.exe':'');
const cube=process.env.STM32CUBE_F4_ROOT||'/home/claude/tools/cubef4';
const toolchain=fs.existsSync(gcc)&&fs.existsSync(path.join(cube,'Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal.h'));
describe('Docs output builds with ARM GCC and runs on the emulator',{skip:!toolchain&&'ARM GCC / STM32CubeF4 not installed'},()=>{
  async function runArm(project,ms=1200){
    const {prepareBuild,build}=require(path.join(root,'desktop/native-build.cjs')),{FirmwareSession}=await import('../../src/firmware-session.js');
    const work=fs.mkdtempSync(path.join(os.tmpdir(),'docs-arm-'));
    try{
      const plan=await prepareBuild({project,tools:{armGcc:gcc,cube,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''},root:work,target:'arm',configuration:'Debug'});
      const r=await build(plan,{onOutput:()=>{}}),elf=new Uint8Array(fs.readFileSync(r.elf)),print=[],seen={};
      const s=new FirmwareSession(project,{elf,print:t=>print.push(t),uart:()=>{},trace:()=>{}});
      for(let t=20;t<=ms;t+=20){const res=s.tick(t);for(const [id,v]of Object.entries(res?.parts||{}))if('on' in v)(seen[id]??=new Set()).add(v.on);}
      return {print,seen,top:s.runtime.inspect().frames[0]?.name||''};
    }finally{fs.rmSync(work,{recursive:true,force:true});}
  }
  test('BareMetal LED blinks from register code',{timeout:240000},async()=>{
    const r=await runArm(apply(projectWith(['led']),'sel',{mode:'baremetal',api:'all'}));
    assert.deepEqual([...r.seen.sel].sort(),[false,true]);assert.doesNotMatch(r.top,/Error_Handler|HardFault|Default_Handler/);
  });
  test('BareMetal potentiometer reads ADC1 through registers',{timeout:240000},async()=>{
    const r=await runArm(apply(projectWith(['potentiometer']),'sel',{mode:'baremetal',api:'all'}),600);
    assert.ok(r.print.some(l=>/^ADC=\d+/.test(l)),r.print.join('\n'));
  });
  test('HAL multi-device result (with one removed) builds and runs',{timeout:240000},async()=>{
    let p=projectWith(['led','led1'],['sht31','sht1'],['potentiometer','pot1']);for(const id of ['led1','sht1','pot1'])p=apply(p,id);
    p=removeDeviceExample(p,part('pot1')).project;p.ide={...(p.ide||{breakpoints:[],watches:[]}),native:{target:'arm',configuration:'Debug'}};
    const r=await runArm(p);assert.ok(r.print.some(l=>/SHT31=/.test(l))&&r.print.some(l=>/^PA5=/.test(l)),r.print.join('\n'));assert.deepEqual([...r.seen.led1].sort(),[false,true]);
  });
});

describe('Docs apply in the circuit interpreter',()=>{
  test('HAL LED applied with markers still blinks; re-applied after removal too',()=>{
    const p=apply(projectWith(['led']),'sel');assert.deepEqual(blinkStates(p,'sel'),[false,true]);
    assert.deepEqual(blinkStates(apply(removeDeviceExample(p,part('sel')).project,'sel'),'sel'),[false,true]);
  });
});
