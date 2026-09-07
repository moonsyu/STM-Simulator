import {CircuitSimulation,digitalRead} from './engine.js';
import {Runtime} from './runtime.js';
import {compile} from './parser.js';
import {UltrasonicSignals} from './sensors.js';
import {LCDController,constructLCD,callLCD} from './lcd.js';
import {BusDevices} from './buses.js';
import {WaveRecorder} from './trace.js';
import {compileHal} from './hal-source.js';
import {HalAdapter,HAL_CONSTANTS} from './hal.js';

export class SimulationSession {
  constructor(project,{print=()=>{},trace=()=>{},channels}={}){
    this.project=project;this.pressed={};this.result=null;this.time=0;this.integrated=-1;this.stepMs=project.simulation?.stepMs??1;this.circuit=new CircuitSimulation();this.sensors=new UltrasonicSignals();this.lcds=new Map();this.wave=new WaveRecorder(channels);this.serial=[];
    this.buses=new BusDevices(project,()=>this.result,trace);
    this.hal=project.firmware?.mode==='hal'?new HalAdapter(project.mcu,this.buses):null;
    this.runtime=new Runtime(this.hal?compileHal(project.code,project.firmware.files):compile(project.code),{
      constants:this.hal?HAL_CONSTANTS:undefined,
      invoke:(name,args,runtime)=>this.hal?.invoke(name,args,runtime),poll:runtime=>this.hal?.poll(runtime),
      print,pwmEnabled:project.simulation?.pwmWaveform??false,
      beforeChange:us=>this.advance(us),changed:us=>this.changed(us),advance:us=>this.advance(us),
      read:pin=>digitalRead(pin,this.result),voltage:pin=>this.result?.voltage('signal:'+pin),
      pulseIn:(pin,state,timeout,us)=>{this.changed(us);return this.sensors.pulseIn(project,this.result,pin,state,timeout,us);},
      construct:(name,args,runtime)=>constructLCD(args,runtime),deviceCall:(device,method,args,runtime)=>callLCD(device,method,args,runtime),
      call:(name,args,runtime)=>this.hal?.call(name,args,runtime)??this.buses.call(name,args,runtime),serialAvailable:()=>this.serial.length,serialRead:()=>this.serial.shift()??-1
    });
  }
  enrich(micros){
    if(!this.result||this.result.fault)return;
    this.sensors.update(this.project,this.result,micros);
    for(const p of this.project.components.filter(p=>p.type==='lcd')){if(!this.lcds.has(p.id))this.lcds.set(p.id,new LCDController());const lcd=this.lcds.get(p.id).update(p,this.result,micros);this.result.parts[p.id]={...this.result.parts[p.id],lcd};}
    this.buses.update(this.result);this.wave.record(micros,this.result);
  }
  advance(micros){
    const target=micros/1000;if(target<this.integrated)return;
    if(this.integrated<0){this.result=this.circuit.solve(this.project,this.runtime.gpio,this.pressed,0,this.sensors.echoHigh(0));this.integrated=0;this.enrich(0);}
    let count=0;
    while(target-this.integrated>1e-8){if(++count>20000)throw new Error('회로 시간 간격이 너무 큽니다.');const next=Math.min(target,this.integrated+this.stepMs);this.result=this.circuit.solve(this.project,this.runtime.gpio,this.pressed,next,this.sensors.echoHigh(next*1000));this.integrated=next;this.enrich(next*1000);if(this.result.fault)throw new Error(this.result.warnings[0]||'회로 해석 오류');}
    this.time=Math.max(this.time,target);
  }
  changed(micros=this.runtime.microTime){
    this.advance(micros);this.result=this.circuit.hold(this.project,this.runtime.gpio,this.pressed,this.sensors.echoHigh(micros));this.enrich(micros);if(this.result.fault)throw new Error(this.result.warnings[0]||'회로 해석 오류');return this.result;
  }
  tick(time){this.runtime.tick(time);return this.changed(this.runtime.microTime);}
  setPressed(pressed){this.pressed=pressed;this.changed();this.runtime.pollInterrupts();}
  inject(text,target='Serial1'){if(target==='Serial'){const bytes=[...String(text)].slice(0,256).map(c=>c.charCodeAt(0)&255);if(this.serial.length+bytes.length>4096)throw new Error('Serial 수신 버퍼가 가득 찼습니다.');this.serial.push(...bytes);return bytes.length;}const bus=this.hal?this.hal.serials.get(target==='Serial1'?'USART2':target)?.bus:this.buses;if(!bus)return 0;const count=bus.inject(text,this.runtime.microTime);if(this.hal&&count)for(const byte of bus.uart.queue.slice(-count))this.runtime.event(byte.at/1000,()=>{});return count;}
}
