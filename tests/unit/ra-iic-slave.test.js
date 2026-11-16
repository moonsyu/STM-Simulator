// Feature 33: the RA6E1 I2C slave (r_iic_slave g_i2c_slaveN on IIC0 / IIC1) — settings, the generated FSP files, the
// built-in interpreter (R_IIC_SLAVE_* and the callback's events as r_iic_slave.c orders them), the emulator's slave
// model at its registers, and the example with an ESP32 sketch as the master.
import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raExample} from '../../src/ra-examples.js';
import {generateRaFiles,raVectors,raInstances} from '../../src/ra-generator.js';
import {raDefaultMcu,validateRaMcu,raNameProblem,raIicSlaveClock,RA_IIC_SLAVE_ADDRESS} from '../../src/ra-config.js';
import {fspPrelude} from '../../src/fsp-interp.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {createBoardDrivers} from '../../src/fixed-run.js';
import {connectStm32Drivers} from '../../src/stm32-boards.js';
import {Iic,IIC_EVENT_BASE} from '../../src/emu/ra6e1/iic.js';
import {SLAVE_PROBE,SLAVE_SEQUENCES,slaveProbeMcu} from './helpers/ra-iic-slave.js';

const slave=(extra={})=>{const m=slaveProbeMcu();Object.assign(m.peripherals.IIC0,extra);return m;};
const base=()=>projectForBoard('fpb-ra6e1');
function open(project){
 const log={print:[],trace:[],warn:[],board:[]},checked=validateProject(project);
 const session=new SimulationSession(checked,{print:t=>log.print.push(t),trace:e=>log.trace.push(e),warn:m=>log.warn.push(m)});
 session.circuit.drivers=createBoardDrivers(checked,{log:s=>log.board.push(s)});session.buses.boards=()=>session.circuit.drivers;connectStm32Drivers(session);
 return {session,log};
}
const run=(s,ms,step=20)=>{for(let t=Math.floor(s.time/step)*step+step;t<=ms+1e-9;t+=step)s.tick(t);};

test('settings: an IIC channel is a master or a slave; the slave has its own 7-bit address, a callback and a priority',()=>{
 const v=validateRaMcu(slave({slave:undefined,callback:undefined,priority:undefined}));
 assert.deepEqual(v.peripherals.IIC0,{enabled:true,mode:'SLAVE',rate:'STANDARD',slave:RA_IIC_SLAVE_ADDRESS,callback:'i2c_slave0_callback',priority:12});
 // A master keeps the shape it had (no mode key), also when 'MASTER' is written out.
 const master=slave({mode:'MASTER',slave:0x50,callback:'i2c_master0_callback'});assert.deepEqual(validateRaMcu(master).peripherals.IIC0,{enabled:true,rate:'STANDARD',slave:0x50,callback:'i2c_master0_callback',priority:12});
 assert.throws(()=>validateRaMcu(slave({mode:'BOTH'})),/동작 모드는 Master\(r_iic_master\) 또는 Slave\(r_iic_slave\)/);
 for(const bad of [0x00,0x07,0x78,0x7f,0x80,1.5])assert.throws(()=>validateRaMcu(slave({slave:bad})),/자기 주소는 7비트 0x08~0x77/,String(bad));
 assert.throws(()=>validateRaMcu(slave({callback:'9x'})),/R_IIC_SLAVE_Read/);
 assert.equal(validateRaMcu(slave({rate:'FASTPLUS'})).peripherals.IIC0.rate,'FASTPLUS','Fast-mode Plus on IIC0');
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),peripherals:{IIC1:{enabled:false,mode:'SLAVE',rate:'FASTPLUS'}}}),/IIC1: 속도/);
 const noSda=slave();delete noSda.pins.P401;assert.throws(()=>validateRaMcu(noSda),/SCL과 SDA/);
 // The callback's argument type is the slave's: a name shared with the S1 interrupt callback is two declarations.
 assert.throws(()=>validateRaMcu(slave({callback:'external_irq1_callback'})),/IIC0: 콜백 이름 external_irq1_callback.*i2c_slave_callback_args_t/);
 for(const name of ['g_i2c_slave0','g_i2c_slave1_ctrl','g_i2c_slave0_cfg','g_i2c_slave0_extend'])assert.match(raNameProblem(name),/인스턴스 이름/,name);
 for(const name of ['iic_slave_rxi_isr','iic_slave_eri_isr'])assert.match(raNameProblem(name),/ISR/,name);
 assert.match(raNameProblem('g_i2c_slave_on_iic'),/API 객체/);
 assert.deepEqual(raIicSlaveClock(50e6,'STANDARD'),{cks:3,brl:30,filter:0});
 // Saved and loaded with the project.
 const p=validateProject(JSON.parse(JSON.stringify(validateProject({...base(),mcu:slave({slave:0x30})}))));assert.equal(p.mcu.peripherals.IIC0.mode,'SLAVE');assert.equal(p.mcu.peripherals.IIC0.slave,0x30);
});

test('generated files: g_i2c_slave0 in hal_data, the IIC0 vectors with the slave ISRs after the existing ones, r_iic_slave_cfg.h',()=>{
 const mcu=validateRaMcu(slave({slave:0x30,priority:5})),f=generateRaFiles(mcu,{board:{fspBoard:true}}),c=f['ra_gen/hal_data.c'],h=f['ra_gen/hal_data.h'];
 assert.ok(h.includes('#include "r_iic_slave.h"\n#include "r_i2c_slave_api.h"')&&!h.includes('r_iic_master.h'));
 assert.ok(h.includes('extern const i2c_slave_instance_t g_i2c_slave0;')&&h.includes('extern iic_slave_instance_ctrl_t g_i2c_slave0_ctrl;')&&h.includes('void i2c_slave0_callback(i2c_slave_callback_args_t * p_args);'));
 for(const text of ['iic_slave_instance_ctrl_t g_i2c_slave0_ctrl;','.clock_settings.cks_value = 3, .clock_settings.brl_value = 30, .clock_settings.digital_filter_stages = 0','.rate                = I2C_SLAVE_RATE_STANDARD,','.slave               = 0x30,','.general_call_enable = false,','.addr_mode           = I2C_SLAVE_ADDR_MODE_7BIT,','.p_callback          = i2c_slave0_callback,','.ipl                 = (5),','.eri_ipl             = (5),','.clock_stretching_enable = true,','.p_api         = &g_i2c_slave_on_iic','.rxi_irq             = VECTOR_NUMBER_IIC0_RXI,'])assert.ok(c.includes(text),text);
 for(const k of ['rxi','txi','tei','eri'])assert.ok(f['ra_gen/vector_data.c'].includes(`= iic_slave_${k}_isr,`),k);
 assert.ok(!f['ra_gen/vector_data.c'].includes('iic_master_'));
 assert.ok(f['ra_cfg/fsp_cfg/r_iic_slave_cfg.h'].includes('#define IIC_SLAVE_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)')&&f['ra_cfg/fsp_cfg/r_iic_slave_cfg.h'].includes('#define IIC_SLAVE_CFG_DTC_ENABLE (0)'));
 assert.ok(f['ra_gen/pin_data.c'].includes('IOPORT_PERIPHERAL_IIC'));
 // The slave's vectors come after every earlier module's (a saved project's numbers do not move): UART 0-3, IRQ1 4, RTC, slave.
 const both=slave();Object.assign(both.pins,{P109:{function:'Peripheral',signal:'SCI9_TXD'},P110:{function:'Peripheral',signal:'SCI9_RXD'}});Object.assign(both.peripherals,{SCI9:{enabled:true},RTC:{enabled:true}});
 const v=raVectors(validateRaMcu(both)).map(x=>x.vector);
 assert.deepEqual(v,['SCI9_RXI','SCI9_TXI','SCI9_TEI','SCI9_ERI','ICU_IRQ1','RTC_ALARM','RTC_PERIOD','RTC_CARRY','IIC0_RXI','IIC0_TXI','IIC0_TEI','IIC0_ERI']);
 // A master project is generated as before: no slave header, instance or ISR.
 const m=slave({mode:'MASTER',callback:'i2c_master0_callback',slave:0x50}),g=generateRaFiles(validateRaMcu(m),{board:{fspBoard:true}});
 assert.ok(!g['ra_gen/hal_data.h'].includes('slave')&&!g['ra_gen/hal_data.c'].includes('i2c_slave')&&g['ra_gen/vector_data.c'].includes('= iic_master_rxi_isr,'));
 assert.equal(raInstances(validateRaMcu(m)).iicSlaves.length,0);assert.equal(raInstances(mcu).iics.length,0);
 // The interpreter's stand-in declares the same instance.
 const prelude=fspPrelude(mcu);assert.ok(prelude.includes('const i2c_slave_cfg_t g_i2c_slave0_cfg = { .channel = 0, .rate = I2C_SLAVE_RATE_STANDARD, .slave = 0x30,')&&prelude.includes('void i2c_slave0_callback(i2c_slave_callback_args_t * p_args);'));
});

test('Developer Assistance: g_i2c_slave0 with Open, Read, Write, Close and the callback over the events',()=>{
 const group=raAssistance(validateRaMcu(slave())).find(x=>x.name==='g_i2c_slave0');assert.ok(group,'group');assert.match(group.title,/r_iic_slave/);
 assert.deepEqual(group.items.map(i=>i.label),['Call R_IIC_SLAVE_Open()','Call R_IIC_SLAVE_Read()','Call R_IIC_SLAVE_Write()','Call R_IIC_SLAVE_Close()','Callback function definition']);
 const cb=group.items.at(-1).code;for(const text of ['void i2c_slave0_callback(i2c_slave_callback_args_t *p_args)','I2C_SLAVE_EVENT_RX_REQUEST','I2C_SLAVE_EVENT_TX_REQUEST','I2C_SLAVE_EVENT_RX_COMPLETE','I2C_SLAVE_EVENT_TX_COMPLETE','R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl','R_IIC_SLAVE_Write(&g_i2c_slave0_ctrl'])assert.ok(cb.includes(text),text);
 assert.ok(!raAssistance(validateRaMcu(slave())).some(x=>x.name==='g_i2c_master0'));
});

test('interpreter: the callback events of r_iic_slave for each kind of transfer (the sequences the emulator test runs)',()=>{
 const {session:s,log}=open({...base(),mcu:slaveProbeMcu(),code:SLAVE_PROBE});run(s,20);
 assert.equal(s.readVariable('err_open'),0);assert.equal(s.readVariable('err_again'),14,'FSP_ERR_ALREADY_OPEN');
 assert.deepEqual(s.hal.i2cSlaveInfo(),{address:0x42,sda:'P401',scl:'P400'});
 const events=()=>Array.from({length:s.readVariable('n')},(_,i)=>[s.readVariable(`ev[${i}]`),s.readVariable(`nb[${i}]`)]);
 let seen=0;
 for(const q of SLAVE_SEQUENCES){
  let ok=null,got=null;
  if(q.write)ok=s.hal.i2cSlaveReceive(q.write,s.runtime);else got=s.hal.i2cSlaveRequest(q.read,s.runtime);
  const all=events(),mine=all.slice(seen);seen=all.length;
  assert.deepEqual(mine,q.events,`${q.name}: events [event, bytes]`);
  if(q.acks)assert.equal(ok,q.acks.every(Boolean),`${q.name}: every byte ACKed`);
  if(q.data)assert.deepEqual(got,q.data,`${q.name}: bytes the master read`);
  if(q.received)assert.deepEqual(q.received.map((_,i)=>s.readVariable(`rx[${i}]`)),q.received,`${q.name}: bytes in the slave's buffer`);
 }
 assert.deepEqual(log.warn,[]);
 assert.ok(log.trace.some(e=>/IIC0 슬레이브 · RX_REQUEST/.test(e.message)),'the protocol log names the events');
});

test('interpreter: R_IIC_SLAVE_* return codes (not open, in use, NULL buffer, eri_ipl above ipl) and CallbackSet / Close',()=>{
 const code=SLAVE_PROBE.replace(/void hal_entry\(void\)[\s\S]*$/,`volatile uint32_t r[10];
static uint8_t buf[2];
void other_callback(i2c_slave_callback_args_t *p_args) { (void) p_args; r[9] = 7; }
void hal_entry(void)
{
    r[0] = R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, buf, 2);
    r[1] = R_IIC_SLAVE_Close(&g_i2c_slave0_ctrl);
    r[2] = R_IIC_SLAVE_CallbackSet(&g_i2c_slave0_ctrl, other_callback, NULL, NULL);
    R_IIC_SLAVE_Open(&g_i2c_slave0_ctrl, &g_i2c_slave0_cfg);
    r[3] = R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, NULL, 2);
    r[4] = R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, buf, 2);
    r[5] = R_IIC_SLAVE_Write(&g_i2c_slave0_ctrl, buf, 2);
    r[6] = R_IIC_SLAVE_CallbackSet(&g_i2c_slave0_ctrl, other_callback, NULL, NULL);
    r[7] = R_IIC_SLAVE_Close(&g_i2c_slave0_ctrl);
    r[8] = R_IIC_SLAVE_Close(&g_i2c_slave0_ctrl);
    while (1)
    {
    }
}
`);
 const {session:s}=open({...base(),mcu:slaveProbeMcu(),code});run(s,20);
 assert.deepEqual(Array.from({length:9},(_,i)=>s.readVariable(`r[${i}]`)),[7,7,7,1,0,8,0,0,7],'NOT_OPEN x3, ASSERTION, SUCCESS, IN_USE, SUCCESS, SUCCESS, NOT_OPEN');
 assert.equal(s.hal.i2cSlaveInfo(),null,'closed: the board no longer answers');
});

// The registers as r_iic_slave.c writes them at Open, then the bus events another board's master stands for.
test('RA6E1 RIIC slave model: address match, RDRF per byte with ACKBT as the ACK, TDRE one byte ahead, TEND, NACKF, STOP, IICRST',()=>{
 let now=0;const queue=[],events=[];
 const soc={clock:{pclkb:50e6},nowUs:()=>now,sync(){},raiseEvent(e){events.push(e-IIC_EVENT_BASE[0]);},after:(us,fn)=>{const e={t:now+us,fn,cancel(){e.dead=true;}};queue.push(e);return e;},routedPins:sg=>[sg.endsWith('SCL')?'P400':'P401']};
 const step=us=>{const end=now+us;for(;;){const e=queue.filter(x=>!x.dead&&!x.done&&x.t<=end).sort((a,b)=>a.t-b.t)[0];if(!e)break;e.done=true;now=e.t;e.fn();}now=end;};
 const t=new Iic(soc,0),take=()=>events.splice(0);
 assert.equal(t.slaveListens(0x42),false,'not before Open');
 t.write(0x00,0x00,1);t.write(0x00,0x40,1);t.write(0x00,0xc0,1);t.write(0x0b,0,1);t.write(0x0a,0x42<<1,1);t.write(0x06,1,1);t.write(0x03,6,1);t.write(0x05,0x5d,1);t.write(0x10,0xe0|30,1);t.write(0x02,0x38,1);t.write(0x04,0x40,1);t.write(0x07,0xa0,1);
 assert.equal(t.slaveListens(0x42),false,'held in reset');t.write(0x00,0x9f,1);
 assert.ok(t.slaveListens(0x42)&&!t.slaveListens(0x21));assert.deepEqual(t.slaveInfo(),{address:0x42,scl:'P400',sda:'P401'});
 // Master writes 0x11, 0x22: the address byte first (the driver's dummy read), then a byte each time ICDRR was read.
 assert.equal(t.slaveAddress(false),true);assert.deepEqual(take(),[0],'RXI at the address match');
 assert.equal(t.read(0x08,1)&1,1,'AAS0');assert.equal(t.read(0x01,1)&0xe0,0x80,'BBSY, receive');assert.ok(t.read(0x09,1)&0x04,'START');
 assert.equal(t.slaveWrite(0x11),true,'ACK: ACKBT is 0');assert.deepEqual(take(),[],'held: the address byte is not read yet');
 assert.equal(t.read(0x13,1),0x84,'the address byte and W');t.write(0x09,0x00,1);t.write(0x07,0xac,1);step(30);
 assert.deepEqual(take(),[0],'RXI for the first byte');assert.equal(t.read(0x13,1),0x11);
 t.write(0x04,0x50,1);t.write(0x04,0x58,1);t.write(0x04,0x48,1); // ACKWP, ACKBT = 1: NACK from the next byte on
 assert.equal(t.slaveWrite(0x22),false,'NACK');step(30);assert.deepEqual(take(),[0]);assert.equal(t.read(0x13,1),0x22,'received all the same');
 t.slaveStop();step(30);assert.deepEqual(take(),[3],'STOP: ERI');assert.ok(t.read(0x09,1)&0x08);assert.equal(t.read(0x01,1)&0x80,0,'bus free');assert.equal(t.read(0x08,1)&1,0);
 t.write(0x09,0x00,1);t.write(0x07,0xa0,1);t.write(0x04,0x50,1);t.write(0x04,0x40,1);
 // Master reads: TDRE at the address match, ICDRT goes to the shift register at once and TDRE comes again.
 step(30);t.slaveAddress(true);assert.deepEqual(take(),[1],'TXI');assert.equal(t.read(0x01,1)&0xa0,0xa0,'BBSY, transmit');
 assert.equal(t.slaveRead(),null,'nothing to send yet: SCL held');
 t.write(0x09,0x00,1);t.write(0x07,0xbc,1);t.write(0x12,0xa1,1);assert.deepEqual(take(),[1],'TDRE again: one byte ahead');t.write(0x12,0xb2,1);assert.deepEqual(take(),[]);assert.equal(t.read(0x09,1)&0x80,0);
 assert.equal(t.slaveRead(),0xa1);assert.equal(t.slaveRead(),0xb2,'the ACK moved the next byte');assert.deepEqual(take(),[1]);
 t.write(0x07,0xfc,1);assert.equal(t.slaveRead(),null,'ACK with ICDRT empty');assert.ok(t.read(0x09,1)&0x40,'TEND');assert.deepEqual(take(),[2],'TEI');assert.equal(t.read(0x04,1)&0x04,0,'ACKBR 0');
 t.write(0x12,0xc3,1);take();assert.equal(t.slaveRead(),0xc3);t.slaveNack();assert.ok(t.read(0x09,1)&0x10,'NACKF');assert.ok(t.read(0x04,1)&0x04,'ACKBR 1');assert.ok(take().includes(3),'ERI');
 t.write(0x07,0xec,1);t.slaveStop();step(30);assert.ok(t.read(0x09,1)&0x08,'STOP');assert.equal(t.read(0x09,1)&0xc0,0,'TDRE and TEND cleared');
 // A byte never read: the time-out (2^16 reference clocks: 10.5 ms at PCLKB/8) sets TMOF; the internal reset keeps the settings.
 t.write(0x09,0,1);t.write(0x07,0xa1,1);take();step(30);t.slaveAddress(false);t.slaveWrite(0x55);step(10000);assert.equal(t.read(0x09,1)&1,0);step(600);assert.equal(t.read(0x09,1)&1,1,'TMOF');assert.ok(take().includes(3));
 t.write(0x00,0xc0,1);t.write(0x00,0x9f,1);assert.equal(t.read(0x09,1),0);assert.equal(t.read(0x0a,1),0x84,'SARL0 kept');assert.ok(t.slaveListens(0x42));assert.equal(t.slaveWrite(1),false,'the transfer is gone');assert.equal(t.slaveRead(),0xff);
 // IICRST with ICE = 0 resets every register.
 t.write(0x00,0x40,1);assert.equal(t.read(0x0a,1),0);assert.equal(t.slaveListens(0x42),false);
});

test('ra_iic_slave on the interpreter: the ESP32 sketch (Wire master) writes the LED byte and reads the counter back',()=>{
 const e=raExample('ra_iic_slave'),p={...base(),mcu:e.mcu(),code:e.code},c=e.circuit();p.components=c.components;p.wires=c.wires;delete p.surfaces;
 const {session:s,log}=open(p);run(s,1800);
 assert.deepEqual(log.board.filter(l=>/RA /.test(l)).slice(0,3),['[ESP32-1] RA count=0 led=1 error=0','[ESP32-1] RA count=1 led=0 error=0','[ESP32-1] RA count=2 led=1 error=0']);
 assert.ok(s.readVariable('writes_seen')>=3&&s.readVariable('reads_answered')>=3);assert.equal(s.readVariable('aborted'),0);assert.deepEqual(log.warn,[]);
 assert.equal(s.runtime.gpio.P407.value>1.65?1:0,s.readVariable('command')&1,'LED2 follows the byte the master wrote');
 assert.ok(log.trace.some(x=>/ESP32-1 · 0x42 WRITE 1 B · ACK/.test(x.message))&&log.trace.some(x=>/ESP32-1 · 0x42 READ 2 B · ACK/.test(x.message)));
 // Without the SDA wire nothing answers: the sketch reports the NACK and the slave sees no transfer.
 const q={...p,wires:p.wires.filter(w=>w.id!=='w_sda')},{session:s2,log:log2}=open(q);run(s2,700);
 assert.ok(log2.board.some(l=>/RA no answer error=2/.test(l)),JSON.stringify(log2.board));assert.equal(s2.readVariable('writes_seen'),0);
});
