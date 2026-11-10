// What the firmware emulator says when a program leaves the chip's real limits (ARM GCC build, real HAL):
// touching a peripheral the emulator does not model names it, and the NUCLEO-F103RB has its real 20 KB of RAM.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';

test('fault messages: a missing peripheral is named (F446RE USB OTG FS); RAM past 20 KB faults on the F103RB and works on the F446RE',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'accuracy-'));
 const run=async(base,init)=>{
  const p=structuredClone(base);p.components=[];p.wires=[];p.mcu.pins.PC0={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'',initial:0};
  p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+init+'\n  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);');
  const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[]);
  const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});let error=null;
  try{for(let t=10;t<=200;t+=10)s.tick(t);}catch(e){error=e.message;}
  return {s,error,fault:error??s.result?.fault??s.fault??''};
 };
 try{
  const usb=await run(blankProject(),'  *(volatile uint32_t *)0x50000008 = 1; /* USB_OTG_FS GAHBCFG */');
  assert.match(String(usb.fault),/잘못된 메모리 접근 0x50000008 \(USB_OTG_FS: 이 시뮬레이터에 없는 주변장치입니다\)/);
  const poke='  *(volatile uint32_t *)0x20006000 = 0x1234; /* 24 KB into RAM */';
  const f4=await run(blankProject(),poke);assert.equal(f4.error,null);assert.equal(f4.s.gpio.PC0?.value,3.3,'F446RE has 128 KB of RAM');
  const f1=await run(projectForBoard('nucleo-f103rb'),poke);
  assert.match(String(f1.fault),/잘못된 메모리 접근 0x20006000 \(STM32F103RB의 RAM은 20 KB/);assert.notEqual(f1.s.gpio.PC0?.value,3.3);
  const ok=await run(projectForBoard('nucleo-f103rb'),'  *(volatile uint32_t *)0x20004ff0 = 0x1234;');assert.equal(ok.error,null);assert.equal(ok.s.gpio.PC0?.value,3.3,'inside the 20 KB');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('NRST pulled LOW by a button resets the MCU and RCC_FLAG_PINRST alone is set (F446RE, F103RB)',{skip,timeout:600000},async()=>{
 const {halExample}=await import('../../src/hal-examples.js'),{boardPins}=await import('../../src/pins.js');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'nrst-'));
 try{
  for(const [board,base]of [['F446RE',blankProject()],['F103RB',projectForBoard('nucleo-f103rb')]]){
   // The button example's circuit (same header positions on both NUCLEO-64 boards) on this board's own settings.
   const p=halExample('button');p.boardId=base.boardId;p.mcu=structuredClone(base.mcu);const input='PA10',from=boardPins(p.boardId).filter(x=>x.signal===input).map(x=>x.id);
   const wire=p.wires.find(w=>from.includes(w.from)||from.includes(w.to));assert.ok(wire,board+' button wire');
   const nrst=boardPins(p.boardId).find(x=>x.signal==='NRST').id;if(from.includes(wire.from))wire.from=nrst;else wire.to=nrst;
   p.mcu.pins.PC0={function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'',initial:0};p.mcu.pins.PC1={...p.mcu.pins.PC0};
   // PC0: started at least once; PC1: this start came after a pin reset with no power-on, software or watchdog cause.
   p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  if (__HAL_RCC_GET_FLAG(RCC_FLAG_PINRST) && !__HAL_RCC_GET_FLAG(RCC_FLAG_PORRST) && !__HAL_RCC_GET_FLAG(RCC_FLAG_SFTRST) && !__HAL_RCC_GET_FLAG(RCC_FLAG_IWDGRST)) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_1, GPIO_PIN_SET);\n  __HAL_RCC_CLEAR_RESET_FLAGS();\n  HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);');
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],board);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   for(let t=10;t<=100;t+=10)s.tick(t);
   assert.equal(s.gpio.PC0?.value,3.3,board);assert.equal(s.gpio.PC1?.value,0,board+': first start is a power-on reset');
   const button=p.components.find(c=>c.type==='button').id;s.setPressed({[button]:true});for(let t=110;t<=150;t+=10)s.tick(t);
   s.setPressed({});for(let t=160;t<=300;t+=10)s.tick(t);
   assert.equal(s.gpio.PC1?.value,3.3,board+': restarted with RCC_FLAG_PINRST only');
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
