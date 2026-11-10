// Files and folders dropped on the window (feature 12). What a drop means:
//  - one .stm32lab / .json            → open that project;
//  - an .ioc, or sources with a main.c → import as a CubeIDE project (the same as File › 가져오기), folders kept;
//  - other .c / .h / .cpp / .hpp files → added to the project's sources (a dropped folder keeps its tree under its name);
//    a file that already exists is replaced with the dropped text.
// The decision is a pure function (planDrop) so it can be tested without a window.
import {SOURCE_PATH,MAX_SOURCE_FILES,MAX_SOURCE_BYTES,baseName,nameClash} from './source-files.js';

// Folders of a CubeIDE project that are not the user's sources (the app builds with its own SDK copy).
const SKIP_FOLDERS=new Set(['drivers','middlewares','debug','release','build','.git','.settings','.metadata','node_modules','startup']);
const APP_PROVIDED=new Set(['syscalls.c','sysmem.c','system_stm32f4xx.c','system_stm32f1xx.c']);
const SOURCE=/\.(c|h|cpp|hpp|cc)$/i;

/** Reads the dropped items (DataTransfer) as [{name: path, text, size}], walking folders. */
export async function readDropped(dataTransfer){
  const out=[];let count=0,bytes=0;
  const add=async(file,name)=>{
    if(!/\.(c|h|cpp|hpp|cc|ioc|stm32lab|json)$/i.test(name))return;
    if(++count>MAX_SOURCE_FILES+2)throw new Error(`파일이 너무 많습니다. .c/.h는 ${MAX_SOURCE_FILES}개까지 놓을 수 있습니다(Drivers·Middlewares·빌드 폴더는 제외됩니다).`);
    bytes+=file.size;if(bytes>2_000_000)throw new Error('놓은 파일이 너무 큽니다(합계 2 MB까지).');
    out.push({name,text:await file.text(),size:file.size});
  };
  const walk=async(entry,prefix,depth)=>{
    if(entry.isFile){const file=await new Promise((resolve,reject)=>entry.file(resolve,reject));await add(file,prefix+entry.name);return;}
    if(!entry.isDirectory||depth>6||SKIP_FOLDERS.has(entry.name.toLowerCase()))return;
    const reader=entry.createReader();
    for(;;){const batch=await new Promise((resolve,reject)=>reader.readEntries(resolve,reject));if(!batch.length)break;for(const child of batch)await walk(child,prefix+entry.name+'/',depth+1);}
  };
  const entries=[...(dataTransfer.items||[])].filter(i=>i.kind==='file').map(i=>i.webkitGetAsEntry?.()).filter(Boolean);
  if(entries.length)for(const entry of entries)await walk(entry,'',0);
  else for(const file of dataTransfer.files||[])await add(file,file.name);
  return out;
}

/**
 * Decides what a drop does. Returns {action:'open', text} | {action:'import', files} | {action:'add', files, skipped}
 * or throws with the reason. `files` of 'import' is what importFirmware takes; of 'add' the sources to add or replace.
 */
export function planDrop(dropped,project){
  if(!dropped.length)throw new Error('놓을 수 있는 파일이 없습니다. .c/.h/.cpp/.hpp, .ioc, .stm32lab 파일이나 그 폴더를 놓으세요.');
  const projects=dropped.filter(f=>/\.(stm32lab|json)$/i.test(f.name));
  if(projects.length){if(dropped.length>1)throw new Error('프로젝트 파일(.stm32lab)은 하나만 놓으세요.');return {action:'open',text:projects[0].text};}
  const skipped=[];
  // A single dropped folder is the project root: its name is not part of the paths (Core/Src/main.c, not MyProject/Core/…).
  const roots=new Set(dropped.map(f=>f.name.includes('/')?f.name.split('/')[0]:''));
  const strip=roots.size===1&&!roots.has('')&&dropped.some(f=>baseName(f.name)==='main.c'||/\.ioc$/i.test(f.name))?[...roots][0].length+1:0;
  const files=dropped.map(f=>({...f,name:f.name.slice(strip)})).filter(f=>{
    if(/\.ioc$/i.test(f.name)){if(f.name.includes('/')){skipped.push(f.name);return false;}return true;}
    if(APP_PROVIDED.has(baseName(f.name))){skipped.push(f.name);return false;}
    if(!SOURCE_PATH.test(f.name)){skipped.push(f.name);return false;}
    return true;
  });
  if(!files.length)throw new Error('놓은 파일의 이름을 쓸 수 없습니다: 영문·숫자·밑줄로 된 .c/.h/.cpp/.hpp 파일과 폴더만 가져옵니다.');
  const sources=files.filter(f=>SOURCE.test(f.name)),iocs=files.filter(f=>/\.ioc$/i.test(f.name));
  if(iocs.length||sources.some(f=>baseName(f.name)==='main.c')){
    // .cpp sources come along only when added to an existing project; a CubeIDE import is C.
    const cFiles=files.filter(f=>/\.(ioc|c|h)$/i.test(f.name));for(const f of files)if(!cFiles.includes(f))skipped.push(f.name);
    return {action:'import',files:cFiles.map(f=>({name:f.name,text:f.text})),skipped};
  }
  if(project.firmware?.mode==='fsp'&&sources.some(f=>baseName(f.name)==='hal_entry.c'))throw new Error('hal_entry.c는 FSP 프로젝트의 주 소스 이름입니다.');
  const existing=new Map((project.firmware?.files||[]).map(f=>[f.name.toLowerCase(),f.name]));
  // Names the project cannot hold are left out and reported: Main.c (main.c is the main source), the same name twice in
  // one drop (also when only the case differs), a file where a folder of that name is. Replacing a project file is fine.
  {const kept=[],taken=[...existing.values()],seen=new Set();
    for(const f of sources){const low=f.name.toLowerCase();if(seen.has(low)||!existing.has(low)&&nameClash(taken,f.name)){skipped.push(f.name);continue;}seen.add(low);if(!existing.has(low))taken.push(f.name);kept.push(f);}
    if(!kept.length)throw new Error('놓은 파일을 추가할 수 없습니다: main.c와 이름이 같거나 프로젝트의 폴더·파일 이름과 겹칩니다.');
    sources.length=0;sources.push(...kept);}
  const fresh=sources.filter(f=>!existing.has(f.name.toLowerCase())).length;
  if((project.firmware?.files?.length||0)+fresh>MAX_SOURCE_FILES)throw new Error(`보조 소스는 ${MAX_SOURCE_FILES}개까지입니다.`);
  const total=(project.code?.length||0)+(project.firmware?.files||[]).filter(f=>!sources.some(s=>s.name.toLowerCase()===f.name.toLowerCase())).reduce((n,f)=>n+f.text.length,0)+sources.reduce((n,f)=>n+f.text.length,0);
  if(total>MAX_SOURCE_BYTES)throw new Error('소스 전체는 1 MB 이하여야 합니다.');
  return {action:'add',files:sources.map(f=>({name:existing.get(f.name.toLowerCase())??f.name,text:f.text,replaces:existing.has(f.name.toLowerCase())})),skipped};
}

/** Wires the window: `handlers` = {isRunning, getProject, open(text), importFiles(files), addFiles(files), log(message, type)}. */
export function setupFileDrop(target,handlers){
  const hasFiles=e=>[...(e.dataTransfer?.types||[])].includes('Files');
  let depth=0;
  target.addEventListener('dragenter',e=>{if(!hasFiles(e))return;depth++;document.body.classList.add('file-drop-target');});
  target.addEventListener('dragleave',e=>{if(!hasFiles(e))return;if(--depth<=0){depth=0;document.body.classList.remove('file-drop-target');}});
  target.addEventListener('dragover',e=>{if(!hasFiles(e))return;e.preventDefault();e.dataTransfer.dropEffect=handlers.isRunning()?'none':'copy';});
  target.addEventListener('drop',async e=>{
    if(!hasFiles(e))return;e.preventDefault();depth=0;document.body.classList.remove('file-drop-target');
    try{
      if(handlers.isRunning())throw new Error('실행 중에는 파일을 놓을 수 없습니다. 정지한 뒤 다시 놓으세요.');
      const plan=planDrop(await readDropped(e.dataTransfer),handlers.getProject());
      if(plan.action==='open')handlers.open(plan.text);else if(plan.action==='import')handlers.importFiles(plan.files);else handlers.addFiles(plan.files);
      if(plan.skipped?.length)handlers.log(`가져오지 않은 파일: ${plan.skipped.slice(0,8).join(', ')}${plan.skipped.length>8?` 외 ${plan.skipped.length-8}개`:''} (앱이 넣는 파일이거나 쓸 수 없는 이름)`,'warning');
    }catch(error){handlers.log(error.message,'error');}
  });
}
