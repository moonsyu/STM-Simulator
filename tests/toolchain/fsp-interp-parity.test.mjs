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
 ra_agt_tick:{vars:{blinks:0,ms:3}},ra_iic_memory:{vars:{matched:0,nack_seen:0}},ra_spi_memory:{vars:{matched:0,readback:0}},
 ra_led4_switch2:{leds:['P107','P303','P113','P103'],at:{460:s=>s.setPressed({sw2:true}),520:s=>s.setPressed({}),910:s=>s.setPressed({sw2:true}),960:s=>s.setPressed({}),1310:s=>s.setPressed({sw1:true}),1360:s=>s.setPressed({})}},
 // S1 held 350-1350 ms: no refresh, the WDT resets both engines at 971 ms, and LED2 blinks after it (RSTSR1.WDTRF).
 ra_wdt_reset:{buttons:false,at:{350:s=>s.setPressed({SW1:true}),1350:s=>s.setPressed({})},vars:{refreshes:1,wdt_resets_seen:0},resets:1,warn:/^\[WDT\] /},
 // 6 s: the time set to 23:59:55 on the RTC, printed on SCI9 each second, and the alarm at midnight (LED2).
 ra_rtc_clock:{ms:6000,buttons:false,vars:{seconds:0}},
 // Deep Software Standby after 1 s; S1 at 1500 ms cancels it (IRQ1-DS): one reset on both engines, LED2 from then on, and
 // the second Deep Software Standby at about 2.5 s with LED2 kept on by IOKEEP.
 ra_lpm_deep:{ms:3000,buttons:false,at:{1500:s=>s.setPressed({SW1:true}),1600:s=>s.setPressed({})},vars:{from_deep_standby:0},resets:1},
 // The boot counter in the data flash: S1 pressed 300-400 ms and 1300-1400 ms resets the MCU twice (NVIC_SystemReset on
 // release), so SCI9 prints the counts 1, 2 and 3 and the data flash ends with 3 on both engines.
 ra_flash_counter:{window:3,vars:{boot_count:0,flash_error:0},resets:2,warn:/^\[NVIC\] /,flash:[{at:0,hex:'03000000'}]},
 // GPT1 → ELC → ADC0 every 10 ms, the DTC fills 16 samples, then the ADC callback (LED2 toggles, the average on SCI9 by the
 // UART's DTC); the potentiometer moves at 1 s, so LED1 and the printed averages change on both engines.
 ra_elc_adc_dtc:{at:{1000:s=>{s.project.components.find(p=>p.id==='pot').position=80;}},vars:{blocks:0,average_mv:2}}
};
// The level of a pin each millisecond: its PWM duty, or high/low.
function timeline(session,id){
 const plan=PLAN[id],pins=[...LEDS,...(plan.leds||[])],gpio=()=>session.gpio??session.runtime.gpio,out=Object.fromEntries(pins.map(p=>[p,[]]));
 for(let ms=1;ms<=(plan.ms??MS);ms++){
  // S1 pressed for 100 ms twice (the button examples count, toggle or ignore it; the others do not use S1).
  const buttons=id!=='ra_led4_switch2'&&plan.buttons!==false;
  if(buttons&&(ms===300||ms===1300))session.setPressed({SW1:true});if(buttons&&(ms===400||ms===1400))session.setPressed({});
  plan.at?.[ms]?.(session);session.tick(ms);
  for(const p of pins){const g=gpio()[p];out[p].push(g?.pwm?Math.round(g.pwm.duty*1000)/1000:g?.value>1.65?1:0);}
 }
 return out;
}
// Instants where the engines differ, other than within 1 ms of a change in either.
function differences(a,b,window=1){
 const near=(x,t)=>{for(let k=t-window+1;k<=t+window;k++)if(k>0&&k<x.length&&x[k-1]!==x[k])return true;return false;};
 return a.map((v,t)=>v===b[t]||near(a,t)||near(b,t)?null:`${t+1} ms: emulator ${v}, interpreter ${b[t]}`).filter(Boolean);
}
async function compare(ids){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'fsp-parity-'));
 try{
  for(const id of ids){
   const project=example(id),result=await build(await prepareBuild({project,tools,root,target:'arm'}));
   const emu={uart:[]},interp={uart:[]};
   const firmware=new FirmwareSession(validateProject(project),{elf:new Uint8Array(await fs.readFile(result.elf)),uart:e=>emu.uart.push(e)});
   const simulation=new SimulationSession(validateProject(project),{uart:e=>interp.uart.push(e),warn:m=>{if(!PLAN[id].warn?.test(m))throw new Error(`${id}: ${m}`);}});
   const ta=timeline(firmware,id),tb=timeline(simulation,id);
   for(const pin of Object.keys(ta))assert.deepEqual(differences(ta[pin],tb[pin],PLAN[id].window).slice(0,5),[],`${id} ${pin}`);
   assert.ok(Object.values(ta).some(x=>x.some(v=>v!==x[0])),id+': the LEDs change, so the comparison means something');
   // Watchdog resets: as many on both engines (the emulator logs each one, the interpreter restarts the program).
   assert.equal(firmware.resets.length,PLAN[id].resets??0,id+' emulator resets');assert.equal(simulation.runtime.resetCount??0,PLAN[id].resets??0,id+' interpreter resets');
   const text=log=>String.fromCharCode(...log.uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX').flatMap(e=>e.bytes));
   assert.equal(text(interp),text(emu),id+' SCI9 output');
   // The data flash the run leaves (feature 39).
   if(PLAN[id].flash){assert.deepEqual(firmware.dataFlash.encode(),PLAN[id].flash,id+' emulator data flash');assert.deepEqual(simulation.dataFlash.encode(),PLAN[id].flash,id+' interpreter data flash');}
   assert.equal(simulation.buses.received.get('term')??'',firmware.buses.received.get('term')??'',id+' UART part');
   // Variables are read 5 ms after the last 500 ms boundary: the emulator starts hal_entry about 0.2 ms after reset (the
   // FSP start-up code), so a periodic count read at the boundary itself may differ by one.
   {const end=(PLAN[id].ms??MS)+5;firmware.tick(end);simulation.tick(end);}
   for(const [name,tolerance]of Object.entries(PLAN[id].vars||{})){const x=firmware.readVariable(name),y=simulation.readVariable(name);assert.ok(Math.abs(x-y)<=tolerance,`${id} ${name}: emulator ${x}, interpreter ${y}`);}
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
}

// Six tests, so that scripts/toolchain-shard.mjs can deal them to different CI groups.
test('parity: ra_blink and ra_button_irq (LED1 blink, S1 on IRQ1 falling)',{skip,timeout:900000},()=>compare(['ra_blink','ra_button_irq']));
test('parity: ra_button_poll and ra_button_irq_rising (S1 polled, S1 on IRQ1 rising)',{skip,timeout:900000},()=>compare(['ra_button_poll','ra_button_irq_rising']));
test('parity: ra_led4_switch2 (four LEDs, two switches, pause and restart)',{skip,timeout:900000},()=>compare(['ra_led4_switch2']));
test('parity: ra_uart_echo and ra_gpt_pwm (SCI9 echo, GPT PWM and periodic)',{skip,timeout:900000},()=>compare(['ra_uart_echo','ra_gpt_pwm']));
test('parity: ra_adc_pot, ra_agt_tick and ra_iic_memory (ADC12, AGT, IIC master)',{skip,timeout:900000},()=>compare(['ra_adc_pot','ra_agt_tick','ra_iic_memory']));
test('parity: ra_spi_memory (r_spi SPI1 with SSL0, the SPI memory, SCI9 output)',{skip,timeout:900000},()=>compare(['ra_spi_memory']));
test('parity: ra_wdt_reset (WDT reset and RSTSR1.WDTRF)',{skip,timeout:900000},()=>compare(['ra_wdt_reset']));
test('parity: ra_rtc_clock (RTC calendar, 1 s periodic interrupt, alarm)',{skip,timeout:900000},()=>compare(['ra_rtc_clock']));
test('parity: ra_lpm_deep (Deep Software Standby, S1 on IRQ1-DS, RSTSR0.DPSRSTF, IOKEEP)',{skip,timeout:900000},()=>compare(['ra_lpm_deep']));
test('parity: ra_elc_adc_dtc (GPT1 → ELC → ADC0, DTC into an array, SCI9 by DTC)',{skip,timeout:900000},()=>compare(['ra_elc_adc_dtc']));
test('parity: ra_flash_counter (r_flash_hp boot counter in the data flash across two resets)',{skip,timeout:900000},()=>compare(['ra_flash_counter']));
