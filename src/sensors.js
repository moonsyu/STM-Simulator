// HC-SR04 protocol-level model. Electrical power and wiring are still checked.
export class UltrasonicSignals{
 constructor(){this.states=new Map();}
 echoHigh(micros){return Object.fromEntries([...this.states].map(([id,s])=>[id,!!s.pulse&&micros>=s.pulse.at&&micros<=s.pulse.at+s.pulse.width]));}
 update(project,result,micros){
   for(const p of project.components.filter(p=>p.type==='ultrasonic')){
     let s=this.states.get(p.id);if(!s){s={high:false,start:0,pulse:null};this.states.set(p.id,s);}
     const powered=result?.parts[p.id]?.powered,voltage=result?.voltage(`part:${p.id}:p2`),ground=result?.voltage(`part:${p.id}:p4`),high=powered&&voltage!=null&&ground!=null&&voltage-ground>=2;
     if(!powered){s.high=false;s.pulse=null;continue;}
     if(high&&!s.high)s.start=micros;
     if(!high&&s.high&&micros-s.start>=10)s.pulse={width:Math.round(p.distance*58),at:micros};
     s.high=high;
   }
 }
 pulseIn(project,result,pin,state,timeout,micros){
   if(state!==1||result?.fault)return 0;
   for(const p of project.components.filter(p=>p.type==='ultrasonic')){
     if(!result.parts[p.id]?.powered||result.uf.find(`signal:${pin}`)!==result.uf.find(`part:${p.id}:p3`))continue;
     const s=this.states.get(p.id),pulse=s?.pulse;if(!pulse)continue;s.pulse=null;
     if(micros>pulse.at+pulse.width||pulse.width>timeout)return 0;return pulse.width;
   }
   return 0;
 }
}
