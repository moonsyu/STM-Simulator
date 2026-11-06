// Renesas RA MCU profiles and the FPB-RA6E1 board's pin facts, shared by the project model, the code generator
// (ra-generator.js), the build (desktop/ra-build.cjs) and the emulator (src/emu/ra6e1).
// Sources: RA6E1 Group User's Manual: Hardware R01UH0930EJ0140 Rev.1.40 (Table 1.16 Pin list, LQFP100) and
// FPB-RA6E1 v1 User's Manual R20UT4960EG0100 Rev.1.00 (Tables 5-9).

export const RA_FAMILY_ID='R7FA6E10F';
// Ports of the LQFP100 package (76 I/O), in pin-list order of the port number.
export const RA6E1_PORTS=Object.freeze([
 'P000','P001','P002','P003','P004','P005','P006','P007','P008','P014','P015',
 'P100','P101','P102','P103','P104','P105','P106','P107','P108','P109','P110','P111','P112','P113','P114','P115',
 'P200','P201','P205','P206','P207','P208','P209','P210','P211','P212','P213','P214',
 'P300','P301','P302','P303','P304','P305','P306','P307',
 'P400','P401','P402','P403','P404','P405','P406','P407','P408','P409','P410','P411','P412','P413','P414','P415',
 'P500','P501','P502','P503','P504','P505','P600','P601','P602','P608','P609','P610','P708'
]);
// External interrupt (ICU IRQn) of each pin (Table 1.16 "Ex. Interrupt"; -DS pins also wake deep standby).
export const RA_IRQ_PINS=Object.freeze({
 P000:6,P001:7,P002:8,P004:9,P005:10,P006:11,P008:12,P015:13,
 P100:2,P101:1,P104:1,P105:0,P110:3,P111:4,
 P205:1,P206:0,P212:3,P213:2,
 P301:6,P302:5,P304:9,P305:8,
 P400:0,P401:5,P402:4,P403:14,P404:15,P408:7,P409:6,P410:5,P411:4,P414:9,P415:8,
 P501:11,P502:12,P505:14,P708:11
});
// Pins the board or the debugger uses: SWD (J-Link OB), the boot mode pin, NMI, and the crystal pins.
export const RA_RESERVED=Object.freeze({P300:'SWCLK (J-Link OB)',P108:'SWDIO (J-Link OB)',P201:'MD (부트 모드)',P200:'NMI',P212:'EXTAL (24 MHz 미장착)',P213:'XTAL (24 MHz 미장착)'});

const RA6E1={
 id:RA_FAMILY_ID,vendor:'renesas',series:6,group:'RA6E1',part:'R7FA6E10F2CFP',core:'Cortex-M33',fpu:true,
 flashKB:1024,ramKB:256,dataFlashKB:8,package:'LQFP',pins:100,featureSet:'F',ielsr:96,
 ports:RA6E1_PORTS,
 // FPB-RA6E1 default (no main crystal): HOCO 20 MHz / 2 x 20 = PLL 200 MHz; ICLK 200, PCLKA 100, PCLKB 50,
 // PCLKC 50 (ADC), PCLKD 100 (GPT), FCLK 50 MHz.
 clock:{xtalHz:24000000,hocoMHz:20,pllDiv:2,pllMul:20,iclkDiv:1,pclkaDiv:2,pclkbDiv:4,pclkcDiv:4,pclkdDiv:2,fclkDiv:4},
 cpu:['-mcpu=cortex-m33','-mthumb','-mfpu=fpv5-sp-d16','-mfloat-abi=hard']
};
export const RA_FAMILIES=Object.freeze({[RA_FAMILY_ID]:Object.freeze(RA6E1)});
export const isRaFamily=family=>Object.hasOwn(RA_FAMILIES,family||'');
export function raFamily(family){const f=RA_FAMILIES[family];if(!f)throw new Error(`${family}: 지원하지 않는 RA MCU입니다.`);return f;}
/** "P408", "p408" or "BSP_IO_PORT_04_PIN_08" → "P408". */
export function raPinName(pin){
 const text=String(pin||'').trim(),io=/^BSP_IO_PORT_(\d{2})_PIN_(\d{2})$/.exec(text);
 if(io)return `P${Number(io[1])}${io[2]}`;
 const m=/^[Pp](\d{3,4})$/.exec(text);return m?'P'+m[1]:text;
}
/** Port and bit of a pin: P408 → {port:4, bit:8}. */
export function raPortBit(pin){const m=/^P(\d{1,2})(\d{2})$/.exec(raPinName(pin));if(!m)throw new Error('RA 핀 이름이 올바르지 않습니다: '+pin);return {port:Number(m[1]),bit:Number(m[2])};}

// FPB-RA6E1: LEDs, switch and the Arduino Uno R3 / Pmod headers (board User's Manual).
export const FPB_RA6E1=Object.freeze({
 leds:Object.freeze({LED1:'P408',LED2:'P407'}),
 userSwitch:'P205',
 arduino:Object.freeze({A0:'P000',A1:'P001',A2:'P002',A3:'P003',A4:'P004',A5:'P008',D0:'P110',D1:'P109',D2:'P409',D3:'P104',D4:'P107',D5:'P105',D6:'P303',D7:'P113',D8:'P402',D9:'P302',D10:'P103',D11:'P101',D12:'P100',D13:'P102',SDA:'P401',SCL:'P400'}),
 // The board's I2C pull-ups (2.2 kΩ to 3.3 V, E7/E8 closed).
 pullups:Object.freeze({P400:2200,P401:2200})
});

/** The FPB-RA6E1's pin configuration as a new project starts (RASC board template: LEDs out low, S1 on IRQ1). */
export function raDefaultMcu(family=RA_FAMILY_ID){
 raFamily(family);
 return {family,pins:{
  P408:{function:'GPIO_Output',initial:0,drive:'LOW',label:'LED1'},
  P407:{function:'GPIO_Output',initial:0,drive:'LOW',label:'LED2'},
  P205:{function:'IRQ',edge:'FALLING',pull:'PULLUP',priority:12,label:'SW1',callback:'external_irq1_callback'}
 }};
}

const C_NAME=/^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const PIN_FUNCTIONS=['GPIO_Output','GPIO_Input','IRQ','Analog','Peripheral'];
/** A checked copy of an RA project's MCU settings (pins, clock); throws with the reason. */
export function validateRaMcu(mcu){
 if(!mcu||typeof mcu!=='object'||Array.isArray(mcu))throw new Error('RA 핀 설정을 확인하세요.');
 const fam=raFamily(mcu.family),out={family:fam.id,pins:{}},labels=new Set(),channels=new Map(),signals=new Map();
 if(!mcu.pins||typeof mcu.pins!=='object'||Array.isArray(mcu.pins))throw new Error('RA 핀 설정을 확인하세요.');
 for(const [pin,p]of Object.entries(mcu.pins)){
  if(!fam.ports.includes(pin))throw new Error(`${pin}: ${fam.part}에 없는 핀입니다.`);
  if(RA_RESERVED[pin]&&!['P212','P213','P200'].includes(pin))throw new Error(`${pin}: ${RA_RESERVED[pin]} 핀이라 바꿀 수 없습니다.`);
  if(!p||!PIN_FUNCTIONS.includes(p.function))throw new Error(`${pin}: 지원하지 않는 핀 기능입니다.`);
  const q={function:p.function};
  if(p.label!==undefined&&p.label!==''){if(typeof p.label!=='string'||!C_NAME.test(p.label)||labels.has(p.label))throw new Error(`${pin}: 핀 이름(심볼)은 겹치지 않는 C 식별자로 쓰세요.`);labels.add(p.label);q.label=p.label;}
  if(p.function==='GPIO_Output'){
   q.initial=p.initial?1:0;
   q.drive=p.drive??'LOW';if(!['LOW','MID','HIGH'].includes(q.drive))throw new Error(`${pin}: 출력 세기를 확인하세요.`);
   if(p.outputType!==undefined){if(!['CMOS','NMOS'].includes(p.outputType))throw new Error(`${pin}: 출력 형식을 확인하세요.`);if(p.outputType==='NMOS')q.outputType='NMOS';}
  }
  if(['GPIO_Input','IRQ'].includes(p.function)){q.pull=p.pull??'NONE';if(!['NONE','PULLUP'].includes(q.pull))throw new Error(`${pin}: 풀업 설정을 확인하세요.`);}
  if(p.function==='Peripheral'){
   if(typeof p.signal!=='string'||!RA_PERIPHERAL_PINS[p.signal]?.includes(pin))throw new Error(`${pin}: ${p.signal??'주변장치 신호'}를 이 핀에 둘 수 없습니다.`);
   if(signals.has(p.signal))throw new Error(`${p.signal}은 이미 ${signals.get(p.signal)}에서 씁니다.`);signals.set(p.signal,pin);q.signal=p.signal;
  }
  if(p.function==='IRQ'){
   const ch=RA_IRQ_PINS[pin];if(ch==null)throw new Error(`${pin}: 외부 인터럽트(IRQ) 핀이 아닙니다.`);
   if(channels.has(ch))throw new Error(`${pin}: IRQ${ch}는 이미 ${channels.get(ch)}에서 씁니다.`);channels.set(ch,pin);
   q.edge=p.edge??'FALLING';if(!['FALLING','RISING','BOTH','LOW'].includes(q.edge))throw new Error(`${pin}: 인터럽트 조건을 확인하세요.`);
   q.priority=p.priority??12;if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${pin}: 인터럽트 우선순위는 0~15입니다.`);
   q.callback=p.callback??`external_irq${ch}_callback`;if(typeof q.callback!=='string'||!C_NAME.test(q.callback))throw new Error(`${pin}: 콜백 이름은 C 식별자로 쓰세요.`);
   if(p.filter)q.filter=true;
  }
  out.pins[pin]=q;
 }
 // Peripherals (RASC Stacks): SCI UART channels with their baud rate, callback and interrupt priority; GPT timers with
 // the mode (saw-wave PWM / periodic), period, duty and the cycle-end callback.
 if(mcu.peripherals!==undefined){
  if(!mcu.peripherals||typeof mcu.peripherals!=='object'||Array.isArray(mcu.peripherals))throw new Error('RA 주변장치 설정을 확인하세요.');
  out.peripherals={};
  for(const [id,p]of Object.entries(mcu.peripherals)){
   const gpt=/^GPT(\d)$/.exec(id);
   if(gpt){out.peripherals[id]=validateGpt(id,Number(gpt[1]),p,fam,mcu.clock,signals);continue;}
   if(id==='ADC0'){out.peripherals[id]=validateAdc(p,out.pins);continue;}
   const sci=/^SCI(\d)$/.exec(id);if(!sci||!RA_SCI_CHANNELS.includes(Number(sci[1]))||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다.`);
   const q={enabled:p.enabled,baud:p.baud??115200,callback:p.callback??`user_uart${sci[1]}_callback`,priority:p.priority??12};
   if(!Number.isInteger(q.baud)||q.baud<300||q.baud>2000000)throw new Error(`${id}: 통신 속도는 300~2000000 bps입니다.`);
   if(typeof q.callback!=='string'||!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요.`);
   if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${id}: 인터럽트 우선순위는 0~15입니다.`);
   if(q.enabled&&!signals.has(id+'_TXD')&&!signals.has(id+'_RXD'))throw new Error(`${id}: TXD 또는 RXD 핀을 정하세요.`);
   out.peripherals[id]=q;
  }
 }
 for(const signal of signals.keys()){const id=signal.split('_')[0];if(!out.peripherals?.[id]?.enabled)throw new Error(`${signals.get(signal)}: ${id}를 켜야 ${signal}로 쓸 수 있습니다.`);}
 if(mcu.clock!==undefined){
  const c=mcu.clock,d=fam.clock;
  if(!c||typeof c!=='object')throw new Error('RA 클록 설정을 확인하세요.');
  const clock={...d,...c};
  if(![16,18,20].includes(clock.hocoMHz)||![1,2,3].includes(clock.pllDiv)||!Number.isInteger(clock.pllMul)||clock.pllMul<10||clock.pllMul>30)throw new Error('RA 클록(HOCO·PLL) 설정을 확인하세요.');
  const pll=clock.hocoMHz/clock.pllDiv*clock.pllMul,input=clock.hocoMHz/clock.pllDiv;
  if(input<8||input>24||pll<120||pll>200)throw new Error(`PLL ${pll} MHz: PLL 입력 8~24 MHz, 출력 120~200 MHz로 설정하세요.`);
  for(const k of ['iclkDiv','pclkaDiv','pclkbDiv','pclkcDiv','pclkdDiv','fclkDiv'])if(![1,2,4,8,16,32,64].includes(clock[k]))throw new Error('RA 클록 분주를 확인하세요.');
  out.clock=Object.fromEntries(Object.keys(c).filter(k=>k in d).map(k=>[k,clock[k]]));
 }
 return out;
}

// Peripheral pin functions (Table 1.16, LQFP100) with the PmnPFS.PSEL value that selects them (FSP r_ioport.h
// IOPORT_PERIPHERAL_*): SCI0/2/4 = 4, SCI1/3/9 = 5, GPT GTIOCnA/B = 3 (IOPORT_PERIPHERAL_GPT1, every channel).
export const RA_PERIPHERAL_PINS=Object.freeze({
 SCI0_TXD:['P101','P411'],SCI0_RXD:['P100','P410'],SCI1_TXD:['P213'],SCI1_RXD:['P212','P708'],
 SCI2_TXD:['P302','P112'],SCI2_RXD:['P301','P113'],SCI3_TXD:['P409'],SCI3_RXD:['P408'],
 SCI4_TXD:['P207','P205'],SCI4_RXD:['P206'],SCI9_TXD:['P109','P602'],SCI9_RXD:['P110','P601'],
 GPT1_GTIOCA:['P105','P109','P405'],GPT1_GTIOCB:['P104','P110','P406'],GPT2_GTIOCA:['P103','P113'],GPT2_GTIOCB:['P102','P114'],
 GPT4_GTIOCA:['P205','P302','P115'],GPT4_GTIOCB:['P301','P608'],GPT5_GTIOCA:['P101','P609'],GPT5_GTIOCB:['P100','P610'],
 GPT6_GTIOCA:['P400','P407','P601'],GPT6_GTIOCB:['P401','P408','P600'],GPT7_GTIOCA:['P304'],GPT7_GTIOCB:['P303','P602']
});
export const RA_SCI_CHANNELS=Object.freeze([0,1,2,3,4,9]);
// GPT (Table 1.16 GTIOCnA/B, PSEL 00011b on every port): GPT1/2 are 32-bit, GPT4-7 16-bit (BSP_PERIPHERAL_GPT_CHANNEL_MASK 0xF6).
// ADC12 unit 0 analog inputs (Table 1.16 ADC12 column; BSP_FEATURE_ADC_UNIT_0_CHANNELS_MASK 0x31FF).
export const RA_ADC_CHANNELS=Object.freeze({P000:0,P001:1,P002:2,P003:3,P004:4,P005:5,P006:6,P007:7,P008:8,P014:12,P015:13});
export const RA_GPT_CHANNELS=Object.freeze([1,2,4,5,6,7]);
export const RA_GPT_32BIT=Object.freeze([1,2]);
export const RA_TIMER_UNITS=Object.freeze(['Hz','kHz','s','ms','us']);
const GPT_DIVIDERS=[0,1,2,3,4,5,6,8,10]; // TPCS: 1 … 64, 256, 1024 (7 and 9 are not valid on the RA6E1)
/** GPT period/duty in counts with the smallest clock divider that fits, as RASC computes it. */
export function raGptCounts(pclkd,channel,period,unit,duty=50){
 const seconds={Hz:1/period,kHz:1/(period*1e3),s:period,ms:period/1e3,us:period/1e6}[unit],raw=pclkd*seconds,max=RA_GPT_32BIT.includes(channel)?2**32:2**16;
 if(!Number.isFinite(raw)||raw<2)throw new Error(`GPT${channel}: 주기가 너무 짧습니다(PCLKD ${pclkd/1e6} MHz).`);
 for(const div of GPT_DIVIDERS){const counts=Math.round(raw/2**div);if(counts<=max)return {div,counts,duty:Math.round(counts*duty/100),hz:pclkd/2**div/counts};}
 throw new Error(`GPT${channel}: 주기가 너무 깁니다(${RA_GPT_32BIT.includes(channel)?32:16}비트, 최대 분주 1024).`);
}
/** A clock of an RA MCU configuration in Hz (default PCLKD, the GPT count clock). */
export function raClockHz(mcu,key='pclkd'){const c={...raFamily(mcu?.family).clock,...(mcu?.clock||{})};return c.hocoMHz*1e6/c.pllDiv*c.pllMul/c[key+'Div'];}
// ADC0 (r_adc g_adc0): single or continuous scan of the pins set to Analog that have an AN channel.
function validateAdc(p,pins){
 if(!p||typeof p.enabled!=='boolean')throw new Error('ADC0: 설정을 확인하세요.');
 const q={enabled:p.enabled,mode:p.mode??'SINGLE',resolution:p.resolution??12,callback:p.callback??'',priority:p.priority??12};
 if(!['SINGLE','CONTINUOUS'].includes(q.mode))throw new Error('ADC0: 동작 모드는 Single Scan 또는 Continuous Scan입니다.');
 if(![12,10,8].includes(q.resolution))throw new Error('ADC0: 분해능은 12·10·8비트입니다.');
 if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error('ADC0: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).');
 if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error('ADC0: 인터럽트 우선순위는 0~15입니다.');
 if(q.enabled&&!Object.entries(pins).some(([pin,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[pin]!=null))throw new Error('ADC0: 아날로그 입력 핀(AN000~AN008, AN012, AN013)을 Analog로 정하세요.');
 return q;
}
function validateGpt(id,ch,p,fam,clock,signals){
 if(!RA_GPT_CHANNELS.includes(ch)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다.`);
 const q={enabled:p.enabled,mode:p.mode??'PWM',period:p.period??1,unit:p.unit??'kHz',duty:p.duty??50,callback:p.callback??'',priority:p.priority??12};
 if(!['PWM','PERIODIC'].includes(q.mode))throw new Error(`${id}: 동작 모드는 PWM 또는 Periodic입니다.`);
 if(typeof q.period!=='number'||!(q.period>0)||!RA_TIMER_UNITS.includes(q.unit))throw new Error(`${id}: 주기와 단위를 확인하세요.`);
 if(typeof q.duty!=='number'||q.duty<0||q.duty>100)throw new Error(`${id}: 듀티는 0~100 %입니다.`);
 if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).`);
 if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${id}: 인터럽트 우선순위는 0~15입니다.`);
 raGptCounts(raClockHz({family:fam.id,clock}),ch,q.period,q.unit,q.duty);
 if(q.enabled&&q.mode==='PWM'&&!signals.has(id+'_GTIOCA')&&!signals.has(id+'_GTIOCB'))throw new Error(`${id}: PWM 출력 핀(GTIOC${ch}A 또는 GTIOC${ch}B)을 정하세요.`);
 return q;
}
/** PSEL of a peripheral signal ("SCI9_TXD" → 5). */
export function raPsel(signal){
 const sci=/^SCI(\d)_/.exec(signal);if(sci)return [0,2,4].includes(Number(sci[1]))?4:5;
 if(/^GPT\d_GTIOC[AB]$/.test(signal))return 3;
 throw new Error(`${signal}: 지원하지 않는 주변장치 신호입니다.`);
}
export const RA_PSEL_NAMES=Object.freeze({3:'IOPORT_PERIPHERAL_GPT1',4:'IOPORT_PERIPHERAL_SCI0_2_4_6_8',5:'IOPORT_PERIPHERAL_SCI1_3_5_7_9'});
