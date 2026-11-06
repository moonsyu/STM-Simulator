// ARM builds carry DWARF 4 debug information (GCC 15 defaults to 5), so STM Studio's GDB (DWARF 2-4) can load the
// app's firmware.elf; the emulator still maps addresses to source lines and the variable graph still finds globals.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard,validateProject} from '../../src/project.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';

/** Versions of every compilation unit header in .debug_info of a 32-bit little-endian ELF. */
export function dwarfVersions(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),shoff=v.getUint32(32,true),shentsize=v.getUint16(46,true),shnum=v.getUint16(48,true),shstrndx=v.getUint16(50,true);
 const sec=i=>{const o=shoff+i*shentsize;return {name:v.getUint32(o,true),offset:v.getUint32(o+16,true),size:v.getUint32(o+20,true)};};
 const names=sec(shstrndx),name=n=>{let s='';for(let i=names.offset+n;bytes[i];i++)s+=String.fromCharCode(bytes[i]);return s;};
 const info=[...Array(shnum).keys()].map(sec).find(s=>name(s.name)==='.debug_info');if(!info)return [];
 const out=[];for(let o=info.offset;o<info.offset+info.size;){const len=v.getUint32(o,true);out.push(v.getUint16(o+4,true));o+=4+len;}
 return out;
}

test('firmware.elf of F446RE, F103RB and FPB-RA6E1 builds is DWARF 4; the emulator still shows source lines',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dwarf4-'));
 try{
  const ra=RA_EXAMPLES.find(e=>e.id==='ra_blink');
  const cases=[['F446RE',applyHalExample(blankProject(),'blink')],['F103RB',applyHalExample(projectForBoard('nucleo-f103rb'),'blink')]];
  if(tools.fsp)cases.push(['FPB-RA6E1',validateProject({...projectForBoard('fpb-ra6e1'),mcu:ra.mcu(),code:ra.code})]);
  for(const [board,p]of cases){
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm',configuration:'Debug'}));
   const elf=new Uint8Array(await fs.readFile(result.elf)),versions=new Set(dwarfVersions(elf));
   assert.deepEqual([...versions],[4],`${board}: .debug_info units are DWARF ${[...versions].join(', ')}`);
   const s=new FirmwareSession(p,{elf});
   for(let t=20;t<=100;t+=20)s.tick(t);
   // The line table still resolves a breakpoint on the delay call and maps it back to the same source line.
   const line=p.code.split('\n').findIndex(l=>/HAL_Delay\(|R_BSP_SoftwareDelay\(/.test(l))+1,file=board==='FPB-RA6E1'?'hal_entry.c':'main.c';
   const hit=s.elf.lineTable.resolveBreakpoint(file,line,20);
   assert.ok(hit?.addrs?.length,`${board}: breakpoint ${file}:${line}`);
   assert.equal(s.elf.lineTable.addrToLine(hit.addrs[0])?.line,hit.line??line,board);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
