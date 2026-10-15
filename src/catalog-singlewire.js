// Microsecond-level sensor responses are driven by actual GPIO edges and wiring.
const crc8=bytes=>{let crc=0;for(let b of bytes)for(let i=0;i<8;i++){const mix=(crc^b)&1;crc>>=1;if(mix)crc^=0x8c;b>>=1;}return crc;};
export class CatalogSingleWire {
 constructor(){this.states=new Map();}
 update(project,result,us,runtime){
  if(!result||result.fault)return;
  for(const p of project.components.filter(p=>p.type==='catalog_singlewire')){
   const id=p.catalogVariant,pin=n=>`part:${p.id}:p${n}`,v=n=>result.voltage(pin(n)),powered=v(1)!=null&&v(2)!=null&&v(1)-v(2)>=2.7&&v(1)-v(2)<=5.5&&Math.abs(v(2))<.1;
   let s=this.states.get(p.id);if(!s){s={bits:0,byte:0,pulses:[],queue:[],host:null,mode:'command',converted:25};this.states.set(p.id,s);}
   const data=Object.keys(runtime.gpio).find(k=>result.uf.find('signal:'+k)===result.uf.find(pin(3))),gpio=runtime.gpio[data],hostLow=gpio?.mode==='OUTPUT'&&gpio.value<.8,hostHigh=gpio?.mode==='OUTPUT'&&gpio.value>1.8;
   if(!powered||!data){s.pulses=[];s.queue=[];s.host=null;s.high=false;p.catalogState.low=false;p.catalogState.high=false;result.parts[p.id]={...result.parts[p.id],powered:false,on:false};continue;}
   if(id==='urm09-trig-3'){
    if(hostHigh&&!s.high)s.rise=us;
    if(!hostHigh&&s.high&&us-s.rise>=10)s.pulses=[[us+100,us+100+(p.distance??100)*58]];
    s.high=hostHigh;p.catalogState.high=s.pulses.some(([a,b])=>us>=a&&us<b)&&gpio?.mode!=='OUTPUT';
   }else{
    if(hostLow&&!s.host)s.fall=us;
    if(!hostLow&&s.host){const duration=us-s.fall;
     if(id.startsWith('ds18b20')){
      if(duration>=400){s.pulses=[[us+15,us+240]];s.bits=0;s.byte=0;s.mode='command';s.queue=[];}
      else if(s.mode==='read'){const bit=s.queue.shift()??1;if(!bit)s.pulses.push([us,us+50]);}
      else if(duration>0){s.byte|=(duration<30?1:0)<<s.bits;if(++s.bits===8){
       if(s.byte===0x44){s.ready=us+750000;s.pending=p.temperature??25;}
       if(s.byte===0xbe){if(us>=s.ready)s.converted=s.pending;const raw=Math.round(s.converted*16)&65535,bytes=[raw&255,raw>>8,75,70,127,255,12,16];bytes.push(crc8(bytes));s.queue=bytes.flatMap(b=>Array.from({length:8},(_,i)=>b>>i&1));s.mode='read';}
       s.byte=0;s.bits=0;
      }}
     }else if(duration>=1000){
      const t=p.temperature??25,h=p.humidity??50,rawT=Math.round(Math.abs(t)*10)|(t<0?0x8000:0),rawH=Math.round(h*10),bytes=id.startsWith('dht11')?[Math.floor(h),Math.round(h%1*10),Math.floor(t),Math.round(t%1*10)]:[rawH>>8,rawH&255,rawT>>8,rawT&255];bytes.push(bytes.reduce((a,b)=>a+b,0)&255);
      let at=us+20;s.pulses=[[at,at+80]];at+=160;for(const b of bytes)for(let i=7;i>=0;i--){s.pulses.push([at,at+50]);at+=50+((b>>i&1)?70:28);}s.pulses.push([at,at+50]);
     }
    }
    s.host=hostLow;p.catalogState.low=s.pulses.some(([a,b])=>us>=a&&us<b);s.pulses=s.pulses.filter(([,end])=>end>us);
   }
   result.parts[p.id]={...result.parts[p.id],powered,on:powered,temperature:p.temperature,humidity:p.humidity,distance:p.distance};
  }
 }
}
