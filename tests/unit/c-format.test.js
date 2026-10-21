import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatC,blockRange,expandC,formatCode} from '../../src/c-format.js';
import {formatProjectSources} from '../../src/code-format-ui.js';
import {applyHalExample,allHalExamples,halExample} from '../../src/hal-examples.js';
const halExampleCode=id=>halExample(id).code;
import {blankProject} from '../../src/project.js';

const messy=`int main(void){
HAL_Init();
      /* USER CODE BEGIN 2 */
while(1){
if(x>3)
x=0;
else{
x++;
}
switch(x){
case 1:
foo(1,2 ,3);
break;
default:
break;
}
printf("a,b=%d\\n",x);   // keep,this
}
}`;

test('re-indents blocks, switch/case and brace-less bodies without touching strings or comments',()=>{
 const out=formatC(messy,{tabSize:4}).split('\n');
 assert.equal(out[0],'int main(void) {');
 assert.equal(out[1],'    HAL_Init();');
 assert.equal(out[2],'    /* USER CODE BEGIN 2 */');
 assert.equal(out[3],'    while (1) {');
 assert.equal(out[4],'        if (x>3)');
 assert.equal(out[5],'            x=0;');
 assert.equal(out[6],'        else {');
 assert.equal(out[9],'        switch (x) {');
 assert.equal(out[10],'            case 1:');
 assert.equal(out[11],'                foo(1, 2, 3);');
 assert.equal(out[16],'        printf("a,b=%d\\n", x);   // keep,this');
 assert.equal(out.at(-1),'}');
});

test('keeps line count, preprocessor lines and block comment layout; is idempotent',()=>{
 const src='#include "main.h"\n#define SQ(x) \\\n   ((x)*(x))\n/* a\n* b\n*/\nvoid f(void)\n{\nint a;\n}\n';
 const out=formatC(src,{tabSize:2});
 assert.equal(out.split('\n').length,src.split('\n').length);
 assert.match(out,/#define SQ\(x\) \\\n   \(\(x\)\*\(x\)\)/);
 assert.match(out,/\/\* a\n \* b\n \*\//);
 assert.match(out,/\{\n  int a;\n\}/);
 assert.equal(formatC(out,{tabSize:2}),out);
 assert.equal(formatC(formatC(messy)),formatC(messy));
});

test('extern "C" blocks do not indent their contents; CRLF is preserved',()=>{
 const out=formatC('extern "C" {\nint a;\n}\r\n'.replace(/\n/g,'\r\n'));
 assert.ok(out.includes('\r\nint a;\r\n'));
});

test('range formatting rewrites only the given lines and blockRange finds the closed block',()=>{
 const src='void f(void){\nif(a){\nb();\n}\nc();\n}';
 assert.deepEqual(blockRange(src,4),{start:2,end:4});
 assert.deepEqual(blockRange(src,6),{start:1,end:6});
 const out=formatC(src,{range:{start:2,end:4}}).split('\n');
 assert.deepEqual(out,['void f(void){','    if (a) {','        b();','    }','c();','}']);
});

test('every HAL example main.c formats idempotently without changing tokens',()=>{
 const strip=t=>t.replace(/\s+/g,'');
 for(const id of Object.keys(allHalExamples())){
  const p=applyHalExample(blankProject(),id);
  const before=p.code;formatProjectSources(p);
  assert.equal(strip(p.code),strip(before),id);
  assert.equal(formatC(p.code),p.code,id+' idempotent');
  assert.equal(p.code.split('\n').length,before.split('\n').length);
 }
});

test('expandC puts each statement on its own line and keeps initializers, for headers, strings and comments',()=>{
 const src='void f(uint8_t v){uint8_t b[2]={0,v}; for(int i=0;i<2;i++){g(b[i]);} if(v){h();}else{k();} /* done */\nswitch(v){case 1: a(); break; default: break;}\nprintf("x;{y}"); // a;b\n#define M(x) do{x;}while(0)\ndo{v--;}while(v);}';
 const out=expandC(src).split('\n');
 assert.deepEqual(out,[
  'void f(uint8_t v) {',
  '  uint8_t b[2]={0, v};',
  '  for (int i=0;i<2;i++) {',
  '    g(b[i]);',
  '  }',
  '  if (v) {',
  '    h();',
  '  } else {',
  '    k();',
  '  } /* done */',
  '  switch (v) {',
  '    case 1:',
  '      a();',
  '      break;',
  '    default:',
  '      break;',
  '  }',
  '  printf("x;{y}"); // a;b',
  '#define M(x) do{x;}while(0)',
  '  do {',
  '    v--;',
  '  } while (v);',
  '}']);
 assert.equal(expandC(expandC(src)),expandC(src));
});

test('every applied HAL example has one statement per line and the same tokens as its compact source',()=>{
 const strip=t=>t.replace(/\s+/g,'');
 for(const id of Object.keys(allHalExamples())){
  const p=applyHalExample(blankProject(),id),compact=halExampleCode(id);
  assert.equal(strip(p.code).replace(/[{}]/g,''),strip(compact).replace(/[{}]/g,''),id);
  for(const line of p.code.split('\n')){
   if(/^\s*(\/\/|\/\*|\*|#)/.test(line))continue;
   const code=line.replace(/\/\/.*$|\/\*.*?\*\//g,'').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,'""').replace(/\bfor\s*\(.*?\)\s*/,'');
   assert.ok(!/;\s*\S/.test(code.replace(/\{[^{}]*\}/g,'{}')),`${id}: ${line.trim()}`);
  }
 }
});

test('formatCode splits a compact line into the target layout and braces the else branch',()=>{
 const src=readFileSync(new URL('../fixtures/format-compact.c',import.meta.url),'utf8').replace(/\r\n/g,'\n');
 const {text,lines}=formatCode(src,{tabSize:4});
 assert.equal(text,[
  'void f(void) {',
  '    uint8_t bank[1]={1}, id[2]={0};',
  '    if (HAL_I2C_Mem_Write(&hi2c1, 0x30<<1, 0xFF, I2C_MEMADD_SIZE_8BIT, bank, 1, 100)==HAL_OK) {',
  '        HAL_I2C_Mem_Read(&hi2c1, 0x30<<1, 0x0A, I2C_MEMADD_SIZE_8BIT, id, 2, 100);',
  '        printf("OV2640 sensor PID/VER=%02x %02x\\n", id[0], id[1]);',
  '    } else {',
  '        printf("OV2640 SCCB timeout: check XCLK/reset/power\\n");',
  '    }',
  '    HAL_Delay(1000);',
  '    if (a) {',
  '        b();',
  '    } else if (c) {',
  '        d();',
  '    } else {',
  '        e();',
  '    }',
  '}',
  ''].join('\n'));
 assert.deepEqual(lines.map(l=>l.length),[1,8,7,1,1]);
 assert.equal(formatCode(text,{tabSize:4}).text,text);
 // Plain one-line branches without a braced partner are left alone; a branch that continues on the next line too.
 assert.equal(formatCode('if(x) y();\nif(a){b();} else\n c();',{tabSize:4}).text,'if (x) y();\nif (a) {\n    b();\n} else\n    c();');
 // Only the selected source lines change.
 assert.equal(formatCode('a();b();\nc();d();',{range:{start:2,end:2}}).text,'a();b();\nc();\nd();');
});

test('save-time formatting moves breakpoints to the line their statement now starts on',()=>{
 const p={code:'void f(void){a();b();\nc();\n}',firmware:{files:[]},ide:{breakpoints:[{file:'main.c',line:2},{file:'other.c',line:2}]}};
 assert.equal(formatProjectSources(p,4),true);
 assert.equal(p.code,'void f(void) {\n    a();\n    b();\n    c();\n}');
 assert.deepEqual(p.ide.breakpoints,[{file:'main.c',line:4},{file:'other.c',line:2}]);
});
