// L298N module terminals, not the bare Multiwatt IC pin numbers.
// The tables are rust/stm-core/src/data/l298.json (feature 62).
import {CATALOG_TABLES} from './catalog-tables.js';
export const {L298_DEFS,L298_CHANNELS,L298_MODES}=CATALOG_TABLES;
export function l298State(p,voltage,grounded=true){
 const v=n=>voltage(`part:${p.id}:p${n}`),g=v(2),vm=v(1),logic=v(3);
 const powered=grounded&&g!=null&&vm!=null&&logic!=null&&Math.abs(g)<.1&&vm-g>=6&&vm-g<=24&&logic-g>=4.5&&logic-g<=5.5;
 const level=n=>{const x=v(n);return x==null?null:x-g>=2.3&&x-g<=logic-g+.01?1:x-g>=-.3&&x-g<=1.5?0:null;};
 const channels=Object.fromEntries(L298_CHANNELS.map(c=>{
  const en=level(c.en),inputs=c.inputs.map(level),valid=en!==null&&(en===0||inputs.every(x=>x!==null));
  const enabled=powered&&en===1&&valid,mode=!powered?'unpowered':!valid?'invalid':!enabled?'coast':inputs[0]===inputs[1]?'brake':inputs[0]?'forward':'reverse';
  return [c.name,{enabled,inputs,mode}];
 }));
 return {powered,channels};
}
export function l298Branches(p,uf,branch){
 const pin=n=>`part:${p.id}:p${n}`;
 branch(pin(1),pin(2),10000);branch(pin(3),pin(2),1000,{id:p.id});
 for(const n of [4,5,6,7,8,9])branch(pin(n),pin(2),1000000);
 for(const c of L298_CHANNELS)for(const [i,n]of c.outputs.entries())for(const high of [false,true]){
  branch(pin(n),pin(high?1:2),.5,{emf:high?-1:1,l298:{p,channel:c.name,input:i,high},driver:p.id});
 }
}
export function l298BranchOn(b,volt,uf){
 if(!b.l298)return true;
 const {p,channel,input,high}=b.l298;
 const state=l298State(p,id=>volt.get(uf.find(id)),uf.find(`part:${p.id}:p2`)===uf.find('signal:GND'));
 return state.channels[channel].enabled&&state.channels[channel].inputs[input]===Number(high);
}
