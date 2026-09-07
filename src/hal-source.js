import {compile} from './parser.js';

// These are interpreter value layouts, not STM32 register or ABI definitions.
export const HAL_STRUCTS={
  GPIO_InitTypeDef:'Pin Mode Pull Speed Alternate',
  UART_InitTypeDef:'BaudRate WordLength StopBits Parity Mode HwFlowCtl OverSampling',
  UART_HandleTypeDef:'Instance Init:UART_InitTypeDef ErrorCode gState RxState',
  I2C_InitTypeDef:'ClockSpeed DutyCycle OwnAddress1 AddressingMode DualAddressMode OwnAddress2 GeneralCallMode NoStretchMode',
  I2C_HandleTypeDef:'Instance Init:I2C_InitTypeDef ErrorCode',
  SPI_InitTypeDef:'Mode Direction DataSize CLKPolarity CLKPhase NSS BaudRatePrescaler FirstBit TIMode CRCCalculation CRCPolynomial',
  SPI_HandleTypeDef:'Instance Init:SPI_InitTypeDef ErrorCode',
  ADC_InitTypeDef:'ClockPrescaler Resolution ScanConvMode ContinuousConvMode DiscontinuousConvMode NbrOfDiscConversion ExternalTrigConvEdge ExternalTrigConv DataAlign NbrOfConversion DMAContinuousRequests EOCSelection',
  ADC_HandleTypeDef:'Instance Init:ADC_InitTypeDef ErrorCode',
  ADC_ChannelConfTypeDef:'Channel Rank SamplingTime Offset',
  TIM_Base_InitTypeDef:'Prescaler CounterMode Period ClockDivision RepetitionCounter AutoReloadPreload',
  TIM_HandleTypeDef:'Instance Init:TIM_Base_InitTypeDef Channel',
  TIM_ClockConfigTypeDef:'ClockSource ClockPolarity ClockPrescaler ClockFilter',
  TIM_MasterConfigTypeDef:'MasterOutputTrigger MasterSlaveMode',
  TIM_OC_InitTypeDef:'OCMode Pulse OCPolarity OCNPolarity OCFastMode OCIdleState OCNIdleState',
  RCC_PLLInitTypeDef:'PLLState PLLSource PLLM PLLN PLLP PLLQ PLLR',
  RCC_OscInitTypeDef:'OscillatorType HSEState LSEState HSIState HSICalibrationValue LSIState PLL:RCC_PLLInitTypeDef',
  RCC_ClkInitTypeDef:'ClockType SYSCLKSource AHBCLKDivider APB1CLKDivider APB2CLKDivider'
};
const SYSTEM_HEADERS=new Set(['main.h','stm32f4xx_hal.h','stm32f4xx.h','stdint.h','stddef.h','stdbool.h','string.h','stdio.h','math.h',...['gpio','uart','tim','adc','i2c','spi','rcc','rcc_ex','cortex','pwr','pwr_ex'].map(n=>`stm32f4xx_hal_${n}.h`)]);
export function prepareHalSource(source,files=[]){
  if(typeof source!=='string'||source.length>50000||!Array.isArray(files)||files.length>40)throw new Error('HAL 소스 크기 또는 파일 수 한도를 넘었습니다.');
  const map=new Map();let total=source.length;
  for(const file of files){if(!file||typeof file.name!=='string'||! /^[\w.-]+\.[ch]$/.test(file.name)||typeof file.text!=='string'||map.has(file.name))throw new Error('소스 파일 이름이 중복되거나 올바르지 않습니다.');total+=file.text.length;if(total>300000)throw new Error('HAL 소스 전체는 300 KB 이하로 선택하세요.');map.set(file.name,file.text);}
  map.set('main.c',source);
  const definitions=new Map([['STM32F446xx','1'],['USE_HAL_DRIVER','1']]),stack=[],included=new Set();
  const preprocess=(text,name)=>{
    if(stack.includes(name))throw new Error(`순환 include: ${name}`);stack.push(name);const output=[],condition=[];let active=true,inComment=false;
    for(const [index,line]of text.split(/\r?\n/).entries()){
      // Strip comments without touching string/character literals or line numbering.
      let clean='',quote='',escape=false;
      for(let i=0;i<line.length;i++){const c=line[i],next=line[i+1];if(inComment){if(c==='*'&&next==='/'){inComment=false;i++;}continue;}if(quote){clean+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c===quote)quote='';continue;}if(c==='"'||c==="'"){quote=c;clean+=c;}else if(c==='/'&&next==='*'){inComment=true;i++;clean+=' ';}else if(c==='/'&&next==='/')break;else clean+=c;}
      const directive=/^\s*#\s*(\w+)\s*(.*)$/.exec(clean),error=message=>{throw new Error(`${name}:${index+1}: ${message}`);};
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
    if(condition.length||inComment)throw new Error(`${name}: 닫히지 않은 조건부 전처리 또는 주석`);stack.pop();return output.join('\n');
  };
  const chunks=[preprocess(source,'main.c')];
  for(const [name,text]of map)if(name.endsWith('.c')&&name!=='main.c')chunks.push(preprocess(text,name));
  return chunks.join('\n');
}
export function compileHal(source,files=[]){
  const structs=Object.fromEntries(Object.entries(HAL_STRUCTS).map(([name,fields])=>[name,fields.split(' ').map(f=>{const [key,type='uint32_t']=f.split(':');return {name:key,type,constant:false};})]));
  return compile(prepareHalSource(source,files),{hal:true,structs});
}
