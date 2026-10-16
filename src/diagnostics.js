export function createDiagnostics(send,getProject,onError=message=>console.warn(message)){
 let warned=false;
 return function record(type,detail={},snapshot=false){
  if(!send)return Promise.resolve();
  let payload;try{payload={type,detail:JSON.parse(JSON.stringify(detail,(_,value)=>ArrayBuffer.isView(value)&&!(value instanceof DataView)?Array.from(value):value)),...(snapshot?{project:JSON.stringify(getProject())}:{})};}catch(error){return failed(error);}
  return Promise.resolve().then(()=>send(payload)).then(result=>{
   if(result?.ok===false)throw new Error(result.message);
  }).catch(failed);
 };
 function failed(error){if(!warned){warned=true;onError('로컬 진단 기록 실패: '+error.message);}return Promise.resolve();}
}
