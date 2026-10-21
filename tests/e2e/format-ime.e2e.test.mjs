import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const code=win=>win.evaluate(()=>document.getElementById('code').value);
async function setCode(win,text){await win.evaluate(t=>{const c=document.getElementById('code');c.value=t;c.dispatchEvent(new Event('input',{bubbles:true}));},text);}

test('} entered without a } key event (Korean IME) and over-typing an auto-closed } re-indent the block',{timeout:90000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  // IME input: the character arrives as text input with keyCode 229 / key "Process", not as a } key press.
  await setCode(win,'void f(void){\nif(x){\nx=0;\n');
  await win.locator('.monaco-editor').first().click();
  await win.keyboard.press('Control+End');
  await win.keyboard.insertText('}');
  await win.waitForFunction(()=>/if \(x\) \{\n {8}x=0;\n {4}\}/.test(document.getElementById('code').value),null,{timeout:5000});
  // Monaco auto-closes { with }; typing } over it changes no text but still formats the block,
  // which puts its statement on its own line and leaves the cursor after the }.
  await setCode(win,'void g(void){\n');
  await win.locator('.monaco-editor').first().click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type('while(y){y--;');
  await win.keyboard.type('}');
  await win.waitForFunction(()=>/\n {4}while \(y\) \{\n {8}y--;\n {4}\}/.test(document.getElementById('code').value),null,{timeout:5000});
  await win.keyboard.type('z();');
  assert.match(await code(win),/\n {4}\}z\(\);/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('코드 정렬 splits a compact line into one statement per line and keeps the breakpoint on its statement',{timeout:90000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  const compact=`void f(void){\n        uint8_t bank[1]={1}, id[2]={0};if (HAL_I2C_Mem_Write(&hi2c1, 0x30<<1, 0xFF, I2C_MEMADD_SIZE_8BIT, bank, 1, 100)==HAL_OK) {HAL_I2C_Mem_Read(&hi2c1, 0x30<<1, 0x0A, I2C_MEMADD_SIZE_8BIT, id, 2, 100);printf("OV2640 sensor PID/VER=%02x %02x\\n", id[0], id[1]);} else printf("OV2640 SCCB timeout: check XCLK/reset/power\\n");HAL_Delay(1000);\nlast();\n}\n`;
  await setCode(win,compact);
  // Breakpoint on `last();` (line 3) before formatting.
  await win.locator('.monaco-editor').first().click();
  await win.keyboard.press('Control+Home');await win.keyboard.press('ArrowDown');await win.keyboard.press('ArrowDown');await win.keyboard.press('F9');
  await win.keyboard.press('Alt+Shift+F');
  const target=`void f(void) {\n    uint8_t bank[1]={1}, id[2]={0};\n    if (HAL_I2C_Mem_Write(&hi2c1, 0x30<<1, 0xFF, I2C_MEMADD_SIZE_8BIT, bank, 1, 100)==HAL_OK) {\n        HAL_I2C_Mem_Read(&hi2c1, 0x30<<1, 0x0A, I2C_MEMADD_SIZE_8BIT, id, 2, 100);\n        printf("OV2640 sensor PID/VER=%02x %02x\\n", id[0], id[1]);\n    } else {\n        printf("OV2640 SCCB timeout: check XCLK/reset/power\\n");\n    }\n    HAL_Delay(1000);\n    last();\n}\n`;
  await win.waitForFunction(t=>document.getElementById('code').value===t,target,{timeout:5000});
  await win.click('[data-activity="debug"]');
  await win.waitForFunction(()=>/main\.c:10/.test(document.getElementById('debug-breakpoints')?.textContent||''),null,{timeout:5000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
