import {compile} from './parser.js';
import {familyProfile} from './mcu-family.js';
import {SOURCE_PATH,MAX_SOURCE_FILES,resolveInclude,baseName} from './source-files.js';

// These are interpreter value layouts, not STM32 register or ABI definitions.
export const HAL_STRUCTS={
  CAN_InitTypeDef:'Prescaler Mode SyncJumpWidth TimeSeg1 TimeSeg2 TimeTriggeredMode AutoBusOff AutoWakeUp AutoRetransmission ReceiveFifoLocked TransmitFifoPriority',
  CAN_HandleTypeDef:'Instance Init:CAN_InitTypeDef',
  CAN_FilterTypeDef:'FilterIdHigh FilterIdLow FilterMaskIdHigh FilterMaskIdLow FilterFIFOAssignment FilterBank FilterMode FilterScale FilterActivation SlaveStartFilterBank',
  CAN_TxHeaderTypeDef:'StdId ExtId IDE RTR DLC TransmitGlobalTime',
  CAN_RxHeaderTypeDef:'StdId ExtId IDE RTR DLC Timestamp FilterMatchIndex',
  I2S_InitTypeDef:'Mode Standard DataFormat MCLKOutput AudioFreq CPOL ClockSource FullDuplexMode',
  I2S_HandleTypeDef:'Instance Init:I2S_InitTypeDef',
  RCC_PLLI2SInitTypeDef:'PLLI2SM PLLI2SN PLLI2SP PLLI2SR PLLI2SQ',
  RCC_PeriphCLKInitTypeDef:'PeriphClockSelection PLLI2S:RCC_PLLI2SInitTypeDef PLLI2SDivQ I2sApb1ClockSelection RTCClockSelection',
  RTC_InitTypeDef:'HourFormat AsynchPrediv SynchPrediv OutPut OutPutRemap OutPutPolarity OutPutType',
  RTC_TimeTypeDef:'Hours Minutes Seconds TimeFormat SubSeconds SecondFraction DayLightSaving StoreOperation',
  RTC_DateTypeDef:'WeekDay Month Date Year',
  RTC_AlarmTypeDef:'AlarmTime:RTC_TimeTypeDef AlarmMask AlarmSubSecondMask AlarmDateWeekDaySel AlarmDateWeekDay Alarm',
  RTC_HandleTypeDef:'Instance Init:RTC_InitTypeDef Lock State',
  DAC_HandleTypeDef:'Instance State Lock DMA_Handle1 DMA_Handle2 ErrorCode',
  DAC_ChannelConfTypeDef:'DAC_Trigger DAC_OutputBuffer',
  IWDG_InitTypeDef:'Prescaler Reload',IWDG_HandleTypeDef:'Instance Init:IWDG_InitTypeDef',
  WWDG_InitTypeDef:'Prescaler Window Counter EWIMode',WWDG_HandleTypeDef:'Instance Init:WWDG_InitTypeDef',

  GPIO_InitTypeDef:'Pin Mode Pull Speed Alternate',
  UART_InitTypeDef:'BaudRate WordLength StopBits Parity Mode HwFlowCtl OverSampling',
  UART_HandleTypeDef:'Instance Init:UART_InitTypeDef ErrorCode gState RxState hdmatx hdmarx RxEventType ReceptionType',
  I2C_InitTypeDef:'ClockSpeed DutyCycle OwnAddress1 AddressingMode DualAddressMode OwnAddress2 GeneralCallMode NoStretchMode',
  I2C_HandleTypeDef:'Instance Init:I2C_InitTypeDef ErrorCode hdmatx hdmarx State',
  SPI_InitTypeDef:'Mode Direction DataSize CLKPolarity CLKPhase NSS BaudRatePrescaler FirstBit TIMode CRCCalculation CRCPolynomial',
  SPI_HandleTypeDef:'Instance Init:SPI_InitTypeDef ErrorCode hdmatx hdmarx State',
  ADC_InitTypeDef:'ClockPrescaler Resolution ScanConvMode ContinuousConvMode DiscontinuousConvMode NbrOfDiscConversion ExternalTrigConvEdge ExternalTrigConv DataAlign NbrOfConversion DMAContinuousRequests EOCSelection',
  ADC_HandleTypeDef:'Instance Init:ADC_InitTypeDef ErrorCode DMA_Handle State',
  ADC_ChannelConfTypeDef:'Channel Rank SamplingTime Offset',
  TIM_Base_InitTypeDef:'Prescaler CounterMode Period ClockDivision RepetitionCounter AutoReloadPreload',
  TIM_HandleTypeDef:'Instance Init:TIM_Base_InitTypeDef Channel hdma:uint32_t[7] State',
  TIM_ClockConfigTypeDef:'ClockSource ClockPolarity ClockPrescaler ClockFilter',
  TIM_MasterConfigTypeDef:'MasterOutputTrigger MasterSlaveMode',
  TIM_BreakDeadTimeConfigTypeDef:'OffStateRunMode OffStateIDLEMode LockLevel DeadTime BreakState BreakPolarity BreakFilter AutomaticOutput',
  TIM_IC_InitTypeDef:'ICPolarity ICSelection ICPrescaler ICFilter',
  TIM_Encoder_InitTypeDef:'EncoderMode IC1Polarity IC1Selection IC1Prescaler IC1Filter IC2Polarity IC2Selection IC2Prescaler IC2Filter',
  TIM_OC_InitTypeDef:'OCMode Pulse OCPolarity OCNPolarity OCFastMode OCIdleState OCNIdleState',
  RCC_PLLInitTypeDef:'PLLState PLLSource PLLM PLLN PLLP PLLQ PLLR',
  RCC_OscInitTypeDef:'OscillatorType HSEState LSEState HSIState HSICalibrationValue LSIState PLL:RCC_PLLInitTypeDef',
  RCC_ClkInitTypeDef:'ClockType SYSCLKSource AHBCLKDivider APB1CLKDivider APB2CLKDivider',
  DMA_InitTypeDef:'Channel Direction PeriphInc MemInc PeriphDataAlignment MemDataAlignment Mode Priority FIFOMode FIFOThreshold MemBurst PeriphBurst',
  DMA_HandleTypeDef:'Instance Init:DMA_InitTypeDef Parent State ErrorCode XferCpltCallback XferHalfCpltCallback XferM1CpltCallback XferM1HalfCpltCallback XferErrorCallback XferAbortCallback',
  USART_InitTypeDef:'BaudRate WordLength StopBits Parity Mode CLKPolarity CLKPhase CLKLastBit',
  USART_HandleTypeDef:'Instance Init:USART_InitTypeDef hdmatx hdmarx State ErrorCode',
  DCMI_InitTypeDef:'SynchroMode PCKPolarity VSPolarity HSPolarity CaptureRate ExtendedDataMode SyncroCode JPEGMode ByteSelectMode ByteSelectStart LineSelectMode LineSelectStart',
  DCMI_HandleTypeDef:'Instance Init:DCMI_InitTypeDef DMA_Handle State ErrorCode XferCount XferSize XferTransferNumber pBuffPtr',
  SD_InitTypeDef:'ClockEdge ClockBypass ClockPowerSave BusWide HardwareFlowControl ClockDiv',
  HAL_SD_CardInfoTypeDef:'CardType CardVersion Class RelCardAdd BlockNbr BlockSize LogBlockNbr LogBlockSize',
  SD_HandleTypeDef:'Instance Init:SD_InitTypeDef hdmatx hdmarx State ErrorCode SdCard:HAL_SD_CardInfoTypeDef Context',
  // FatFs R0.12 object layouts as interpreter values; file state lives in the SD card model.
  FATFS:'fs_type pdrv n_fats wflag fsi_flag id n_rootdir csize n_fatent fsize volbase fatbase dirbase database winsect free_clst last_clst',
  FIL:'obj_id flag err fptr clust sect fsize sclust',
  DIR:'obj_id dptr clust sect blk_ofs',
  FILINFO:'fsize fdate ftime fattrib fname:char[13]'
};
// STM32F1 HAL layouts that differ from the F4 (stm32f1xx_hal_*.h); F4-only types are not declared for F1 sources.
const F1_STRUCTS={GPIO_InitTypeDef:'Pin Mode Pull Speed',RCC_PLLInitTypeDef:'PLLState PLLSource PLLMUL',
  RCC_OscInitTypeDef:'OscillatorType HSEState HSEPredivValue LSEState HSIState HSICalibrationValue LSIState PLL:RCC_PLLInitTypeDef',
  RCC_PeriphCLKInitTypeDef:'PeriphClockSelection RTCClockSelection AdcClockSelection UsbClockSelection',
  ADC_InitTypeDef:'DataAlign ScanConvMode ContinuousConvMode NbrOfConversion DiscontinuousConvMode NbrOfDiscConversion ExternalTrigConv',
  ADC_ChannelConfTypeDef:'Channel Rank SamplingTime',DMA_InitTypeDef:'Direction PeriphInc MemInc PeriphDataAlignment MemDataAlignment Mode Priority',
  RTC_InitTypeDef:'AsynchPrediv OutPut',RTC_TimeTypeDef:'Hours Minutes Seconds',RTC_AlarmTypeDef:'AlarmTime:RTC_TimeTypeDef Alarm',RTC_HandleTypeDef:'Instance Init:RTC_InitTypeDef DateToUpdate:RTC_DateTypeDef Lock State'};
const F4_ONLY_STRUCTS=/^(I2S_|RCC_PLLI2S|DCMI_|SD_|HAL_SD_|DAC_)/;
export function halStructs(family){
  const f1=familyProfile(family).pinMux==='remap';
  return f1?{...Object.fromEntries(Object.entries(HAL_STRUCTS).filter(([name])=>!F4_ONLY_STRUCTS.test(name))),...F1_STRUCTS}:HAL_STRUCTS;
}
export const HAL_ALIASES={FRESULT:'int',UINT:'uint32_t',BYTE:'uint8_t',WORD:'uint16_t',DWORD:'uint32_t',QWORD:'uint32_t',FSIZE_t:'uint32_t',LBA_t:'uint32_t',TCHAR:'char',DSTATUS:'uint8_t',
  HAL_SD_CardStateTypeDef:'uint32_t',HAL_DMA_StateTypeDef:'int',HAL_UART_StateTypeDef:'int',HAL_USART_StateTypeDef:'int',HAL_DCMI_StateTypeDef:'int',HAL_SD_StateTypeDef:'int',HAL_SPI_StateTypeDef:'int',HAL_I2C_StateTypeDef:'int',
  HAL_LockTypeDef:'int',HAL_RTCStateTypeDef:'int',HAL_DAC_StateTypeDef:'int',FunctionalState:'int',FlagStatus:'int',ITStatus:'int',IRQn_Type:'int',HAL_DMA_LevelCompleteTypeDef:'int',HAL_DMA_CallbackIDTypeDef:'int',HAL_UART_RxEventTypeTypeDef:'uint32_t'};
const systemHeaders=prefix=>new Set(['main.h',`${prefix}_hal.h`,`${prefix}.h`,'stdint.h','stddef.h','stdbool.h','string.h','stdlib.h','stdio.h','math.h',`${prefix}_it.h`,`${prefix}_hal_conf.h`,'fatfs.h','ff.h','ff_gen_drv.h','diskio.h','sd_diskio.h','user_diskio.h','bsp_driver_sd.h','fatfs_platform.h',...['gpio','gpio_ex','uart','usart','tim','tim_ex','adc','adc_ex','i2c','spi','rcc','rcc_ex','cortex','pwr','pwr_ex','dma','dma_ex','dcmi','sd','uart_ex'].map(n=>`${prefix}_hal_${n}.h`)]);
// Replaces NAME(args) of function-like macros in a code line (comments already removed; string and character literals
// are left alone). Arguments are split at top-level commas; nested and repeated use is expanded up to 20 rounds.
/**
 * Whether an #if / #elif condition holds: defined(X) / defined X, macros (their value, an empty one counts as 1), integer
 * literals and the integer operators. A name that is not a macro is 0, as in C.
 */
export function evalCondition(text,definitions){
  const bad=()=>{throw new Error('이 #if 조건식은 지원하지 않습니다.');},tokens=[];
  const scan=(src,depth)=>{
    if(depth>20)bad();
    const re=/\s*(?:(0[xX][0-9a-fA-F]+|\d+)[uUlL]*|([A-Za-z_]\w*)|(&&|\|\||==|!=|<=|>=|<<|>>|[-+*/%<>!~&|^?:()]))/y,name=/\s*(?:\(\s*(\w+)\s*\)|(\w+))/y;
    let at=0;
    while(src.slice(at).trim()){
      re.lastIndex=at;const m=re.exec(src);if(!m)bad();at=re.lastIndex;
      if(m[1]!==undefined)tokens.push(Number(m[1]));
      else if(m[3])tokens.push(m[3]);
      else if(m[2]==='defined'){name.lastIndex=at;const d=name.exec(src);if(!d)bad();at=name.lastIndex;tokens.push(definitions.has(d[1]??d[2])?1:0);}
      else if(!definitions.has(m[2]))tokens.push(0);
      else {const value=definitions.get(m[2]);if(value==='')tokens.push(1);else {tokens.push('(');scan(value,depth+1);tokens.push(')');}}
    }
  };
  scan(text,0);
  let i=0;const peek=()=>tokens[i],take=()=>tokens[i++];
  const LEVELS=[['||'],['&&'],['|'],['^'],['&'],['==','!='],['<','>','<=','>='],['<<','>>'],['+','-'],['*','/','%']];
  const apply=(op,a,b)=>{switch(op){case '||':return a||b?1:0;case '&&':return a&&b?1:0;case '|':return a|b;case '^':return a^b;case '&':return a&b;case '==':return a===b?1:0;case '!=':return a!==b?1:0;case '<':return a<b?1:0;case '>':return a>b?1:0;case '<=':return a<=b?1:0;case '>=':return a>=b?1:0;case '<<':return a<<b;case '>>':return a>>b;case '+':return a+b;case '-':return a-b;case '*':return a*b;default:if(b===0)bad();return op==='/'?Math.trunc(a/b):a%b;}};
  const unary=()=>{const t=take();if(typeof t==='number')return t;if(t==='('){const v=ternary();if(take()!==')')bad();return v;}if(t==='!')return unary()?0:1;if(t==='-')return -unary();if(t==='+')return unary();if(t==='~')return ~unary();return bad();};
  const binary=level=>{if(level===LEVELS.length)return unary();let a=binary(level+1);while(LEVELS[level].includes(peek())){const op=take();a=apply(op,a,binary(level+1));}return a;};
  function ternary(){const c=binary(0);if(peek()!=='?')return c;take();const yes=ternary();if(take()!==':')bad();const no=ternary();return c?yes:no;}
  const value=ternary();if(i!==tokens.length)bad();return value!==0;
}
export function expandMacros(line,macros){
  if(!macros.size)return line;
  for(let round=0;round<20;round++){
    let out='',i=0,changed=false;
    while(i<line.length){
      const c=line[i];
      if(c==='"'||c==="'"){let j=i+1;while(j<line.length&&line[j]!==c){if(line[j]==='\\')j++;j++;}out+=line.slice(i,j+1);i=j+1;continue;}
      const id=/^[A-Za-z_]\w*/.exec(line.slice(i));
      if(!id){out+=c;i++;continue;}
      const macro=macros.get(id[0]),after=i+id[0].length,open=/^\s*\(/.exec(line.slice(after));
      // A member of the same name (s.ADD(…), p->ADD(…)) is not the macro.
      if(!macro||!open||/(\.|->)\s*$/.test(out)){out+=id[0];i=after;continue;}
      let j=after+open[0].length,depth=1,args=[],start=j;
      for(;j<line.length&&depth;j++){const ch=line[j];if(ch==='"'||ch==="'"){let k=j+1;while(k<line.length&&line[k]!==ch){if(line[k]==='\\')k++;k++;}j=k;continue;}if(ch==='(')depth++;else if(ch===')'){depth--;if(!depth)break;}else if(ch===','&&depth===1){args.push(line.slice(start,j));start=j+1;}}
      if(depth){out+=id[0];i=after;continue;}
      args.push(line.slice(start,j));if(args.length===1&&!args[0].trim()&&!macro.params.length)args=[];
      if(args.length!==macro.params.length)throw new Error(`매크로 ${id[0]}의 인자는 ${macro.params.length}개입니다.`);
      const map=new Map(macro.params.map((p,n)=>[p,args[n].trim()]));
      out+='('+macro.body.replace(/[A-Za-z_]\w*/g,w=>map.has(w)?map.get(w):w)+')';i=j+1;changed=true;
    }
    line=out;if(!changed)return line;
  }
  throw new Error('매크로가 자기 자신을 반복해서 부릅니다.');
}
export function prepareHalSource(source,files=[],options={}){
  if(typeof source!=='string'||source.length>300000||!Array.isArray(files)||files.length>MAX_SOURCE_FILES)throw new Error('HAL 소스 크기 또는 파일 수 한도를 넘었습니다.');
  const map=new Map();let total=source.length;
  const armOnly=name=>/^(Drivers|Middlewares)\//.test(name)||/^(syscalls|sysmem|system_stm32\w+)\.c$/.test(baseName(name));
  for(const file of files){if(file&&typeof file.name==='string'&&armOnly(file.name))continue;if(!file||typeof file.name!=='string'||!SOURCE_PATH.test(file.name)||!/\.[ch]$/.test(file.name)||typeof file.text!=='string'||map.has(file.name))throw new Error('소스 파일 이름이 중복되거나 올바르지 않습니다.');total+=file.text.length;if(total>300000)throw new Error('HAL 소스 전체는 300 KB 이하로 선택하세요.');map.set(file.name,file.text);}
  map.set('main.c',source);
  const hal=familyProfile(options.family).hal,SYSTEM_HEADERS=systemHeaders(hal.prefix);
  const definitions=new Map([[hal.define,'1'],['USE_HAL_DRIVER','1']]),stack=[],included=new Set(),macros=new Map();
  const preprocess=(text,name)=>{
    if(stack.includes(name))throw new Error(`순환 include: ${name}`);stack.push(name);const output=[],locations=[],condition=[];let active=true,inComment=false,currentLine=1;
    const append=output.push.bind(output);output.push=value=>{if(typeof value==='object'){locations.push(...value.locations);return append(value.text);}locations.push({file:name,line:currentLine});return append(value);};
    for(const [index,line]of text.split(/\r?\n/).entries()){
      currentLine=index+1;
      // Strip comments without touching string/character literals or line numbering.
      let clean='',quote='',escape=false;
      for(let i=0;i<line.length;i++){const c=line[i],next=line[i+1];if(inComment){if(c==='*'&&next==='/'){inComment=false;i++;}continue;}if(quote){clean+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;clean+=c;}else if(c==='/'&&next==='*'){inComment=true;i++;clean+=' ';}else if(c==='/'&&next==='/')break;else clean+=c;}
      const directive=/^\s*#\s*(\w+)\s*(.*)$/.exec(clean),error=message=>{const e=new Error(`${name}:${index+1}: ${message}`);e.location={file:name,line:index+1};throw e;};
      if(!directive){output.push(active?expandMacros(clean,macros):'');continue;}
      const [,op,arg]=directive;
      if(['ifdef','ifndef','if'].includes(op)){
        let yes;if(op==='ifdef'||op==='ifndef')yes=definitions.has(arg.trim())===(op==='ifdef');
        // A condition inside a skipped block is not evaluated (it may use what the skipped code would have defined).
        else if(!active)yes=false;
        else try{yes=evalCondition(arg,definitions);}catch(e){error(e.message);}
        condition.push({parent:active,yes,hadElse:false});active=active&&yes;output.push('');continue;
      }
      // #elif: taken when no earlier branch of this #if was; c.yes then records that a branch has been taken.
      if(op==='elif'){const c=condition.at(-1);if(!c||c.hadElse)error('#elif 위치 오류');let yes=false;if(c.parent&&!c.yes){try{yes=evalCondition(arg,definitions);}catch(e){error(e.message);}}active=c.parent&&yes;if(yes)c.yes=true;output.push('');continue;}
      if(op==='else'){const c=condition.at(-1);if(!c||c.hadElse)error('#else 위치 오류');c.hadElse=true;active=c.parent&&!c.yes;output.push('');continue;}
      if(op==='endif'){const c=condition.pop();if(!c)error('#endif 위치 오류');active=c.parent;output.push('');continue;}
      if(!active){output.push('');continue;}
      if(op==='include'){
        const m=/^[<"]([^>"]+)[>"]\s*$/.exec(arg);if(!m)error('include 형식 오류');
        // A project file by its name or path ("app.h", "../Inc/app.h", "Inc/app.h"), whatever folder it is kept in.
        const file=resolveInclude(map.keys(),m[1],name)??m[1];
        if(included.has(file)){output.push('');continue;}
        if(map.has(file)){included.add(file);output.push(preprocess(map.get(file),file));}
        else if(SYSTEM_HEADERS.has(baseName(file))){output.push('');}
        else error(`지원하지 않거나 선택하지 않은 헤더: ${file}`);
      }else if(op==='define'){
        // #define NAME(a, b) body — a function-like macro (no space before the parenthesis): expanded as text where it is used.
        const fn=/^(\w+)\(([^)]*)\)\s*(.*)$/.exec(arg);
        if(fn){const params=fn[2].split(',').map(p=>p.trim()).filter(Boolean);if(params.some(p=>!/^[A-Za-z_]\w*$/.test(p)))error('가변 인자(...) 매크로는 지원하지 않습니다.');if(/#/.test(fn[3]))error('매크로의 # / ## 연산자는 지원하지 않습니다.');macros.set(fn[1],{params,body:fn[3]});output.push('');continue;}
        const m=/^(\w+)(.*)$/.exec(arg);if(!m)error('#define 형식 오류');const value=m[2].trim();
        if(definitions.has(m[1])){if(definitions.get(m[1])!==value)error(`매크로 재정의: ${m[1]}`);output.push('');continue;}
        definitions.set(m[1],value);output.push(value?`#define ${m[1]} ${value}`:'');
      }else if(op==='pragma'&&arg.trim()==='once')output.push('');
      else error(`지원하지 않는 전처리 지시문: #${op}`);
    }
    if(condition.length||inComment)throw new Error(`${name}: 닫히지 않은 조건부 전처리 또는 주석`);stack.pop();return {text:output.join('\n'),locations};
  };
  const chunks=[preprocess(source,'main.c')];
  for(const [name,text]of map)if(name.endsWith('.c')&&name!=='main.c')chunks.push(preprocess(text,name));
  const text=chunks.map(c=>c.text).join('\n'),sourceMap=chunks.flatMap(c=>c.locations);return options.withMap?{text,sourceMap}:text;
}
export function compileHal(source,files=[],family){
  const structs=Object.fromEntries(Object.entries(halStructs(family)).map(([name,fields])=>[name,fields.split(' ').map(f=>{const [key,spec='uint32_t']=f.split(':'),m=/^(\w+)\[(\d+)\]$/.exec(spec);return m?{name:key,type:m[1],constant:false,array:true,size:Number(m[2])}:{name:key,type:spec,constant:false};})]));
  const prepared=prepareHalSource(source,files,{withMap:true,family});
  try{return compile(prepared.text,{hal:true,structs,aliases:HAL_ALIASES,sourceMap:prepared.sourceMap});}
  catch(error){if(!error.location){const m=/^(\d+)행:/.exec(error.message);if(m){error.location=prepared.sourceMap[Number(m[1])-1];if(error.location)error.message=error.message.replace(/^\d+행:/,`${error.location.file}:${error.location.line}:`);}}throw error;}
}
