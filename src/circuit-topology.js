// The nets of a circuit as it is wired, without what a switch or a pressed button closes. Worked out in Rust
// (rust/stm-core/src/circuit.rs, feature 62).
import {netsOf,circuitView} from './engine.js';
import {rustExact} from './rust-core.js';

export function wiringTopology(project){return netsOf(rustExact('wiring_topology',circuitView(project)));}
