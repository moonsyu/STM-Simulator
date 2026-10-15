import {CATALOG_BY_TYPE} from './catalog-defs.js';
// Independent voices let multiple passive buzzers retain their own pitch.
export class BuzzerAudio {
  constructor(context){this.context=context;this.voices=new Map();}
  update(project,result,enabled,running){
    const parts=project.components.map(p=>CATALOG_BY_TYPE[p.type]?{...p,type:CATALOG_BY_TYPE[p.type].family}:p).filter(p=>['buzzer','passive_buzzer','i2s'].includes(p.type));
    const present=new Set(parts.map(p=>p.id)),now=this.context.currentTime;
    for(const [id,voice]of this.voices)if(!present.has(id)){
      voice.oscillator.stop();voice.oscillator.disconnect();voice.gain.disconnect();this.voices.delete(id);
    }
    const audible=parts.filter(p=>enabled&&running&&!result?.fault&&result?.parts[p.id]?.on&&(p.type!=='i2s'||result.parts[p.id].frequency>0));
    for(const p of parts){
      const read=result?.parts[p.id],playing=audible.includes(p);
      let voice=this.voices.get(p.id);
      if(!voice&&!playing)continue;
      if(!voice){
        const oscillator=this.context.createOscillator(),gain=this.context.createGain();
        gain.gain.value=0;oscillator.connect(gain).connect(this.context.destination);oscillator.start();
        voice={oscillator,gain};this.voices.set(p.id,voice);
      }
      voice.oscillator.type=p.type!=='buzzer'?'square':'sine';
      if(playing)voice.oscillator.frequency.setTargetAtTime(p.type!=='buzzer'?read.frequency:2300,now,.005);
      voice.gain.gain.setTargetAtTime(playing?.025/Math.max(1,audible.length):0,now,.015);
    }
  }
}
