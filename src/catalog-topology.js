// The pairs of pins a catalog part ties inside (rust/stm-core/src/circuit.rs catalog_ties, feature 62).
import {rustPure} from './rust-core.js';

const ties=rustPure('catalog_ties');
/** [[`part:<id>:p1`, `part:<id>:p3`], …] of a catalog part ([] for any other part); the same frozen answer each time. */
export const catalogTies=p=>ties({id:p.id,type:p.type});
