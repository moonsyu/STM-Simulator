import {compile} from './parser.js';
import {Runtime} from './runtime.js';
import {formatPrintf} from './hal-stdio.js';
import {devboardModel} from './devboards.js';
import {Esp32Bluetooth,Esp32Wifi} from './wireless.js';

// ESP32 boards run their Arduino sketch (setup / loop) in the same C interpreter as STM32 sketches, with ESP32 pin
// numbers (2 → GPIO2), 12-bit analogRead, LEDC PWM, Serial.printf, the DHT library, Wire as an I2C slave and Serial2
// (GPIO16 RX / GPIO17 TX) as far as the wireless modules on it go, BluetoothSerial and WiFi (WiFiServer / WiFiClient).
// The program runs as a circuit driver: it advances with circuit time and reads its inputs from the last solved step.
const DIGITAL_ONLY=new Set([6,7,8,9,10,11]);
function esp32Pin(model,value){
 const n=typeof value==='number'?value:Number(/^(?:GPIO)?(\d+)$/i.exec(String(value))?.[1]);
 const name='GPIO'+n;if(!Number.isInteger(n)||!model.pins.some(p=>p.signal===name))throw new Error(`ESP32에 없는 핀 번호입니다: ${value}`);
 if(DIGITAL_ONLY.has(n))throw new Error(`GPIO${n}은 보드 내장 플래시에 연결된 핀이라 사용할 수 없습니다.`);return name;
}
export class SketchDriver{
 constructor(part,{log=()=>{},project}={}){
  const model=devboardModel(part);this.part=part;this.project=project;this.result=null;this.output='';this.outputLabel='스케치 출력';
  this.print=text=>{this.output=(this.output+text).slice(-8000);for(const line of String(text).split('\n').filter(Boolean))log(line);};
  this.wire={address:null,receive:null,request:null,rx:[],tx:[]};this.ledc=new Map();this.serial2={ready:false,baud:9600,rx:'GPIO16',tx:'GPIO17',queue:[],lastTx:0};this.serialIn=[];
  let program;try{program=compile(part.code,{esp32:true});}catch(error){throw new Error(`${part.name} · ${devboardModel(part).file}: ${error.message}`);}
  this.runtime=new Runtime(program,{
   pin:value=>esp32Pin(model,value),constants:{DHT11:11,DHT22:22,LED_BUILTIN:2,SERIAL_8N1:0x800001c,WL_IDLE_STATUS:0,WL_CONNECTED:3,WL_DISCONNECTED:6,WIFI_STA:1,WIFI_AP:2,WIFI_AP_STA:3},constructs:['DHT','BluetoothSerial','WiFiServer','WiFiClient'],
   print:text=>this.print(String(text)+'\n'),read:pin=>this.level(pin),voltage:pin=>this.voltage(pin),serialAvailable:()=>this.serialIn.length,serialRead:()=>this.serialIn.shift()??-1,
   construct:(name,args)=>({kind:'device',name,args}),deviceCall:(device,method,args)=>this.device(device,method,args),
   call:(name,args,runtime)=>this.call(name,args,runtime)
  });
 }
 voltage(pin){return this.result?.voltage?.(`signal:${this.part.id}.${pin}`)??null;}
 level(pin){const v=this.voltage(pin);return v!=null&&v>=1.65?1:0;}
 call(name,args,runtime){
  if(name==='Serial.printf'){this.print(formatPrintf(args,runtime));return 0;}
  if(name.startsWith('Serial2.'))return this.serial2Call(name.slice(8),args,runtime);
  if(name.startsWith('WiFi.'))return this.wifiCall(name.slice(5),args,runtime);
  // LEDC PWM (ESP32 Arduino core 3.x ledcAttach/ledcWrite and 2.x ledcSetup/ledcAttachPin by channel).
  if(name==='ledcAttach'){const pin=runtime.pin(args[0]);this.ledc.set(pin,{bits:args[2]??8});runtime.setPinMode(pin,'OUTPUT');return 1;}
  if(name==='ledcSetup'){this.ledc.set('ch'+args[0],{bits:args[2]??8,pins:[]});return args[1];}
  if(name==='ledcAttachPin'){const pin=runtime.pin(args[0]),ch=this.ledc.get('ch'+args[1]);if(!ch)throw new Error('ledcSetup으로 채널을 먼저 설정하세요.');ch.pins.push(pin);runtime.setPinMode(pin,'OUTPUT');return 0;}
  if(name==='ledcWrite'){
   const channel=this.ledc.get('ch'+args[0]),pins=channel?channel.pins:[runtime.pin(args[0])],bits=(channel??this.ledc.get(pins[0]))?.bits??8,duty=Math.max(0,Math.min(1,Number(args[1])/((1<<bits)-1)));
   for(const pin of pins){if(runtime.gpio[pin]?.mode!=='OUTPUT')runtime.setPinMode(pin,'OUTPUT');runtime.output(pin,3.3*duty,duty>0&&duty<1?{duty,frequency:5000}:null);}return 1;
  }
  // Wire as an I2C slave: Wire.begin(address), onReceive / onRequest callbacks, available / read / write.
  const w=this.wire;
  if(name==='Wire.begin'){w.address=args.length?Number(args[0]):null;return 1;}
  if(name==='Wire.onReceive'){w.receive=runtime.callback(args[0]);return 0;}
  if(name==='Wire.onRequest'){w.request=runtime.callback(args[0]);return 0;}
  if(name==='Wire.available')return w.rx.length;
  if(name==='Wire.read')return w.rx.length?w.rx.shift():-1;
  if(name==='Wire.write'){w.tx.push(Number(args[0])&255);return 1;}
  return undefined;
 }
 serial2Call(method,args,runtime){
  const u=this.serial2;
  if(method==='begin'){if(!Number.isInteger(args[0])||args[0]<300||args[0]>2000000)throw new Error('UART 속도 범위: 300~2000000 baud');u.baud=args[0];if(args.length>2){u.rx=runtime.pin(args[2]);u.tx=runtime.pin(args[3]);}u.ready=true;runtime.setPinMode(u.rx,'INPUT');runtime.setPinMode(u.tx,'OUTPUT');runtime.output(u.tx,3.3,null);return 0;}
  if(!u.ready)throw new Error('Serial2.begin(baud)를 먼저 호출하세요.');
  const ready=()=>u.queue.filter(x=>x.at<=runtime.microTime+1e-6);
  if(method==='available')return ready().length;
  if(method==='read'){const i=u.queue.findIndex(x=>x.at<=runtime.microTime+1e-6);return i<0?-1:u.queue.splice(i,1)[0].value;}
  if(method==='flush')return 0;
  if(!['print','println','write'].includes(method))throw new Error(`Serial2.${method}은 지원하지 않습니다.`);
  const text=method==='write'&&typeof args[0]==='number'?String.fromCharCode(args[0]&255):runtime.format(args)+(method==='println'?'\r\n':'');
  const bit=1e7/u.baud;let t=Math.max(runtime.microTime,u.lastTx);const frames=[...text].map(c=>({value:c.charCodeAt(0)&255,at:t+=bit}));u.lastTx=t;
  const uf=this.result?.uf;this.wireless?.transmit(frames,u.baud,id=>!!uf&&uf.find(`part:${id}:p4`)===uf.find(`signal:${this.part.id}.${u.tx}`));
  return frames.length;
 }
 // What the serial monitor sends arrives on Serial, like text from the USB port.
 get acceptsInput(){return true;}
 receive(text){const bytes=new TextEncoder().encode(text);this.serialIn.push(...bytes);return bytes.length;}
 // ---- the board's own radio, on the air of the run
 get hub(){if(!this.wireless)throw new Error('무선 통신은 회로 실행 중에만 쓸 수 있습니다.');return this.wireless;}
 bytesOf(method,args){
  if(method==='write'&&typeof args[0]==='number')return [args[0]&255];
  return [...new TextEncoder().encode(this.runtime.format(args)+(method==='println'?'\r\n':''))];
 }
 ready(queue){const now=this.runtime.microTime+1e-6;return queue.filter(x=>x.at<=now);}
 take(queue){const i=queue.findIndex(x=>x.at<=this.runtime.microTime+1e-6);return i<0?-1:queue.splice(i,1)[0].value;}
 bluetoothCall(method,args){
  if(method==='begin'){this.bt??=this.hub.addRadio(new Esp32Bluetooth(this.hub,this.part,typeof args[0]==='string'?args[0]:''));return 1;}
  if(!this.bt)throw new Error('SerialBT.begin()을 먼저 호출하세요.');
  if(method==='connected'||method==='hasClient')return this.bt.peer?1:0;
  if(method==='available')return this.ready(this.bt.rx).length;
  if(method==='read')return this.take(this.bt.rx);
  if(method==='flush'||method==='end')return 0;
  if(['print','println','write'].includes(method))return this.bt.send(this.bytesOf(method,args),this.runtime.microTime);
  throw new Error(`BluetoothSerial.${method}은 지원하지 않습니다.`);
 }
 wifiCall(method,args,runtime){
  this.wifi??=this.hub.addRadio(new Esp32Wifi(this.hub,this.part));const w=this.wifi,at=runtime.microTime;
  if(method==='mode'){w.mode=args[0];return 1;}
  if(method==='begin'){w.begin(runtime.format([args[0]]),args.length>1?runtime.format([args[1]]):'',at);return 0;}
  if(method==='softAP'){w.softAP(runtime.format([args[0]]),args.length>1?runtime.format([args[1]]):'',at);return 1;}
  if(method==='status')return w.ip?3:6;
  if(method==='disconnect'){w.leave(at);return 1;}
  if(method==='localIP')return w.ip??'0.0.0.0';
  if(method==='softAPIP')return w.ap?'192.168.4.1':'0.0.0.0';
  throw new Error(`WiFi.${method}은 지원하지 않습니다.`);
 }
 serverCall(device,method){
  this.wifi??=this.hub.addRadio(new Esp32Wifi(this.hub,this.part));
  if(method==='begin'){this.wifi.server={port:device.args[0]??80};return 0;}
  if(method==='available'||method==='accept'){const link=this.wifi.links.find(l=>l.server&&!l.accepted);if(!link)return 0;link.accepted=true;return {kind:'device',name:'WiFiClient',args:[],link};}
  throw new Error(`WiFiServer.${method}은 지원하지 않습니다.`);
 }
 clientCall(device,method,args){
  const at=this.runtime.microTime;
  if(method==='connect'){this.wifi??=this.hub.addRadio(new Esp32Wifi(this.hub,this.part));device.link=this.wifi.client(this.runtime.format([args[0]]),args[1],at);return device.link?1:0;}
  const link=device.link,open=!!link&&!!this.wifi?.links.includes(link);
  if(method==='connected')return open||(link?.rx?.length??0)>0?1:0;
  if(method==='available')return link?.rx?this.ready(link.rx).length:0;
  if(method==='read')return link?.rx?this.take(link.rx):-1;
  if(method==='flush')return 0;
  if(method==='stop'){if(open)this.wifi.dropLink(link,at,true);return 0;}
  if(['print','println','write'].includes(method)){if(!open)return 0;const bytes=this.bytesOf(method,args);this.wifi.transfer(link,bytes,at);return bytes.length;}
  throw new Error(`WiFiClient.${method}은 지원하지 않습니다.`);
 }
 joinWireless(hub){hub.addPort(this.part.id,this);}
 wirelessRx(module,frames,baud){
  const u=this.serial2,uf=this.result?.uf;if(!u.ready||!uf||u.baud!==baud||uf.find(`part:${module.id}:p3`)!==uf.find(`signal:${this.part.id}.${u.rx}`))return;
  for(const f of frames){u.queue.push({at:f.at,value:f.value});this.runtime.event(f.at/1000,()=>{});}
 }
 device(device,method,args){
  if(device.name==='BluetoothSerial')return this.bluetoothCall(method,args);
  if(device.name==='WiFiServer')return this.serverCall(device,method);
  if(device.name==='WiFiClient')return this.clientCall(device,method,args);
  if(device.name!=='DHT')throw new Error('지원하지 않는 장치입니다.');
  if(method==='begin')return 0;
  // The DHT11 / DHT22 module wired to this pin and powered: its temperature / humidity settings, otherwise NaN.
  const pin=esp32Pin(devboardModel(this.part),device.args[0]),uf=this.result?.uf;
  const sensor=this.project?.components.find(p=>/dht(11|22)/.test(p.type)&&uf&&uf.find(`part:${p.id}:p3`)===uf.find(`signal:${this.part.id}.${pin}`)&&(this.result.voltage(`part:${p.id}:p1`)??0)-(this.result.voltage(`part:${p.id}:p2`)??0)>3);
  if(method==='readTemperature')return sensor?Number(sensor.temperature):NaN;
  if(method==='readHumidity')return sensor?Number(sensor.humidity):NaN;
  throw new Error(`DHT.${method}은 지원하지 않습니다. begin / readTemperature / readHumidity를 사용하세요.`);
 }
 // The sketch starts once the circuit has been solved (its first reads see the powered circuit, as after a boot).
 advance(time){if(!this.result)return;try{this.runtime.tick(time);}catch(error){throw new Error(`${this.part.name}: ${error.message}`);}}
 gpio(){const out={};for(const [pin,state]of Object.entries(this.runtime.gpio))out[`${this.part.id}.${pin}`]=state;return out;}
 observe(result){this.result=result;this.runtime.pollInterrupts();}
 i2cSlave(){return this.wire.address==null?null:{address:this.wire.address,sda:'GPIO21',scl:'GPIO22'};}
 i2cReceive(bytes){this.wire.rx.push(...bytes);if(this.wire.receive)this.runtime.runCallback({...this.wire.receive,args:[bytes.length]});return true;}
 i2cRequest(count){this.wire.tx=[];if(this.wire.request)this.runtime.runCallback(this.wire.request);const out=this.wire.tx.slice(0,count);while(out.length<count)out.push(0xff);return out;}
}
