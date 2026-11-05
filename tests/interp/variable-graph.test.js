// The interpreter session samples the plotted globals (ide.plots) every interval of simulation time, wherever the
// program is (inside HAL_Delay too), as STM Studio reads RAM: the lecture's "press the button to raise the value".
import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run,advance,pin} from './helpers.js';

test('the interpreter graphs globals over time: a counter, an array element, an expression; locals and unknown names are errors',()=>{
 const p=halProject({pins:{PC13:pin('GPIO_EXTI',{edge:'FALLING'})},nvic:{EXTI15_10_IRQn:{enabled:true,priority:0,sub:0}},
  globals:'volatile uint16_t value = 240;\nint samples[3] = {1, 2, 3};\nstruct Point { int x; };\nstruct Point point = {7};',
  init:'    int local = 5;\n    (void)local;',
  loop:'    value++;\n    HAL_Delay(100);',
  extra:'void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {\n    if (GPIO_Pin == GPIO_PIN_13) value += 10;\n}'});
 p.ide={breakpoints:[],watches:[],plots:['value','samples[2]','point.x','value * 2','local','nothing','samples']};
 const {s}=run(p);advance(s,1000,20);
 const by=name=>s.vars.series.find(x=>x.name===name);
 const value=by('value').points;
 assert.ok(value.length>=95&&value.length<=101,'about every 10 ms over 1 s: '+value.length);
 assert.ok(value.every((p,i)=>i===0||p[0]-value[i-1][0]>=10000),'samples are at least 10 ms apart');
 assert.ok(value.at(-1)[1]>=249&&value.at(-1)[1]<=251,'value++ every 100 ms from 240: '+value.at(-1)[1]);
 for(let i=1;i<value.length;i++)assert.ok(value[i][1]>=value[i-1][1],'never goes down');
 assert.equal(by('samples[2]').value,3);assert.equal(by('point.x').value,7);assert.equal(by('value * 2').value,by('value').value*2);
 assert.match(by('local').error,/정의되지 않은 이름: local/,'globals only, as STM Studio');assert.match(by('nothing').error,/nothing/);
 assert.match(by('samples').error,/숫자 하나/);
 // Pressing the USER button raises the value by 10, and the graph shows the step.
 const before=by('value').value;s.setPressed({USER:true});advance(s,1050,10);s.setPressed({});advance(s,1100,10);
 assert.ok(by('value').value>=before+10,`${before} → ${by('value').value}`);
 // A 1 ms interval samples ten times as often.
 s.vars.setInterval(1);const n=by('value').points.length;advance(s,1200,20);assert.ok(by('value').points.length-n>=90);
});
