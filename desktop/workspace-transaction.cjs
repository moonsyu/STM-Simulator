const fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const hash=data=>createHash('sha256').update(data).digest('hex');
const journalName='.stm-save';
const validName=name=>typeof name==='string'&&/^(?:project\.stm32lab|[A-Za-z_][\w.-]{0,70}\.(?:c|h|cpp|hpp|cc))$/.test(name);
async function readFile(filename){try{const stat=await fs.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink())throw Error('저장 복구 대상은 일반 파일이어야 합니다.');return await fs.readFile(filename);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function durableWrite(filename,data){const file=await fs.open(filename,'wx');try{await file.writeFile(data);await file.sync();}finally{await file.close();}}
async function removeJournal(directory){const target=path.resolve(directory,journalName);if(path.dirname(target)!==path.resolve(directory))throw Error('Invalid recovery directory');const stat=await fs.lstat(target);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Invalid recovery directory');await fs.rm(target,{recursive:true,force:true});}
async function recover(directory){
 const folder=path.join(directory,journalName);let stat;try{stat=await fs.lstat(folder);}catch(error){if(error.code==='ENOENT')return false;throw error;}
 if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('저장 복구 폴더를 확인하세요.');
 const raw=await readFile(path.join(folder,'journal.json'));
 // No journal means preparation stopped before any project file was changed.
 if(!raw){await removeJournal(directory);return false;}
 if(raw.length>12000000)throw Error('저장 복구 기록이 너무 큽니다.');
 const record=JSON.parse(raw.toString('utf8'));
 if(record.version!==1||!Array.isArray(record.entries)||record.entries.length>82||record.entries.some(e=>!validName(e.name)||!(e.before===null||typeof e.before==='string')||!(e.after===null||/^[a-f0-9]{64}$/.test(e.after))))throw Error('저장 복구 기록이 올바르지 않습니다.');
 if(await readFile(path.join(folder,'committed'))){await removeJournal(directory);return false;}
 // Refuse to overwrite an external edit made after an interrupted save.
 const current=new Map();
 for(const e of record.entries){const value=await readFile(path.join(directory,e.name)),actual=value===null?null:hash(value),old=e.before===null?null:hash(Buffer.from(e.before,'base64'));if(actual!==old&&actual!==e.after)throw Error(`${e.name}: 저장 복구 중 외부 변경을 발견했습니다. 파일을 보존한 뒤 다시 확인하세요.`);current.set(e.name,actual);}
 for(const [i,e]of record.entries.entries()){
  const value=e.before===null?null:Buffer.from(e.before,'base64'),old=value===null?null:hash(value);if(current.get(e.name)===old)continue;
  const dest=path.join(directory,e.name);
  if(value===null)await fs.unlink(dest);else{const temp=path.join(folder,`restore-${i}`);await fs.unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});await durableWrite(temp,value);await fs.rename(temp,dest);}
 }
 await removeJournal(directory);return true;
}
async function commit(directory,files,names,expected){
 const folder=path.join(directory,journalName);await fs.mkdir(folder);let journalWritten=false,committed=false;
 try{
  const entries=[];
  for(const [i,name]of [...names].entries()){
   const before=await readFile(path.join(directory,name)),value=files.has(name)?Buffer.from(files.get(name),'utf8'):null;
   if((before===null?null:hash(before))!==expected.get(name))throw Error(`${name} 파일이 앱 밖에서 변경되었습니다.`);
   entries.push({name,before:before?.toString('base64')??null,after:value===null?null:hash(value)});
   if(value!==null)await durableWrite(path.join(folder,`next-${i}`),value);
  }
  await durableWrite(path.join(folder,'journal.tmp'),JSON.stringify({version:1,entries}));await fs.rename(path.join(folder,'journal.tmp'),path.join(folder,'journal.json'));journalWritten=true;
  for(const [i,name]of [...names].entries()){const dest=path.join(directory,name);if(files.has(name))await fs.rename(path.join(folder,`next-${i}`),dest);else await fs.unlink(dest);}
  await durableWrite(path.join(folder,'committed'),'1');committed=true;
 }catch(error){
  try{if(journalWritten)await recover(directory);else await removeJournal(directory);}catch(recovery){throw new Error(`저장에 실패했고 복구 기록을 남겼습니다. 폴더를 다시 열어 복구하세요. ${recovery.message}`,{cause:error});}
  throw error;
 }finally{if(committed)await removeJournal(directory).catch(()=>{});}
}
module.exports={commit,recover};
