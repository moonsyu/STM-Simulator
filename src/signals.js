// Generic logic-level signal recorder, wire encoders, protocol decoders and noise model.
// Self-contained (no simulator imports) so the HAL interpreter and a CPU emulator can share it.
// Time unit: microseconds. Levels: 0/1. Each channel is one wire; channels of one bus share `group`.
export const NOISE_DEFAULTS=Object.freeze({enabled:false,bitErrorRate:0,glitchRate:0,jitterNs:0});
export function validateNoise(value){
 if(value===undefined||value===null)return {...NOISE_DEFAULTS};
 if(typeof value!=='object'||Array.isArray(value))throw new Error('노이즈 설정을 확인하세요.');
 const out={enabled:value.enabled??false,bitErrorRate:value.bitErrorRate??0,glitchRate:value.glitchRate??0,jitterNs:value.jitterNs??0};
 if(typeof out.enabled!=='boolean')throw new Error('noise.enabled는 true/false입니다.');
 for(const key of ['bitErrorRate','glitchRate'])if(typeof out[key]!=='number'||!Number.isFinite(out[key])||out[key]<0||out[key]>1)throw new Error(`noise.${key}: 0~1 범위의 숫자가 필요합니다.`);
 if(typeof out.jitterNs!=='number'||!Number.isFinite(out.jitterNs)||out.jitterNs<0||out.jitterNs>1e6)throw new Error('noise.jitterNs: 0~1000000 ns 범위의 숫자가 필요합니다.');
 return out;
}
// Deterministic xorshift32 so a simulation with the same seed is reproducible.
export class NoiseModel{
 constructor(cfg,seed=0x2545f491){this.set(cfg);this.state=(seed>>>0)||1;this.counts={bitErrors:0,glitches:0};}
 set(cfg){this.cfg=validateNoise(cfg);return this.cfg;}
 get active(){const c=this.cfg;return c.enabled&&(c.bitErrorRate>0||c.glitchRate>0||c.jitterNs>0);}
 random(){let x=this.state;x^=x<<13;x^=x>>>17;x^=x<<5;this.state=x>>>0;return this.state/4294967296;}
 flip(){if(!this.cfg.enabled||!this.cfg.bitErrorRate)return false;const f=this.random()<this.cfg.bitErrorRate;if(f)this.counts.bitErrors++;return f;}
 glitch(){if(!this.cfg.enabled||!this.cfg.glitchRate)return false;const g=this.random()<this.cfg.glitchRate;if(g)this.counts.glitches++;return g;}
 jitter(){return this.cfg.enabled&&this.cfg.jitterNs?(this.random()*2-1)*this.cfg.jitterNs/1000:0;}
}
const QUIET={flip:()=>false,glitch:()=>false,jitter:()=>0};
// Local edge lists: [[us,level],...] sorted by time.
export function levelAt(edges,us,initial=1){let lo=0,hi=edges.length-1,level=initial;while(lo<=hi){const mid=(lo+hi)>>1;if(edges[mid][0]<=us){level=edges[mid][1];lo=mid+1;}else hi=mid-1;}return level;}
const push=(edges,us,level)=>{const last=edges.at(-1);if(last&&us<last[0])us=last[0];if(last&&last[1]===level)return;if(last&&last[0]===us){last[1]=level;if(edges.length>1&&edges.at(-2)[1]===level)edges.pop();return;}edges.push([us,level]);};
const bitsOf=(value,count,lsb)=>Array.from({length:count},(_,i)=>(value>>(lsb?i:count-1-i))&1);
const byteOf=(bits,lsb)=>bits.reduce((v,b,i)=>v|(b<<(lsb?i:bits.length-1-i)),0);
const hex=v=>'0x'+(v>>>0).toString(16).toUpperCase().padStart(2,'0');
const printable=v=>v>=32&&v<127?` '${String.fromCharCode(v)}'`:'';

// A channel is one bus (e.g. 'USART2.TX', 'I2C1', 'SPI1') made of lines (wires) such as 'I2C1.SDA'.
export class SignalRecorder{
 constructor({limit=60000}={}){this.map=new Map();this.buses=new Map();this.limit=limit;this.frameLimit=4000;}
 bus(id,{label=id,protocol='gpio',params={}}={}){let b=this.buses.get(id);if(!b){b={id,label,protocol,params:{...params}};this.buses.set(id,b);}else Object.assign(b,{label,protocol,params:{...b.params,...params}});return b;}
 define(id,{label=id,pins=[],protocol='gpio',group=null,params={},idle=1,busLabel}={}){
  let ch=this.map.get(id);
  if(!ch){ch={id,label,pins:[...pins],protocol,group,params:{...params},idle,edges:[],dropped:0,frames:[]};this.map.set(id,ch);}
  else Object.assign(ch,{label,pins:[...pins],protocol,group,params:{...ch.params,...params}});
  const b=this.bus(group??id,{label:busLabel??this.buses.get(group??id)?.label??(group?group:label),protocol,params});if(!group)b.label=busLabel??label;
  return ch;
 }
 has(id){return this.map.has(id)||this.buses.has(id);}
 lines(busId){return [...this.map.values()].filter(c=>(c.group??c.id)===busId);}
 channels(){return [...this.buses.values()].map(b=>({id:b.id,label:b.label,protocol:b.protocol,lines:this.lines(b.id).map(c=>({id:c.id,label:c.label,pins:[...c.pins]}))}));}
 clear(){for(const c of this.map.values()){c.edges=[];c.frames=[];c.dropped=0;}}
 edge(id,us,level){const ch=this.map.get(id)??this.define(id);push(ch.edges,us,level?1:0);if(ch.edges.length>this.limit){const n=Math.floor(this.limit/4);ch.idle=ch.edges[n-1][1];ch.edges.splice(0,n);ch.dropped+=n;}}
 write(id,edges){for(const [us,level]of edges)this.edge(id,us,level);}
 level(id,us){const ch=this.map.get(id);return ch?levelAt(ch.edges,us,ch.idle):null;}
 samples(id,fromUs=-Infinity,toUs=Infinity){
  const ch=this.map.get(id);if(!ch)throw new Error(`신호 채널이 없습니다: ${id}`);
  const start=Number.isFinite(fromUs)?fromUs:(ch.edges[0]?.[0]??0),out=[[start,levelAt(ch.edges,start,ch.idle)]];
  let lo=0,hi=ch.edges.length;while(lo<hi){const m=(lo+hi)>>1;if(ch.edges[m][0]<=start)lo=m+1;else hi=m;}
  for(let i=lo;i<ch.edges.length&&out.length<20000;i++){const e=ch.edges[i];if(e[0]>toUs)break;out.push([e[0],e[1]]);}
  return out;
 }
 // Frames recorded by a transmitter (exact intent); decode() reconstructs from edges instead.
 note(id,frame){const ch=this.map.get(id)??this.define(id);ch.frames.push(frame);if(ch.frames.length>this.frameLimit)ch.frames.splice(0,ch.frames.length-this.frameLimit);}
 group(id){const ch=this.map.get(id);const g=ch?.group??id;return this.lines(g);}
 decode(id,protocol){
  const members=this.group(id);if(!members.length)throw new Error(`신호 채널이 없습니다: ${id}`);
  const busId=this.map.get(id)?.group??id,lead=this.map.get(id)??members[0],kind=protocol??this.buses.get(busId)?.protocol??lead.protocol,fn=DECODERS[kind];if(!fn)throw new Error(`지원하지 않는 프로토콜 디코더: ${kind}`);
  const role=r=>members.find(c=>c.params.role===r);return fn({lead,role,members});
 }
}
// ---- Encoders: produce wire edges (with noise) and report what the receiver samples. ----
// UART: start bit, data LSB first, optional parity, stop bits. The receiver uses STM32 16x
// oversampling: samples 7/8/9 of each bit; disagreement sets NE, majority decides the bit.
export function encodeUart(startUs,value,{baud,bits=8,parity='none',stopBits=1,noise=QUIET}={}){
 const T=1e6/baud,data=bitsOf(value,bits,true),par=parity==='none'?[]:[(data.reduce((a,b)=>a^b,0))^(parity==='odd'?1:0)];
 const logical=[0,...data,...par,...Array(Math.max(1,stopBits)).fill(1)],edges=[[startUs-T,1]];
 logical.forEach((bit,i)=>{const t=startUs+i*T+(i?noise.jitter():0);push(edges,t,noise.flip()?bit^1:bit);if(noise.glitch()){const m=startUs+(i+.5)*T-T/32,lv=levelAt(edges,m);push(edges,m,lv^1);push(edges,m+T/16,lv);}});
 const endUs=startUs+logical.length*T;push(edges,endUs,1);
 return {edges,endUs,...sampleUart(edges,startUs,{baud,bits,parity,stopBits})};
}
export function sampleUart(edges,startUs,{baud,bits=8,parity='none',stopBits=1}){
 const T=1e6/baud,at=i=>[7,8,9].map(k=>levelAt(edges,startUs+i*T+k*T/16));let ne=false;
 const bit=i=>{const s=at(i),sum=s[0]+s[1]+s[2];if(sum%3)ne=true;return sum>=2?1:0;};
 const startBit=bit(0),data=Array.from({length:bits},(_,i)=>bit(i+1));let pe=false;
 if(parity!=='none'){const p=bit(bits+1);pe=((data.reduce((a,b)=>a^b,0))^p^(parity==='odd'?1:0))!==0;}
 const stop=bit(bits+1+(parity==='none'?0:1));
 return {value:byteOf(data,true),fe:stop!==1||startBit!==0,pe,ne};
}
// I2C: START, per byte 8 bits MSB first + ACK slot, STOP. `bytes` are driven by `drivers[i]`
// ('master'|'slave') and the opposite side drives ACK. `ackFn(i,seen)` returns the receiver's ACK.
// start/stop=false lets a caller split the address phase from the data phase of one transaction.
export function encodeI2c(startUs,{clockHz=100000,bytes=[],drivers=[],ackFn=()=>true,stretchUs=0,start=true,stop=true,noise=QUIET}={}){
 const H=5e5/clockHz,scl=[[startUs-H,start?1:0]],sda=[[startUs-H,start?1:0]];let t=startUs;const seen=[],acks=[];let busError=false;
 if(start){push(sda,t,0);t+=H;push(scl,t,0);}
 for(let i=0;i<bytes.length&&!busError;i++){
  const got=[];
  for(const b of bitsOf(bytes[i],8,false)){const v=noise.flip()?b^1:b;push(sda,t+H/2,v);push(scl,t+H+noise.jitter(),1);got.push(v);if(noise.glitch()){push(scl,t+H*1.5,0);push(scl,t+H*1.6,1);busError=true;}push(scl,t+2*H,0);t+=2*H;if(busError)break;}
  if(busError)break;
  const value=byteOf(got,false);seen.push(value);
  let ack=ackFn(i,value)?0:1;if(noise.flip())ack^=1;
  if(i===0&&stretchUs>0)t+=stretchUs;
  push(sda,t+H/2,ack);push(scl,t+H,1);push(scl,t+2*H,0);t+=2*H;acks.push(ack===0);
  if(ack&&drivers[i]!=='slave')break;
 }
 if(stop||busError||acks.includes(false)){push(sda,t+H/2,0);push(scl,t+H,1);push(sda,t+2*H,1);t+=2*H;}
 return {scl,sda,endUs:t,seen,acks,busError};
}
// SPI byte: CPOL/CPHA, MSB or LSB first. `answer` is the slave byte or a function of the MOSI byte it saw.
export function encodeSpi(startUs,value,{clockHz=1e6,cpol=0,cpha=0,lsbFirst=false,answer=255,noise=QUIET,idleMosi=1}={}){
 const H=5e5/clockHz,sck=[[startUs,cpol]],mosi=[[startUs,idleMosi]],miso=[[startUs,1]],gm=bitsOf(value,8,lsbFirst).map(b=>noise.flip()?b^1:b),mosiSeen=byteOf(gm,lsbFirst);
 const reply=typeof answer==='function'?answer(mosiSeen):answer,gs=bitsOf(reply&255,8,lsbFirst).map(b=>noise.flip()?b^1:b);let t=startUs;
 for(let i=0;i<8;i++){
  if(cpha===0){push(mosi,t,gm[i]);push(miso,t,gs[i]);push(sck,t+H+noise.jitter(),cpol^1);push(sck,t+2*H,cpol);}
  else{push(sck,t+Math.max(0,noise.jitter()),cpol^1);push(mosi,t+H/4,gm[i]);push(miso,t+H/4,gs[i]);push(sck,t+H,cpol);}
  if(noise.glitch()){const g=t+H*.5;push(sck,g,cpol^1);push(sck,g+H/8,cpol);}
  t+=2*H;
 }
 return {sck,mosi,miso,endUs:t,mosiSeen,misoSeen:byteOf(gs,lsbFirst),reply};
}
// Synchronous USART: LSB first data on TX with a CK burst; LastBit decides whether the MSB clock pulse is output.
export function encodeUsartSync(startUs,value,{baud,cpol=0,cpha=0,lastBit=false,noise=QUIET}={}){
 const T=1e6/baud,H=T/2,ck=[[startUs-T,cpol]],tx=[[startUs-T,1]],data=bitsOf(value,8,true),frame=[0,...data,1];
 frame.forEach((b,i)=>push(tx,startUs+i*T+(i?noise.jitter():0),noise.flip()?b^1:b));
 for(let i=0;i<8;i++){if(i===7&&!lastBit)break;const bitStart=startUs+(i+1)*T,lead=cpha?bitStart:bitStart+H;push(ck,lead,cpol^1);push(ck,lead+H,cpol);if(noise.glitch()){push(ck,lead+H*.25,cpol);push(ck,lead+H*.35,cpol^1);}}
 const endUs=startUs+frame.length*T;push(tx,endUs,1);return {ck,tx,endUs};
}
// Bits a mode-0 style receiver (samples DATA on CK rising edges, value just before the edge) observes.
export function risingSamples(ck,data,fromUs=-Infinity,toUs=Infinity){
 const out=[];for(let i=1;i<ck.length;i++){const [t,l]=ck[i];if(t<fromUs||t>toUs)continue;if(l===1&&ck[i-1][1]===0)out.push(levelAt(data,t-1e-6));}return out;
}
// ---- Decoders: reconstruct protocol frames from recorded edges. ----
function decodeUart({lead}){
 const p=lead.params,baud=p.baud||9600,T=1e6/baud,bits=p.bits||8,parity=p.parity||'none',stop=p.stopBits||1,e=lead.edges,frames=[],len=(1+bits+(parity==='none'?0:1)+stop)*T;
 let t=-Infinity;
 for(let i=0;i<e.length;i++){
  if(e[i][1]!==0||e[i][0]<t)continue;const prev=i?e[i-1][1]:lead.idle;if(prev!==1)continue;
  const start=e[i][0],r=sampleUart(e,start,{baud,bits,parity,stopBits:stop}),errors=[r.fe&&'framing',r.pe&&'parity',r.ne&&'noise'].filter(Boolean);
  frames.push({startUs:start,endUs:start+len,label:hex(r.value)+printable(r.value),value:r.value,...(errors.length?{error:errors.join('+')}:{})});t=start+len-T/2;
  if(frames.length>=4000)break;
 }
 return frames;
}
function decodeI2c({role}){
 const scl=role('scl'),sda=role('sda');if(!scl||!sda)return [];
 const times=[...new Set([...scl.edges.map(e=>e[0]),...sda.edges.map(e=>e[0])])].sort((a,b)=>a-b),frames=[];
 let inTx=false,bits=[],byteStart=0,first=false,prevScl=levelAt(scl.edges,-Infinity,scl.idle),prevSda=levelAt(sda.edges,-Infinity,sda.idle);
 for(const t of times){
  const c=levelAt(scl.edges,t,scl.idle),d=levelAt(sda.edges,t,sda.idle);
  if(c===1&&prevScl===1&&d!==prevSda){
   if(d===0){if(inTx&&bits.length>1)frames.push({startUs:byteStart,endUs:t,label:'BUS',error:'bus error'});frames.push({startUs:t,endUs:t,label:inTx?'Sr':'START'});inTx=true;bits=[];first=true;}
   else{if(bits.length>1&&bits.length<9)frames.push({startUs:byteStart,endUs:t,label:'BUS',error:'bus error'});frames.push({startUs:t,endUs:t,label:'STOP'});inTx=false;bits=[];}
  }else if(inTx&&c===1&&prevScl===0){
   if(!bits.length)byteStart=t;bits.push(d);
   if(bits.length===9){const v=byteOf(bits.slice(0,8),false),nack=bits[8]===1,label=first?`ADDR ${hex(v>>1)} ${v&1?'R':'W'} ${nack?'NACK':'ACK'}`:`${hex(v)} ${nack?'NACK':'ACK'}`;frames.push({startUs:byteStart,endUs:t,label,value:v,ack:!nack,...(nack?{error:'NACK'}:{})});bits=[];first=false;}
  }
  prevScl=c;prevSda=d;if(frames.length>=4000)break;
 }
 return frames;
}
function decodeClocked({role,lead},{clock='sck',out='mosi',inp='miso',select='nss',lsb}){
 const ck=role(clock);if(!ck)return [];const tx=role(out),rx=role(inp),cs=role(select),p=ck.params,cpol=p.cpol??0,cpha=p.cpha??0,lsbFirst=lsb??!!p.lsbFirst,frames=[];
 const capture=[];for(let i=0;i<ck.edges.length;i++){const [t,l]=ck.edges[i],prev=i?ck.edges[i-1][1]:ck.idle;if(l===prev)continue;const leading=prev===cpol;if(leading===(cpha===0))capture.push(t);}
 let group=[],last=-Infinity;const gap=p.gapUs??(p.clockHz?16e6/p.clockHz:50);
 const flush=()=>{if(!group.length)return;const n=group.length,mb=group.map(t=>tx?levelAt(tx.edges,t-1e-6,tx.idle):1),sb=group.map(t=>rx?levelAt(rx.edges,t-1e-6,rx.idle):1);
  for(let i=0;i+8<=n;i+=8){const m=byteOf(mb.slice(i,i+8),lsbFirst),s=byteOf(sb.slice(i,i+8),lsbFirst);frames.push({startUs:group[i],endUs:group[i+7],label:`${out.toUpperCase()} ${hex(m)} / ${inp.toUpperCase()} ${hex(s)}`,value:m,answer:s});}
  if(n%8)frames.push({startUs:group[n-n%8],endUs:group[n-1],label:`${n%8} bit`,error:'incomplete'});group=[];};
 for(const t of capture){const selected=!cs||levelAt(cs.edges,t,cs.idle)===0;if(!selected){flush();continue;}if(t-last>gap||(cs&&group.length&&levelAt(cs.edges,(t+last)/2,cs.idle)!==0))flush();group.push(t);last=t;if(frames.length>=4000)break;}
 flush();return frames;
}
function decodeOneWire({lead}){
 const e=lead.edges,frames=[];let bits=[],start=0;
 for(let i=1;i<e.length;i++){
  if(e[i][1]!==1||e[i-1][1]!==0)continue;const low=e[i][0]-e[i-1][0],t=e[i-1][0];
  if(low>=400){if(bits.length)frames.push({startUs:start,endUs:t,label:`${bits.length} bit`,error:'incomplete'});bits=[];frames.push({startUs:t,endUs:e[i][0],label:'RESET'});const next=e[i+1];if(next&&next[1]===0&&next[0]-e[i][0]<80)frames.push({startUs:next[0],endUs:e[i+2]?.[0]??next[0],label:'PRESENCE'}),i+=1;continue;}
  if(!bits.length)start=t;bits.push(low<15?1:0);
  if(bits.length===8){const v=byteOf(bits,true);frames.push({startUs:start,endUs:e[i][0],label:hex(v),value:v});bits=[];}
  if(frames.length>=4000)break;
 }
 return frames;
}
function decodeDigital({lead}){const e=lead.edges,frames=[];for(let i=0;i<e.length-1&&frames.length<4000;i++)frames.push({startUs:e[i][0],endUs:e[i+1][0],label:e[i][1]?'H':'L'});return frames;}
const DECODERS={gpio:decodeDigital,uart:decodeUart,i2c:decodeI2c,spi:x=>decodeClocked(x,{}),'usart-sync':x=>decodeClocked(x,{clock:'ck',out:'tx',inp:'rx',select:'nss',lsb:true}),onewire:decodeOneWire,'1-wire':decodeOneWire,digital:decodeDigital};
export const SIGNAL_PROTOCOLS=Object.keys(DECODERS);
// The facade shape shared with the CPU emulator: channels(), samples(id,from,to), decode(id,protocol), setNoise(cfg).
// channels() -> [{id,label,protocol,lines:[{id,label}]}]; samples(lineId,fromUs,toUs) -> [[us,level],...] (first = level at fromUs);
// decode(channelId[,protocol]) -> [{startUs,endUs,label,error?}]; noise()/setNoise(cfg); now() µs; record(pins) for GPIO capture.
export function signalsApi(recorder,noise,{onNoise,now=()=>0,record}={}){
 return {channels:()=>recorder.channels(),samples:(id,fromUs,toUs)=>recorder.samples(id,fromUs,toUs),decode:(id,protocol)=>recorder.decode(id,protocol),
  setNoise:cfg=>{const next=noise.set(cfg);onNoise?.({...next});return {...next};},noise:()=>({...noise.cfg}),now,record:pins=>record?.(pins),clear:()=>recorder.clear(),recorder};
}
