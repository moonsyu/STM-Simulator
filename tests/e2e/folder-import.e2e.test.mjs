// File › Cube 프로젝트 폴더 가져오기 keeps the project's folders (Core/Src, Core/Inc, a user folder): the files list
// shows them, SDK and build folders are left out, and the program runs with its includes across folders.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launch} from './harness.mjs';

test('importing a CubeIDE project folder keeps its tree and runs',{timeout:120000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cube-folder-'));
 const s=await launch();
 try{
  const {win,app}=s;
  // The project's own main.c (generated for this board) plus files in Core/Inc, Core/Src and USER.
  const main=(await win.evaluate(()=>document.getElementById('code').value)).replace('/* USER CODE BEGIN Includes */','/* USER CODE BEGIN Includes */\n#include "app.h"\n#include "../../USER/board.h"').replace(/\/\* USER CODE BEGIN 2 \*\/\n/,m=>m+'  printf("sum=%d\\n", app_add(2, 3));\n');
  const write=async(rel,text)=>{await fs.mkdir(path.dirname(path.join(dir,rel)),{recursive:true});await fs.writeFile(path.join(dir,rel),text);};
  await write('Core/Src/main.c',main);await write('Core/Inc/app.h','#pragma once\nint app_add(int a, int b);\n');
  await write('Core/Src/app.c','#include "app.h"\n#include "board.h"\nint app_add(int a, int b) { return a + b + BOARD_OFFSET; }\n');await write('USER/board.h','#pragma once\n#define BOARD_OFFSET 10\n');
  await write('Drivers/STM32F1xx_HAL_Driver/Src/skipped.c','#error "the SDK folder is not imported"\n');await write('Debug/out.c','#error "build output is not imported"\n');await write('Core/Src/syscalls.c','#error "the app provides syscalls"\n');
  await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},dir);
  await win.evaluate(()=>document.getElementById('firmware-folder').click());
  await win.waitForFunction(()=>document.querySelectorAll('#file-tree [data-source]').length===4,null,{timeout:10000}).catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#console-output')+'\n'+await win.evaluate(()=>[...document.querySelectorAll('#file-tree [data-source]')].map(b=>b.dataset.source).join(',')));});
  // Each file sits under its folder in the tree (feature 28): the folder it is in is the nearest folder row above it.
  const files=await win.evaluate(()=>[...document.querySelectorAll('#file-tree [data-source]')].map(b=>[b.dataset.source,b.closest('[data-src-folder]')?.dataset.srcFolder??'']));
  assert.deepEqual(files.sort(),[['Core/Inc/app.h','Core/Inc'],['Core/Src/app.c','Core/Src'],['USER/board.h','USER'],['main.c','Core/Src']]);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/sum=15/.test(document.getElementById('console-output').textContent),null,{timeout:25000}).catch(async e=>{throw new Error(e.message+'\n'+await win.textContent('#console-output'));});
  await win.click('#run');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();await fs.rm(dir,{recursive:true,force:true});}
});
