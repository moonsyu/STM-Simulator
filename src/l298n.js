// L298N module terminals, not the bare Multiwatt IC pin numbers.
// The tables are rust/stm-core/src/data/l298.json (feature 62).
import {CATALOG_TABLES} from './catalog-tables.js';
export const {L298_DEFS,L298_CHANNELS,L298_MODES}=CATALOG_TABLES;
// What the module does with the voltages on its pins and its branches in the circuit are in
// rust/stm-core/src/circuit.rs (feature 62).
