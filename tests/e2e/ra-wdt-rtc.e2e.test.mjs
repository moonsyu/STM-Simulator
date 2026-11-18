// Features 34 and 35 in the app: the RA configuration's New Stack adds the watchdog (and the RTC) with their
// Properties, Summary and generated files; the run resets on a WDT timeout (the output says so, the program reads
// RSTSR1.WDTRF and lights LED2) on the built-in interpreter and, with ARM GCC + FSP installed, on the RA6E1 emulator.
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
const consoleText=win=>win.textContent('#console-output');

async function newRaProject(win){
 await win.evaluate(()=>document.getElementById('new').click());
 if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
 await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra-minimal');
 await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
 await win.waitForFunction(()=>document.querySelector('#surface > .board')?.dataset.board==='fpb-ra6e1');
}
async function openStacks(win){
 await win.click('[data-activity="board"]');if(!await win.locator('#pinout-open').isVisible())await win.click('[data-activity="board"]');
 await win.click('#pinout-open');await win.waitForSelector('#ra-pinout-dialog[open]');await win.click('[data-ra-tab="stacks"]');
}
async function setCode(win,code){await win.evaluate(v=>{const c=document.getElementById('code');c.value=v;c.dispatchEvent(new Event('input',{bubbles:true}));},code);}
const WDT_CODE=`#include "hal_data.h"

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER

void hal_entry(void)
{
    /* After a WDT reset: LED2 on. */
    if (1U == R_SYSTEM->RSTSR1_b.WDTRF)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, BSP_IO_LEVEL_HIGH);
    }
    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
    R_WDT_Refresh(&g_wdt0_ctrl);
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
// New Stack → Watchdog (r_wdt), PCLKB / 2048 (671 ms), applied; the code feeds it once and never again.
async function wdtProject(win){
 await newRaProject(win);await openStacks(win);
 const options=await win.$$eval('#ra-stack-add option',o=>o.map(x=>x.value));
 assert.ok(options.includes('WDT')&&options.includes('IWDT'),options.join());
 await win.selectOption('#ra-stack-add','WDT');await win.click('[data-ra-add]');
 const card='[data-ra-stack="WDT"]';await win.waitForSelector(card);
 assert.match(await win.textContent(card+' header'),/g_wdt0\s*Watchdog \(r_wdt\)/);
 await win.selectOption(card+' [data-ra-field="clockDiv"]','2048');
 await win.waitForFunction(sel=>/× 16384 클록 → 671\.1 ms 안에 새로 고침해야 합니다/.test(document.querySelector(sel+' .form-hint').textContent),card);
 assert.equal(await win.$$eval('#ra-stack-add option[value="WDT"]',o=>o.length),0,'added once');
 await win.click('[data-ra-tab="summary"]');assert.match(await win.textContent('#ra-summary'),/g_wdt0 \(r_wdt\)/);
 await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
 await setCode(win,WDT_CODE);
}

test('New Stack → Watchdog (r_wdt) on the built-in interpreter: no refresh → reset in the output, RSTSR1.WDTRF lights LED2',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await wdtProject(win);
  // Developer Assistance lists the stack with the reset-cause snippet.
  await win.waitForFunction(()=>[...document.querySelectorAll('#ra-assist-list [data-assist]')].some(x=>x.dataset.assist==='g_wdt0'));
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[WDT\] 671\.1 ms 안에 R_WDT_Refresh가 없었습니다 — 워치독 리셋: 프로그램을 처음부터 다시 실행합니다/.test(document.getElementById('console-output').textContent),null,{timeout:30000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}`);});
  await led(win,'LED2',LED_ON);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the same project on the RA6E1 emulator (ARM GCC + FSP): the real r_wdt underflows, the MCU resets, LED2 lights',{timeout:240000,skip:!toolchain&&'ARM GCC / Renesas FSP not installed'},async()=>{
 const s=await launch({simEngine:'gcc'});
 try{
  const {win}=s;
  await wdtProject(win);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[WDT\] 시간 초과\(언더플로\) — MCU를 리셋합니다\(RSTSR1\.WDTRF\)/.test(document.getElementById('console-output').textContent),null,{timeout:120000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}`);});
  assert.match(await consoleText(win),/ARM GCC로 펌웨어를 빌드합니다/);
  await led(win,'LED2',LED_ON);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

const RTC_CODE=`#include "hal_data.h"
#include <stdio.h>

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER

static volatile bool tick = false;

void rtc_callback(rtc_callback_args_t *p_args)
{
    if (RTC_EVENT_PERIODIC_IRQ == p_args->event)
    {
        tick = true;
    }
}

void hal_entry(void)
{
    rtc_time_t t = { .tm_sec = 58, .tm_min = 59, .tm_hour = 23, .tm_mday = 31, .tm_mon = 11, .tm_year = 125 };
    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);
    R_RTC_CalendarTimeSet(&g_rtc0_ctrl, &t);
    R_RTC_PeriodicIrqRateSet(&g_rtc0_ctrl, RTC_PERIODIC_IRQ_SELECT_1_SECOND);
    while (1)
    {
        if (tick)
        {
            tick = false;
            R_RTC_CalendarTimeGet(&g_rtc0_ctrl, &t);
            printf("RTC %04d-%02d-%02d %02d:%02d:%02d\\n", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec);
        }
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

test('New Stack → Realtime Clock (r_rtc): Properties, Summary, the low-speed clocks in Clocks; the run prints the calendar crossing midnight',{timeout:240000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await newRaProject(win);await openStacks(win);
  await win.selectOption('#ra-stack-add','RTC');await win.click('[data-ra-add]');
  const card='[data-ra-stack="RTC"]';await win.waitForSelector(card);
  assert.match(await win.textContent(card+' header'),/g_rtc0\s*Realtime Clock \(r_rtc\)/);
  assert.equal(await win.inputValue(card+' [data-ra-field="clockSource"]'),'LOCO');assert.equal(await win.inputValue(card+' [data-ra-field="start"]'),'HOST_TIME');
  await win.selectOption(card+' [data-ra-field="start"]','SIMULATION');
  assert.match(await win.textContent(card+' .form-hint'),/실행마다 2000-01-01 00:00:00에서 시작하고, R_RTC_Open이 RTC를 멈추니/);
  await win.selectOption(card+' [data-ra-field="clockSource"]','SUBCLOCK');
  await win.waitForFunction(sel=>/E25\/E26이 열려 있어/.test(document.querySelector(sel+' .form-hint').textContent),card);
  await win.click('[data-ra-tab="clocks"]');
  assert.match(await win.textContent('[data-ra-low-clocks]'),/SOSC \(Sub-Clock\)\s*32\.768 kHz\s*RTC 카운트 소스 · Populated/);
  await win.click('[data-ra-tab="stacks"]');await win.selectOption(card+' [data-ra-field="clockSource"]','LOCO');
  await win.click('[data-ra-tab="summary"]');assert.match(await win.textContent('#ra-summary'),/g_rtc0 \(r_rtc\)/);
  await win.click('#ra-pinout-apply');await win.waitForFunction(()=>!document.getElementById('ra-pinout-dialog').open);
  await setCode(win,RTC_CODE);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/RTC 2025-12-31 23:59:59[\s\S]*RTC 2026-01-01 00:00:00/.test(document.getElementById('console-output').textContent),null,{timeout:30000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}`);});
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('ra_rtc_clock on the RA6E1 emulator (ARM GCC + FSP): the USB-TTL part shows the time each second and the greeting at midnight',{timeout:240000,skip:!toolchain&&'ARM GCC / Renesas FSP not installed'},async()=>{
 const s=await launch({simEngine:'gcc'});
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());
  if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra_rtc_clock');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await win.keyboard.press('Control+F5');
  await win.click('[data-monitor="bus"]');
  await win.waitForFunction(()=>/USB-TTL: 2025-12-31 23:59:56[\s\S]*2026-01-01 00:00:00 Happy New Year!/.test(document.getElementById('uart-output').textContent),null,{timeout:120000})
   .catch(async error=>{throw new Error(`${error.message}\n출력: ${(await consoleText(win)).slice(-1500)}\nUART: ${(await win.textContent('#uart-output')).slice(-800)}`);});
  assert.match(await consoleText(win),/ARM GCC로 펌웨어를 빌드합니다/);
  await led(win,'LED2',LED_ON);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
