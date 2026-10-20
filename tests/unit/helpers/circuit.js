// Shared circuit fixtures for the unit suite. Every builder returns a fresh object.
import assert from 'node:assert/strict';
import {exampleProject,blankProject} from '../../../src/project.js';
import {boardPin} from '../../../src/pins.js';

export const GREEN='#23a68a',BLACK='#4e647b',RED='#dd654c';
export const wire=(id,from,to,color=GREEN,extra={})=>({id,from,to,color,...extra});

/** A project with the legacy NUCLEO board and the default breadboard both visible. */
export function boardProject(name='테스트 회로'){
  const p=exampleProject();p.name=name;p.components=[];p.wires=[];
  return p;
}
/** A project where both the board and the default breadboard are hidden (new-project default). */
export function emptyWorkspace(){return blankProject();}

/**
 * D13(PA5) -> row 8 -> resistor e8/f8 -> LED j8 (anode) / j12 (cathode) -> GND rail.
 * Mirrors the classic "blink" breadboard layout.
 */
export function ledCircuit({ohms=330,color='red',reversed=false}={}){
  const p=boardProject('LED');
  const led={id:'led1',name:'LED1',type:'led',color,x:872,y:254,rotation:90,span:56,attachA:'bb:j:8',attachB:'bb:j:12'};
  if(reversed)[led.attachA,led.attachB]=[led.attachB,led.attachA];
  p.components=[{id:'r1',name:'R1',type:'resistor',value:ohms,x:795,y:226,rotation:0,span:42,attachA:'bb:e:8',attachB:'bb:f:8'},led];
  p.wires=[wire('w1',boardPin('D13'),'bb:a:8'),wire('w2',boardPin('GND'),'rail:R:-:1',BLACK),wire('w3','rail:R:-:10','bb:h:12',BLACK)];
  return p;
}
/** D2(PA10) -> push button -> GND rail, with the button straddling the centre channel. */
export function buttonCircuit(){
  const p=boardProject('버튼');
  p.components=[{id:'b1',name:'SW1',type:'button',x:795,y:380,rotation:0,attachments:{a:'bb:e:18',b:'bb:f:18',c:'bb:e:20',d:'bb:f:20'}}];
  p.wires=[wire('w1',boardPin('D2'),'bb:a:18'),wire('w2',boardPin('GND'),'rail:R:-:1',BLACK),wire('w3','bb:j:18','rail:R:-:16',BLACK)];
  return p;
}
/** 3V3 -> R1 -> A0 -> R2 -> GND (two resistors wired directly by terminal). */
export function dividerCircuit(r1=10000,r2=10000){
  const p=boardProject('분압');
  p.components=[{id:'r1',name:'R1',type:'resistor',value:r1,x:900,y:700,rotation:0,span:42},{id:'r2',name:'R2',type:'resistor',value:r2,x:900,y:760,rotation:0,span:42}];
  p.wires=[wire('w1',boardPin('3V3'),'part:r1:a',RED),wire('w2','part:r1:b','part:r2:a'),wire('w3','part:r2:b',boardPin('GND'),BLACK),wire('w4',boardPin('A0'),'part:r1:b')];
  return p;
}
export function close(actual,expected,tolerance=1e-6,message=''){
  assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,`${message} expected ${expected} ±${tolerance}, got ${actual}`);
}
