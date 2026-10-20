import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {topology,solveCircuit} from '../../src/engine.js';
import {HOLES,HOLE_BY_ID,FULL_HOLES,BB,FULL_BB,breadboardHoles,breadboardPrefix,breadboardModel,circuitHoles,holeInfo,boardPin} from '../../src/pins.js';
import {findMount,applyMount} from '../../src/placement.js';
import {moveBreadboard,removeBreadboard,newBreadboardFields,breadboardBounds,MAX_BREADBOARDS,isBreadboardLibraryType} from '../../src/breadboards.js';
import {resizeObject} from '../../src/resize.js';
import {validateProject} from '../../src/project.js';
import {searchParts,PART_LIBRARY} from '../../src/part-library.js';
import {attachments,nominalTerminals} from '../../src/components.js';
import {copySelection,pasteSelection} from '../../src/circuit-edit.js';
import {boardProject,ledCircuit,wire,close,BLACK} from './helpers/circuit.js';

const HIGH={PA5:{mode:'OUTPUT',value:3.3}};
const full=(id='fb1',extra={})=>({id,type:'breadboard',variant:'full',name:id.toUpperCase(),x:1500,y:900,rotation:0,...extra});
const half=(id='bb1',extra={})=>({id,type:'breadboard',name:id.toUpperCase(),x:1400,y:400,rotation:0,...extra});
const busOf=(holes,id)=>holes.find(h=>h.id===id).bus;
/** Groups hole ids by electrical bus. */
const buses=holes=>{const m=new Map();for(const h of holes){if(!m.has(h.bus))m.set(h.bus,[]);m.get(h.bus).push(h);}return m;};

describe('400-point half-size breadboard',()=>{
  test('keeps its hole ids, positions and buses',()=>{
    assert.equal(HOLES.length,400);assert.equal(breadboardModel(null).points,400);
    // Saved projects reference these ids and positions; they must never move.
    assert.deepEqual([HOLE_BY_ID.get('bb:a:1').x,HOLE_BY_ID.get('bb:a:1').y],[BB.x+86,BB.startY]);
    assert.deepEqual([HOLE_BY_ID.get('bb:j:30').x,HOLE_BY_ID.get('bb:j:30').y],[BB.x+86+9*14+28,BB.startY+29*14]);
    assert.deepEqual([HOLE_BY_ID.get('rail:R:-:25').x,HOLE_BY_ID.get('rail:R:-:25').y],[BB.x+314,BB.startY+28*14]);
    assert.equal(HOLE_BY_ID.get('rail:L:+:6').y-HOLE_BY_ID.get('rail:L:+:5').y,28,'rail holes come in groups of five');
  });
  test('rows a-e and f-j are separate strips; each rail is one conductor',()=>{
    const m=buses(HOLES);
    for(let r=1;r<=30;r++){
      assert.deepEqual(m.get(`bb:L:${r}`).map(h=>h.id),'abcde'.split('').map(c=>`bb:${c}:${r}`));
      assert.deepEqual(m.get(`bb:R:${r}`).map(h=>h.id),'fghij'.split('').map(c=>`bb:${c}:${r}`));
    }
    for(const rail of ['rail:L:+','rail:L:-','rail:R:+','rail:R:-'])assert.equal(m.get(rail).length,25);
    assert.equal(m.size,64);
    const uf=topology({...boardProject(),components:[],wires:[]});
    assert.equal(uf.find('rail:L:-:1'),uf.find('rail:L:-:25'));assert.notEqual(uf.find('rail:L:-:1'),uf.find('rail:R:-:1'));
    assert.equal(uf.find('bb:a:7'),uf.find('bb:e:7'));assert.notEqual(uf.find('bb:e:7'),uf.find('bb:f:7'));assert.notEqual(uf.find('bb:a:7'),uf.find('bb:a:8'));
  });
  test('an extra half-size board without a variant keeps the bb:/rail: ids under its prefix',()=>{
    const holes=breadboardHoles(half());assert.equal(holes.length,400);
    assert.ok(holes.every(h=>h.id.startsWith(breadboardPrefix('bb1'))&&h.bus.startsWith(breadboardPrefix('bb1'))));
    assert.ok(holes.some(h=>h.id==='breadboard:bb1:rail:R:+:25'));
  });
});

describe('830-point full-size breadboard',()=>{
  test('has 63 columns of two five-hole strips and four 50-hole rails',()=>{
    assert.equal(FULL_HOLES.length,830);assert.equal(new Set(FULL_HOLES.map(h=>h.id)).size,830);
    assert.equal(new Set(FULL_HOLES.map(h=>`${h.x},${h.y}`)).size,830,'no two holes overlap');
    const m=buses(FULL_HOLES);
    for(let c=1;c<=63;c++){
      assert.deepEqual(m.get(`bb:T:${c}`).map(h=>h.id),'abcde'.split('').map(l=>`bb:${l}:${c}`));
      assert.deepEqual(m.get(`bb:B:${c}`).map(h=>h.id),'fghij'.split('').map(l=>`bb:${l}:${c}`));
    }
    for(const rail of ['rail:T:+','rail:T:-','rail:B:+','rail:B:-']){
      const holes=m.get(rail);assert.equal(holes.length,50);
      const gaps=holes.slice(1).map((h,i)=>h.x-holes[i].x);
      assert.deepEqual(gaps.filter(g=>g!==14),Array(9).fill(28),'ten groups of five separated by one blank pitch');
    }
    assert.equal(m.size,63*2+4);
  });
  test('horizontal layout: columns 14 apart, centre channel spans three pitches',()=>{
    const at=id=>FULL_HOLES.find(h=>h.id===id);
    assert.equal(at('bb:a:2').x-at('bb:a:1').x,14);assert.equal(at('bb:a:63').x-at('bb:a:1').x,62*14);
    assert.equal(at('bb:f:10').y-at('bb:e:10').y,42);assert.equal(at('bb:b:10').y-at('bb:a:10').y,14);
    assert.ok(at('rail:T:+:1').y<at('bb:a:1').y&&at('rail:B:-:1').y>at('bb:j:1').y,'rails above and below the terminal blocks');
    for(const h of FULL_HOLES)assert.ok(h.x>0&&h.x<FULL_BB.w&&h.y>0&&h.y<FULL_BB.h);
  });
  test('ids are namespaced per board and connectivity follows the strips',()=>{
    const board=full(),p={...boardProject(),components:[board],wires:[]},q=breadboardPrefix(board.id);
    const holes=breadboardHoles(board);assert.equal(holes.length,830);assert.equal(circuitHoles(p.components,p.surfaces).length,400+830);
    const uf=topology(p);
    assert.equal(uf.find(q+'bb:a:5'),uf.find(q+'bb:e:5'));assert.notEqual(uf.find(q+'bb:e:5'),uf.find(q+'bb:f:5'));
    assert.notEqual(uf.find(q+'bb:a:5'),uf.find(q+'bb:a:6'));assert.equal(uf.find(q+'bb:f:63'),uf.find(q+'bb:j:63'));
    assert.equal(uf.find(q+'rail:B:-:1'),uf.find(q+'rail:B:-:50'));assert.notEqual(uf.find(q+'rail:B:-:1'),uf.find(q+'rail:T:-:1'));
    assert.notEqual(uf.find(q+'bb:a:5'),uf.find('bb:a:5'),'separate from the default board');
    assert.equal(holeInfo(q+'bb:j:63',p.components).label,'FB1 · J63');
  });
  test('an LED circuit on the full-size board lights',()=>{
    const p=boardProject(),board=full(),q=breadboardPrefix(board.id),holes=breadboardHoles(board),at=id=>holes.find(h=>h.id===q+id);
    p.components=[board];
    const r={id:'r1',name:'R1',type:'resistor',value:330,rotation:90,span:42,attachA:q+'bb:e:10',attachB:q+'bb:f:10',x:at('bb:e:10').x,y:(at('bb:e:10').y+at('bb:f:10').y)/2};
    const led={id:'led1',name:'LED1',type:'led',color:'red',rotation:0,span:42,attachA:q+'bb:j:10',attachB:q+'bb:j:13',x:(at('bb:j:10').x+at('bb:j:13').x)/2,y:at('bb:j:10').y};
    p.components.push(r,led);
    p.wires=[wire('w1',boardPin('D13'),q+'bb:a:10'),wire('w2',boardPin('GND'),q+'rail:B:-:7',BLACK),wire('w3',q+'rail:B:-:9',q+'bb:i:13',BLACK)];
    const result=solveCircuit(validateProject(p),HIGH);assert.equal(result.fault,false);assert.equal(result.parts.led1.on,true);
    close(result.parts.led1.current,solveCircuit(ledCircuit(),HIGH).parts.led1.current,2e-4,'same current as the classic half-size layout');
  });
  test('rotation transforms the whole model about its centre',()=>{
    const a=breadboardHoles(full('r0')),b=breadboardHoles(full('r90',{rotation:90}));
    const pa=a.find(h=>h.id.endsWith(':bb:a:1')),pb=b.find(h=>h.id.endsWith(':bb:a:1'));
    close(pb.x-1500,-(pa.y-900));close(pb.y-900,pa.x-1500);
    const box=breadboardBounds(full('r90',{rotation:90}));close(box.right-box.left,FULL_BB.h);close(box.bottom-box.top,FULL_BB.w);
  });
});

describe('breadboard components',()=>{
  test('parts mount on a full-size board and move, rotate and resize with it',()=>{
    const board=full(),q=breadboardPrefix(board.id),holes=breadboardHoles(board),e=holes.find(h=>h.id===q+'bb:e:20'),f=holes.find(h=>h.id===q+'bb:f:20');
    const r={id:'r1',name:'R1',type:'resistor',value:330,x:e.x,y:(e.y+f.y)/2+2,rotation:90,span:42};
    const p={...boardProject(),components:[board,r],wires:[wire('w1',q+'bb:a:20',boardPin('D13'))]};
    assert.ok(applyMount(r,findMount(r,p.components,15,p.surfaces)));assert.deepEqual(attachments(r),{a:q+'bb:e:20',b:q+'bb:f:20'});
    moveBreadboard(p,board.id,{x:board.x+100,y:board.y-50,rotation:90});
    const moved=breadboardHoles(board),ends=nominalTerminals(r);
    for(const [t,id]of [[ends[0],q+'bb:e:20'],[ends[1],q+'bb:f:20']]){const h=moved.find(x=>x.id===id);close(t.x,h.x,1e-6);close(t.y,h.y,1e-6);}
    resizeObject(p,{type:'part',id:board.id},1.5);
    const scaled=breadboardHoles(board),after=nominalTerminals(r);close(after[0].x,scaled.find(x=>x.id===q+'bb:e:20').x,1e-6);close(after[1].y,scaled.find(x=>x.id===q+'bb:f:20').y,1e-6);
    assert.equal(solveCircuit(p,HIGH).fault,false);
    removeBreadboard(p,board.id);assert.deepEqual(attachments(r),{});assert.equal(p.wires.length,0);assert.equal(p.components.length,1);
  });
  test('copy and paste keeps the variant and remaps the board namespace',()=>{
    const board=full(),p={...boardProject(),components:[board],wires:[]};
    const clip=copySelection(p,{type:'part',id:board.id});let n=0;const pasted=pasteSelection(p,clip,prefix=>prefix+'copy'+(++n));
    const copy=p.components.find(c=>c.id===pasted.parts[0]);assert.equal(copy.variant,'full');assert.equal(breadboardHoles(copy).length,830);
  });
  test('projects validate the variant and count both kinds toward the limit of eight',()=>{
    const p={...boardProject(),components:[full('f1'),half('h1')],wires:[]};
    const v=validateProject(p);assert.equal(v.components[0].variant,'full');assert.equal(v.components[1].variant,undefined);
    const q=breadboardPrefix('f1');v.wires=[wire('w1',q+'bb:a:63',q+'rail:T:+:50')];assert.equal(validateProject(v).wires.length,1);
    assert.throws(()=>validateProject({...p,wires:[wire('w1','breadboard:h1:bb:a:63','bb:a:1')]}),/배선/,'column 63 exists only on the full-size board');
    assert.throws(()=>validateProject({...p,components:[full('f1',{variant:'huge'})]}),/빵판/);
    const many={...boardProject(),wires:[],components:Array.from({length:9},(_,i)=>i%2?full('f'+i):half('h'+i))};
    assert.throws(()=>validateProject(many),/8개/);
    assert.equal(MAX_BREADBOARDS,8);
  });
  test('new boards are placed clear of existing ones and stop at eight',()=>{
    const p={...boardProject(),components:[],wires:[]};
    for(let i=0;i<8;i++){const fields=newBreadboardFields(p,i%2?'breadboard_full':'breadboard');const part={id:'b'+i,name:'BB'+i,...fields};
      const box=breadboardBounds(part);
      for(const other of p.components.map(breadboardBounds))assert.ok(box.right<=other.left||box.left>=other.right||box.bottom<=other.top||box.top>=other.bottom,'no overlap');
      assert.equal(part.variant,i%2?'full':undefined);p.components.push(part);}
    assert.throws(()=>newBreadboardFields(p,'breadboard_full'),/8개/);
  });
  test('the parts library offers both sizes',()=>{
    assert.ok(isBreadboardLibraryType('breadboard_full'));assert.ok(PART_LIBRARY.some(p=>p.type==='breadboard_full'));
    for(const q of ['빵판','브레드보드','830','풀사이즈','full','Full Size'])assert.ok(searchParts(q).some(p=>p.type==='breadboard_full'),q);
    assert.ok(searchParts('400').some(p=>p.type==='breadboard'));
  });
});

describe('saved projects',()=>{
  // A 0.25-era save: default board wiring plus an extra (variant-less) breadboard with a mounted LED.
  const legacy=()=>{
    const p=ledCircuit(),extra=half('old1',{x:1300,y:420}),q=breadboardPrefix('old1'),holes=breadboardHoles(extra),at=id=>holes.find(h=>h.id===q+id);
    p.components.push(extra,{id:'led2',name:'LED2',type:'led',color:'green',x:at('bb:j:3').x,y:(at('bb:j:3').y+at('bb:j:6').y)/2,rotation:90,span:42,attachA:q+'bb:j:3',attachB:q+'bb:j:6'});
    p.wires.push(wire('w4','bb:b:8',q+'bb:f:3'),wire('w5',q+'bb:h:6',q+'rail:R:-:4',BLACK),wire('w6',q+'rail:R:-:20','rail:R:-:20',BLACK));
    return JSON.parse(JSON.stringify(p));
  };
  test('keep their hole references and electrical behaviour',()=>{
    const saved=legacy(),p=validateProject(saved);
    assert.deepEqual(p.wires.map(w=>[w.from,w.to]),saved.wires.map(w=>[w.from,w.to]));
    assert.deepEqual(p.components.map(c=>attachments(c)),saved.components.map(c=>attachments(c)));
    const r=solveCircuit(p,HIGH);assert.equal(r.fault,false);assert.equal(r.parts.led1.on,true);assert.equal(r.parts.led2.on,true);
  });
  test('version 1 files with two-pin rotations still load on the default board',()=>{
    const v1={format:'stm32-circuit-lab',version:1,name:'v1',code:'',components:[{id:'r1',name:'R1',type:'resistor',value:330,x:0,y:0,rotation:0,attachA:'bb:e:8',attachB:'bb:f:8'}],wires:[{id:'w1',from:boardPin('D13'),to:'bb:a:8',color:'#23a68a'}]};
    const p=validateProject(v1);close(p.components[0].x,(HOLE_BY_ID.get('bb:e:8').x+HOLE_BY_ID.get('bb:f:8').x)/2);
  });
});
