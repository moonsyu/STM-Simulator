export class WaveRecorder {
  constructor(channels=['PA5','PA10','PA0','PC13'],limit=12000){this.channels=[...channels];this.limit=limit;this.samples=[];this.dropped=0;}
  clear(){this.samples=[];this.dropped=0;}
  setChannels(channels){this.channels=[...channels];this.clear();}
  record(micros,result){
    const values=this.channels.map(p=>result?.voltage('signal:'+p)??null),last=this.samples.at(-1);
    if(last&&micros<last.micros)return;
    if(last&&micros===last.micros&&values.every((v,i)=>v===last.values[i]))return;
    this.samples.push({micros,values});if(this.samples.length>this.limit){const count=Math.max(1,Math.floor(this.limit/10));this.samples.splice(0,count);this.dropped+=count;}
  }
  csv(){return ['time_ms,'+this.channels.map(p=>p+'_V').join(','),...this.samples.map(s=>[(s.micros/1000).toFixed(6),...s.values.map(v=>v==null?'':v.toFixed(6))].join(','))].join('\n')+'\n';}
}

export function waveSvg(recorder,windowMs=1000){
  const width=880,height=190,left=55,right=870,row=39,end=Math.max(windowMs*1000,recorder.samples.at(-1)?.micros??0),start=end-windowMs*1000;
  const samples=recorder.samples.filter(s=>s.micros>=start),colors=['#16a085','#368bd6','#ca8520','#9465cf'];
  const x=t=>left+(t-start)/(end-start)*(right-left);
  let svg=`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="시간에 따른 핀 전압 파형">`;
  for(let i=0;i<=5;i++){const px=left+i*(right-left)/5;svg+=`<path d="M${px} 6V164" stroke="#dce5eb"/><text x="${px}" y="184" text-anchor="middle" font-size="9" fill="#778b99">${((start+(end-start)*i/5)/1000).toFixed(windowMs<10?2:0)} ms</text>`;}
  recorder.channels.forEach((pin,index)=>{
    const baseline=35+index*row,y=v=>baseline-Math.max(-.3,Math.min(5.5,v))*5;
    svg+=`<text x="2" y="${baseline-8}" font-size="10" fill="${colors[index]}">${pin}</text><path d="M${left} ${baseline}H${right}" stroke="#e6edf1"/><text x="2" y="${baseline+3}" font-size="8" fill="#9aaab4">0–5 V</text>`;
    let path='',connected=false;for(const sample of samples){const value=sample.values[index];if(value==null){connected=false;continue;}path+=`${connected?'L':'M'}${x(sample.micros).toFixed(2)} ${y(value).toFixed(2)}`;connected=true;}
    svg+=`<path class="trace-channel" data-channel="${pin}" d="${path}" fill="none" stroke="${colors[index]}" stroke-width="1.5"/>`;
  });
  return svg+'</svg>';
}
