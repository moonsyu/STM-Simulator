// A first circuit from the Pinout (feature 13): an .ioc says what each pin does and how it is labelled, not what is wired
// to it, so every pin function gets the part a beginner would wire to try it out — an LED with its resistor on an output,
// a button on an input, a potentiometer on an ADC channel, a memory module on an I2C / SPI bus, a terminal on a UART.
// suggestCircuit lists them (the user picks); buildCircuit makes the parts and nets and lets the example layout engine
// place and route them on the breadboard. What is suggested and which parts and wires are made is in Rust
// (rust/stm-core/src/ptools.rs; feature 62), for the header pins of the board being edited.
import {activeBoard} from './pins.js';
import {arrangeExampleOnBreadboards} from './example-breadboard.js';
import {physicalExample} from './catalog-examples.js';
import {rustExact} from './rust-core.js';

/** What could be wired to this Pinout: [{key, title, pins, parts, note?, skipped?}] (skipped: listed with the reason, not built). */
export const suggestCircuit=mcu=>rustExact('suggest_circuit',mcu,activeBoard());

/** The project with the chosen suggestions as parts on the breadboard (its other circuit replaced). */
export function buildCircuit(project,suggestions){
  const p=rustExact('circuit_parts',project,suggestions,activeBoard());
  if(!p.components?.length)return p;
  return arrangeExampleOnBreadboards(physicalExample(p));
}
