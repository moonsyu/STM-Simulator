// Pinout › .ioc로 내보내기: the applied settings are saved as a CubeMX .ioc, and importing that file into a fresh
// project gives the same Pinout back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launch} from './harness.mjs';

test('the Pinout is exported as an .ioc that imports back to the same settings',{timeout:150000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ioc-export-')),file=path.join(dir,'out.ioc');
 const s=await launch();
 try{
  const {win,app}=s;
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.check('[data-peripheral="IWDG"]');await win.waitForSelector('[data-wdg="IWDG"][data-key="reload"]');
  await win.selectOption('[data-wdg="IWDG"][data-key="prescaler"]','64');await win.waitForFunction(()=>document.querySelector('[data-wdg="IWDG"][data-key="prescaler"]')?.value==='64');
  await win.click('#pinout-apply');await win.waitForFunction(()=>!document.getElementById('pinout-dialog').open);
  await app.evaluate(({dialog},p)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:p});},file);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.click('#pinout-export-ioc');
  await win.waitForFunction(()=>/\.ioc로 내보냈습니다/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  const text=await fs.readFile(file,'utf8');
  for(const line of ['#MicroXplorer Configuration settings - do not modify','Mcu.Name=STM32F103R(8-B)Tx','IWDG.Prescaler=IWDG_PRESCALER_64','VP_IWDG_VS_IWDG.Mode=IWDG_Activate'])assert.ok(text.split('\n').includes(line),line);
  await win.click('#pinout-close');
  // Back in through File › 가져오기: the IWDG card shows the exported setting.
  await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
  await win.evaluate(()=>document.getElementById('firmware-import').click());
  await win.waitForFunction(()=>/가져왔습니다: out\.ioc/.test(document.getElementById('console-output').textContent),null,{timeout:15000});
  if(await win.evaluate(()=>document.getElementById('ioc-circuit-dialog').open))await win.click('#ioc-circuit-cancel');
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.isChecked('[data-peripheral="IWDG"]'),true);assert.equal(await win.inputValue('[data-wdg="IWDG"][data-key="prescaler"]'),'64');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();await fs.rm(dir,{recursive:true,force:true});}
});
