import {CATALOG_BY_TYPE} from './catalog-defs.js';
export function catalogTies(p){
 const v=CATALOG_BY_TYPE[p.type];if(!v)return [];
 let pairs=({'button-4':[[1,3],[2,4]],'matrix-10':[[1,6],[2,7],[4,9],[5,10]],'l298p-bare-20':[[1,10],[1,11],[1,20]],'sevenseg-common-cathode-10':[[3,8]],'sevenseg-common-anode-10':[[3,8]],'stepper-driver-11':[[5,7]]})[v.id]||[];
 if(v.id==='motor-driver-hat'){pairs=[[3,11]];v.pins.slice(11).forEach((label,i)=>{const signal=label.split(':')[1],n=v.pins.indexOf(signal)+1;if(n>0)pairs.push([n,i+12]);});}
 return pairs.map(pair=>pair.map(n=>`part:${p.id}:p${n}`));
}
