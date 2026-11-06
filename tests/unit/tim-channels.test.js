// TIM PWM Generation CHn settings (CubeMX): each channel's Pulse, CH Polarity and PWM mode 1/2 in the Pinout
// configuration, the generated MX_TIMx_Init (the shared TIM_OC_InitTypeDef set again before each ConfigChannel), .ioc
// import, and the interpreter's PWM1 / active-high limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {twoChannels} from './helpers/tim-channels.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {validateMcu,generateHal,importIoc} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

test('per-channel Pulse / polarity / PWM mode: validated, only differences kept, generated before each ConfigChannel',()=>{
 for(const base of [blankProject(),projectForBoard('nucleo-f103rb')]){
  const v=validateMcu(twoChannels(base,{CH1:{pulse:250,polarity:'HIGH',ocMode:'PWM1'},CH2:{pulse:750,polarity:'LOW',ocMode:'PWM2'}}).mcu).peripherals.TIM2;
  assert.deepEqual(v.channels,{CH2:{pulse:750,polarity:'LOW',ocMode:'PWM2'}},'CH1 equals the timer defaults');
  const src=generateHal(twoChannels(base,{CH2:{pulse:750,polarity:'LOW',ocMode:'PWM2'}}).mcu);
  assert.match(src,/channel\.OCMode = TIM_OCMODE_PWM1;\s*channel\.OCPolarity = TIM_OCPOLARITY_HIGH;\s*channel\.Pulse = 250;\s*HAL_TIM_PWM_ConfigChannel\(&htim2, &channel, TIM_CHANNEL_1\);/);
  assert.match(src,/channel\.OCMode = TIM_OCMODE_PWM2;\s*channel\.OCPolarity = TIM_OCPOLARITY_LOW;\s*channel\.Pulse = 750;\s*HAL_TIM_PWM_ConfigChannel\(&htim2, &channel, TIM_CHANNEL_2\);/);
 }
 // Without channel settings the generated code is as before (one shared Pulse).
 const plain=generateHal(twoChannels(blankProject(),{}).mcu);
 assert.equal((plain.match(/channel\.Pulse = /g)||[]).length,1);
 assert.equal(validateMcu(twoChannels(blankProject(),{}).mcu).peripherals.TIM2.channels,undefined);
 assert.throws(()=>validateMcu(twoChannels(blankProject(),{CH5:{pulse:1}}).mcu),/TIM2\.CH5/);
 assert.throws(()=>validateMcu(twoChannels(blankProject(),{CH1:{polarity:'MID'}}).mcu),/HIGH \/ LOW/);
 assert.throws(()=>validateMcu(twoChannels(projectForBoard('nucleo-f103rb'),{CH1:{pulse:70000}}).mcu),/TIM2\.CH1\.pulse/);
});

test('a CubeMX .ioc with two PWM channels keeps each Pulse, polarity and mode; the interpreter names its limit',()=>{
 const ioc='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nMcu.IP0=TIM2\nPA5.Signal=S_TIM2_CH1\nPA1.Signal=S_TIM2_CH2\nTIM2.Channel-PWM Generation1 CH1=TIM_CHANNEL_1\nTIM2.Channel-PWM Generation2 CH2=TIM_CHANNEL_2\nTIM2.Prescaler=839\nTIM2.Period=999\nTIM2.Pulse-PWM Generation1 CH1=250\nTIM2.Pulse-PWM Generation2 CH2=750\nTIM2.OCPolarity_2=TIM_OCPOLARITY_LOW\nTIM2.OCMode_PWM-PWM Generation2 CH2=TIM_OCMODE_PWM2\nTIM2.IPParameters=Channel-PWM Generation1 CH1,Channel-PWM Generation2 CH2,Prescaler,Period,Pulse-PWM Generation1 CH1,Pulse-PWM Generation2 CH2,OCPolarity_2,OCMode_PWM-PWM Generation2 CH2\n';
 const r=importIoc(ioc),t=validateMcu(r.config).peripherals.TIM2;
 assert.equal(t.mode,'pwm');assert.equal(t.pulse,250);
 assert.deepEqual(t.channels,{CH2:{pulse:750,polarity:'LOW',ocMode:'PWM2'}});
 const p=twoChannels(blankProject(),{CH2:{polarity:'LOW'}});p.code=generateHal(p.mcu);
 assert.throws(()=>{const s=new SimulationSession(p,{print(){},warn(){}});for(let t=10;t<=50;t+=10)s.tick(t);},/ARM GCC 시뮬레이터로 실행하세요/);
});
