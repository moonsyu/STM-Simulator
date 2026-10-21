import test from 'node:test';
import assert from 'node:assert/strict';
import {endpointBlocked,endpointAt,moveWireEnd} from '../../src/wire-ends.js';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,validateProject} from '../../src/project.js';
import {endpointInfo,boardPin} from '../../src/pins.js';
import {attachments} from '../../src/components.js';

const example=()=>validateProject(applyHalExample(blankProject(),'blink'));

test('a hole, pin or part terminal holds one wire end; part leads also fill their hole',()=>{
  const p=example(),w=p.wires[0];
  assert.match(endpointBlocked(p,w.from),/이미 배선이 연결된 칸/);
  assert.match(endpointBlocked(p,w.to),/이미 배선이 연결된 칸/);
  assert.equal(endpointBlocked(p,w.from,{ignoreWire:w.id}),null,'the wire being moved does not block itself');
  const lead=Object.values(attachments(p.components.find(c=>c.id==='led1')))[0];
  assert.match(endpointBlocked(p,lead),/부품 다리가 꽂힌 구멍/);
  const free=boardPin('PC10');
  assert.ok(!p.wires.some(x=>x.from===free||x.to===free));
  assert.equal(endpointBlocked(p,free),null);
});

test('a wire end moves to a free hole or pin and keeps its other end, colour and bend points',()=>{
  const p=example(),w=p.wires[0],other=w.to,before={...w};
  const free=boardPin('PC10'),info=endpointInfo(free,p.components,p.surfaces);
  assert.equal(endpointAt(p,{x:info.x+2,y:info.y-1}),free,'the nearest endpoint under the pointer');
  assert.equal(endpointAt(p,{x:-500,y:-500}),null);
  assert.equal(moveWireEnd(p,w.id,'from',free),true);
  assert.equal(w.from,free);assert.equal(w.to,other);assert.equal(w.color,before.color);assert.deepEqual(w.points,before.points);
  assert.doesNotThrow(()=>validateProject(p));
  assert.equal(moveWireEnd(p,w.id,'from',free),false,'dropping on the same place changes nothing');
});

test('moving a wire end onto a used hole, a part lead or its own other end is refused unchanged',()=>{
  const p=example(),[a,b]=p.wires,from=a.from;
  assert.throws(()=>moveWireEnd(p,a.id,'from',b.to),/이미 배선이 연결된 칸/);
  assert.throws(()=>moveWireEnd(p,a.id,'from',a.to),/양 끝을 같은 칸/);
  const lead=Object.values(attachments(p.components.find(c=>c.id==='led1')))[0];
  assert.throws(()=>moveWireEnd(p,a.id,'to',lead),/부품 다리/);
  assert.throws(()=>moveWireEnd(p,a.id,'from',null),/핀 또는 빵판 구멍 위/);
  assert.equal(a.from,from);
});
