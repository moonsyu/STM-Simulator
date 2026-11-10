// The NRST header pin (CN6-3) wired to a button: pressing it pulls the line LOW against the MCU's pull-up and the
// program restarts; RCC_FLAG_PINRST is set without a software or watchdog cause.
import test from 'node:test';
import assert from 'node:assert/strict';
import {run,advance} from './helpers.js';
import {halExample} from '../../src/hal-examples.js';
import {generateHal} from '../../src/mcu-config.js';

test('a button from NRST to GND resets the running program (interpreter)',()=>{
 const p=halExample('button');
 // The example's button wire (PA10, CN10-33) moves to the RESET pin; the pin itself is no longer a GPIO input.
 p.wires.find(w=>w.from==='board:CN10:33').from='board:CN6:3';delete p.mcu.pins.PA10;
 p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  printf("boot pin=%d sft=%d por=%d\\n", (int)__HAL_RCC_GET_FLAG(RCC_FLAG_PINRST), (int)__HAL_RCC_GET_FLAG(RCC_FLAG_SFTRST), (int)__HAL_RCC_GET_FLAG(RCC_FLAG_PORRST));\n  __HAL_RCC_CLEAR_RESET_FLAGS();');
 const {s,output,warnings}=run(p);advance(s,50,10);
 assert.deepEqual(output,['boot pin=1 sft=0 por=1']);assert.ok(Math.abs(s.result.voltage('signal:NRST')-3.3)<.05,'pulled up while released');
 s.setPressed({b1:true});advance(s,80,10);
 assert.ok(s.result.voltage('signal:NRST')<.1);assert.match(warnings[0],/^\[NRST\] 리셋 핀이 LOW입니다/);assert.equal(warnings.length,1,'one notice per press');
 s.setPressed({});advance(s,120,10);
 assert.equal(output.at(-1),'boot pin=1 sft=0 por=0');assert.ok(output.length>=2);
 const n=output.length;advance(s,300,10);assert.equal(output.length,n,'runs on after release');
});

test('an unwired NRST pin changes nothing',()=>{
 const {s,output,warnings}=run(halExample('blink'));advance(s,600,10);
 assert.deepEqual(warnings,[]);assert.ok(output.length>=1);assert.equal(s.result.voltage('signal:NRST')??null,null);
});
