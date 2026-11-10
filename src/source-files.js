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
/**
 * Why `name` cannot be added next to the sources `names`, or '': 'main' (main.c in any case or folder is the project's
 * main source), 'same' (the name exists, compared without case as Windows does), 'folder' (a file would have to be a
 * folder too: app.c next to app.c/x.c). A project with such names cannot be saved to disk or opened again.
 */
export function nameClash(names,name){
  const low=name.toLowerCase();
  if(baseName(low)==='main.c')return 'main';
  for(const other of names){const o=other.toLowerCase();if(o===low)return 'same';if(o.startsWith(low+'/')||low.startsWith(o+'/'))return 'folder';}
  return '';
}
/** Rewrites or finds the #include lines of `text` (a source named `from`) that mean the file `target` among `names`. */
function includesOf(text,from,names,target,replace){
  let found=false;
  const out=text.replace(/^([ \t]*#[ \t]*include[ \t]*")([^"\n]+)(")/gm,(line,a,path,b)=>{
    if(resolveInclude(names,path,from)!==target)return line;
    found=true;return replace?a+replace(path)+b:line;
  });
  return {found,text:out};
}
export function sourceFiles(project){return [{name:'main.c',text:project.code},...(project.firmware?.files||[])];}
export function changeSourceFile(project,action,name,nextName){
  const p=structuredClone(project);p.firmware??={mode:'sketch',files:[]};const files=p.firmware.files;
  if(action!=='add'&&name==='main.c')throw new Error('main.c는 이름 변경·삭제할 수 없습니다.');
  const target=action==='rename'?nextName:name;
  if(action!=='delete'){
    if(typeof target!=='string'||!SOURCE_PATH.test(target)||target.split('/').some(part=>/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part)))throw new Error('영문·숫자·밑줄로 된 .c, .h, .cpp, .hpp 파일명을 입력하세요. 폴더는 Core/Src/app.c처럼 /로 나눕니다.');
    if(baseName(target).toLowerCase()==='main.c')throw new Error('main.c는 프로젝트의 주 소스 이름입니다. 다른 이름을 쓰세요.');
    const clash=nameClash(files.filter(f=>action!=='rename'||f.name!==name).map(f=>f.name),target);
    if(clash==='same')throw new Error('같은 이름의 파일이 이미 있습니다.');
    if(clash==='folder')throw new Error('파일 이름과 폴더 이름이 겹칩니다: 다른 소스의 경로에 같은 이름이 있습니다.');
  }
  if(action==='add'){if(files.length>=MAX_SOURCE_FILES)throw new Error(`보조 소스는 ${MAX_SOURCE_FILES}개까지 추가할 수 있습니다.`);files.push({name,text:/\.(h|hpp)$/.test(name)?'#pragma once\n':'#include "main.h"\n\n'});}
  else {
    const index=files.findIndex(f=>f.name===name);if(index<0)throw new Error('파일을 찾을 수 없습니다.');
    // Only the #include lines that mean this file: another folder may hold a header of the same name (Core/Inc/app.h and
    // Drivers/app.h), and its includes stay as they are.
    const names=files.map(f=>f.name),main=(p.firmware.mainFolder?p.firmware.mainFolder+'/':'')+'main.c';
    if(action==='delete'){if(includesOf(p.code,main,names,name).found||files.some(f=>f.name!==name&&includesOf(f.text,f.name,names,name).found))throw new Error('다른 소스에서 include하는 파일입니다. 해당 include를 먼저 수정하세요.');files.splice(index,1);}
    else if(action==='rename'){
      // The written path keeps its folders and gets the new file name ("Inc/app.h" → "Inc/util.h").
      const to=baseName(nextName),swap=path=>path.slice(0,path.length-baseName(path).length)+to;
      p.code=includesOf(p.code,main,names,name,swap).text;for(const f of files)f.text=includesOf(f.text,f.name,names,name,swap).text;
      files[index].name=nextName;
    }
    else throw new Error('파일 작업이 올바르지 않습니다.');
  }
  return p;
}
