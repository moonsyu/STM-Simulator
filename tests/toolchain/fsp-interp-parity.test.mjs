// Feature 42: the two engines of an FPB-RA6E1 project agree. Each FSP example is built with ARM GCC and FSP and run on
// the RA6E1 emulator (FirmwareSession), and run from its hal_entry.c on the built-in interpreter (SimulationSession);
// both get the same button presses, UART input and potentiometer moves, and show the same LED1/LED2 timelines (within
// 1 ms; a PWM pin by its duty), the same SCI9 output and the same program variables.
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

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.fsp)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed';
const example=id=>{const e=raExample(id),p={...projectForBoard('fpb-ra6e1'),mcu:e.mcu(),code:e.code};if(e.circuit){const c=e.circuit();p.components=c.components;p.wires=c.wires;delete p.surfaces;}return validateProject(p);};
const MS=2000,LEDS=['P408','P407'];
// What each example is given while it runs, and the variables both engines must end with (a tolerance where the
// emulator's ADC or clock differ by a count).
const PLAN={
 ra_blink:{},ra_button_irq:{vars:{presses:0}},ra_button_poll:{},ra_button_irq_rising:{},
 ra_uart_echo:{at:{100:s=>s.inject('Hi','SCI9'),700:s=>s.inject('RA','SCI9')},vars:{received:0}},
 ra_gpt_pwm:{vars:{ticks:0,duty_percent:0}},
 ra_adc_pot:{at:{1000:s=>{s.project.components.find(p=>p.id==='pot').position=80;}},vars:{adc_value:3,millivolts:3}},
 ra_agt_tick:{vars:{blinks:0,ms:3}},ra_iic_memory:{vars:{matched:0,nack_seen:0}},
 ra_led4_switch2:{leds:['P107','P303','P113','P103'],at:{460:s=>s.setPressed({sw2:true}),520:s=>s.setPressed({}),910:s=>s.setPressed({sw2:true}),960:s=>s.setPressed({}),1310:s=>s.setPressed({sw1:true}),1360:s=>s.setPressed({})}}
};
// The level of a pin each millisecond: its PWM duty, or high/low.
function timeline(session,id){
 const plan=PLAN[id],pins=[...LEDS,...(plan.leds||[])],gpio=()=>session.gpio??session.runtime.gpio,out=Object.fromEntries(pins.map(p=>[p,[]]));
 for(let ms=1;ms<=MS;ms++){
  // S1 pressed for 100 ms twice (the button examples count, toggle or ignore it; the others do not use S1).
  if(id!=='ra_led4_switch2'&&(ms===300||ms===1300))session.setPressed({SW1:true});if(id!=='ra_led4_switch2'&&(ms===400||ms===1400))session.setPressed({});
  plan.at?.[ms]?.(session);session.tick(ms);
  for(const p of pins){const g=gpio()[p];out[p].push(g?.pwm?Math.round(g.pwm.duty*1000)/1000:g?.value>1.65?1:0);}
 }
 return out;
}
// Instants where the engines differ, other than within 1 ms of a change in either.
function differences(a,b){
 const near=(x,t)=>x[t-1]!==x[t]||x[t+1]!==undefined&&x[t+1]!==x[t];
 return a.map((v,t)=>v===b[t]||near(a,t)||near(b,t)?null:`${t+1} ms: emulator ${v}, interpreter ${b[t]}`).filter(Boolean);
}
async function compare(ids){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-parity-'));
 try{
  for(const id of ids){
   const project=example(id),result=await build(await prepareBuild({project,tools,root,target:'arm'}));
   const emu={uart:[]},interp={uart:[]};
   const firmware=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),uart:e=>emu.uart.push(e)});
   const simulation=new SimulationSession(validateProject(project),{uart:e=>interp.uart.push(e),warn:m=>{throw new Error(`${id}: ${m}`);}});
   const ta=timeline(firmware,id),tb=timeline(simulation,id);
   for(const pin of Object.keys(ta))assert.deepEqual(differences(ta[pin],tb[pin]).slice(0,5),[],`${id} ${pin}`);
   assert.ok(Object.values(ta).some(x=>x.some(v=>v!==x[0])),id+': the LEDs change, so the comparison means something');
   const text=log=>String.fromCharCode(...log.uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX').flatMap(e=>e.bytes));
   assert.equal(text(interp),text(emu),id+' SCI9 output');
   assert.equal(simulation.buses.received.get('term')??'',firmware.buses.received.get('term')??'',id+' UART part');
   // Variables are read 5 ms after the last 500 ms boundary: the emulator starts hal_entry about 0.2 ms after reset (the
   // FSP start-up code), so a periodic count read at the boundary itself may differ by one.
   firmware.tick(MS+5);simulation.tick(MS+5);
   for(const [name,tolerance]of Object.entries(PLAN[id].vars||{})){const x=firmware.readVariable(name),y=simulation.readVariable(name);assert.ok(Math.abs(x-y)<=tolerance,`${id} ${name}: emulator ${x}, interpreter ${y}`);}
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
}

// Five tests, so that scripts/toolchain-shard.mjs can deal them to different CI groups.
test('parity: ra_blink and ra_button_irq (LED1 blink, S1 on IRQ1 falling)',{skip,timeout:900000},()=>compare(['ra_blink','ra_button_irq']));
test('parity: ra_button_poll and ra_button_irq_rising (S1 polled, S1 on IRQ1 rising)',{skip,timeout:900000},()=>compare(['ra_button_poll','ra_button_irq_rising']));
test('parity: ra_led4_switch2 (four LEDs, two switches, pause and restart)',{skip,timeout:900000},()=>compare(['ra_led4_switch2']));
test('parity: ra_uart_echo and ra_gpt_pwm (SCI9 echo, GPT PWM and periodic)',{skip,timeout:900000},()=>compare(['ra_uart_echo','ra_gpt_pwm']));
test('parity: ra_adc_pot, ra_agt_tick and ra_iic_memory (ADC12, AGT, IIC master)',{skip,timeout:900000},()=>compare(['ra_adc_pot','ra_agt_tick','ra_iic_memory']));
