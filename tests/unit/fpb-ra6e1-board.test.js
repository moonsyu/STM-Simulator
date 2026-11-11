// Feature 30: the FPB-RA6E1 board model follows the board's schematic (Design Package D018122_04 Issue 2.0):
// S1 has a 10 kΩ pull-up (R17) on P205, LED1 / LED2 hang on P408 / P407 through 10 kΩ (R5 / R11), and the Arduino
// header's RESET pin (J2-3) is P014 with a 10 kΩ pull-up (R4) — a port pin, not the MCU's reset.
import test from 'node:test';
import assert from 'node:assert/strict';
import {solveCircuit} from '../../src/engine.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {PINS,setActiveBoard} from '../../src/pins.js';

const board=()=>validateProject(projectForBoard('fpb-ra6e1'));
const volts=(result,pin)=>result.voltage('signal:'+pin);

test('S1: P205 is HIGH through the board pull-up with the switch open, also with no MCU pull-up, and LOW when pressed',()=>{
 const p=board();
 // The pin is a plain input (high impedance): nothing but the board drives it.
 const open=solveCircuit(p,{},{});
 assert.ok(volts(open,'P205')>3.2,`open: ${volts(open,'P205')} V`);
 const pressed=solveCircuit(p,{},{SW1:true});
 assert.ok(volts(pressed,'P205')<0.1,`pressed: ${volts(pressed,'P205')} V`);
 // About 0.33 mA flows through R17 while the switch is held (3.3 V / 10.1 kΩ).
 assert.ok(Math.abs(volts(pressed,'P205')-3.3*100/10100)<0.01);
});

test('LED1 / LED2: the pin reaches the rail when driven high — the 10 kΩ series resistor takes about 0.12 mA',()=>{
 const p=board();
 const high=solveCircuit(p,{P408:{mode:'OUTPUT',value:3.3},P407:{mode:'OUTPUT',value:0}},{});
 assert.ok(volts(high,'P408')>3.2);assert.ok(volts(high,'P407')<0.1);
 // Left floating, the LED and its resistor hold the pin near ground (no current, so no diode drop above it).
 const idle=solveCircuit(p,{},{});assert.ok(volts(idle,'P408')<2.2,`floating P408: ${volts(idle,'P408')} V`);
});

test('the Arduino RESET pin (J2-3) is P014 with a pull-up; I2C pull-ups stay 2.2 kΩ on P400 / P401',()=>{
 setActiveBoard('fpb-ra6e1');
 const reset=PINS.find(pin=>pin.label==='RESET'||pin.name==='RESET');
 assert.ok(reset,'the header has a RESET pin');assert.equal(reset.signal,'P014');
 const idle=solveCircuit(board(),{},{});
 assert.ok(volts(idle,'P014')>3.2,`P014: ${volts(idle,'P014')} V`);
 assert.ok(volts(idle,'P400')>3.2&&volts(idle,'P401')>3.2);
 // Driven low by the MCU the pull-ups give way: 3.3 V / 10 kΩ and 3.3 V / 2.2 kΩ.
 const low=solveCircuit(board(),{P014:{mode:'OUTPUT',value:0},P400:{mode:'OUTPUT',value:0}},{});
 assert.ok(volts(low,'P014')<0.1&&volts(low,'P400')<0.1);
 setActiveBoard('nucleo-f446re');
});
