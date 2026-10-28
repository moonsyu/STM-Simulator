import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {UnionFind,topology,solveCircuit,CircuitSimulation,digitalRead} from '../../src/engine.js';
import {PINS,HOLES,PIN_BY_ID,HOLE_BY_ID,GPIO_PINS,ALIASES,canonicalPin,boardPin,searchPins,endpointInfo,holeInfo,circuitHoles,breadboardHoles,breadboardPrefix,endpoints,BB} from '../../src/pins.js';
import {terminalKeys,attachments,nominalTerminals,assignAttachments,detachPart,normalizeAngle,rotatePoint,terminalLabel} from '../../src/components.js';
import {findMount,applyMount,occupiedHoles} from '../../src/placement.js';
import {selectedIds,isSelected,toggleSelection,wirePoints,boxSelection,insertWirePoint,connectedNet,copySelection,pasteSelection,moveSelection} from '../../src/circuit-edit.js';
import {circuitDiagnostics} from '../../src/circuit-diagnostics.js';
import {moveBreadboard,removeBreadboard} from '../../src/breadboards.js';
import {surfacePresent,showSurface,removeSurface} from '../../src/surfaces.js';
import {moveSurface} from '../../src/surface-move.js';
import {resizeObject,resizeFromHandle,resizeFrame} from '../../src/resize.js';
import {BOARD,MIN_SCALE,MAX_SCALE,validScale,matrixOf,inverse,multiply,vector,matrixFields,scaleFields,assignScale,surfacePoint,surfaceOrigin,scaleXOf,scaleYOf,partTransform} from '../../src/geometry.js';
import {validateProject} from '../../src/project.js';
import {boardProject,emptyWorkspace,ledCircuit,buttonCircuit,dividerCircuit,wire,close,BLACK,RED} from './helpers/circuit.js';

const HIGH={PA5:{mode:'OUTPUT',value:3.3}},LOW={PA5:{mode:'OUTPUT',value:0}};
const uid=(()=>{let n=0;return prefix=>`${prefix}new${++n}`;})();
const extraBoard=(id='bb1',extra={})=>({id,type:'breadboard',name:id.toUpperCase(),x:1400,y:400,rotation:0,...extra});

describe('UnionFind',()=>{
  test('unknown members are their own root and joins are transitive',()=>{
    const uf=new UnionFind();
    assert.equal(uf.find('x'),'x');
    uf.join('a','b');uf.join('c','d');assert.notEqual(uf.find('a'),uf.find('c'));
    uf.join('b','c');assert.equal(uf.find('a'),uf.find('d'));
  });
  test('joining a member with itself is harmless and paths compress',()=>{
    const uf=new UnionFind();uf.join('a','a');assert.equal(uf.find('a'),'a');
    for(let i=0;i<200;i++)uf.join(`n${i}`,`n${i+1}`);
    const root=uf.find('n0');assert.equal(uf.find('n200'),root);assert.equal(uf.parent.get('n0'),root);
  });
});

describe('pins and board connectors',()=>{
  test('NUCLEO-F446RE exposes 108 unique header pins and 400 breadboard holes',()=>{
    assert.equal(PINS.length,108);assert.equal(new Set(PINS.map(p=>p.id)).size,108);
    assert.equal(HOLES.length,400);assert.equal(new Set(HOLES.map(h=>h.id)).size,400);
    assert.equal(new Set(HOLES.map(h=>`${h.x},${h.y}`)).size,400,'no two holes overlap');
    assert.equal(PIN_BY_ID.size,108);assert.equal(HOLE_BY_ID.size,400);
  });
  test('Arduino aliases resolve to their STM32 port pins',()=>{
    assert.equal(canonicalPin('D13'),'PA5');assert.equal(canonicalPin('LED_BUILTIN'),'PA5');assert.equal(canonicalPin('USER_BUTTON'),'PC13');
    assert.equal(canonicalPin('A0'),'PA0');assert.equal(canonicalPin('D0'),'PA3');assert.equal(canonicalPin('D1'),'PA2');
    assert.equal(canonicalPin('PB7'),'PB7','already canonical');
    assert.ok(Object.isFrozen(ALIASES));
  });
  test('boardPin prefers the Arduino header label and falls back to the Morpho signal',()=>{
    assert.equal(boardPin('D13'),'board:CN5:6');
    assert.equal(PIN_BY_ID.get(boardPin('D13')).signal,'PA5');
    assert.equal(PIN_BY_ID.get(boardPin('PC13')).header,'CN7');
    assert.equal(PIN_BY_ID.get(boardPin('GND')).signal,'GND');
    assert.equal(boardPin('PZ99'),undefined);
  });
  test('GPIO list is sorted, unique and excludes power/NC pins',()=>{
    assert.deepEqual(GPIO_PINS,[...GPIO_PINS].sort());assert.equal(new Set(GPIO_PINS).size,GPIO_PINS.length);
    for(const pin of ['PA5','PC13','PB8','PH0'])assert.ok(GPIO_PINS.includes(pin),pin);
    for(const pin of ['GND','3V3','NC','VIN'])assert.ok(!GPIO_PINS.includes(pin),pin);
  });
  test('pin search is case/space-insensitive and prefers exact matches',()=>{
    const pa5=searchPins(' pa 5 ');assert.ok(pa5.length>=2);assert.ok(pa5.every(p=>p.signal==='PA5'));
    assert.ok(searchPins('CN7-1').some(p=>p.id==='board:CN7:1'));
    assert.ok(searchPins('PA1').every(p=>p.signal==='PA1'||p.label==='PA1'),'exact PA1 must not expand to PA10..PA15');
    assert.ok(searchPins('PB1').length>0);assert.deepEqual(searchPins(''),[]);
  });
  test('breadboard holes: rows of five on each side and four continuous rails',()=>{
    const row=HOLES.filter(h=>h.bus==='bb:L:8');assert.equal(row.length,5);assert.deepEqual(row.map(h=>h.id),['a','b','c','d','e'].map(c=>`bb:${c}:8`));
    assert.equal(HOLES.filter(h=>h.bus==='rail:L:+').length,25);
    assert.equal(HOLE_BY_ID.get('bb:e:8').y,BB.startY+7*BB.step);
    assert.equal(HOLE_BY_ID.get('bb:f:8').x-HOLE_BY_ID.get('bb:e:8').x,42,'centre channel spans three pitches');
  });
  test('endpoint info describes header pins, holes and part terminals',()=>{
    assert.match(endpointInfo('board:CN5:6').label,/CN5-6 · D13 \/ PA5/);
    assert.equal(endpointInfo('bb:a:1').label,'A1');
    const p=ledCircuit();const info=endpointInfo('part:led1:a',p.components);assert.match(info.label,/LED1 A \(\+\)/);
    const hole=HOLE_BY_ID.get('bb:j:8');assert.deepEqual([info.x,info.y],[hole.x,hole.y],'mounted leg reports hole position');
    assert.equal(endpointInfo('part:led1:z',p.components),null);assert.equal(endpointInfo('nowhere'),null);
  });
  test('hidden surfaces remove their connectors from the endpoint list',()=>{
    const ws=emptyWorkspace();
    assert.equal(endpointInfo('board:CN5:6',[],ws.surfaces),null);assert.equal(holeInfo('bb:a:1',[],ws.surfaces),null);
    assert.equal(circuitHoles([],ws.surfaces).length,0);assert.equal(endpoints([],ws.surfaces).length,0);
    assert.equal(endpoints([]).length,508);
  });
  test('surface offset and scale move every hole and pin consistently',()=>{
    const surfaces={breadboard:{x:BB.x+100,y:BB.y+50,scale:2}};
    const base=HOLE_BY_ID.get('bb:c:3'),moved=holeInfo('bb:c:3',[],surfaces);
    close(moved.x,BB.x+100+(base.x-BB.x)*2);close(moved.y,BB.y+50+(base.y-BB.y)*2);
  });
});

describe('extra breadboards',()=>{
  test('holes are namespaced, transformed and labelled with the board name',()=>{
    const board=extraBoard('bb1');const holes=breadboardHoles(board);
    assert.equal(holes.length,400);assert.ok(holes.every(h=>h.id.startsWith(breadboardPrefix('bb1'))));
    assert.match(holes[0].label,/^BB1 · /);
    assert.equal(breadboardHoles(board),holes,'cached while the board is unchanged');
    board.x+=10;const moved=breadboardHoles(board);assert.notEqual(moved,holes);close(moved[0].x,holes[0].x+10);
  });
  test('rotation by 90 degrees rotates the hole layout about the board centre',()=>{
    const a=breadboardHoles(extraBoard('r0')),b=breadboardHoles(extraBoard('r90',{rotation:90}));
    const dx=a[0].x-1400,dy=a[0].y-400;close(b[0].x-1400,-dy,1e-9);close(b[0].y-400,dx,1e-9);
  });
  test('rows and rails of an extra board connect internally but never to the default board',()=>{
    const p=boardProject();p.components=[extraBoard('bb1'),extraBoard('bb2',{x:2000})];const uf=topology(p),q=breadboardPrefix('bb1');
    assert.equal(uf.find(q+'bb:a:5'),uf.find(q+'bb:e:5'));assert.notEqual(uf.find(q+'bb:e:5'),uf.find(q+'bb:f:5'));
    assert.equal(uf.find(q+'rail:L:-:1'),uf.find(q+'rail:L:-:25'));
    assert.notEqual(uf.find(q+'bb:a:5'),uf.find('bb:a:5'));assert.notEqual(uf.find(q+'bb:a:5'),uf.find(breadboardPrefix('bb2')+'bb:a:5'));
  });
  test('an LED circuit built on an extra breadboard lights up',()=>{
    const p=boardProject(),q=breadboardPrefix('bb1');
    p.components=[extraBoard('bb1'),{id:'r1',name:'R1',type:'resistor',value:330,x:0,y:0,rotation:0,span:42,attachA:q+'bb:e:3',attachB:q+'bb:f:3'},{id:'led1',name:'LED1',type:'led',color:'green',x:0,y:0,rotation:0,span:42,attachA:q+'bb:j:3',attachB:q+'rail:R:-:2'}];
    p.wires=[wire('w1',boardPin('D13'),q+'bb:a:3'),wire('w2',boardPin('GND'),q+'rail:R:-:20',BLACK)];
    assert.doesNotThrow(()=>validateProject(p));
    const r=solveCircuit(p,HIGH);assert.equal(r.parts.led1.on,true);close(r.parts.led1.current,(3.3-2.1)/(330+40+12));
  });
  test('validateProject rejects more than eight extra breadboards and dangling board holes',()=>{
    const p=boardProject();p.components=Array.from({length:9},(_,i)=>extraBoard('bb'+i,{x:i*500}));
    assert.throws(()=>validateProject(p),/8개/);
    const q=boardProject();q.components=[{id:'r1',name:'R1',type:'resistor',value:100,x:0,y:0,rotation:0,span:42,attachA:breadboardPrefix('ghost')+'bb:a:1'}];
    assert.throws(()=>validateProject(q),/연결점/);
  });
});

describe('topology',()=>{
  test('default breadboard: five-hole strips, isolated centre channel, separate continuous rails',()=>{
    const uf=topology(boardProject());
    assert.equal(uf.find('bb:a:1'),uf.find('bb:e:1'));assert.notEqual(uf.find('bb:e:1'),uf.find('bb:f:1'));
    assert.equal(uf.find('bb:f:30'),uf.find('bb:j:30'));assert.notEqual(uf.find('bb:a:1'),uf.find('bb:a:2'));
    assert.equal(uf.find('rail:L:+:1'),uf.find('rail:L:+:25'));assert.notEqual(uf.find('rail:L:+:1'),uf.find('rail:L:-:1'));
    assert.notEqual(uf.find('rail:L:+:1'),uf.find('rail:R:+:1'));
  });
  test('header pins sharing a signal (and AGND) are one node; NC pins are isolated',()=>{
    const uf=topology(boardProject());
    assert.equal(uf.find(boardPin('D13')),uf.find('board:CN10:11'));
    const gnds=PINS.filter(p=>p.signal==='GND'||p.signal==='AGND');assert.ok(gnds.length>5);
    assert.equal(new Set(gnds.map(p=>uf.find(p.id))).size,1);
    const nc=PINS.filter(p=>p.signal==='NC');assert.equal(new Set(nc.map(p=>uf.find(p.id))).size,nc.length);
  });
  test('push button joins its legs in pairs and bridges them only when pressed',()=>{
    const p=buttonCircuit();let uf=topology(p);
    assert.equal(uf.find('part:b1:a'),uf.find('part:b1:c'));assert.equal(uf.find('part:b1:b'),uf.find('part:b1:d'));
    assert.notEqual(uf.find('part:b1:a'),uf.find('part:b1:b'));
    uf=topology(p,{b1:true});assert.equal(uf.find(boardPin('D2')),uf.find(boardPin('GND')));
  });
  test('slide switch connects COM to A or B according to position',()=>{
    const p=boardProject();p.components=[{id:'s1',name:'SW1',type:'slide',position:0,x:0,y:0,rotation:0}];
    assert.equal(topology(p).find('part:s1:p2'),topology(p).find('part:s1:p1'));
    p.components[0].position=1;const uf=topology(p);assert.equal(uf.find('part:s1:p2'),uf.find('part:s1:p3'));assert.notEqual(uf.find('part:s1:p2'),uf.find('part:s1:p1'));
  });
  test('hidden board contributes no header nodes',()=>{
    const uf=topology(emptyWorkspace());assert.notEqual(uf.find('board:CN5:6'),uf.find('signal:PA5'));
  });
});

describe('solveCircuit: LEDs and resistors',()=>{
  test('LED current follows (Vout - Vf) / (R + Rgpio + Rled)',()=>{
    const r=solveCircuit(ledCircuit(),HIGH);assert.equal(r.fault,false);assert.equal(r.parts.led1.on,true);
    close(r.parts.led1.current,(3.3-1.8)/(330+40+12));close(r.parts.r1.current,r.parts.led1.current,1e-9,'series current');
    assert.deepEqual(r.warnings,[]);
  });
  test('a PWM output lights an LED for its duty: the average of the high and low phases, not the average voltage',()=>{
    const full=(3.3-1.8)/(330+40+12),pwm=duty=>solveCircuit(ledCircuit(),{PA5:{mode:'OUTPUT',value:3.3*duty,pwm:{duty,frequency:500}}});
    for(const duty of [.1,.3,.5,.8]){const r=pwm(duty);assert.equal(r.parts.led1.on,true,String(duty));close(r.parts.led1.current,full*duty,1e-6,String(duty));}
    // Without the PWM mark the same average voltage stays below the forward voltage (an analog output).
    assert.equal(solveCircuit(ledCircuit(),{PA5:{mode:'OUTPUT',value:3.3*.3}}).parts.led1.on,false);
    // Pin voltage readings keep the average.
    close(pwm(.5).voltage('signal:PA5'),1.65,.01);
  });
  test('LED brightness level follows the current (dim for low PWM duty)',async()=>{
    const {ledLevel,mixColor}=await import('../../src/rgb-color.js');
    assert.equal(ledLevel({on:false,current:0}),0);assert.ok(ledLevel({on:true,current:.0005})<ledLevel({on:true,current:.003}));assert.equal(ledLevel({on:true,current:.01}),1);
    assert.equal(mixColor('#000000','#ffffff',.5),'#808080');
  });
  test('forward voltage depends on LED colour',()=>{
    for(const [color,vf] of [['red',1.8],['green',2.1],['yellow',2.0],['blue',2.8]]){
      const r=solveCircuit(ledCircuit({color}),HIGH);close(r.parts.led1.current,(3.3-vf)/(382),1e-6,color);
    }
  });
  test('LED is dark when the GPIO is LOW, unconfigured, reversed or the resistor is missing',()=>{
    assert.equal(solveCircuit(ledCircuit(),LOW).parts.led1.on,false);
    assert.equal(solveCircuit(ledCircuit()).parts.led1.on,false);
    const reversed=solveCircuit(ledCircuit({reversed:true}),HIGH);assert.equal(reversed.parts.led1.on,false);close(reversed.parts.led1.current,0);
    const p=ledCircuit();p.components=p.components.filter(c=>c.type!=='resistor');assert.equal(solveCircuit(p,HIGH).parts.led1.on,false);
  });
  test('too small a series resistor reports LED and GPIO over-current with targets',()=>{
    const r=solveCircuit(ledCircuit({ohms:10}),HIGH);
    assert.ok(r.parts.led1.current>0.02);
    assert.ok(r.warnings.some(w=>/LED1: LED 전류 \d+\.\d mA/.test(w)),r.warnings.join('|'));
    assert.ok(r.warnings.some(w=>/^PA5: GPIO 전류/.test(w)));
    assert.deepEqual(r.diagnostics.find(d=>d.message.startsWith('LED1')).target,{type:'part',id:'led1'});
    assert.deepEqual(r.diagnostics.find(d=>d.message.startsWith('PA5')).target,{type:'endpoint',id:boardPin('PA5')});
  });
  test('voltage divider, resistor current and power',()=>{
    const r=solveCircuit(dividerCircuit());close(r.voltage(boardPin('A0')),1.65,1e-4);close(r.parts.r1.current,1.65e-4,1e-8);close(r.parts.r1.power,1.65*1.65e-4,1e-8);
    const uneven=solveCircuit(dividerCircuit(20000,10000));close(uneven.voltage(boardPin('A0')),1.1,1e-4);
  });
  test('resistor dissipating more than 0.25 W is flagged',()=>{
    const p=boardProject();p.components=[{id:'r1',name:'R1',type:'resistor',value:47,x:0,y:0,rotation:0,span:42}];
    p.wires=[wire('w1',boardPin('5V'),'part:r1:a',RED),wire('w2','part:r1:b',boardPin('GND'),BLACK)];
    const r=solveCircuit(p);close(r.parts.r1.power,25/47,1e-3);assert.ok(r.warnings.some(w=>/R1: 저항 소비 전력이 0.25 W/.test(w)));
  });
  test('diode conducts forward with 0.7 V drop and blocks in reverse',()=>{
    const p=boardProject();p.components=[{id:'d1',name:'D1',type:'diode',x:0,y:0,rotation:0,span:42},{id:'r1',name:'R1',type:'resistor',value:1000,x:0,y:0,rotation:0,span:42}];
    p.wires=[wire('w1',boardPin('3V3'),'part:d1:a',RED),wire('w2','part:d1:b','part:r1:a'),wire('w3','part:r1:b',boardPin('GND'),BLACK)];
    close(solveCircuit(p).parts.d1.current,(3.3-0.7)/1001,1e-6);
    p.wires[0].to='part:d1:b';p.wires[1].from='part:d1:a';close(solveCircuit(p).parts.d1.current,0);
  });
  test('potentiometer wiper divides the supply according to position',()=>{
    const p=boardProject();p.components=[{id:'vr',name:'VR1',type:'potentiometer',value:10000,position:25,x:0,y:0,rotation:0}];
    p.wires=[wire('w1',boardPin('GND'),'part:vr:p1',BLACK),wire('w2',boardPin('3V3'),'part:vr:p3',RED),wire('w3',boardPin('A0'),'part:vr:p2')];
    close(solveCircuit(p).voltage(boardPin('A0')),3.3*0.25,1e-4);
    p.components[0].position=100;close(solveCircuit(p).voltage(boardPin('A0')),3.3,1e-3);
    p.components[0].position=0;close(solveCircuit(p).voltage(boardPin('A0')),0,1e-3);
    close(solveCircuit(p).parts.vr.voltage,3.3,1e-6,'end-to-end voltage');
  });
});

describe('solveCircuit: shorts, floating nodes and pulls',()=>{
  test('hard supply short fails closed with no voltages',()=>{
    const p=boardProject();p.wires=[wire('s',boardPin('3V3'),boardPin('GND'))];
    const r=solveCircuit(p);assert.equal(r.fault,true);assert.match(r.warnings.join(),/전원 단락/);assert.equal(r.voltage(boardPin('3V3')),null);
    const q=boardProject();q.wires=[wire('s',boardPin('5V'),boardPin('3V3'))];assert.equal(solveCircuit(q).fault,true);
  });
  test('joining two equal supplies (3V3 and IOREF) is not a short',()=>{
    const p=boardProject();p.wires=[wire('s',boardPin('3V3'),boardPin('IOREF'))];assert.equal(solveCircuit(p).fault,false);
  });
  test('GPIO driven HIGH into GND is current-limited and reported',()=>{
    const p=boardProject();p.wires=[wire('s',boardPin('D13'),boardPin('GND'))];
    const r=solveCircuit(p,HIGH);assert.equal(r.fault,false);close(r.voltage(boardPin('D13')),0,1e-6);
    assert.ok(r.warnings.some(w=>/^PA5: GPIO 전류 82\.5 mA/.test(w)),r.warnings.join('|'));
  });
  test('open-drain output released HIGH floats instead of driving',()=>{
    const p=boardProject();p.components=[{id:'r1',name:'R1',type:'resistor',value:10000,x:0,y:0,rotation:0,span:42}];
    p.wires=[wire('w1',boardPin('3V3'),'part:r1:a',RED),wire('w2','part:r1:b',boardPin('D13'))];
    close(solveCircuit(p,{PA5:{mode:'OUTPUT',value:3.3,openDrain:true}}).voltage(boardPin('D13')),3.3,1e-3,'external pull-up');
    assert.ok(solveCircuit(p,{PA5:{mode:'OUTPUT',value:0,openDrain:true}}).voltage(boardPin('D13'))<0.02);
  });
  test('an unconnected input floats (null) and reads LOW; pulls define the level',()=>{
    const p=boardProject();
    assert.equal(solveCircuit(p).voltage(boardPin('D2')),null);assert.equal(digitalRead('D2',solveCircuit(p)),0);
    close(solveCircuit(p,{PA10:{mode:'INPUT_PULLUP'}}).voltage(boardPin('D2')),3.3,1e-3);
    close(solveCircuit(p,{PA10:{mode:'INPUT_PULLDOWN'}}).voltage(boardPin('D2')),0,1e-3);
    assert.equal(digitalRead('D2',solveCircuit(p,{PA10:{mode:'INPUT_PULLUP'}})),1);
  });
  test('an isolated sub-circuit has no ground reference',()=>{
    const p=boardProject();p.components=[{id:'r1',name:'R1',type:'resistor',value:100,x:0,y:0,rotation:0,span:42,attachA:'bb:a:1',attachB:'bb:a:5'}];
    const r=solveCircuit(p);assert.equal(r.voltage('bb:a:1'),null);assert.equal(r.voltage('bb:a:5'),null);close(r.parts.r1.current,0);
  });
  test('pull-up button reads HIGH released and LOW pressed; USER button is active low',()=>{
    const p=buttonCircuit(),gpio={PA10:{mode:'INPUT_PULLUP'}};
    assert.equal(digitalRead('D2',solveCircuit(p,gpio)),1);assert.equal(digitalRead('D2',solveCircuit(p,gpio,{b1:true})),0);
    assert.equal(digitalRead('PC13',solveCircuit(boardProject())),1);assert.equal(digitalRead('USER_BUTTON',solveCircuit(boardProject(),{},{USER:true})),0);
  });
  test('digitalRead treats missing results as LOW and uses a 1.65 V threshold',()=>{
    assert.equal(digitalRead('PA0',null),0);
    assert.equal(digitalRead('A0',solveCircuit(dividerCircuit(10000,9900))),0);
    assert.equal(digitalRead('A0',solveCircuit(dividerCircuit(10000,10100))),1);
  });
});

describe('CircuitSimulation (capacitor transient)',()=>{
  const rc=()=>{const p=boardProject();p.components=[{id:'r1',name:'R1',type:'resistor',value:1000,x:0,y:0,rotation:0,span:42},{id:'c1',name:'C1',type:'capacitor',value:100,x:0,y:0,rotation:0,span:42}];
    p.wires=[wire('w1',boardPin('D13'),'part:r1:a'),wire('w2','part:r1:b','part:c1:a'),wire('w3','part:c1:b',boardPin('GND'),BLACK)];return p;};
  test('RC charging follows the time constant and repeated reads do not advance charge',()=>{
    const sim=new CircuitSimulation(),p=rc();
    for(let t=0;t<=100;t++)sim.solve(p,HIGH,{},t);
    const v=sim.latest.c1;close(v,3.3*(1-Math.exp(-100/104)),0.04,'one tau (1 kΩ + 40 Ω GPIO)');
    sim.solve(p,HIGH,{},100);sim.solve(p,HIGH,{},100);close(sim.latest.c1,v,1e-9);
    const held=sim.hold(p,HIGH,{});close(held.capacitors.c1,v,1e-3);close(sim.latest.c1,v,1e-9);
  });
  test('capacitor discharges when the source goes LOW',()=>{
    const sim=new CircuitSimulation(),p=rc();
    for(let t=0;t<=500;t+=1)sim.solve(p,HIGH,{},t);assert.ok(sim.latest.c1>3.2);
    for(let t=501;t<=600;t+=1)sim.solve(p,LOW,{},t);assert.ok(sim.latest.c1<1.3&&sim.latest.c1>1.1,String(sim.latest.c1));
  });
  test('without a time step the capacitor is an open circuit',()=>{
    const r=solveCircuit(rc(),HIGH);close(r.parts.r1.current,0,1e-9);
  });
});

describe('placement',()=>{
  const resistor=(x=795,y=226)=>({id:'rx',name:'RX',type:'resistor',value:220,x,y,rotation:0,span:42});
  test('a resistor dropped near two holes snaps all legs into exact holes',()=>{
    const p=resistor(797,229),mount=findMount(p,[]);
    assert.deepEqual(mount.attachments,{a:'bb:e:8',b:'bb:f:8'});
    assert.ok(applyMount(p,mount));assert.equal(p.attachA,'bb:e:8');assert.equal(p.attachB,'bb:f:8');
    const [ta,tb]=nominalTerminals(p);const ha=HOLE_BY_ID.get('bb:e:8'),hb=HOLE_BY_ID.get('bb:f:8');
    close(ta.x,ha.x);close(ta.y,ha.y);close(tb.x,hb.x);close(tb.y,hb.y);
  });
  test('occupied holes are skipped and the footprint is never partially mounted',()=>{
    const other={...resistor(),id:'r0',attachA:'bb:e:8',attachB:'bb:f:8'};
    assert.ok(occupiedHoles([other]).has('bb:e:8'));assert.equal(occupiedHoles([other],'r0').size,0);
    const mount=findMount(resistor(),[other]);assert.ok(mount);assert.notEqual(mount.attachments.a,'bb:e:8');assert.equal(Object.keys(mount.attachments).length,2);
  });
  test('far away parts, breadboards and hidden surfaces do not mount',()=>{
    assert.equal(findMount(resistor(5000,5000),[]),null);
    assert.equal(findMount({id:'b',type:'breadboard',name:'B',x:795,y:226,rotation:0},[]),null);
    assert.equal(findMount(resistor(),[],15,{breadboard:{hidden:true}}),null);
    assert.equal(applyMount(resistor(),null),false);
  });
  test('multi-pin parts mount onto an extra breadboard',()=>{
    const board=extraBoard('bb1'),hole=breadboardHoles(board).find(h=>h.id.endsWith(':bb:c:10'));
    const button={id:'b1',name:'SW',type:'button',x:hole.x+14,y:hole.y+14,rotation:0};
    const mount=findMount(button,[board]);assert.ok(mount);assert.equal(Object.keys(mount.attachments).length,4);
    assert.ok(Object.values(mount.attachments).every(id=>id.startsWith(breadboardPrefix('bb1'))));
  });
});

describe('components helpers',()=>{
  test('terminal keys and labels per part family',()=>{
    assert.deepEqual(terminalKeys({type:'resistor'}),['a','b']);assert.deepEqual(terminalKeys({type:'button'}),['a','b','c','d']);
    assert.equal(terminalKeys({type:'lcd'}).length,16);assert.deepEqual(terminalKeys({type:'breadboard'}),[]);
    assert.deepEqual(terminalKeys({type:'i2c'}),['p1','p2','p3','p4']);
    assert.equal(terminalLabel({type:'led'},'a'),'A (+)');assert.equal(terminalLabel({type:'button'},'c'),'A2');assert.equal(terminalLabel({type:'i2c'},'p3'),'SDA');
    assert.equal(terminalLabel({type:'lcd'},'p4'),'4 · RS');
  });
  test('attachments round-trip through assignAttachments and detachPart',()=>{
    const r={type:'resistor'};assignAttachments(r,{a:'bb:a:1',b:'bb:a:5'});assert.deepEqual(attachments(r),{a:'bb:a:1',b:'bb:a:5'});
    const b={type:'button'};assignAttachments(b,{a:'bb:e:1'});assert.deepEqual(attachments(b),{a:'bb:e:1'});
    assignAttachments(b,{});assert.equal(b.attachments,undefined);
    detachPart(r);assert.deepEqual(attachments(r),{});
  });
  test('angle helpers',()=>{
    assert.equal(normalizeAngle(-90),270);assert.equal(normalizeAngle(720),0);
    const q=rotatePoint(1,0,90);close(q.x,0,1e-12);close(q.y,1,1e-12);
  });
});

describe('circuit editing',()=>{
  test('selection helpers handle single, group and empty selections',()=>{
    assert.deepEqual(selectedIds(null,'part'),[]);assert.deepEqual(selectedIds({type:'part',id:'a'},'part'),['a']);assert.deepEqual(selectedIds({type:'part',id:'a'},'wire'),[]);
    let s=toggleSelection({type:'part',id:'a'},'wire','w1');assert.deepEqual(s,{type:'group',parts:['a'],wires:['w1']});
    s=toggleSelection(s,'part','a');assert.deepEqual(s.parts,[]);assert.ok(isSelected(s,'wire','w1'));assert.ok(!isSelected(s,'part','a'));
  });
  test('default wire route is a 4-point orthogonal path; custom points are kept',()=>{
    const p=ledCircuit(),w=p.wires[0],pts=wirePoints(p,w);assert.equal(pts.length,4);assert.equal(pts[1].y,pts[0].y);assert.equal(pts[2].y,pts[3].y);assert.equal(pts[1].x,pts[2].x);
    w.points=[{x:1,y:2}];assert.deepEqual(wirePoints(p,w).slice(1,-1),[{x:1,y:2}]);
    assert.deepEqual(wirePoints(p,{from:'nope',to:'bb:a:1'}),[]);
  });
  test('inserting a wire point picks the nearest segment and keeps topology',()=>{
    const p=ledCircuit(),w=p.wires[0],before=topology(p).find('bb:a:8'),pts=wirePoints(p,w);
    const mid={x:(pts[1].x+pts[2].x)/2,y:(pts[1].y+pts[2].y)/2};
    const index=insertWirePoint(p,w,mid);assert.equal(index,1);assert.equal(w.points.length,3);assert.deepEqual(w.points[1],mid);
    assert.equal(topology(p).find(boardPin('D13')),topology(p).find('bb:a:8'));assert.ok(before);
    assert.doesNotThrow(()=>validateProject(p));
  });
  test('wire points are capped at 32',()=>{
    const p=ledCircuit(),w=p.wires[0];w.points=Array.from({length:32},(_,i)=>({x:i,y:i}));
    assert.throws(()=>insertWirePoint(p,w,{x:0,y:0}),/32개/);
    w.points.push({x:0,y:0});assert.throws(()=>validateProject(p),/32개/);
  });
  test('box selection requires part centres and entire wire routes inside, in either drag direction',()=>{
    const p=ledCircuit();
    const all=boxSelection(p,{minX:-1e4,minY:-1e4,maxX:1e4,maxY:1e4});assert.deepEqual(all.parts,['r1','led1']);assert.deepEqual(all.wires,['w1','w2','w3']);
    const reversed=boxSelection(p,{minX:1e4,minY:1e4,maxX:-1e4,maxY:-1e4});assert.deepEqual(reversed,all);
    const onlyR=boxSelection(p,{minX:790,minY:220,maxX:800,maxY:230});assert.deepEqual(onlyR,{type:'group',parts:['r1'],wires:[]});
    assert.deepEqual(boxSelection(p,{minX:NaN,minY:0,maxX:1,maxY:1}),{type:'group',parts:[],wires:[]});
    assert.deepEqual(boxSelection(p,null).parts,[]);
  });
  test('box selection ignores malformed wires and does not mutate the project',()=>{
    const p=ledCircuit();p.wires.push({id:'bad',from:5,to:'bb:a:1'},{id:'bad2',from:'bb:a:1',to:'bb:a:2',points:'x'});
    const snapshot=structuredClone(p);const s=boxSelection(p,{minX:-1e5,minY:-1e5,maxX:1e5,maxY:1e5});
    assert.ok(!s.wires.includes('bad')&&!s.wires.includes('bad2'));assert.deepEqual(p,snapshot);
  });
  test('connected net follows aliases, strips and wires but stops at a resistor',()=>{
    const p=ledCircuit(),net=connectedNet(p,boardPin('D13'));const ids=net.endpoints.map(e=>e.id);
    for(const id of ['board:CN10:11','bb:a:8','bb:e:8','part:r1:a'])assert.ok(ids.includes(id),id);
    assert.ok(!ids.includes('part:r1:b'));assert.ok(!ids.includes('bb:f:8'));
    assert.deepEqual(net.wires.map(w=>w.id),['w1']);
  });
  test('copy/paste clones parts with fresh ids, preserves internal nets and does not touch the original',()=>{
    const p=ledCircuit(),original=structuredClone(p),before=topology(p);
    const clip=copySelection(p,{type:'group',parts:['r1','led1'],wires:[]});
    assert.deepEqual(p,original);assert.equal(clip.components.length,2);
    const sel=pasteSelection(p,clip,uid);assert.equal(sel.parts.length,2);assert.equal(p.components.length,4);
    const [nr,nl]=sel.parts.map(id=>p.components.find(c=>c.id===id));
    assert.match(nr.name,/ 복사$/);assert.equal(nr.x,795+28);assert.deepEqual(attachments(nr),{},'pasted parts are never re-attached to source holes');
    const uf=topology(p);assert.equal(uf.find(`part:${nr.id}:b`),uf.find(`part:${nl.id}:a`),'net through breadboard row 8 preserved by a generated wire');
    assert.notEqual(uf.find(`part:${nr.id}:a`),uf.find(boardPin('D13')),'board connection not copied');
    assert.equal(before.find('part:r1:a'),before.find(boardPin('D13')));
    assert.doesNotThrow(()=>validateProject(p));
  });
  test('copying an extra breadboard brings mounted parts and remaps their holes',()=>{
    const p=boardProject(),q=breadboardPrefix('bb1');
    p.components=[extraBoard('bb1'),{id:'r1',name:'R1',type:'resistor',value:330,x:1400,y:400,rotation:0,span:42,attachA:q+'bb:e:8',attachB:q+'bb:f:8'}];
    p.wires=[wire('w1',q+'bb:a:8',q+'bb:a:20')];
    const clip=copySelection(p,{type:'part',id:'bb1'});assert.equal(clip.components.length,2);assert.equal(clip.wires.length,1);
    const sel=pasteSelection(p,clip,uid);const board=sel.parts.map(id=>p.components.find(c=>c.id===id)).find(c=>c.type==='breadboard');
    const copy=p.components.find(c=>sel.parts.includes(c.id)&&c.type==='resistor');
    assert.ok(copy.attachA.startsWith(breadboardPrefix(board.id)));const w=p.wires.find(w=>sel.wires.includes(w.id));assert.ok(w.from.startsWith(breadboardPrefix(board.id)));
    assert.equal(p.components.find(c=>c.id==='r1').attachA,q+'bb:e:8');assert.doesNotThrow(()=>validateProject(p));
  });
  test('paste enforces project limits',()=>{
    const p=boardProject();p.components=Array.from({length:100},(_,i)=>({id:'r'+i,name:'R',type:'resistor',value:1,x:0,y:0,rotation:0}));
    assert.throws(()=>pasteSelection(p,{components:[{id:'z',name:'Z',type:'resistor',x:0,y:0,rotation:0}],wires:[]},uid),/100개/);
    const q=boardProject();q.components=Array.from({length:8},(_,i)=>extraBoard('b'+i));
    assert.throws(()=>pasteSelection(q,{components:[extraBoard('z')],wires:[]},uid),/8개/);
  });
  test('moving a selected part detaches it; moving a breadboard carries fully mounted parts',()=>{
    const p=ledCircuit();moveSelection(p,{type:'part',id:'r1'},10,5);const r=p.components[0];assert.deepEqual([r.x,r.y],[805,231]);assert.deepEqual(attachments(r),{});
    const b=boardProject(),q=breadboardPrefix('bb1');
    b.components=[extraBoard('bb1'),{id:'r1',name:'R1',type:'resistor',value:1,x:1400,y:400,rotation:0,span:42,attachA:q+'bb:e:8',attachB:q+'bb:f:8'}];
    b.wires=[wire('w1',q+'bb:a:1',q+'bb:a:2',undefined,{points:[{x:0,y:0}]})];
    moveSelection(b,{type:'group',parts:['bb1'],wires:['w1']},100,0);
    assert.equal(b.components[0].x,1500);assert.equal(b.components[1].x,1500);assert.equal(b.components[1].attachA,q+'bb:e:8');assert.deepEqual(b.wires[0].points,[{x:100,y:0}]);
  });
});

describe('circuit diagnostics',()=>{
  test('a clean LED circuit has no issues',()=>{
    assert.deepEqual(circuitDiagnostics(ledCircuit()),[]);
  });
  test('supply short is a single error targeting the supply pin',()=>{
    const p=boardProject();p.wires=[wire('s',boardPin('3V3'),boardPin('GND'))];
    const issues=circuitDiagnostics(p),short=issues.filter(i=>i.id.startsWith('short:'));
    assert.equal(short.length,1);assert.equal(short[0].severity,'error');assert.match(short[0].message,/GND와 3V3 전원/);
    assert.ok(!issues.some(i=>/^전원 단락/.test(i.message)),'generic short warning is not duplicated');
  });
  test('module with missing power and open signal pins',()=>{
    const p=boardProject();p.components=[{id:'m',name:'MEM',type:'i2c',address:80,x:0,y:0,rotation:0}];
    const ids=circuitDiagnostics(p).map(i=>i.id);
    for(const id of ['power:part:m:p1','power:part:m:p2','open:part:m:p3','open:part:m:p4'])assert.ok(ids.includes(id),id);
  });
  test('duplicate I2C addresses on one bus are errors',()=>{
    const p=boardProject();p.components=[{id:'m1',name:'M1',type:'i2c',address:80,x:0,y:0,rotation:0},{id:'m2',name:'M2',type:'i2c',address:80,x:0,y:0,rotation:0}];
    p.wires=[wire('a',boardPin('PB9'),'part:m1:p3'),wire('b',boardPin('PB8'),'part:m1:p4'),wire('c','part:m1:p3','part:m2:p3'),wire('d','part:m1:p4','part:m2:p4')];
    const dup=circuitDiagnostics(p).find(i=>i.id==='address:m1:m2');assert.ok(dup);assert.match(dup.message,/0x50/);assert.equal(dup.severity,'error');
    p.components[1].address=81;assert.ok(!circuitDiagnostics(p).some(i=>i.id.startsWith('address:')));
  });
  test('runtime over-current diagnostics are forwarded with their target',()=>{
    const result=solveCircuit(ledCircuit({ohms:10}),HIGH);
    const issues=circuitDiagnostics(ledCircuit({ohms:10}),result);
    assert.ok(issues.some(i=>i.id.startsWith('runtime:')&&i.target?.id==='led1'));
  });
  test('MCU pin conflicts are reported against the board pin',()=>{
    const p=boardProject();p.mcu.pins.PA5={function:'GPIO_Output',pull:'NOPULL',label:'',edge:'FALLING',initial:0};p.mcu.peripherals.SPI1={enabled:true,clock:1000000};
    p.mcu.pins.PA6={function:'SPI1_MISO',pull:'NOPULL',label:'',edge:'FALLING',initial:0};
    const issues=circuitDiagnostics(p).filter(i=>i.id.startsWith('config:'));
    assert.ok(issues.length>=1,'missing SPI1 SCK/MOSI should be reported');assert.ok(issues.every(i=>i.severity==='error'));
  });
});

describe('breadboards and surfaces',()=>{
  const mounted=()=>{const p=boardProject(),q=breadboardPrefix('bb1'),board=extraBoard('bb1'),holes=breadboardHoles(board),e=holes.find(h=>h.id===q+'bb:e:8'),f=holes.find(h=>h.id===q+'bb:f:8');
    p.components=[board,
      {id:'full',name:'R1',type:'resistor',value:1,x:(e.x+f.x)/2,y:e.y,rotation:0,span:42,attachA:e.id,attachB:f.id},
      {id:'half',name:'R2',type:'resistor',value:1,x:1400,y:400,rotation:0,span:42,attachA:q+'bb:e:9',attachB:'bb:a:1'}];
    p.wires=[wire('w1',q+'bb:a:8',boardPin('D13')),wire('w2','bb:a:2','bb:a:3')];return p;};
  test('moving/rotating an extra breadboard rotates fully mounted parts and detaches straddling ones',()=>{
    const p=mounted();moveBreadboard(p,'bb1',{x:1500,y:400,rotation:90});
    const [board,full,half]=p.components;assert.deepEqual([board.x,board.rotation],[1500,90]);
    assert.equal(full.rotation,90);assert.equal(full.attachA,breadboardPrefix('bb1')+'bb:e:8');
    assert.deepEqual(attachments(half),{b:'bb:a:1'});
    const terms=nominalTerminals(full),hole=holeInfo(full.attachA,p.components);close(terms[0].x,hole.x,1e-6);close(terms[0].y,hole.y,1e-6);
    moveBreadboard(p,'missing',{x:0,y:0});
  });
  test('removing a breadboard detaches parts and deletes wires that used it',()=>{
    const p=mounted();removeBreadboard(p,'bb1');
    assert.ok(!p.components.some(c=>c.id==='bb1'));assert.deepEqual(attachments(p.components[0]),{});assert.deepEqual(attachments(p.components[1]),{b:'bb:a:1'});
    assert.deepEqual(p.wires.map(w=>w.id),['w2']);assert.doesNotThrow(()=>validateProject(p));
  });
  test('removing and showing the default surfaces',()=>{
    const p=ledCircuit();assert.ok(surfacePresent(p.surfaces,'breadboard'));
    removeSurface(p,'breadboard');assert.equal(surfacePresent(p.surfaces,'breadboard'),false);
    assert.ok(p.components.every(c=>Object.keys(attachments(c)).length===0));assert.deepEqual(p.wires,[]);
    assert.doesNotThrow(()=>validateProject(p));
    showSurface(p,'breadboard',{x:10,y:20});assert.deepEqual(p.surfaces.breadboard,{hidden:false,x:10,y:20});
    const b=ledCircuit();removeSurface(b,'board');assert.deepEqual(b.wires.map(w=>w.id),['w3']);
  });
  test('moving the breadboard surface keeps mounted parts on their holes and shifts wire bend points',()=>{
    const p=ledCircuit();p.wires[2].points=[{x:900,y:300}];
    moveSurface(p,'breadboard',{x:BB.x+50,y:BB.y-20});
    const r=p.components[0],hole=holeInfo('bb:e:8',p.components,p.surfaces),t=nominalTerminals(r)[0];close(t.x,hole.x);close(t.y,hole.y);
    assert.deepEqual(p.wires[2].points,[{x:950,y:280}]);
    assert.throws(()=>moveSurface(p,'table',{x:0,y:0}),/이동할 보드/);
  });
});

describe('resize',()=>{
  const sameTopology=(a,b,ids)=>{const ua=topology(a),ub=topology(b);for(const x of ids)for(const y of ids)assert.equal(ua.find(x)===ua.find(y),ub.find(x)===ub.find(y),`${x}~${y}`);};
  const NODES=['part:r1:a','part:r1:b','part:led1:a','part:led1:b',boardPin('D13'),boardPin('GND')];
  test('scaling the breadboard keeps pin ids, attachments and connectivity; legs stay on holes',()=>{
    const p=ledCircuit(),before=structuredClone(p);
    resizeObject(p,{type:'surface',id:'breadboard'},2);
    assert.equal(p.surfaces.breadboard.scale,2);assert.deepEqual(p.components.map(attachments),before.components.map(attachments));
    sameTopology(before,p,NODES);
    for(const c of p.components){assert.equal(scaleXOf(c),2);for(const t of nominalTerminals(c)){const h=holeInfo(attachments(c)[t.key],p.components,p.surfaces);close(t.x,h.x,1e-6);close(t.y,h.y,1e-6);}}
    assert.deepEqual(solveCircuit(p,HIGH).parts.led1.on,true);
  });
  test('non-uniform resize of a part stores scaleX/scaleY and validateProject round-trips it',()=>{
    const p=ledCircuit();const fields=resizeObject(p,{type:'part',id:'r1'},{scaleX:2,scaleY:0.5});
    assert.deepEqual(fields,{scaleX:2,scaleY:0.5});const r=validateProject(p).components[0];assert.equal(r.scaleX,2);assert.equal(r.scaleY,0.5);
  });
  test('rotated non-uniform breadboard resize keeps diagonally mounted parts aligned',()=>{
    const p=boardProject(),q=breadboardPrefix('bb');p.components=[extraBoard('bb',{rotation:45})];
    const holes=breadboardHoles(p.components[0]),a=holes.find(h=>h.id===q+'bb:a:3'),b=holes.find(h=>h.id===q+'bb:c:5');
    p.components.push({id:'r1',name:'R1',type:'resistor',value:1,x:(a.x+b.x)/2,y:(a.y+b.y)/2,rotation:normalizeAngle(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI),span:Math.hypot(b.x-a.x,b.y-a.y),attachA:a.id,attachB:b.id});
    resizeObject(p,{type:'part',id:'bb'},{scaleX:1.7,scaleY:0.6});
    const [ta,tb]=nominalTerminals(p.components[1]),na=holeInfo(a.id,p.components),nb=holeInfo(b.id,p.components);
    close(ta.x,na.x,1e-6);close(ta.y,na.y,1e-6);close(tb.x,nb.x,1e-6);close(tb.y,nb.y,1e-6);
  });
  test('handle resize keeps the opposite edge fixed and does not mutate the input',()=>{
    const p=ledCircuit(),snapshot=structuredClone(p),bounds={x:BB.x,y:BB.y,width:BB.w,height:BB.h};
    const next=resizeFromHandle(p,{type:'surface',id:'breadboard'},bounds,'e',{x:0,y:0},{x:BB.w,y:0});
    assert.deepEqual(p,snapshot);close(next.surfaces.breadboard.scaleX,2,1e-9);close(next.surfaces.breadboard.scaleY,1,1e-9);
    close(next.surfaces.breadboard.x,BB.x,1e-9,'west edge fixed');
    const west=resizeFromHandle(p,{type:'surface',id:'breadboard'},bounds,'w',{x:0,y:0},{x:-BB.w,y:0});
    close(west.surfaces.breadboard.x,BB.x-BB.w,1e-6,'east edge fixed');
    const locked=resizeFromHandle(p,{type:'surface',id:'breadboard'},bounds,'se',{x:0,y:0},{x:BB.w,y:10},true);assert.equal(locked.surfaces.breadboard.scale,2);
    assert.throws(()=>resizeFromHandle(p,{type:'surface',id:'breadboard'},bounds,'x',{x:0,y:0},{x:1,y:1}),/조절점/);
  });
  test('resize frame maps local coordinates to the canvas',()=>{
    const p=ledCircuit();resizeObject(p,{type:'surface',id:'breadboard'},{scaleX:2,scaleY:3,x:100,y:200});
    const f=resizeFrame(p,{type:'surface',id:'breadboard'},{x:0,y:0,width:1,height:1});const q=f.point(BB.x+10,BB.y+10);close(q.x,120);close(q.y,230);
  });
  test('invalid sizes and targets fail without partial modification',()=>{
    const p=ledCircuit(),snapshot=structuredClone(p);
    assert.throws(()=>resizeObject(p,{type:'surface',id:'breadboard'},0),/크기/);
    assert.throws(()=>resizeObject(p,{type:'surface',id:'breadboard'},{scaleX:2,x:Infinity}),/작업 공간/);
    assert.throws(()=>resizeObject(p,{type:'part',id:'nope'},2),/선택/);
    assert.throws(()=>resizeObject(p,{type:'surface',id:'breadboard'},MAX_SCALE*2));
    assert.deepEqual(p,snapshot);
  });
});

describe('geometry',()=>{
  test('validScale bounds',()=>{
    assert.equal(validScale(1),1);assert.equal(validScale(MIN_SCALE),MIN_SCALE);assert.equal(validScale(MAX_SCALE),MAX_SCALE);
    for(const bad of [0,-1,MIN_SCALE/2,MAX_SCALE*1.01,NaN,Infinity,'2'])assert.throws(()=>validScale(bad),/장치 크기/);
  });
  test('scaleFields collapses equal axes and assignScale replaces previous fields',()=>{
    assert.deepEqual(scaleFields(2,2),{scale:2});assert.deepEqual(scaleFields(2,3),{scaleX:2,scaleY:3});
    const o={scale:5,scaleX:1};assignScale(o,{scaleX:2,scaleY:3});assert.deepEqual(o,{scaleX:2,scaleY:3});
    assert.equal(scaleXOf({scale:4}),4);assert.equal(scaleYOf({}),1);assert.equal(scaleYOf(undefined),1);
  });
  test('matrix inverse, multiply and matrixFields round-trip a transform',()=>{
    const t={rotation:30,scaleX:2,scaleY:0.5,skewX:10},m=matrixOf(t),id=multiply(m,inverse(m));
    close(id.a,1,1e-12);close(id.b,0,1e-12);close(id.c,0,1e-12);close(id.d,1,1e-12);
    const f=matrixFields(m);close(f.rotation,30,1e-9);close(f.scaleX,2,1e-9);close(f.scaleY,0.5,1e-9);close(f.skewX,10,1e-9);
    const v=vector(matrixOf({rotation:90}),{x:1,y:0});close(v.x,0,1e-12);close(v.y,1,1e-12);
  });
  test('surface origin/point and part transform strings',()=>{
    assert.deepEqual(surfaceOrigin('board'),{x:BOARD.x,y:BOARD.y});assert.deepEqual(surfaceOrigin('board',{board:{x:1,y:2}}),{x:1,y:2});
    const pt=surfacePoint({x:BOARD.x+10,y:BOARD.y+10,id:'k'},'board',{board:{x:0,y:0,scaleX:2,scaleY:3}});assert.deepEqual(pt,{x:20,y:30,id:'k'});
    assert.equal(partTransform({x:1,y:2,rotation:3}),'translate(1 2) rotate(3) skewX(0) scale(1)');
    assert.equal(partTransform({x:1,y:2,rotation:0,scaleX:2,scaleY:3,skewX:5}),'translate(1 2) rotate(0) skewX(5) scale(2 3)');
  });
});
