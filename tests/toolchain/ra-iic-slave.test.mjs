// Feature 33 with the real FSP: r_iic_slave built by ARM GCC with the generated ra_gen/ra_cfg, run on the RA6E1 emulator.
// The master is another board: the example's ESP32 sketch (Wire master), and a test master that drives the slave model's
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
import {raExample} from '../../src/ra-examples.js';
import {createBoardDrivers} from '../../src/fixed-run.js';
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
  session.circuit.drivers=createBoardDrivers(checked,{log:s=>log.board.push(s)});connectStm32Drivers(session);
  await fn(session,log);
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
const run=(s,ms)=>{for(let guard=0;guard<200000&&s.now<ms*1000-1;guard++)s.tick(Math.min(ms,Math.floor(s.now/1000)+1));};
const example=id=>{const e=raExample(id),p={...projectForBoard('fpb-ra6e1'),mcu:e.mcu(),code:e.code},c=e.circuit();p.components=c.components;p.wires=c.wires;delete p.surfaces;return p;};

test('ra_iic_slave: the ESP32 master writes to and reads from the real r_iic_slave on the emulator',{skip,timeout:600000},async()=>{
 await firmware(example('ra_iic_slave'),(s,log)=>{
  run(s,1800);
  const lines=log.board.filter(l=>/RA /.test(l));
  assert.deepEqual(lines.slice(0,3),['[ESP32-1] RA count=0 led=1 error=0','[ESP32-1] RA count=1 led=0 error=0','[ESP32-1] RA count=2 led=1 error=0'],JSON.stringify(log.board));
  assert.ok(s.readVariable('writes_seen')>=3&&s.readVariable('reads_answered')>=3,'the callback saw the transfers');
  assert.equal(s.readVariable('aborted'),0);assert.deepEqual(log.warn,[]);
  assert.equal(s.gpio.P407.value>1.65?1:0,s.readVariable('command')&1,'LED2 follows the byte the master wrote');
 });
});

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
