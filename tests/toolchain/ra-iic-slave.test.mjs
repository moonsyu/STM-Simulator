// Feature 33 with the real FSP: r_iic_slave built by ARM GCC with the generated ra_gen/ra_cfg, run on the RA6E1 emulator.
// The master is a test master that drives the slave model's
// bus interface for the sequences r_iic_slave reports through its callback (RX/TX request, more-request, complete,
// aborted) — the same sequences the built-in interpreter gives (tests/unit/ra-iic-slave.test.js, SLAVE_SEQUENCES).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {connectStm32Drivers} from '../../src/stm32-boards.js';
import {SLAVE_PROBE,SLAVE_SEQUENCES,slaveProbeMcu} from '../unit/helpers/ra-iic-slave.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';

async function firmware(project,fn){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-iic-slave-'));
 try{
  const checked=validateProject(project),result=await build(await prepareBuild({project:checked,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const log={trace:[],warn:[],board:[]};
  const session=new FirmwareSession(checked,{elf:new Uint8Array(await fs.readFile(result.elf)),trace:e=>log.trace.push(e),warn:m=>log.warn.push(m)});
  connectStm32Drivers(session);
  await fn(session,log);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const run=(s,ms)=>{for(let guard=0;guard<200000&&s.now<ms*1000-1;guard++)s.tick(Math.min(ms,Math.floor(s.now/1000)+1));};

test('r_iic_slave callback sequences on the emulator: requests, more-requests, completes and the time-out abort',{skip,timeout:600000},async()=>{
 await firmware({...projectForBoard('fpb-ra6e1'),mcu:slaveProbeMcu(),code:SLAVE_PROBE},s=>{
  run(s,5);
  const iic=s.soc.iics[0],events=()=>{const n=s.readVariable('n');return Array.from({length:n},(_,i)=>[s.readVariable(`ev[${i}]`),s.readVariable(`nb[${i}]`)]);};
  assert.ok(iic.slaveListens(0x42)&&!iic.slaveListens(0x43),'answers at its own address only');
  assert.deepEqual(iic.slaveInfo(),{address:0x42,scl:'P400',sda:'P401'});
  let seen=0;
  for(const q of SLAVE_SEQUENCES){
   let got=null,acks=null;
   // The master stops after a NACK, as an I2C master does.
   if(q.write){iic.slaveAddress(false);run(s,s.now/1000+.2);acks=[];for(const b of q.write){const a=iic.slaveWrite(b);acks.push(a);run(s,s.now/1000+.2);if(!a)break;}iic.slaveStop();}
   else{iic.slaveAddress(true);got=[];for(let i=0;i<q.read;i++){let v=null;for(let k=0;k<400&&(v=iic.slaveRead())==null;k++)run(s,s.now/1000+.1);got.push(v??0xff);if(i===q.read-1)iic.slaveNack();}iic.slaveStop();}
   run(s,s.now/1000+(q.settle??2));
   const all=events(),mine=all.slice(seen);seen=all.length;
   assert.deepEqual(mine,q.events,`${q.name}: events [event, bytes]`);
   if(q.acks)assert.deepEqual(acks,q.acks,`${q.name}: ACK of each byte`);
   if(q.data)assert.deepEqual(got,q.data,`${q.name}: bytes the master read`);
   if(q.received)assert.deepEqual(q.received.map((_,i)=>s.readVariable(`rx[${i}]`)),q.received,`${q.name}: bytes in the slave's buffer`);
  }
  assert.equal(s.readVariable('err_open'),0);assert.equal(s.readVariable('err_again'),14,'second Open: FSP_ERR_ALREADY_OPEN');
 });
});


test('R_IIC_SLAVE_Close on the emulator: the module is stopped and the board no longer answers its address; CallbackSet\'s callback and context are used',{skip,timeout:600000},async()=>{
 const code=SLAVE_PROBE.replace(/void hal_entry\(void\)[\s\S]*$/,`volatile uint32_t closed = 0, other_calls = 0, context_ok = 0, err_set = 99, err_close = 99, err_close_again = 99;
uint32_t marker = 5;
void other_callback(i2c_slave_callback_args_t *p_args)
{
    other_calls++;
    context_ok = (p_args->p_context == (void *) &marker) ? 7 : 1;
    if (I2C_SLAVE_EVENT_RX_REQUEST == p_args->event)
    {
        R_IIC_SLAVE_Read(&g_i2c_slave0_ctrl, rx, 4);
    }
    if (I2C_SLAVE_EVENT_RX_COMPLETE == p_args->event)
    {
        step++;
    }
}
void hal_entry(void)
{
    R_IIC_SLAVE_Open(&g_i2c_slave0_ctrl, &g_i2c_slave0_cfg);
    err_set = R_IIC_SLAVE_CallbackSet(&g_i2c_slave0_ctrl, other_callback, &marker, NULL);
    while (0 == step)
    {
    }
    err_close = R_IIC_SLAVE_Close(&g_i2c_slave0_ctrl);
    err_close_again = R_IIC_SLAVE_Close(&g_i2c_slave0_ctrl);
    closed = 1;
    while (1)
    {
    }
}
`);
 await firmware({...projectForBoard('fpb-ra6e1'),mcu:slaveProbeMcu(),code},s=>{
  run(s,5);const iic=s.soc.iics[0];
  assert.ok(iic.slaveListens(0x42));assert.equal(s.soc.iicStopped(0),false);assert.equal(s.soc.iicStopped(1),true,'IIC1 was never started');
  iic.slaveAddress(false);run(s,5.2);for(const b of [0x11,0x22]){assert.equal(iic.slaveWrite(b),true);run(s,s.now/1000+.2);}iic.slaveStop();run(s,s.now/1000+2);
  assert.deepEqual([s.readVariable('err_set'),s.readVariable('other_calls'),s.readVariable('context_ok'),s.readVariable('n')],[0,2,7,0],'RX_REQUEST and RX_COMPLETE went to the new callback, with &marker');
  assert.deepEqual([s.readVariable('rx[0]'),s.readVariable('rx[1]')],[0x11,0x22]);
  assert.deepEqual([s.readVariable('closed'),s.readVariable('err_close'),s.readVariable('err_close_again')],[1,0,7],'closed; the second Close is FSP_ERR_NOT_OPEN');
  assert.equal(s.soc.iicStopped(0),true,'R_BSP_MODULE_STOP');assert.equal(iic.slaveListens(0x42),false);assert.equal(iic.slaveInfo(),null);
 });
});
