import assert from 'node:assert/strict';
import {cFunctions} from '../src/c-source-edit.js';
import {blankProject,validateProject} from '../src/project.js';
import {HAL_EXAMPLES,halExample} from '../src/hal-examples.js';

export function resetAuditCases(){
 const pin=(fn,initial=0)=>({function:fn,pull:'NOPULL',edge:'RISING',initial,label:''});
 const cases=[['blank',blankProject()],...Object.keys(HAL_EXAMPLES).map(id=>[id,halExample(id)])];
 const add=(id,edit)=>{const p=blankProject();edit(p);cases.push([id,p]);};
 add('reset-reserved-disabled',p=>{p.mcu.pins={PA5:pin('Reset'),PB8:pin('Reserved')};p.mcu.peripherals.TIM2={enabled:false};p.mcu.nvic.TIM2_IRQn={enabled:false,priority:0};});
 add('nvic-only',p=>{p.mcu.nvic.EXTI0_IRQn={enabled:true,priority:1};});
 for(const mode of ['GPIO_Input','GPIO_Output','GPIO_EXTI','Analog'])add(mode,p=>{p.mcu.pins.PA0=pin(mode,mode==='GPIO_Output'?1:0);});
 add('base-timer-no-pins',p=>{p.mcu.peripherals.TIM2={enabled:true,mode:'base'};});
 return cases.map(([id,p])=>[id,validateProject(p)]);
}

export function assertMinimal(project){
 const code=project.code,pins=Object.entries(project.mcu.pins).filter(([,p])=>!['Reset','Reserved'].includes(p.function));
 assert.doesNotMatch(code,/#include <|__io_putchar|ITM_SendChar|printf|Callback\s*\(|HAL_Delay|HAL_GPIO_TogglePin|HAL_\w+_Start|HAL_UART_Transmit|\bmessage\b/);
 assert.equal(code.includes('MX_GPIO_Init'),pins.length>0||Object.values(project.mcu.nvic).some(p=>p.enabled));
 assert.equal(code.includes('GPIO_InitTypeDef'),pins.length>0);
 for(const port of ['A','B','C','D','H'])assert.equal(code.includes(`__HAL_RCC_GPIO${port}_CLK_ENABLE`),pins.some(([pin])=>pin[1]===port),port);
 const functions=cFunctions(code);
 for(const f of functions)if(f.name!=='main')assert.ok(functions.some(other=>other!==f&&new RegExp('\\b'+f.name+'\\s*\\(').test(other.body)),f.name+' is unused');
}

