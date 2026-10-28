const {EventEmitter}=require('node:events');
const path=require('node:path');
const {launch,terminate}=require('./process-tools.cjs');
const quote=value=>JSON.stringify(String(value));

// GDB/MI has nested tuples, result lists and C strings; splitting on commas loses values.
function parseRecord(line){
  const m=/^(\d*)([\^*+=~@&])(.*)$/.exec(line);if(!m)return null;
  let i=0,s=m[3];
  function string(){let out='';i++;while(i<s.length){const c=s[i++];if(c==='"')return out;if(c!=='\\'){out+=c;continue;}const e=s[i++],simple={n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',a:'\x07'};if(/[0-7]/.test(e)){let oct=e;while(oct.length<3&&/[0-7]/.test(s[i]||'x'))oct+=s[i++];out+=String.fromCharCode(parseInt(oct,8));}else out+=simple[e]??e;}throw new Error('Incomplete MI string');}
  function name(){const start=i;while(i<s.length&&!/[=,}\]]/.test(s[i]))i++;return s.slice(start,i);}
  function value(){if(s[i]==='"')return string();if(s[i]==='{'){i++;const obj=results('}');i++;return obj;}if(s[i]==='['){i++;const a=[];while(i<s.length&&s[i]!==']'){if(!/["{\[]/.test(s[i])){name();if(s[i]==='=')i++;}a.push(value());if(s[i]===',')i++;else break;}i++;return a;}const start=i;while(i<s.length&&!/[,}\]]/.test(s[i]))i++;return s.slice(start,i);}
  function results(end){const obj={};while(i<s.length&&s[i]!==end){const key=name();if(s[i]!=='=')break;i++;obj[key]=value();if(s[i]===',')i++;else break;}return obj;}
  if('~@&'.includes(m[2]))return {type:m[2],text:string()};
  const comma=s.indexOf(','),cls=comma<0?s:s.slice(0,comma);i=comma<0?s.length:comma+1;return {token:m[1]?Number(m[1]):null,type:m[2],class:cls,...results()};
}
class GdbSession extends EventEmitter {
  constructor(){super();this.sequence=0;this.pending=new Map();this.state='idle';this.breakpoints=[];this.closed=true;}
  async start({gdb,elf,cwd,target='host',endpoint='127.0.0.1:3333',flash=false,reset=false,entry=true,breakpoints=[],files=['main.c']}){
    if(!this.closed)throw new Error('디버거가 이미 실행 중입니다.');
    this.closed=false;this.state='starting';this.target=target;this.cwd=cwd;this.files=new Set(files);this.breakpoints=[];
    this.child=launch(gdb,['--quiet','--nx','--nh','--interpreter=mi2','-iex','set auto-load off'],{cwd});let buffer='';
    const child=this.child;child.stdin.on('error',e=>{if(this.child===child)this.finish(e);});
    this.child.stdout.setEncoding('utf8');this.child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end).replace(/\r$/,'');buffer=buffer.slice(end+1);this.receive(line);}});
    this.child.stderr.setEncoding('utf8');this.child.stderr.on('data',text=>this.emit('output',text));
    this.child.once('error',e=>{if(this.child===child)this.finish(e);});this.child.once('close',()=>{if(this.child===child)this.finish(new Error('GDB 연결이 종료되었습니다.'));});
    try{
      await this.command('-gdb-set mi-async on');await this.command('-gdb-set pagination off');await this.command('-gdb-set confirm off');
      await this.command('-gdb-set print elements 100');await this.command('-gdb-set may-call-functions off');
      await this.command('-file-exec-and-symbols '+quote(elf.replaceAll('\\','/')));
      if(target==='arm'){
        if(!/^(?:localhost|127\.0\.0\.1|[a-zA-Z0-9.-]+):\d{1,5}$/.test(endpoint)||Number(endpoint.split(':')[1])>65535)throw new Error('GDB 서버 주소는 host:port 형식으로 입력하세요.');
        await this.command('-target-select extended-remote '+endpoint,15000);
        if(reset)await this.command('-interpreter-exec console "monitor reset halt"');
        if(flash)await this.command('-target-download',60000);
        if(reset)await this.command('-interpreter-exec console "monitor reset halt"');
      }
      await this.setBreakpoints(breakpoints);
      if(entry)await this.command('-break-insert -t main');
      await this.command(target==='arm'?'-exec-continue':'-exec-run');
    }catch(error){await this.stop();throw error;}
  }
  receive(line){
    let record;try{record=parseRecord(line);}catch{this.emit('output',line+'\n');return;}
    if(!record){if(line&&line!=='(gdb) ')this.emit('output',line+'\n');return;}
    if(record.type==='^'){
      const pending=this.pending.get(record.token);if(pending){clearTimeout(pending.timer);this.pending.delete(record.token);if(record.class==='error')pending.reject(new Error(record.msg||'GDB 오류'));else pending.resolve(record);}
    }else if(record.type==='*'){
      if(record.class==='running'){this.state='running';this.emit('state',{state:'running'});}
      // A board halted while GDB connects (before the program is started) is not a pause the user asked for.
      else if(record.class==='stopped'&&this.state==='starting'&&!record.reason)return;
      else if(record.class==='stopped'){this.state=record.reason?.startsWith('exited')?'exited':'paused';this.emit('state',{state:this.state,reason:record.reason,frame:record.frame,exitCode:record['exit-code']});}
    }else if(record.text)this.emit('output',record.text);
  }
  command(text,timeout=12000){
    if(this.closed)return Promise.reject(new Error('디버거를 먼저 시작하세요.'));
    return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('GDB 응답 시간 초과: '+text.split(' ')[0]));},timeout);this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(`${id}${text}\n`,e=>{if(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});});
  }
  async setBreakpoints(points){
    if(points.length>1000)throw new Error('중단점이 너무 많습니다.');
    for(const id of this.breakpoints)await this.command('-break-delete '+id);this.breakpoints=[];
    const result=[];
    for(const p of points){if(!/^[\w.-]+\.(c|h|cpp|hpp|cc)$/.test(p.file)||!Number.isInteger(p.line)||p.line<1)throw new Error('중단점 위치가 올바르지 않습니다.');try{const r=await this.command('-break-insert -f '+quote(p.file+':'+p.line));this.breakpoints.push(r.bkpt.number);result.push({...p,verified:r.bkpt.addr!=='<PENDING>',actualLine:Number(r.bkpt.line)||p.line});}catch(e){result.push({...p,verified:false,message:e.message});}}
    this.emit('breakpoints',result);return result;
  }
  async action(action){const commands={continue:'-exec-continue',pause:'-exec-interrupt --all',over:'-exec-next',into:'-exec-step',out:'-exec-finish'};if(!commands[action])throw new Error('지원하지 않는 디버그 동작입니다.');if(action!=='pause'&&this.state!=='paused')throw new Error('먼저 디버거를 일시정지하세요.');await this.command(commands[action]);}
  async inspect(frame=0){
    if(this.state!=='paused')throw new Error('일시정지 상태에서 확인할 수 있습니다.');if(!Number.isInteger(frame)||frame<0||frame>100)throw new Error('스택 프레임을 확인하세요.');
    await this.command('-stack-select-frame '+frame);
    const stack=await this.command('-stack-list-frames 0 30'),locals=await this.command('-stack-list-variables --all-values'),names=await this.command('-data-list-register-names'),values=await this.command('-data-list-register-values x');
    const globals=[];
    try{const symbols=await this.command('-symbol-info-variables --max-results 100');for(const file of symbols.symbols?.debug||[]){if(!this.files.has(path.basename(file.filename||file.fullname||'')))continue;for(const symbol of file.symbols||[]){if(globals.length>=40)break;try{globals.push({name:symbol.name,type:symbol.type,value:(await this.command('-data-evaluate-expression '+quote(symbol.name))).value});}catch{}}}}catch{}
    return {frames:stack.stack||[],locals:locals.variables||[],globals,registers:(values['register-values']||[]).map(r=>({name:names['register-names'][Number(r.number)]||'',value:r.value})).filter(r=>r.name)};
  }
  async evaluate(expression){
    if(this.state!=='paused')throw new Error('일시정지 상태에서 감시식을 평가하세요.');
    if(typeof expression!=='string'||!expression.trim()||expression.length>250||/[;\r\n]|\+\+|--|(?:<<|>>|[+\-*/%&|^])=|(?<![=!<>])=(?!=)|[\w)\]]\s*\(/.test(expression))throw new Error('읽기 전용 감시식을 입력하세요. 함수 호출·대입·증감은 사용할 수 없습니다.');
    return (await this.command('-data-evaluate-expression '+quote(expression))).value;
  }
  async memory(address,count=128){if(!/^(0x[0-9a-f]+|[0-9]+)$/i.test(address)||!Number.isInteger(count)||count<1||count>4096)throw new Error('주소와 길이(1~4096)를 확인하세요.');if(this.state!=='paused')throw new Error('먼저 일시정지하세요.');return (await this.command(`-data-read-memory-bytes ${address} ${count}`)).memory;}
  finish(error){if(this.closed)return;this.closed=true;this.state='idle';for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.emit('state',{state:'idle'});}
  async stop(){if(this.closed)return;const child=this.child;await terminate(child);this.finish(new Error('디버거를 종료했습니다.'));}
}
module.exports={GdbSession,parseRecord,quote};
