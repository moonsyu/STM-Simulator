// Error-case pass, feature 2 (FPB-RA6E1): a pin's symbolic name becomes a #define and a callback name a function of the
// generated code. A name C or the generated code already uses once went through and broke the build with an error far
// from the setting (LED named "int"); it is refused where it is typed, with the reason.
import test from 'node:test';
import assert from 'node:assert/strict';
import {raDefaultMcu,validateRaMcu,raNameProblem} from '../../src/ra-config.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';

const withLabel=name=>{const m=raDefaultMcu();m.pins.P408.label=name;return m;};
const withCallback=name=>{const m=raDefaultMcu();m.pins.P205.callback=name;return m;};

test('pin symbols: C words, library and generated names are refused; ordinary names are fine',()=>{
 for(const name of ['int','while','return','main','hal_entry','NULL','true','uint8_t','printf','errno'])assert.throws(()=>validateRaMcu(withLabel(name)),/P408: .*C나 생성 코드가 쓰는 이름입니다\. 다른 이름을 쓰세요\./,name);
 for(const name of ['R_IOPORT_PinWrite','BSP_IO_PORT_04_PIN_08','IOPORT_CFG_NAME','FSP_SUCCESS','__reserved','_Reserved'])assert.throws(()=>validateRaMcu(withLabel(name)),/FSP와 컴파일러가 씁니다/,name);
 for(const name of ['g_ioport','g_ioport_ctrl','g_external_irq1','g_uart9_cfg','g_timer6_ctrl','g_adc0_channel_cfg','g_bsp_pin_cfg'])assert.throws(()=>validateRaMcu(withLabel(name)),/생성 코드의 인스턴스 이름입니다/,name);
 for(const name of ['LED1','BBQ_LED','MOTOR','led_red','_x','g_my_led','Interrupt','r_led','mainLed','int_led'])assert.equal(validateRaMcu(withLabel(name)).pins.P408.label,name);
 assert.equal(raNameProblem('LED1'),'');assert.match(raNameProblem('int'),/int/);
});

test('callbacks: the same names are refused, and a callback cannot be called like a pin symbol',()=>{
 for(const name of ['int','main','hal_entry','printf','g_ioport','R_BSP_WarmStart'])assert.throws(()=>validateRaMcu(withCallback(name)),/P205: /,name);
 assert.throws(()=>validateRaMcu(withCallback('LED1')),/P205: 콜백 이름 LED1은\(는\) 핀 이름\(심볼\)과 같습니다/);
 assert.equal(validateRaMcu(withCallback('irq_callback')).pins.P205.callback,'irq_callback');
 // A peripheral's callback too.
 const uart=RA_EXAMPLES.find(e=>e.id==='ra_uart_echo').mcu(),id=Object.keys(uart.peripherals).find(k=>k.startsWith('SCI'));
 uart.peripherals[id].callback='main';assert.throws(()=>validateRaMcu(uart),new RegExp(`${id}: main`));
});

// Feature 32 review: hal_data.h declares each callback with its module's argument type, so a name shared by modules of
// different kinds is two conflicting prototypes; FSP's own ISR and API object names are taken by the drivers.
test('callbacks: modules whose callback arguments differ cannot share a name; FSP ISR and API object names are refused',()=>{
 const mcu=(spi,uart,extra={})=>{const m=raDefaultMcu();Object.assign(m.pins,{P101:{function:'Peripheral',signal:'SPI1_MOSI'},P102:{function:'Peripheral',signal:'SPI1_RSPCK'},P109:{function:'Peripheral',signal:'SCI9_TXD'}});m.peripherals={SPI1:{enabled:true,callback:spi},SCI9:{enabled:true,callback:uart},...extra};return m;};
 assert.throws(()=>validateRaMcu(mcu('shared_cb','shared_cb')),/SCI9: 콜백 이름 shared_cb은\(는\) SPI1의 콜백과 같지만 인자 형식이 다릅니다\(uart_callback_args_t \/ spi_callback_args_t\)/);
 // Existing modules too: an SCI UART and a GPT timer, or the S1 IRQ and an IIC master.
 assert.throws(()=>validateRaMcu(mcu('spi1_callback','tick',{GPT1:{enabled:true,mode:'PERIODIC',period:500,unit:'ms',callback:'tick'}})),/GPT1: 콜백 이름 tick은\(는\) SCI9의 콜백과 같지만 인자 형식이 다릅니다/);
 const irq=raDefaultMcu();Object.assign(irq.pins,{P400:{function:'Peripheral',signal:'IIC0_SCL'},P401:{function:'Peripheral',signal:'IIC0_SDA'}});irq.peripherals={IIC0:{enabled:true,callback:'external_irq1_callback'}};
 assert.throws(()=>validateRaMcu(irq),/IIC0: 콜백 이름 external_irq1_callback은\(는\) P205의 콜백과 같지만 인자 형식이 다릅니다/);
 // Stacks of one kind may share a function, as FSP allows: SCI9 simple SPI and SPI1, GPT1 and AGT0 (both timers).
 const spis=mcu('any_spi','any_spi');spis.pins.P111={function:'Peripheral',signal:'SCI9_SCK'};spis.peripherals.SCI9.mode='SPI';
 assert.equal(validateRaMcu(spis).peripherals.SCI9.callback,'any_spi');
 assert.doesNotThrow(()=>validateRaMcu(mcu('spi1_callback','u',{GPT1:{enabled:true,mode:'PERIODIC',period:500,unit:'ms',callback:'tick'},AGT0:{enabled:true,period:100,unit:'ms',callback:'tick'}})));
 for(const name of ['spi_rxi_isr','sci_spi_tei_isr','sci_uart_rxi_isr','iic_master_eri_isr','r_icu_isr','gpt_counter_overflow_isr','agt_int_isr','adc_scan_end_isr'])assert.throws(()=>validateRaMcu(mcu(name,'u')),/인터럽트 처리 함수\(ISR\) 이름입니다\. 다른 이름을 쓰세요\./,name);
 for(const name of ['g_spi_on_spi','g_spi_on_sci','g_uart_on_sci','g_timer_on_gpt'])assert.throws(()=>validateRaMcu(mcu(name,'u')),/API 객체 이름\(g_…_on_…\)입니다/,name);
 assert.throws(()=>validateRaMcu(withLabel('spi_tei_isr')),/ISR/,'a pin symbol as well');
});

// Re-check of the review fix: the generator writes no disabled stack (the Pins dialog keeps a stack's settings, callback
// included, when its pins are cleared), so a disabled one shares a name with anything; and only FSP's own API objects
// are refused, not every g_…_on_… name.
test('callbacks: a disabled stack keeps its name without a clash; only the FSP API object names of the headers are refused',()=>{
 const m=raDefaultMcu();m.pins.P109={function:'Peripheral',signal:'SCI9_TXD'};
 m.peripherals={SPI1:{enabled:false,bitrate:1000000,cpol:0,cpha:0,bitOrder:'MSB',ssl:'SSL0',callback:'my_callback',priority:12},SCI9:{enabled:true,callback:'my_callback'}};
 assert.equal(validateRaMcu(m).peripherals.SCI9.callback,'my_callback','a saved project opens');
 const gpt=raDefaultMcu();gpt.peripherals={GPT1:{enabled:false,mode:'PWM',period:1,unit:'kHz',duty:50,callback:'external_irq1_callback',priority:12}};
 assert.doesNotThrow(()=>validateRaMcu(gpt));
 m.peripherals.SPI1.enabled=true;m.peripherals.SPI1.ssl='NONE';Object.assign(m.pins,{P101:{function:'Peripheral',signal:'SPI1_MOSI'},P102:{function:'Peripheral',signal:'SPI1_RSPCK'}});
 assert.throws(()=>validateRaMcu(m),/인자 형식이 다릅니다/,'enabled again: the clash is back');
 for(const name of ['g_button_on_press','g_led_on_off','g_spi_on_done','g_uart_on_receive'])assert.equal(raNameProblem(name),'',name);
 for(const name of ['g_uart_on_sci','g_spi_on_spi','g_spi_on_sci','g_timer_on_gpt','g_timer_on_agt','g_external_irq_on_icu','g_i2c_master_on_iic','g_adc_on_adc','g_ioport_on_ioport','g_transfer_on_dtc'])assert.match(raNameProblem(name),/API 객체 이름/,name);
});

test('every example and the board template keep their names',()=>{
 assert.doesNotThrow(()=>validateRaMcu(raDefaultMcu()));
 for(const e of RA_EXAMPLES)assert.doesNotThrow(()=>validateRaMcu(e.mcu()),e.id);
});
