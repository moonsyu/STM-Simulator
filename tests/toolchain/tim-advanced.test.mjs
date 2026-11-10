// Advanced timers on the ARM GCC build (real STM32Cube HAL) and the firmware emulator with the code the Pinout generates:
// TIM1 (both boards) PWM with its complementary output and main output enable, the repetition counter dividing the
// update interrupt on TIM1_UP(_TIM10)_IRQn, and TIM8 (F446RE) output compare interrupts on TIM8_CC_IRQn.
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
const runTo=(s,us)=>{for(let t=10;s.now<us;t+=10)s.tick(t);};

test('TIM1 PWM + CH1N, repetition counter and update interrupt (F446RE, F103RB); TIM8 compare interrupt (F446RE)',{skip,timeout:900000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'tim-adv-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   const f1=board==='F103RB',p=structuredClone(base),m=p.mcu,up=f1?'TIM1_UP_IRQn':'TIM1_UP_TIM10_IRQn';p.components=[];p.wires=[];
   // Timer clock / (PSC + 1) = 10 kHz; ARR 99: 10 ms period; one update interrupt per 5 periods (50 ms).
   Object.assign(m.pins,{PA8:pin('TIM1_CH1'),PB13:pin('TIM1_CH1N'),PC0:pin('GPIO_Output'),PC1:pin('GPIO_Output')});
   m.peripherals.TIM1={enabled:true,prescaler:m.timerClockHz/10000-1,period:99,pulse:25,mode:'pwm',repetition:4,deadTime:8};m.nvic[up]={enabled:true,priority:1};
   p.code=generateHal(m,{minimal:true}).replace('int main(void) {','volatile uint32_t ups;\nint main(void) {')
    .replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_TIM_PWM_Start(&htim1, TIM_CHANNEL_1);\n  HAL_TIMEx_PWMN_Start(&htim1, TIM_CHANNEL_1);\n  HAL_TIM_Base_Start_IT(&htim1);')
    +'\nvoid HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *h) {\n  (void)h;\n  ups++;\n  if (ups == 4) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);\n  if (ups == 7) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_1, GPIO_PIN_SET);\n}\n';
   let result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   let s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   runTo(s,150000);assert.equal(s.gpio.PC0?.value,0,`${board}: fewer than 4 update interrupts in 150 ms (one per 50 ms)`);
   runTo(s,260000);assert.equal(s.gpio.PC0?.value,3.3,`${board}: 4 update interrupts by 250 ms`);assert.equal(s.gpio.PC1?.value,0,`${board}: not 7 yet`);
   const t=s.soc.timers.TIM1;assert.equal(t.get(0x30)&0xff,4,`${board}: RCR`);assert.ok(t.get(0x44)&0x8000,`${board}: BDTR MOE set by HAL_TIM_PWM_Start`);assert.equal(t.get(0x44)&0xff,8,`${board}: BDTR dead time`);
   assert.equal(t.get(0x20)&0x5,0x5,`${board}: CC1E and CC1NE`);
   const a=s.gpio.PA8,n=s.gpio.PB13;assert.ok(a?.pwm&&n?.pwm,`${board}: PA8 / PB13 carry PWM: ${JSON.stringify(a)} ${JSON.stringify(n)}`);
   assert.ok(Math.abs(a.pwm.duty-.25)<.02&&Math.abs(n.pwm.duty-.75)<.05,`${board}: duty ${a.pwm.duty} / ${n.pwm.duty}`);
   if(f1)continue;
   // TIM8 output compare with interrupt: HAL_TIM_OC_DelayElapsedCallback through TIM8_CC_IRQHandler.
   const q=structuredClone(base),k=q.mcu;q.components=[];q.wires=[];Object.assign(k.pins,{PC6:pin('TIM8_CH1'),PC0:pin('GPIO_Output')});
   k.peripherals.TIM8={enabled:true,prescaler:k.timerClockHz/10000-1,period:999,mode:'oc',channels:{CH1:{pulse:500,ocMode:'TOGGLE'}}};k.nvic.TIM8_CC_IRQn={enabled:true,priority:1};
   q.code=generateHal(k,{minimal:true}).replace('int main(void) {','volatile uint32_t matches;\nint main(void) {').replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  HAL_TIM_OC_Start_IT(&htim8, TIM_CHANNEL_1);')
    +'\nvoid HAL_TIM_OC_DelayElapsedCallback(TIM_HandleTypeDef *h) {\n  (void)h;\n  if (++matches == 3) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);\n}\n';
   result=await build(await prepareBuild({project:q,tools,root,target:'arm'}));assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],'TIM8');
   s=new FirmwareSession(q,{elf:new Uint8Array(await fs.readFile(result.elf))});
   runTo(s,200000);assert.equal(s.gpio.PC0?.value,0,'TIM8: fewer than 3 matches in 200 ms (one per 100 ms)');
   runTo(s,320000);assert.equal(s.gpio.PC0?.value,3.3,'TIM8: 3 compare interrupts by 300 ms');
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
