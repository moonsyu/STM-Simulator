// The nets of a circuit are reused between solves; any change to wires, mounts, switches or pressed buttons is seen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {solveCircuit} from '../../src/engine.js';
import {projectForBoard} from '../../src/project.js';

test('a wire added, moved or removed between two solves of the same project changes the result',()=>{
 const p=projectForBoard('nucleo-f103rb');p.surfaces={board:{hidden:false},breadboard:{hidden:true}};p.components=[];p.wires=[];
 const pa0=()=>solveCircuit(p,{PA0:{mode:'INPUT'}},{}).voltage('signal:PA0');
 assert.equal(pa0(),null,'floating');
 p.wires.push({id:'w1',from:'board:CN7:28',to:'board:CN7:16',color:'#f00'});assert.ok(Math.abs(pa0()-3.3)<.01,'tied to 3V3');
 p.wires[0].to='board:CN7:20';assert.ok(Math.abs(pa0())<.01,'moved to GND');
 p.wires.length=0;assert.equal(pa0(),null,'removed');
});
test('pressing the board USER button is a different circuit from not pressing it',()=>{
 const p=projectForBoard('nucleo-f103rb');p.components=[];p.wires=[];
 const pc13=pressed=>solveCircuit(p,{PC13:{mode:'INPUT'}},pressed).voltage('signal:PC13');
 const up=pc13({}),down=pc13({USER:true}),again=pc13({});
 assert.ok(up>3,'pulled up');assert.ok(down<.5,'pressed');assert.equal(again,up);
});
