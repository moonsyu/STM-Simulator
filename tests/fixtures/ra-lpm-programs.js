// Feature 37: FPB-RA6E1 programs that use r_lpm, run by the unit tests on the built-in interpreter
// (tests/unit/ra-lpm-interp.test.js) and by the toolchain tests on both engines (tests/toolchain/ra-lpm.test.mjs: the real
// r_lpm.c on the emulator against the interpreter).
import {raDefaultMcu} from '../../src/ra-config.js';

const HEAD=`#include "hal_data.h"

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER
`;
const WARM_START=`
void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event)
    {
        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}
`;
const mcu=peripherals=>()=>{const m=raDefaultMcu();m.peripherals=peripherals;return m;};

// What each R_LPM_* call returns (r_lpm.c with parameter checking), in the order the driver checks.
export const LPM_ERRORS={
 mcu:mcu({LPM:{enabled:true,mode:'SLEEP',wake:['IRQ1'],cancel:['IRQ1'],cancelRising:[],ioKeep:true,power:'DEEPCUT0'}}),
 // FSP_ERR_NOT_OPEN 7 (x3), FSP_ERR_ASSERTION 1 (x2), FSP_ERR_UNSUPPORTED 6, FSP_ERR_INVALID_MODE 5 (x3), FSP_SUCCESS 0,
 // FSP_ERR_ALREADY_OPEN 14, 0, 5 (reconfigure refused), 0 (the mode before it stays), 0, 7.
 expected:[7,7,7,1,1,6,5,5,5,0,14,0,5,0,0,7],
 code:HEAD+`
volatile int e[16];
volatile uint32_t done = 0;

void hal_entry(void)
{
    lpm_cfg_t bad = g_lpm0_cfg;

    e[0] = (int) R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    e[1] = (int) R_LPM_LowPowerReconfigure(&g_lpm0_ctrl, &g_lpm0_cfg);
    e[2] = (int) R_LPM_Close(&g_lpm0_ctrl);
    e[3] = (int) R_LPM_Open(NULL, &g_lpm0_cfg);
    e[4] = (int) R_LPM_Open(&g_lpm0_ctrl, NULL);

    /* The RA6E1 has no Deep Sleep. */
    bad.low_power_mode = LPM_MODE_DEEP_SLEEP;
    e[5] = (int) R_LPM_Open(&g_lpm0_ctrl, &bad);

    /* An edge without its source; a source the RA6E1 has no DPSIER bit for (IRQ2-DS); a wake source outside WUPEN (KEY). */
    bad.low_power_mode             = LPM_MODE_DEEP;
    bad.deep_standby_cancel_source = LPM_DEEP_STANDBY_CANCEL_SOURCE_IRQ1;
    bad.deep_standby_cancel_edge   = LPM_DEEP_STANDBY_CANCEL_SOURCE_IRQ4_RISING;
    e[6] = (int) R_LPM_Open(&g_lpm0_ctrl, &bad);
    bad.deep_standby_cancel_source = 0x00000004U;
    bad.deep_standby_cancel_edge   = 0U;
    e[7] = (int) R_LPM_Open(&g_lpm0_ctrl, &bad);
    bad                      = g_lpm0_cfg;
    bad.low_power_mode       = LPM_MODE_STANDBY;
    bad.standby_wake_sources = 0x00020000U;
    e[8] = (int) R_LPM_Open(&g_lpm0_ctrl, &bad);

    e[9]  = (int) R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    e[10] = (int) R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    e[11] = (int) R_LPM_IoKeepClear(NULL);
    e[12] = (int) R_LPM_LowPowerReconfigure(&g_lpm0_ctrl, &bad);

    /* Still Sleep (the refused configuration changed nothing): S1 on IRQ1 ends it. */
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);
    e[13] = (int) R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    e[14] = (int) R_LPM_Close(&g_lpm0_ctrl);
    e[15] = (int) R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    done  = 1;
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}

void external_irq1_callback(external_irq_callback_args_t * p_args)
{
    (void) p_args;
}
`+WARM_START};

// Software Standby with two wake sources: S1 (IRQ1) and AGT1, which counts LOCO (400 ms) and so runs in the mode. AGT0
// counts PCLKB (7 ms): it ticks 14 times in the first 100 ms and then stands still, its request not a wake source.
export const LPM_STANDBY={
 mcu:mcu({LPM:{enabled:true,mode:'STANDBY',wake:['IRQ1','AGT1UD'],cancel:[],cancelRising:[],ioKeep:true,power:'DEEPCUT0'},
  AGT0:{enabled:true,period:7,unit:'ms',callback:'agt0_callback',priority:12},AGT1:{enabled:true,period:400,unit:'ms',callback:'agt1_callback',priority:12}}),
 code:HEAD+`
volatile uint32_t ticks0 = 0;
volatile uint32_t ticks1 = 0;
volatile uint32_t presses = 0;
volatile uint32_t wakes = 0;

void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);
    R_AGT_Open(&g_agt0_ctrl, &g_agt0_cfg);
    R_AGT_Open(&g_agt1_ctrl, &g_agt1_cfg);
    R_AGT_Start(&g_agt0_ctrl);
    R_AGT_Start(&g_agt1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    while (1)
    {
        R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
        wakes++;
        if (1U == (wakes & 1U))
        {
            R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
        }
        else
        {
            R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
        }
    }
}

void agt0_callback(timer_callback_args_t * p_args)
{
    (void) p_args;
    ticks0++;
}

void agt1_callback(timer_callback_args_t * p_args)
{
    (void) p_args;
    ticks1++;
}

void external_irq1_callback(external_irq_callback_args_t * p_args)
{
    (void) p_args;
    presses++;
}
`+WARM_START};

// Deep Software Standby cancelled by the RTC's 1-second periodic request (RTC on LOCO, DEEPCUT 0), with IOKEEP: LED1 is
// on for 300 ms after each start, and LED2 says the start came from Deep Software Standby. The RTC keeps the PC time
// (start time HOST_TIME: R_RTC_Open does not stop it), so its seconds go on across the resets.
export const LPM_DEEP_RTC={
 mcu:mcu({LPM:{enabled:true,mode:'DEEP',wake:[],cancel:['RTC_INTERVAL'],cancelRising:[],ioKeep:true,power:'DEEPCUT0'},
  RTC:{enabled:true,clockSource:'LOCO',start:'HOST_TIME',freqCompare:255,callback:'rtc_callback',alarmPriority:12,periodicPriority:12,carryPriority:12}}),
 code:HEAD+`
volatile uint32_t from_deep_standby = 0;

void hal_entry(void)
{
    if (1U == R_SYSTEM->RSTSR0_b.DPSRSTF)
    {
        from_deep_standby = 1;
        R_LPM_IoKeepClear(NULL);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, BSP_IO_LEVEL_HIGH);
    }
    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);
    R_RTC_PeriodicIrqRateSet(&g_rtc0_ctrl, RTC_PERIODIC_IRQ_SELECT_1_SECOND);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    R_BSP_SoftwareDelay(300, BSP_DELAY_UNITS_MILLISECONDS);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}

void rtc_callback(rtc_callback_args_t * p_args)
{
    (void) p_args;
}
`+WARM_START};

// Programs from the review of feature 37, each run on both engines by tests/toolchain/ra-lpm.test.mjs ("review: <name>"):
// {mcu, code, ms: how long, at: {ms: session => …} (S1 presses), vars: the variables both engines must end with, and
// what the test checks besides (resets, log) in the test file}.
const press=(from,to)=>({[from]:s=>s.setPressed({SW1:true}),[to]:s=>s.setPressed({})});
const lpm=extra=>({enabled:true,mode:'DEEP',wake:[],cancel:[],cancelRising:[],ioKeep:true,power:'DEEPCUT0',...extra});
const pins=(peripherals,more)=>()=>{const m=raDefaultMcu();m.peripherals=peripherals;Object.assign(m.pins,more);return m;};
void pins;
export const LPM_REVIEW={
 // __WFE() after R_LPM_Open configured Software Standby: not a mode entry (r_lpm enters with WFI) — AGT0 keeps ticking,
 // and the core's event register lets every second WFE through.
 wfe:{mcu:mcu({LPM:lpm({mode:'STANDBY',wake:['IRQ1']}),AGT0:{enabled:true,period:7,unit:'ms',callback:'agt0_callback',priority:12}}),ms:400,at:press(300,330),vars:['ticks0','wakes','presses'],
  code:HEAD+`
volatile uint32_t ticks0 = 0;
volatile uint32_t wakes = 0;
volatile uint32_t presses = 0;
void agt0_callback(timer_callback_args_t * p_args) { (void) p_args; ticks0++; }
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; presses++; }
void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);
    R_AGT_Open(&g_agt0_ctrl, &g_agt0_cfg);
    R_AGT_Start(&g_agt0_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
    while (1)
    {
        __WFE();
        wakes++;
    }
}
`+WARM_START}
};

// A bare __WFI() after R_LPM_Open enters the configured mode (LPM_CFG_STANDBY_LIMIT 0), and a Software Standby that
// nothing can end: IRQ1 is its wake source, but its interrupt is never enabled.
export const LPM_STUCK={
 mcu:mcu({LPM:{enabled:true,mode:'STANDBY',wake:['IRQ1'],cancel:[],cancelRising:[],ioKeep:true,power:'DEEPCUT0'}}),
 code:HEAD+`
volatile uint32_t after = 0;

void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
    __WFI();
    after = 1;
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}

void external_irq1_callback(external_irq_callback_args_t * p_args)
{
    (void) p_args;
}
`+WARM_START};
