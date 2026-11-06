import {SERIAL_IDS,isSerial,serialAf,serialHandle,serialFunction} from './serial-config.js';
import {TIMER_IDS,isTimer,timerAf} from './timer-config.js';
import {DEFAULT_TIMER_CLOCK_HZ} from './mcu-defaults.js';
import {familyProfile,remapFor} from './mcu-family.js';
import {dmaHandle,irqHandlers,handlerText} from './irq-handlers.js';
import {nvicGroup,tickPriority,NVIC_GROUP_DEFAULT,TICK_PRIORITY_DEFAULT} from './nvic-config.js';
import {gpioMode,hasSpeed,pinSpeed} from './gpio-config.js';
import {clockFrequencies,flashLatency,needsOverDrive} from './clock-tree.js';
import {adcSamplingMacro,adcSamplingOf} from './mcu-config.js';
// SystemClock_Config from the project's Clock Configuration, as CubeMX writes it (HSE = ST-LINK MCO in BYPASS mode).
function treeClockLines(config,f1){
  const t=config.clock,q=clockFrequencies(config.family,t),pll=t.sysclkSource==='PLLCLK';
  const hse=t.sysclkSource==='HSE'||pll&&t.pllSource==='HSE',hsi=t.sysclkSource==='HSI'||pll&&t.pllSource==='HSI';
  const types=[...(hsi?['RCC_OSCILLATORTYPE_HSI']:[]),...(hse?['RCC_OSCILLATORTYPE_HSE']:[])];
  const lines=['void SystemClock_Config(void) {','  RCC_OscInitTypeDef osc = {0};','  RCC_ClkInitTypeDef clk = {0};',
    ...(f1?[]:['  __HAL_RCC_PWR_CLK_ENABLE();','  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);']),
    `  osc.OscillatorType = ${types.join(' | ')};`,
    ...(hse?['  osc.HSEState = RCC_HSE_BYPASS;',...(f1?[`  osc.HSEPredivValue = RCC_HSE_PREDIV_DIV${t.hsePrediv};`]:[])]:[]),
    ...(hsi?['  osc.HSIState = RCC_HSI_ON;','  osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;']:[]),
    ...(!pll?['  osc.PLL.PLLState = RCC_PLL_OFF;']:f1?['  osc.PLL.PLLState = RCC_PLL_ON;',`  osc.PLL.PLLSource = ${t.pllSource==='HSE'?'RCC_PLLSOURCE_HSE':'RCC_PLLSOURCE_HSI_DIV2'};`,`  osc.PLL.PLLMUL = RCC_PLL_MUL${t.pllMul};`]
      :['  osc.PLL.PLLState = RCC_PLL_ON;',`  osc.PLL.PLLSource = RCC_PLLSOURCE_${t.pllSource};`,`  osc.PLL.PLLM = ${t.pllM};`,`  osc.PLL.PLLN = ${t.pllN};`,`  osc.PLL.PLLP = RCC_PLLP_DIV${t.pllP};`,`  osc.PLL.PLLQ = ${t.pllQ};`,'  osc.PLL.PLLR = 2;']),
    '  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();',
    ...(needsOverDrive(config.family,q.hclk)?['  /* HCLK above 168 MHz: the regulator runs in over-drive mode. */','  if (HAL_PWREx_EnableOverDrive() != HAL_OK) Error_Handler();']:[]),
    '  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;',
    `  clk.SYSCLKSource = RCC_SYSCLKSOURCE_${t.sysclkSource};`,`  clk.AHBCLKDivider = RCC_SYSCLK_DIV${t.ahb};`,
    `  clk.APB1CLKDivider = RCC_HCLK_DIV${t.apb1};`,`  clk.APB2CLKDivider = RCC_HCLK_DIV${t.apb2};`,
    `  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_${flashLatency(config.family,q.hclk)}) != HAL_OK) Error_Handler();`];
  if(f1&&config.peripherals.ADC1?.enabled)lines.push('  RCC_PeriphCLKInitTypeDef periph = {0};','  periph.PeriphClockSelection = RCC_PERIPHCLK_ADC;',`  periph.AdcClockSelection = RCC_ADCPCLK2_DIV${t.adcPrescaler};`,'  if (HAL_RCCEx_PeriphCLKConfig(&periph) != HAL_OK) Error_Handler();');
  return [...lines,'}'];
}
const mhzText=hz=>`${Number((hz/1e6).toFixed(3))} MHz`;
// DMA handle names / link fields / data widths per request (CubeMX naming).
const dmaLink=request=>request==='ADC1'||request==='DCMI'?'DMA_Handle':/_CH(\d)$/.test(request)?`hdma[TIM_DMA_ID_CC${/_CH(\d)$/.exec(request)[1]}]`:/_RX$/.test(request)?'hdmarx':'hdmatx';
const dmaWidth=request=>request==='ADC1'?['HALFWORD','HALFWORD']:/^TIM\d_CH/.test(request)?['WORD','HALFWORD']:request==='DCMI'||request.startsWith('SDIO')?['WORD','WORD']:['BYTE','BYTE'];
const dmaDir=request=>request==='MEMTOMEM'?'DMA_MEMORY_TO_MEMORY':/_RX$|^ADC1$|^DCMI$/.test(request)?'DMA_PERIPH_TO_MEMORY':'DMA_MEMORY_TO_PERIPH';
const dmaOwner=request=>request==='MEMTOMEM'?null:request==='ADC1'||request==='DCMI'?request:request.startsWith('SDIO')?'SDIO':request.replace(/_(RX|TX|CH\d)$/,'');
function dmaLines(name,request,d,f1=false){
  const [p,m]=dmaWidth(request),set=(k,v)=>`  ${name}.Init.${k} = ${v};`;
  return [`  ${name}.Instance = ${d.stream};`,...(f1?[]:[set('Channel','DMA_CHANNEL_'+d.channel)]),set('Direction',dmaDir(request)),set('PeriphInc',request==='MEMTOMEM'?'DMA_PINC_ENABLE':'DMA_PINC_DISABLE'),set('MemInc','DMA_MINC_ENABLE'),
    set('PeriphDataAlignment','DMA_PDATAALIGN_'+p),set('MemDataAlignment','DMA_MDATAALIGN_'+m),set('Mode',d.mode==='circular'?'DMA_CIRCULAR':'DMA_NORMAL'),set('Priority','DMA_PRIORITY_'+d.priority.toUpperCase()),
    ...(f1?[]:[set('FIFOMode',request.startsWith('SDIO')?'DMA_FIFOMODE_ENABLE':'DMA_FIFOMODE_DISABLE')]),`  if (HAL_DMA_Init(&${name}) != HAL_OK) Error_Handler();`];
}

// CubeMX sets these in HAL_MspInit (priority group) and stm32xxxx_hal_conf.h (TICK_INT_PRIORITY); a single main.c sets
// them right after HAL_Init(). HAL_InitTick() keeps the priority when SystemClock_Config() reconfigures SysTick.
const nvicInit=config=>[...(nvicGroup(config)!==NVIC_GROUP_DEFAULT?[`  HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_${nvicGroup(config)});`]:[]),...(tickPriority(config)!==TICK_PRIORITY_DEFAULT?[`  HAL_InitTick(${tickPriority(config)});`]:[])];
export function clockPlan(hz){
  if(hz===DEFAULT_TIMER_CLOCK_HZ)return {source:'HSI',apb1:1,latency:0};
  // HSI removes any dependency on the Nucleo ST-LINK MCO / HSE jumper.
  // APB1=/2, TIMx=HCLK, APB2=/1; F446 APB1 is limited to 45 MHz.
  for(const divider of [4,2,6,8]){const n=hz*divider/1000000;if(hz<=90000000&&Number.isInteger(n)&&n>=100&&n<=432)return {source:'PLLCLK',apb1:2,n,divider,latency:Math.ceil(hz/30000000)-1};}
  throw new Error('main.c 생성: HSI 기본 16 MHz 또는 HSI PLL로 만들 수 있는 APB1 타이머 클록(12.5~90 MHz)을 사용하세요.');
}
// STM32F103: SYSCLK = HSI 8 MHz, or HSI/2 × PLLMUL (2..16). APB1 ≤ 36 MHz, so above that it runs at /2 and the
// timer clocks double back to SYSCLK: the timer clock is always SYSCLK. Flash: 0 WS ≤ 24 MHz, 1 WS ≤ 48 MHz, 2 WS above.
export function clockPlanF1(hz){
  const latency=hz<=24000000?0:hz<=48000000?1:2;
  if(hz===8000000)return {source:'HSI',apb1:1,latency:0};
  const mul=hz/4000000;
  if(Number.isInteger(mul)&&mul>=2&&mul<=16)return {source:'PLLCLK',apb1:hz>36000000?2:1,mul,latency};
  throw new Error('main.c 생성: STM32F103은 HSI 8 MHz 또는 HSI/2 PLL로 만들 수 있는 8~64 MHz(4 MHz 단위) 타이머 클록을 사용하세요.');
}
export function generateMain(config,{minimal=false,legacyGpio=false}={}){
  const family=familyProfile(config.family),f1=family.pinMux==='remap';
  const tree=config.clock?clockFrequencies(config.family,config.clock):null,clock=tree?null:f1?clockPlanF1(config.timerClockHz):clockPlan(config.timerClockHz),pins=Object.entries(config.pins).filter(([,p])=>!['Reset','Reserved'].includes(p.function)),irqs=Object.entries(config.nvic).filter(([,p])=>p.enabled),gpioInit=!minimal||pins.length>0||irqs.length>0,lines=['#include "main.h"',...(minimal?[]:['#include <stdio.h>']),'/* USER CODE BEGIN Includes */','/* USER CODE END Includes */','',
    `/* Copy this main.c into a CubeIDE ${family.id} project with matching`,
    ' * pin / peripheral / NVIC settings and Cube-generated IRQ / MSP files.',
    ' * Clock: '+(tree?`${config.clock.sysclkSource==='PLLCLK'?config.clock.pllSource+' PLL':config.clock.sysclkSource+' direct'}, SYSCLK ${mhzText(tree.sysclk)}, HCLK ${mhzText(tree.hclk)}, APB1 ${mhzText(tree.pclk1)} (timers ${mhzText(tree.tim1)}), APB2 ${mhzText(tree.pclk2)} (timers ${mhzText(tree.tim2)}).`:(clock.source==='HSI'?'HSI direct (PLL off)':'HSI PLL')+', APB1 timer clock = '+config.timerClockHz+' Hz.'),
    ...(minimal?[' */']:[' * printf: SWV ITM port 0 (enable SWV in the debugger). UART uses its pins.',
    ' * With newlib-nano, enable -u _printf_float for floating-point printf. */']),''];
  const sync=id=>isSerial(id)&&config.peripherals[id]?.mode==='synchronous',dma=Object.entries(config.dma||{});
  const handles={...Object.fromEntries(Object.keys(family.serial).map(id=>[id,sync(id)?['USART','husart'+id.replace(/\D/g,'')]:['UART',serialHandle(id)]])),I2C1:['I2C','hi2c1'],SPI1:['SPI','hspi1'],ADC1:['ADC','hadc1'],SDIO:['SD','hsd'],DCMI:['DCMI','hdcmi'],...Object.fromEntries(Object.keys(family.timers).map(id=>[id,['TIM','htim'+id.slice(3)]]))};
  const active=Object.entries(config.peripherals).filter(([,p])=>p.enabled),serials=active.filter(([id])=>isSerial(id)),timers=active.filter(([id])=>isTimer(id));
  for(const [id]of active){const [type,name]=handles[id];lines.push(`${type}_HandleTypeDef ${name};`);}
  for(const [request]of dma)lines.push(`DMA_HandleTypeDef ${dmaHandle(request)};`);
  const initName=id=>id==='SDIO'?'MX_SDIO_SD_Init':`MX_${id}${isSerial(id)&&!sync(id)?'_UART':''}_Init`;
  lines.push('/* USER CODE BEGIN PV */','/* USER CODE END PV */','','void SystemClock_Config(void);','void Error_Handler(void);',...(gpioInit?['static void MX_GPIO_Init(void);']:[]),...(dma.length?['static void MX_DMA_Init(void);']:[]),...active.map(([id])=>`static void ${initName(id)}(void);`),'','/* USER CODE BEGIN 0 */','/* USER CODE END 0 */','',
    'int main(void) {','  HAL_Init();',...nvicInit(config),'  SystemClock_Config();',...(gpioInit?['  MX_GPIO_Init();']:[]),...(dma.length?['  MX_DMA_Init();']:[]),...active.map(([id])=>`  ${initName(id)}();`),'  /* USER CODE BEGIN 2 */');
  if(!minimal)for(const [id,p]of timers){const h=handles[id][1];
    if(p.mode==='encoder')lines.push(`  HAL_TIM_Encoder_Start(&${h}, TIM_CHANNEL_ALL);`);
    else if(['pwm','oc','capture'].includes(p.mode)){for(const value of Object.values(config.pins)){const match=new RegExp('^'+id+'_CH([1-4])$').exec(value.function);if(match)lines.push(`  HAL_TIM_${p.mode==='pwm'?'PWM_Start':(p.mode==='oc'?'OC':'IC')+'_Start'+(config.nvic[id+'_IRQn']?.enabled?'_IT':'')}(&${h}, TIM_CHANNEL_${match[1]});`);}}
    else if(config.nvic[id+'_IRQn']?.enabled)lines.push(`  HAL_TIM_Base_Start_IT(&${h});`);
  }
  if(!minimal&&serials.some(([id])=>!sync(id))){lines.push('  uint8_t message[] = "HAL ready\\r\\n";');for(const [id]of serials)if(!sync(id))lines.push(`  HAL_UART_Transmit(&${serialHandle(id)}, message, sizeof(message)-1, 100);`);}
  lines.push('  /* USER CODE END 2 */','  while (1) {','    /* USER CODE BEGIN 3 */');
  const output=Object.entries(config.pins).find(([,p])=>p.function==='GPIO_Output');if(!minimal&&output)lines.push(`    HAL_GPIO_TogglePin(GPIO${output[0][1]}, GPIO_PIN_${output[0].slice(2)});`);
  lines.push(...(minimal?[]:['    HAL_Delay(500);']),'    /* USER CODE END 3 */','  }','}','',
  );
  if(tree)lines.push(...treeClockLines(config,f1));else{lines.push('void SystemClock_Config(void) {','  RCC_OscInitTypeDef osc = {0};','  RCC_ClkInitTypeDef clk = {0};',
    ...(f1?[]:['  __HAL_RCC_PWR_CLK_ENABLE();','  __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);']),
    '  osc.OscillatorType = RCC_OSCILLATORTYPE_HSI;','  osc.HSIState = RCC_HSI_ON;','  osc.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;',
    ...(clock.source==='HSI'?['  osc.PLL.PLLState = RCC_PLL_OFF;']:f1?['  osc.PLL.PLLState = RCC_PLL_ON;','  osc.PLL.PLLSource = RCC_PLLSOURCE_HSI_DIV2;',`  osc.PLL.PLLMUL = RCC_PLL_MUL${clock.mul};`]:['  osc.PLL.PLLState = RCC_PLL_ON;','  osc.PLL.PLLSource = RCC_PLLSOURCE_HSI;','  osc.PLL.PLLM = 16;',`  osc.PLL.PLLN = ${clock.n};`,`  osc.PLL.PLLP = RCC_PLLP_DIV${clock.divider};`,'  osc.PLL.PLLQ = 7;','  osc.PLL.PLLR = 2;']),
    '  if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();',
    '  clk.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;',
    `  clk.SYSCLKSource = RCC_SYSCLKSOURCE_${clock.source};`,'  clk.AHBCLKDivider = RCC_SYSCLK_DIV1;',
    `  clk.APB1CLKDivider = RCC_HCLK_DIV${clock.apb1};`,'  clk.APB2CLKDivider = RCC_HCLK_DIV1;',
    `  if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_${clock.latency}) != HAL_OK) Error_Handler();`);
  // F1 ADC clock (PCLK2 = SYSCLK here) must stay at or below 14 MHz.
  if(f1&&config.peripherals.ADC1?.enabled){const div=[2,4,6,8].find(n=>config.timerClockHz/n<=14000000);lines.push('  RCC_PeriphCLKInitTypeDef periph = {0};','  periph.PeriphClockSelection = RCC_PERIPHCLK_ADC;',`  periph.AdcClockSelection = RCC_ADCPCLK2_DIV${div};`,'  if (HAL_RCCEx_PeriphCLKConfig(&periph) != HAL_OK) Error_Handler();');}
  lines.push('}');}
  if(gpioInit){
  lines.push('', 'static void MX_GPIO_Init(void) {',...(pins.length?['  GPIO_InitTypeDef GPIO_InitStruct = {0};']:[]));
  for(const port of new Set(pins.map(([pin])=>pin[1])))lines.push(`  __HAL_RCC_GPIO${port}_CLK_ENABLE();`);
  if(f1){
    // AFIO routes EXTI lines and remaps; PA15/PB3/PB4 are JTAG pins until JTAG is released (SWD stays on).
    const remaps=Object.keys(family.remaps).map(id=>remapFor(family.id,id,Object.fromEntries(pins.filter(([,p])=>p.function.startsWith(id+'_')).map(([pin,p])=>[p.function.slice(id.length+1),pin])))?.macro).filter(Boolean);
    const jtag=pins.some(([pin])=>family.jtagPins.includes(pin));
    // PD0/PD1 are OSC_IN/OSC_OUT until PD01 remap (RM0008 9.3.2).
    if(pins.some(([pin])=>pin==='PD0'||pin==='PD1'))remaps.push('__HAL_AFIO_REMAP_PD01_ENABLE');
    if(remaps.length||jtag||pins.some(([,p])=>p.function==='GPIO_EXTI'))lines.push('  __HAL_RCC_AFIO_CLK_ENABLE();');
    if(jtag)lines.push('  __HAL_AFIO_REMAP_SWJ_NOJTAG();');
    for(const macro of remaps)lines.push(`  ${macro}();`);
  }
  for(const [pin,p]of pins){
    if(p.function==='GPIO_Output')lines.push(`  HAL_GPIO_WritePin(GPIO${pin[1]}, GPIO_PIN_${pin.slice(2)}, GPIO_PIN_${p.initial?'SET':'RESET'});`);
    const mode=gpioMode(p,config,f1);
    lines.push(`  GPIO_InitStruct.Pin = GPIO_PIN_${pin.slice(2)};`,`  GPIO_InitStruct.Mode = GPIO_MODE_${mode};`,`  GPIO_InitStruct.Pull = GPIO_${p.pull};`);
    // legacyGpio: the pre-1.16 rule (one fixed speed, also on inputs) that removing old Docs code has to match.
    if(legacyGpio?!minimal||mode==='OUTPUT_PP'||mode.startsWith('AF_'):hasSpeed(mode))lines.push(`  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_${legacyGpio?f1?'HIGH':'VERY_HIGH':pinSpeed(p,f1)};`);
    if(mode.startsWith('AF_')&&!f1){const serial=serialFunction(p.function)||/^(USART\d)_CK$/.exec(p.function)?.[1],timer=p.function.split('_')[0],af=serial?`GPIO_AF${serialAf(serial)}_${serial}`:p.function.startsWith('I2C1_')?'GPIO_AF4_I2C1':p.function.startsWith('SPI1_')?'GPIO_AF5_SPI1':p.function.startsWith('SDIO_')?'GPIO_AF12_SDIO':`GPIO_AF${timerAf(timer)}_${timer}`;lines.push(`  GPIO_InitStruct.Alternate = ${af};`);}
    lines.push(`  HAL_GPIO_Init(GPIO${pin[1]}, &GPIO_InitStruct);`);
  }
  for(const [irq,p]of irqs)if(!/^DMA\d_(Stream|Channel)\d_IRQn$/.test(irq))lines.push(`  HAL_NVIC_SetPriority(${irq}, ${p.priority}, ${p.sub??0});`,`  HAL_NVIC_EnableIRQ(${irq});`);
  lines.push('}');
  }
  if(dma.length){
    lines.push('','static void MX_DMA_Init(void) {',...[...new Set(dma.map(([,d])=>d.stream.slice(0,4)))].sort().map(c=>`  __HAL_RCC_${c}_CLK_ENABLE();`));
    for(const [request,d]of dma)if(request==='MEMTOMEM')lines.push(...dmaLines(dmaHandle(request),request,d,f1));
    for(const [,d]of dma)lines.push(`  HAL_NVIC_SetPriority(${d.stream}_IRQn, ${config.nvic[d.stream+'_IRQn']?.priority??0}, ${config.nvic[d.stream+'_IRQn']?.sub??0});`,`  HAL_NVIC_EnableIRQ(${d.stream}_IRQn);`);
    lines.push('}');
  }
  for(const [id,p]of active){const [type,name]=handles[id];lines.push('',`static void ${initName(id)}(void) {`,`  __HAL_RCC_${id}_CLK_ENABLE();`,`  ${name}.Instance = ${id};`);
    const set=(key,value)=>lines.push(`  ${name}.Init.${key} = ${value};`);
    if(isSerial(id)&&!sync(id))for(const [k,v]of Object.entries({BaudRate:p.baud,WordLength:`UART_WORDLENGTH_${p.wordLength??8}B`,StopBits:`UART_STOPBITS_${p.stopBits??1}`,Parity:`UART_PARITY_${p.parity??'NONE'}`,Mode:`UART_MODE_${p.direction??'TX_RX'}`,HwFlowCtl:'UART_HWCONTROL_NONE',OverSampling:`UART_OVERSAMPLING_${p.overSampling??16}`}))set(k,v);
    if(sync(id))for(const [k,v]of Object.entries({BaudRate:p.baud,WordLength:'USART_WORDLENGTH_8B',StopBits:'USART_STOPBITS_1',Parity:'USART_PARITY_NONE',Mode:'USART_MODE_TX_RX',CLKPolarity:p.cpol?'USART_POLARITY_HIGH':'USART_POLARITY_LOW',CLKPhase:p.cpha?'USART_PHASE_2EDGE':'USART_PHASE_1EDGE',CLKLastBit:p.lastBit?'USART_LASTBIT_ENABLE':'USART_LASTBIT_DISABLE'}))set(k,v);
    if(id==='SDIO')for(const [k,v]of Object.entries({ClockEdge:'SDIO_CLOCK_EDGE_RISING',ClockBypass:'SDIO_CLOCK_BYPASS_DISABLE',ClockPowerSave:'SDIO_CLOCK_POWER_SAVE_DISABLE',BusWide:'SDIO_BUS_WIDE_1B',HardwareFlowControl:'SDIO_HARDWARE_FLOW_CONTROL_DISABLE',ClockDiv:0}))set(k,v);
    if(id==='DCMI')for(const [k,v]of Object.entries({SynchroMode:'DCMI_SYNCHRO_HARDWARE',PCKPolarity:'DCMI_PCKPOLARITY_RISING',VSPolarity:'DCMI_VSPOLARITY_LOW',HSPolarity:'DCMI_HSPOLARITY_LOW',CaptureRate:'DCMI_CR_ALL_FRAME',ExtendedDataMode:'DCMI_EXTEND_DATA_8B',JPEGMode:'DCMI_JPEG_DISABLE'}))set(k,v);
    if(id==='I2C1')for(const [k,v]of Object.entries({ClockSpeed:p.clock,DutyCycle:`I2C_DUTYCYCLE_${p.dutyCycle??'2'}`,OwnAddress1:p.ownAddress?`0x${(p.ownAddress<<1).toString(16).toUpperCase()}`:0,AddressingMode:'I2C_ADDRESSINGMODE_7BIT',DualAddressMode:'I2C_DUALADDRESS_DISABLE',OwnAddress2:0,GeneralCallMode:'I2C_GENERALCALL_DISABLE',NoStretchMode:p.noStretch?'I2C_NOSTRETCH_ENABLE':'I2C_NOSTRETCH_DISABLE'}))set(k,v);
    if(id==='SPI1')for(const [k,v]of Object.entries({Mode:'SPI_MODE_MASTER',Direction:'SPI_DIRECTION_2LINES',DataSize:`SPI_DATASIZE_${p.dataSize??8}BIT`,CLKPolarity:`SPI_POLARITY_${p.cpol??'LOW'}`,CLKPhase:`SPI_PHASE_${p.cpha??'1EDGE'}`,NSS:'SPI_NSS_SOFT',BaudRatePrescaler:'SPI_BAUDRATEPRESCALER_'+Math.min(256,2**Math.max(1,Math.ceil(Math.log2(config.timerClockHz/p.clock)))),FirstBit:`SPI_FIRSTBIT_${p.firstBit??'MSB'}`,TIMode:'SPI_TIMODE_DISABLE',CRCCalculation:'SPI_CRCCALCULATION_DISABLE',CRCPolynomial:10}))set(k,v);
    if(id==='ADC1'&&f1)for(const [k,v]of Object.entries({ScanConvMode:'ADC_SCAN_DISABLE',ContinuousConvMode:p.continuous?'ENABLE':'DISABLE',DiscontinuousConvMode:'DISABLE',ExternalTrigConv:'ADC_SOFTWARE_START',DataAlign:'ADC_DATAALIGN_RIGHT',NbrOfConversion:1}))set(k,v);
    if(id==='ADC1'&&!f1)for(const [k,v]of Object.entries({ClockPrescaler:`ADC_CLOCK_SYNC_PCLK_DIV${config.clock?.adcPrescaler??4}`,Resolution:'ADC_RESOLUTION_12B',ScanConvMode:'DISABLE',ContinuousConvMode:p.continuous?'ENABLE':'DISABLE',DiscontinuousConvMode:'DISABLE',ExternalTrigConvEdge:'ADC_EXTERNALTRIGCONVEDGE_NONE',ExternalTrigConv:'ADC_SOFTWARE_START',DataAlign:'ADC_DATAALIGN_RIGHT',NbrOfConversion:1,DMAContinuousRequests:'DISABLE',EOCSelection:'ADC_EOC_SINGLE_CONV'}))set(k,v);
    if(isTimer(id))for(const [k,v]of Object.entries({Prescaler:p.prescaler,CounterMode:`TIM_COUNTERMODE_${p.counterMode??'UP'}`,Period:p.period,ClockDivision:'TIM_CLOCKDIVISION_DIV1',AutoReloadPreload:'TIM_AUTORELOAD_PRELOAD_DISABLE'}))set(k,v);
    if(isTimer(id)&&p.mode==='encoder'){
      lines.push('  TIM_Encoder_InitTypeDef encoder = {0};','  encoder.EncoderMode = TIM_ENCODERMODE_TI12;');
      for(const n of [1,2])lines.push(`  encoder.IC${n}Polarity = TIM_ICPOLARITY_RISING;`,`  encoder.IC${n}Selection = TIM_ICSELECTION_DIRECTTI;`,`  encoder.IC${n}Prescaler = TIM_ICPSC_DIV1;`,`  encoder.IC${n}Filter = 0;`);
      lines.push(`  HAL_TIM_Encoder_Init(&${name}, &encoder);`);
    }else if(id==='SDIO')lines.push('  /* HAL_SD_Init(&hsd) is called by FatFs BSP_SD_Init() or user code. */');
    else lines.push(`  HAL_${type}${isTimer(id)?p.mode==='pwm'?'_PWM':p.mode==='oc'?'_OC':p.mode==='capture'?'_IC':'_Base':''}_Init(&${name});`);
    if(id==='ADC1'){const channel=Object.values(config.pins).find(p=>p.function.startsWith('ADC1_IN')).function.slice(7);lines.push('  ADC_ChannelConfTypeDef sConfig = {0};',`  sConfig.Channel = ADC_CHANNEL_${channel};`,`  sConfig.Rank = ${f1?'ADC_REGULAR_RANK_1':1};`,`  sConfig.SamplingTime = ${adcSamplingMacro(adcSamplingOf(config))};`,'  HAL_ADC_ConfigChannel(&hadc1, &sConfig);',...(f1?['  HAL_ADCEx_Calibration_Start(&hadc1);']:[]));}
    if(isTimer(id)&&['pwm','oc','capture'].includes(p.mode)){
      const out=p.mode!=='capture',kind=p.mode==='pwm'?'PWM':p.mode==='oc'?'OC':'IC',ocDefault=p.mode==='oc'?'TIMING':'PWM1';
      lines.push(`  ${out?'TIM_OC_InitTypeDef':'TIM_IC_InitTypeDef'} channel = {0};`);
      if(out)lines.push(`  channel.OCMode = TIM_OCMODE_${ocDefault};`,'  channel.OCPolarity = TIM_OCPOLARITY_HIGH;',`  channel.Pulse = ${p.pulse};`,'  channel.OCFastMode = TIM_OCFAST_DISABLE;');
      else lines.push('  channel.ICPolarity = TIM_ICPOLARITY_RISING;','  channel.ICSelection = TIM_ICSELECTION_DIRECTTI;','  channel.ICPrescaler = TIM_ICPSC_DIV1;','  channel.ICFilter = 0;');
      // Channels with their own Pulse / polarity / mode set the shared structure again before their ConfigChannel.
      const own=out&&p.channels&&Object.keys(p.channels).length;
      for(const value of Object.values(config.pins)){const m=new RegExp('^'+id+'_CH([1-4])$').exec(value.function);if(!m)continue;if(own){const c=p.channels['CH'+m[1]]||{};lines.push(`  channel.OCMode = TIM_OCMODE_${c.ocMode??ocDefault};`,`  channel.OCPolarity = TIM_OCPOLARITY_${c.polarity??'HIGH'};`,`  channel.Pulse = ${c.pulse??p.pulse};`);}lines.push(`  HAL_TIM_${kind}_ConfigChannel(&${name}, &channel, TIM_CHANNEL_${m[1]});`);}
    }
    for(const [request,d]of dma)if(dmaOwner(request)===id){const h=dmaHandle(request);lines.push(...dmaLines(h,request,d,f1),`  __HAL_LINKDMA(&${name}, ${dmaLink(request)}, ${h});`);}
    lines.push('}');
  }
  // Interrupt handlers (CubeMX writes them into stm32xxxx_it.c): enabling USART2 with its NVIC line gives USART2_IRQHandler here.
  if(!minimal)for(const h of irqHandlers(config))if(h.shown&&h.body)lines.push('',...handlerText(h));
  if(!minimal&&pins.some(([,p])=>p.function==='GPIO_EXTI'))lines.push('','void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {','  UNUSED(GPIO_Pin);','  /* USER CODE BEGIN EXTI_Callback */','  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */','  /* USER CODE END EXTI_Callback */','}');
  if(!minimal&&serials.length)lines.push('','void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {','  UNUSED(huart);','  /* USER CODE BEGIN UART_RxCplt */','  /* HAL_UART_Receive_IT() 수신 완료 */','  /* USER CODE END UART_RxCplt */','}');
  if(!minimal&&timers.length)lines.push('','void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {','  UNUSED(htim);','  /* USER CODE BEGIN TIM_PeriodElapsed */','  /* 타이머 주기 인터럽트 */','  /* USER CODE END TIM_PeriodElapsed */','}');
  if(!minimal&&timers.some(([id,p])=>p.mode==='oc'&&config.nvic[id+'_IRQn']?.enabled))lines.push('','void HAL_TIM_OC_DelayElapsedCallback(TIM_HandleTypeDef *htim) {','  UNUSED(htim);','  /* USER CODE BEGIN TIM_OC_DelayElapsed */','  /* 출력 비교 일치(CCR) 인터럽트 */','  /* USER CODE END TIM_OC_DelayElapsed */','}');
  if(!minimal&&timers.some(([,p])=>p.mode==='capture'))lines.push('','void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim) {','  UNUSED(htim);','  /* USER CODE BEGIN TIM_IC_Capture */','  /* Read HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1). */','  /* USER CODE END TIM_IC_Capture */','}');
  if(!minimal)lines.push('','int __io_putchar(int ch) {','  ITM_SendChar(ch);','  return ch;','}');
  lines.push('','/* USER CODE BEGIN 4 */','/* USER CODE END 4 */','','void Error_Handler(void) {','  __disable_irq();','  while (1) { }','}');
  return lines.join('\n')+'\n';
}
