import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {registerSetup,REGISTER_HELPERS} from './device-register-setup.js';
import {insertDeviceCode,managedChecksum,managedRegion,stripDeviceRegions,selectOperation} from './device-code-insertion.js';
import {recipeFor,primaryPart,expectedNets,wiringTopology,DEVICE_RECIPES} from './device-docs-data.js';
import {PINS,PIN_BY_ID,GPIO_PINS,boardPin,endpointInfo} from './pins.js';
import {terminalKeys,terminalLabel,attachments,assignAttachments} from './components.js';
import {defaultMcu,validateMcu,generateHal,ROUTES,irqForPin} from './mcu-config.js';
import {timerMax} from './timer-config.js';
import {SERIAL_IDS,serialHandle} from './serial-config.js';
import {validateProject} from './project.js';
import {compileHal} from './hal-source.js';
import {cFunctions,replaceIdentifiers,insertMainHooks,checksum} from './c-source-edit.js';
import {baremetalCards} from './device-baremetal.js';
const FILE='stm_device_docs.c',HEADER='stm_device_docs.h';
const partTerminal=(id,key)=>`part:${id}:${key}`;
const sourceText=p=>[stripDeviceRegions(p.code),...(p.firmware?.files||[]).filter(f=>f.name!==FILE&&f.name!==HEADER).map(f=>f.text)].join('\n');
function newId(p,prefix){const used=new Set([...p.components,...p.wires].map(o=>o.id));let i=1;while(used.has(prefix+i))i++;return prefix+i;}
function bindParts(p,sample,target,prior,report){
 const map={...prior?.parts},primary=primaryPart(sample,target.type);if(primary)map[primary.id]=target.id;
 const uf=wiringTopology(p),nets=expectedNets(sample),powerRoots=new Set(PINS.filter(pin=>!/^P[A-H]\d+$/.test(pin.signal)).map(pin=>uf.find(pin.id)));
 for(const template of sample.components){if(map[template.id]&&p.components.some(part=>part.id===map[template.id]&&part.type===template.type))continue;
  const peers=nets.filter(net=>net.some(id=>id.startsWith('part:'+template.id+':'))).flatMap(net=>net.filter(id=>id.startsWith('part:')&&map[id.split(':')[1]]).map(id=>partTerminal(map[id.split(':')[1]],id.split(':')[2])));
  const matchesValue=part=>!['resistor','capacitor'].includes(part.type)||part.value===template.value||part.type==='resistor'&&['led','rgb','sevenseg','relay','lcd'].includes(target.type)&&part.value>=template.value&&part.value<=template.value*4;
  const candidate=p.components.find(part=>part.type===template.type&&!Object.values(map).includes(part.id)&&matchesValue(part)&&terminalKeys(part).some(key=>{const root=uf.find(partTerminal(part.id,key));return !powerRoots.has(root)&&peers.some(peer=>uf.find(peer)===root);}));
  if(candidate){map[template.id]=candidate.id;report.reused++;continue;}
  const added=structuredClone(template);added.id=newId(p,'docsPart');added.name=template.name+' · Docs';delete added.attachA;delete added.attachB;delete added.attachments;
  const anchor=p.components.find(part=>part.id===target.id);if(anchor){added.x=Math.min(5800,anchor.x+210+report.addedParts%3*125);added.y=Math.min(5800,anchor.y+Math.floor(report.addedParts/3)*125);}
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
  map[old]=chosen;assigned.add(chosen);const next={...cfg};if(fn.startsWith('ADC1_'))next.function='ADC1_'+Object.entries(ROUTES.ADC1).find(([,pins])=>pins.includes(chosen))[0];else if(peripherals[periph])next.function=peripherals[periph]+'_'+role;config.pins[chosen]=next;if(fn==='GPIO_EXTI')config.nvic[irqForPin(chosen)]={enabled:true,priority:0};
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
function remapCode(text,binding,sample){
 const placeholders=[];text=text.replace(/GPIO([A-H])\s*,\s*GPIO_PIN_(\d+)/g,(whole,port,n)=>{const pin=binding.pins['P'+port+n];if(!pin)return whole;const id='DOCS_GPIO_PAIR_'+placeholders.length;placeholders.push(`GPIO${pin[1]}, GPIO_PIN_${Number(pin.slice(2))}`);return id;});
 const names={};for(const [old,next]of Object.entries(binding.peripherals)){names[old]=next;names[SERIAL_IDS.includes(old)?serialHandle(old):'h'+old.toLowerCase()]=SERIAL_IDS.includes(next)?serialHandle(next):'h'+next.toLowerCase();names[old+'_IRQn']=next+'_IRQn';}
 for(const [old,next]of Object.entries(binding.pins)){const fn=sample.mcu.pins[old].function;if(fn==='GPIO_EXTI')names['GPIO_PIN_'+Number(old.slice(2))]='GPIO_PIN_'+Number(next.slice(2));if(fn.startsWith('ADC1_'))names['ADC_CHANNEL_'+fn.slice(7)]='ADC_CHANNEL_'+Object.entries(ROUTES.ADC1).find(([,pins])=>pins.includes(next))[0].slice(2);}
 text=replaceIdentifiers(text,names);return text.replace(/DOCS_GPIO_PAIR_(\d+)/g,(_,i)=>placeholders[i]);
}
function deviceSource(binding,project,index){
 const sample=recipeFor(binding.type),template=primaryPart(sample,binding.type),selected=project.components.find(p=>p.id===binding.parts[template?.id]);
 if(template?.address!==undefined&&selected?.address!==undefined&&template.address!==selected.address)sample.code=sample.code.replace(new RegExp('0x'+template.address.toString(16)+'(?=\\s*<<\\s*1)','gi'),'0x'+selected.address.toString(16));
 if(template?.address!==undefined&&selected?.address!==undefined)template.address=selected.address;
 const prefix='STM_D'+index+'_',functions=cFunctions(sample.code),parsed=compileHal(sample.code),handles=parsed.globals.flatMap(g=>g.declarations).filter(d=>d.type.endsWith('_HandleTypeDef')),names={};
 for(const g of parsed.globals.flatMap(g=>g.declarations))if(!handles.some(h=>h.name===g.name))names[g.name]=prefix+g.name;
 const helpers=functions.filter(f=>!['main','SystemClock_Config','Error_Handler','__io_putchar'].includes(f.name)&&!f.name.startsWith('MX_'));for(const f of helpers)names[f.name]=prefix+f.name;
 let globals=sample.code;for(const f of [...functions].reverse())globals=globals.slice(0,f.start)+globals.slice(f.end);globals=globals.replace(/^\s*#include[^\n]*\n/gm,'').replace(/^\s*(?:static\s+)?(?:void|int)\s+\w+\([^;]*\);\s*$/gm,'').replace(/^\s*\w+_HandleTypeDef\s+\w+\s*;\s*$/gm,'');
 const section=n=>sample.code.match(new RegExp('/\\* USER CODE BEGIN '+n+' \\*/([\\s\\S]*?)/\\* USER CODE END '+n+' \\*/'))?.[1]||'';
 const ownConfig={...structuredClone(project.mcu),pins:Object.fromEntries(Object.values(binding.pins).map(pin=>[pin,project.mcu.pins[pin]])),peripherals:Object.fromEntries(Object.values(binding.peripherals).map(id=>[id,project.mcu.peripherals[id]]))};
 if(binding.mode==='baremetal'){
  const card=baremetalCards(ownConfig,binding.type,sample).find(c=>c.id===binding.api);if(!card)throw new Error('해당 장치에서 사용할 수 없는 레지스터 예제입니다.');
  const tokens=Object.fromEntries([...REGISTER_HELPERS.matchAll(/\b(BM_\w+)\s*\(/g)].map(m=>[m[1],prefix+m[1]]));
  return {declarations:replaceIdentifiers(REGISTER_HELPERS,tokens),init:replaceIdentifiers(registerSetup(ownConfig),tokens),step:replaceIdentifiers(card.code+'\nBM_delay(100);',tokens),handles:[],callbacks:[],prefix};
 }
 const generated=cFunctions(generateHal(ownConfig)).filter(f=>f.name.startsWith('MX_'));const initNames=Object.fromEntries(generated.map(f=>[f.name,prefix+f.name]));
 let initializers=generated.map(f=>replaceIdentifiers(f.text,initNames)).join('\n');
 const body=remapCode(replaceIdentifiers(globals+'\n'+helpers.map(f=>f.name.startsWith('HAL_UART_')?f.text.replace('{','{\n  if (huart->Instance != USART2) return;'):f.text).join('\n'),names),binding,sample);
 const selectedInit=binding.mode==='hal'&&binding.api!=='all'&&!selectOperation(section(3),binding.api,helpers).trim()&&selectOperation(section(2),binding.api,helpers).trim()?selectOperation(section(2),binding.api,helpers):section(2);
 const init=remapCode(replaceIdentifiers(selectedInit.replace(/\bMX_\w+_Init\s*\(\s*\)\s*;/g,''),names),binding,sample);let step=remapCode(replaceIdentifiers(selectOperation(section(3),binding.mode==='hal'?binding.api:'all',helpers),names),binding,sample);
 const adc=Object.values(binding.pins).find(pin=>project.mcu.pins[pin].function.startsWith('ADC1_')),channel=adc?project.mcu.pins[adc].function.slice(7):null;
 const adcSelect=adc?`  ADC_ChannelConfTypeDef docsChannel = {0}; docsChannel.Channel = ADC_CHANNEL_${channel}; docsChannel.Rank = 1; docsChannel.SamplingTime = ADC_SAMPLETIME_3CYCLES; HAL_ADC_ConfigChannel(&hadc1, &docsChannel);\n`:'';
 const callbacks=helpers.filter(f=>f.name.startsWith('HAL_')).map(f=>({name:f.name,signature:f.signature,call:names[f.name]+'('+f.signature.slice(f.signature.indexOf('(')+1,-1).split(',').map(s=>s.match(/\w+\s*$/)?.[0].trim()).join(', ')+');'}));
 return {declarations:body+'\n'+initializers,init:generated.map(f=>'  '+initNames[f.name]+'();').join('\n')+'\n'+init,step:adcSelect+step,text:body+'\n'+initializers+`\nvoid ${prefix}Init(void) {\n${generated.map(f=>'  '+initNames[f.name]+'();').join('\n')}\n${init}\n}\nvoid ${prefix}Step(void) {\n${adcSelect}${step}\n}\n`,handles:handles.map(h=>({type:h.type,name:remapCode(h.name,binding,sample)})),callbacks,prefix};
}
function installCode(project){
 const modules=project.deviceDocs.bindings.map((b,i)=>deviceSource(b,project,i)),existing=sourceText(project),handles=new Map(modules.flatMap(m=>m.handles).map(h=>[h.name,h]));
 let declarations='#include <stdio.h>\n#include <math.h>\n'+[...handles.values()].map(h=>(new RegExp('\\b'+h.type+'\\s+'+h.name+'\\b').test(existing)?'extern ':'')+h.type+' '+h.name+';').join('\n')+'\n'+modules.map(m=>m.declarations).join('\n');
 let main=stripDeviceRegions(project.code),callbacks=new Map();
 for(const m of modules)for(const cb of m.callbacks){if(!callbacks.has(cb.name))callbacks.set(cb.name,{...cb,calls:[]});callbacks.get(cb.name).calls.push(cb.call);}
 for(const cb of callbacks.values()){
  const dispatcher=cb.name.replace('HAL_','STM_Devices_'),signature=cb.signature.replace(cb.name,dispatcher),args=cb.signature.slice(cb.signature.indexOf('(')+1,-1).split(',').map(s=>s.match(/\w+\s*$/)?.[0].trim()).join(', '),call=dispatcher+'('+args+');';
  declarations+='\n'+signature+' {\n'+cb.calls.map(c=>'  '+c).join('\n')+'\n}\n';
  const fn=cFunctions(main).find(f=>f.name===cb.name),external=project.firmware.files.filter(f=>f.name!==FILE&&/\.c$/.test(f.name)).map(file=>({file,fn:cFunctions(file.text).find(f=>f.name===cb.name)})).find(v=>v.fn);
  if(fn){if(!fn.body.includes(dispatcher+'('))main=main.slice(0,fn.open+1)+'\n  '+call+main.slice(fn.open+1);}
  else if(external){if(!external.fn.body.includes(dispatcher+'(')){const f=external.file,at=external.fn.open+1;f.text=signature+';\n'+f.text.slice(0,at)+'\n  '+call+f.text.slice(at);}}
  else main+='\n'+cb.signature+' { '+call+' }\n';
 }
 project.code=insertDeviceCode(main,{declarations,init:modules.map(m=>'{\n'+m.init+'\n}').join('\n'),step:modules.map(m=>'{\n'+m.step+'\n}').join('\n')});
 project.firmware={mode:'hal',files:project.firmware.files.filter(f=>f.name!==FILE&&f.name!==HEADER)};
 project.deviceDocs.inlineChecksum=managedChecksum(project.code);delete project.deviceDocs.checksum;delete project.deviceDocs.headerChecksum;
}
export function applyDeviceExample(original,target,{api='all',mode='hal'}={}){
 const project=structuredClone(original),report={addedParts:0,reused:0,addedWires:0,removedWires:0,detached:0,preserved:0};
 if(project.firmware?.mode!=='hal')throw new Error('현재 프로젝트를 STM32 HAL 실행 환경으로 전환한 뒤 적용하세요.');
 const component=target.type==='part'?project.components.find(p=>p.id===target.id):null,type=component?.type||(target.id==='board'?'board':target.id==='breadboard'?'breadboard':null);if(!type||!DEVICE_RECIPES[type])throw new Error('장치 또는 보드/빵판을 먼저 선택하세요.');
 const sample=recipeFor(type);if(sample.mcu.timerClockHz!==project.mcu.timerClockHz&&/^ref_rgb_(neopixel|gravity)/.test(type)){if(Object.keys(project.mcu.pins).length||project.deviceDocs?.bindings.length)throw new Error('이 장치의 비트 타이밍에는 '+sample.mcu.timerClockHz+' Hz 클록이 필요합니다. Pinout의 클록을 맞춰 주세요.');project.mcu.timerClockHz=sample.mcu.timerClockHz;project.code=project.code.replace(cFunctions(project.code).find(f=>f.name==='SystemClock_Config')?.text||'__no_clock__',cFunctions(generateHal(project.mcu)).find(f=>f.name==='SystemClock_Config')?.text||'');}
 const busPin=(p,label)=>partTerminal(p.id,terminalKeys(p).find(k=>terminalLabel(p,k)===label));
 const key=component?.id||'surface_'+type;project.deviceDocs??={bindings:[]};
 if(['uart','rs485'].includes(CATALOG_BY_TYPE[type]?.family||type)&&component?.baud)sample.mcu.peripherals.USART2.baud=component.baud;
 const managed=project.firmware.files.find(f=>f.name===FILE),header=project.firmware.files.find(f=>f.name===HEADER);
 if(managed&&(!project.deviceDocs.checksum||checksum(managed.text)!==project.deviceDocs.checksum)||header&&(!project.deviceDocs.headerChecksum||checksum(header.text)!==project.deviceDocs.headerChecksum))throw new Error('stm_device_docs 파일이 직접 수정되어 있습니다. 수정 내용을 다른 소스 파일로 옮긴 뒤 Docs 파일을 삭제하면 새로 생성할 수 있습니다.');
 if(project.deviceDocs.inlineChecksum&&managedChecksum(project.code)!==project.deviceDocs.inlineChecksum)throw new Error('main.c의 장치 예제 영역이 직접 수정되어 있습니다. 수정 코드를 영역 밖으로 옮긴 뒤 다시 적용하세요.');
 const prior=project.deviceDocs.bindings.find(b=>b.key===key),parts=bindParts(project,sample,{id:component?.id,type},prior,report),allocation=allocatePins(project,sample,parts,prior);
 repairWiring(project,sample,parts,allocation.pins,report);project.mcu=allocation.config;
 if(component?.address!==undefined){const net=wiringTopology(project);if(project.components.some(other=>other.id!==component.id&&other.address===component.address&&net.find(busPin(other,'SDA'))===net.find(busPin(component,'SDA'))))throw new Error('같은 I2C 버스에 주소 0x'+component.address.toString(16)+' 장치가 이미 있습니다. 장치 속성에서 지원하는 다른 주소를 선택하세요.');}
 if(!['hal','baremetal'].includes(mode))throw new Error('예제 모드를 확인하세요.');
 if(mode==='hal'&&api!=='all'&&!sample.code.includes(api+'('))throw new Error('이 장치의 HAL 함수 목록에서 적용할 함수를 선택하세요.');
 const binding={key,type,parts,pins:allocation.pins,peripherals:allocation.peripherals,api,mode};if(prior)project.deviceDocs.bindings[project.deviceDocs.bindings.indexOf(prior)]=binding;else project.deviceDocs.bindings.push(binding);
 project.simulation={stepMs:Math.min(project.simulation?.stepMs||1,sample.simulation?.stepMs||1),pwmWaveform:!!(project.simulation?.pwmWaveform||sample.simulation?.pwmWaveform)};
 installCode(project);const hasBare=project.deviceDocs.bindings.some(b=>b.mode==='baremetal'||recipeFor(b.type).ide?.native?.target==='arm');if(hasBare){project.ide??={breakpoints:[],watches:[]};project.ide.native={target:'arm',configuration:project.ide.native?.configuration||'Debug'};}
 else if(original.deviceDocs?.bindings.some(b=>b.mode==='baremetal')&&project.ide?.native?.target==='arm')project.ide.native.target='simulator';
 const validated=validateProject(project);if(!hasBare)compileHal(validated.code,validated.firmware.files);return {project:validated,report,binding,file:'main.c'};
}
