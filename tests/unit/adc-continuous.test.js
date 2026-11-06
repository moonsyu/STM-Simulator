// ADC1 Continuous Conversion Mode (CubeMX ADC Settings): Pinout setting, generated MX_ADC1_Init, .ioc import, and the
// interpreter: one HAL_ADC_Start, then HAL_ADC_GetValue follows the potentiometer; single mode keeps one result.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHalExample} from '../../src/hal-examples.js';
import {SimulationSession} from '../../src/session.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {validateMcu,generateHal,importIoc} from '../../src/mcu-config.js';

const LOOP='    adc_val = HAL_ADC_GetValue(&hadc1);\n    printf("value: %lu\\r\\n", adc_val);\n    HAL_Delay(100);';
function project(continuous,base=blankProject()){
 const p=applyHalExample(base,'potentiometer');
 if(continuous)p.mcu.peripherals.ADC1.continuous=true;
 // As in the report: start once in USER CODE 2, then only read the result register.
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN PV */','/* USER CODE BEGIN PV */\nuint32_t adc_val;').replace('/* USER CODE BEGIN Includes */','/* USER CODE BEGIN Includes */\n#include <stdio.h>').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_ADC_Start(&hadc1);').replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n'+LOOP);
 return p;
}
function run(p){
 const out=[],warnings=[],session=new SimulationSession(p,{print:v=>out.push(String(v)),warn:w=>warnings.push(w)});
 const tick=end=>{for(let t=Math.ceil(session.runtime.time/10)*10;t<=end;t+=10)session.tick(t);};
 return {session,out,warnings,tick};
}
const pot=p=>p.components.find(c=>c.type==='ref_pot_bare_3');

test('Continuous Conversion Mode: validated, generated for F446RE and F103RB, read from a CubeMX .ioc',()=>{
 for(const base of [blankProject(),projectForBoard('nucleo-f103rb')]){
  const p=project(true,base);
  assert.equal(validateMcu(p.mcu).peripherals.ADC1.continuous,true);
  assert.match(generateHal(p.mcu),/hadc1\.Init\.ContinuousConvMode = ENABLE;/);
  assert.match(generateHal(project(false,base).mcu),/hadc1\.Init\.ContinuousConvMode = DISABLE;/);
  assert.equal(validateMcu(project(false,base).mcu).peripherals.ADC1.continuous,undefined,'off is the default (not stored)');
 }
 assert.throws(()=>validateMcu({...project(true).mcu,peripherals:{ADC1:{enabled:true,continuous:'yes'}}}),/Continuous Conversion Mode/);
 const ioc='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nMcu.IP0=ADC1\nPA0-WKUP.Signal=ADCx_IN0\nPA0-WKUP.Mode=IN0\nADC1.ContinuousConvMode=ENABLE\nADC1.IPParameters=ContinuousConvMode\n';
 assert.equal(importIoc(ioc).config.peripherals.ADC1.continuous,true);
});

test('interpreter: continuous mode follows the potentiometer after one HAL_ADC_Start; single mode keeps the first result and says why',()=>{
 const c=project(true),{out,tick}=run(c);tick(300);
 assert.match(out.at(-1),/^value: 204[78]/);
 pot(c).position=90;tick(700);assert.match(out.at(-1),/^value: 368[45]/,'continuous: the new wiper position');
 const s=project(false),single=run(s);single.tick(300);assert.match(single.out.at(-1),/^value: 204[78]/);
 pot(s).position=90;single.tick(700);assert.match(single.out.at(-1),/^value: 204[78]/,'single conversion: the same result, as on the board');
 assert.ok(single.warnings.some(w=>/단일 변환 모드[\s\S]*Continuous Conversion Mode/.test(w)),single.warnings.join('|'));
});
