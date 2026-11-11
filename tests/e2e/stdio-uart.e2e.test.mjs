// Feature 44: an example opened as a project prints on USART2 (the ST-LINK virtual COM port): the lines show in the
// output panel as [USART2 TX] and in the serial monitor; scanf reads what the serial monitor sends.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const logText=win=>win.evaluate(()=>document.getElementById('console-output').textContent);
async function pickExample(win,id){await win.evaluate(id=>{const s=document.getElementById('hal-example');if(![...s.options].some(o=>o.value===id))s.add(new Option(id,id));s.value=id;s.dispatchEvent(new Event('change'));},id);await win.waitForFunction(()=>document.querySelectorAll('#part-layer [data-part]').length>0);}
const waitLog=(win,pattern,timeout=40000)=>win.waitForFunction(source=>new RegExp(source).test(document.getElementById('console-output').textContent),pattern.source,{timeout}).catch(async e=>{throw new Error(e.message+'\n'+(await logText(win)).slice(-1500));});

test('the DS3231 example prints the time on USART2; scanf reads a number sent from the serial monitor',{timeout:180000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await pickExample(win,'ref_ds3231_zs042_10');
  // The example's code has the UART console the app adds: USART2 and _write / _read, no ITM.
  const code=await win.evaluate(()=>document.getElementById('code').value);
  assert.match(code,/MX_USART2_UART_Init\(\);/);assert.match(code,/int _write\(int file, char \*ptr, int len\)/);assert.doesNotMatch(code,/ITM_SendChar/);
  await win.keyboard.press('Control+F5');
  await waitLog(win,/\[USART2 TX\] 20\d\d-\d\d-\d\d \d\d:\d\d:\d\d/);
  // The same text in the serial monitor, on the virtual COM port.
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','USART2');
  await win.waitForFunction(()=>/ST-LINK VCP · USART2[\s\S]*20\d\d-\d\d-\d\d \d\d:\d\d:\d\d/.test(document.getElementById('uart-output').textContent),null,{timeout:20000});
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  // scanf: the prompt (no line end) is out before the input is read; the answer follows the number that was sent.
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace(/(\n[ \t]*)while \(1\)\s*\{/,(m,indent)=>indent+'int n = 0;'+indent+'printf("num? ");'+indent+'scanf("%d", &n);'+indent+'printf("double %d\\r\\n", n * 2);'+m);c.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/scanf\("%d", &n\);/);
  await win.keyboard.press('Control+F5');
  await waitLog(win,/\[USART2 TX\] num\? /);
  await win.waitForFunction(()=>!document.getElementById('serial-send').disabled);
  await win.fill('#serial-input','21');await win.click('#serial-send');
  assert.equal(await win.evaluate(()=>document.getElementById('serial-feedback').textContent),'');
  await waitLog(win,/double 42/);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
