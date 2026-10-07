const {EventEmitter}=require('node:events');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {launch,terminate}=require('./process-tools.cjs');
const METHODS=new Set(['textDocument/completion','textDocument/hover','textDocument/definition','textDocument/references','textDocument/signatureHelp','textDocument/documentSymbol','textDocument/formatting']);
class LanguageServer extends EventEmitter {
  constructor(){super();this.pending=new Map();this.id=0;this.documents=new Map();this.closed=true;}
  async start(executable,plan,files){
    await this.stop();this.plan=plan;this.closed=false;this.buffer=Buffer.alloc(0);
    this.child=launch(executable,['--background-index=false','--clang-tidy=false','--log=error','--compile-commands-dir='+plan.directory,'--query-driver='+plan.gcc],{cwd:plan.directory});
    const child=this.child;child.stdin.on('error',e=>{if(this.child===child)this.fail(e);});
    this.child.stdout.on('data',chunk=>{this.buffer=Buffer.concat([this.buffer,chunk]);while(true){const end=this.buffer.indexOf('\r\n\r\n');if(end<0)break;const match=/Content-Length:\s*(\d+)/i.exec(this.buffer.subarray(0,end).toString());if(!match||Number(match[1])>10000000){this.fail(new Error('언어 서버 메시지가 올바르지 않습니다.'));break;}const length=Number(match[1]);if(this.buffer.length<end+4+length)break;const body=this.buffer.subarray(end+4,end+4+length);this.buffer=this.buffer.subarray(end+4+length);try{this.receive(JSON.parse(body.toString()));}catch(e){this.emit('log',e.message);}}});
    this.child.stderr.setEncoding('utf8');this.child.stderr.on('data',text=>this.emit('log',text));this.child.on('error',e=>{if(this.child===child)this.fail(e);});this.child.on('close',()=>{if(this.child===child)this.fail(new Error('clangd가 종료되었습니다.'));});
    await this.request('initialize',{processId:process.pid,rootUri:pathToFileURL(plan.directory).href,capabilities:{textDocument:{completion:{completionItem:{snippetSupport:false}},hover:{contentFormat:['markdown','plaintext']},publishDiagnostics:{versionSupport:true}},workspace:{configuration:false}}});
    this.notify('initialized',{});await this.update(files);this.emit('status',{state:'ready'});
  }
  send(message){if(this.closed)throw new Error('clangd가 실행 중이 아닙니다.');const text=JSON.stringify({jsonrpc:'2.0',...message});this.child.stdin.write(`Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);}
  notify(method,params){this.send({method,params});}
  request(method,params){return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('clangd 응답 시간 초과'));},15000);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
  receive(message){if(message.id!==undefined&&message.method){this.send({id:message.id,result:null});return;}if(message.id!==undefined){const p=this.pending.get(message.id);if(p){clearTimeout(p.timer);this.pending.delete(message.id);if(message.error)p.reject(new Error(message.error.message));else p.resolve(message.result);}}else if(message.method==='textDocument/publishDiagnostics'){let file;try{file=path.basename(fileURLToPath(message.params.uri));}catch{return;}const doc=this.documents.get(file);if(!doc||message.params.version!==undefined&&message.params.version!==doc.version)return;this.emit('diagnostics',{file,items:message.params.diagnostics});}}
  uri(file){if(!/^[\w.-]+\.(c|h|cpp|hpp|cc)$/.test(file))throw new Error('소스 파일명이 올바르지 않습니다.');return pathToFileURL(path.join(this.plan.directory,file)).href;}
  async update(files){
    for(const [name]of this.documents)if(!files.some(f=>f.name===name)){this.notify('textDocument/didClose',{textDocument:{uri:this.uri(name)}});this.documents.delete(name);}
    for(const file of files){const previous=this.documents.get(file.name);if(previous?.text===file.text)continue;const version=(previous?.version||0)+1;this.documents.set(file.name,{text:file.text,version});if(!previous)this.notify('textDocument/didOpen',{textDocument:{uri:this.uri(file.name),languageId:/\.(cpp|hpp|cc)$/.test(file.name)?'cpp':'c',version,text:file.text}});else this.notify('textDocument/didChange',{textDocument:{uri:this.uri(file.name),version},contentChanges:[{text:file.text}]});}
  }
  async query(method,file,position){if(!METHODS.has(method)||!this.documents.has(file))throw new Error('지원하지 않는 언어 서버 요청입니다.');const params={textDocument:{uri:this.uri(file)}};if(position){if(!Number.isInteger(position.line)||!Number.isInteger(position.character)||position.line<0||position.character<0)throw new Error('소스 위치를 확인하세요.');params.position=position;}if(method==='textDocument/references')params.context={includeDeclaration:true};if(method==='textDocument/formatting')params.options={tabSize:2,insertSpaces:true};const result=await this.request(method,params);return result;}
  fail(error){if(this.closed)return;this.closed=true;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();this.documents.clear();this.emit('status',{state:'stopped',message:error.message});}
  async stop(){if(this.closed)return;const child=this.child;this.fail(new Error('언어 서버를 종료했습니다.'));await terminate(child);}
}
module.exports={LanguageServer};
