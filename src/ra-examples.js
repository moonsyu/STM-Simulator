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
// GPT6 saw-wave PWM on LED1 (P408 = GTIOC6B) and GPT1 as a 500 ms periodic timer whose cycle-end callback toggles LED2.
const GPT_EXAMPLE=Object.freeze({id:'ra_gpt_pwm',name:'GPT PWM으로 LED1 밝기 · 주기 인터럽트로 LED2 (R_GPT_Open · DutyCycleSet · 콜백)',tags:['GPT','PWM','timer','interrupt','LED'],
 mcu:()=>{const m=raDefaultMcu();m.pins.P408={function:'Peripheral',signal:'GPT6_GTIOCB',label:'LED1'};m.peripherals={GPT6:{enabled:true,mode:'PWM',period:1,unit:'kHz',duty:0},GPT1:{enabled:true,mode:'PERIODIC',period:500,unit:'ms',callback:'gpt1_callback',priority:12}};return m;},
 code:HEAD+`
volatile uint32_t ticks = 0;
volatile uint32_t duty_percent = 0;

/* GPT1 cycle end, every 500 ms: LED2 toggles. */
void gpt1_callback(timer_callback_args_t *p_args)
{
    if (TIMER_EVENT_CYCLE_END == p_args->event)
    {
        ticks++;
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, (ticks & 1U) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW);
    }
}

void hal_entry(void)
{
    timer_info_t info;

    /* g_timer6: 1 kHz PWM on GTIOC6B (LED1). */
    R_GPT_Open(&g_timer6_ctrl, &g_timer6_cfg);
    R_GPT_Start(&g_timer6_ctrl);
    R_GPT_InfoGet(&g_timer6_ctrl, &info);

    /* g_timer1: 500 ms periodic, gpt1_callback on every cycle end. */
    R_GPT_Open(&g_timer1_ctrl, &g_timer1_cfg);
    R_GPT_Start(&g_timer1_ctrl);

    /* LED1 brightens from 0 to 100 % in steps of 10 % every 100 ms, then starts over. */
    while (1)
    {
        for (duty_percent = 0; duty_percent <= 100; duty_percent += 10)
        {
            R_GPT_DutyCycleSet(&g_timer6_ctrl, info.period_counts / 100 * duty_percent, GPT_IO_PIN_GTIOCB);
            R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
        }
    }
}
`+WARM_START});
// ADC12 single scan of A0 (P000 = AN000) with a potentiometer between 3V3 and GND: LED1 lights above half scale.
const ADC_EXAMPLE=Object.freeze({id:'ra_adc_pot',name:'가변저항 전압 읽기 (R_ADC_Open · ScanCfg · ScanStart · Read)',tags:['ADC','analog','potentiometer'],
 mcu:()=>{const m=raDefaultMcu();m.pins.P000={function:'Analog',label:'POT'};m.peripherals={ADC0:{enabled:true,mode:'SINGLE',resolution:12}};return m;},
 circuit:()=>({components:[{id:'pot',type:'potentiometer',name:'VR1',x:520,y:380,rotation:0,value:10000,position:50}],wires:[
  {id:'w_gnd',from:'part:pot:p1',to:'board:J2:6',color:'#3a3a3a'},{id:'w_wiper',from:'part:pot:p2',to:'board:J6:1',color:'#f5c518'},{id:'w_vcc',from:'part:pot:p3',to:'board:J2:4',color:'#e5484d'}]}),
 code:HEAD+`
volatile uint16_t adc_value = 0;
volatile uint32_t millivolts = 0;

void hal_entry(void)
{
    adc_status_t status;

    /* g_adc0: single scan of AN000 (A0, P000). */
    R_ADC_Open(&g_adc0_ctrl, &g_adc0_cfg);
    R_ADC_ScanCfg(&g_adc0_ctrl, &g_adc0_channel_cfg);

    while (1)
    {
        R_ADC_ScanStart(&g_adc0_ctrl);
        do
        {
            R_ADC_StatusGet(&g_adc0_ctrl, &status);
        } while (ADC_STATE_SCAN_IN_PROGRESS == status.state);
        R_ADC_Read(&g_adc0_ctrl, ADC_CHANNEL_0, (uint16_t *) &adc_value);
        millivolts = (uint32_t) adc_value * 3300U / 4095U;

        /* LED1 on above half scale. */
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, (adc_value > 2048U) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(20, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START});
// AGT0 (LOCO, 250 ms) toggles LED1 from its callback; AGT1 (PCLKB, 1 ms) counts milliseconds for the main loop's LED2.
const AGT_EXAMPLE=Object.freeze({id:'ra_agt_tick',name:'AGT 주기 타이머 · 1 ms 틱 (R_AGT_Open · Start · 콜백)',tags:['AGT','timer','interrupt','tick'],
 mcu:()=>({...raDefaultMcu(),peripherals:{AGT0:{enabled:true,period:250,unit:'ms',callback:'agt0_callback',priority:12},AGT1:{enabled:true,period:1,unit:'ms',callback:'agt1_callback',priority:10}}}),
 code:HEAD+`
volatile uint32_t ms = 0;
volatile uint32_t blinks = 0;

/* AGT0 underflow, every 250 ms (LOCO count source): LED1 toggles. */
void agt0_callback(timer_callback_args_t *p_args)
{
    (void) p_args;
    blinks++;
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, (blinks & 1U) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW);
}

/* AGT1 underflow, every 1 ms (PCLKB): a millisecond tick. */
void agt1_callback(timer_callback_args_t *p_args)
{
    (void) p_args;
    ms++;
}

void hal_entry(void)
{
    uint32_t next = 1000;

    R_AGT_Open(&g_agt0_ctrl, &g_agt0_cfg);
    R_AGT_Start(&g_agt0_ctrl);
    R_AGT_Open(&g_agt1_ctrl, &g_agt1_cfg);
    R_AGT_Start(&g_agt1_ctrl);

    /* LED2 toggles every 1000 ticks of AGT1. */
    while (1)
    {
        if (ms >= next)
        {
            next += 1000;
            R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, ((next / 1000) & 1U) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW);
        }
    }
}
`+WARM_START});
// IIC0 master on Arduino SDA/SCL (P401/P400, the board's 2.2 kΩ pull-ups) with the 256-byte I²C memory part at 0x50:
// write 4 bytes at 0x10, read them back with a repeated start, then try 0x51 where nothing answers (NACK → aborted).
const IIC_EXAMPLE=Object.freeze({id:'ra_iic_memory',name:'I²C 메모리 쓰기·읽기 (R_IIC_MASTER_Open · Write · Read · 콜백)',tags:['I2C','IIC','EEPROM','memory'],
 mcu:()=>{const m=raDefaultMcu();m.pins.P400={function:'Peripheral',signal:'IIC0_SCL'};m.pins.P401={function:'Peripheral',signal:'IIC0_SDA'};m.peripherals={IIC0:{enabled:true,rate:'STANDARD',slave:0x50,callback:'i2c_master0_callback',priority:12}};return m;},
 circuit:()=>({components:[{id:'mem',type:'i2c',name:'I2C1',x:520,y:200,rotation:0,address:0x50}],wires:[
  {id:'w_vcc',from:'part:mem:p1',to:'board:J2:4',color:'#e5484d'},{id:'w_gnd',from:'part:mem:p2',to:'board:J2:6',color:'#3a3a3a'},
  {id:'w_sda',from:'part:mem:p3',to:'board:J1:9',color:'#30a46c'},{id:'w_scl',from:'part:mem:p4',to:'board:J1:10',color:'#f5c518'}]}),
 code:HEAD+`
static volatile i2c_master_event_t i2c_event = I2C_MASTER_EVENT_ABORTED;
static volatile bool i2c_done = false;
volatile uint32_t matched = 0;
volatile uint32_t nack_seen = 0;
uint8_t readback[4];

/* r_iic_master reports the end of every transfer here. */
void i2c_master0_callback(i2c_master_callback_args_t *p_args)
{
    i2c_event = p_args->event;
    i2c_done = true;
}

static i2c_master_event_t wait_i2c(void)
{
    while (!i2c_done)
    {
    }
    i2c_done = false;
    return i2c_event;
}

void hal_entry(void)
{
    static uint8_t write_data[] = { 0x10, 'R', 'A', '6', 'E' };
    static uint8_t offset = 0x10;

    R_IIC_MASTER_Open(&g_i2c_master0_ctrl, &g_i2c_master0_cfg);

    /* Write 4 bytes at 0x10, then set the address again (repeated start) and read them back. */
    R_IIC_MASTER_Write(&g_i2c_master0_ctrl, write_data, sizeof(write_data), false);
    wait_i2c();
    R_IIC_MASTER_Write(&g_i2c_master0_ctrl, &offset, 1, true);
    wait_i2c();
    R_IIC_MASTER_Read(&g_i2c_master0_ctrl, readback, sizeof(readback), false);
    if (I2C_MASTER_EVENT_RX_COMPLETE == wait_i2c())
    {
        matched = (readback[0] == 'R') && (readback[1] == 'A') && (readback[2] == '6') && (readback[3] == 'E');
    }
    R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, matched ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW);

    /* Nothing answers at 0x51: the address byte gets a NACK and the transfer is aborted. */
    R_IIC_MASTER_SlaveAddressSet(&g_i2c_master0_ctrl, 0x51, I2C_MASTER_ADDR_MODE_7BIT);
    R_IIC_MASTER_Read(&g_i2c_master0_ctrl, readback, 1, false);
    nack_seen = (I2C_MASTER_EVENT_ABORTED == wait_i2c());

    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
    }
}
`+WARM_START});
// ---- The course exercises (RA6E1 lecture, Day 5), as its slides write them.
// Switch polling: S1 (P205) as an input with the pull-up, read with R_IOPORT_PinRead; each press toggles LED1. The
// 100 ms waits are the debounce: without them a bouncing contact toggles the LED several times (파형 탭 → 버튼 채터링).
const POLL_EXAMPLE=Object.freeze({id:'ra_button_poll',name:'S1 폴링으로 LED1 토글 · 디바운스 (R_IOPORT_PinRead)',tags:['GPIO','button','polling','debounce','PinRead'],
 mcu:()=>{const m=raDefaultMcu();m.pins.P205={function:'GPIO_Input',pull:'PULLUP',label:'SW1'};return m;},
 code:HEAD+`
/* S1 is pressed: the pin reads LOW (the switch connects it to GND, the pull-up holds it HIGH otherwise). */
static bool isButton(void)
{
    bsp_io_level_t level;
    fsp_err_t err = R_IOPORT_PinRead(&g_ioport_ctrl, SW1, &level);
    if (FSP_SUCCESS != err)
    {
        return false;
    }
    return BSP_IO_LEVEL_LOW == level;
}

void hal_entry(void)
{
    bsp_io_level_t led = BSP_IO_LEVEL_LOW;

    while (1)
    {
        if (isButton())
        {
            led = (BSP_IO_LEVEL_LOW == led) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW;
            R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, led);

            /* Debounce: wait out the bounce of the press, then of the release. */
            R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
            while (isButton())
            {
            }
            R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
        }
    }
}
`+WARM_START});

// External interrupt as the course sets it up: Stack g_external_irq1 with callback irq_callback, trigger Rising (the
// release of S1), opened in R_BSP_WarmStart and enabled in hal_entry; the callback tells the channel by p_args->channel.
const IRQ_COURSE_EXAMPLE=Object.freeze({id:'ra_button_irq_rising',name:'S1 인터럽트(Rising · irq_callback)로 LED2 토글 — 강의 방식',tags:['IRQ','ICU','button','interrupt','rising','WarmStart'],
 mcu:()=>{const m=raDefaultMcu();m.pins.P205={function:'IRQ',edge:'RISING',pull:'PULLUP',priority:12,label:'SW1',callback:'irq_callback'};return m;},
 code:HEAD+`
static volatile bsp_io_level_t led2 = BSP_IO_LEVEL_LOW;

/* Called from r_icu's ISR. One callback can serve several IRQ stacks: p_args->channel says which one fired. */
void irq_callback(external_irq_callback_args_t *p_args)
{
    if (1 == p_args->channel)
    {
        led2 = (BSP_IO_LEVEL_LOW == led2) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW;
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, led2);
    }
}

void hal_entry(void)
{
    R_ICU_ExternalIrqEnable(&g_external_irq1_ctrl);

    /* LED1 blinks on its own; S1 toggles LED2 when it is let go (rising edge). */
    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
    }
}

void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event)
    {
        /* C runtime environment and system clocks are setup. */

        /* Configure pins. */
        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);

        /* Open the external interrupt before main code runs. */
        R_ICU_ExternalIrqOpen(&g_external_irq1_ctrl, &g_external_irq1_cfg);
    }
}
`});

// The course's challenge: four external LEDs on the Arduino header show the 16 combinations xxxx … oooo, one every
// 0.1 s (walked by a recursive function); switch 1 starts over, switch 2 pauses and resumes at once. The switches
// are on header pins that can be IRQ inputs: D2 (P409, IRQ6) and D8 (P402, IRQ4).
const CHALLENGE_EXAMPLE=Object.freeze({id:'ra_led4_switch2',name:'도전: 외부 LED 4개 16가지 조합 · 스위치 2개(다시 시작 / 일시정지)',tags:['GPIO','LED','IRQ','button','recursion','Arduino','challenge'],
 mcu:()=>{const m=raDefaultMcu();
  Object.assign(m.pins,{P107:{function:'GPIO_Output',initial:0,drive:'LOW',label:'LED_A'},P303:{function:'GPIO_Output',initial:0,drive:'LOW',label:'LED_B'},P113:{function:'GPIO_Output',initial:0,drive:'LOW',label:'LED_C'},P103:{function:'GPIO_Output',initial:0,drive:'LOW',label:'LED_D'},
   P409:{function:'IRQ',edge:'FALLING',pull:'PULLUP',priority:12,label:'SW_RESTART',callback:'restart_callback'},P402:{function:'IRQ',edge:'FALLING',pull:'PULLUP',priority:12,label:'SW_PAUSE',callback:'pause_callback'}});
  return m;},
 circuit:()=>{const components=[],wires=[];let n=0;const wire=(from,to,color)=>wires.push({id:'w'+(++n),from,to,color});
  // D4 (J5-5), D6 (J5-7), D7 (J5-8), D10 (J1-3): each through 330 Ω to an LED to GND.
  [['a','board:J5:5'],['b','board:J5:7'],['c','board:J5:8'],['d','board:J1:3']].forEach(([k,pin],i)=>{
   components.push({id:'r'+k,type:'resistor',name:'R'+(i+1),value:330,x:520,y:120+60*i,rotation:0},{id:'led'+k,type:'led',name:'LED'+(i+1),color:['red','yellow','green','blue'][i],x:620,y:120+60*i,rotation:0});
   wire(pin,`part:r${k}:a`,'#23a68a');wire(`part:r${k}:b`,`part:led${k}:a`,'#23a68a');wire(`part:led${k}:b`,'board:J2:6','#3a3a3a');});
  // D2 (J5-3) and D8 (J1-1): a push button to GND (the pins have their pull-ups on).
  [['sw1','SW1','board:J5:3'],['sw2','SW2','board:J1:1']].forEach(([id,name,pin],i)=>{components.push({id,type:'button',name,x:520,y:380+70*i,rotation:0});wire(pin,`part:${id}:a`,'#8064d8');wire(`part:${id}:d`,'board:J2:7','#3a3a3a');});
  return {components,wires};},
 code:HEAD+`
static const bsp_io_port_pin_t leds[4] = { LED_A, LED_B, LED_C, LED_D };
static volatile bool restart = false;
static volatile bool paused  = false;

/* Switch 1 (D2, IRQ6): start over. Switch 2 (D8, IRQ4): pause / resume. */
void restart_callback(external_irq_callback_args_t *p_args)
{
    (void) p_args;
    restart = true;
}

void pause_callback(external_irq_callback_args_t *p_args)
{
    (void) p_args;
    paused = !paused;
}

static void show(uint8_t value)
{
    for (int i = 0; i < 4; i++)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, leds[i], (value & (1U << (3 - i))) ? BSP_IO_LEVEL_HIGH : BSP_IO_LEVEL_LOW);
    }
}

/* Walks the combinations of the remaining LEDs: off first, then on. Returns false when switch 1 asked to start over. */
static bool play(uint8_t value, int led)
{
    if (4 == led)
    {
        show(value);
        /* 0.1 s in 10 ms steps, so a pause or a restart takes effect at once. */
        for (int step = 0; step < 10; step++)
        {
            R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);
            while (paused && !restart)
            {
            }
            if (restart)
            {
                return false;
            }
        }
        return true;
    }
    return play((uint8_t) (value << 1), led + 1) && play((uint8_t) ((value << 1) | 1U), led + 1);
}

void hal_entry(void)
{
    R_ICU_ExternalIrqOpen(&g_external_irq6_ctrl, &g_external_irq6_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq6_ctrl);
    R_ICU_ExternalIrqOpen(&g_external_irq4_ctrl, &g_external_irq4_cfg);
    R_ICU_ExternalIrqEnable(&g_external_irq4_ctrl);

    while (1)
    {
        restart = false;
        paused  = false;
        play(0, 0);
    }
}

void external_irq1_callback(external_irq_callback_args_t *p_args)
{
    (void) p_args;
}
`+WARM_START});
RA_EXAMPLES.push(POLL_EXAMPLE,IRQ_COURSE_EXAMPLE,UART_EXAMPLE,GPT_EXAMPLE,ADC_EXAMPLE,AGT_EXAMPLE,IIC_EXAMPLE,CHALLENGE_EXAMPLE);
Object.freeze(RA_EXAMPLES);
