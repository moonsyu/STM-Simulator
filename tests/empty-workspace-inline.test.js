import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,exampleProject,validateProject} from '../src/project.js';
import {showSurface,removeSurface} from '../src/surfaces.js';
import {endpoints,boardPin,breadboardHoles} from '../src/pins.js';
import {PART_DEFS,WIRE_COLORS} from '../src/components.js';
import {PART_LIBRARY,searchParts} from '../src/part-library.js';
import {applyDeviceExample} from '../src/device-assistance.js';
import {deviceDocs} from '../src/device-docs-data.js';
import {exampleStatements} from '../src/device-inline-example.js';
import {cFunctions} from '../src/c-source-edit.js';
import {SimulationSession} from '../src/session.js';
import {inlineStatements} from '../src/c-inline.js';
import {compileHal} from '../src/hal-source.js';

test('fresh projects have no physical contacts; legacy surfaces and independent breadboards round trip',()=>{
 const p=blankProject();assert.equal(endpoints(p.components,p.surfaces).length,0);assert.deepEqual(validateProject(p),p);
 assert.ok(searchParts('STM32 F446RE').some(p=>p.type==='board'));
 showSurface(p,'board');showSurface(p,'board');assert.equal(endpoints([],p.surfaces).length,108);
 p.components=['one','two'].map(id=>({id,type:'breadboard',name:id,x:800,y:300,rotation:0}));
 assert.equal(endpoints(p.components,p.surfaces).length,908);assert.notEqual(breadboardHoles(p.components[0])[0].id,breadboardHoles(p.components[1])[0].id);
 p.wires=[{id:'w',from:boardPin('PA5'),to:breadboardHoles(p.components[0])[0].id,color:WIRE_COLORS[19][0]}];
 removeSurface(p,'board');assert.equal(p.wires.length,0);assert.deepEqual(validateProject(p),p);
 assert.equal(endpoints([],exampleProject().surfaces).length,508);
 assert.equal(WIRE_COLORS.length,20);assert.equal(new Set(WIRE_COLORS.map(c=>c[0])).size,20);assert.equal(WIRE_COLORS.filter(c=>c[1].startsWith('파스텔')).length,10);
});
test('every device Docs adds no functions or files and all displayed HAL snippets are main statements',()=>{
 for(const {type}of PART_LIBRARY){const p=blankProject();if(type!=='board')p.components=[{id:'selected',type,name:type,x:800,y:350,rotation:0,span:70,...PART_DEFS[type]?.defaults,...(type==='resistor'?{value:330}:{}),...(type==='led'?{color:'red'}:{})}];
  const docs=deviceDocs(type),target=type==='board'?{type:'surface',id:'board'}:{type:'part',id:'selected'};
  for(const card of docs.functions){const snippet=exampleStatements(docs.sample,card.name).preview;assert.ok(snippet.trim(),type+':'+card.name);assert.equal(cFunctions(snippet).length,0,type+':'+card.name);const single=applyDeviceExample(p,target,{api:card.name}).project;assert.deepEqual(cFunctions(single.code).map(f=>f.name),cFunctions(p.code).map(f=>f.name),type+':'+card.name);}
  const result=applyDeviceExample(p,target).project;
  assert.deepEqual(cFunctions(result.code).map(f=>f.name),cFunctions(p.code).map(f=>f.name),type);assert.deepEqual(result.firmware.files,p.firmware.files,type);
  assert.deepEqual(applyDeviceExample(validateProject(result),target).project,result,type);
 }
});
test('Docs retains custom initialization and user main logic while adding GPIO into existing MX_GPIO_Init',()=>{
 const p=blankProject();p.components=[{id:'selected',type:'led',name:'LED',x:800,y:350,rotation:0,span:70,color:'red'}];
 p.code=p.code.replace('GPIO_InitTypeDef GPIO_InitStruct = {0};','GPIO_InitTypeDef GPIO_InitStruct = {0};\n  __HAL_RCC_GPIOB_CLK_ENABLE();\n  GPIO_InitStruct.Pin = GPIO_PIN_12;\n  GPIO_InitStruct.Mode = GPIO_MODE_INPUT;\n  GPIO_InitStruct.Pull = GPIO_PULLDOWN;\n  HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);');
 p.code=p.code.replace('/* USER CODE BEGIN 3 */','/* USER CODE BEGIN 3 */\n    printf("USER CODE");');
 const q=applyDeviceExample(p,{type:'part',id:'selected'},{api:'HAL_GPIO_WritePin'}).project;
 assert.match(q.code,/printf\("USER CODE"\);/);const fn=cFunctions(q.code).find(f=>f.name==='MX_GPIO_Init');assert.match(fn.body,/GPIO_PIN_12/);assert.match(fn.body,/GPIO_PIN_5/);assert.match(fn.body,/GPIO_PULLDOWN/);assert.equal(cFunctions(q.code).length,cFunctions(p.code).length);
});
test('UART Docs echoes in main without adding a completion callback',()=>{
 const p=blankProject();p.components=[{id:'uart',type:'uart',name:'UART',x:800,y:300,rotation:0,baud:9600}];
 const q=applyDeviceExample(p,{type:'part',id:'uart'}).project;assert.doesNotMatch(q.code,/void HAL_UART_RxCpltCallback/);
 const s=new SimulationSession(q);s.tick(0);s.inject('abcdefgh','USART2:external');for(let t=1;t<=150;t++)s.tick(t);assert.match(s.buses.received.get('uart'),/abcdefgh$/);
});
test('inline expansion preserves early returns, short circuit, nested calls and repeated loop conditions',()=>{
 const helpers='int count=0; int next(void){ count++; return count; } int read(int n){for(int i=0;i<5;i++){if(i==n)return i+10;}return -1;}';
 const source=inlineStatements('int a=read(2); int b=0 && next(); int c=1 ? next() : next(); while(next()<4) {} printf("%d %d %d %d",a,b,c,count);',helpers);
 const p=exampleProject();p.code='int count=0; int main(void){'+source+' while(1){HAL_Delay(1);}}';const out=[],r=new SimulationSession(p,{print:s=>out.push(s)});r.tick(1);assert.match(out.join(''),/12 0 1 4/);
});

test('legacy Docs callback glue is removed without changing user callback statements',async()=>{
 const {removeLegacyDeviceHooks}=await import('../src/device-code-insertion.js');
 const source='void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) { STM_Devices_UART_RxCpltCallback(huart); }\nvoid HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {\n STM_Devices_GPIO_EXTI_Callback(GPIO_Pin);\n printf("user callback");\n}';
 const edited=removeLegacyDeviceHooks(source);assert.doesNotMatch(edited,/STM_Devices_|HAL_UART_RxCpltCallback/);assert.match(edited,/HAL_GPIO_EXTI_Callback/);assert.match(edited,/printf\("user callback"\);/);
});

test('an existing peripheral handle in another C file gets an extern, with no new file',()=>{
 const p=blankProject();p.components=[{id:'selected',type:'uart',name:'UART',x:800,y:300,rotation:0,baud:9600}];p.firmware.files=[{name:'peripherals.c',text:'#include "main.h"\nUART_HandleTypeDef huart2;\n'}];
 const q=applyDeviceExample(p,{type:'part',id:'selected'}).project;assert.match(q.code,/extern UART_HandleTypeDef huart2;/);assert.deepEqual(q.firmware.files,p.firmware.files);
});
