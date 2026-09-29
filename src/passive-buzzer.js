// Decode the voltage across the actual terminals, including wires and loads.
// A DC level (also averaged PWM) cannot produce a continuous passive tone.
export class PassiveBuzzers {
  constructor(){this.states=new Map();}
  update(project,result,micros){
    if(!result||result.fault){this.states.clear();return;}
    const present=new Set();
    for(const p of project.components){
      if(p.type!=='passive_buzzer')continue;
      present.add(p.id);
      const read=result.parts[p.id],a=result.voltage(`part:${p.id}:a`),b=result.voltage(`part:${p.id}:b`);
      if(!read)continue;
      let s=this.states.get(p.id);
      if(!s){s={high:false,frequency:0,duty:0};this.states.set(p.id,s);}
      const voltage=a==null||b==null?null:Math.abs(a-b);
      if(voltage==null){this.states.delete(p.id);Object.assign(read,{on:false,frequency:0,duty:0});continue;}
      const high=voltage>=2?true:voltage<=.8?false:s.high;
      if(high!==s.high){
        if(high){
          const period=micros-s.rise,highTime=s.fall-s.rise;
          const valid=period>=500-1e-6&&period<=50000+1e-6&&highTime>0&&highTime<period;
          s.frequency=valid?1e6/period:0;s.duty=valid?highTime/period:0;
          s.period=period;s.rise=micros;s.fall=undefined;
        }else s.fall=micros;
        s.high=high;s.edge=micros;
      }
      // Stop after missing edges, including a disconnected lead or PWM Stop.
      if(micros-s.edge>1.5*s.period||micros-s.rise>2*s.period){s.frequency=0;s.duty=0;}
      Object.assign(read,{on:s.frequency>0,frequency:s.frequency,duty:s.duty});
    }
    for(const id of this.states.keys())if(!present.has(id))this.states.delete(id);
  }
}
