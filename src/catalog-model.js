import {catalogTies} from './catalog-topology.js';
import {attachments as contacts,assignAttachments,terminalKeys} from './components.js';
import {CATALOG_BY_TYPE,catalogMap} from './catalog-defs.js';
export const CUSTOM_MODELS={
 'can-transceiver-6':['catalog_can',0,[1,2,3,4,5,6]],'max98357a-9':['catalog_i2s',0,[1,2,3,4,5,6,7,8,9]],'ov2640-camera':['catalog_i2c',0x30,[1,2,4,3,17,18,8]],
 'ds18b20-to92-3':['catalog_singlewire',0,[3,1,2]],'ds18b20-probe-3':['catalog_singlewire',0,[1,2,3]],'dht11-module-3':['catalog_singlewire',0,[1,2,3]],'dht22-module-3':['catalog_singlewire',0,[1,2,3]],'urm09-trig-3':['catalog_singlewire',0,[2,1,3]],
 'lcd-i2c-4':['catalog_i2c',0x3e,[1,2,4,3]],'ads1115-10':['catalog_i2c',0x48,[1,2,4,3,7,8,9,10,5,6]],
 'mcp4725-6':['catalog_i2c',0x62,[1,2,4,3,6,5]],'ds3231-8':['catalog_i2c',0x68,[1,2,4,3,5,6,7,8]],
 'urm09-i2c-4':['catalog_i2c',0x11,[1,2,3,4]],'motor-driver-hat':['catalog_i2c',0x40,[2,3,4,5,6,7,8,9,10]],
 'oled-configurable-7':['catalog_spi',0,[1,2,5,4,3,6,7]],'oled-configurable-8':['catalog_spi',0,[3,1,8,4,5,7,6]],
 'sd-storage-board':['catalog_spi',0,[1,8,5,7,6,2,9]],
 'rgb-neopixel-4':['catalog_spi',0,[1,2,4,4,3]],'rgb-neopixel-flora-4':['catalog_spi',0,[1,2,4,4,3]],'rgb-gravity-3':['catalog_spi',0,[1,2,3,3,3]],
 'ldr-module-3':['catalog_analog',0,[2,3,1]],'ntc-module-3':['catalog_analog',0,[2,3,1]],'ldr-comparator-4':['catalog_analog',0,[1,2,3,4]],
 'slide-dpdt-6':['catalog_switch',0,[1,2,3,4,5,6]],'slide-dp3t-8':['catalog_switch',0,[1,2,3,4,5,6,7,8]],
 'sevenseg-tm1637-4':['catalog_tm1637',0,[1,2,3,4]],
 'sevenseg-4digit-12':['catalog_digits',0,[13,9,4,2,1,12,5,3,14,11,10,6,7,8]],
 'stepper-bipolar-4':['catalog_stepper',0,[1,2,3,4]],'stepper-unipolar-5':['catalog_stepper',0,[1,2,3,4,5]],
 'stepper-driver-11':['catalog_uln',0,Array.from({length:11},(_,i)=>i+1)],'isolated-rs485':['uart',0,[4,3,2,1]],
 'encoder-bare-5':['catalog_encoder',0,[1,2,3,4,5]]
};
export function physicalToModel(project){
 if(project.catalogModel||!project.components.some(p=>CATALOG_BY_TYPE[p.type]))return project;
 const replacements=new Map(),components=[],ties=[];
 for(const p of project.components){const v=CATALOG_BY_TYPE[p.type],custom=CUSTOM_MODELS[v?.id],map=catalogMap(p.type)||custom&&Object.fromEntries(custom[2].map((n,i)=>['p'+(i+1),'p'+n]));if(!v||!map){components.push(p);continue;}
  const inverse={};for(const [model,physical]of Object.entries(map)){if(inverse[physical])ties.push([`part:${p.id}:${model}`,`part:${p.id}:${inverse[physical]}`]);else inverse[physical]=model;}
  for(let n=1;n<=v.pins.length;n++)replacements.set(`part:${p.id}:p${n}`,`part:${p.id}:${inverse['p'+n]||'extra'+n}`);
  const model={...p};for(const key of Object.keys(p))if(['value','color','lux','temperature','humidity','position','switch','motion','axisX','axisY','ax','ay','az','gx','gy','gz','baud','distance','voltage','pattern','image'].includes(key))Object.defineProperty(model,key,{enumerable:true,get:()=>p[key]});Object.assign(model,{type:custom?.[0]||v.family,catalogVariant:v.id,commonAnode:v.id.includes('common-anode'),catalogState:{}});
  if(custom){model.address=custom[1];model.electricalPins=custom[2].map((_,i)=>'p'+(i+1));model.catalogState={};}
  const attachments={};for(const [physical,hole]of Object.entries(contacts(p))){if(inverse[physical])attachments[inverse[physical]]=hole;else ties.push([`part:${p.id}:extra${physical.slice(1)}`,hole]);}
  // A two-contact physical switch still maps to the four-leg button model.
  // Use the model's storage convention, not the physical contact map's names.
  assignAttachments(model,attachments);if(Object.hasOwn(map,'a'))model.span=p.span??70;
  // A physical pin the legacy model has no terminal for (servo position-feedback p4) still joins its hole.
  const keys=terminalKeys(model),extra=Object.keys(attachments).filter(k=>!keys.includes(k));if(extra.length)model.electricalPins=[...keys,...extra];
  components.push(model);
 }
 const convert=id=>replacements.get(id)||id;
 const result={...project,components,get wires(){return project.wires.map(w=>({...w,from:convert(w.from),to:convert(w.to)}));},get catalogTies(){return [...ties,...project.components.flatMap(catalogTies).map(pair=>pair.map(convert))];},catalogModel:true,physicalEndpoint:convert};
 return result;
}
export function physicalTopology(uf,project){return !project.physicalEndpoint?uf:{find:id=>uf.find(project.physicalEndpoint(id)),join:(a,b)=>uf.join(project.physicalEndpoint(a),project.physicalEndpoint(b))};}
export function physicalResult(result,project){if(!project.physicalEndpoint||!result)return result;return {...result,uf:physicalTopology(result.uf,project),voltage:id=>result.voltage(project.physicalEndpoint(id))};}
