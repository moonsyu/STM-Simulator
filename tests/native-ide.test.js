import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{parseRecord}=require('../desktop/gdb-mi.cjs'),{diagnosticsFrom,validateTools}=require('../desktop/native-build.cjs');
test('GDB MI nested tuples and result lists preserve commas, quotes and duplicate frame keys',()=>{
 const r=parseRecord('14^done,stack=[frame={level="0",func="helper",file="main.c",line="5"},frame={level="1",func="main",line="9"}],value="{x = 2, s = \\"a,b\\"}"');
 assert.equal(r.stack.length,2);assert.equal(r.stack[1].func,'main');assert.equal(r.value,'{x = 2, s = "a,b"}');assert.equal(r.token,14);
 assert.equal(parseRecord('*stopped,reason="breakpoint-hit",frame={func="main",line="3"}').frame.line,'3');assert.equal(parseRecord('~"hello\\n"').text,'hello\n');assert.equal(parseRecord('(gdb) '),null);
});
test('compiler diagnostics keep Windows drive letters and warning severity',()=>{const rows=diagnosticsFrom('C:\\folder space\\main.c:17:4: error: unknown name\nC:/src/user.h:2:1: warning: unused');assert.equal(rows[0].line,17);assert.equal(rows[0].column,4);assert.equal(rows[1].severity,'warning');});
test('tool settings reject relative paths and newline injection and ignore unknown fields',()=>{assert.throws(()=>validateTools({armGcc:'gcc.exe'}));assert.throws(()=>validateTools({clangd:'C:/clangd.exe\n--help'}));assert.equal(validateTools({extra:'anything'}).extra,undefined);});
