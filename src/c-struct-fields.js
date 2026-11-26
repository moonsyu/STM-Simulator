// Fields of a C struct type, for member completion after "." and "->" (hadc1.Init.Resolution, GPIO_InitStruct.Pull,
// huart->Instance). Reads "typedef struct { … } Name;", "typedef struct Tag { … } Name;" and "struct Name { … };" in a
// header or a source file; comments, strings and preprocessor lines are ignored.
// The code is in Rust (rust/stm-core/src/csymbols.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn} from './rust-core.js';

const text=source=>String(source||''),word=name=>String(name||'');
/** [{name, type}] of the struct or union type `typeName` defined in `source`; [] when it is not defined there. */
export const structFields=(source,typeName)=>rustFn('struct_fields',text(source),word(typeName));
/** Fields of a variable declared together with its struct: "struct { int raw; } reading;" or "struct Tag { … } a, *b;". */
export const inlineStructFields=(source,name)=>rustFn('inline_struct_fields',text(source),word(name));
/** The declared type name of the variable or parameter `name` in `source` ("ADC_HandleTypeDef" for hadc1), or ''. */
export const declaredType=(source,name)=>rustFn('declared_type',text(source),word(name));
/** "hadc1.Init." → ['hadc1','Init'] for the text before the cursor, or null when it does not end in a member access. */
export const accessChain=before=>rustFn('access_chain',String(before));
