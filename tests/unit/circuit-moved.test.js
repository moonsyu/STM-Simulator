// Feature 63 ③ for the circuit solver moved to Rust (feature 62, circuit.rs): the solutions its JavaScript gave
// before the move (tests/fixtures/circuit/*.json, recorded from the release named in each file) against what
// solveCircuit answers now — every field of a solution, the voltage at every recorded probe (pins, holes, part
// terminals, signals), the root each probe is on, and the part terminals the nets know, in their order.
// In the recordings undefined, NaN and Infinity are the texts '<undefined>', '<NaN>' and '<Infinity>'.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {solveCircuit} from '../../src/engine.js';

const dir=new URL('../fixtures/circuit/',import.meta.url);
const plain=v=>v===undefined?'<undefined>':typeof v==='number'&&!Number.isFinite(v)?`<${v}>`:typeof v==='function'?'<function>':Array.isArray(v)?v.map(plain):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)])):v;
function seen(result,ids){
 const {uf,voltage,...rest}=result;
 return {keys:Object.keys(result),...plain(rest),volts:ids.map(id=>plain(voltage(id))),roots:ids.map(id=>uf.find(id)),parts_known:uf.parent instanceof Map?[...uf.parent.keys()].filter(k=>String(k).startsWith('part:')):'<no parent>'};
}
for(const name of readdirSync(dir).filter(f=>f.endsWith('.json')).sort()){
 const {from,cases}=JSON.parse(readFileSync(new URL(name,dir),'utf8'));
 test(`${name}: the same solutions as ${from}`,()=>{
  assert.ok(cases.length>0);
  for(const c of cases){
   let now;try{now=seen(solveCircuit(structuredClone(c.project),c.gpio,c.pressed,c.transient),c.ids);}catch(e){now={error:e.message};}
   assert.equal(JSON.stringify(now),JSON.stringify(c.answer),`${c.name} ${JSON.stringify(c.gpio).slice(0,200)}`);
  }
 });
}
