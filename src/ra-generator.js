// FSP project files for a Renesas RA board, as the RA Smart Configurator (RASC) / e² studio FSP Configurator writes
// them: ra_cfg/fsp_cfg (BSP and module configuration headers), ra_gen (clock, pins, instances, vectors, main.c,
// linker init tables) and script (linker scripts). The user's code is src/hal_entry.c; the app builds these with the
// FSP sources (BSP + r_* drivers) and ARM GCC, then runs the ELF on the RA6E1 emulator.
// Formats follow RASC output for FSP 5.x/6.x (only what the FPB-RA6E1 configurations here need).
import {raFamily,raPinName,raPortBit,RA_IRQ_PINS,raPsel,RA_PSEL_NAMES,RA_SCI_CHANNELS,RA_GPT_CHANNELS,RA_ADC_CHANNELS,RA_AGT_CHANNELS,RA_IIC_CHANNELS,raGptCounts,raAgtCounts,raIicClock,raClockHz} from './ra-config.js';

const HEADER=kind=>`/* generated ${kind} - do not edit */\n`;
const hex=(n,w=8)=>'0x'+(n>>>0).toString(16).toUpperCase().padStart(w,'0');
const ioName=pin=>{const {port,bit}=raPortBit(pin);return `BSP_IO_PORT_${String(port).padStart(2,'0')}_PIN_${String(bit).padStart(2,'0')}`;};

/** The pin configuration word for ioport_pin_cfg_t (r_ioport.h ioport_cfg_options_t). */
export function pinCfgWord(pin){
 const p=pin||{},parts=[];
 if(p.function==='GPIO_Output'){parts.push('IOPORT_CFG_PORT_DIRECTION_OUTPUT',p.initial?'IOPORT_CFG_PORT_OUTPUT_HIGH':'IOPORT_CFG_PORT_OUTPUT_LOW');if(p.drive==='MID')parts.push('IOPORT_CFG_DRIVE_MID');else if(p.drive==='HIGH')parts.push('IOPORT_CFG_DRIVE_HIGH');if(p.outputType==='NMOS')parts.push('IOPORT_CFG_NMOS_ENABLE');}
 else if(p.function==='GPIO_Input'){parts.push('IOPORT_CFG_PORT_DIRECTION_INPUT');if(p.pull==='PULLUP')parts.push('IOPORT_CFG_PULLUP_ENABLE');}
 else if(p.function==='IRQ'){parts.push('IOPORT_CFG_IRQ_ENABLE','IOPORT_CFG_PORT_DIRECTION_INPUT');if(p.pull==='PULLUP')parts.push('IOPORT_CFG_PULLUP_ENABLE');}
 else if(p.function==='Analog')parts.push('IOPORT_CFG_ANALOG_ENABLE');
 else if(p.function==='Peripheral'){parts.push(/^IIC/.test(p.signal)?'IOPORT_CFG_DRIVE_MID':'IOPORT_CFG_DRIVE_HIGH','IOPORT_CFG_PERIPHERAL_PIN',RA_PSEL_NAMES[raPsel(p.signal)]);if(p.pull==='PULLUP')parts.push('IOPORT_CFG_PULLUP_ENABLE');if(p.outputType==='NMOS')parts.push('IOPORT_CFG_NMOS_ENABLE');if(p.drive==='MID')parts.push('IOPORT_CFG_DRIVE_MID');}
 else throw new Error(`${pin?.name||'핀'}: 지원하지 않는 핀 기능입니다.`);
 return `((uint32_t) ${parts.map(x=>`(uint32_t) ${x}`).join(' | ')})`;
}

// External IRQ instances (r_icu): one per pin set to IRQ, named g_external_irqN like RASC.
const irqsOf=mcu=>Object.entries(mcu.pins||{}).filter(([,p])=>p.function==='IRQ').map(([pin,p])=>{const channel=RA_IRQ_PINS[pin];if(channel==null)throw new Error(`${pin}: IRQ 핀이 아닙니다.`);return {pin,channel,name:p.instance||`g_external_irq${channel}`,callback:p.callback||`external_irq${channel}_callback`,trigger:p.edge||'FALLING',priority:p.priority??12,filter:!!p.filter};});

// SCI UART instances (r_sci_uart), g_uartN on each enabled SCI channel.
const uartsOf=mcu=>RA_SCI_CHANNELS.filter(ch=>mcu.peripherals?.['SCI'+ch]?.enabled).map(ch=>{const p=mcu.peripherals['SCI'+ch];return {channel:ch,name:`g_uart${ch}`,baud:p.baud??115200,callback:p.callback||`user_uart${ch}_callback`,priority:p.priority??12};});
// GPT timer instances (r_gpt), g_timerN on each enabled GPT channel: saw-wave PWM on the GTIOC pins set to it, or a periodic
// timer; the cycle-end (overflow) interrupt only when a callback is named, as RASC leaves it disabled otherwise.
const gptsOf=mcu=>RA_GPT_CHANNELS.filter(ch=>mcu.peripherals?.['GPT'+ch]?.enabled).map(ch=>{
 const p=mcu.peripherals['GPT'+ch],used=new Set(Object.values(mcu.pins||{}).filter(q=>q.function==='Peripheral').map(q=>q.signal));
 return {channel:ch,name:`g_timer${ch}`,mode:p.mode||'PWM',period:p.period??1,unit:p.unit||'kHz',duty:p.duty??50,callback:p.callback||'',priority:p.priority??12,
  a:used.has(`GPT${ch}_GTIOCA`),b:used.has(`GPT${ch}_GTIOCB`),counts:raGptCounts(raClockHz(mcu),ch,p.period??1,p.unit||'kHz',p.duty??50)};
});
// ADC instance (r_adc), g_adc0 with g_adc0_channel_cfg scanning the Analog pins' channels.
const adcOf=mcu=>{const p=mcu.peripherals?.ADC0;if(!p?.enabled)return null;return {...p,mode:p.mode||'SINGLE',resolution:p.resolution??12,callback:p.callback||'',priority:p.priority??12,channels:Object.entries(mcu.pins||{}).filter(([pin,q])=>q.function==='Analog'&&RA_ADC_CHANNELS[pin]!=null).map(([pin])=>RA_ADC_CHANNELS[pin]).sort((a,b)=>a-b)};};
const adcDecl=a=>`/** ADC on ADC Instance. */
extern const adc_instance_t g_adc0;
/** Access the ADC instance using these structures when calling API functions directly (::p_api is not used). */
extern adc_instance_ctrl_t g_adc0_ctrl;
extern const adc_cfg_t g_adc0_cfg;
extern const adc_channel_cfg_t g_adc0_channel_cfg;${a.callback?`
#ifndef ${a.callback}
void ${a.callback}(adc_callback_args_t * p_args);
#endif`:''}`;
function adcInstance(a){
 const v=(k,name)=>`#if defined(VECTOR_NUMBER_ADC0_${k})\n    .${name} = VECTOR_NUMBER_ADC0_${k},\n#else\n    .${name} = FSP_INVALID_VECTOR,\n#endif`;
 return `adc_instance_ctrl_t g_adc0_ctrl;
const adc_extended_cfg_t g_adc0_cfg_extend =
{
    .add_average_count   = ADC_ADD_OFF,
    .clearing            = ADC_CLEAR_AFTER_READ_ON,
    .trigger             = ADC_START_SOURCE_DISABLED,
    .trigger_group_b     = ADC_START_SOURCE_DISABLED,
    .double_trigger_mode = ADC_DOUBLE_TRIGGER_DISABLED,
    .adc_vref_control    = ADC_VREF_CONTROL_VREFH,
    .enable_adbuf        = 0,
${v('WINDOW_A','window_a_irq')}
    .window_a_ipl        = (BSP_IRQ_DISABLED),
${v('WINDOW_B','window_b_irq')}
    .window_b_ipl        = (BSP_IRQ_DISABLED),
};
const adc_cfg_t g_adc0_cfg =
{
    .unit                = 0,
    .mode                = ${a.mode==='CONTINUOUS'?'ADC_MODE_CONTINUOUS_SCAN':'ADC_MODE_SINGLE_SCAN'},
    .resolution          = ADC_RESOLUTION_${a.resolution}_BIT,
    .alignment           = (adc_alignment_t) ADC_ALIGNMENT_RIGHT,
    .trigger             = (adc_trigger_t) 0xF, // Not used
    .p_callback          = ${a.callback||'NULL'},
    .p_context           = NULL,
    .p_extend            = &g_adc0_cfg_extend,
${a.callback?v('SCAN_END','scan_end_irq'):'    .scan_end_irq        = FSP_INVALID_VECTOR,'}
    .scan_end_ipl        = ${a.callback?`(${a.priority})`:'(BSP_IRQ_DISABLED)'},
    .scan_end_b_irq      = FSP_INVALID_VECTOR,
    .scan_end_b_ipl      = (BSP_IRQ_DISABLED),
    .scan_end_c_irq      = FSP_INVALID_VECTOR,
    .scan_end_c_ipl      = (BSP_IRQ_DISABLED),
};
const adc_channel_cfg_t g_adc0_channel_cfg =
{
    .scan_mask           = ${a.channels.map(c=>`ADC_MASK_CHANNEL_${c}`).join(' | ')} | 0,
    .scan_mask_group_b   = 0,
    .priority_group_a    = ADC_GROUP_A_PRIORITY_OFF,
    .add_mask            = 0,
    .sample_hold_mask    = 0,
    .sample_hold_states  = 24,
    .p_window_cfg        = NULL,
};
/* Instance structure to use this module. */
const adc_instance_t g_adc0 =
{
    .p_ctrl        = &g_adc0_ctrl,
    .p_cfg         = &g_adc0_cfg,
    .p_channel_cfg = &g_adc0_channel_cfg,
    .p_api         = &g_adc_on_adc
};`;
}
// AGT timer instances (r_agt), g_agtN periodic timers; the AGTn_INT (underflow) interrupt when a callback is named.
const agtsOf=mcu=>RA_AGT_CHANNELS.filter(ch=>mcu.peripherals?.['AGT'+ch]?.enabled).map(ch=>{const p=mcu.peripherals['AGT'+ch];return {channel:ch,name:`g_agt${ch}`,period:p.period??100,unit:p.unit||'ms',callback:p.callback??`agt${ch}_callback`,priority:p.priority??12,counts:raAgtCounts(raClockHz(mcu,'pclkb'),ch,p.period??100,p.unit||'ms')};});
const agtDecl=t=>`/** AGT Timer Instance */
extern const timer_instance_t ${t.name};
/** Access the AGT instance using these structures when calling API functions directly (::p_api is not used). */
extern agt_instance_ctrl_t ${t.name}_ctrl;
extern const timer_cfg_t ${t.name}_cfg;${t.callback?`
#ifndef ${t.callback}
void ${t.callback}(timer_callback_args_t * p_args);
#endif`:''}`;
const agtInstance=t=>`agt_instance_ctrl_t ${t.name}_ctrl;
const agt_extended_cfg_t ${t.name}_extend =
{
    .count_source            = AGT_CLOCK_${t.counts.source},
    .agto                    = AGT_PIN_CFG_DISABLED,
    .agtoab_settings_b.agtoa = AGT_PIN_CFG_DISABLED,
    .agtoab_settings_b.agtob = AGT_PIN_CFG_DISABLED,
    .measurement_mode        = AGT_MEASURE_DISABLED,
    .agtio_filter            = AGT_AGTIO_FILTER_NONE,
    .enable_pin              = AGT_ENABLE_PIN_NOT_USED,
    .trigger_edge            = AGT_TRIGGER_EDGE_RISING,
    .counter_bit_width       = AGT_COUNTER_BIT_WIDTH_16,
};
const timer_cfg_t ${t.name}_cfg =
{
    .mode                = TIMER_MODE_PERIODIC,
    /* Actual period: ${t.period} ${UNIT_TEXT[t.unit]}. Actual duty: 50%. */ .period_counts = (uint32_t) ${hexCount(t.counts.counts)}, .duty_cycle_counts = ${hexCount(Math.floor(t.counts.counts/2))}, .source_div = (timer_source_div_t) ${t.counts.div},
    .channel             = ${t.channel},
    .p_callback          = ${t.callback||'NULL'},
    .p_context           = NULL,
    .p_extend            = &${t.name}_extend,
    .cycle_end_ipl       = ${t.callback?`(${t.priority})`:'(BSP_IRQ_DISABLED)'},
#if defined(VECTOR_NUMBER_AGT${t.channel}_INT)
    .cycle_end_irq       = VECTOR_NUMBER_AGT${t.channel}_INT,
#else
    .cycle_end_irq       = FSP_INVALID_VECTOR,
#endif
};
/* Instance structure to use this module. */
const timer_instance_t ${t.name} =
{
    .p_ctrl        = &${t.name}_ctrl,
    .p_cfg         = &${t.name}_cfg,
    .p_api         = &g_timer_on_agt
};`;
// I2C master instances (r_iic_master), g_i2c_masterN; completion and errors come through the callback.
const iicsOf=mcu=>RA_IIC_CHANNELS.filter(ch=>mcu.peripherals?.['IIC'+ch]?.enabled).map(ch=>{const p=mcu.peripherals['IIC'+ch];return {channel:ch,name:`g_i2c_master${ch}`,rate:p.rate||'STANDARD',slave:p.slave??0x50,callback:p.callback||`i2c_master${ch}_callback`,priority:p.priority??12,clock:raIicClock(raClockHz(mcu,'pclkb'),p.rate||'STANDARD')};});
const iicDecl=t=>`/* I2C Master on IIC Instance. */
extern const i2c_master_instance_t ${t.name};
/** Access the I2C Master instance using these structures when calling API functions directly (::p_api is not used). */
extern iic_master_instance_ctrl_t ${t.name}_ctrl;
extern const i2c_master_cfg_t ${t.name}_cfg;
#ifndef ${t.callback}
void ${t.callback}(i2c_master_callback_args_t * p_args);
#endif`;
function iicInstance(t){
 const v=k=>`#if defined(VECTOR_NUMBER_IIC${t.channel}_${k})\n    .${k.toLowerCase()}_irq             = VECTOR_NUMBER_IIC${t.channel}_${k},\n#else\n    .${k.toLowerCase()}_irq             = FSP_INVALID_VECTOR,\n#endif`,c=t.clock;
 return `iic_master_instance_ctrl_t ${t.name}_ctrl;
const iic_master_extended_cfg_t ${t.name}_extend =
{
    .timeout_mode             = IIC_MASTER_TIMEOUT_MODE_SHORT,
    .timeout_scl_low          = IIC_MASTER_TIMEOUT_SCL_LOW_ENABLED,
    .smbus_operation          = 0,
    /* Actual calculated bitrate: ${Math.round(c.actual)}. Actual calculated duty cycle: ${Math.round(c.duty)}%. */ .clock_settings.brl_value = ${c.brl}, .clock_settings.brh_value = ${c.brh}, .clock_settings.cks_value = ${c.cks}, .clock_settings.sddl_value = 0, .clock_settings.dlcs_value = 0,
};
const i2c_master_cfg_t ${t.name}_cfg =
{
    .channel             = ${t.channel},
    .rate                = I2C_MASTER_RATE_${t.rate},
    .slave               = 0x${t.slave.toString(16).padStart(2,'0')},
    .addr_mode           = I2C_MASTER_ADDR_MODE_7BIT,
    .p_transfer_tx       = NULL,
    .p_transfer_rx       = NULL,
    .p_callback          = ${t.callback},
    .p_context           = NULL,
${['RXI','TXI','TEI','ERI'].map(v).join('\n')}
    .ipl                 = (${t.priority}),
    .p_extend            = &${t.name}_extend,
};
/* Instance structure to use this module. */
const i2c_master_instance_t ${t.name} =
{
    .p_ctrl        = &${t.name}_ctrl,
    .p_cfg         = &${t.name}_cfg,
    .p_api         = &g_i2c_master_on_iic
};`;
}
const UNIT_TEXT={Hz:'Hz',kHz:'kHz',s:'seconds',ms:'milliseconds',us:'microseconds'};
const hexCount=n=>"0x"+n.toString(16);
const gptDecl=t=>`/** Timer on GPT Instance. */
extern const timer_instance_t ${t.name};
/** Access the GPT instance using these structures when calling API functions directly (::p_api is not used). */
extern gpt_instance_ctrl_t ${t.name}_ctrl;
extern const timer_cfg_t ${t.name}_cfg;
${t.callback?`#ifndef ${t.callback}
void ${t.callback}(timer_callback_args_t * p_args);
#endif`:''}`.replace(/\n$/,'');
function gptInstance(t){
 const v=(k,name)=>`#if defined(VECTOR_NUMBER_GPT${t.channel}_${k})\n    .${name} = VECTOR_NUMBER_GPT${t.channel}_${k},\n#else\n    .${name} = FSP_INVALID_VECTOR,\n#endif`;
 return `gpt_instance_ctrl_t ${t.name}_ctrl;
const gpt_extended_cfg_t ${t.name}_extend =
{
    .gtioca = { .output_enabled = ${t.a&&t.mode==='PWM'}, .stop_level = GPT_PIN_LEVEL_LOW },
    .gtiocb = { .output_enabled = ${t.b&&t.mode==='PWM'}, .stop_level = GPT_PIN_LEVEL_LOW },
    .start_source        = (gpt_source_t) (GPT_SOURCE_NONE),
    .stop_source         = (gpt_source_t) (GPT_SOURCE_NONE),
    .clear_source        = (gpt_source_t) (GPT_SOURCE_NONE),
    .count_up_source     = (gpt_source_t) (GPT_SOURCE_NONE),
    .count_down_source   = (gpt_source_t) (GPT_SOURCE_NONE),
    .capture_a_source    = (gpt_source_t) (GPT_SOURCE_NONE),
    .capture_b_source    = (gpt_source_t) (GPT_SOURCE_NONE),
    .capture_a_ipl       = (BSP_IRQ_DISABLED),
    .capture_b_ipl       = (BSP_IRQ_DISABLED),
    .compare_match_c_ipl = (BSP_IRQ_DISABLED),
    .compare_match_d_ipl = (BSP_IRQ_DISABLED),
    .compare_match_e_ipl = (BSP_IRQ_DISABLED),
    .compare_match_f_ipl = (BSP_IRQ_DISABLED),
${[['CAPTURE_COMPARE_A','capture_a_irq'],['CAPTURE_COMPARE_B','capture_b_irq'],['COMPARE_C','compare_match_c_irq'],['COMPARE_D','compare_match_d_irq'],['COMPARE_E','compare_match_e_irq'],['COMPARE_F','compare_match_f_irq']].map(([k,n])=>v(k,n)).join('\n')}
    .compare_match_value = { (uint32_t) 0x0, /* CMP_A */ (uint32_t) 0x0, /* CMP_B */ (uint32_t) 0x0, /* CMP_C */ (uint32_t) 0x0, /* CMP_E */ (uint32_t) 0x0, /* CMP_D */ (uint32_t) 0x0 /* CMP_F */ },
    .compare_match_status = ((0U << 5U) | (0U << 4U) | (0U << 3U) | (0U << 2U) | (0U << 1U) | 0U),
    .capture_filter_gtioca = GPT_CAPTURE_FILTER_NONE,
    .capture_filter_gtiocb = GPT_CAPTURE_FILTER_NONE,
    .p_pwm_cfg           = NULL,
    .gtior_setting.gtior = (0x0U),
    .gtioca_polarity     = GPT_GTIOC_POLARITY_NORMAL,
    .gtiocb_polarity     = GPT_GTIOC_POLARITY_NORMAL,
};
const timer_cfg_t ${t.name}_cfg =
{
    .mode                = ${t.mode==='PWM'?'TIMER_MODE_PWM':'TIMER_MODE_PERIODIC'},
    /* Actual period: ${t.period} ${UNIT_TEXT[t.unit]}. Actual duty: ${t.duty}%. */ .period_counts = (uint32_t) ${hexCount(t.counts.counts)}, .duty_cycle_counts = ${hexCount(t.counts.duty)}, .source_div = (timer_source_div_t) ${t.counts.div},
    .channel             = ${t.channel},
    .p_callback          = ${t.callback||'NULL'},
    .p_context           = NULL,
    .p_extend            = &${t.name}_extend,
    .cycle_end_ipl       = ${t.callback?`(${t.priority})`:'(BSP_IRQ_DISABLED)'},
${v('COUNTER_OVERFLOW','cycle_end_irq')}
};
/* Instance structure to use this module. */
const timer_instance_t ${t.name} =
{
    .p_ctrl        = &${t.name}_ctrl,
    .p_cfg         = &${t.name}_cfg,
    .p_api         = &g_timer_on_gpt
};`;
}
/** PCLKA of an RA MCU configuration in Hz (the SCI clock). */
export function raPclka(mcu){const c={...raFamily(mcu.family).clock,...(mcu.clock||{})};return c.hocoMHz*1e6/c.pllDiv*c.pllMul/c.pclkaDiv;}
/** SCI asynchronous baud register settings closest to `baud` (CKS, BRR, ABCS, BGDM; no modulation), as RASC computes them. */
export function sciBaudSetting(pclk,baud){
 let best=null;
 for(const [abcs,bgdm]of [[0,1],[1,1],[0,0],[1,0]])for(let n=0;n<4;n++){const c=64>>(abcs+bgdm),N=Math.round(pclk/(c*2**(2*n-1)*baud))-1;if(N<0||N>255)continue;const actual=pclk/(c*2**(2*n-1)*(N+1)),error=Math.abs(actual-baud)/baud*100;if(!best||error<best.error-1e-9)best={abcs,bgdm,cks:n,brr:N,error,actual};}
 if(!best)throw new Error(`${baud} bps: SCI로 만들 수 없는 통신 속도입니다.`);
 return best;
}
/** The interrupt slots the vector table allocates, in RASC order (first-come numbering from 0). */
export function raVectors(mcu){
 const list=[];
 for(const u of uartsOf(mcu))for(const [kind,label]of [['RXI','Receive data full'],['TXI','Transmit data empty'],['TEI','Transmit end'],['ERI','Receive error']])list.push({isr:`sci_uart_${kind.toLowerCase()}_isr`,event:`SCI${u.channel}_${kind}`,label:`SCI${u.channel} ${kind} (${label})`,vector:`SCI${u.channel}_${kind}`});
 for(const irq of irqsOf(mcu))list.push({isr:'r_icu_isr',event:`ICU_IRQ${irq.channel}`,label:`ICU IRQ${irq.channel} (External pin interrupt ${irq.channel})`,vector:`ICU_IRQ${irq.channel}`});
 const adc=adcOf(mcu);if(adc?.callback)list.push({isr:'adc_scan_end_isr',event:'ADC0_SCAN_END',label:'ADC0 SCAN END (End of A/D scanning operation)',vector:'ADC0_SCAN_END'});
 for(const t of iicsOf(mcu))for(const [kind,label]of [['RXI','Receive data full'],['TXI','Transmit data empty'],['TEI','Transmit end'],['ERI','Transfer error']])list.push({isr:`iic_master_${kind.toLowerCase()}_isr`,event:`IIC${t.channel}_${kind}`,label:`IIC${t.channel} ${kind} (${label})`,vector:`IIC${t.channel}_${kind}`});
 for(const t of agtsOf(mcu))if(t.callback)list.push({isr:'agt_int_isr',event:`AGT${t.channel}_INT`,label:`AGT${t.channel} INT (AGT interrupt)`,vector:`AGT${t.channel}_INT`});
 for(const t of gptsOf(mcu))if(t.callback)list.push({isr:'gpt_counter_overflow_isr',event:`GPT${t.channel}_COUNTER_OVERFLOW`,label:`GPT${t.channel} COUNTER OVERFLOW (Overflow)`,vector:`GPT${t.channel}_COUNTER_OVERFLOW`});
 return list.map((v,i)=>({...v,index:i}));
}

function clockCfg(c){
 return HEADER('configuration header file')+`#ifndef BSP_CLOCK_CFG_H_
#define BSP_CLOCK_CFG_H_
#define BSP_CFG_CLOCKS_SECURE (0)
#define BSP_CFG_CLOCKS_OVERRIDE (0)
#define BSP_CFG_XTAL_HZ (${c.xtalHz}) /* XTAL ${c.xtalHz}Hz */
#define BSP_CFG_HOCO_FREQUENCY (${{16:0,18:1,20:2}[c.hocoMHz]}) /* HOCO ${c.hocoMHz}MHz */
#define BSP_CFG_PLL_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_HOCO) /* PLL Src: HOCO */
#define BSP_CFG_PLL_DIV (BSP_CLOCKS_PLL_DIV_${c.pllDiv}) /* PLL Div /${c.pllDiv} */
#define BSP_CFG_PLL_MUL BSP_CLOCKS_PLL_MUL(${c.pllMul},0) /* PLL Mul x${c.pllMul}.0 */
#define BSP_CFG_PLL2_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* PLL2 Disabled */
#define BSP_CFG_PLL2_DIV (BSP_CLOCKS_PLL_DIV_2) /* PLL2 Div /2 */
#define BSP_CFG_PLL2_MUL BSP_CLOCKS_PLL_MUL(20,0) /* PLL2 Mul x20.0 */
#define BSP_CFG_CLOCK_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_PLL) /* Clock Src: PLL */
#define BSP_CFG_CLKOUT_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* CLKOUT Disabled */
#define BSP_CFG_UCLK_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* UCLK Disabled */
#define BSP_CFG_OCTACLK_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* OCTASPICLK Disabled */
#define BSP_CFG_CANFDCLK_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* CANFDCLK Disabled */
#define BSP_CFG_ICLK_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_${c.iclkDiv}) /* ICLK Div /${c.iclkDiv} */
#define BSP_CFG_PCLKA_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_${c.pclkaDiv}) /* PCLKA Div /${c.pclkaDiv} */
#define BSP_CFG_PCLKB_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_${c.pclkbDiv}) /* PCLKB Div /${c.pclkbDiv} */
#define BSP_CFG_PCLKC_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_${c.pclkcDiv}) /* PCLKC Div /${c.pclkcDiv} */
#define BSP_CFG_PCLKD_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_${c.pclkdDiv}) /* PCLKD Div /${c.pclkdDiv} */
#define BSP_CFG_BCLK_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_2) /* BCLK Div /2 */
#define BSP_CFG_BCLK_OUTPUT (0) /* EBCLK Disabled */
#define BSP_CFG_FCLK_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_${c.fclkDiv}) /* FCLK Div /${c.fclkDiv} */
#define BSP_CFG_CLKOUT_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_1) /* CLKOUT Div /1 */
#define BSP_CFG_UCLK_DIV (BSP_CLOCKS_USB_CLOCK_DIV_5) /* UCLK Div /5 */
#define BSP_CFG_OCTACLK_DIV (BSP_CLOCKS_OCTA_CLOCK_DIV_1) /* OCTASPICLK Div /1 */
#define BSP_CFG_CANFDCLK_DIV (BSP_CLOCKS_CANFD_CLOCK_DIV_6) /* CANFDCLK Div /6 */
#endif /* BSP_CLOCK_CFG_H_ */
`;
}

function familyCfg(fam){
 return HEADER('configuration header file')+`#ifndef BSP_MCU_FAMILY_CFG_H_
#define BSP_MCU_FAMILY_CFG_H_
#ifdef __cplusplus
extern "C" {
#endif
#include "bsp_mcu_device_pn_cfg.h"
#include "bsp_mcu_device_cfg.h"
#include "bsp_mcu_info.h"
#include "bsp_clock_cfg.h"
#define BSP_MCU_GROUP_${fam.group} (1)
#define BSP_LOCO_HZ                 (32768)
#define BSP_MOCO_HZ                 (8000000)
#define BSP_SUB_CLOCK_HZ            (32768)
#if   BSP_CFG_HOCO_FREQUENCY == 0
#define BSP_HOCO_HZ                 (16000000)
#elif BSP_CFG_HOCO_FREQUENCY == 1
#define BSP_HOCO_HZ                 (18000000)
#elif BSP_CFG_HOCO_FREQUENCY == 2
#define BSP_HOCO_HZ                 (20000000)
#else
#error "Invalid HOCO frequency chosen (BSP_CFG_HOCO_FREQUENCY) in bsp_clock_cfg.h"
#endif
#define BSP_CFG_FLL_ENABLE                 (0)
#define BSP_CORTEX_VECTOR_TABLE_ENTRIES    (16U)
#define BSP_VECTOR_TABLE_MAX_ENTRIES       (${16+fam.ielsr}U)
#define BSP_CFG_INLINE_IRQ_FUNCTIONS       (1)
#if defined(_RA_TZ_SECURE)
#define BSP_TZ_SECURE_BUILD           (1)
#define BSP_TZ_NONSECURE_BUILD        (0)
#elif defined(_RA_TZ_NONSECURE)
#define BSP_TZ_SECURE_BUILD           (0)
#define BSP_TZ_NONSECURE_BUILD        (1)
#else
#define BSP_TZ_SECURE_BUILD           (0)
#define BSP_TZ_NONSECURE_BUILD        (0)
#endif
#define BSP_TZ_CFG_INIT_SECURE_ONLY       (BSP_CFG_CLOCKS_SECURE || (!BSP_CFG_CLOCKS_OVERRIDE))
#define BSP_TZ_CFG_SKIP_INIT              (BSP_TZ_NONSECURE_BUILD && BSP_TZ_CFG_INIT_SECURE_ONLY)
#define BSP_TZ_CFG_EXCEPTION_RESPONSE     (0)
#define SCB_CSR_AIRCR_INIT                (1)
#define SCB_AIRCR_BFHFNMINS_VAL           (0)
#define SCB_AIRCR_SYSRESETREQS_VAL        (1)
#define SCB_AIRCR_PRIS_VAL                (0)
#define TZ_FPU_NS_USAGE                   (1)
#ifndef SCB_NSACR_CP10_11_VAL
#define SCB_NSACR_CP10_11_VAL             (3U)
#endif
#ifndef FPU_FPCCR_TS_VAL
#define FPU_FPCCR_TS_VAL                  (1U)
#endif
#define FPU_FPCCR_CLRONRETS_VAL           (1)
#ifndef FPU_FPCCR_CLRONRET_VAL
#define FPU_FPCCR_CLRONRET_VAL            (1)
#endif
#ifndef BSP_CFG_C_CACHE_LINE_SIZE
#define BSP_CFG_C_CACHE_LINE_SIZE   (1U)
#endif
/* A flat (non-TrustZone) project: every peripheral, the CGC and the other security attribution registers stay
 * Non-secure accessible (reset values). */
#define BSP_TZ_CFG_PSARB (0xFFFFFFFFU)
#define BSP_TZ_CFG_PSARC (0xFFFFFFFFU)
#define BSP_TZ_CFG_PSARD (0xFFFFFFFFU)
#define BSP_TZ_CFG_PSARE (0xFFFFFFFFU)
#define BSP_TZ_CFG_MSSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_CSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_RSTSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_LVDSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_LPMSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_DPFSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_CGFSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_BBFSAR (0x00FFFFFF)
#define BSP_TZ_CFG_ICUSARA (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARB (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARC (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARD (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARE (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARF (0xFFFFFFFFU)
#define BSP_TZ_CFG_FSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_SRAMSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_STBRAMSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_DTCSTSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_DMACSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARG (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARH (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARI (0xFFFFFFFFU)
#define BSP_TZ_CFG_ELCSARA (0xFFFFFFFFU)
#define BSP_TZ_CFG_SAU_ENABLE (0)
#define BSP_CFG_MPU_ENABLE (0)
#define BSP_CFG_ROM_REG_OFS0 (0xFFFFFFFF)
#define BSP_CFG_ROM_REG_DUALSEL (0xFFFFFFFF)
#define BSP_CFG_ROM_REG_OFS1 (0xFFFFFFFF)
#define BSP_CFG_ROM_REG_BPS0 (0xFFFFFFFF)
#define BSP_CFG_DCACHE_ENABLED (0)
#define BSP_CFG_SOFT_RESET_SUPPORTED (0)
#define BSP_CLOCK_CFG_MAIN_OSC_POPULATED_DEFAULT (0)
#ifdef __cplusplus
}
#endif
#endif /* BSP_MCU_FAMILY_CFG_H_ */
`;
}

function bspCfg(mcu){
 return HEADER('configuration header file')+`#ifndef BSP_CFG_H_
#define BSP_CFG_H_
#ifdef __cplusplus
extern "C" {
#endif
#include "bsp_clock_cfg.h"
#include "bsp_mcu_family_cfg.h"
#include "bsp_mcu_ofs_cfg.h"
#include "board_cfg.h"
#include "vector_data.h"
#ifndef BSP_CFG_RTOS
#define BSP_CFG_RTOS (0)
#endif
#ifndef BSP_CFG_RTC_USED
#define BSP_CFG_RTC_USED (0)
#endif
#define BSP_CFG_MCU_VCC_MV (3300)
#define BSP_CFG_STACK_MAIN_BYTES (0x${(mcu?.bsp?.stackBytes??0x400).toString(16)})
#define BSP_CFG_HEAP_BYTES (0x${(mcu?.bsp?.heapBytes??0x400).toString(16)})
#define BSP_CFG_PARAM_CHECKING_ENABLE (1)
#define BSP_CFG_ASSERT (0)
#define BSP_CFG_ERROR_LOG (0)
#define BSP_CFG_PFS_PROTECT ((1))
#define BSP_CFG_C_RUNTIME_INIT ((1))
#define BSP_CFG_EARLY_INIT     ((0))
#define BSP_CFG_STARTUP_CLOCK_REG_NOT_RESET ((0))
#ifndef BSP_CLOCK_CFG_MAIN_OSC_POPULATED
#define BSP_CLOCK_CFG_MAIN_OSC_POPULATED (0)
#endif
#ifndef BSP_CLOCK_CFG_MAIN_OSC_CLOCK_SOURCE
#define BSP_CLOCK_CFG_MAIN_OSC_CLOCK_SOURCE (0)
#endif
#ifndef BSP_CLOCK_CFG_SUBCLOCK_DRIVE
#define BSP_CLOCK_CFG_SUBCLOCK_DRIVE (0)
#endif
#ifndef BSP_CLOCK_CFG_SUBCLOCK_POPULATED
#define BSP_CLOCK_CFG_SUBCLOCK_POPULATED (0) /* FPB-RA6E1: the 32.768 kHz crystal X2 is fitted but E25/E26 are open (XCIN/XCOUT go to J3) */
#endif
#ifndef BSP_CLOCK_CFG_SUBCLOCK_STABILIZATION_MS
#define BSP_CLOCK_CFG_SUBCLOCK_STABILIZATION_MS 1000
#endif
#ifdef __cplusplus
}
#endif
#endif /* BSP_CFG_H_ */
`;
}

function pinCfgH(mcu){
 const labels=Object.entries(mcu.pins||{}).filter(([,p])=>p.label).map(([pin,p])=>`#define ${p.label} (${ioName(pin)})`);
 return HEADER('configuration header file')+`#ifndef BSP_PIN_CFG_H_
#define BSP_PIN_CFG_H_
#include "r_ioport.h"
FSP_HEADER
${labels.join('\n')}${labels.length?'\n':''}extern const ioport_cfg_t g_bsp_pin_cfg; /* R7FA6E10F2CFP.pincfg */
void BSP_PinConfigSecurityInit();
FSP_FOOTER
#endif /* BSP_PIN_CFG_H_ */
`;
}

function pinData(mcu){
 const pins=Object.entries(mcu.pins||{}).sort(([a],[b])=>raPinName(a).localeCompare(raPinName(b)));
 return HEADER('pin source file')+`#include "bsp_api.h"
#include "r_ioport.h"
const ioport_pin_cfg_t g_bsp_pin_cfg_data[] = {
${pins.map(([pin,p])=>`    {\n        .pin = ${ioName(pin)},\n        .pin_cfg = ${pinCfgWord({...p,name:pin})}\n    },`).join('\n')}
};
const ioport_cfg_t g_bsp_pin_cfg = {
    .number_of_pins = sizeof(g_bsp_pin_cfg_data)/sizeof(ioport_pin_cfg_t),
    .p_pin_cfg_data = &g_bsp_pin_cfg_data[0],
};
#if BSP_TZ_SECURE_BUILD
void R_BSP_PinCfgSecurityInit(void);
void R_BSP_PinCfgSecurityInit(void)
{
}
#endif
`;
}

function vectorH(vectors){
 return HEADER('vector header file')+`#ifndef VECTOR_DATA_H
#define VECTOR_DATA_H
#ifdef __cplusplus
extern "C" {
#endif
/* Number of interrupts allocated */
#ifndef VECTOR_DATA_IRQ_COUNT
#define VECTOR_DATA_IRQ_COUNT    (${vectors.length})
#endif
/* Number of ICU vector table entries the application uses (FSP 6). At least 1: with no interrupt at all, FSP's own
 * default tables (bsp_irq.c) would be arrays of 0 elements with an initializer — a build warning. */
#define BSP_ICU_VECTOR_NUM_ENTRIES (${Math.max(1,vectors.length)})
/* ISR prototypes */
${[...new Set(vectors.map(v=>v.isr))].map(f=>`void ${f}(void);`).join('\n')}
/* Vector table allocations */
${vectors.map(v=>`#define VECTOR_NUMBER_${v.vector} ((IRQn_Type) ${v.index}) /* ${v.label} */\n#define ${v.vector}_IRQn          ((IRQn_Type) ${v.index}) /* ${v.label} */`).join('\n')}
#ifdef __cplusplus
}
#endif
#endif /* VECTOR_DATA_H */
`;
}
function vectorC(vectors){
 return HEADER('vector source file')+`#include "bsp_api.h"
/* Do not build these data structures if no interrupts are currently allocated because IAR will have build errors. */
#if VECTOR_DATA_IRQ_COUNT > 0
BSP_DONT_REMOVE const fsp_vector_t g_vector_table[BSP_ICU_VECTOR_NUM_ENTRIES] BSP_PLACE_IN_SECTION(BSP_SECTION_APPLICATION_VECTORS) =
{
${vectors.map(v=>`    [${v.index}] = ${v.isr}, /* ${v.label} */`).join('\n')}
};
#if BSP_FEATURE_ICU_HAS_IELSR
const bsp_interrupt_event_t g_interrupt_event_link_select[BSP_ICU_VECTOR_NUM_ENTRIES] =
{
${vectors.map(v=>`    [${v.index}] = BSP_PRV_VECT_ENUM(EVENT_${v.event},GROUP${v.index%8}), /* ${v.label} */`).join('\n')}
};
#endif
#endif
`;
}

function halDataH(mcu){
 const irqs=irqsOf(mcu),uarts=uartsOf(mcu),includes=(irqs.length?'#include "r_icu.h"\n#include "r_external_irq_api.h"\n':'')+(uarts.length?'#include "r_sci_uart.h"\n#include "r_uart_api.h"\n':'')+(gptsOf(mcu).length?'#include "r_gpt.h"\n#include "r_timer_api.h"\n':'')+(adcOf(mcu)?'#include "r_adc.h"\n#include "r_adc_api.h"\n':'')+(iicsOf(mcu).length?'#include "r_iic_master.h"\n#include "r_i2c_master_api.h"\n':'')+(agtsOf(mcu).length?'#include "r_agt.h"\n'+(gptsOf(mcu).length?'':'#include "r_timer_api.h"\n'):'');
 const decls=irqs.map(i=>`/** External IRQ on ICU Instance. */
extern const external_irq_instance_t ${i.name};
/** Access the ICU instance using these structures when calling API functions directly (::p_api is not used). */
extern icu_instance_ctrl_t ${i.name}_ctrl;
extern const external_irq_cfg_t ${i.name}_cfg;
#ifndef ${i.callback}
void ${i.callback}(external_irq_callback_args_t * p_args);
#endif`).concat(uarts.map(u=>`/** UART on SCI Instance. */
extern const uart_instance_t ${u.name};
/** Access the UART instance using these structures when calling API functions directly (::p_api is not used). */
extern sci_uart_instance_ctrl_t ${u.name}_ctrl;
extern const uart_cfg_t ${u.name}_cfg;
extern const sci_uart_extended_cfg_t ${u.name}_cfg_extend;
#ifndef ${u.callback}
void ${u.callback}(uart_callback_args_t * p_args);
#endif`)).concat(gptsOf(mcu).map(gptDecl)).concat(adcOf(mcu)?[adcDecl(adcOf(mcu))]:[]).concat(agtsOf(mcu).map(agtDecl)).concat(iicsOf(mcu).map(iicDecl)).join('\n');
 return HEADER('HAL header file')+`#ifndef HAL_DATA_H_
#define HAL_DATA_H_
#include <stdint.h>
#include "bsp_api.h"
#include "common_data.h"
${includes}FSP_HEADER
${decls}${decls?'\n':''}void hal_entry(void);
void g_hal_init(void);
FSP_FOOTER
#endif /* HAL_DATA_H_ */
`;
}
function halDataC(mcu){
 const irqs=irqsOf(mcu),trig={FALLING:'EXTERNAL_IRQ_TRIGGER_FALLING',RISING:'EXTERNAL_IRQ_TRIGGER_RISING',BOTH:'EXTERNAL_IRQ_TRIGGER_BOTH_EDGE',LOW:'EXTERNAL_IRQ_TRIGGER_LEVEL_LOW'};
 const body=irqs.map(i=>`icu_instance_ctrl_t ${i.name}_ctrl;
const icu_extended_cfg_t ${i.name}_ext_cfg =
{
    .filter_src = EXTERNAL_IRQ_DIGITAL_FILTER_PCLK_DIV,
};
const external_irq_cfg_t ${i.name}_cfg =
{
    .channel             = ${i.channel},
    .trigger             = ${trig[i.trigger]||trig.FALLING},
    .filter_enable       = ${i.filter?'true':'false'},
    .clock_source_div    = EXTERNAL_IRQ_CLOCK_SOURCE_DIV_64,
    .p_callback          = ${i.callback},
    .p_context           = NULL,
    .p_extend            = (void *)&${i.name}_ext_cfg,
    .ipl                 = (${i.priority}),
#if defined(VECTOR_NUMBER_ICU_IRQ${i.channel})
    .irq                 = VECTOR_NUMBER_ICU_IRQ${i.channel},
#else
    .irq                 = FSP_INVALID_VECTOR,
#endif
};
/* Instance structure to use this module. */
const external_irq_instance_t ${i.name} =
{
    .p_ctrl        = &${i.name}_ctrl,
    .p_cfg         = &${i.name}_cfg,
    .p_api         = &g_external_irq_on_icu
};`).concat(uartsOf(mcu).map(u=>{const b=sciBaudSetting(raPclka(mcu),u.baud),irq=k=>`#if defined(VECTOR_NUMBER_SCI${u.channel}_${k})\n    .${k.toLowerCase()}_irq             = VECTOR_NUMBER_SCI${u.channel}_${k},\n#else\n    .${k.toLowerCase()}_irq             = FSP_INVALID_VECTOR,\n#endif`;return `sci_uart_instance_ctrl_t ${u.name}_ctrl;
baud_setting_t ${u.name}_baud_setting =
{
    /* Baud rate calculated with ${b.error.toFixed(3)}% error. */ .semr_baudrate_bits_b.abcse = 0, .semr_baudrate_bits_b.abcs = ${b.abcs}, .semr_baudrate_bits_b.bgdm = ${b.bgdm}, .cks = ${b.cks}, .brr = ${b.brr}, .mddr = (uint8_t) 256, .semr_baudrate_bits_b.brme = false
};
/** UART extended configuration for UARTonSCI HAL driver */
const sci_uart_extended_cfg_t ${u.name}_cfg_extend =
{
    .clock                = SCI_UART_CLOCK_INT,
    .rx_edge_start        = SCI_UART_START_BIT_FALLING_EDGE,
    .noise_cancel         = SCI_UART_NOISE_CANCELLATION_DISABLE,
    .rx_fifo_trigger      = SCI_UART_RX_FIFO_TRIGGER_MAX,
    .p_baud_setting       = &${u.name}_baud_setting,
    .flow_control         = SCI_UART_FLOW_CONTROL_RTS,
    .flow_control_pin     = (bsp_io_port_pin_t) UINT16_MAX,
    .rs485_setting = {
        .enable = SCI_UART_RS485_DISABLE,
        .polarity = SCI_UART_RS485_DE_POLARITY_HIGH,
        .de_control_pin = (bsp_io_port_pin_t) UINT16_MAX,
    },
    .irda_setting = {
        .ircr_bits_b.ire = 0,
        .ircr_bits_b.irrxinv = 0,
        .ircr_bits_b.irtxinv = 0,
    },
};
/** UART interface configuration */
const uart_cfg_t ${u.name}_cfg =
{
    .channel             = ${u.channel},
    .data_bits           = UART_DATA_BITS_8,
    .parity              = UART_PARITY_OFF,
    .stop_bits           = UART_STOP_BITS_1,
    .p_callback          = ${u.callback},
    .p_context           = NULL,
    .p_extend            = &${u.name}_cfg_extend,
    .p_transfer_tx       = NULL,
    .p_transfer_rx       = NULL,
    .rxi_ipl             = (${u.priority}),
    .txi_ipl             = (${u.priority}),
    .tei_ipl             = (${u.priority}),
    .eri_ipl             = (${u.priority}),
${['RXI','TXI','TEI','ERI'].map(irq).join('\n')}
};
/* Instance structure to use this module. */
const uart_instance_t ${u.name} =
{
    .p_ctrl        = &${u.name}_ctrl,
    .p_cfg         = &${u.name}_cfg,
    .p_api         = &g_uart_on_sci
};`;})).concat(gptsOf(mcu).map(gptInstance)).concat(adcOf(mcu)?[adcInstance(adcOf(mcu))]:[]).concat(agtsOf(mcu).map(agtInstance)).concat(iicsOf(mcu).map(iicInstance)).join('\n');
 return HEADER('HAL source file')+`#include "hal_data.h"
${body}${body?'\n':''}void g_hal_init(void) {
g_common_init();
}
`;
}

// Linker regions and the C runtime init tables (bsp_linker_info.h) of a flat project: .data copied from flash,
// .bss zeroed, the stack and heap in RAM.
function memoryRegions(fam){
 return `  /* generated memory regions file - do not edit */
  RAM_START = 0x20000000;
  RAM_LENGTH = ${hex(fam.ramKB*1024)};
  FLASH_START = 0x00000000;
  FLASH_LENGTH = ${hex(fam.flashKB*1024)};
  DATA_FLASH_START = 0x08000000;
  DATA_FLASH_LENGTH = ${hex(fam.dataFlashKB*1024)};
  OPTION_SETTING_START = 0x0100A100;
  OPTION_SETTING_LENGTH = 0x00000200;
`;
}
const FSP_LD=`/* Linker script for an RA flat project (generated - do not edit). */
INCLUDE memory_regions.ld
MEMORY
{
  FLASH (rx) : ORIGIN = FLASH_START, LENGTH = FLASH_LENGTH
  RAM (rwx) : ORIGIN = RAM_START, LENGTH = RAM_LENGTH
  DATA_FLASH (rx) : ORIGIN = DATA_FLASH_START, LENGTH = DATA_FLASH_LENGTH
  OPTION_SETTING (r) : ORIGIN = OPTION_SETTING_START, LENGTH = OPTION_SETTING_LENGTH
}
ENTRY(Reset_Handler)
GROUP(libgcc.a libc.a libm.a)
SECTIONS
{
  __flash_vectors$$ :
  {
    __ROM_Start = .;
    __flash_vectors$$Base = .;
    PROVIDE(__Vectors = .);
    KEEP(*(.fixed_vectors*))
    KEEP(*(.application_vectors*))
    __Vectors_End = .;
    __flash_vectors$$Limit = .;
  } > FLASH
  .text :
  {
    *(.text*)
    KEEP(*(.version))
    KEEP(*(.init))
    KEEP(*(.fini))
    *(.rodata*)
    *(.flash_noinit)
    __usb_dev_descriptor_start_fs = .;
    KEEP(*(.usb_device_desc_fs*))
    __usb_descriptor_end_fs = .;
    . = ALIGN(4);
  } > FLASH
  .ARM.extab : { *(.ARM.extab* .gnu.linkonce.armextab.*) } > FLASH
  .ARM.exidx : { __exidx_start = .; *(.ARM.exidx* .gnu.linkonce.armexidx.*) __exidx_end = .; } > FLASH
  .preinit_array : { PROVIDE_HIDDEN(__preinit_array_start = .); KEEP(*(.preinit_array)) PROVIDE_HIDDEN(__preinit_array_end = .); } > FLASH
  .init_array : { PROVIDE_HIDDEN(__init_array_start = .); KEEP(*(SORT(.init_array.*))) KEEP(*(.init_array)) PROVIDE_HIDDEN(__init_array_end = .); } > FLASH
  .fini_array : { PROVIDE_HIDDEN(__fini_array_start = .); KEEP(*(SORT(.fini_array.*))) KEEP(*(.fini_array)) PROVIDE_HIDDEN(__fini_array_end = .); } > FLASH
  __ROM_End = .;
  __ram_noinit$$ (NOLOAD) :
  {
    __ram_noinit$$Base = .;
    *(.ram_noinit*)
    __ram_noinit$$Limit = .;
  } > RAM
  __ram_from_flash$$ : ALIGN(4)
  {
    __ram_from_flash$$Base = .;
    __ram_from_flash$$Load = LOADADDR(__ram_from_flash$$);
    *(.ram_from_flash*)
    *(.ram_code_from_flash*)
    *(.data*)
    . = ALIGN(4);
    __ram_from_flash$$Limit = .;
  } > RAM AT > FLASH
  /* The main stack and the heap are not zeroed by the C runtime init (the stack is in use while it runs). */
  __ram_main_stack$$ (NOLOAD) : ALIGN(8)
  {
    __ram_main_stack$$Base = .;
    *(.bss.g_main_stack)
    __ram_main_stack$$Limit = .;
  } > RAM
  __ram_heap$$ (NOLOAD) : ALIGN(8)
  {
    __HeapBase = .;
    *(.bss.g_heap)
    __HeapLimit = .;
  } > RAM
  __ram_zero$$ (NOLOAD) : ALIGN(4)
  {
    __ram_zero$$Base = .;
    *(.bss*)
    *(COMMON)
    *(.ram*)
    . = ALIGN(4);
    __ram_zero$$Limit = .;
  } > RAM
  __StackLimit = __ram_main_stack$$Base;
  __StackTop = __ram_main_stack$$Limit;
  __data_flash$$ : { __data_flash$$Base = .; KEEP(*(.data_flash*)) __data_flash$$Limit = .; } > DATA_FLASH
  .option_setting : { KEEP(*(.option_setting*)) } > OPTION_SETTING
  end = __HeapBase;
  __end__ = end;
}
`;
const LINKER_INFO=`/* UNCRUSTIFY-OFF */
#ifndef BSP_LINKER_H
#define BSP_LINKER_H
typedef enum e_bsp_init_mem {
    INIT_MEM_ZERO,
    INIT_MEM_FLASH,
    INIT_MEM_DATA_FLASH,
    INIT_MEM_RAM,
    INIT_MEM_DTCM,
    INIT_MEM_ITCM,
    INIT_MEM_CTCM,
    INIT_MEM_STCM,
    INIT_MEM_OSPI0_CS0,
    INIT_MEM_OSPI0_CS1,
    INIT_MEM_OSPI1_CS0,
    INIT_MEM_OSPI1_CS1,
    INIT_MEM_QSPI_FLASH,
    INIT_MEM_SDRAM,
} bsp_init_mem_t;
typedef struct st_bsp_init_type {
    uint32_t copy_64 :8;
    uint32_t external :8;
    uint32_t source_type :8;
    uint32_t destination_type :8;
} bsp_init_type_t;
typedef struct st_bsp_init_zero_info {
    uint32_t *const p_base;
    uint32_t *const p_limit;
    bsp_init_type_t type;
} bsp_init_zero_info_t;
typedef struct st_bsp_init_copy_info {
    uint32_t *const p_base;
    uint32_t *const p_limit;
    uint32_t *const p_load;
    bsp_init_type_t type;
} bsp_init_copy_info_t;
typedef struct st_bsp_init_info {
    uint32_t zero_count;
    bsp_init_zero_info_t const *const p_zero_list;
    uint32_t copy_count;
    bsp_init_copy_info_t const *const p_copy_list;
} bsp_init_info_t;
extern bsp_init_info_t const g_init_info;
#endif /* BSP_LINKER_H */
#ifdef BSP_LINKER_C
extern uint32_t __ram_zero$$Base;
extern uint32_t __ram_zero$$Limit;
static const bsp_init_zero_info_t zero_list[] =
{
  {.p_base = &__ram_zero$$Base, .p_limit = &__ram_zero$$Limit, .type = {.copy_64 = 0, .external = 0, .source_type = INIT_MEM_ZERO, .destination_type = INIT_MEM_RAM}}
};
extern uint32_t __ram_from_flash$$Base;
extern uint32_t __ram_from_flash$$Limit;
extern uint32_t __ram_from_flash$$Load;
static const bsp_init_copy_info_t copy_list[] =
{
  {.p_base = &__ram_from_flash$$Base, .p_limit = &__ram_from_flash$$Limit, .p_load = &__ram_from_flash$$Load, .type = {.copy_64 = 0, .external = 0, .source_type = INIT_MEM_FLASH, .destination_type = INIT_MEM_RAM}}
};
const bsp_init_info_t g_init_info =
{
    .zero_count  = sizeof(zero_list) / sizeof(zero_list[0]),
    .p_zero_list = zero_list,
    .copy_count  = sizeof(copy_list) / sizeof(copy_list[0]),
    .p_copy_list = copy_list
};
#endif /* BSP_LINKER_C */
/* UNCRUSTIFY-ON */
`;

/** Every generated file of an RA project, as {path: text} (paths relative to the build folder). */
export function generateRaFiles(mcu,{board}={}){
 const fam=raFamily(mcu.family),vectors=raVectors(mcu),c={...fam.clock,...(mcu.clock||{})};
 const cfg=(name,text)=>[`ra_cfg/fsp_cfg/${name}`,text],gen=(name,text)=>[`ra_gen/${name}`,text];
 const moduleCfg=(file,guard,macros)=>HEADER('configuration header file')+`#ifndef ${guard}\n#define ${guard}\n#ifdef __cplusplus\nextern "C" {\n#endif\n${macros.join('\n')}\n#ifdef __cplusplus\n}\n#endif\n#endif /* ${guard} */\n`;
 return Object.fromEntries([
  cfg('bsp/bsp_cfg.h',bspCfg(mcu)),
  cfg('bsp/bsp_mcu_device_cfg.h',HEADER('configuration header file')+`#ifndef BSP_MCU_DEVICE_CFG_H_\n#define BSP_MCU_DEVICE_CFG_H_\n#define BSP_CFG_MCU_PART_SERIES (${fam.series})\n#endif /* BSP_MCU_DEVICE_CFG_H_ */\n`),
  cfg('bsp/bsp_mcu_device_pn_cfg.h',HEADER('configuration header file')+`#ifndef BSP_MCU_DEVICE_PN_CFG_H_\n#define BSP_MCU_DEVICE_PN_CFG_H_\n#define BSP_MCU_${fam.part}\n#define BSP_MCU_FEATURE_SET ('${fam.featureSet}')\n#define BSP_ROM_SIZE_BYTES (${fam.flashKB*1024})\n#define BSP_RAM_SIZE_BYTES (${fam.ramKB*1024})\n#define BSP_DATA_FLASH_SIZE_BYTES (${fam.dataFlashKB*1024})\n#define BSP_PACKAGE_${fam.package}\n#define BSP_PACKAGE_PINS (${fam.pins})\n#endif /* BSP_MCU_DEVICE_PN_CFG_H_ */\n`),
  cfg('bsp/bsp_mcu_family_cfg.h',familyCfg(fam)),
  cfg('bsp/bsp_mcu_ofs_cfg.h',HEADER('configuration header file')+'#ifndef BSP_MCU_OFS_CFG_H_\n#define BSP_MCU_OFS_CFG_H_\n#endif /* BSP_MCU_OFS_CFG_H_ */\n'),
  cfg('bsp/bsp_pin_cfg.h',pinCfgH(mcu)),
  cfg('bsp/board_cfg.h',HEADER('configuration header file')+`#ifndef BOARD_CFG_H_\n#define BOARD_CFG_H_\n#include "${board?.fspBoard?'board.h':'bsp_api.h'}"\n#endif /* BOARD_CFG_H_ */\n`),
  cfg('r_ioport_cfg.h',moduleCfg('r_ioport_cfg.h','R_IOPORT_CFG_H_',['#define IOPORT_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)'])),
  cfg('r_icu_cfg.h',moduleCfg('r_icu_cfg.h','R_ICU_CFG_H_',['#define ICU_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)'])),
  cfg('r_iic_master_cfg.h',moduleCfg('r_iic_master_cfg.h','R_IIC_MASTER_CFG_H_',['#define IIC_MASTER_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)','#define IIC_MASTER_CFG_DTC_ENABLE (0)','#define IIC_MASTER_CFG_ADDR_MODE_10_BIT_ENABLE (0)'])),
  cfg('r_agt_cfg.h',moduleCfg('r_agt_cfg.h','R_AGT_CFG_H_',['#define AGT_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)','#define AGT_CFG_OUTPUT_SUPPORT_ENABLE (0)','#define AGT_CFG_INPUT_SUPPORT_ENABLE (0)'])),
  cfg('r_adc_cfg.h',moduleCfg('r_adc_cfg.h','R_ADC_CFG_H_',['#define ADC_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)'])),
  cfg('r_gpt_cfg.h',moduleCfg('r_gpt_cfg.h','R_GPT_CFG_H_',['#define GPT_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)','#define GPT_CFG_OUTPUT_SUPPORT_ENABLE (1)','#define GPT_CFG_WRITE_PROTECT_ENABLE (0)','#define GPT_CFG_GPTCLK_BYPASS (0)'])),
  cfg('r_sci_uart_cfg.h',moduleCfg('r_sci_uart_cfg.h','R_SCI_UART_CFG_H_',['#define SCI_UART_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)','#define SCI_UART_CFG_FIFO_SUPPORT (0)','#define SCI_UART_CFG_DTC_SUPPORTED (0)','#define SCI_UART_CFG_FLOW_CONTROL_SUPPORT (0)','#define SCI_UART_CFG_RS485_SUPPORT (0)','#define SCI_UART_CFG_IRDA_SUPPORT (0)'])),
  gen('bsp_clock_cfg.h',clockCfg(c)),
  gen('common_data.h',HEADER('common header file')+`#ifndef COMMON_DATA_H_\n#define COMMON_DATA_H_\n#include <stdint.h>\n#include "bsp_api.h"\n#include "r_ioport.h"\n#include "bsp_pin_cfg.h"\nFSP_HEADER\n#define IOPORT_CFG_NAME g_bsp_pin_cfg\n#define IOPORT_CFG_OPEN R_IOPORT_Open\n#define IOPORT_CFG_CTRL g_ioport_ctrl\n/* IOPORT Instance */\nextern const ioport_instance_t g_ioport;\n/* IOPORT control structure. */\nextern ioport_instance_ctrl_t g_ioport_ctrl;\nvoid g_common_init(void);\nFSP_FOOTER\n#endif /* COMMON_DATA_H_ */\n`),
  gen('common_data.c',HEADER('common source file')+`#include "common_data.h"\nioport_instance_ctrl_t g_ioport_ctrl;\nconst ioport_instance_t g_ioport =\n{\n    .p_api = &g_ioport_on_ioport,\n    .p_ctrl = &g_ioport_ctrl,\n    .p_cfg = &g_bsp_pin_cfg,\n};\nvoid g_common_init(void) {\n}\n`),
  gen('hal_data.h',halDataH(mcu)),
  gen('hal_data.c',halDataC(mcu)),
  gen('main.c',HEADER('main source file')+'#include "hal_data.h"\nint main(void) {\n  hal_entry();\n  return 0;\n}\n'),
  gen('pin_data.c',pinData(mcu)),
  gen('vector_data.h',vectorH(vectors)),
  gen('vector_data.c',vectorC(vectors)),
  gen('bsp_linker_info.h',LINKER_INFO),
  ['script/memory_regions.ld',memoryRegions(fam)],
  ['script/fsp.ld',FSP_LD]
 ]);
}

/** A new project's src/hal_entry.c, as e² studio's FSP template writes it (pins opened in R_BSP_WarmStart). */
export function raHalEntry({blink}={}){
 const loop=blink?`    /* Blink LED1 (P408) and LED2 (P407) on the FPB-RA6E1. */
    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_08, BSP_IO_LEVEL_HIGH);
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_07, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_08, BSP_IO_LEVEL_LOW);
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_07, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
    }
`:'';
 return `#include "hal_data.h"

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER

/*******************************************************************************************************************//**
 * main() is generated by the RA Configuration editor and is used to generate threads if an RTOS is used.  This function
 * is called by main() when no RTOS is used.
 **********************************************************************************************************************/
void hal_entry(void)
{
    /* TODO: add your own code here */
${loop}#if BSP_TZ_SECURE_BUILD
    /* Enter non-secure code */
    R_BSP_NonSecureEnter();
#endif
}

/*******************************************************************************************************************//**
 * This function is called at various points during the startup process.  This implementation uses the event that is
 * called right before main() to set up the pins.
 *
 * @param[in]  event    Where at in the start up process the code is currently at
 **********************************************************************************************************************/
void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_RESET == event)
    {
#if BSP_FEATURE_FLASH_LP_VERSION != 0

        /* Enable reading from data flash. */
        R_FACI_LP->DFLCTL = 1U;

        /* Would normally have to wait tDSTOP(6us) for data flash recovery. Placing the enable here, before clock and
         * C runtime initialization, should negate the need for a delay since the initialization will typically take more than 6us. */
#endif
    }

    if (BSP_WARM_START_POST_C == event)
    {
        /* C runtime environment and system clocks are setup. */

        /* Configure pins. */
        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}

#if BSP_TZ_SECURE_BUILD

BSP_CMSE_NONSECURE_ENTRY void template_nonsecure_callable ();

/* Trustzone Secure Projects require at least one nonsecure callable function in order to build (Remove this if it is not required to build). */
BSP_CMSE_NONSECURE_ENTRY void template_nonsecure_callable ()
{

}
#endif
`;
}
