// SEGGER J-Link for the FPB-RA6E1 (desktop/jlink.cjs): the Commander script that writes firmware.hex, the arguments of
// J-Link Commander and the GDB server, which probe is used, and how a failed write is reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const jlink=require('../../desktop/jlink.cjs');

test('J-Link Commander script and arguments: SWD 4 MHz on the R7FA6E10F, load firmware.hex, reset and run',()=>{
 assert.equal(jlink.programScript('C:\\b\\firmware.hex'),'r\nh\nloadfile "C:/b/firmware.hex"\nr\ng\nqc\n');
 assert.deepEqual(jlink.commonArgs({serial:'831363305',device:'R7FA6E10F'}),['-USB','831363305','-device','R7FA6E10F','-if','SWD','-speed','4000','-autoconnect','1','-NoGui','1','-ExitOnError','1']);
 const g=jlink.gdbServerArgs({serial:'831363305',device:'R7FA6E10F'});
 assert.deepEqual(g.slice(0,4),['-select','USB=831363305','-device','R7FA6E10F']);
 assert.ok(g.includes('-localhostonly')&&g[g.indexOf('-port')+1]==='2331'&&g.includes('-singlerun'));
 assert.equal(jlink.JLINK_DEVICES.R7FA6E10F,'R7FA6E10F');
 assert.match(jlink.gdbServerOf('C:\\SEGGER\\JLink_V812\\JLink.exe'),/JLink_V812[\\/]JLinkGDBServerCL\.exe$/);
});

test('the J-Link is the one picked, else the only one connected; none or several say what to do',async()=>{
 const two=async()=>[{serial:'111111'},{serial:'222222'}];
 assert.equal(await jlink.chooseJlink('222222',two),'222222');
 assert.equal(await jlink.chooseJlink('',async()=>[{serial:'831363305'}]),'831363305');
 await assert.rejects(jlink.chooseJlink('',async()=>[]),/연결되어 있지 않습니다/);
 await assert.rejects(jlink.chooseJlink('',two),/2개 연결/);
});

function fakeChild(code,text){
 const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();
 setImmediate(()=>{child.stdout.end(text);child.stderr.end();setImmediate(()=>child.emit('close',code));});
 return child;
}
test('programJlink writes the command file, runs JLink.exe and turns failures into a hint',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'jlink-'));
 try{
  let call=null,out='';
  await jlink.programJlink({jlink:'C:/SEGGER/JLink.exe',hex:path.join(dir,'firmware.hex'),serial:'831363305',device:'R7FA6E10F',directory:dir,onOutput:t=>out+=t,launcher:(exe,args)=>{call={exe,args};return fakeChild(0,'Downloading file...\nO.K.\n');}});
  assert.equal(call.exe,'C:/SEGGER/JLink.exe');assert.equal(call.args.at(-2),'-CommandFile');assert.match(await fs.readFile(call.args.at(-1),'utf8'),/^r\nh\nloadfile ".*firmware\.hex"\nr\ng\nqc\n$/);
  assert.match(out,/O\.K\./);
  await assert.rejects(jlink.programJlink({jlink:'C:/SEGGER/JLink.exe',hex:'x.hex',serial:'1',device:'R7FA6E10F',directory:dir,launcher:()=>fakeChild(1,'Connecting to J-Link via USB...FAILED')}),/J-Link 기록 실패 \(종료 코드 1\)\. J-Link에 연결하지 못했습니다/);
  await assert.rejects(jlink.programJlink({jlink:'',hex:'x.hex',device:'R7FA6E10F',directory:dir}),/SEGGER J-Link 소프트웨어/);
  assert.match(jlink.jlinkHint('Cannot connect to target.'),/타깃 MCU/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
