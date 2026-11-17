// Feature 36 with the real FSP: r_elc, r_dtc and r_dmac (and r_sci_uart / r_adc with their transfers and the ELC trigger)
// built by ARM GCC with the generated ra_gen / ra_cfg and run on the RA6E1 emulator's ELC, DTC and DMAC, beside the same
// hal_entry.c on the built-in interpreter (fsp-transfer.js). Both must give the same return codes, the same data moved,
// the same callback order and counts, the same notes — and the values FSP gives, written out here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raExample} from '../../src/ra-examples.js';
import {TRANSFER_PROGRAMS} from '../fixtures/ra-transfer-programs.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';
const list=(prefix,n)=>Array.from({length:n},(_,i)=>`${prefix}[${i}]`);
const FSP={SUCCESS:0,ASSERTION:1,UNSUPPORTED:6,NOT_OPEN:7,ALREADY_OPEN:14};

/** Builds `program` and runs it on both engines for `ms` (`at[ms](session)` while running); what each one ends with. */
async function both({mcu,code,circuit},ms,names,at={}){
 const project=validateProject({...projectForBoard('fpb-ra6e1'),mcu,code,...(circuit?{components:circuit.components,wires:circuit.wires,surfaces:undefined}:{})});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-transfer-'));
 try{
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const read=(session,warn,uart)=>({vars:Object.fromEntries(names.map(n=>[n,session.readVariable(n)])),warn:warn.filter(w=>/^\[(ELC|DTC|DMAC)\]/.test(w)),
   sci9:String.fromCharCode(...uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX').flatMap(e=>e.bytes))});
  const run=session=>{for(let t=1;t<=ms;t++){at[t]?.(session);session.tick(t);}};
  const ew=[],eu=[],emulator=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),warn:m=>ew.push(m),uart:e=>eu.push(e)});run(emulator);
  const iw=[],iu=[],interpreter=new SimulationSession(validateProject(project),{warn:m=>iw.push(m),uart:e=>iu.push(e)});run(interpreter);
  return {emulator:read(emulator,ew,eu),interpreter:read(interpreter,iw,iu),unknown:[...emulator.soc.unknown.keys()].map(a=>a.toString(16)),session:emulator};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}

test('r_dtc: repeat (a pattern into one variable on each GPT1 overflow), block (3 blocks of 4 words on AGT1, then the AGT interrupt), InfoGet and the return codes — the same on both engines',{skip,timeout:600000},async()=>{
 const names=['level','agt_irqs','copy_sum','codes','remaining_len','remaining_blocks',...list('code_list',11)];
 const r=await both(TRANSFER_PROGRAMS.dtc,400,names);
 assert.deepEqual(r.interpreter,r.emulator);
 const v=r.emulator.vars;
 // Enable before Open, Open, Open again, SoftwareStart, Enable with p_src NULL, Reset; Open and Reset of the block DTC;
 // later Disable, Close, Close again.
 assert.deepEqual(list('code_list',11).map(k=>v[k]),[FSP.NOT_OPEN,FSP.SUCCESS,FSP.ALREADY_OPEN,FSP.UNSUPPORTED,FSP.ASSERTION,FSP.SUCCESS,FSP.SUCCESS,FSP.SUCCESS,FSP.SUCCESS,FSP.SUCCESS,FSP.NOT_OPEN]);
 // The block DTC took the first three AGT1 underflows (60 ms), then 20 ms each reach the CPU: 18 by 400 ms.
 assert.equal(v.agt_irqs,18);assert.equal(v.copy_sum,3*(11+22+33+44));
 // Repeat mode keeps its length (CRAH | CRAL after r_dtc's initialisation: InfoGet reads CRAL), block mode its blocks.
 assert.equal(v.remaining_len,4);assert.equal(v.remaining_blocks,3);
 assert.deepEqual(r.unknown,[],'every register the drivers use is modelled');
});

test('r_elc with r_adc and r_sci_uart + r_dtc: GPT1 → ADC0 scans, LinkBreak, LinkSet to a software event, Disable and Close; the UART\'s DTC both ways — the same on both engines',{skip,timeout:600000},async()=>{
 const names=['scans',...list('phase_scans',4),...list('codes',8),'n_events',...list('events',4),'tx_left_at_write','tx_left_at_empty','rx_left_after_read','write_max','rx_sum'];
 const program={...TRANSFER_PROGRAMS.elc_uart,circuit:raExample('ra_uart_echo').circuit()};
 const r=await both(program,150,names,{20:s=>s.inject('ABCD','SCI9')});
 assert.deepEqual(r.interpreter,r.emulator);
 const v=r.emulator.vars;
 // GPT1 every 5 ms → 10 scans in the first 52 ms; none after LinkBreak; 3 software events; none after Disable.
 assert.deepEqual(list('phase_scans',4).map(k=>v[k]),[10,10,13,13]);
 assert.deepEqual(list('codes',8).map(k=>v[k]),[FSP.NOT_OPEN,0,FSP.ALREADY_OPEN,0,0,0,0,0]);
 // TX_DATA_EMPTY (when the DTC has moved the last byte), TX_COMPLETE, then RX_COMPLETE of the 4 injected bytes.
 assert.deepEqual([v.n_events,...list('events',3).map(k=>v[k])],[3,128,2,1]);assert.equal(v.rx_sum,'ABCD'.split('').reduce((s,c)=>s+c.charCodeAt(0),0));
 // The first byte is the CPU's and the first TXI moves the second at once: 6 bytes leave 4 for the DTC; 0 at the end.
 assert.deepEqual([v.tx_left_at_write,v.tx_left_at_empty,v.rx_left_after_read,v.write_max],[4,0,4,0x10000]);
 assert.equal(r.emulator.sci9,'DTC!\r\n');
 assert.deepEqual(r.emulator.warn,['[ELC] ELSR0 (ELC_PERIPHERAL_GPT_A)로 연결한 이벤트는 받는 주변장치가 시뮬레이터 모델에 없어 아무 일도 하지 않습니다(모델에 있는 연결: ADC0 스캔 시작).']);
 assert.deepEqual(r.unknown,[]);
});

test('r_dmac: software start (single, repeat), the ELC software event in repeat mode, GPT1 overflow with an interrupt after each repeat, CallbackSet, InfoGet and the return codes — the same on both engines',{skip,timeout:600000},async()=>{
 const names=['level','ends','each','sum','ring_sum','remaining','blocks_left',...list('codes',12)];
 const r=await both(TRANSFER_PROGRAMS.dmac,120,names);
 assert.deepEqual(r.interpreter,r.emulator);
 const v=r.emulator.vars;
 assert.deepEqual(list('codes',12).map(k=>v[k]),[FSP.NOT_OPEN,0,FSP.ALREADY_OPEN,FSP.ASSERTION,0,0,0,FSP.UNSUPPORTED,FSP.UNSUPPORTED,0,0,FSP.NOT_OPEN]);
 // One unit for the single start (7 left), the rest for the repeat start; the ring holds the last repeat (18..21).
 assert.deepEqual([v.remaining,v.sum,v.ring_sum,v.ends],[7,36,18+19+20+21,2]);
 // GPT1 every 5 ms, 3 transfers a repeat: wave_callback at 15, 30 and 45 ms, one repeat left at 55 ms.
 assert.deepEqual([v.each,v.blocks_left,v.level],[3,1,200]);
 assert.deepEqual(r.unknown,[]);
});

test('the example ra_elc_adc_dtc: 16 samples a block from the ELC-started scans, the averages on SCI9 by the UART\'s DTC — the same on both engines',{skip,timeout:600000},async()=>{
 const e=raExample('ra_elc_adc_dtc');
 const r=await both({mcu:e.mcu(),code:e.code,circuit:e.circuit()},1000,['blocks','average_mv'],{500:s=>{s.project.components.find(p=>p.id==='pot').position=80;}});
 assert.deepEqual(r.interpreter,r.emulator);
 // A block every 160 ms (16 x 10 ms): 6 by 1 s. The potentiometer at half, then 80 %: the average follows a block later.
 assert.equal(r.emulator.vars.blocks,6);
 const lines=r.emulator.sci9.trim().split(/\r\n/);
 assert.deepEqual(lines.slice(0,3),['block 1: 1649 mV','block 2: 1649 mV','block 3: 1649 mV']);
 assert.match(lines.at(-1),/^block 6: 26\d\d mV$/);
});
