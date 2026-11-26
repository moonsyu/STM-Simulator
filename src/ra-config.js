// Renesas RA MCU profiles and the FPB-RA6E1 board's pin facts, shared by the project model, the code generator
// (ra-generator.js), the build (desktop/ra-build.cjs) and the emulator (src/emu/ra6e1).
// Sources: RA6E1 Group User's Manual: Hardware R01UH0930EJ0140 Rev.1.40 (Table 1.16 Pin list, LQFP100) and
// FPB-RA6E1 v1 User's Manual R20UT4960EG0100 Rev.1.00 (Tables 5-9).
// The tables and the work are in Rust (rust/stm-core/src/raconfig.rs, feature 62); this file is the JavaScript side.
import {rustTable,rustPure,rustExact,sealed} from './rust-core.js';

// Every table, read once and frozen. What each one is: the comments in raconfig.rs.
export const {
 RA_FAMILY_ID,RA6E1_PORTS,RA_IRQ_PINS,RA_IRQ_DS,RA_BSP_DEFAULTS,RA_RESERVED,RA_FAMILIES,FPB_RA6E1,RA_CLOCK_LIMITS,RA_PERIPHERAL_PINS,
 RA_SCI_CHANNELS,RA_SPI_CHANNELS,RA_SCI_SPI_CHANNELS,RA_ADC_CHANNELS,RA_GPT_CHANNELS,RA_IIC_CHANNELS,RA_IIC_RATES,RA_IIC_SLAVE_ADDRESS,
 RA_AGT_CHANNELS,RA_GPT_32BIT,RA_TIMER_UNITS,RA_WDT,RA_WDT_WINDOW_START,RA_WDT_WINDOW_END,RA_IWDT_HZ,WDT_DIVISION_CODE,WDT_TIMEOUT_ENUM,
 RA_RTC_DEFAULTS,RA_FLASH_DEFAULTS,RA_USB_DEFAULTS,RA_CAN_BITRATES,RA_CAN_DEFAULTS,RA_LPM_MODES,RA_LPM_MODE_NAMES,RA_LPM_WUPEN_MASK,
 RA_LPM_DPSIER_MASK,RA_LPM_DPSIEGR_MASK,RA_LPM_WAKE_BITS,RA_LPM_CANCEL_BITS,RA_LPM_WAKE,RA_LPM_CANCEL,RA_LPM_POWER,RA_LPM_DEFAULTS,
 RA_ELC_EVENTS,RA_ELC_PERIPHERALS,RA_ADC_TRIGGERS,RA_DMAC_CHANNELS,RA_TRANSFER_MODES,RA_TRANSFER_ADDR_MODES,RA_TRANSFER_DEFAULTS,
 RA_ADC_ELC_EVENTS,RA_PSEL_NAMES
}=rustTable('ra_tables');

// A function of names and numbers only: each answer is asked for once (they are called while a program runs).
const kept=name=>{const f=rustPure(name);return (...args)=>f(...args.map(sealed));};
// A function of settings: asked each time, with the arguments exactly as given.
const asked=name=>(...args)=>rustExact(name,...args);

/** The RASC name of a pin's interrupt function: "IRQ1-DS", "IRQ6", or '' for a pin without one. */
export const raIrqName=kept('ra_irq_name');
export const isRaFamily=family=>Object.hasOwn(RA_FAMILIES,family||'');
export function raFamily(family){const f=RA_FAMILIES[family];if(!f)throw new Error(`${family}: 지원하지 않는 RA MCU입니다.`);return f;}
/** "P408", "p408" or "BSP_IO_PORT_04_PIN_08" → "P408". */
export const raPinName=kept('ra_pin_name');
/** Port and bit of a pin: P408 → {port:4, bit:8}. */
export const raPortBit=kept('ra_port_bit');
/** The FPB-RA6E1's pin configuration as a new project starts (RASC board template: LEDs out low, S1 on IRQ1). */
export const raDefaultMcu=asked('ra_default_mcu');
/** Why a name cannot be a pin symbol or a callback of an FSP project, or '' when it can. */
export const raNameProblem=kept('ra_name_problem');
/** The SCI channels running as UARTs (r_sci_uart), which the serial monitor can reach: not one in simple SPI mode. */
export const raUartChannels=asked('ra_uart_channels');
/** A checked copy of an RA project's MCU settings (pins, clock); throws with the reason. */
export const validateRaMcu=asked('validate_ra_mcu');
/** RSPI bit-rate settings (SPBR, SPCMD0.BRDV) for `rate` from PCLKA, as R_SPI_CalculateBitrate and RASC compute them. */
export const raSpiBitrate=asked('ra_spi_bitrate');
/** SCI simple SPI (clock synchronous) bit-rate settings, as R_SCI_SPI_CalculateBitrate computes them without MDDR. */
export const raSciSpiBitrate=asked('ra_sci_spi_bitrate');
/** RIIC bit-rate settings (ICMR1.CKS, ICBRH, ICBRL) for a rate, 50 % duty with 120 ns rise and fall, as RASC computes them. */
export const raIicClock=asked('ra_iic_clock');
/** r_iic_slave clock settings (ICMR1.CKS, ICBRL, digital filter stages). */
export const raIicSlaveClock=asked('ra_iic_slave_clock');
/** AGT count source, divider and period counts for a period, PCLKB first, then LOCO (as RASC offers them). */
export const raAgtCounts=asked('ra_agt_counts');
/** GPT period/duty in counts with the smallest clock divider that fits, as RASC computes it. */
export const raGptCounts=asked('ra_gpt_counts');
/** A clock of an RA MCU configuration in Hz (default PCLKD, the GPT count clock). */
export const raClockHz=asked('ra_clock_hz');
/** The CAN bit timing (r_can can_bit_timing_cfg_t) that gives `kbps` exactly from `pclkbHz`; null when none does. */
export const raCanTiming=asked('ra_can_timing');
/** The pin whose IRQn-DS input cancels Deep Software Standby for channel `ch` (null: the channel has none). */
export const raDsPin=kept('ra_ds_pin');
/** The ELC event name of an event number (null when the settings do not offer it). */
export const raElcEventName=kept('ra_elc_event_name');
/** Events a transfer may start on: a DTC on an interrupt that has a vector, a DMAC on any of them or by software. */
export const raTransferEvents=asked('ra_transfer_events');
/** Whether the configuration allocates a vector (an IELSR slot) for an event, as raVectors does: a DTC activates on one. */
export const raEventHasVector=asked('ra_event_has_vector');
/** A 64-bit source mask as [low 32 bits, high bits] from source names and their bit table. */
export const raLpmMask=asked('ra_lpm_mask');
/** A watchdog's count clock, timeout clocks and timeout in ms for a configuration. */
export const raWdtTiming=asked('ra_wdt_timing');
/** OFS0 (BSP_CFG_OPTION_SETTING_OFS0) for a configuration: erased (0xFFFFFFFF) but for an auto-started watchdog. */
export const raOfs0=asked('ra_ofs0');
/** PSEL of a peripheral signal ("SCI9_TXD" → 5). */
export const raPsel=kept('ra_psel');
