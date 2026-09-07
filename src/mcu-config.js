import {GPIO_PINS} from './pins.js';
import {SERIAL_ROUTES,SERIAL_IDS,isSerial,serialAf,serialFunction,serialHandle} from './serial-config.js';

// F446RE routes used by this simulator. Peripheral alternatives are explicit;
// choosing a peripheral never assigns an arbitrary GPIO as an alternate function.
export const ROUTES = {
  ...SERIAL_ROUTES,
  I2C1: {SCL:['PB6','PB8'],SDA:['PB7','PB9']},
  SPI1: {SCK:['PA5','PB3'],MISO:['PA6','PB4'],MOSI:['PA7','PB5']},
  ADC1: Object.fromEntries(['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7','PB0','PB1','PC0','PC1','PC2','PC3','PC4','PC5'].map((p,i)=>['IN'+i,[p]])),
  TIM2: {CH1:['PA0','PA5','PA15'],CH2:['PA1','PB3'],CH3:['PA2','PB10'],CH4:['PA3']}
};
export const IRQ_NAMES=['EXTI0_IRQn','EXTI1_IRQn','EXTI2_IRQn','EXTI3_IRQn','EXTI4_IRQn','EXTI9_5_IRQn','EXTI15_10_IRQn',...SERIAL_IDS.map(id=>id+'_IRQn'),'TIM2_IRQn'];
export const MODES=['Reset','GPIO_Input','GPIO_Output','GPIO_EXTI','Analog','Reserved'];
export const irqForPin=pin=>{const n=Number(pin.slice(2));return n<5?`EXTI${n}_IRQn`:n<10?'EXTI9_5_IRQn':'EXTI15_10_IRQn';};
export function pinFunctions(pin){return [...MODES,...Object.entries(ROUTES).flatMap(([id,routes])=>Object.entries(routes).filter(([,pins])=>pins.includes(pin)).map(([signal])=>`${id}_${signal}`))];}
export function defaultMcu(){return {family:'STM32F446RE',pins:{PA5:{function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'LD2',initial:0}},peripherals:{},nvic:{},timerClockHz:84000000};}
export function validateMcu(value){
  if(!value||value.family!=='STM32F446RE'||!value.pins||!value.peripherals||!value.nvic)throw new Error('STM32F446RE 핀 설정이 필요합니다.');
  const out={family:value.family,pins:{},peripherals:{},nvic:{},timerClockHz:value.timerClockHz??84000000};
  if(!Number.isInteger(out.timerClockHz)||out.timerClockHz<1000000||out.timerClockHz>180000000)throw new Error('TIM2 클록 범위: 1~180 MHz');
  for(const [pin,p] of Object.entries(value.pins)){
    if(!GPIO_PINS.includes(pin)||!p||!pinFunctions(pin).includes(p.function))throw new Error(`${pin}: 지원하지 않는 핀 기능입니다.`);
    if(!['NOPULL','PULLUP','PULLDOWN'].includes(p.pull)||!['RISING','FALLING','CHANGE'].includes(p.edge)||![0,1].includes(p.initial)||typeof p.label!=='string'||(p.label&&!/^[A-Za-z_]\w{0,39}$/.test(p.label))||['__proto__','constructor','prototype'].includes(p.label))throw new Error(`${pin}: GPIO 설정이 올바르지 않습니다.`);
    out.pins[pin]={function:p.function,pull:p.pull,edge:p.edge,label:p.label,initial:p.initial};
  }
  for(const [id,p]of Object.entries(value.peripherals)){
    if(!Object.hasOwn(ROUTES,id)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다.`);
    const q={enabled:p.enabled};
    for(const [key,def,min,max]of isSerial(id)?[['baud',115200,300,2000000]]:id==='I2C1'?[['clock',100000,1000,1000000]]:id==='SPI1'?[['clock',1000000,1000,20000000]]:id==='TIM2'?[['prescaler',8399,0,65535],['period',999,0,4294967295]]:[]){q[key]=p[key]??def;if(!Number.isInteger(q[key])||q[key]<min||q[key]>max)throw new Error(`${id}.${key}: 범위를 확인하세요.`);}
    out.peripherals[id]=q;
  }
  for(const [irq,p]of Object.entries(value.nvic)){if(!IRQ_NAMES.includes(irq)||!p||typeof p.enabled!=='boolean'||!Number.isInteger(p.priority)||p.priority<0||p.priority>15)throw new Error('NVIC 설정을 확인하세요.');out.nvic[irq]={enabled:p.enabled,priority:p.priority};}
  return out;
}
export function configProblems(config){
  const errors=[],signals=new Map(),exti=new Map(),labels=new Set();
  for(const [pin,p]of Object.entries(config.pins)){
    if(p.label){if(labels.has(p.label))errors.push(`사용자 라벨 중복: ${p.label}`);labels.add(p.label);}
    if(p.function==='GPIO_EXTI'){const n=pin.slice(2);if(exti.has(n))errors.push(`EXTI${n}: ${exti.get(n)}와 ${pin} 충돌`);exti.set(n,pin);}
    if(!MODES.includes(p.function)){if(signals.has(p.function))errors.push(`${p.function}: 핀을 하나만 지정하세요.`);signals.set(p.function,pin);}
    const serial=serialFunction(p.function);if(serial&&!config.peripherals[serial]?.enabled)errors.push(`${pin}: ${serial} 주변장치를 활성화하세요.`);
  }
  for(const [id,p]of Object.entries(config.peripherals))if(p.enabled){
    const required=isSerial(id)?['TX','RX']:id==='I2C1'?['SCL','SDA']:id==='SPI1'?['SCK','MISO','MOSI']:[];
    for(const role of required)if(!signals.has(`${id}_${role}`))errors.push(`${id}: ${role} 핀을 활성화하세요.`);
    if(id==='ADC1'&&![...signals.keys()].some(k=>k.startsWith('ADC1_IN')))errors.push('ADC1: 입력 채널을 활성화하세요.');
  }
  return errors;
}
export function importIoc(text){
  if(typeof text!=='string'||text.length>500000)throw new Error('.ioc 파일은 500 KB 이하로 선택하세요.');
  const values=Object.fromEntries(text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')),l.slice(l.indexOf('=')+1).replaceAll('\\:',':')]));
  if(!/^STM32F446R/.test(values['Mcu.Name']||values['Mcu.CPN']||''))throw new Error('STM32F446RE 설정만 지원합니다.');
  const config=defaultMcu();config.pins={};const warnings=[];
  for(const [key,signal]of Object.entries(values)){
    const m=/^(P[A-H]\d+)(?:-[^.]+)?\.Signal$/.exec(key);if(!m)continue;const pin=m[1],base=key.slice(0,-7);
    if(!GPIO_PINS.includes(pin)){warnings.push(`${pin}: 보드에서 접근할 수 없는 핀`);continue;}
    let fn=signal==='GPIO_Output'?'GPIO_Output':signal==='GPIO_Input'?'GPIO_Input':signal.startsWith('GPXTI')?'GPIO_EXTI':signal;
    if(!pinFunctions(pin).includes(fn)){fn='Reserved';if(!/^(SYS_|RCC_)/.test(signal))warnings.push(`${pin}: ${signal} 실행 모델 미지원`);}
    const pull=(values[base+'.GPIO_PuPd']||'GPIO_NOPULL').replace('GPIO_','');
    const edge=(values[base+'.GPIO_ModeDefaultEXTI']||'').includes('RISING_FALLING')?'CHANGE':(values[base+'.GPIO_ModeDefaultEXTI']||'').includes('RISING')?'RISING':'FALLING';
    config.pins[pin]={function:fn,pull,edge,label:values[base+'.GPIO_Label']||'',initial:values[base+'.PinState']==='GPIO_PIN_SET'?1:0};
  }
  for(const id of Object.keys(ROUTES)){
    const enabled=Object.values(config.pins).some(p=>p.function.startsWith(id+'_'))||Object.entries(values).some(([k,v])=>/^Mcu.IP\d+$/.test(k)&&v===id);
    if(enabled)config.peripherals[id]={enabled:true};
  }
  for(const id of SERIAL_IDS)if(config.peripherals[id])config.peripherals[id].baud=Number(values[id+'.BaudRate']||115200);
  if(config.peripherals.I2C1)config.peripherals.I2C1.clock=Number(values['I2C1.ClockSpeed']||100000);
  if(config.peripherals.TIM2){config.peripherals.TIM2.prescaler=Number(values['TIM2.Prescaler']||8399);config.peripherals.TIM2.period=Number(values['TIM2.Period']||999);}
  config.timerClockHz=Number(values['RCC.APB1TimFreq_Value']||84000000);
  for(const irq of IRQ_NAMES){const raw=values['NVIC.'+irq];if(raw){const [enabled,priority]=raw.split(':');config.nvic[irq]={enabled:enabled==='true',priority:Number(priority)};}}
  for(const [key,v]of Object.entries(values))if(/^Mcu.IP\d+$/.test(key)&&!Object.hasOwn(ROUTES,v)&&!['GPIO','RCC','NVIC','SYS','NUCLEO-F446RE'].includes(v))warnings.push(`${v}: 실행 모델 미지원`);
  const clean=validateMcu(config);return {config:clean,warnings:[...new Set([...warnings,...configProblems(clean)])]};
}
export function generateHal(config){
  const errors=configProblems(config);if(errors.length)throw new Error(errors.join('\n'));
  const lines=['#include "main.h"',''];
  for(const [pin,p]of Object.entries(config.pins))if(p.label){lines.push(`#define ${p.label}_Pin GPIO_PIN_${pin.slice(2)}`,`#define ${p.label}_GPIO_Port GPIO${pin[1]}`);}
  const handles={...Object.fromEntries(SERIAL_IDS.map(id=>[id,['UART',serialHandle(id)]])),I2C1:['I2C','hi2c1'],SPI1:['SPI','hspi1'],ADC1:['ADC','hadc1'],TIM2:['TIM','htim2']};
  const active=Object.entries(config.peripherals).filter(([,p])=>p.enabled);
  for(const [id]of active){const [type,name]=handles[id];lines.push(`${type}_HandleTypeDef ${name};`);}
  lines.push('','void SystemClock_Config(void);','static void MX_GPIO_Init(void);');
  const initName=id=>`MX_${id}${isSerial(id)?'_UART':''}_Init`;
  // Use ordinary Cube-style main(), preserving the user's editable application area.
  lines.push(...active.map(([id])=>`static void ${initName(id)}(void);`));
  lines.push('','int main(void) {','  HAL_Init();','  SystemClock_Config();','  MX_GPIO_Init();',...active.map(([id])=>`  ${initName(id)}();`),'  /* USER CODE BEGIN 2 */');
  if(config.peripherals.TIM2?.enabled&&config.nvic.TIM2_IRQn?.enabled)lines.push('  HAL_TIM_Base_Start_IT(&htim2);');
  const serials=active.filter(([id])=>isSerial(id));
  if(serials.length){lines.push('  uint8_t message[] = "HAL ready\\r\\n";');for(const [id]of serials)lines.push(`  HAL_UART_Transmit(&${serialHandle(id)}, message, sizeof(message)-1, 100);`);}
  lines.push('  /* USER CODE END 2 */','  while (1) {','    /* USER CODE BEGIN 3 */');
  const output=Object.entries(config.pins).find(([,p])=>p.function==='GPIO_Output');if(output)lines.push(`    HAL_GPIO_TogglePin(GPIO${output[0][1]}, GPIO_PIN_${output[0].slice(2)});`);
  lines.push('    HAL_Delay(500);','    /* USER CODE END 3 */','  }','}','', 'void SystemClock_Config(void) {','  /* 회로 모델의 TIM2 입력 클록은 Pinout 설정을 사용합니다. */','}','', 'static void MX_GPIO_Init(void) {','  GPIO_InitTypeDef GPIO_InitStruct = {0};');
  for(const port of new Set(Object.keys(config.pins).map(p=>p[1])))lines.push(`  __HAL_RCC_GPIO${port}_CLK_ENABLE();`);
  for(const [pin,p]of Object.entries(config.pins)){
    if(['Reset','Reserved'].includes(p.function))continue;
    if(p.function==='GPIO_Output')lines.push(`  HAL_GPIO_WritePin(GPIO${pin[1]}, GPIO_PIN_${pin.slice(2)}, GPIO_PIN_${p.initial?'SET':'RESET'});`);
    const mode=p.function==='GPIO_Output'?'OUTPUT_PP':p.function==='GPIO_EXTI'?`IT_${p.edge==='CHANGE'?'RISING_FALLING':p.edge}`:p.function==='Analog'||p.function.startsWith('ADC1_')?'ANALOG':p.function==='GPIO_Input'?'INPUT':p.function.startsWith('I2C1_')?'AF_OD':'AF_PP';
    lines.push(`  GPIO_InitStruct.Pin = GPIO_PIN_${pin.slice(2)};`,`  GPIO_InitStruct.Mode = GPIO_MODE_${mode};`,`  GPIO_InitStruct.Pull = GPIO_${p.pull};`,'  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;',`  HAL_GPIO_Init(GPIO${pin[1]}, &GPIO_InitStruct);`);
    if(mode.startsWith('AF_')){const serial=serialFunction(p.function),af=serial?`GPIO_AF${serialAf(serial)}_${serial}`:p.function.startsWith('I2C1_')?'GPIO_AF4_I2C1':p.function.startsWith('SPI1_')?'GPIO_AF5_SPI1':'GPIO_AF1_TIM2';lines.splice(lines.length-1,0,`  GPIO_InitStruct.Alternate = ${af};`);}
  }
  for(const [irq,p]of Object.entries(config.nvic))if(p.enabled)lines.push(`  HAL_NVIC_SetPriority(${irq}, ${p.priority}, 0);`,`  HAL_NVIC_EnableIRQ(${irq});`);
  lines.push('}');
  for(const [id,p]of active){const [type,name]=handles[id];lines.push('',`static void ${initName(id)}(void) {`,`  ${name}.Instance = ${id};`);
    if(isSerial(id))lines.push(`  ${name}.Init.BaudRate = ${p.baud??115200};`,`  ${name}.Init.WordLength = UART_WORDLENGTH_8B;`,`  ${name}.Init.StopBits = UART_STOPBITS_1;`,`  ${name}.Init.Parity = UART_PARITY_NONE;`,`  ${name}.Init.Mode = UART_MODE_TX_RX;`,`  ${name}.Init.HwFlowCtl = UART_HWCONTROL_NONE;`,`  ${name}.Init.OverSampling = UART_OVERSAMPLING_16;`);
    if(id==='I2C1')lines.push(`  ${name}.Init.ClockSpeed = ${p.clock??100000};`,`  ${name}.Init.AddressingMode = I2C_ADDRESSINGMODE_7BIT;`);
    if(id==='SPI1')lines.push(`  ${name}.Init.Mode = SPI_MODE_MASTER;`,`  ${name}.Init.Direction = SPI_DIRECTION_2LINES;`,`  ${name}.Init.DataSize = SPI_DATASIZE_8BIT;`,`  ${name}.Init.CLKPolarity = SPI_POLARITY_LOW;`,`  ${name}.Init.CLKPhase = SPI_PHASE_1EDGE;`,`  ${name}.Init.NSS = SPI_NSS_SOFT;`,`  ${name}.Init.FirstBit = SPI_FIRSTBIT_MSB;`);
    if(id==='TIM2')lines.push(`  ${name}.Init.Prescaler = ${p.prescaler??8399};`,`  ${name}.Init.Period = ${p.period??999};`);
    lines.push(`  HAL_${type}${id==='TIM2'?'_Base':''}_Init(&${name});`);
    if(id==='ADC1'){const channel=Object.values(config.pins).find(p=>p.function.startsWith('ADC1_IN')).function.slice(7);lines.push('  ADC_ChannelConfTypeDef sConfig = {0};',`  sConfig.Channel = ADC_CHANNEL_${channel};`,'  sConfig.Rank = 1;','  HAL_ADC_ConfigChannel(&hadc1, &sConfig);');}
    lines.push('}');
  }
  if(Object.values(config.pins).some(p=>p.function==='GPIO_EXTI'))lines.push('','void HAL_GPIO_EXTI_Callback(uint16_t GPIO_Pin) {','  /* 핀 번호에 따라 인터럽트 처리를 작성하세요. */','}');
  if(serials.length)lines.push('','void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart) {','  /* HAL_UART_Receive_IT() 수신 완료 */','}');
  if(config.peripherals.TIM2?.enabled)lines.push('','void HAL_TIM_PeriodElapsedCallback(TIM_HandleTypeDef *htim) {','  /* TIM2 주기 인터럽트 */','}');
  return lines.join('\n')+'\n';
}
