// CubeIDE writes the handler of every enabled NVIC line (and SysTick_Handler) into Core/Src/stm32xxxx_it.c. The
// simulator builds a project's own handler instead of that one, so main.c may define USART2_IRQHandler and still run —
// but the same main.c in a CubeIDE project fails to link ("multiple definition of `USART2_IRQHandler'"). These are the
// handlers a source defines that CubeIDE would generate too, with the HAL callback to use instead.
import {isRaFamily} from './ra-config.js';
import {irqHandlers} from './irq-handlers.js';
import {prefixOf} from './build-environment.js';
import {evalCondition} from './hal-source.js';

// Comments and the contents of string / character literals blanked, and the lines of a conditional block that is off
// emptied, keeping every line in place for the line numbers. A condition is decided when it is 0 / 1 or uses only
// macros this file defines (#define SIM 0 … #if SIM == 1); one that depends on other headers is taken as on.
function liveText(text){
 let out='',i=0;const n=text.length;
 while(i<n){
  const c=text[i],d=text[i+1];
  if(c==='/'&&d==='*'){const end=text.indexOf('*/',i+2),stop=end<0?n:end+2;out+=text.slice(i,stop).replace(/[^\n]/g,' ');i=stop;}
  else if(c==='/'&&d==='/'){let stop=text.indexOf('\n',i);if(stop<0)stop=n;out+=' '.repeat(stop-i);i=stop;}
  else if(c==='"'||c==="'"){let j=i+1;while(j<n&&text[j]!==c&&text[j]!=='\n'){if(text[j]==='\\')j++;j++;}out+=c+' '.repeat(Math.max(0,Math.min(j,n)-i-1))+(text[j]===c?c:'');i=text[j]===c?j+1:j;}
  else{out+=c;i++;}
 }
 const stack=[],on=()=>stack.every(s=>s.live),defs=new Map();
 const decide=(op,arg)=>{
  if(op==='ifdef'||op==='ifndef')return defs.has(arg.trim())?(op==='ifdef'):null;
  const names=(arg.match(/[A-Za-z_]\w*/g)||[]).filter(w=>w!=='defined');
  if(names.some(w=>!defs.has(w)))return null;
  try{return evalCondition(arg,defs);}catch{return null;}
 };
 return out.split('\n').map(line=>{
  const d=/^[ \t]*#[ \t]*(if|ifdef|ifndef|elif|else|endif|define)\b(.*)$/.exec(line);
  if(!d)return on()?line:'';
  if(d[1]==='define'){const m=/^\s*(\w+)(?!\()\s*(.*)$/.exec(d[2]);if(m&&on())defs.set(m[1],m[2].trim());return '';}
  if(['if','ifdef','ifndef'].includes(d[1])){const yes=on()?decide(d[1],d[2]):false;stack.push({known:yes!==null,live:yes!==false,taken:yes===true});return '';}
  const top=stack.at(-1);if(!top)return '';
  if(d[1]==='endif')stack.pop();
  else if(!top.known)top.live=true;
  else if(d[1]==='else'){top.live=!top.taken;top.taken=true;}
  else{const outer=stack.slice(0,-1).every(s=>s.live),yes=top.taken||!outer?false:decide('if',d[2]);if(yes===null){top.known=false;top.live=true;}else{top.live=yes;top.taken=top.taken||yes;}}
  return '';
 }).join('\n');
}

/** The HAL callback that takes the work of a handler, for the notice. */
export function halCallbackFor(name){
 const id=name.replace(/_IRQHandler$/,'');
 if(name==='SysTick_Handler')return `it.c SysTick_Handler의 USER CODE BEGIN SysTick_IRQn 1 구역(또는 HAL_GetTick()으로 주기 확인)`;
 if(/^TIM\d/.test(id))return 'HAL_TIM_PeriodElapsedCallback() (입력 캡처는 HAL_TIM_IC_CaptureCallback())';
 if(/^USART\d|^UART\d/.test(id))return 'HAL_UART_RxCpltCallback() / HAL_UART_TxCpltCallback()';
 if(/^EXTI/.test(id))return 'HAL_GPIO_EXTI_Callback()';
 if(/^ADC/.test(id))return 'HAL_ADC_ConvCpltCallback()';
 if(/^I2C\d_EV/.test(id))return 'HAL_I2C_MasterTxCpltCallback() / HAL_I2C_MasterRxCpltCallback()';
 if(/^I2C\d_ER/.test(id))return 'HAL_I2C_ErrorCallback()';
 if(/^SPI\d/.test(id))return 'HAL_SPI_TxRxCpltCallback()';
 if(/^DMA\d_(Stream|Channel)\d/.test(id))return 'DMA를 쓰는 주변장치의 완료 콜백(HAL_UART_RxCpltCallback(), HAL_ADC_ConvCpltCallback() 등)';
 if(id==='DCMI')return 'HAL_DCMI_FrameEventCallback()';
 if(id==='SDIO')return 'HAL_SD_RxCpltCallback() / HAL_SD_TxCpltCallback()';
 if(id==='RTC_Alarm')return 'HAL_RTC_AlarmAEventCallback()';
 if(id==='RTC_WKUP')return 'HAL_RTCEx_WakeUpTimerEventCallback()';
 if(id==='RTC')return 'HAL_RTCEx_RTCEventCallback()';
 if(id==='WWDG')return 'HAL_WWDG_EarlyWakeupCallback()';
 if(id==='TIM6_DAC')return 'HAL_TIM_PeriodElapsedCallback()';
 return 'HAL 콜백';
}

/** [{name, file, line, itFile, callback}]: handlers in the project's sources that CubeIDE also writes into it.c. A
 * handler in the form the generator writes it (its CubeMX USER CODE sections) is left alone, as is an imported it.c. */
export function cubeIdeHandlerDuplicates(project){
 if(!project?.mcu||isRaFamily(project.mcu.family))return [];
 const itFile=`${prefixOf(project.mcu.family)}_it.c`;
 const names=[['SysTick_Handler','SysTick_IRQn'],...irqHandlers(project.mcu).map(h=>[h.name,h.irq])];
 const files=[{name:'main.c',text:project.code||''},...(project.firmware?.files||[])].filter(f=>!/_it\.c$/i.test(f.name)&&/\.c$/i.test(f.name));
 const out=[],seen=new Set();
 for(const f of files){
  const raw=f.text||'',text=liveText(raw);
  for(const [name,irq]of names){
   if(seen.has(name))continue;
   const m=new RegExp(`\\b${name}\\s*\\(\\s*(?:void)?\\s*\\)\\s*\\{`).exec(text);if(!m)continue;
   const after=raw.slice(m.index+m[0].length,m.index+m[0].length+120);
   if(new RegExp(`^\\s*/\\*\\s*USER CODE BEGIN ${irq} 0\\s*\\*/`).test(after))continue;
   seen.add(name);out.push({name,file:f.name,line:text.slice(0,m.index).split('\n').length,itFile,callback:halCallbackFor(name)});
  }
 }
 return out;
}

export const duplicateMessage=d=>`${d.file} ${d.line}행 ${d.name}(): 시뮬레이터에서는 동작하지만 CubeIDE는 같은 핸들러를 Core/Src/${d.itFile}에 만들어 "multiple definition" 링크 오류가 납니다. ${d.name}()는 지우고 ${d.callback}에 처리를 쓰세요.`;
