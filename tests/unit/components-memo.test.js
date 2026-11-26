// components.js keeps what the Rust side says of a part's terminals until the part changes (feature 62): the answer
// must follow every change of the part, and what a caller gets is its own copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nominalTerminals,localTerminals,terminalKeys,pluggedKeys} from '../../src/components.js';

test('terminals follow the part as it is moved, turned, resized and retyped',()=>{
 const p={id:'r1',type:'resistor',x:100,y:50,rotation:0,span:42};
 assert.deepEqual(nominalTerminals(p),[{key:'a',x:79,y:50},{key:'b',x:121,y:50}]);
 p.x=200;assert.deepEqual(nominalTerminals(p).map(t=>t.x),[179,221]);
 p.rotation=90;assert.deepEqual(nominalTerminals(p).map(t=>[Math.round(t.x),Math.round(t.y)]),[[200,29],[200,71]]);
 p.span=70;assert.deepEqual(localTerminals(p).map(t=>t.x),[-35,35]);
 p.scale=2;assert.deepEqual(localTerminals(p).map(t=>t.x),[-70,70]);
 p.type='button';assert.deepEqual(terminalKeys(p),['a','b','c','d']);
 p.electricalPins=['a','c'];assert.equal(terminalKeys(p),p.electricalPins);assert.deepEqual(pluggedKeys(p),['a','c']);
});
test('a caller may change what it was given',()=>{
 const p={id:'r1',type:'resistor',x:0,y:0,rotation:0,span:42};
 const first=nominalTerminals(p);first[0].x=999;first.push({key:'z'});
 assert.deepEqual(nominalTerminals(p),[{key:'a',x:-21,y:0},{key:'b',x:21,y:0}]);
 const keys=terminalKeys(p);keys.push('z');assert.deepEqual(terminalKeys(p),['a','b']);
});
