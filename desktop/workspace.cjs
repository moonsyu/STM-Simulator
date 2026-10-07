const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const hash=text=>createHash('sha256').update(text).digest('hex');
const safeName=name=>typeof name==='string'&&/^[\w가-힣][\w가-힣 .-]{0,79}$/.test(name)&&!/[. ]$/.test(name)&&! /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
async function filesFor(text){
  if(typeof text!=='string'||Buffer.byteLength(text)>2000000)throw new Error('프로젝트 크기 제한을 넘었습니다.');
  const {validateProject}=await import('../src/project.js');const project=validateProject(JSON.parse(text));
  const files=new Map([['project.stm32lab',JSON.stringify(project,null,2)+'\n'],['main.c',project.code]]);
  for(const f of project.firmware?.files||[]){if(!safeName(f.name))throw new Error('Windows에서 사용할 수 없는 소스 파일명입니다.');files.set(f.name,f.text);}
  return files;
}
async function snapshot(directory,names){const hashes=new Map();for(const name of names){try{const stat=await fs.lstat(path.join(directory,name));if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`${name}: 일반 파일만 프로젝트 소스로 사용할 수 있습니다.`);hashes.set(name,hash(await fs.readFile(path.join(directory,name))));}catch(e){if(e.code!=='ENOENT')throw e;hashes.set(name,null);}}return hashes;}
async function createWorkspace(parent,name,text){
  if(!safeName(name))throw new Error('프로젝트 이름은 1~80자의 한글·영문·숫자·공백·밑줄·하이픈으로 입력하세요. Windows 예약 이름은 사용할 수 없습니다.');
  const directory=path.join(parent,name),files=await filesFor(text);
  try{await fs.mkdir(directory);}catch(e){if(e.code==='EEXIST')throw new Error('같은 이름의 폴더가 이미 있습니다. 다른 프로젝트 이름을 선택하세요.');throw e;}
  for(const [name,value]of files)await fs.writeFile(path.join(directory,name),value,{encoding:'utf8',flag:'wx'});
  await fs.writeFile(path.join(directory,'stm-project.json'),JSON.stringify({format:'stm-simulator-workspace',version:1,document:'project.stm32lab'},null,2)+'\n',{flag:'wx'});
  return {directory,hashes:await snapshot(directory,files.keys())};
}
async function openWorkspace(directory){
  const marker=JSON.parse(await fs.readFile(path.join(directory,'stm-project.json'),'utf8'));
  if(marker.format!=='stm-simulator-workspace'||marker.document!=='project.stm32lab')throw new Error('STM Simulator 프로젝트 폴더가 아닙니다.');
  const stat=await fs.stat(path.join(directory,'project.stm32lab'));if(stat.size>2000000)throw new Error('프로젝트 크기 제한을 넘었습니다.');
  const text=await fs.readFile(path.join(directory,'project.stm32lab'),'utf8'),files=await filesFor(text),hashes=await snapshot(directory,files.keys()),project=JSON.parse(text);
  for(const name of files.keys()){if(name==='project.stm32lab')continue;if(hashes.get(name)===null)throw new Error(`${name} 소스 파일이 없습니다.`);const stat=await fs.stat(path.join(directory,name));if(stat.size>1200000)throw new Error('소스 파일 크기 제한을 넘었습니다.');const value=await fs.readFile(path.join(directory,name),'utf8');if(name==='main.c')project.code=value;else project.firmware.files.find(f=>f.name===name).text=value;}
  const updated=JSON.stringify(project);await filesFor(updated);return {text:updated,state:{directory,hashes}};
}
async function saveWorkspace(state,text){
  if(!state)throw new Error('먼저 프로젝트 폴더를 생성하거나 여세요.');const files=await filesFor(text);
  const names=new Set([...state.hashes.keys(),...files.keys()]),actual=await snapshot(state.directory,names);
  for(const name of names)if(actual.get(name)!==(state.hashes.get(name)??null))throw new Error(`${name} 파일이 앱 밖에서 변경되었습니다. 다른 위치에 저장하거나 원본을 확인한 뒤 다시 여세요.`);
  for(const [name,value]of files){const dest=path.join(state.directory,name),temp=dest+'.'+randomUUID()+'.tmp';try{await fs.writeFile(temp,value,'utf8');await fs.rename(temp,dest);}finally{await fs.unlink(temp).catch(e=>{if(e.code!=='ENOENT')throw e;});}}
  for(const name of state.hashes.keys())if(!files.has(name))await fs.unlink(path.join(state.directory,name));
  state.hashes=await snapshot(state.directory,files.keys());return state.directory;
}
module.exports={createWorkspace,openWorkspace,saveWorkspace,safeName};
