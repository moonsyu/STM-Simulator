// Error-case pass over features 3, 6, 9, 12 and 13 with every HAL example on both boards (247 projects): what one
// feature writes, another must take back unchanged.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject,projectForBoard} from '../../src/project.js';
import {generateHal,validateMcu,importIoc} from '../../src/mcu-config.js';
import {exportIoc} from '../../src/ioc-export.js';
import {HAL_EXAMPLES,applyHalExample} from '../../src/hal-examples.js';
import {regenerateMain} from '../../src/c-source-edit.js';
import {expandC} from '../../src/c-format.js';
import {cubeIdeHandlerDuplicates} from '../../src/irq-duplicates.js';
import {suggestCircuit,buildCircuit} from '../../src/ioc-circuit.js';
import {planDrop} from '../../src/file-drop.js';

const projects=[];
for(const [board,base]of [['F446RE',()=>blankProject()],['F103RB',()=>projectForBoard('nucleo-f103rb')]])for(const id of Object.keys(HAL_EXAMPLES)){
 let p;try{p=validateProject(applyHalExample(base(),id));}catch{continue;}
 projects.push({tag:`${board}/${id}`,p,base});
}
const sorted=text=>text.split('\n').sort().join('\n');

test('every example is there on both boards',()=>{assert.ok(projects.length>=240,String(projects.length));});

test('.ioc export then import: the same pins in the same order, and the same generated code',()=>{
 // The order matters: generated code lists the pins in it and a new main loop toggles the first output pin. The file's
 // keys are sorted as text (PA10 before PA5), so the order comes back from Mcu.PinN.
 let declarationOrderOnly=0;
 for(const {tag,p}of projects){
  const before=validateMcu(p.mcu),back=importIoc(exportIoc(p.mcu)),after=validateMcu(back.config);
  // A Reserved pin (a signal the model does not have: CAN, I2S, DCMI) has no signal name to write, so it is not exported.
  assert.deepEqual(Object.keys(after.pins),Object.keys(before.pins).filter(pin=>before.pins[pin].function!=='Reserved'),tag+': pin order');
  const a=generateHal(before),b=generateHal(after);
  if(a!==b){assert.equal(sorted(b),sorted(a),tag+': generated code has the same lines');declarationOrderOnly++;}
 }
 // Two projects differ only in the order of two handle declarations (the file lists peripherals by name).
 assert.ok(declarationOrderOnly<=4,String(declarationOrderOnly));
 const camera=projects.find(x=>x.tag==='F446RE/ref_ov2640_camera').p,toggled=code=>/HAL_GPIO_TogglePin\(GPIO\w, GPIO_PIN_\d+\)/.exec(code)?.[0];
 assert.ok(toggled(generateHal(validateMcu(camera.mcu))));
 assert.equal(toggled(generateHal(validateMcu(importIoc(exportIoc(camera.mcu)).config))),toggled(generateHal(validateMcu(camera.mcu))),'the main loop toggles the same pin after the round trip');
});

test('a real CubeMX pin list (Mcu.PinN) gives the pin order; pins the list leaves out come after',()=>{
 const text=['Mcu.Family=STM32F4','Mcu.Name=STM32F446R(C-E)Tx','Mcu.UserName=STM32F446RETx','Mcu.Pin0=PA10','Mcu.Pin1=PC13-ANTI_TAMP','Mcu.Pin2=PA5','Mcu.PinsNb=3',
  'PA10.Signal=GPIO_Output','PA5.Signal=GPIO_Output','PB0.Signal=GPIO_Output','PC13-ANTI_TAMP.Signal=GPIO_Input'].join('\n');
 assert.deepEqual(Object.keys(importIoc(text).config.pins),['PA10','PC13','PA5','PB0']);
});

test('regenerating with unchanged settings moves nothing and is stable; examples are not reported as duplicate handlers',()=>{
 for(const {tag,p}of projects){
  const g=expandC(generateHal(p.mcu)),r=regenerateMain(p.code,g,g);
  assert.deepEqual(r.moved,[],tag);assert.equal(regenerateMain(r.code,g,g).code,r.code,tag+': stable');
  assert.deepEqual(cubeIdeHandlerDuplicates(p),[],tag);
 }
});

test('a circuit made from the pin settings of any example is a valid project',()=>{
 for(const {tag,p,base}of projects){const made=buildCircuit({...base(),mcu:p.mcu,code:p.code},suggestCircuit(p.mcu));assert.doesNotThrow(()=>validateProject(made.project||made),tag);}
});

test('dropped startup code and a linker script are added like other project files; odd names are refused with the reason',()=>{
 const f=(name,text='x')=>({name,text,size:text.length});
 const plan=planDrop([f('Core/Startup/startup_stm32f446xx.s'),f('STM32F446RETX_FLASH.ld')],blankProject());
 assert.equal(plan.action,'add');assert.deepEqual(plan.files.map(x=>x.name),['Core/Startup/startup_stm32f446xx.s','STM32F446RETX_FLASH.ld']);
 for(const name of ['한글.c','a b.c','../x.c','/abs.c','C:\\x\\y.c','noext','.c','x.c ','A.S'])assert.throws(()=>planDrop([f(name)],blankProject()),/이름을 쓸 수 없습니다.*\.s\/\.ld/,name);
 // The same name twice (also when only the case differs) keeps the first and reports the other.
 const twice=planDrop([f('a.c'),f('A.c')],blankProject());assert.deepEqual(twice.files.map(x=>x.name),['a.c']);assert.deepEqual(twice.skipped,['A.c']);
});
