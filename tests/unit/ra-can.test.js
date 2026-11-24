// Feature 40: CAN (r_can g_can0) — the Stacks settings (one message for every bad value), the bit timing from PCLKB, the
// generated FSP files (instance with 32 mailboxes and 8 masks, vectors after the others, r_can_cfg.h; nothing changes
// without the stack), the emulator's CAN0 model (mode changes, filter and mask, message lost, the three test modes, values
// out of range), the virtual node's line format, and the built-in interpreter's R_CAN_* (return codes and callbacks).
import test from 'node:test';
import assert from 'node:assert/strict';
import {Can,CAN_EVENT,parseCanLine,formatCanFrame,canFrameBits} from '../../src/emu/ra6e1/can.js';
import {raDefaultMcu,validateRaMcu,raNameProblem,raCanTiming,RA_CAN_DEFAULTS} from '../../src/ra-config.js';
import {generateRaFiles,raVectors,raInstances} from '../../src/ra-generator.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {raExample} from '../../src/ra-examples.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';

const mcu=peripherals=>({...raDefaultMcu(),peripherals});
const CAN0={enabled:true};
const BAD=/^Error: CAN: 설정을 확인하세요\.$/;

test('CAN stack settings: defaults, one message for every bad value, names the generated code and r_can use',()=>{
 assert.deepEqual(validateRaMcu(mcu({CAN0})).peripherals.CAN0,{enabled:true,...RA_CAN_DEFAULTS,mailboxes:RA_CAN_DEFAULTS.mailboxes.map(m=>({...m}))});
 assert.deepEqual(RA_CAN_DEFAULTS.mailboxes,[{type:'TRANSMIT',id:0},{type:'RECEIVE',id:0x100},{type:'RECEIVE',id:0x101},{type:'RECEIVE',id:0x102}]);
 const ok=validateRaMcu(mcu({CAN0:{enabled:true,bitrate:125,idMode:'EXTENDED',mask:0x1FFFFFFF,mailboxes:[{type:'RECEIVE',id:0x1ABCDEF0},{type:'TRANSMIT',id:0},{type:'TRANSMIT',id:5},{type:'RECEIVE',id:0x800}],priority:0,callback:'my_can'}}));
 assert.equal(ok.peripherals.CAN0.mailboxes[0].id,0x1ABCDEF0);
 for(const bad of [{bitrate:100},{bitrate:'500'},{idMode:'MIXED'},{mask:0x800},{mask:-1},{mailboxes:[]},{mailboxes:[{type:'TRANSMIT',id:0}]},{mailboxes:[{type:'TX',id:0},{type:'RECEIVE',id:1},{type:'RECEIVE',id:2},{type:'RECEIVE',id:3}]},
  {mailboxes:[{type:'TRANSMIT',id:0x800},{type:'RECEIVE',id:1},{type:'RECEIVE',id:2},{type:'RECEIVE',id:3}]},{idMode:'EXTENDED',mask:0x20000000},{priority:16},{priority:1.5},{callback:''},{callback:'1x'},{callback:5}])
  assert.throws(()=>validateRaMcu(mcu({CAN0:{enabled:true,...bad}})),BAD,JSON.stringify(bad));
 assert.throws(()=>validateRaMcu(mcu({CAN0:{}})),BAD);
 // A PCLKB that gives no exact bit timing (HOCO 20 MHz /2 ×13 /4 = 32.5 MHz: 1000 kbps would need 32.5 TQ), and one that does.
 const slow={hocoMHz:20,pllDiv:2,pllMul:13,pclkbDiv:4};
 assert.throws(()=>validateRaMcu({...mcu({CAN0:{enabled:true,bitrate:1000}}),clock:slow}),BAD);
 assert.equal(validateRaMcu({...mcu({CAN0:{enabled:true,bitrate:500}}),clock:slow}).peripherals.CAN0.bitrate,500);
 for(const name of ['g_can0','g_can0_ctrl','g_can0_cfg','g_can0_extended_cfg','g_can0_bit_timing_cfg','g_can0_mailbox','g_can0_mailbox_mask'])assert.match(raNameProblem(name),/인스턴스 이름/,name);
 for(const name of ['can_error_isr','can_rx_isr','can_tx_isr'])assert.match(raNameProblem(name),/ISR/);
 assert.match(raNameProblem('g_can_on_can'),/API 객체/);
 assert.throws(()=>validateRaMcu(mcu({CAN0:{enabled:true,callback:'g_can0_cfg'}})),/인스턴스 이름/);
 // One name for the CAN callback and a UART's: two declarations of different argument types in hal_data.h.
 const m=raExample('ra_uart_echo').mcu();m.peripherals.CAN0={enabled:true,callback:m.peripherals.SCI9.callback};
 assert.throws(()=>validateRaMcu(m),/can_callback_args_t/);
});

test('bit timing from PCLKB 50 MHz: exact rates with the sample point nearest 80 %, TSEG1 > TSEG2 >= SJW, null when none is exact',()=>{
 const t=kbps=>{const x=raCanTiming(50e6,kbps);return [x.brp,x.tseg1,x.tseg2,x.sjw,x.tq,+(x.sample*100).toFixed(2)];};
 assert.deepEqual(t(125),[20,15,4,4,20,80]);assert.deepEqual(t(250),[10,15,4,4,20,80]);assert.deepEqual(t(500),[5,15,4,4,20,80]);assert.deepEqual(t(1000),[5,7,2,2,10,80]);
 for(const kbps of [125,250,500,1000]){const x=raCanTiming(50e6,kbps);assert.equal(50e6/(x.brp*(1+x.tseg1+x.tseg2)),kbps*1000);assert.ok(x.tseg1>x.tseg2&&x.tseg2>=x.sjw&&x.tq>=8&&x.tq<=25);}
 assert.equal(raCanTiming(32.5e6,1000),null);assert.equal(raCanTiming(7e6,1000),null);assert.equal(raCanTiming(50e6,0),null);
});

test('generated files with the CAN stack: g_can0 with 32 mailboxes and 8 masks, its vectors after the others, r_can_cfg.h',()=>{
 const m=raExample('ra_uart_echo').mcu();m.peripherals.USB={enabled:true};
 const before=raVectors(m);m.peripherals.CAN0={enabled:true,priority:5,callback:'can_cb',mask:0x7F0};
 const vectors=raVectors(m);
 assert.deepEqual(vectors.slice(0,before.length),before,'the slots before keep their numbers');
 assert.deepEqual(vectors.slice(before.length).map(v=>[v.vector,v.isr,v.event]),[['CAN0_ERROR','can_error_isr','CAN0_ERROR'],['CAN0_MAILBOX_RX','can_rx_isr','CAN0_MAILBOX_RX'],['CAN0_MAILBOX_TX','can_tx_isr','CAN0_MAILBOX_TX']]);
 assert.equal(raInstances(validateRaMcu(m)).can.name,'g_can0');
 const f=generateRaFiles(validateRaMcu(m)),h=f['ra_gen/hal_data.h'],c=f['ra_gen/hal_data.c'];
 for(const inc of ['r_can.h','r_can_api.h'])assert.ok(h.includes(`#include "${inc}"`),inc);
 for(const re of [/extern const can_instance_t g_can0;/,/extern can_instance_ctrl_t g_can0_ctrl;/,/extern const can_cfg_t g_can0_cfg;/,/extern const can_extended_cfg_t g_can0_extended_cfg;/,/void can_cb\(can_callback_args_t \* p_args\);/])assert.match(h,re);
 for(const line of ['.baud_rate_prescaler        = 5,','.time_segment_1             = 15,','.time_segment_2             = 4,','.synchronization_jump_width = 4','.clock_source   = CAN_CLOCK_SOURCE_PCLKB,','.global_id_mode = CAN_GLOBAL_ID_MODE_STANDARD,','.mailbox_count  = 4,','.message_mode   = CAN_MESSAGE_MODE_OVERWRITE,','.p_fifo_int_cfg = NULL,','.p_rx_fifo_cfg  = NULL,',
  '.channel      = 0,','.p_callback   = can_cb,','.ipl          = (5),','.error_irq    = VECTOR_NUMBER_CAN0_ERROR,','.rx_irq       = VECTOR_NUMBER_CAN0_MAILBOX_RX,','.tx_irq       = VECTOR_NUMBER_CAN0_MAILBOX_TX,','.p_api  = &g_can_on_can'])assert.ok(c.includes(line),line);
 assert.equal((c.match(/\{ \.mailbox_id = /g)||[]).length,32,'32 mailbox entries');
 assert.ok(c.includes('{ .mailbox_id = 0x100, .id_mode = CAN_ID_MODE_STANDARD, .frame_type = CAN_FRAME_TYPE_DATA, .mailbox_type = CAN_MAILBOX_RECEIVE }, /* MB1 */'));
 assert.ok(c.includes('{ .mailbox_id = 0x000, .id_mode = CAN_ID_MODE_STANDARD, .frame_type = CAN_FRAME_TYPE_DATA, .mailbox_type = CAN_MAILBOX_TRANSMIT }, /* MB31 */'));
 assert.ok(c.includes('0x000007F0, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF'));
 assert.match(f['ra_gen/vector_data.c'],/\[\d+\] = can_rx_isr, \/\* CAN0 MAILBOX_RX \(Reception complete interrupt\) \*\//);
 const cfg=f['ra_cfg/fsp_cfg/r_can_cfg.h'];
 for(const line of ['#define CAN_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)','#define CAN_CFG_FIFO_SUPPORT (0)'])assert.ok(cfg.includes(line),line);
 // Extended IDs: the global mode and the IDs as 29-bit values.
 const ext=generateRaFiles(validateRaMcu(mcu({CAN0:{enabled:true,idMode:'EXTENDED',mailboxes:[{type:'TRANSMIT',id:0},{type:'RECEIVE',id:0x1ABCDEF0},{type:'RECEIVE',id:1},{type:'RECEIVE',id:2}]}})))['ra_gen/hal_data.c'];
 assert.ok(ext.includes('.global_id_mode = CAN_GLOBAL_ID_MODE_EXTENDED,'));assert.ok(ext.includes('.mailbox_id = 0x1ABCDEF0, .id_mode = CAN_ID_MODE_EXTENDED'));
});

test('without the CAN stack the generated files are as before (no r_can header or cfg); a disabled stack is none',()=>{
 for(const m of [raDefaultMcu(),raExample('ra_uart_echo').mcu(),raExample('ra_usb_cdc_echo').mcu()]){
  const f=generateRaFiles(validateRaMcu(m)),off=generateRaFiles(validateRaMcu({...m,peripherals:{...(m.peripherals||{}),CAN0:{enabled:false}}}));
  assert.deepEqual(off,f);
  assert.ok(!Object.keys(f).some(k=>/r_can/.test(k)));assert.ok(!/r_can|can_|CAN0/.test(f['ra_gen/hal_data.h']+f['ra_gen/hal_data.c']+f['ra_gen/vector_data.h']+f['ra_gen/vector_data.c']));
 }
});

test('Developer Assistance for g_can0: Open, ModeTransition, Write, InfoGet, Close and the callback',()=>{
 const entry=raAssistance(validateRaMcu(mcu({CAN0}))).find(e=>e.name==='g_can0');
 assert.equal(entry.title,'CAN (r_can)');
 assert.deepEqual(entry.items.map(i=>i.label),['Call R_CAN_Open()','Call R_CAN_ModeTransition()','Call R_CAN_Write()','Call R_CAN_InfoGet()','Call R_CAN_Close()','Callback function definition']);
 assert.match(entry.items.at(-1).code,/^void can_callback\(can_callback_args_t \*p_args\)/);assert.match(entry.items.at(-1).code,/CAN_EVENT_RX_COMPLETE[\s\S]*CAN_EVENT_TX_COMPLETE/);
});

// A CAN0 model with a scheduler of its own (PCLKB 50 MHz), as the SoC gives it time and events.
function bench(){
 const events=[],raised=[],soc={t:0,stopped:false,clock:{pclkb:50e6},mstp:{peek:()=>soc.stopped?1<<2:0},nowUs:()=>soc.t,after:(us,fn)=>events.push({at:soc.t+us,fn}),raiseEvent:ev=>raised.push(ev)};
 const can=new Can(soc);
 const run=us=>{const end=soc.t+us;for(;;){events.sort((a,b)=>a.at-b.at);const e=events[0];if(!e||e.at>end)break;events.shift();soc.t=e.at;e.fn();}soc.t=end;};
 return {can,soc,raised,run};
}
const W=(d,off,v,size=1)=>d.write(off,v,size),R=(d,off,size=1)=>d.read(off,size);
const STR=0x842,CTLR=0x840,MCTL=0x820,MSMR=0x853,MSSR=0x852,TCR=0x858,MB=j=>0x200+16*j;
// What r_can's Open leaves: 500 kbps (BRP 5, TSEG1 15, TSEG2 4, SJW 4), MB0 transmit, MB1 receive 0x100, MB2 receive 0x200
// (masks invalid), interrupts enabled, CAN operation mode.
function open(can,{idfm=0,mlm=0,mask=null}={}){
 W(can,CTLR,(can.read(CTLR,2)&~0x400),2);W(can,CTLR,(idfm<<1)|(mlm<<3)|(3<<6)|(1<<8),2);
 W(can,0x844,((5-1)<<16)|((15-1)<<28)|((4-1)<<8)|((4-1)<<12),4);W(can,CTLR,(can.read(CTLR,2)&~0x300)|0x200,2);
 const id=v=>idfm===1?v:v<<18;
 W(can,MB(1),id(0x100),4);W(can,MCTL+1,0x40);W(can,MB(2),id(0x200),4);W(can,MCTL+2,0x40);
 if(mask!==null){W(can,0x400,idfm===1?mask:mask<<18,4);W(can,0x428,0xfffffff0,4);}else W(can,0x428,0xffffffff,4);
 W(can,CTLR,can.read(CTLR,2)&~0x300,2);W(can,0x84c,0x3e);W(can,0x42c,0xffffffff,4);
}
const send=(can,j,id,data,{ext=false,remote=false,idfm=0}={})=>{W(can,MB(j),(ext&&idfm!==1?0x80000000:0)|(remote?0x40000000:0)|(ext?id:id<<18),4);W(can,MB(j)+4,data.length,2);data.forEach((b,i)=>W(can,MB(j)+6+i,b));W(can,MCTL+j,0x80);};

test('CAN0 model: reset is sleep + reset mode, CANM / SLPM change STR at once, TSRC reads back 0, module stop',()=>{
 const {can,soc}=bench();
 assert.equal(R(can,CTLR,2),0x0500);assert.equal(R(can,STR,2)&0x700,0x500,'sleep (RSTST and SLPST)');
 W(can,CTLR,0x0100,2);assert.equal(R(can,STR,2)&0x700,0x100,'reset');W(can,CTLR,0x0200,2);assert.equal(R(can,STR,2)&0x700,0x200,'halt');
 W(can,CTLR,0x0600,2);assert.equal(R(can,STR,2)&0x700,0x600,'sleep from halt');W(can,CTLR,0x0000,2);assert.equal(R(can,STR,2)&0x700,0,'operation');
 W(can,CTLR,0x0400,2);assert.equal(R(can,STR,2)&0x700,0,'SLPM in operation mode is ignored');
 W(can,CTLR,0x0020,2);assert.equal(R(can,CTLR,2)&0x20,0,'TSRC');
 W(can,0x400,0x12345678,4);assert.equal(R(can,0x400,4),0x12345678,'MKR0 keeps what is written');
 W(can,TCR,0xff);assert.equal(R(can,TCR),7);
 soc.stopped=true;assert.equal(R(can,0x400,4),0);W(can,0x400,0,4);soc.stopped=false;assert.equal(R(can,0x400,4),0x12345678);
 // Values out of range: no exception (past the block, DLC 15, BRP 0, every MSMR mode).
 assert.doesNotThrow(()=>{R(can,0x85c,4);W(can,0x900,1,4);W(can,MSMR,3);R(can,MSSR);W(can,0x851,0x10);assert.equal(R(can,MSSR),4);W(can,MB(5)+4,15,2);send(can,6,0x7ff,[1,2,3,4,5,6,7,8,9]);});
});

test('CAN0 model: internal loopback — MB0 frame back into MB1, receive then transmit interrupt, MSSR searches, MCTL write rules',()=>{
 const {can,raised,run}=bench();open(can);
 W(can,CTLR,R(can,CTLR,2)|0x200,2);W(can,TCR,7);W(can,CTLR,R(can,CTLR,2)&~0x300,2);
 send(can,0,0x100,[0x5a,0x01]);assert.equal(R(can,MCTL)&0x80,0x80,'TRMREQ');
 run(canFrameBits({extended:false,remote:false,dlc:2})*2-1);assert.deepEqual(raised,[],'not yet (63 bits at 2 µs)');
 assert.equal(R(can,MCTL)&2,2,'TRMACTIVE');run(1);
 assert.deepEqual(raised,[CAN_EVENT.MAILBOX_RX,CAN_EVENT.MAILBOX_TX]);
 assert.equal(R(can,STR,2)&3,3,'NDST and SDST');assert.equal(R(can,MB(1),4)>>>18,0x100);assert.equal(R(can,MB(1)+4,2),2);assert.deepEqual([R(can,MB(1)+6),R(can,MB(1)+7)],[0x5a,1]);
 W(can,MSMR,0);assert.equal(R(can,MSSR),1);W(can,MSMR,1);assert.equal(R(can,MSSR),0);W(can,MSMR,2);assert.equal(R(can,MSSR),0x80,'no message lost');
 // NEWDATA cleared by 0 (MSGLOST written 1 stays); SENTDATA needs TRMREQ cleared first (two writes of 0).
 W(can,MCTL+1,0x44);assert.equal(R(can,MCTL+1),0x40);
 W(can,MCTL,0);assert.equal(R(can,MCTL),0x01,'TRMREQ cleared, SENTDATA stays');W(can,MCTL,0);assert.equal(R(can,MCTL),0);
 assert.deepEqual(can.node.output,[],'internal loopback: nothing on the bus');
});

test('CAN0 model: acceptance filter and mask, standard / extended / remote, the lowest ID goes first, the node hears normal mode',()=>{
 const {can,raised,run}=bench();open(can,{mask:0x700});
 // MB1 0x100 with mask 0x700 (MKR0 covers MB0-3): any 0x1xx; MB2 0x200 with the mask too (same group).
 can.node.send('1AB 01');run(1000);assert.equal(R(can,MB(1),4)>>>18,0x1ab,'0x1AB matches 0x100 under 0x700');
 can.node.send('2FF 02');run(1000);assert.equal(R(can,MB(2),4)>>>18,0x2ff);
 const before=raised.length;can.node.send('3FF 03');can.node.send('123 R 2');can.node.send('1ABCDEF0 04');run(3000);
 assert.equal(raised.length,before,'0x3FF, a remote frame and an extended frame match no mailbox');
 // Two transmit mailboxes waiting: the lower ID first (ID priority), mailbox order with CTLR.TPM.
 // (requested in halt mode, so both wait when the bus becomes free)
 const both=()=>{W(can,CTLR,R(can,CTLR,2)|0x200,2);send(can,0,0x300,[1]);send(can,3,0x050,[2]);W(can,CTLR,R(can,CTLR,2)&~0x300,2);run(2000);};
 both();assert.deepEqual(can.node.output,['050 [1] 02','300 [1] 01']);
 W(can,MCTL,0);W(can,MCTL,0);W(can,MCTL+3,0);W(can,MCTL+3,0);
 W(can,CTLR,R(can,CTLR,2)|0x10,2);both();assert.deepEqual(can.node.output.slice(2),['300 [1] 01','050 [1] 02']);
 // Extended ID mode: 29-bit IDs, remote frames by RTR.
 const x=bench();open(x.can,{idfm:1});W(x.can,MB(2),0x40000000|0x1abcdef0,4);
 x.can.node.send('1ABCDEF0 R 4');x.can.node.send('00000100 09');x.run(3000);
 assert.equal(x.can.read(MB(2),4)>>>0,(0x40000000|0x1abcdef0)>>>0);assert.equal(x.can.read(MB(2)+4,2),4);assert.equal(x.can.read(MB(1)+6,1),9);
 x.can.write(MB(0),0x40000000|0x1abcdef0,4);x.can.write(MB(0)+4,3,2);x.can.write(MCTL,0x80,1);x.run(1000);assert.deepEqual(x.can.node.output,['1ABCDEF0 [3] R']);
});

test('CAN0 model: message lost — overwrite mode replaces the frame without the error interrupt, overrun mode keeps it and raises it',()=>{
 for(const mlm of [0,1]){
  const {can,raised,run}=bench();open(can,{mlm});
  can.node.send('100 01');can.node.send('100 02');run(1000);
  assert.equal(R(can,MCTL+1)&0x05,0x05,'NEWDATA and MSGLOST');assert.equal(R(can,STR,2)&0x10,0x10,'NMLST');
  W(can,MSMR,2);assert.equal(R(can,MSSR),1);
  if(mlm===0){assert.equal(R(can,MB(1)+6),2,'overwritten');assert.deepEqual(raised,[CAN_EVENT.MAILBOX_RX,CAN_EVENT.MAILBOX_RX]);assert.equal(R(can,0x84d),0);}
  else{assert.equal(R(can,MB(1)+6),1,'kept');assert.deepEqual(raised,[CAN_EVENT.MAILBOX_RX,CAN_EVENT.ERROR]);assert.equal(R(can,0x84d),0x20,'EIFR.ORIF');W(can,0x84d,0);assert.equal(R(can,0x84d),0);}
  W(can,MCTL+1,R(can,MCTL+1)&~4);assert.equal(R(can,STR,2)&0x10,0,'MSGLOST cleared');
 }
});

test('CAN0 model: listen only, external loopback, halt / reset / sleep modes',()=>{
 const setTest=(can,tcr)=>{W(can,CTLR,R(can,CTLR,2)|0x200,2);W(can,TCR,tcr);W(can,CTLR,R(can,CTLR,2)&~0x300,2);};
 // Listen only: hears the node, sends nothing (the request waits).
 const l=bench();open(l.can);setTest(l.can,3);send(l.can,0,0x123,[1]);l.can.node.send('100 05');l.run(2000);
 assert.equal(l.can.read(MB(1)+6,1),5);assert.deepEqual(l.can.node.output,[]);assert.equal(l.can.read(MCTL,1),0x80,'still pending');
 // External loopback: the frame goes to the node and into MB1.
 const e=bench();open(e.can);setTest(e.can,5);send(e.can,0,0x100,[7]);e.run(1000);
 assert.deepEqual(e.can.node.output,['100 [1] 07']);assert.equal(e.can.read(MB(1)+6,1),7);assert.deepEqual(e.raised,[CAN_EVENT.MAILBOX_RX,CAN_EVENT.MAILBOX_TX]);
 // Halt: nothing goes or comes; the request goes out back in operation mode. Reset mode clears the requests.
 const h=bench();open(h.can);W(h.can,CTLR,R(h.can,CTLR,2)|0x200,2);send(h.can,0,0x100,[1]);assert.equal(h.can.node.send('100 09'),6,'a frame (lost: the board does not hear the bus)');h.run(2000);
 assert.deepEqual(h.can.node.output,[]);assert.equal(h.can.read(MCTL+1,1)&1,0);
 W(h.can,CTLR,R(h.can,CTLR,2)&~0x300,2);h.run(1000);assert.deepEqual(h.can.node.output,['100 [1] 01']);
 send(h.can,0,0x100,[2]);W(h.can,MCTL,0);W(h.can,MCTL,0);send(h.can,0,0x101,[3]);W(h.can,CTLR,R(h.can,CTLR,2)|0x100,2);
 assert.equal(h.can.read(MCTL,1),0,'reset mode clears MCTL');W(h.can,CTLR,R(h.can,CTLR,2)&~0x300,2);h.run(2000);assert.equal(h.can.node.output.length,1,'the dropped request never goes');
});

test('virtual node line format: standard, extended, remote frames; what is not a frame',()=>{
 assert.deepEqual(parseCanLine('123 01 02 03\r\n'),{id:0x123,extended:false,remote:false,dlc:3,data:[1,2,3]});
 assert.deepEqual(parseCanLine('0x7ff'),{id:0x7ff,extended:false,remote:false,dlc:0,data:[]});
 assert.deepEqual(parseCanLine('0123 ab'),{id:0x123,extended:true,remote:false,dlc:1,data:[0xab]},'4 digits: extended');
 assert.deepEqual(parseCanLine('800 0xFF'),{id:0x800,extended:true,remote:false,dlc:1,data:[0xff]},'above 0x7FF: extended');
 assert.deepEqual(parseCanLine('123 r 4'),{id:0x123,extended:false,remote:true,dlc:4,data:[]});
 for(const bad of ['','  \n','xyz','123 100','123 1 2 3 4 5 6 7 8 9','20000000 1','123 R','123 R 9','123 R 1 2','123 0x','123456789'])assert.equal(parseCanLine(bad),null,JSON.stringify(bad));
 assert.equal(formatCanFrame({id:0x123,extended:false,remote:false,dlc:3,data:[1,2,0xab]}),'123 [3] 01 02 AB');
 assert.equal(formatCanFrame({id:0x1abcdef0,extended:true,remote:false,dlc:0,data:[]}),'1ABCDEF0 [0]');
 assert.equal(formatCanFrame({id:0x5,extended:false,remote:true,dlc:4,data:[]}),'005 [4] R');
});

// The built-in interpreter's R_CAN_* with the CAN stack.
function interp(code,can={enabled:true}){
 const base=projectForBoard('fpb-ra6e1'),m=raDefaultMcu();m.peripherals={CAN0:can};
 const warn=[],project=validateProject({...base,mcu:m,code:'#include "hal_data.h"\n'+code+'\nvoid external_irq1_callback(external_irq_callback_args_t *p_args){(void)p_args;}\n'});
 const session=new SimulationSession(project,{warn:w=>warn.push(w)});
 return {session,warn,run:ms=>{for(let t=Math.floor(session.time)+1;t<=ms;t++)session.tick(t);}};
}

test('interpreter: R_CAN_* return codes as r_can.c gives them, and the callbacks in loopback',()=>{
 const {session,warn,run}=interp(`
volatile int32_t e[12];
volatile int32_t ev[8];
volatile int32_t mb[8];
volatile int32_t nev = 0;
can_info_t info;
void can_callback(can_callback_args_t *p_args)
{
    if (nev < 8) { ev[nev] = (int32_t) p_args->event; mb[nev] = (int32_t) p_args->mailbox; nev++; }
}
void hal_entry(void)
{
    can_frame_t f = { .id = 0x100, .id_mode = CAN_ID_MODE_STANDARD, .type = CAN_FRAME_TYPE_DATA, .data_length_code = 1, .options = 0 };
    e[0] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    e[1] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[2] = (int32_t) R_CAN_Open(&g_can0_ctrl, &g_can0_cfg);
    e[3] = (int32_t) R_CAN_ModeTransition(&g_can0_ctrl, CAN_OPERATION_MODE_NORMAL, CAN_TEST_MODE_LOOPBACK_INTERNAL);
    e[4] = (int32_t) R_CAN_Write(&g_can0_ctrl, 4, &f);
    e[5] = (int32_t) R_CAN_Write(&g_can0_ctrl, 1, &f);
    f.data_length_code = 9;
    e[6] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    f.data_length_code = 1;
    e[7] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    e[8] = (int32_t) R_CAN_Write(&g_can0_ctrl, 0, &f);
    e[9] = (int32_t) R_CAN_Read(&g_can0_ctrl, 1, &f);
    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);
    e[10] = (int32_t) R_CAN_InfoGet(&g_can0_ctrl, &info);
    e[11] = (int32_t) R_CAN_Close(&g_can0_ctrl);
    while (1) { R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS); }
}`);
 run(10);
 assert.deepEqual(Array.from({length:12},(_,i)=>session.readVariable(`e[${i}]`)),[7,0,14,0,3,60004,3,0,60003,6,0,0]);
 assert.deepEqual(Array.from({length:session.readVariable('nev')},(_,i)=>[session.readVariable(`ev[${i}]`),session.readVariable(`mb[${i}]`)]),[[0x400,1],[0x800,0]]);
 assert.equal(session.readVariable('info.status')&0x700,0,'operation mode');assert.deepEqual(warn,[]);
});

test('interpreter: the loopback example, the virtual node in normal mode, and R_CAN_* without the CAN stack is an unsupported API',()=>{
 const e=raExample('ra_can_loopback'),base=projectForBoard('fpb-ra6e1');
 const session=new SimulationSession(validateProject({...base,mcu:e.mcu(),code:e.code}));
 for(let t=1;t<=2200;t++)session.tick(t);
 assert.deepEqual(['g_tx_count','g_rx_count','g_rx_data'].map(n=>session.readVariable(n)),[5,5,4]);assert.ok(session.runtime.gpio.P407.value>1.65,'LED2');
 const normal=new SimulationSession(validateProject({...base,mcu:e.mcu(),code:e.code.replace(/^\s*R_CAN_ModeTransition\(.*\n/m,'')}));
 for(let t=1;t<=300;t++)normal.tick(t);
 assert.equal(normal.inject('100 01 02\n','can:node'),10);assert.equal(normal.inject('not a frame','can:node'),0);for(let t=301;t<=600;t++)normal.tick(t);
 assert.deepEqual(normal.canOutput,['100 [1] 00','100 [1] 01']);assert.equal(normal.readVariable('g_rx_count'),1);assert.equal(normal.readVariable('g_rx_data'),1);
 const plain=new SimulationSession(validateProject({...base,code:'#include "hal_data.h"\nvoid hal_entry(void)\n{\n    R_CAN_Open(0, 0);\n}\nvoid external_irq1_callback(external_irq_callback_args_t *p_args){(void)p_args;}\n'}));
 assert.throws(()=>{for(let t=1;t<=5;t++)plain.tick(t);},/지원하지 않는 FSP API: R_CAN_Open/);
 assert.equal(plain.inject('100 01','can:node'),0);assert.deepEqual(plain.canOutput,[]);
});
