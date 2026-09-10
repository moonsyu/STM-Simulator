import {MODULE_DEVICES} from './device-defs.js';

export const deviceTerminal=(p,n)=>`part:${p.id}:p${n}`;
export function modulePowered(p,r){
 const a=r?.voltage(deviceTerminal(p,1)),b=r?.voltage(deviceTerminal(p,2));
 const five=['pir','servo','motor','stepper','relay','matrix'].includes(p.type);
 return !!r&&!r.fault&&a!=null&&b!=null&&Math.abs(b)<.1&&a-b>=(five?4.5:2.7)&&a-b<=(five?5.5:3.6);
}
export class MotionDevices{
 constructor(){this.states=new Map();this.signals={};}
 update(project,result,micros,runtime,changed){
  this.currentResult=result;
  for(const p of project.components){
   if(!MODULE_DEVICES.includes(p.type))continue;
   const powered=modulePowered(p,result),v=n=>result.voltage(deviceTerminal(p,n)),high=n=>v(n)!=null&&v(n)>=2;
   let s=this.states.get(p.id);if(!s){s={at:micros,angle:90,speed:0,steps:0,phase:null,position:p.position??0,scheduled:0,encoderPhase:0};this.states.set(p.id,s);}
   const dt=Math.max(0,micros-s.at)/1e6;s.at=micros;
   const read=result.parts[p.id]??={voltage:0,current:0,power:0,on:false};
   Object.assign(read,{powered,on:powered});
   if(p.type==='servo'){
    const level=powered&&high(3);
    if(level&&!s.high){s.period=s.rise==null?null:micros-s.rise;s.rise=micros;}
    if(!level&&s.high&&powered){const width=micros-s.rise;if(width>=900&&width<=2100&&s.period>=10000&&s.period<=30000){s.target=Math.max(0,Math.min(180,(width-1000)*.18));s.pulse=width;s.validAt=micros;}}
    s.high=level;
    const active=powered&&s.validAt!=null&&micros-s.validAt<100000;
    if(active)s.angle+=Math.sign(s.target-s.angle)*Math.min(Math.abs(s.target-s.angle),360*dt);
    Object.assign(read,{on:active,angle:s.angle,target:active?s.target:null,pulse:active?s.pulse:null});
    if(!powered){s.rise=null;s.validAt=null;}
   }
   if(p.type==='motor'){
    const direction=high(4)===high(5)?0:high(4)?1:-1;
    // Integrate the preceding input over elapsed time; zero-time GPIO edges do not move the motor.
    const target=powered?direction*Math.max(0,Math.min(1,(v(3)??0)/3.3))*3000:0;
    s.speed=(s.previousTarget??0)+(s.speed-(s.previousTarget??0))*Math.exp(-dt/.15);s.previousTarget=target;
    s.angle=(s.angle+s.speed*6*dt)%360;
    Object.assign(read,{on:powered&&Math.abs(s.speed)>1,rpm:s.speed,angle:s.angle,direction:Math.sign(s.speed)});
   }
   if(p.type==='stepper'){
    const mask=[3,4,5,6].reduce((n,pin,i)=>n|(high(pin)?1<<i:0),0),phase=[1,2,4,8].indexOf(mask);
    if(powered&&phase>=0){if(s.phase!=null&&s.phase!==phase){const delta=(phase-s.phase+4)%4;if(delta===1)s.steps++;else if(delta===3)s.steps--;else read.invalidStep=true;}s.phase=phase;}
    if(!powered)s.phase=null;
    Object.assign(read,{on:powered&&phase>=0,steps:s.steps,angle:s.steps*1.8,phase:powered?phase:-1});
   }
   if(p.type==='relay')Object.assign(read,{on:powered&&high(3),contact:powered&&high(3)?'NO':'NC'});
   if(p.type==='pir')Object.assign(read,{on:powered&&!!p.motion,motion:powered&&!!p.motion});
   if(p.type==='joystick')Object.assign(read,{x:v(3),y:v(4),pressed:powered&&!!p.switch});
   if(p.type==='encoder'){
    if(!this.signals[p.id])this.signals[p.id]=[1,1];
    if(p.position!==s.position){
     const delta=p.position-s.position;s.position=p.position;
     if(powered){
      const count=Math.abs(delta)*4,dir=Math.sign(delta),sequence=[[1,1],[0,1],[0,0],[1,0]];
      if(count+s.scheduled+runtime.events.length>4000)throw new Error('인코더 회전 대기열이 가득 찼습니다.');
      let at=Math.max(micros,s.end??micros);s.scheduled+=count;
      for(let i=0;i<count;i++){at+=2000;runtime.event(at/1000,()=>{s.scheduled--;if(!modulePowered(p,this.currentResult))return;s.encoderPhase=(s.encoderPhase+dir+4)%4;this.signals[p.id]=sequence[s.encoderPhase];changed(runtime.microTime);runtime.pollInterrupts();});}
      s.end=at;
     }
    }
    Object.assign(read,{a:high(3)?1:0,b:high(4)?1:0,pending:s.scheduled,pressed:!!p.switch});
   }
  }
 }
}
