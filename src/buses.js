import {canonicalPin} from './pins.js';

// Transaction-level teaching devices. Pin connectivity and power are checked.
// UART is timed 8N1; I2C memory and SPI memory are generic 256-byte devices.
export class BusDevices {
  constructor(project,getResult,trace=()=>{}){this.project=project;this.getResult=getResult;this.trace=trace;this.memories=new Map();this.uart={tx:'PA2',rx:'PA3',baud:9600,queue:[],ready:false};this.wire={sda:'PB9',scl:'PB8',clock:100000,ready:false,address:null,tx:[],rx:[]};this.spi={mosi:'PA7',miso:'PA6',sck:'PA5',clock:1000000,ready:false};this.spiSessions=new Map();this.received=new Map();}
  result(){return this.getResult();}
  same(a,b,result=this.result()){return !!result&&!result.fault&&result.uf.find(a)===result.uf.find(b);}
  pin(pin){return 'signal:'+canonicalPin(pin);}
  terminal(part,index){return `part:${part.id}:p${index}`;}
  powered(part){const r=this.result(),vcc=r?.voltage(this.terminal(part,1)),gnd=r?.voltage(this.terminal(part,2));return !r?.fault&&vcc!=null&&gnd!=null&&gnd<.1&&vcc-gnd>=2.7&&vcc-gnd<=5.5;}
  memory(part){if(!this.memories.has(part.id))this.memories.set(part.id,{data:new Uint8Array(256),address:0});return this.memories.get(part.id);}
  report(runtime,protocol,message){this.trace({micros:runtime.microTime,protocol,message});}
  bytes(value,runtime,length){
    if(typeof value==='number')return [value&255];if(typeof value==='string')return [...value].map(c=>c.charCodeAt(0)&255);
    if(length===undefined)throw new Error('버퍼 전송은 길이를 지정하세요.');if(!Number.isInteger(length)||length<0||length>256)throw new Error('버퍼 길이 범위: 0~256');return Array.from({length},(_,i)=>runtime.get(runtime.pointerCell(value,i))&255);
  }
  beginPins(runtime,outputs,inputs){outputs.forEach(p=>{runtime.call('pinMode',[p,'OUTPUT']);runtime.call('digitalWrite',[p,1]);});inputs.forEach(p=>runtime.call('pinMode',[p,'INPUT']));}
  inject(text,micros){
    if(!this.uart.ready)return 0;const devices=this.project.components.filter(p=>p.type==='uart'&&this.powered(p)&&this.same(this.terminal(p,3),this.pin(this.uart.rx))&&p.baud===this.uart.baud);if(!devices.length)return 0;
    if(this.uart.queue.length+String(text).slice(0,256).length>4096)throw new Error('UART 수신 버퍼가 가득 찼습니다.');
    let at=Math.max(micros,...this.uart.queue.map(x=>x.at));for(const char of String(text).slice(0,256)){at+=1e7/this.uart.baud;this.uart.queue.push({at,value:char.charCodeAt(0)&255});}return String(text).slice(0,256).length;
  }
  call(name,args,runtime){
    const [a,b,c]=args,u=this.uart,w=this.wire,s=this.spi;
    if(name==='Serial1.setPins'){u.rx=runtime.pin(a);u.tx=runtime.pin(b);if(u.rx===u.tx)throw new Error('UART TX/RX 핀은 서로 달라야 합니다.');return 0;}
    if(name==='Serial1.begin'){if(!Number.isInteger(a)||a<300||a>2000000)throw new Error('UART 속도 범위: 300~2000000 baud');u.baud=a;u.ready=true;this.beginPins(runtime,[u.tx],[u.rx]);return 0;}
    if(name.startsWith('Serial1.')){
      if(!u.ready)throw new Error('Serial1.begin(baud)를 먼저 호출하세요.');
      if(name==='Serial1.available')return u.queue.filter(x=>x.at<=runtime.microTime).length;
      if(name==='Serial1.read'){const i=u.queue.findIndex(x=>x.at<=runtime.microTime);return i<0?-1:u.queue.splice(i,1)[0].value;}
      if(name==='Serial1.print'||name==='Serial1.println'||name==='Serial1.write'){
        const bytes=name==='Serial1.write'?this.bytes(a,runtime,b):this.bytes(runtime.format(args)+(name==='Serial1.println'?'\r\n':''),runtime);if(bytes.length>256||u.queue.length+bytes.length>4096)throw new Error('UART 버퍼 한도를 넘었습니다.');
        const loopback=this.same(this.pin(u.tx),this.pin(u.rx));let at=Math.max(runtime.microTime,u.lastTx??0);
        const devices=this.project.components.filter(p=>p.type==='uart'&&this.powered(p)&&this.same(this.pin(u.tx),this.terminal(p,4))&&p.baud===u.baud);
        for(const value of bytes){at+=1e7/u.baud;if(loopback)u.queue.push({at,value});for(const p of devices)this.received.set(p.id,((this.received.get(p.id)||'')+String.fromCharCode(value)).slice(-512));}
        u.lastTx=at;this.report(runtime,'UART',`TX ${bytes.length} B · ${u.baud} baud${loopback?' · loopback':''}${devices.length?' · terminal':''}`);return bytes.length;
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
        const candidates=this.project.components.filter(p=>p.type==='i2c'&&p.address===address&&this.powered(p)&&this.same(this.terminal(p,3),this.pin(w.sda))&&this.same(this.terminal(p,4),this.pin(w.scl)));
        const result=this.result(),sda=result?.voltage(this.pin(w.sda)),scl=result?.voltage(this.pin(w.scl)),ready=candidates.length===1&&sda>2&&scl>2&&!this.same(this.pin(w.sda),this.pin(w.scl));
        if(name==='Wire.requestFrom'){
          if(!Number.isInteger(b)||b<0||b>256)throw new Error('I²C 읽기 길이 범위: 0~256');w.rx=[];
          if(ready){const m=this.memory(candidates[0]);for(let i=0;i<b;i++){w.rx.push(m.data[m.address]);m.address=(m.address+1)&255;}}
          runtime.microTime+=(b+1)*9e6/w.clock;this.report(runtime,'I²C',`0x${address.toString(16)} READ ${w.rx.length} B · ${ready?'ACK':'NACK'}`);return w.rx.length;
        }
        if(ready&&w.tx.length){const m=this.memory(candidates[0]);m.address=w.tx[0];for(const value of w.tx.slice(1)){m.data[m.address]=value;m.address=(m.address+1)&255;}}
        runtime.microTime+=(w.tx.length+1)*9e6/w.clock;this.report(runtime,'I²C',`0x${address.toString(16)} WRITE ${w.tx.length} B · ${ready?'ACK':'NACK'}`);w.address=null;w.tx=[];return ready?0:2;
      }
    }
    if(name==='SPI.setPins'){s.mosi=runtime.pin(a);s.miso=runtime.pin(b);s.sck=runtime.pin(c);if(new Set([s.mosi,s.miso,s.sck]).size!==3)throw new Error('SPI 핀은 서로 달라야 합니다.');return 0;}
    if(name==='SPI.begin'){s.ready=true;this.beginPins(runtime,[s.mosi,s.sck],[s.miso]);runtime.call('digitalWrite',[s.sck,0]);return 0;}
    if(name==='SPI.setClock'){if(!Number.isInteger(a)||a<1000||a>20000000)throw new Error('SPI 속도 범위: 1000~20000000 Hz');s.clock=a;return 0;}
    if(name==='SPI.transfer'){
      if(!s.ready)throw new Error('SPI.begin()을 먼저 호출하세요.');const value=Number(a)&255;
      const active=this.project.components.filter(p=>p.type==='spi'&&this.powered(p)&&this.same(this.terminal(p,4),this.pin(s.sck))&&this.same(this.terminal(p,5),this.pin(s.mosi))&&this.same(this.terminal(p,6),this.pin(s.miso))&&this.result()?.voltage(this.terminal(p,3))!=null&&this.result()?.voltage(this.terminal(p,3))<.8);
      if(active.length>1)throw new Error('SPI CS가 동시에 활성화되었습니다.');
      let answer=this.same(this.pin(s.mosi),this.pin(s.miso))?value:255;
      if(active.length===1){const part=active[0],memory=this.memory(part);let session=this.spiSessions.get(part.id);if(!session){session={phase:0,command:0};this.spiSessions.set(part.id,session);}if(session.phase===0){session.command=value;session.phase=1;answer=0;}else if(session.phase===1){memory.address=value;session.phase=2;answer=0;}else {if(session.command===3)answer=memory.data[memory.address];else if(session.command===2){memory.data[memory.address]=value;answer=0;}memory.address=(memory.address+1)&255;}}
      runtime.microTime+=8e6/s.clock;this.report(runtime,'SPI',`TX ${value.toString(16).padStart(2,'0')} · RX ${answer.toString(16).padStart(2,'0')}`);return answer;
    }
    if(name==='SPI.end'){s.ready=false;this.spiSessions.clear();return 0;}
    return undefined;
  }
  update(result){
    for(const p of this.project.components){
      if(p.type==='spi'&&(!this.powered(p)||result?.voltage(this.terminal(p,3))>=.8||result?.voltage(this.terminal(p,3))==null))this.spiSessions.delete(p.id);
      if(['uart','i2c','spi'].includes(p.type))result.parts[p.id]={voltage:(result.voltage(this.terminal(p,1))??0)-(result.voltage(this.terminal(p,2))??0),current:0,power:0,powered:this.powered(p),on:this.powered(p),received:this.received.get(p.id)||'',memory:[...this.memory(p).data]};
    }
  }
}
