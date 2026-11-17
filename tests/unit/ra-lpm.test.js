// Feature 37: RA6E1 low power modes (r_lpm g_lpm0) — the Stacks settings and their checks, the generated FSP files
// (hal_data, r_lpm_cfg.h), and the run log entries both engines write (ra-lpm.js LpmLog).
import test from 'node:test';
import assert from 'node:assert/strict';
import {raDefaultMcu,validateRaMcu,raNameProblem,RA_IRQ_DS,RA_IRQ_PINS,RA_LPM_WAKE,RA_LPM_CANCEL,RA_LPM_WAKE_BITS,RA_LPM_CANCEL_BITS,RA_LPM_WUPEN_MASK,RA_LPM_DPSIER_MASK,RA_LPM_DPSIEGR_MASK,raLpmMask,raDsPin} from '../../src/ra-config.js';
import {generateRaFiles,raInstances} from '../../src/ra-generator.js';
import {raExample} from '../../src/ra-examples.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {LpmLog,lpmWakeNames,lpmCancelNames,lpmWakeLabel,lpmCancelLabel,lpmIrqLabel,lpmWakeOfIrq,lpmCancelOfIrq,lpmReason,lpmDeepDetail} from '../../src/ra-lpm.js';

const mcu=peripherals=>({...raDefaultMcu(),peripherals});

test('LPM settings: defaults, the modes, the sources each mode has, an edge needs its source',()=>{
 const m=validateRaMcu(mcu({LPM:{enabled:true}}));
 assert.deepEqual(m.peripherals.LPM,{enabled:true,mode:'SLEEP',wake:[],ioKeep:true,power:'DEEPCUT0',cancel:[],cancelRising:[]});
 const d=validateRaMcu(mcu({LPM:{enabled:true,mode:'DEEP',wake:['RTCALM','IRQ1'],cancel:['RTC_ALARM','IRQ1','IRQ4'],cancelRising:['IRQ4'],ioKeep:false,power:'DEEPCUT1'}})).peripherals.LPM;
 assert.deepEqual(d.wake,['IRQ1','RTCALM'],'in bit order');assert.deepEqual(d.cancel,['IRQ1','IRQ4','RTC_ALARM']);assert.deepEqual(d.cancelRising,['IRQ4']);assert.equal(d.ioKeep,false);assert.equal(d.power,'DEEPCUT1');
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,mode:'SNOOZE'}})),/저전력 모드는 Sleep · Software Standby · Deep Software Standby/);
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,wake:['LVD1']}})),/깨우는 소스 LVD1은\(는\) 고를 수 없습니다/);
 // IRQ2 and IRQ3 have no DPSIER bit on the RA6E1 (BSP_FEATURE_LPM_DPSIER_MASK): R_LPM_Open would return FSP_ERR_INVALID_MODE.
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,cancel:['IRQ2']}})),/해제 소스 IRQ2은\(는\) 고를 수 없습니다/);
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,cancel:['IRQ1'],cancelRising:['IRQ4']}})),/IRQ4-DS의 엣지를 정하려면 해제 소스에도 IRQ4/);
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,cancelRising:['RTC_ALARM']}})),/상승 엣지로 해제할 IRQn-DS RTC_ALARM/);
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,power:'DEEPCUT2'}})),/DEEPCUT0 · DEEPCUT1 · DEEPCUT3/);
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,ioKeep:1}})),/IOKEEP/);
 assert.throws(()=>validateRaMcu(mcu({LPM:{enabled:true,wake:'IRQ1'}})),/깨우는 소스를 확인하세요/);
 // A stack that is turned off is not generated: its contents do not refuse the project (valid ones are kept).
 assert.deepEqual(validateRaMcu(mcu({LPM:{enabled:false,mode:'SNOOZE',wake:['LVD1']}})).peripherals.LPM,{enabled:false,mode:'SLEEP',wake:[],ioKeep:true,power:'DEEPCUT0',cancel:[],cancelRising:[]});
 assert.equal(validateRaMcu(mcu({LPM:{enabled:false,mode:'DEEP',cancel:['IRQ1']}})).peripherals.LPM.mode,'DEEP');
 assert.equal(raNameProblem('g_lpm0_cfg').includes('인스턴스'),true);assert.equal(raNameProblem('g_lpm_on_lpm').includes('API 객체'),true);
});

test('the source tables are the RA6E1 masks of FSP (bsp_feature.h) and every cancel IRQ has its IRQn-DS pin',()=>{
 const or=bits=>Object.values(bits).reduce((v,b)=>v+2**b,0);
 assert.equal(or(RA_LPM_WAKE_BITS),RA_LPM_WUPEN_MASK,'BSP_FEATURE_ICU_WUPEN_MASK 0x7FB0DFFFF');
 assert.equal(or(RA_LPM_CANCEL_BITS),RA_LPM_DPSIER_MASK,'BSP_FEATURE_LPM_DPSIER_MASK');
 assert.equal(RA_LPM_DPSIEGR_MASK,0x0013dff3);
 assert.ok(RA_LPM_WAKE.every(n=>RA_LPM_WAKE_BITS[n]!=null));assert.ok(RA_LPM_CANCEL.every(n=>RA_LPM_CANCEL_BITS[n]!=null));
 for(const n of RA_LPM_CANCEL.filter(x=>/^IRQ/.test(x))){const pin=raDsPin(Number(n.slice(3)));assert.ok(RA_IRQ_DS.includes(pin),n);assert.equal(RA_IRQ_PINS[pin],Number(n.slice(3)));}
 assert.equal(raDsPin(1),'P205','S1 is IRQ1-DS');assert.equal(raDsPin(13),null,'IRQ13 has no -DS pin');
 assert.deepEqual(raLpmMask(['IRQ1','RTCALM','AGT3UD'],RA_LPM_WAKE_BITS),[0x01000002,1],'WUPEN, WUPEN1');
 assert.deepEqual(raLpmMask(['IRQ1','RTC_ALARM'],RA_LPM_CANCEL_BITS),[0x00080002,0]);
});

test('generated files: g_lpm0 in hal_data with the FSP enumerators, r_lpm_cfg.h, nothing without the stack',()=>{
 const files=generateRaFiles(validateRaMcu(mcu({LPM:{enabled:true,mode:'DEEP',wake:['IRQ1','RTCPRD','AGT3UD'],cancel:['IRQ1','IRQ4','RTC_INTERVAL'],cancelRising:['IRQ4'],ioKeep:true,power:'DEEPCUT0'}})));
 const h=files['ra_gen/hal_data.h'],c=files['ra_gen/hal_data.c'];
 assert.match(h,/#include "r_lpm\.h"\n#include "r_lpm_api\.h"/);assert.match(h,/extern const lpm_instance_t g_lpm0;/);assert.match(h,/extern lpm_instance_ctrl_t g_lpm0_ctrl;\nextern const lpm_cfg_t g_lpm0_cfg;/);
 assert.match(c,/lpm_instance_ctrl_t g_lpm0_ctrl;/);assert.match(c,/\.low_power_mode\s+= LPM_MODE_DEEP,/);
 assert.match(c,/\.standby_wake_sources\s+= LPM_STANDBY_WAKE_SOURCE_IRQ1 \| LPM_STANDBY_WAKE_SOURCE_RTCPRD \| LPM_STANDBY_WAKE_SOURCE_AGT3UD \| \(lpm_standby_wake_source_t\) 0,/);
 assert.match(c,/\.io_port_state\s+= LPM_IO_PORT_NO_CHANGE,/);assert.match(c,/\.power_supply_state\s+= LPM_POWER_SUPPLY_DEEPCUT0,/);
 assert.match(c,/\.deep_standby_cancel_source = LPM_DEEP_STANDBY_CANCEL_SOURCE_IRQ1 \| LPM_DEEP_STANDBY_CANCEL_SOURCE_IRQ4 \| LPM_DEEP_STANDBY_CANCEL_SOURCE_RTC_INTERVAL \| \(lpm_deep_standby_cancel_source_t\) 0,/);
 assert.match(c,/\.deep_standby_cancel_edge\s+= LPM_DEEP_STANDBY_CANCEL_SOURCE_IRQ1_FALLING \| LPM_DEEP_STANDBY_CANCEL_SOURCE_IRQ4_RISING \| \(lpm_deep_standby_cancel_edge_t\) 0,/);
 assert.match(c,/\.p_api\s+= &g_lpm_on_lpm,/);
 assert.match(files['ra_cfg/fsp_cfg/r_lpm_cfg.h'],/#define LPM_CFG_PARAM_CHECKING_ENABLE \(BSP_CFG_PARAM_CHECKING_ENABLE\)\n#define LPM_CFG_STANDBY_LIMIT \(0\)/);
 const sleep=generateRaFiles(validateRaMcu(mcu({LPM:{enabled:true,ioKeep:false}})))['ra_gen/hal_data.c'];
 assert.match(sleep,/LPM_MODE_SLEEP,/);assert.match(sleep,/\.standby_wake_sources\s+= \(lpm_standby_wake_source_t\) 0,/);assert.match(sleep,/LPM_IO_PORT_RESET,/);assert.match(sleep,/\.deep_standby_cancel_edge\s+= \(lpm_deep_standby_cancel_edge_t\) 0,/);
 const none=generateRaFiles(validateRaMcu(raDefaultMcu()));
 assert.doesNotMatch(none['ra_gen/hal_data.h'],/lpm/);assert.doesNotMatch(none['ra_gen/hal_data.c'],/lpm/);assert.ok(none['ra_cfg/fsp_cfg/r_lpm_cfg.h'],'the module configuration header is always there, as for the other drivers');
 assert.equal(raInstances(validateRaMcu(raDefaultMcu())).lpm,null);assert.equal(raInstances(validateRaMcu(mcu({LPM:{enabled:true}}))).lpm.name,'g_lpm0');
 // A project without the stack generates what it did before (a disabled stack is not generated either).
 assert.deepEqual(generateRaFiles(validateRaMcu(mcu({LPM:{enabled:false,mode:'DEEP'}})))['ra_gen/hal_data.c'],none['ra_gen/hal_data.c']);
});

test('Developer Assistance lists g_lpm0 with its calls and the start-after-Deep-Software-Standby snippet',()=>{
 const group=raAssistance(validateRaMcu(mcu({LPM:{enabled:true,mode:'DEEP',cancel:['IRQ1']}}))).find(g=>g.name==='g_lpm0');
 assert.equal(group.title,'Low Power Modes (r_lpm)');
 assert.deepEqual(group.items.map(i=>i.label),['Call R_LPM_Open()','Call R_LPM_LowPowerModeEnter()','Call R_LPM_LowPowerReconfigure()','Call R_LPM_IoKeepClear()','Call R_LPM_Close()','Start after Deep Software Standby (RSTSR0.DPSRSTF)']);
 assert.match(group.items[5].code,/if \(1U == R_SYSTEM->RSTSR0_b\.DPSRSTF\)[\s\S]*R_LPM_IoKeepClear\(NULL\);/);
 assert.equal(raAssistance(validateRaMcu(raDefaultMcu())).some(g=>g.name==='g_lpm0'),false);
});

test('example ra_lpm_deep: Deep Software Standby cancelled by IRQ1-DS, S1 left as the IRQ1-DS pin',()=>{
 const e=raExample('ra_lpm_deep'),m=validateRaMcu(e.mcu());
 assert.deepEqual(m.peripherals.LPM,{enabled:true,mode:'DEEP',wake:['IRQ1'],ioKeep:true,power:'DEEPCUT0',cancel:['IRQ1'],cancelRising:[]});
 assert.equal(m.pins.P205.function,'IRQ','S1 is the IRQ1-DS pin');assert.match(e.code,/R_LPM_LowPowerModeEnter\(&g_lpm0_ctrl\);/);
});

test('source names: WUPEN and DPSIER masks to names, the labels of the log, an interrupt to its wake source',()=>{
 assert.deepEqual(lpmWakeNames(0x13000002,1),['IRQ1','RTCALM','RTCPRD','AGT1UD','AGT3UD']);
 assert.deepEqual(lpmCancelNames(0x040c0012),['IRQ1','IRQ4','RTC_INTERVAL','RTC_ALARM','AGT1']);
 assert.equal(lpmWakeLabel('IRQ1'),'IRQ1');assert.equal(lpmWakeLabel('RTCALM'),'RTC 알람');assert.equal(lpmWakeLabel('AGT3UD'),'AGT3 언더플로');
 assert.equal(lpmCancelLabel('IRQ1'),'IRQ1-DS(P205)');assert.equal(lpmCancelLabel('IRQ6'),'IRQ6-DS(P000)');assert.equal(lpmCancelLabel('RTC_INTERVAL'),'RTC 주기');
 assert.equal(lpmIrqLabel('ICU_IRQ1'),'IRQ1');assert.equal(lpmIrqLabel('AGT1_INT'),'AGT1 언더플로');assert.equal(lpmIrqLabel('RTC_PERIOD'),'RTC 주기');assert.equal(lpmIrqLabel('GPT4_COUNTER_OVERFLOW'),'GPT4 오버플로');assert.equal(lpmIrqLabel('SCI9_RXI'),'SCI9_RXI');
 assert.equal(lpmWakeOfIrq('ICU_IRQ12'),'IRQ12');assert.equal(lpmWakeOfIrq('RTC_ALARM'),'RTCALM');assert.equal(lpmWakeOfIrq('AGT3_INT'),'AGT3UD');assert.equal(lpmWakeOfIrq('AGT0_INT'),null);assert.equal(lpmWakeOfIrq('SCI9_RXI'),null);
 assert.equal(lpmCancelOfIrq('RTC_PERIOD'),'RTC_INTERVAL');assert.equal(lpmCancelOfIrq('AGT1_INT'),'AGT1');assert.equal(lpmCancelOfIrq('ICU_IRQ1'),null,'a pin source is the IRQn-DS pin, not the ICU request');
 assert.equal(lpmReason('IRQ1','OFF'),'IRQ1: 인터럽트가 켜져 있지 않습니다');assert.equal(lpmDeepDetail(0,1),'DEEPCUT0, I/O 유지(IOKEEP 1)');assert.equal(lpmDeepDetail(1,0),'DEEPCUT1, I/O 리셋 상태로(IOKEEP 0)');
});

test('run log: Sleep once per program start, Software Standby at most every 0.5 s, Deep Software Standby always; a wake-up with its entry',()=>{
 const out=[],log=new LpmLog(m=>out.push(m));
 log.enter('SLEEP',0);log.wake('SLEEP','IRQ1',498900);log.enter('SLEEP',600000);log.wake('SLEEP','IRQ1',1000);
 assert.deepEqual(out,['Sleep 진입 · CPU 정지, 주변장치는 계속 동작 — 인터럽트가 깨웁니다 (이후의 Sleep 진입·깨어남은 적지 않습니다)','Sleep에서 깨어남 · IRQ1 (498.9 ms 뒤)']);
 out.length=0;
 log.enter('STANDBY',1e6,{sources:['IRQ1','RTC 알람']});log.wake('STANDBY','RTC 알람',2.5e6);
 log.enter('STANDBY',1.2e6,{sources:['IRQ1']});log.wake('STANDBY','IRQ1',100);
 log.enter('STANDBY',1.6e6,{sources:[]});log.wake('STANDBY','IRQ1',100);
 assert.deepEqual(out,['Software Standby 진입 · 클록 정지 — 깨우는 소스: IRQ1, RTC 알람','Software Standby에서 깨어남 · RTC 알람 (2.50 s 뒤)','Software Standby 진입 · 클록 정지 — 깨우는 소스: 없음','Software Standby에서 깨어남 · IRQ1 (0.1 ms 뒤)']);
 out.length=0;
 log.enter('DEEP',2e6,{sources:['IRQ1-DS(P205)'],detail:lpmDeepDetail(0,1)});log.wake('DEEP','IRQ1-DS(P205)',300000,{hold:true});
 log.enter('DEEP',2.1e6,{sources:[]});log.wake('DEEP','RTC 알람',1000);
 assert.deepEqual(out,['Deep Software Standby 진입 · DEEPCUT0, I/O 유지(IOKEEP 1) — 해제 소스: IRQ1-DS(P205)','Deep Software Standby 해제 · IRQ1-DS(P205) (300.0 ms 뒤) — MCU 리셋(RSTSR0.DPSRSTF = 1, I/O는 R_LPM_IoKeepClear까지 유지)',
  'Deep Software Standby 진입 · 해제 소스: 없음(리셋만)','Deep Software Standby 해제 · RTC 알람 (1.0 ms 뒤) — MCU 리셋(RSTSR0.DPSRSTF = 1)']);
 out.length=0;
 log.stuck('STANDBY',[lpmReason('IRQ1','OFF')]);log.stuck('STANDBY',[lpmReason('IRQ1','OFF')]);log.stuck('DEEP',['설정된 소스가 없습니다']);
 assert.deepEqual(out,['Software Standby: 깨울 수 있는 소스가 없습니다 — IRQ1: 인터럽트가 켜져 있지 않습니다. 리셋(S2)으로만 다시 시작합니다.','Deep Software Standby: 깨울 수 있는 소스가 없습니다 — 설정된 소스가 없습니다. 리셋(S2)으로만 다시 시작합니다.']);
 // A new program start: Sleep is logged again.
 out.length=0;log.reset();log.enter('SLEEP',5e6);assert.equal(out.length,1);
});
