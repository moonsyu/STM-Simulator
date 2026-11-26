// A project's Pinout settings (`mcu`): the tables of the Pinout screen, the check that makes a clean copy
// (validateMcu), the problems CubeMX would mark (configProblems) and reading a CubeMX .ioc.
// The tables, validateMcu and configProblems are in Rust (rust/stm-core/src/mcuconfig.rs; feature 62); reading a .ioc
// is still below and moves next.
import {isBasicTimer,isAdvancedTimer} from './timer-config.js';
import {generateMain} from './hal-generator.js';
import {splitMain} from './peripheral-files.js';
import {timerDefaults} from './mcu-defaults.js';
import {DMA_REQUESTS} from './hal-dma.js';
import {familyProfile,routesOf,irqNamesOf,DEFAULT_FAMILY} from './mcu-family.js';
import {speedsOf} from './gpio-config.js';
import {rtcFromIoc} from './rtc-config.js';
import {dacFromIoc} from './dac-config.js';
import {validateIwdg,validateWwdg,iwdgFromIoc,wwdgFromIoc} from './wdg-config.js';
import {isI2c,isSpi} from './bus-config.js';
import {adcGroupFromIoc,adcRanks} from './adc-config.js';
import {clockFrequencies,clockTreeProblems,clockTreeFromIoc,treeFromTimerHz} from './clock-tree.js';
import {rustFn,rustPure,rustTable} from './rust-core.js';

const T=rustTable('mcu_tables');
// Synchronous USART clock outputs on F446RE LQFP64 (DS10693 table 11): AF7 USART1/2/3, AF8 USART6.
export const USART_CK_ROUTES=familyProfile(DEFAULT_FAMILY).usartCk;
export const usartCkRoutesOf=family=>familyProfile(family).usartCk;
export const DMA_MODES=T.dmaModes,DMA_PRIORITIES=T.dmaPriorities;
const peripheralOf=rustPure('dma_peripheral'),directionOf=rustPure('dma_direction'),extiOf=rustPure('irq_for_pin'),functionsOf=rustPure('pin_functions'),samplingMacroOf=rustPure('adc_sampling_macro');
// Peripheral of each DMA request (used to require that peripheral to be enabled).
export const dmaPeripheral=request=>peripheralOf(request);
export const dmaDirection=request=>directionOf(request);

// Routes and IRQs of the default (F446RE) family; per-family versions come from mcu-family.js.
// Peripheral alternatives are explicit; choosing a peripheral never assigns an arbitrary GPIO as an alternate function.
export const ROUTES=routesOf(DEFAULT_FAMILY);
export const IRQ_NAMES=irqNamesOf(DEFAULT_FAMILY);
export const dmaRequestsOf=family=>familyProfile(family).dmaRequests??DMA_REQUESTS;
export const MODES=T.modes;
export const irqForPin=pin=>extiOf(pin);
/** Every function a pin can have: the GPIO modes, the signals routed to it and the USART clocks (a new array). */
export function pinFunctions(pin,family=DEFAULT_FAMILY){return [...functionsOf(pin,familyProfile(family).id)];}
// ADC1 Rank 1 Sampling Time in ADC clock cycles (CubeMX ADC_SAMPLETIME_*). The app has always generated the longest one, so
// that stays the default when none is stored; CubeMX's own default is the shortest (3 / 1.5 cycles).
export const ADC_SAMPLING=T.adcSampling;
export const adcSamplingDefault=family=>ADC_SAMPLING[family].at(-1);
export const adcSamplingOf=config=>config.peripherals?.ADC1?.samplingTime??adcSamplingDefault(config.family);
/** HAL macro of a sampling time: 480 → ADC_SAMPLETIME_480CYCLES, 239.5 → ADC_SAMPLETIME_239CYCLES_5, 1.5 → ADC_SAMPLETIME_1CYCLE_5. */
// undefined and NaN are not numbers to send: they are asked for as "no value".
export const adcSamplingMacro=cycles=>cycles===undefined||Number.isNaN(cycles)?samplingMacroOf():samplingMacroOf(cycles);
/** The Pinout settings a family starts from (a new object; see rust-core.js newProjectMcu for a new project). */
export function defaultMcu(family=DEFAULT_FAMILY){return rustFn('default_mcu',familyProfile(family).id);}
/** SPI Parameter Settings (CubeMX Full-Duplex Master): clock polarity/phase (SPI mode 0-3), data size, first bit. */
// direction TX_ONLY: CubeMX's "Transmit Only Master" — SCK and MOSI, no MISO pin (displays, DACs, shift registers).
export const SPI_PARAMS=T.spiParams;
/** PWM channel settings: CH Polarity and PWM mode (the first value is CubeMX's default). */
export const TIM_CHANNEL_PARAMS=T.timChannelParams;
/** Output Compare CHn modes (CubeMX OCMode_n; Frozen = TIMING is its default). */
export const TIM_OC_MODES=T.timOcModes;
export const timChannelParams=mode=>mode==='oc'?{...TIM_CHANNEL_PARAMS,ocMode:TIM_OC_MODES}:TIM_CHANNEL_PARAMS;
/** Counter Settings › Counter Mode (CubeMX CounterMode; Up is its default). */
export const TIM_COUNTER_MODES=T.timCounterModes;
/** UART Parameter Settings (CubeMX Asynchronous mode): the first value of each list is CubeMX's default. */
export const UART_PARAMS=T.uartParams;
/** A clean copy of a project's Pinout settings, or throws with the first thing that is wrong with them. */
export const validateMcu=value=>rustFn('validate_mcu',value??null);
/** What CubeMX would mark in these settings: pins without their peripheral, missing pins, clashes, limits. */
export const configProblems=config=>rustFn('config_problems',config);
// CubeMX keeps parameter expressions as typed ("84-1", "1000*2"): + - * / and parentheses on integers only.
export function evalIocNumber(raw){
  const text=String(raw).trim();if(!/^[\dxXa-fA-F\s+\-*/()]+$/.test(text))return null;let i=0;
  const skip=()=>{while(text[i]===' ')i++;},atom=()=>{skip();if(text[i]==='('){i++;const v=sum();skip();if(text[i++]!==')')throw 0;return v;}if(text[i]==='-'){i++;return -atom();}const m=/^0[xX][\da-fA-F]+|^\d+/.exec(text.slice(i));if(!m)throw 0;i+=m[0].length;return Number(m[0]);};
  const product=()=>{let v=atom();for(skip();text[i]==='*'||text[i]==='/';skip()){const op=text[i++],r=atom();v=op==='*'?v*r:v/r;}return v;},sum=()=>{let v=product();for(skip();text[i]==='+'||text[i]==='-';skip()){const op=text[i++],r=product();v=op==='+'?v+r:v-r;}return v;};
  try{const v=sum();skip();return i===text.length&&Number.isInteger(v)?v:null;}catch{return null;}
}
export function importIoc(text){
  if(typeof text!=='string'||text.length>500000)throw new Error('.ioc 파일은 500 KB 이하로 선택하세요.');
  // CubeMX writes keys as Java properties: spaces and # are escaped ("TIM2.Pulse-PWM\ Generation1\ CH1").
  const values=Object.fromEntries(text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')&&l.includes('=')).map(l=>[l.slice(0,l.indexOf('=')).replace(/\\(.)/g,'$1'),l.slice(l.indexOf('=')+1).replaceAll('\\:',':')]));
  // CubeMX writes package ranges in Mcu.Name (STM32F103R(8-B)Tx); Mcu.CPN/UserName hold the exact part.
  const familyOf=name=>/^STM32F446R/.test(name)?'STM32F446RE':/^STM32F103R(?:[8B]|\([^)]*B[^)]*\))/.test(name)?'STM32F103RB':null;
  const family=['Mcu.Name','Mcu.CPN','Mcu.UserName'].map(k=>familyOf(values[k]||'')).find(Boolean);
  if(!family)throw new Error('STM32F446RE 또는 STM32F103RB 설정만 지원합니다.');
  const config=defaultMcu(family),f=familyProfile(family),routes=routesOf(family);config.pins={};const warnings=[];
  const number=(raw,fallback)=>{if(raw===undefined)return fallback;const n=evalIocNumber(raw);if(n===null){warnings.push(`${raw}: 숫자로 읽을 수 없어 기본값 ${fallback}을 사용합니다.`);return fallback;}return n;};
  for(let [key,signal]of Object.entries(values)){
    const m=/^(P[A-H]\d+)(?:-[^.]+)?\.Signal$/.exec(key);if(!m)continue;const pin=m[1],base=key.slice(0,-7);
    if(!f.gpioPins.includes(pin)){warnings.push(`${pin}: 보드에서 접근할 수 없는 핀`);continue;}
    // ADCx_INn: a channel shared by ADC1/2/3; the model uses ADC1.
    // A shared signal (S_TIM2_CH1_ETR: the pin's timer channel or its external trigger) is the one its SH line picks:
    // SH.S_TIM2_CH1_ETR.0=TIM2_CH1,PWM Generation1 CH1.
    const picked=(values[`SH.${signal}.0`]||'').split(',')[0];if(/^S_TIM\d+_/.test(signal)&&/^TIM\d+_CH\dN?$/.test(picked))signal='S_'+picked;
    let fn=/^COMP_DAC([12])_group$/.test(signal)?'DAC_OUT'+signal[8]:signal==='GPIO_Analog'?'Analog':signal==='GPIO_Output'?'GPIO_Output':signal==='GPIO_Input'?'GPIO_Input':signal.startsWith('GPXTI')?'GPIO_EXTI':/^S_TIM\d+_CH\dN?$/.test(signal)?signal.slice(2):/^ADC(?:x|\d+)_IN\d+$/.test(signal)?'ADC1_'+signal.split('_')[1]:signal;
    if(!pinFunctions(pin,family).includes(fn)){fn='Reserved';if(!/^(SYS_|RCC_)/.test(signal))warnings.push(`${pin}: ${signal} 실행 모델 미지원`);}
    const pull=(values[base+'.GPIO_PuPd']||'GPIO_NOPULL').replace('GPIO_','');
    // CubeMX omits GPIO_ModeDefaultEXTI for its default, rising edge.
    const extiMode=values[base+'.GPIO_ModeDefaultEXTI']||(fn==='GPIO_EXTI'?'GPIO_MODE_IT_RISING':''),edge=extiMode.includes('RISING_FALLING')?'CHANGE':extiMode.includes('RISING')?'RISING':'FALLING';
    // Board templates label pins like "B1 [Blue PushButton]"; the C name is the first word.
    // A character a C name cannot hold becomes _, as in the macro CubeMX generates (LCD-D4 → LCD_D4_Pin, HV+ → HV_).
    const rawLabel=values[base+'.GPIO_Label']||'',firstWord=rawLabel.split(/[\s[]/)[0],label=firstWord.replace(/[^A-Za-z0-9_]/g,'_').replace(/^(?=\d)/,'_');
    if(label&&(!/^[A-Za-z_]\w{0,39}$/.test(label)||['__proto__','constructor','prototype'].includes(label)))warnings.push(`${pin}: 라벨 "${rawLabel}"은 C 이름으로 쓸 수 없어 비웠습니다.`);
    config.pins[pin]={function:fn,pull,edge,label:/^[A-Za-z_]\w{0,39}$/.test(label)&&!['__proto__','constructor','prototype'].includes(label)?label:'',initial:values[base+'.PinState']==='GPIO_PIN_SET'?1:0};
    if(fn==='Reserved'&&/^[A-Za-z][\w-]{0,39}$/.test(signal)&&!/^(SYS_|RCC_)/.test(signal))config.pins[pin].signal=signal;
    // GPIO_Speed (absent = CubeMX default) and an open-drain output (GPIO_ModeDefaultOutputPP).
    const speed=/^GPIO_SPEED_FREQ_(LOW|MEDIUM|HIGH|VERY_HIGH)$/.exec(values[base+'.GPIO_Speed']||'')?.[1];
    if(speed&&speedsOf(f.pinMux==='remap').includes(speed)&&fn!=='Reserved')config.pins[pin].speed=speed;
    if(fn==='GPIO_Output'&&values[base+'.GPIO_ModeDefaultOutputPP']==='GPIO_MODE_OUTPUT_OD')config.pins[pin].outputType='OD';
  }
  // Labels the Pinout does not take are left out here with a note, instead of coming in as errors to clear by hand: the
  // same label on a second pin (real files have them — CubeMX then defines the macro twice), and a label that reads as
  // a HAL name (GPIO_…, HAL_…).
  {const seen=new Set();
   for(const [pin,p]of Object.entries(config.pins)){if(!p.label)continue;
    if(/^(GPIO|HAL|RCC|NVIC|EXTI|SYSCFG|AFIO|PWR|FLASH|IS|USE|STM32\w*)$/i.test(p.label)||/^(__|HAL_|GPIO_|RCC_|LL_|IS_)/i.test(p.label)){warnings.push(`${pin}: 라벨 ${p.label}은 HAL 이름과 겹쳐 비웠습니다.`);p.label='';}
    else if(seen.has(p.label)){warnings.push(`${pin}: 라벨 ${p.label}은 다른 핀에도 있어 이 핀의 라벨은 비웠습니다.`);p.label='';}
    else seen.add(p.label);}}
  for(const id of Object.keys(routes)){
    const enabled=Object.values(config.pins).some(p=>p.function.startsWith(id+'_'))||Object.entries(values).some(([k,v])=>/^Mcu.IP\d+$/.test(k)&&v===id);
    if(enabled)config.peripherals[id]={enabled:true};
  }
  for(const id of Object.keys(f.serial))if(config.peripherals[id]){
    const p=config.peripherals[id];p.baud=number(values[id+'.BaudRate'],115200);
    // A pin carrying USARTx_CK means CubeMX's synchronous mode.
    const w=values[id+'.WordLength'],par=values[id+'.Parity'],stop=values[id+'.StopBits'],mode=values[id+'.Mode'],over=values[id+'.OverSampling'];
    if(/9B/.test(w||''))p.wordLength=9;if(/EVEN/.test(par||''))p.parity='EVEN';else if(/ODD/.test(par||''))p.parity='ODD';if(/STOPBITS_2/.test(stop||''))p.stopBits=2;
    if(/MODE_TX$/.test(mode||''))p.direction='TX';else if(/MODE_RX$/.test(mode||''))p.direction='RX';if(/OVERSAMPLING_8/.test(over||'')&&f.id!=='STM32F103RB')p.overSampling=8;
    if(Object.values(config.pins).some(q=>q.function===id+'_CK'))Object.assign(p,{mode:'synchronous',cpol:values[id+'.CLKPolarity']==='USART_POLARITY_HIGH'?1:0,cpha:values[id+'.CLKPhase']==='USART_PHASE_2EDGE'?1:0,lastBit:values[id+'.CLKLastBit']==='USART_LASTBIT_ENABLE'?1:0});
  }
  for(const id of Object.keys(routes).filter(isI2c))if(config.peripherals[id]){const c=config.peripherals[id];c.clock=number(values[id+'.ClockSpeed'],100000);const own=Number(values[id+'.OwnAddress']);if(Number.isInteger(own)&&own>0)c.ownAddress=(own>>1)&0x7f; /* the value CubeMX writes to OwnAddress1 (address << 1) */if(/16_9/.test(values[id+'.DutyCycle']||'')&&c.clock>100000)c.dutyCycle='16_9';if(/NOSTRETCH_ENABLE/.test(values[id+'.NoStretchMode']||''))c.noStretch=true;}
  // RTC: calendar time/date, alarm A and wakeup (rtc-config.js); enabled through Mcu.IP or VP_RTC_VS_RTC_Activate.
  if(config.peripherals.DAC)config.peripherals.DAC=dacFromIoc(values);
  // Watchdogs (System Core › IWDG / WWDG): Mcu.IP or the VP_xWDG_VS_xWDG activation; a value out of range keeps CubeMX's default.
  for(const [id,read,check]of [['IWDG',iwdgFromIoc,validateIwdg],['WWDG',wwdgFromIoc,validateWwdg]])if(config.peripherals[id]||values[`VP_${id}_VS_${id}.Mode`]){const q=read(values,number);try{check(q);config.peripherals[id]=q;}catch(e){warnings.push(e.message+' 기본값을 씁니다.');config.peripherals[id]={enabled:true};}}
  if(config.peripherals.RTC||values['VP_RTC_VS_RTC_Activate.Mode'])config.peripherals.RTC=rtcFromIoc(values,family,number);
  if(config.peripherals.ADC1&&values['ADC1.ContinuousConvMode']==='ENABLE')config.peripherals.ADC1.continuous=true;
  if(config.peripherals.ADC1){const adc=config.peripherals.ADC1,internal=adcGroupFromIoc(values,family,adc);
   if(internal.length){const pinned=Object.values(config.pins).some(q=>q.function.startsWith('ADC1_'));warnings.push(`ADC1: 내부 채널(${[...new Set(internal)].join(', ')})은 실행 모델에 없어 가져오지 않았습니다${pinned?'':' — 남은 입력 핀이 없어 ADC1을 껐습니다'}.`);if(!pinned)delete config.peripherals.ADC1;}}
  if(config.peripherals.ADC1){const adc=config.peripherals.ADC1;
   // CubeMX always writes the channel of each rank: ranks in the default order (the pins' channels ascending) are not kept.
   if(adc.ranks){const plain={...config,peripherals:{...config.peripherals,ADC1:{...adc,ranks:undefined}}},wanted=adcRanks({...config,peripherals:{...config.peripherals,ADC1:adc}});if(wanted.every((ch,i)=>ch===adcRanks(plain)[i]))delete adc.ranks;}}
  // Rank 1 Sampling Time (ADC1.SamplingTime-0\#ChannelRegularConversion); a .ioc without it has CubeMX's default, the shortest.
  if(config.peripherals.ADC1){const key=Object.keys(values).find(k=>/^ADC1\.SamplingTime-0\\?#ChannelRegularConversion$/.test(k)),m=/ADC_SAMPLETIME_(\d+)CYCLES?(_5)?/.exec(values[key]||''),cycles=m?Number(m[1])+(m[2]?0.5:0):ADC_SAMPLING[family][0];if(ADC_SAMPLING[family].includes(cycles)&&cycles!==adcSamplingDefault(family))config.peripherals.ADC1.samplingTime=cycles;}
  // SPI1 speed: CubeMX stores the computed rate ("5.25 MBits/s") next to the prescaler.
  for(const id of Object.keys(routes).filter(isSpi))if(config.peripherals[id]){const s=config.peripherals[id];
    // No MISO pin: Transmit Only Master (2 lines, MISO unused) or a half-duplex mode (1 line, read as transmit only).
    {const has=sig=>Object.values(config.pins).some(q=>q.function===`${id}_${sig}`);if(has('SCK')&&has('MOSI')&&!has('MISO')){s.direction='TX_ONLY';if(/1LINE/.test(values[id+'.Direction']||''))warnings.push(`${id}: 반이중(1선) 모드는 송신 전용으로 가져왔습니다. 같은 선으로 받는 동작은 실행 모델에 없습니다.`);}}
if(/HIGH/.test(values[id+'.CLKPolarity']||''))s.cpol='HIGH';if(/2EDGE/.test(values[id+'.CLKPhase']||''))s.cpha='2EDGE';if(/16BIT/.test(values[id+'.DataSize']||''))s.dataSize=16;if(/LSB/.test(values[id+'.FirstBit']||''))s.firstBit='LSB';
   const m=/^([\d.]+)\s*([KM]?)Bits\/s/i.exec(values[id+'.CalculateBaudRate']||'');if(m)s.clock=Math.min(20000000,Math.max(1000,Math.round(Number(m[1])*({K:1e3,M:1e6}[m[2].toUpperCase()]??1))));}
  for(const id of Object.keys(f.timers))if(config.peripherals[id]){const p=config.peripherals[id],defaults=timerDefaults(id,family);p.prescaler=number(values[id+'.Prescaler'],defaults.prescaler);p.period=number(values[id+'.Period'],defaults.period);const pulse=Object.keys(values).find(k=>k.startsWith(id+'.Pulse'));if(pulse)p.pulse=number(values[pulse],defaults.pulse);const settings=Object.entries(values).filter(([k])=>k.startsWith(id+'.')).map(([k,v])=>k+' '+v).join(' ');p.mode=/Encoder|ENCODER/.test(settings)?'encoder':/PWM/.test(settings)?'pwm':/Output Compare\d CH\d/.test(settings)?'oc':/INPUTCAPTURE|Input_Capture|IC_CHANNEL/.test(settings)?'capture':'base';
    const counter=/TIM_COUNTERMODE_(\w+)/.exec(values[id+'.CounterMode']||'')?.[1];if(counter&&counter!=='UP'&&TIM_COUNTER_MODES.includes(counter)&&p.mode!=='encoder'&&!isBasicTimer(id))p.counterMode=counter;
    // TIM6/TIM7 TRGO Parameters (TIM6.TIM_MasterOutputTrigger=TIM_TRGO_UPDATE); the basic timers have only the time base.
    if(isAdvancedTimer(id)){const rep=number(values[id+'.RepetitionCounter'],0),dead=number(values[id+'.DeadTime'],0);if(rep>0&&rep<=255)p.repetition=rep;if(dead>0&&dead<=255)p.deadTime=dead;}
    if(isBasicTimer(id))p.mode='base';
    if(values[`VP_${id}_VS_OPM.Mode`]&&p.mode!=='encoder')p.onePulse=true;
    {const trgo=/^TIM_TRGO_(RESET|ENABLE|UPDATE)$/.exec(values[id+'.TIM_MasterOutputTrigger']||'')?.[1];if(trgo&&trgo!=='RESET')p.trgo=trgo;}}
  // Per-channel settings: PWM "TIM2.Pulse-PWM Generation1 CH1", "TIM2.OCPolarity_1", "TIM2.OCMode_PWM-PWM Generation1 CH1";
  // Output Compare "TIM2.Pulse-Output Compare1 CH1", "TIM2.OCMode_1" (TIM_OCMODE_TIMING when missing, as CubeMX).
  for(const id of Object.keys(f.timers))if(['pwm','oc'].includes(config.peripherals[id]?.mode)){
   const p=config.peripherals[id],oc=p.mode==='oc',ch={},name=oc?'Output Compare':'PWM Generation';const at=n=>ch['CH'+n]??={};
   for(const [k,v]of Object.entries(values)){
    let m=new RegExp('^'+id+'\\.Pulse-'+name+'(\\d) CH\\d(?: CH\\dN)?$').exec(k);if(m){at(m[1]).pulse=number(v,p.pulse);continue;}
    m=new RegExp('^'+id+'\\.OCPolarity_(\\d)(?:-.*)?$').exec(k);if(m&&/LOW/.test(v)){at(m[1]).polarity='LOW';continue;}
    m=new RegExp('^'+id+'\\.OCMode_PWM-PWM Generation(\\d) CH\\d(?: CH\\dN)?$').exec(k);if(!oc&&m&&/PWM2/.test(v)){at(m[1]).ocMode='PWM2';continue;}
    m=new RegExp('^'+id+'\\.OCMode_(\\d)(?:-.*)?$').exec(k);const mode=/TIM_OCMODE_(\w+)/.exec(v)?.[1];if(oc&&m&&mode!=='TIMING'&&TIM_OC_MODES.includes(mode))at(m[1]).ocMode=mode;
   }
   for(const c of Object.values(ch))if(c.pulse===p.pulse)delete c.pulse;
   for(const [n,c]of Object.entries(ch))if(!Object.keys(c).length)delete ch[n];
   if(Object.keys(ch).length)p.channels=ch;
  }
  config.timerClockHz=number(values['RCC.APB1TimFreq_Value'],f.clock.defaultHz);
  // The .ioc clock tree: kept as the project's Clock Configuration unless the single APB1 timer clock gives the same clocks.
  const tree=clockTreeFromIoc(f.id,values),hse=Number(values['RCC.HSE_VALUE']||8000000);
  // The NUCLEO boards feed HSE with 8 MHz from the ST-LINK. A tree made for another crystal would give other clocks
  // here, so it is not taken over.
  if(tree&&(tree.sysclkSource==='HSE'||tree.pllSource==='HSE')&&hse!==8000000){warnings.push(`클록 설정: 이 .ioc는 HSE ${hse/1e6} MHz인 보드용입니다. NUCLEO 보드의 HSE는 8 MHz(ST-LINK MCO)라 클록 트리는 가져오지 않고 보드 기본 클록을 씁니다. Clock 탭에서 다시 맞추세요.`);config.timerClockHz=f.clock.defaultHz;}
  else if(tree){const q=clockFrequencies(f.id,tree),hz=Math.round(q.tim1),old=f.clock.valid(hz)?clockFrequencies(f.id,treeFromTimerHz(f.id,hz)):null;
   const same=old&&['sysclk','hclk','pclk1','pclk2','adc'].every(k=>Math.abs(old[k]-q[k])<1);
   if(same)config.timerClockHz=hz;else{config.clock=tree;config.timerClockHz=hz;for(const p of clockTreeProblems(f.id,tree))warnings.push('클록 설정: '+p);}}
  // HSE/other PLL setups (F103 at 72 MHz) cannot be rebuilt from HSI: keep the nearest clock the generator can make.
  if(!config.clock&&!f.clock.valid(config.timerClockHz)){const wanted=config.timerClockHz,hz=f.clock.valid(Math.min(f.clock.maxHz,Math.round(wanted/4e6)*4e6))?Math.min(f.clock.maxHz,Math.round(wanted/4e6)*4e6):f.clock.exampleHz;warnings.push(`APB1 타이머 클록 ${wanted/1e6} MHz는 HSI로 만들 수 없어 ${hz/1e6} MHz로 바꿨습니다 (${f.clock.label}). 타이머 Prescaler/Period를 확인하세요.`);config.timerClockHz=hz;}
  // DMA: Dma.<request>.<n>.Instance/Channel/Mode/Priority; a request this model cannot route is reported, not dropped silently.
  const requests=dmaRequestsOf(family),dma={};
  for(const [key,request]of Object.entries(values)){
    if(!/^Dma\.Request\d+$/.test(key))continue;const base=Object.keys(values).find(k=>new RegExp(`^Dma\\.${request}\\.\\d+\\.Instance$`).test(k))?.slice(0,-9);
    // CubeMX leaves Channel out when the stream serves the request on one channel only (Dma.DAC1.0.* has no Channel key).
    const q=base&&{stream:values[base+'.Instance'],channel:Number(/\d+$/.exec(values[base+'.Channel']||'')?.[0]??requests[request]?.find(([st])=>st===values[base+'.Instance'])?.[1]??0),mode:values[base+'.Mode']==='DMA_CIRCULAR'?'circular':'normal',priority:(values[base+'.Priority']||'DMA_PRIORITY_LOW').replace('DMA_PRIORITY_','').toLowerCase()};
    try{if(!requests[request]||!q)throw new Error();validateMcu({...defaultMcu(family),dma:{...dma,[request]:q}});dma[request]=q;}catch{warnings.push(`${request} DMA: 실행 모델에서 같은 설정을 쓸 수 없어 가져오지 않았습니다.`);}
  }
  if(Object.keys(dma).length)config.dma=dma;
  // NVIC.<irq>=enabled:preemption:sub:…; NVIC.PriorityGroup; the time base priority is TICK_INT_PRIORITY.
  for(const irq of irqNamesOf(family)){const raw=values['NVIC.'+irq];if(raw){const [enabled,priority,sub]=raw.split(':');config.nvic[irq]={enabled:enabled==='true',priority:Number(priority)};if(Number(sub))config.nvic[irq].sub=Number(sub);}}
  if(values['ProjectManager.CoupleFile']==='true')config.coupleFiles=true;
  const group=/^NVIC_PRIORITYGROUP_([0-4])$/.exec(values['NVIC.PriorityGroup']||'');if(group)config.nvicGroup=Number(group[1]);
  const tick=values['NVIC.SysTick_IRQn']?.split(':');if(tick&&Number.isInteger(Number(tick[1])))config.tickPriority=Number(tick[1]);
  for(const [key,v]of Object.entries(values))if(/^Mcu.IP\d+$/.test(key)&&!Object.hasOwn(routes,v)&&!['GPIO','RCC','NVIC','SYS','DMA','NUCLEO-F446RE','NUCLEO-F103RB'].includes(v))warnings.push(`${v}: 실행 모델 미지원`);
  // An interrupt line whose peripheral was not imported (a timer used as the HAL time base, a part the model does not
  // have) is left out with a note: kept, it would be an error the user has to clear by hand before generating code.
  let clean=validateMcu(config);
  for(let pass=0;pass<40;pass++){
    const problems=configProblems(clean),orphan=problems.map(p=>/^(\w+_IRQn): .*(?:주변장치를 활성화하거나|를 활성화하거나) 인터럽트를 끄세요/.exec(p)?.[1]).find(irq=>irq&&config.nvic?.[irq]);
    const request=problems.map(p=>/^(\S+) DMA: \w+ 주변장치를 활성화하세요/.exec(p)?.[1]).find(r=>r&&config.dma?.[r]);
    if(orphan){delete config.nvic[orphan];warnings.push(`${orphan}: 이 인터럽트를 쓰는 주변장치를 가져오지 않아 NVIC 설정에서 뺐습니다.`);}
    else if(request){delete config.dma[request];warnings.push(`${request} DMA: 이 요청을 쓰는 주변장치를 가져오지 않아 DMA 설정에서 뺐습니다.`);}
    else break;
    clean=validateMcu(config);
  }
  // Pins in the order of Mcu.Pin0, Mcu.Pin1, … — the file's own keys are sorted as text (PA10 before PA5). The order is
  // part of the settings: generated code lists the pins in it, and a new main loop toggles the first output pin.
  {const order=new Map();for(const [key,value]of Object.entries(values)){const n=/^Mcu\.Pin(\d+)$/.exec(key),pin=/^P[A-H]\d+/.exec(value||'');if(n&&pin&&!order.has(pin[0]))order.set(pin[0],Number(n[1]));}
    if(order.size&&clean.pins){const entries=Object.entries(clean.pins).map((e,i)=>[order.get(e[0])??1e6+i,e]);entries.sort((a,b)=>a[0]-b[0]);clean.pins=Object.fromEntries(entries.map(e=>e[1]));}}
  return {config:clean,warnings:[...new Set([...warnings,...configProblems(clean)])]};
}
/** An example's console: USART2 on PA2 / PA3 (the ST-LINK virtual COM port, 115200 8N1) unless the example already
 * uses USART2 or one of the two pins. The generated code then sends printf there (hal-generator.js stdioUart). */
/** The pins a user set up, without the UART console a new project starts with (USART2 on PA2 / PA3 at 115200). */
export function userPins(mcu){
  const u=mcu?.peripherals?.USART2,console=u?.enabled&&u.baud===115200&&mcu.pins.PA2?.function==='USART2_TX'&&mcu.pins.PA3?.function==='USART2_RX';
  return Object.fromEntries(Object.entries(mcu?.pins||{}).filter(([pin])=>!(console&&(pin==='PA2'||pin==='PA3'))));
}
export function consoleUart(mcu){
  if(mcu.peripherals.USART2||mcu.pins.PA2||mcu.pins.PA3)return mcu;
  const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
  mcu.pins.PA2=pin('USART2_TX');mcu.pins.PA3=pin('USART2_RX');
  // In the order an .ioc import gives (the serial ports first, in the family's order), so export and import agree.
  const serials=Object.keys(familyProfile(mcu.family).serial),rank=id=>serials.includes(id)?serials.indexOf(id):serials.length;
  const others=Object.entries(mcu.peripherals),at=others.findIndex(([id])=>rank(id)>rank('USART2'));others.splice(at<0?others.length:at,0,['USART2',{enabled:true,baud:115200}]);mcu.peripherals=Object.fromEntries(others);
  return mcu;
}
export function generateHal(config,options){const clean=validateMcu(config),errors=configProblems(clean);if(errors.length)throw new Error(errors.join('\n'));const text=generateMain(clean,options);return clean.coupleFiles&&!options?.minimal?splitMain(text).main:text;}
