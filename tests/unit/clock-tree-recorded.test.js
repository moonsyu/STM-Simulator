// Feature 63 ③ for the move of the clock tree to Rust (feature 62, 1.63.3): the answers the JavaScript of 1.63.2 gave
// (tests/fixtures/clock-tree-1.63.2.json, recorded before the move) against what src/clock-tree.js answers now —
// values, key order and error messages. NaN and Infinity were recorded as null (JSON), which is also what the Rust
// side answers for them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as clock from '../../src/clock-tree.js';

const {cases}=JSON.parse(readFileSync(new URL('../fixtures/clock-tree-1.63.2.json',import.meta.url),'utf8'));
const plain=v=>v===undefined?null:typeof v==='number'&&!Number.isFinite(v)?null:Array.isArray(v)?v.map(plain):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)])):v;

test('the clock tree answers what the JavaScript of 1.63.2 answered, case by case',()=>{
 assert.ok(cases.length>700,`${cases.length} recorded cases`);
 const seen=new Set();
 for(const c of cases){
  seen.add(c.fn);let now;
  try{now={value:plain(clock[c.fn](...c.args))};}catch(e){now={error:e.message};}
  const was='error' in c?{error:c.error}:{value:c.value??null};
  // The same text: values, the order of the keys, and messages.
  assert.equal(JSON.stringify(now),JSON.stringify(was),`${c.fn}(${JSON.stringify(c.args)})`);
 }
 assert.deepEqual([...seen].sort(),['adcClockProblem','clockFrequencies','clockTreeFromIoc','clockTreeProblems','defaultClockTree','flashLatency','needsOverDrive','treeFromTimerHz','validateClockTree']);
});

test('the tables keep their key order',()=>{
 assert.deepEqual(Object.keys(clock.HSI_HZ),['STM32F446RE','STM32F103RB']);
 assert.deepEqual(Object.keys(clock.LIMITS),['STM32F446RE','STM32F103RB']);
 assert.deepEqual(Object.keys(clock.LIMITS.STM32F446RE),['pllM','pllN','pllQ','vcoIn','vco','pll','sysclk','hclk','pclk1','pclk2','adc']);
 assert.deepEqual(Object.keys(clock.LIMITS.STM32F103RB),['pllMul','pll','sysclk','hclk','pclk1','pclk2','adc']);
});
