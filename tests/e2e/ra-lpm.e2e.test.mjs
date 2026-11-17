// Feature 37 in the app: the RA configuration's New Stack → Power → Low Power Modes (r_lpm) with its Properties (mode,
// wake sources, Deep Software Standby cancel sources and options), Summary and Developer Assistance; a run enters Deep
// Software Standby, S1 (P205, IRQ1-DS) ends it with a reset, and the output and the protocol monitor say both — on the
// built-in interpreter and, with ARM GCC + FSP installed, on the RA6E1 emulator. The example is a new-project template.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {launch} from './harness.mjs';

const local=path.join(process.env.LOCALAPPDATA||'','STM-Simulator-Tools');
const gcc=process.env.ARM_GCC||path.join(local,'xpack-arm-none-eabi-gcc-15.2.1-1.1/bin/arm-none-eabi-gcc.exe');
const fsp=process.env.FSP_ROOT||path.join(local,'FSP');
const exists=p=>fs.access(p).then(()=>true,()=>false);
const toolchain=await exists(gcc)&&await exists(path.join(fsp,'ra/fsp/src/bsp/mcu/ra6e1/bsp_feature.h'));
const LED_ON='#64e66b';
const led=(win,id,fill,timeout=20000)=>win.waitForFunction(([id,fill])=>document.getElementById('board-led-'+id)?.getAttribute('fill')===fill,[id,fill],{timeout});
const ledFill=(win,id)=>win.evaluate(id=>document.getElementById('board-led-'+id)?.getAttribute('fill'),id);
const consoleText=win=>win.textContent('#console-output');
const inConsole=(win,pattern,timeout=30000)=>win.waitForFunction(source=>new RegExp(source).test(document.getElementById('console-output').textContent),pattern.source,{timeout})
 .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}`);});

async function newRaProject(win,template='ra-minimal'){
 await win.evaluate(()=>document.getElementById('new').click());
 if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
 await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template',template);
 await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
 await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
}
async function openStacks(win){
 await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');await win.click('[data-ra-tab="stacks"]');
}
async function setCode(win,code){await win.evaluate(v=>{const c=document.getElementById('code');c.value=v;c.dispatchEvent(new Event('input',{bubbles:true}));},code);}
// S1 on the board, held for 300 ms.
async function pressS1(win){
 const box=await win.locator('[data-button="SW1"]').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 const under=await win.evaluate(([x,y])=>document.elementFromPoint(x,y)?.closest('[data-button]')?.dataset.button??'',[x,y]);
 assert.equal(under,'SW1','S1 is under the pointer');
 await win.mouse.move(x,y);await win.mouse.down();await win.waitForTimeout(300);await win.mouse.up();
}
const LPM_CODE=`#include "hal_data.h"

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER

void hal_entry(void)
{
    /* After Deep Software Standby: release the pins, LED2 on. */
    if (1U == R_SYSTEM->RSTSR0_b.DPSRSTF)
    {
        R_LPM_IoKeepClear(NULL);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, BSP_IO_LEVEL_HIGH);
    }
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    R_BSP_SoftwareDelay(300, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
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
// New Stack → Power → Low Power Modes (r_lpm): the Properties by mode, then Deep Software Standby cancelled by IRQ1-DS.
async function lpmProject(win){
 await newRaProject(win);await openStacks(win);
 assert.equal(await win.$$eval('#ra-stack-add optgroup[label="Power"] option',o=>o.map(x=>x.value).join()),'LPM','RASC files it under Power');
 await win.selectOption('#ra-stack-add','LPM');await win.click('[data-ra-add]');
 const card='[data-ra-stack="LPM"]';await win.waitForSelector(card);
 assert.match(await win.textContent(card+' header'),/g_lpm0\s*Low Power Modes \(r_lpm\)/);
 assert.equal(await win.inputValue(card+' [data-ra-field="mode"]'),'SLEEP','RASC default: Sleep mode');
 assert.match(await win.textContent(card+' .form-hint'),/CPU만 멈추고 주변장치는 계속 동작합니다[\s\S]*R_LPM_LowPowerModeEnter\(&g_lpm0_ctrl\)/);
 assert.equal(await win.$$eval('#ra-stack-add option[value="LPM"]',o=>o.length),0,'added once');
 // Software Standby: the wake sources; the board's S1 stack (IRQ1 on P205) is one already.
 await win.selectOption(card+' [data-ra-field="mode"]','STANDBY');await win.waitForSelector(card+' [data-ra-lpm-wake]');
 assert.equal(await win.isChecked(card+' [data-ra-lpm="wake"][value="IRQ1"]'),true);
 assert.match(await win.textContent(card+' [data-ra-lpm-wake]'),/IRQ1 · P205[\s\S]*IWDT[\s\S]*RTC 알람[\s\S]*RTC 주기[\s\S]*AGT1 언더플로[\s\S]*AGT3 언더플로/);
 await win.check(card+' [data-ra-lpm="wake"][value="RTCALM"]');
 await win.waitForFunction(sel=>/RTC 스택이 없습니다/.test(document.querySelector(sel+' .form-hint').textContent),card);
 await win.uncheck(card+' [data-ra-lpm="wake"][value="RTCALM"]');
 // Deep Software Standby: IOKEEP, DEEPCUT, the cancel sources by their IRQn-DS pin, and the edge of a chosen one.
 await win.selectOption(card+' [data-ra-field="mode"]','DEEP');await win.waitForSelector(card+' [data-ra-lpm-cancel]');
 assert.equal(await win.isChecked(card+' [data-ra-lpm="cancel"][value="IRQ1"]'),true,'P205 is IRQ1-DS');
 assert.match(await win.textContent(card+' [data-ra-lpm-cancel]'),/IRQ0-DS\(P206\)[\s\S]*IRQ1-DS\(P205\)[\s\S]*IRQ4-DS\(P402\)[\s\S]*RTC 주기[\s\S]*RTC 알람[\s\S]*AGT1 언더플로/);
 assert.equal(await win.$$eval(card+' [data-ra-lpm="cancel"][value="IRQ2"]',o=>o.length),0,'the RA6E1 has no DPSIER bit for IRQ2-DS');
 assert.equal(await win.inputValue(card+' [data-ra-field="ioKeep"]'),'1');assert.equal(await win.inputValue(card+' [data-ra-field="power"]'),'DEEPCUT0');
 assert.equal(await win.inputValue(card+' [data-ra-lpm-edge="IRQ1"]'),'FALLING');
 // A source without its stack is said on the Deep Software Standby card as on the Software Standby one.
 await win.check(card+' [data-ra-lpm="cancel"][value="AGT1"]');await win.check(card+' [data-ra-lpm="cancel"][value="RTC_ALARM"]');
 await win.waitForFunction(sel=>/AGT1 스택이 없습니다[\s\S]*RTC 스택이 없습니다/.test(document.querySelector(sel+' .form-hint').textContent),card);
 await win.uncheck(card+' [data-ra-lpm="cancel"][value="AGT1"]');await win.uncheck(card+' [data-ra-lpm="cancel"][value="RTC_ALARM"]');
 assert.match(await win.textContent(card+' .form-hint'),/해제 소스가 오면 MCU가 리셋되어 처음부터 다시 실행됩니다[\s\S]*IRQn-DS 핀만 해제합니다[\s\S]*R_LPM_IoKeepClear\(NULL\)/);
 await win.click('[data-ra-tab="summary"]');assert.match(await win.textContent('#ra-summary'),/g_lpm0 \(r_lpm\)/);
 await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
 // A minimal project starts with an empty circuit view: put the board on it, S1 is pressed there.
 if(await win.locator('#empty-add-board').isVisible())await win.click('#empty-add-board');
 await win.waitForFunction(()=>{const g=document.querySelector('[data-button="SW1"]');return !!g&&g.getBoundingClientRect().width>0;});
 await setCode(win,LPM_CODE);
}
// The run: Deep Software Standby 300 ms after the start (LED1 on, LED2 off), S1 ends it, LED2 says where the start came from.
async function runAndWake(win,timeout){
 await win.keyboard.press('Control+F5');
 await inConsole(win,/\[LPM\] Deep Software Standby 진입 · DEEPCUT0, I\/O 유지\(IOKEEP 1\) — 해제 소스: IRQ1-DS\(P205\)/,timeout);
 await led(win,'LED1',LED_ON);assert.notEqual(await ledFill(win,'LED2'),LED_ON,'LED2 off before the first wake-up');
 await pressS1(win);
 await inConsole(win,/\[LPM\] Deep Software Standby 해제 · IRQ1-DS\(P205\) \([\d.]+ (ms|s) 뒤\) — MCU 리셋\(RSTSR0\.DPSRSTF = 1, I\/O는 R_LPM_IoKeepClear까지 유지\)/,timeout);
 await led(win,'LED2',LED_ON);
 // The protocol monitor lists the same entries.
 await win.click('[data-monitor="bus"]');
 await win.waitForFunction(()=>/LPM\s+Deep Software Standby 진입[\s\S]*LPM\s+Deep Software Standby 해제/.test(document.getElementById('bus-events').textContent),null,{timeout:10000});
 await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
}

test('New Stack → Low Power Modes (r_lpm) on the built-in interpreter: Deep Software Standby, S1 (IRQ1-DS) resets, RSTSR0.DPSRSTF lights LED2',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await lpmProject(win);
  await win.waitForFunction(()=>[...document.querySelectorAll('#ra-assist-list [data-assist]')].some(x=>x.dataset.assist==='g_lpm0'));
  await runAndWake(win,30000);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the same project on the RA6E1 emulator (ARM GCC + FSP): the real r_lpm enters Deep Software Standby and S1 resets the MCU',{timeout:300000,skip:!toolchain&&'ARM GCC / Renesas FSP not installed'},async()=>{
 const s=await launch({simEngine:'gcc'});
 try{
  const {win}=s;
  await lpmProject(win);
  await runAndWake(win,120000);
  assert.match(await consoleText(win),/ARM GCC로 펌웨어를 빌드합니다/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the template ra_lpm_deep: the USB-TTL part shows the power-on start, then the start after Deep Software Standby when S1 is pressed',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win,'ra_lpm_deep');
  await win.keyboard.press('Control+F5');
  await win.click('[data-monitor="bus"]');
  const uart=pattern=>win.waitForFunction(source=>new RegExp(source).test(document.getElementById('uart-output').textContent),pattern.source,{timeout:30000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}\nUART: ${(await win.textContent('#uart-output')).slice(-800)}`);});
  await uart(/USB-TTL: Power-on start[\s\S]*Entering Deep Software Standby: press S1/);
  await inConsole(win,/\[LPM\] Deep Software Standby 진입/);
  await pressS1(win);
  await uart(/Woke up from Deep Software Standby by S1 \(IRQ1-DS\)/);
  await led(win,'LED2',LED_ON);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
