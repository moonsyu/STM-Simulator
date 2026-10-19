import test from 'node:test';
import assert from 'node:assert/strict';
import {roundedWirePath} from '../src/wire-path.js';
import {renderWires,route} from '../src/render.js';
import {wirePoints} from '../src/circuit-edit.js';
import {boardPin} from '../src/pins.js';

test('wire corners round inside adjacent segments and retain exact endpoints',()=>{
 assert.equal(roundedWirePath([{x:0,y:0},{x:30,y:0},{x:30,y:40},{x:80,y:40}]),'M0 0 L24 0 Q30 0 30 6 L30 34 Q30 40 36 40 L80 40');
 assert.equal(roundedWirePath([{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:4,y:2}],100),'M0 0 L1 0 Q2 0 2 1 L2 1 Q2 2 3 2 L4 2');
});
test('duplicate, straight and reversing wire segments stay finite and uncurved',()=>{
 const points=[{x:-20,y:-40},{x:-20,y:-40},{x:0,y:-40},{x:10,y:-40},{x:0,y:-40}];
 assert.equal(roundedWirePath(points),'M-20 -40 L0 -40 L10 -40 L0 -40');
 assert.equal(roundedWirePath([{x:1,y:1},{x:1,y:1}]),'M1 1');
 assert.equal(roundedWirePath([{x:0,y:0},{x:10,y:10},{x:20,y:20}]),'M0 0 L10 10 L20 20');
});
test('manual bends are not mutated, removed or clamped to a workspace boundary',()=>{
 const points=[{x:-20000,y:5},{x:-19980,y:25},{x:30000,y:-8000}],before=structuredClone(points),path=roundedWirePath(points);
 assert.deepEqual(points,before);assert.match(path,/^M-20000 5 /);assert.match(path,/Q-19980 25 /);assert.match(path,/ L30000 -8000$/);
 assert.equal(roundedWirePath(points,0),'M-20000 5 L-19980 25 L30000 -8000');
 assert.equal(roundedWirePath(points,NaN),roundedWirePath(points,0));
});
test('invalid routes cannot emit malformed SVG path coordinates',()=>{
 for(const points of [null,{},[],[null],[{x:NaN,y:1}],[{x:0,y:0},{x:1,y:Infinity}],[{x:'1',y:0}]])assert.equal(roundedWirePath(points),'');
 assert.doesNotMatch(roundedWirePath([{x:-1e308,y:0},{x:1e308,y:1},{x:1e308,y:2}]),/NaN|Infinity/);
});
test('wire hit target, visible line and selection use the same rounded stored route',()=>{
 const project={components:[],wires:[{id:'manual',from:boardPin('PA5'),to:'bb:a:1',color:'#2786d7',points:[{x:500,y:350},{x:500,y:128}]}]},before=structuredClone(project);
 const expected=roundedWirePath(wirePoints(project,project.wires[0])),svg=renderWires(project,{type:'wire',id:'manual'});
 const paths=[...svg.matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(paths.length,3);assert.ok(paths.every(d=>d===expected));assert.match(svg,/wire-selected/);assert.match(svg,/class="wire-hit"/);assert.deepEqual(project,before);
 const a={x:20,y:30},b={x:100,y:80},mid=20+80*.47;
 assert.equal(route(a,b),roundedWirePath([a,{x:mid,y:30},{x:mid,y:80},b]));
});
