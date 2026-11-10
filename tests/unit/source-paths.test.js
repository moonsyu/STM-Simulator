// Project files with folders (feature 10: a CubeIDE project keeps its tree): names, includes across folders, the
// importer's main.c choice, and the interpreter resolving "x.h" / "../Inc/x.h".
import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_PATH,resolveInclude,changeSourceFile,baseName,folderOf} from '../../src/source-files.js';
import {blankProject,validateProject} from '../../src/project.js';
import {importFirmware} from '../../src/firmware-import.js';
import {generateHal} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

test('source paths: up to six folders, no dot folders or traversal; include resolution prefers the nearest file',()=>{
 for(const ok of ['app.c','Core/Src/app.c','Core/Inc/app.h','a/b/c/d/e/f/x.c','USER/OLED/oled.c','lib-1/v2.0/x.hpp'])assert.ok(SOURCE_PATH.test(ok),ok);
 for(const bad of ['../x.c','Core/../x.c','/abs.c','Core//x.c','.git/x.c','a/b/c/d/e/f/g/x.c','Core/Src/','Core/Src/x.txt','C:/x.c','Core\\Src\\x.c','Core Src/x.c'])assert.ok(!SOURCE_PATH.test(bad),bad);
 assert.equal(baseName('Core/Src/app.c'),'app.c');assert.equal(folderOf('Core/Src/app.c'),'Core/Src');assert.equal(folderOf('app.c'),'');
 const names=['Core/Inc/app.h','Core/Src/app.c','USER/app.h','USER/drv/oled.h'];
 assert.equal(resolveInclude(names,'app.h','Core/Src/app.c'),'Core/Inc/app.h','first by name');
 assert.equal(resolveInclude(names,'app.h','USER/main2.c'),'USER/app.h','same folder first');
 assert.equal(resolveInclude(names,'../Inc/app.h','Core/Src/app.c'),'Core/Inc/app.h');
 assert.equal(resolveInclude(names,'drv/oled.h','USER/x.c'),'USER/drv/oled.h');assert.equal(resolveInclude(names,'oled.h','Core/Src/app.c'),'USER/drv/oled.h');
 assert.equal(resolveInclude(names,'missing.h','Core/Src/app.c'),undefined);
});

test('files in folders: add / rename keep includes by name; the same file name may exist in two folders',()=>{
 let p=blankProject();p=changeSourceFile(p,'add','Core/Inc/app.h');p=changeSourceFile(p,'add','Core/Src/app.c');p=changeSourceFile(p,'add','USER/app.c');
 assert.deepEqual(p.firmware.files.map(f=>f.name),['Core/Inc/app.h','Core/Src/app.c','USER/app.c']);
 assert.throws(()=>changeSourceFile(p,'add','core/src/APP.c'),/같은 이름/);assert.throws(()=>changeSourceFile(p,'add','Core/Src/main.c'),/main\.c는 프로젝트의 주 소스/);
 p.firmware.files[1].text='#include "app.h"\n#include "../Inc/app.h"\n';
 assert.throws(()=>changeSourceFile(p,'delete','Core/Inc/app.h'),/include하는 파일/);
 const renamed=changeSourceFile(p,'rename','Core/Inc/app.h','Core/Inc/application.h');
 assert.equal(renamed.firmware.files[1].text,'#include "application.h"\n#include "../Inc/application.h"\n');
 assert.equal(validateProject(renamed).firmware.files.length,3);
});

test('importing a CubeIDE tree: Core/Src/main.c becomes main.c with its folder remembered, other files keep their paths, and the program runs',()=>{
 const base=blankProject(),main=generateHal(base.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  printf("sum=%d\\n", app_add(2, 3));').replace('/* USER CODE BEGIN Includes */','/* USER CODE BEGIN Includes */\n#include "app.h"\n#include "../../USER/board.h"');
 const {project}=importFirmware(base,[{name:'Core/Src/main.c',text:main},{name:'Core/Inc/app.h',text:'#pragma once\nint app_add(int a, int b);\n'},{name:'Core/Src/app.c',text:'#include "app.h"\n#include "board.h"\nint app_add(int a, int b) { return a + b + BOARD_OFFSET; }\n'},{name:'USER/board.h',text:'#pragma once\n#define BOARD_OFFSET 10\n'}]);
 assert.equal(project.firmware.mainFolder,'Core/Src');assert.deepEqual(project.firmware.files.map(f=>f.name),['Core/Inc/app.h','Core/Src/app.c','USER/board.h']);
 const out=[],s=new SimulationSession(project,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=50;t+=10)s.tick(t);
 assert.deepEqual(out,['sum=15']);
 const two=importFirmware(base,[{name:'Core/Src/main.c',text:main.replace('#include "app.h"\n#include "../../USER/board.h"','').replace(/printf\("sum[^\n]*\n/,'')},{name:'test/main.c',text:'int main(void){return 0;}'}]);
 assert.match(two.warnings.join('\n'),/main\.c가 여러 개라 Core\/Src\/main\.c을 주 소스로 썼습니다: test\/main\.c/);
});
