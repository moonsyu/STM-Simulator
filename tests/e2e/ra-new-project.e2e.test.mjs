// Feature 19: the new project dialog offers e² studio's templates for the FPB-RA6E1 (Bare Metal - Minimal / Blinky)
// and the FSP examples, and creates the project — it used to stop at "지원하지 않는 MCU입니다: R7FA6E10F".
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('a new FPB-RA6E1 project from Bare Metal - Blinky, Minimal and a course example',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  // 파일 → 새 프로젝트 (the button sits in a menu); replacing a changed project asks first.
  const open=async()=>{await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');await win.waitForSelector('#project-dialog[open]');};
  const create=async template=>{
   await open();
   await win.selectOption('#new-project-board','fpb-ra6e1');
   const shown=await win.$$eval('#new-project-template option',o=>o.filter(x=>!x.hidden).map(x=>x.value));
   assert.deepEqual(shown.slice(0,2),['ra-minimal','ra-blinky']);assert.ok(shown.includes('ra_button_poll')&&shown.includes('ra_led4_switch2'));assert.ok(!shown.includes('blank'));
   await win.selectOption('#new-project-template',template);await win.fill('#new-project-name','RA_'+template.replace(/\W/g,'_'));
   await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  };
  await create('ra-blinky');
  assert.match(await code(),/void hal_entry\(void\)[\s\S]*BSP_IO_PORT_04_PIN_08, BSP_IO_LEVEL_HIGH[\s\S]*BSP_IO_PORT_04_PIN_07, BSP_IO_LEVEL_HIGH/);
  await create('ra-minimal');
  const minimal=await code();assert.match(minimal,/TODO: add your own code here/);assert.ok(!/PinWrite/.test(minimal));
  await create('ra_button_poll');
  assert.match(await code(),/R_IOPORT_PinRead\(&g_ioport_ctrl, SW1, &level\)/);
  // An STM32 board has the HAL templates again.
  await open();await win.selectOption('#new-project-board','nucleo-f103rb');
  const stm=await win.$$eval('#new-project-template option',o=>o.filter(x=>!x.hidden).map(x=>x.value));
  assert.equal(stm[0],'blank');assert.ok(!stm.some(v=>v.startsWith('ra')));
  await win.click('#project-cancel');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
