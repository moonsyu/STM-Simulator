// Feature 31: when the simulator's ARM GCC build fails, the run button goes back to "▶ 실행". It once stayed on
// "■ 빌드 취소", and pressing it (to cancel) started another build.
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

test('a failed build leaves the run button on "▶ 실행"; after the code is fixed the same button builds and runs',{skip:!toolchain&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP not installed',timeout:300000},async()=>{
 const s=await launch();
 await fs.writeFile(path.join(s.profile,'native-tools.json'),JSON.stringify({armGcc:gcc,fsp,armGdb:'',cube:'',cubeF1:'',hostGcc:'',hostGdb:'',clangd:'',openocd:'',buildRoot:''}));
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra-blinky');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  const setCode=change=>win.evaluate(change=>{const c=document.getElementById('code');c.value=change==='break'?c.value.replace('/* TODO: add your own code here */','this is not C;'):c.value.replace('this is not C;','/* TODO: add your own code here */');c.dispatchEvent(new Event('input',{bubbles:true}));},change);
  const button=()=>win.evaluate(()=>({text:document.getElementById('run').textContent.trim(),running:document.getElementById('run').classList.contains('running'),shell:document.getElementById('shell').dataset.running}));
  await setCode('break');
  await win.click('#run');
  // While it builds the button offers to cancel.
  await win.waitForFunction(()=>/빌드 취소/.test(document.getElementById('run').textContent),null,{timeout:20000});
  // The build ends (failed): the button no longer offers to cancel.
  await win.waitForFunction(()=>!/빌드 취소/.test(document.getElementById('run').textContent),null,{timeout:200000})
   .catch(async()=>{throw new Error('still building or the button stayed: '+JSON.stringify(await button())+' 출력: '+(await win.textContent('#console-output')).slice(-600));});
  assert.match(await win.textContent('#console-output'),/error|오류|못했습니다/);
  await win.waitForFunction(()=>!/빌드 취소/.test(document.getElementById('run').textContent),null,{timeout:10000}).catch(async()=>{throw new Error('the button stayed on: '+JSON.stringify(await button()));});
  assert.deepEqual(await button(),{text:'▶ 실행',running:false,shell:'false'});
  // The same button again: it builds again (and fails again), it does not "cancel" into a run.
  await win.click('#run');
  await win.waitForFunction(()=>/빌드 취소/.test(document.getElementById('run').textContent),null,{timeout:20000});
  await win.waitForFunction(()=>/▶ 실행/.test(document.getElementById('run').textContent),null,{timeout:200000});
  // Fixed: the button builds and runs.
  await setCode('fix');
  await win.click('#run');
  await win.waitForFunction(()=>/정지/.test(document.getElementById('run').textContent),null,{timeout:200000});
  assert.equal((await button()).text,'■ 정지');
  await win.click('#run');await win.waitForFunction(()=>/▶ 실행/.test(document.getElementById('run').textContent));
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
