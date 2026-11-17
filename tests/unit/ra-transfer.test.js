// Feature 36: the RA Event Link Controller (r_elc), DTC (r_dtc) and DMAC (r_dmac) — the settings and their checks
// (ra-config.js), the generated files RASC writes for them (ra-generator.js), the RA6E1 emulator's ELC / DTC / DMAC at the
// register level (src/emu/ra6e1/elc.js, dtc.js, dmac.js) and the built-in interpreter's calls (fsp-transfer.js) for what
// it refuses with a reason. (The real drivers on both engines: tests/toolchain/ra-transfer.test.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import {Machine} from '../../src/emu/machine.js';
import {Ra6e1,RaBus} from '../../src/emu/ra6e1/soc.js';
import {RA_IRQ_PINS,raDefaultMcu,validateRaMcu,RA_ELC_EVENTS,raTransferEvents,raEventHasVector,raNameProblem} from '../../src/ra-config.js';
import {generateRaFiles,raVectors} from '../../src/ra-generator.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {raExample} from '../../src/ra-examples.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';

const peripheral=signal=>({function:'Peripheral',signal});
/** The FPB-RA6E1 with SCI9 on D0/D1, A0 analog and the given stacks. */
function mcu(peripherals,pins={}){
 const m=raDefaultMcu();Object.assign(m.pins,{P109:peripheral('SCI9_TXD'),P110:peripheral('SCI9_RXD'),P000:{function:'Analog',label:'POT'},...pins});
 m.peripherals={SCI9:{enabled:true,baud:115200,callback:'user_uart9_callback',priority:12},ADC0:{enabled:true,mode:'SINGLE',resolution:12,callback:'adc_callback',priority:12},...peripherals};
 return m;
}

test('settings: ELC events and peripherals of the RA6E1, the checks across stacks and their reasons',()=>{
 assert.equal(RA_ELC_EVENTS.GPT1_COUNTER_OVERFLOW,0xcf);assert.equal(RA_ELC_EVENTS.ADC0_SCAN_END,0x160);assert.equal(RA_ELC_EVENTS.SCI9_TXI,0x1b7);assert.equal(RA_ELC_EVENTS.AGT1_INT,0x43);assert.equal(RA_ELC_EVENTS.DMAC3_INT,0x23);assert.equal(RA_ELC_EVENTS.ELC_SOFTWARE_EVENT_1,0xb6);
 assert.ok(raTransferEvents('DMAC').includes('SOFTWARE'));assert.ok(!raTransferEvents('DTC').includes('SOFTWARE'));assert.ok(!raTransferEvents('DTC').some(e=>/^SCI|^DMAC|ELC_SOFT/.test(e)));
 // An ADC started by the ELC needs g_elc; continuous scan is not an ELC mode.
 assert.throws(()=>validateRaMcu(mcu({ADC0:{enabled:true,mode:'SINGLE',resolution:12,trigger:'ELC',elcEvent:'GPT1_COUNTER_OVERFLOW'}})),/Event Link Controller\(g_elc\)를 추가하세요/);
 assert.throws(()=>validateRaMcu(mcu({ELC:{enabled:true},ADC0:{enabled:true,mode:'CONTINUOUS',resolution:12,trigger:'ELC'}})),/Single Scan에서/);
 const ok=validateRaMcu(mcu({ELC:{enabled:true},ADC0:{enabled:true,mode:'SINGLE',resolution:12,callback:'adc_callback',trigger:'ELC'}}));
 assert.deepEqual([ok.peripherals.ADC0.trigger,ok.peripherals.ADC0.elcEvent],['ELC','GPT1_COUNTER_OVERFLOW']);
 // Earlier projects keep their shape: no trigger field is a software start.
 assert.equal(validateRaMcu(mcu({})).peripherals.ADC0.trigger,undefined);
 // A DTC moves on an interrupt with a vector; one DTC per event; one transfer per DMAC channel.
 assert.throws(()=>validateRaMcu(mcu({GPT1:{enabled:true,mode:'PERIODIC',period:10,unit:'ms'},TRANSFER0:{enabled:true,driver:'DTC',activation:'GPT1_COUNTER_OVERFLOW'}})),/인터럽트 벡터가 있는 이벤트로만 움직입니다\. GPT1_COUNTER_OVERFLOW의 스택에서 콜백/);
 assert.throws(()=>validateRaMcu(mcu({TRANSFER0:{enabled:true,driver:'DTC'},TRANSFER1:{enabled:true,driver:'DTC'}})),/ADC0_SCAN_END에는 이미 TRANSFER0이\(가\) 있습니다/);
 assert.throws(()=>validateRaMcu(mcu({TRANSFER0:{enabled:true,driver:'DMAC',channel:2,activation:'SOFTWARE'},TRANSFER1:{enabled:true,driver:'DMAC',channel:2,activation:'ADC0_SCAN_END'}})),/DMAC 채널 2은\(는\) 이미 TRANSFER0에서/);
 assert.throws(()=>validateRaMcu(mcu({TRANSFER0:{enabled:true,driver:'DTC',activation:'SOFTWARE'}})),/DTC는 인터럽트 이벤트로만/);
 assert.throws(()=>validateRaMcu(mcu({TRANSFER0:{enabled:true,driver:'DMAC',activation:'SCI9_TXI'}})),/UART\(g_uart9\)의 송신·수신 전송으로 정하세요/);
 assert.throws(()=>validateRaMcu(mcu({TRANSFER0:{enabled:true,driver:'DMAC',mode:'REPEAT_BLOCK'}})),/Repeat-Block은 시뮬레이터가 지원하지 않습니다/);
 assert.throws(()=>validateRaMcu(mcu({TRANSFER0:{enabled:true,driver:'DTC',mode:'REPEAT',length:300}})),/Number of Transfers는 0~256/);
 // A UART's transfer: a DTC, set to the channel's own event (whatever it said before), owned once.
 const uart=validateRaMcu(mcu({SCI9:{enabled:true,baud:115200,callback:'user_uart9_callback',transferTx:'TRANSFER3',transferRx:'TRANSFER4'},TRANSFER3:{enabled:true,driver:'DTC',activation:'ADC0_SCAN_END'},TRANSFER4:{enabled:true,driver:'DTC'}}));
 assert.deepEqual([uart.peripherals.TRANSFER3.activation,uart.peripherals.TRANSFER3.owner,uart.peripherals.TRANSFER4.activation],['SCI9_TXI','SCI9_TX','SCI9_RXI']);
 assert.throws(()=>validateRaMcu(mcu({SCI9:{enabled:true,baud:115200,transferTx:'TRANSFER0'},TRANSFER0:{enabled:true,driver:'DMAC',channel:0}})),/UART \+ DMAC는 시뮬레이터가 확인하지 못해 지원하지 않습니다/);
 assert.throws(()=>validateRaMcu(mcu({SCI9:{enabled:true,baud:115200,transferTx:'TRANSFER0',transferRx:'TRANSFER0'},TRANSFER0:{enabled:true,driver:'DTC'}})),/TRANSFER0은\(는\) 이미 SCI9 TX의 전송입니다/);
 assert.throws(()=>validateRaMcu(mcu({SCI9:{enabled:true,baud:115200,transferTx:'TRANSFER7'}})),/송신 전송 TRANSFER7이\(가\) Stacks에 없습니다/);
 // The DMAC callback is a function of its own argument type; the generated names are refused as symbols.
 assert.throws(()=>validateRaMcu(mcu({TRANSFER0:{enabled:true,driver:'DMAC',channel:0,activation:'SOFTWARE',callback:'adc_callback'}})),/인자 형식이 다릅니다\(dmac_callback_args_t \/ adc_callback_args_t\)|인자 형식이 다릅니다\(adc_callback_args_t \/ dmac_callback_args_t\)/);
 for(const name of ['g_transfer0','g_transfer2_info','g_elc','g_elc_cfg','dmac_int_isr','g_transfer_on_dtc'])assert.notEqual(raNameProblem(name),'',name);
 assert.equal(raEventHasVector(validateRaMcu(mcu({})),'ADC0_SCAN_END'),true);assert.equal(raEventHasVector(validateRaMcu(mcu({ADC0:{enabled:true,mode:'SINGLE',resolution:12}})),'ADC0_SCAN_END'),false);
});

test('generated files: g_transferN (r_dtc / r_dmac), the UART\'s p_transfer_tx, g_elc with elc_data.c, the ADC ELC trigger, the DMAC vector and the DTC vector table section',()=>{
 const m=validateRaMcu(raExample('ra_elc_adc_dtc').mcu());
 m.peripherals.TRANSFER2={enabled:true,driver:'DMAC',channel:5,activation:'ELC_SOFTWARE_EVENT_0',mode:'REPEAT',size:4,srcMode:'INCREMENTED',destMode:'INCREMENTED',repeatArea:'SOURCE',irq:'EACH',length:8,blocks:3,callback:'dmac_done',priority:9};
 const f=generateRaFiles(validateRaMcu(m)),c=f['ra_gen/hal_data.c'],h=f['ra_gen/hal_data.h'];
 for(const inc of ['r_dtc.h','r_dmac.h','r_transfer_api.h','r_elc.h','r_elc_api.h'])assert.match(h,new RegExp(`#include "${inc.replace('.','\\.')}"`));
 assert.match(h,/extern dtc_instance_ctrl_t g_transfer0_ctrl;[\s\S]*extern dmac_instance_ctrl_t g_transfer2_ctrl;[\s\S]*void dmac_done\(dmac_callback_args_t \* p_args\);[\s\S]*extern const elc_instance_t g_elc;/);
 assert.match(c,/transfer_info_t g_transfer0_info DTC_TRANSFER_INFO_ALIGNMENT =\n\{\n    \.transfer_settings_word_b\.dest_addr_mode = TRANSFER_ADDR_MODE_INCREMENTED,[\s\S]*\.size           = TRANSFER_SIZE_2_BYTE,\n    \.transfer_settings_word_b\.mode           = TRANSFER_MODE_NORMAL,[\s\S]*\.length                                  = 16,/);
 assert.match(c,/const dtc_extended_cfg_t g_transfer0_cfg_extend =\n\{\n    \.activation_source   = VECTOR_NUMBER_ADC0_SCAN_END,/);
 // The UART's DTC: r_sci_uart rewrites it in Open, generated as RASC leaves it (1 byte, source incremented, TDR fixed).
 assert.match(c,/g_transfer1_info DTC_TRANSFER_INFO_ALIGNMENT =\n\{\n    \.transfer_settings_word_b\.dest_addr_mode = TRANSFER_ADDR_MODE_FIXED,[\s\S]*src_addr_mode  = TRANSFER_ADDR_MODE_INCREMENTED,[\s\S]*TRANSFER_SIZE_1_BYTE/);
 assert.match(c,/\.activation_source   = VECTOR_NUMBER_SCI9_TXI,/);assert.match(c,/\.p_transfer_tx       = &g_transfer1,\n    \.p_transfer_rx       = NULL,/);
 assert.match(c,/const dmac_extended_cfg_t g_transfer2_extend =\n\{[\s\S]*\.irq                 = VECTOR_NUMBER_DMAC5_INT,[\s\S]*\.ipl                 = \(9\),\n    \.channel             = 5,\n    \.p_callback          = dmac_done,[\s\S]*\.activation_source   = ELC_EVENT_ELC_SOFTWARE_EVENT_0,/);
 assert.match(c,/\.p_api         = &g_transfer_on_dtc[\s\S]*\.p_api         = &g_transfer_on_dmac/);
 assert.ok(c.indexOf('g_transfer1 =')<c.indexOf('const uart_cfg_t g_uart9_cfg'),'the transfer before the UART that points at it');
 assert.match(c,/elc_instance_ctrl_t g_elc_ctrl;[\s\S]*\.p_api  = &g_elc_on_elc,/);
 assert.match(c,/\.trigger             = ADC_START_SOURCE_ELC_AD0,/);
 assert.match(f['ra_gen/elc_data.c'],/\.link\[ELC_PERIPHERAL_ADC0\] = ELC_EVENT_GPT1_COUNTER_OVERFLOW, \/\* GPT1 COUNTER OVERFLOW \*\/\n    \.link\[ELC_PERIPHERAL_ADC0_B\] = ELC_EVENT_NONE, \/\* No allocation \*\//);
 assert.match(f['ra_cfg/fsp_cfg/r_sci_uart_cfg.h'],/#define SCI_UART_CFG_DTC_SUPPORTED \(1\)/);
 assert.match(f['ra_cfg/fsp_cfg/r_dtc_cfg.h'],/#define DTC_CFG_VECTOR_TABLE_SECTION_NAME "\.fsp_dtc_vector_table"/);
 assert.match(f['script/fsp.ld'],/__ram_dtc_vector\$\$ \(NOLOAD\) : ALIGN\(1024\)\n  \{\n    \*\(\.fsp_dtc_vector_table\)/);
 assert.deepEqual(raVectors(validateRaMcu(m)).slice(-1).map(v=>[v.vector,v.isr]),[['DMAC5_INT','dmac_int_isr']]);
 // Without these stacks nothing changes: no elc_data.c, no DTC support in r_sci_uart.
 const plain=generateRaFiles(validateRaMcu(raExample('ra_uart_echo').mcu()));
 assert.equal(plain['ra_gen/elc_data.c'],undefined);assert.match(plain['ra_cfg/fsp_cfg/r_sci_uart_cfg.h'],/DTC_SUPPORTED \(0\)/);assert.doesNotMatch(plain['ra_gen/hal_data.h'],/r_dtc|r_elc/);
 // Developer Assistance: g_elc and the transfers (the UART's lists only InfoGet, R_SCI_UART_Open opens it).
 const help=raAssistance(validateRaMcu(m));
 assert.deepEqual(help.filter(x=>/^g_(elc|transfer)/.test(x.name)).map(x=>x.name),['g_elc','g_transfer0','g_transfer1','g_transfer2']);
 assert.match(help.find(x=>x.name==='g_transfer0').items.map(i=>i.code).join('\n'),/R_ADC_InfoGet\(&g_adc0_ctrl, &adc_info\);\nR_DTC_Reset\(&g_transfer0_ctrl, \(const void \*\) adc_info\.p_address/);
 assert.deepEqual(help.find(x=>x.name==='g_transfer1').items.map(i=>i.label),['Call R_DTC_InfoGet()']);
 assert.match(help.find(x=>x.name==='g_transfer2').items.map(i=>i.code).join('\n'),/void dmac_done\(dmac_callback_args_t \*p_args\)/);
});

const DTC=0x40005400,ICU=0x40006000,ELC=0x40082000,ADC=0x40170000,DMAC=0x40005000,IELSR=n=>ICU+0x300+4*n,DELSR=n=>ICU+0x280+4*n;
function chip(){
 const warnings=[],machine=new Machine({bus:new RaBus()});
 const soc=new Ra6e1(machine,{warn:m=>warnings.push(m)},{irqPins:RA_IRQ_PINS});
 const us=n=>{machine.cpu.cycles+=Math.round(n*soc.clock.iclk/1e6);soc.sync();};
 return {machine,soc,bus:machine.bus,warnings,us};
}
// A transfer_info_t in RAM: word 0 (MRA b31:24, MRB b23:16), SAR, DAR, CRB (+12), CRA (+14).
function info(bus,at,{md=0,sz=0,sm=0,dm=0,dts=0,disel=0,chne=0,chns=0,sar,dar,cra,crb=0}){
 bus.write32(at,(((md<<6)|(sz<<4)|(sm<<2))<<24|((chne<<7)|(chns<<6)|(disel<<5)|(dts<<4)|(dm<<2))<<16)>>>0);
 bus.write32(at+4,sar);bus.write32(at+8,dar);bus.write16(at+12,crb);bus.write16(at+14,cra);
}

test('emulator DTC: the vector table, normal / repeat / block transfers with write-back, DTCE cleared at the end and the interrupt then, a chain',()=>{
 const {bus,soc}=chip(),table=0x20001000,src=0x20002000,dst=0x20003000;
 for(let i=0;i<16;i++)bus.write8(src+i,0x10+i);
 bus.write32(DTC+0x14,table);bus.write8(DTC+0x0c,1);assert.equal(bus.read32(DTC+0x04),table,'DTCVBR_SEC is DTCVBR (secure flat project)');
 // Slot 3 on ELC_SOFTWARE_EVENT_0 with DTCE: normal, 1 byte, source incremented, 3 transfers.
 bus.write32(table+12,0x20004000);info(bus,0x20004000,{md:0,sz:0,sm:2,dm:2,sar:src,dar:dst,cra:3});
 bus.write32(IELSR(3),0x1000000|0xb5);
 const ir=()=>!!(bus.read32(IELSR(3))&0x10000),dtce=()=>!!(bus.read32(IELSR(3))&0x1000000);
 soc.raiseEvent(0xb5);assert.equal(bus.read8(dst),0x10);assert.equal(ir(),false,'the DTC took the event');assert.equal(bus.read16(0x20004000+14),2);assert.equal(bus.read32(0x20004000+4),src+1);
 soc.raiseEvent(0xb5);soc.raiseEvent(0xb5);
 assert.deepEqual([0,1,2].map(i=>bus.read8(dst+i)),[0x10,0x11,0x12]);assert.equal(ir(),true,'the end goes to the CPU');assert.equal(dtce(),false,'and clears DTCE');
 // Repeat: source is the repeat area (4 bytes), destination fixed: the pattern goes round.
 info(bus,0x20004000,{md:1,sz:0,sm:2,dm:0,dts:1,sar:src,dar:dst+0x20,cra:(4<<8)|4});bus.write32(IELSR(3),0x1000000|0xb5);
 const seen=[];for(let i=0;i<6;i++){soc.raiseEvent(0xb5);seen.push(bus.read8(dst+0x20));}
 assert.deepEqual(seen,[0x10,0x11,0x12,0x13,0x10,0x11]);assert.equal(dtce(),true,'a repeat transfer never ends');assert.equal(ir(),false);
 // Block: 2 halfwords a block, 2 blocks; the source block area goes back after each block, the destination goes on.
 info(bus,0x20004000,{md:2,sz:1,sm:2,dm:2,dts:1,sar:src,dar:dst+0x40,cra:(2<<8)|2,crb:2});bus.write32(IELSR(3),0x1000000|0xb5);
 soc.raiseEvent(0xb5);assert.equal(ir(),false);soc.raiseEvent(0xb5);assert.equal(ir(),true);
 assert.deepEqual([0,1,2,3].map(i=>bus.read16(dst+0x40+2*i)),[0x1110,0x1312,0x1110,0x1312]);
 // DISEL (TRANSFER_IRQ_EACH): every transfer reaches the CPU, DTCE stays.
 info(bus,0x20004000,{md:1,sz:0,sm:2,dm:0,dts:1,disel:1,sar:src,dar:dst,cra:(2<<8)|2});bus.write32(IELSR(3),0x1000000|0xb5);
 soc.raiseEvent(0xb5);assert.equal(ir(),true);assert.equal(dtce(),true);
 // Chain (CHNE, CHNS 0): two informations in one activation.
 info(bus,0x20004000,{md:0,sz:0,sm:2,dm:2,chne:1,sar:src,dar:dst+0x60,cra:5});info(bus,0x20004010,{md:0,sz:0,sm:2,dm:2,sar:src+8,dar:dst+0x70,cra:5});
 bus.write32(IELSR(3),0x1000000|0xb5);soc.raiseEvent(0xb5);assert.deepEqual([bus.read8(dst+0x60),bus.read8(dst+0x70)],[0x10,0x18]);
 assert.ok(soc.dtc.transfers>0);
});

test('emulator ELC: ELCR, the software event through ELSEGR, ELSR8 starts an ADC0 scan with the ELC trigger, another link is said once',()=>{
 const {bus,soc,warnings,us}=chip();
 // ADC0: AN000, TRGE, TRSA = ELC_AD0 (as R_ADC_Open and ScanStart write them).
 bus.write16(ADC+0x04,1);bus.write16(ADC+0x10,0x09<<8);bus.write16(ADC+0x00,0x0200|0x1000);
 bus.write16(ELC+0x10+8*4,0xb5);
 const gen=()=>{bus.write8(ELC+0x02,0x00);bus.write8(ELC+0x02,0x40);bus.write8(ELC+0x02,0x41);};
 gen();us(5);assert.equal(soc.adc0.scans,0,'ELCON off: nothing');
 bus.write8(ELC,0x80);assert.equal(bus.read8(ELC),0x80);
 bus.write8(ELC+0x02,0x00);bus.write8(ELC+0x02,0x41);us(5);assert.equal(soc.adc0.scans,0,"SEG without WE set first: no event");
 gen();assert.equal(bus.read16(ADC)&0x8000,0x8000,'ADST set by the trigger');us(5);assert.equal(soc.adc0.scans,1);assert.equal(bus.read16(ADC)&0x8000,0);
 // A trigger without TRGE does nothing.
 bus.write16(ADC+0x00,0x1000);gen();us(5);assert.equal(soc.adc0.scans,1);
 bus.write16(ELC+0x10,0xb5);gen();gen();
 assert.deepEqual(warnings.filter(w=>/^\[ELC\]/.test(w)),['[ELC] ELSR0 (ELC_PERIPHERAL_GPT_A)로 연결한 이벤트는 받는 주변장치가 시뮬레이터 모델에 없어 아무 일도 하지 않습니다(모델에 있는 연결: ADC0 스캔 시작).']);
 // A GPT overflow a link takes is planned once the link is there (listens).
 assert.equal(soc.listens(0xcf),false);bus.write16(ELC+0x10+8*4,0xcf);assert.equal(soc.listens(0xcf),true);
});

test('emulator DMAC: DELSR in the ICU, a software start (single / repeat), repeat mode with the repeat-size interrupt, the end event DMACn_INT',()=>{
 const {bus,soc}=chip(),src=0x20002000,dst=0x20003000,ch=n=>DMAC+0x40*n;
 for(let i=0;i<8;i++)bus.write32(src+4*i,i+1);
 bus.write8(DMAC+0x200,1);
 // Channel 0: software, normal, 4 bytes, both incremented, 8 transfers, DTIE.
 bus.write32(ch(0),src);bus.write32(ch(0)+4,dst);bus.write32(ch(0)+8,8);bus.write16(ch(0)+0x10,(0<<14)|(2<<8)|(2<<12));bus.write16(ch(0)+0x14,(2<<14)|(2<<6));bus.write8(ch(0)+0x13,0x10);
 bus.write32(IELSR(0),0x20);bus.write8(ch(0)+0x1c,1);
 bus.write8(ch(0)+0x1d,0x01);assert.equal(bus.read32(dst),1);assert.equal(bus.read32(dst+4),0,'CLRS 0: one transfer');assert.equal(bus.read8(ch(0)+0x1d)&1,0,'SWREQ cleared');
 bus.write8(ch(0)+0x1d,0x11);assert.deepEqual([0,1,2,3,4,5,6,7].map(i=>bus.read32(dst+4*i)),[1,2,3,4,5,6,7,8]);
 assert.equal(bus.read8(ch(0)+0x1c),0,'DTE cleared at the end');assert.equal(bus.read8(ch(0)+0x1e)&0x10,0x10,'DTIF');assert.equal(bus.read32(IELSR(0))&0x10000,0x10000,'DMAC0_INT reached the ICU');
 bus.write8(ch(0)+0x1e,0);assert.equal(bus.read8(ch(0)+0x1e),0,'flags clear by writing 0');
 // Channel 1 on AGT0's event (DELSR1 in the ICU), repeat: 2 bytes of destination area, 3 repeats, RPTIE.
 bus.write32(ch(1),src);bus.write32(ch(1)+4,dst+0x40);bus.write32(ch(1)+8,(2<<16)|2);bus.write32(ch(1)+0xc,3);bus.write16(ch(1)+0x10,(1<<14)|(0<<8)|(0<<12)|1);bus.write16(ch(1)+0x14,(2<<14)|(2<<6));bus.write8(ch(1)+0x13,0x14);
 bus.write32(DELSR(1),0x40);bus.write8(ch(1)+0x1c,1);assert.equal(soc.listens(0x40),true);
 soc.raiseEvent(0x40);soc.raiseEvent(0x40);
 assert.equal(bus.read8(ch(1)+0x1c),0,'the repeat-size end stops the channel (RPTIE)');assert.equal(bus.read8(ch(1)+0x1e)&1,1,'ESIF');assert.equal(bus.read32(ch(1)+0xc),2,'DMCRB counts the repeats');
 assert.deepEqual([bus.read8(dst+0x40),bus.read8(dst+0x41)],[1,0]);
 bus.write8(ch(1)+0x1c,1);soc.raiseEvent(0x40);soc.raiseEvent(0x40);bus.write8(ch(1)+0x1c,1);soc.raiseEvent(0x40);soc.raiseEvent(0x40);
 assert.equal(bus.read32(ch(1)+0xc),0);assert.equal(bus.read8(ch(1)+0x1e)&0x10,0x10,'the end');assert.equal(bus.read32(ch(1)),src+6);
 soc.raiseEvent(0x40);assert.equal(bus.read32(ch(1)),src+6,'stopped');
});

// The interpreter's reasons: a transfer between values of another size, a DTC write while the UART still sends.
function interp(code,peripherals,ms=50){
 const project=validateProject({...projectForBoard('fpb-ra6e1'),mcu:mcu(peripherals),code:`#include "hal_data.h"\nvoid user_uart9_callback(uart_callback_args_t *p_args) { (void) p_args; }\nvoid adc_callback(adc_callback_args_t *p_args) { (void) p_args; }\n${code}`});
 const s=new SimulationSession(project,{});let error=null;try{for(let t=1;t<=ms;t++)s.tick(t);}catch(e){error=e.message;}return {s,error};
}
test('interpreter: a transfer moves elements of its size only; a UART write while its DTC still sends stops with the reason; R_DTC_* on a DMAC instance',()=>{
 const sizes=interp(`static uint8_t from[4] = {1, 2, 3, 4};\nstatic uint32_t to[4];\nvoid hal_entry(void)\n{\n    R_DMAC_Open(&g_transfer0_ctrl, &g_transfer0_cfg);\n    R_DMAC_Reset(&g_transfer0_ctrl, from, to, 4);\n    R_DMAC_SoftwareStart(&g_transfer0_ctrl, TRANSFER_START_MODE_REPEAT);\n    while (1) { R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS); }\n}\n`,
  {TRANSFER0:{enabled:true,driver:'DMAC',channel:0,activation:'SOFTWARE',size:1,srcMode:'INCREMENTED',destMode:'INCREMENTED',length:4}});
 assert.match(sizes.error,/p_dest의 원소는 4바이트인데 전송 단위는 1바이트입니다/);
 const busy=interp(`void hal_entry(void)\n{\n    R_SCI_UART_Open(&g_uart9_ctrl, &g_uart9_cfg);\n    R_SCI_UART_Write(&g_uart9_ctrl, (uint8_t *) "hello", 5);\n    R_SCI_UART_Write(&g_uart9_ctrl, (uint8_t *) "again", 5);\n    while (1) { R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS); }\n}\n`,
  {SCI9:{enabled:true,baud:115200,callback:'user_uart9_callback',transferTx:'TRANSFER0'},TRANSFER0:{enabled:true,driver:'DTC'}});
 assert.match(busy.error,/DTC 송신이 끝나기 전에 다시 불렀습니다[\s\S]*UART_EVENT_TX_COMPLETE를 기다린 뒤/);
 const wrong=interp(`void hal_entry(void)\n{\n    R_DTC_Open(&g_transfer0_ctrl, &g_transfer0_cfg);\n}\n`,{TRANSFER0:{enabled:true,driver:'DMAC',channel:1,activation:'SOFTWARE'}});
 assert.match(wrong.error,/g_transfer0은\(는\) DMAC \(r_dmac\) 전송입니다\. R_DMAC_Open를 쓰세요/);
});
