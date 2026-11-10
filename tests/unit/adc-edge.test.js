// Error-case pass, feature 1 (ADC conversions in the interpreter): what happens around a missing or extra
// HAL_ADC_Start / HAL_ADC_Stop. Two things were wrong: in Continuous Conversion Mode a stopped ADC was explained as
// "single conversion mode", and in single mode a second HAL_ADC_PollForConversion without a new Start returned HAL_OK
// where HAL waits for an end of conversion that never comes and returns HAL_TIMEOUT.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHalExample} from '../../src/hal-examples.js';
import {SimulationSession} from '../../src/session.js';
import {blankProject} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

function project(continuous,{init='  HAL_ADC_Start(&hadc1);',loop}){
 const p=applyHalExample(blankProject(),'potentiometer');if(continuous)p.mcu.peripherals.ADC1.continuous=true;
 p.code=generateHal(p.mcu,{minimal:true}).replace('/* USER CODE BEGIN PV */','/* USER CODE BEGIN PV */\nuint32_t adc_val; int n = 0; HAL_StatusTypeDef st;').replace('/* USER CODE BEGIN Includes */','/* USER CODE BEGIN Includes */\n#include <stdio.h>').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+init).replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n'+loop);
 return p;
}
function run(p,steps){
 const out=[],warnings=[],session=new SimulationSession(p,{print:v=>out.push(String(v).trim()),warn:w=>warnings.push(w)}),pot=p.components.find(c=>c.type==='ref_pot_bare_3');
 for(const [end,position]of steps){if(position!=null)pot.position=position;for(let t=Math.ceil(session.runtime.time/10)*10;t<=end;t+=10)session.tick(t);}
 return {out,warnings};
}
const READ='    adc_val = HAL_ADC_GetValue(&hadc1); printf("%d:%lu\\r\\n", n, adc_val); n++; HAL_Delay(100);';
const POLL='    st = HAL_ADC_PollForConversion(&hadc1, 10); printf("st=%d v=%lu\\r\\n", st, HAL_ADC_GetValue(&hadc1)); HAL_Delay(100);';

test('continuous mode: HAL_ADC_Stop freezes the value and the note says the ADC is stopped; a new Start follows the input again',()=>{
 const stopped=run(project(true,{loop:'    if (n == 3) HAL_ADC_Stop(&hadc1);\n'+READ}),[[350,null],[800,90]]);
 assert.match(stopped.out.at(-1),/^\d+:204[78]$/,'the value from before the stop');
 assert.equal(stopped.warnings.length,1);assert.match(stopped.warnings[0],/변환이 멈춰 있어[\s\S]*HAL_ADC_Stop/);assert.doesNotMatch(stopped.warnings[0],/단일 변환 모드/);
 const again=run(project(true,{loop:'    if (n == 3) HAL_ADC_Stop(&hadc1);\n    if (n == 6) HAL_ADC_Start(&hadc1);\n'+READ}),[[350,null],[1000,90]]);
 assert.match(again.out.at(-1),/^\d+:368[45]$/);
 // Never started: 0, with the same note once the input differs.
 const never=run(project(true,{init:'',loop:READ}),[[250,null]]);assert.match(never.out.at(-1),/:0$/);assert.match(never.warnings[0],/HAL_ADC_Start를 부르지 않음/);
});

test('single mode: one Start gives one end of conversion; polling again returns HAL_TIMEOUT with a note, Start before each poll is HAL_OK',()=>{
 const once=run(project(false,{loop:POLL}),[[450,null]]);
 assert.deepEqual(once.out.slice(0,3).map(l=>l.split(' ')[0]),['st=0','st=3','st=3']);
 assert.equal(once.warnings.filter(w=>/HAL_TIMEOUT/.test(w)).length,1,'said once');
 const each=run(project(false,{init:'',loop:'    HAL_ADC_Start(&hadc1);\n'+POLL}),[[250,null],[550,90]]);
 assert.ok(each.out.every(l=>l.startsWith('st=0 ')),each.out.join('|'));assert.match(each.out.at(-1),/v=368[45]$/);assert.deepEqual(each.warnings,[]);
 // Without any Start the poll is HAL_ERROR, as before; continuous mode polls HAL_OK every time.
 assert.ok(run(project(false,{init:'',loop:POLL}),[[250,null]]).out.every(l=>l.startsWith('st=1 ')));
 const continuous=run(project(true,{loop:POLL}),[[250,null],[550,90]]);assert.ok(continuous.out.every(l=>l.startsWith('st=0 ')));assert.match(continuous.out.at(-1),/v=368[45]$/);
});
