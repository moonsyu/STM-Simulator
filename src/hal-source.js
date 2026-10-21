import {compile} from './parser.js';
import {familyProfile} from './mcu-family.js';

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
  RCC_PeriphCLKInitTypeDef:'PeriphClockSelection PLLI2S:RCC_PLLI2SInitTypeDef PLLI2SDivQ I2sApb1ClockSelection',

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
  ADC_ChannelConfTypeDef:'Channel Rank SamplingTime',DMA_InitTypeDef:'Direction PeriphInc MemInc PeriphDataAlignment MemDataAlignment Mode Priority'};
const F4_ONLY_STRUCTS=/^(I2S_|RCC_PLLI2S|DCMI_|SD_|HAL_SD_)/;
export function halStructs(family){
  const f1=familyProfile(family).pinMux==='remap';
  return f1?{...Object.fromEntries(Object.entries(HAL_STRUCTS).filter(([name])=>!F4_ONLY_STRUCTS.test(name))),...F1_STRUCTS}:HAL_STRUCTS;
}
export const HAL_ALIASES={FRESULT:'int',UINT:'uint32_t',BYTE:'uint8_t',WORD:'uint16_t',DWORD:'uint32_t',QWORD:'uint32_t',FSIZE_t:'uint32_t',LBA_t:'uint32_t',TCHAR:'char',DSTATUS:'uint8_t',
  HAL_SD_CardStateTypeDef:'uint32_t',HAL_DMA_StateTypeDef:'int',HAL_UART_StateTypeDef:'int',HAL_USART_StateTypeDef:'int',HAL_DCMI_StateTypeDef:'int',HAL_SD_StateTypeDef:'int',HAL_SPI_StateTypeDef:'int',HAL_I2C_StateTypeDef:'int',
  HAL_LockTypeDef:'int',FunctionalState:'int',FlagStatus:'int',ITStatus:'int',IRQn_Type:'int',HAL_DMA_LevelCompleteTypeDef:'int',HAL_DMA_CallbackIDTypeDef:'int',HAL_UART_RxEventTypeTypeDef:'uint32_t'};
const systemHeaders=prefix=>new Set(['main.h',`${prefix}_hal.h`,`${prefix}.h`,'stdint.h','stddef.h','stdbool.h','string.h','stdio.h','math.h',`${prefix}_it.h`,`${prefix}_hal_conf.h`,'fatfs.h','ff.h','ff_gen_drv.h','diskio.h','sd_diskio.h','user_diskio.h','bsp_driver_sd.h','fatfs_platform.h',...['gpio','gpio_ex','uart','usart','tim','tim_ex','adc','adc_ex','i2c','spi','rcc','rcc_ex','cortex','pwr','pwr_ex','dma','dma_ex','dcmi','sd','uart_ex'].map(n=>`${prefix}_hal_${n}.h`)]);
export function prepareHalSource(source,files=[],options={}){
  if(typeof source!=='string'||source.length>300000||!Array.isArray(files)||files.length>40)throw new Error('HAL 소스 크기 또는 파일 수 한도를 넘었습니다.');
  const map=new Map();let total=source.length;
  for(const file of files){if(!file||typeof file.name!=='string'||! /^[\w.-]+\.[ch]$/.test(file.name)||typeof file.text!=='string'||map.has(file.name))throw new Error('소스 파일 이름이 중복되거나 올바르지 않습니다.');total+=file.text.length;if(total>300000)throw new Error('HAL 소스 전체는 300 KB 이하로 선택하세요.');map.set(file.name,file.text);}
  map.set('main.c',source);
  const hal=familyProfile(options.family).hal,SYSTEM_HEADERS=systemHeaders(hal.prefix);
  const definitions=new Map([[hal.define,'1'],['USE_HAL_DRIVER','1']]),stack=[],included=new Set();
  const preprocess=(text,name)=>{
    if(stack.includes(name))throw new Error(`순환 include: ${name}`);stack.push(name);const output=[],locations=[],condition=[];let active=true,inComment=false,currentLine=1;
    const append=output.push.bind(output);output.push=value=>{if(typeof value==='object'){locations.push(...value.locations);return append(value.text);}locations.push({file:name,line:currentLine});return append(value);};
    for(const [index,line]of text.split(/\r?\n/).entries()){
      currentLine=index+1;
      // Strip comments without touching string/character literals or line numbering.
      let clean='',quote='',escape=false;
      for(let i=0;i<line.length;i++){const c=line[i],next=line[i+1];if(inComment){if(c==='*'&&next==='/'){inComment=false;i++;}continue;}if(quote){clean+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;clean+=c;}else if(c==='/'&&next==='*'){inComment=true;i++;clean+=' ';}else if(c==='/'&&next==='/')break;else clean+=c;}
      const directive=/^\s*#\s*(\w+)\s*(.*)$/.exec(clean),error=message=>{const e=new Error(`${name}:${index+1}: ${message}`);e.location={file:name,line:index+1};throw e;};
      if(!directive){output.push(active?clean:'');continue;}
      const [,op,arg]=directive;
      if(['ifdef','ifndef','if'].includes(op)){
        let yes;if(op==='ifdef'||op==='ifndef')yes=definitions.has(arg.trim())===(op==='ifdef');
        else {const a=arg.trim(),match=/^(!?)defined\s*\(?\s*(\w+)\s*\)?$/.exec(a);if(match)yes=definitions.has(match[2])!==!!match[1];else if(/^[01]$/.test(a))yes=a==='1';else if(/^[A-Za-z_]\w*$/.test(a))yes=definitions.has(a)&&definitions.get(a)!=='0';else error('이 #if 조건식은 지원하지 않습니다.');}
        condition.push({parent:active,yes,hadElse:false});active=active&&yes;output.push('');continue;
      }
      if(op==='else'){const c=condition.at(-1);if(!c||c.hadElse)error('#else 위치 오류');c.hadElse=true;active=c.parent&&!c.yes;output.push('');continue;}
      if(op==='endif'){const c=condition.pop();if(!c)error('#endif 위치 오류');active=c.parent;output.push('');continue;}
      if(!active){output.push('');continue;}
      if(op==='include'){
        const m=/^[<"]([^>"]+)[>"]\s*$/.exec(arg);if(!m)error('include 형식 오류');const file=m[1];
        if(included.has(file)){output.push('');continue;}
        if(map.has(file)){included.add(file);output.push(preprocess(map.get(file),file));}
        else if(SYSTEM_HEADERS.has(file)){output.push('');}
        else error(`지원하지 않거나 선택하지 않은 헤더: ${file}`);
      }else if(op==='define'){
        const m=/^(\w+)(.*)$/.exec(arg);if(!m||m[2].startsWith('('))error('함수형 매크로는 지원하지 않습니다.');const value=m[2].trim();
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
