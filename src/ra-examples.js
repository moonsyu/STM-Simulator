// FSP examples for the FPB-RA6E1 (Renesas RA6E1): hal_entry.c code with the pin settings it needs, as e² studio
// projects for the board are written (hal_data.h instances, R_IOPORT_*, R_ICU_*, R_BSP_SoftwareDelay).
import {raDefaultMcu} from './ra-config.js';

const WARM_START=`
void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event)
    {
        /* C runtime environment and system clocks are setup. */

        /* Configure pins. */
        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}
`;
const HEAD=`#include "hal_data.h"

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER
`;

export const RA_EXAMPLES=Object.freeze([
 Object.freeze({id:'ra_blink',name:'LED1 깜빡이기 (R_IOPORT_PinWrite · R_BSP_SoftwareDelay)',tags:['GPIO','LED','delay'],
  mcu:()=>raDefaultMcu(),
  code:HEAD+`
void hal_entry(void)
{
    /* LED1 (P408) on 500 ms, off 500 ms. */
    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
    }
}

void external_irq1_callback(external_irq_callback_args_t *p_args)
{
    (void) p_args;
}
`+WARM_START}),
 Object.freeze({id:'ra_button_irq',name:'S1 외부 인터럽트로 LED2 토글 (R_ICU_ExternalIrqOpen · IRQ1)',tags:['IRQ','ICU','button','interrupt'],
  mcu:()=>raDefaultMcu(),
  code:HEAD+`
volatile uint32_t presses = 0;
static bsp_io_level_t led2 = BSP_IO_LEVEL_LOW;

/* S1 (P205, IRQ1) falling edge: g_external_irq1 calls this from r_icu's ISR. */
void external_irq1_callback(external_irq_callback_args_t *p_args)
{
    (void) p_args;
    presses++;
    led2 = (BSP_IO_LEVEL_LOW == led2) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW;
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, led2);
}

void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);

    /* LED1 blinks while the interrupt waits for S1. */
    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(200, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(200, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START})
]);
export const raExample=id=>RA_EXAMPLES.find(e=>e.id===id);
