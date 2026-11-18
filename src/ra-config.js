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
// The pins whose interrupt input is IRQn-DS (it also cancels Deep Software Standby); one per channel. RASC lists the pin
// function by this name (S1 on P205 is IRQ1-DS). IRQn and IRQn-DS are the same ICU channel, so only one of them is used.
export const RA_IRQ_DS=Object.freeze(['P000','P001','P002','P004','P005','P006','P008','P205','P206','P212','P213','P401','P402','P403','P404']);
/** The RASC name of a pin's interrupt function: "IRQ1-DS", "IRQ6", or '' for a pin without one. */
export const raIrqName=pin=>RA_IRQ_PINS[pin]==null?'':`IRQ${RA_IRQ_PINS[pin]}${RA_IRQ_DS.includes(pin)?'-DS':''}`;
/** BSP tab defaults (bsp_cfg.h). */
export const RA_BSP_DEFAULTS=Object.freeze({stackBytes:0x400,heapBytes:0x400});
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
  P408:{function:'GPIO_Output',initial:0,drive:'HIGH',label:'LED1'},
  P407:{function:'GPIO_Output',initial:0,drive:'HIGH',label:'LED2'},
  P205:{function:'IRQ',edge:'FALLING',pull:'PULLUP',priority:12,label:'SW1',callback:'external_irq1_callback'}
 }};
}

const C_NAME=/^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
// A pin's symbolic name becomes "#define NAME (BSP_IO_PORT_…)" in bsp_pin_cfg.h and a callback name becomes a function
// the generated code declares, so a name the compiler or the generated code already uses breaks the build far from where
// it was typed (LED "int": every int in the project turns into a pin). Those are refused here with the reason.
const C_WORDS=new Set(('auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while '
 +'bool true false NULL size_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t main hal_entry errno printf sprintf snprintf puts putchar malloc free memcpy memset strlen abs').split(' '));
// The API objects the FSP 6.6 headers declare (ra/fsp/inc: extern const <api>_api_t g_<api>_on_<module>); other names of
// that shape (g_button_on_press) are the user's.
const FSP_API_OBJECTS=new Set(['g_adc_on_adc','g_can_on_can','g_elc_on_elc','g_external_irq_on_icu','g_flash_on_flash_hp','g_i2c_master_on_iic','g_i2c_slave_on_iic','g_ioport_on_ioport','g_lpm_on_lpm','g_rtc_on_rtc','g_spi_on_sci','g_spi_on_spi','g_timer_on_agt','g_timer_on_gpt','g_transfer_on_dmac','g_transfer_on_dtc','g_uart_on_sci','g_usb_on_usb','g_wdt_on_iwdt','g_wdt_on_wdt']);
/** Why a name cannot be a pin symbol or a callback of an FSP project, or '' when it can. */
export function raNameProblem(name){
 if(C_WORDS.has(name))return `${name}은(는) C나 생성 코드가 쓰는 이름입니다`;
 if(/^(R_|BSP_|FSP_|IOPORT_|ELC_|ICU_|__)/.test(name)||/^_[A-Z]/.test(name))return `${name}: R_ · BSP_ · FSP_ · IOPORT_ 로 시작하는 이름과 __ 로 시작하는 이름은 FSP와 컴파일러가 씁니다`;
 if(/^g_(ioport|external_irq\d+|uart\d+|timer\d+|agt\d+|adc\d+|i2c_master\d+|i2c_slave\d+|spi\d+|sci_spi\d+|wdt\d+|iwdt\d+|rtc\d+|lpm\d+|flash\d+|transfer\d+|elc|bsp_pin_cfg)(_ctrl|_cfg|_extend|_cfg_extend|_ext_cfg|_channel_cfg|_err_cfg|_info)?$/.test(name))return `${name}은(는) 생성 코드의 인스턴스 이름입니다`;
 // The interrupt service routines vector_data.h names (FSP drivers define them) and the drivers' API objects
 // (g_uart_on_sci, g_spi_on_spi, g_timer_on_gpt …: the extern const …_api_t g_<api>_on_<module> of the FSP 6.6 headers).
 if(/^((sci_uart|sci_spi|spi|iic_master|iic_slave)_(rxi|txi|tei|eri)|r_icu|adc_scan_end|agt_int|gpt_counter_overflow|rtc_alarm_periodic|rtc_carry|fcu_frdyi|fcu_fiferr|dmac_int)_isr$/.test(name))return `${name}은(는) FSP 드라이버의 인터럽트 처리 함수(ISR) 이름입니다`;
 if(FSP_API_OBJECTS.has(name))return `${name}은(는) FSP 드라이버의 API 객체 이름(g_…_on_…)입니다`;
 return '';
}
// The argument type of a callback by where it is set: an IRQ pin, or a peripheral (an SCI channel is a UART or, in
// simple SPI mode, an SPI master; GPT and AGT are both timers).
function callbackArgType(where,p){
 if(/^TRANSFER/.test(where))return 'dmac_callback_args_t';
 if(/^P\d/.test(where))return 'external_irq_callback_args_t';
 if(/^SCI/.test(where))return p?.mode==='SPI'?'spi_callback_args_t':'uart_callback_args_t';
 if(/^SPI/.test(where))return 'spi_callback_args_t';
 if(/^(GPT|AGT)/.test(where))return 'timer_callback_args_t';
 if(/^ADC/.test(where))return 'adc_callback_args_t';
 if(/^IIC/.test(where))return p?.mode==='SLAVE'?'i2c_slave_callback_args_t':'i2c_master_callback_args_t';
 if(/^I?WDT$/.test(where))return 'wdt_callback_args_t';
 if(where==='RTC')return 'rtc_callback_args_t';
 if(where==='FLASH')return 'flash_callback_args_t';
 return where;
}
const checkName=(where,name)=>{const problem=raNameProblem(name);if(problem)throw new Error(`${where}: ${problem}. 다른 이름을 쓰세요.`);};
/** The SCI channels running as UARTs (r_sci_uart), which the serial monitor can reach: not one in simple SPI mode. */
export const raUartChannels=mcu=>Object.keys(mcu?.peripherals||{}).filter(id=>/^SCI\d$/.test(id)&&mcu.peripherals[id]?.enabled&&mcu.peripherals[id].mode!=='SPI');
/** Maximum frequency of each RA6E1 internal clock in MHz. */
export const RA_CLOCK_LIMITS=Object.freeze({iclk:200,pclka:100,pclkb:50,pclkc:50,pclkd:100,fclk:50});
const PIN_FUNCTIONS=['GPIO_Output','GPIO_Input','IRQ','Analog','Peripheral'];
/** A checked copy of an RA project's MCU settings (pins, clock); throws with the reason. */
export function validateRaMcu(mcu){
 if(!mcu||typeof mcu!=='object'||Array.isArray(mcu))throw new Error('RA 핀 설정을 확인하세요.');
 const fam=raFamily(mcu.family),out={family:fam.id,pins:{}},labels=new Set(),channels=new Map(),signals=new Map(),callbacks=[];
 if(!mcu.pins||typeof mcu.pins!=='object'||Array.isArray(mcu.pins))throw new Error('RA 핀 설정을 확인하세요.');
 for(const [pin,p]of Object.entries(mcu.pins)){
  if(!fam.ports.includes(pin))throw new Error(`${pin}: ${fam.part}에 없는 핀입니다.`);
  if(RA_RESERVED[pin]&&!['P212','P213','P200'].includes(pin))throw new Error(`${pin}: ${RA_RESERVED[pin]} 핀이라 바꿀 수 없습니다.`);
  if(!p||!PIN_FUNCTIONS.includes(p.function))throw new Error(`${pin}: 지원하지 않는 핀 기능입니다.`);
  const q={function:p.function};
  if(p.label!==undefined&&p.label!==''){if(typeof p.label!=='string'||!C_NAME.test(p.label)||labels.has(p.label))throw new Error(`${pin}: 핀 이름(심볼)은 겹치지 않는 C 식별자로 쓰세요.`);checkName(pin,p.label);labels.add(p.label);q.label=p.label;}
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
   if(channels.has(ch))throw new Error(`${pin}: IRQ${ch}는 이미 ${channels.get(ch)}(${raIrqName(channels.get(ch))})에서 씁니다. ${raIrqName(pin)}와 같은 채널이라 함께 쓸 수 없습니다.`);channels.set(ch,pin);
   q.edge=p.edge??'FALLING';if(!['FALLING','RISING','BOTH','LOW'].includes(q.edge))throw new Error(`${pin}: 인터럽트 조건을 확인하세요.`);
   q.priority=p.priority??12;if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${pin}: 인터럽트 우선순위는 0~15입니다.`);
   q.callback=p.callback??`external_irq${ch}_callback`;if(typeof q.callback!=='string'||!C_NAME.test(q.callback))throw new Error(`${pin}: 콜백 이름은 C 식별자로 쓰세요.`);checkName(pin,q.callback);callbacks.push([pin,q.callback]);
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
   const iic=/^IIC(\d)$/.exec(id);
   if(iic){out.peripherals[id]=validateIic(id,Number(iic[1]),p,fam,mcu.clock,signals);continue;}
   const agt=/^AGT(\d)$/.exec(id);
   if(agt){out.peripherals[id]=validateAgt(id,Number(agt[1]),p,fam,mcu.clock);continue;}
   const spi=/^SPI(\d)$/.exec(id);
   if(spi){out.peripherals[id]=validateSpi(id,Number(spi[1]),p,fam,mcu.clock,signals);continue;}
   if(id==='WDT'||id==='IWDT'){out.peripherals[id]=validateWdt(id,p);continue;}
   if(id==='RTC'){out.peripherals[id]=validateRtc(p);continue;}
   if(id==='FLASH'){out.peripherals[id]=validateFlash(p);continue;}
   if(id==='LPM'){out.peripherals[id]=validateLpm(p);continue;}
   if(id==='ELC'){out.peripherals[id]=validateElc(p);continue;}
   if(/^TRANSFER\d+$/.test(id)&&Number(id.slice(8))<=31){out.peripherals[id]=validateTransfer(id,p);continue;}
   const sci=/^SCI(\d)$/.exec(id);if(!sci||!RA_SCI_CHANNELS.includes(Number(sci[1]))||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다.`);
   // One SCI channel is either a UART (r_sci_uart, the default) or a simple SPI master (r_sci_spi), as RASC adds one
   // stack or the other on the channel; the UART settings keep their shape so earlier projects stay unchanged.
   if(p.mode!==undefined&&!['UART','SPI'].includes(p.mode))throw new Error(`${id}: 동작 모드는 UART 또는 Simple SPI입니다.`);
   if(p.mode==='SPI'){out.peripherals[id]=validateSciSpi(id,Number(sci[1]),p,fam,mcu.clock,signals);continue;}
   if(signals.has(id+'_SCK'))throw new Error(`${signals.get(id+'_SCK')}: ${id}_SCK는 Simple SPI(r_sci_spi) 모드에서 씁니다. ${id}의 모드를 Simple SPI로 바꾸세요.`);
   const q={enabled:p.enabled,baud:p.baud??115200,callback:p.callback??`user_uart${sci[1]}_callback`,priority:p.priority??12};
   if(!Number.isInteger(q.baud)||q.baud<300||q.baud>2000000)throw new Error(`${id}: 통신 속도는 300~2000000 bps입니다.`);
   if(typeof q.callback!=='string'||!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요.`);
   if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${id}: 인터럽트 우선순위는 0~15입니다.`);
   if(q.enabled&&!signals.has(id+'_TXD')&&!signals.has(id+'_RXD'))throw new Error(`${id}: TXD 또는 RXD 핀을 정하세요.`);
   // The UART's transfer instances (p_transfer_tx / p_transfer_rx): a TRANSFERn stack name, or none.
   for(const k of ['transferTx','transferRx'])if(p[k]){if(typeof p[k]!=='string'||!/^TRANSFER\d+$/.test(p[k]))throw new Error(`${id}: 전송 인스턴스 이름을 확인하세요.`);q[k]=p[k];}
   out.peripherals[id]=q;
  }
  checkTransfers(out);
 }
 for(const [id,q]of Object.entries(out.peripherals||{}))if(q.callback){checkName(id,q.callback);callbacks.push([id,q.callback]);}
 // A callback is a function: it cannot have the name of a pin symbol (a macro).
 for(const [where,name]of callbacks)if(labels.has(name))throw new Error(`${where}: 콜백 이름 ${name}은(는) 핀 이름(심볼)과 같습니다. 다른 이름을 쓰세요.`);
 // hal_data.h declares each callback with its module's argument type: one function can serve stacks of the same kind
 // (two UARTs, GPT and AGT timers), but a name shared by modules whose arguments differ is two conflicting declarations.
 // A disabled stack is not generated (a project keeps its settings when its pins are cleared), so only enabled ones count.
 const seen=new Map();
 for(const [where,name]of callbacks){
  if(out.peripherals?.[where]&&!out.peripherals[where].enabled)continue;
  const type=callbackArgType(where,out.peripherals?.[where]),other=seen.get(name);
  if(other&&other.type!==type)throw new Error(`${where}: 콜백 이름 ${name}은(는) ${other.where}의 콜백과 같지만 인자 형식이 다릅니다(${type} / ${other.type}). hal_data.h에 서로 다른 선언이 둘 생기니 다른 이름을 쓰세요.`);
  if(!other)seen.set(name,{where,type});
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
  // RA6E1 operating limits (User's Manual 8.1) and the ratios the clock dividers must keep.
  const mhz=Object.fromEntries(Object.keys(RA_CLOCK_LIMITS).map(k=>[k,pll/clock[k+'Div']]));
  for(const [k,max]of Object.entries(RA_CLOCK_LIMITS))if(mhz[k]>max+1e-9)throw new Error(`${k.toUpperCase()} ${+mhz[k].toFixed(3)} MHz: 최대 ${max} MHz입니다.`);
  if(mhz.fclk<4)throw new Error(`FCLK ${+mhz.fclk.toFixed(3)} MHz: 플래시 동작에 4 MHz 이상이 필요합니다.`);
  if(!(mhz.iclk>=mhz.pclka&&mhz.pclka>=mhz.pclkb&&mhz.pclkd>=mhz.pclka&&mhz.iclk>=mhz.fclk))throw new Error('클록 비율: ICLK ≥ PCLKA ≥ PCLKB, PCLKD ≥ PCLKA, ICLK ≥ FCLK로 정하세요.');
  out.clock=Object.fromEntries(Object.keys(c).filter(k=>k in d).map(k=>[k,clock[k]]));
 }
 // BSP tab: main stack and heap sizes (bsp_cfg.h BSP_CFG_STACK_MAIN_BYTES / BSP_CFG_HEAP_BYTES).
 if(mcu.bsp!==undefined){
  const b=mcu.bsp;if(!b||typeof b!=='object'||Array.isArray(b))throw new Error('RA BSP 설정을 확인하세요.');
  const stackBytes=b.stackBytes??RA_BSP_DEFAULTS.stackBytes,heapBytes=b.heapBytes??RA_BSP_DEFAULTS.heapBytes;
  if(!Number.isInteger(stackBytes)||stackBytes<0x100||stackBytes>0x20000||stackBytes%8)throw new Error('Main stack size: 0x100~0x20000 바이트, 8의 배수로 정하세요.');
  if(!Number.isInteger(heapBytes)||heapBytes<0||heapBytes>0x20000||heapBytes%8)throw new Error('Heap size: 0~0x20000 바이트, 8의 배수로 정하세요.');
  out.bsp={stackBytes,heapBytes};
 }
 return out;
}

// Peripheral pin functions (Table 1.16, LQFP100) with the PmnPFS.PSEL value that selects them (FSP r_ioport.h
// IOPORT_PERIPHERAL_*): SCI0/2/4 = 4, SCI1/3/9 = 5, GPT GTIOCnA/B = 3 (IOPORT_PERIPHERAL_GPT1, every channel),
// IIC SCLn/SDAn = 7 (IOPORT_PERIPHERAL_IIC), RSPI = 6 (IOPORT_PERIPHERAL_SPI).
// SPI1 (MISOB/MOSIB/RSPCKB/SSLB0): pin group A P100-P103 (Arduino D12/D11/D13/D10 and Pmod1: the RA6E1 datasheet lists
// P100 as MISOB_A, the FPB-RA6E1 schematic labels D10-D13 SSLB0/MOSIB/MISOB/RSPCKB), pin group B P410-P413 (Zephyr's
// fpb_ra6e1 pinctrl for spi1). SPI0's pins are not offered: they could not be checked against the hardware manual.
// SCI9_SCK (P111, Arduino-side Pmod2 "SCK9" on the schematic) is the clock of SCI9 in simple SPI mode, where TXD9 is
// MOSI9 and RXD9 is MISO9.
export const RA_PERIPHERAL_PINS=Object.freeze({
 SCI0_TXD:['P101','P411'],SCI0_RXD:['P100','P410'],SCI1_TXD:['P213'],SCI1_RXD:['P212','P708'],
 SCI2_TXD:['P302','P112'],SCI2_RXD:['P301','P113'],SCI3_TXD:['P409'],SCI3_RXD:['P408'],
 SCI4_TXD:['P207','P205'],SCI4_RXD:['P206'],SCI9_TXD:['P109','P602'],SCI9_RXD:['P110','P601'],SCI9_SCK:['P111'],
 SPI1_MISO:['P100','P410'],SPI1_MOSI:['P101','P411'],SPI1_RSPCK:['P102','P412'],SPI1_SSL0:['P103','P413'],
 GPT1_GTIOCA:['P105','P109','P405'],GPT1_GTIOCB:['P104','P110','P406'],GPT2_GTIOCA:['P103','P113'],GPT2_GTIOCB:['P102','P114'],
 GPT4_GTIOCA:['P205','P302','P115'],GPT4_GTIOCB:['P301','P608'],GPT5_GTIOCA:['P101','P609'],GPT5_GTIOCB:['P100','P610'],
 GPT6_GTIOCA:['P400','P407','P601'],GPT6_GTIOCB:['P401','P408','P600'],GPT7_GTIOCA:['P304'],GPT7_GTIOCB:['P303','P602'],
 IIC0_SCL:['P400','P408'],IIC0_SDA:['P401','P407'],IIC1_SCL:['P205'],IIC1_SDA:['P206']
});
export const RA_SCI_CHANNELS=Object.freeze([0,1,2,3,4,9]);
// RSPI channels offered (BSP_FEATURE_SPI_NUM_CHANNELS is 2; only SPI1's pins are confirmed, see above) and the SCI channels
// with a simple SPI clock pin (SCKn) in the pin table.
export const RA_SPI_CHANNELS=Object.freeze([1]);
export const RA_SCI_SPI_CHANNELS=Object.freeze([9]);
/** RSPI bit-rate settings (SPBR, SPCMD0.BRDV) for `rate` from PCLKA (BSP_FEATURE_SPI_CLOCK), as R_SPI_CalculateBitrate and
 * RASC compute them: the smallest divider PCLKA / (2 x (SPBR + 1) x 2^BRDV) not faster than the rate. */
export function raSpiBitrate(pclka,rate){
 const divider=Math.ceil(pclka/rate);
 if(!(rate>0)||divider>4096)throw new Error(`SPI ${rate} bps: PCLKA ${pclka/1e6} MHz로 만들 수 없는 속도입니다(최저 ${Math.ceil(pclka/4096)} bps).`);
 if(divider<2)return {spbr:0,brdv:0,actual:pclka/2};
 let brdv=0;while(brdv<3&&divider>512<<brdv)brdv++;
 const step=2*2**brdv,spbr=Math.ceil(divider/step)-1;
 return {spbr,brdv,actual:pclka/(step*(spbr+1))};
}
/** SCI simple SPI (clock synchronous) bit-rate settings, as R_SCI_SPI_CalculateBitrate computes them without MDDR:
 * PCLKA / (4 x 4^CKS x (BRR + 1)), the largest rate not above `rate`. */
export function raSciSpiBitrate(pclka,rate){
 if(!(rate>0)||rate<Math.ceil(pclka/65536))throw new Error(`Simple SPI ${rate} bps: PCLKA ${pclka/1e6} MHz로 만들 수 없는 속도입니다(최저 ${Math.ceil(pclka/65536)} bps).`);
 let cks=0,brr=0;
 for(;cks<4;cks++){brr=Math.ceil(pclka/(4**(cks+1)*rate))-1;if(brr<=255)break;}
 return {cks,brr,actual:pclka/(4**(cks+1)*(brr+1))};
}
// GPT (Table 1.16 GTIOCnA/B, PSEL 00011b on every port): GPT1/2 are 32-bit, GPT4-7 16-bit (BSP_PERIPHERAL_GPT_CHANNEL_MASK 0xF6).
// ADC12 unit 0 analog inputs (Table 1.16 ADC12 column; BSP_FEATURE_ADC_UNIT_0_CHANNELS_MASK 0x31FF).
export const RA_ADC_CHANNELS=Object.freeze({P000:0,P001:1,P002:2,P003:3,P004:4,P005:5,P006:6,P007:7,P008:8,P014:12,P015:13});
export const RA_GPT_CHANNELS=Object.freeze([1,2,4,5,6,7]);
// IIC0/1 (RIIC, BSP_PERIPHERAL_IIC_CHANNEL_MASK 0x3; Fast-mode Plus on IIC0 only).
export const RA_IIC_CHANNELS=Object.freeze([0,1]);
export const RA_IIC_RATES=Object.freeze({STANDARD:100000,FAST:400000,FASTPLUS:1000000});
/** RIIC bit-rate settings (ICMR1.CKS, ICBRH, ICBRL) for a rate, 50 % duty with 120 ns rise and fall, as RASC computes them. */
export function raIicClock(pclkb,rate){
 const hz=RA_IIC_RATES[rate]??rate;
 for(let cks=0;cks<8;cks++){const ref=pclkb/2**cks,counts=Math.round((1/hz-240e-9)*ref)-2;if(counts<=62&&counts>=2){const brl=Math.ceil(counts/2),brh=counts-brl;return {cks,brh,brl,actual:1/((brh+brl+2)/ref+240e-9),duty:(brh+1)/(brh+brl+2)*100};}}
 throw new Error(`I²C ${hz} Hz: PCLKB ${pclkb/1e6} MHz로 만들 수 없는 속도입니다.`);
}
/** This board's default address as an I2C slave (r_iic_slave), outside the addresses of the I2C parts in the circuit. */
export const RA_IIC_SLAVE_ADDRESS=0x42;
/** r_iic_slave clock settings (iic_slave_clock_settings_t: ICMR1.CKS, ICBRL for the data setup time, digital filter
 * stages). The master drives SCL, so the slave uses only the reference clock and the low width: the same CKS and ICBRL
 * as the master at that rate (raIicClock), and no noise filter stages. */
export function raIicSlaveClock(pclkb,rate){const c=raIicClock(pclkb,rate);return {cks:c.cks,brl:c.brl,filter:0};}
// AGT0-5 (16-bit, BSP_PERIPHERAL_AGT_CHANNEL_MASK 0x3F): periodic timers counting PCLKB /1, /2, /8 or LOCO (32.768 kHz) /1-/128.
export const RA_AGT_CHANNELS=Object.freeze([0,1,2,3,4,5]);
const LOCO_HZ=32768;
/** AGT count source, divider and period counts for a period, PCLKB first, then LOCO (as RASC offers them). */
export function raAgtCounts(pclkb,channel,period,unit){
 const seconds={Hz:1/period,kHz:1/(period*1e3),s:period,ms:period/1e3,us:period/1e6}[unit];
 const options=[['PCLKB',pclkb,0],['PCLKB',pclkb/2,1],['PCLKB',pclkb/8,3],...[0,1,2,3,4,5,6,7].map(d=>['LOCO',LOCO_HZ/2**d,d])];
 for(const [source,hz,div]of options){const counts=Math.round(seconds*hz);if(Number.isFinite(counts)&&counts>=2&&counts<=65536)return {source,div,counts,hz:hz/counts};}
 throw new Error(`AGT${channel}: 주기는 PCLKB 2카운트 이상, LOCO/128로 65536카운트(약 256초) 이하로 정하세요.`);
}
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
 // Start source (feature 36): software (R_ADC_ScanStart starts a scan) or the ELC link of ELC_PERIPHERAL_ADC0 (ScanStart
 // lets the linked event start each scan). Projects from before keep their shape: no field is software.
 if(p.trigger!==undefined&&p.trigger!=='SOFTWARE'){
  if(!RA_ADC_TRIGGERS.includes(p.trigger))throw new Error('ADC0: 시작 트리거는 Software 또는 ELC입니다.');
  q.trigger=p.trigger;q.elcEvent=p.elcEvent??'GPT1_COUNTER_OVERFLOW';
  if(!RA_ADC_ELC_EVENTS.includes(q.elcEvent))throw new Error('ADC0: ELC로 스캔을 시작할 이벤트를 고르세요.');
  if(q.mode==='CONTINUOUS')throw new Error('ADC0: ELC 트리거는 Single Scan에서 씁니다.');
 }
 if(!['SINGLE','CONTINUOUS'].includes(q.mode))throw new Error('ADC0: 동작 모드는 Single Scan 또는 Continuous Scan입니다.');
 if(![12,10,8].includes(q.resolution))throw new Error('ADC0: 분해능은 12·10·8비트입니다.');
 if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error('ADC0: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).');
 if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error('ADC0: 인터럽트 우선순위는 0~15입니다.');
 if(q.enabled&&!Object.entries(pins).some(([pin,x])=>x.function==='Analog'&&RA_ADC_CHANNELS[pin]!=null))throw new Error('ADC0: 아날로그 입력 핀(AN000~AN008, AN012, AN013)을 Analog로 정하세요.');
 return q;
}
// One IIC channel is an I2C master (r_iic_master, the default: its settings keep their shape) or an I2C slave
// (r_iic_slave, mode 'SLAVE'), as RASC puts one stack or the other on the channel. `slave` is the address the master
// talks to, or in slave mode this board's own 7-bit address (i2c_slave_cfg_t.slave; 0x08-0x77, outside the reserved ones).
function validateIic(id,ch,p,fam,clock,signals){
 if(!RA_IIC_CHANNELS.includes(ch)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다.`);
 if(p.mode!==undefined&&!['MASTER','SLAVE'].includes(p.mode))throw new Error(`${id}: 동작 모드는 Master(r_iic_master) 또는 Slave(r_iic_slave)입니다.`);
 const slaveMode=p.mode==='SLAVE';
 const q={enabled:p.enabled,...(slaveMode?{mode:'SLAVE'}:{}),rate:p.rate??'STANDARD',slave:p.slave??(slaveMode?RA_IIC_SLAVE_ADDRESS:0x50),callback:p.callback??`i2c_${slaveMode?'slave':'master'}${ch}_callback`,priority:p.priority??12};
 if(!Object.hasOwn(RA_IIC_RATES,q.rate)||q.rate==='FASTPLUS'&&ch!==0)throw new Error(`${id}: 속도는 Standard(100 kHz)·Fast(400 kHz)${ch===0?'·Fast-mode Plus(1 MHz)':''}입니다.`);
 if(slaveMode){if(!Number.isInteger(q.slave)||q.slave<0x08||q.slave>0x77)throw new Error(`${id}: 슬레이브 모드의 자기 주소는 7비트 0x08~0x77입니다(0x00~0x07과 0x78~0x7F는 I²C 예약 주소).`);}
 else if(!Number.isInteger(q.slave)||q.slave<0||q.slave>0x7f)throw new Error(`${id}: 슬레이브 주소는 7비트(0x00~0x7F)입니다.`);
 if(typeof q.callback!=='string'||!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요(${slaveMode?'r_iic_slave는 콜백에서 R_IIC_SLAVE_Read · R_IIC_SLAVE_Write를 부릅니다':'r_iic_master는 콜백으로 완료를 알립니다'}).`);
 if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${id}: 인터럽트 우선순위는 0~15입니다.`);
 if(slaveMode)raIicSlaveClock(raClockHz({family:fam.id,clock},'pclkb'),q.rate);else raIicClock(raClockHz({family:fam.id,clock},'pclkb'),q.rate);
 if(q.enabled&&(!signals.has(id+'_SCL')||!signals.has(id+'_SDA')))throw new Error(`${id}: SCL과 SDA 핀을 모두 정하세요.`);
 return q;
}
// SPI master settings shared by r_spi and r_sci_spi (spi_cfg_t): bit rate, clock polarity/phase, bit order, the callback
// (both drivers assert p_callback) and one interrupt priority for RXI/TXI/TEI/ERI. The data width is not a setting: FSP
// takes it per call (spi_bit_width_t of R_SPI_Write/Read/WriteRead).
function spiCommon(id,p,defaults){
 const q={enabled:p.enabled,...(defaults.mode?{mode:defaults.mode}:{}),bitrate:p.bitrate??1000000,cpol:p.cpol??0,cpha:p.cpha??0,bitOrder:p.bitOrder??'MSB',...(defaults.ssl?{ssl:p.ssl??defaults.ssl}:{}),callback:p.callback??defaults.callback,priority:p.priority??12};
 if(typeof q.bitrate!=='number'||!Number.isInteger(q.bitrate))throw new Error(`${id}: 비트레이트(bps)는 정수로 쓰세요.`);
 if(![0,1].includes(q.cpol)||![0,1].includes(q.cpha))throw new Error(`${id}: Clock Polarity·Clock Phase를 확인하세요.`);
 if(!['MSB','LSB'].includes(q.bitOrder))throw new Error(`${id}: Bit Order는 MSB First 또는 LSB First입니다.`);
 if(typeof q.callback!=='string'||!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요(${defaults.module}는 콜백으로 전송 완료를 알립니다).`);
 if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${id}: 인터럽트 우선순위는 0~15입니다.`);
 return q;
}
function validateSpi(id,ch,p,fam,clock,signals){
 if(!RA_SPI_CHANNELS.includes(ch)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다${ch===0?' (SPI0의 핀은 아직 확인하지 못해 SPI1만 씁니다)':''}.`);
 const q=spiCommon(id,p,{callback:`spi${ch}_callback`,module:'r_spi',ssl:signals.has(id+'_SSL0')?'SSL0':'NONE'});
 if(!['SSL0','NONE'].includes(q.ssl))throw new Error(`${id}: Slave Select는 SSL0(하드웨어) 또는 사용 안 함(GPIO로 CS)입니다.`);
 const pclka=raClockHz({family:fam.id,clock},'pclka');
 if(q.bitrate<1000||q.bitrate>pclka/2)throw new Error(`${id}: 비트레이트는 1000 bps~PCLKA/2(${pclka/2} bps)입니다.`);
 raSpiBitrate(pclka,q.bitrate);
 if(q.enabled){
  if(!signals.has(id+'_RSPCK')||!signals.has(id+'_MOSI')&&!signals.has(id+'_MISO'))throw new Error(`${id}: RSPCK 핀과 MOSI 또는 MISO 핀을 정하세요.`);
  if(q.ssl==='SSL0'&&!signals.has(id+'_SSL0'))throw new Error(`${id}: Slave Select가 SSL0이면 SSL0 핀(P103 또는 P413)을 정하세요. GPIO로 CS를 직접 내리려면 Slave Select를 사용 안 함으로 바꾸세요.`);
  if(q.ssl==='NONE'&&signals.has(id+'_SSL0'))throw new Error(`${signals.get(id+'_SSL0')}: SSL0 핀을 쓰려면 ${id}의 Slave Select를 SSL0으로 정하세요.`);
 }
 return q;
}
function validateSciSpi(id,ch,p,fam,clock,signals){
 if(!RA_SCI_SPI_CHANNELS.includes(ch)||typeof p.enabled!=='boolean')throw new Error(`${id}: Simple SPI(r_sci_spi)는 SCK 핀이 있는 SCI${RA_SCI_SPI_CHANNELS.join('·SCI')}에서 씁니다.`);
 const q=spiCommon(id,p,{mode:'SPI',callback:`sci_spi${ch}_callback`,module:'r_sci_spi'}),pclka=raClockHz({family:fam.id,clock},'pclka');
 if(q.bitrate<Math.ceil(pclka/65536)||q.bitrate>pclka/4)throw new Error(`${id}: 비트레이트는 ${Math.ceil(pclka/65536)}~${pclka/4} bps(PCLKA/4)입니다.`);
 if(q.enabled&&(!signals.has(id+'_SCK')||!signals.has(id+'_TXD')&&!signals.has(id+'_RXD')))throw new Error(`${id}: Simple SPI는 SCK 핀과 TXD(MOSI) 또는 RXD(MISO) 핀을 정하세요.`);
 return q;
}
function validateAgt(id,ch,p,fam,clock){
 if(!RA_AGT_CHANNELS.includes(ch)||!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 지원하지 않는 주변장치입니다.`);
 const q={enabled:p.enabled,period:p.period??100,unit:p.unit??'ms',callback:p.callback??`agt${ch}_callback`,priority:p.priority??12};
 if(typeof q.period!=='number'||!(q.period>0)||!RA_TIMER_UNITS.includes(q.unit))throw new Error(`${id}: 주기와 단위를 확인하세요.`);
 if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).`);
 if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${id}: 인터럽트 우선순위는 0~15입니다.`);
 raAgtCounts(raClockHz({family:fam.id,clock},'pclkb'),ch,q.period,q.unit);
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
// Watchdogs (r_wdt g_wdt0, r_iwdt g_iwdt0), pin-less stacks. Timeouts and dividers are the ones each one has
// (r_wdt.c g_wdtcr_timeout, r_iwdt.c g_iwdt_timeout; the CKS codes of wdt_clock_division_t). The IWDT runs from OFS0 only
// (BSP_FEATURE_IWDT_SUPPORTS_REGISTER_START_MODE 0); the WDT starts from its registers at the first R_WDT_Refresh, or
// from OFS0 at reset (Start Mode: Auto).
export const RA_WDT=Object.freeze({
 WDT:Object.freeze({timeouts:[1024,4096,8192,16384],dividers:[4,64,128,512,2048,8192],defaults:{timeout:16384,clockDiv:8192}}),
 IWDT:Object.freeze({timeouts:[128,512,1024,2048],dividers:[1,16,32,64,128,256],defaults:{timeout:2048,clockDiv:256}})
});
export const RA_WDT_WINDOW_START=Object.freeze([100,75,50,25]),RA_WDT_WINDOW_END=Object.freeze([0,25,50,75]);
export const RA_IWDT_HZ=15000; // BSP_FEATURE_IWDT_CLOCK_FREQUENCY
// wdt_clock_division_t / wdt_timeout_t (r_wdt_api.h) and the register field codes.
export const WDT_DIVISION_CODE=Object.freeze({1:0,4:1,16:2,32:3,64:4,128:15,256:5,512:6,2048:7,8192:8});
export const WDT_TIMEOUT_ENUM=Object.freeze({128:0,512:1,1024:2,2048:3,4096:4,8192:5,16384:6});
const WDT_START_CODE={25:0,50:1,75:2,100:3},WDT_END_CODE={75:0,50:1,25:2,0:3};
function validateWdt(id,p){
 const info=RA_WDT[id];if(!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 설정을 확인하세요.`);
 const q={enabled:p.enabled,startMode:id==='IWDT'?'AUTO':p.startMode??'REGISTER',timeout:p.timeout??info.defaults.timeout,clockDiv:p.clockDiv??info.defaults.clockDiv,windowStart:p.windowStart??100,windowEnd:p.windowEnd??0,reset:p.reset??'RESET',stopInSleep:!!p.stopInSleep,callback:p.callback??''};
 if(id==='IWDT'&&p.startMode!==undefined&&p.startMode!=='AUTO')throw new Error('IWDT: RA6E1의 IWDT는 OFS0으로 리셋 때 시작합니다(Register start mode 없음).');
 if(!['REGISTER','AUTO'].includes(q.startMode))throw new Error(`${id}: 시작 방식은 Register 또는 Auto입니다.`);
 if(!info.timeouts.includes(q.timeout))throw new Error(`${id}: Timeout은 ${info.timeouts.join(' · ')} 클록입니다.`);
 if(!info.dividers.includes(q.clockDiv))throw new Error(`${id}: 클록 분주는 ${info.dividers.map(d=>'/'+d).join(' · ')}입니다.`);
 if(!RA_WDT_WINDOW_START.includes(q.windowStart)||!RA_WDT_WINDOW_END.includes(q.windowEnd))throw new Error(`${id}: 새로 고침 창 시작은 100·75·50·25 %, 끝은 0·25·50·75 %입니다.`);
 if(q.windowEnd>=q.windowStart)throw new Error(`${id}: 창 끝(${q.windowEnd} %)은 창 시작(${q.windowStart} %)보다 작아야 합니다.`);
 if(!['RESET','NMI'].includes(q.reset))throw new Error(`${id}: 시간 초과 동작은 Reset 또는 NMI입니다.`);
 if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).`);
 // r_wdt.c / r_iwdt.c parameter checking: p_callback must be NULL unless the NMI is the output (Open returns
 // FSP_ERR_ASSERTION otherwise), so with Reset output there is no callback: a name left from an NMI setting is dropped.
 if(q.reset==='RESET')q.callback='';
 if(q.reset==='NMI'&&!q.callback)throw new Error(`${id}: NMI로 알리려면 콜백 이름을 쓰세요.`);
 return q;
}
// RTC (r_rtc g_rtc0), a pin-less stack. Count source LOCO (default: on the FPB-RA6E1 the 32.768 kHz crystal X2 is fitted
// but E25/E26 are open, so XCIN/XCOUT reach only J3 and the sub-clock does not run as delivered) or the sub-clock; RFRL for
// LOCO (r_rtc.c accepts 8-510; 255 makes 128 Hz from 32.768 kHz). Interrupt priorities as RASC (null: Disabled); the
// carry interrupt is required (R_RTC_CalendarTimeGet uses it).
// Start time (decision, feature 34): 'SIMULATION' (default) — at power-on the counters hold 2000-01-01 00:00:00, and
// R_RTC_Open sets the count source and stops the RTC (RTC_CFG_OPEN_SET_CLOCK_SOURCE 1, FSP's default) so the program
// sets the time: every run is the same, which tests and lessons need. 'HOST_TIME' — the counters hold the PC's local
// time and run, as a battery-backed RTC that kept the time; Open leaves it running (RTC_CFG_OPEN_SET_CLOCK_SOURCE 0) and
// R_RTC_CalendarTimeGet reads the PC time without setting it.
export const RA_RTC_DEFAULTS=Object.freeze({clockSource:'LOCO',start:'SIMULATION',freqCompare:255,callback:'rtc_callback',alarmPriority:12,periodicPriority:12,carryPriority:12});
function validateRtc(p){
 if(!p||typeof p.enabled!=='boolean')throw new Error('RTC: 설정을 확인하세요.');
 const q={enabled:p.enabled,...RA_RTC_DEFAULTS,...Object.fromEntries(Object.keys(RA_RTC_DEFAULTS).filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))};
 if(!['LOCO','SUBCLOCK'].includes(q.clockSource))throw new Error('RTC: 클록 소스는 LOCO 또는 Sub-Clock입니다.');
 if(!['SIMULATION','HOST_TIME'].includes(q.start))throw new Error('RTC: 시작 시각은 시뮬레이션(2000-01-01) 또는 PC 시각입니다.');
 if(!Number.isInteger(q.freqCompare)||q.freqCompare<8||q.freqCompare>510)throw new Error('RTC: 주파수 비교값(RFRL)은 8~510입니다(LOCO 32.768 kHz에서 255).');
 if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error('RTC: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).');
 for(const [k,label,optional]of [['alarmPriority','Alarm',true],['periodicPriority','Period',true],['carryPriority','Carry',false]])
  if(!(optional&&q[k]===null)&&(!Number.isInteger(q[k])||q[k]<0||q[k]>15))throw new Error(`RTC: ${label} 인터럽트 우선순위는 0~15${optional?'(또는 Disabled)':''}입니다.`);
 return q;
}
// Data flash (r_flash_hp g_flash0), a pin-less stack. RASC's Properties: Data Flash Background Operation (BGO), the
// callback and the flash-ready / flash-error interrupt priorities. Code flash programming is off
// (FLASH_HP_CFG_CODE_FLASH_PROGRAMMING_ENABLE 0): the simulator programs the data flash only.
// Without BGO a call returns when the operation is done and r_flash_hp uses no interrupt (R_FLASH_HP_Open does not even
// take the callback), so the callback goes with BGO, as a watchdog's goes with the NMI output. With BGO the two
// interrupts are required (Open returns FSP_ERR_IRQ_BSP_DISABLED without them) and Erase / Write / BlankCheck assert
// a callback, set here or by R_FLASH_HP_CallbackSet.
export const RA_FLASH_DEFAULTS=Object.freeze({bgo:false,callback:'',readyPriority:12,errorPriority:12});
function validateFlash(p){
 if(!p||typeof p.enabled!=='boolean')throw new Error('FLASH: 설정을 확인하세요.');
 const q={enabled:p.enabled,...RA_FLASH_DEFAULTS,...Object.fromEntries(Object.keys(RA_FLASH_DEFAULTS).filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))};
 if(typeof q.bgo!=='boolean')throw new Error('FLASH: Data Flash Background Operation은 Enabled 또는 Disabled입니다.');
 if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error('FLASH: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).');
 for(const [k,label]of [['readyPriority','Flash Ready'],['errorPriority','Flash Error']])if(!Number.isInteger(q[k])||q[k]<0||q[k]>15)throw new Error(`FLASH: ${label} 인터럽트 우선순위는 0~15입니다.`);
 if(!q.bgo)q.callback='';
 return q;
}
// Low power modes (r_lpm g_lpm0), a pin-less stack: the mode R_LPM_LowPowerModeEnter enters, the sources that end it
// and the Deep Software Standby options. The values are the RA6E1's (FSP 6.6 bsp_feature.h of the ra6e1 group):
//   Software Standby wake sources — lpm_standby_wake_source_t, the bits of ICU WUPEN / WUPEN1
//     (BSP_FEATURE_ICU_WUPEN_MASK 0x00000007FB0DFFFF);
//   Deep Software Standby cancel sources — lpm_deep_standby_cancel_source_t, the bits of DPSIER0-3
//     (BSP_FEATURE_LPM_DPSIER_MASK 0x0D1FDFF3: IRQ0, 1, 4-12, 14, 15 -DS, LVD1/2, RTC interval and alarm, NMI, USBFS,
//     AGT1 and AGT3 underflow), with the edge of the pin sources in DPSIEGR0-2 (BSP_FEATURE_LPM_DPSIEGR_MASK 0x0013DFF3).
// R_LPM_Open returns FSP_ERR_INVALID_MODE for a source outside these masks, so the settings offer what is inside them
// and the simulator models: IRQn pins, the RTC, the AGT1/AGT3 underflow and (Software Standby) the IWDT.
const irqBits=channels=>Object.fromEntries(channels.map(n=>['IRQ'+n,n]));
export const RA_LPM_MODES=Object.freeze(['SLEEP','STANDBY','DEEP']);
export const RA_LPM_MODE_NAMES=Object.freeze({SLEEP:'Sleep',STANDBY:'Software Standby',DEEP:'Deep Software Standby'});
export const RA_LPM_WUPEN_MASK=0x7fb0dffff,RA_LPM_DPSIER_MASK=0x0d1fdff3,RA_LPM_DPSIEGR_MASK=0x0013dff3;
export const RA_LPM_WAKE_BITS=Object.freeze({...irqBits(Array.from({length:16},(_,i)=>i)),IWDT:16,LVD1:18,LVD2:19,RTCALM:24,RTCPRD:25,USBFS:27,AGT1UD:28,AGT1CA:29,AGT1CB:30,IIC0:31,AGT3UD:32,AGT3CA:33,AGT3CB:34});
export const RA_LPM_CANCEL_BITS=Object.freeze({...irqBits([0,1,4,5,6,7,8,9,10,11,12,14,15]),LVD1:16,LVD2:17,RTC_INTERVAL:18,RTC_ALARM:19,NMI:20,USBFS:24,AGT1:26,AGT3:27});
/** The sources the settings offer (the ones the simulator models), in bit order. */
export const RA_LPM_WAKE=Object.freeze([...Array.from({length:16},(_,i)=>'IRQ'+i),'IWDT','RTCALM','RTCPRD','AGT1UD','AGT3UD']);
export const RA_LPM_CANCEL=Object.freeze([...[0,1,4,5,6,7,8,9,10,11,12,14,15].map(n=>'IRQ'+n),'RTC_INTERVAL','RTC_ALARM','AGT1','AGT3']);
export const RA_LPM_POWER=Object.freeze({DEEPCUT0:0,DEEPCUT1:1,DEEPCUT3:3});
/** The pin whose IRQn-DS input cancels Deep Software Standby for channel `ch` (null: the channel has none). */
export const raDsPin=ch=>RA_IRQ_DS.find(pin=>RA_IRQ_PINS[pin]===ch)??null;
export const RA_LPM_DEFAULTS=Object.freeze({mode:'SLEEP',wake:Object.freeze([]),ioKeep:true,power:'DEEPCUT0',cancel:Object.freeze([]),cancelRising:Object.freeze([])});
function validateLpm(p){
 if(!p||typeof p.enabled!=='boolean')throw new Error('LPM: 설정을 확인하세요.');
 // A stack that is turned off is not generated: what it holds is not a reason to refuse the project (the defaults stand in).
 if(!p.enabled){try{return {...validateLpm({...p,enabled:true}),enabled:false};}catch{return {enabled:false,...RA_LPM_DEFAULTS,wake:[],cancel:[],cancelRising:[]};}}
 const list=(v,all,label)=>{
  if(!Array.isArray(v)||v.some(x=>typeof x!=='string'))throw new Error(`LPM: ${label}를 확인하세요.`);
  const bad=v.find(x=>!all.includes(x));if(bad!==undefined)throw new Error(`LPM: ${label} ${bad}은(는) 고를 수 없습니다(${all.filter(x=>!/^IRQ/.test(x)).join(' · ')} · IRQn 중에서 고르세요).`);
  return all.filter(x=>v.includes(x));
 };
 const q={enabled:p.enabled,mode:p.mode??RA_LPM_DEFAULTS.mode,wake:list(p.wake??[],RA_LPM_WAKE,'Software Standby를 깨우는 소스'),ioKeep:p.ioKeep??true,power:p.power??RA_LPM_DEFAULTS.power,
  cancel:list(p.cancel??[],RA_LPM_CANCEL,'Deep Software Standby 해제 소스'),cancelRising:[]};
 if(!RA_LPM_MODES.includes(q.mode))throw new Error('LPM: 저전력 모드는 Sleep · Software Standby · Deep Software Standby입니다.');
 if(typeof q.ioKeep!=='boolean')throw new Error('LPM: I/O 포트 상태 유지(IOKEEP)는 켜거나 끕니다.');
 if(!Object.hasOwn(RA_LPM_POWER,q.power))throw new Error('LPM: 전원 공급은 DEEPCUT0 · DEEPCUT1 · DEEPCUT3입니다.');
 // r_lpm.c: an edge without its source is FSP_ERR_INVALID_MODE; only the IRQn-DS pins have an edge here.
 q.cancelRising=list(p.cancelRising??[],RA_LPM_CANCEL.filter(x=>/^IRQ/.test(x)),'상승 엣지로 해제할 IRQn-DS');
 const lone=q.cancelRising.find(x=>!q.cancel.includes(x));if(lone)throw new Error(`LPM: ${lone}-DS의 엣지를 정하려면 해제 소스에도 ${lone}을(를) 넣으세요.`);
 return q;
}
// Event Link Controller (r_elc g_elc), DTC (r_dtc) and DMAC (r_dmac) transfers — feature 36.
// The events the settings offer: the ones the simulator's peripherals raise (bsp_elc.h of the RA6E1, FSP 6.6). An event
// name is the ELC_EVENT_ constant without its prefix.
const gptOverflow={1:0xcf,2:0xd8,4:0xea,5:0xf3,6:0xfc,7:0x105},sciEvent={0:0x180,1:0x186,2:0x18c,3:0x192,4:0x198,9:0x1b6};
export const RA_ELC_EVENTS=Object.freeze({
 ...Object.fromEntries(Array.from({length:16},(_,n)=>['ICU_IRQ'+n,1+n])),
 ...Object.fromEntries(Array.from({length:8},(_,n)=>[`DMAC${n}_INT`,0x20+n])),
 DTC_COMPLETE:0x29,
 ...Object.fromEntries([0,1,2,3,4,5].map(n=>[`AGT${n}_INT`,0x40+3*n])),
 ELC_SOFTWARE_EVENT_0:0xb5,ELC_SOFTWARE_EVENT_1:0xb6,
 ...Object.fromEntries(Object.entries(gptOverflow).map(([ch,v])=>[`GPT${ch}_COUNTER_OVERFLOW`,v])),
 ADC0_SCAN_END:0x160,
 ...Object.fromEntries(Object.entries(sciEvent).flatMap(([ch,v])=>['RXI','TXI','TEI','ERI'].map((k,i)=>[`SCI${ch}_${k}`,v+i])))
});
/** The ELC event name of an event number (null when the settings do not offer it). */
export const raElcEventName=n=>Object.keys(RA_ELC_EVENTS).find(k=>RA_ELC_EVENTS[k]===n)??null;
// ELSRn of the RA6E1 (bsp_elc.h elc_peripheral_t, BSP_ELC_PERIPHERAL_MASK 0x3D3FF). The simulator links ADC0 (group A
// start, ADSTRGR.TRSA = ELC_AD0); the others are kept as written but nothing in the models takes them.
export const RA_ELC_PERIPHERALS=Object.freeze({GPT_A:0,GPT_B:1,GPT_C:2,GPT_D:3,GPT_E:4,GPT_F:5,GPT_G:6,GPT_H:7,ADC0:8,ADC0_B:9,DAC0:12,IOPORT1:14,IOPORT2:15,IOPORT3:16,IOPORT4:17});
/** ADC start sources (adc_start_source_t) the ADC0 stack offers: software, or the ELC link of ELC_PERIPHERAL_ADC0. */
export const RA_ADC_TRIGGERS=Object.freeze(['SOFTWARE','ELC']);
export const RA_DMAC_CHANNELS=Object.freeze([0,1,2,3,4,5,6,7]);
export const RA_TRANSFER_MODES=Object.freeze(['NORMAL','REPEAT','BLOCK']);
export const RA_TRANSFER_ADDR_MODES=Object.freeze(['FIXED','INCREMENTED','DECREMENTED']);
export const RA_TRANSFER_DEFAULTS=Object.freeze({driver:'DTC',channel:0,activation:'ADC0_SCAN_END',mode:'NORMAL',size:2,srcMode:'FIXED',destMode:'INCREMENTED',repeatArea:'DESTINATION',irq:'END',length:1,blocks:0,callback:'',priority:12});
/** Events a transfer may start on: a DTC on an interrupt that has a vector, a DMAC on any of them or by software. An SCI
 *  event belongs to the UART's own transfer (r_sci_uart sets it up), so a stand-alone transfer does not offer it. */
// DTC_COMPLETE is not offered: neither engine raises it. A DTC cannot take a software event (it has no vector).
export const raTransferEvents=driver=>[...(driver==='DMAC'?['SOFTWARE']:[]),...Object.keys(RA_ELC_EVENTS).filter(k=>!/^SCI/.test(k)&&k!=='DTC_COMPLETE'&&!(driver==='DTC'&&/^(DMAC|DTC|ELC_SOFT)/.test(k)))];
/** The events the ADC0 ELC start trigger offers: not its own scan end, not DTC_COMPLETE (neither engine raises it). */
export const RA_ADC_ELC_EVENTS=Object.freeze(Object.keys(RA_ELC_EVENTS).filter(k=>k!=='ADC0_SCAN_END'&&k!=='DTC_COMPLETE'));
function validateElc(p){
 if(!p||typeof p.enabled!=='boolean')throw new Error('ELC: 설정을 확인하세요.');
 return {enabled:p.enabled};
}
// A transfer instance g_transferN (TRANSFERn): r_dtc or r_dmac with the transfer_info_t RASC's Properties set. A UART's
// transmit or receive transfer is one of these too (SCIn transferTx / transferRx names it); r_sci_uart then sets the
// mode, size, addresses and the activation itself, as the FSP driver does in R_SCI_UART_Open.
function validateTransfer(id,p){
 if(!p||typeof p.enabled!=='boolean')throw new Error(`${id}: 설정을 확인하세요.`);
 const q={enabled:p.enabled,...RA_TRANSFER_DEFAULTS,...Object.fromEntries(Object.keys(RA_TRANSFER_DEFAULTS).filter(k=>p[k]!==undefined).map(k=>[k,p[k]]))};
 if(!['DTC','DMAC'].includes(q.driver))throw new Error(`${id}: 전송 모듈은 DTC(r_dtc) 또는 DMAC(r_dmac)입니다.`);
 if(q.driver==='DMAC'&&!RA_DMAC_CHANNELS.includes(q.channel))throw new Error(`${id}: DMAC 채널은 0~7입니다.`);
 if(typeof q.activation!=='string'||q.activation!=='SOFTWARE'&&!Object.hasOwn(RA_ELC_EVENTS,q.activation)||q.activation==='DTC_COMPLETE'||q.driver==='DTC'&&/^ELC_SOFTWARE_EVENT/.test(q.activation))throw new Error(`${id}: 활성화 소스(Activation Source)를 고르세요.`);
 if(q.activation==='SOFTWARE'&&q.driver==='DTC')throw new Error(`${id}: DTC는 인터럽트 이벤트로만 움직입니다(R_DTC_SoftwareStart는 FSP_ERR_UNSUPPORTED). 소프트웨어 시작은 DMAC를 쓰세요.`);
 if(!RA_TRANSFER_MODES.includes(q.mode))throw new Error(`${id}: 전송 모드는 Normal · Repeat · Block입니다(Repeat-Block은 시뮬레이터가 지원하지 않습니다).`);
 if(![1,2,4].includes(q.size))throw new Error(`${id}: 전송 단위는 1 · 2 · 4바이트입니다.`);
 for(const k of ['srcMode','destMode'])if(!RA_TRANSFER_ADDR_MODES.includes(q[k]))throw new Error(`${id}: 주소 모드는 Fixed · Incremented · Decremented입니다.`);
 if(!['SOURCE','DESTINATION'].includes(q.repeatArea))throw new Error(`${id}: Repeat Area는 Source 또는 Destination입니다.`);
 if(!['END','EACH'].includes(q.irq))throw new Error(`${id}: 인터럽트 시점은 전송 끝(End) 또는 매번(Each)입니다.`);
 const max=q.mode==='NORMAL'?65535:q.driver==='DTC'?256:1024;
 if(!Number.isInteger(q.length)||q.length<0||q.length>max)throw new Error(`${id}: Number of Transfers는 0~${max}입니다.`);
 if(!Number.isInteger(q.blocks)||q.blocks<0||q.blocks>65535)throw new Error(`${id}: Number of Blocks는 0~65535입니다.`);
 if(q.driver==='DTC'){q.callback='';delete q.channel;}
 else{
  if(typeof q.callback!=='string'||q.callback!==''&&!C_NAME.test(q.callback))throw new Error(`${id}: 콜백 이름은 C 식별자로 쓰세요(없으면 비워 둡니다).`);
  if(!Number.isInteger(q.priority)||q.priority<0||q.priority>15)throw new Error(`${id}: 인터럽트 우선순위는 0~15입니다.`);
 }
 return q;
}
/** Whether the configuration allocates a vector (an IELSR slot) for an event, as raVectors does: a DTC activates on one. */
export function raEventHasVector(mcu,event){
 const per=mcu.peripherals||{},on=id=>per[id]?.enabled;
 let m=/^SCI(\d)_/.exec(event);if(m)return !!on('SCI'+m[1]);
 m=/^ICU_IRQ(\d+)$/.exec(event);if(m)return Object.entries(mcu.pins||{}).some(([pin,p])=>p.function==='IRQ'&&RA_IRQ_PINS[pin]===Number(m[1]));
 if(event==='ADC0_SCAN_END')return !!(on('ADC0')&&per.ADC0.callback);
 m=/^(GPT|AGT)(\d)_/.exec(event);if(m)return !!(on(m[1]+m[2])&&per[m[1]+m[2]].callback);
 m=/^DMAC(\d)_INT$/.exec(event);if(m)return Object.values(per).some(t=>t?.enabled&&t.driver==='DMAC'&&t.channel===Number(m[1])&&t.callback);
 return false;
}
// The checks across stacks: an ADC started by the ELC needs the g_elc stack, a UART's transfer is a DTC transfer of its own
// channel's event that nothing else uses, a DTC needs a vector on its event, one DMAC channel per transfer.
function checkTransfers(out){
 const per=out.peripherals||{},owner=new Map();
 if(per.ADC0?.enabled&&per.ADC0.trigger==='ELC'&&!per.ELC?.enabled)throw new Error('ADC0: ELC로 시작하려면 New Stack → System의 Event Link Controller(g_elc)를 추가하세요.');
 for(const [id,u]of Object.entries(per)){
  if(!/^SCI\d$/.test(id)||!u.enabled||u.mode==='SPI')continue;
  for(const [key,event]of [['transferTx',`${id}_TXI`],['transferRx',`${id}_RXI`]]){
   const t=u[key];if(!t)continue;
   if(!/^TRANSFER\d+$/.test(t)||!per[t]?.enabled)throw new Error(`${id}: ${key==='transferTx'?'송신':'수신'} 전송 ${t}이(가) Stacks에 없습니다.`);
   if(per[t].driver!=='DTC')throw new Error(`${id}: UART의 전송은 DTC(r_dtc)로 정하세요. UART + DMAC는 시뮬레이터가 확인하지 못해 지원하지 않습니다.`);
   if(owner.has(t))throw new Error(`${t}은(는) 이미 ${owner.get(t)}의 전송입니다.`);owner.set(t,`${id} ${key==='transferTx'?'TX':'RX'}`);
   per[t].activation=event;per[t].owner=`${id}_${key==='transferTx'?'TX':'RX'}`;
  }
 }
 const dtcEvents=new Map(),channels=new Map();
 for(const [id,t]of Object.entries(per)){
  if(!/^TRANSFER\d+$/.test(id)||!t.enabled)continue;
  if(!t.owner&&/^SCI/.test(t.activation))throw new Error(`${id}: SCI 이벤트(${t.activation})로 움직이는 전송은 그 UART(g_uart${t.activation.slice(3,4)})의 송신·수신 전송으로 정하세요.`);
  if(t.driver==='DTC'){
   if(dtcEvents.has(t.activation))throw new Error(`${id}: ${t.activation}에는 이미 ${dtcEvents.get(t.activation)}이(가) 있습니다(이벤트 하나에 DTC 전송 하나: R_DTC_Open이 FSP_ERR_IN_USE).`);dtcEvents.set(t.activation,id);
   if(!raEventHasVector(out,t.activation))throw new Error(`${id}: DTC는 인터럽트 벡터가 있는 이벤트로만 움직입니다. ${t.activation}의 스택에서 콜백(인터럽트)을 켜세요.`);
  }else{
   if(channels.has(t.channel))throw new Error(`${id}: DMAC 채널 ${t.channel}은(는) 이미 ${channels.get(t.channel)}에서 씁니다.`);channels.set(t.channel,id);
  }
 }
}
/** A 64-bit source mask as [low 32 bits, high bits] from source names and their bit table. */
export const raLpmMask=(names,bits)=>{let lo=0,hi=0;for(const n of names||[]){const b=bits[n];if(b==null)continue;if(b<32)lo|=1<<b;else hi|=1<<(b-32);}return [lo>>>0,hi>>>0];};
/** A watchdog's count clock, timeout clocks and timeout in ms for a configuration ("WDT": PCLKB / divider; "IWDT": 15 kHz / divider). */
export function raWdtTiming(mcu,id){
 const p={...RA_WDT[id].defaults,...(mcu?.peripherals?.[id]||{})},hz=(id==='IWDT'?RA_IWDT_HZ:raClockHz(mcu,'pclkb'))/p.clockDiv;
 return {hz,clocks:p.timeout,ms:p.timeout/hz*1000};
}
/** OFS0 (BSP_CFG_OPTION_SETTING_OFS0) for a configuration: erased (0xFFFFFFFF) but for an auto-started watchdog. Bit
 *  positions: r_iwdt.c IWDT_PRV_OFS0_* (IWDTSTRT b1, TOPS b3:2, CKS b7:4, RSTIRQS b12) and r_wdt.c WDT_PRV_OFSX_* (the WDT
 *  fields from b16: WDTSTRT b17 … STPCTL b30); the IWDT window and stop bits (RPES b9:8, RPSS b11:10, STPCTL b14) mirror them. */
export function raOfs0(mcu){
 let ofs=0xffffffff;
 for(const [id,base]of [['IWDT',0],['WDT',16]]){
  // The same defaults validateWdt fills in, so an unvalidated configuration gives the same OFS0.
  const raw=mcu?.peripherals?.[id];if(!raw?.enabled||(id==='WDT'&&raw.startMode!=='AUTO'))continue;
  const p={...RA_WDT[id].defaults,windowStart:100,windowEnd:0,reset:'RESET',...raw};
  const tops=RA_WDT[id].timeouts.indexOf(p.timeout),field=(0<<1)|(tops<<2)|(WDT_DIVISION_CODE[p.clockDiv]<<4)|(WDT_END_CODE[p.windowEnd]<<8)|(WDT_START_CODE[p.windowStart]<<10)|((p.reset==='RESET'?1:0)<<12)|((p.stopInSleep?1:0)<<14);
  ofs=((ofs&~(0x5ffe<<base))|(field<<base))>>>0; // bits 0, 13 and 15 of each half are reserved (stay 1)
 }
 return ofs>>>0;
}
/** PSEL of a peripheral signal ("SCI9_TXD" → 5). */
export function raPsel(signal){
 const sci=/^SCI(\d)_/.exec(signal);if(sci)return [0,2,4].includes(Number(sci[1]))?4:5;
 if(/^GPT\d_GTIOC[AB]$/.test(signal))return 3;
 if(/^IIC\d_(SCL|SDA)$/.test(signal))return 7;
 if(/^SPI\d_(RSPCK|MOSI|MISO|SSL\d)$/.test(signal))return 6;
 throw new Error(`${signal}: 지원하지 않는 주변장치 신호입니다.`);
}
export const RA_PSEL_NAMES=Object.freeze({3:'IOPORT_PERIPHERAL_GPT1',7:'IOPORT_PERIPHERAL_IIC',6:'IOPORT_PERIPHERAL_SPI',4:'IOPORT_PERIPHERAL_SCI0_2_4_6_8',5:'IOPORT_PERIPHERAL_SCI1_3_5_7_9'});
