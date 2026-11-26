// Built-in C/C++ code formatter used when clangd is unavailable (circuit simulator, emulator, no tools).
// formatC rewrites leading indentation plus a few unambiguous spacing rules (keyword parentheses, braces,
// commas) and never changes the number of lines. formatCode also puts each statement on its own line.
// Neither touches string/char literals, comments, preprocessor lines or operator spacing.
// The code is in Rust (rust/stm-core/src/cformat.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn} from './rust-core.js';

// `tabSize|0`: the whole number the JavaScript used (4 when it is not one); a range is {start, end}, 1-based.
const size=tabSize=>tabSize|0;
const lineRange=range=>range?{start:Number(range.start),end:Number(range.end)}:null;

/**
 * Formats C source. `tabSize` spaces per level. With `range` ({start,end}, 1-based inclusive),
 * only those lines are rewritten (indentation is still computed from the whole file).
 * Returns the formatted text; the line count never changes.
 */
export const formatC=(source,{tabSize=4,range=null}={})=>rustFn('format_c',source,size(tabSize),lineRange(range));
/**
 * Splits compact C into one statement per line (see cformat.rs split_statements). Returns, for every source line,
 * the (not yet indented) lines it becomes.
 */
export const splitStatements=source=>rustFn('split_statements',source);
/**
 * Full formatting (편집 → 코드 정렬, `}` block, save): splitStatements then formatC indentation. Returns the
 * text and, for every source line, the formatted lines it became, so the editor can apply the change line
 * by line and keep breakpoints on their statements. With `range`, only those source lines change.
 */
export const formatCode=(source,{tabSize=4,range=null}={})=>rustFn('format_code',source,size(tabSize),lineRange(range));
/** formatCode for code the app generates (examples, new projects, Pinout): 4-space indentation. */
export const expandC=(source,{tabSize=4}={})=>formatCode(source,{tabSize}).text;
/** Only the leading indentation of each line, as formatC computes it; the rest of every line stays as written. */
export const reindentC=(source,{tabSize=4}={})=>rustFn('reindent_c',String(source),size(tabSize));
/** Line range (1-based) of the block whose `}` sits on `line` (the last `}` before `column`, if given), or null. */
export const blockRange=(source,line,column=Infinity)=>rustFn('block_range',source,line,Number.isFinite(column)?column:column===Infinity?null:1);
