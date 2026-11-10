// What a drop on the window does (file-drop.js planDrop): open a project, import a CubeIDE tree, or add sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import {planDrop} from '../../src/file-drop.js';
import {blankProject} from '../../src/project.js';

const f=(name,text='')=>({name,text,size:text.length});

test('a project file opens; with other files it is refused',()=>{
 assert.deepEqual(planDrop([f('my.stm32lab','{"a":1}')],blankProject()),{action:'open',text:'{"a":1}'});
 assert.throws(()=>planDrop([f('my.stm32lab','{}'),f('a.c')],blankProject()),/하나만 놓으세요/);
 assert.throws(()=>planDrop([],blankProject()),/놓을 수 있는 파일이 없습니다/);
});

test('an .ioc or a main.c makes it an import; a single dropped folder is the project root; SDK-provided files are left out',()=>{
 const plan=planDrop([f('MyProject/MyProject.ioc','x'),f('MyProject/Core/Src/main.c','int main(void){}'),f('MyProject/Core/Inc/main.h','h'),f('MyProject/Core/Src/syscalls.c','s'),f('MyProject/Core/Src/app.cpp','c')],blankProject());
 assert.equal(plan.action,'import');
 assert.deepEqual(plan.files.map(x=>x.name),['MyProject.ioc','Core/Src/main.c','Core/Inc/main.h']);
 assert.deepEqual(plan.skipped.sort(),['Core/Src/app.cpp','Core/Src/syscalls.c']);
 assert.equal(planDrop([f('oled.ioc','x')],blankProject()).action,'import');
});

test('other sources are added with their folders; an existing file is replaced; bad names are reported; limits hold',()=>{
 const p=blankProject();p.firmware.files=[{name:'Lib/oled.c',text:'old'}];
 const plan=planDrop([f('Lib/oled.c','new'),f('Lib/oled.h','h'),f('Lib/한글.c','x'),f('notes.txt','n'),f('util.cpp','u')],p);
 assert.equal(plan.action,'add');
 assert.deepEqual(plan.files,[{name:'Lib/oled.c',text:'new',replaces:true},{name:'Lib/oled.h',text:'h',replaces:false},{name:'util.cpp',text:'u',replaces:false}]);
 assert.deepEqual(plan.skipped.sort(),['Lib/한글.c','notes.txt'].sort());
 assert.throws(()=>planDrop([f('한글.c','x')],p),/이름을 쓸 수 없습니다/);
 assert.throws(()=>planDrop(Array.from({length:121},(_,i)=>f(`f${i}.c`)),blankProject()),/120개까지/);
 assert.throws(()=>planDrop([f('big.c','x'.repeat(1000001))],blankProject()),/1 MB/);
});
