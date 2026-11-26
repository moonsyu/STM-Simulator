// C source symbols for "go to definition" (Ctrl+click, F12) and the Outline view, like CubeIDE's indexer: includes,
// macros, typedef names, enum constants, global variables, function definitions and prototypes, each with its line.
// A text scan (no preprocessor): every #if branch counts, so a name can have several definitions.
// The code is in Rust (rust/stm-core/src/csymbols.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustTable} from './rust-core.js';

export const KIND_RANK=rustTable('kind_ranks');
/** [{name, kind, line, column, detail}] in the order they are written (line and column from 1, UTF-16 columns). */
export const cSymbols=source=>rustFn('c_symbols',String(source||''));
// Outline text as CubeIDE shows it: name(params) : return type, variable : type.
export const outlineLabel=s=>rustFn('outline_label',String(s.name),String(s.kind),String(s.detail??''));
// The best definitions of a name: function bodies first, then macros, typedefs, enum constants, variables, prototypes.
export function pickDefinitions(entries){
 if(!entries?.length)return [];
 return rustFn('pick_definitions',entries.map(e=>String(e.kind))).map(i=>entries[i]);
}
