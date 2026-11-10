// Feature 13: importing an .ioc into a project without a circuit offers the parts its pins suggest; the chosen ones
// are placed on the breadboard and wired. The Pinout's "핀 설정으로 회로 만들기" opens the same dialog later.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launch} from './harness.mjs';

const IOC=['Mcu.Name=STM32F103R(8-B)Tx','Mcu.CPN=STM32F103RBT6','Mcu.IP0=ADC1','Mcu.IP1=I2C1','Mcu.IP2=RCC','Mcu.IP3=SYS','Mcu.IP4=USART2',
 'PA0-WKUP.Signal=ADCx_IN0','PA2.Signal=USART2_TX','PA3.Signal=USART2_RX','PA5.Signal=GPIO_Output','PA5.GPIO_Label=LD2 [Green Led]','PA8.Signal=GPIO_Output','PA8.GPIO_Label=LED_RED',
 'PA9.Signal=GPIO_Output','PA9.GPIO_Label=OLED_DC','PB5.Signal=GPIO_Input','PB5.GPIO_PuPd=GPIO_PULLUP','PB5.GPIO_Label=KEY1','PB8.Signal=I2C1_SCL','PB9.Signal=I2C1_SDA','USART2.VirtualMode=VM_ASYNC'].join('\n');
const parts=win=>win.evaluate(()=>[...document.querySelectorAll('#part-layer [data-part]')].length);

test('.ioc import offers a circuit; the chosen parts are placed and wired; the Pinout button opens it again',{timeout:150000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ioc-circuit-')),file=path.join(dir,'board.ioc');await fs.writeFile(file,IOC);
 const s=await launch();
 try{
  const {win,app}=s;
  await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
  await win.evaluate(()=>document.getElementById('firmware-import').click());
  await win.waitForSelector('#ioc-circuit-dialog[open]',{timeout:15000});
  const titles=await win.evaluate(()=>[...document.querySelectorAll('#ioc-circuit-list [data-ioc-part]')].map(i=>i.parentElement.textContent));
  assert.equal(titles.length,4,titles.join(' | '));
  for(const t of [/I2C1 — OLED/,/PA0 — 가변저항/,/PA8 \(LED_RED\) — LED와 330 Ω/,/PB5 \(KEY1\) — 버튼 \(누르면 GND\)/])assert.ok(titles.some(x=>t.test(x)),String(t)+' in '+titles.join(' | '));
  {const left=await win.textContent('#ioc-circuit-list details');for(const t of ['PA5 (LD2) — 보드의 LD2','PA9 (OLED_DC) — 장치 제어 핀','USART2 — ST-LINK'])assert.ok(left.includes(t),t+' in '+left);}
  // Leave the potentiometer out.
  await win.evaluate(()=>{const i=[...document.querySelectorAll('#ioc-circuit-list [data-ioc-part]')].find(i=>/가변저항/.test(i.parentElement.textContent));i.checked=false;});
  await win.click('#ioc-circuit-apply');
  await win.waitForFunction(()=>!document.getElementById('ioc-circuit-dialog').open&&document.querySelectorAll('#part-layer [data-part]').length>=4,null,{timeout:15000});
  assert.match(await win.textContent('#console-output'),/핀 설정으로 회로를 만들었습니다: [^\n]*LED1[^\n]*SW1/);
  const before=await parts(win);assert.ok(before>=4,`${before} parts (resistor, LED, button, OLED)`);
  // Again from the Pinout, now with the note that the circuit is replaced; cancelling keeps the circuit.
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  await win.click('#pinout-circuit');await win.waitForSelector('#ioc-circuit-dialog[open]');
  assert.equal(await win.locator('#ioc-circuit-replace').isHidden(),false);
  await win.click('#ioc-circuit-cancel');assert.equal(await parts(win),before);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();await fs.rm(dir,{recursive:true,force:true});}
});
