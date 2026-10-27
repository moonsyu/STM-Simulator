import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {applyDeviceExample} from '../../src/device-assistance.js';
import {managedRegion,stripDeviceRegions,managedChecksum,statements,selectOperation,insertDeviceCode,indentC,removeLegacyDeviceHooks,docsRegions,regionBody} from '../../src/device-code-insertion.js';
import {cFunctions} from '../../src/c-source-edit.js';
import {DEVICE_RECIPES,API_HELP,recipeFor,primaryPart,expectedNets,deviceDocs,wiringTopology} from '../../src/device-docs-data.js';
import {CATALOG_DEFS,CATALOG_BY_TYPE,CATALOG_TWO_PIN,catalogMap,catalogType} from '../../src/catalog-defs.js';
import {DEVICE_CATALOG} from '../../src/device-catalog-data.js';
import {catalogShape} from '../../src/catalog-render.js';
import {catalogBodyBounds} from '../../src/model-geometry.js';
import {ALL_PARTS,MERGED_PARTS,PART_LIBRARY,searchParts} from '../../src/part-library.js';
import {searchHalExamples} from '../../src/hal-example-search.js';
import {pluggedKeys,PART_DEFS,terminalKeys,localTerminals,nominalTerminals} from '../../src/components.js';
import {blankProject,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';
import {boardPin} from '../../src/pins.js';
import {compileHal} from '../../src/hal-source.js';

const USER_LINE='  int keepMe = 7; /* 학생 코드 */';
function projectWith(...parts){
  const p=blankProject();p.code=p.code.replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n'+USER_LINE);
  for(const [type,id='sel',extra={}]of parts)p.components.push({id,type,name:type.toUpperCase(),x:800,y:350,rotation:0,span:70,...PART_DEFS[type]?.defaults,...(type==='resistor'?{value:10000}:{}),...(type==='led'?{color:'red'}:{}),...extra});
  return p;
}
const part=id=>({type:'part',id});
const roundTrip=p=>validateProject(JSON.parse(JSON.stringify(p)));

describe('device Docs: applying examples to main.c',()=>{
  test('LED Docs inserts managed regions into main.c only, wires the circuit and configures PA5',()=>{
    const original=projectWith(['led']),{project,report}=applyDeviceExample(original,part('sel'));
    assert.deepEqual(project.firmware.files,[],'no extra source files');
    assert.ok(project.code.includes(USER_LINE),'user code preserved');
    // 0.26.1: one marker pair per inserted region, tagged with <type>:<part id>.
    const regions=docsRegions(project.code).regions,role=r=>regions.find(x=>x.tag==='led:sel'&&x.role===r);
    assert.ok(role('LOOP')&&role('MX_GPIO_Init'));assert.match(regionBody(project.code,role('LOOP')),/HAL_GPIO_TogglePin\(GPIOA, GPIO_PIN_5\)/);
    const gpio=cFunctions(project.code).find(f=>f.name==='MX_GPIO_Init');assert.ok(role('MX_GPIO_Init').start>gpio.open&&role('MX_GPIO_Init').end<gpio.end,'GPIO setup lives in MX_GPIO_Init');
    assert.equal(project.mcu.pins.PA5.function,'GPIO_Output');
    assert.equal(project.surfaces.board.hidden,false,'the board is shown so it can be wired');
    assert.ok(report.addedParts>=1&&report.addedWires>=1);
    const uf=wiringTopology(project),resistor=project.components.find(c=>c.type==='ref_resistor_axial_2');
    assert.ok(resistor,'series resistor (the real part) added');assert.ok(['p1','p2'].some(k=>uf.find(`part:${resistor.id}:${k}`)===uf.find(boardPin('PA5'))),'resistor sits on the PA5 net');
    assert.deepEqual(project.deviceDocs.bindings.map(b=>[b.key,b.type,b.slot]),[['sel','led',0]]);assert.equal(project.deviceDocs.inlineChecksum,undefined);
    assert.equal(original.components.length,1,'input project untouched');
    assert.doesNotThrow(()=>compileHal(project.code));
  });
  test('applied LED example actually blinks',()=>{
    const {project}=applyDeviceExample(projectWith(['led']),part('sel'));const out=[];const s=new SimulationSession(project,{print:v=>out.push(v)});
    const seen=new Set();for(let t=0;t<=1200;t+=50){s.tick(t);seen.add(s.result.parts.sel.on);}
    assert.deepEqual([...seen].sort(),[false,true]);assert.ok(out.includes('PA5=1')&&out.includes('PA5=0'));
  });
  test('re-applying is idempotent, also after a save/load round-trip',()=>{
    const first=applyDeviceExample(projectWith(['led']),part('sel'));
    const again=applyDeviceExample(roundTrip(first.project),part('sel'));
    assert.equal(JSON.stringify(again.project),JSON.stringify(first.project));assert.equal(again.report.addedParts,0);assert.equal(again.report.addedWires,0);
  });
  test('wrong leads are removed and missing ones added; unrelated wiring is kept',()=>{
    const p=projectWith(['potentiometer'],['led','other']);
    p.surfaces.board.hidden=false;p.wires=[{id:'wrong',from:'part:sel:p1',to:boardPin('5V'),color:'#ff0000'}];
    const {project,report}=applyDeviceExample(p,part('sel'));
    assert.ok(report.removedWires>0);assert.ok(!project.wires.some(w=>w.id==='wrong'));
    const uf=wiringTopology(project);assert.equal(uf.find('part:sel:p1'),uf.find(boardPin('GND')));assert.equal(uf.find('part:sel:p3'),uf.find(boardPin('3V3')));
    assert.notEqual(uf.find('part:sel:p2'),uf.find(boardPin('GND')));
    assert.ok(project.components.some(c=>c.id==='other'),'unrelated part kept');
  });
  test('a valid alternative ADC pin chosen by the user is kept',()=>{
    const p=projectWith(['potentiometer']);p.surfaces.board.hidden=false;p.wires=[{id:'signal',from:boardPin('PC0'),to:'part:sel:p2',color:'#abcdef'}];
    const {project}=applyDeviceExample(p,part('sel'));assert.ok(project.wires.some(w=>w.id==='signal'));assert.equal(project.deviceDocs.bindings[0].pins.PA0,'PC0');
    const out=[];const s=new SimulationSession(project,{print:v=>out.push(v)});for(let t=0;t<=600;t+=50)s.tick(t);assert.match(out.join('\n'),/1\.65\d V/);
  });
  // Changed in 0.26.1: edits inside a device's own region no longer block re-apply; re-applying
  // replaces only that device's regions (Ctrl+Z restores), other devices' edited regions stay.
  test('re-applying replaces only the device own (edited) regions',()=>{
    let ready=applyDeviceExample(projectWith(['led','a'],['button','b']),part('a')).project;ready=applyDeviceExample(ready,part('b')).project;
    ready.code=ready.code.replace(/(STM-DOCS BEGIN led:a LOOP[^\n]*\n)/,'$1  // personal change A\n').replace(/(STM-DOCS BEGIN button:b LOOP[^\n]*\n)/,'$1  // personal change B\n');
    const again=applyDeviceExample(ready,part('a')).project;
    assert.doesNotMatch(again.code,/personal change A/);assert.match(again.code,/personal change B/);
    assert.equal((again.code.match(/STM-DOCS BEGIN led:a LOOP/g)||[]).length,1);
  });
  test('two devices of one kind get distinct pins and their own LOOP regions',()=>{
    let p=projectWith(['rgb','one'],['rgb','two']);p=applyDeviceExample(p,part('one')).project;p=applyDeviceExample(p,part('two')).project;
    const [a,b]=p.deviceDocs.bindings;assert.equal(Object.values(a.pins).some(pin=>Object.values(b.pins).includes(pin)),false);
    assert.equal((p.code.match(/STM-DOCS BEGIN rgb:one LOOP/g)||[]).length,1);assert.equal((p.code.match(/STM-DOCS BEGIN rgb:two LOOP/g)||[]).length,1);assert.equal((p.code.match(/int main\(void\)/g)||[]).length,1);
    assert.ok(p.code.includes(USER_LINE));assert.deepEqual(p.firmware.files,[]);
    const s=new SimulationSession(p);for(let t=0;t<=300;t+=50)s.tick(t);assert.equal(s.result.fault,false);
  });
  test('duplicate I2C addresses on one bus fail atomically',()=>{
    let p=projectWith(['sht31','a'],['sht31','b']);p=applyDeviceExample(p,part('a')).project;const before=JSON.stringify(p);
    assert.throws(()=>applyDeviceExample(p,part('b')),/같은 I2C 버스/);assert.equal(JSON.stringify(p),before);
  });
  test('breadboard Docs mounts the example on the selected extra breadboard',()=>{
    const p=applyDeviceExample(projectWith(['breadboard']),part('sel')).project;const mounted=p.components.filter(c=>c.type!=='breadboard');
    assert.ok(mounted.length>=2);for(const c of mounted){assert.match(c.attachA,/^breadboard:sel:/);assert.match(c.attachB,/^breadboard:sel:/);}
  });
  test('requires a HAL project and a selected device',()=>{
    const sketch=projectWith(['led']);sketch.firmware.mode='sketch';assert.throws(()=>applyDeviceExample(sketch,part('sel')),/HAL 실행 환경/);
    assert.throws(()=>applyDeviceExample(projectWith(),part('missing')),/먼저 선택/);
    assert.throws(()=>applyDeviceExample(projectWith(['led']),part('sel'),{mode:'asm'}),/예제 모드/);
  });
  test('every Docs recipe applies into main.c, keeps user code, is idempotent and runs',()=>{
    const failures=[];
    for(const type of Object.keys(DEVICE_RECIPES)){
      try{
        const p=projectWith(...(type==='board'?[]:[[type]])),target=type==='board'?{type:'surface',id:'board'}:part('sel');
        const {project}=applyDeviceExample(p,target);validateProject(project);
        if(project.firmware.files.length)throw new Error('created files '+project.firmware.files.map(f=>f.name).join(','));
        if(!project.code.includes(USER_LINE))throw new Error('user code lost');
        if(JSON.stringify(applyDeviceExample(roundTrip(project),target).project)!==JSON.stringify(project))throw new Error('second apply changed the project');
        const s=new SimulationSession(project);for(let t=0;t<=30;t+=10)s.tick(t);if(s.result.fault)throw new Error('circuit fault '+s.result.warnings.join(';'));
      }catch(e){failures.push(`${type}: ${e.message.slice(0,160)}`);}
    }
    assert.deepEqual(failures,[],failures.join('\n'));
  });
});

describe('device Docs content',()=>{
  test('every recipe documents overview, wiring and functions',()=>{
    const missing=[];
    for(const type of Object.keys(DEVICE_RECIPES)){const d=deviceDocs(type);if(!d.overview||!d.guide||!d.wiring?.length||!d.functions?.length||!d.source)missing.push(type);}
    assert.deepEqual(missing,[]);
  });
  test('recipes are main.c-only HAL examples with the primary part present',()=>{
    const r=recipeFor('led');assert.deepEqual(r.firmware.files,[]);assert.ok(primaryPart(r,'led'));assert.equal(primaryPart(r,'servo'),null);
    assert.throws(()=>recipeFor('flux_capacitor'),/찾을 수 없습니다/);
  });
  test('expected nets connect the LED example parts to board signals',()=>{
    const nets=expectedNets(recipeFor('led'));assert.ok(nets.length>=2);assert.ok(nets.every(n=>n.some(id=>id.startsWith('part:'))&&n.length>1));
    assert.ok(nets.some(n=>n.includes(boardPin('PA5'))));
  });
  test('API help strings are Korean descriptions',()=>{
    for(const name of ['HAL_GPIO_WritePin','HAL_ADC_GetValue','HAL_Delay'])assert.match(API_HELP[name],/[가-힣]/);
  });
});

describe('main.c managed-region helpers',()=>{
  const main='#include "main.h"\nint main(void) {\n  HAL_Init();\n  /* USER CODE BEGIN 2 */\n  /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    HAL_Delay(500);\n    /* USER CODE END 3 */\n  }\n}\n';
  const blocks={headers:'#include <math.h>',declarations:'int n;',init:'n = 1;',step:'n++;'};
  test('insertDeviceCode places regions, removes the default delay and can be stripped again',()=>{
    const out=insertDeviceCode(main,blocks);
    assert.match(managedRegion(out,'HEADERS').text,/#include <math\.h>/);assert.match(managedRegion(out,'STEP').text,/n\+\+;/);
    assert.doesNotMatch(out,/HAL_Delay\(500\)/);assert.ok(out.indexOf('STM DEVICE DOCS INIT')>out.indexOf('USER CODE BEGIN 2'));
    const stripped=stripDeviceRegions(out);assert.doesNotMatch(stripped,/STM DEVICE DOCS/);
    assert.equal(insertDeviceCode(out,blocks),out,'re-inserting the same blocks is stable');
  });
  test('insertDeviceCode requires main with an infinite loop',()=>{
    assert.throws(()=>insertDeviceCode('int f(void){return 0;}',blocks),/main\(void\)/);
    assert.throws(()=>insertDeviceCode('int main(void){ return 0; }',blocks),/while \(1\)/);
  });
  test('initializers are appended into existing MX_*_Init functions',()=>{
    const src=main.replace('int main','static void MX_GPIO_Init(void) {\n}\nint main');
    const out=insertDeviceCode(src,{...blocks,initializers:[{name:'MX_GPIO_Init',body:'  configure();'}]});
    assert.ok(managedRegion(out,'MX_GPIO_Init'));assert.match(managedRegion(out,'INIT').text,/MX_GPIO_Init\(\);/);
  });
  test('managedRegion reports broken markers; checksum changes with region content',()=>{
    assert.equal(managedRegion(main,'STEP'),null);
    assert.throws(()=>managedRegion('/* STM DEVICE DOCS STEP END */ x /* STM DEVICE DOCS STEP BEGIN */','STEP'),/복구/);
    const a=insertDeviceCode(main,blocks),b=insertDeviceCode(main,{...blocks,step:'n--;'});
    assert.notEqual(managedChecksum(a),managedChecksum(b));assert.equal(managedChecksum(a),managedChecksum(a.replace('HAL_Init();','HAL_Init(); /* outside */')),'edits outside regions do not matter');
  });
  test('statements splits top-level C statements, keeping if/else and strings intact',()=>{
    assert.deepEqual(statements('a(); if (x) { b(); } else { c(); } d("; }");'),['a();',' if (x) { b(); } else { c(); }',' d("; }");']);
  });
  test('selectOperation keeps preparation up to the chosen API call',()=>{
    const src='prep(); HAL_SPI_Transmit(&h, b, 1, 10); HAL_Delay(5); HAL_SPI_Receive(&h, b, 1, 10);';
    assert.equal(selectOperation(src,'all'),src);assert.equal(selectOperation(src,'HAL_SPI_Transmit'),'prep(); HAL_SPI_Transmit(&h, b, 1, 10);');
    assert.equal(selectOperation(src,'HAL_I2C_Master_Transmit'),'');
    assert.equal(selectOperation('a(); helper(); b();','HAL_X',[{name:'helper',body:'HAL_X(1);'}]),'a(); helper();','found through a helper');
  });
  test('indentC indents by brace depth',()=>{
    assert.equal(indentC('if (x) {\ny();\n}',1),'    if (x) {\n        y();\n    }');
  });
  test('legacy STM_Devices callback hooks are removed but user callback bodies stay',()=>{
    const src='void A(void){STM_Devices_ACallback(1);}\nvoid B(void){STM_Devices_BCallback(); user();}\n';
    const out=removeLegacyDeviceHooks(src);assert.doesNotMatch(out,/STM_Devices_/);assert.doesNotMatch(out,/void A/);assert.match(out,/void B\(void\)\{ user\(\);\}/);
  });
});

describe('device catalog',()=>{
  const types=Object.keys(CATALOG_DEFS);
  test('every catalog entry (except board/breadboard) becomes a part type',()=>{
    const expected=DEVICE_CATALOG.filter(v=>!['board','breadboard'].includes(v.family)).map(v=>catalogType(v.id)).sort();
    assert.deepEqual(Object.keys(CATALOG_BY_TYPE).sort(),expected);
    for(const type of types)assert.ok(CATALOG_BY_TYPE[type],type);
    assert.equal(catalogType('led-tht-2'),'ref_led_tht_2');
  });
  test('every catalog part has a name, body geometry, labelled pins and distinct terminals',()=>{
    const problems=[];
    for(const type of types){
      const def=CATALOG_DEFS[type],ref=CATALOG_BY_TYPE[type],p={id:'x',type,name:'X',x:0,y:0,rotation:0,...def.defaults};
      const keys=terminalKeys(p),terms=localTerminals(p);
      if(!def.name||!def.prefix)problems.push(type+': name/prefix');
      if(!(def.body?.width>0&&def.body?.height>0))problems.push(type+': body');
      if(!keys.length||terms.length!==keys.length)problems.push(`${type}: ${keys.length} keys vs ${terms.length} terminals`);
      if(terms.some(t=>!Number.isFinite(t.x)||!Number.isFinite(t.y)))problems.push(type+': non-finite terminal');
      // Pins plugged into holes never share a point; a HAT's power/I²C pins are wired at the header contacts they are tied to.
      const plugged=terms.filter(t=>pluggedKeys(p).includes(t.key));if(new Set(plugged.map(t=>`${t.x},${t.y}`)).size!==plugged.length)problems.push(type+': overlapping terminals');
      if(ref.pins.length!==ref.pin_count)problems.push(type+': pin_count mismatch');
      const b=catalogBodyBounds(type);if(![b.left,b.top,b.right,b.bottom].every(Number.isFinite)||b.right<=b.left||b.bottom<=b.top)problems.push(type+': bounds');
    }
    assert.deepEqual(problems,[]);
  });
  test('every catalog part renders an SVG model tagged with its reference id',()=>{
    const problems=[];
    for(const type of types){const def=CATALOG_DEFS[type],p={id:'x',type,name:'X',x:0,y:0,rotation:0,...def.defaults};
      try{const svg=String(catalogShape(p));if(!svg.includes(`data-reference="${CATALOG_BY_TYPE[type].id}"`))problems.push(type+': missing data-reference');}catch(e){problems.push(type+': '+e.message);}}
    assert.deepEqual(problems,[]);
  });
  test('every catalog part with its defaults passes project validation',()=>{
    const p=blankProject();p.components=types.slice(0,100).map((type,i)=>({id:'c'+i,type,name:'C'+i,x:i*10,y:0,rotation:0,...CATALOG_DEFS[type].defaults,...(CATALOG_TWO_PIN.includes(type)?{span:70}:{})}));
    assert.equal(validateProject(p).components.length,p.components.length);
  });
  test('contact maps translate model terminals to physical pins',()=>{
    assert.deepEqual(catalogMap('ref_button_2'),{a:'p1',b:'p2',c:'p1',d:'p2'});
    assert.deepEqual(catalogMap('ref_pir_3'),{p1:'p1',p2:'p3',p3:'p2'});
    assert.equal(catalogMap('ref_unknown'),null);
  });
  test('two-pin catalog parts are placed like resistors',()=>{
    const type=CATALOG_TWO_PIN[0],p={id:'x',type,name:'X',x:100,y:50,rotation:0,span:42,...CATALOG_DEFS[type].defaults};
    const [a,b]=nominalTerminals(p);assert.deepEqual([a.key,b.key],['p1','p2']);assert.equal(b.x-a.x,42);
  });
});

describe('part and example search',()=>{
  test('PART_LIBRARY includes base parts, devices and catalog parts with unique types',()=>{
    const types=PART_LIBRARY.map(p=>p.type);assert.equal(new Set(types).size,types.length);
    for(const t of ['board','breadboard','ref_resistor_axial_2','ref_led_tht_2','ref_lcd_parallel_16','ref_servo_3','mpu6050'])assert.ok(types.includes(t),t);
    // A basic part with the same pins as its real part is listed once, as the real part; it still opens in saved circuits.
    for(const t of ['resistor','led','lcd','servo','l298n'])assert.ok(!types.includes(t)&&ALL_PARTS.some(p=>p.type===t),t);
    assert.equal(Object.keys(MERGED_PARTS).length,27);
    assert.ok(PART_LIBRARY.every(p=>p.name&&p.searchText));
  });
  test('searchParts matches English, Korean aliases and ignores case/spaces/dashes',()=>{
    const has=(q,type)=>assert.ok(searchParts(q).some(p=>p.type===type),`${q} -> ${type}`);
    has('LED','ref_led_tht_2');has('빵판','breadboard');has('bread board','breadboard');has('가변 저항','ref_pot_bare_3');has('SERVO','ref_servo_3');has('dual-h-bridge','ref_l298n_module_13');has('ultra sonic','ref_hcsr04_4');
    assert.deepEqual(searchParts('zzzz-no-such-part'),[]);assert.equal(searchParts('').length,PART_LIBRARY.length);
  });
  test('searchHalExamples finds examples by id, title, guide and code; all words must match',()=>{
    const ids=q=>searchHalExamples(q).map(r=>r.id);
    assert.ok(ids('uart').includes('uart'));assert.ok(ids('EXTI').includes('exti'));assert.ok(ids('HAL_ADC_GetValue').includes('adc'));
    assert.ok(ids('가변저항').includes('potentiometer'));assert.ok(!ids('uart 가변저항').includes('uart'));
    assert.equal(searchHalExamples('').length,searchHalExamples('   ').length);assert.ok(searchHalExamples('').length>=100);
    assert.deepEqual(ids('qqqq-no-such-example'),[]);
  });
});
