// Regressions found by probing random RTC / DAC settings (generate → run, export → import).
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../../src/project.js';
import {generateHal,validateMcu,importIoc,defaultMcu} from '../../src/mcu-config.js';
import {exportIoc} from '../../src/ioc-export.js';
import {SimulationSession} from '../../src/session.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});

test('the generated TIM6_DAC_IRQHandler (TIM6 update + HAL_DAC_IRQHandler) runs on the interpreter',()=>{
 const p=blankProject();p.mcu.pins={PA4:pin('DAC_OUT1')};
 p.mcu.peripherals={DAC:{enabled:true,channels:{OUT1:{trigger:'T6_TRGO'}}},TIM6:{enabled:true,prescaler:15999,period:99,trgo:'UPDATE'}};p.mcu.nvic={TIM6_DAC_IRQn:{enabled:true,priority:1}};
 p.mcu=validateMcu(p.mcu);p.code=generateHal(p.mcu);
 assert.match(p.code,/void TIM6_DAC_IRQHandler\(void\) \{[\s\S]*?HAL_TIM_IRQHandler\(&htim6\);[\s\S]*?HAL_DAC_IRQHandler\(&hdac\);/);
 const warnings=[],s=new SimulationSession(p,{print:()=>{},warn:w=>warnings.push(w)});s.tick(0);for(let t=50;t<=600;t+=50)s.tick(t);
 assert.ok(!s.result?.fault);assert.deepEqual(warnings,[]);
});

test('.ioc export keeps the priority of an interrupt line that is off, and the F103RB RTC week day',()=>{
 const a=validateMcu({...defaultMcu(),nvic:{RTC_Alarm_IRQn:{enabled:false,priority:7,sub:1},USART2_IRQn:{enabled:false,priority:3}}});
 assert.deepEqual(importIoc(exportIoc(a)).config.nvic,a.nvic);
 const b=validateMcu({...defaultMcu('STM32F103RB'),peripherals:{RTC:{enabled:true,clockSource:'LSE',time:{hours:16,minutes:11,seconds:19},date:{weekDay:2,month:8,date:12,year:59},alarm:{enabled:true,hours:11,minutes:15,seconds:40}}}});
 assert.deepEqual(importIoc(exportIoc(b)).config.peripherals.RTC,b.peripherals.RTC);
});
