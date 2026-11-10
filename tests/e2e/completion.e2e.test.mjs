// Completion while typing (no Ctrl+Space): HAL names come up as soon as a prefix is typed, the half-typed word is not
// offered as a candidate of its own, and Tab inserts the chosen name. Simulator target (the SDK index) and the
// real-board ARM target with clangd (the edit is synced before the request; isIncomplete keeps the list fresh).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const cubeF4=process.env.STM32CUBE_F4_ROOT||path.join(local,'STM32CubeF4'),cubeF1=process.env.STM32CUBE_F1_ROOT||path.join(local,'STM32CubeF1');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const clangd=process.env.CLANGD||(await fs.readdir(local).catch(()=>[])).filter(n=>n.startsWith('clangd_')).sort().map(n=>path.join(local,n,'bin','clangd.exe')).at(-1)||'';
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const sdk=await exists(path.join(cubeF4,'Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_adc.c'));
const rows=win=>win.evaluate(()=>[...document.querySelectorAll('#group-code .suggest-widget .monaco-list-row')].map(r=>r.getAttribute('aria-label')||r.textContent));
async function typeInMain(win,text){
 await win.evaluate(()=>{const c=document.getElementById('code'),i=c.value.indexOf('/* USER CODE BEGIN 2 */')+'/* USER CODE BEGIN 2 */'.length;c.setSelectionRange(i,i);c.focus();});
 await win.keyboard.press('Enter');
 for(const ch of text){await win.keyboard.type(ch);await win.waitForTimeout(40);}
}
async function expectRows(win,names,first){
 await win.waitForFunction(([names])=>{const rows=[...document.querySelectorAll('#group-code .suggest-widget .monaco-list-row')].map(r=>r.getAttribute('aria-label')||r.textContent);return names.every(n=>rows.some(r=>new RegExp('^\\W*'+n+'\\b').test(r)));},[names],{timeout:20000}) // clangd labels start with • (include insertion)
  .catch(async e=>{throw new Error(e.message+' rows: '+JSON.stringify(await rows(win)));});
 const list=await rows(win);
 assert.ok(!new RegExp('^'+first+',').test(list[0]||''),'the half-typed word is not the first candidate: '+JSON.stringify(list.slice(0,3)));
}

test('simulator target: typing HAL_ADC_St lists HAL_ADC_Start / Stop without Ctrl+Space; Tab inserts the name',{skip:!sdk&&'STM32CubeF4 not installed',timeout:180000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:'',cube:cubeF4,cubeF1,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await typeInMain(win,'HAL_ADC_St');
  await expectRows(win,['HAL_ADC_Start','HAL_ADC_Stop'],'HAL_ADC_St');
  await win.keyboard.type('art_I');
  await expectRows(win,['HAL_ADC_Start_IT'],'HAL_ADC_Start_I');
  await win.keyboard.press('Tab');
  await win.waitForFunction(()=>/HAL_ADC_Start_IT\b/.test(document.getElementById('code').value));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('real-board ARM target with clangd: typing HAL_ADC_Conv lists HAL_ADC_ConvCpltCallback while typing',{skip:!(sdk&&clangd&&await exists(clangd))&&'STM32CubeF4 / clangd not installed',timeout:240000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,cube:cubeF4,cubeF1,armGdb:'',hostGcc:'',hostGdb:'',clangd,openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  // The run target list and the clangd switch live in the toolbar menus; set them as their handlers expect.
  await win.evaluate(()=>{const t=document.getElementById('native-target');t.value='arm';t.dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('language-toggle').click();});
  await win.waitForFunction(()=>/clangd 연결됨/.test(document.getElementById('language-toggle').textContent),null,{timeout:90000})
   .catch(async e=>{throw new Error(e.message+' '+await win.textContent('#language-toggle')+' '+await win.getAttribute('#language-toggle','title'));});
  await typeInMain(win,'HAL_ADC_Conv');
  await expectRows(win,['HAL_ADC_ConvCpltCallback'],'HAL_ADC_Conv');
  await win.keyboard.press('Tab');
  await win.waitForFunction(()=>/HAL_ADC_ConvCpltCallback/.test(document.getElementById('code').value));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

// Error-case pass: after "." the list was unrelated names that start with the typed letters (GPIO_InitStruct.Pu gave
// pUART_CallbackTypeDef); it is the fields of the struct now, from the SDK header. uint32_t and the other standard
// names, which the SDK index does not hold, are offered too.
test('simulator target: struct members after "." (SDK struct and a struct of the project), and standard C type names',{skip:!sdk&&'STM32CubeF4 not installed',timeout:180000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:'',cube:cubeF4,cubeF1,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  const labels=()=>win.evaluate(()=>[...document.querySelectorAll('#group-code .suggest-widget .monaco-list-row')].map(r=>(r.getAttribute('aria-label')||r.textContent).split(',')[0]));
  // A variable of an SDK type and one of a struct the project defines.
  // Each line is typed after closing the list the line before left open (Enter would take its first entry).
  const line=async text=>{await win.keyboard.press('Escape');await typeInMain(win,text);};
  await line('struct Reading reading;');
  await line('struct Reading { int raw; float volts; };');
  await line('GPIO_InitTypeDef pin_setup;');
  await line('pin_setup.');
  await win.waitForFunction(()=>[...document.querySelectorAll('#group-code .suggest-widget .monaco-list-row')].some(r=>/^Pull\b/.test(r.getAttribute('aria-label')||r.textContent)),null,{timeout:20000}).catch(async e=>{throw new Error(e.message+' rows: '+JSON.stringify(await labels()));});
  const all=await labels();
  for(const name of ['Pin','Mode','Pull','Speed'])assert.ok(all.includes(name),name+' in '+JSON.stringify(all));
  assert.ok(all.every(n=>/^(Pin|Mode|Pull|Speed|Alternate)$/.test(n)),'only the fields: '+JSON.stringify(all));
  await win.keyboard.type('Pu');await win.waitForTimeout(400);await win.keyboard.press('Tab');
  await win.waitForFunction(()=>/pin_setup\.Pull\b/.test(document.getElementById('code').value));
  await line('reading.');
  await win.waitForFunction(()=>{const rows=[...document.querySelectorAll('#group-code .suggest-widget .monaco-list-row')].map(r=>(r.getAttribute('aria-label')||r.textContent).split(',')[0]);return rows.length===2&&rows.includes('raw')&&rows.includes('volts');},null,{timeout:20000}).catch(async e=>{throw new Error(e.message+' rows: '+JSON.stringify(await labels()));});
  // A variable declared together with its struct.
  await line('struct { int count; int limit; } tally;');
  await line('tally.');
  await win.waitForFunction(()=>{const rows=[...document.querySelectorAll('#group-code .suggest-widget .monaco-list-row')].map(r=>(r.getAttribute('aria-label')||r.textContent).split(',')[0]);return rows.length===2&&rows.includes('count')&&rows.includes('limit');},null,{timeout:20000}).catch(async e=>{throw new Error(e.message+' rows: '+JSON.stringify(await labels()));});
  await line('uint32');
  await expectRows(win,['uint32_t'],'uint32');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
