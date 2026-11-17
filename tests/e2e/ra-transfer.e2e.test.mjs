// Feature 36 in the app: New Stack → Monitoring · System → Event Link Controller (r_elc) and New Stack → Transfer →
// r_dtc / r_dmac with their Properties; the ADC's ELC start trigger and the UART's transmit DTC on the Pins tab; Summary;
// then the template ra_elc_adc_dtc runs on the built-in interpreter (GPT1 → ELC → ADC0, DTC into an array, the averages on
// the USB-TTL part by the UART's DTC).
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const consoleText=win=>win.textContent('#console-output');
async function newRaProject(win,template='ra-minimal'){
 await win.evaluate(()=>document.getElementById('new').click());
 if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
 await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template',template);
 await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
 await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
}
async function openConfig(win){
 if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');
}
const error=win=>win.textContent('#ra-pinout-error');

test('New Stack → Event Link Controller and Transfer (r_dtc, r_dmac): Properties, the ADC\'s ELC trigger and the UART\'s DTC on the Pins tab, Summary',{timeout:180000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win);await openConfig(win);await win.click('[data-ra-tab="stacks"]');
  assert.deepEqual(await win.evaluate(()=>[...document.querySelectorAll('#ra-stack-add optgroup[label="Transfer"] option')].map(o=>o.textContent)),['Transfer (r_dtc)','Transfer (r_dmac)']);
  assert.ok(await win.evaluate(()=>!!document.querySelector('#ra-stack-add optgroup[label="Monitoring · System"] option[value="ELC"]')));
  // g_elc: no link yet.
  await win.selectOption('#ra-stack-add','ELC');await win.click('[data-ra-add]');
  const elc='[data-ra-stack="ELC"]';await win.waitForSelector(elc);
  assert.match(await win.textContent(elc+' header'),/g_elc\s*Event Link Controller \(r_elc\)/);
  assert.match(await win.textContent(elc),/g_elc_cfg \(ra_gen\/elc_data\.c\)의 링크: 없음[\s\S]*R_ELC_Open\(&g_elc_ctrl, &g_elc_cfg\) · R_ELC_Enable/);
  // A DTC takes the first event that has a vector here: S1's IRQ1 (the template's External IRQ).
  await win.selectOption('#ra-stack-add','DTC');await win.click('[data-ra-add]');
  const dtc='[data-ra-transfer="TRANSFER0"]';await win.waitForSelector(dtc);
  assert.match(await win.textContent(dtc+' header'),/g_transfer0\s*Transfer \(r_dtc\)/);
  assert.equal(await win.inputValue(dtc+' [data-ra-transfer-field="activation"]'),'ICU_IRQ1');
  assert.equal(await win.locator(dtc+' [data-ra-transfer-field="channel"]').count(),0,'a DTC has no channel');
  await win.selectOption(dtc+' [data-ra-transfer-field="mode"]','BLOCK');
  await win.waitForSelector(dtc+' [data-ra-transfer-field="blocks"]');
  assert.match(await win.textContent(dtc),/활성화마다 Number of Transfers 단위\(한 블록\)/);
  // A DMAC: software start on channel 0; a callback brings its interrupt priority.
  await win.selectOption('#ra-stack-add','DMAC');await win.click('[data-ra-add]');
  const dmac='[data-ra-transfer="TRANSFER1"]';await win.waitForSelector(dmac);
  assert.deepEqual([await win.inputValue(dmac+' [data-ra-transfer-field="channel"]'),await win.inputValue(dmac+' [data-ra-transfer-field="activation"]')],['0','SOFTWARE']);
  await win.fill(dmac+' [data-ra-transfer-field="callback"]','dmac_done');await win.locator(dmac+' [data-ra-transfer-field="callback"]').dispatchEvent('change');
  await win.waitForSelector(dmac+' [data-ra-transfer-field="priority"]');
  assert.match(await win.textContent(dmac),/R_DMAC_SoftwareStart\(&g_transfer1_ctrl, TRANSFER_START_MODE_REPEAT\)[\s\S]*dmac_done\(dmac_int_isr\)/);
  assert.equal(await error(win),'');
  // Pins: A0 analog with the ELC trigger (GPT1 overflow by default), SCI9 TXD with a transmit DTC.
  await win.click('[data-ra-tab="pins"]');await win.click('[data-ra-pin="P000"]');await win.selectOption('#ra-pin-props [data-ra="function"]','Analog');
  await win.selectOption('#ra-pin-props [data-ra-adc="trigger"]','ELC');
  await win.waitForSelector('#ra-pin-props [data-ra-adc="elcEvent"]');
  assert.equal(await win.inputValue('#ra-pin-props [data-ra-adc="elcEvent"]'),'GPT1_COUNTER_OVERFLOW');
  assert.match(await win.textContent('#ra-pin-props'),/ELC_PERIPHERAL_ADC0 ← ELC_EVENT_GPT1_COUNTER_OVERFLOW/);
  await win.click('[data-ra-pin="P109"]');await win.selectOption('#ra-pin-props [data-ra="function"]','Peripheral');
  await win.selectOption('#ra-pin-props [data-ra-sci-transfer="transferTx"]','DTC');
  await win.waitForFunction(()=>/g_transfer2/.test(document.querySelector('#ra-pin-props [data-ra-sci-transfer="transferTx"]').textContent));
  await win.click('[data-ra-tab="stacks"]');
  assert.match(await win.textContent('[data-ra-transfer="TRANSFER2"]'),/g_uart9의 송신 전송입니다/);
  assert.equal(await win.inputValue('[data-ra-transfer="TRANSFER2"] input'),'SCI9 TXI');
  assert.equal(await win.locator('[data-ra-transfer="TRANSFER2"] [data-ra-transfer-remove]').count(),0,'the UART owns it');
  assert.match(await win.textContent(elc),/ADC0 ← GPT1_COUNTER_OVERFLOW/);
  await win.click('[data-ra-tab="summary"]');
  assert.match(await win.textContent('#ra-summary'),/g_elc \(r_elc\)[\s\S]*g_transfer0 \(r_dtc\)[\s\S]*g_transfer1 \(r_dmac\)[\s\S]*g_transfer2 \(r_dtc\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  // Removing the ELC stack takes the ADC's ELC trigger with it (nothing would start the scans).
  await openConfig(win);await win.click('[data-ra-tab="stacks"]');await win.click('[data-ra-remove="ELC"]');
  await win.click('[data-ra-tab="pins"]');await win.click('[data-ra-pin="P000"]');
  assert.equal(await win.inputValue('#ra-pin-props [data-ra-adc="trigger"]'),'SOFTWARE');
  await win.click('#ra-pinout-close');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the template ra_elc_adc_dtc on the built-in interpreter: the averages of 16 ELC-started samples come out on the USB-TTL part',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win,'ra_elc_adc_dtc');
  await win.keyboard.press('Control+F5');await win.click('[data-monitor="bus"]');
  await win.waitForFunction(()=>/USB-TTL:[\s\S]*block [2-9]: 1649 mV/.test(document.getElementById('uart-output').textContent),null,{timeout:60000})
   .catch(async e=>{throw new Error(`${e.message}\n출력: ${(await consoleText(win)).slice(-1500)}\nUART: ${(await win.textContent('#uart-output')).slice(-800)}`);});
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
