// TIM Output Compare and Counter Mode on the ARM GCC build (real STM32Cube HAL) and the firmware emulator, with the
// MX_TIM2_Init the Pinout generates: CH1 Toggle on match (1 kHz count, ARR 499 → 1 Hz square wave), CH2 Active on
// match at 200 ms, HAL_TIM_OC_Start_IT calling HAL_TIM_OC_DelayElapsedCallback, and center-aligned PWM at
// timer clock / 2·ARR, on both boards.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';
const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
// New projects have USART2 on (the UART console, 1.51.0). On the F103 USART2_RTS shares PA1 with TIM2_CH2: without
// hardware flow control the pin is the timer's (the emulator drove RTS whenever USART2 was enabled before 1.51.0).
const boards=[['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]];
assert.ok(boards.every(([,p])=>p.mcu.peripherals.USART2?.enabled),'the boards start with USART2 on');
const user=(code,lines,extra='')=>code.replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+lines)+extra;
async function firmware(p,root,board){
 const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
 assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
 return new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
}
const runTo=(s,us)=>{for(let t=10;s.now<us;t+=10)s.tick(t);};

test('Output Compare Toggle / Active on match and the OC interrupt on the emulator (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tim-oc-'));
 try{
  for(const [board,base]of boards){
   const p=structuredClone(base),m=p.mcu;p.components=[];p.wires=[];
   m.pins.PA0=pin('TIM2_CH1');m.pins.PA1=pin('TIM2_CH2');m.pins.PC0=pin('GPIO_Output');
   m.peripherals.TIM2={enabled:true,prescaler:m.timerClockHz/1000-1,period:499,pulse:100,mode:'oc',channels:{CH1:{ocMode:'TOGGLE'},CH2:{ocMode:'ACTIVE',pulse:200}}};
   m.nvic.TIM2_IRQn={enabled:true,priority:0};
   p.code=user(generateHal(m,{minimal:true}),'  HAL_TIM_OC_Start(&htim2, TIM_CHANNEL_1);\n  HAL_TIM_OC_Start_IT(&htim2, TIM_CHANNEL_2);',
    '\nvoid HAL_TIM_OC_DelayElapsedCallback(TIM_HandleTypeDef *htim) {\n  if (htim->Channel == HAL_TIM_ACTIVE_CHANNEL_2) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);\n}\nvoid TIM2_IRQHandler(void) { HAL_TIM_IRQHandler(&htim2); }\n');
   const s=await firmware(p,root,board);
   runTo(s,150000);
   // The channel drives its pin low before the match (the timer is clocked after MX_GPIO_Init set the pin to AF).
   assert.deepEqual([s.gpio.PA1?.mode,s.gpio.PA1?.value],['OUTPUT',0],`${board} CH2 before its match: ${JSON.stringify(s.gpio.PA1)}`);assert.equal(s.gpio.PC0?.value,0,`${board} callback not yet`);
   runTo(s,1100000);
   const toggle=s.gpio.PA0?.pwm;assert.ok(toggle&&Math.abs(toggle.frequency-1)<1e-6&&toggle.duty===.5,`${board} CH1 toggle: ${JSON.stringify(s.gpio.PA0)}`);
   assert.equal(s.gpio.PA1?.value,3.3,`${board} CH2 active after CNT = 200`);
   assert.equal(s.gpio.PC0?.value,3.3,`${board} HAL_TIM_OC_DelayElapsedCallback ran`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('Counter Mode Center Aligned: PWM at timer clock / 2·ARR with duty CCR / ARR; OC Toggle twice per cycle (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tim-cms-'));
 try{
  for(const [board,base]of boards){
   const p=structuredClone(base),m=p.mcu;p.components=[];p.wires=[];p.simulation={...(p.simulation||{}),pwmWaveform:false};
   m.pins.PA0=pin('TIM2_CH1');m.pins.PA6=pin('TIM3_CH1');
   m.peripherals.TIM2={enabled:true,prescaler:m.timerClockHz/1e6-1,period:999,pulse:250,mode:'pwm',counterMode:'CENTERALIGNED1'};
   m.peripherals.TIM3={enabled:true,prescaler:m.timerClockHz/1e6-1,period:999,pulse:250,mode:'oc',counterMode:'CENTERALIGNED1',channels:{CH1:{ocMode:'TOGGLE'}}};
   p.code=user(generateHal(m,{minimal:true}),'  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);\n  HAL_TIM_OC_Start(&htim3, TIM_CHANNEL_1);');
   assert.match(p.code,/htim2\.Init\.CounterMode = TIM_COUNTERMODE_CENTERALIGNED1;[\s\S]*htim3\.Init\.CounterMode = TIM_COUNTERMODE_CENTERALIGNED1;/);
   const s=await firmware(p,root,board);runTo(s,50000);
   const w=s.gpio.PA0?.pwm;
   assert.ok(w&&Math.abs(w.frequency-1e6/1998)<1e-3,`${board}: ${JSON.stringify(s.gpio.PA0)}`);
   assert.ok(Math.abs(w.duty-250/999)<.005,`${board} duty ${w.duty}`);
   // CNT = 250 counting up and counting down: two toggles per 1998-tick cycle → one square-wave period per cycle.
   const t=s.gpio.PA6?.pwm;assert.ok(t&&Math.abs(t.frequency-1e6/1998)<1e-3,`${board} TIM3 toggle: ${JSON.stringify(s.gpio.PA6)}`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
