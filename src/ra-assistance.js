// Feature 21 — Developer Assistance for an FSP project, as e² studio lists it under the project: HAL/Common → one
// entry per module of the Stacks (g_ioport, g_external_irq1, g_uart9 …), each with its "Call R_…()" items and, where
// the stack has a callback, the callback's definition. An item's code is what e² studio drops into the editor: the
// call with this project's instance names (g_…_ctrl / g_…_cfg) and a pin or value to change.
import {RA_IRQ_PINS} from './ra-config.js';

const call=(name,code)=>({label:`Call ${name}()`,code});
const callback=(name,type,body='    (void) p_args;')=>({label:'Callback function definition',code:`void ${name}(${type} *p_args)\n{\n${body}\n}\n`});

/** [{name, title, items:[{label, code}]}] for a validated RA MCU configuration. */
export function raAssistance(mcu){
  const pins=Object.entries(mcu?.pins||{}),per=mcu?.peripherals||{},out=[];
  const symbol=(fn,fallback)=>{const hit=pins.find(([,p])=>p.function===fn&&p.label)||pins.find(([,p])=>p.function===fn);return hit?(hit[1].label||`BSP_IO_PORT_${hit[0].slice(1,3)}_PIN_${hit[0].slice(3)}`):fallback;};
  out.push({name:'g_ioport',title:'I/O Port (r_ioport)',items:[
    call('R_IOPORT_PinWrite',`R_IOPORT_PinWrite(&g_ioport_ctrl, ${symbol('GPIO_Output','BSP_IO_PORT_04_PIN_08')}, BSP_IO_LEVEL_HIGH);`),
    call('R_IOPORT_PinRead',`bsp_io_level_t level;\nR_IOPORT_PinRead(&g_ioport_ctrl, ${symbol('GPIO_Input','BSP_IO_PORT_02_PIN_05')}, &level);`),
    call('R_IOPORT_PinCfg',`R_IOPORT_PinCfg(&g_ioport_ctrl, ${symbol('GPIO_Output','BSP_IO_PORT_04_PIN_08')}, IOPORT_CFG_PORT_DIRECTION_OUTPUT);`),
    call('R_IOPORT_Open','R_IOPORT_Open(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);')]});
  out.push({name:'BSP',title:'Board Support Package',items:[call('R_BSP_SoftwareDelay','R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);')]});
  for(const [pin,p]of pins)if(p.function==='IRQ'){const ch=RA_IRQ_PINS[pin],g=`g_external_irq${ch}`;
    out.push({name:g,title:`External IRQ ${ch} (r_icu) · ${pin}`,items:[
      call('R_ICU_ExternalIrqOpen',`R_ICU_ExternalIrqOpen(&${g}_ctrl, &${g}_cfg);`),call('R_ICU_ExternalIrqEnable',`R_ICU_ExternalIrqEnable(&${g}_ctrl);`),
      call('R_ICU_ExternalIrqDisable',`R_ICU_ExternalIrqDisable(&${g}_ctrl);`),call('R_ICU_ExternalIrqClose',`R_ICU_ExternalIrqClose(&${g}_ctrl);`),
      callback(p.callback||`external_irq${ch}_callback`,'external_irq_callback_args_t',`    if (${ch} == p_args->channel)\n    {\n        /* TODO: add your own code here */\n    }`)]});}
  const on=re=>Object.entries(per).filter(([id,q])=>re.test(id)&&q?.enabled).map(([id,q])=>[id.replace(/\D/g,''),q]);
  for(const [n,q]of on(/^SCI\d/).filter(([,q])=>q.mode!=='SPI')){const g=`g_uart${n}`;
    out.push({name:g,title:`UART (r_sci_uart) · SCI${n}`,items:[call('R_SCI_UART_Open',`R_SCI_UART_Open(&${g}_ctrl, &${g}_cfg);`),call('R_SCI_UART_Write',`R_SCI_UART_Write(&${g}_ctrl, (uint8_t *) "hello\\r\\n", 7);`),
      call('R_SCI_UART_Read',`uint8_t buffer[16];\nR_SCI_UART_Read(&${g}_ctrl, buffer, sizeof(buffer));`),call('R_SCI_UART_Close',`R_SCI_UART_Close(&${g}_ctrl);`),
      ...(q.callback?[callback(q.callback,'uart_callback_args_t',`    if (UART_EVENT_RX_CHAR == p_args->event)\n    {\n        /* p_args->data is the received character. */\n    }`)]:[])]});}
  for(const [n,q]of on(/^GPT\d/)){const g=`g_timer${n}`;
    out.push({name:g,title:`Timer (r_gpt) · GPT${n}`,items:[call('R_GPT_Open',`R_GPT_Open(&${g}_ctrl, &${g}_cfg);`),call('R_GPT_Start',`R_GPT_Start(&${g}_ctrl);`),call('R_GPT_Stop',`R_GPT_Stop(&${g}_ctrl);`),
      ...(q.mode==='PWM'?[call('R_GPT_DutyCycleSet',`timer_info_t info;\nR_GPT_InfoGet(&${g}_ctrl, &info);\nR_GPT_DutyCycleSet(&${g}_ctrl, info.period_counts / 2, GPT_IO_PIN_GTIOCB);`)]:[]),
      call('R_GPT_Close',`R_GPT_Close(&${g}_ctrl);`),...(q.callback?[callback(q.callback,'timer_callback_args_t')]:[])]});}
  for(const [n,q]of on(/^AGT\d/)){const g=`g_agt${n}`;
    out.push({name:g,title:`Timer (r_agt) · AGT${n}`,items:[call('R_AGT_Open',`R_AGT_Open(&${g}_ctrl, &${g}_cfg);`),call('R_AGT_Start',`R_AGT_Start(&${g}_ctrl);`),call('R_AGT_Stop',`R_AGT_Stop(&${g}_ctrl);`),call('R_AGT_Close',`R_AGT_Close(&${g}_ctrl);`),
      ...(q.callback?[callback(q.callback,'timer_callback_args_t')]:[])]});}
  for(const [,q]of on(/^ADC0$/)){
    out.push({name:'g_adc0',title:'ADC (r_adc)',items:[call('R_ADC_Open','R_ADC_Open(&g_adc0_ctrl, &g_adc0_cfg);'),call('R_ADC_ScanCfg','R_ADC_ScanCfg(&g_adc0_ctrl, &g_adc0_channel_cfg);'),call('R_ADC_ScanStart','R_ADC_ScanStart(&g_adc0_ctrl);'),
      call('R_ADC_Read','uint16_t adc_data;\nR_ADC_Read(&g_adc0_ctrl, ADC_CHANNEL_0, &adc_data);'),call('R_ADC_Close','R_ADC_Close(&g_adc0_ctrl);'),...(q.callback?[callback(q.callback,'adc_callback_args_t')]:[])]});}
  // An IIC channel in slave mode (r_iic_slave): the transfers are served from the callback, a buffer per request.
  for(const [n,q]of on(/^IIC\d/).filter(([,q])=>q.mode==='SLAVE')){const g=`g_i2c_slave${n}`;
    out.push({name:g,title:`I2C Slave (r_iic_slave) · IIC${n}`,items:[call('R_IIC_SLAVE_Open',`R_IIC_SLAVE_Open(&${g}_ctrl, &${g}_cfg);`),
      call('R_IIC_SLAVE_Read',`static uint8_t rx_buffer[4];\nR_IIC_SLAVE_Read(&${g}_ctrl, rx_buffer, sizeof(rx_buffer));`),
      call('R_IIC_SLAVE_Write',`static uint8_t tx_buffer[2] = { 0x00, 0x00 };\nR_IIC_SLAVE_Write(&${g}_ctrl, tx_buffer, sizeof(tx_buffer));`),
      call('R_IIC_SLAVE_Close',`R_IIC_SLAVE_Close(&${g}_ctrl);`),
      callback(q.callback,'i2c_slave_callback_args_t',`    static uint8_t rx_buffer[4];\n    static uint8_t tx_buffer[2];\n    switch (p_args->event)\n    {\n        case I2C_SLAVE_EVENT_RX_REQUEST:\n        case I2C_SLAVE_EVENT_RX_MORE_REQUEST:\n        {\n            /* The master writes: give a buffer for its bytes. */\n            R_IIC_SLAVE_Read(&${g}_ctrl, rx_buffer, sizeof(rx_buffer));\n            break;\n        }\n        case I2C_SLAVE_EVENT_TX_REQUEST:\n        case I2C_SLAVE_EVENT_TX_MORE_REQUEST:\n        {\n            /* The master reads: give the bytes to send. */\n            R_IIC_SLAVE_Write(&${g}_ctrl, tx_buffer, sizeof(tx_buffer));\n            break;\n        }\n        case I2C_SLAVE_EVENT_RX_COMPLETE:\n        {\n            /* p_args->bytes bytes are in rx_buffer. */\n            break;\n        }\n        case I2C_SLAVE_EVENT_TX_COMPLETE:\n        {\n            /* The master took p_args->bytes bytes. */\n            break;\n        }\n        default:\n        {\n            /* I2C_SLAVE_EVENT_ABORTED: the transfer did not finish. */\n            break;\n        }\n    }`)]});}
  for(const [n,q]of on(/^IIC\d/).filter(([,q])=>q.mode!=='SLAVE')){const g=`g_i2c_master${n}`;
    out.push({name:g,title:`I2C Master (r_iic_master) · IIC${n}`,items:[call('R_IIC_MASTER_Open',`R_IIC_MASTER_Open(&${g}_ctrl, &${g}_cfg);`),call('R_IIC_MASTER_Write',`uint8_t data[2] = { 0x00, 0x00 };\nR_IIC_MASTER_Write(&${g}_ctrl, data, sizeof(data), false);`),
      call('R_IIC_MASTER_Read',`uint8_t value;\nR_IIC_MASTER_Read(&${g}_ctrl, &value, 1, false);`),call('R_IIC_MASTER_Close',`R_IIC_MASTER_Close(&${g}_ctrl);`),
      ...(q.callback?[callback(q.callback,'i2c_master_callback_args_t')]:[])]});}
  // SPI masters: r_spi (g_spiN) and r_sci_spi (g_sci_spiN) share spi_api_t; a transfer ends in the callback.
  const spi=(g,title,api,q)=>out.push({name:g,title,items:[call(`R_${api}_Open`,`R_${api}_Open(&${g}_ctrl, &${g}_cfg);`),
    call(`R_${api}_Write`,`uint8_t tx[2] = { 0x00, 0x00 };\nR_${api}_Write(&${g}_ctrl, tx, sizeof(tx), SPI_BIT_WIDTH_8_BITS);`),
    call(`R_${api}_Read`,`uint8_t rx[2];\nR_${api}_Read(&${g}_ctrl, rx, sizeof(rx), SPI_BIT_WIDTH_8_BITS);`),
    call(`R_${api}_WriteRead`,`uint8_t tx[2] = { 0x00, 0x00 };\nuint8_t rx[2];\nR_${api}_WriteRead(&${g}_ctrl, tx, rx, sizeof(tx), SPI_BIT_WIDTH_8_BITS);`),
    call(`R_${api}_Close`,`R_${api}_Close(&${g}_ctrl);`),
    callback(q.callback,'spi_callback_args_t','    if (SPI_EVENT_TRANSFER_COMPLETE == p_args->event)\n    {\n        /* The transfer has finished. */\n    }')]});
  for(const [n,q]of on(/^SPI\d/))spi(`g_spi${n}`,`SPI (r_spi) · SPI${n}`,'SPI',q);
  for(const [n,q]of on(/^SCI\d/).filter(([,q])=>q.mode==='SPI'))spi(`g_sci_spi${n}`,`SPI (r_sci_spi) · SCI${n}`,'SCI_SPI',q);
  for(const id of ['WDT','IWDT'])if(per[id]?.enabled){const q=per[id],g=`g_${id.toLowerCase()}0`;
    out.push({name:g,title:`${id==='WDT'?'Watchdog (r_wdt)':'Independent Watchdog (r_iwdt)'}`,items:[call(`R_${id}_Open`,`R_${id}_Open(&${g}_ctrl, &${g}_cfg);`),call(`R_${id}_Refresh`,`R_${id}_Refresh(&${g}_ctrl);`),
      call(`R_${id}_CounterGet`,`uint32_t count;\nR_${id}_CounterGet(&${g}_ctrl, &count);`),call(`R_${id}_TimeoutGet`,`wdt_timeout_values_t timeout;\nR_${id}_TimeoutGet(&${g}_ctrl, &timeout);`),
      ...(q.reset==='NMI'?[call(`R_${id}_StatusGet`,`wdt_status_t status;\nR_${id}_StatusGet(&${g}_ctrl, &status);`),call(`R_${id}_StatusClear`,`R_${id}_StatusClear(&${g}_ctrl, WDT_STATUS_UNDERFLOW);`)]:[]),
      // FSP has no API for the reset cause: the reset status register says it (the flag stays until 0 is written).
      {label:'Read reset cause (RSTSR1)',code:`if (1U == R_SYSTEM->RSTSR1_b.${id}RF)\n{\n    /* The ${id} reset the MCU. */\n}\n`},
      ...(q.callback?[callback(q.callback,'wdt_callback_args_t')]:[])]});}
  if(per.RTC?.enabled){const q=per.RTC;
    out.push({name:'g_rtc0',title:'Realtime Clock (r_rtc)',items:[call('R_RTC_Open','R_RTC_Open(&g_rtc0_ctrl, &g_rtc0_cfg);'),
      call('R_RTC_CalendarTimeSet','/* 2026-01-01 09:00:00 (tm_year: years since 1900, tm_mon: 0-11; FSP sets tm_wday) */\nrtc_time_t set_time = { .tm_sec = 0, .tm_min = 0, .tm_hour = 9, .tm_mday = 1, .tm_mon = 0, .tm_year = 126 };\nR_RTC_CalendarTimeSet(&g_rtc0_ctrl, &set_time);'),
      call('R_RTC_CalendarTimeGet','rtc_time_t now;\nR_RTC_CalendarTimeGet(&g_rtc0_ctrl, &now);'),
      call('R_RTC_CalendarAlarmSet','rtc_alarm_time_t alarm = { .time = { .tm_sec = 30 }, .sec_match = true };\nR_RTC_CalendarAlarmSet(&g_rtc0_ctrl, &alarm);'),
      call('R_RTC_PeriodicIrqRateSet','R_RTC_PeriodicIrqRateSet(&g_rtc0_ctrl, RTC_PERIODIC_IRQ_SELECT_1_SECOND);'),
      call('R_RTC_InfoGet','rtc_info_t info;\nR_RTC_InfoGet(&g_rtc0_ctrl, &info);'),call('R_RTC_Close','R_RTC_Close(&g_rtc0_ctrl);'),
      ...(q.callback?[callback(q.callback,'rtc_callback_args_t','    if (RTC_EVENT_PERIODIC_IRQ == p_args->event)\n    {\n        /* TODO: every period */\n    }\n    else if (RTC_EVENT_ALARM_IRQ == p_args->event)\n    {\n        /* TODO: the alarm */\n    }')]:[])]});}
  // Data flash (r_flash_hp): 0x08000000, 64-byte erase blocks, 4-byte writes; read through a pointer.
  if(per.FLASH?.enabled){const q=per.FLASH;
    out.push({name:'g_flash0',title:'Flash (r_flash_hp)',items:[call('R_FLASH_HP_Open','R_FLASH_HP_Open(&g_flash0_ctrl, &g_flash0_cfg);'),
      call('R_FLASH_HP_Erase','/* Erase one 64-byte data flash block (flash is written only after an erase). */\nR_FLASH_HP_Erase(&g_flash0_ctrl, 0x08000000U, 1);'),
      call('R_FLASH_HP_Write','/* 4 bytes (a multiple of 4) to an erased 4-byte boundary of the data flash. */\nuint32_t value = 0x12345678U;\nR_FLASH_HP_Write(&g_flash0_ctrl, (uint32_t) &value, 0x08000000U, sizeof(value));'),
      call('R_FLASH_HP_BlankCheck','/* An erased cell has no defined value: ask whether it was written. */\nflash_result_t blank;\nR_FLASH_HP_BlankCheck(&g_flash0_ctrl, 0x08000000U, 4, &blank);\nif (FLASH_RESULT_NOT_BLANK == blank)\n{\n    uint32_t stored = *(uint32_t *) 0x08000000U;\n    (void) stored;\n}'),
      call('R_FLASH_HP_StatusGet','flash_status_t status;\nR_FLASH_HP_StatusGet(&g_flash0_ctrl, &status);'),
      call('R_FLASH_HP_InfoGet','flash_info_t info;\nR_FLASH_HP_InfoGet(&g_flash0_ctrl, &info);'),call('R_FLASH_HP_Close','R_FLASH_HP_Close(&g_flash0_ctrl);'),
      ...(q.bgo&&q.callback?[callback(q.callback,'flash_callback_args_t','    if (FLASH_EVENT_ERASE_COMPLETE == p_args->event)\n    {\n        /* TODO: the erase is done */\n    }\n    else if (FLASH_EVENT_WRITE_COMPLETE == p_args->event)\n    {\n        /* TODO: the write is done */\n    }\n    else if ((FLASH_EVENT_BLANK == p_args->event) || (FLASH_EVENT_NOT_BLANK == p_args->event))\n    {\n        /* TODO: the blank check result */\n    }\n    else\n    {\n        /* TODO: FLASH_EVENT_ERR_FAILURE and the other errors */\n    }')]:[])]});}
  // Low power modes: enter the configured mode, change it from the code, and what a start after Deep Software Standby does.
  if(per.LPM?.enabled){const q=per.LPM,deep=q.mode==='DEEP';
    out.push({name:'g_lpm0',title:'Low Power Modes (r_lpm)',items:[call('R_LPM_Open','R_LPM_Open(&g_lpm0_ctrl, &g_lpm0_cfg);'),call('R_LPM_LowPowerModeEnter','R_LPM_LowPowerModeEnter(&g_lpm0_ctrl);'),
      call('R_LPM_LowPowerReconfigure',`/* Another mode from the code: a copy of the Stacks configuration with the mode changed. */\nlpm_cfg_t sleep_cfg = g_lpm0_cfg;\nsleep_cfg.low_power_mode = LPM_MODE_SLEEP;\nR_LPM_LowPowerReconfigure(&g_lpm0_ctrl, &sleep_cfg);`),
      call('R_LPM_IoKeepClear','R_LPM_IoKeepClear(NULL);'),call('R_LPM_Close','R_LPM_Close(&g_lpm0_ctrl);'),
      // After Deep Software Standby the program starts from the reset vector: RSTSR0.DPSRSTF tells, and with IOKEEP the
      // pins stay as they were until IoKeepClear.
      {label:'Start after Deep Software Standby (RSTSR0.DPSRSTF)',code:`if (1U == R_SYSTEM->RSTSR0_b.DPSRSTF)\n{\n    /* The MCU restarted from Deep Software Standby${deep&&q.ioKeep?': release the I/O ports (IOKEEP)':''}. */\n    R_LPM_IoKeepClear(NULL);\n}\n`}]});}
  return out;
}
