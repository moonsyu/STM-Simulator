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
import {TRANSFER_REVIEW} from '../fixtures/ra-transfer-review.js';

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

test('r_dtc chain: two pieces of transfer information (written with .transfer_settings_word_b = { … } initializers) in each GPT1 activation, R_DTC_Reconfigure — the same on both engines',{skip,timeout:600000},async()=>{
 const r=await both(TRANSFER_PROGRAMS.chain,57,['irqs','a_sum','b_sum','err']);
 assert.deepEqual(r.interpreter,r.emulator);
 // GPT1 every 5 ms: four activations move both arrays and the fourth (the end) reaches the CPU: 11 overflows by 57 ms, 8 callbacks.
 assert.deepEqual(r.emulator.vars,{irqs:8,a_sum:1+2+3+4,b_sum:5+6+7+8,err:0});
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
 // The link to GPT_A (no modelled consumer) does nothing and says nothing.
 assert.deepEqual(r.emulator.warn,[]);
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

// ---- The review of the first version (tests/fixtures/ra-transfer-review.js): each program on both engines; an engine's
// error is kept (the interpreter refuses repeat-block mode), the variables must be the same, then what FSP gives.
const CIRCUITS={uart:()=>raExample('ra_uart_echo').circuit(),uartpot:()=>raExample('ra_elc_adc_dtc').circuit()};
async function review(name){
 const p=TRANSFER_REVIEW[name],circuit=p.circuit?CIRCUITS[p.circuit]():null;
 const project=validateProject({...projectForBoard('fpb-ra6e1'),mcu:p.mcu,code:p.code,...(circuit?{components:circuit.components,wires:circuit.wires,surfaces:undefined}:{})});
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-transfer-review-'));
 try{
  const result=await build(await prepareBuild({project,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[],name);
  const out={},elf=new Uint8Array(await fs.readFile(result.elf));
  for(const [engine,make]of [['emulator',o=>new FirmwareSession(validateProject(project),{elf,...o})],['interpreter',o=>new SimulationSession(validateProject(project),o)]]){
   const warn=[],uart=[];let error=null,session=null;
   try{session=make({warn:m=>warn.push(m),uart:e=>uart.push(e)});for(let t=1;t<=p.ms;t++){p.at[t]?.(session);session.tick(t);}}catch(e){error=e.message;}
   out[engine]={vars:Object.fromEntries(p.vars.map(v=>[v,session.readVariable(v)])),error,warn,sci9:String.fromCharCode(...uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX').flatMap(e=>e.bytes))};
  }
  return out;
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const same=(r,name)=>{assert.equal(r.emulator.error,null,name);assert.equal(r.interpreter.error,null,name);assert.deepEqual(r.interpreter.vars,r.emulator.vars,name);assert.deepEqual(r.interpreter.sci9,r.emulator.sci9,name);assert.deepEqual(r.emulator.warn,[],name);assert.deepEqual(r.interpreter.warn,[],name);return r.emulator.vars;};

test('review 1: a peripheral\'s interrupt before the DMAC end interrupt of the same event, R_DMAC_Open sets the configured callback again; IRQ pin events before R_ICU_ExternalIrqOpen; SCI events through the ELC',{skip,timeout:600000},async()=>{
 // GPT1 overflow (priority 12) and the DMAC0 end it causes (priority 12): gpt1_callback (101…) first; dmac_cb (2) again after Close / Open.
 let v=same(await review('order'),'order');
 assert.deepEqual(list('seq',8).map(k=>v[k]),[101,102,2,103,3,104,2,105]);
 // S1 at 10 ms starts an ADC0 scan through the ELC before the ICU is open; R_ELC_Open(&ctrl, NULL) on an open ELC: ASSERTION.
 v=same(await review('elc'),'elc');
 assert.deepEqual([v['e[0]'],v['e[3]'],v['v[0]'],v['v[8]'],v['v[1]'],v['v[9]'],v['v[2]'],v['v[10]']],[FSP.ASSERTION,FSP.ASSERTION,1,0,2,0,3,1]);
 // DMAC2 on ICU_IRQ1 copies pin_src at the first press, before R_ICU_ExternalIrqOpen.
 v=same(await review('dmac_ev'),'dmac_ev');
 assert.deepEqual([v['v[0]'],v.pin_copy,v.ends0,v.ends2,v.presses],[5,105,4,1,2]);
 // ADC0 started by SCI9_RXI for each received byte (3), then by SCI9_TEI at the end of a write (1).
 v=same(await review('elc_sci'),'elc_sci');
 assert.deepEqual([v['v[0]'],v['v[1]'],v.chars],[3,4,3]);
});

test('review 2: return codes (R_DTC_Reconfigure with an offset mode, R_DMAC_CallbackSet with NULL on a closed transfer), the UART receive DTC after Abort, a 300-byte DTC write, a repeat-block software start',{skip,timeout:600000},async()=>{
 // R_DTC_Reconfigure with TRANSFER_ADDR_MODE_OFFSET: FSP_ASSERT of r_dtc_length_assert → ASSERTION; the old information stays.
 let v=same(await review('dtc_codes'),'dtc_codes');
 assert.deepEqual([v['e[12]'],v['v[3]'],v['e[29]']],[FSP.ASSERTION,4,26]);
 // R_DMAC_CallbackSet(ctrl, NULL, …) on a closed transfer: ASSERTION before NOT_OPEN; with a callback: NOT_OPEN.
 v=same(await review('dmac_sw'),'dmac_sw');
 assert.deepEqual([v['e[26]'],v['e[27]'],v['e[29]']],[FSP.NOT_OPEN,FSP.ASSERTION,29]);
 // After R_SCI_UART_Abort(RX) the receive DTC keeps what it had left (1 of 4).
 v=same(await review('uart_rx'),'uart_rx');
 assert.deepEqual([v['v[3]'],v['e[2]']],[1,8]);
 // 300 bytes in one R_SCI_UART_Write with the transmit DTC (write_bytes_max 65536).
 const long=await review('uart_long');v=same(long,'uart_long');
 assert.deepEqual([v['e[0]'],v.max,long.emulator.sci9.length],[0,0x10000,300]);
 // TRANSFER_START_MODE_REPEAT on a DMAC in repeat-block mode: the emulator returns (nothing moves), the interpreter stops with
 // the reason (it does not run repeat-block mode).
 const rb=await review('rb');
 assert.equal(rb.emulator.error,null);assert.deepEqual(list('d',4).map(k=>rb.emulator.vars[k]),[0,0,0,0]);assert.deepEqual(list('e',3).map(k=>rb.emulator.vars[k]),[0,0,0]);
 assert.match(rb.interpreter.error,/R_DMAC_Reconfigure: Repeat-Block 모드는 시뮬레이터가 지원하지 않습니다/);
});
