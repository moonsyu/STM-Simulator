import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,exampleProject,validateProject,projectForBoard,hasBoardChanges} from '../../src/project.js';
import {resetMainCode} from '../../src/code-reset.js';
import {resetBoardConfiguration} from '../../src/board-reset.js';
import {sourceFiles,changeSourceFile} from '../../src/source-files.js';
import {importFirmware} from '../../src/firmware-import.js';
import {ROUTES,IRQ_NAMES,MODES,irqForPin,pinFunctions,defaultMcu,validateMcu,configProblems,importIoc,generateHal} from '../../src/mcu-config.js';
import {clockPlan} from '../../src/hal-generator.js';
import {TIMER_ROUTES,TIMER_IDS,isTimer,timerAf,timerMax} from '../../src/timer-config.js';
import {SERIAL_ROUTES,SERIAL_IDS,isSerial,serialHandle,serialAf,serialFunction,assignSerialPin,setSerialEnabled} from '../../src/serial-config.js';
import {DEFAULT_TIMER_CLOCK_HZ,EXAMPLE_TIMER_CLOCK_HZ,timerDefaults} from '../../src/mcu-defaults.js';
import {DEFAULT_BOARD_ID} from '../../src/boards.js';
import {compileHal} from '../../src/hal-source.js';
import {boardPin} from '../../src/pins.js';
import {ledCircuit,boardProject,wire} from './helpers/circuit.js';
import {runHal} from './helpers/run.js';

const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0,...extra});
const IOC=['#MicroXplorer Configuration settings','Mcu.Name=STM32F446R(C-E)Tx','Mcu.IP0=NVIC','Mcu.IP1=USART2',
  'PA5.Signal=GPIO_Output','PA5.GPIO_Label=LD2','PA5.PinState=GPIO_PIN_SET',
  'PC13.Signal=GPXTI13','PC13.GPIO_PuPd=GPIO_PULLUP','PC13.GPIO_ModeDefaultEXTI=GPIO_MODE_IT_RISING_FALLING',
  'PA2.Signal=USART2_TX','PA3.Signal=USART2_RX','USART2.BaudRate=9600',
  'NVIC.EXTI15_10_IRQn=true\\:2\\:0','NVIC.USART2_IRQn=false\\:0\\:0'].join('\n');

describe('blank and example projects',()=>{
  test('blankProject is an empty HAL workspace with hidden board and breadboard',()=>{
    const p=blankProject();
    assert.equal(p.format,'stm32-circuit-lab');assert.equal(p.version,2);assert.deepEqual(p.components,[]);assert.deepEqual(p.wires,[]);
    assert.deepEqual(p.surfaces,{board:{hidden:true},breadboard:{hidden:true}});
    assert.deepEqual(p.firmware,{mode:'hal',files:[]});assert.deepEqual(p.mcu.pins,{});assert.match(p.code,/printf\("HAL ready\\n"\);/);
    assert.deepEqual(validateProject(p),p,'blank project round-trips unchanged');
    assert.doesNotThrow(()=>compileHal(p.code));
    assert.notEqual(blankProject().mcu,blankProject().mcu,'fresh objects each call');
  });
  test('blank project prints its greeting when run',()=>{
    const r=runHal(blankProject().code,{ms:10});assert.equal(r.error,null);assert.deepEqual(r.out,['HAL ready']);
  });
  test('exampleProject shows the legacy board and breadboard',()=>{
    const p=exampleProject();assert.equal(p.surfaces,undefined);assert.ok(validateProject(p));
  });
  test('projectForBoard selects a supported board with the board visible',()=>{
    const p=projectForBoard();assert.equal(p.boardId,DEFAULT_BOARD_ID);assert.equal(p.surfaces.board.hidden,false);assert.equal(p.surfaces.breadboard.hidden,true);
    assert.throws(()=>projectForBoard('arduino-uno'),/지원하지 않는 보드/);
  });
  test('hasBoardChanges ignores defaults and detects real edits',()=>{
    assert.equal(hasBoardChanges(blankProject()),false);assert.equal(hasBoardChanges(projectForBoard()),false);
    const p=projectForBoard();p.components.push({id:'r1',name:'R1',type:'resistor',value:100,x:0,y:0,rotation:0});assert.equal(hasBoardChanges(p),true);
    const q=blankProject();q.code+='\n// edit';assert.equal(hasBoardChanges(q),true);
    const s=blankProject();s.simulation={stepMs:1,pwmWaveform:false};assert.equal(hasBoardChanges(s),false,'default simulation settings are not a change');
  });
});

describe('validateProject limits',()=>{
  const base=()=>ledCircuit();
  test('format, version, name and code size',()=>{
    for(const mutate of [p=>{p.format='other';},p=>{p.version=3;},p=>{p.name=5;},p=>{p.name='x'.repeat(121);},p=>{p.code=null;},p=>{p.code='x'.repeat(300001);}]){
      const p=base();mutate(p);assert.throws(()=>validateProject(p));
    }
    assert.throws(()=>validateProject(null),/지원하지 않는 회로 파일 형식/);
    const ok=base();ok.name='x'.repeat(120);assert.doesNotThrow(()=>validateProject(ok));
  });
  test('component and wire counts',()=>{
    const p=boardProject();p.components=Array.from({length:101},(_,i)=>({id:'r'+i,name:'R',type:'resistor',value:1,x:0,y:0,rotation:0}));
    assert.throws(()=>validateProject(p),/부품 100개, 배선 500개/);
    const q=boardProject();q.wires=Array.from({length:501},(_,i)=>wire('w'+i,'bb:a:1','bb:a:2'));assert.throws(()=>validateProject(q),/500개/);
    const r=boardProject();r.components=Array.from({length:100},(_,i)=>({id:'r'+i,name:'R',type:'resistor',value:1,x:0,y:0,rotation:0}));assert.equal(validateProject(r).components.length,100);
  });
  test('component ids, types, names and coordinates',()=>{
    const bad=[
      p=>{p.components[1].id='r1';},p=>{p.components[0].id='bad id';},p=>{p.components[0].id='x'.repeat(65);},
      p=>{p.components[0].type='flux_capacitor';},p=>{p.components[0].name='n'.repeat(81);},
      p=>{p.components[0].x=NaN;},p=>{p.components[0].rotation=360;},p=>{p.components[0].rotation=-1;},
      p=>{p.components[0].value=0.5;},p=>{p.components[0].value=1e8;},p=>{p.components[1].color='purple';},
      p=>{p.components[0].span=2;},p=>{p.components[0].attachB=p.components[0].attachA;},p=>{p.components[0].attachA='bb:z:99';},
      p=>{p.components[0].skewX=90;},p=>{p.components[0].scale=0;},
    ];
    bad.forEach((mutate,i)=>{const p=base();mutate(p);assert.throws(()=>validateProject(p),undefined,`case ${i}`);});
  });
  test('multi-pin attachments must use known keys and distinct holes',()=>{
    const p=boardProject();p.components=[{id:'b1',name:'SW',type:'button',x:0,y:0,rotation:0,attachments:{a:'bb:a:1',z:'bb:a:2'}}];assert.throws(()=>validateProject(p),/다핀/);
    p.components[0].attachments={a:'bb:a:1',b:'bb:a:1'};assert.throws(()=>validateProject(p),/다핀/);
    p.components[0].attachments=['bb:a:1'];assert.throws(()=>validateProject(p),/핀 연결 정보/);
  });
  test('wires: ids, endpoints, colours and bend points',()=>{
    const bad=[p=>{p.wires[1].id='w1';},p=>{p.wires[0].to=p.wires[0].from;},p=>{p.wires[0].to='part:ghost:a';},p=>{p.wires[0].to='part:r1:p9';},
      p=>{p.wires[0].color='red';},p=>{p.wires[0].points=[{x:1,y:NaN}];},p=>{p.wires[0].points={};}];
    bad.forEach((mutate,i)=>{const p=base();mutate(p);assert.throws(()=>validateProject(p),/배선/,`case ${i}`);});
    const ok=base();ok.wires[0].points=[{x:1,y:2,extra:true}];assert.deepEqual(validateProject(ok).wires[0].points,[{x:1,y:2}],'unknown point fields are dropped');
  });
  test('wires to hidden board pins are rejected',()=>{
    const p=blankProject();p.wires=[wire('w',boardPin('D13'),boardPin('GND'))];assert.throws(()=>validateProject(p),/배선/);
  });
  test('unknown top-level and component fields are stripped',()=>{
    const p=base();p.secret='x';p.components[0].evil='<script>';
    const v=validateProject(p);assert.equal(v.secret,undefined);assert.equal(v.components[0].evil,undefined);
  });
  test('surfaces, boardId and simulation settings',()=>{
    const p=base();p.surfaces={board:{hidden:'no'}};assert.throws(()=>validateProject(p),/표시 설정/);
    p.surfaces={board:{x:'1'}};assert.throws(()=>validateProject(p),/보드 위치/);
    p.surfaces=[];assert.throws(()=>validateProject(p),/보드 크기/);
    p.surfaces={board:{x:1,y:2,scale:2,bogus:1}};assert.deepEqual(validateProject(p).surfaces,{board:{x:1,y:2,scale:2}});
    const b=base();b.boardId='uno';assert.throws(()=>validateProject(b),/보드/);
    for(const stepMs of [.1,.5,1,5,20]){const s=base();s.simulation={stepMs,pwmWaveform:true};assert.equal(validateProject(s).simulation.stepMs,stepMs);}
    const s=base();s.simulation={stepMs:2,pwmWaveform:false};assert.throws(()=>validateProject(s),/시뮬레이션 시간/);
    s.simulation={stepMs:1,pwmWaveform:'yes'};assert.throws(()=>validateProject(s),/시뮬레이션 시간/);
  });
  test('firmware files: names, duplicates, count and total size',()=>{
    const p=blankProject(),files=f=>{const q=structuredClone(p);q.firmware.files=f;return q;};
    assert.equal(validateProject(files([{name:'user.c',text:''},{name:'user.h',text:''}])).firmware.files.length,2);
    for(const bad of [[{name:'main.c',text:''}],[{name:'MAIN.C',text:''}],[{name:'a.c',text:''},{name:'A.c',text:''}],[{name:'../x.c',text:''}],[{name:'x.py',text:''}],[{name:'x.c',text:1}],Array.from({length:41},(_,i)=>({name:`f${i}.c`,text:''}))])
      assert.throws(()=>validateProject(files(bad)));
    assert.throws(()=>validateProject(files([{name:'big.c',text:'x'.repeat(300001-p.code.length)}])),/300 KB/);
    const noMcu=blankProject();delete noMcu.mcu;assert.throws(()=>validateProject(noMcu),/핀 설정이 필요/);
    const bad=blankProject();bad.firmware.mode='asm';assert.throws(()=>validateProject(bad),/펌웨어/);
  });
  test('debugger settings: breakpoints and watches',()=>{
    const p=blankProject();p.ide={breakpoints:[{file:'main.c',line:3}],watches:['count']};assert.deepEqual(validateProject(p).ide,p.ide);
    for(const ide of [{breakpoints:[{file:'other.c',line:1}],watches:[]},{breakpoints:[{file:'main.c',line:0}],watches:[]},{breakpoints:[{file:'main.c',line:1.5}],watches:[]},
      {breakpoints:[],watches:['']},{breakpoints:[],watches:['x'.repeat(251)]},{breakpoints:[],watches:Array(21).fill('a')},{breakpoints:{},watches:[]}]){
      const q=blankProject();q.ide=ide;assert.throws(()=>validateProject(q),undefined,JSON.stringify(ide).slice(0,60));
    }
    const n=blankProject();n.ide={breakpoints:[],watches:[],native:{target:'arm',configuration:'Debug'}};assert.deepEqual(validateProject(n).ide.native,{target:'arm',configuration:'Debug'});
    n.ide.native.target='riscv';assert.throws(()=>validateProject(n),/실행 대상/);
  });
  test('device Docs bindings',()=>{
    const p=blankProject();p.deviceDocs={bindings:[{key:'led1',type:'led',api:'GPIO',mode:'weird',parts:{led:'led1'},pins:{out:'PA5'},peripherals:{}}],checksum:'abc123'};
    const v=validateProject(p).deviceDocs;assert.equal(v.bindings[0].mode,'hal','unknown mode falls back to hal');assert.equal(v.checksum,'abc123');
    for(const mutate of [d=>{d.bindings.push(structuredClone(d.bindings[0]));},d=>{d.bindings[0].parts={'bad key':'x'};},d=>{d.checksum='XYZ';},d=>{d.bindings[0].api='x'.repeat(101);}]){
      const q=structuredClone(p);mutate(q.deviceDocs);assert.throws(()=>validateProject(q),/Docs/);
    }
  });
});

describe('version 1 migration',()=>{
  test('quarter-turn rotations become degrees and two-pin geometry is rebuilt from holes',()=>{
    const v1={format:'stm32-circuit-lab',version:1,name:'old',code:'void setup(){}\nvoid loop(){}',wires:[],components:[
      {id:'r1',name:'R1',type:'resistor',value:220,x:0,y:0,rotation:1,attachA:'bb:a:1',attachB:'bb:a:5'},
      {id:'b1',name:'B1',type:'button',x:5,y:6,rotation:1,attachA:'bb:e:10',attachB:'bb:f:10'}]};
    const p=validateProject(v1);assert.equal(p.version,2);
    const [r,b]=p.components;assert.equal(r.rotation,90);assert.equal(r.span,56);assert.equal(r.x,632+86);assert.equal(r.y,128+28);
    assert.equal(b.rotation,90);assert.deepEqual(b.attachments,{a:'bb:e:10',b:'bb:f:10'});
    const bad=structuredClone(v1);bad.components[0].rotation=2;assert.throws(()=>validateProject(bad),/회전/);
  });
});

describe('code and board reset',()=>{
  test('resetMainCode regenerates a minimal main.c from the current pin setup and clears Docs state',()=>{
    const p=blankProject();p.mcu.pins.PA5=pin('GPIO_Output',{label:'LD2'});p.code='// my code';
    p.deviceDocs={bindings:[]};p.ide={breakpoints:[{file:'main.c',line:2}],watches:['x']};p.firmware.files=[{name:'user.c',text:'int x;'}];
    p.ide.breakpoints.push({file:'user.c',line:1});
    const r=resetMainCode(p);
    assert.doesNotMatch(r.code,/my code/);assert.match(r.code,/GPIO_PIN_5/);assert.doesNotMatch(r.code,/LD2_Pin|stdio\.h|printf|HAL_Delay\(500\)/);
    assert.equal(r.deviceDocs,undefined);assert.deepEqual(r.ide.breakpoints,[{file:'user.c',line:1}]);assert.deepEqual(r.firmware.files,p.firmware.files);
    assert.equal(p.code,'// my code','input not mutated');assert.doesNotThrow(()=>compileHal(r.code));
  });
  test('resetMainCode for sketch and native host projects',()=>{
    const s=blankProject();s.firmware.mode='sketch';assert.equal(resetMainCode(s).code,'void setup() {\n}\n\nvoid loop() {\n}\n');
    const h=blankProject();h.ide={breakpoints:[],watches:[],native:{target:'host',configuration:'Debug'}};assert.equal(resetMainCode(h).code,'int main(void) {\n    return 0;\n}\n');
  });
  test('resetBoardConfiguration clears circuit and pins but keeps code and files',()=>{
    const p=ledCircuit();p.mcu.pins.PA5=pin('GPIO_Output');p.code='int main(void){return 0;}';p.firmware={mode:'hal',files:[{name:'a.c',text:''}]};
    const r=resetBoardConfiguration(p);
    assert.deepEqual(r.components,[]);assert.deepEqual(r.wires,[]);assert.deepEqual(r.mcu.pins,{});assert.deepEqual(r.surfaces,blankProject().surfaces);
    assert.equal(r.code,p.code);assert.equal(r.firmware.files.length,1);assert.equal(p.components.length,2,'input untouched');
  });
});

describe('source files',()=>{
  test('sourceFiles lists main.c first',()=>{
    const p=blankProject();p.firmware.files=[{name:'a.c',text:'x'}];assert.deepEqual(sourceFiles(p).map(f=>f.name),['main.c','a.c']);
  });
  test('add creates templates and rejects bad or duplicate names',()=>{
    let p=changeSourceFile(blankProject(),'add','user.h');assert.equal(p.firmware.files[0].text,'#pragma once\n');
    p=changeSourceFile(p,'add','user.c');assert.equal(p.firmware.files[1].text,'#include "main.h"\n\n');
    for(const name of ['USER.h','main.c','../x.c','1abc.c','x.txt','con.c','a b.c'])assert.throws(()=>changeSourceFile(p,'add',name),undefined,name);
    let q=blankProject();for(let i=0;i<40;i++)q=changeSourceFile(q,'add',`f${i}.c`);assert.throws(()=>changeSourceFile(q,'add','extra.c'),/40개/);
  });
  test('rename rewrites includes everywhere; delete refuses included files',()=>{
    let p=changeSourceFile(blankProject(),'add','user.h');p.code='#include "user.h"\n'+p.code;p=changeSourceFile(p,'add','user.c');p.firmware.files[1].text='#include "user.h"\n';
    p=changeSourceFile(p,'rename','user.h','app.h');
    assert.match(p.code,/#include "app\.h"/);assert.equal(p.firmware.files[1].text,'#include "app.h"\n');
    assert.throws(()=>changeSourceFile(p,'delete','app.h'),/include/);
    assert.throws(()=>changeSourceFile(p,'rename','main.c','x.c'),/main\.c/);assert.throws(()=>changeSourceFile(p,'delete','nope.c'),/찾을 수 없습니다/);
    assert.throws(()=>changeSourceFile(p,'copy','user.c'));
    p=changeSourceFile(p,'delete','user.c');assert.deepEqual(p.firmware.files.map(f=>f.name),['app.h']);
  });
  test('changeSourceFile never mutates its input',()=>{
    const p=blankProject(),snap=structuredClone(p);changeSourceFile(p,'add','a.c');assert.deepEqual(p,snap);
  });
});

describe('MCU configuration',()=>{
  test('routes, IRQs and pin functions for STM32F446RE',()=>{
    assert.ok(pinFunctions('PA5').includes('TIM2_CH1')&&pinFunctions('PA5').includes('SPI1_SCK')&&pinFunctions('PA5').includes('ADC1_IN5'));
    assert.ok(!pinFunctions('PC13').includes('USART2_TX'));for(const m of MODES)assert.ok(pinFunctions('PB0').includes(m));
    assert.equal(irqForPin('PA0'),'EXTI0_IRQn');assert.equal(irqForPin('PB7'),'EXTI9_5_IRQn');assert.equal(irqForPin('PC13'),'EXTI15_10_IRQn');
    assert.ok(IRQ_NAMES.includes('USART6_IRQn')&&IRQ_NAMES.includes('TIM5_IRQn'));assert.deepEqual(ROUTES.I2C1.SCL,['PB6','PB8']);
  });
  test('validateMcu fills defaults and enforces ranges',()=>{
    const c=defaultMcu();c.peripherals.USART2={enabled:true};c.peripherals.TIM3={enabled:true};
    const v=validateMcu(c);assert.equal(v.peripherals.USART2.baud,115200);assert.deepEqual(v.peripherals.TIM3,{enabled:true,prescaler:0,period:65535,pulse:0,mode:'base'});
    assert.equal(v.timerClockHz,DEFAULT_TIMER_CLOCK_HZ);
    const bad=[c=>{c.family='STM32F103';},c=>{c.pins.PZ1=pin('GPIO_Output');},c=>{c.pins.PA5=pin('USART2_TX');},c=>{c.pins.PA5=pin('GPIO_Output',{pull:'UP'});},
      c=>{c.pins.PA5=pin('GPIO_Output',{label:'1bad'});},c=>{c.pins.PA5=pin('GPIO_Output',{label:'constructor'});},c=>{c.peripherals.CAN9={enabled:true};},
      c=>{c.peripherals.USART2={enabled:true,baud:299};},c=>{c.peripherals.TIM3={enabled:true,period:70000};},c=>{c.peripherals.TIM2={enabled:true,mode:'oneshot'};},
      c=>{c.nvic.FOO_IRQn={enabled:true,priority:0};},c=>{c.nvic.TIM2_IRQn={enabled:true,priority:16};},c=>{c.timerClockHz=500000;}];
    bad.forEach((mutate,i)=>{const c=defaultMcu();mutate(c);assert.throws(()=>validateMcu(c),undefined,`case ${i}`);});
    const big=defaultMcu();big.peripherals.TIM2={enabled:true,period:4294967295};assert.equal(validateMcu(big).peripherals.TIM2.period,4294967295,'32-bit timer');
  });
  test('configProblems reports conflicts and missing signals',()=>{
    const c=defaultMcu();
    c.pins.PA5=pin('GPIO_Output',{label:'LED'});c.pins.PA6=pin('GPIO_Output',{label:'LED'});
    c.pins.PA0=pin('GPIO_EXTI');c.pins.PB0=pin('GPIO_EXTI');
    c.pins.PA2=pin('USART2_TX');
    c.peripherals.SPI1={enabled:true,clock:1000000};c.pins.PB3=pin('SPI1_SCK');
    c.peripherals.ADC1={enabled:true};c.peripherals.TIM3={enabled:true,mode:'pwm'};c.peripherals.TIM4={enabled:true,mode:'encoder'};
    const problems=configProblems(validateMcu(c)).join('\n');
    for(const expected of ['사용자 라벨 중복: LED','EXTI0: PA0와 PB0 충돌','PA2: USART2 주변장치를 활성화하세요.','SPI1: MISO 핀을 활성화하세요.','SPI1: MOSI 핀을 활성화하세요.','ADC1: 입력 채널을 활성화하세요.','TIM3: 채널 핀을 활성화하세요.','TIM4: 엔코더 CH1 핀을 활성화하세요.'])
      assert.ok(problems.includes(expected),expected);
    const dup=defaultMcu();dup.pins.PB6=pin('I2C1_SCL');dup.pins.PB8=pin('I2C1_SCL');dup.pins.PB9=pin('I2C1_SDA');dup.peripherals.I2C1={enabled:true};
    assert.deepEqual(configProblems(validateMcu(dup)),['I2C1_SCL: 핀을 하나만 지정하세요.']);
    assert.deepEqual(configProblems(defaultMcu()),[]);
  });
  test('generateHal refuses configurations with problems',()=>{
    const c=defaultMcu();c.peripherals.I2C1={enabled:true};assert.throws(()=>generateHal(c),/I2C1: SCL 핀을 활성화하세요/);
  });
});

describe('serial configuration',()=>{
  test('routing table and helpers',()=>{
    assert.deepEqual(SERIAL_IDS,['USART1','USART2','USART3','UART4','UART5','USART6']);
    assert.ok(isSerial('UART4')&&!isSerial('I2C1'));assert.equal(serialHandle('USART6'),'huart6');assert.equal(serialHandle('UART4'),'huart4');
    assert.equal(serialAf('USART3'),7);assert.equal(serialAf('UART5'),8);assert.equal(serialFunction('USART1_RX'),'USART1');assert.equal(serialFunction('GPIO_Output'),undefined);
    assert.deepEqual(SERIAL_ROUTES.USART2,{TX:['PA2'],RX:['PA3']});
  });
  test('enabling picks the first free legal pins, disabling releases them and the IRQ',()=>{
    const c=defaultMcu();c.nvic.USART1_IRQn={enabled:true,priority:1};
    const on=setSerialEnabled(c,'USART1',true);assert.equal(on.pins.PA9.function,'USART1_TX');assert.equal(on.pins.PA10.function,'USART1_RX');assert.equal(on.peripherals.USART1.baud,115200);
    assert.deepEqual(c.pins,{},'input untouched');
    const off=setSerialEnabled(on,'USART1',false);assert.equal(off.pins.PA9.function,'Reset');assert.equal(off.peripherals.USART1.enabled,false);assert.equal(off.nvic.USART1_IRQn.enabled,false);
    const busy=defaultMcu();busy.pins.PA9=pin('GPIO_Output');assert.equal(setSerialEnabled(busy,'USART1',true).pins.PB6.function,'USART1_TX','falls back to the alternative route');
    const blocked=defaultMcu();blocked.pins.PA2=pin('GPIO_Output');assert.throws(()=>setSerialEnabled(blocked,'USART2',true),/사용 가능한 핀이 없습니다 \(PA2\)/);
    assert.throws(()=>setSerialEnabled(c,'SPI1',true),/지원하지 않는/);
  });
  test('assignSerialPin moves a role and refuses occupied or illegal pins',()=>{
    const c=setSerialEnabled(defaultMcu(),'USART1',true);assignSerialPin(c,'USART1','TX','PB6');
    assert.equal(c.pins.PB6.function,'USART1_TX');assert.equal(c.pins.PA9.function,'Reset');
    assert.throws(()=>assignSerialPin(c,'USART1','TX','PA2'),/사용할 수 없는 핀/);
    c.pins.PB7=pin('GPIO_Input');assert.throws(()=>assignSerialPin(c,'USART1','RX','PB7'),/GPIO_Input에서 사용 중/);
  });
});

describe('timer configuration',()=>{
  test('routes, alternate functions and widths',()=>{
    assert.deepEqual(TIMER_IDS,['TIM2','TIM3','TIM4','TIM5']);assert.ok(isTimer('TIM4')&&!isTimer('TIM1'));
    assert.equal(timerAf('TIM2'),1);assert.equal(timerAf('TIM4'),2);assert.equal(timerMax('TIM5'),4294967295);assert.equal(timerMax('TIM3'),65535);
    assert.deepEqual(TIMER_ROUTES.TIM4.CH1,['PB6']);assert.deepEqual(timerDefaults('TIM3'),{enabled:false,prescaler:0,period:65535,pulse:0,mode:'base'});
  });
  test('clock plan: HSI default, PLL for supported frequencies, error otherwise',()=>{
    assert.deepEqual(clockPlan(DEFAULT_TIMER_CLOCK_HZ),{source:'HSI',apb1:1,latency:0});
    const pll=clockPlan(EXAMPLE_TIMER_CLOCK_HZ);assert.equal(pll.source,'PLLCLK');assert.equal(pll.n*1e6/pll.divider,84e6);assert.equal(pll.latency,2);
    assert.throws(()=>clockPlan(100000000),/12\.5~90 MHz/);assert.throws(()=>clockPlan(1234567),/main\.c 생성/);
  });
});

describe('HAL code generation compiles and runs',()=>{
  const configs={
    default:()=>defaultMcu(),
    gpio:()=>{const c=defaultMcu();c.pins.PA5=pin('GPIO_Output',{label:'LD2',initial:1});c.pins.PA10=pin('GPIO_Input',{pull:'PULLUP'});c.pins.PC13=pin('GPIO_EXTI',{edge:'CHANGE'});c.nvic.EXTI15_10_IRQn={enabled:true,priority:2};return c;},
    ...Object.fromEntries(SERIAL_IDS.map(id=>[id,()=>{const c=setSerialEnabled(defaultMcu(),id,true);c.nvic[id+'_IRQn']={enabled:true,priority:1};return c;}])),
    i2c:()=>{const c=defaultMcu();c.pins.PB8=pin('I2C1_SCL');c.pins.PB9=pin('I2C1_SDA');c.peripherals.I2C1={enabled:true,clock:400000};return c;},
    spi:()=>{const c=defaultMcu();c.pins.PA5=pin('SPI1_SCK');c.pins.PA6=pin('SPI1_MISO');c.pins.PA7=pin('SPI1_MOSI');c.peripherals.SPI1={enabled:true};return c;},
    adc:()=>{const c=defaultMcu();c.pins.PA0=pin('ADC1_IN0');c.pins.PA1=pin('ADC1_IN1');c.peripherals.ADC1={enabled:true};return c;},
    pwm:()=>{const c=defaultMcu();c.timerClockHz=84000000;c.pins.PA6=pin('TIM3_CH1');c.peripherals.TIM3={enabled:true,prescaler:83,period:999,pulse:250,mode:'pwm'};c.nvic.TIM3_IRQn={enabled:true,priority:0};return c;},
    capture:()=>{const c=defaultMcu();c.pins.PB6=pin('TIM4_CH1');c.peripherals.TIM4={enabled:true,mode:'capture'};return c;},
    encoder:()=>{const c=defaultMcu();c.pins.PB6=pin('TIM4_CH1');c.pins.PB7=pin('TIM4_CH2');c.peripherals.TIM4={enabled:true,mode:'encoder'};return c;},
  };
  for(const [name,make]of Object.entries(configs))test(`${name}: generated main.c compiles and runs 20 ms`,()=>{
    for(const minimal of [false,true]){
      const mcu=validateMcu(make()),code=generateHal(mcu,{minimal});
      assert.doesNotThrow(()=>compileHal(code),`${name} minimal=${minimal}`);
      const project=blankProject();project.mcu=mcu;const r=runHal(code,{ms:20,project});assert.equal(r.error,null,`${name} minimal=${minimal}: ${r.error?.message}`);
    }
  });
  test('generated code reflects configuration details',()=>{
    const code=generateHal(configs.gpio());
    assert.match(code,/HAL_GPIO_WritePin\(GPIOA, GPIO_PIN_5, GPIO_PIN_SET\)/);assert.match(code,/GPIO_MODE_IT_RISING_FALLING/);assert.match(code,/GPIO_PULLUP/);
    assert.match(code,/HAL_NVIC_SetPriority\(EXTI15_10_IRQn, 2, 0\)/);assert.match(code,/void HAL_GPIO_EXTI_Callback\(uint16_t GPIO_Pin\)/);
    const uart=generateHal(configs.USART6());assert.match(uart,/UART_HandleTypeDef huart6;/);assert.match(uart,/GPIO_AF8_USART6/);assert.match(uart,/BaudRate = 115200/);
    assert.match(generateHal(configs.pwm()),/PLL/);
    const minimal=generateHal(defaultMcu(),{minimal:true});assert.doesNotMatch(minimal,/stdio|MX_GPIO_Init|__io_putchar/);
  });
  test('USART2 output from the generated project reaches the VCP terminal',()=>{
    const p=blankProject();p.mcu=setSerialEnabled(p.mcu,'USART2',true);p.code=generateHal(p.mcu);
    const r=runHal(p.code,{ms:30,project:p});assert.equal(r.error,null);assert.match(r.session.buses.vcpOutput,/HAL ready/);
  });
});

describe('.ioc and firmware import',()=>{
  test('importIoc maps pins, pulls, EXTI edges, labels, baud and NVIC',()=>{
    const {config,warnings}=importIoc(IOC);assert.deepEqual(warnings,[]);
    assert.deepEqual(config.pins.PA5,{function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'LD2',initial:1});
    assert.deepEqual(config.pins.PC13,{function:'GPIO_EXTI',pull:'PULLUP',edge:'CHANGE',label:'',initial:0});
    assert.equal(config.peripherals.USART2.baud,9600);assert.deepEqual(config.nvic.EXTI15_10_IRQn,{enabled:true,priority:2});assert.equal(config.nvic.USART2_IRQn.enabled,false);
  });
  test('importIoc reports unsupported peripherals and rejects other MCUs',()=>{
    const {config,warnings}=importIoc('Mcu.Name=STM32F446RETx\nMcu.IP0=CAN1\nPB8.Signal=CAN1_RX\nPA13.Signal=SYS_JTMS-SWDIO');
    assert.equal(config.pins.PB8.function,'Reserved');assert.ok(warnings.some(w=>w.includes('CAN1')));assert.ok(!warnings.some(w=>w.includes('SYS_')),'debug pins are silently reserved');
    assert.throws(()=>importIoc('Mcu.Name=STM32H743ZITx'),/STM32F446RE/);assert.throws(()=>importIoc(5),/500 KB/);
    const timer=importIoc('Mcu.Name=STM32F446RETx\nPA6.Signal=TIM3_CH1\nMcu.IP0=TIM3\nTIM3.IPParameters=Channel-PWM Generation1 CH1,Prescaler,Period\nTIM3.Prescaler=83\nTIM3.Period=999');
    assert.equal(timer.config.pins.PA6.function,'TIM3_CH1');assert.equal(timer.config.peripherals.TIM3.mode,'pwm');assert.equal(timer.config.peripherals.TIM3.prescaler,83);assert.equal(timer.config.peripherals.TIM3.period,999);
  });
  // CubeMX writes timer channel pins with an "S_" prefix (e.g. PA6.Signal=S_TIM3_CH1).
  test('importIoc accepts CubeMX S_TIMx_CHy pin signals',()=>{
    const {config,warnings}=importIoc('Mcu.Name=STM32F446RETx\nPA6.Signal=S_TIM3_CH1\nMcu.IP0=TIM3\nTIM3.IPParameters=Channel-PWM Generation1 CH1');
    assert.equal(config.pins.PA6.function,'TIM3_CH1');assert.deepEqual(warnings,[]);
  });
  test('importFirmware replaces mcu and sources, keeps the circuit',()=>{
    const original=ledCircuit(),{config}=importIoc(IOC);
    const {project,warnings}=importFirmware(original,[{name:'board.ioc',text:IOC},{name:'main.c',text:generateHal(config)},{name:'util.c',text:'int u;'},{name:'util.h',text:'#pragma once'}]);
    assert.deepEqual(warnings,[]);assert.equal(project.firmware.mode,'hal');assert.deepEqual(project.firmware.files.map(f=>f.name),['util.c','util.h']);
    assert.equal(project.mcu.peripherals.USART2.baud,9600);assert.equal(project.components.length,2);assert.notEqual(original.code,project.code);
    const r=runHal(project.code,{ms:20,project});assert.equal(r.error,null,r.error?.message);
  });
  test('importFirmware with only an .ioc keeps the code; validation errors',()=>{
    const original=ledCircuit(),{project}=importFirmware(original,[{name:'x.ioc',text:IOC}]);assert.equal(project.code,original.code);assert.equal(project.mcu.pins.PA5.label,'LD2');
    assert.throws(()=>importFirmware(original,[]),/\.ioc 및/);
    assert.throws(()=>importFirmware(original,[{name:'x.c',text:''}]),/main\.c/);
    assert.throws(()=>importFirmware(original,[{name:'a.ioc',text:IOC},{name:'b.ioc',text:IOC}]),/하나만/);
    assert.throws(()=>importFirmware(original,[{name:'main.c',text:''},{name:'main.c',text:''}]),/중복/);
    assert.throws(()=>importFirmware(original,[{name:'evil.exe',text:''}]),/확장자/);
    assert.throws(()=>importFirmware(original,[{name:'main.c',text:'x'.repeat(800001)}]),/800 KB/);
  });
});
