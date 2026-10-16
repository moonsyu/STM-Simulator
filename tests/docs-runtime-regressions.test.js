import test from 'node:test';
import assert from 'node:assert/strict';
import {apply,execute} from '../scripts/docs-audit/runtime.mjs';
import {assess} from '../scripts/docs-audit/oracles.mjs';
import {inlineStatements} from '../src/c-inline.js';
import {blankProject} from '../src/project.js';

test('inline return values cannot collide with parameters, locals or caller identifiers',()=>{
 const helpers='int twice(int value){return value*2;} int next(int done){int value=done+1;return value;}';
 const source=inlineStatements('int audit_1_return=7; printf("%d %d %d",twice(21),next(41),audit_1_return);',helpers,'audit_');
 const p=blankProject();p.code='int main(void){'+source+' while(1){HAL_Delay(1);}}';
 const e=execute(p,{end:100,stimulus:false});assert.equal(e.error,null);assert.equal(e.printed[0].text,'42 42 7');
});

for(const type of ['ref_button_2','ref_button_module_3','encoder','ref_encoder_module_5','ref_ds18b20_to92_3','ref_ds18b20_probe_3','ref_sd_storage_board']){
 test(type+' Docs runs the wired device and responds to changing input',()=>{
  const e=execute(apply(type).project,{end:5500}),result=assess(type,e);
  assert.equal(result.passed,true,JSON.stringify(result.checks.filter(c=>!c.passed)));
 });
}

for(const type of ['capacitor','ref_capacitor_ceramic_2','ref_capacitor_electrolytic_2']){
 test(type+' PWM Init card initializes PWM and the full example charges the capacitor',()=>{
  const e=execute(apply(type,'HAL_TIM_PWM_Init').project,{end:1500});
  assert.ok(e.calls.HAL_TIM_PWM_Init?.returns['0']>0,JSON.stringify(e.error||e.calls));
  assert.ok(e.frames.at(-1).timers.some(t=>t.kind==='PWM'));
  assert.equal(assess(type,execute(apply(type).project,{end:1500})).passed,true);
 });
}
