import {compile} from './parser.js';
import {Runtime} from './runtime.js';
import {formatPrintf} from './hal-stdio.js';
import {devboardModel} from './devboards.js';

// ESP32 boards run their Arduino sketch (setup / loop) in the same C interpreter as STM32 sketches, with ESP32 pin
// numbers (2 → GPIO2), 12-bit analogRead, LEDC PWM, Serial.printf, the DHT library and Wire as an I2C slave.
// The program runs as a circuit driver: it advances with circuit time and reads its inputs from the last solved step.
const DIGITAL_ONLY=new Set([6,7,8,9,10,11]);
function esp32Pin(model,value){
 const n=typeof value==='number'?value:Number(/^(?:GPIO)?(\d+)$/i.exec(String(value))?.[1]);
 const name='GPIO'+n;if(!Number.isInteger(n)||!model.pins.some(p=>p.signal===name))throw new Error(`ESP32에 없는 핀 번호입니다: ${value}`);
 if(DIGITAL_ONLY.has(n))throw new Error(`GPIO${n}은 보드 내장 플래시에 연결된 핀이라 사용할 수 없습니다.`);return name;
}
export class SketchDriver{
 constructor(part,{log=()=>{},project}={}){
  const model=devboardModel(part);this.part=part;this.project=project;this.result=null;this.output='';
  this.print=text=>{this.output=(this.output+text).slice(-8000);for(const line of String(text).split('\n').filter(Boolean))log(line);};
  this.wire={address:null,receive:null,request:null,rx:[],tx:[]};this.ledc=new Map();
  let program;try{program=compile(part.code,{esp32:true});}catch(error){throw new Error(`${part.name} · ${devboardModel(part).file}: ${error.message}`);}
  this.runtime=new Runtime(program,{
   pin:value=>esp32Pin(model,value),constants:{DHT11:11,DHT22:22,LED_BUILTIN:2},constructs:['DHT'],
   print:text=>this.print(String(text)+'\n'),read:pin=>this.level(pin),voltage:pin=>this.voltage(pin),
   construct:(name,args)=>({kind:'device',name,args}),deviceCall:(device,method,args)=>this.device(device,method,args),
   call:(name,args,runtime)=>this.call(name,args,runtime)
  });
 }
 voltage(pin){return this.result?.voltage?.(`signal:${this.part.id}.${pin}`)??null;}
 level(pin){const v=this.voltage(pin);return v!=null&&v>=1.65?1:0;}
 call(name,args,runtime){
  if(name==='Serial.printf'){this.print(formatPrintf(args,runtime));return 0;}
  // LEDC PWM (ESP32 Arduino core 3.x ledcAttach/ledcWrite and 2.x ledcSetup/ledcAttachPin by channel).
  if(name==='ledcAttach'){const pin=runtime.pin(args[0]);this.ledc.set(pin,{bits:args[2]??8});runtime.setPinMode(pin,'OUTPUT');return 1;}
  if(name==='ledcSetup'){this.ledc.set('ch'+args[0],{bits:args[2]??8,pins:[]});return args[1];}
  if(name==='ledcAttachPin'){const pin=runtime.pin(args[0]),ch=this.ledc.get('ch'+args[1]);if(!ch)throw new Error('ledcSetup으로 채널을 먼저 설정하세요.');ch.pins.push(pin);runtime.setPinMode(pin,'OUTPUT');return 0;}
  if(name==='ledcWrite'){
   const channel=this.ledc.get('ch'+args[0]),pins=channel?channel.pins:[runtime.pin(args[0])],bits=(channel??this.ledc.get(pins[0]))?.bits??8,duty=Math.max(0,Math.min(1,Number(args[1])/((1<<bits)-1)));
   for(const pin of pins){if(runtime.gpio[pin]?.mode!=='OUTPUT')runtime.setPinMode(pin,'OUTPUT');runtime.output(pin,3.3*duty);}return 1;
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
 device(device,method,args){
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
