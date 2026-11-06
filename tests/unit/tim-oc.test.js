// TIM Output Compare CHn and Counter Mode (CubeMX): the Pinout configuration, the generated MX_TIMx_Init /
// HAL_TIM_OC_Start, and .ioc import as CubeMX writes it (keys with escaped spaces, OCMode_n missing = Frozen).
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,projectForBoard} from '../../src/project.js';
import {validateMcu,generateHal,importIoc,configProblems,TIM_OC_MODES} from '../../src/mcu-config.js';
import {timerChannelsField,counterModeField,compareMatches,timerCycle} from '../../src/timer-ui.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
const oc=(base,tim={},nvic=false)=>{const m=structuredClone(base.mcu);m.pins.PA0=pin('TIM2_CH1');m.pins.PA1=pin('TIM2_CH2');m.peripherals.TIM2={enabled:true,prescaler:8399,period:9999,pulse:5000,mode:'oc',...tim};if(nvic)m.nvic.TIM2_IRQn={enabled:true,priority:0};return m;};

test('Output Compare: validated per channel (Frozen default not kept), generated with HAL_TIM_OC_* on both families',()=>{
 for(const base of [blankProject(),projectForBoard('nucleo-f103rb')]){
  const v=validateMcu(oc(base,{channels:{CH1:{ocMode:'TIMING'},CH2:{ocMode:'TOGGLE',pulse:2500,polarity:'LOW'}}}));
  assert.equal(v.peripherals.TIM2.mode,'oc');
  assert.deepEqual(v.peripherals.TIM2.channels,{CH2:{ocMode:'TOGGLE',pulse:2500,polarity:'LOW'}});
  const src=generateHal(v);
  assert.match(src,/HAL_TIM_OC_Init\(&htim2\);\s*TIM_OC_InitTypeDef channel = \{0\};\s*channel\.OCMode = TIM_OCMODE_TIMING;\s*channel\.OCPolarity = TIM_OCPOLARITY_HIGH;\s*channel\.Pulse = 5000;\s*channel\.OCFastMode = TIM_OCFAST_DISABLE;/);
  assert.match(src,/channel\.OCMode = TIM_OCMODE_TOGGLE;\s*channel\.OCPolarity = TIM_OCPOLARITY_LOW;\s*channel\.Pulse = 2500;\s*HAL_TIM_OC_ConfigChannel\(&htim2, &channel, TIM_CHANNEL_2\);/);
  assert.match(src,/HAL_TIM_OC_Start\(&htim2, TIM_CHANNEL_1\);/);assert.doesNotMatch(src,/HAL_TIM_OC_DelayElapsedCallback/);
  const it=generateHal(validateMcu(oc(base,{},true)));
  assert.match(it,/HAL_TIM_OC_Start_IT\(&htim2, TIM_CHANNEL_2\);/);assert.match(it,/void HAL_TIM_OC_DelayElapsedCallback\(TIM_HandleTypeDef \*htim\)/);
 }
 assert.throws(()=>validateMcu(oc(blankProject(),{channels:{CH1:{ocMode:'PWM1'}}})),/TIMING \/ ACTIVE/);
 assert.throws(()=>validateMcu(oc(blankProject(),{mode:'pwm',channels:{CH1:{ocMode:'TOGGLE'}}})),/PWM1 \/ PWM2/);
 const none=oc(blankProject());delete none.pins.PA0;delete none.pins.PA1;assert.ok(configProblems(none).some(e=>/TIM2: 채널 핀/.test(e)));
});

test('Counter Mode: only non-Up kept and generated; the encoder must count Up',()=>{
 for(const mode of ['DOWN','CENTERALIGNED1','CENTERALIGNED2','CENTERALIGNED3']){
  const v=validateMcu(oc(blankProject(),{mode:'base',counterMode:mode}));assert.equal(v.peripherals.TIM2.counterMode,mode);
  assert.match(generateHal(v),new RegExp(`htim2\\.Init\\.CounterMode = TIM_COUNTERMODE_${mode};`));
 }
 assert.equal(validateMcu(oc(blankProject(),{counterMode:'UP'})).peripherals.TIM2.counterMode,undefined);
 assert.match(generateHal(validateMcu(oc(blankProject()))),/CounterMode = TIM_COUNTERMODE_UP;/);
 assert.throws(()=>validateMcu(oc(blankProject(),{counterMode:'SIDEWAYS'})),/UP \/ DOWN/);
 assert.throws(()=>validateMcu(oc(blankProject(),{mode:'encoder',prescaler:0,counterMode:'DOWN'})),/엔코더 모드에서는 Counter Mode/);
});

test('.ioc as CubeMX writes it: Output Compare channels, OCMode_n (missing = Frozen), CounterMode; escaped PWM keys too',()=>{
 const head='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nMcu.IP0=TIM2\nPA0-WKUP.Signal=S_TIM2_CH1\nPA1.Signal=S_TIM2_CH2\nTIM2.Prescaler=8399\nTIM2.Period=9999\n';
 const ioc=head+[
  'TIM2.Channel-Output\\ Compare1\\ CH1=TIM_CHANNEL_1','TIM2.Channel-Output\\ Compare2\\ CH2=TIM_CHANNEL_2',
  'TIM2.CounterMode=TIM_COUNTERMODE_CENTERALIGNED1','TIM2.OCMode_2=TIM_OCMODE_TOGGLE','TIM2.OCPolarity_2=TIM_OCPOLARITY_LOW',
  'TIM2.Pulse-Output\\ Compare1\\ CH1=1000','TIM2.Pulse-Output\\ Compare2\\ CH2=3000',
  'TIM2.IPParameters=Channel-Output Compare1 CH1,Channel-Output Compare2 CH2,Prescaler,Period,CounterMode,OCMode_2,Pulse-Output Compare1 CH1,Pulse-Output Compare2 CH2,OCPolarity_2'].join('\n');
 const t=validateMcu(importIoc(ioc).config).peripherals.TIM2;
 assert.equal(t.mode,'oc');assert.equal(t.counterMode,'CENTERALIGNED1');assert.equal(t.pulse,1000);
 assert.deepEqual(t.channels,{CH2:{ocMode:'TOGGLE',pulse:3000,polarity:'LOW'}},'CH1 has no OCMode_1: Frozen');
 // The 1.24.0 PWM channel keys, written with CubeMX's escaped spaces.
 const pwm=head+['TIM2.Channel-PWM\\ Generation1\\ CH1=TIM_CHANNEL_1','TIM2.Channel-PWM\\ Generation2\\ CH2=TIM_CHANNEL_2','TIM2.Pulse-PWM\\ Generation1\\ CH1=250','TIM2.Pulse-PWM\\ Generation2\\ CH2=750','TIM2.OCMode_PWM-PWM\\ Generation2\\ CH2=TIM_OCMODE_PWM2',
  'TIM2.IPParameters=Channel-PWM Generation1 CH1,Channel-PWM Generation2 CH2,Pulse-PWM Generation1 CH1,Pulse-PWM Generation2 CH2,OCMode_PWM-PWM Generation2 CH2'].join('\n');
 const w=validateMcu(importIoc(pwm).config).peripherals.TIM2;
 assert.equal(w.mode,'pwm');assert.equal(w.counterMode,undefined);assert.deepEqual(w.channels,{CH2:{pulse:750,ocMode:'PWM2'}});
});

test('Pinout card: Counter Mode select (not for the encoder), OC channel modes and what they do on the pin',()=>{
 const m=validateMcu(oc(blankProject(),{prescaler:15999,period:499,pulse:100,channels:{CH2:{ocMode:'TOGGLE'}}}));m.timerClockHz=16000000;
 assert.match(counterModeField('TIM2',m.peripherals.TIM2),/data-timer-counter="TIM2"[\s\S]*Center Aligned mode3/);
 assert.equal(counterModeField('TIM2',{mode:'encoder'}),'');
 const html=timerChannelsField('TIM2',m.peripherals.TIM2,m,4294967295);
 assert.match(html,/Output Compare CH1 · PA0[\s\S]*Frozen \(used for Timing base\)[\s\S]*핀 출력은 바뀌지 않습니다/);
 assert.match(html,/Output Compare CH2 · PA1[\s\S]*CCR 일치 2 Hz · 핀 토글 → 1 Hz 사각파/);
 assert.equal((html.match(/<option value=/g)||[]).length,2*(TIM_OC_MODES.length+2));
 assert.equal(timerCycle({period:499}),500);assert.equal(timerCycle({period:499,counterMode:'CENTERALIGNED2'}),998);
 assert.equal(compareMatches({period:499,counterMode:'CENTERALIGNED1'},100),2);assert.equal(compareMatches({period:499},600),0);
});
