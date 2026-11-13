// Renesas FSP projects (FPB-RA6E1) on the built-in C interpreter, without ARM GCC or FSP installed (feature 42).
// compileFsp() reads src/hal_entry.c with a stand-in for the generated headers (hal_data.h, common_data.h,
// bsp_pin_cfg.h, vector_data.h: the FSP types, enums and the instances RASC writes for the project's Pins and Stacks),
// and FspAdapter runs the FSP calls on the circuit the way session.js runs HAL calls with HalAdapter: R_IOPORT pins,
// R_BSP_SoftwareDelay, R_ICU external interrupts, SCI UART, GPT and AGT timers, ADC12 and the IIC master, each callback
// from its own interrupt at the Stacks priority. Enum values and struct members follow FSP 5.x (r_*_api.h).
import {compile} from './parser.js';
import {prepareHalSource} from './hal-source.js';
import {HalAdapter} from './hal.js';
import {BusDevices} from './buses.js';
import {formatPrintf,stringCall} from './hal-stdio.js';
import {validateRaMcu,raClockHz,raPinName,RA6E1_PORTS,RA_ADC_CHANNELS,RA_IRQ_PINS} from './ra-config.js';
import {raInstances,raIoName,raVectors,pinCfgWord} from './ra-generator.js';

const pad=n=>String(n).padStart(2,'0');
const hex=(n,w=4)=>'0x'+(n>>>0).toString(16).toUpperCase().padStart(w,'0');
const enumOf=(tag,name,items)=>`typedef enum ${tag}\n{\n${items.map(([k,v])=>`    ${k} = ${v},`).join('\n')}\n} ${name};`;

// Object-like macros of the FSP headers that stand for a name or for nothing; the interpreter's preprocessor keeps
// object-like macros as constants, so these are replaced in the project's text before it (lines stay where they are).
export const FSP_ALIASES=Object.freeze({FSP_CPP_HEADER:'',FSP_CPP_FOOTER:'',FSP_HEADER:'',FSP_FOOTER:'',BSP_CMSE_NONSECURE_ENTRY:'',BSP_DONT_REMOVE:'',
 IOPORT_CFG_CTRL:'g_ioport_ctrl',IOPORT_CFG_NAME:'g_bsp_pin_cfg',IOPORT_CFG_OPEN:'R_IOPORT_Open'});
// FSP and generated headers that resolve to the prelude (it has a guard, so including several is fine); the C
// library headers read as empty.
const FSP_HEADERS=['hal_data.h','common_data.h','bsp_pin_cfg.h','vector_data.h','bsp_api.h','bsp_cfg.h','bsp_clock_cfg.h','board.h','board_cfg.h','fsp_common_api.h','r_ioport.h','r_ioport_api.h','r_icu.h','r_external_irq_api.h','r_sci_uart.h','r_uart_api.h','r_gpt.h','r_timer_api.h','r_agt.h','r_adc.h','r_adc_api.h','r_iic_master.h','r_i2c_master_api.h','bsp_io.h','bsp_delay.h','bsp_common.h'];
const C_HEADERS=new Set(['stdint.h','stddef.h','stdbool.h','string.h','stdlib.h','stdio.h','ctype.h','math.h','limits.h']);
// Generated and FSP source folders of the project tree: built by ARM GCC only (the prelude stands in for them here).
const FSP_FILE=/^(ra|ra_gen|ra_cfg|script)\//;

const TYPES=`typedef int IRQn_Type;
${enumOf('e_fsp_err','fsp_err_t',[['FSP_SUCCESS',0],...['ASSERTION','INVALID_POINTER','INVALID_ARGUMENT','INVALID_CHANNEL','INVALID_MODE','UNSUPPORTED','NOT_OPEN','IN_USE','OUT_OF_MEMORY','HW_LOCKED','IRQ_BSP_DISABLED','OVERFLOW','UNDERFLOW','ALREADY_OPEN','APPROXIMATION','CLAMPED','INVALID_RATE','ABORTED','NOT_ENABLED','TIMEOUT','INVALID_BLOCKS','INVALID_ADDRESS','INVALID_SIZE','WRITE_FAILED','ERASE_FAILED','INVALID_CALL','INVALID_HW_CONDITION','INVALID_FACTORY_FLASH'].map((k,i)=>['FSP_ERR_'+k,i+1]),['FSP_ERR_INVALID_STATE',30]])}
${enumOf('e_bsp_io_level','bsp_io_level_t',[['BSP_IO_LEVEL_LOW',0],['BSP_IO_LEVEL_HIGH',1]])}
${enumOf('e_bsp_io_dir','bsp_io_direction_t',[['BSP_IO_DIRECTION_INPUT',0],['BSP_IO_DIRECTION_OUTPUT',1]])}
${enumOf('e_bsp_io_port','bsp_io_port_t',Array.from({length:10},(_,p)=>[`BSP_IO_PORT_${pad(p)}`,hex(p<<8)]))}
${enumOf('e_bsp_io_port_pin_t','bsp_io_port_pin_t',Array.from({length:10},(_,p)=>Array.from({length:16},(_,b)=>[`BSP_IO_PORT_${pad(p)}_PIN_${pad(b)}`,hex(p<<8|b)])).flat())}
${enumOf('e_bsp_delay_units','bsp_delay_units_t',[['BSP_DELAY_UNITS_SECONDS',1000000],['BSP_DELAY_UNITS_MILLISECONDS',1000],['BSP_DELAY_UNITS_MICROSECONDS',1]])}
${enumOf('e_bsp_warm_start_event','bsp_warm_start_event_t',[['BSP_WARM_START_RESET',0],['BSP_WARM_START_POST_CLOCK',1],['BSP_WARM_START_POST_C',2]])}
${enumOf('e_ioport_cfg_options','ioport_cfg_options_t',[['IOPORT_CFG_PORT_DIRECTION_INPUT',0],['IOPORT_CFG_PORT_DIRECTION_OUTPUT',4],['IOPORT_CFG_PORT_OUTPUT_LOW',0],['IOPORT_CFG_PORT_OUTPUT_HIGH',1],['IOPORT_CFG_PULLUP_ENABLE','0x10'],['IOPORT_CFG_PIM_TTL','0x20'],['IOPORT_CFG_NMOS_ENABLE','0x40'],['IOPORT_CFG_PMOS_ENABLE','0x80'],['IOPORT_CFG_DRIVE_MID','0x400'],['IOPORT_CFG_DRIVE_HS_HIGH','0x800'],['IOPORT_CFG_DRIVE_MID_IIC','0x800'],['IOPORT_CFG_DRIVE_HIGH','0xC00'],['IOPORT_CFG_EVENT_RISING_EDGE','0x1000'],['IOPORT_CFG_EVENT_FALLING_EDGE','0x2000'],['IOPORT_CFG_EVENT_BOTH_EDGES','0x3000'],['IOPORT_CFG_IRQ_ENABLE','0x4000'],['IOPORT_CFG_ANALOG_ENABLE','0x8000'],['IOPORT_CFG_PERIPHERAL_PIN','0x10000']])}
${enumOf('e_ioport_peripheral','ioport_peripheral_t',[['DEBUG',0],['AGT',1],['GPT0',2],['GPT1',3],['SCI0_2_4_6_8',4],['SCI1_3_5_7_9',5],['SPI',6],['IIC',7],['CLKOUT_COMP_RTC',9],['CAC_AD',10]].map(([k,n])=>['IOPORT_PERIPHERAL_'+k,hex(n<<24,8)]).concat([['IOPORT_PERIPHERAL_IO',0]]))}
${enumOf('e_external_irq_trigger','external_irq_trigger_t',[['EXTERNAL_IRQ_TRIGGER_FALLING',0],['EXTERNAL_IRQ_TRIGGER_RISING',1],['EXTERNAL_IRQ_TRIGGER_BOTH_EDGE',2],['EXTERNAL_IRQ_TRIGGER_LEVEL_LOW',3],['EXTERNAL_IRQ_TRIGGER_LEVEL_HIGH',4]])}
${enumOf('e_external_irq_clock_source_div','external_irq_clock_source_div_t',[['EXTERNAL_IRQ_CLOCK_SOURCE_DIV_1',0],['EXTERNAL_IRQ_CLOCK_SOURCE_DIV_8',1],['EXTERNAL_IRQ_CLOCK_SOURCE_DIV_32',2],['EXTERNAL_IRQ_CLOCK_SOURCE_DIV_64',3]])}
${enumOf('e_uart_event','uart_event_t',['RX_COMPLETE','TX_COMPLETE','RX_CHAR','ERR_PARITY','ERR_FRAMING','ERR_OVERFLOW','BREAK_DETECT','TX_DATA_EMPTY'].map((k,i)=>['UART_EVENT_'+k,1<<i]))}
${enumOf('e_uart_data_bits','uart_data_bits_t',[['UART_DATA_BITS_9',0],['UART_DATA_BITS_8',2],['UART_DATA_BITS_7',3]])}
${enumOf('e_uart_parity','uart_parity_t',[['UART_PARITY_OFF',0],['UART_PARITY_ZERO',1],['UART_PARITY_EVEN',2],['UART_PARITY_ODD',3]])}
${enumOf('e_uart_stop_bits','uart_stop_bits_t',[['UART_STOP_BITS_1',0],['UART_STOP_BITS_2',1]])}
${enumOf('e_uart_dir','uart_dir_t',[['UART_DIR_RX',1],['UART_DIR_TX',2],['UART_DIR_RX_TX',3]])}
${enumOf('e_timer_event','timer_event_t',[['TIMER_EVENT_CYCLE_END',0],['TIMER_EVENT_CREST',0],...['CAPTURE_A','CAPTURE_B','TROUGH','COMPARE_A','COMPARE_B','COMPARE_C','COMPARE_D','COMPARE_E','COMPARE_F','DEAD_TIME'].map((k,i)=>['TIMER_EVENT_'+k,i+1])])}
${enumOf('e_timer_mode','timer_mode_t',['PERIODIC','ONE_SHOT','PWM','ONE_SHOT_PULSE','TRIANGLE_WAVE_SYMMETRIC_PWM','TRIANGLE_WAVE_ASYMMETRIC_PWM'].map((k,i)=>['TIMER_MODE_'+k,i]))}
${enumOf('e_timer_direction','timer_direction_t',[['TIMER_DIRECTION_DOWN',0],['TIMER_DIRECTION_UP',1]])}
${enumOf('e_timer_state','timer_state_t',[['TIMER_STATE_STOPPED',0],['TIMER_STATE_COUNTING',1],['TIMER_STATE_UNKNOWN',2]])}
${enumOf('e_timer_source_div','timer_source_div_t',[1,2,4,8,16,32,64,128,256,512,1024].map((n,i)=>['TIMER_SOURCE_DIV_'+n,i]))}
${enumOf('e_gpt_io_pin','gpt_io_pin_t',[['GPT_IO_PIN_GTIOCA',0],['GPT_IO_PIN_GTIOCB',1],['GPT_IO_PIN_GTIOCA_AND_GTIOCB',2]])}
${enumOf('e_gpt_pin_level','gpt_pin_level_t',[['GPT_PIN_LEVEL_LOW',0],['GPT_PIN_LEVEL_HIGH',1],['GPT_PIN_LEVEL_RETAINED',2]])}
${enumOf('e_agt_clock','agt_clock_t',[['AGT_CLOCK_PCLKB',0],['AGT_CLOCK_LOCO',4],['AGT_CLOCK_FSUB',5]])}
${enumOf('e_adc_mode','adc_mode_t',[['ADC_MODE_SINGLE_SCAN',0],['ADC_MODE_GROUP_SCAN',1],['ADC_MODE_CONTINUOUS_SCAN',2]])}
${enumOf('e_adc_resolution','adc_resolution_t',[['ADC_RESOLUTION_12_BIT',0],['ADC_RESOLUTION_10_BIT',1],['ADC_RESOLUTION_8_BIT',2],['ADC_RESOLUTION_14_BIT',3]])}
${enumOf('e_adc_alignment','adc_alignment_t',[['ADC_ALIGNMENT_RIGHT',0],['ADC_ALIGNMENT_LEFT',1]])}
${enumOf('e_adc_trigger','adc_trigger_t',[['ADC_TRIGGER_SOFTWARE',0],['ADC_TRIGGER_SYNC_ELC',2],['ADC_TRIGGER_ASYNC_EXTERNAL',3]])}
${enumOf('e_adc_event','adc_event_t',['SCAN_COMPLETE','SCAN_COMPLETE_GROUP_B','SCAN_COMPLETE_GROUP_C','CALIBRATION_COMPLETE','CONVERSION_COMPLETE','CALIBRATION_REQUEST','CONVERSION_ERROR','OVERFLOW','LIMIT_CLIP','FIFO_READ_REQUEST','FIFO_OVERFLOW'].map((k,i)=>['ADC_EVENT_'+k,i]))}
${enumOf('e_adc_state','adc_state_t',[['ADC_STATE_IDLE',0],['ADC_STATE_SCAN_IN_PROGRESS',1],['ADC_STATE_CALIBRATION_IN_PROGRESS',2]])}
${enumOf('e_adc_channel','adc_channel_t',[...Array.from({length:29},(_,i)=>['ADC_CHANNEL_'+i,i]),['ADC_CHANNEL_TEMPERATURE',-3],['ADC_CHANNEL_VOLT',-4]])}
${enumOf('e_adc_mask','adc_mask_t',Array.from({length:29},(_,i)=>['ADC_MASK_CHANNEL_'+i,hex(2**i,8)]))}
${enumOf('e_i2c_master_rate','i2c_master_rate_t',[['I2C_MASTER_RATE_STANDARD',100000],['I2C_MASTER_RATE_FAST',400000],['I2C_MASTER_RATE_FASTPLUS',1000000]])}
${enumOf('e_i2c_master_addr_mode','i2c_master_addr_mode_t',[['I2C_MASTER_ADDR_MODE_7BIT',1],['I2C_MASTER_ADDR_MODE_10BIT',2]])}
${enumOf('e_i2c_master_event','i2c_master_event_t',[['I2C_MASTER_EVENT_ABORTED',1],['I2C_MASTER_EVENT_RX_COMPLETE',2],['I2C_MASTER_EVENT_TX_COMPLETE',3],['I2C_MASTER_EVENT_START',4],['I2C_MASTER_EVENT_BYTE_ACK',5]])}
typedef struct st_ioport_instance_ctrl { uint32_t open; } ioport_instance_ctrl_t;
typedef struct st_ioport_pin_cfg { uint32_t pin_cfg; bsp_io_port_pin_t pin; } ioport_pin_cfg_t;
typedef struct st_ioport_cfg { uint16_t number_of_pins; const ioport_pin_cfg_t * p_pin_cfg_data; void * p_extend; } ioport_cfg_t;
typedef struct st_ioport_instance { ioport_instance_ctrl_t * p_ctrl; const ioport_cfg_t * p_cfg; void * p_api; } ioport_instance_t;
typedef struct st_icu_instance_ctrl { uint32_t open; } icu_instance_ctrl_t;
typedef struct st_external_irq_cfg { uint8_t channel; uint8_t ipl; IRQn_Type irq; external_irq_trigger_t trigger; bool filter_enable; external_irq_clock_source_div_t clock_source_div; void * p_context; void * p_extend; } external_irq_cfg_t;
typedef struct st_external_irq_instance { icu_instance_ctrl_t * p_ctrl; const external_irq_cfg_t * p_cfg; void * p_api; } external_irq_instance_t;
typedef struct st_external_irq_callback_args { void * p_context; uint32_t channel; } external_irq_callback_args_t;
typedef struct st_sci_uart_instance_ctrl { uint32_t open; } sci_uart_instance_ctrl_t;
typedef struct st_sci_uart_extended_cfg { uint32_t clock; uint32_t rx_edge_start; uint32_t noise_cancel; uint32_t rx_fifo_trigger; uint32_t flow_control; } sci_uart_extended_cfg_t;
typedef struct st_uart_cfg { uint8_t channel; uart_data_bits_t data_bits; uart_parity_t parity; uart_stop_bits_t stop_bits; void * p_context; const sci_uart_extended_cfg_t * p_extend; uint8_t rxi_ipl; uint8_t txi_ipl; uint8_t tei_ipl; uint8_t eri_ipl; IRQn_Type rxi_irq; IRQn_Type txi_irq; IRQn_Type tei_irq; IRQn_Type eri_irq; } uart_cfg_t;
typedef struct st_uart_instance { sci_uart_instance_ctrl_t * p_ctrl; const uart_cfg_t * p_cfg; void * p_api; } uart_instance_t;
typedef struct st_uart_callback_arg { uint32_t channel; uart_event_t event; uint32_t data; void * p_context; } uart_callback_args_t;
typedef struct st_uart_info { uint32_t write_bytes_max; uint32_t read_bytes_max; } uart_info_t;
typedef struct st_gpt_instance_ctrl { uint32_t open; } gpt_instance_ctrl_t;
typedef struct st_agt_instance_ctrl { uint32_t open; } agt_instance_ctrl_t;
typedef struct st_timer_cfg { timer_mode_t mode; uint32_t period_counts; timer_source_div_t source_div; uint32_t duty_cycle_counts; uint8_t channel; uint8_t cycle_end_ipl; IRQn_Type cycle_end_irq; void * p_context; void * p_extend; } timer_cfg_t;
typedef struct st_timer_instance { void * p_ctrl; const timer_cfg_t * p_cfg; void * p_api; } timer_instance_t;
typedef struct st_timer_callback_args { timer_event_t event; uint32_t capture; void * p_context; } timer_callback_args_t;
typedef struct st_timer_info { timer_direction_t count_direction; uint32_t clock_frequency; uint32_t period_counts; } timer_info_t;
typedef struct st_timer_status { uint32_t counter; timer_state_t state; } timer_status_t;
typedef struct st_adc_instance_ctrl { uint32_t open; } adc_instance_ctrl_t;
typedef struct st_adc_cfg { uint16_t unit; adc_mode_t mode; adc_resolution_t resolution; adc_alignment_t alignment; adc_trigger_t trigger; IRQn_Type scan_end_irq; uint8_t scan_end_ipl; void * p_context; void * p_extend; } adc_cfg_t;
typedef struct st_adc_channel_cfg { uint32_t scan_mask; uint32_t scan_mask_group_b; uint32_t add_mask; uint32_t sample_hold_mask; uint8_t sample_hold_states; } adc_channel_cfg_t;
typedef struct st_adc_instance { adc_instance_ctrl_t * p_ctrl; const adc_cfg_t * p_cfg; const adc_channel_cfg_t * p_channel_cfg; void * p_api; } adc_instance_t;
typedef struct st_adc_status { adc_state_t state; } adc_status_t;
typedef struct st_adc_callback_args { uint16_t unit; adc_event_t event; void * p_context; adc_channel_t channel; uint32_t group_mask; } adc_callback_args_t;
typedef struct st_iic_master_instance_ctrl { uint32_t open; } iic_master_instance_ctrl_t;
typedef struct st_i2c_master_cfg { uint8_t channel; i2c_master_rate_t rate; uint32_t slave; i2c_master_addr_mode_t addr_mode; uint8_t ipl; IRQn_Type rxi_irq; IRQn_Type txi_irq; IRQn_Type tei_irq; IRQn_Type eri_irq; void * p_context; void * p_extend; } i2c_master_cfg_t;
typedef struct st_i2c_master_instance { iic_master_instance_ctrl_t * p_ctrl; const i2c_master_cfg_t * p_cfg; void * p_api; } i2c_master_instance_t;
typedef struct st_i2c_master_callback_args { void * p_context; i2c_master_event_t event; } i2c_master_callback_args_t;
#define FSP_PARAMETER_NOT_USED(p) ((void) (p))
#define BSP_IRQ_DISABLED (0xFF)
#define FSP_INVALID_VECTOR ((IRQn_Type) -33)
#define BSP_TZ_SECURE_BUILD (0)
#define BSP_TZ_NONSECURE_BUILD (0)
#define BSP_FEATURE_FLASH_LP_VERSION (0)
#define BSP_MCU_GROUP_RA6E1 (1)
#define BSP_CFG_RTOS (0)
#define BSP_CFG_MCU_VCC_MV (3300)
#define BSP_LOCO_HZ (32768)
`;

/** The prelude's text for a checked RA configuration: types, the pin symbols and the Stacks instances of hal_data.c. */
export function fspPrelude(mcu){
 const {irqs,uarts,gpts,adc,agts,iics}=raInstances(mcu),vectors=raVectors(mcu),vec=k=>vectors.some(v=>v.vector===k)?`VECTOR_NUMBER_${k}`:'FSP_INVALID_VECTOR';
 const pins=Object.entries(mcu.pins||{}).sort(([a],[b])=>raPinName(a).localeCompare(raPinName(b)));
 const ipl=(name,p)=>name?`(${p})`:'(BSP_IRQ_DISABLED)';
 const out=['#ifndef FSP_INTERP_PRELUDE_H','#define FSP_INTERP_PRELUDE_H',TYPES,
  `#define VECTOR_DATA_IRQ_COUNT (${vectors.length})`,`#define BSP_ICU_VECTOR_NUM_ENTRIES (${Math.max(1,vectors.length)})`,...vectors.flatMap(v=>[`#define VECTOR_NUMBER_${v.vector} ((IRQn_Type) ${v.index})`,`#define ${v.vector}_IRQn ((IRQn_Type) ${v.index})`]),
  ...pins.filter(([,p])=>p.label).map(([pin,p])=>`#define ${p.label} (${raIoName(pin)})`),
  'ioport_instance_ctrl_t g_ioport_ctrl;',
  ...(pins.length?[`const ioport_pin_cfg_t g_bsp_pin_cfg_data[${pins.length}] = {\n${pins.map(([pin,p])=>`    { .pin = ${raIoName(pin)}, .pin_cfg = ${pinCfgWord({...p,name:pin})} },`).join('\n')}\n};`,`const ioport_cfg_t g_bsp_pin_cfg = { .number_of_pins = ${pins.length}, .p_pin_cfg_data = &g_bsp_pin_cfg_data[0], .p_extend = NULL };`]:['const ioport_cfg_t g_bsp_pin_cfg = { .number_of_pins = 0, .p_pin_cfg_data = NULL, .p_extend = NULL };']),
  'const ioport_instance_t g_ioport = { .p_ctrl = &g_ioport_ctrl, .p_cfg = &g_bsp_pin_cfg, .p_api = NULL };'];
 for(const i of irqs)out.push(`icu_instance_ctrl_t ${i.name}_ctrl;`,`const external_irq_cfg_t ${i.name}_cfg = { .channel = ${i.channel}, .trigger = EXTERNAL_IRQ_TRIGGER_${{FALLING:'FALLING',RISING:'RISING',BOTH:'BOTH_EDGE',LOW:'LEVEL_LOW'}[i.trigger]||'FALLING'}, .filter_enable = ${i.filter?'true':'false'}, .clock_source_div = EXTERNAL_IRQ_CLOCK_SOURCE_DIV_64, .p_context = NULL, .p_extend = NULL, .ipl = (${i.priority}), .irq = ${vec('ICU_IRQ'+i.channel)} };`,
  `const external_irq_instance_t ${i.name} = { .p_ctrl = &${i.name}_ctrl, .p_cfg = &${i.name}_cfg, .p_api = NULL };`,`void ${i.callback}(external_irq_callback_args_t * p_args);`);
 for(const u of uarts){const v=k=>vec(`SCI${u.channel}_${k}`);out.push(`sci_uart_instance_ctrl_t ${u.name}_ctrl;`,`const sci_uart_extended_cfg_t ${u.name}_cfg_extend = { .clock = 0, .rx_edge_start = 1, .noise_cancel = 0, .rx_fifo_trigger = 0xF, .flow_control = 0 };`,
  `const uart_cfg_t ${u.name}_cfg = { .channel = ${u.channel}, .data_bits = UART_DATA_BITS_8, .parity = UART_PARITY_OFF, .stop_bits = UART_STOP_BITS_1, .p_context = NULL, .p_extend = &${u.name}_cfg_extend, .rxi_ipl = (${u.priority}), .txi_ipl = (${u.priority}), .tei_ipl = (${u.priority}), .eri_ipl = (${u.priority}), .rxi_irq = ${v('RXI')}, .txi_irq = ${v('TXI')}, .tei_irq = ${v('TEI')}, .eri_irq = ${v('ERI')} };`,
  `const uart_instance_t ${u.name} = { .p_ctrl = &${u.name}_ctrl, .p_cfg = &${u.name}_cfg, .p_api = NULL };`,`void ${u.callback}(uart_callback_args_t * p_args);`);}
 const timer=(t,kind,ctrl,mode,duty,irq)=>out.push(`${ctrl} ${t.name}_ctrl;`,`const timer_cfg_t ${t.name}_cfg = { .mode = ${mode}, .period_counts = (uint32_t) ${hex(t.counts.counts,1)}, .duty_cycle_counts = ${hex(duty,1)}, .source_div = (timer_source_div_t) ${t.counts.div}, .channel = ${t.channel}, .p_context = NULL, .p_extend = NULL, .cycle_end_ipl = ${ipl(t.callback,t.priority)}, .cycle_end_irq = ${t.callback?vec(irq):'FSP_INVALID_VECTOR'} };`,
  `const timer_instance_t ${t.name} = { .p_ctrl = &${t.name}_ctrl, .p_cfg = &${t.name}_cfg, .p_api = NULL };`,...(t.callback?[`void ${t.callback}(timer_callback_args_t * p_args);`]:[]));
 for(const t of gpts)timer(t,'gpt','gpt_instance_ctrl_t',t.mode==='PWM'?'TIMER_MODE_PWM':'TIMER_MODE_PERIODIC',t.counts.duty,`GPT${t.channel}_COUNTER_OVERFLOW`);
 for(const t of agts)timer(t,'agt','agt_instance_ctrl_t','TIMER_MODE_PERIODIC',Math.floor(t.counts.counts/2),`AGT${t.channel}_INT`);
 if(adc)out.push('adc_instance_ctrl_t g_adc0_ctrl;',`const adc_cfg_t g_adc0_cfg = { .unit = 0, .mode = ${adc.mode==='CONTINUOUS'?'ADC_MODE_CONTINUOUS_SCAN':'ADC_MODE_SINGLE_SCAN'}, .resolution = ADC_RESOLUTION_${adc.resolution}_BIT, .alignment = ADC_ALIGNMENT_RIGHT, .trigger = 0xF, .p_context = NULL, .p_extend = NULL, .scan_end_irq = ${adc.callback?vec('ADC0_SCAN_END'):'FSP_INVALID_VECTOR'}, .scan_end_ipl = ${ipl(adc.callback,adc.priority)} };`,
  `const adc_channel_cfg_t g_adc0_channel_cfg = { .scan_mask = ${adc.channels.map(c=>'ADC_MASK_CHANNEL_'+c).join(' | ')} | 0, .scan_mask_group_b = 0, .add_mask = 0, .sample_hold_mask = 0, .sample_hold_states = 24 };`,
  'const adc_instance_t g_adc0 = { .p_ctrl = &g_adc0_ctrl, .p_cfg = &g_adc0_cfg, .p_channel_cfg = &g_adc0_channel_cfg, .p_api = NULL };',...(adc.callback?[`void ${adc.callback}(adc_callback_args_t * p_args);`]:[]));
 for(const t of iics){const v=k=>vec(`IIC${t.channel}_${k}`);out.push(`iic_master_instance_ctrl_t ${t.name}_ctrl;`,`const i2c_master_cfg_t ${t.name}_cfg = { .channel = ${t.channel}, .rate = I2C_MASTER_RATE_${t.rate}, .slave = ${hex(t.slave,2)}, .addr_mode = I2C_MASTER_ADDR_MODE_7BIT, .p_context = NULL, .p_extend = NULL, .ipl = (${t.priority}), .rxi_irq = ${v('RXI')}, .txi_irq = ${v('TXI')}, .tei_irq = ${v('TEI')}, .eri_irq = ${v('ERI')} };`,
  `const i2c_master_instance_t ${t.name} = { .p_ctrl = &${t.name}_ctrl, .p_cfg = &${t.name}_cfg, .p_api = NULL };`,`void ${t.callback}(i2c_master_callback_args_t * p_args);`);}
 out.push('void hal_entry(void);','void g_hal_init(void);','void g_common_init(void);','void BSP_PinConfigSecurityInit(void);','#endif');
 return out.join('\n')+'\n';
}

// Replaces FSP_ALIASES in C text, leaving string and character literals and comments as they are.
function substitute(text){
 if(typeof text!=='string')return text;let out='',i=0;
 while(i<text.length){
  const c=text[i];
  if(c==='"'||c==="'"){let j=i+1;while(j<text.length&&text[j]!==c&&text[j]!=='\n'){if(text[j]==='\\')j++;j++;}out+=text.slice(i,j+1);i=j+1;continue;}
  if(c==='/'&&text[i+1]==='/'){const j=text.indexOf('\n',i);const end=j<0?text.length:j;out+=text.slice(i,end);i=end;continue;}
  if(c==='/'&&text[i+1]==='*'){const j=text.indexOf('*/',i+2);const end=j<0?text.length:j+2;out+=text.slice(i,end);i=end;continue;}
  const id=/^[A-Za-z_]\w*/.exec(text.slice(i,i+80));
  if(id){out+=Object.hasOwn(FSP_ALIASES,id[0])?FSP_ALIASES[id[0]]:id[0];i+=id[0].length;continue;}
  out+=c;i++;
 }
 return out;
}

/** An FSP project (src/hal_entry.c as `source`, its other sources as `files`) as an interpreter program. */
export function compileFsp(source,files=[],mcu){
 const config=validateRaMcu(mcu),prelude=fspPrelude(config),virtual=Object.fromEntries(FSP_HEADERS.map(name=>[name,prelude]));
 const own=(files||[]).filter(f=>!FSP_FILE.test(f?.name||'')).map(f=>({...f,text:substitute(f.text)}));
 const prepared=prepareHalSource(substitute(source),own,{withMap:true,headers:C_HEADERS,defines:[],virtual});
 let program;
 try{program=compile(prepared.text,{hal:true,entry:'hal_entry',sourceMap:prepared.sourceMap});}
 catch(error){if(!error.location){const m=/^(\d+)행:/.exec(error.message);if(m){error.location=prepared.sourceMap[Number(m[1])-1];if(error.location)error.message=error.message.replace(/^\d+행:/,`${error.location.file}:${error.location.line}:`);}}throw error;}
 if(program.functions.main){const loc=program.functions.main.loc,error=new Error(`${loc?.file??'main.c'}:${loc?.line??1}: FSP 프로젝트의 main()은 ra_gen/main.c가 만듭니다. 프로그램은 hal_entry()에 쓰세요.`);error.location=loc;throw error;}
 const prelude_=new Set(FSP_HEADERS),declared=new Set();program.preludeNames=new Set();
 for(const s of program.globals)for(const d of s.declarations||[]){declared.add(d.name);if(prelude_.has(s.loc?.file))program.preludeNames.add(d.name);}
 // Peripheral register blocks the code reaches (R_PORT4->PODR): names here, so the access stops with the reason.
 program.registers=[...new Set([...prepared.text.matchAll(/\b(R_[A-Z][A-Z0-9_]*)\s*->/g)].map(m=>m[1]))].filter(n=>!declared.has(n)&&!program.functions[n]);
 program.fsp=true;
 // FSP start-up (bsp startup + ra_gen/main.c): R_BSP_WarmStart at reset, after the clocks and after the C runtime,
 // then hal_entry().
 program.entry=[0,1,2].map(event=>({name:'R_BSP_WarmStart',args:[event],optional:true})).concat({name:'hal_entry'});
 return program;
}
/** Constants the session declares for an FSP program (its register block names). */
export const fspConstants=program=>Object.fromEntries((program.registers||[]).map(n=>[n,n]));

const FSP={SUCCESS:0,ASSERTION:1,INVALID_ARGUMENT:3,NOT_OPEN:7,IN_USE:8,ALREADY_OPEN:14};
const KINDS={ioport:[/^g_ioport_ctrl$/,'g_ioport_ctrl'],icu:[/^g_external_irq(\d+)_ctrl$/,'g_external_irq1_ctrl'],uart:[/^g_uart(\d+)_ctrl$/,'g_uart9_ctrl'],gpt:[/^g_timer(\d+)_ctrl$/,'g_timer1_ctrl'],agt:[/^g_agt(\d+)_ctrl$/,'g_agt0_ctrl'],adc:[/^g_adc(\d+)_ctrl$/,'g_adc0_ctrl'],iic:[/^g_i2c_master(\d+)_ctrl$/,'g_i2c_master0_ctrl']};
const SUPPORTED='R_IOPORT_*, R_BSP_SoftwareDelay · R_BSP_Pin*, R_ICU_ExternalIrq*, R_SCI_UART_*, R_GPT_*, R_AGT_*, R_ADC_*, R_IIC_MASTER_*';
const int=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return value;};
const isIterator=v=>v&&typeof v.next==='function';

export class FspAdapter {
 constructor(mcu,buses,{session}={}){
  this.config=validateRaMcu(mcu);this.buses=buses;this.session=session;this.inst=raInstances(this.config);
  this.pclkd=raClockHz(this.config);this.pclkb=raClockHz(this.config,'pclkb');
  this.pending=[];this.active=[];this.seq=0;this.dispatched=0;this.serials=new Map();this.states=new Map();this.peripheralPins=new Set();this.warned=new Set();this.names=null;this.activeIic=null;
 }
 inheritReset(){}
 declareGlobals(){}
 update(){}
 warnOnce(r,key,message){if(this.warned.has(key))return;this.warned.add(key);r.warn(message);}
 pinOf(signal){return Object.keys(this.config.pins).find(p=>this.config.pins[p].signal===signal)??null;}
 // The instance a control-structure pointer names (&g_uart9_ctrl, g_uart9.p_ctrl): its global's name tells which.
 instance(ptr,r,fn,kind){
  let cell;try{cell=r.pointerCell(ptr);}catch{cell=null;}
  let name=cell&&this.names?.get(cell);if(cell&&name===undefined){this.names=new Map(Object.entries(r.globals.cells).map(([k,c])=>[c,k]));name=this.names.get(cell);}
  const [re,example]=KINDS[kind],m=name&&re.exec(name);if(!m)throw new Error(`${fn}: 첫 인수로 인스턴스의 제어 구조체 주소(&${example} 등)를 넘기세요.`);
  if(!this.states.has(name))this.states.set(name,{open:false,name,channel:m[1]===undefined?null:Number(m[1])});return this.states.get(name);
 }
 struct(ptr,r,type,fn){let v;try{v=r.get(r.pointerCell(ptr));}catch{v=null;}if(v?.kind!=='struct'||type&&v.type!==type)throw new Error(`${fn}: ${type} 구조체의 주소가 필요합니다.`);return v;}
 out(ptr,r,value,fn){try{r.set(r.pointerCell(ptr),value);}catch(error){throw new Error(`${fn}: 결과를 받을 변수의 주소를 넘기세요 (${error.message})`);}}
 setField(v,key,value,r){if(Object.hasOwn(v.fields,key))r.set(v.fields[key],value);}
 bytes(buffer,count,r,fn){int(count,0,256,`${fn} 길이`);if(typeof buffer==='string')return Array.from({length:count},(_,i)=>buffer.charCodeAt(i)&255);return Array.from({length:count},(_,i)=>Number(r.get(r.pointerCell(buffer,i)))&255);}
 pin(value,fn){
  const v=Number(value),name=`P${v>>8}${pad(v&0xff)}`;
  if(!Number.isInteger(v)||v<0||(v&0xff)>15||!RA6E1_PORTS.includes(name))throw new Error(`${fn}: R7FA6E10F2CFP에 없는 핀입니다 (${Number.isInteger(v)?hex(v):String(value)}). BSP_IO_PORT_04_PIN_08 같은 핀 이름이나 Pins의 핀 이름(심볼)을 쓰세요.`);
  return name;
 }
 // ---- interrupts: one pending job per source, taken by priority (RA6E1 NVIC: 4 bits, no sub-priority).
 queue(r,irq,prio,run,name,key=irq){
  if(this.pending.some(j=>j.key===key))return;this.pending.push({irq,prio,run,name,key,order:this.seq++});
  if(this.pending.length>256)throw new Error('FSP 인터럽트 대기열 한도를 넘었습니다.');r.event(r.microTime/1000,()=>{});
 }
 exec(r){if(!r.interruptsEnabled)return -1;let p=Infinity;for(const a of this.active)p=Math.min(p,a.prio);return p;}
 preempt(r){if(!this.pending.length||r.atomic)return false;const e=this.exec(r);return this.pending.some(j=>j.prio<e);}
 dispatch(r,job){
  const entry={prio:job.prio,irq:job.irq};this.active.push(entry);this.dispatched++;
  const body=(function*(){const it=job.run();if(isIterator(it))yield* it;})();
  return r.enterIsr(body,{irq:job.irq,name:job.name,exit:()=>{const k=this.active.lastIndexOf(entry);if(k>=0)this.active.splice(k,1);}});
 }
 poll(r){
  this.runtime=r;for(const ch of this.serials.values())this.pollUart(ch,r);
  if(r.atomic)return;
  const batch=new Set(this.pending);
  while(true){
   const e=this.exec(r);let next=null;for(const j of this.pending)if(batch.has(j)&&j.prio<e&&(!next||j.prio<next.prio||j.prio===next.prio&&j.order<next.order))next=j;
   if(!next)break;batch.delete(next);this.pending.splice(this.pending.indexOf(next),1);
   if(this.dispatch(r,next)==='paused')break;
  }
 }
 // A user callback with its FSP argument structure, as the driver's ISR calls it. Without the function (a Stacks
 // callback the code does not define) the interrupt does nothing: the ARM GCC build stops at the link instead.
 *callback(r,fn,type,fields){
  if(!fn)return;if(!r.program.functions[fn]){this.warnOnce(r,'cb:'+fn,`[FSP] 콜백 ${fn}()이 hal_entry.c에 없어 인터럽트에서 부르지 않습니다. ARM GCC 빌드에서는 링크 오류(undefined reference)가 납니다.`);return;}
  const value=r.defaultValue(type,r.globals);for(const [k,v]of Object.entries(fields))if(Object.hasOwn(value.fields,k))value.fields[k].value=v;
  yield* r.invoke(fn,[{kind:'pointer',cell:{value,owner:r.globals,constant:false,dataType:type}}]);
 }
 invoke(name,args,r){
  this.runtime=r;
  // The project's own function of that name comes first (as the linker takes it over FSP's weak one).
  if(r.program.functions[name])return null;
  if(name==='R_BSP_SoftwareDelay')return this.softwareDelay(args,r);
  if(name==='__WFI'||name==='__WFE')return this.wfi(r);
  if(name==='NVIC_SystemReset')return (function*(){r.warn('[NVIC] 시스템 리셋: 프로그램을 처음부터 다시 실행합니다.');yield {kind:'reset'};})();
  if((name==='printf'||name==='puts'||name==='putchar')&&!this.inStdio&&this.stdoutHook(r))return this.stdout(name,args,r);
  if(name==='fflush')return this.stdout(name,args,r);
  if(name==='setvbuf'){this.unbuffered=args[2]===2;return (function*(){return 0;})();}
  if(name==='scanf'||name==='getchar')return this.stdin(name,args,r);
  return null;
 }
 // R_BSP_SoftwareDelay counts CPU cycles: the program waits there (interrupts still run).
 *softwareDelay([delay,units],r){
  if(!Number.isInteger(delay)||delay<0)throw new Error('R_BSP_SoftwareDelay: 지연 값은 0 이상의 정수입니다.');
  if(![1,1000,1000000].includes(units))throw new Error('R_BSP_SoftwareDelay: 단위는 BSP_DELAY_UNITS_MICROSECONDS · MILLISECONDS · SECONDS입니다.');
  const ms=delay*units/1000;if(ms>3600000)throw new Error('R_BSP_SoftwareDelay: 한 번에 1시간까지 기다릴 수 있습니다.');
  if(r.atomic)throw new Error('R_BSP_SoftwareDelay: 이 위치에서는 기다릴 수 없습니다.');
  yield Math.max(.001,ms);return 0;
 }
 // __WFI: the core sleeps until an interrupt is taken.
 *wfi(r){if(r.inIsr)return 0;const seen=this.dispatched;while(this.dispatched===seen)yield .1;return 0;}
 call(name,args,r){
  this.runtime=r;const [a,b,c,d]=args;
  const handler=Object.hasOwn(HANDLERS,name)?HANDLERS[name]:null;if(handler)return handler.call(this,args,r,name);
  if(name==='UNUSED'||name==='assert_param'||['__NOP','__DSB','__ISB','__DMB','g_hal_init','g_common_init','BSP_PinConfigSecurityInit','R_BSP_PinCfgSecurityInit'].includes(name))return 0;
  if(name==='assert'){if(!a)throw new Error('assert 실패: 조건이 거짓입니다.');return 0;}
  if(name==='__disable_irq'){r.interruptsEnabled=false;return 0;}if(name==='__enable_irq'){r.interruptsEnabled=true;return 0;}
  if(name==='__set_PRIMASK'){r.interruptsEnabled=!(a&1);return 0;}if(name==='__get_PRIMASK')return r.interruptsEnabled?0:1;
  if(name==='strlen')return r.format([a]).length;
  if(name==='atoi'||name==='atol'){const m=/^\s*[+-]?\d+/.exec(r.format([a]));return m?Number(m[0])|0:0;}
  if(name==='srand'){this.randState=a>>>0;return 0;}
  if(name==='rand'){this.randState=(Math.imul(this.randState??1,1103515245)+12345)>>>0;return (this.randState>>>16)&0x7fff;}
  const text=stringCall(name,args,r);if(text!==undefined)return text;
  // Without a _write of its own, printf output goes to the console (as the STM32 interpreter does).
  if(name==='printf'){const out=formatPrintf(args,r);if(out)r.api.print(out.replace(/\r?\n$/,''));return out.length;}
  if(name==='puts'){const out=r.format([a]);r.api.print(out);return out.length+1;}
  if(name==='putchar'){const ch=String.fromCharCode(a&255);if(ch==='\n'){r.api.print((this.putLine||'').replace(/\r$/,''));this.putLine='';}else this.putLine=(this.putLine||'')+ch;return a&255;}
  if(/^R_[A-Z]/.test(name))throw new Error(`지원하지 않는 FSP API: ${name} — 내장 해석기는 ${SUPPORTED}를 실행합니다. 다른 FSP 기능은 시뮬레이터 실행 방식을 ARM GCC 빌드로 바꿔 실행하세요.`);
  void b;void c;void d;return undefined;
 }
 // ---- I/O ports
 applyPinCfg(r,pin,word,fn){
  const p=this.config.pins[pin];r.pwm.delete(pin);this.peripheralPins.delete(pin);
  if(word&0x10000){this.peripheralPins.add(pin);
   // A GPT output pin drives its stop level (low) until the timer starts; SCI and IIC pins are set up by their Open.
   if(/^GPT\d_GTIOC[AB]$/.test(p?.signal||'')){r.call('pinMode',[pin,'OUTPUT']);r.call('digitalWrite',[pin,0]);}
   else if(!p)this.warnOnce(r,'periph:'+pin,`${fn}: ${pin}을 주변장치 핀으로 정했지만 Pins에 그 신호가 없어 내장 해석기는 이 핀을 움직이지 않습니다.`);
  }
  else if(word&0x8000)r.setPinMode(pin,'ANALOG');
  else if(word&0x4){r.call('pinMode',[pin,'OUTPUT']);r.gpio[pin].openDrain=!!(word&0x40);r.call('digitalWrite',[pin,word&1]);}
  else r.call('pinMode',[pin,word&0x10?'INPUT_PULLUP':'INPUT']);
 }
 pinsCfg(r,cfgPtr,fn){
  const cfg=this.struct(cfgPtr,r,'ioport_cfg_t',fn),n=Number(cfg.fields.number_of_pins.value),data=cfg.fields.p_pin_cfg_data.value;
  for(let i=0;i<n;i++){const e=r.get(r.pointerCell(data,i));this.applyPinCfg(r,this.pin(e.fields.pin.value,fn),Number(e.fields.pin_cfg.value)>>>0,fn);}
 }
 pinWrite(r,pin,level,fn){
  const g=r.gpio[pin];
  if(g?.mode==='OUTPUT'&&!this.peripheralPins.has(pin)){r.pwm.delete(pin);r.call('digitalWrite',[pin,level?1:0]);return 0;}
  // The port's output latch takes the level, but a pin that is not an output does not show it (as on the board).
  if(!this.peripheralPins.has(pin))this.warnOnce(r,'w:'+pin,`${fn}: ${pin}이 출력이 아니라 핀에 나타나지 않습니다. Pins에서 GPIO 출력(Output)으로 정하고 R_IOPORT_Open을 먼저 호출하세요(보통 R_BSP_WarmStart의 BSP_WARM_START_POST_C에서).`);
  return 0;
 }
 ioport(args,r,fn){const st=this.instance(args[0],r,fn,'ioport');if(!st.open){this.warnOnce(r,'ioport-open',`${fn}: g_ioport_ctrl이 열리지 않아 FSP_ERR_NOT_OPEN을 돌려줍니다. R_IOPORT_Open(&g_ioport_ctrl, &g_bsp_pin_cfg)을 먼저 호출하세요(보통 R_BSP_WarmStart의 BSP_WARM_START_POST_C에서).`);return null;}return st;}
 // ---- ICU external interrupts on the IRQn pins
 icuPin(ch){return Object.keys(this.config.pins).find(p=>this.config.pins[p].function==='IRQ'&&RA_IRQ_PINS[p]===ch)??null;}
 // ---- SCI UART: each channel has its own UART line (BusDevices) to the circuit, like the HAL's extra USARTs.
 uartChannel(ch){
  const id='SCI'+ch;
  if(!this.serials.has(id)){const bus=new BusDevices(this.buses.project,this.buses.getResult,this.buses.trace);bus.uart.instance=id;bus.received=this.buses.received;bus.signals=this.buses.signals;bus.noise=this.buses.noise;bus.peers=(...x)=>this.buses.peers?.(...x);bus.wireless=this.buses.wireless;this.serials.set(id,{id,channel:ch,bus,st:null,rx:null,txFree:0});}
  return this.serials.get(id);
 }
 pollUart(ch,r){
  const st=ch.st;if(!st?.open)return;const u=ch.bus.uart;
  while(ch.bus.call('Serial1.available',[],r)>0){
   const item=u.queue.find(x=>x.at<=r.microTime+1e-6),raw=ch.bus.call('Serial1.read',[],r);if(raw<0)break;
   const f=ch.bus.uartRx(raw,item.at-1e7/u.baud),value=f.value;r.api.uart?.({instance:ch.id,direction:'RX',bytes:[value],micros:r.microTime});
   const errors=(f.pe?8:0)|(f.fe?16:0);
   if(errors){this.uartEvent(r,ch,errors,value,'eri');continue;}
   if(ch.rx){r.set(r.pointerCell(ch.rx.buffer,ch.rx.index++),value);if(ch.rx.index===ch.rx.count){ch.rx=null;this.uartEvent(r,ch,1,0,'rxi');}}
   else this.uartEvent(r,ch,4,value,'rxi');
  }
 }
 uartEvent(r,ch,event,data,isr){const st=ch.st;if(!st?.callback)return;this.queue(r,`SCI${ch.channel}_${isr.toUpperCase()}`,st.ipl,()=>this.callback(r,st.callback,'uart_callback_args_t',{channel:ch.channel,event,data}),`sci_uart_${isr}_isr`,`SCI${ch.channel}:${isr}:${this.seq}`);}
 // ---- timers: GPT (saw-wave PWM, periodic) and AGT (periodic); a cycle end every period while counting.
 timerOpen(r,args,fn,kind){
  const st=this.instance(args[0],r,fn,kind);if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(args[1],r,'timer_cfg_t',fn),f=k=>Number(cfg.fields[k].value);
  const t=(kind==='gpt'?this.inst.gpts:this.inst.agts).find(x=>x.channel===st.channel);
  const source=kind==='gpt'?this.pclkd:t?.counts.source==='LOCO'?32768:this.pclkb;
  Object.assign(st,{open:true,kind,running:false,mode:f('mode'),period:f('period_counts')>>>0,duty:[f('duty_cycle_counts')>>>0,f('duty_cycle_counts')>>>0],hz:source/2**f('source_div'),ipl:f('cycle_end_ipl'),callback:f('cycle_end_ipl')===0xFF?'':t?.callback||'',counter:0,gen:(st.gen||0)+1,
   pins:kind==='gpt'?[this.pinOf(`GPT${st.channel}_GTIOCA`),this.pinOf(`GPT${st.channel}_GTIOCB`)]:[]});
  if(!(st.period>0))throw new Error(`${fn}: period_counts는 1 이상입니다.`);
  return FSP.SUCCESS;
 }
 periodUs(st){return st.period/st.hz*1e6;}
 timerStart(r,st){
  st.running=true;st.gen++;const gen=st.gen;st.next=r.microTime+this.periodUs(st)*(1-st.counter/st.period);st.counter=0;
  const fire=()=>{if(st.gen!==gen||!st.running)return;st.last=st.next;
   if(st.callback)this.queue(r,st.kind==='gpt'?`GPT${st.channel}_COUNTER_OVERFLOW`:`AGT${st.channel}_INT`,st.ipl,()=>this.callback(r,st.callback,'timer_callback_args_t',{event:0}),st.kind==='gpt'?'gpt_counter_overflow_isr':'agt_int_isr');
   if(st.mode===1){st.running=false;this.pwm(r,st);return;}
   st.next+=this.periodUs(st);r.event(st.next/1000,fire);};
  st.last=r.microTime;r.event(st.next/1000,fire);this.pwm(r,st);
 }
 timerStop(r,st){if(st.running)st.counter=this.counter(r,st);st.running=false;st.gen++;this.pwm(r,st);}
 counter(r,st){if(!st.running)return st.counter;const c=Math.floor((r.microTime-(st.next-this.periodUs(st)))*st.hz/1e6);return Math.max(0,Math.min(st.period-1,c));}
 // Saw-wave PWM on the GTIOC pins: high from the cycle start for duty counts (0 % low, 100 % high), the stop level
 // (low) while stopped. With the waveform option on, the pin toggles edge by edge as analogWrite does.
 pwm(r,st){
  if(st.kind!=='gpt'||st.mode!==2)return;
  st.pins.forEach((pin,i)=>{
   if(!pin)return;if(r.gpio[pin]?.mode!=='OUTPUT'){this.warnOnce(r,'gtioc:'+pin,`${pin}: GPT${st.channel} 출력 핀이 아직 설정되지 않았습니다. R_IOPORT_Open으로 Pins 설정을 먼저 적용하세요.`);return;}
   const frac=st.running?Math.max(0,Math.min(1,st.duty[i]/st.period)):0,hz=st.hz/st.period;r.pwm.delete(pin);
   if(frac<=0||frac>=1||!r.api.pwmEnabled||hz>2000){r.output(pin,3.3*frac,frac>0&&frac<1?{duty:frac,frequency:hz}:null);return;}
   const period=1000/hz,state={high:true};r.pwm.set(pin,state);r.output(pin,3.3);
   const edge=()=>{if(r.pwm.get(pin)!==state)return;state.high=!state.high;r.output(pin,state.high?3.3:0);r.event(r.microTime/1000+period*(state.high?frac:1-frac),edge);};r.event(r.microTime/1000+period*frac,edge);
  });
 }
 timerInfo(args,r,fn,kind){const st=this.instance(args[0],r,fn,kind);if(!st.open)return FSP.NOT_OPEN;const v=this.struct(args[1],r,'timer_info_t',fn);this.setField(v,'count_direction',kind==='gpt'?1:0,r);this.setField(v,'clock_frequency',Math.round(st.hz),r);this.setField(v,'period_counts',st.period,r);return FSP.SUCCESS;}
 timerStatus(args,r,fn,kind){const st=this.instance(args[0],r,fn,kind);if(!st.open)return FSP.NOT_OPEN;const v=this.struct(args[1],r,'timer_status_t',fn),c=this.counter(r,st);this.setField(v,'counter',kind==='agt'?st.period-1-c:c,r);this.setField(v,'state',st.running?1:0,r);return FSP.SUCCESS;}
 // ---- ADC12 unit 0
 adcPin(ch,fn){const pin=Object.keys(RA_ADC_CHANNELS).find(p=>RA_ADC_CHANNELS[p]===ch);if(!pin||this.config.pins[pin]?.function!=='Analog')throw new Error(`${fn}: ADC_CHANNEL_${ch}${pin?` (${pin})`:''}을 쓰려면 Pins에서 그 AN 핀을 Analog로 정하세요.`);return pin;}
 adcSample(r,st,ch){const pin=this.adcPin(ch,'R_ADC_Read'),max=2**st.bits-1,v=Number(r.api.voltage?.(pin)??0);return Math.round(Math.max(0,Math.min(3.3,Number.isFinite(v)?v:0))/3.3*max);}
 // ---- IIC master: the circuit's I²C engine, moved to this channel's pins and speed for each transfer.
 iicSelect(r,st){if(this.activeIic===st.name)return;this.activeIic=st.name;this.buses.i2cId='IIC'+st.channel;this.buses.call('Wire.begin',[st.sda,st.scl],r);this.buses.call('Wire.setClock',[st.rate],r);for(const p of [st.sda,st.scl])if(r.gpio[p])r.gpio[p].openDrain=true;}
 iicDone(r,st,event){st.busy=true;this.queue(r,`IIC${st.channel}_TEI`,st.ipl,()=>{st.busy=false;return this.callback(r,st.callback,'i2c_master_callback_args_t',{event});},event===1?'iic_master_eri_isr':'iic_master_tei_isr',`IIC${st.channel}:${this.seq}`);}
}
for(const k of ['stdoutHook','stdout','flushStdout','stdinChar','stdin'])FspAdapter.prototype[k]=HalAdapter.prototype[k];

// FSP API calls, by name: (args, runtime, name) with `this` the adapter. They return fsp_err_t (or the value of an
// R_BSP_Pin* read) like the driver does with parameter checking on (BSP_CFG_PARAM_CHECKING_ENABLE 1).
const HANDLERS={
 R_IOPORT_Open([ctrl,cfg],r,fn){const st=this.instance(ctrl,r,fn,'ioport');if(st.open)return FSP.ALREADY_OPEN;this.pinsCfg(r,cfg,fn);st.open=true;return FSP.SUCCESS;},
 R_IOPORT_Close(args,r,fn){const st=this.instance(args[0],r,fn,'ioport');if(!st.open)return FSP.NOT_OPEN;st.open=false;return FSP.SUCCESS;},
 R_IOPORT_PinsCfg(args,r,fn){if(!this.ioport(args,r,fn))return FSP.NOT_OPEN;this.pinsCfg(r,args[1],fn);return FSP.SUCCESS;},
 R_IOPORT_PinCfg(args,r,fn){if(!this.ioport(args,r,fn))return FSP.NOT_OPEN;this.applyPinCfg(r,this.pin(args[1],fn),Number(args[2])>>>0,fn);return FSP.SUCCESS;},
 R_IOPORT_PinWrite(args,r,fn){if(!this.ioport(args,r,fn))return FSP.NOT_OPEN;const level=int(args[2],0,1,`${fn} 레벨(BSP_IO_LEVEL_LOW/HIGH)`);return this.pinWrite(r,this.pin(args[1],fn),level,fn);},
 R_IOPORT_PinRead(args,r,fn){if(!this.ioport(args,r,fn))return FSP.NOT_OPEN;this.out(args[2],r,r.call('digitalRead',[this.pin(args[1],fn)]),fn);return FSP.SUCCESS;},
 R_IOPORT_PortRead(args,r,fn){if(!this.ioport(args,r,fn))return FSP.NOT_OPEN;const port=int(Number(args[1])>>8,0,9,`${fn} 포트`);let value=0;for(let bit=0;bit<16;bit++){const pin=`P${port}${pad(bit)}`;if(RA6E1_PORTS.includes(pin)&&r.call('digitalRead',[pin]))value|=1<<bit;}this.out(args[2],r,value,fn);return FSP.SUCCESS;},
 R_IOPORT_PortWrite(args,r,fn){if(!this.ioport(args,r,fn))return FSP.NOT_OPEN;const port=int(Number(args[1])>>8,0,9,`${fn} 포트`),value=Number(args[2]),mask=Number(args[3]);for(let bit=0;bit<16;bit++){const pin=`P${port}${pad(bit)}`;if(mask&(1<<bit)&&RA6E1_PORTS.includes(pin))this.pinWrite(r,pin,(value>>bit)&1,fn);}return FSP.SUCCESS;},
 R_BSP_PinAccessEnable(){return 0;},R_BSP_PinAccessDisable(){return 0;},R_BSP_IrqStatusClear(){return 0;},
 R_BSP_PinWrite(args,r,fn){this.pinWrite(r,this.pin(args[0],fn),args[1]?1:0,fn);return 0;},
 R_BSP_PinRead(args,r,fn){return r.call('digitalRead',[this.pin(args[0],fn)]);},
 R_BSP_PinCfg(args,r,fn){this.applyPinCfg(r,this.pin(args[0],fn),Number(args[1])>>>0,fn);return 0;},
 R_ICU_ExternalIrqOpen([ctrl,cfgPtr],r,fn){
  const st=this.instance(ctrl,r,fn,'icu');if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(cfgPtr,r,'external_irq_cfg_t',fn),pin=this.icuPin(st.channel);
  if(!pin)throw new Error(`${fn}: IRQ${st.channel} 핀이 Pins에 없습니다.`);
  const trigger=Number(cfg.fields.trigger.value),mode=['FALLING','RISING','CHANGE','FALLING','RISING'][trigger]??'FALLING';
  if(trigger>=3)this.warnOnce(r,'level:'+pin,`${fn}: 내장 해석기는 레벨 트리거(LOW/HIGH)를 같은 쪽 엣지로 처리합니다.`);
  Object.assign(st,{open:true,enabled:false,pin,ipl:Number(cfg.fields.ipl.value),callback:this.inst.irqs.find(i=>i.channel===st.channel)?.callback||''});
  r.interrupts.set(pin,{mode,previous:r.inputLevel(pin),pending:false,callback:{host:()=>{if(st.open&&st.enabled)this.queue(r,'ICU_IRQ'+st.channel,st.ipl,()=>this.callback(r,st.callback,'external_irq_callback_args_t',{channel:st.channel}),'r_icu_isr');}}});
  return FSP.SUCCESS;
 },
 R_ICU_ExternalIrqEnable(args,r,fn){const st=this.instance(args[0],r,fn,'icu');if(!st.open)return FSP.NOT_OPEN;st.enabled=true;return FSP.SUCCESS;},
 R_ICU_ExternalIrqDisable(args,r,fn){const st=this.instance(args[0],r,fn,'icu');if(!st.open)return FSP.NOT_OPEN;st.enabled=false;return FSP.SUCCESS;},
 R_ICU_ExternalIrqClose(args,r,fn){const st=this.instance(args[0],r,fn,'icu');if(!st.open)return FSP.NOT_OPEN;st.open=st.enabled=false;r.interrupts.delete(st.pin);return FSP.SUCCESS;},
 R_SCI_UART_Open([ctrl,cfgPtr],r,fn){
  const st=this.instance(ctrl,r,fn,'uart');if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(cfgPtr,r,'uart_cfg_t',fn),id='SCI'+st.channel,p=this.config.peripherals?.[id];
  if(!p?.enabled)throw new Error(`${fn}: Stacks에서 ${id} UART를 켜세요.`);
  if(Number(cfg.fields.data_bits.value)!==2||Number(cfg.fields.parity.value)!==0||Number(cfg.fields.stop_bits.value)!==0)throw new Error(`${fn}: 내장 해석기는 8비트, 패리티 없음, 정지 비트 1(8N1)만 실행합니다. 다른 형식은 ARM GCC 빌드로 실행하세요.`);
  const tx=this.pinOf(id+'_TXD'),rx=this.pinOf(id+'_RXD');if(!tx||!rx)throw new Error(`${fn}: 내장 해석기는 ${id}의 TXD와 RXD 핀을 모두 정한 UART만 실행합니다(Pins).`);
  const ch=this.uartChannel(st.channel);ch.st=st;ch.rx=null;ch.txFree=0;ch.bus.call('Serial1.setPins',[rx,tx],r);ch.bus.call('Serial1.begin',[p.baud],r);
  Object.assign(st,{open:true,ipl:Number(cfg.fields.rxi_ipl.value),callback:p.callback||''});return FSP.SUCCESS;
 },
 R_SCI_UART_Write([ctrl,buffer,count],r,fn){
  const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel),u=ch.bus.uart;
  int(count,1,256,`${fn} 길이(내장 해석기는 한 번에 256바이트까지)`);if(r.microTime<ch.txFree-1e-6)return FSP.IN_USE;
  const bytes=this.bytes(buffer,count,r,fn),frame=1e7/u.baud,start=Math.max(r.microTime,u.lastTx??0);
  ch.bus.call('Serial1.write',[r.array(bytes),bytes.length],r);bytes.forEach((byte,i)=>r.api.uart?.({instance:ch.id,direction:'TX',bytes:[byte],micros:start+i*frame}));
  // TXI takes the last byte into the shift register one frame before the end (TX_DATA_EMPTY, a new Write may start),
  // TEI comes when it has gone out (TX_COMPLETE).
  const end=u.lastTx;ch.txFree=end-frame;
  r.event(ch.txFree/1000,()=>this.uartEvent(r,ch,128,0,'txi'));r.event(end/1000,()=>this.uartEvent(r,ch,2,0,'tei'));return FSP.SUCCESS;
 },
 R_SCI_UART_Read([ctrl,buffer,count],r,fn){const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel);if(ch.rx)return FSP.IN_USE;int(count,1,4096,`${fn} 길이`);r.pointerCell(buffer,count-1);ch.rx={buffer,count,index:0};return FSP.SUCCESS;},
 R_SCI_UART_Abort([ctrl,dir],r,fn){const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel);if(dir&1)ch.rx=null;if(dir&2)ch.txFree=0;return FSP.SUCCESS;},
 R_SCI_UART_InfoGet([ctrl,info],r,fn){const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const v=this.struct(info,r,'uart_info_t',fn);this.setField(v,'write_bytes_max',256,r);this.setField(v,'read_bytes_max',4096,r);return FSP.SUCCESS;},
 R_SCI_UART_Close(args,r,fn){const st=this.instance(args[0],r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel);ch.bus.call('Serial1.end',[],r);ch.rx=null;st.open=false;return FSP.SUCCESS;},
 R_GPT_Open(args,r,fn){return this.timerOpen(r,args,fn,'gpt');},R_AGT_Open(args,r,fn){return this.timerOpen(r,args,fn,'agt');},
 R_GPT_Start(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{if(!st.running)this.timerStart(r,st);});},
 R_AGT_Start(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>{if(!st.running)this.timerStart(r,st);});},
 R_GPT_Stop(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>this.timerStop(r,st));},
 R_AGT_Stop(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>this.timerStop(r,st));},
 R_GPT_Reset(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{st.counter=0;if(st.running){st.running=false;this.timerStart(r,st);}});},
 R_AGT_Reset(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>{st.counter=0;if(st.running){st.running=false;this.timerStart(r,st);}});},
 R_GPT_CounterSet(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{const c=int(Number(args[1])>>>0,0,st.period-1,`${fn} 카운터`);st.counter=c;if(st.running){st.running=false;this.timerStart(r,st);}});},
 R_GPT_PeriodSet(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{st.period=int(Number(args[1])>>>0,1,2**32-1,`${fn} 주기`);this.pwm(r,st);});},
 R_AGT_PeriodSet(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>{st.period=int(Number(args[1])>>>0,1,65536,`${fn} 주기`);});},
 R_GPT_DutyCycleSet([ctrl,counts,pin],r,fn){
  const st=this.instance(ctrl,r,fn,'gpt');if(!st.open)return FSP.NOT_OPEN;const value=Number(counts)>>>0;if(value>st.period)return FSP.INVALID_ARGUMENT;
  const which=int(pin,0,2,`${fn} 핀(GPT_IO_PIN_GTIOCA/B)`);if(which!==1)st.duty[0]=value;if(which!==0)st.duty[1]=value;this.pwm(r,st);return FSP.SUCCESS;
 },
 R_GPT_InfoGet(args,r,fn){return this.timerInfo(args,r,fn,'gpt');},R_AGT_InfoGet(args,r,fn){return this.timerInfo(args,r,fn,'agt');},
 R_GPT_StatusGet(args,r,fn){return this.timerStatus(args,r,fn,'gpt');},R_AGT_StatusGet(args,r,fn){return this.timerStatus(args,r,fn,'agt');},
 R_GPT_Close(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{this.timerStop(r,st);st.open=false;});},
 R_AGT_Close(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>{this.timerStop(r,st);st.open=false;});},
 R_ADC_Open([ctrl,cfgPtr],r,fn){
  const st=this.instance(ctrl,r,fn,'adc');if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(cfgPtr,r,'adc_cfg_t',fn),f=k=>Number(cfg.fields[k].value),bits=[12,10,8][f('resolution')];
  if(!bits)throw new Error(`${fn}: 분해능은 12·10·8비트입니다.`);
  const callback=f('scan_end_ipl')===0xFF?'':this.inst.adc?.callback||'';if(callback&&f('mode')===2)throw new Error(`${fn}: 내장 해석기는 연속 스캔(Continuous Scan)에서 스캔 완료 콜백을 실행하지 않습니다. 콜백을 비우거나 ARM GCC 빌드로 실행하세요.`);
  Object.assign(st,{open:true,mode:f('mode'),bits,ipl:f('scan_end_ipl'),callback,mask:null,running:false,values:new Map()});return FSP.SUCCESS;
 },
 R_ADC_ScanCfg([ctrl,chPtr],r,fn){const st=this.instance(ctrl,r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;const cfg=this.struct(chPtr,r,'adc_channel_cfg_t',fn),mask=Number(cfg.fields.scan_mask.value)>>>0;for(let ch=0;ch<29;ch++)if(mask&(1<<ch))this.adcPin(ch,fn);st.mask=mask;return FSP.SUCCESS;},
 R_ADC_ScanStart(args,r,fn){
  const st=this.instance(args[0],r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;if(st.mask===null)throw new Error(`${fn}: 먼저 R_ADC_ScanCfg(&g_adc0_ctrl, &g_adc0_channel_cfg)로 스캔할 채널을 정하세요.`);
  if(st.running)return FSP.IN_USE;
  for(let ch=0;ch<29;ch++)if(st.mask&(1<<ch))st.values.set(ch,this.adcSample(r,st,ch));
  if(st.mode===2)st.running=true;
  else if(st.callback)this.queue(r,'ADC0_SCAN_END',st.ipl,()=>this.callback(r,st.callback,'adc_callback_args_t',{unit:0,event:0,group_mask:1}),'adc_scan_end_isr');
  return FSP.SUCCESS;
 },
 R_ADC_ScanStop(args,r,fn){const st=this.instance(args[0],r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;st.running=false;return FSP.SUCCESS;},
 R_ADC_StatusGet([ctrl,status],r,fn){const st=this.instance(ctrl,r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;this.setField(this.struct(status,r,'adc_status_t',fn),'state',st.running?1:0,r);return FSP.SUCCESS;},
 R_ADC_Read([ctrl,channel,out],r,fn){
  const st=this.instance(ctrl,r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;const ch=int(channel,0,28,`${fn} 채널`);this.adcPin(ch,fn);
  // Continuous scan keeps converting: the register holds the latest input. A single scan holds what ScanStart took.
  this.out(out,r,st.running&&st.mask&(1<<ch)?this.adcSample(r,st,ch):st.values.get(ch)??0,fn);return FSP.SUCCESS;
 },
 R_ADC_Read32(args,r,fn){return HANDLERS.R_ADC_Read.call(this,args,r,fn);},
 R_ADC_Close(args,r,fn){const st=this.instance(args[0],r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;st.open=st.running=false;return FSP.SUCCESS;},
 R_IIC_MASTER_Open([ctrl,cfgPtr],r,fn){
  const st=this.instance(ctrl,r,fn,'iic');if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(cfgPtr,r,'i2c_master_cfg_t',fn),id='IIC'+st.channel,t=this.inst.iics.find(x=>x.channel===st.channel);
  const scl=this.pinOf(id+'_SCL'),sda=this.pinOf(id+'_SDA');if(!scl||!sda)throw new Error(`${fn}: Pins에서 ${id}의 SCL과 SDA 핀을 정하세요.`);
  if(Number(cfg.fields.addr_mode.value)!==1)throw new Error(`${fn}: 내장 해석기는 7비트 주소만 실행합니다.`);
  Object.assign(st,{open:true,busy:false,scl,sda,rate:Number(cfg.fields.rate.value),slave:Number(cfg.fields.slave.value),ipl:Number(cfg.fields.ipl.value),callback:t?.callback||''});
  this.activeIic=null;this.iicSelect(r,st);return FSP.SUCCESS;
 },
 R_IIC_MASTER_SlaveAddressSet([ctrl,address,mode],r,fn){const st=this.instance(ctrl,r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;if(st.busy)return FSP.IN_USE;if(mode!==1)throw new Error(`${fn}: 내장 해석기는 7비트 주소(I2C_MASTER_ADDR_MODE_7BIT)만 실행합니다.`);st.slave=int(address,0,127,`${fn} 주소`);return FSP.SUCCESS;},
 R_IIC_MASTER_Write([ctrl,buffer,count],r,fn){
  const st=this.instance(ctrl,r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;if(st.busy)return FSP.IN_USE;const bytes=this.bytes(buffer,count,r,fn);
  this.iicSelect(r,st);this.buses.call('Wire.beginTransmission',[st.slave],r);for(const byte of bytes)this.buses.call('Wire.write',[byte],r);
  this.iicDone(r,st,this.buses.call('Wire.endTransmission',[],r)===0?3:1);return FSP.SUCCESS;
 },
 R_IIC_MASTER_Read([ctrl,buffer,count],r,fn){
  const st=this.instance(ctrl,r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;if(st.busy)return FSP.IN_USE;int(count,1,256,`${fn} 길이`);r.pointerCell(buffer,count-1);
  this.iicSelect(r,st);const got=this.buses.call('Wire.requestFrom',[st.slave,count],r);
  if(got===count)for(let i=0;i<count;i++)r.set(r.pointerCell(buffer,i),this.buses.call('Wire.read',[],r));
  this.iicDone(r,st,got===count?2:1);return FSP.SUCCESS;
 },
 R_IIC_MASTER_Abort(args,r,fn){const st=this.instance(args[0],r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;return FSP.SUCCESS;},
 R_IIC_MASTER_Close(args,r,fn){const st=this.instance(args[0],r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;st.open=false;if(this.activeIic===st.name)this.activeIic=null;return FSP.SUCCESS;}
};
function timerCall(args,r,fn,kind,action){const st=this.instance(args[0],r,fn,kind);if(!st.open)return FSP.NOT_OPEN;action(st);return FSP.SUCCESS;}
