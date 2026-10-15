export class CatalogMotion {
 constructor(){this.states=new Map();}
 update(project,result,micros,runtime){
  if(!result||result.fault)return;
  for(const p of project.components){if(!p.catalogVariant)continue;
   const v=n=>result.voltage(`part:${p.id}:p${n}`),high=n=>(v(n)??0)>1.65,powered=v(1)!=null&&v(2)!=null&&v(1)-v(2)>=2.7&&v(1)-v(2)<=5.5&&Math.abs(v(2))<.1;
   let s=this.states.get(p.id);if(!s){s={steps:0,phase:null,position:p.position??0,quad:0,bytes:[],digits:[0,0,0,0],at:[0,0,0,0],pendingBits:[0,0,0,0],since:[0,0,0,0]};this.states.set(p.id,s);}
   const state=p.catalogState,read=result.parts[p.id]??={on:false,current:0,voltage:0,power:0};
   if(p.catalogVariant==='servo-feedback-4')state.angle=read.angle??90;
   if(p.type==='catalog_stepper'){
    const bipolar=p.catalogVariant.includes('bipolar'),mask=bipolar?((v(1)-v(2)>1?1:0)|(v(1)-v(2)<-1?2:0)|(v(3)-v(4)>1?4:0)|(v(3)-v(4)<-1?8:0)):[2,3,4,5].reduce((m,n,i)=>m|((v(1)-v(n)>2)?1<<i:0),0),phase=(bipolar?[5,6,10,9]:[1,2,4,8]).indexOf(mask);
    if(phase>=0){if(s.phase!=null&&phase!==s.phase){const delta=(phase-s.phase+4)%4;if(delta===1)s.steps++;else if(delta===3)s.steps--;}s.phase=phase;}
    Object.assign(read,{on:phase>=0,steps:s.steps,angle:s.steps*(bipolar?1.8:360/2048),phase});
   }
   if(p.type==='catalog_encoder'&&s.position!==p.position){const delta=p.position-s.position;s.position=p.position;const count=Math.min(Math.abs(delta)*4,4000),sequence=[[1,1],[0,1],[0,0],[1,0]];for(let n=1;n<=count;n++)runtime.event(micros/1000+n*2,()=>{s.quad=(s.quad+Math.sign(delta)+4)%4;state.quad=sequence[s.quad];});}
   if(p.type==='catalog_encoder')Object.assign(read,{a:state.quad?.[0]??1,b:state.quad?.[1]??1,pressed:!!p.switch});
   if(p.type==='catalog_digits'){
    if(micros!==s.observedAt)for(let d=0;d<4;d++){let bits=0;for(let bit=0;bit<8;bit++)if(read.channels?.[d+':'+'abcdefg.'.charAt(bit)]?.on)bits|=1<<bit;if(bits){if(s.pendingBits[d]!==bits){s.pendingBits[d]=bits;s.since[d]=micros;}else if(micros-s.since[d]>=100){s.digits[d]=bits;s.at[d]=micros;}}else {s.pendingBits[d]=0;if(micros-s.at[d]>30000)s.digits[d]=0;}}
    s.observedAt=micros;read.digits=[...s.digits];read.on=s.digits.some(Boolean);
   }
   if(p.type==='catalog_tm1637'){
    if(!powered){state.ack=false;s.active=false;s.digits.fill(0);s.display=false;}
    const clk=high(3),dio=high(4),pin=Object.keys(runtime.gpio).find(pin=>result.uf.find('signal:'+pin)===result.uf.find(`part:${p.id}:p4`)),masterOutput=runtime.gpio[pin]?.mode==='OUTPUT';
    if(powered){
     if(clk&&s.clk&&masterOutput&&!state.ack&&s.dio&&!dio){s.active=true;s.bits=0;s.byte=0;s.first=true;}
     if(clk&&s.clk&&masterOutput&&!state.ack&&!s.dio&&dio)s.active=false;
     if(s.active&&!s.clk&&clk){
      if(s.bits<8){s.byte|=Number(dio)<<s.bits;s.bits++;if(s.bits===8){if(s.first){s.first=false;if((s.byte&0xf0)===0xc0)s.address=s.byte&7;else if((s.byte&0xf0)===0x80)s.display=!!(s.byte&8);else s.address=null;}else if(s.address!=null){if(s.address<4)s.digits[s.address]=s.byte;s.address++;}}}
      else s.ackClock=true;
     }
     if(s.active&&s.clk&&!clk&&s.bits===8){if(s.ackClock){state.ack=false;s.ackClock=false;s.bits=0;s.byte=0;}else state.ack=true;}
    }
    s.clk=clk;s.dio=dio;Object.assign(read,{powered,on:powered&&s.display,digits:powered&&s.display?[...s.digits]:[0,0,0,0]});
   }
  }
 }
}
