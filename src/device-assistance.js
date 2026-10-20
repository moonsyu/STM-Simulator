import {exampleStatements} from './device-inline-example.js';
import {arrangeExampleOnBreadboards} from './example-breadboard.js';
import {remapGpioCalls} from './device-gpio-remap.js';
import {inlineStatements} from './c-inline.js';
import {showSurface} from './surfaces.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {registerSetup,REGISTER_HELPERS} from './device-register-setup.js';
import {managedChecksum,managedRegion,stripDeviceRegions,removeLegacyDeviceHooks,docsTag,docsRegions,installDeviceRegions,removeDeviceRegions,moduleNeeds,cutLoose} from './device-code-insertion.js';
import {recipeFor,primaryPart,expectedNets,wiringTopology,DEVICE_RECIPES} from './device-docs-data.js';
import {PINS,PIN_BY_ID,GPIO_PINS,boardPin,endpointInfo} from './pins.js';
import {terminalKeys,terminalLabel,attachments,assignAttachments} from './components.js';
import {defaultMcu,validateMcu,generateHal,ROUTES,irqForPin} from './mcu-config.js';
import {timerMax} from './timer-config.js';
import {SERIAL_IDS,serialHandle} from './serial-config.js';
import {validateProject} from './project.js';
import {compileHal} from './hal-source.js';
import {cFunctions,replaceIdentifiers,checksum} from './c-source-edit.js';
import {baremetalCards} from './device-baremetal.js';
const FILE='stm_device_docs.c',HEADER='stm_device_docs.h';
const partTerminal=(id,key)=>`part:${id}:${key}`;
function newId(p,prefix){const used=new Set([...p.components,...p.wires].map(o=>o.id));let i=1;while(used.has(prefix+i))i++;return prefix+i;}
function bindParts(p,sample,target,prior,report){
 const map={...prior?.parts},primary=primaryPart(sample,target.type);if(primary)map[primary.id]=target.id;
 const uf=wiringTopology(p),nets=expectedNets(sample),powerRoots=new Set(PINS.filter(pin=>!/^P[A-H]\d+$/.test(pin.signal)).map(pin=>uf.find(pin.id)));
 for(const template of sample.components){if(map[template.id]&&p.components.some(part=>part.id===map[template.id]&&part.type===template.type))continue;
  const peers=nets.filter(net=>net.some(id=>id.startsWith('part:'+template.id+':'))).flatMap(net=>net.filter(id=>id.startsWith('part:')&&map[id.split(':')[1]]).map(id=>partTerminal(map[id.split(':')[1]],id.split(':')[2])));
  // Reset discards example code ownership; recover unchanged wiring from its configured GPIO nets.
  const configuredPeers=nets.filter(net=>net.some(id=>id.startsWith('part:'+template.id+':'))).flatMap(net=>net.flatMap(id=>{
   const signal=PIN_BY_ID.get(id)?.signal,cfg=sample.mcu.pins[signal];if(!cfg)return [];
   // Labels are user-facing aliases, not circuit ownership. Recover the
   // compatible electrical connection even after a pin has been renamed.
   return Object.entries(p.mcu.pins).filter(([,c])=>c.function===cfg.function&&c.pull===cfg.pull).sort(([a],[b])=>Number(b===signal)-Number(a===signal)).map(([pin])=>boardPin(pin));
  }));
  const claimed=new Set((p.deviceDocs?.bindings||[]).filter(b=>b!==prior).flatMap(b=>Object.values(b.parts)));
  const matchesValue=part=>!['resistor','capacitor'].includes(part.type)||part.value===template.value||part.type==='resistor'&&['led','rgb','sevenseg','relay','lcd'].includes(target.type)&&part.value>=template.value&&part.value<=template.value*4;
  const candidate=p.components.find(part=>part.type===template.type&&!Object.values(map).includes(part.id)&&!claimed.has(part.id)&&matchesValue(part)&&terminalKeys(part).some(key=>{const root=uf.find(partTerminal(part.id,key));return !powerRoots.has(root)&&[...peers,...configuredPeers].some(peer=>uf.find(peer)===root);}));
  if(candidate){map[template.id]=candidate.id;report.reused++;continue;}
  const added=structuredClone(template);added.id=newId(p,'docsPart');added.name=template.name+' · Docs';delete added.attachA;delete added.attachB;delete added.attachments;
  const anchor=p.components.find(part=>part.id===target.id);if(anchor){added.x=anchor.x+210+report.addedParts%3*125;added.y=anchor.y+Math.floor(report.addedParts/3)*125;}
  if(target.type==='breadboard'){
   const mounted=Object.fromEntries(Object.entries(attachments(template)).map(([key,hole])=>[key,anchor?'breadboard:'+anchor.id+':'+hole:hole])),used=new Set(p.components.flatMap(part=>Object.values(attachments(part))));
   if(Object.keys(mounted).length===2&&Object.values(mounted).every(hole=>!used.has(hole))){const [a,b]=Object.values(mounted).map(hole=>endpointInfo(hole,p.components,p.surfaces));if(a&&b){added.x=(a.x+b.x)/2;added.y=(a.y+b.y)/2;added.span=Math.hypot(b.x-a.x,b.y-a.y);added.rotation=(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+360)%360;assignAttachments(added,mounted);}}
  }
  p.components.push(added);map[template.id]=added.id;report.addedParts++;
 }return map;
}
function allocatePins(p,sample,parts,prior){
 const config=structuredClone(p.mcu||defaultMcu()),map={},peripherals={},assigned=new Set(),owned=new Set(Object.values(prior?.pins||{})),uf=wiringTopology(p);
 const partIds=new Set(Object.values(parts)),otherTerminals=p.components.filter(c=>!partIds.has(c.id)&&c.type!=='breadboard').flatMap(c=>terminalKeys(c).map(key=>partTerminal(c.id,key)));
 const fixed=sample.ide?.native?.target==='arm'||/HAL_(CAN_Init|I2S_Init|RCC_MCOConfig)/.test(sample.code)||/HAL_GPIO_WritePin\(GPIO[A-H],\s*1U\s*<</.test(sample.code);
 const free=pin=>!assigned.has(pin)&&(!config.pins[pin]||config.pins[pin].function==='Reset'||owned.has(pin))&&!otherTerminals.some(id=>uf.find(id)===uf.find(boardPin(pin)));
 for(const [id,setting]of Object.entries(sample.mcu.peripherals)){
  const currentRoutes=Object.entries(config.pins).filter(([,v])=>v.function.startsWith(id+'_')),connectedOwned=pin=>p.components.filter(part=>partIds.has(part.id)).some(part=>terminalKeys(part).some(key=>uf.find(partTerminal(part.id,key))===uf.find(boardPin(pin))));
  const reusable=currentRoutes.length>0&&currentRoutes.every(([pin])=>connectedOwned(pin)&&!otherTerminals.some(term=>uf.find(term)===uf.find(boardPin(pin))))&&Object.entries(setting).every(([k,v])=>k==='prescaler'?(config.peripherals[id]?.prescaler===Math.max(0,Math.round((v+1)*config.timerClockHz/sample.mcu.timerClockHz)-1)):config.peripherals[id]?.[k]===v);
  let next=id;if(/^TIM/.test(id)&&!Object.values(prior?.peripherals||{}).includes(id)&&config.peripherals[id]?.enabled&&!reusable){next=['TIM2','TIM3','TIM4','TIM5'].find(t=>!config.peripherals[t]?.enabled&&setting.period<=timerMax(t)&&Object.entries(sample.mcu.pins).filter(([,v])=>v.function.startsWith(id+'_')).every(([,v])=>(ROUTES[t][v.function.split('_')[1]]||[]).some(free)));if(!next)throw new Error('이 예제에 사용할 빈 타이머/채널이 없습니다. Pinout에서 사용하지 않는 타이머를 비활성화하세요.');}
  if(SERIAL_IDS.includes(id)&&config.peripherals[id]?.enabled&&!reusable&&!prior?.peripherals[id]){next=SERIAL_IDS.find(serial=>!config.peripherals[serial]?.enabled&&Object.values(ROUTES[serial]).every(pins=>pins.some(free)));if(!next)throw new Error('사용 가능한 UART TX/RX 핀 조합이 없습니다.');}
  next=prior?.peripherals?.[id]||next;peripherals[id]=next;
  if(!/^TIM/.test(id)&&config.peripherals[next]?.enabled&&Object.entries(setting).some(([k,v])=>k!=='enabled'&&config.peripherals[next][k]!==undefined&&config.peripherals[next][k]!==v))throw new Error(next+'가 다른 통신 설정으로 사용 중입니다. 동일한 설정으로 맞춘 뒤 다시 적용하세요.');
  config.peripherals[next]={...setting};if(/^TIM/.test(id))config.peripherals[next].prescaler=Math.max(0,Math.round((setting.prescaler+1)*config.timerClockHz/sample.mcu.timerClockHz)-1);
 }
 // Alternate functions are allocated before general GPIO so their scarce routes stay available.
 const entries=Object.entries(sample.mcu.pins).sort((a,b)=>Number(a[1].function.startsWith('GPIO'))-Number(b[1].function.startsWith('GPIO')));
 for(const [old,cfg]of entries){const fn=cfg.function,periph=fn.split('_')[0],role=fn.slice(periph.length+1);let candidates;
  if(fn.startsWith('ADC1_'))candidates=Object.values(ROUTES.ADC1).flat();else if(ROUTES[periph])candidates=ROUTES[peripherals[periph]||periph][role];else candidates=GPIO_PINS.filter(pin=>!['PA13','PA14','PH0','PH1','PC14','PC15'].includes(pin));
  if(fixed)candidates=[old];
  const shared=ROUTES[periph]&&!['ADC1','TIM2','TIM3','TIM4','TIM5'].includes(periph)?Object.keys(config.pins).find(pin=>config.pins[pin].function===(peripherals[periph]||periph)+'_'+role):null;
  const expected=expectedNets(sample).find(net=>net.some(id=>PIN_BY_ID.get(id)?.signal===old))||[],contacts=expected.filter(id=>id.startsWith('part:')).map(id=>partTerminal(parts[id.split(':')[1]],id.split(':')[2]));
  const preferred=prior?.pins?.[old]||old,alreadyConnected=pin=>!assigned.has(pin)&&(config.pins[pin]?.function===fn||fn.startsWith('ADC1_')&&config.pins[pin]?.function.startsWith('ADC1_'))&&config.pins[pin]?.pull===cfg.pull&&!otherTerminals.some(id=>uf.find(id)===uf.find(boardPin(pin)))&&contacts.some(id=>uf.find(id)===uf.find(boardPin(pin)));
  const existingPins=candidates.filter(pin=>contacts.some(id=>uf.find(id)===uf.find(boardPin(pin))));
  let chosen=(!fixed&&shared)||[...(prior?[preferred]:[]),...existingPins,preferred,...candidates].find(pin=>candidates.includes(pin)&&(free(pin)||alreadyConnected(pin)));
  if(!chosen){const connected=candidates.find(pin=>!assigned.has(pin)&&config.pins[pin]?.function===fn&&!otherTerminals.some(id=>uf.find(id)===uf.find(boardPin(pin))));chosen=connected;}
  if(!chosen)throw new Error(old+'에 필요한 '+fn+'의 사용 가능한 핀이 없습니다.');
  if(fn==='GPIO_EXTI'&&Object.entries(config.pins).some(([name,c])=>name!==chosen&&c.function==='GPIO_EXTI'&&name.slice(2)===chosen.slice(2)))throw new Error(chosen+'의 EXTI 번호가 이미 사용 중입니다.');
  map[old]=chosen;assigned.add(chosen);const next={...cfg};if(fn.startsWith('ADC1_'))next.function='ADC1_'+Object.entries(ROUTES.ADC1).find(([,pins])=>pins.includes(chosen))[0];else if(peripherals[periph])next.function=peripherals[periph]+'_'+role;
  if(config.pins[chosen]?.label)next.label=config.pins[chosen].label;
  const labels=new Set(Object.entries(config.pins).filter(([pin])=>pin!==chosen).map(([,p])=>p.label));
  if(next.label&&labels.has(next.label)){const base=next.label.slice(0,28)+'_'+chosen;next.label=base;let suffix=2;while(labels.has(next.label))next.label=base+'_'+suffix++;}
  config.pins[chosen]=next;if(fn==='GPIO_EXTI')config.nvic[irqForPin(chosen)]={enabled:true,priority:0};
 }
 for(const [irq,value]of Object.entries(sample.mcu.nvic))if(!irq.startsWith('EXTI'))config.nvic[(peripherals[irq.replace('_IRQn','')]||irq.replace('_IRQn',''))+'_IRQn']=value;
 return {pins:map,peripherals,config:validateMcu(config)};
}
function repairWiring(p,sample,parts,pins,report){
 const convert=id=>{if(PIN_BY_ID.has(id)){const name=PIN_BY_ID.get(id).signal;return boardPin(pins[name]||name);}const [,part,key]=id.split(':');return partTerminal(parts[part],key);};
 const groups=expectedNets(sample).map(net=>[...new Set(net.map(convert))]),desired=new Map();groups.forEach((net,i)=>net.forEach(id=>desired.set(id,i)));
 const owned=new Set(Object.values(parts)),terminals=[...desired.keys()].filter(id=>id.startsWith('part:')),label=id=>{if(PIN_BY_ID.has(id))id=boardPin(PIN_BY_ID.get(id).signal==='AGND'?'GND':PIN_BY_ID.get(id).signal);return desired.get(id);};
 // First remove explicit wrong leads; a valid wire's ID and routing remain intact.
 p.wires=p.wires.filter(w=>{const a=label(w.from),b=label(w.to),touch=[w.from,w.to].some(id=>id.startsWith('part:')&&owned.has(id.split(':')[1]));if(touch&&a!==undefined&&b!==undefined&&a!==b){report.removedWires++;return false;}return true;});
 for(const id of terminals){let uf=wiringTopology(p),root=uf.find(id),want=desired.get(id);const wrongPin=PINS.some(pin=>/^(P[A-H]\d+|3V3|5V|GND|VDD|AVDD|IOREF|U5V)$/.test(pin.signal)&&uf.find(pin.id)===root&&label(pin.id)!==want),mixed=terminals.some(other=>uf.find(other)===root&&desired.get(other)!==want);
  if(!wrongPin&&!mixed)continue;
  const part=p.components.find(part=>part.id===id.split(':')[1]),key=id.split(':')[2],map=attachments(part);if(map[key]){delete map[key];assignAttachments(part,map);report.detached++;}
  p.wires=p.wires.filter(w=>{if(w.from===id||w.to===id){report.removedWires++;return false;}return true;});
 }
 for(const group of groups){const first=group[0];for(const next of group.slice(1)){const uf=wiringTopology(p);if(uf.find(first)===uf.find(next)){report.preserved++;continue;}p.wires.push({id:newId(p,'docsWire'),from:first,to:next,color:PIN_BY_ID.get(first)?.signal==='GND'?'#4e647b':'#23a68a'});report.addedWires++;}}
 let uf=wiringTopology(p);const conflict=()=>groups.some((group,i)=>groups.slice(i+1).some(other=>uf.find(group[0])===uf.find(other[0])));
 if(conflict()){
  // Construct a constrained spanning forest: a wire cannot merge two required signal nets.
  // Retain wire objects/waypoints verbatim; only the electrical shorting edges are removed.
  uf=wiringTopology({...p,wires:[]});const labels=new Map();
  groups.forEach((group,i)=>group.forEach(id=>{const root=uf.find(id);if(labels.has(root)&&labels.get(root)!==i)throw new Error('장착된 접점 두 개가 같은 빵판 버스에 있습니다. 부품을 다른 행으로 이동한 뒤 적용하세요.');labels.set(root,i);}));
  p.wires=p.wires.filter(w=>{const a=uf.find(w.from),b=uf.find(w.to),la=labels.get(a),lb=labels.get(b);if(a!==b&&la!==undefined&&lb!==undefined&&la!==lb){report.removedWires++;return false;}uf.join(a,b);const next=uf.find(a);if(la!==undefined||lb!==undefined)labels.set(next,la??lb);return true;});
  for(const group of groups)for(const next of group.slice(1))if(uf.find(group[0])!==uf.find(next)){p.wires.push({id:newId(p,'docsWire'),from:group[0],to:next,color:'#23a68a'});uf.join(group[0],next);report.addedWires++;}
 }
}
export function remapCode(text,binding,sample){
 const placeholders=[];text=remapGpioCalls(text,binding.pins,call=>{const id='DOCS_GPIO_PAIR_'+placeholders.length;placeholders.push(call);return id;});
 const names={};for(const [old,next]of Object.entries(binding.peripherals)){names[old]=next;names[SERIAL_IDS.includes(old)?serialHandle(old):'h'+old.toLowerCase()]=SERIAL_IDS.includes(next)?serialHandle(next):'h'+next.toLowerCase();names[old+'_IRQn']=next+'_IRQn';}
 for(const [old,next]of Object.entries(binding.pins)){const fn=sample.mcu.pins[old].function;if(fn==='GPIO_EXTI')names['GPIO_PIN_'+Number(old.slice(2))]='GPIO_PIN_'+Number(next.slice(2));if(fn.startsWith('ADC1_'))names['ADC_CHANNEL_'+fn.slice(7)]='ADC_CHANNEL_'+Object.entries(ROUTES.ADC1).find(([,pins])=>pins.includes(next))[0].slice(2);}
 text=replaceIdentifiers(text,names);return text.replace(/DOCS_GPIO_PAIR_(\d+)/g,(_,i)=>placeholders[i]);
}
const slotOf=(project,binding)=>binding.slot??project.deviceDocs.bindings.indexOf(binding);
function ownConfig(project,binding){
 const pins=Object.fromEntries(Object.values(binding.pins).filter(pin=>project.mcu.pins[pin]).map(pin=>[pin,structuredClone(project.mcu.pins[pin])]));
 const peripherals=Object.fromEntries(Object.values(binding.peripherals).filter(id=>project.mcu.peripherals[id]).map(id=>[id,structuredClone(project.mcu.peripherals[id])]));
 const exti=new Set(Object.entries(pins).filter(([,c])=>c.function==='GPIO_EXTI').map(([pin])=>irqForPin(pin)));
 const nvic=Object.fromEntries(Object.entries(project.mcu.nvic||{}).filter(([irq])=>exti.has(irq)||Object.keys(peripherals).some(id=>irq.startsWith(id+'_'))));
 const {dma,...rest}=structuredClone(project.mcu);return {...rest,pins,peripherals,nvic};
}
function bindingSample(binding,project){
 const sample=recipeFor(binding.type),template=primaryPart(sample,binding.type),selected=project.components.find(p=>p.id===binding.parts[template?.id]);
 if(template?.address!==undefined&&selected?.address!==undefined&&template.address!==selected.address)sample.code=sample.code.replace(new RegExp('0x'+template.address.toString(16)+'(?=\\s*<<\\s*1)','gi'),'0x'+selected.address.toString(16));
 if(template?.address!==undefined&&selected?.address!==undefined)template.address=selected.address;
 return sample;
}
const registerExpand=prefix=>text=>!/\bBM_\w+\s*\(/.test(text)?text.replace(/__IO\s+/g,'volatile '):inlineStatements(text.replace(/__IO\s+/g,'volatile '),REGISTER_HELPERS.replace(/__IO\s+/g,'volatile '),prefix);
function registerCards(config,binding,sample){
 const cards=baremetalCards(config,binding.type,sample),chosen=binding.api==='all'?cards:cards.filter(c=>c.id===binding.api);
 if(!chosen.length)throw new Error('해당 장치에서 사용할 수 없는 레지스터 예제입니다.');return chosen;
}
// The code one device contributes: user-facing statements for main and its CubeMX-style init pieces.
export function deviceModule(binding,project,slot=slotOf(project,binding)){
 const sample=bindingSample(binding,project),prefix='STM_D'+slot+'_',config=ownConfig(project,binding);
 if(binding.mode==='baremetal'){
  const expand=registerExpand(prefix),chosen=registerCards(config,binding,sample),setup=c=>registerSetup(c).split('\n').filter(line=>line!=='SystemCoreClockUpdate();').join('\n');
  const functions=Object.entries(config.peripherals).filter(([,s])=>s.enabled).map(([id,s])=>({name:'MX_'+id+'_Init',body:setup({...config,pins:{},peripherals:{[id]:s}})})).filter(f=>f.body.trim()).map(f=>({...f,body:expand(f.body)}));
  const step=chosen.length===1?chosen[0].code:chosen.map(c=>'{\n'+c.code+'\n}').join('\n');
  const gpio=setup({...config,peripherals:{}});
  return {declarations:'',init:'SystemCoreClockUpdate();',step:expand(step+'\nBM_delay(100);'),gpio:gpio.trim()?expand(gpio):'',functions,handles:[]};
 }
 const parsed=compileHal(sample.code),decls=parsed.globals.flatMap(g=>g.declarations),sampleHandles=decls.filter(d=>d.type.endsWith('_HandleTypeDef')),names={};
 for(const g of decls)if(!sampleHandles.some(h=>h.name===g.name))names[g.name]=prefix+g.name;
 const example=exampleStatements(sample,binding.api,prefix),map=text=>remapCode(replaceIdentifiers(text,names),binding,sample);
 const adc=Object.keys(config.pins).find(pin=>config.pins[pin].function.startsWith('ADC1_')),channel=adc?config.pins[adc].function.slice(7):null;
 const adcSelect=adc?`ADC_ChannelConfTypeDef docsChannel = {0}; docsChannel.Channel = ADC_CHANNEL_${channel}; docsChannel.Rank = 1; docsChannel.SamplingTime = ADC_SAMPLETIME_3CYCLES; HAL_ADC_ConfigChannel(&hadc1, &docsChannel);\n`:'';
 const generated=Object.keys(config.pins).length||Object.keys(config.peripherals).length?generateHal(config):'',fns=cFunctions(generated);
 const handles=new Map();for(const m of generated.matchAll(/^(\w+_HandleTypeDef)\s+(\w+)\s*;/gm))handles.set(m[2],{type:m[1],name:m[2]});
 for(const h of sampleHandles){const name=remapCode(h.name,binding,sample);if(!handles.has(name))handles.set(name,{type:h.type,name});}
 return {declarations:map(example.globals),init:map(example.init),step:adcSelect+map(example.step),gpio:fns.find(f=>f.name==='MX_GPIO_Init')?.body||'',
  functions:fns.filter(f=>/^MX_\w+_Init$/.test(f.name)&&f.name!=='MX_GPIO_Init').map(f=>({name:f.name,body:f.body})),handles:[...handles.values()]};
}
const othersOf=(project,binding)=>()=>project.deviceDocs.bindings.filter(b=>b!==binding).map(b=>{try{return {tag:docsTag(b),needs:moduleNeeds(deviceModule(b,project))};}catch{return {tag:docsTag(b),needs:new Set()};}});
function installBinding(project,binding){project.code=installDeviceRegions(project.code,docsTag(binding),deviceModule(binding,project),othersOf(project,binding));}
// ---- Code written by versions before per-device markers ----
const legacyNames=code=>[...new Set([...code.matchAll(/\/\* STM DEVICE DOCS (\w+) (?:BEGIN|END) \*\//g)].map(m=>m[1]))];
function legacyTexts(binding,project,slot){
 const m=deviceModule(binding,project,slot),texts=[];
 if(binding.mode==='baremetal'){const sample=bindingSample(binding,project),config=ownConfig(project,binding),expand=registerExpand('STM_D'+slot+'_'),card=registerCards(config,binding,sample)[0];texts.push(['INIT','{\n'+expand(registerSetup(config))+'\n}'],['LOOP','{\n'+expand(card.code+'\nBM_delay(100);')+'\n}']);}
 else texts.push(['DECL',m.declarations],['INIT','{\n'+m.init+'\n}'],['LOOP','{\n'+m.step+'\n}']);
 // GPIO setup was generated for all devices together; remove this device's per-pin blocks.
 for(const [pin,c]of Object.entries(ownConfig(project,binding).pins)){try{const body=cFunctions(generateHal({...ownConfig(project,binding),pins:{[pin]:c},peripherals:{},nvic:{}})).find(f=>f.name==='MX_GPIO_Init')?.body||'';texts.push(['MX_GPIO_Init '+pin,body.replace(/^\s*GPIO_InitTypeDef[^\n]*\n/m,'').replace(/^\s*__HAL_RCC_GPIO\w_CLK_ENABLE\(\);\s*$/gm,'')]);}catch{}}
 return texts.filter(([,t])=>t.replace(/[{}\s]/g,''));
}
function removeLegacyCode(project,binding,report){
 let code=project.code;const slot=slotOf(project,binding);
 for(const [label,text]of legacyTexts(binding,project,slot)){const next=cutLoose(code,text);if(next===null)report.missing.push(label+': 이전 버전 코드와 일치하는 부분을 찾지 못했습니다');else{code=next;report.removed++;}}
 for(const name of legacyNames(code)){try{const r=managedRegion(code,name),inner=r&&r.text.slice(r.text.indexOf('*/')+2,r.text.lastIndexOf('/*'));if(r&&!inner.replace(/[{}\s;]/g,'')){const start=code[r.start-1]==='\n'?r.start-1:r.start;code=code.slice(0,start)+code.slice(r.end);}}catch{}}
 project.code=code;report.legacy=true;
}
// Unedited regions written by 0.23–0.26.0 are converted to per-device markers.
function migrateLegacy(project,skip){
 if(!legacyNames(project.code).length)return false;
 const docs=project.deviceDocs;if(!docs.inlineChecksum||managedChecksum(project.code)!==docs.inlineChecksum)return false;
 project.code=stripDeviceRegions(project.code);delete docs.inlineChecksum;
 for(const b of docs.bindings)if(b!==skip)installBinding(project,b);
 return true;
}
function cleanOldFiles(project){
 const managed=project.firmware.files.find(f=>f.name===FILE),header=project.firmware.files.find(f=>f.name===HEADER);
 if(managed&&(!project.deviceDocs.checksum||checksum(managed.text)!==project.deviceDocs.checksum)||header&&(!project.deviceDocs.headerChecksum||checksum(header.text)!==project.deviceDocs.headerChecksum))throw new Error('stm_device_docs 파일이 직접 수정되어 있습니다. 수정 내용을 다른 소스 파일로 옮긴 뒤 Docs 파일을 삭제하면 새로 생성할 수 있습니다.');
 project.code=removeLegacyDeviceHooks(project.code).replace(/(\/\* USER CODE BEGIN 3 \*\/)\s*HAL_Delay\(500\);([ \t]*\r?\n[ \t]*)(\/\* USER CODE END 3 \*\/)/,'$1$2$3').replace(/^\s*#include\s+"stm_device_docs.h"\s*$/gm,'').replace(/\bSTM_Devices_(?:Init|Step)\(\);/g,'');
 project.firmware={mode:'hal',files:project.firmware.files.filter(f=>f.name!==FILE&&f.name!==HEADER).map(f=>({...f,text:removeLegacyDeviceHooks(f.text)}))};
 delete project.deviceDocs.checksum;delete project.deviceDocs.headerChecksum;
}
const needsArm=b=>b.mode==='baremetal'||recipeFor(b.type).ide?.native?.target==='arm';
function updateTarget(project,original){
 const hasBare=project.deviceDocs.bindings.some(needsArm);
 if(hasBare){project.ide??={breakpoints:[],watches:[]};project.ide.native={target:'arm',configuration:project.ide.native?.configuration||'Debug'};}
 else if(original.deviceDocs?.bindings.some(needsArm)&&project.ide?.native?.target==='arm')project.ide.native.target='simulator';
 return hasBare;
}
function bindingKey(project,target){
 const component=target?.type==='part'?project.components.find(p=>p.id===target.id):null;
 return component?.id||(target?.id==='board'?'surface_board':target?.id==='breadboard'?'surface_breadboard':null);
}
export function appliedDeviceExample(project,target){const key=bindingKey(project,target);return project.deviceDocs?.bindings.find(b=>b.key===key)||null;}
export function applyDeviceExample(original,target,options={}){
 if(options.action==='remove')return removeDeviceExample(original,target,options);
 const {api='all',mode='hal'}=options;
 const project=structuredClone(original),report={addedParts:0,reused:0,addedWires:0,removedWires:0,detached:0,preserved:0,warnings:[]};
 if(project.firmware?.mode!=='hal')throw new Error('현재 프로젝트를 STM32 HAL 실행 환경으로 전환한 뒤 적용하세요.');
 const component=target.type==='part'?project.components.find(p=>p.id===target.id):null,type=component?.type||(target.id==='board'?'board':target.id==='breadboard'?'breadboard':null);if(!type||!DEVICE_RECIPES[type])throw new Error('장치 또는 보드/빵판을 먼저 선택하세요.');
 if(!['hal','baremetal'].includes(mode))throw new Error('예제 모드를 확인하세요.');
 showSurface(project,'board');
 const sample=recipeFor(type);if(sample.mcu.timerClockHz!==project.mcu.timerClockHz&&/^ref_rgb_(neopixel|gravity)/.test(type)){if(Object.keys(project.mcu.pins).length||project.deviceDocs?.bindings.length)throw new Error('이 장치의 비트 타이밍에는 '+sample.mcu.timerClockHz+' Hz 클록이 필요합니다. Pinout의 클록을 맞춰 주세요.');project.mcu.timerClockHz=sample.mcu.timerClockHz;project.code=project.code.replace(cFunctions(project.code).find(f=>f.name==='SystemClock_Config')?.text||'__no_clock__',cFunctions(generateHal(project.mcu)).find(f=>f.name==='SystemClock_Config')?.text||'');}
 const busPin=(p,label)=>partTerminal(p.id,terminalKeys(p).find(k=>terminalLabel(p,k)===label));
 const key=component?.id||'surface_'+type;project.deviceDocs??={bindings:[]};
 if(['uart','rs485'].includes(CATALOG_BY_TYPE[type]?.family||type)&&component?.baud)sample.mcu.peripherals.USART2.baud=component.baud;
 cleanOldFiles(project);
 project.deviceDocs.bindings.forEach((b,i)=>{b.slot??=i;});
 const prior=project.deviceDocs.bindings.find(b=>b.key===key);
 const beforeParts=new Set(project.components.map(p=>p.id)),beforeWires=new Set(project.wires.map(w=>w.id)),beforeMcu=structuredClone(project.mcu);
 const parts=bindParts(project,sample,{id:component?.id,type},prior,report),allocation=allocatePins(project,sample,parts,prior);
 repairWiring(project,sample,parts,allocation.pins,report);project.mcu=allocation.config;
 arrangeExampleOnBreadboards(project,{partIds:Object.values(parts),preferredBoard:type==='breadboard'?component?.id:undefined,report});
 if(component?.address!==undefined){const net=wiringTopology(project);if(project.components.some(other=>other.id!==component.id&&other.address===component.address&&net.find(busPin(other,'SDA'))===net.find(busPin(component,'SDA'))))throw new Error('같은 I2C 버스에 주소 0x'+component.address.toString(16)+' 장치가 이미 있습니다. 장치 속성에서 지원하는 다른 주소를 선택하세요.');}
 if(mode==='hal'&&api!=='all'&&!sample.code.includes(api+'('))throw new Error('이 장치의 HAL 함수 목록에서 적용할 함수를 선택하세요.');
 // Remember what Docs itself added so that removal restores only that.
 const was=prior?.added,keepIds=(list,ids)=>(list||[]).filter(id=>ids.has(id));
 const ids=new Set(project.components.map(p=>p.id)),wireIds=new Set(project.wires.map(w=>w.id));
 const newParts=project.components.filter(p=>!beforeParts.has(p.id)),pins=Object.values(allocation.pins),periph=Object.values(allocation.peripherals);
 const priorPins=was?.pins??Object.values(prior?.pins||{}),priorPeriph=was?.peripherals??Object.values(prior?.peripherals||{});
 const added={pins:[...new Set(pins.filter(pin=>!beforeMcu.pins[pin]||beforeMcu.pins[pin].function==='Reset'||priorPins.includes(pin)))],
  peripherals:[...new Set(periph.filter(id=>!beforeMcu.peripherals[id]?.enabled||priorPeriph.includes(id)))],
  nvic:[...new Set(Object.keys(project.mcu.nvic).filter(irq=>!beforeMcu.nvic[irq]||(was?.nvic||[]).includes(irq)))],
  parts:[...new Set([...keepIds(was?.parts,ids),...newParts.filter(p=>p.type!=='breadboard').map(p=>p.id)])].filter(id=>id!==component?.id),
  boards:[...new Set([...keepIds(was?.boards,ids),...newParts.filter(p=>p.type==='breadboard').map(p=>p.id)])],
  wires:[...new Set([...keepIds(was?.wires,wireIds),...project.wires.filter(w=>!beforeWires.has(w.id)).map(w=>w.id)])]};
 const used=new Set(project.deviceDocs.bindings.filter(b=>b!==prior).map(b=>b.slot));let slot=prior?.slot??0;if(!prior)while(used.has(slot))slot++;
 const binding={key,type,parts,pins:allocation.pins,peripherals:allocation.peripherals,api,mode,slot,added};
 if(prior)project.deviceDocs.bindings[project.deviceDocs.bindings.indexOf(prior)]=binding;else project.deviceDocs.bindings.push(binding);
 project.simulation={stepMs:Math.min(project.simulation?.stepMs||1,sample.simulation?.stepMs||1),pwmWaveform:!!(project.simulation?.pwmWaveform||sample.simulation?.pwmWaveform)};
 const tag=docsTag(binding);
 if(!migrateLegacy(project,binding)&&prior&&!docsRegions(project.code).regions.some(r=>r.tag===tag)&&!docsRegions(project.code).broken.some(r=>r.tag===tag)){
  // Re-applying an example inserted by an older version: take out its old code first.
  const legacy={removed:0,missing:[]};removeLegacyCode(project,{...prior,slot},legacy);
  if(legacy.missing.length&&legacy.removed)report.warnings.push(...legacy.missing);
 }
 installBinding(project,binding);
 const hasBare=updateTarget(project,original);
 const validated=validateProject(project);if(!hasBare)compileHal(validated.code,validated.firmware.files);return {project:validated,report,binding,file:'main.c'};
}
// Keeps a removed device's wires when another applied example still depends on them.
function bindingGroups(project,b){
 const sample=recipeFor(b.type),convert=id=>{if(PIN_BY_ID.has(id)){const name=PIN_BY_ID.get(id).signal;return boardPin(b.pins[name]||name);}const [,part,key]=id.split(':');return b.parts[part]?partTerminal(b.parts[part],key):null;};
 return expectedNets(sample).map(net=>[...new Set(net.map(convert).filter(Boolean))]).filter(g=>g.length>1&&g.every(id=>!id.startsWith('part:')||project.components.some(p=>p.id===id.split(':')[1])));
}
function removeCircuit(project,binding,report){
 const remaining=project.deviceDocs.bindings,claimed=new Set(remaining.flatMap(b=>Object.values(b.parts)));
 const legacyParts=Object.values(binding.parts).filter(id=>id!==binding.key&&/^docsPart\d+$/.test(id));
 const parts=new Set((binding.added?.parts??legacyParts).filter(id=>id!==binding.key&&!claimed.has(id)&&project.components.some(p=>p.id===id&&p.type!=='breadboard')));
 const touches=w=>[w.from,w.to].some(id=>id.startsWith('part:')&&parts.has(id.split(':')[1]));
 const own=new Set(binding.added?.wires||[]),candidates=project.wires.filter(w=>own.has(w.id)&&!touches(w));
 const before=project.wires.length;project.components=project.components.filter(p=>!parts.has(p.id));project.wires=project.wires.filter(w=>!touches(w)&&!own.has(w.id));
 const groups=remaining.flatMap(b=>bindingGroups(project,b)),broken=()=>{const uf=wiringTopology(project);return groups.some(g=>g.some(id=>uf.find(id)!==uf.find(g[0])));};
 for(const w of candidates){if(!broken())break;project.wires.push(w);if(!broken())break;}
 // Re-check: drop restored wires that turned out unnecessary.
 for(const w of candidates){const i=project.wires.indexOf(w);if(i<0)continue;project.wires.splice(i,1);if(broken())project.wires.splice(i,0,w);}
 report.removedParts=parts.size;report.removedWires=before-project.wires.length;
 const heir=remaining.find(b=>b.added),inherit=(kind,id)=>{if(heir&&!heir.added[kind].includes(id))heir.added[kind].push(id);};
 for(const w of candidates)if(project.wires.includes(w))inherit('wires',w.id);
 for(const id of binding.added?.boards||[]){const prefix='breadboard:'+id+':';if(!project.components.some(p=>p.id===id))continue;
  const busy=project.components.some(p=>Object.values(attachments(p)).some(h=>String(h).startsWith(prefix)))||project.wires.some(w=>[w.from,w.to].some(e=>e.startsWith(prefix)));
  if(!busy){project.components=project.components.filter(p=>p.id!==id);report.removedBoards++;}else inherit('boards',id);}
}
function restoreConfig(project,binding,report){
 const remaining=project.deviceDocs.bindings,pinsUsed=new Set(remaining.flatMap(b=>Object.values(b.pins))),periphUsed=new Set(remaining.flatMap(b=>Object.values(b.peripherals)));
 const config=project.mcu,inherit=(kind,value,uses)=>{const heir=remaining.find(uses);if(heir?.added&&!heir.added[kind].includes(value))heir.added[kind].push(value);};
 // A shared pin/peripheral stays while another example uses it; that example then owns its restoration.
 for(const pin of binding.added?.pins??Object.values(binding.pins)){if(pinsUsed.has(pin))inherit('pins',pin,b=>Object.values(b.pins).includes(pin));else if(config.pins[pin]){delete config.pins[pin];report.restoredPins++;}}
 for(const id of binding.added?.peripherals??Object.values(binding.peripherals)){if(periphUsed.has(id))inherit('peripherals',id,b=>Object.values(b.peripherals).includes(id));else if(config.peripherals[id]){delete config.peripherals[id];report.restoredPeripherals++;}}
 for(const irq of binding.added?.nvic||[])if(config.nvic[irq])inherit('nvic',irq,b=>Object.values(b.peripherals).some(id=>irq.startsWith(id+'_'))||Object.values(b.pins).some(pin=>config.pins[pin]?.function==='GPIO_EXTI'&&irqForPin(pin)===irq));
 const needed=new Set([...Object.entries(config.pins).filter(([,c])=>c.function==='GPIO_EXTI').map(([pin])=>irqForPin(pin))]);
 for(const irq of binding.added?.nvic??Object.keys(config.nvic).filter(irq=>irq.startsWith('EXTI')||Object.values(binding.peripherals).some(id=>irq.startsWith(id+'_'))))
  if(config.nvic[irq]&&!needed.has(irq)&&!Object.keys(config.peripherals).some(id=>config.peripherals[id].enabled&&irq.startsWith(id+'_')))delete config.nvic[irq];
}
// Removes the code Docs inserted for one device (and optionally the parts/wires it added).
export function removeDeviceExample(original,target,{circuit=false}={}){
 const project=structuredClone(original),report={removed:0,retagged:0,missing:[],legacy:false,restoredPins:0,restoredPeripherals:0,removedParts:0,removedWires:0,removedBoards:0,warnings:[]};
 const key=bindingKey(project,target),binding=project.deviceDocs?.bindings.find(b=>b.key===key);
 if(!binding)throw new Error('이 장치에 적용된 Docs 예제가 없습니다.');
 project.deviceDocs.bindings.forEach((b,i)=>{b.slot??=i;});
 const tag=docsTag(binding),hadRegions=docsRegions(project.code).regions.some(r=>r.tag===tag);
 if(migrateLegacy(project,binding))report.legacy=true;
 else{
  const out=removeDeviceRegions(project.code,tag,othersOf(project,binding));project.code=out.source;Object.assign(report,{removed:out.report.removed,retagged:out.report.retagged,missing:out.report.missing});
  if(!hadRegions&&!out.report.missing.length)removeLegacyCode(project,binding,report);
 }
 project.deviceDocs.bindings=project.deviceDocs.bindings.filter(b=>b!==binding);
 if(!legacyNames(project.code).length)delete project.deviceDocs.inlineChecksum;
 restoreConfig(project,binding,report);
 if(circuit)removeCircuit(project,binding,report);
 const hasBare=updateTarget(project,original),validated=validateProject(project);
 if(!hasBare)try{compileHal(validated.code,validated.firmware.files);}catch(error){report.warnings.push('제거 후 main.c 확인 필요: '+error.message);}
 return {project:validated,report,binding,file:'main.c',action:'remove'};
}
