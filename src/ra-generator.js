// FSP project files for a Renesas RA board, as the RA Smart Configurator (RASC) / e² studio FSP Configurator writes
// them: ra_cfg/fsp_cfg (BSP and module configuration headers), ra_gen (clock, pins, instances, vectors, main.c,
// linker init tables) and script (linker scripts). The user's code is src/hal_entry.c; the app builds these with the
// FSP sources (BSP + r_* drivers) and ARM GCC, then runs the ELF on the RA6E1 emulator.
// Formats follow RASC output for FSP 5.x/6.x (only what the FPB-RA6E1 configurations here need).
import {raFamily,raPinName,raPortBit,RA_IRQ_PINS} from './ra-config.js';

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
 else if(p.function==='Peripheral'){parts.push('IOPORT_CFG_PERIPHERAL_PIN',p.psel);if(p.pull==='PULLUP')parts.push('IOPORT_CFG_PULLUP_ENABLE');if(p.outputType==='NMOS')parts.push('IOPORT_CFG_NMOS_ENABLE');if(p.drive==='MID')parts.push('IOPORT_CFG_DRIVE_MID');}
 else throw new Error(`${pin?.name||'핀'}: 지원하지 않는 핀 기능입니다.`);
 return `((uint32_t) ${parts.map(x=>`(uint32_t) ${x}`).join(' | ')})`;
}

// External IRQ instances (r_icu): one per pin set to IRQ, named g_external_irqN like RASC.
const irqsOf=mcu=>Object.entries(mcu.pins||{}).filter(([,p])=>p.function==='IRQ').map(([pin,p])=>{const channel=RA_IRQ_PINS[pin];if(channel==null)throw new Error(`${pin}: IRQ 핀이 아닙니다.`);return {pin,channel,name:p.instance||`g_external_irq${channel}`,callback:p.callback||`external_irq${channel}_callback`,trigger:p.edge||'FALLING',priority:p.priority??12,filter:!!p.filter};});

/** The interrupt slots the vector table allocates, in RASC order (first-come numbering from 0). */
export function raVectors(mcu){
 const list=[];
 for(const irq of irqsOf(mcu))list.push({isr:'r_icu_isr',event:`ICU_IRQ${irq.channel}`,label:`ICU IRQ${irq.channel} (External pin interrupt ${irq.channel})`,vector:`ICU_IRQ${irq.channel}`});
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

function bspCfg(){
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
#define BSP_CFG_STACK_MAIN_BYTES (0x400)
#define BSP_CFG_HEAP_BYTES (0x400)
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
#define BSP_CLOCK_CFG_SUBCLOCK_POPULATED (1)
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
/* Number of ICU vector table entries the application uses (FSP 6). */
#define BSP_ICU_VECTOR_NUM_ENTRIES (${vectors.length})
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
 const irqs=irqsOf(mcu),includes=irqs.length?'#include "r_icu.h"\n#include "r_external_irq_api.h"\n':'';
 const decls=irqs.map(i=>`/** External IRQ on ICU Instance. */
extern const external_irq_instance_t ${i.name};
/** Access the ICU instance using these structures when calling API functions directly (::p_api is not used). */
extern icu_instance_ctrl_t ${i.name}_ctrl;
extern const external_irq_cfg_t ${i.name}_cfg;
#ifndef ${i.callback}
void ${i.callback}(external_irq_callback_args_t * p_args);
#endif`).join('\n');
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
};`).join('\n');
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
  cfg('bsp/bsp_cfg.h',bspCfg()),
  cfg('bsp/bsp_mcu_device_cfg.h',HEADER('configuration header file')+`#ifndef BSP_MCU_DEVICE_CFG_H_\n#define BSP_MCU_DEVICE_CFG_H_\n#define BSP_CFG_MCU_PART_SERIES (${fam.series})\n#endif /* BSP_MCU_DEVICE_CFG_H_ */\n`),
  cfg('bsp/bsp_mcu_device_pn_cfg.h',HEADER('configuration header file')+`#ifndef BSP_MCU_DEVICE_PN_CFG_H_\n#define BSP_MCU_DEVICE_PN_CFG_H_\n#define BSP_MCU_${fam.part}\n#define BSP_MCU_FEATURE_SET ('${fam.featureSet}')\n#define BSP_ROM_SIZE_BYTES (${fam.flashKB*1024})\n#define BSP_RAM_SIZE_BYTES (${fam.ramKB*1024})\n#define BSP_DATA_FLASH_SIZE_BYTES (${fam.dataFlashKB*1024})\n#define BSP_PACKAGE_${fam.package}\n#define BSP_PACKAGE_PINS (${fam.pins})\n#endif /* BSP_MCU_DEVICE_PN_CFG_H_ */\n`),
  cfg('bsp/bsp_mcu_family_cfg.h',familyCfg(fam)),
  cfg('bsp/bsp_mcu_ofs_cfg.h',HEADER('configuration header file')+'#ifndef BSP_MCU_OFS_CFG_H_\n#define BSP_MCU_OFS_CFG_H_\n#endif /* BSP_MCU_OFS_CFG_H_ */\n'),
  cfg('bsp/bsp_pin_cfg.h',pinCfgH(mcu)),
  cfg('bsp/board_cfg.h',HEADER('configuration header file')+`#ifndef BOARD_CFG_H_\n#define BOARD_CFG_H_\n#include "${board?.fspBoard?'board.h':'bsp_api.h'}"\n#endif /* BOARD_CFG_H_ */\n`),
  cfg('r_ioport_cfg.h',moduleCfg('r_ioport_cfg.h','R_IOPORT_CFG_H_',['#define IOPORT_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)'])),
  cfg('r_icu_cfg.h',moduleCfg('r_icu_cfg.h','R_ICU_CFG_H_',['#define ICU_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)'])),
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
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_08, BSP_IO_LEVEL_LOW);
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
`;
}
