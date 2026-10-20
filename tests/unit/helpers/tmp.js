// Temporary directory helpers for desktop (filesystem) tests.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Creates a unique temp dir, passes it to `run`, and always removes it afterwards. */
export async function withTempDir(run,prefix='stm-unit-'){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),prefix));
  try{return await run(dir);}finally{await fs.rm(dir,{recursive:true,force:true});}
}
/** Temporarily replaces `object[name]` with `replacement(original)` while `run` executes. */
export async function patched(object,name,replacement,run){
  const original=object[name];object[name]=replacement(original);
  try{return await run();}finally{object[name]=original;}
}
export const readText=file=>fs.readFile(file,'utf8');
export const exists=file=>fs.access(file).then(()=>true,()=>false);
