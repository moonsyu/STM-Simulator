// FPB-RA6E1 firmware (Renesas FSP, ARM GCC) on the RA6E1 emulator: FSP's clock setup to 200 MHz, R_IOPORT pin writes,
// R_BSP_SoftwareDelay timing, and the S1 (P205 / IRQ1) interrupt through ICU IELSR → NVIC → r_icu_isr → callback.
// Fixtures: tests/fixtures/firmware-ra6e1 (node scripts/emu/build-ra6e1-fixtures.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {open,runUntil} from './helpers.mjs';

const fixture=name=>'../firmware-ra6e1/'+name;

test('ra_blink: FSP starts the PLL at 200 MHz and LED1 (P408) toggles every 500 ms of R_BSP_SoftwareDelay',()=>{
 const {session}=open(fixture('ra_blink'));
 const edges=[];let last=null;
 runUntil(session,2200,{onTick:()=>{const v=session.gpio.P408?.value>1.65;if(v!==last){edges.push([Math.round(session.now/1000),v]);last=v;}}});
 assert.equal(session.soc.clock.iclk,200e6,'HOCO 20 MHz / 2 x 20');
 assert.equal(session.soc.clock.pclkb,50e6);assert.equal(session.soc.clock.pclkd,100e6);
 assert.equal(session.gpio.P408.mode,'OUTPUT');assert.equal(session.gpio.P407.mode,'OUTPUT');
 const highs=edges.filter(e=>e[1]).map(e=>e[0]);
 assert.ok(highs.length>=2,'LED1 turned on at least twice: '+JSON.stringify(edges));
 assert.ok(Math.abs(highs[1]-highs[0]-1000)<=20,'1 s period (sampled at the 20 ms session tick): '+JSON.stringify(edges));
 // The board's LED1 lights through its 1 kΩ resistor.
 assert.ok(session.result.voltage('signal:P408')>1.8||session.result.voltage('signal:P408')<0.5);
});

test('ra_button_irq: pressing S1 pulls P205 low; IRQ1 (falling) runs the callback and toggles LED2 (P407)',()=>{
 const {session}=open(fixture('ra_button_irq'));
 runUntil(session,100);
 assert.ok(session.gpio.P407.value<1,'LED2 starts off');
 assert.equal(session.readVariable('presses'),0);
 session.setPressed({SW1:true});runUntil(session,140);session.setPressed({});runUntil(session,200);
 assert.equal(session.readVariable('presses'),1);assert.ok(session.gpio.P407.value>1.65,'LED2 on');
 session.setPressed({SW1:true});runUntil(session,240);session.setPressed({});runUntil(session,300);
 assert.equal(session.readVariable('presses'),2);assert.ok(session.gpio.P407.value<1,'LED2 off again');
 // The pin is an IRQ input with the internal pull-up (S1 has none on the board).
 assert.equal(session.gpio.P205.mode,'INPUT_PULLUP');
});

test('opening the other vendor\'s ELF says which board it is for',async()=>{
 const {project,elf}=await import('./helpers.mjs');
 const {FirmwareSession}=await import('../../src/firmware-session.js');
 assert.throws(()=>new FirmwareSession(project(fixture('ra_blink')),{elf:elf('blink')}),/FPB-RA6E1\(Renesas FSP\)용이 아닙니다/);
 assert.throws(()=>new FirmwareSession(project('blink'),{elf:elf(fixture('ra_blink'))}),/FPB-RA6E1\(Renesas FSP\)용입니다/);
});
