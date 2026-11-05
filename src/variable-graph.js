// Variable graph, as STM Studio / STM32CubeMonitor draw it: global variables of the running program read every
// sample interval (simulation time) and plotted as value-over-time lines. Works with the C interpreter session and
// the ARM GCC firmware emulator session: each gives readVariable(name) → number (see session.js / firmware-session.js).
export const MAX_PLOTS=8;
export const COLORS=['#4f8cff','#f0883e','#3fb950','#d2a8ff','#ff7b72','#e3b341','#39c5cf','#db61a2'];
export const INTERVALS_MS=[1,5,10,50,100];
export const WINDOWS_S=[1,5,10,30,60];

export class VariableRecorder{
 constructor(names=[],{intervalMs=10,limit=20000}={}){this.intervalUs=intervalMs*1000;this.limit=limit;this.series=[];this.last=-Infinity;this.micros=0;this.setVariables(names);}
 /** Keeps the samples of names already plotted; new names start empty. */
 setVariables(names){const old=new Map(this.series.map(s=>[s.name,s]));this.series=[...new Set(names)].slice(0,MAX_PLOTS).map(name=>old.get(name)??{name,points:[],value:null,error:''});}
 setInterval(ms){this.intervalUs=ms*1000;}
 clear(){for(const s of this.series){s.points=[];s.value=null;s.error='';}this.last=-Infinity;this.micros=0;}
 get count(){return this.series.reduce((n,s)=>n+s.points.length,0);}
 /** Called on every circuit step; samples once per interval. `read(name)` throws or returns a number. */
 record(micros,read){
  if(micros<this.micros)return;this.micros=micros;
  if(!this.series.length||micros-this.last<this.intervalUs)return;
  this.last=micros;
  for(const s of this.series){
   let v=null;
   try{v=read(s.name);if(typeof v!=='number'||!Number.isFinite(v))throw new Error('숫자 하나로 읽을 수 없는 값입니다(배열·구조체는 [0]·.멤버로 고르세요).');s.error='';}
   catch(error){s.error=error.message;v=null;}
   s.value=v;if(v===null)continue;
   s.points.push([micros,v]);if(s.points.length>this.limit)s.points.splice(0,Math.floor(this.limit/10));
  }
 }
 csv(){
  const times=[...new Set(this.series.flatMap(s=>s.points.map(p=>p[0])))].sort((a,b)=>a-b),maps=this.series.map(s=>new Map(s.points));
  const field=t=>/[",\n]/.test(t)?`"${t.replaceAll('"','""')}"`:t;
  return ['time_ms,'+this.series.map(s=>field(s.name)).join(','),...times.map(t=>[(t/1000).toFixed(3),...maps.map(m=>m.has(t)?String(m.get(t)):'')].join(','))].join('\n')+'\n';
 }
}

export function niceStep(raw){const p=10**Math.floor(Math.log10(Math.max(Math.abs(raw),1e-9))),n=raw/p;return (n<1.5?1:n<3.5?2:n<7.5?5:10)*p;}
/** Value axis over the visible points: nice ticks, a little room above and below, ±1 around a flat line. */
export function valueAxis(values){
 if(!values.length)return {min:0,max:1,step:.25};
 let lo=Math.min(...values),hi=Math.max(...values);
 if(hi-lo<1e-9){const pad=Math.max(1,Math.abs(hi)*.1);lo-=pad;hi+=pad;}else{const pad=(hi-lo)*.08;lo-=pad;hi+=pad;}
 const step=niceStep((hi-lo)/6);return {min:Math.floor(lo/step)*step,max:Math.ceil(hi/step)*step,step};
}
const fmtTime=us=>us>=1e6?(us/1e6).toFixed(us%1e6?1:0)+' s':(us/1000).toFixed(0)+' ms';
const fmtValue=v=>Math.abs(v)>=1e6||(Math.abs(v)<1e-3&&v!==0)?v.toExponential(2):String(Number(v.toPrecision(6)));

/** SVG of the recorder's last `windowUs` (ending at `end`, default the newest sample time). */
export function variableChart(recorder,{windowUs=10e6,width=880,height=260,end}={}){
 const left=64,right=width-12,top=10,bottom=height-24;
 end=Math.max(windowUs,end??recorder.micros);const start=end-windowUs;
 const visible=recorder.series.map(s=>{const pts=s.points.filter(p=>p[0]>=start&&p[0]<=end),before=s.points.findLast?.(p=>p[0]<start);return before?[before,...pts]:pts;});
 const axis=valueAxis(visible.flat().map(p=>p[1]));
 const x=t=>left+(t-start)/windowUs*(right-left),y=v=>bottom-(v-axis.min)/(axis.max-axis.min)*(bottom-top);
 let svg=`<svg class="vg-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="시간에 따른 변수 값 그래프">`;
 svg+=`<rect class="vg-plot" x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"/>`;
 for(let v=axis.min,i=0;v<=axis.max+axis.step/2&&i<40;v+=axis.step,i++){const py=y(v).toFixed(1);svg+=`<line class="vg-grid" x1="${left}" y1="${py}" x2="${right}" y2="${py}"/><text class="vg-tick" x="${left-6}" y="${py}" text-anchor="end" dominant-baseline="middle">${fmtValue(Number(v.toPrecision(12)))}</text>`;}
 const tstep=niceStep(windowUs/8);for(let t=Math.ceil(start/tstep)*tstep;t<=end;t+=tstep){const px=x(t).toFixed(1);svg+=`<line class="vg-grid" x1="${px}" y1="${top}" x2="${px}" y2="${bottom}"/><text class="vg-tick" x="${px}" y="${height-6}" text-anchor="middle">${fmtTime(t)}</text>`;}
 svg+=`<text class="vg-axis" transform="translate(14 ${(top+bottom)/2}) rotate(-90)" text-anchor="middle">Value</text>`;
 svg+=`<clipPath id="vg-clip"><rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}"/></clipPath><g clip-path="url(#vg-clip)">`;
 visible.forEach((pts,i)=>{
  if(!pts.length)return;const color=COLORS[i%COLORS.length];
  svg+=`<polyline class="vg-line" data-series="${i}" stroke="${color}" points="${pts.map(([t,v])=>`${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
  // Square markers, as STM Studio draws them, while the samples are far enough apart to see.
  if(pts.length<=150)svg+=pts.map(([t,v])=>`<rect class="vg-mark" fill="${color}" x="${(x(t)-2.5).toFixed(1)}" y="${(y(v)-2.5).toFixed(1)}" width="5" height="5"/>`).join('');
 });
 return svg+'</g></svg>';
}
