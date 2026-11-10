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
  for(const [n,q]of on(/^SCI\d/)){const g=`g_uart${n}`;
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
  for(const [n,q]of on(/^IIC\d/)){const g=`g_i2c_master${n}`;
    out.push({name:g,title:`I2C Master (r_iic_master) · IIC${n}`,items:[call('R_IIC_MASTER_Open',`R_IIC_MASTER_Open(&${g}_ctrl, &${g}_cfg);`),call('R_IIC_MASTER_Write',`uint8_t data[2] = { 0x00, 0x00 };\nR_IIC_MASTER_Write(&${g}_ctrl, data, sizeof(data), false);`),
      call('R_IIC_MASTER_Read',`uint8_t value;\nR_IIC_MASTER_Read(&${g}_ctrl, &value, 1, false);`),call('R_IIC_MASTER_Close',`R_IIC_MASTER_Close(&${g}_ctrl);`),
      ...(q.callback?[callback(q.callback,'i2c_master_callback_args_t')]:[])]});}
  return out;
}
