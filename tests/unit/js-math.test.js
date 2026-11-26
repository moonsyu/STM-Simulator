// The Rust side's own Math.hypot (jsmath.rs hypot_fast, used where it is asked hundreds of thousands of times) must
// give the engine's answer to the last digit (feature 62: the numbers of moved code stay the same).
import test from 'node:test';
import assert from 'node:assert/strict';
import {rustNumber} from '../../src/rust-core.js';

test('hypot_fast is Math.hypot',()=>{
 const fast=rustNumber('hypot_fast');let seed=12345;
 const random=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
 const values=[0,-0,1,-1,14,7.5,1e-300,1e300,5e-324,1.7976931348623157e308,NaN,Infinity,-Infinity,0.1,3,4];
 for(const a of values)for(const b of values)assert.ok(Object.is(fast(a,b),Math.hypot(a,b)),`${a}, ${b}`);
 let different=0;
 for(let i=0;i<400000;i++){
  const scale=10**Math.floor(random()*8-3),a=(random()-.5)*scale*2000,b=(random()-.5)*scale*2000;
  if(!Object.is(fast(a,b),Math.hypot(a,b))&&different++<5)assert.fail(`${a}, ${b}: ${fast(a,b)} / ${Math.hypot(a,b)}`);
 }
 // Distances between holes and terminals: multiples of the 14-unit pitch and small offsets.
 for(let i=0;i<200000;i++){const a=Math.round(random()*200-100)*14+random()*16-8,b=Math.round(random()*200-100)*14+random()*16-8;assert.ok(Object.is(fast(a,b),Math.hypot(a,b)),`${a}, ${b}`);}
});
