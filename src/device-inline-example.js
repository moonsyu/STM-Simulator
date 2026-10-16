import {cFunctions,replaceIdentifiers,maskC} from './c-source-edit.js';
import {selectOperation,indentC} from './device-code-insertion.js';
import {inlineStatements} from './c-inline.js';

// Docs uses polling examples where the standalone demo required a callback.
// This keeps all added application behavior in main, including UART echo.
export function mainOnlyRecipe(sample){
 let code=sample.code;
 const callbacks=cFunctions(code).filter(f=>f.name.endsWith('Callback'));
 for(const cb of callbacks){
  if(cb.name==='HAL_UART_RxCpltCallback'){
   const match=/HAL_UART_Receive_IT\(([^;]+)\);/.exec(maskC(cFunctions(code).find(f=>f.name==='main')?.body||''));
   if(match){const args=match[1].split(',').map(s=>s.trim()),body=cb.body.replace(/HAL_UART_Receive_IT\([^;]+\);/g,'').replace(/HAL_UART_Transmit_IT\(([^;]+)\);/g,'HAL_UART_Transmit($1, 100);'),handle=args[0];
    code=code.replace(match[0],'').replace('HAL_Delay(10);','');
    const receive=`if (HAL_UART_Receive(${args.join(', ')}, 10) == HAL_OK) {\n${replaceIdentifiers(body,{huart:'('+handle+')'})}\n}`;
    code=code.replace('/* USER CODE BEGIN 3 */','/* USER CODE BEGIN 3 */\n'+receive);
   }
  }else if(cb.name==='HAL_GPIO_EXTI_Callback'&&cb.body.replace(/\/\*[\s\S]*?\*\//g,'').trim()){
   const pins=Object.entries(sample.mcu.pins).filter(([,p])=>p.function==='GPIO_EXTI');
   let poll='';for(const [pin]of pins){const n=Number(pin.slice(2)),prev='docsPrevious'+pin,current='docsCurrent'+pin;
    poll+=`static int ${prev} = -1;\nint ${current} = HAL_GPIO_ReadPin(GPIO${pin[1]}, GPIO_PIN_${n});\nif (${prev} != ${current}) {\n${prev} = ${current};\n${replaceIdentifiers(cb.body,{GPIO_Pin:'GPIO_PIN_'+n})}\n}\n`;
   }
   code=code.replace('/* USER CODE BEGIN 3 */','/* USER CODE BEGIN 3 */\n'+poll);
  }
 }
 for(const fn of cFunctions(code).filter(f=>f.name.endsWith('Callback')).reverse())code=code.slice(0,fn.start)+code.slice(fn.end);
 return {...sample,code};
}
export function exampleStatements(sample,api='all',prefix='example_'){
 const functions=cFunctions(sample.code),helpers=functions.filter(f=>!['main','SystemClock_Config','Error_Handler','__io_putchar'].includes(f.name)&&!f.name.startsWith('MX_'));
 const section=n=>sample.code.match(new RegExp('/\\* USER CODE BEGIN '+n+' \\*/([\\s\\S]*?)/\\* USER CODE END '+n+' \\*/'))?.[1]||'';
 const step=selectOperation(section(3),api,helpers),init=api!=='all'&&!step.trim()?selectOperation(section(2),api,helpers):section(2);
 // A GPIO reset in MX_GPIO_Init is setup, not the requested main operation.
 // Blink recipes use TogglePin, so provide an explicit WritePin demonstration.
 if(api==='HAL_GPIO_WritePin'&&!step.trim()&&!init.trim()){
  const pin=Object.entries(sample.mcu.pins).find(([,config])=>config.function==='GPIO_Output')?.[0];
  if(!pin)throw new Error('WritePin 예제에 사용할 GPIO 출력 핀이 없습니다.');
  const operation=`HAL_GPIO_WritePin(GPIO${pin[1]}, GPIO_PIN_${Number(pin.slice(2))}, GPIO_PIN_SET);`;
  return {globals:'',init:'',step:operation,preview:operation};
 }
 let globals=sample.code;for(const f of [...functions].reverse())globals=globals.slice(0,f.start)+globals.slice(f.end);
 globals=globals.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*#include[^\n]*\n/gm,'').replace(/^\s*(?:static\s+)?(?:void|int)\s+\w+\([^;]*\);\s*$/gm,'').replace(/^\s*\w+_HandleTypeDef\s+\w+\s*;\s*$/gm,'');
 const definitions=helpers.map(f=>f.text).join('\n'),expand=text=>inlineStatements(text.replace(/\bMX_\w+_Init\s*\(\s*\)\s*;/g,''),definitions,prefix);
 const setup=api!=='all'&&!step.trim()&&!init.trim()?functions.find(f=>f.name!=='main'&&new RegExp('\\b'+api+'\\s*\\(').test(f.body))?.body||(api==='HAL_Init'?'HAL_Init();':'') :'';
 return {globals,init:expand(init),step:expand(step),preview:indentC([globals,expand(init||setup),expand(step)].filter(t=>t.trim()).join('\n'))};
}
