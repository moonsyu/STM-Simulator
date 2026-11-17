// Feature 39 in the app: New Stack → Storage → Flash (r_flash_hp) with its Properties and Summary; a boot counter in
// the data flash goes on across the board's RESET button and across stop and run (the contents are saved into the
// project), and "데이터 플래시 지우기" starts it over — on the built-in interpreter and, with ARM GCC + FSP installed,
// the ra_flash_counter example on the RA6E1 emulator (one build for both runs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const fsp=process.env.FSP_ROOT||path.join(local,'FSP');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(fsp,'ra/fsp/src/r_flash_hp/r_flash_hp.c'));
const consoleText=win=>win.textContent('#console-output');
const stopped=win=>win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
// Waits until the output has the line `text` `times` times (a later run prints the same line again). A line is its
// time stamp and its text; the lines run together in textContent ("boot 1" + "0.040 s…"), so each is compared whole.
const printed=(win,text,times=1,timeout=30000)=>win.waitForFunction(([text,times])=>[...document.querySelectorAll('#console-output .log-line')].filter(d=>d.lastChild?.textContent===text).length>=times,[text,times],{timeout})
 .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}`);});

async function newRaProject(win,template='ra-minimal'){
 await win.evaluate(()=>document.getElementById('new').click());
 if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
 await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template',template);
 await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
 await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
}
async function openStacks(win){
 if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');await win.click('[data-ra-tab="stacks"]');
}
async function setCode(win,code){await win.evaluate(v=>{const c=document.getElementById('code');c.value=v;c.dispatchEvent(new Event('input',{bubbles:true}));},code);}
const COUNTER_CODE=`#include "hal_data.h"
#include <stdio.h>

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER

void hal_entry(void)
{
    flash_result_t blank = FLASH_RESULT_NOT_BLANK;
    uint32_t count = 0;
    R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);
    R_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, &blank);
    if (FLASH_RESULT_NOT_BLANK == blank)
    {
        count = *(uint32_t *) 0x08000000U;
    }
    count++;
    R_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);
    R_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &count, 0x08000000U, 4);
    printf("boot %lu\\n", (unsigned long) count);
    while (1)
    {
        R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    }
}

void external_irq1_callback(external_irq_callback_args_t *p_args)
{
    (void) p_args;
}

void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event)
    {
        R_IOPORT_Open(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}
`;

test('New Stack → Storage → Flash (r_flash_hp): Properties and Summary; the boot counter goes on across RESET and stop/run, and starts over after 데이터 플래시 지우기',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win);await openStacks(win);
  assert.deepEqual(await win.evaluate(()=>[...document.querySelectorAll('#ra-stack-add optgroup[label="Storage"] option')].map(o=>[o.value,o.textContent])),[['FLASH','Flash (r_flash_hp)']]);
  await win.selectOption('#ra-stack-add','FLASH');await win.click('[data-ra-add]');
  const card='[data-ra-stack="FLASH"]';await win.waitForSelector(card);
  assert.match(await win.textContent(card+' header'),/g_flash0\s*Flash \(r_flash_hp\)/);
  assert.equal(await win.inputValue(card+' [data-ra-field="bgo"]'),'0');assert.equal(await win.isDisabled(card+' [data-ra-field="callback"]'),true);
  assert.equal(await win.locator(card+' [data-ra-field="readyPriority"]').count(),0,'no interrupt without background operation');
  const hint=await win.textContent(card);
  assert.match(hint,/데이터 플래시: 0x08000000~0x08001FFF \(8 KB\) · 지우기 블록 64바이트 · 쓰기 단위 4바이트/);assert.match(hint,/R_FLASH_HP_BlankCheck로 확인하세요/);assert.match(hint,/실행을 멈췄다 다시 실행해도 남습니다\(프로젝트에 저장\)/);
  assert.match(await win.textContent('[data-ra-flash-saved]'),/프로젝트에 저장된 데이터 플래시: 없음\(모두 지워진 상태\)/);assert.equal(await win.isDisabled('[data-ra-flash-clear]'),true);
  assert.equal(await win.evaluate(()=>document.querySelector('#ra-stack-add option[value="FLASH"]')),null,'one flash stack');
  // Background operation brings the callback and the two interrupt priorities; back to Disabled takes them away.
  await win.selectOption(card+' [data-ra-field="bgo"]','1');
  await win.waitForFunction(sel=>document.querySelector(sel+' [data-ra-field="callback"]').value==='flash_callback',card);
  assert.equal(await win.inputValue(card+' [data-ra-field="readyPriority"]'),'12');assert.equal(await win.inputValue(card+' [data-ra-field="errorPriority"]'),'12');
  assert.match(await win.textContent(card),/FLASH_EVENT_ERASE_COMPLETE · WRITE_COMPLETE · BLANK · NOT_BLANK · ERR_FAILURE/);assert.equal(await win.textContent('#ra-pinout-error'),'');
  await win.selectOption(card+' [data-ra-field="bgo"]','0');
  await win.waitForFunction(sel=>document.querySelector(sel+' [data-ra-field="callback"]').disabled,card);
  await win.click('[data-ra-tab="summary"]');assert.match(await win.textContent('#ra-summary'),/g_flash0 \(r_flash_hp\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  await setCode(win,COUNTER_CODE);
  // First run: 1. The board's RESET button (a new run of the same board): 2.
  await win.keyboard.press('Control+F5');await printed(win,'boot 1');
  const reset=win.locator('[data-button="RESET"]');for(const type of ['pointerdown','pointerup'])await reset.dispatchEvent(type,{button:0,isPrimary:true,pointerId:1,bubbles:true});
  await printed(win,'boot 2');
  assert.match(await consoleText(win),/데이터 플래시 내용\(4바이트\)을 프로젝트에 저장했습니다\. 다음 실행에도 남아 있습니다/);
  await win.keyboard.press('Control+F2');await stopped(win);
  // Stop and run again (the power off and on): 3.
  await win.keyboard.press('Control+F5');await printed(win,'boot 3');
  await win.keyboard.press('Control+F2');await stopped(win);
  // The saved contents show in the stack; erasing them starts the counter over.
  await openStacks(win);
  assert.match(await win.textContent('[data-ra-flash-saved]'),/프로젝트에 저장된 데이터 플래시: 4바이트/);
  await win.click('[data-ra-flash-clear]');
  await win.waitForFunction(()=>/없음\(모두 지워진 상태\)/.test(document.querySelector('[data-ra-flash-saved]').textContent));
  assert.equal(await win.isDisabled('[data-ra-flash-clear]'),true);
  await win.click('#ra-pinout-close');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  assert.match(await consoleText(win),/프로젝트에 저장된 데이터 플래시 내용을 지웠습니다/);
  await win.keyboard.press('Control+F5');await printed(win,'boot 1',2);
  await win.keyboard.press('Control+F2');await stopped(win);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('ra_flash_counter on the RA6E1 emulator (ARM GCC + FSP): the count goes on across stop/run without a new build, and across the S1 reset',{timeout:300000,skip:!toolchain&&'ARM GCC / Renesas FSP not installed'},async()=>{
 const s=await launch({simEngine:'gcc'});
 try{
  const {win}=s;
  await newRaProject(win,'ra_flash_counter');
  const uart=(pattern,timeout)=>win.waitForFunction(source=>new RegExp(source).test(document.getElementById('uart-output').textContent),pattern,{timeout})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}\nUART: ${(await win.textContent('#uart-output')).slice(-800)}`);});
  await win.keyboard.press('Control+F5');await win.click('[data-monitor="bus"]');
  await uart('USB-TTL: boot count = 1(?!\\d)',120000);
  await win.keyboard.press('Control+F2');await stopped(win);
  assert.match(await consoleText(win),/데이터 플래시 내용\(4바이트\)을 프로젝트에 저장했습니다/);
  await win.keyboard.press('Control+F5');await uart('USB-TTL: boot count = 2(?!\\d)',60000);
  assert.equal(((await consoleText(win)).match(/ARM GCC로 펌웨어를 빌드합니다/g)||[]).length,1,'saving the data flash does not ask for a new build');
  // S1 pressed and released: NVIC_SystemReset, logged, and the count goes on.
  const button=win.locator('[data-button="SW1"]'),box=await button.boundingBox();
  await win.mouse.move(box.x+box.width/2,box.y+box.height/2);await win.mouse.down();await win.waitForTimeout(300);await win.mouse.up();
  await uart('boot count = 3(?!\\d)',60000);
  await win.keyboard.press('Control+F2');await stopped(win);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
