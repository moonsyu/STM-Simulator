// Renesas FSP projects (FPB-RA6E1) on the built-in C interpreter, without ARM GCC or FSP installed (feature 42).
// compileFsp() reads src/hal_entry.c with a stand-in for the generated headers (hal_data.h, common_data.h,
// bsp_pin_cfg.h, vector_data.h: the FSP types, enums and the instances RASC writes for the project's Pins and Stacks),
// and FspAdapter runs the FSP calls on the circuit the way session.js runs HAL calls with HalAdapter: R_IOPORT pins,
// R_BSP_SoftwareDelay, R_ICU external interrupts, SCI UART, GPT and AGT timers, ADC12, the IIC master and the SPI masters
// (r_spi, r_sci_spi), each callback from its own interrupt at the Stacks priority. Enum values and struct members follow
// FSP 5.x / 6.x (r_*_api.h).
import {compile} from './parser.js';
import {prepareHalSource} from './hal-source.js';
import {baseName} from './source-files.js';
import {HalAdapter} from './hal.js';
import {BusDevices} from './buses.js';
import {formatPrintf,stringCall} from './hal-stdio.js';
import {validateRaMcu,raClockHz,raPinName,RA6E1_PORTS,RA_ADC_CHANNELS,RA_IRQ_PINS,WDT_DIVISION_CODE,RA_WDT,RA_IWDT_HZ,RA_WDT_WINDOW_START,RA_WDT_WINDOW_END,RA_LPM_WAKE_BITS,RA_LPM_CANCEL_BITS,RA_LPM_WUPEN_MASK,RA_LPM_DPSIER_MASK,RA_LPM_DPSIEGR_MASK,RA_LPM_POWER,raLpmMask,raDsPin} from './ra-config.js';
import {LPM_PROTOCOL,LpmLog,lpmWakeNames,lpmCancelNames,lpmWakeLabel,lpmCancelLabel,lpmIrqLabel,lpmWakeOfIrq,lpmCancelOfIrq,lpmReason,lpmDeepDetail} from './ra-lpm.js';
import {raInstances,raIoName,raVectors,pinCfgWord} from './ra-generator.js';
import {exchangeFrame} from './emu/ra6e1/spi.js';
import {encodeSpiFrames} from './signals.js';
import {Rtc} from './emu/ra6e1/rtc.js';
import {FLASH_TYPES,FLASH_METHODS,FLASH_NAMES,flashPrelude} from './fsp-flash.js';
import {TRANSFER_TYPES,TRANSFER_METHODS,TRANSFER_NAMES,transferPrelude} from './fsp-transfer.js';

// RSTSR1 and RSTSR0 reset-cause flags (R7FA6E10F.h): the registers the interpreter lets the program read (FspAdapter.register).
const RESET_STATUS=[['IWDTRF',0],['WDTRF',1],['SWRF',2]];
const RESET_STATUS0=[['PORF',0],['LVD0RF',1],['LVD1RF',2],['LVD2RF',3],['DPSRSTF',7]];
const RESET_FLAG={IWDT:1,WDT:2,SYSRESETREQ:4};
const pad=n=>String(n).padStart(2,'0');
const hex=(n,w=4)=>'0x'+(n>>>0).toString(16).toUpperCase().padStart(w,'0');
const enumOf=(tag,name,items)=>`typedef enum ${tag}\n{\n${items.map(([k,v])=>`    ${k} = ${v},`).join('\n')}\n} ${name};`;

// Object-like macros of the FSP headers that stand for a name or for nothing; the interpreter's preprocessor keeps
// object-like macros as constants, so these are replaced in the project's text before it (lines stay where they are).
export const FSP_ALIASES=Object.freeze({FSP_CPP_HEADER:'',FSP_CPP_FOOTER:'',FSP_HEADER:'',FSP_FOOTER:'',BSP_CMSE_NONSECURE_ENTRY:'',BSP_DONT_REMOVE:'',
 IOPORT_CFG_CTRL:'g_ioport_ctrl',IOPORT_CFG_NAME:'g_bsp_pin_cfg',IOPORT_CFG_OPEN:'R_IOPORT_Open'});
// FSP and generated headers that resolve to the prelude (it has a guard, so including several is fine); the C
// library headers read as empty.
const FSP_HEADERS=['hal_data.h','common_data.h','bsp_pin_cfg.h','vector_data.h','bsp_api.h','bsp_cfg.h','bsp_clock_cfg.h','board.h','board_cfg.h','fsp_common_api.h','r_ioport.h','r_ioport_api.h','r_icu.h','r_external_irq_api.h','r_sci_uart.h','r_uart_api.h','r_gpt.h','r_timer_api.h','r_agt.h','r_adc.h','r_adc_api.h','r_iic_master.h','r_i2c_master_api.h','r_spi.h','r_sci_spi.h','r_spi_api.h','r_wdt.h','r_iwdt.h','r_wdt_api.h','r_rtc.h','r_rtc_api.h','r_iic_slave.h','r_i2c_slave_api.h','r_lpm.h','r_lpm_api.h','r_flash_hp.h','r_flash_api.h','r_elc.h','r_elc_api.h','r_dtc.h','r_dmac.h','r_transfer_api.h','bsp_io.h','bsp_delay.h','bsp_common.h'];
const C_HEADERS=new Set(['stdint.h','stddef.h','stdbool.h','string.h','stdlib.h','stdio.h','ctype.h','math.h','limits.h','time.h']);
// Generated and FSP source folders of the project tree: built by ARM GCC only (the prelude stands in for them here).
const FSP_FILE=/^(ra|ra_gen|ra_cfg|script)\//;

const TYPES=`typedef int IRQn_Type;
${enumOf('e_fsp_err','fsp_err_t',[['FSP_SUCCESS',0],...['ASSERTION','INVALID_POINTER','INVALID_ARGUMENT','INVALID_CHANNEL','INVALID_MODE','UNSUPPORTED','NOT_OPEN','IN_USE','OUT_OF_MEMORY','HW_LOCKED','IRQ_BSP_DISABLED','OVERFLOW','UNDERFLOW','ALREADY_OPEN','APPROXIMATION','CLAMPED','INVALID_RATE','ABORTED','NOT_ENABLED','TIMEOUT','INVALID_BLOCKS','INVALID_ADDRESS','INVALID_SIZE','WRITE_FAILED','ERASE_FAILED','INVALID_CALL','INVALID_HW_CONDITION','INVALID_FACTORY_FLASH'].map((k,i)=>['FSP_ERR_'+k,i+1]),['FSP_ERR_INVALID_STATE',30],['FSP_ERR_NOT_ERASED',31],['FSP_ERR_PE_FAILURE',500],['FSP_ERR_CMD_LOCKED',501],['FSP_ERR_FCLK',502],['FSP_ERR_INVALID_LINKED_ADDRESS',503],['FSP_ERR_BLANK_CHECK_FAILED',504]])}
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
${enumOf('e_gpt_pin_level','gpt_pin_level_t',[['GPT_PIN_LEVEL_LOW',0],['GPT_PIN_LEVEL_HIGH',1]])}
${enumOf('e_agt_clock','agt_clock_t',[['AGT_CLOCK_PCLKB','0x00'],['AGT_CLOCK_LOCO','0x40'],['AGT_CLOCK_AGT_UNDERFLOW','0x50'],['AGT_CLOCK_SUBCLOCK','0x60']])}
${enumOf('e_adc_mode','adc_mode_t',[['ADC_MODE_SINGLE_SCAN',0],['ADC_MODE_GROUP_SCAN',1],['ADC_MODE_CONTINUOUS_SCAN',2]])}
${enumOf('e_adc_resolution','adc_resolution_t',[['ADC_RESOLUTION_12_BIT',0],['ADC_RESOLUTION_10_BIT',1],['ADC_RESOLUTION_8_BIT',2],['ADC_RESOLUTION_14_BIT',3]])}
${enumOf('e_adc_alignment','adc_alignment_t',[['ADC_ALIGNMENT_RIGHT',0],['ADC_ALIGNMENT_LEFT',1]])}
${enumOf('e_adc_trigger','adc_trigger_t',[['ADC_TRIGGER_SOFTWARE',0],['ADC_TRIGGER_SYNC_ELC',2],['ADC_TRIGGER_ASYNC_EXTERNAL',3]])}
${enumOf('e_adc_event','adc_event_t',['SCAN_COMPLETE','SCAN_COMPLETE_GROUP_B','SCAN_COMPLETE_GROUP_C','CALIBRATION_COMPLETE','CONVERSION_COMPLETE','CALIBRATION_REQUEST','CONVERSION_ERROR','OVERFLOW','LIMIT_CLIP','FIFO_READ_REQUEST','FIFO_OVERFLOW'].map((k,i)=>['ADC_EVENT_'+k,i]))}
${enumOf('e_adc_state','adc_state_t',[['ADC_STATE_IDLE',0],['ADC_STATE_SCAN_IN_PROGRESS',1],['ADC_STATE_CALIBRATION_IN_PROGRESS',2]])}
${enumOf('e_adc_channel','adc_channel_t',[...Array.from({length:29},(_,i)=>['ADC_CHANNEL_'+i,i]),['ADC_CHANNEL_TEMPERATURE',-3],['ADC_CHANNEL_VOLT',-2]])}
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
${enumOf('e_i2c_slave_rate','i2c_slave_rate_t',[['I2C_SLAVE_RATE_STANDARD',100000],['I2C_SLAVE_RATE_FAST',400000],['I2C_SLAVE_RATE_FASTPLUS',1000000],['I2C_SLAVE_RATE_HIGHSPEED',3400000]])}
${enumOf('e_i2c_slave_addr_mode','i2c_slave_addr_mode_t',[['I2C_SLAVE_ADDR_MODE_7BIT',1],['I2C_SLAVE_ADDR_MODE_10BIT',2]])}
${enumOf('e_i2c_slave_event','i2c_slave_event_t',['ABORTED','RX_COMPLETE','TX_COMPLETE','RX_REQUEST','TX_REQUEST','RX_MORE_REQUEST','TX_MORE_REQUEST','GENERAL_CALL'].map((k,i)=>['I2C_SLAVE_EVENT_'+k,i+1]))}
typedef struct st_iic_slave_instance_ctrl { uint32_t open; } iic_slave_instance_ctrl_t;
typedef struct st_i2c_slave_cfg { uint8_t channel; i2c_slave_rate_t rate; uint16_t slave; i2c_slave_addr_mode_t addr_mode; bool general_call_enable; IRQn_Type rxi_irq; IRQn_Type txi_irq; IRQn_Type tei_irq; IRQn_Type eri_irq; uint8_t ipl; uint8_t eri_ipl; bool clock_stretching_enable; void * p_context; void * p_extend; } i2c_slave_cfg_t;
typedef struct st_i2c_slave_instance { iic_slave_instance_ctrl_t * p_ctrl; const i2c_slave_cfg_t * p_cfg; void * p_api; } i2c_slave_instance_t;
typedef struct st_i2c_slave_callback_args { void * p_context; uint32_t bytes; i2c_slave_event_t event; } i2c_slave_callback_args_t;
${enumOf('e_spi_bit_width','spi_bit_width_t',Array.from({length:29},(_,i)=>[`SPI_BIT_WIDTH_${i+4}_BITS`,i+3]))}
${enumOf('e_spi_mode','spi_mode_t',[['SPI_MODE_MASTER',0],['SPI_MODE_SLAVE',1]])}
${enumOf('e_spi_clk_phase','spi_clk_phase_t',[['SPI_CLK_PHASE_EDGE_ODD',0],['SPI_CLK_PHASE_EDGE_EVEN',1]])}
${enumOf('e_spi_clk_polarity','spi_clk_polarity_t',[['SPI_CLK_POLARITY_LOW',0],['SPI_CLK_POLARITY_HIGH',1]])}
${enumOf('e_spi_mode_fault','spi_mode_fault_t',[['SPI_MODE_FAULT_ERROR_ENABLE',0],['SPI_MODE_FAULT_ERROR_DISABLE',1]])}
${enumOf('e_spi_bit_order','spi_bit_order_t',[['SPI_BIT_ORDER_MSB_FIRST',0],['SPI_BIT_ORDER_LSB_FIRST',1]])}
${enumOf('e_spi_event','spi_event_t',['TRANSFER_COMPLETE','TRANSFER_ABORTED','ERR_MODE_FAULT','ERR_READ_OVERFLOW','ERR_PARITY','ERR_OVERRUN','ERR_FRAMING','ERR_MODE_UNDERRUN'].map((k,i)=>['SPI_EVENT_'+k,i+1]))}
typedef struct st_spi_cfg { uint8_t channel; IRQn_Type rxi_irq; IRQn_Type txi_irq; IRQn_Type tei_irq; IRQn_Type eri_irq; uint8_t rxi_ipl; uint8_t txi_ipl; uint8_t tei_ipl; uint8_t eri_ipl; spi_mode_t operating_mode; spi_clk_phase_t clk_phase; spi_clk_polarity_t clk_polarity; spi_mode_fault_t mode_fault; spi_bit_order_t bit_order; void * p_transfer_tx; void * p_transfer_rx; void * p_context; void * p_extend; } spi_cfg_t;
typedef struct st_spi_instance { void * p_ctrl; const spi_cfg_t * p_cfg; void * p_api; } spi_instance_t;
typedef struct st_spi_callback_args { uint32_t channel; spi_event_t event; void * p_context; } spi_callback_args_t;
${enumOf('e_wdt_timeout','wdt_timeout_t',[128,512,1024,2048,4096,8192,16384].map((n,i)=>['WDT_TIMEOUT_'+n,i]))}
${enumOf('e_wdt_clock_division','wdt_clock_division_t',Object.entries(WDT_DIVISION_CODE).map(([d,c])=>['WDT_CLOCK_DIVISION_'+d,c]))}
${enumOf('e_wdt_window_start','wdt_window_start_t',[25,50,75,100].map((n,i)=>['WDT_WINDOW_START_'+n,i]))}
${enumOf('e_wdt_window_end','wdt_window_end_t',[75,50,25,0].map((n,i)=>['WDT_WINDOW_END_'+n,i]))}
${enumOf('e_wdt_reset_control','wdt_reset_control_t',[['WDT_RESET_CONTROL_NMI',0],['WDT_RESET_CONTROL_RESET',1]])}
${enumOf('e_wdt_stop_control','wdt_stop_control_t',[['WDT_STOP_CONTROL_DISABLE',0],['WDT_STOP_CONTROL_ENABLE',1]])}
${enumOf('e_wdt_status','wdt_status_t',[['WDT_STATUS_NO_ERROR',0],['WDT_STATUS_UNDERFLOW',1],['WDT_STATUS_REFRESH_ERROR',2],['WDT_STATUS_UNDERFLOW_AND_REFRESH_ERROR',3],['WDT_STATUS_OVERFLOW',4]])}
typedef struct st_wdt_callback_args { void * p_context; } wdt_callback_args_t;
typedef struct st_wdt_timeout_values { uint32_t clock_frequency_hz; uint32_t timeout_clocks; } wdt_timeout_values_t;
typedef struct st_wdt_instance_ctrl { uint32_t wdt_open; } wdt_instance_ctrl_t;
typedef struct st_iwdt_instance_ctrl { uint32_t wdt_open; } iwdt_instance_ctrl_t;
typedef struct st_wdt_cfg { wdt_timeout_t timeout; wdt_clock_division_t clock_division; wdt_window_start_t window_start; wdt_window_end_t window_end; wdt_reset_control_t reset_control; wdt_stop_control_t stop_control; void * p_context; void * p_extend; } wdt_cfg_t;
typedef struct st_wdt_instance { void * p_ctrl; const wdt_cfg_t * p_cfg; void * p_api; } wdt_instance_t;
${enumOf('e_rtc_event','rtc_event_t',[['RTC_EVENT_ALARM_IRQ',0],['RTC_EVENT_ALARM1_IRQ',1],['RTC_EVENT_PERIODIC_IRQ',2]])}
${enumOf('e_rtc_alarm_channel','rtc_alarm_channel_t',[['RTC_ALARM_CHANNEL_0',0],['RTC_ALARM_CHANNEL_1',1]])}
${enumOf('e_rtc_count_source','rtc_clock_source_t',[['RTC_CLOCK_SOURCE_SUBCLK',0],['RTC_CLOCK_SOURCE_LOCO',1],['RTC_CLOCK_SOURCE_MAINCLK',2]])}
${enumOf('e_rtc_status','rtc_status_t',[['RTC_STATUS_STOPPED',0],['RTC_STATUS_RUNNING',1]])}
${enumOf('e_rtc_error_adjustment','rtc_error_adjustment_t',[['RTC_ERROR_ADJUSTMENT_NONE',0],['RTC_ERROR_ADJUSTMENT_ADD_PRESCALER',1],['RTC_ERROR_ADJUSTMENT_SUBTRACT_PRESCALER',2]])}
${enumOf('e_rtc_error_adjustment_mode','rtc_error_adjustment_mode_t',[['RTC_ERROR_ADJUSTMENT_MODE_MANUAL',0],['RTC_ERROR_ADJUSTMENT_MODE_AUTOMATIC',1]])}
${enumOf('e_rtc_error_adjustment_period','rtc_error_adjustment_period_t',[['RTC_ERROR_ADJUSTMENT_PERIOD_1_MINUTE',0],['RTC_ERROR_ADJUSTMENT_PERIOD_10_SECOND',1],['RTC_ERROR_ADJUSTMENT_PERIOD_NONE',2],['RTC_ERROR_ADJUSTMENT_PERIOD_20_SECOND',3]])}
${enumOf('e_rtc_periodic_irq_select','rtc_periodic_irq_select_t',['1_DIV_BY_256_SECOND','1_DIV_BY_128_SECOND','1_DIV_BY_64_SECOND','1_DIV_BY_32_SECOND','1_DIV_BY_16_SECOND','1_DIV_BY_8_SECOND','1_DIV_BY_4_SECOND','1_DIV_BY_2_SECOND','1_SECOND','2_SECOND','1_MINUTE','1_HOUR','1_DAY','1_MONTH'].map((k,i)=>['RTC_PERIODIC_IRQ_SELECT_'+k,i+6]))}
struct tm { int tm_sec; int tm_min; int tm_hour; int tm_mday; int tm_mon; int tm_year; int tm_wday; int tm_yday; int tm_isdst; };
typedef struct tm rtc_time_t;
typedef struct st_rtc_alarm_time { rtc_time_t time; bool sec_match; bool min_match; bool hour_match; bool mday_match; bool mon_match; bool year_match; bool dayofweek_match; bool sunday_match; bool monday_match; bool tuesday_match; bool wednesday_match; bool thursday_match; bool friday_match; bool saturday_match; rtc_alarm_channel_t channel; } rtc_alarm_time_t;
typedef struct st_rtc_callback_args { rtc_event_t event; void * p_context; } rtc_callback_args_t;
typedef struct st_rtc_info { rtc_clock_source_t clock_source; rtc_status_t status; } rtc_info_t;
typedef struct st_rtc_error_adjustment_cfg { rtc_error_adjustment_mode_t adjustment_mode; rtc_error_adjustment_period_t adjustment_period; rtc_error_adjustment_t adjustment_type; uint32_t adjustment_value; } rtc_error_adjustment_cfg_t;
typedef struct st_rtc_cfg { rtc_clock_source_t clock_source; uint32_t freq_compare_value; uint8_t alarm_ipl; IRQn_Type alarm_irq; uint8_t periodic_ipl; IRQn_Type periodic_irq; uint8_t carry_ipl; IRQn_Type carry_irq; void * p_context; void * p_extend; } rtc_cfg_t;
typedef struct st_rtc_ctrl { uint32_t open; } rtc_instance_ctrl_t;
typedef struct st_rtc_instance { rtc_instance_ctrl_t * p_ctrl; const rtc_cfg_t * p_cfg; void * p_api; } rtc_instance_t;
${RESET_STATUS.map(([k,pos])=>`#define R_SYSTEM_RSTSR1_${k}_Pos (${pos}UL)\n#define R_SYSTEM_RSTSR1_${k}_Msk (${hex(1<<pos,1)}UL)`).join('\n')}
${RESET_STATUS0.map(([k,pos])=>`#define R_SYSTEM_RSTSR0_${k}_Pos (${pos}UL)\n#define R_SYSTEM_RSTSR0_${k}_Msk (${hex(1<<pos,1)}UL)`).join('\n')}
typedef struct st_fsp_interp_rstsr1_b { uint16_t IWDTRF; uint16_t WDTRF; uint16_t SWRF; } FSP_INTERP_RSTSR1_b;
typedef struct st_fsp_interp_rstsr0_b { uint8_t PORF; uint8_t LVD0RF; uint8_t LVD1RF; uint8_t LVD2RF; uint8_t DPSRSTF; } FSP_INTERP_RSTSR0_b;
typedef struct st_fsp_interp_system { uint16_t RSTSR1; FSP_INTERP_RSTSR1_b RSTSR1_b; uint8_t RSTSR0; FSP_INTERP_RSTSR0_b RSTSR0_b; uint8_t DPSIFR0; uint8_t DPSIFR1; uint8_t DPSIFR2; uint8_t DPSIFR3; } FSP_INTERP_SYSTEM;
${enumOf('e_bsp_reg_protect','bsp_reg_protect_t',['CGC','OM_LPC_BATT','LVD','SAR'].map((k,i)=>['BSP_REG_PROTECT_'+k,i]))}
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

// r_spi.h and r_sci_spi.h (FSP 6.x): in hal_data.h only when the stack is there.
const RSPI_TYPES=`${enumOf('e_spi_ssl_mode','spi_ssl_mode_t',[['SPI_SSL_MODE_SPI',0],['SPI_SSL_MODE_CLK_SYN',1]])}
${enumOf('e_spi_burst_transfer_without_delay','spi_burst_transfer_without_delay_t',[['SPI_BURST_TRANSFER_WITH_DELAY',0],['SPI_BURST_TRANSFER_WITHOUT_DELAY',1]])}
${enumOf('e_spi_communication','spi_communication_t',[['SPI_COMMUNICATION_FULL_DUPLEX',0],['SPI_COMMUNICATION_TRANSMIT_ONLY',1]])}
${enumOf('e_spi_sslp','spi_ssl_polarity_t',[['SPI_SSLP_LOW',0],['SPI_SSLP_HIGH',1]])}
${enumOf('e_spi_ssl_select','spi_ssl_select_t',[0,1,2,3].map(n=>['SPI_SSL_SELECT_SSL'+n,n]))}
${enumOf('e_spi_mosi_idle_value_fixing','spi_mosi_idle_value_fixing_t',[['SPI_MOSI_IDLE_VALUE_FIXING_DISABLE',0],['SPI_MOSI_IDLE_VALUE_FIXING_LOW',1],['SPI_MOSI_IDLE_VALUE_FIXING_HIGH',2]])}
${enumOf('e_spi_parity_mode','spi_parity_t',[['SPI_PARITY_MODE_DISABLE',0],['SPI_PARITY_MODE_ODD',1],['SPI_PARITY_MODE_EVEN',2]])}
${enumOf('e_spi_byte_swap','spi_byte_swap_t',[['SPI_BYTE_SWAP_DISABLE',0],['SPI_BYTE_SWAP_ENABLE',1]])}
${enumOf('e_spi_clock_delay_count','spi_delay_count_t',[1,2,3,4,5,6,7,8].map((n,i)=>['SPI_DELAY_COUNT_'+n,i]))}
typedef struct st_rspck_div_setting { uint8_t spbr; uint8_t brdv; } rspck_div_setting_t;
typedef struct st_spi_extended_cfg { spi_ssl_mode_t spi_clksyn; spi_communication_t spi_comm; spi_ssl_polarity_t ssl_polarity; spi_ssl_select_t ssl_select; spi_mosi_idle_value_fixing_t mosi_idle; spi_parity_t parity; spi_byte_swap_t byte_swap; rspck_div_setting_t spck_div; spi_delay_count_t spck_delay; spi_delay_count_t ssl_negation_delay; spi_delay_count_t next_access_delay; spi_burst_transfer_without_delay_t burst_interframe_delay; } spi_extended_cfg_t;
typedef struct st_spi_instance_ctrl { uint32_t open; } spi_instance_ctrl_t;`;
const SCI_SPI_TYPES=`typedef struct st_sci_spi_div_setting { uint8_t brr; uint8_t cks; uint8_t mddr; } sci_spi_div_setting_t;
typedef struct st_sci_spi_extended_cfg { sci_spi_div_setting_t clk_div; } sci_spi_extended_cfg_t;
typedef struct st_sci_spi_instance_ctrl { uint32_t open; } sci_spi_instance_ctrl_t;`;
// r_lpm_api.h and r_lpm.h (FSP 6.6, the RA6E1's lpm_cfg_t: snooze and deep standby, no SBYCR.OPE): in hal_data.h only
// when the stack is there. The interpreter has no 64-bit integers and its enum constants are ints, so the wake sources
// are two 32-bit members: the second (WUPEN1: the AGT3 sources) is filled in for g_lpm0 from the Stacks settings and has
// no enum constants. A lpm_cfg_t written in the code can name every source but IIC0 (bit 31) and the three of AGT3.
const cancelIrqs=Object.keys(RA_LPM_CANCEL_BITS).filter(k=>/^IRQ/.test(k));
const LPM_TYPES=`${enumOf('e_lpm_mode','lpm_mode_t',['SLEEP','DEEP_SLEEP','STANDBY','STANDBY_SNOOZE','DEEP'].map((k,i)=>['LPM_MODE_'+k,i]))}
${enumOf('e_lpm_snooze_request','lpm_snooze_request_t',[['LPM_SNOOZE_REQUEST_RXD0_FALLING',0]])}
${enumOf('e_lpm_snooze_end','lpm_snooze_end_t',[['LPM_SNOOZE_END_STANDBY_WAKE_SOURCES',0]])}
${enumOf('e_lpm_snooze_cancel','lpm_snooze_cancel_t',[['LPM_SNOOZE_CANCEL_SOURCE_NONE',0]])}
${enumOf('e_lpm_snooze_dtc','lpm_snooze_dtc_t',[['LPM_SNOOZE_DTC_DISABLE',0],['LPM_SNOOZE_DTC_ENABLE',1]])}
${enumOf('e_lpm_standby_wake_source','lpm_standby_wake_source_t',Object.entries(RA_LPM_WAKE_BITS).filter(([,b])=>b<31).map(([k,b])=>['LPM_STANDBY_WAKE_SOURCE_'+k,hex(2**b,8)]))}
${enumOf('e_lpm_io_port','lpm_io_port_t',[['LPM_IO_PORT_RESET',0],['LPM_IO_PORT_NO_CHANGE',1]])}
${enumOf('e_lpm_power_supply','lpm_power_supply_t',Object.entries(RA_LPM_POWER).map(([k,v])=>['LPM_POWER_SUPPLY_'+k,v]))}
${enumOf('e_lpm_deep_standby_cancel_edge','lpm_deep_standby_cancel_edge_t',[['LPM_DEEP_STANDBY_CANCEL_SOURCE_EDGE_NONE',0],...[...cancelIrqs,'LVD1','LVD2','NMI'].flatMap(k=>[[`LPM_DEEP_STANDBY_CANCEL_SOURCE_${k}_RISING`,hex(2**RA_LPM_CANCEL_BITS[k],8)],[`LPM_DEEP_STANDBY_CANCEL_SOURCE_${k}_FALLING`,0]])])}
${enumOf('e_lpm_deep_standby_cancel_source','lpm_deep_standby_cancel_source_t',[['LPM_DEEP_STANDBY_CANCEL_SOURCE_RESET_ONLY',0],...Object.entries(RA_LPM_CANCEL_BITS).map(([k,b])=>['LPM_DEEP_STANDBY_CANCEL_SOURCE_'+k,hex(2**b,8)])])}
${enumOf('e_lpm_output_port_enable','lpm_output_port_enable_t',[['LPM_OUTPUT_PORT_ENABLE_HIGH_IMPEDANCE',0],['LPM_OUTPUT_PORT_ENABLE_RETAIN',1]])}
typedef struct st_lpm_cfg { lpm_mode_t low_power_mode; uint32_t standby_wake_sources; uint32_t fsp_interp_wake_sources_high; lpm_snooze_request_t snooze_request_source; uint16_t snooze_end_sources; lpm_snooze_cancel_t snooze_cancel_sources; lpm_snooze_dtc_t dtc_state_in_snooze; lpm_io_port_t io_port_state; lpm_power_supply_t power_supply_state; uint32_t deep_standby_cancel_source; uint32_t deep_standby_cancel_edge; void * p_extend; } lpm_cfg_t;
typedef struct st_lpm_instance_ctrl { uint32_t lpm_open; } lpm_instance_ctrl_t;
typedef struct st_lpm_instance { lpm_instance_ctrl_t * p_ctrl; const lpm_cfg_t * p_cfg; void * p_api; } lpm_instance_t;`;

/** The prelude's text for a checked RA configuration: types, the pin symbols and the Stacks instances of hal_data.c. */
export function fspPrelude(mcu){
 const inst=raInstances(mcu),{irqs,uarts,gpts,adc,agts,iics,spis,sciSpis,wdts,rtc,iicSlaves,lpm,flash}=inst,vectors=raVectors(mcu),vec=k=>vectors.some(v=>v.vector===k)?`VECTOR_NUMBER_${k}`:'FSP_INVALID_VECTOR';
 const pins=Object.entries(mcu.pins||{}).sort(([a],[b])=>raPinName(a).localeCompare(raPinName(b)));
 const ipl=(name,p)=>name?`(${p})`:'(BSP_IRQ_DISABLED)';
 const out=['#ifndef FSP_INTERP_PRELUDE_H','#define FSP_INTERP_PRELUDE_H',TYPES,TRANSFER_TYPES,
  `#define VECTOR_DATA_IRQ_COUNT (${vectors.length})`,`#define BSP_ICU_VECTOR_NUM_ENTRIES (${Math.max(1,vectors.length)})`,...vectors.flatMap(v=>[`#define VECTOR_NUMBER_${v.vector} ((IRQn_Type) ${v.index})`,`#define ${v.vector}_IRQn ((IRQn_Type) ${v.index})`]),
  ...pins.filter(([,p])=>p.label).map(([pin,p])=>`#define ${p.label} (${raIoName(pin)})`),
  'ioport_instance_ctrl_t g_ioport_ctrl;',
  ...(pins.length?[`const ioport_pin_cfg_t g_bsp_pin_cfg_data[${pins.length}] = {\n${pins.map(([pin,p])=>`    { .pin = ${raIoName(pin)}, .pin_cfg = ${pinCfgWord({...p,name:pin})} },`).join('\n')}\n};`,`const ioport_cfg_t g_bsp_pin_cfg = { .number_of_pins = ${pins.length}, .p_pin_cfg_data = &g_bsp_pin_cfg_data[0], .p_extend = NULL };`]:['const ioport_cfg_t g_bsp_pin_cfg = { .number_of_pins = 0, .p_pin_cfg_data = NULL, .p_extend = NULL };']),
  'const ioport_instance_t g_ioport = { .p_ctrl = &g_ioport_ctrl, .p_cfg = &g_bsp_pin_cfg, .p_api = NULL };'];
 // Transfers (r_dtc / r_dmac) and the ELC (feature 36): before the UARTs that point at their transfers.
 out.push(...transferPrelude(inst,vec));
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
 // SPI masters (r_spi on RSPI, r_sci_spi on an SCI channel): the driver's own types only when its header is in hal_data.h.
 const spiCfg=(t,event,ext)=>{const v=k=>vec(`${event}${t.channel}_${k}`);return [`const spi_cfg_t ${t.name}_cfg = { .channel = ${t.channel}, .rxi_irq = ${v('RXI')}, .txi_irq = ${v('TXI')}, .tei_irq = ${v('TEI')}, .eri_irq = ${v('ERI')}, .rxi_ipl = (${t.priority}), .txi_ipl = (${t.priority}), .tei_ipl = (${t.priority}), .eri_ipl = (${t.priority}), .operating_mode = SPI_MODE_MASTER, .clk_phase = ${t.cpha?'SPI_CLK_PHASE_EDGE_EVEN':'SPI_CLK_PHASE_EDGE_ODD'}, .clk_polarity = ${t.cpol?'SPI_CLK_POLARITY_HIGH':'SPI_CLK_POLARITY_LOW'}, .mode_fault = SPI_MODE_FAULT_ERROR_DISABLE, .bit_order = ${t.bitOrder==='LSB'?'SPI_BIT_ORDER_LSB_FIRST':'SPI_BIT_ORDER_MSB_FIRST'}, .p_transfer_tx = NULL, .p_transfer_rx = NULL, .p_context = NULL, .p_extend = &${ext} };`,
  `const spi_instance_t ${t.name} = { .p_ctrl = &${t.name}_ctrl, .p_cfg = &${t.name}_cfg, .p_api = NULL };`,`void ${t.callback}(spi_callback_args_t * p_args);`];};
 if(spis.length)out.push(RSPI_TYPES);
 for(const t of spis)out.push(`spi_instance_ctrl_t ${t.name}_ctrl;`,`const spi_extended_cfg_t ${t.name}_ext_cfg = { .spi_clksyn = ${t.ssl==='SSL0'?'SPI_SSL_MODE_SPI':'SPI_SSL_MODE_CLK_SYN'}, .spi_comm = SPI_COMMUNICATION_FULL_DUPLEX, .ssl_polarity = SPI_SSLP_LOW, .ssl_select = SPI_SSL_SELECT_SSL0, .mosi_idle = SPI_MOSI_IDLE_VALUE_FIXING_DISABLE, .parity = SPI_PARITY_MODE_DISABLE, .byte_swap = SPI_BYTE_SWAP_DISABLE, .spck_div = { .spbr = ${t.div.spbr}, .brdv = ${t.div.brdv} }, .spck_delay = SPI_DELAY_COUNT_1, .ssl_negation_delay = SPI_DELAY_COUNT_1, .next_access_delay = SPI_DELAY_COUNT_1, .burst_interframe_delay = SPI_BURST_TRANSFER_WITH_DELAY };`,...spiCfg(t,'SPI',`${t.name}_ext_cfg`));
 if(sciSpis.length)out.push(SCI_SPI_TYPES);
 for(const t of sciSpis)out.push(`sci_spi_instance_ctrl_t ${t.name}_ctrl;`,`const sci_spi_extended_cfg_t ${t.name}_cfg_extend = { .clk_div = { .cks = ${t.div.cks}, .brr = ${t.div.brr}, .mddr = 0 } };`,...spiCfg(t,'SCI',`${t.name}_cfg_extend`));
 for(const w of wdts)out.push(`${w.ctrl} ${w.name}_ctrl;`,`const wdt_cfg_t ${w.name}_cfg = { .timeout = WDT_TIMEOUT_${w.timeout}, .clock_division = WDT_CLOCK_DIVISION_${w.clockDiv}, .window_start = WDT_WINDOW_START_${w.windowStart}, .window_end = WDT_WINDOW_END_${w.windowEnd}, .reset_control = WDT_RESET_CONTROL_${w.reset}, .stop_control = WDT_STOP_CONTROL_${w.stopInSleep?'ENABLE':'DISABLE'}, .p_context = NULL, .p_extend = NULL };`,
  `const wdt_instance_t ${w.name} = { .p_ctrl = &${w.name}_ctrl, .p_cfg = &${w.name}_cfg, .p_api = NULL };`,...(w.callback?[`void ${w.callback}(wdt_callback_args_t * p_args);`]:[]));
 if(rtc){const ipl=p=>p==null?'(BSP_IRQ_DISABLED)':`(${p})`,irq=(k,p)=>p==null?'FSP_INVALID_VECTOR':vec('RTC_'+k);
  out.push('rtc_instance_ctrl_t g_rtc0_ctrl;',`const rtc_cfg_t g_rtc0_cfg = { .clock_source = ${rtc.clockSource==='SUBCLOCK'?'RTC_CLOCK_SOURCE_SUBCLK':'RTC_CLOCK_SOURCE_LOCO'}, .freq_compare_value = ${rtc.freqCompare}, .alarm_ipl = ${ipl(rtc.alarmPriority)}, .alarm_irq = ${irq('ALARM',rtc.alarmPriority)}, .periodic_ipl = ${ipl(rtc.periodicPriority)}, .periodic_irq = ${irq('PERIOD',rtc.periodicPriority)}, .carry_ipl = ${ipl(rtc.carryPriority)}, .carry_irq = ${irq('CARRY',rtc.carryPriority)}, .p_context = NULL, .p_extend = NULL };`,
   'const rtc_instance_t g_rtc0 = { .p_ctrl = &g_rtc0_ctrl, .p_cfg = &g_rtc0_cfg, .p_api = NULL };',...(rtc.callback?[`void ${rtc.callback}(rtc_callback_args_t * p_args);`]:[]));}
 if(lpm){const [wakeLo,wakeHi]=raLpmMask(lpm.wake,RA_LPM_WAKE_BITS),[cancel]=raLpmMask(lpm.cancel,RA_LPM_CANCEL_BITS),[edge]=raLpmMask(lpm.cancelRising,RA_LPM_CANCEL_BITS);
  out.push(LPM_TYPES,'lpm_instance_ctrl_t g_lpm0_ctrl;',`const lpm_cfg_t g_lpm0_cfg = { .low_power_mode = LPM_MODE_${lpm.mode}, .standby_wake_sources = ${hex(wakeLo,8)}, .fsp_interp_wake_sources_high = ${wakeHi}, .snooze_request_source = LPM_SNOOZE_REQUEST_RXD0_FALLING, .snooze_end_sources = 0, .snooze_cancel_sources = LPM_SNOOZE_CANCEL_SOURCE_NONE, .dtc_state_in_snooze = LPM_SNOOZE_DTC_DISABLE, .io_port_state = ${lpm.ioKeep?'LPM_IO_PORT_NO_CHANGE':'LPM_IO_PORT_RESET'}, .power_supply_state = LPM_POWER_SUPPLY_${lpm.power}, .deep_standby_cancel_source = ${hex(cancel,8)}, .deep_standby_cancel_edge = ${hex(edge,8)}, .p_extend = NULL };`,
   'const lpm_instance_t g_lpm0 = { .p_ctrl = &g_lpm0_ctrl, .p_cfg = &g_lpm0_cfg, .p_api = NULL };');}
 for(const t of iicSlaves){const v=k=>vec(`IIC${t.channel}_${k}`);out.push(`iic_slave_instance_ctrl_t ${t.name}_ctrl;`,`const i2c_slave_cfg_t ${t.name}_cfg = { .channel = ${t.channel}, .rate = I2C_SLAVE_RATE_${t.rate}, .slave = ${hex(t.slave,2)}, .general_call_enable = false, .addr_mode = I2C_SLAVE_ADDR_MODE_7BIT, .p_context = NULL, .rxi_irq = ${v('RXI')}, .txi_irq = ${v('TXI')}, .tei_irq = ${v('TEI')}, .eri_irq = ${v('ERI')}, .ipl = (${t.priority}), .eri_ipl = (${t.priority}), .clock_stretching_enable = true, .p_extend = NULL };`,
  `const i2c_slave_instance_t ${t.name} = { .p_ctrl = &${t.name}_ctrl, .p_cfg = &${t.name}_cfg, .p_api = NULL };`,`void ${t.callback}(i2c_slave_callback_args_t * p_args);`);}
 // Data flash (r_flash_hp): its types only when the stack is there, as hal_data.h includes r_flash_hp.h then.
 if(flash)out.push(FLASH_TYPES,...flashPrelude(flash,vec));
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
 const config=validateRaMcu(mcu),prelude=fspPrelude(config);
 const own=(files||[]).filter(f=>!FSP_FILE.test(f?.name||'')).map(f=>({...f,text:substitute(f.text)}));
 // A project header of the same name (src/board.h) is the one GCC finds next to hal_entry.c: no stand-in for it.
 const shadowed=new Set(own.map(f=>baseName(f.name))),virtualNames=FSP_HEADERS.filter(name=>!shadowed.has(name)),virtual=Object.fromEntries(virtualNames.map(name=>[name,prelude]));
 const prepared=prepareHalSource(substitute(source),own,{withMap:true,headers:C_HEADERS,defines:[],virtual});
 let program;
 try{program=compile(prepared.text,{hal:true,entry:'hal_entry',sourceMap:prepared.sourceMap});}
 catch(error){if(!error.location){const m=/^(\d+)행:/.exec(error.message);if(m){error.location=prepared.sourceMap[Number(m[1])-1];if(error.location)error.message=error.message.replace(/^\d+행:/,`${error.location.file}:${error.location.line}:`);}}throw error;}
 if(program.functions.main){const loc=program.functions.main.loc,error=new Error(`${loc?.file??'main.c'}:${loc?.line??1}: FSP 프로젝트의 main()은 ra_gen/main.c가 만듭니다. 프로그램은 hal_entry()에 쓰세요.`);error.location=loc;throw error;}
 // Only what the stand-in itself declares is hidden from the debugger's variables, not a project header's globals.
 const prelude_=new Set(virtualNames),declared=new Set();program.preludeNames=new Set();
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

const SHORT_WAIT_MS=.05;
const FSP={SUCCESS:0,ASSERTION:1,INVALID_ARGUMENT:3,INVALID_MODE:5,UNSUPPORTED:6,NOT_OPEN:7,IN_USE:8,IRQ_BSP_DISABLED:11,ALREADY_OPEN:14,NOT_ENABLED:19};
const KINDS={ioport:[/^g_ioport_ctrl$/,'g_ioport_ctrl'],icu:[/^g_external_irq(\d+)_ctrl$/,'g_external_irq1_ctrl'],uart:[/^g_uart(\d+)_ctrl$/,'g_uart9_ctrl'],gpt:[/^g_timer(\d+)_ctrl$/,'g_timer1_ctrl'],agt:[/^g_agt(\d+)_ctrl$/,'g_agt0_ctrl'],adc:[/^g_adc(\d+)_ctrl$/,'g_adc0_ctrl'],iic:[/^g_i2c_master(\d+)_ctrl$/,'g_i2c_master0_ctrl'],
 spi:[/^g_spi(\d+)_ctrl$/,'g_spi1_ctrl'],sciSpi:[/^g_sci_spi(\d+)_ctrl$/,'g_sci_spi9_ctrl'],wdt:[/^g_wdt(\d+)_ctrl$/,'g_wdt0_ctrl'],iwdt:[/^g_iwdt(\d+)_ctrl$/,'g_iwdt0_ctrl'],rtc:[/^g_rtc(\d+)_ctrl$/,'g_rtc0_ctrl'],iicSlave:[/^g_i2c_slave(\d+)_ctrl$/,'g_i2c_slave0_ctrl'],lpm:[/^g_lpm(\d+)_ctrl$/,'g_lpm0_ctrl'],flash:[/^g_flash(\d+)_ctrl$/,'g_flash0_ctrl'],
 elc:[/^g_elc_ctrl$/,'g_elc_ctrl'],transfer:[/^g_transfer(\d+)_ctrl$/,'g_transfer0_ctrl']};
const SUPPORTED='R_IOPORT_*, R_BSP_SoftwareDelay · R_BSP_Pin*, R_ICU_ExternalIrq*, R_SCI_UART_*, R_GPT_*, R_AGT_*, R_ADC_*, R_IIC_MASTER_*, R_IIC_SLAVE_*, R_SPI_*, R_SCI_SPI_*, R_WDT_*, R_IWDT_*, R_RTC_*, R_LPM_*, R_FLASH_HP_*(데이터 플래시), R_ELC_*, R_DTC_*, R_DMAC_*';
// RTC periodic rates the RA6E1 has (RCR1.PES 6-15): FSP's enum also lists 1 minute … 1 month for other RA parts, which
// would make R_RTC_PeriodicIrqRateSet wait forever on this one.
const RTC_PERIOD_S={6:1/256,7:1/128,8:1/64,9:1/32,10:1/16,11:1/8,12:1/4,13:1/2,14:1,15:2};
const RTC_DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
const bcd=n=>((Math.floor(n/10)<<4)|(n%10));
// A program reads the reset cause from R_SYSTEM->RSTSR1 (FSP has no API for it). Every other register access stays an
// error on the interpreter (it has no registers behind the names); this one is a read of state the interpreter keeps
// (FspAdapter.rstsr1, handed over across a reset), so the reset-cause snippet and the WDT example run on both engines.
// Writing it (clearing a flag) is refused with the reason: the flags then would have two sources of truth.
// RSTSR0 (PORF, DPSRSTF: the restart after Deep Software Standby) is read the same way (FspAdapter.rstsr0).
const RSTSR_READ_ONLY=name=>`R_SYSTEM->${name}: 내장 해석기는 리셋 원인 레지스터를 읽기만 합니다(쓰기로 플래그 지우기는 ARM GCC 실행에서). 다른 R_SYSTEM 레지스터는 ARM GCC 실행에서만 됩니다.`;
const int=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return value;};
const isIterator=v=>v&&typeof v.next==='function';

export class FspAdapter {
 constructor(mcu,buses,{session}={}){
  this.config=validateRaMcu(mcu);this.buses=buses;this.session=session;this.inst=raInstances(this.config);this.vectors=raVectors(this.config);this.elcOn=false;
  this.pclkd=raClockHz(this.config);this.pclkb=raClockHz(this.config,'pclkb');
  this.pending=[];this.active=[];this.seq=0;this.dispatched=0;this.serials=new Map();this.states=new Map();this.peripheralPins=new Set();this.warned=new Set();this.names=null;this.activeIic=null;this.shortWait=0;
  // Reset cause (RSTSR1) and the reason of the reset this adapter's program ends with (session.js passes it on).
  this.rstsr1=0;this.rstsr0=1;this.dpsifr=0;this.resetCause=null;
  // Low power modes (R_LPM_*): what r_lpm leaves in the registers (SBYCR.SSBY, WUPEN, DPSBYCR, DPSIER, DPSIEGR; `set` once
  // a mode was configured since the program started), the mode the program is in now (`low`), and the I/O hold after a
  // Deep Software Standby with IOKEEP (`hold`: the pins as they were, and what the program writes meanwhile).
  this.lpmReg={set:false,ssby:false,wupenLo:0,wupenHi:0,dpsby:false,deepcut:1,iokeep:0,dpsier:0,dpsiegr:0};
  this.low=null;this.hold=false;this.heldPins=null;this.heldWrites=new Map();
  this.lowLog=new LpmLog(message=>this.buses?.trace?.({micros:this.runtime?.microTime??0,protocol:LPM_PROTOCOL,message}));
  // The RTC's calendar (the emulator's model, src/emu/ra6e1/rtc.js, read through its registers): it starts at power-on
  // from the stack's start time and, in its own power domain, goes on across a reset.
  this.hostTime=session?.hostTime??Date.now();this.rtcDev=null;
  // The data flash (fsp-flash.js): what the project saved from earlier runs; an MCU reset keeps it, the sequencer starts over.
  this.dataFlash=this.flashStore(session?.project?.dataFlash);this.faciDev=null;this.flashFwe=false;
 }
 // A reset pin reset (session.js checkNrst) starts the cause flags over, as the emulator does; any other reset adds its flag.
 // The end of Deep Software Standby is a reset too (RSTSR0.DPSRSTF); the Deep Software Standby registers and the I/O hold
 // stay across the resets the program causes (as in the emulator, emu/ra6e1/lpm.js), and the held pins are put back
 // after the runtime cleared them for the restart.
 inheritReset(old,runtime){
  const pin=old.resetCause==='PIN';
  this.rstsr1=pin?0:(old.rstsr1|(RESET_FLAG[old.resetCause]??0))&0xffff;this.rstsr0=pin?0:old.rstsr0|(old.resetCause==='DEEP_STANDBY'?0x80:0);
  this.wdtResets=old.wdtResets;this.rtcDev=old.rtcDev;this.hostTime=old.hostTime;
  this.dataFlash=old.dataFlash;this.flashBlankNoted=old.flashBlankNoted;
  // An RTC stopped for the mode (LOCO without its supply) counts again.
  if(old.low?.rtcStopped)this.rtcDev?.start();
  if(pin)return;
  const o=old.lpmReg;Object.assign(this.lpmReg,{dpsby:o.dpsby,deepcut:o.deepcut,iokeep:o.iokeep,dpsier:o.dpsier,dpsiegr:o.dpsiegr});
  this.hold=old.hold;this.heldPins=old.heldPins;this.dpsifr=old.dpsifr;
  if(this.hold&&this.heldPins&&runtime)for(const [name,g]of this.heldPins)runtime.gpio[name]={...g};
 }
 // Program start (power-on or after a reset): an auto-start watchdog (OFS0) counts from here.
 declareGlobals(r){
  // R_SYSTEM (a register-block name the program uses) gets the type of the part the interpreter stands in for, so
  // R_SYSTEM->RSTSR1_b.WDTRF has a type in expressions.
  const sys=r.globals.cells.R_SYSTEM;if(sys){sys.dataType='pointer';sys.pointeeType='FSP_INTERP_SYSTEM';}
  for(const id of ['IWDT','WDT']){const p=this.config.peripherals?.[id];if(p?.enabled&&p.startMode==='AUTO')this.wdtStart(r,this.wdtState(id));}}
 // R_SYSTEM->RSTSR1 (and RSTSR1_b.IWDTRF / WDTRF / SWRF): a read-only cell holding the reset cause now.
 register(object,key){
  if(object==='R_ADC0'&&key==='ADDR')return {value:this.adcRegisters(),owner:{alive:true},constant:true,readOnly:'R_ADC0->ADDR은 읽기 전용입니다.',dataType:'uint16_t'};
  if(object!=='R_SYSTEM')return null;
  const name=key.slice(0,6),cell=(value,dataType)=>({value,owner:{alive:true},constant:true,readOnly:RSTSR_READ_ONLY(name),dataType});
  if(key==='RSTSR1')return cell(this.rstsr1,'uint16_t');
  if(key==='RSTSR1_b')return cell({kind:'struct',type:'FSP_INTERP_RSTSR1_b',fields:Object.fromEntries(RESET_STATUS.map(([k,pos])=>[k,cell((this.rstsr1>>pos)&1,'uint16_t')]))});
  // RSTSR0 (PORF, DPSRSTF) and DPSIFR0-3 (what cancelled Deep Software Standby) are the adapter's state itself, so they
  // are written as on the chip: writing 0 to a flag clears it, writing 1 leaves it.
  const live=(read,write,dataType)=>({get value(){return read();},set value(v){write(Number(v)>>>0);},owner:{alive:true},constant:false,dataType});
  if(key==='RSTSR0')return live(()=>this.rstsr0,v=>{this.rstsr0&=v&0xff;},'uint8_t');
  if(key==='RSTSR0_b')return cell({kind:'struct',type:'FSP_INTERP_RSTSR0_b',fields:Object.fromEntries(RESET_STATUS0.map(([k,pos])=>[k,live(()=>(this.rstsr0>>pos)&1,v=>{if(!(v&1))this.rstsr0&=~(1<<pos);},'uint8_t')]))});
  const flag=/^DPSIFR([0-3])$/.exec(key);
  if(flag){const sh=8*Number(flag[1]);return live(()=>(this.dpsifr>>>sh)&0xff,v=>{this.dpsifr=(this.dpsifr&~((~v&0xff)<<sh))>>>0;},'uint8_t');}
  return null;
 }
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
  // A low power mode (lowPower): Deep Software Standby keeps every request from the core; Software Standby lets the
  // WUPEN sources through, keeps the requests of the stopped modules for the wake-up and does not see the other IRQ
  // pins; the first request that gets through ends the mode.
  let deferred=[];
  if(this.low){
   if(this.low.mode==='DEEP')return;
   if(this.low.mode==='STANDBY'&&!this.lpmWakes(irq,key)){if(!/^ICU_IRQ/.test(irq)&&!this.low.deferred.some(j=>j[5]===key))this.low.deferred.push([r,irq,prio,run,name,key]);return;}
   // (entered from an interrupt callback: a request that does not preempt the callback waits, the core sleeps on)
   if(prio<this.low.prio)deferred=this.lpmWake(r,irq);
  }
  if(!this.pending.some(j=>j.key===key)){
   this.pending.push({irq,prio,run,name,key,order:this.seq++});
   if(this.pending.length>256)throw new Error('FSP 인터럽트 대기열 한도를 넘었습니다.');r.event(r.microTime/1000,()=>{});
  }
  for(const job of deferred)this.queue(...job);
 }
 exec(r){if(!r.interruptsEnabled)return -1;let p=Infinity;for(const a of this.active)p=Math.min(p,a.prio);return p;}
 preempt(r){if(!this.pending.length||r.atomic)return false;const e=this.exec(r);return this.pending.some(j=>j.prio<e);}
 dispatch(r,job){
  const entry={prio:job.prio,irq:job.irq};this.active.push(entry);this.dispatched++;this.eventReg=true;
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
  // After r_lpm set a mode, a bare __WFI() enters it as well (LPM_CFG_STANDBY_LIMIT 0: SBYCR.SSBY stays set after Open).
  if(name==='__WFI'&&this.lpmReg.set)return this.lowPower(r,name);
  if(name==='__WFI')return this.wfi(r);
  // __WFE: the core's event register, set by every exception taken, lets one WFE through without waiting (as on the core).
  if(name==='__WFE'){if(this.eventReg){this.eventReg=false;return (function*(){return 0;})();}return this.wfi(r,false);}
  if(name==='R_LPM_LowPowerModeEnter'){
   if(!args[0])return (function*(){return FSP.ASSERTION;})();
   const st=this.instance(args[0],r,name,'lpm'),self=this;if(!st.open)return (function*(){return FSP.NOT_OPEN;})();
   return (function*(){yield* self.lowPower(r,name);return FSP.SUCCESS;})();
  }
  if(name==='R_WDT_Refresh'||name==='R_IWDT_Refresh'){const reset=this.wdtBadRefresh(name,args,r);if(reset)return reset;}
  // R_FLASH_HP_*: generators, as a call waits while the flash programs or erases (fsp-flash.js).
  if(name.startsWith('R_FLASH_HP_')){const flash=this.flashCall(name,args,r);if(flash){if(name==='R_FLASH_HP_StatusGet')r.polls++;return flash;}}
  if(name==='NVIC_SystemReset'){const self=this;return (function*(){self.resetCause='SYSRESETREQ';r.warn('[NVIC] 시스템 리셋: 프로그램을 처음부터 다시 실행합니다.');yield {kind:'reset'};})();}
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
  // Waits of a few microseconds (bit-banging, a pin toggled every 2 µs) pass in place as delayMicroseconds does, up to
  // SHORT_WAIT_MS in a row; then one is a real wait, so a 20 ms tick takes a few hundred waits and interrupts still run.
  if(ms<SHORT_WAIT_MS&&!r.inIsr&&this.shortWait+ms<SHORT_WAIT_MS){this.shortWait+=ms;r.microTime+=ms*1000;return 0;}
  this.shortWait=0;yield Math.max(.001,ms);return 0;
 }
 // __WFI: the core sleeps until an interrupt is taken.
 // (WFI is Sleep: a watchdog with its stop control does not count meanwhile, as in lowPower. WFE is the core's own wait
 // on both engines: no low power mode.)
 *wfi(r,sleepMode=true){if(r.inIsr)return 0;const seen=this.dispatched,sleep={mode:'SLEEP',frozen:[]};if(sleepMode)this.lpmFreeze(r,sleep);while(this.dispatched===seen)yield .1;this.lpmThaw(r,sleep);return 0;}
 call(name,args,r){
  this.runtime=r;const [a,b,c,d]=args;
  // A read of a pin or a status is polling (the interpreter's FSP loop rule, runtime.js).
  if(/Read|StatusGet/.test(name))r.polls++;
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
  // I/O hold (IOKEEP after Deep Software Standby): the port registers take the setting, the pin follows at IoKeepClear.
  if(this.hold){this.heldWrites.set(pin,{word,fn});return;}
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
  if(this.hold){const w=this.heldWrites.get(pin)??{fn};w.level=level;this.heldWrites.set(pin,w);return 0;}
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
  if(!this.serials.has(id)){const bus=new BusDevices(this.buses.project,this.buses.getResult,this.buses.trace);bus.uart.instance=id;bus.received=this.buses.received;bus.signals=this.buses.signals;bus.noise=this.buses.noise;bus.peers=(...x)=>this.buses.peers?.(...x);bus.wireless=this.buses.wireless;this.serials.set(id,{id,channel:ch,bus,st:null,rx:null,txFree:0,txEnd:0,txGen:0,txAbort:0});}
  return this.serials.get(id);
 }
 pollUart(ch,r){
  const st=ch.st;if(!st?.open)return;const u=ch.bus.uart;
  while(ch.bus.call('Serial1.available',[],r)>0){
   const item=u.queue.find(x=>x.at<=r.microTime+1e-6),raw=ch.bus.call('Serial1.read',[],r);if(raw<0)break;
   const f=ch.bus.uartRx(raw,item.at-1e7/u.baud),value=f.value;r.api.uart?.({instance:ch.id,direction:'RX',bytes:[value],micros:r.microTime});
   const errors=(f.pe?8:0)|(f.fe?16:0);
   if(errors){this.uartEvent(r,ch,errors,value,'eri');continue;}
   if(ch.rx){r.set(r.pointerCell(ch.rx.buffer,ch.rx.index++),value);if(ch.rx.index===ch.rx.count){ch.rx=null;if(st.dtcRx)st.dtcRx.enabled=false;this.uartEvent(r,ch,1,0,'rxi');}}
   else this.uartEvent(r,ch,4,value,'rxi');
  }
 }
 // An aborted (or closed) transmission: the bytes not sent yet stay, its TX_DATA_EMPTY / TX_COMPLETE do not come.
 // The state of a UART's DTC transfer (opened by R_SCI_UART_Open, as r_sci_uart opens it).
 uartTransfer(t){const name=`${t.name}_ctrl`;if(!this.states.has(name))this.states.set(name,{open:false,name,channel:t.n});const st=this.states.get(name);if(!st.driver)Object.assign(st,{driver:'DTC',n:t.n,event:t.activation,own:t.own,callback:'',enabled:false});return st;}
 // R_DTC_InfoGet on a UART's transfer: what is left of the write (each TXI moves one byte) or of the read.
 uartTransferRemaining(r,st){
  const ch=this.serials.get('SCI'+st.uart);if(!ch)return 0;
  if(st.dir==='rx')return ch.rx?ch.rx.count-ch.rx.index:0;
  const tx=ch.tx;if(!tx||tx.transfer!==st)return 0;const done=Math.min(tx.count-1,Math.floor((r.microTime-tx.start)/tx.frame+1e-9)+1);return Math.max(0,tx.count-1-done);
 }
 uartStop(r,ch){ch.txAbort++;ch.txGen++;ch.txFree=0;ch.txEnd=r.microTime;this.dropJobs(`SCI${ch.channel}:txi:`);this.dropJobs(`SCI${ch.channel}:tei:`);}
 dropJobs(prefix){this.pending=this.pending.filter(j=>!String(j.key).startsWith(prefix));}
 uartEvent(r,ch,event,data,isr){const st=ch.st;if(!st?.open||!st.callback)return;this.queue(r,`SCI${ch.channel}_${isr.toUpperCase()}`,st.ipl,()=>this.callback(r,st.callback,'uart_callback_args_t',{channel:ch.channel,event,data}),`sci_uart_${isr}_isr`,`SCI${ch.channel}:${isr}:${this.seq}`);}
 // ---- timers: GPT (saw-wave PWM, periodic) and AGT (periodic); a cycle end every period while counting.
 timerOpen(r,args,fn,kind){
  const st=this.instance(args[0],r,fn,kind);if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(args[1],r,'timer_cfg_t',fn),f=k=>Number(cfg.fields[k].value);
  const t=(kind==='gpt'?this.inst.gpts:this.inst.agts).find(x=>x.channel===st.channel);
  const source=kind==='gpt'?this.pclkd:t?.counts.source==='LOCO'?32768:this.pclkb;
  Object.assign(st,{open:true,kind,lowSpeed:kind==='agt'&&t?.counts.source==='LOCO',running:false,mode:f('mode'),period:f('period_counts')>>>0,duty:[f('duty_cycle_counts')>>>0,f('duty_cycle_counts')>>>0],hz:source/2**f('source_div'),ipl:f('cycle_end_ipl'),callback:f('cycle_end_ipl')===0xFF?'':t?.callback||'',counter:0,gen:(st.gen||0)+1,
   pins:kind==='gpt'?[this.pinOf(`GPT${st.channel}_GTIOCA`),this.pinOf(`GPT${st.channel}_GTIOCB`)]:[]});
  if(!(st.period>0))throw new Error(`${fn}: period_counts는 1 이상입니다.`);
  return FSP.SUCCESS;
 }
 periodUs(st){return st.period/st.hz*1e6;}
 timerStart(r,st){
  st.running=true;st.gen++;const gen=st.gen;st.next=r.microTime+this.periodUs(st)*(1-st.counter/st.period);st.counter=0;
  const fire=()=>{if(st.gen!==gen||!st.running)return;st.last=st.next;
   if(st.kind==='agt')this.lpmRequest(r,`AGT${st.channel}_INT`);
   const event=st.kind==='gpt'?`GPT${st.channel}_COUNTER_OVERFLOW`:`AGT${st.channel}_INT`,cpu=this.fspEvent(r,event);
   if(cpu&&st.callback)this.queue(r,event,st.ipl,()=>this.callback(r,st.callback,'timer_callback_args_t',{event:0}),st.kind==='gpt'?'gpt_counter_overflow_isr':'agt_int_isr');
   if(st.mode===1){st.running=false;this.pwm(r,st);return;}
   // A period set while counting (buffered, GTPBR / AGT reload) takes over at this overflow.
   if(st.newPeriod!=null){st.period=st.newPeriod;st.newPeriod=null;st.duty=st.duty.map(d=>Math.min(d,st.period));this.pwm(r,st);}
   st.next+=this.periodUs(st);r.event(st.next/1000,fire);};
  st.last=r.microTime;r.event(st.next/1000,fire);this.pwm(r,st);
 }
 // R_GPT_PeriodSet / R_AGT_PeriodSet: a stopped timer gets the period at once and its counter cleared (GTCLR); a counting
 // one keeps the current cycle and the counter until the next overflow.
 periodSet(r,st,period){if(st.running){st.newPeriod=period;return;}st.period=period;st.newPeriod=null;st.counter=0;this.pwm(r,st);}
 timerStop(r,st){if(st.running)st.counter=this.counter(r,st);st.running=false;st.gen++;this.pwm(r,st);}
 counter(r,st){if(!st.running)return st.counter;const c=Math.floor((r.microTime-(st.next-this.periodUs(st)))*st.hz/1e6);return Math.max(0,Math.min(st.period-1,c));}
 // Saw-wave PWM on the GTIOC pins: high from the cycle start for duty counts (0 % low, 100 % high), the stop level
 // (low) while stopped. With the waveform option on, the pin toggles edge by edge as analogWrite does.
 pwm(r,st){
  // I/O hold (IOKEEP): the pins stay as they are; lpmRelease applies the outputs of the timers when the hold ends.
  if(st.kind!=='gpt'||st.mode!==2||this.hold)return;
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
 // A transfer: the bytes are exchanged with the bus model now, but it runs in the background as on the RIIC — the
 // caller goes on at once, the bus stays busy (FSP_ERR_IN_USE) for its 9 SCL periods a byte, then the ISR reports it.
 iicTransfer(r,st,transfer){
  this.iicSelect(r,st);const t0=r.microTime,event=transfer(),end=r.microTime;r.microTime=t0;
  const id=++this.seq;st.busy=id;
  r.event(end/1000,()=>{if(st.busy!==id)return;st.busy=0;if(st.open)this.queue(r,`IIC${st.channel}_TEI`,st.ipl,()=>this.callback(r,st.callback,'i2c_master_callback_args_t',{event}),event===1?'iic_master_eri_isr':'iic_master_tei_isr',`IIC${st.channel}:${id}`);});
 }
 // R_IIC_MASTER_Abort / Close: the bus is released, the transfer's completion is dropped and no callback comes.
 iicStop(st){st.busy=0;this.dropJobs(`IIC${st.channel}:`);}
 // ---- IIC slave (r_iic_slave): another board's I²C master reaches it a transfer at a time (i2cSlaveInfo / Receive /
 // Request, the calls the HAL adapter's I2C slave answers), and the driver's interrupt handlers (r_iic_slave.c
 // iic_rxi_slave, iic_txi_slave, iic_tei_slave, iic_err_slave) run on it byte by byte with the same bookkeeping (total,
 // loaded, transaction_count, direction), so the callback sees the events, their order and the byte counts FSP gives.
 // The callback runs at once, inside the master's transfer: SCL is held while it runs (clock stretching).
 slaveOpen(){for(const st of this.states.values())if(st.kind==='iicSlave'&&st.open)return st;return null;}
 i2cSlaveInfo(){const st=this.slaveOpen();return st?{address:st.address,sda:st.sda,scl:st.scl}:null;}
 slaveEvent(r,st,event,bytes){
  const fn=st.callback;if(!fn)return;
  if(!r.program.functions[fn]){this.warnOnce(r,'cb:'+fn,`[FSP] 콜백 ${fn}()이 hal_entry.c에 없어 인터럽트에서 부르지 않습니다. ARM GCC 빌드에서는 링크 오류(undefined reference)가 납니다.`);return;}
  const value=r.defaultValue('i2c_slave_callback_args_t',r.globals);value.fields.event.value=event;value.fields.bytes.value=bytes>>>0;if(st.context)value.fields.p_context.value=st.context;
  this.buses.trace?.({micros:r.microTime,protocol:'I²C',message:`IIC${st.channel} 슬레이브 · ${['','ABORTED','RX_COMPLETE','TX_COMPLETE','RX_REQUEST','TX_REQUEST','RX_MORE_REQUEST','TX_MORE_REQUEST'][event]} · ${bytes>>>0} B`});
  r.runCallback({name:fn,args:[{kind:'pointer',cell:{value,owner:r.globals,constant:false,dataType:'i2c_slave_callback_args_t'}}]});
 }
 // iic_slave_notify: the end of a transfer (or its abort) with the bytes moved.
 slaveNotify(r,st,event){const count=st.count;st.count=0;st.direction=2;this.slaveEvent(r,st,event,count);}
 // The master wrote `bytes` after the address. false: a byte was answered with NACK (or the transfer was aborted).
 i2cSlaveReceive(bytes,r){
  const st=this.slaveOpen();if(!st)return false;let notified=false,ok=true,hang=false,taken=0;
  const request=event=>{st.direction=2;this.slaveEvent(r,st,event,st.count);return st.direction===1;};
  const store=b=>{r.set(r.pointerCell(st.buffer,st.loaded++),b);st.count++;};
  for(const b of bytes){
   // The byte's ACK is ACKBT as the handler of the byte before left it.
   const ack=!st.nack;if(!ack)ok=false;taken++;
   if(!notified){notified=true;const served=request(4);if(!st.open)break;if(!served){st.nack=true;hang=true;break;}}
   if(st.total===0)st.nack=true;
   else if(st.total===st.loaded){const served=request(6);if(!st.open)break;if(!served){st.nack=true;hang=true;break;}if(st.total===0)st.nack=true;else store(b);}
   else store(b);
   if(!ack)break; // the master stops after a NACK
  }
  // R_IIC_SLAVE_Close in the callback (ICIER = 0, module stop): the driver takes nothing more and reports nothing more.
  if(!st.open)return ok&&taken===bytes.length;
  // No R_IIC_SLAVE_Read in the callback: NACK without the dummy read, SCL stays low until the time-out → ABORTED.
  // The byte itself had its ACK before the callback ran (ACKBT was 0); only a byte after it meets the NACK.
  if(hang){this.slaveNotify(r,st,1);return ok&&taken===bytes.length;}
  if(st.direction===1){st.nack=false;this.slaveNotify(r,st,2);}
  else{if(st.total>st.loaded)st.count=(st.count-1)>>>0;this.slaveNotify(r,st,3);}
  return ok;
 }
 // The address with W and a STOP, no data (a bus scan): no buffer was asked for, so iic_err_slave reports TX_COMPLETE.
 i2cSlaveProbe(r){this.i2cSlaveReceive([],r);}
 // The master reads `count` bytes after the address; 0xFF where the slave has nothing to send.
 i2cSlaveRequest(count,r){
  const st=this.slaveOpen(),out=[];if(!st){while(out.length<count)out.push(0xff);return out;}
  let shift=null,hold=null,tei=false,aborted=false;
  const next=()=>{const v=Number(r.get(r.pointerCell(st.buffer,st.loaded++)))&255;st.count++;return v;};
  // ICDRT moves to the shift register at once (TDRE, the next TXI), so the driver is one byte ahead.
  const write=v=>{if(shift==null){shift=v;txi();}else hold=v;};
  const txi=()=>{if(st.direction!==0)return;if(st.total===st.loaded)tei=true;else write(next());};
  st.direction=2;this.slaveEvent(r,st,5,st.count);if(st.open)txi();
  for(let i=0;i<count&&st.open;i++){
   if(shift==null){aborted=true;break;} // nothing in ICDRT: SCL held until the time-out
   out.push(shift);shift=null;
   if(i===count-1)break; // the master's NACK: the transfer ends
   if(hold!=null){shift=hold;hold=null;txi();}
   else if(tei){tei=false;st.direction=2;this.slaveEvent(r,st,7,st.count);if(st.open&&st.direction===0&&st.total>0)write(next());}
  }
  while(out.length<count)out.push(0xff);
  // Closed in the callback: 0xFF for what was not sent, and no further event.
  if(!st.open)return out;
  if(aborted||st.direction!==0){this.slaveNotify(r,st,1);return out;}
  if(st.total>st.loaded)st.count=(st.count-1)>>>0;
  this.slaveNotify(r,st,3);return out;
 }
 slaveReadWrite([ctrl,buffer,count],r,fn,direction){
  const st=this.instance(ctrl,r,fn,'iicSlave');if(buffer==null||buffer===0)return FSP.ASSERTION;
  if(!st.open)return FSP.NOT_OPEN;if(st.direction!==2)return FSP.IN_USE;
  int(count,0,65535,`${fn} 길이`);if(count)r.pointerCell(buffer,count-1);
  Object.assign(st,{buffer,total:count,loaded:0,direction,nack:false});return FSP.SUCCESS;
 }
 // ---- SPI masters: r_spi (RSPI, SPIn) and r_sci_spi (SCIn simple SPI) on the circuit's SPI engine, the devices the STM32
 // HAL interpreter and the RA6E1 emulator (emu/ra6e1/spi.js exchangeFrame) reach: a frame of 8-32 bits goes out MSB
 // byte first, its bits reversed for LSB first. SSL0 (r_spi 4-wire) is driven low for the transfer; without it the
 // program drives a GPIO as CS.
 spiOpen([ctrl,cfgPtr],r,fn,kind){
  const st=this.instance(ctrl,r,fn,kind);if(st.open)return FSP.ALREADY_OPEN;
  const cfg=this.struct(cfgPtr,r,'spi_cfg_t',fn),f=k=>Number(cfg.fields[k].value),rspi=kind==='spi',id=(rspi?'SPI':'SCI')+st.channel;
  const t=(rspi?this.inst.spis:this.inst.sciSpis).find(x=>x.channel===st.channel);
  if(!t)throw new Error(`${fn}: Stacks에서 ${rspi?`${id} (r_spi)`:`${id} Simple SPI (r_sci_spi)`}를 추가하세요.`);
  if(f('operating_mode')!==0)throw new Error(`${fn}: 내장 해석기는 SPI 마스터(SPI_MODE_MASTER)만 실행합니다.`);
  // The bit rate and the slave select from the extended configuration (spck_div / clk_div, spi_clksyn).
  let ext=null;try{ext=r.get(r.pointerCell(cfg.fields.p_extend.value));}catch{ext=null;}
  const sub=(name,key,fallback)=>{const v=ext?.fields?.[name]?.value?.fields?.[key]?.value;return v==null?fallback:Number(v);},pclka=raClockHz(this.config,'pclka');
  const hz=rspi?pclka/(2*(sub('spck_div','spbr',t.div.spbr)+1)*2**sub('spck_div','brdv',t.div.brdv)):pclka/(4*4**sub('clk_div','cks',t.div.cks)*(sub('clk_div','brr',t.div.brr)+1));
  const fourWire=rspi&&(ext?.fields?.spi_clksyn?Number(ext.fields.spi_clksyn.value)===0:t.ssl==='SSL0');
  const pin=s=>this.pinOf(`${id}_${s}`),sck=pin(rspi?'RSPCK':'SCK'),mosi=pin(rspi?'MOSI':'TXD'),miso=pin(rspi?'MISO':'RXD'),ssl=fourWire?pin('SSL0'):null;
  if(!sck||!mosi)throw new Error(`${fn}: 내장 해석기는 ${id}의 ${rspi?'RSPCK':'SCK'}와 ${rspi?'MOSI':'TXD(MOSI)'} 핀을 정한 SPI만 실행합니다(Pins).`);
  if(fourWire&&!ssl)throw new Error(`${fn}: ${id}의 Slave Select가 SSL0이면 Pins에서 SSL0 핀을 정하세요.`);
  // Only SSL0 has a pin here (Pins and the generator offer no SSL1-3): another ssl_select is said, not driven on SSL0.
  if(fourWire&&Number(ext?.fields?.ssl_select?.value??0)!==0)throw new Error(`${fn}: 내장 해석기는 SSL0만 구동합니다(spi_extended_cfg_t ssl_select = SPI_SSL_SELECT_SSL0). 다른 SSL은 시뮬레이터 실행 방식을 ARM GCC 빌드로 바꿔 실행하세요.`);
  // SSL0 polarity (spi_extended_cfg_t ssl_polarity): SPI_SSLP_LOW (0) is active low; the callback gets p_cfg->p_context.
  const sslActive=rspi&&Number(ext?.fields?.ssl_polarity?.value??0)===1?1:0,context=cfg.fields.p_context?.value;
  Object.assign(st,{open:true,busy:0,id,rspi,hz,sck,mosi,miso,ssl,sslActive,cpol:f('clk_polarity')&1,cpha:f('clk_phase')&1,lsb:f('bit_order')===1,ipl:f('tei_ipl'),callback:t.callback,context:context?.kind==='pointer'?context:null});
  // The pins as the module drives them: RSPCK idles at CPOL, MOSI low, SSL0 inactive, MISO an input.
  r.call('pinMode',[sck,'OUTPUT']);r.call('digitalWrite',[sck,st.cpol]);r.call('pinMode',[mosi,'OUTPUT']);r.call('digitalWrite',[mosi,0]);
  if(miso)r.call('pinMode',[miso,'INPUT']);if(ssl){r.call('pinMode',[ssl,'OUTPUT']);r.call('digitalWrite',[ssl,sslActive^1]);}
  this.activeSpi=null;return FSP.SUCCESS;
 }
 spiSelect(r,st){
  if(this.activeSpi!==st.name){this.activeSpi=st.name;this.buses.spiId=st.id;this.buses.call('SPI.setPins',[st.mosi,st.miso,st.sck],r);}
  Object.assign(this.buses.spi,{ready:true,clock:Math.round(st.hz),cpol:st.cpol,cpha:st.cpha,lsbFirst:st.lsb});
 }
 // A buffer of frames as the driver reaches it: through a uint8_t, uint16_t or uint32_t pointer by the frame width
 // (8, 9-16, 20-32 bits), whatever the C type of the buffer is (little-endian memory: a uint8_t buffer holds a 16-bit
 // frame in two elements, low byte first; a uint32_t buffer holds four 8-bit frames).
 spiBuffer(r,ptr,count,bits){
  const size=bits<=8?1:bits<=16?2:4;
  if(typeof ptr==='string')return {read:i=>i*size<ptr.length?[...ptr.slice(i*size,i*size+size)].reduce((v,c,j)=>v+(c.charCodeAt(0)&255)*256**j,0):0,write(){}};
  const first=r.pointerCell(ptr),type=String(first.dataType||''),integer=/^(unsigned |signed )?(char|short|int|long|bool|_Bool)|^u?int(8|16|32)_t$|^(uint|int|bool)$/.test(type)&&!/\*/.test(type);
  const elem=integer?r.typeSize(type):size,cell=i=>r.pointerCell(ptr,i),bytesOf=v=>2**(8*elem);
  const u=i=>{const v=Number(r.get(cell(i)));return ((v%bytesOf())+bytesOf())%bytesOf();};
  if(![1,2,4].includes(elem)||elem===size){r.pointerCell(ptr,count-1);return {read:i=>u(i),write:(i,v)=>r.set(cell(i),v)};}
  if(elem<size){const n=size/elem;r.pointerCell(ptr,count*n-1);
   return {read:i=>Array.from({length:n},(_,j)=>u(i*n+j)*bytesOf()**j).reduce((a,b)=>a+b,0),write:(i,v)=>{for(let j=0;j<n;j++)r.set(cell(i*n+j),Math.floor(v/bytesOf()**j)%bytesOf());}};}
  const k=elem/size,span=2**(8*size);r.pointerCell(ptr,Math.ceil(count/k)-1);
  return {read:i=>Math.floor(u(Math.floor(i/k))/span**(i%k))%span,write:(i,v)=>{const at=Math.floor(i/k),old=u(at),shift=span**(i%k),part=Math.floor(old/shift)%span;r.set(cell(at),old+(v%span-part)*shift);}};
 }
 // R_SPI_Write / Read / WriteRead: the frames are exchanged with the devices now, but the transfer runs in the background
 // as on the RSPI / SCI — the call returns at once, the channel is busy (FSP_ERR_IN_USE) for bits / bit rate a frame,
 // then the received frames are in the buffer, SSL0 goes inactive and the TEI interrupt calls back TRANSFER_COMPLETE.
 // The parameter checks come in the drivers' order (BSP_CFG_PARAM_CHECKING_ENABLE): r_sci_spi checks the bit width, the
 // buffers, then the open state; r_spi checks WriteRead's two buffers, then the open state, a buffer, the length and the
 // width (r_spi_write_read_common).
 spiTransfer(r,fn,kind,op,ctrl,tx,rx,count,width){
  const st=this.instance(ctrl,r,fn,kind),bits=Number(width)+1;
  if(kind==='sciSpi'){
   if(width!==7)return FSP.UNSUPPORTED;
   if(op!=='read'&&!tx||op!=='write'&&!rx)return FSP.ASSERTION;
   if(!st.open)return FSP.NOT_OPEN;
   if(!count)return FSP.ASSERTION;
  }else{
   if(op==='both'&&(!tx||!rx))return FSP.ASSERTION;
   if(!st.open)return FSP.NOT_OPEN;
   if(!tx&&!rx||!count||!(bits>=8&&bits<=16||bits===20||bits===24||bits===32))return FSP.ASSERTION;
  }
  if(st.busy)return FSP.IN_USE;
  int(count,1,4096,`${fn} 길이(내장 해석기는 한 번에 4096프레임까지)`);
  const source=tx?this.spiBuffer(r,tx,count,bits):null,dest=rx?this.spiBuffer(r,rx,count,bits):null;
  const mask=2**bits,frameUs=bits*1e6/st.hz,t0=r.microTime;
  const out=Array.from({length:count},(_,i)=>source?source.read(i)%mask:0);
  this.spiSelect(r,st);if(st.ssl)r.call('digitalWrite',[st.ssl,st.sslActive]);
  // Each frame reaches the devices as the RA6E1 emulator gives it to them (exchangeFrame: whole bytes, MSB byte first,
  // bits reversed for LSB first); the logic analyzer gets the frames with their real length and bit order.
  // The circuit's noise, as encodeSpi gives it to the STM32 SPI: bit errors on MOSI reach the devices, bit errors on MISO
  // the receive buffer, and the clock line gets jitter and glitches.
  const soc={spiTransfer:(name,pins,byte)=>this.buses.spiRespond(byte,r)},noise=this.buses.noise?.active?this.buses.noise:null;
  const flip=v=>{if(noise)for(let k=0;k<bits;k++)if(noise.flip())v=(v^(1<<k))>>>0;return v;};
  const seen=out.map(flip),got=seen.map(value=>flip(exchangeFrame(soc,st.id,null,value,bits,{lsbFirst:st.lsb})>>>0));
  const lines=this.buses.spiLines();
  if(lines){
   const e=encodeSpiFrames(t0,seen.map((v,i)=>({tx:v,rx:got[i]})),{clockHz:st.hz,cpol:st.cpol,cpha:st.cpha,lsbFirst:st.lsb,bits,...(noise?{noise}:{})});
   this.buses.signals.write(lines+'.SCK',e.sck);this.buses.signals.write(lines+'.MOSI',e.mosi);if(st.miso)this.buses.signals.write(lines+'.MISO',e.miso);
   // This transfer's frame width and bit order for the decoder (the line's parameters are only the latest transfer's).
   this.buses.signals.span(lines+'.SCK',{fromUs:t0,toUs:e.endUs,bits,lsbFirst:st.lsb});
  }
  const hex=list=>list.slice(0,8).map(v=>v.toString(16).toUpperCase().padStart(Math.ceil(bits/4),'0')).join(' ')+(list.length>8?' …':'');
  this.buses.report(r,'SPI',`${st.id} · ${count} × ${bits}비트 · TX ${hex(out)} · RX ${hex(got)}`);
  const id=++this.seq;st.busy=id;
  r.event((t0+count*frameUs)/1000,()=>{
   if(st.busy!==id)return;st.busy=0;
   if(dest)got.forEach((v,i)=>dest.write(i,v));
   if(st.ssl)r.call('digitalWrite',[st.ssl,st.sslActive^1]);
   const fields={channel:st.channel,event:1,...(st.context?{p_context:st.context}:{})};
   if(st.open)this.queue(r,`${st.id}_TEI`,st.ipl,()=>this.callback(r,st.callback,'spi_callback_args_t',fields),st.rspi?'spi_tei_isr':'sci_spi_tei_isr',`${st.id}:spi:${id}`);
  });
  return FSP.SUCCESS;
 }
 // R_SPI_Close / R_SCI_SPI_Close: a transfer under way stops (its buffer is not filled, no callback), SSL0 goes inactive.
 spiClose(args,r,fn,kind){
  const st=this.instance(args[0],r,fn,kind);if(!st.open)return FSP.NOT_OPEN;
  st.busy=0;this.dropJobs(`${st.id}:spi:`);if(st.ssl)r.call('digitalWrite',[st.ssl,st.sslActive^1]);st.open=false;if(this.activeSpi===st.name)this.activeSpi=null;return FSP.SUCCESS;
 }
 // CallbackSet asserts the callback before the open state (r_spi.c, r_sci_spi.c).
 spiCallbackSet([ctrl,callback,context],r,fn,kind){
  const st=this.instance(ctrl,r,fn,kind);if(!callback)return FSP.ASSERTION;if(!st.open)return FSP.NOT_OPEN;
  st.callback=r.callback(callback).name;st.context=context?.kind==='pointer'?context:null;return FSP.SUCCESS;
 }
 // ---- watchdogs (WDT: PCLKB / divider; IWDT: 15 kHz / divider). The settings are the Stacks' (they are OFS0 for an
 // auto-started one; R_WDT_Open checks the cfg against them). The counter runs down from timeout - 1; an underflow or a
 // refresh outside the window resets the program (RSTSR1 WDTRF / IWDTRF) or, with NMI, calls the callback from the NMI.
 wdtState(id){
  const key=id==='WDT'?'g_wdt0_ctrl':'g_iwdt0_ctrl';
  if(!this.states.has(key)){const p={...RA_WDT[id].defaults,windowStart:100,windowEnd:0,reset:'RESET',...this.config.peripherals?.[id]};this.states.set(key,{name:key,channel:0,id,open:false,running:false,armed:false,flags:0,gen:0,count:0,t0:0,
   timeout:p.timeout,div:p.clockDiv,windowStart:p.windowStart,windowEnd:p.windowEnd,reset:p.reset,stop:!!p.stopInSleep,auto:id==='IWDT'||p.startMode==='AUTO',callback:p.callback||''});}
  return this.states.get(key);
 }
 wdtHz(st){return (st.id==='IWDT'?RA_IWDT_HZ:this.pclkb)/st.div;}
 wdtCounter(r,st){if(!st.running)return st.count;return Math.max(0,st.count-Math.floor((r.microTime-st.t0)*this.wdtHz(st)/1e6+1e-6));}
 wdtStart(r,st){st.count=st.timeout-1;this.wdtCount(r,st);}
 // The counter runs down from st.count from now on (a start, or the end of a low power mode that had stopped it).
 wdtCount(r,st){
  st.running=true;st.t0=r.microTime;const gen=++st.gen;
  r.event((st.t0+(st.count+1)/this.wdtHz(st)*1e6)/1000,()=>{if(st.gen===gen&&st.running)this.wdtExpire(r,st,0x4000,`${(st.timeout/this.wdtHz(st)*1000).toFixed(1)} ms 안에 R_${st.id}_Refresh가 없었습니다`);});
 }
 // A low power mode stops the count clock: the counter keeps its value (lpmFreeze / lpmThaw).
 wdtFreeze(r,st){if(!st.running)return false;st.count=this.wdtCounter(r,st);st.running=false;st.gen++;return true;}
 // What a failed watchdog does: it stops with its flag set. With Reset output the reset is prepared here (the cause, the
 // log entry, the guard against a reset loop) and done by the caller: r.restart() from a timed event (wdtExpire), or
 // `yield {kind:'reset'}` from the call that broke the window (wdtBadRefresh) — a restart from inside a call would pull
 // the scopes from under the statement that is running. Returns whether the program is to be reset.
 wdtFail(r,st,flag,why){
  st.running=false;st.count=0;st.flags|=flag;st.gen++;
  if(st.reset!=='RESET'){
   // NMI (RSTIRQS 0): the BSP's NMI_Handler calls the driver's group callback, which calls the user's; above every
   // interrupt priority, also with interrupts disabled.
   if(st.open&&st.callback)this.queue(r,'NMI',-2,()=>this.callback(r,st.callback,'wdt_callback_args_t',this.contextField(st)),'NMI_Handler',`NMI:${st.id}`);
   return false;
  }
  // A watchdog that resets again and again within a few milliseconds would restart the program forever (HalWdg).
  const recent=(this.wdtResets??=[]);recent.push(r.microTime);while(recent.length>10)recent.shift();
  if(recent.length===10&&recent[9]-recent[0]<20000)throw new Error(`[${st.id}] 워치독 리셋이 계속 반복됩니다(${why}). Stacks의 g_${st.id.toLowerCase()}0에서 Timeout·클록 분주를 키우거나 제때 R_${st.id}_Refresh를 부르세요.`);
  this.resetCause=st.id;r.warn(`[${st.id}] ${why} — 워치독 리셋: 프로그램을 처음부터 다시 실행합니다(RSTSR1.${st.id}RF).`);return true;
 }
 wdtExpire(r,st,flag,why){if(this.wdtFail(r,st,flag,why))r.restart();}
 // Why a refresh now is outside the refresh-permitted window ('' when it is inside, or the counter is not running).
 wdtWindowError(r,st){
  if(!st.running)return '';const left=(this.wdtCounter(r,st)+1)/st.timeout*100;
  // The end position itself is inside the window (1024 clocks, end 75 %: the counter value 0x2FF may still refresh), as
  // in the emulator model (emu/ra6e1/wdt.js).
  return left>st.windowStart+1e-9||st.windowEnd>0&&left<st.windowEnd-1e-9?`허용 창(남은 카운트 ${st.windowEnd}~${st.windowStart} %) 밖에서 R_${st.id}_Refresh를 불렀습니다(남은 ${left.toFixed(1)} %)`:'';
 }
 wdtRefresh(r,st){
  if(!st.running){if(!st.auto)st.armed=true;this.wdtStart(r,st);return;}
  // With Reset output a refresh outside the window does not get here (invoke → wdtBadRefresh); this is the NMI.
  const why=this.wdtWindowError(r,st);if(why){this.wdtExpire(r,st,0x8000,why);return;}
  this.wdtStart(r,st);
 }
 // R_WDT_Refresh / R_IWDT_Refresh outside the window with Reset output: the program does not run past the call (as
 // HalWdg does for HAL_WWDG_Refresh above the window).
 wdtBadRefresh(name,args,r){
  const id=name==='R_WDT_Refresh'?'WDT':'IWDT';if(!this.config.peripherals?.[id]?.enabled)return null;
  const st=this.wdtInstance(args,r,name,id);if(!st.open||st.reset!=='RESET')return null;
  const why=this.wdtWindowError(r,st);if(!why)return null;
  const self=this;return (function*(){if(self.wdtFail(r,st,0x8000,why))yield {kind:'reset'};})();
 }
 // ---- RTC: the calendar model with no scheduler of its own; the alarm and periodic interrupts are timed here.
 rtcModel(r){
  if(!this.rtcDev){const p=this.config.peripherals?.RTC||{},soc={r,nowUs:()=>soc.r?.microTime??0,options:{rtcStart:p.start,hostTime:this.hostTime},listens:()=>false,raiseEvent(){},atUs:()=>null};this.rtcDev=new Rtc(soc);}
  if(r)this.rtcDev.soc.r=r;return this.rtcDev;
 }
 rtcInstance(args,r,fn){
  const st=this.instance(args[0],r,fn,'rtc');if(!this.config.peripherals?.RTC?.enabled)throw new Error(`${fn}: Stacks에서 g_rtc0 (r_rtc)을 추가하세요.`);
  return st;
 }
 rtcCall(args,r,fn,action){const st=this.rtcInstance(args,r,fn);if(!st.open)return FSP.NOT_OPEN;return action(st,this.rtcModel(r));}
 // r_rtc_set_clock_source: stop, software reset (the alarm registers), interrupts off, 24-hour mode.
 rtcInit(dev){dev.write(0x24,0,1);dev.write(0x24,2,1);dev.write(0x22,0,1);dev.write(0x24,0x40,1);}
 rtcTime(ptr,r,fn){const v=this.struct(ptr,r,null,fn);if(!['rtc_time_t','tm'].includes(v.type))throw new Error(`${fn}: rtc_time_t(struct tm) 구조체의 주소가 필요합니다.`);return v;}
 // r_rtc_date_validate: the date of a 2000-2099 calendar (every fourth year a leap year), and tm_wday by Zeller.
 rtcDate(t,r){
  const g=k=>Number(t.fields[k].value),mon=g('tm_mon'),year=g('tm_year');
  if(year<100||year>199||mon<0||mon>11)return false;
  const days=mon===1&&(year+1900)%4===0?29:RTC_DAYS[mon];if(g('tm_mday')<1||g('tm_mday')>days)return false;
  let m=mon+1,y=year+1900;if(m<3){m+=12;y--;}const h=(g('tm_mday')+Math.floor(13*(m+1)/5)+y+Math.floor(y/4)-15)%7;
  this.setField(t,'tm_wday',(h+6)%7,r);return true;
 }
 rtcPlan(r,st){
  const dev=this.rtcModel(r),gen=++st.gen;if(!dev.running)return;
  const every=(us,fn)=>{const step=k=>r.event((dev.anchor+k*us)/1000,()=>{if(st.gen!==gen)return;fn();step(k+1);});step(Math.floor((r.microTime-dev.anchor)/us+1e-9)+1);};
  // The alarm is planned first: at the same instant and priority its request comes before the periodic one's, as the
  // lower vector number (RTC_ALARM before RTC_PERIOD) is taken first.
  if(st.aie)every(1e6,()=>{const match=dev.alarmMatch();if(match&&!dev.matched)this.rtcIrq(r,st,'ALARM',0,st.alarmIpl);dev.matched=match;});
  if(st.pie&&RTC_PERIOD_S[st.pes])every(RTC_PERIOD_S[st.pes]*1e6,()=>this.rtcIrq(r,st,'PERIOD',2,st.periodicIpl));
 }
 // R_x_CallbackSet(ctrl, p_callback, p_context, p_callback_memory) as r_rtc.c / r_wdt.c / r_iwdt.c check it: a NULL
 // callback is an assertion (before the open state is looked at); the context is handed to the callback.
 callbackSet(st,[,callback,context],r){
  if(!callback)return FSP.ASSERTION;if(!st.open)return FSP.NOT_OPEN;
  st.callback=r.callback(callback).name;st.context=context?.kind==='pointer'?context:null;return FSP.SUCCESS;
 }
 contextField(st){return st.context?{p_context:st.context}:{};}
 rtcIrq(r,st,kind,event,ipl){this.lpmRequest(r,'RTC_'+kind);if(st.open&&st.callback)this.queue(r,'RTC_'+kind,ipl,()=>this.callback(r,st.callback,'rtc_callback_args_t',{event,...this.contextField(st)}),'rtc_alarm_periodic_isr',`RTC:${kind}`);}
 wdtInstance(args,r,fn,id){
  this.wdtState(id);const st=this.instance(args[0],r,fn,id.toLowerCase());
  if(!st.id)throw new Error(`${fn}: Stacks의 g_${id.toLowerCase()}0 제어 구조체 주소(&g_${id.toLowerCase()}0_ctrl)를 넘기세요.`);
  if(!this.config.peripherals?.[id]?.enabled)throw new Error(`${fn}: Stacks에서 g_${id.toLowerCase()}0 (${id==='WDT'?'r_wdt':'r_iwdt'})을 추가하세요.`);
  return st;
 }
 wdtCall(args,r,fn,id,action){const st=this.wdtInstance(args,r,fn,id);if(!st.open)return FSP.NOT_OPEN;return action(st);}
 // ---- low power modes (r_lpm): what the emulator does with the registers r_lpm.c writes (emu/ra6e1/lpm.js), here on the
 // adapter's own state. r_lpm_configure: the checks of r_lpm_mcu_specific_low_power_check in their order, then SBYCR,
 // WUPEN / WUPEN1, DPSIER, DPSIEGR and DPSBYCR (which every configure writes: a mode other than Deep Software Standby
 // clears IOKEEP).
 lpmConfigure(r,cfgPtr,fn){
  if(!cfgPtr)return FSP.ASSERTION;
  const cfg=this.struct(cfgPtr,r,'lpm_cfg_t',fn),f=k=>Number(cfg.fields[k].value)>>>0,mode=f('low_power_mode'),reg=this.lpmReg;
  if(mode===1)return FSP.UNSUPPORTED; // LPM_MODE_DEEP_SLEEP: BSP_FEATURE_LPM_HAS_DEEP_SLEEP 0
  const source=f('deep_standby_cancel_source'),edge=f('deep_standby_cancel_edge'),lo=f('standby_wake_sources'),hi=f('fsp_interp_wake_sources_high');
  if(mode!==0){
   if(mode===3)throw new Error(`${fn}: 내장 해석기는 Snooze 모드(LPM_MODE_STANDBY_SNOOZE)를 실행하지 않습니다. Sleep · Software Standby · Deep Software Standby를 쓰거나 ARM GCC 빌드로 실행하세요.`);
   if(mode===4&&((source&~RA_LPM_DPSIER_MASK)>>>0||(edge&~RA_LPM_DPSIEGR_MASK)>>>0||(edge&~source)>>>0))return FSP.INVALID_MODE;
   if((lo&~(RA_LPM_WUPEN_MASK>>>0))>>>0||hi&~Math.floor(RA_LPM_WUPEN_MASK/2**32))return FSP.INVALID_MODE;
   if(mode===4){reg.dpsier=source;reg.dpsiegr=edge;}
   reg.wupenLo=lo;reg.wupenHi=hi;
  }
  reg.set=true;reg.ssby=mode!==0;reg.dpsby=mode===4;reg.deepcut=mode===4?f('power_supply_state')&3:0;reg.iokeep=mode===4?f('io_port_state')&1:0;
  if(!reg.iokeep)this.lpmRelease(r);
  return FSP.SUCCESS;
 }
 // DPSBYCR.IOKEEP cleared: the pins take what the program set since the restart; a pin it did not set is in its reset state.
 lpmRelease(r){
  if(!this.hold)return;this.hold=false;
  for(const pin of this.heldPins?.keys()??[])if(!this.heldWrites.has(pin)){delete r.gpio[pin];r.pwm.delete(pin);}
  const writes=[...this.heldWrites];this.heldWrites=new Map();this.heldPins=null;
  for(const [pin,w]of writes){if(w.word!==undefined)this.applyPinCfg(r,pin,w.word,w.fn);if(w.level!==undefined&&r.gpio[pin]?.mode==='OUTPUT')this.pinWrite(r,pin,w.level,w.fn);}
  // A GPT started meanwhile drives its pins from now on (the pin settings above put them at the stop level).
  for(const st of this.states.values())if(st.kind==='gpt'&&st.open)this.pwm(r,st);
  r.api.changed?.(r.microTime);
 }
 lpmState(kind,n){return this.states.get({icu:`g_external_irq${n}_ctrl`,agt:`g_agt${n}_ctrl`,rtc:'g_rtc0_ctrl'}[kind]);}
 /** Whether an interrupt request ends Software Standby: its source's bit in WUPEN / WUPEN1 (the IWDT's NMI: bit 16). */
 lpmWakes(irq,key){
  const name=irq==='NMI'?(key==='NMI:IWDT'?'IWDT':null):lpmWakeOfIrq(irq),bit=name==null?null:RA_LPM_WAKE_BITS[name],reg=this.lpmReg;
  return bit!=null&&!!((bit<32?reg.wupenLo>>>bit:reg.wupenHi>>>(bit-32))&1);
 }
 /** An RTC or AGT request at its instant, whether or not an interrupt is set up for it: an enabled cancel source ends Deep Software Standby. */
 lpmRequest(r,irq){
  const low=this.low;if(low?.mode!=='DEEP'||low.cancel)return;
  const name=lpmCancelOfIrq(irq);if(name&&(this.lpmReg.dpsier>>>RA_LPM_CANCEL_BITS[name])&1){low.cancel=lpmCancelLabel(name);low.cancelBit=RA_LPM_CANCEL_BITS[name];}
 }
 // What stops in a mode (as emu/ra6e1/lpm.js freeze): a watchdog with its stop control in Sleep; in Software Standby the
 // WDT, the GPT timers and an AGT counting PCLKB; in Deep Software Standby also the IWDT, an AGT unless it counts LOCO
 // with DEEPCUT 0, and an RTC on LOCO without the LOCO supply (DEEPCUT 1 or 3).
 lpmFreeze(r,low){
  const mode=low.mode,reg=this.lpmReg;
  for(const id of ['WDT','IWDT']){const st=this.states.get(id==='WDT'?'g_wdt0_ctrl':'g_iwdt0_ctrl');if(st&&(st.stop||mode==='DEEP'||id==='WDT'&&mode!=='SLEEP')&&this.wdtFreeze(r,st))low.frozen.push(['watchdog',st]);}
  if(mode==='SLEEP')return;
  for(const st of this.states.values())if((st.kind==='gpt'||st.kind==='agt')&&st.open&&st.running&&!(st.lowSpeed&&(mode==='STANDBY'||reg.deepcut===0))){this.timerStop(r,st);low.frozen.push(['timer',st]);}
  const rtc=this.lpmState('rtc'),p=this.config.peripherals?.RTC;
  if(mode==='DEEP'&&reg.deepcut!==0&&p?.enabled&&this.rtcDev?.running&&(rtc?.open?rtc.clockSource===1:p.clockSource!=='SUBCLOCK')){if(rtc)rtc.gen=(rtc.gen||0)+1;this.rtcDev.stop();low.rtcStopped=true;low.frozen.push(['rtc',rtc]);}
 }
 lpmThaw(r,low){for(const [how,st]of low.frozen){if(how==='watchdog')this.wdtCount(r,st);else if(how==='timer')this.timerStart(r,st);}low.frozen=[];}
 isFrozen(low,st){return !!st&&low.frozen.some(([,x])=>x===st);}
 /** The configured sources of a mode as the log names them, and whether one of them can end it now (else why not). */
 lpmSources(r,low){
  const mode=low.mode,reg=this.lpmReg,labels=[],reasons=[];let ok=false;
  const say=(label,why)=>{if(why)reasons.push(lpmReason(label,why));else ok=true;};
  const rtc=this.lpmState('rtc'),rtcOn=flag=>rtc?.open&&rtc[flag]&&this.rtcDev?.running,rtcFrozen=!!low.rtcStopped;
  const agtWhy=(n,needIrq)=>{const st=this.lpmState('agt',n);return this.isFrozen(low,st)?'STOPPED':!st?.open||!st.running?'IDLE':needIrq&&!st.callback?'OFF':'';};
  const wdtRuns=id=>!!this.states.get(id==='WDT'?'g_wdt0_ctrl':'g_iwdt0_ctrl')?.running;
  if(mode==='SLEEP'){
   // An interrupt enabled in the NVIC: r_icu enables its interrupt at ExternalIrqEnable, r_rtc when the alarm or the
   // periodic request is set up (Open alone enables none), the other drivers at Open.
   const live=[...this.states.values()].some(st=>st.open&&(st.kind==='gpt'||st.kind==='agt'?!!st.callback:/^g_external_irq/.test(st.name)?st.enabled:/^g_rtc\d/.test(st.name)?!!(st.aie||st.pie):/^g_(uart|adc|i2c_master|spi|sci_spi)\d/.test(st.name)&&(!/^g_adc/.test(st.name)||!!st.callback)));
   if(live||wdtRuns('WDT')||wdtRuns('IWDT'))ok=true;else reasons.push('켜진 인터럽트가 없습니다');
   return {labels,reasons,ok};
  }
  if(mode==='STANDBY'){
   for(const name of lpmWakeNames(reg.wupenLo,reg.wupenHi)){
    const label=lpmWakeLabel(name),irq=/^IRQ(\d+)$/.exec(name);labels.push(label);
    if(irq){const st=this.lpmState('icu',irq[1]);say(label,st?.open&&st.enabled?'':'OFF');}
    else if(name==='RTCALM')say(label,rtcOn('aie')?'':'OFF');
    else if(name==='RTCPRD')say(label,rtcOn('pie')?'':'OFF');
    else if(name==='AGT1UD'||name==='AGT3UD')say(label,agtWhy(name[3],true));
    else if(name==='IWDT')say(label,wdtRuns('IWDT')?'':'IDLE');
    else say(label,'UNMODELLED');
   }
   if(wdtRuns('IWDT'))ok=true;
   if(!labels.length)reasons.push('설정된 소스가 없습니다');
   return {labels,reasons,ok};
  }
  for(const name of lpmCancelNames(reg.dpsier)){
   const label=lpmCancelLabel(name),irq=/^IRQ(\d+)$/.exec(name);labels.push(label);
   if(irq)say(label,raDsPin(Number(irq[1]))?'':'NO_PIN');
   else if(name==='RTC_ALARM')say(label,rtcFrozen?'STOPPED':rtcOn('aie')?'':'OFF');
   else if(name==='RTC_INTERVAL')say(label,rtcFrozen?'STOPPED':rtcOn('pie')?'':'OFF');
   else if(name==='AGT1'||name==='AGT3')say(label,agtWhy(name[3],false));
   else say(label,'UNMODELLED');
  }
  if(!labels.length)reasons.push('설정된 소스가 없습니다');
  return {labels,reasons,ok};
 }
 /** Sleep or Software Standby ends with interrupt request `irq`: the stopped modules go on, and their requests follow. */
 lpmWake(r,irq){
  const low=this.low;this.low=null;this.lpmThaw(r,low);
  this.lowLog.wake(low.mode,lpmIrqLabel(irq),r.microTime-low.since);
  return low.deferred;
 }
 // The program executes WFI (R_LPM_LowPowerModeEnter, or a bare __WFI() once a mode is set): the CPU stops, simulated
 // time goes on. Sleep and Software Standby end in queue() with the first request that reaches the core; Deep Software
 // Standby ends with a cancel request — an IRQn-DS pin edge seen here, the RTC or AGT request (lpmRequest) — and resets
 // the program: RSTSR0.DPSRSTF, and with IOKEEP the pins as they are.
 *lowPower(r,fn){
  if(r.atomic)throw new Error(`${fn}: 이 위치에서는 기다릴 수 없습니다.`);
  const reg=this.lpmReg,mode=!reg.ssby?'SLEEP':reg.dpsby?'DEEP':'STANDBY';
  // The core's WFI rule, in thread mode and in an interrupt callback (handler mode) alike: only a request above the
  // priority that is running wakes it (interrupts disabled or not), and one that is already waiting keeps the core from
  // stopping at all — in every mode, Deep Software Standby too.
  const prio=this.active.reduce((p,a)=>Math.min(p,a.prio),Infinity);
  // (an IRQ pin edge seen while interrupts are disabled is still with the runtime: it is a request too)
  for(const s of r.interrupts.values())if(s.pending&&s.callback?.host){s.pending=false;s.callback.host();}
  if(this.pending.some(j=>j.prio<prio))return;
  const low=this.low={mode,prio,since:r.microTime,frozen:[],deferred:[],cancel:null,rtcStopped:false};
  this.lpmFreeze(r,low);
  const check=this.lpmSources(r,low);
  this.lowLog.enter(mode,r.microTime,{sources:check.labels,detail:mode==='DEEP'?lpmDeepDetail(reg.deepcut,reg.iokeep):''});
  if(!check.ok)this.lowLog.stuck(mode,check.reasons);
  if(mode!=='DEEP'){while(this.low===low)yield .1;return;}
  const pins=lpmCancelNames(reg.dpsier).filter(n=>/^IRQ/.test(n)).map(n=>{const ch=Number(n.slice(3)),pin=raDsPin(ch);return pin?{name:n,pin,rising:(reg.dpsiegr>>>ch)&1,level:r.inputLevel(pin)}:null;}).filter(Boolean);
  while(!low.cancel){
   yield .1;
   for(const p of pins){const level=r.inputLevel(p.pin);if(level===p.level)continue;p.level=level;if(level===p.rising){low.cancel=lpmCancelLabel(p.name);low.cancelBit=RA_LPM_CANCEL_BITS[p.name];break;}}
  }
  // DPSIFR: the flag of what cancelled the mode (r_lpm cleared the flags before the WFI).
  this.dpsifr=(1<<low.cancelBit)>>>0;
  this.hold=!!reg.iokeep;this.heldPins=this.hold?new Map(Object.entries(r.gpio).map(([pin,g])=>{const copy={...g};delete copy.pwm;return [pin,copy];})):null;this.heldWrites=new Map();
  this.lowLog.wake('DEEP',low.cancel,r.microTime-low.since,{hold:this.hold});
  this.resetCause='DEEP_STANDBY';
  yield {kind:'reset'};
 }
}
for(const k of ['stdoutHook','stdout','flushStdout','stdinChar','stdin'])FspAdapter.prototype[k]=HalAdapter.prototype[k];
// Data flash: R_FLASH_HP_* and the data flash read through a pointer (fsp-flash.js).
Object.defineProperties(FspAdapter.prototype,Object.getOwnPropertyDescriptors(FLASH_METHODS));
// ELC, DTC and DMAC, and the event hub of the peripherals (fsp-transfer.js).
Object.defineProperties(FspAdapter.prototype,Object.getOwnPropertyDescriptors(TRANSFER_METHODS));
export {FLASH_NAMES};

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
 R_BSP_PinAccessEnable(){return 0;},R_BSP_PinAccessDisable(){return 0;},
 // The register write protection (PRCR) around a write of RSTSR0 or DPSIFR: nothing to do here.
 R_BSP_RegisterProtectEnable(){return 0;},R_BSP_RegisterProtectDisable(){return 0;},R_BSP_IrqStatusClear(){return 0;},
 R_BSP_PinWrite(args,r,fn){this.pinWrite(r,this.pin(args[0],fn),args[1]?1:0,fn);return 0;},
 R_BSP_PinRead(args,r,fn){return r.call('digitalRead',[this.pin(args[0],fn)]);},
 R_BSP_PinCfg(args,r,fn){this.applyPinCfg(r,this.pin(args[0],fn),Number(args[1])>>>0,fn);return 0;},
 R_ICU_ExternalIrqOpen([ctrl,cfgPtr],r,fn){
  const st=this.instance(ctrl,r,fn,'icu');if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(cfgPtr,r,'external_irq_cfg_t',fn),pin=this.icuPin(st.channel);
  if(!pin)throw new Error(`${fn}: IRQ${st.channel} 핀이 Pins에 없습니다.`);
  const trigger=Number(cfg.fields.trigger.value),mode=['FALLING','RISING','CHANGE','FALLING','RISING'][trigger]??'FALLING';
  if(trigger>=3)this.warnOnce(r,'level:'+pin,`${fn}: 내장 해석기는 레벨 트리거(LOW/HIGH)를 같은 쪽 엣지로 처리합니다.`);
  Object.assign(st,{open:true,enabled:false,pin,ipl:Number(cfg.fields.ipl.value),callback:this.inst.irqs.find(i=>i.channel===st.channel)?.callback||''});
  r.interrupts.set(pin,{mode,previous:r.inputLevel(pin),pending:false,callback:{host:()=>{if(st.open&&this.fspEvent(r,'ICU_IRQ'+st.channel)&&st.enabled)this.queue(r,'ICU_IRQ'+st.channel,st.ipl,()=>this.callback(r,st.callback,'external_irq_callback_args_t',{channel:st.channel}),'r_icu_isr');}}});
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
  // The UART's DTC transfers (p_transfer_rx, then p_transfer_tx: r_sci_uart_transfer_open opens them in that order).
  const own={};
  for(const [key,dir]of [['transferRx','rx'],['transferTx','tx']]){
   const t=p[key]&&this.inst.transfers.find(x=>x.id===p[key]);if(!t)continue;const ts=this.uartTransfer(t);
   if(ts.open){if(own.rx)own.rx.open=false;return FSP.ALREADY_OPEN;}
   Object.assign(ts,{open:true,enabled:false,uart:st.channel,dir});own[dir]=ts;
  }
  const ch=this.uartChannel(st.channel);ch.st=st;ch.rx=null;ch.txFree=0;ch.txEnd=0;ch.tx=null;ch.bus.call('Serial1.setPins',[rx,tx],r);ch.bus.call('Serial1.begin',[p.baud],r);
  Object.assign(st,{open:true,ipl:Number(cfg.fields.rxi_ipl.value),callback:p.callback||'',dtcTx:own.tx||null,dtcRx:own.rx||null});return FSP.SUCCESS;
 },
 R_SCI_UART_Write([ctrl,buffer,count],r,fn){
  const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel),u=ch.bus.uart;
  int(count,1,256,`${fn} 길이(내장 해석기는 한 번에 256바이트까지)`);
  // With a DTC for transmission r_sci_uart does not answer FSP_ERR_IN_USE (tx_src_bytes is 0 at once): a Write while TDR
  // still holds a byte would overwrite it on the board, so the interpreter stops with the reason instead.
  if(st.dtcTx&&r.microTime<ch.txFree-1e-6)throw new Error(`${fn}: g_uart${st.channel}의 DTC 송신이 끝나기 전에 다시 불렀습니다. DTC로 보낼 때 r_sci_uart는 FSP_ERR_IN_USE로 막지 않아 보내던 마지막 바이트가 덮어써집니다. UART_EVENT_TX_COMPLETE를 기다린 뒤 부르세요.`);
  if(r.microTime<ch.txFree-1e-6)return FSP.IN_USE;
  // Each byte goes out at its frame start (an Abort or a Close stops the rest). TXI takes the last byte into the shift
  // register one frame before the end (TX_DATA_EMPTY; a new Write may start then and continues the transmission, so the
  // earlier TEI does not come), TEI when the last byte of the last write has gone out (TX_COMPLETE).
  const bytes=this.bytes(buffer,count,r,fn),frame=1e7/u.baud,start=Math.max(r.microTime,ch.txEnd??0),gen=++ch.txGen,abort=ch.txAbort;
  bytes.forEach((byte,i)=>r.event((start+i*frame)/1000,()=>{if(ch.txAbort!==abort||!st.open)return;ch.bus.call('Serial1.write',[r.array([byte]),1],r);r.api.uart?.({instance:ch.id,direction:'TX',bytes:[byte],micros:r.microTime});}));
  ch.txEnd=start+count*frame;ch.txFree=ch.txEnd-frame;
  // With the DTC (two bytes or more) the last transfer writes the last byte into TDR while the one before it is sent, and
  // the TXI interrupt that ends the DTC transfer reaches the CPU then: TX_DATA_EMPTY one frame earlier.
  const dtc=st.dtcTx&&count>=2?st.dtcTx:null,empty=dtc?ch.txEnd-2*frame:ch.txFree;
  ch.tx=dtc?{start,count,frame,transfer:dtc}:null;if(dtc)dtc.enabled=true;
  r.event(empty/1000,()=>{if(dtc&&ch.tx?.transfer===dtc)dtc.enabled=false;if(ch.txAbort===abort)this.uartEvent(r,ch,128,0,'txi');});r.event(ch.txEnd/1000,()=>{if(ch.txGen===gen&&ch.txAbort===abort)this.uartEvent(r,ch,2,0,'tei');});return FSP.SUCCESS;
 },
 R_SCI_UART_Read([ctrl,buffer,count],r,fn){const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel);if(ch.rx)return FSP.IN_USE;int(count,1,4096,`${fn} 길이`);r.pointerCell(buffer,count-1);ch.rx={buffer,count,index:0};if(st.dtcRx)st.dtcRx.enabled=true;return FSP.SUCCESS;},
 R_SCI_UART_Abort([ctrl,dir],r,fn){const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel);if(dir&1){ch.rx=null;if(st.dtcRx)st.dtcRx.enabled=false;}if(dir&2){this.uartStop(r,ch);if(st.dtcTx)st.dtcTx.enabled=false;}return FSP.SUCCESS;},
 R_SCI_UART_InfoGet([ctrl,info],r,fn){const st=this.instance(ctrl,r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const v=this.struct(info,r,'uart_info_t',fn);this.setField(v,'write_bytes_max',st.dtcTx?0x10000:256,r);this.setField(v,'read_bytes_max',st.dtcRx?0x10000:4096,r);return FSP.SUCCESS;},
 R_SCI_UART_Close(args,r,fn){const st=this.instance(args[0],r,fn,'uart');if(!st.open)return FSP.NOT_OPEN;const ch=this.uartChannel(st.channel);this.uartStop(r,ch);ch.bus.call('Serial1.end',[],r);ch.rx=null;st.open=false;for(const t of [st.dtcRx,st.dtcTx])if(t){t.open=false;t.enabled=false;}this.dropJobs(`SCI${ch.channel}:`);return FSP.SUCCESS;},
 R_GPT_Open(args,r,fn){return this.timerOpen(r,args,fn,'gpt');},R_AGT_Open(args,r,fn){return this.timerOpen(r,args,fn,'agt');},
 R_GPT_Start(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{if(!st.running)this.timerStart(r,st);});},
 R_AGT_Start(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>{if(!st.running)this.timerStart(r,st);});},
 R_GPT_Stop(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>this.timerStop(r,st));},
 R_AGT_Stop(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>this.timerStop(r,st));},
 R_GPT_Reset(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{st.counter=0;if(st.running){st.running=false;this.timerStart(r,st);}});},
 R_AGT_Reset(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>{st.counter=0;if(st.running){st.running=false;this.timerStart(r,st);}});},
 R_GPT_CounterSet(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>{const c=int(Number(args[1])>>>0,0,st.period-1,`${fn} 카운터`);st.counter=c;if(st.running){st.running=false;this.timerStart(r,st);}});},
 R_GPT_PeriodSet(args,r,fn){return timerCall.call(this,args,r,fn,'gpt',st=>this.periodSet(r,st,int(Number(args[1])>>>0,1,2**32-1,`${fn} 주기`)));},
 R_AGT_PeriodSet(args,r,fn){return timerCall.call(this,args,r,fn,'agt',st=>this.periodSet(r,st,int(Number(args[1])>>>0,1,65536,`${fn} 주기`)));},
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
  Object.assign(st,{open:true,mode:f('mode'),bits,ipl:f('scan_end_ipl'),callback,mask:null,running:false,values:new Map(),elcTrigger:this.inst.adc?.trigger==='ELC',armed:false,armGen:(st.armGen||0)+1});return FSP.SUCCESS;
 },
 R_ADC_ScanCfg([ctrl,chPtr],r,fn){const st=this.instance(ctrl,r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;const cfg=this.struct(chPtr,r,'adc_channel_cfg_t',fn),mask=Number(cfg.fields.scan_mask.value)>>>0;for(let ch=0;ch<29;ch++)if(mask&(1<<ch))this.adcPin(ch,fn);st.mask=mask;return FSP.SUCCESS;},
 R_ADC_ScanStart(args,r,fn){
  const st=this.instance(args[0],r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;if(st.mask===null)throw new Error(`${fn}: 먼저 R_ADC_ScanCfg(&g_adc0_ctrl, &g_adc0_channel_cfg)로 스캔할 채널을 정하세요.`);
  if(st.running)return FSP.IN_USE;
  // An ELC start trigger (ADC_START_SOURCE_ELC_AD0): ScanStart lets the linked event start each scan (fsp-transfer.js).
  if(st.elcTrigger){st.armed=true;return FSP.SUCCESS;}
  for(let ch=0;ch<29;ch++)if(st.mask&(1<<ch))st.values.set(ch,this.adcSample(r,st,ch));
  if(st.mode===2)st.running=true;
  else this.adcScanEnd(r,st);
  return FSP.SUCCESS;
 },
 R_ADC_ScanStop(args,r,fn){const st=this.instance(args[0],r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;st.running=false;st.armed=false;st.armGen=(st.armGen||0)+1;return FSP.SUCCESS;},
 R_ADC_InfoGet(args,r,fn){return this.adcInfoGet(args,r,fn);},
 R_ADC_StatusGet([ctrl,status],r,fn){const st=this.instance(ctrl,r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;this.setField(this.struct(status,r,'adc_status_t',fn),'state',st.running?1:0,r);return FSP.SUCCESS;},
 R_ADC_Read([ctrl,channel,out],r,fn){
  const st=this.instance(ctrl,r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;const ch=int(channel,0,28,`${fn} 채널`);this.adcPin(ch,fn);
  // Continuous scan keeps converting: the register holds the latest input. A single scan holds what ScanStart took.
  this.out(out,r,st.running&&st.mask&(1<<ch)?this.adcSample(r,st,ch):st.values.get(ch)??0,fn);return FSP.SUCCESS;
 },
 R_ADC_Read32(args,r,fn){return HANDLERS.R_ADC_Read.call(this,args,r,fn);},
 R_ADC_Close(args,r,fn){const st=this.instance(args[0],r,fn,'adc');if(!st.open)return FSP.NOT_OPEN;st.open=st.running=st.armed=false;st.armGen=(st.armGen||0)+1;return FSP.SUCCESS;},
 R_IIC_MASTER_Open([ctrl,cfgPtr],r,fn){
  const st=this.instance(ctrl,r,fn,'iic');if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(cfgPtr,r,'i2c_master_cfg_t',fn),id='IIC'+st.channel,t=this.inst.iics.find(x=>x.channel===st.channel);
  const scl=this.pinOf(id+'_SCL'),sda=this.pinOf(id+'_SDA');if(!scl||!sda)throw new Error(`${fn}: Pins에서 ${id}의 SCL과 SDA 핀을 정하세요.`);
  if(Number(cfg.fields.addr_mode.value)!==1)throw new Error(`${fn}: 내장 해석기는 7비트 주소만 실행합니다.`);
  Object.assign(st,{open:true,busy:0,scl,sda,rate:Number(cfg.fields.rate.value),slave:Number(cfg.fields.slave.value),ipl:Number(cfg.fields.ipl.value),callback:t?.callback||''});
  this.activeIic=null;this.iicSelect(r,st);return FSP.SUCCESS;
 },
 R_IIC_MASTER_SlaveAddressSet([ctrl,address,mode],r,fn){const st=this.instance(ctrl,r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;if(st.busy)return FSP.IN_USE;if(mode!==1)throw new Error(`${fn}: 내장 해석기는 7비트 주소(I2C_MASTER_ADDR_MODE_7BIT)만 실행합니다.`);st.slave=int(address,0,127,`${fn} 주소`);return FSP.SUCCESS;},
 R_IIC_MASTER_Write([ctrl,buffer,count],r,fn){
  const st=this.instance(ctrl,r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;if(st.busy)return FSP.IN_USE;const bytes=this.bytes(buffer,count,r,fn);
  this.iicTransfer(r,st,()=>{this.buses.call('Wire.beginTransmission',[st.slave],r);for(const byte of bytes)this.buses.call('Wire.write',[byte],r);return this.buses.call('Wire.endTransmission',[],r)===0?3:1;});return FSP.SUCCESS;
 },
 R_IIC_MASTER_Read([ctrl,buffer,count],r,fn){
  const st=this.instance(ctrl,r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;if(st.busy)return FSP.IN_USE;int(count,1,256,`${fn} 길이`);r.pointerCell(buffer,count-1);
  this.iicTransfer(r,st,()=>{const got=this.buses.call('Wire.requestFrom',[st.slave,count],r);if(got!==count)return 1;for(let i=0;i<count;i++)r.set(r.pointerCell(buffer,i),this.buses.call('Wire.read',[],r));return 2;});return FSP.SUCCESS;
 },
 R_IIC_MASTER_Abort(args,r,fn){const st=this.instance(args[0],r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;this.iicStop(st);return FSP.SUCCESS;},
 R_IIC_MASTER_Close(args,r,fn){const st=this.instance(args[0],r,fn,'iic');if(!st.open)return FSP.NOT_OPEN;this.iicStop(st);st.open=false;if(this.activeIic===st.name)this.activeIic=null;return FSP.SUCCESS;},
 // r_iic_slave (i2c_slave_api_t): Open, Read / Write (the buffer of the transfer the callback was asked for), CallbackSet, Close.
 R_IIC_SLAVE_Open([ctrl,cfgPtr],r,fn){
  const st=this.instance(ctrl,r,fn,'iicSlave');if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(cfgPtr,r,'i2c_slave_cfg_t',fn),id='IIC'+st.channel,t=this.inst.iicSlaves.find(x=>x.channel===st.channel),f=k=>Number(cfg.fields[k].value);
  if(f('eri_ipl')>f('ipl'))return FSP.INVALID_ARGUMENT;
  const scl=this.pinOf(id+'_SCL'),sda=this.pinOf(id+'_SDA');if(!scl||!sda)throw new Error(`${fn}: Pins에서 ${id}의 SCL과 SDA 핀을 정하세요.`);
  if(f('addr_mode')!==1)throw new Error(`${fn}: 내장 해석기는 7비트 주소(I2C_SLAVE_ADDR_MODE_7BIT)만 실행합니다.`);
  const other=this.slaveOpen();if(other)throw new Error(`${fn}: 내장 해석기는 I²C 슬레이브 채널을 하나만 실행합니다(${other.name}이 열려 있음). 두 채널을 함께 쓰려면 ARM GCC 빌드로 실행하세요.`);
  Object.assign(st,{open:true,kind:'iicSlave',scl,sda,address:f('slave')&0x7f,ipl:f('ipl'),callback:t?.callback||'',context:null,buffer:null,total:0,loaded:0,count:0,direction:2,nack:false});
  // SCL and SDA are released (the bus pull-ups hold them high).
  for(const p of [sda,scl])r.call('pinMode',[p,'INPUT']);
  return FSP.SUCCESS;
 },
 R_IIC_SLAVE_Read(args,r,fn){return this.slaveReadWrite(args,r,fn,1);},
 R_IIC_SLAVE_Write(args,r,fn){return this.slaveReadWrite(args,r,fn,0);},
 R_IIC_SLAVE_CallbackSet([ctrl,callback,context],r,fn){const st=this.instance(ctrl,r,fn,'iicSlave');if(!callback)return FSP.ASSERTION;if(!st.open)return FSP.NOT_OPEN;st.callback=r.callback(callback).name;st.context=context?.kind==='pointer'?context:null;return FSP.SUCCESS;},
 R_IIC_SLAVE_Close(args,r,fn){const st=this.instance(args[0],r,fn,'iicSlave');if(!st.open)return FSP.NOT_OPEN;st.open=false;return FSP.SUCCESS;}
};
// r_spi and r_sci_spi share spi_api_t: Open, Write (ctrl, src, length, width), Read (ctrl, dest, …), WriteRead (ctrl,
// src, dest, length, width), CallbackSet and Close.
for(const [prefix,kind] of [['R_SPI_','spi'],['R_SCI_SPI_','sciSpi']])Object.assign(HANDLERS,{
 [prefix+'Open'](args,r,fn){return this.spiOpen(args,r,fn,kind);},
 [prefix+'Write']([ctrl,src,length,width],r,fn){return this.spiTransfer(r,fn,kind,'write',ctrl,src,null,length,width);},
 [prefix+'Read']([ctrl,dest,length,width],r,fn){return this.spiTransfer(r,fn,kind,'read',ctrl,null,dest,length,width);},
 [prefix+'WriteRead']([ctrl,src,dest,length,width],r,fn){return this.spiTransfer(r,fn,kind,'both',ctrl,src,dest,length,width);},
 [prefix+'CallbackSet'](args,r,fn){return this.spiCallbackSet(args,r,fn,kind);},
 [prefix+'Close'](args,r,fn){return this.spiClose(args,r,fn,kind);}
});
// R_WDT_* and R_IWDT_* (wdt_api_t): the same calls on either watchdog.
for(const id of ['WDT','IWDT']){
 const nmiOnly=(self,st,fn,action)=>self.config.peripherals?.[id]?.reset==='NMI'?action():FSP.UNSUPPORTED; // r_wdt.c: StatusGet/Clear need the NMI output
 Object.assign(HANDLERS,{
  [`R_${id}_Open`](args,r,fn){
   const st=this.wdtInstance(args,r,fn,id);if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(args[1],r,'wdt_cfg_t',fn),f=k=>Number(cfg.fields[k].value);
   const timeout=[128,512,1024,2048,4096,8192,16384][f('timeout')];if(!RA_WDT[id].timeouts.includes(timeout))return FSP.ASSERTION;
   // Register-start mode takes the cfg (written to WDTCR at Open); auto-start keeps what OFS0 set at reset.
   // r_wdt.c parameter checking in register-start mode, with the cfg hal_data.c has (p_callback is the Stacks callback, NULL
   // with Reset output; WDT_CFG_REGISTER_START_NMI_SUPPORTED follows the Stacks setting): the NMI needs the callback and
   // the NMI support, a reset needs p_callback NULL.
   if(!st.auto&&(f('reset_control')?'RESET':'NMI')!==this.config.peripherals[id].reset)return FSP.ASSERTION;
   if(!st.auto){
    const div=Number(Object.keys(WDT_DIVISION_CODE).find(d=>WDT_DIVISION_CODE[d]===f('clock_division')));if(!RA_WDT[id].dividers.includes(div))throw new Error(`${fn}: ${id}의 클록 분주는 ${RA_WDT[id].dividers.map(d=>'/'+d).join(' · ')}입니다.`);
    Object.assign(st,{timeout,div,windowStart:[25,50,75,100][f('window_start')],windowEnd:[75,50,25,0][f('window_end')],reset:f('reset_control')?'RESET':'NMI',stop:!!f('stop_control')});
    if(!RA_WDT_WINDOW_START.includes(st.windowStart)||!RA_WDT_WINDOW_END.includes(st.windowEnd))return FSP.ASSERTION;
   }
   st.open=true;
   // An underflow before Open (auto-start, NMI): the status is set, and enabling the NMI in Open (NMIER) raises it.
   if(st.reset==='NMI'&&st.flags&&st.callback)this.queue(r,'NMI',-2,()=>this.callback(r,st.callback,'wdt_callback_args_t',this.contextField(st)),'NMI_Handler',`NMI:${st.id}`);
   return FSP.SUCCESS;
  },
  [`R_${id}_Refresh`](args,r,fn){return this.wdtCall(args,r,fn,id,st=>{this.wdtRefresh(r,st);return FSP.SUCCESS;});},
  [`R_${id}_StatusGet`](args,r,fn){return this.wdtCall(args,r,fn,id,st=>nmiOnly(this,st,fn,()=>{this.out(args[1],r,st.flags>>14,fn);return FSP.SUCCESS;}));},
  [`R_${id}_StatusClear`](args,r,fn){return this.wdtCall(args,r,fn,id,st=>nmiOnly(this,st,fn,()=>{st.flags&=~((Number(args[1])&3)<<14);return FSP.SUCCESS;}));},
  [`R_${id}_CounterGet`](args,r,fn){return this.wdtCall(args,r,fn,id,st=>{this.out(args[1],r,this.wdtCounter(r,st),fn);return FSP.SUCCESS;});},
  [`R_${id}_TimeoutGet`](args,r,fn){return this.wdtCall(args,r,fn,id,st=>{const v=this.struct(args[1],r,'wdt_timeout_values_t',fn);this.setField(v,'clock_frequency_hz',Math.floor((id==='IWDT'?RA_IWDT_HZ:this.pclkb)/st.div),r);this.setField(v,'timeout_clocks',st.timeout,r);return FSP.SUCCESS;});},
  [`R_${id}_CallbackSet`](args,r,fn){return this.callbackSet(this.wdtInstance(args,r,fn,id),args,r);}
 });
}
// R_RTC_* (rtc_api_t of FSP 6.6), as r_rtc.c does them on the RA6E1 (no alarm 1, RCR1.PES 6-15).
Object.assign(HANDLERS,{
 R_RTC_Open(args,r,fn){
  const st=this.rtcInstance(args,r,fn);if(st.open)return FSP.ALREADY_OPEN;const cfg=this.struct(args[1],r,'rtc_cfg_t',fn),f=k=>Number(cfg.fields[k].value),p=this.config.peripherals.RTC;
  if(f('clock_source')===1&&(f('freq_compare_value')<=7||f('freq_compare_value')>=0x1ff))return FSP.INVALID_ARGUMENT;
  const dev=this.rtcModel(r);
  // RTC_CFG_OPEN_SET_CLOCK_SOURCE 1 (start time "simulation"): Open stops the counter and the program sets the time.
  if(p.start!=='HOST_TIME')this.rtcInit(dev);
  Object.assign(st,{open:true,callback:p.callback||'',context:null,clockSource:f('clock_source'),alarmIpl:f('alarm_ipl'),alarmIrq:f('alarm_irq'),periodicIpl:f('periodic_ipl'),periodicIrq:f('periodic_irq'),carryIrq:f('carry_irq'),aie:false,pie:false,pes:0,gen:(st.gen||0)+1});
  return FSP.SUCCESS;
 },
 R_RTC_Close(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{dev.write(0x22,0,1);dev.write(0x24,dev.read(0x24,1)&~1,1);st.open=st.aie=st.pie=false;st.gen++;this.dropJobs('RTC:');return FSP.SUCCESS;});},
 R_RTC_ClockSourceSet(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{this.rtcInit(dev);st.aie=st.pie=false;st.gen++;return FSP.SUCCESS;});},
 R_RTC_CalendarTimeSet(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{
  const t=this.rtcTime(args[1],r,fn),g=k=>Number(t.fields[k].value);
  if(g('tm_sec')<0||g('tm_sec')>59||g('tm_min')<0||g('tm_min')>59||g('tm_hour')<0||g('tm_hour')>23||!this.rtcDate(t,r))return FSP.INVALID_ARGUMENT;
  // START 0, the counters (BCD), START 1: the second starts now.
  dev.write(0x24,dev.read(0x24,1)&~1,1);
  for(const [off,v]of [[0x02,g('tm_sec')],[0x04,g('tm_min')],[0x06,g('tm_hour')],[0x08,g('tm_wday')],[0x0a,g('tm_mday')],[0x0c,g('tm_mon')+1]])dev.write(off,off===0x08?v:bcd(v),1);
  dev.write(0x0e,bcd(g('tm_year')-100),2);dev.write(0x24,dev.read(0x24,1)|1,1);
  if(st.aie||st.pie)this.rtcPlan(r,st);return FSP.SUCCESS;
 });},
 R_RTC_CalendarTimeGet(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{
  if(st.carryIrq<0)return FSP.IRQ_BSP_DISABLED;const t=this.rtcTime(args[1],r,fn),x=dev.fields();
  for(const [k,v]of [['tm_sec',x.s],['tm_min',x.m],['tm_hour',x.h],['tm_wday',x.wd],['tm_mday',x.day],['tm_mon',x.mon-1],['tm_year',x.y%100+100]])this.setField(t,k,v,r);
  return FSP.SUCCESS;
 });},
 R_RTC_CalendarAlarmSet(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{
  if(st.alarmIrq<0)return FSP.IRQ_BSP_DISABLED;
  const a=this.struct(args[1],r,'rtc_alarm_time_t',fn),m=k=>!!Number(a.fields[k].value),t=r.get(a.fields.time),g=k=>Number(t.fields[k].value);
  if(m('sec_match')&&(g('tm_sec')<0||g('tm_sec')>59)||m('min_match')&&(g('tm_min')<0||g('tm_min')>59)||m('hour_match')&&(g('tm_hour')<0||g('tm_hour')>23))return FSP.INVALID_ARGUMENT;
  if(m('year_match')&&m('mon_match')&&m('mday_match')){if(!this.rtcDate(t,r))return FSP.INVALID_ARGUMENT;}
  else{
   if(m('mon_match')&&(g('tm_mon')<0||g('tm_mon')>11)||m('year_match')&&(g('tm_year')<100||g('tm_year')>199))return FSP.INVALID_ARGUMENT;
   const days=m('mon_match')?(g('tm_mon')===1?29:RTC_DAYS[g('tm_mon')]):31;
   if(m('mday_match')&&(g('tm_mday')<1||g('tm_mday')>days)||m('dayofweek_match')&&(g('tm_wday')<0||g('tm_wday')>6))return FSP.INVALID_ARGUMENT;
  }
  // The alarm registers as r_rtc.c writes them (ENB b7 with the BCD value; RDAYAR 1 when off).
  const reg=(on,v)=>on?(v|0x80):0;
  dev.write(0x10,reg(m('sec_match'),bcd(g('tm_sec'))),1);dev.write(0x12,reg(m('min_match'),bcd(g('tm_min'))),1);dev.write(0x14,reg(m('hour_match'),bcd(g('tm_hour'))),1);
  dev.write(0x16,reg(m('dayofweek_match'),g('tm_wday')),1);dev.write(0x18,m('mday_match')?bcd(g('tm_mday'))|0x80:1,1);dev.write(0x1a,reg(m('mon_match'),bcd(g('tm_mon')+1)),1);
  dev.write(0x1c,m('year_match')?bcd(g('tm_year')-100):0,2);dev.write(0x1e,m('year_match')?0x80:0,1);
  dev.matched=dev.alarmMatch();st.aie=true;this.rtcPlan(r,st);return FSP.SUCCESS;
 });},
 R_RTC_CalendarAlarmGet(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{
  const a=this.struct(args[1],r,'rtc_alarm_time_t',fn),t=r.get(a.fields.time),b=off=>dev.read(off,1),un=v=>((v>>4)&15)*10+(v&15);
  for(const [k,off,mask]of [['tm_sec',0x10,0x7f],['tm_min',0x12,0x7f],['tm_hour',0x14,0x3f],['tm_mday',0x18,0x3f]])this.setField(t,k,un(b(off)&mask),r);
  this.setField(t,'tm_wday',b(0x16)&7,r);this.setField(t,'tm_mon',un(b(0x1a)&0x1f)-1,r);this.setField(t,'tm_year',un(b(0x1c))+100,r);
  for(const [k,off]of [['sec_match',0x10],['min_match',0x12],['hour_match',0x14],['dayofweek_match',0x16],['mday_match',0x18],['mon_match',0x1a],['year_match',0x1e]])this.setField(a,k,(b(off)>>7)&1,r);
  return FSP.SUCCESS;
 });},
 R_RTC_PeriodicIrqRateSet(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{
  if(st.periodicIrq<0)return FSP.IRQ_BSP_DISABLED;const rate=Number(args[1]);
  if(!RTC_PERIOD_S[rate])throw new Error(`${fn}: ${['RTC_PERIODIC_IRQ_SELECT_1_MINUTE','RTC_PERIODIC_IRQ_SELECT_1_HOUR','RTC_PERIODIC_IRQ_SELECT_1_DAY','RTC_PERIODIC_IRQ_SELECT_1_MONTH'][rate-16]??rate}: RA6E1의 RTC는 주기 인터럽트를 1/256초~2초만 냅니다(RCR1.PES 6~15). 실제 FSP는 이 값에서 끝없이 기다립니다. 1분 간격은 1초 주기를 세거나 알람으로 만드세요.`);
  dev.write(0x22,(dev.read(0x22,1)&0x0f)|(rate<<4)|4,1);st.pie=true;st.pes=rate;this.rtcPlan(r,st);return FSP.SUCCESS;
 });},
 // r_rtc.c: only with the sub-clock; the value up to 0x3F, and automatic adjustment needs a period.
 R_RTC_ErrorAdjustmentSet(args,r,fn){return this.rtcCall(args,r,fn,st=>{
  if(st.clockSource!==0)return FSP.UNSUPPORTED;const c=this.struct(args[1],r,'rtc_error_adjustment_cfg_t',fn),g=k=>Number(c.fields[k].value);
  return g('adjustment_mode')===1&&g('adjustment_period')===2||g('adjustment_value')>0x3f?FSP.INVALID_ARGUMENT:FSP.SUCCESS;
 });},
 R_RTC_CallbackSet(args,r,fn){const st=this.rtcInstance(args,r,fn);return this.callbackSet(st,args,r);},
 R_RTC_InfoGet(args,r,fn){return this.rtcCall(args,r,fn,(st,dev)=>{const v=this.struct(args[1],r,'rtc_info_t',fn);this.setField(v,'clock_source',st.clockSource,r);this.setField(v,'status',dev.running?1:0,r);return FSP.SUCCESS;});},
 R_RTC_TimeCaptureSet(args,r,fn){throw new Error(`${fn}: 내장 해석기는 RTC 시간 캡처를 실행하지 않습니다. ARM GCC 빌드로 실행하세요.`);},
 R_RTC_TimeCaptureGet(args,r,fn){throw new Error(`${fn}: 내장 해석기는 RTC 시간 캡처를 실행하지 않습니다. ARM GCC 빌드로 실행하세요.`);}
});
// R_LPM_* (lpm_api_t), with the checks of r_lpm.c in their order (LPM_CFG_PARAM_CHECKING_ENABLE 1). Open and
// LowPowerReconfigure save p_cfg and then configure: a refused configuration leaves the registers as they were.
// R_LPM_LowPowerModeEnter waits (FspAdapter.invoke → lowPower).
Object.assign(HANDLERS,{
 R_LPM_Open([ctrl,cfg],r,fn){
  if(!ctrl)return FSP.ASSERTION;const st=this.instance(ctrl,r,fn,'lpm');if(st.open)return FSP.ALREADY_OPEN;
  const err=this.lpmConfigure(r,cfg,fn);if(err!==FSP.SUCCESS)return err;st.open=true;return FSP.SUCCESS;
 },
 R_LPM_LowPowerReconfigure([ctrl,cfg],r,fn){if(!ctrl)return FSP.ASSERTION;const st=this.instance(ctrl,r,fn,'lpm');if(!st.open)return FSP.NOT_OPEN;return this.lpmConfigure(r,cfg,fn);},
 // The control structure is not used (FSP_PARAMETER_NOT_USED): NULL is fine, as in the FSP examples.
 R_LPM_IoKeepClear(args,r){this.lpmReg.iokeep=0;this.lpmRelease(r);return FSP.SUCCESS;},
 R_LPM_Close([ctrl],r,fn){if(!ctrl)return FSP.ASSERTION;const st=this.instance(ctrl,r,fn,'lpm');if(!st.open)return FSP.NOT_OPEN;st.open=false;return FSP.SUCCESS;}
});
// R_ELC_*, R_DTC_*, R_DMAC_* (fsp-transfer.js).
for(const name of TRANSFER_NAMES)HANDLERS[name]=function(args,r,fn){return fn.startsWith('R_ELC_')?this.elcCall(fn,args,r):fn.startsWith('R_DTC_')?this.dtcCall(fn,args,r):this.dmacCall(fn,args,r);};
function timerCall(args,r,fn,kind,action){const st=this.instance(args[0],r,fn,kind);if(!st.open)return FSP.NOT_OPEN;action(st);return FSP.SUCCESS;}
