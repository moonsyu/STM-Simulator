// Feature 63 ③ for the modules moved to Rust (feature 62): the answers their JavaScript gave before the move
// (tests/fixtures/moved/*.json, recorded from the release named in each file) against what the same exports answer
// now — values, the order of the keys, error messages, and what a function left in the arguments it changes.
// In the recordings undefined, NaN and Infinity are the texts '<undefined>', '<NaN>' and '<Infinity>'; `fn` is an
// export or a path from one ('FAMILIES.STM32F446RE.timerMax'); the argument '<number-reader>' is a reader of .ioc
// numbers, and the values it was asked for (`calls`) are part of the answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const dir=new URL('../fixtures/moved/',import.meta.url);
const plain=v=>v===undefined?'<undefined>':typeof v==='number'&&!Number.isFinite(v)?`<${v}>`:typeof v==='function'?'<function>':Array.isArray(v)?v.map(plain):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,plain(x)])):v;
const SPECIAL={'<undefined>':undefined,'<NaN>':NaN,'<Infinity>':Infinity,'<-Infinity>':-Infinity};
const real=v=>typeof v==='string'&&Object.hasOwn(SPECIAL,v)?SPECIAL[v]:Array.isArray(v)?v.map(real):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,real(x)])):v;

for(const name of readdirSync(dir).filter(f=>f.endsWith('.json')).sort()){
 const {from,cases}=JSON.parse(readFileSync(new URL(name,dir),'utf8'));
 test(`${name}: the same answers as ${from}`,async()=>{
  assert.ok(cases.length>0);
  const modules={};
  for(const c of cases){
   const m=modules[c.file]??=await import(`../../src/${c.file}`);
   if(c.data!==undefined){assert.equal(JSON.stringify(plain(m[c.data])),JSON.stringify(c.value),`${c.file} ${c.data}`);continue;}
   const calls=[],reader=(raw,fallback)=>{calls.push([raw,fallback]);if(raw===undefined)return fallback;const n=Number(raw);return Number.isInteger(n)?n:fallback;};
   const args=real(c.args).map(a=>a==='<number-reader>'?reader:a),before=JSON.stringify(plain(args));let now;
   try{now={value:plain(c.fn.split('.').reduce((at,key)=>at[key],m)(...args))};}catch(e){now={error:e.message};}
   const after=JSON.stringify(plain(args));if(after!==before)now.after=JSON.parse(after);
   if(calls.length)now.calls=plain(calls);
   const was='error' in c?{error:c.error}:{value:c.value};if('after' in c)was.after=c.after;if('calls' in c)was.calls=c.calls;
   assert.equal(JSON.stringify(now),JSON.stringify(was),`${c.file} ${c.fn}(${JSON.stringify(c.args).slice(0,300)})`);
  }
 });
}
