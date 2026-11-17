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
export const LPM_REVIEW={
 // Deep Software Standby cancelled by the AGT1 underflow (LOCO, DEEPCUT 0); AGT1 has no interrupt callback.
 agt:{mcu:mcu({LPM:lpm({cancel:['AGT1']}),AGT1:{enabled:true,period:400,unit:'ms',callback:'',priority:12}}),ms:1250,at:{},vars:['from'],
  code:HEAD+`
volatile uint32_t from = 0;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    from = R_SYSTEM->RSTSR0_b.DPSRSTF;
    R_LPM_IoKeepClear(NULL);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    R_AGT_Open(&g_agt1_ctrl, &g_agt1_cfg);
    R_AGT_Start(&g_agt1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // The IWDT (no stop control) in a Software Standby nothing else ends: its reset ends the mode (136.5 ms).
 iwdt:{mcu:mcu({LPM:lpm({mode:'STANDBY'}),IWDT:{enabled:true,timeout:2048,clockDiv:1,stopInSleep:false}}),ms:700,at:{},vars:['cause','from'],
  code:HEAD+`
volatile uint32_t cause = 0;
volatile uint32_t from = 0;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    cause = R_SYSTEM->RSTSR1;
    from = R_SYSTEM->RSTSR0;
    R_IWDT_Open(&g_iwdt0_ctrl, &g_iwdt0_cfg);
    R_IWDT_Refresh(&g_iwdt0_ctrl);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
    R_IWDT_Refresh(&g_iwdt0_ctrl);
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // Software Standby ended by the RTC periodic interrupt (WUPEN RTCPRD, every 0.5 s); a GPT keeps its count meanwhile.
 rtc:{mcu:mcu({LPM:lpm({mode:'STANDBY',wake:['RTCPRD']}),RTC:{enabled:true,start:'HOST_TIME',callback:'rtc_callback',periodicPriority:12},GPT1:{enabled:true,mode:'PERIODIC',period:30,unit:'ms',duty:50,callback:'gpt1_callback',priority:12}}),ms:1300,at:{},vars:['gpt_ticks','rtc_ticks','wakes'],
  code:HEAD+`
volatile uint32_t gpt_ticks = 0;
volatile uint32_t rtc_ticks = 0;
volatile uint32_t wakes = 0;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void gpt1_callback(timer_callback_args_t * p_args) { (void) p_args; gpt_ticks++; }
void rtc_callback(rtc_callback_args_t * p_args) { if (RTC_EVENT_PERIODIC_IRQ == p_args->event) { rtc_ticks++; } }
void hal_entry(void)
{
    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);
    R_RTC_PeriodicIrqRateSet(&g_rtc0_ctrl, RTC_PERIODIC_IRQ_SELECT_1_DIV_BY_2_SECOND);
    R_GPT_Open(&g_timer1_ctrl, &g_timer1_cfg);
    R_GPT_Start(&g_timer1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    while (1)
    {
        R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
        wakes++;
    }
}
`+WARM_START},
 // The WDT (register start, 41.9 ms, no stop control) keeps its count through Software Standby: only the awake time
 // (10 ms after each wake-up) counts, so it resets the MCU in the fifth awake stretch.
 wdt:{mcu:mcu({LPM:lpm({mode:'STANDBY',wake:['AGT1UD']}),AGT1:{enabled:true,period:400,unit:'ms',callback:'agt1_callback',priority:12},WDT:{enabled:true,clockDiv:128,stopInSleep:false}}),ms:2500,at:{},vars:['wakes','cause'],
  code:HEAD+`
volatile uint32_t wakes = 0;
volatile uint32_t cause = 0;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void agt1_callback(timer_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    cause = R_SYSTEM->RSTSR1;
    R_AGT_Open(&g_agt1_ctrl, &g_agt1_cfg);
    R_AGT_Start(&g_agt1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_WDT_Open(&g_wdt0_ctrl, &g_wdt0_cfg);
    R_WDT_Refresh(&g_wdt0_ctrl);
    R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    while (1)
    {
        R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
        wakes++;
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // IOKEEP hold and what the program does to the pins before R_LPM_IoKeepClear (LED1 by R_BSP_PinWrite, LED2 by
 // R_IOPORT_PinCfg): nothing shows, a pin read sees the held level, and both take effect at the release, 100 ms later.
 hold:{mcu:mcu({LPM:lpm({cancel:['IRQ1']})}),ms:600,at:press(200,230),vars:['from','read1','read2'],
  code:HEAD+`
volatile uint32_t from = 0;
volatile uint32_t read1 = 9;
volatile uint32_t read2 = 9;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    bsp_io_level_t level = BSP_IO_LEVEL_LOW;
    from = R_SYSTEM->RSTSR0_b.DPSRSTF;
    if (from)
    {
        R_BSP_PinAccessEnable();
        R_BSP_PinWrite(LED1, BSP_IO_LEVEL_LOW);
        R_BSP_PinAccessDisable();
        R_IOPORT_PinCfg(&g_ioport_ctrl, LED2, (uint32_t) IOPORT_CFG_PORT_DIRECTION_OUTPUT | (uint32_t) IOPORT_CFG_PORT_OUTPUT_HIGH);
        R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinRead(&g_ioport_ctrl, LED1, &level);
        read1 = (uint32_t) level;
        R_IOPORT_PinRead(&g_ioport_ctrl, LED2, &level);
        read2 = (uint32_t) level;
        R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
        R_LPM_IoKeepClear(NULL);
        while (1)
        {
            R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
        }
    }
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // After Deep Software Standby: RSTSR0 and DPSIFR0 say what happened (DPSRSTF, DIRQ1F), and writing 0 clears the flags.
 flags:{mcu:mcu({LPM:lpm({cancel:['IRQ1']})}),ms:400,at:press(200,230),vars:['rstsr0_start','dpsifr0_start','rstsr0_cleared','dpsifr0_cleared','flag_after'],
  code:HEAD+`
volatile uint32_t rstsr0_start = 0;
volatile uint32_t dpsifr0_start = 0;
volatile uint32_t rstsr0_cleared = 0xFF;
volatile uint32_t dpsifr0_cleared = 0xFF;
volatile uint32_t flag_after = 9;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    rstsr0_start  = R_SYSTEM->RSTSR0;
    dpsifr0_start = R_SYSTEM->DPSIFR0;
    if (1U == R_SYSTEM->RSTSR0_b.DPSRSTF)
    {
        R_LPM_IoKeepClear(NULL);
        R_BSP_RegisterProtectDisable(BSP_REG_PROTECT_OM_LPC_BATT);
        R_SYSTEM->RSTSR0_b.DPSRSTF = 0;
        R_SYSTEM->DPSIFR0 = 0;
        R_BSP_RegisterProtectEnable(BSP_REG_PROTECT_OM_LPC_BATT);
        rstsr0_cleared  = R_SYSTEM->RSTSR0;
        dpsifr0_cleared = R_SYSTEM->DPSIFR0;
        flag_after      = R_SYSTEM->RSTSR0_b.DPSRSTF;
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, BSP_IO_LEVEL_HIGH);
        while (1)
        {
            R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
        }
    }
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // IOKEEP hold after Deep Software Standby and a GPT PWM output (LED1 pin, GTIOC6B) started before R_LPM_IoKeepClear:
 // the pin stays as it was while held, and shows the PWM (duty 0.5) once released, 150 ms after the restart.
 holdpwm:{mcu:pins({LPM:lpm({cancel:['IRQ1']}),GPT6:{enabled:true,mode:'PWM',period:1,unit:'kHz',duty:50}},{P408:{function:'Peripheral',signal:'GPT6_GTIOCB',label:'LED1'}}),ms:400,at:press(200,230),vars:['from'],
  code:HEAD+`
volatile uint32_t from = 0;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    from = R_SYSTEM->RSTSR0_b.DPSRSTF;
    if (from)
    {
        R_GPT_Open(&g_timer6_ctrl, &g_timer6_cfg);
        R_GPT_Start(&g_timer6_ctrl);
        R_BSP_SoftwareDelay(150, BSP_DELAY_UNITS_MILLISECONDS);
        R_LPM_IoKeepClear(NULL);
        while (1)
        {
            R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
        }
    }
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // A GPT PWM output in Software Standby: the pin is at the timer's stop level while the clock is stopped, PWM again after it.
 pwm:{mcu:pins({LPM:lpm({mode:'STANDBY',wake:['IRQ1']}),GPT6:{enabled:true,mode:'PWM',period:1,unit:'kHz',duty:50}},{P408:{function:'Peripheral',signal:'GPT6_GTIOCB',label:'LED1'}}),ms:300,at:press(200,230),vars:['wakes'],
  code:HEAD+`
volatile uint32_t wakes = 0;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);
    R_GPT_Open(&g_timer6_ctrl, &g_timer6_cfg);
    R_GPT_Start(&g_timer6_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    wakes++;
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // R_LPM_LowPowerModeEnter called from an interrupt callback (handler mode): Deep Software Standby is entered there too;
 // the second press of S1 (IRQ1-DS) cancels it with the reset.
 isr:{mcu:mcu({LPM:lpm({cancel:['IRQ1']})}),ms:500,at:{...press(100,130),...press(300,330)},vars:['presses','after','err','from'],
  code:HEAD+`
volatile uint32_t presses = 0;
volatile uint32_t after = 0;
volatile int err = -1;
volatile uint32_t from = 0;
void hal_entry(void)
{
    from = R_SYSTEM->RSTSR0_b.DPSRSTF;
    R_LPM_IoKeepClear(NULL);
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
void external_irq1_callback(external_irq_callback_args_t * p_args)
{
    (void) p_args;
    presses++;
    err = (int) R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    after++;
}
`+WARM_START},
 // Sleep entered from the IRQ1 callback (priority 12): AGT0 at the same priority does not wake the core, AGT1 at priority 2
 // does (the WFI rule in handler mode). Standby the same way with AGT1 on LOCO as its wake source.
 isrsleep:{mcu:mcu({LPM:lpm({mode:'SLEEP'}),AGT0:{enabled:true,period:7,unit:'ms',callback:'agt0_callback',priority:12},AGT1:{enabled:true,period:150,unit:'ms',callback:'agt1_callback',priority:2}}),ms:400,at:press(40,60),vars:['presses','after','ticks0','ticks1','ticks0_at_wake'],
  code:HEAD+`
volatile uint32_t presses = 0;
volatile uint32_t after = 0;
volatile uint32_t ticks0 = 0;
volatile uint32_t ticks1 = 0;
volatile uint32_t ticks0_at_wake = 0;
void agt0_callback(timer_callback_args_t * p_args) { (void) p_args; ticks0++; }
void agt1_callback(timer_callback_args_t * p_args) { (void) p_args; ticks1++; }
void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);
    R_AGT_Open(&g_agt0_ctrl, &g_agt0_cfg);
    R_AGT_Open(&g_agt1_ctrl, &g_agt1_cfg);
    R_AGT_Start(&g_agt0_ctrl);
    R_AGT_Start(&g_agt1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
void external_irq1_callback(external_irq_callback_args_t * p_args)
{
    (void) p_args;
    presses++;
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    ticks0_at_wake = ticks0;
    after++;
}
`+WARM_START},
 // An interrupt request already waiting (interrupts disabled) keeps WFI from stopping the core: Deep Software Standby is
 // not entered, the call returns and the program goes on.
 pending:{mcu:mcu({LPM:lpm({cancel:['IRQ1']})}),ms:300,at:press(50,80),vars:['presses','after','err'],
  code:HEAD+`
volatile uint32_t presses = 0;
volatile uint32_t after = 0;
volatile int err = -1;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; presses++; }
void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    __disable_irq();
    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    err = (int) R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    after = 1;
    __enable_irq();
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // Sleep with only an opened RTC (no periodic or alarm request set up): R_RTC_Open enables no interrupt, nothing can end it.
 rtcsleep:{mcu:mcu({LPM:lpm({mode:'SLEEP'}),RTC:{enabled:true,start:'HOST_TIME',callback:'rtc_callback',periodicPriority:12}}),ms:100,at:{},vars:['woke'],
  code:HEAD+`
volatile uint32_t woke = 0;
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void rtc_callback(rtc_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    woke = 1;
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
 // Sleep ended by an interrupt that is not an IRQ pin, AGT, GPT or RTC (SCI9 transmit): both logs name it SCI9_TXI.
 uart:{mcu:pins({LPM:lpm({mode:'SLEEP'}),SCI9:{enabled:true,baud:115200,callback:'user_uart9_callback',priority:12}},{P109:{function:'Peripheral',signal:'SCI9_TXD'},P110:{function:'Peripheral',signal:'SCI9_RXD'}}),ms:100,at:{},vars:['woke'],
  code:HEAD+`
volatile uint32_t woke = 0;
void user_uart9_callback(uart_callback_args_t * p_args) { (void) p_args; }
void external_irq1_callback(external_irq_callback_args_t * p_args) { (void) p_args; }
void hal_entry(void)
{
    R_SCI_UART_Open(&g_uart9_ctrl, &g_uart9_cfg);
    R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);
    R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    R_SCI_UART_Write(&g_uart9_ctrl, (uint8_t *) "hello", 5);
    R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);
    woke = 1;
    while (1)
    {
        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START},
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
