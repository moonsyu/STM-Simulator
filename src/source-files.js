export function sourceFiles(project){return [{name:'main.c',text:project.code},...(project.firmware?.files||[])];}
export function changeSourceFile(project,action,name,nextName){
  const p=structuredClone(project);p.firmware??={mode:'sketch',files:[]};const files=p.firmware.files;
  if(action!=='add'&&name==='main.c')throw new Error('main.c는 이름 변경·삭제할 수 없습니다.');
  const target=action==='rename'?nextName:name;
  if(action!=='delete'){
    if(typeof target!=='string'||! /^[A-Za-z_][\w.-]{0,70}\.(c|h|cpp|hpp|cc)$/.test(target)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(target))throw new Error('영문·숫자·밑줄로 된 .c, .h, .cpp, .hpp 파일명을 입력하세요.');
    if(sourceFiles(p).some(f=>f.name.toLowerCase()===target.toLowerCase()&&(action!=='rename'||f.name!==name)))throw new Error('같은 이름의 파일이 이미 있습니다.');
  }
  if(action==='add'){if(files.length>=40)throw new Error('보조 소스는 40개까지 추가할 수 있습니다.');files.push({name,text:/\.(h|hpp)$/.test(name)?'#pragma once\n':'#include "main.h"\n\n'});}
  else {
    const index=files.findIndex(f=>f.name===name);if(index<0)throw new Error('파일을 찾을 수 없습니다.');
    const include=new RegExp('(^\\s*#\\s*include\\s*["<])'+name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([">])','gm');
    if(action==='delete'){if(sourceFiles(p).filter(f=>f.name!==name).some(f=>{include.lastIndex=0;return include.test(f.text);}))throw new Error('다른 소스에서 include하는 파일입니다. 해당 include를 먼저 수정하세요.');files.splice(index,1);}
    else if(action==='rename'){files[index].name=nextName;p.code=p.code.replace(include,(_,a,b)=>a+nextName+b);for(const f of files)f.text=f.text.replace(include,(_,a,b)=>a+nextName+b);}
    else throw new Error('파일 작업이 올바르지 않습니다.');
  }
  return p;
}
