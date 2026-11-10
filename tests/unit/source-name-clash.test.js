// Source names a project cannot hold, and #include lines of a header that shares its name with one in another folder.
// Found by probing drops and renames: a dropped Main.c made a project that could not be opened again.
import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,validateProject} from '../../src/project.js';
import {planDrop} from '../../src/file-drop.js';
import {changeSourceFile,nameClash} from '../../src/source-files.js';
import {importFirmware} from '../../src/firmware-import.js';

const project=()=>{const p=blankProject();p.firmware={mode:'sketch',files:[{name:'Core/Inc/app.h',text:'#pragma once\n'},{name:'Drivers/app.h',text:'#pragma once\n'},{name:'a.c',text:'#include "Core/Inc/app.h"\n#include "../Drivers/app.h"\n'}]};return p;};

test('nameClash: main.c in any case or folder, the same name without case, a file where a folder is',()=>{
 assert.equal(nameClash([],'Main.c'),'main');assert.equal(nameClash([],'Core/Src/MAIN.C'),'main');
 assert.equal(nameClash(['lib/x.c'],'LIB/X.c'),'same');
 assert.equal(nameClash(['a.c'],'a.c/b.c'),'folder');assert.equal(nameClash(['a.c/b.c'],'a.c'),'folder');
 assert.equal(nameClash(['Core/Inc/app.h'],'Core/Inc/app2.h'),'');assert.equal(nameClash(['Core/app.h'],'Core/Inc/app.h'),'');
});

test('a drop leaves out the names the project cannot hold, and what it adds validates',()=>{
 const p=project();
 assert.throws(()=>planDrop([{name:'Main.c',text:'int x;'}],p),/추가할 수 없습니다/);
 assert.throws(()=>planDrop([{name:'a.c/b.c',text:''}],p),/추가할 수 없습니다/);
 const plan=planDrop([{name:'lib/x.c',text:'int a;'},{name:'LIB/X.c',text:'int b;'},{name:'Main.c',text:''},{name:'y.c',text:'1'},{name:'y.c',text:'2'},{name:'A.c',text:'int z;'}],p);
 assert.deepEqual(plan.files.map(f=>[f.name,f.replaces]),[['lib/x.c',false],['y.c',false],['a.c',true]]);
 assert.deepEqual(plan.skipped,['LIB/X.c','Main.c','y.c']);
 for(const f of plan.files){const old=p.firmware.files.find(x=>x.name===f.name);if(old)old.text=f.text;else p.firmware.files.push({name:f.name,text:f.text});}
 assert.equal(validateProject(p).firmware.files.length,5);
});

test('adding or renaming to a name that is a folder of another source is refused; a saved project with one is rejected',()=>{
 const p=project();
 assert.throws(()=>changeSourceFile(p,'add','Core/Inc/app.h/x.c'),/폴더 이름이 겹칩니다/);
 assert.throws(()=>changeSourceFile(p,'rename','a.c','Drivers/app.h/a.c'),/폴더 이름이 겹칩니다/);
 assert.throws(()=>changeSourceFile(p,'rename','a.c','Drivers/APP.h'),/같은 이름의 파일/);
 assert.equal(changeSourceFile(p,'rename','a.c','A.c').firmware.files[2].name,'A.c');
 p.firmware.files.push({name:'a.c/b.c',text:''});assert.throws(()=>validateProject(p),/소스 파일 이름/);
});

test('renaming or deleting a header touches only the #include lines that mean it',()=>{
 const p=project();
 const renamed=changeSourceFile(p,'rename','Core/Inc/app.h','Core/Inc/util.h');
 assert.equal(renamed.firmware.files[2].text,'#include "Core/Inc/util.h"\n#include "../Drivers/app.h"\n');
 // main.c includes by bare name: the first match among the folders is Core/Inc/app.h.
 p.code='#include "app.h"\nint main(void){return 0;}\n';
 assert.match(changeSourceFile(p,'rename','Core/Inc/app.h','Core/Inc/util.h').code,/#include "util\.h"/);
 assert.match(changeSourceFile(p,'rename','Drivers/app.h','Drivers/drv.h').code,/#include "app\.h"/);
 assert.throws(()=>changeSourceFile(p,'delete','Drivers/app.h'),/include하는 파일/);
 p.firmware.files[2].text='#include "Core/Inc/app.h"\n';
 assert.deepEqual(changeSourceFile(p,'delete','Drivers/app.h').firmware.files.map(f=>f.name),['Core/Inc/app.h','a.c']);
 assert.throws(()=>changeSourceFile(p,'delete','Core/Inc/app.h'),/include하는 파일/);
});

test('importing a folder leaves out Main.c beside main.c and names that differ only in case, with a warning',()=>{
 const {project:out,warnings}=importFirmware(blankProject(),[{name:'main.c',text:'int main(void){return 0;}\n'},{name:'old/Main.c',text:''},{name:'lib/x.h',text:''},{name:'LIB/X.h',text:''}]);
 assert.deepEqual(out.firmware.files.map(f=>f.name),['lib/x.h']);
 assert.ok(warnings.includes('이름이 겹쳐 가져오지 않은 파일: old/Main.c, LIB/X.h'),warnings.join(' | '));
 validateProject(out);
});
