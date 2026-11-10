// A project source name: a file name, or a path of up to six folders (`Core/Src/app.c`, as a CubeIDE project keeps its
// files). Folder and file names are letters, digits, _ . - and do not start with a dot, so `.` / `..` cannot appear.
export const SOURCE_PATH=/^(?:[A-Za-z0-9_][\w.-]{0,40}\/){0,6}[A-Za-z0-9_][\w.-]{0,70}\.(c|h|cpp|hpp|cc)$/;
export const MAX_SOURCE_FILES=120,MAX_SOURCE_BYTES=1000000;
export const baseName=name=>name.split('/').at(-1);
export const folderOf=name=>name.split('/').slice(0,-1).join('/');
/** The file an #include "x.h" / "dir/x.h" written in `from` means: the same folder first, then the path from the root, then any folder. */
export function resolveInclude(names,include,from=''){
  const clean=include.replace(/^\.\//,''),here=folderOf(from),list=[...names];
  const joined=(here?here+'/':'')+clean,parts=[];for(const p of joined.split('/')){if(p==='..')parts.pop();else if(p!=='.')parts.push(p);}
  return list.find(n=>n===parts.join('/'))??list.find(n=>n===clean)??list.find(n=>n.endsWith('/'+clean))??(clean.includes('/')?undefined:list.find(n=>baseName(n)===clean));
}
export function sourceFiles(project){return [{name:'main.c',text:project.code},...(project.firmware?.files||[])];}
export function changeSourceFile(project,action,name,nextName){
  const p=structuredClone(project);p.firmware??={mode:'sketch',files:[]};const files=p.firmware.files;
  if(action!=='add'&&name==='main.c')throw new Error('main.c는 이름 변경·삭제할 수 없습니다.');
  const target=action==='rename'?nextName:name;
  if(action!=='delete'){
    if(typeof target!=='string'||!SOURCE_PATH.test(target)||target.split('/').some(part=>/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)))throw new Error('영문·숫자·밑줄로 된 .c, .h, .cpp, .hpp 파일명을 입력하세요. 폴더는 Core/Src/app.c처럼 /로 나눕니다.');
    if(baseName(target).toLowerCase()==='main.c')throw new Error('main.c는 프로젝트의 주 소스 이름입니다. 다른 이름을 쓰세요.');
    if(sourceFiles(p).some(f=>f.name.toLowerCase()===target.toLowerCase()&&(action!=='rename'||f.name!==name)))throw new Error('같은 이름의 파일이 이미 있습니다.');
  }
  if(action==='add'){if(files.length>=MAX_SOURCE_FILES)throw new Error(`보조 소스는 ${MAX_SOURCE_FILES}개까지 추가할 수 있습니다.`);files.push({name,text:/\.(h|hpp)$/.test(name)?'#pragma once\n':'#include "main.h"\n\n'});}
  else {
    const index=files.findIndex(f=>f.name===name);if(index<0)throw new Error('파일을 찾을 수 없습니다.');
    // Sources include a file by its name or by a path that ends in it ("app.h", "Inc/app.h").
    const include=new RegExp('(^\\s*#\\s*include\\s*["<](?:[\\w.-]+/)*)'+baseName(name).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([">])','gm');
    if(action==='delete'){if(sourceFiles(p).filter(f=>f.name!==name).some(f=>{include.lastIndex=0;return include.test(f.text);}))throw new Error('다른 소스에서 include하는 파일입니다. 해당 include를 먼저 수정하세요.');files.splice(index,1);}
    else if(action==='rename'){files[index].name=nextName;const to=baseName(nextName);p.code=p.code.replace(include,(_,a,b)=>a+to+b);for(const f of files)f.text=f.text.replace(include,(_,a,b)=>a+to+b);}
    else throw new Error('파일 작업이 올바르지 않습니다.');
  }
  return p;
}
