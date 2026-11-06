// TIM Output Compare and Counter Mode on the built-in interpreter, with the code the Pinout generates: Toggle / Active
// on match drive the pin, HAL_TIM_OC_Start_IT calls HAL_TIM_OC_DelayElapsedCallback per match, and Down / Center
// Aligned counting change CNT, the direction flag, the update-event rate and center-aligned PWM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance,pin} from './helpers.js';

// 16 MHz / 16000 = 1 kHz: CNT steps every 1 ms.
const tim=(extra={},more={})=>halProject({pins:{PA5:pin('TIM2_CH1')},peripherals:{TIM2:{enabled:true,prescaler:15999,period:499,mode:'oc',...extra}},...more});
const level=s=>s.runtime.gpio.PA5;

test('Toggle on match: the pin is a square wave of half the match rate (500 ms period → 1 Hz)',()=>{
 const {s}=run(tim({channels:{CH1:{ocMode:'TOGGLE',pulse:100}}},{init:'  HAL_TIM_OC_Start(&htim2, TIM_CHANNEL_1);'}));
 assert.match(s.project.code,/channel\.OCMode = TIM_OCMODE_TOGGLE;[\s\S]*HAL_TIM_OC_ConfigChannel\(&htim2, &channel, TIM_CHANNEL_1\);/);
 advance(s,50);const g=level(s);
 if(g.pwm){assert.ok(Math.abs(g.pwm.frequency-1)<1e-6,`${g.pwm.frequency} Hz`);assert.equal(g.pwm.duty,.5);}
 else{let edges=0,last=g.value;for(let t=60;t<=4050;t+=10){advance(s,t);if(level(s).value!==last){edges++;last=level(s).value;}}assert.ok(edges>=7&&edges<=9,`${edges} edges in 4 s`);}
});

test('Active level on match: low until CNT = CCR (100 ms), then high; LOW polarity inverts it; Forced Active is immediate',()=>{
 const {s}=run(tim({channels:{CH1:{ocMode:'ACTIVE',pulse:100}}},{init:'  HAL_TIM_OC_Start(&htim2, TIM_CHANNEL_1);'}));
 advance(s,90);assert.equal(level(s).value,0);advance(s,120);assert.equal(level(s).value,3.3);advance(s,700);assert.equal(level(s).value,3.3,'stays active');
 const low=run(tim({channels:{CH1:{ocMode:'ACTIVE',pulse:100,polarity:'LOW'}}},{init:'  HAL_TIM_OC_Start(&htim2, TIM_CHANNEL_1);'})).s;
 advance(low,90);assert.equal(level(low).value,3.3);advance(low,120);assert.equal(level(low).value,0);
 const forced=run(tim({channels:{CH1:{ocMode:'FORCED_ACTIVE',pulse:400}}},{init:'  HAL_TIM_OC_Start(&htim2, TIM_CHANNEL_1);'})).s;
 advance(forced,5);assert.equal(level(forced).value,3.3);
});

test('HAL_TIM_OC_Start_IT (Frozen): HAL_TIM_OC_DelayElapsedCallback once per match with the active channel; the pin stays',()=>{
 const p=tim({channels:{CH1:{pulse:100}}},{nvic:{TIM2_IRQn:{enabled:true,priority:0}},globals:'volatile uint32_t hits;',init:'  HAL_TIM_OC_Start_IT(&htim2, TIM_CHANNEL_1);',
  extra:'void HAL_TIM_OC_DelayElapsedCallback(TIM_HandleTypeDef *htim){ if(htim->Channel==HAL_TIM_ACTIVE_CHANNEL_1){ hits++; printf("oc %lu cnt=%lu\\n", hits, __HAL_TIM_GET_COUNTER(htim)); } }\nvoid TIM2_IRQHandler(void){ HAL_TIM_IRQHandler(&htim2); }'});
 assert.match(p.code,/channel\.OCMode = TIM_OCMODE_TIMING;/);
 const {s,output}=run(p);advance(s,2050,10);
 assert.deepEqual(output.map(x=>x.replace(/cnt=\d+/,'')),['oc 1 ','oc 2 ','oc 3 ','oc 4 '],output.join('|'));
 for(const x of output)assert.ok(Math.abs(Number(/cnt=(\d+)/.exec(x)[1])-100)<=2,x);
 assert.equal(level(s).value,0);
});

test('Counter Mode Down: CNT counts ARR → 0 and reports counting down; Center Aligned: 0 → ARR → 0 with an update every ARR ticks',()=>{
 const read='  HAL_Delay(100); printf("cnt=%lu down=%lu\\n", __HAL_TIM_GET_COUNTER(&htim2), __HAL_TIM_IS_TIM_COUNTING_DOWN(&htim2));';
 const down=tim({mode:'base',counterMode:'DOWN'},{init:'  HAL_TIM_Base_Start(&htim2);\n'+read,loop:''});
 assert.match(down.code,/htim2\.Init\.CounterMode = TIM_COUNTERMODE_DOWN;/);
 const d=run(down);advance(d.s,150);const [,cnt,dir]=/cnt=(\d+) down=(\d)/.exec(d.output[0]);assert.ok(Math.abs(Number(cnt)-399)<=2,d.output[0]);assert.equal(dir,'1');
 const center=tim({mode:'base',counterMode:'CENTERALIGNED1'},{init:'  HAL_TIM_Base_Start(&htim2);\n  HAL_Delay(600); printf("cnt=%lu down=%lu\\n", __HAL_TIM_GET_COUNTER(&htim2), __HAL_TIM_IS_TIM_COUNTING_DOWN(&htim2));',loop:''});
 const c=run(center);advance(c.s,650);const [,ccnt,cdir]=/cnt=(\d+) down=(\d)/.exec(c.output[0]);assert.ok(Math.abs(Number(ccnt)-398)<=2,c.output[0]);assert.equal(cdir,'1');
 const it=tim({mode:'base',counterMode:'CENTERALIGNED1'},{nvic:{TIM2_IRQn:{enabled:true,priority:0}},globals:'volatile uint32_t n;',init:'  HAL_TIM_Base_Start_IT(&htim2);',extra:'void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim){ n++; printf("up %lu\\n", n); }\nvoid TIM2_IRQHandler(void){ HAL_TIM_IRQHandler(&htim2); }'});
 const u=run(it);advance(u.s,2050,10);assert.equal(u.output.length,4,u.output.join('|'));
});

test('Center-aligned PWM: timer clock / 2·ARR (1 MHz / 1998) with duty CCR / ARR',()=>{
 const p=halProject({pins:{PA5:pin('TIM2_CH1')},peripherals:{TIM2:{enabled:true,prescaler:15,period:999,pulse:250,mode:'pwm',counterMode:'CENTERALIGNED1'}},init:'  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);'});
 const {s}=run(p);advance(s,20);const g=level(s);
 if(g.pwm){assert.ok(Math.abs(g.pwm.frequency-1e6/1998)<1e-6,`${g.pwm.frequency} Hz`);assert.ok(Math.abs(g.pwm.duty-250/999)<1e-3,`duty ${g.pwm.duty}`);}
 else assert.ok(Math.abs(s.runtime.pwmFrequency.get("PA5")-1e6/1998)<1e-6);
});
