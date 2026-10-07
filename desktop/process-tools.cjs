const {spawn}=require('node:child_process');
const path=require('node:path');

// Every invocation uses an argument vector. Source text and paths never become shell code.
function launch(executable,args,options={}) {
  return spawn(executable,args,{windowsHide:true,shell:false,...options,env:{...process.env,PATH:path.dirname(executable)+path.delimiter+process.env.PATH,...options.env}});
}
async function terminate(child) {
  if(!child||child.exitCode!==null||!child.pid)return;
  if(process.platform==='win32')await new Promise(resolve=>{
    const killer=spawn(path.join(process.env.SystemRoot||'C:\\Windows','System32/taskkill.exe'),['/pid',String(child.pid),'/t','/f'],{windowsHide:true});
    killer.once('error',resolve);killer.once('close',resolve);
  });else child.kill('SIGTERM');
}
function execute(executable,args,{cwd,onOutput=()=>{},signal,timeout=180000}={}) {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(new Error('작업을 취소했습니다.'));
    const child=launch(executable,args,{cwd});let output='',error='',expired=false;
    const stop=()=>{void terminate(child);};signal?.addEventListener('abort',stop,{once:true});
    const timer=setTimeout(()=>{expired=true;stop();},timeout);
    for(const [stream,kind]of [[child.stdout,'stdout'],[child.stderr,'stderr']]){stream.setEncoding('utf8');stream.on('data',text=>{if(kind==='stdout')output=(output+text).slice(-2000000);else error=(error+text).slice(-2000000);onOutput(text,kind);});}
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
    child.once('error',e=>{cleanup();reject(new Error(`${path.basename(executable)} 실행 실패: ${e.message}`));});
    child.once('close',(code)=>{cleanup();if(signal?.aborted||expired)reject(new Error(expired?'도구 응답 시간이 초과되었습니다.':'작업을 취소했습니다.'));else resolve({code,stdout:output,stderr:error});});
  });
}
module.exports={launch,execute,terminate};
