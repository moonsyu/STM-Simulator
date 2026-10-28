import {DeviceBuses} from './device-buses.js';
import {I2C_DEVICES,SPI_DEVICES} from './device-defs.js';
import {modulePowered} from './device-motion.js';
import {canonicalPin} from './pins.js';
import {encodeUart,encodeI2c,encodeSpi} from './signals.js';

// Transaction-level teaching devices. Pin connectivity and power are checked.
// UART is timed 8N1; I2C memory and SPI memory are generic 256-byte devices.
export class BusDevices {
  constructor(project,getResult,trace=()=>{}){this.project=project;this.getResult=getResult;this.trace=trace;this.memories=new Map();this.devices=new DeviceBuses();this.uart={tx:'PA2',rx:'PA3',baud:9600,queue:[],ready:false};this.wire={sda:'PB9',scl:'PB8',clock:100000,ready:false,address:null,tx:[],rx:[]};this.spi={mosi:'PA7',miso:'PA6',sck:'PA5',clock:1000000,ready:false};this.spiSessions=new Map();this.received=new Map();this.vcpOutput='';}
  result(){return this.getResult();}
  same(a,b,result=this.result()){return !!result&&!result.fault&&result.uf.find(a)===result.uf.find(b);}
  pin(pin){return 'signal:'+canonicalPin(pin);}
  terminal(part,index){return `part:${part.id}:p${index}`;}
  powered(part){if(part.catalogVariant==='ov2640-camera'&&(!(this.clocks?.get('PA8'))||!this.same(this.terminal(part,7),this.pin('PA8'))||(this.result()?.voltage(this.terminal(part,5))??0)<2||(this.result()?.voltage(this.terminal(part,6))??3.3)>.8))return false;if([...I2C_DEVICES,...SPI_DEVICES].includes(part.type))return modulePowered(part,this.result());const r=this.result(),vcc=r?.voltage(this.terminal(part,1)),gnd=r?.voltage(this.terminal(part,2));return !r?.fault&&vcc!=null&&gnd!=null&&gnd<.1&&vcc-gnd>=2.7&&vcc-gnd<=5.5;}
  memory(part){if(!this.memories.has(part.id))this.memories.set(part.id,{data:new Uint8Array(256),address:0});return this.memories.get(part.id);}
  report(runtime,protocol,message){this.trace({micros:runtime.microTime,protocol,message:protocol==='UART'&&this.uart.instance?`${this.uart.instance} · ${message}`:message});}
  bytes(value,runtime,length){
    if(typeof value==='number')return [value&255];if(typeof value==='string')return [...value].map(c=>c.charCodeAt(0)&255);
    if(length===undefined)throw new Error('버퍼 전송은 길이를 지정하세요.');if(!Number.isInteger(length)||length<0||length>256)throw new Error('버퍼 길이 범위: 0~256');return Array.from({length},(_,i)=>runtime.get(runtime.pointerCell(value,i))&255);
  }
  beginPins(runtime,outputs,inputs){outputs.forEach(p=>{runtime.call('pinMode',[p,'OUTPUT']);runtime.call('digitalWrite',[p,1]);});inputs.forEach(p=>runtime.call('pinMode',[p,'INPUT']));}
  hasVcp(){return this.uart.ready&&this.uart.instance==='USART2'&&this.uart.tx==='PA2'&&this.uart.rx==='PA3'&&!this.result()?.fault;}
  inject(text,micros,source='auto'){
    if(!this.uart.ready)return 0;
    // The onboard ST-LINK bridge follows the configured USART2 baud rate.
    const vcp=source!=='external'&&this.hasVcp();
    if(!vcp&&(source==='vcp'||!this.project.components.some(p=>p.type==='uart'&&this.powered(p)&&this.same(this.terminal(p,3),this.pin(this.uart.rx))&&p.baud===this.uart.baud)))return 0;
    if(this.uart.queue.length+String(text).slice(0,256).length>4096)throw new Error('UART 수신 버퍼가 가득 찼습니다.');
    let at=Math.max(micros,...this.uart.queue.map(x=>x.at));for(const char of String(text).slice(0,256)){at+=1e7/this.uart.baud;this.uart.queue.push({at,value:char.charCodeAt(0)&255});}return String(text).slice(0,256).length;
  }
  uartLine(dir){if(!this.signals)return null;const u=this.uart,id=`${u.instance||'USART2'}.${dir}`;this.signals.define(id,{label:`${u.instance||'USART2'} ${dir}`,pins:[dir==='TX'?u.tx:u.rx],protocol:'uart',params:{baud:u.baud}});return id;}
  // TX byte on the wire: recorded, and what a receiver decodes when wire noise is enabled.
  uartTx(value,at){const id=this.uartLine('TX');if(!id&&!this.noise?.active)return value;const f=encodeUart(at,value,{baud:this.uart.baud,noise:this.noise});if(id)this.signals.write(id,f.edges);return f.value;}
  uartRx(value,at){const id=this.uartLine('RX');if(!id&&!this.noise?.active)return {value,fe:false,pe:false,ne:false};const f=encodeUart(at,value,{baud:this.uart.baud,noise:this.noise});if(id)this.signals.write(id,f.edges);return f;}
  i2cTarget(address){
    const w=this.wire,candidates=this.project.components.filter(p=>['i2c',...I2C_DEVICES].includes(p.type)&&p.address===address&&this.powered(p)&&this.same(this.terminal(p,3),this.pin(w.sda))&&this.same(this.terminal(p,4),this.pin(w.scl)));
    const result=this.result(),sda=result?.voltage(this.pin(w.sda)),scl=result?.voltage(this.pin(w.scl));
    // A fixed-run board answering as an I2C slave on the same SDA/SCL nets (STM32 ↔ ESP32 lecture example).
    const board=!candidates.length&&this.boards?.().find(d=>{const s=d.i2cSlave?.();return s?.address===address&&this.same(`signal:${d.part.id}.${s.sda}`,this.pin(w.sda))&&this.same(`signal:${d.part.id}.${s.scl}`,this.pin(w.scl));});
    if(board)return {part:{type:'board',driver:board},connected:sda>2&&scl>2&&!this.same(this.pin(w.sda),this.pin(w.scl))};
    return {part:candidates[0],connected:candidates.length===1&&sda>2&&scl>2&&!this.same(this.pin(w.sda),this.pin(w.scl))};
  }
  i2cLines(){if(!this.signals)return null;const w=this.wire,id=this.i2cId||'I2C1',g={group:id,busLabel:id,protocol:'i2c',params:{clockHz:w.clock}};this.signals.define(id+'.SCL',{...g,label:'SCL',pins:[w.scl],params:{...g.params,role:'scl'}});this.signals.define(id+'.SDA',{...g,label:'SDA',pins:[w.sda],params:{...g.params,role:'sda'}});return id;}
  i2cPhase(at,bytes,drivers,ackFn,opts={}){const id=this.i2cLines();if(!id&&!this.noise?.active)return {seen:bytes,acks:bytes.map((_,i)=>ackFn(i,bytes[i])),busError:false,endUs:at};at=Math.max(at,opts.start===false?at:this.i2cFree??-Infinity);const e=encodeI2c(at,{clockHz:this.wire.clock,bytes,drivers,ackFn,noise:this.noise,...opts});this.i2cFree=e.endUs+5e5/this.wire.clock;if(id){this.signals.write(id+'.SCL',e.scl);this.signals.write(id+'.SDA',e.sda);}return e;}
  // One I2C transaction with bit-level recording and optional wire noise (address/data corruption, NACK, bus error).
  i2cWrite(address,bytes,runtime,at=runtime.microTime){
    const {part,connected}=this.i2cTarget(address),ack0=(i,v)=>connected&&v>>1===address&&!(v&1);
    const head=this.i2cPhase(at,[address<<1],['master'],ack0,{stop:!bytes.length});
    if(head.busError)return {ok:false,busError:true,nack:false};if(!head.acks[0])return {ok:false,nack:true};
    let ready=connected;const data=this.i2cPhase(head.endUs,bytes,bytes.map(()=>'master'),()=>ready,{start:false});
    const received=data.seen.slice(0,data.acks.length);
    if(received.length){if(part.type==='board')ready=part.driver.i2cReceive(received)!==false;else if(part.type==='i2c'){const m=this.memory(part);m.address=received[0];for(const value of received.slice(1)){m.data[m.address]=value;m.address=(m.address+1)&255;}}else ready=this.devices.writeI2c(part,received,runtime.microTime,this.result());}
    const ok=ready&&!data.busError&&data.acks.length===bytes.length&&data.acks.every(Boolean);return {ok,busError:data.busError,nack:!ok&&!data.busError,written:received.length};
  }
  i2cRead(address,count,runtime,at=runtime.microTime){
    const {part,connected}=this.i2cTarget(address),ack0=(i,v)=>connected&&v>>1===address&&!!(v&1);
    const head=this.i2cPhase(at,[(address<<1)|1],['master'],ack0,{stop:!count});
    if(head.busError||!head.acks[0])return {ok:false,data:[],busError:head.busError,nack:!head.busError};
    let bytes=[];if(part.type==='board')bytes=part.driver.i2cRequest(count);else if(part.type==='i2c'){const m=this.memory(part);for(let i=0;i<count;i++){bytes.push(m.data[m.address]);m.address=(m.address+1)&255;}}else{bytes=this.devices.readI2c(part,count,runtime.microTime);if(bytes===null)return {ok:false,data:[],nack:true};}
    const data=this.i2cPhase(head.endUs,bytes,bytes.map(()=>'slave'),i=>i<count-1,{start:false});
    return {ok:!data.busError,data:data.busError?[]:data.seen,busError:data.busError};
  }
  spiLines(){if(!this.signals)return null;const s=this.spi,id=this.spiId||'SPI1',params={clockHz:s.clock,cpol:s.cpol||0,cpha:s.cpha||0,lsbFirst:!!s.lsbFirst};for(const [role,pin]of [['sck',s.sck],['mosi',s.mosi],['miso',s.miso]])this.signals.define(id+'.'+role.toUpperCase(),{label:role.toUpperCase(),pins:[pin],protocol:'spi',group:id,busLabel:id,params:{...params,role}});return id;}
  // A full-duplex byte without trace/time side effects (shared by blocking SPI and DMA).
  spiExchange(value,runtime,at=runtime.microTime){
    const s=this.spi;if(!s.ready)throw new Error('SPI.begin()을 먼저 호출하세요.');value=Number(value)&255;
    const respond=v=>this.spiRespond(v,runtime),id=this.spiLines();
    if(!id&&!this.noise?.active)return respond(value);
    const e=encodeSpi(at,value,{clockHz:s.clock,cpol:s.cpol||0,cpha:s.cpha||0,lsbFirst:!!s.lsbFirst,answer:respond,noise:this.noise});
    if(id){this.signals.write(id+'.SCK',e.sck);this.signals.write(id+'.MOSI',e.mosi);this.signals.write(id+'.MISO',e.miso);}return e.misoSeen;
  }
  call(name,args,runtime){
    const [a,b,c]=args,u=this.uart,w=this.wire,s=this.spi;
    if(name==='Serial1.setPins'){u.rx=runtime.pin(a);u.tx=runtime.pin(b);if(u.rx===u.tx)throw new Error('UART TX/RX 핀은 서로 달라야 합니다.');return 0;}
    if(name==='Serial1.begin'){if(!Number.isInteger(a)||a<300||a>2000000)throw new Error('UART 속도 범위: 300~2000000 baud');u.baud=a;u.ready=true;this.beginPins(runtime,[u.tx],[u.rx]);return 0;}
    if(name.startsWith('Serial1.')){
      if(!u.ready)throw new Error('Serial1.begin(baud)를 먼저 호출하세요.');
      // Scheduler events convert microseconds to milliseconds and back. Treat the
      // resulting sub-nanosecond rounding error consistently with HAL TX completion.
      if(name==='Serial1.available')return u.queue.filter(x=>x.at<=runtime.microTime+1e-6).length;
      if(name==='Serial1.read'){const i=u.queue.findIndex(x=>x.at<=runtime.microTime+1e-6);return i<0?-1:u.queue.splice(i,1)[0].value;}
      if(name==='Serial1.print'||name==='Serial1.println'||name==='Serial1.write'){
        const bytes=name==='Serial1.write'?this.bytes(a,runtime,b):this.bytes(runtime.format(args)+(name==='Serial1.println'?'\r\n':''),runtime);if(bytes.length>256||u.queue.length+bytes.length>4096)throw new Error('UART 버퍼 한도를 넘었습니다.');
        const loopback=this.same(this.pin(u.tx),this.pin(u.rx));let at=Math.max(runtime.microTime,u.lastTx??0);
        const devices=this.project.components.filter(p=>p.type==='uart'&&this.powered(p)&&this.same(this.pin(u.tx),this.terminal(p,4))&&p.baud===u.baud);
        const wire=bytes.map((value,i)=>this.uartTx(value,at+i*1e7/u.baud));
        if(this.hasVcp())this.vcpOutput=((this.vcpOutput||'')+String.fromCharCode(...wire)).slice(-512);
        const frames=[];for(const value of wire){at+=1e7/u.baud;frames.push({at,value});if(loopback)u.queue.push({at,value});for(const p of devices)this.received.set(p.id,((this.received.get(p.id)||'')+String.fromCharCode(value)).slice(-512));}
        // Another STM32 board whose UART RX is wired to this TX receives the bytes (stm32-boards.js linkUarts).
        const peers=this.peers?.(this,frames)||0;
        u.lastTx=at;this.report(runtime,'UART',`TX ${bytes.length} B · ${u.baud} baud${loopback?' · loopback':''}${this.hasVcp()?' · ST-LINK VCP':''}${devices.length?' · external terminal':''}${peers?` · 다른 STM32 보드 ${peers}개`:''}`);return bytes.length;
      }
      if(name==='Serial1.end'){u.ready=false;u.queue=[];return 0;}
    }
    if(name==='Wire.begin'){if(args.length){w.sda=runtime.pin(a);w.scl=runtime.pin(b);}if(w.sda===w.scl)throw new Error('I²C SDA/SCL 핀은 서로 달라야 합니다.');w.ready=true;this.beginPins(runtime,[],[w.sda,w.scl]);return 0;}
    if(name==='Wire.setClock'){if(!Number.isInteger(a)||a<1000||a>1000000)throw new Error('I²C 속도 범위: 1000~1000000 Hz');w.clock=a;return 0;}
    if(name.startsWith('Wire.')){
      if(!w.ready)throw new Error('Wire.begin()을 먼저 호출하세요.');
      if(name==='Wire.beginTransmission'){if(!Number.isInteger(a)||a<8||a>119)throw new Error('I²C 주소 범위: 0x08~0x77');w.address=a;w.tx=[];return 0;}
      if(name==='Wire.write'){const bytes=this.bytes(a,runtime,b);if(w.tx.length+bytes.length>256)throw new Error('I²C 전송 버퍼는 256바이트입니다.');w.tx.push(...bytes);return bytes.length;}
      if(name==='Wire.available')return w.rx.length;
      if(name==='Wire.read')return w.rx.shift()??-1;
      if(name==='Wire.endTransmission'||name==='Wire.requestFrom'){
        const address=name==='Wire.requestFrom'?a:w.address;if(!Number.isInteger(address)||address<8||address>119)throw new Error('I²C 주소를 확인하세요.');
        if(name==='Wire.requestFrom'){
          if(!Number.isInteger(b)||b<0||b>256)throw new Error('I²C 읽기 길이 범위: 0~256');const x=this.i2cRead(address,b,runtime);w.rx=x.data;
          runtime.microTime+=(b+1)*9e6/w.clock;this.report(runtime,'I²C',`0x${address.toString(16)} READ ${w.rx.length} B · ${x.ok?'ACK':'NACK'}`);return w.rx.length;
        }
        const x=this.i2cWrite(address,w.tx,runtime);
        runtime.microTime+=(w.tx.length+1)*9e6/w.clock;this.report(runtime,'I²C',`0x${address.toString(16)} WRITE ${w.tx.length} B · ${x.ok?'ACK':'NACK'}`);w.address=null;w.tx=[];runtime.api.changed?.(runtime.microTime);return x.ok?0:2;
      }
    }
    if(name==='SPI.setPins'){s.mosi=runtime.pin(a);s.miso=runtime.pin(b);s.sck=runtime.pin(c);if(new Set([s.mosi,s.miso,s.sck]).size!==3)throw new Error('SPI 핀은 서로 달라야 합니다.');return 0;}
    if(name==='SPI.begin'){s.ready=true;this.beginPins(runtime,[s.mosi,s.sck],[s.miso]);runtime.call('digitalWrite',[s.sck,0]);return 0;}
    if(name==='SPI.setClock'){if(!Number.isInteger(a)||a<1000||a>20000000)throw new Error('SPI 속도 범위: 1000~20000000 Hz');s.clock=a;return 0;}
    if(name==='SPI.transfer'){
      const value=Number(a)&255,answer=this.spiExchange(value,runtime);
      runtime.microTime+=8e6/s.clock;this.report(runtime,'SPI',`TX ${value.toString(16).padStart(2,'0')} · RX ${answer.toString(16).padStart(2,'0')}`);return answer;
    }
    if(name==='SPI.end'){s.ready=false;this.spiSessions.clear();return 0;}
    return undefined;
  }
  spiRespond(value,runtime){
      const s=this.spi;{
      const active=this.project.components.filter(p=>['spi',...SPI_DEVICES].includes(p.type)&&this.powered(p)&&(p.catalogVariant?.startsWith('rgb-')||this.same(this.terminal(p,4),this.pin(s.sck)))&&this.same(this.terminal(p,5),this.pin(s.mosi))&&(p.type!=='spi'||this.same(this.terminal(p,6),this.pin(s.miso)))&&(p.catalogVariant?.startsWith('rgb-')||this.result()?.voltage(this.terminal(p,3))!=null&&this.result()?.voltage(this.terminal(p,3))<.8));
      if(active.length>1)throw new Error('SPI CS가 동시에 활성화되었습니다.');
      let answer=this.same(this.pin(s.mosi),this.pin(s.miso))?value:255;
      if(active.length===1&&active[0].type!=='spi')answer=this.devices.transfer(active[0],value,this.result());
      if(active.length===1&&active[0].type==='spi'){
       const part=active[0],memory=this.memory(part),eeprom=part.catalogVariant==='spi-eeprom-8';let session=this.spiSessions.get(part.id);
       if(!session){session={phase:0,command:0};this.spiSessions.set(part.id,session);}
       if(session.phase===0){session.command=value;session.phase=1;answer=0;if(eeprom&&value===6)memory.wel=true;if(eeprom&&value===4)memory.wel=false;}
       else if(eeprom&&session.command===5)answer=(memory.wel?2:0)|(runtime.microTime<(memory.readyAt??0)?1:0);
       else if(session.phase===1){memory.address=value;session.phase=2;answer=0;}
       else {if(session.command===3)answer=memory.data[memory.address];else if(session.command===2&&(!eeprom||memory.wel&&runtime.microTime>=(memory.readyAt??0))){memory.data[memory.address]=value;session.written=true;answer=0;}memory.address=(memory.address+1)&255;}
      }
      return answer;
    }
  }
  update(result){
    this.devices.update(this.project,result);
    for(const p of this.project.components){
      if(p.type==='spi'&&(!this.powered(p)||result?.voltage(this.terminal(p,3))>=.8||result?.voltage(this.terminal(p,3))==null)){const session=this.spiSessions.get(p.id);if(p.catalogVariant==='spi-eeprom-8'&&session?.written){const m=this.memory(p);m.wel=false;}this.spiSessions.delete(p.id);}
      if(['uart','i2c','spi'].includes(p.type))result.parts[p.id]={voltage:(result.voltage(this.terminal(p,1))??0)-(result.voltage(this.terminal(p,2))??0),current:0,power:0,powered:this.powered(p),on:this.powered(p),received:this.received.get(p.id)||'',memory:[...this.memory(p).data]};
    }
  }
}
