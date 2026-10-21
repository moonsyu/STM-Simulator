import {CatalogSingleWire} from './catalog-singlewire.js';
import {CatalogMotion} from './catalog-motion.js';
import {physicalToModel,physicalResult} from './catalog-model.js';
import {MotionDevices} from './device-motion.js';
import {PassiveBuzzers} from './passive-buzzer.js';
import {CircuitSimulation,digitalRead} from './engine.js';
import {Runtime} from './runtime.js';
import {compile} from './parser.js';
import {UltrasonicSignals} from './sensors.js';
import {LCDController,constructLCD,callLCD} from './lcd.js';
import {BusDevices} from './buses.js';
import {WaveRecorder} from './trace.js';
import {compileHal} from './hal-source.js';
import {HalAdapter,halConstantsFor} from './hal.js';
import {SignalRecorder,NoiseModel,signalsApi,validateNoise} from './signals.js';

export class SimulationSession {
  constructor(project,{print=()=>{},trace=()=>{},uart=()=>{},warn,channels,debug,program,storage}={}){
    const source=project;project=physicalToModel(project);
    this.signalRecorder=new SignalRecorder();this.noise=new NoiseModel(project.simulation?.noise);this.recordPins=new Set();this.warnings=[];this.onStorage=storage;
    this.signals=signalsApi(this.signalRecorder,this.noise,{now:()=>this.runtime.microTime,record:pins=>this.record(pins),onNoise:cfg=>{for(const p of new Set([source,project]))if(p.simulation)p.simulation.noise=cfg;else p.simulation={stepMs:this.stepMs,pwmWaveform:false,noise:cfg};}});
    const warnOut=warn??(message=>trace({micros:this.runtime?.microTime??0,protocol:'경고',message}));
    this.passiveBuzzers=new PassiveBuzzers();
    this.project=project;this.pressed={};this.result=null;this.time=0;this.integrated=-1;this.stepMs=project.simulation?.stepMs??1;this.circuit=new CircuitSimulation();this.motion=new MotionDevices();this.catalogMotion=new CatalogMotion();this.singleWire=new CatalogSingleWire();this.sensors=new UltrasonicSignals();this.lcds=new Map();this.wave=new WaveRecorder(channels);this.serial=[];
    this.buses=new BusDevices(project,()=>this.result,trace);this.buses.signals=this.signalRecorder;this.buses.noise=this.noise;
    this.hal=project.firmware?.mode==='hal'?this.createHal():null;
    this.runtime=new Runtime(program??(this.hal?compileHal(project.code,project.firmware.files,project.mcu?.family):compile(project.code)),{
      debug,preciseTiming:project.components.some(p=>p.type==='catalog_singlewire'),
      constants:this.hal?halConstantsFor(project.mcu?.family):undefined,
      invoke:(name,args,runtime)=>this.hal?.invoke(name,args,runtime),poll:runtime=>this.hal?.poll(runtime),
      preempt:runtime=>this.hal?.preempt(runtime)??false,declareGlobals:runtime=>this.hal?.declareGlobals?.(runtime),
      warn:message=>{this.warnings.push(message);if(this.warnings.length>50)this.warnings.shift();warnOut(message);},reset:runtime=>{if(this.hal){this.hal=this.createHal();this.hal.nvicModel.tick.lost=Math.floor(runtime.microTime/1000);}},
      print,uart,pwmEnabled:project.simulation?.pwmWaveform??false,
      beforeChange:us=>this.advance(us),changed:us=>this.changed(us),advance:us=>this.advance(us),
      read:pin=>digitalRead(pin,this.result),voltage:pin=>this.result?.voltage('signal:'+pin),
      pulseIn:(pin,state,timeout,us)=>{this.changed(us);return this.sensors.pulseIn(project,this.result,pin,state,timeout,us);},
      construct:(name,args,runtime)=>constructLCD(args,runtime),deviceCall:(device,method,args,runtime)=>callLCD(device,method,args,runtime),
      call:(name,args,runtime)=>this.hal?.call(name,args,runtime)??this.buses.call(name,args,runtime),serialAvailable:()=>this.serial.length,serialRead:()=>this.serial.shift()??-1
    });
  }
  createHal(){const hal=new HalAdapter(this.project.mcu,this.buses,{session:this});return hal;}
  // GPIO pins captured as 'gpio' signal channels (logic analyzer).
  record(pins=[]){for(const pin of pins){const id='GPIO.'+pin;this.recordPins.add(pin);this.signalRecorder.define(id,{label:pin,pins:[pin],protocol:'gpio'});}return [...this.recordPins];}
  recordSignals(micros,result){
    if(!result||result.fault)return;const level=id=>{const v=result.voltage(id);return v==null?null:v>1.65?1:0;};
    for(const pin of this.recordPins){const v=level('signal:'+pin);if(v!=null)this.signalRecorder.edge('GPIO.'+pin,micros,v);}
    for(const p of this.project.components)if(p.type==='catalog_singlewire'){const v=level(`part:${p.id}:p3`);if(v==null)continue;const id='1WIRE.'+p.id;if(!this.signalRecorder.has(id))this.signalRecorder.define(id,{label:'1-Wire '+(p.name||p.id),protocol:p.catalogVariant?.startsWith('ds18b20')?'onewire':'gpio'});this.signalRecorder.edge(id,micros,v);}
  }
  get camera(){return this.hal?.camera?.api;}
  get storage(){return this.hal?.storage?.api;}
  enrich(micros){
    this.hal?.catalog.update(this.project,this.result,micros);
    this.singleWire.update(this.project,this.result,micros,this.runtime);
    this.passiveBuzzers.update(this.project,this.result,micros);
    if(!this.result||this.result.fault)return;
    this.sensors.update(this.project,this.result,micros);
    for(const p of this.project.components.filter(p=>p.type==='lcd')){if(!this.lcds.has(p.id))this.lcds.set(p.id,new LCDController());const lcd=this.lcds.get(p.id).update(p,this.result,micros);this.result.parts[p.id]={...this.result.parts[p.id],lcd};}
    this.motion.update(this.project,this.result,micros,this.runtime,us=>this.changed(us));this.hal?.timerModel.observe(this.runtime,micros);this.buses.update(this.result);this.catalogMotion.update(this.project,this.result,micros,this.runtime);this.wave.record(micros,this.result);this.recordSignals(micros,this.result);this.hal?.update?.(this.result,micros);
  }
  advance(micros){
    const target=micros/1000;if(target<this.integrated)return;
    if(this.integrated<0){this.result=this.circuit.solve(this.project,this.runtime.gpio,this.pressed,0,this.sensors.echoHigh(0),this.motion.signals);this.integrated=0;this.enrich(0);}
    let count=0;
    while(target-this.integrated>1e-8){if(++count>20000)throw new Error('회로 시간 간격이 너무 큽니다.');const next=Math.min(target,this.integrated+this.stepMs);this.result=this.circuit.solve(this.project,this.runtime.gpio,this.pressed,next,this.sensors.echoHigh(next*1000),this.motion.signals);this.integrated=next;this.enrich(next*1000);if(this.result.fault)throw new Error(this.result.warnings[0]||'회로 해석 오류');}
    this.time=Math.max(this.time,target);
  }
  changed(micros=this.runtime.microTime){
    this.advance(micros);this.result=this.circuit.hold(this.project,this.runtime.gpio,this.pressed,this.sensors.echoHigh(micros),this.motion.signals);this.enrich(micros);if(this.result.fault)throw new Error(this.result.warnings[0]||'회로 해석 오류');return this.result;
  }
  get viewResult(){return physicalResult(this.result,this.project);}
  tick(time){if(this.project.components.some(p=>p.type==='catalog_singlewire')){while(this.runtime.time<time&&!this.runtime.debug.paused)this.runtime.tick(Math.min(time,this.runtime.time+1));if(time===0)this.runtime.tick(0);}else this.runtime.tick(time);return physicalResult(this.changed(this.runtime.microTime),this.project);}
  setPressed(pressed){this.pressed=pressed;this.changed();this.runtime.pollInterrupts();}
  inject(text,target='Serial1'){
    if(target==='Serial'){const bytes=[...String(text)].slice(0,256).map(c=>c.charCodeAt(0)&255);if(this.serial.length+bytes.length>4096)throw new Error('Serial 수신 버퍼가 가득 찼습니다.');this.serial.push(...bytes);return bytes.length;}
    const external=target.endsWith(':external'),id=external?target.slice(0,-9):target,bus=this.hal?this.hal.serials.get(id==='Serial1'?'USART2':id)?.bus:this.buses;
    if(!bus)return 0;
    const count=bus.inject(text,this.runtime.microTime,external?'external':this.hal&&['USART2','Serial1'].includes(id)?'vcp':'external');
    if(this.hal&&count)for(const byte of bus.uart.queue.slice(-count))this.runtime.event(byte.at/1000,()=>{});return count;
  }
}
