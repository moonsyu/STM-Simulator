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

export const RA_EXAMPLES=[
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
];
export const raExample=id=>RA_EXAMPLES.find(e=>e.id===id);

// SCI9 UART on Arduino D0 (RXD9, P110) / D1 (TXD9, P109) with a USB-TTL style UART part (the FPB's J-Link OB has no
// virtual COM port): the board says hello, then echoes every character and toggles LED2.
const UART_EXAMPLE=Object.freeze({id:'ra_uart_echo',name:'SCI9 UART 송수신 · 에코 (R_SCI_UART_Open · Write · 콜백)',tags:['UART','SCI','serial','echo'],
 mcu:()=>{const m=raDefaultMcu();m.pins.P109={function:'Peripheral',signal:'SCI9_TXD'};m.pins.P110={function:'Peripheral',signal:'SCI9_RXD'};m.peripherals={SCI9:{enabled:true,baud:115200,callback:'user_uart9_callback',priority:12}};return m;},
 circuit:()=>({components:[{id:'term',type:'uart',name:'USB-TTL',x:520,y:300,rotation:0,baud:115200}],wires:[
  {id:'w_vcc',from:'part:term:p1',to:'board:J2:4',color:'#e5484d'},{id:'w_gnd',from:'part:term:p2',to:'board:J2:6',color:'#3a3a3a'},
  {id:'w_tx',from:'part:term:p3',to:'board:J5:1',color:'#f5c518'},{id:'w_rx',from:'part:term:p4',to:'board:J5:2',color:'#30a46c'}]}),
 code:HEAD+`
volatile uint32_t received = 0;
static volatile bool tx_done = true;
static uint8_t echo;

/* SCI9 (g_uart9): a received character comes back right away; LED2 toggles on every one. */
void user_uart9_callback(uart_callback_args_t *p_args)
{
    switch (p_args->event)
    {
        case UART_EVENT_RX_CHAR:
            echo = (uint8_t) p_args->data;
            received++;
            R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, (received & 1U) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW);
            R_SCI_UART_Write(&g_uart9_ctrl, &echo, 1);
            break;
        case UART_EVENT_TX_COMPLETE:
            tx_done = true;
            break;
        default:
            break;
    }
}

void hal_entry(void)
{
    static const uint8_t hello[] = "FPB-RA6E1 SCI9 ready\\r\\n";
    R_SCI_UART_Open(&g_uart9_ctrl, &g_uart9_cfg);
    tx_done = false;
    R_SCI_UART_Write(&g_uart9_ctrl, hello, sizeof(hello) - 1);

    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START});
RA_EXAMPLES.push(UART_EXAMPLE);
Object.freeze(RA_EXAMPLES);
