// FPB-RA6E1 (Renesas RA6E1): MCU settings, the RASC-style generated FSP files, board pins, the project model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RA6E1_PORTS,RA_IRQ_PINS,raDefaultMcu,validateRaMcu,raPinName,raPortBit,FPB_RA6E1} from '../../src/ra-config.js';
import {generateRaFiles,pinCfgWord,raVectors,raHalEntry} from '../../src/ra-generator.js';
import {boardPins,boardSize,setActiveBoard,PINS,GPIO_PINS,BOARD,PIN_BY_ID,ALL_GPIO_PINS} from '../../src/pins.js';
import {projectForBoard,validateProject,blankProject} from '../../src/project.js';
import {resetMainCode} from '../../src/code-reset.js';
import {resetBoardConfiguration} from '../../src/board-reset.js';
import {getBoard} from '../../src/boards.js';
import {DEVBOARD_MODELS} from '../../src/devboards.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';

test('RA6E1 LQFP100: 76 ports, IRQ channels from Table 1.16, pin names and port/bit',()=>{
 assert.equal(RA6E1_PORTS.length,76);assert.equal(new Set(RA6E1_PORTS).size,76);
 assert.equal(RA_IRQ_PINS.P205,1);assert.equal(RA_IRQ_PINS.P409,6);assert.equal(RA_IRQ_PINS.P104,1);assert.equal(RA_IRQ_PINS.P407,undefined);
 assert.ok(Object.keys(RA_IRQ_PINS).every(p=>RA6E1_PORTS.includes(p)));
 assert.equal(raPinName('BSP_IO_PORT_04_PIN_08'),'P408');assert.equal(raPinName('p205'),'P205');
 assert.deepEqual(raPortBit('P408'),{port:4,bit:8});assert.deepEqual(raPortBit('P015'),{port:0,bit:15});
 assert.equal(FPB_RA6E1.leds.LED1,'P408');assert.equal(FPB_RA6E1.arduino.D13,'P102');assert.equal(FPB_RA6E1.arduino.SDA,'P401');
});

test('validateRaMcu checks ports, locked pins, modes, unique symbols and IRQ channels, and the clock limits',()=>{
 const ok=validateRaMcu(raDefaultMcu());assert.deepEqual(Object.keys(ok.pins).sort(),['P205','P407','P408']);
 assert.equal(ok.pins.P205.callback,'external_irq1_callback');assert.equal(ok.pins.P205.pull,'PULLUP');
 const bad=pins=>()=>validateRaMcu({family:'R7FA6E10F',pins});
 assert.throws(bad({P999:{function:'GPIO_Output'}}),/없는 핀/);
 assert.throws(bad({P300:{function:'GPIO_Output'}}),/SWCLK/);
 assert.throws(bad({P407:{function:'IRQ'}}),/IRQ\) 핀이 아닙니다/);
 assert.throws(bad({P205:{function:'IRQ'},P104:{function:'IRQ'}}),/IRQ1는 이미 P205/);
 assert.throws(bad({P408:{function:'GPIO_Output',label:'LED'},P407:{function:'GPIO_Output',label:'LED'}}),/겹치지 않는 C 식별자/);
 assert.throws(bad({P408:{function:'GPIO_Output',label:'1LED'}}),/C 식별자/);
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),clock:{pllMul:30}}),/PLL 300 MHz/);
 assert.deepEqual(validateRaMcu({...raDefaultMcu(),clock:{pllMul:18}}).clock,{pllMul:18});
});

test('generated FSP files: pin table, bsp_pin_cfg symbols, IRQ1 instance, vector table and event link, linker script',()=>{
 const files=generateRaFiles(raDefaultMcu());
 for(const f of ['ra_gen/hal_data.c','ra_gen/hal_data.h','ra_gen/common_data.c','ra_gen/pin_data.c','ra_gen/vector_data.c','ra_gen/vector_data.h','ra_gen/bsp_clock_cfg.h','ra_gen/main.c','ra_gen/bsp_linker_info.h','ra_cfg/fsp_cfg/bsp/bsp_cfg.h','ra_cfg/fsp_cfg/bsp/bsp_mcu_family_cfg.h','ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h','ra_cfg/fsp_cfg/r_icu_cfg.h','script/fsp.ld','script/memory_regions.ld'])assert.ok(files[f],f);
 assert.match(files['ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h'],/#define LED1 \(BSP_IO_PORT_04_PIN_08\)/);
 assert.match(files['ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h'],/#define SW1 \(BSP_IO_PORT_02_PIN_05\)/);
 assert.match(files['ra_gen/pin_data.c'],/\.pin = BSP_IO_PORT_02_PIN_05,\s*\.pin_cfg = \(\(uint32_t\) \(uint32_t\) IOPORT_CFG_IRQ_ENABLE \| \(uint32_t\) IOPORT_CFG_PORT_DIRECTION_INPUT \| \(uint32_t\) IOPORT_CFG_PULLUP_ENABLE\)/);
 assert.match(files['ra_gen/hal_data.c'],/const external_irq_cfg_t g_external_irq1_cfg =[\s\S]*\.channel\s+= 1,[\s\S]*EXTERNAL_IRQ_TRIGGER_FALLING[\s\S]*\.p_callback\s+= external_irq1_callback/);
 assert.match(files['ra_gen/vector_data.h'],/#define VECTOR_NUMBER_ICU_IRQ1 \(\(IRQn_Type\) 0\)/);assert.match(files['ra_gen/vector_data.h'],/#define BSP_ICU_VECTOR_NUM_ENTRIES \(1\)/);
 assert.match(files['ra_gen/vector_data.c'],/\[0\] = r_icu_isr[\s\S]*\[0\] = BSP_PRV_VECT_ENUM\(EVENT_ICU_IRQ1,GROUP0\)/);
 assert.match(files['ra_gen/bsp_clock_cfg.h'],/BSP_CFG_PLL_MUL BSP_CLOCKS_PLL_MUL\(20,0\)/);
 assert.match(files['script/memory_regions.ld'],/FLASH_LENGTH = 0x00100000;[\s\S]*RAM_LENGTH|RAM_LENGTH = 0x00040000;/);
 assert.match(files['script/fsp.ld'],/__ram_main_stack\$\$[\s\S]*\*\(\.bss\.g_main_stack\)[\s\S]*__ram_zero\$\$/,'the stack is outside the zeroed range');
 assert.equal(pinCfgWord({function:'GPIO_Output',initial:1,drive:'HIGH'}),'((uint32_t) (uint32_t) IOPORT_CFG_PORT_DIRECTION_OUTPUT | (uint32_t) IOPORT_CFG_PORT_OUTPUT_HIGH | (uint32_t) IOPORT_CFG_DRIVE_HIGH)');
 assert.equal(raVectors({pins:{}}).length,0);
 assert.match(generateRaFiles({family:'R7FA6E10F',pins:{}})['ra_gen/vector_data.h'],/VECTOR_DATA_IRQ_COUNT\s+\(0\)/);
 assert.match(raHalEntry(),/void hal_entry\(void\)[\s\S]*R_IOPORT_Open \(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME\);/);
});

test('FPB-RA6E1 board: Arduino headers on the 55 x 95 mm outline, active-board pins, no second-board model',()=>{
 const pins=boardPins('fpb-ra6e1');assert.equal(pins.length,32);
 const by=label=>pins.find(p=>p.label===label);
 assert.equal(by('D13').signal,'P102');assert.equal(by('A0').signal,'P000');assert.equal(by('D0').signal,'P110');assert.equal(by('IOREF').signal,'3V3');
 assert.equal(by('D1').y-by('D0').y,-14,'2.54 mm pitch');assert.ok(Math.abs((by('D7').y-by('D8').y)-4.064*14/2.54)<1e-6,'160 mil gap between D7 and D8');
 assert.ok(Math.abs((by('D0').x-by('A5').x)-48.26*14/2.54)<1e-6,'48.26 mm between the rows');
 assert.ok(pins.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&PIN_BY_ID.has(p.id)));
 assert.ok(ALL_GPIO_PINS.includes('P408'));
 setActiveBoard('fpb-ra6e1');
 assert.equal(PINS.length,32);assert.ok(GPIO_PINS.includes('P102'));assert.ok(Math.abs(BOARD.w-55*14/2.54)<1e-9&&Math.abs(BOARD.h-95*14/2.54)<1e-9);
 setActiveBoard('nucleo-f446re');assert.ok(PINS.length>32);assert.deepEqual({w:BOARD.w,h:BOARD.h},boardSize('nucleo-f446re'));
 assert.equal(getBoard('fpb-ra6e1').vendor,'renesas');assert.equal(DEVBOARD_MODELS['fpb-ra6e1'],undefined);
});

test('an FPB-RA6E1 project is an FSP project; resets keep it one; the vendors do not mix',()=>{
 const p=projectForBoard('fpb-ra6e1');
 assert.equal(p.firmware.mode,'fsp');assert.equal(p.mcu.family,'R7FA6E10F');assert.match(p.code,/hal_entry/);
 assert.doesNotThrow(()=>validateProject(p));
 assert.throws(()=>validateProject({...p,firmware:{mode:'hal',files:[]}}),/FSP 프로젝트로/);
 assert.throws(()=>validateProject({...blankProject(),firmware:{mode:'fsp',files:[]}}),/Renesas RA 보드에서만/);
 assert.throws(()=>validateProject({...p,boardId:'nucleo-f446re'}),/핀 설정이 필요합니다/);
 assert.match(resetMainCode({...p,code:'int x;'}).code,/void hal_entry\(void\)/);
 const reset=resetBoardConfiguration({...p,mcu:{family:'R7FA6E10F',pins:{}}});assert.deepEqual(Object.keys(reset.mcu.pins).sort(),['P205','P407','P408']);assert.equal(reset.firmware.mode,'fsp');
 for(const ex of RA_EXAMPLES)assert.doesNotThrow(()=>validateProject({...p,mcu:ex.mcu(),code:ex.code}),ex.id);
});

test('SCI UART: peripheral pins, channel settings and the RASC baud setting, g_uartN in hal_data and the vector table',async()=>{
 const {RA_PERIPHERAL_PINS,raPsel}=await import('../../src/ra-config.js');
 const {sciBaudSetting,raPclka}=await import('../../src/ra-generator.js');
 assert.deepEqual(RA_PERIPHERAL_PINS.SCI9_TXD,['P109','P602']);assert.equal(raPsel('SCI9_TXD'),5);assert.equal(raPsel('SCI0_RXD'),4);
 const uart=()=>{const m=raDefaultMcu();m.pins.P109={function:'Peripheral',signal:'SCI9_TXD'};m.pins.P110={function:'Peripheral',signal:'SCI9_RXD'};m.peripherals={SCI9:{enabled:true,baud:115200}};return m;};
 const v=validateRaMcu(uart());assert.deepEqual(v.peripherals.SCI9,{enabled:true,baud:115200,callback:'user_uart9_callback',priority:12});
 assert.throws(()=>validateRaMcu({...uart(),pins:{...uart().pins,P602:{function:'Peripheral',signal:'SCI9_TXD'}}}),/이미 P109/);
 assert.throws(()=>validateRaMcu({...uart(),pins:{...uart().pins,P111:{function:'Peripheral',signal:'SCI9_RXD'}}}),/둘 수 없습니다/);
 assert.throws(()=>validateRaMcu({...uart(),peripherals:{SCI9:{enabled:false}}}),/SCI9를 켜야/);
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),peripherals:{SCI9:{enabled:true}}}),/TXD 또는 RXD/);
 assert.throws(()=>validateRaMcu({...uart(),peripherals:{SCI9:{enabled:true,baud:100}}}),/300~2000000/);
 assert.throws(()=>validateRaMcu({...uart(),peripherals:{SCI5:{enabled:false}}}),/지원하지 않는/);
 // PCLKA 100 MHz: 115200 → ABCS 1, BGDM 1, CKS 0, BRR 108 (0.45 %), as RASC writes it.
 assert.equal(raPclka(v),100e6);
 const b=sciBaudSetting(100e6,115200);assert.deepEqual([b.abcs,b.bgdm,b.cks,b.brr],[1,1,0,108]);assert.ok(b.error<0.5);
 assert.ok(sciBaudSetting(100e6,9600).error<0.2);assert.throws(()=>sciBaudSetting(100e6,1),/만들 수 없는/);
 const files=generateRaFiles(v,{board:'FPB-RA6E1'});
 const halC=files['ra_gen/hal_data.c'],halH=files['ra_gen/hal_data.h'];
 assert.match(halH,/extern const uart_instance_t g_uart9;/);assert.match(halH,/void user_uart9_callback\(uart_callback_args_t \* p_args\);/);
 assert.match(halC,/\.channel {13}= 9,/);assert.match(halC,/\.brr = 108/);assert.match(halC,/\.p_api {9}= &g_uart_on_sci/);
 assert.match(files['ra_gen/vector_data.h'],/VECTOR_NUMBER_SCI9_RXI \(\(IRQn_Type\) 0\)/);
 assert.match(files['ra_gen/vector_data.c'],/sci_uart_txi_isr/);assert.match(files['ra_gen/vector_data.c'],/\[2\] = BSP_PRV_VECT_ENUM\(EVENT_SCI9_TEI,GROUP2\)/);
 assert.match(files['ra_gen/pin_data.c'],/BSP_IO_PORT_01_PIN_09,[^}]*IOPORT_CFG_PERIPHERAL_PIN \| \(uint32_t\) IOPORT_PERIPHERAL_SCI1_3_5_7_9\)/);
 assert.match(files['ra_cfg/fsp_cfg/r_sci_uart_cfg.h'],/SCI_UART_CFG_FIFO_SUPPORT \(0\)/);
});

test('RA6E1 SCI model: baud from SMR/BRR/SEMR, TXI on the TDR → shift transfer, TEI after the last frame, RXI on a frame',async()=>{
 const {Sci}=await import('../../src/emu/ra6e1/sci.js');
 const events=[],timers=[];let now=0;
 const soc={clock:{pclka:100e6},signals:{receivers:new Set(),channel(){},line(){return {};},uartFrame:(l,t)=>t+86.8},nowUs:()=>now,sync(){},icu:{raise:e=>events.push(e)},routedPins:s=>s.endsWith('TXD')?['P109']:['P110'],lineSources:()=>[],atUs:(t,fn)=>{const e={t,fn};timers.push(e);return e;},uartEvent:e=>events.push(e)};
 const sci=new Sci(soc,9);
 sci.write(0x07,0x50,1); // SEMR: ABCS + BGDM
 sci.write(0x01,108,1);
 assert.ok(Math.abs(sci.baud()-114679)<1);
 sci.write(0x02,0xf0,1); // TIE RIE TE RE
 sci.write(0x03,0x41,1); // TDR 'A'
 assert.deepEqual(events,[0x1b6+1],'TXI as the byte moves to the shift register');
 assert.equal(sci.peek(0x04)&0x80,0x80,'TDRE again');
 sci.write(0x02,0xf4,1); // TEIE while the frame is on the line: no TEI yet
 assert.equal(events.length,1);
 now=90;timers.shift().fn();
 assert.deepEqual(events.slice(1),[{instance:'SCI9',direction:'TX',bytes:[0x41],micros:90},0x1b6+2]);
 sci.received({value:0x5a});assert.equal(events.at(-1),0x1b6+0);assert.equal(sci.read(0x05,1),0x5a);
 assert.equal(sci.peek(0x04)&0x40,0,'RDRF cleared by reading RDR');
});

test('GPT: GTIOC pins, mode/period/duty settings and RASC counts, g_timerN, r_gpt_cfg.h and the overflow vector',async()=>{
 const {RA_PERIPHERAL_PINS,raPsel,raGptCounts}=await import('../../src/ra-config.js');
 assert.deepEqual(RA_PERIPHERAL_PINS.GPT6_GTIOCB,['P401','P408','P600']);assert.equal(raPsel('GPT6_GTIOCB'),3);
 assert.deepEqual(raGptCounts(100e6,6,1,'kHz',25),{div:1,counts:50000,duty:12500,hz:1000});
 assert.equal(raGptCounts(100e6,1,500,'ms').div,0,'32-bit GPT1');
 assert.throws(()=>raGptCounts(100e6,6,0.01,'Hz'),/너무 깁니다/);assert.throws(()=>raGptCounts(100e6,6,100,'MHz'),/너무 짧습니다/);
 const pwm=()=>{const m=raDefaultMcu();m.pins.P408={function:'Peripheral',signal:'GPT6_GTIOCB',label:'LED1'};m.peripherals={GPT6:{enabled:true,period:1,unit:'kHz',duty:25},GPT1:{enabled:true,mode:'PERIODIC',period:500,unit:'ms',callback:'gpt1_callback'}};return m;};
 const v=validateRaMcu(pwm());
 assert.deepEqual(v.peripherals.GPT6,{enabled:true,mode:'PWM',period:1,unit:'kHz',duty:25,callback:'',priority:12});
 assert.throws(()=>validateRaMcu({...pwm(),pins:raDefaultMcu().pins}),/PWM 출력 핀/);
 assert.throws(()=>validateRaMcu({...pwm(),peripherals:{GPT6:{enabled:true,duty:120}}}),/0~100/);
 assert.throws(()=>validateRaMcu({...pwm(),peripherals:{GPT3:{enabled:false}}}),/지원하지 않는/);
 assert.throws(()=>validateRaMcu({...pwm(),peripherals:{GPT6:{enabled:true,mode:'CAPTURE'}}}),/PWM 또는 Periodic/);
 const files=generateRaFiles(v,{board:'FPB-RA6E1'}),c=files['ra_gen/hal_data.c'],h=files['ra_gen/hal_data.h'];
 assert.ok(h.includes('#include "r_gpt.h"')&&h.includes('extern const timer_instance_t g_timer6;')&&h.includes('void gpt1_callback(timer_callback_args_t * p_args);'));
 assert.ok(c.includes('.mode                = TIMER_MODE_PWM,')&&c.includes('.period_counts = (uint32_t) 0xc350, .duty_cycle_counts = 0x30d4, .source_div = (timer_source_div_t) 1,'));
 assert.ok(c.includes('.gtiocb = { .output_enabled = true, .stop_level = GPT_PIN_LEVEL_LOW },')&&c.includes('.gtioca = { .output_enabled = false,'));
 assert.ok(c.includes('.mode                = TIMER_MODE_PERIODIC,')&&c.includes('.p_callback          = gpt1_callback,')&&c.includes('.p_api         = &g_timer_on_gpt'));
 assert.ok(files['ra_gen/vector_data.c'].includes('= gpt_counter_overflow_isr, /* GPT1 COUNTER OVERFLOW'),'only the timer with a callback gets the vector');
 assert.ok(!files['ra_gen/vector_data.c'].includes('GPT6'));
 assert.ok(files['ra_cfg/fsp_cfg/r_gpt_cfg.h'].includes('#define GPT_CFG_OUTPUT_SUPPORT_ENABLE (1)'));
 assert.ok(files['ra_gen/pin_data.c'].includes('IOPORT_CFG_PERIPHERAL_PIN | (uint32_t) IOPORT_PERIPHERAL_GPT1)'));
});

test('RA6E1 GPT model: GTSTR start, GTCNT, buffer transfer at the cycle end, PWM output levels, overflow event',async()=>{
 const {Gpt}=await import('../../src/emu/ra6e1/gpt.js');
 let now=0;const timers=[],events=[],changes=[];
 const soc={clock:{pclkd:100e6},nowUs:()=>now,sync(){},icu:{linked:e=>e===0xfc,raise:e=>events.push(e)},atUs:(t,fn)=>{const e={t,fn,cancel(){e.dead=true;}};timers.push(e);return e;},peripheralChanged:n=>changes.push(n)};
 const t=new Gpt(soc,6);const gpts={6:t};
 soc.gptRunning=()=>t.running?64:0;soc.gptControl=(m,op)=>{for(const [ch,g]of Object.entries(gpts))if(m&(1<<ch))g[op==='clear'?'setCount':op](0);};
 t.write(0x2c,1<<23,4);t.write(0x64,49999,4);t.write(0x68,49999,4); // TPCS /2, GTPR
 t.write(0x54,12499,4);t.write(0x58,12499,4); // GTCCRC, GTCCRE (buffers)
 t.write(0x40,0x550000,4); // GTBER: buffers on, force transfer
 t.write(0x34,(0x9|1<<8)<<16,4); // GTIOB: high at cycle end, low at compare match, OBE
 assert.equal(t.output('GTIOCB').level,0,'stopped: OBDFLT');assert.equal(t.output('GTIOCA'),null,'GTIOCA output off');
 t.write(0x04,64,4);assert.equal(t.read(0x04,4),64);assert.ok(t.running);
 assert.deepEqual(t.output('GTIOCB').pwm,{duty:0.25,frequency:1000});
 now=500;assert.equal(t.read(0x48,4),25000,'GTCNT at 50 MHz');
 t.write(0x58,37499,4); // new duty waits in GTCCRE
 assert.equal(t.output('GTIOCB').pwm.duty,0.25);
 const next=timers.filter(e=>!e.dead).at(-1);assert.ok(Math.abs(next.t-1000)<1e-6);now=1000;next.fn();
 assert.equal(t.output('GTIOCB').pwm.duty,0.75,'GTCCRE → GTCCRB at the cycle end');assert.deepEqual(events,[0xfc]);
 t.write(0x30,(3<<24)|1,4);assert.deepEqual(t.output('GTIOCB'),{level:1},'OBDTY 100 %');
 t.write(0x08,64,4);assert.ok(!t.running);assert.ok(changes.length>0);
});

test('ADC0: Analog pins with an AN channel, mode/resolution settings, g_adc0 with its channel mask, r_adc_cfg.h',async()=>{
 const {RA_ADC_CHANNELS}=await import('../../src/ra-config.js');
 assert.equal(RA_ADC_CHANNELS.P000,0);assert.equal(RA_ADC_CHANNELS.P008,8);assert.equal(RA_ADC_CHANNELS.P015,13);assert.equal(RA_ADC_CHANNELS.P105,undefined);
 const adc=()=>{const m=raDefaultMcu();m.pins.P000={function:'Analog'};m.pins.P008={function:'Analog'};m.peripherals={ADC0:{enabled:true,mode:'CONTINUOUS',resolution:10,callback:'adc_cb'}};return m;};
 const v=validateRaMcu(adc());assert.deepEqual(v.peripherals.ADC0,{enabled:true,mode:'CONTINUOUS',resolution:10,callback:'adc_cb',priority:12});
 assert.throws(()=>validateRaMcu({...adc(),pins:raDefaultMcu().pins}),/Analog로 정하세요/);
 assert.throws(()=>validateRaMcu({...adc(),peripherals:{ADC0:{enabled:true,resolution:14}}}),/12·10·8/);
 const files=generateRaFiles(v,{board:'FPB-RA6E1'}),c=files['ra_gen/hal_data.c'];
 assert.ok(c.includes('.scan_mask           = ADC_MASK_CHANNEL_0 | ADC_MASK_CHANNEL_8 | 0,'));
 assert.ok(c.includes('.mode                = ADC_MODE_CONTINUOUS_SCAN,')&&c.includes('.resolution          = ADC_RESOLUTION_10_BIT,')&&c.includes('.p_callback          = adc_cb,'));
 assert.ok(files['ra_gen/hal_data.h'].includes('extern const adc_channel_cfg_t g_adc0_channel_cfg;')&&files['ra_gen/hal_data.h'].includes('void adc_cb(adc_callback_args_t * p_args);'));
 assert.ok(files['ra_gen/vector_data.c'].includes('= adc_scan_end_isr, /* ADC0 SCAN END'));
 assert.ok(files['ra_cfg/fsp_cfg/r_adc_cfg.h'].includes('ADC_CFG_PARAM_CHECKING_ENABLE'));
 assert.ok(files['ra_gen/pin_data.c'].includes('IOPORT_CFG_ANALOG_ENABLE'));
});

test('RA6E1 ADC12 model: single scan stores ADDRn and raises scan end, continuous reads live, resolution and alignment',async()=>{
 const {Adc12,ADC0_SCAN_END}=await import('../../src/emu/ra6e1/adc.js');
 let now=0,volts=1.65;const timers=[],events=[];
 const soc={nowUs:()=>now,sync(){},analogIn:pin=>pin==='P000'?volts:0,icu:{linked:()=>false,raise:e=>events.push(e)},atUs:(t,fn)=>{const e={t,fn,cancel(){e.dead=true;}};timers.push(e);return e;}};
 const a=new Adc12(soc);
 a.write(0x04,0x101,2); // ADANSA0: AN000, AN008
 a.write(0x00,0x8000,2); // ADST, single scan
 assert.equal(a.read(0x00,2)&0x8000,0x8000,'converting');
 now=timers.at(-1).t;timers.at(-1).fn();
 assert.equal(a.read(0x00,2)&0x8000,0,'ADST clears at the scan end');assert.deepEqual(events,[ADC0_SCAN_END]);
 assert.equal(a.read(0x20,2),2048);assert.equal(a.read(0x30,2),0,'AN008 at 0 V');
 a.write(0x0e,1<<1,2); // ADPRC 10-bit
 volts=3.3;a.write(0x00,0x8000,2);now=timers.at(-1).t;timers.at(-1).fn();assert.equal(a.read(0x20,2),1023);
 a.write(0x0e,(1<<15)|(1<<1),2); // left-aligned
 a.write(0x00,0x8000,2);now=timers.at(-1).t;timers.at(-1).fn();assert.equal(a.read(0x20,2),1023<<6);
 a.write(0x0e,0,2);a.write(0x00,0x8000|(2<<13),2); // continuous, nothing linked: live reads
 volts=0.825;assert.equal(a.read(0x20,2),1024);assert.equal(a.read(0x00,2)&0x8000,0x8000);
});

test('AGT: periodic g_agtN (PCLKB /1·/2·/8 or LOCO /1-/128), AGTn_INT vector, r_agt_cfg.h; clock limits and ratios',async()=>{
 const {raAgtCounts}=await import('../../src/ra-config.js');
 assert.deepEqual(raAgtCounts(50e6,0,1,'ms'),{source:'PCLKB',div:0,counts:50000,hz:1000});
 assert.deepEqual(raAgtCounts(50e6,0,5,'ms'),{source:'PCLKB',div:3,counts:31250,hz:200});
 assert.equal(raAgtCounts(50e6,0,250,'ms').source,'LOCO');assert.throws(()=>raAgtCounts(50e6,0,300,'s'),/256초/);
 const m={...raDefaultMcu(),peripherals:{AGT0:{enabled:true,period:250,unit:'ms',callback:'agt0_callback'},AGT1:{enabled:true,period:1,unit:'ms',callback:''}}};
 const v=validateRaMcu(m);assert.deepEqual(v.peripherals.AGT0,{enabled:true,period:250,unit:'ms',callback:'agt0_callback',priority:12});
 assert.throws(()=>validateRaMcu({...m,peripherals:{AGT6:{enabled:true}}}),/지원하지 않는/);
 const files=generateRaFiles(v,{board:'FPB-RA6E1'}),c=files['ra_gen/hal_data.c'];
 assert.ok(c.includes('.count_source            = AGT_CLOCK_LOCO,')&&c.includes('.period_counts = (uint32_t) 0x2000,')&&c.includes('.p_api         = &g_timer_on_agt'));
 assert.ok(c.includes('.count_source            = AGT_CLOCK_PCLKB,')&&c.includes('.cycle_end_ipl       = (BSP_IRQ_DISABLED),'),'AGT1 without a callback');
 assert.ok(files['ra_gen/vector_data.c'].includes('= agt_int_isr, /* AGT0 INT')&&!files['ra_gen/vector_data.c'].includes('AGT1'));
 assert.ok(files['ra_gen/hal_data.h'].includes('#include "r_agt.h"')&&files['ra_gen/hal_data.h'].includes('#include "r_timer_api.h"'));
 assert.ok(files['ra_cfg/fsp_cfg/r_agt_cfg.h'].includes('AGT_CFG_OUTPUT_SUPPORT_ENABLE (0)'));
 // Clocks: frequency limits and divider ratios (User's Manual 8.1).
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),clock:{pclkbDiv:2}}),/PCLKB 100 MHz: 최대 50 MHz/);
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),clock:{pclkdDiv:4}}),/PCLKD ≥ PCLKA/);
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),clock:{fclkDiv:64}}),/4 MHz 이상/);
 assert.deepEqual(validateRaMcu({...raDefaultMcu(),clock:{pllMul:15}}).clock,{pllMul:15},'PLL 150 MHz: ICLK 150, PCLKA 75, PCLKB 37.5, FCLK 37.5');assert.throws(()=>validateRaMcu({...raDefaultMcu(),clock:{pllMul:15,pclkdDiv:1}}),/PCLKD 150 MHz/);
});

test('RA6E1 AGT model: TCSTF follows TSTART, the counter counts down from the reload, underflows raise AGTn_INT',async()=>{
 const {Agt,AGT_EVENT}=await import('../../src/emu/ra6e1/agt.js');
 let now=0;const timers=[],events=[];
 const soc={clock:{pclkb:50e6},nowUs:()=>now,sync(){},icu:{linked:e=>e===AGT_EVENT(2),raise:e=>events.push(e)},atUs:(t,fn)=>{const e={t,fn,cancel(){e.dead=true;}};timers.push(e);return e;}};
 const a=new Agt(soc,2);
 a.write(0x08,0,1);assert.equal(a.read(0x08,1)&2,0);
 a.write(0x09,0x40,1);a.write(0x0a,0,1); // TCK = 100: LOCO, no division
 a.write(0x00,8191,2);a.write(0x08,0xf1,1);
 assert.equal(a.read(0x08,1)&3,3,'TSTART and TCSTF');
 now=125000;assert.equal(a.read(0x00,2),4095,'half way at 32.768 kHz');
 const e=timers.filter(t=>!t.dead).at(-1);assert.ok(Math.abs(e.t-250000)<1);now=e.t;e.fn();
 assert.deepEqual(events,[0x46]);assert.equal(a.read(0x08,1)&0x20,0x20,'TUNDF');
 a.write(0x08,0xd1,1);assert.equal(a.read(0x08,1)&0x20,0,'flag cleared by writing 0');
 a.write(0x08,0xf0,1);assert.equal(a.read(0x08,1)&3,0,'stopped');
});
