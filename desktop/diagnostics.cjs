const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');

// Keep display/memory evidence without repeating tens of thousands of pixels in
// every state event. The hash covers every value, in order, before truncation.
function compactState(value){
 if(!value||typeof value!=='object')return value;
 if(Array.isArray(value)||ArrayBuffer.isView(value)&&!(value instanceof DataView)){
  const values=Array.from(value);
  if(values.length>32&&values.every(Number.isFinite))return {
   length:values.length,nonzero:values.filter(Boolean).length,
   sha256:createHash('sha256').update(JSON.stringify(values)).digest('hex'),
   first:values.slice(0,16),last:values.slice(-4)
  };
  return values.map(compactState);
 }
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,compactState(item)]));
}

// Fixed local files only. A renderer never chooses a path or destination.
class Diagnostics {
 constructor(profile,version,{maxBytes=1_000_000}={}){
  this.directory=path.join(profile,'diagnostics');this.version=version;this.session=randomUUID();
  this.maxBytes=maxBytes;this.pending=0;this.tail=Promise.resolve();this.projectSha256=null;
 }
 async record(input){
  if(!input||typeof input.type!=='string'||!/^[a-z][a-z0-9.-]{0,63}$/.test(input.type))throw new Error('Invalid diagnostic event');
  const detail=JSON.stringify(input.type==='simulation.state'?compactState(input.detail??{}):input.detail??{});
  if(detail.length>65_536||Buffer.byteLength(detail)>131_072)throw new Error('Diagnostic event is too large');
  const text=input.project;
  if(text!==undefined){
   if(typeof text!=='string'||text.length>2_000_000||Buffer.byteLength(text)>2_000_000)throw new Error('Diagnostic project is too large');
   const p=JSON.parse(text);if(!p||typeof p.code!=='string'||!Array.isArray(p.components)||!Array.isArray(p.wires))throw new Error('Invalid diagnostic project');
  }
  if(this.pending>=64)return {ok:false,message:'Diagnostic queue is full'};
  this.pending++;
  const event={time:new Date().toISOString(),session:this.session,version:this.version,type:input.type,detail:JSON.parse(detail)};
  const work=this.tail.then(async()=>{
   await fs.mkdir(this.directory,{recursive:true});
   if(text!==undefined){
    const temporary=path.join(this.directory,'latest-project.tmp');
    await fs.writeFile(temporary,text,'utf8');
    await fs.rename(temporary,path.join(this.directory,'latest-project.stm32lab'));
    this.projectSha256=createHash('sha256').update(text).digest('hex');
   }
   event.projectSha256=this.projectSha256;
   const line=JSON.stringify(event)+'\n',filename=path.join(this.directory,'events.jsonl');
   const bytes=await fs.stat(filename).then(s=>s.size).catch(e=>{if(e.code==='ENOENT')return 0;throw e;});
   if(bytes+Buffer.byteLength(line)>this.maxBytes){
    const previous=path.join(this.directory,'events.previous.jsonl');
    await fs.rm(previous,{force:true});
    if(bytes)await fs.rename(filename,previous);
   }
   await fs.appendFile(filename,line,'utf8');return {ok:true};
  });
  this.tail=work.catch(()=>{}).finally(()=>{this.pending--;});
  return work;
 }
 flush(){return this.tail;}
}
module.exports={Diagnostics};
