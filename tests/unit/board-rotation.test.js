// Feature 29: the MCU board turns in quarter turns. The main board is a surface drawn from its corner, another STM32
// board is a component drawn from its centre; both keep their place when turned, and pins, mounted parts and wire
// bends follow. Swapping the edited board carries the turn both ways; the project file stores and checks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {projectForBoard,validateProject} from '../../src/project.js';
import {BOARD,surfacePoint,surfaceBounds,surfaceCentre,surfaceTransform} from '../../src/geometry.js';
import {rotateBoard,rotateDevboard,moveSurface} from '../../src/surface-move.js';
import {endpointInfo,PINS,setActiveBoard} from '../../src/pins.js';
import {newStm32Fields,swapStm32} from '../../src/stm32-boards.js';
import {devboardPins,devboardBounds} from '../../src/devboards.js';

const near=(a,b,message)=>assert.ok(Math.abs(a-b)<1e-6,`${message??''} ${a} for ${b}`);
const nearPoint=(a,b,message)=>{near(a.x,b.x,message);near(a.y,b.y,message);};
const fresh=()=>validateProject(projectForBoard('nucleo-f446re'));
const pin=(project,id)=>endpointInfo(id,project.components,project.surfaces);

test('an unturned board is where it always was: no rotation field, the old transform string',()=>{
 const p=fresh();
 assert.equal(surfaceTransform('board',p.surfaces),`translate(${BOARD.x} ${BOARD.y}) scale(1) translate(${-BOARD.x} ${-BOARD.y})`);
 assert.deepEqual(surfacePoint({x:100,y:200},'board',{board:{x:10,y:20,scale:2}}),{x:10+(100-BOARD.x)*2,y:20+(200-BOARD.y)*2});
});

test('a quarter turn keeps the centre, swaps width and height, and four turns give the start back exactly',()=>{
 const p=fresh(),centre=surfaceCentre('board',p.surfaces),first=PINS[0],start=pin(p,first.id);
 rotateBoard(p,90);
 assert.equal(p.surfaces.board.rotation,90);
 nearPoint(surfaceCentre('board',p.surfaces),centre,'centre');
 const b=surfaceBounds('board',p.surfaces);near(b.right-b.left,BOARD.h,'width');near(b.bottom-b.top,BOARD.w,'height');
 // A pin at (dx, dy) from the centre is now at (-dy, dx): clockwise on screen (y grows downwards).
 const turned=pin(p,first.id);near(turned.x-centre.x,-(start.y-centre.y),'x');near(turned.y-centre.y,start.x-centre.x,'y');
 assert.match(surfaceTransform('board',p.surfaces),/ rotate\(90\) /);
 rotateBoard(p,90);rotateBoard(p,90);assert.equal(p.surfaces.board.rotation,270);rotateBoard(p,90);
 assert.equal(p.surfaces.board.rotation,undefined,'0° is not stored');
 nearPoint(pin(p,first.id),start,'back');
 assert.doesNotThrow(()=>validateProject(p));
});

test('parts mounted on the headers and wire bends between board pins turn with the board; other bends stay',()=>{
 const p=fresh(),a=PINS[0],b=PINS[1],centre=surfaceCentre('board',p.surfaces);
 const pa=pin(p,a.id),pb=pin(p,b.id);
 p.components.push({id:'r1',type:'resistor',name:'R1',value:330,x:(pa.x+pb.x)/2,y:(pa.y+pb.y)/2,rotation:Math.atan2(pb.y-pa.y,pb.x-pa.x)*180/Math.PI,span:Math.hypot(pb.x-pa.x,pb.y-pa.y),attachA:a.id,attachB:b.id});
 p.components.push({id:'free',type:'led',name:'LED1',color:'red',x:900,y:300,rotation:0,span:28});
 p.wires.push({id:'w1',from:PINS[2].id,to:PINS[3].id,color:'#d94545',points:[{x:centre.x+50,y:centre.y+20}]});
 p.wires.push({id:'w2',from:PINS[2].id,to:'part:free:a',color:'#3366cc',points:[{x:700,y:300}]});
 const angle=p.components[0].rotation;
 rotateBoard(p,90);
 const r1=p.components[0],qa=pin(p,a.id),qb=pin(p,b.id);
 nearPoint(r1,{x:(qa.x+qb.x)/2,y:(qa.y+qb.y)/2},'the resistor sits between its two pins');
 near(((r1.rotation-angle)%360+360)%360,90,'its angle');
 nearPoint(p.wires[0].points[0],{x:centre.x-20,y:centre.y+50},'a bend between board pins');
 assert.deepEqual(p.wires[1].points,[{x:700,y:300}],'a bend of a wire that leaves the board');
 assert.deepEqual([p.components[1].x,p.components[1].y],[900,300]);
 assert.doesNotThrow(()=>validateProject(p));
});

test('moving a turned board keeps its turn, name and ST-LINK serial',()=>{
 const p=fresh();p.surfaces={board:{name:'MAIN',stlink:'0123456789ABCDEF'}};
 rotateBoard(p,180);const before=pin(p,PINS[5].id);
 moveSurface(p,'board',{x:p.surfaces.board.x+30,y:p.surfaces.board.y-10});
 assert.equal(p.surfaces.board.rotation,180);assert.equal(p.surfaces.board.name,'MAIN');assert.equal(p.surfaces.board.stlink,'0123456789ABCDEF');
 nearPoint(pin(p,PINS[5].id),{x:before.x+30,y:before.y-10});
});

test('another STM32 board turns about its centre; editing it swaps place and turn with the main board',()=>{
 const p=fresh();p.components.push({id:'stm2',...newStm32Fields(p,'nucleo-f103rb',430),x:900,y:300});
 const part=p.components.find(c=>c.type==='devboard'),first=()=>devboardPins(part)[0],start=first();
 rotateDevboard(p,part.id,90);
 assert.equal(part.rotation,90);
 near(first().x-900,-(start.y-300));near(first().y-300,start.x-900);
 const box=devboardBounds(part);near(box.right-box.left,BOARD.h,'width');
 assert.doesNotThrow(()=>validateProject(p));
 // The main board is turned the other way; where each board's first header pin is must not change by swapping.
 rotateBoard(p,270);
 const mainCentre=surfaceCentre('board',p.surfaces),mainPin=pin(p,PINS[0].id),partPin=first();
 swapStm32(p,part.id);
 assert.equal(p.surfaces.board.rotation,90);assert.equal(part.rotation,270);
 nearPoint(surfaceCentre('board',p.surfaces),{x:900,y:300},'the edited board is where the component was');
 nearPoint(part,mainCentre,'the old main board is where it was');
 setActiveBoard(p.boardId);
 // Both boards have the same header layout, so pin 0 of each is at the place the other board's pin 0 was.
 nearPoint(pin(p,PINS[0].id),partPin,'main pin after the swap');nearPoint(devboardPins(part)[0],mainPin,'component pin after the swap');
 swapStm32(p,part.id);
 assert.equal(p.surfaces.board.rotation,270);assert.equal(part.rotation,90);nearPoint(surfaceCentre('board',p.surfaces),mainCentre);
 assert.doesNotThrow(()=>validateProject(p));
 setActiveBoard('nucleo-f446re');
});

test('the project file: old files open at 0°, a quarter turn is kept, anything else is refused',()=>{
 const p=fresh();
 assert.equal(validateProject(p).surfaces?.board?.rotation,undefined);
 p.surfaces={board:{rotation:270}};assert.equal(validateProject(p).surfaces.board.rotation,270);
 p.surfaces={board:{rotation:0}};assert.equal(validateProject(p).surfaces.board.rotation,undefined);
 for(const bad of [45,360,-90,'90',null]){p.surfaces={board:{rotation:bad}};assert.throws(()=>validateProject(p),/회전 각도/,String(bad));}
 const q=fresh();q.components.push({id:'stm2',...newStm32Fields(q,'nucleo-f103rb',430),x:900,y:300});const part=q.components.find(c=>c.type==='devboard');
 part.rotation=180;assert.equal(validateProject(q).components.find(c=>c.type==='devboard').rotation,180);
 part.rotation=45;assert.throws(()=>validateProject(q),/90° 단위/);
});

test('the Renesas board turns too',()=>{
 const p=validateProject(projectForBoard('fpb-ra6e1'));setActiveBoard('fpb-ra6e1');
 const centre=surfaceCentre('board',p.surfaces),start=pin(p,PINS[0].id);
 rotateBoard(p,180);
 const turned=pin(p,PINS[0].id);near(turned.x-centre.x,-(start.x-centre.x));near(turned.y-centre.y,-(start.y-centre.y));
 assert.doesNotThrow(()=>validateProject(p));
 setActiveBoard('nucleo-f446re');
});

test('error cases: a hidden board does not turn; a part between the board and a breadboard stays; odd angles snap to quarter turns',()=>{
 const p=fresh();p.surfaces={board:{hidden:true}};
 assert.throws(()=>rotateBoard(p,90),/주 보드가 회로에 없습니다/);
 assert.throws(()=>rotateDevboard(fresh(),'nope',90),/회전할 보드/);
 const q=fresh();
 q.components.push({id:'r1',type:'resistor',name:'R1',value:330,x:500,y:200,rotation:0,span:70,attachA:PINS[0].id,attachB:'bb:a:1'});
 rotateBoard(q,90);
 assert.deepEqual([q.components[0].x,q.components[0].y,q.components[0].rotation],[500,200,0],'not mounted on the board alone');
 // A turn that is not a multiple of 90° (a caller's mistake) still leaves a valid quarter turn; negative turns wrap.
 const r=fresh();rotateBoard(r,100);assert.equal(r.surfaces.board.rotation,90);rotateBoard(r,-180);assert.equal(r.surfaces.board.rotation,270);
 assert.doesNotThrow(()=>validateProject(r));
});
