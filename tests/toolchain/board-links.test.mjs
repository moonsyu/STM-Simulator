// The wired board-to-board examples built with the real ST HAL and run together on the firmware emulator: the
// I²C and SPI slaves are the emulated peripherals of the other board. Skipped without ARM GCC and STM32CubeF1.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {applyLectureExample} from '../../src/lecture-examples.js';
import {stm32Boards,stm32View,createStm32Drivers,connectStm32Drivers} from '../../src/stm32-boards.js';
import {FirmwareSession} from '../../src/firmware-session.js';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const {prepareBuild,build}=require(path.join(root,'desktop/native-build.cjs'));
const exists=p=>fs.access(p).then(()=>true,()=>false);
const gcc=process.env.ARM_GCC||'',cubeF1=process.env.STM32CUBE_F1_ROOT||'';
const available=!!gcc&&await exists(gcc)&&await exists(path.join(cubeF1,'Drivers/STM32F1xx_HAL_Driver/Inc/stm32f1xx_hal.h'));
const tools={armGcc:gcc,cube:process.env.STM32CUBE_F4_ROOT||'',cubeF1,armGdb:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''};

async function elf(project,work){const plan=await prepareBuild({project,tools,root:work,target:'arm',configuration:'Debug'});return new Uint8Array(await fs.readFile((await build(plan,{onOutput:()=>{}})).elf));}
async function runTogether(id,ms){
 const {project}=applyLectureExample(id),work=await fs.mkdtemp(path.join(os.tmpdir(),'stm-links-'));
 const elfs={};for(const b of stm32Boards(project))elfs[b.id]=await elf(stm32View(project,b.id),work);
 const session=new FirmwareSession(project,{elf:await elf(project,work),print:()=>{},uart:()=>{},trace:()=>{}});
 session.circuit.drivers=createStm32Drivers(project,{emulate:true,elfs});connectStm32Drivers(session);
 for(let t=20;t<=ms;t+=20)session.tick(t);
 return {main:session.buses.vcpOutput||'',other:session.circuit.drivers[0].session.buses.vcpOutput||'',session};
}
const skip=!available&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF1 not installed';
test('I²C between two emulated NUCLEO-F103RB: the slave answers each command',{skip,timeout:600000},async()=>{
 const {main}=await runTogether('wired-i2c-stm32',1300);
 assert.match(main,/sent ON/);assert.match(main,/sent OFF/);assert.match(main,/ack/);assert.doesNotMatch(main,/no answer/);
});
test('SPI between two emulated NUCLEO-F103RB: each byte comes back on the next exchange',{skip,timeout:600000},async()=>{
 const {main,other}=await runTogether('wired-spi-stm32',1000);
 assert.match(other,/byte in/);assert.match(main,/slave answered/);
});
