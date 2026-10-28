import {BOARD,scaleXOf,scaleYOf,surfaceOrigin} from './geometry.js';
import {DEFAULT_BOARD_ID,getBoard} from './boards.js';
import {attachments,assignAttachments,terminalKeys} from './components.js';
import {DEVBOARD_MODELS,devboardModel,devboardPrefix,devboardBounds,nextDevboardName,removeDevboard,MAX_DEVBOARDS,STM32_COMMON} from './devboards.js';
import {familyProfile} from './mcu-family.js';
import {blankProject} from './project.js';
import {SimulationSession} from './session.js';
import {FirmwareSession} from './firmware-session.js';

// More STM32 boards in one circuit. The main board (surfaces.board, pins `board:CNx:n`, nets `signal:PA5`) is the one
// the IDE edits; every other STM32 board is a 'devboard' component that keeps its own main.c, pin settings, sources,
// breakpoints and ST-LINK serial (pins `devboard:<id>:CNx:n`, nets `signal:<id>.PA5`).
//
// Editing another board swaps it with the main board: software, name and place are exchanged and every endpoint is
// relabelled (`board:` ↔ `devboard:<id>:`), so the circuit stays electrically and visually the same and the pinout,
// HAL generator, build, debugger and real-board flashing all work on the board being edited.
// The same swap on a copy (`stm32View`) is how the other boards are built and run: each one is its own simulator or
// emulator session that sees the shared circuit through `viewMapper`, which renames the nets between the two views.
export const MAX_STM32_BOARDS=4;
export const isStm32Board=p=>p?.type==='devboard'&&devboardModel(p)?.kind==='stm32';
export const stm32Boards=project=>project.components.filter(isStm32Board);
export const mainBoardName=project=>project.surfaces?.board?.name||'STM32-1';
/** STM32 boards of the circuit with the main board first: [{id:'main'|part id, name, boardId, part?}]. */
export function stm32BoardList(project){
 const main=project.surfaces?.board?.hidden?[]:[{id:'main',name:mainBoardName(project),boardId:project.boardId??DEFAULT_BOARD_ID,stlink:project.surfaces?.board?.stlink}];
 return [...main,...stm32Boards(project).map(p=>({id:p.id,name:p.name,boardId:p.model,stlink:p.stlink,part:p}))];
}

/** Fields of a new STM32 board: the empty HAL project of its MCU (generated main.c, default pin settings). */
export function newStm32Fields(project,modelId,right=430){
 const model=DEVBOARD_MODELS[modelId];if(model?.kind!=='stm32')throw new Error('지원하지 않는 STM32 보드입니다.');
 if(project.surfaces?.board?.hidden)throw new Error('먼저 STM32 보드를 회로에 놓으세요. 보드 보기의 보드 목록에서 고릅니다.');
 if(project.components.filter(p=>p.type==='devboard').length>=MAX_DEVBOARDS)throw new Error(`보드는 ${MAX_DEVBOARDS}개까지 추가할 수 있습니다.`);
 if(stm32Boards(project).length+1>=MAX_STM32_BOARDS)throw new Error(`STM32 보드는 한 회로에 ${MAX_STM32_BOARDS}개까지 놓을 수 있습니다.`);
 const blank=blankProject(model.mcuFamily),names={components:[...project.components,{name:mainBoardName(project)}]};
 return {type:'devboard',model:modelId,name:nextDevboardName(names,model),x:right+60+model.w/2,y:48+model.h/2,rotation:0,code:blank.code,mcu:blank.mcu,firmware:blank.firmware};
}

// ---------------------------------------------------------------- swap
/** `board:` ↔ `devboard:<id>:` for wire ends, part attachments and catalog ties. */
function relabel(project,id){
 const prefix=devboardPrefix(id),swap=s=>typeof s!=='string'?s:s.startsWith('board:')?prefix+s.slice(6):s.startsWith(prefix)?'board:'+s.slice(prefix.length):s;
 for(const w of project.wires){w.from=swap(w.from);w.to=swap(w.to);}
 for(const p of project.components){if(p.type==='devboard')continue;const map=attachments(p);if(Object.values(map).some(v=>swap(v)!==v))assignAttachments(p,Object.fromEntries(Object.entries(map).map(([k,v])=>[k,swap(v)])));}
 if(project.catalogTies)project.catalogTies=project.catalogTies.map(t=>t.map(swap));
}
const SCALE_FIELDS=['scale','scaleX','scaleY'];
const setField=(object,key,value)=>{if(value===undefined)delete object[key];else object[key]=value;};
/** Make STM32 board `id` the main board (in place). Its old main board takes its component id, place and name stays. */
export function swapStm32(project,id){
 const part=project.components.find(p=>p.id===id);if(!isStm32Board(part))throw new Error('STM32 보드를 찾을 수 없습니다.');
 if(project.surfaces?.board?.hidden)throw new Error('주 STM32 보드가 회로에 없습니다.');
 // Projects saved before 0.23 (and examples) have no surfaces entry: their board is shown at its default place.
 project.surfaces??={};project.surfaces.board??={};
 const surface=project.surfaces.board,origin=surfaceOrigin('board',project.surfaces),sx=scaleXOf(surface),sy=scaleYOf(surface),px=scaleXOf(part),py=scaleYOf(part);
 const main={model:project.boardId??DEFAULT_BOARD_ID,name:mainBoardName(project),code:project.code,mcu:project.mcu,firmware:project.firmware,deviceDocs:project.deviceDocs,stlink:surface.stlink,
  ide:project.ide?{breakpoints:project.ide.breakpoints,watches:project.ide.watches}:undefined,scale:Object.fromEntries(SCALE_FIELDS.map(k=>[k,surface[k]]))};
 project.boardId=part.model;project.code=part.code;setField(project,'mcu',part.mcu);setField(project,'firmware',part.firmware);setField(project,'deviceDocs',part.deviceDocs);
 // Breakpoints and watches belong to a board's sources; the run target (ide.native) belongs to the IDE.
 if(part.ide||project.ide)project.ide={...(project.ide?.native?{native:project.ide.native}:{}),breakpoints:part.ide?.breakpoints??[],watches:part.ide?.watches??[]};
 const next={...surface,name:part.name,x:part.x-BOARD.w*px/2,y:part.y-BOARD.h*py/2};for(const k of SCALE_FIELDS)setField(next,k,part[k]);setField(next,'stlink',part.stlink);project.surfaces.board=next;
 part.model=main.model;part.name=main.name;part.code=main.code;part.x=origin.x+BOARD.w*sx/2;part.y=origin.y+BOARD.h*sy/2;part.rotation=0;
 for(const k of ['mcu','firmware','deviceDocs','stlink','ide'])setField(part,k,main[k]);for(const k of SCALE_FIELDS)setField(part,k,main.scale[k]);
 relabel(project,id);
 return project;
}
/** The circuit seen from STM32 board `id`: a copy where it is the main board (for its build and its run). */
export function stm32View(project,id){return swapStm32(structuredClone(project),id);}
/** Renames ids between the shared circuit and `stm32View(project, id)` (the same mapping both ways). */
export function viewMapper(id){
 const prefix=devboardPrefix(id),dot=id+'.';
 return s=>{
  if(s.startsWith('board:'))return prefix+s.slice(6);
  if(s.startsWith(prefix))return 'board:'+s.slice(prefix.length);
  for(const kind of ['signal:','drive:'])if(s.startsWith(kind)){const rest=s.slice(kind.length);if(rest.startsWith(dot))return kind+rest.slice(dot.length);if(!rest.includes('.')&&!STM32_COMMON.has(rest))return kind+dot+rest;return s;}
  return s;
 };
}
/** Remove the main board while other STM32 boards remain: the first of them becomes the main board. */
export function promoteStm32(project){const next=stm32Boards(project)[0];if(!next)return false;swapStm32(project,next.id);removeDevboard(project,next.id);return true;}
/** Label of a board for logs and lists: `STM32-2 · NUCLEO-F446RE`. */
export const boardTitle=(name,boardId)=>`${name} · ${getBoard(boardId)?.name??boardId}`;
export {devboardBounds};

// ---------------------------------------------------------------- run
// Stands in for the circuit of a board's own session: a time step is the shared circuit's latest result, and a change
// of the board's own outputs solves the shared circuit again at once (a chip select pulled low is seen by the SPI
// transfer that follows it), both renamed to the board's view.
class ViewCircuit{
 constructor(driver){this.driver=driver;this.drivers=[];}
 solve(){return this.driver.fresh();}
 hold(){return this.driver.fresh();}
}
const PENDING={fault:false,warnings:[],diagnostics:[],parts:{},current:0,uf:{find:id=>id,join(){},parent:new Map()},voltage:()=>null};
/** Another STM32 board running its own HAL program (simulator) or ELF (emulator) on the shared circuit. */
export class Stm32Driver{
 constructor(part,{project,elf,emulate=false,log=()=>{},trace=()=>{},others=[]}={}){
  this.part=part;this.others=others;this.lines=new Map();this.map=viewMapper(part.id);this.shared=null;this.cache=null;this.output='';this.outputLabel='printf · UART 출력';this.emulate=emulate;
  const view=stm32View(project,part.id),say=text=>{this.output=(this.output+text).slice(-8000);for(const line of String(text).split('\n').filter(Boolean))log(line);};
  const options={print:text=>say(String(text)),trace:event=>trace({...event,message:`${part.name} · ${event.message}`}),uart:event=>this.uartText(event,say),warn:message=>log('경고: '+message)};
  this.create=()=>{try{return emulate?new FirmwareSession(view,{...options,elf}):new SimulationSession(view,options);}catch(error){throw new Error(`${part.name} · main.c: ${error.message}`);}};
  this.session=this.create();this.session.circuit=new ViewCircuit(this);if(emulate)this.session.dynamic=true;
  this.pins=familyProfile(view.mcu?.family).gpioPins;
 }
 // UART bytes the board sends, shown a line at a time: `[USART2 TX] hello`.
 uartText(event,say){
  if(event?.direction!=='TX')return;const key=`${event.instance} TX`;let line=this.lines.get(key)??'';
  for(const byte of event.bytes){if(byte===13)continue;if(byte===10){say(`[${key}] ${line}\n`);line='';continue;}line+=byte>=32&&byte<=126?String.fromCharCode(byte):'\\x'+byte.toString(16).padStart(2,'0');if(line.length>=512){say(`[${key}] ${line}\n`);line='';}}
  this.lines.set(key,line);
 }
 /** The latest shared result with this board's names (its own pins are `signal:PA5`, the main board's `signal:<id>.PA5`). */
 view(){
  const r=this.shared;if(!r)return PENDING;if(this.cache?.r!==r)this.cache={r,v:this.translate(r)};return this.cache.v;
 }
 translate(r){
  const m=this.map,parts={};for(const [k,v]of Object.entries(r.parts||{}))parts[k]={...v};
  return {...r,parts,voltage:id=>r.voltage(m(id)),uf:{find:id=>r.uf.find(m(id)),join(){},parent:r.uf.parent}};
 }
 /** The shared circuit solved now with every board's current outputs (`host`: the main board's session). */
 fresh(){
  const h=this.host;if(!h||!this.shared)return this.view();
  // While this board runs, only its own outputs change: the last solve stands until they (or the main result) do.
  const key=JSON.stringify(this.emulate?this.session.gpio:this.session.runtime.gpio);if(this.last?.host===h.result&&this.last.key===key)return this.last.v;
  const us=h.soc?h.now:h.runtime.microTime,r=h.circuit.hold(h.project,h.soc?h.gpio:h.runtime.gpio,h.pressed,h.sensors.echoHigh(us),h.motion.signals);
  const v=r.fault?this.view():this.translate(r);this.last={host:h.result,key,v};return v;
 }
 gpio(){const out={},g=this.emulate?this.session.gpio:this.session.runtime.gpio;for(const [pin,state]of Object.entries(g||{}))if(!pin.includes('.'))out[`${this.part.id}.${pin}`]=state;return out;}
 // The program starts once the circuit has been solved; it then runs up to each circuit step.
 advance(time){if(!this.shared)return;try{this.session.tick(time);this.enriched=this.session.result;}catch(error){throw new Error(`${this.part.name}: ${error.message}`);}}
 observe(result){
  this.shared=result;this.owned??=this.ownedParts(result);
  if(this.emulate){this.session.result=this.view();this.session.soc?.inputsUpdated();}
  else{this.session.result=this.view();this.session.runtime.pollInterrupts();}
 }
 /** The board's RESET button: its program starts again; the circuit keeps running. */
 reset(){this.session=this.create();this.session.circuit=new ViewCircuit(this);if(this.emulate)this.session.dynamic=true;this.enriched=null;this.cache=null;this.session.result=this.view();}
 /**
  * Parts this board drives: reached from its pins through signal nets and other parts (an L298N on its pins and the
  * motor on the L298N outputs), not through the shared supplies, and not reached from another STM32 board's pins.
  * Their device state (OLED text, motor speed from the board's PWM …) comes from this board's session.
  */
 ownedParts(result){
  const find=id=>result.uf.find(id),supplies=new Set([...STM32_COMMON].map(s=>find('signal:'+s)));
  const parts=this.session.project.components.filter(p=>p.type!=='devboard').map(p=>({id:p.id,nets:terminalKeys(p).map(k=>find(`part:${p.id}:${k}`)).filter(n=>!supplies.has(n))}));
  const reach=pins=>{const nets=new Set(pins.map(p=>find('signal:'+p))),seen=new Set();let grew=true;while(grew){grew=false;for(const p of parts)if(!seen.has(p.id)&&p.nets.some(n=>nets.has(n))){seen.add(p.id);for(const n of p.nets)nets.add(n);grew=true;}}return seen;};
  const own=reach(this.pins.map(p=>`${this.part.id}.${p}`)),other=reach([...this.pins,...this.others.flatMap(id=>this.pins.map(p=>`${id}.${p}`))]);
  return new Set([...own].filter(id=>!other.has(id)));
 }
 /** Shared result (after the main board's own update): parts this board drives show this board's device state. */
 decorate(result){if(!this.enriched||!this.owned)return;for(const id of this.owned){const mine=this.enriched.parts?.[id];if(mine)result.parts[id]={...result.parts[id],...mine,voltage:result.parts[id]?.voltage??mine.voltage,current:result.parts[id]?.current??mine.current};}}
}
/**
 * Connects the STM32 board drivers to the main board's session (call after the drivers are set on it): a board's own
 * output changes solve the shared circuit, and UART bytes one board sends (simulator sessions) reach every other board
 * whose enabled UART has its RX on the same net as that TX and the same baud rate, when each byte ends on the wire.
 */
export function connectStm32Drivers(session){
 for(const d of session.circuit.drivers)if(d instanceof Stm32Driver)d.host=session;
 const drivers=session.circuit.drivers.filter(d=>d instanceof Stm32Driver&&!d.emulate);if(!drivers.length)return;
 const boards=[{name:'main',map:id=>id,session:()=>session},...drivers.map(d=>({name:d.part.name,map:d.map,session:()=>d.session}))];
 const buses=s=>s.hal?[...s.hal.serials.values()].map(c=>c.bus):[s.buses];
 for(const from of boards){
  const deliver=(bus,frames)=>{
   const shared=session.result;if(!shared||shared.fault||!frames.length)return 0;const root=id=>shared.uf.find(id),tx=root(from.map('signal:'+bus.uart.tx));let count=0;
   for(const to of boards){if(to===from)continue;const target=to.session();
    for(const peer of buses(target)){const u=peer.uart;if(!u.ready||root(to.map('signal:'+u.rx))!==tx)continue;
     if(u.baud!==bus.uart.baud){peer.report(target.runtime,'UART',`RX 무시 · 보낸 쪽 ${bus.uart.baud} baud ≠ ${u.baud} baud`);continue;}
     if(u.queue.length+frames.length>4096)throw new Error(`${to.name==='main'?'주 보드':to.name}: UART 수신 버퍼가 가득 찼습니다.`);
     for(const f of frames){u.queue.push({at:f.at,value:f.value});target.runtime.event(f.at/1000,()=>{});}count++;}}
   return count;
  };
  // Every UART of the board shares the board's hook (hal.uart copies it to the USART buses it creates).
  const attach=()=>{from.session().buses.peers=deliver;};attach();from.attach=attach;
 }
 for(const d of drivers){const reset=d.reset.bind(d),board=boards.find(b=>b.name===d.part.name);d.reset=()=>{reset();board.attach();};}
}
/** Drivers of the STM32 boards that run this time (`scope`: 'all' or one board id), keyed ELFs for the emulator. */
export function createStm32Drivers(project,{scope='all',emulate=false,elfs={},log=()=>{},trace=()=>{}}={}){
 return stm32Boards(project).filter(p=>scope==='all'||scope===p.id).map(p=>{
  const say=text=>log(`[${p.name}] ${text}`);
  if(emulate&&!elfs[p.id])throw new Error(`${p.name}: 펌웨어 ELF가 없습니다.`);
  say(emulate?`펌웨어 에뮬레이터를 시작했습니다 · ${getBoard(p.model)?.mcu}`:p.firmware?.mode==='hal'?'HAL 프로그램을 시작했습니다.':'스케치를 시작했습니다.');
  return new Stm32Driver(p,{project,emulate,elf:elfs[p.id],log:say,trace,others:stm32Boards(project).filter(q=>q!==p).map(q=>q.id)});
 });
}
