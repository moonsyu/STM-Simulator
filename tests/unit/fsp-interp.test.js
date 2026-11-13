// Feature 42: FPB-RA6E1 (Renesas FSP) projects on the built-in interpreter, without ARM GCC or FSP. Every FSP example
// runs, and shows what the RA6E1 emulator shows for its ELF (tests/firmware/firmware-ra6e1.test.js, toolchain
// ra-course, ra-spi): LED1/LED2 timelines, S1 through IRQ1, SCI9 UART, GPT PWM, ADC12, AGT, the IIC master and the SPI
// masters (r_spi, r_sci_spi).
import test from 'node:test';
import assert from 'node:assert/strict';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {RA_EXAMPLES,raExample} from '../../src/ra-examples.js';
import {raHalEntry,generateRaFiles} from '../../src/ra-generator.js';
import {raDefaultMcu,validateRaMcu} from '../../src/ra-config.js';
import {compileFsp,fspPrelude,FSP_ALIASES} from '../../src/fsp-interp.js';
import {inspectRuntime} from '../../src/debug-tools.js';

const base=()=>projectForBoard('fpb-ra6e1');
const example=id=>{const e=raExample(id),p={...base(),mcu:e.mcu(),code:e.code};if(e.circuit){const c=e.circuit();p.components=c.components;p.wires=c.wires;delete p.surfaces;}return p;};
function open(project,options={}){
 const log={uart:[],print:[],trace:[],warn:[]};
 const session=new SimulationSession(validateProject(project),{uart:e=>log.uart.push(e),print:t=>log.print.push(t),trace:e=>log.trace.push(e),warn:m=>log.warn.push(m),...options});
 return {session,log};
}
// Ticks of `step` ms as the app drives the session (20 ms), until `ms`.
const run=(s,ms,each,step=20)=>{for(let t=Math.floor(s.time/step)*step+step;t<=ms+1e-9;t+=step){s.tick(t);each?.(t);}};
const high=(s,pin)=>s.runtime.gpio[pin]?.value>1.65?1:0;
// LED1 edges [ms, level] over 1 ms ticks.
function edges(s,pin,ms){const out=[];let last=null;run(s,ms,t=>{const v=high(s,pin);if(v!==last){out.push([t,v]);last=v;}},1);return out;}

test('every FSP example compiles and runs 2 s on the interpreter without an error or a warning',()=>{
 for(const e of RA_EXAMPLES){
  const {session,log}=open(example(e.id));
  run(session,2000,t=>{if(t%400===100)session.setPressed({SW1:true});if(t%400===300)session.setPressed({});});
  assert.ok(!session.runtime.finished,e.id+' keeps running');assert.deepEqual(log.warn,[],e.id);
  assert.equal(session.runtime.gpio.P408?.mode,'OUTPUT',e.id+': R_IOPORT_Open applied the pins in R_BSP_WarmStart');
 }
});

test('ra_blink: LED1 (P408) toggles every 500 ms of R_BSP_SoftwareDelay from the start, LED2 stays off',()=>{
 const {session}=open(example('ra_blink'));
 assert.deepEqual(edges(session,'P408',2100),[[1,1],[500,0],[1000,1],[1500,0],[2000,1]]);
 assert.equal(high(session,'P407'),0);assert.equal(session.runtime.gpio.P407.mode,'OUTPUT');
 assert.ok(session.result.voltage('signal:P408')>1.8,'the board LED net follows the pin');
});

test('ra_button_irq: S1 (P205, IRQ1 falling) runs external_irq1_callback, which counts and toggles LED2',()=>{
 const {session}=open(example('ra_button_irq'));
 run(session,100);assert.equal(high(session,'P407'),0);assert.equal(session.readVariable('presses'),0);
 session.setPressed({SW1:true});run(session,140);session.setPressed({});run(session,200);
 assert.equal(session.readVariable('presses'),1);assert.equal(high(session,'P407'),1,'LED2 on');
 session.setPressed({SW1:true});run(session,240);session.setPressed({});run(session,300);
 assert.equal(session.readVariable('presses'),2);assert.equal(high(session,'P407'),0,'LED2 off again');
 assert.equal(session.runtime.gpio.P205.mode,'INPUT_PULLUP','an IRQ input with the internal pull-up');
 // LED1 keeps blinking every 200 ms meanwhile.
 assert.deepEqual(edges(session,'P408',700).map(e=>e[0]),[301,400,600]);
});

test('ra_button_poll and ra_button_irq_rising: polling toggles LED1 per press; the rising edge toggles LED2 on release',()=>{
 const press=(id,pin,at)=>{const {session}=open(example(id)),out=[];run(session,1000,t=>{if(t===100||t===600)session.setPressed({SW1:true});if(t===300||t===800)session.setPressed({});if(at.includes(t))out.push(high(session,pin));},10);return out;};
 // The same instants the emulator test reads (toolchain ra-course).
 assert.deepEqual(press('ra_button_poll','P408',[90,290,590,990]),[0,1,1,0]);
 assert.deepEqual(press('ra_button_irq_rising','P407',[290,310,790,810]),[0,1,1,0]);
});

test('ra_uart_echo: SCI9 (P109 TXD / P110 RXD) says hello to the UART part, then echoes what it sends and toggles LED2',()=>{
 const {session,log}=open(example('ra_uart_echo'));
 run(session,60);
 const tx=log.uart.filter(e=>e.instance==='SCI9'&&e.direction==='TX');
 assert.equal(String.fromCharCode(...tx.flatMap(e=>e.bytes)),'FPB-RA6E1 SCI9 ready\r\n');
 assert.ok(Math.abs(tx[1].micros-tx[0].micros-1e7/115200)<1e-6,'one 10-bit frame a byte');
 assert.equal(session.buses.received.get('term'),'FPB-RA6E1 SCI9 ready\r\n','the part receives the TXD line');
 assert.equal(session.runtime.gpio.P109.mode,'OUTPUT');assert.equal(session.runtime.gpio.P110.mode,'INPUT');
 assert.equal(session.inject('Hi','SCI9'),2,'the serial monitor target of an FSP project');
 run(session,120);
 assert.equal(session.readVariable('received'),2,'UART_EVENT_RX_CHAR for each byte');
 assert.deepEqual(log.uart.filter(e=>e.direction==='RX').map(e=>e.bytes[0]),[72,105]);
 assert.ok(session.buses.received.get('term').endsWith('Hi'),'echoed back');
 assert.equal(high(session,'P407'),0,'LED2 toggled twice');
 assert.equal(session.inject('x','Serial1'),0,'no USART2 on this board');
});

test('ra_gpt_pwm: GPT6 PWM (1 kHz on GTIOC6B = LED1) in 10 % steps, 100 % high; GPT1 (500 ms) toggles LED2 from its callback',()=>{
 const {session}=open(example('ra_gpt_pwm'));
 const steps=[];let last=-1;
 run(session,1250,t=>{const k=Math.floor((t-50)/100);if(k!==last&&t>=50){last=k;steps.push([session.readVariable('duty_percent'),session.runtime.gpio.P408?.pwm?.duty??high(session,'P408')]);}});
 assert.ok(steps.length>=11);
 for(const [duty,out]of steps)if(duty>0&&duty<100)assert.ok(Math.abs(out-duty/100)<1e-9,JSON.stringify(steps));
 assert.ok(steps.some(([d,o])=>d===100&&o===1),'100 %: the output stays high');
 assert.ok(steps.some(([d,o])=>d===0&&o===0),'0 %: the output stays low');
 assert.equal(session.readVariable('ticks'),2,'cycle ends at 500 and 1000 ms');assert.equal(high(session,'P407'),0);
 // R_GPT_InfoGet: 50 000 counts at PCLKD/2 for 1 kHz (RASC's divider).
 run(session,1360);assert.equal(session.runtime.gpio.P408.pwm.frequency,1000);
});

test('ra_adc_pot: R_ADC single scan reads A0 (P000 = AN000) from the potentiometer; LED1 follows half scale',()=>{
 const {session}=open(example('ra_adc_pot'));
 run(session,100);
 const near=(v,pin)=>Math.abs(v-Math.round(session.result.voltage('signal:'+pin)/3.3*4095))<=2;
 let v=session.readVariable('adc_value');assert.ok(near(v,'P000')&&Math.abs(v-2048)<60,'50 %: '+v);
 assert.equal(session.runtime.gpio.P000.mode,'ANALOG');
 session.project.components.find(p=>p.id==='pot').position=80;run(session,200);
 v=session.readVariable('adc_value');assert.ok(near(v,'P000')&&v>3000,'80 %: '+v);assert.equal(high(session,'P408'),1);
 assert.equal(session.readVariable('millivolts'),Math.floor(v*3300/4095));
 session.project.components.find(p=>p.id==='pot').position=10;run(session,300);
 v=session.readVariable('adc_value');assert.ok(near(v,'P000')&&v<600,'10 %: '+v);assert.equal(high(session,'P408'),0);
 // 10-bit resolution scales to 1023.
 const p=example('ra_adc_pot');p.mcu.peripherals.ADC0.resolution=10;const ten=open(p).session;run(ten,100);
 assert.ok(Math.abs(ten.readVariable('adc_value')-512)<16,String(ten.readVariable('adc_value')));
});

test('ra_agt_tick: AGT0 (LOCO, 250 ms) toggles LED1 from agt0_callback; AGT1 (PCLKB, 1 ms) ticks; LED2 after 1000 ticks',()=>{
 const {session}=open(example('ra_agt_tick'));
 const e=edges(session,'P408',2100).map(x=>x[0]);
 assert.deepEqual(e,[1,250,500,750,1000,1250,1500,1750,2000],'LED1 every 250 ms');
 assert.equal(session.readVariable('blinks'),8,'every 250 ms for 2.1 s');
 const ms=session.readVariable('ms');assert.ok(Math.abs(ms-2100)<=25,'1 ms tick: '+ms);
 assert.equal(high(session,'P407'),1,'LED2 after 2000 ticks');
});

test('ra_iic_memory: IIC0 writes the I²C memory at 0x50, reads it back after a repeated-start write; 0x51 NACKs and aborts',()=>{
 const {session,log}=open(example('ra_iic_memory'));
 run(session,100);
 assert.equal(session.readVariable('matched'),1,'RX_COMPLETE with the bytes written');
 assert.equal(session.readVariable('nack_seen'),1,'ABORTED after the NACK');
 assert.equal(high(session,'P407'),1,'LED2 on');
 assert.equal(session.runtime.gpio.P400.openDrain,true);
 assert.ok(log.trace.some(t=>/0x50 WRITE 5 B · ACK/.test(t.message)),JSON.stringify(log.trace.map(t=>t.message)));
 assert.ok(log.trace.some(t=>/0x51 READ 0 B · NACK/.test(t.message)));
});

test('the challenge: four LEDs count 0000 → 1111 every 0.1 s (recursion); switch 2 pauses and resumes, switch 1 starts over',()=>{
 const {session:s}=open(example('ra_led4_switch2')),pins=['P107','P303','P113','P103'],value=()=>pins.map(p=>high(s,p)).join('');
 const seq=[];let last='';
 const until=(to,press)=>{run(s,to,()=>{const v=value();if(v!==last){seq.push(v);last=v;}},10);if(press!==undefined)s.setPressed(press);};
 until(450);assert.deepEqual(seq.splice(0),['0000','0001','0010','0011','0100']);
 until(460,{sw2:true});until(520,{});const held=value();until(900);assert.equal(value(),held,'paused');assert.deepEqual(seq.splice(0),[]);
 until(910,{sw2:true});until(960,{});until(1300);const resumed=seq.splice(0);
 assert.equal(resumed[0],(parseInt(held,2)+1).toString(2).padStart(4,'0'));assert.ok(resumed.length>=3);
 until(1310,{sw1:true});until(1360,{});until(1700);assert.deepEqual(seq.slice(0,3),['0000','0001','0010']);
});

test('every instance and macro name the generator writes into hal_data.h, common_data.h, bsp_pin_cfg.h and vector_data.h is in the prelude',()=>{
 const mcus=[...RA_EXAMPLES.map(e=>e.mcu()),raDefaultMcu(),spiLoopMcu()];
 for(const mcu of mcus){
  const files=generateRaFiles(mcu,{board:{fspBoard:true}}),prelude=fspPrelude(validateRaMcu(mcu)),names=new Set();
  for(const file of ['ra_gen/hal_data.h','ra_gen/common_data.h','ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h','ra_gen/vector_data.h']){
   const text=files[file];
   for(const m of text.matchAll(/^extern\s+(?:const\s+)?\w+\s+(\w+)\s*;/gm))names.add(m[1]);
   for(const m of text.matchAll(/^#define\s+(\w+)/gm))if(!/_H_?$/.test(m[1]))names.add(m[1]);
   if(file!=='ra_gen/vector_data.h')for(const m of text.matchAll(/^void\s+(\w+)\s*\(/gm))names.add(m[1]);
  }
  assert.ok(names.size>8);
  const missing=[...names].filter(n=>!Object.hasOwn(FSP_ALIASES,n)&&!new RegExp(`\\b${n}\\b`).test(prelude));
  assert.deepEqual(missing,[],JSON.stringify(Object.keys(mcu.peripherals||{})));
 }
});

test('the new-project templates run: Blinky blinks both LEDs, the empty template idles; R_BSP_WarmStart sees RESET, POST_CLOCK and POST_C before hal_entry',()=>{
 const {session}=open({...base(),code:raHalEntry({blink:true})}),seen=new Set();
 run(session,1200,()=>seen.add(`${high(session,'P408')}${high(session,'P407')}`),10);assert.deepEqual([...seen].sort(),['00','11']);
 const idle=open({...base(),code:raHalEntry()}).session;run(idle,200);assert.ok(idle.runtime.finished,'hal_entry returns (main returns)');
 const code=raHalEntry().replace('void R_BSP_WarmStart(bsp_warm_start_event_t event)\n{','uint32_t events[3];\nuint32_t calls = 0;\nuint32_t entered_at = 99;\nvoid R_BSP_WarmStart(bsp_warm_start_event_t event)\n{\n    events[calls++] = event;')
  .replace('    /* TODO: add your own code here */','    entered_at = calls;');
 const s=open({...base(),code}).session;run(s,20);
 assert.deepEqual([0,1,2].map(i=>s.readVariable(`events[${i}]`)),[0,1,2]);assert.equal(s.readVariable('entered_at'),3);
});

test('the course\'s hal_entry.c (R_IOPORT_Open with g_ioport.p_cfg, the LED named BBQ_LED, no #if blocks) runs as typed',()=>{
 const code=['#include "hal_data.h"','','FSP_CPP_HEADER','void R_BSP_WarmStart(bsp_warm_start_event_t event);','FSP_CPP_FOOTER','','void hal_entry(void)','{','    while (1)','    {',
  '        R_IOPORT_PinWrite(&g_ioport_ctrl, BBQ_LED, BSP_IO_LEVEL_HIGH);','        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','        R_IOPORT_PinWrite(&g_ioport_ctrl, BBQ_LED, BSP_IO_LEVEL_LOW);','        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','    }','}','',
  'void R_BSP_WarmStart(bsp_warm_start_event_t event)','{','    if (BSP_WARM_START_POST_C == event)','    {','        R_IOPORT_Open (&g_ioport_ctrl, g_ioport.p_cfg);','    }','}',''].join('\n');
 const mcu=raDefaultMcu();mcu.pins.P408.label='BBQ_LED';
 const {session}=open({...base(),mcu,code});assert.deepEqual(edges(session,'P408',1100).map(e=>e[1]),[1,0,1]);
});

test('errors: an unknown FSP API names the function, a register access says ARM GCC, main() and a missing hal_entry are explained',()=>{
 const withBody=body=>({...base(),code:raHalEntry().replace('    /* TODO: add your own code here */',body)});
 assert.throws(()=>run(open(withBody('    R_SCI_UART_BaudSet(&g_ioport_ctrl, 9600, 0);')).session,40),/지원하지 않는 FSP API: R_SCI_UART_BaudSet.*ARM GCC/);
 assert.throws(()=>run(open(withBody('    R_PORT4->PODR = 0x0100;')).session,40),/레지스터 직접 접근은 ARM GCC 실행에서만 됩니다\(R_PORT4->PODR\)/);
 assert.throws(()=>run(open(withBody('    uint32_t v = R_PFS->PORT[4].PIN[8].PmnPFS;\n    (void) v;')).session,40),/레지스터 직접 접근은 ARM GCC 실행에서만 됩니다/);
 // The template's flash register access sits in #if BSP_FEATURE_FLASH_LP_VERSION != 0 and is not compiled (RA6E1).
 assert.doesNotThrow(()=>run(open(withBody('')).session,40));
 assert.throws(()=>compileFsp(raHalEntry()+'\nint main(void)\n{\n    return 0;\n}\n',[],raDefaultMcu()),/main\.c:\d+: FSP 프로젝트의 main\(\)은 ra_gen\/main\.c가 만듭니다/);
 assert.throws(()=>compileFsp('#include "hal_data.h"\nvoid start(void)\n{\n}\n',[],raDefaultMcu()),/void hal_entry\(void\) 함수를 작성하세요/);
 // A wrong instance pointer and a pin the package does not have.
 assert.throws(()=>run(open(withBody('    R_IOPORT_PinWrite(&g_external_irq1_cfg, LED1, BSP_IO_LEVEL_HIGH);')).session,40),/R_IOPORT_PinWrite: 첫 인수로 인스턴스의 제어 구조체 주소\(&g_ioport_ctrl 등\)/);
 assert.throws(()=>run(open(withBody('    R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_09_PIN_15, BSP_IO_LEVEL_HIGH);')).session,40),/R7FA6E10F2CFP에 없는 핀입니다 \(0x090F\)/);
});

test('a callback named in Stacks but missing from the code: the interrupt is ignored with a warning, nothing stops',()=>{
 const p=example('ra_button_irq');p.code=p.code.replace('void external_irq1_callback(external_irq_callback_args_t *p_args)','void renamed_callback(external_irq_callback_args_t *p_args)');
 const {session,log}=open(p);
 run(session,100);session.setPressed({SW1:true});run(session,140);session.setPressed({});run(session,600);
 assert.equal(session.readVariable('presses'),0);assert.ok(log.warn.some(w=>/콜백 external_irq1_callback\(\)이 hal_entry\.c에 없어/.test(w)),JSON.stringify(log.warn));
 assert.ok(!session.runtime.finished);assert.deepEqual(edges(session,'P408',1000).length>0,true,'LED1 keeps blinking');
});

test('pins: a write before R_IOPORT_Open returns FSP_ERR_NOT_OPEN with a hint; a pin that is not an output does not change',()=>{
 const code=raHalEntry().replace('        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);','').replace('    /* TODO: add your own code here */','    err = R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);').replace('void hal_entry(void)','fsp_err_t err = FSP_SUCCESS;\nvoid hal_entry(void)');
 const {session,log}=open({...base(),code});run(session,40);
 assert.equal(session.readVariable('err'),7,'FSP_ERR_NOT_OPEN');assert.ok(log.warn.some(w=>/R_IOPORT_Open\(&g_ioport_ctrl, &g_bsp_pin_cfg\)을 먼저 호출하세요/.test(w)));
 const input=raHalEntry().replace('    /* TODO: add your own code here */','    R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_01_PIN_07, BSP_IO_LEVEL_HIGH);');
 const s=open({...base(),code:input});run(s.session,40);assert.ok(s.log.warn.some(w=>/P107이 출력이 아니라 핀에 나타나지 않습니다/.test(w)));
});

test('more of the API: R_SCI_UART_Read fills a buffer (RX_COMPLETE), GPT stop/status/period, R_IOPORT_PinCfg and PortRead, PWM as a waveform',()=>{
 const p=example('ra_uart_echo');
 p.code=raHalEntry().replace('#include "hal_data.h"','#include "hal_data.h"\nuint8_t line[3];\nvolatile uint32_t events = 0;\nvolatile uint32_t chars = 0;\nuint32_t port4 = 0;\nuint32_t err = 99;\nvoid user_uart9_callback(uart_callback_args_t *p_args)\n{\n    if (UART_EVENT_RX_COMPLETE == p_args->event) events++;\n    if (UART_EVENT_RX_CHAR == p_args->event) chars++;\n}')
  .replace('    /* TODO: add your own code here */',['    R_SCI_UART_Open(&g_uart9_ctrl, &g_uart9_cfg);','    R_SCI_UART_Read(&g_uart9_ctrl, line, 3);','    err = R_SCI_UART_Read(&g_uart9_ctrl, line, 3);',
   '    R_IOPORT_PinCfg(&g_ioport_ctrl, BSP_IO_PORT_01_PIN_07, (uint32_t) IOPORT_CFG_PORT_DIRECTION_OUTPUT | (uint32_t) IOPORT_CFG_PORT_OUTPUT_HIGH);','    R_IOPORT_PortRead(&g_ioport_ctrl, BSP_IO_PORT_04, &port4);','    while (1)','    {','    }'].join('\n'));
 const {session,log}=open(p);run(session,20);
 assert.equal(session.readVariable('err'),8,'a second Read while one is pending: FSP_ERR_IN_USE');
 assert.equal(session.runtime.gpio.P107.mode,'OUTPUT');assert.equal(high(session,'P107'),1,'R_IOPORT_PinCfg made P107 a high output');
 assert.equal(session.readVariable('port4')&0x0180,0,'LED1/LED2 (P408/P407) read low');
 session.inject('abcd','SCI9');run(session,40);
 assert.deepEqual([0,1,2].map(i=>session.readVariable(`line[${i}]`)),[97,98,99]);assert.equal(session.readVariable('events'),1);assert.equal(session.readVariable('chars'),1,'the byte after the read: RX_CHAR');
 assert.deepEqual(log.warn,[]);
 // GPT: InfoGet / StatusGet while counting and stopped, PeriodSet; PWM as a toggling waveform when that option is on.
 const g=example('ra_gpt_pwm');g.simulation={stepMs:1,pwmWaveform:true};
 g.code=raHalEntry().replace('#include "hal_data.h"','#include "hal_data.h"\ntimer_status_t running_status;\ntimer_status_t stopped_status;\ntimer_info_t info;\nvolatile uint32_t ticks = 0;\nvoid gpt1_callback(timer_callback_args_t *p_args)\n{\n    (void) p_args;\n    ticks++;\n}')
  .replace('    /* TODO: add your own code here */',['    R_GPT_Open(&g_timer6_ctrl, &g_timer6_cfg);','    R_GPT_DutyCycleSet(&g_timer6_ctrl, 12500, GPT_IO_PIN_GTIOCB);','    R_GPT_Start(&g_timer6_ctrl);','    R_GPT_Open(&g_timer1_ctrl, &g_timer1_cfg);','    R_GPT_PeriodSet(&g_timer1_ctrl, 10000000);','    R_GPT_Start(&g_timer1_ctrl);',
   '    R_BSP_SoftwareDelay(250, BSP_DELAY_UNITS_MILLISECONDS);','    R_GPT_StatusGet(&g_timer1_ctrl, &running_status);','    R_GPT_Stop(&g_timer1_ctrl);','    R_GPT_StatusGet(&g_timer1_ctrl, &stopped_status);','    R_GPT_InfoGet(&g_timer1_ctrl, &info);','    while (1)','    {','    }'].join('\n'));
 const gs=open(g).session;let highs=0,samples=0;
 run(gs,240,()=>{if(gs.runtime.microTime>=200000){samples++;highs+=high(gs,'P408');}},0.05);
 assert.ok(Math.abs(highs/samples-.25)<.05,`25 % duty as a waveform: ${highs}/${samples}`);assert.equal(gs.runtime.gpio.P408.pwm,undefined,'edges, not an average');
 run(gs,300);
 assert.equal(gs.readVariable('ticks'),2,'PeriodSet to 100 ms: cycle ends at 100 and 200 ms');
 assert.equal(gs.readVariable('running_status.state'),1);assert.equal(gs.readVariable('stopped_status.state'),0);
 assert.ok(Math.abs(gs.readVariable('running_status.counter')-5e6)<2e4,String(gs.readVariable('running_status.counter')));
 assert.equal(gs.readVariable('info.period_counts'),10000000);assert.equal(gs.readVariable('info.clock_frequency'),100000000);
});

test('debugging: a breakpoint in hal_entry.c (main.c) stops there with hal_entry on the stack; the generated names stay out of the globals',()=>{
 const p=example('ra_blink'),line=p.code.split('\n').findIndex(l=>l.includes('R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW)'))+1;
 const {session}=open(p,{debug:{breakpoints:[`main.c:${line}`]}});
 run(session,600);
 assert.equal(session.runtime.debug.paused,true);assert.deepEqual([session.runtime.location.file,session.runtime.location.line],['main.c',line]);
 assert.equal(session.runtime.callStack().at(-1).name,'hal_entry');assert.ok(Math.abs(session.runtime.microTime/1000-500)<1);
 const view=inspectRuntime(session.runtime);assert.deepEqual(view.globals,[],'ra_blink has no globals of its own');
 const irq=open(example('ra_button_irq')).session;run(irq,20);assert.deepEqual(inspectRuntime(irq.runtime).globals.map(g=>g.name).sort(),['led2','presses']);
});

// ---- Review fixes (1.52 review of feature 42).
// hal_entry() of the new-project template replaced by `body`, with `globals` before it.
const program=(globals,body,mcu)=>({...base(),...(mcu?{mcu}:{}),code:raHalEntry().replace('void hal_entry(void)',globals+'\nvoid hal_entry(void)').replace('    /* TODO: add your own code here */',body)});

test('review 1: loops that wait with R_BSP_SoftwareDelay never run out of steps, at 20 ms ticks (computing rounds before a 1 ms or 10 µs wait, a pin toggled every 2 µs)',()=>{
 const cases=[
  ['uint32_t sum = 0;\nuint32_t rounds = 0;','    while (1)\n    {\n        for (int k = 0; k < 3; k++)\n            for (int i = 0; i < 31; i++)\n            {\n                sum += i * 3;\n                sum ^= i;\n            }\n        rounds++;\n        R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);\n    }',1000],
  ['uint32_t sum = 0;\nuint32_t rounds = 0;','    while (1)\n    {\n        for (int i = 0; i < 20; i++)\n        {\n            sum += i;\n        }\n        rounds++;\n        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MICROSECONDS);\n    }',1e5],
  ['uint32_t rounds = 0;','    while (1)\n    {\n        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);\n        R_BSP_SoftwareDelay(2, BSP_DELAY_UNITS_MICROSECONDS);\n        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);\n        R_BSP_SoftwareDelay(2, BSP_DELAY_UNITS_MICROSECONDS);\n        rounds++;\n    }',2.5e5]
 ];
 for(const [globals,body,perSecond]of cases){
  const {session}=open(program(globals,body));
  assert.doesNotThrow(()=>run(session,200),body);
  const rounds=session.readVariable('rounds'),expected=perSecond*.2;
  assert.ok(Math.abs(rounds-expected)<=expected*.05+2,`${rounds} rounds in 200 ms, about ${expected}: ${body}`);
 }
});

test('review 2: a computing loop costs microseconds, not 0.1 ms a round; polling a flag an interrupt sets (volatile or not) still lets time pass',()=>{
 // 1000 rounds filling a buffer before LED1 goes on: on the board a few microseconds.
 const fill=open(program('static uint32_t buf[1000];','    for (int i = 0; i < 1000; i++)\n    {\n        buf[i] = (uint32_t) i;\n    }\n    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);\n    while (1)\n    {\n    }')).session;
 assert.deepEqual(edges(fill,'P408',5)[0],[1,1],'LED1 on in the first millisecond');assert.equal(fill.readVariable('buf[999]'),999);
 // A 1000-round checksum each 10 ms: about 100 rounds a second, as on the board.
 const sum=open(program('uint32_t loops = 0;\nuint32_t total = 0;\nstatic uint32_t checksum(void)\n{\n    uint32_t s = 0;\n    for (int i = 0; i < 1000; i++)\n    {\n        s += (uint32_t) i;\n    }\n    return s;\n}','    while (1)\n    {\n        total += checksum();\n        loops++;\n        R_BSP_SoftwareDelay(10, BSP_DELAY_UNITS_MILLISECONDS);\n    }')).session;
 run(sum,1000);assert.ok(sum.readVariable('loops')>=98&&sum.readVariable('loops')<=101,String(sum.readVariable('loops')));
 // Longer counting loops (for and while, past 4096 rounds) still cost only their steps: 20000 rounds is well under 1 ms.
 for(const loop of ['    for (uint32_t i = 0; i < 20000; i++)\n    {\n        acc += i;\n    }','    uint32_t n = 20000;\n    while (n--)\n    {\n        acc += n;\n    }','    uint32_t k = 0;\n    while (k < 20000)\n    {\n        acc += k;\n        k++;\n    }']){
  const long=open(program('uint32_t acc = 0;','    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);\n'+loop+'\n    R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);\n    while (1)\n    {\n    }')).session;
  const on=edges(long,'P408',20).find(e=>e[1]===1);assert.ok(on&&on[0]<=6,`${JSON.stringify(on)}: ${loop}`);
 }
 // A plain (not volatile) flag set by the GPT1 callback, polled in a helper: LED1 at the 500 ms cycle end.
 const mcu=raExample('ra_gpt_pwm').mcu();
 const poll=open(program('static bool done = false;\nvoid gpt1_callback(timer_callback_args_t *p_args)\n{\n    (void) p_args;\n    done = true;\n}\nstatic void wait_done(void)\n{\n    while (!done)\n    {\n    }\n}','    R_GPT_Open(&g_timer1_ctrl, &g_timer1_cfg);\n    R_GPT_Start(&g_timer1_ctrl);\n    wait_done();\n    R_IOPORT_PinWrite(&g_ioport_ctrl, LED2, BSP_IO_LEVEL_HIGH);\n    while (1)\n    {\n    }',mcu)).session;
 const on=edges(poll,'P407',700).find(e=>e[1]===1);assert.ok(on&&Math.abs(on[0]-500)<=1,JSON.stringify(on));
});

test('review 3: an IIC transfer takes its bus time: a second Write meanwhile is FSP_ERR_IN_USE, the callback comes later; Abort drops the transfer and its callback',()=>{
 const p=example('ra_iic_memory');
 p.code=program('volatile uint32_t calls = 0;\nuint32_t calls_after_write = 99;\nfsp_err_t first = 99;\nfsp_err_t second = 99;\nfsp_err_t after_abort = 99;\nuint32_t calls_after_abort = 99;\nuint8_t data[4] = { 0x10, 1, 2, 3 };\nvoid i2c_master0_callback(i2c_master_callback_args_t *p_args)\n{\n    (void) p_args;\n    calls++;\n}',
  ['    R_IIC_MASTER_Open(&g_i2c_master0_ctrl, &g_i2c_master0_cfg);','    first = R_IIC_MASTER_Write(&g_i2c_master0_ctrl, data, 4, false);','    calls_after_write = calls;','    second = R_IIC_MASTER_Write(&g_i2c_master0_ctrl, data, 4, false);','    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);',
   '    R_IIC_MASTER_Write(&g_i2c_master0_ctrl, data, 4, false);','    R_IIC_MASTER_Abort(&g_i2c_master0_ctrl);','    after_abort = R_IIC_MASTER_Write(&g_i2c_master0_ctrl, data, 1, false);','    R_IIC_MASTER_Abort(&g_i2c_master0_ctrl);','    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);','    calls_after_abort = calls;','    while (1)\n    {\n    }'].join('\n')).code;
 const {session}=open(p);run(session,40);
 assert.deepEqual(['first','second','calls_after_write','after_abort','calls_after_abort'].map(n=>session.readVariable(n)),[0,8,0,0,1]);
});

test('review 4: SCI UART — a write chained from TX_DATA_EMPTY gives one TX_COMPLETE; Abort(TX) and Close stop the bytes not sent and their events',()=>{
 const p=example('ra_uart_echo');
 p.code=program('volatile uint32_t txe = 0;\nvolatile uint32_t tei = 0;\nstatic bool chained = false;\nstatic uint8_t ab[] = "AB";\nstatic uint8_t cd[] = "CD";\nstatic uint8_t text[] = "0123456789abcdefghij";\nvoid user_uart9_callback(uart_callback_args_t *p_args)\n{\n    if (UART_EVENT_TX_DATA_EMPTY == p_args->event)\n    {\n        txe++;\n        if (!chained)\n        {\n            chained = true;\n            R_SCI_UART_Write(&g_uart9_ctrl, cd, 2);\n        }\n    }\n    if (UART_EVENT_TX_COMPLETE == p_args->event)\n    {\n        tei++;\n    }\n}\nuint32_t txe_1 = 0;\nuint32_t tei_1 = 0;',
  ['    R_SCI_UART_Open(&g_uart9_ctrl, &g_uart9_cfg);','    R_SCI_UART_Write(&g_uart9_ctrl, ab, 2);','    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);','    txe_1 = txe;','    tei_1 = tei;',
   '    R_SCI_UART_Write(&g_uart9_ctrl, text, 20);','    R_SCI_UART_Abort(&g_uart9_ctrl, UART_DIR_TX);','    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);',
   '    R_SCI_UART_Write(&g_uart9_ctrl, text, 20);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);','    R_SCI_UART_Close(&g_uart9_ctrl);','    while (1)\n    {\n    }'].join('\n')).code;
 const {session}=open(p);run(session,40);
 assert.deepEqual([session.readVariable('txe_1'),session.readVariable('tei_1')],[2,1],'TXI after each write, one TEI at the end');
 assert.deepEqual([session.readVariable('txe'),session.readVariable('tei')],[2,1],'no event from the aborted or closed writes');
 const got=session.buses.received.get('term');assert.ok(got.startsWith('ABCD'),got);
 // The aborted write sent nothing; the closed one only the frames started in its first millisecond (86.8 µs each).
 assert.equal(got.slice(4),'0123456789abcdefghij'.slice(0,got.length-4));assert.equal(got.length-4,12,got);
});

test('review 5: R_GPT_PeriodSet clears the counter of a stopped timer; a counting one keeps its cycle and takes the period at the next overflow',()=>{
 const mcu=raExample('ra_gpt_pwm').mcu();
 const {session}=open(program('volatile uint32_t ticks = 0;\ntimer_status_t stopped;\ntimer_status_t cleared;\ntimer_status_t counting;\nvoid gpt1_callback(timer_callback_args_t *p_args)\n{\n    (void) p_args;\n    ticks++;\n}',
  ['    R_GPT_Open(&g_timer1_ctrl, &g_timer1_cfg);','    R_GPT_Start(&g_timer1_ctrl);','    R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);','    R_GPT_Stop(&g_timer1_ctrl);','    R_GPT_StatusGet(&g_timer1_ctrl, &stopped);',
   '    R_GPT_PeriodSet(&g_timer1_ctrl, 10000000);','    R_GPT_StatusGet(&g_timer1_ctrl, &cleared);','    R_GPT_Start(&g_timer1_ctrl);','    R_BSP_SoftwareDelay(50, BSP_DELAY_UNITS_MILLISECONDS);',
   '    R_GPT_PeriodSet(&g_timer1_ctrl, 25000000);','    R_GPT_StatusGet(&g_timer1_ctrl, &counting);','    while (1)\n    {\n    }'].join('\n'),mcu));
 run(session,160);assert.equal(session.readVariable('ticks'),0);
 assert.ok(Math.abs(session.readVariable('stopped.counter')-1e7)<1e4,'100 ms at 100 MHz');assert.equal(session.readVariable('cleared.counter'),0,'GTCLR');
 assert.ok(Math.abs(session.readVariable('counting.counter')-5e6)<1e4,'still counting the 100 ms cycle');
 // Cycle ends at 200 ms (the old 100 ms period), then every 250 ms: 450, 700.
 const at=[];let last=0;run(session,800,t=>{const n=session.readVariable('ticks');if(n!==last){at.push(t);last=n;}},1);
 assert.deepEqual(at,[200,450,700]);
});

test('review 8 and 9: a project header named like an FSP header (src/board.h) is the one included, and its globals show in the debugger',()=>{
 const p={...base(),code:raHalEntry().replace('#include "hal_data.h"','#include "hal_data.h"\n#include "board.h"').replace('    /* TODO: add your own code here */','    board_var += MY_VALUE;'),firmware:{mode:'fsp',files:[{name:'src/board.h',text:'#define MY_VALUE 35\nint board_var = 7;\n'}]}};
 const {session}=open(p);run(session,20);
 assert.equal(session.readVariable('board_var'),42);
 // The header's own names (its #define as well, as for STM32 projects) are shown; the FSP stand-in's are not.
 assert.deepEqual(inspectRuntime(session.runtime).globals.map(g=>g.name).sort(),['MY_VALUE','board_var']);
 // A file of its own at the top (board.h) also wins over the stand-in.
 assert.equal(compileFsp(p.code,[{name:'board.h',text:'#define MY_VALUE 1\nint board_var = 1;\n'}],raDefaultMcu()).preludeNames.has('board_var'),false);
});

// ---- SPI (feature 32 on the interpreter): r_spi on SPI1 and r_sci_spi on SCI9.
// The project of tests/toolchain/ra-spi: SCI9 simple SPI (CPOL 1 / CPHA 1, 2 MHz) and SPI1 3-wire (LSB first, 4 MHz), MOSI
// and MISO of each wired together on the Arduino header (D1–D0, D11–D12).
function spiLoopMcu(){
 const mcu=raDefaultMcu(),peripheral=signal=>({function:'Peripheral',signal});
 Object.assign(mcu.pins,{P109:peripheral('SCI9_TXD'),P110:peripheral('SCI9_RXD'),P111:peripheral('SCI9_SCK'),P100:peripheral('SPI1_MISO'),P101:peripheral('SPI1_MOSI'),P102:peripheral('SPI1_RSPCK')});
 mcu.peripherals={SCI9:{enabled:true,mode:'SPI',bitrate:2000000,cpol:1,cpha:1,callback:'sci_spi9_callback',priority:10},SPI1:{enabled:true,bitrate:4000000,bitOrder:'LSB',callback:'spi1_callback',priority:10}};
 return mcu;
}
const LOOP_WIRES=[{id:'w_sci',from:'board:J5:1',to:'board:J5:2',color:'#30a46c'},{id:'w_spi',from:'board:J1:4',to:'board:J1:5',color:'#0090ff'}];
// The SPI callbacks the adapter calls, with the time (µs) of each.
function spyCallbacks(session){const at=[],own=session.hal.callback.bind(session.hal);session.hal.callback=function*(r,fn,type,fields){if(type==='spi_callback_args_t')at.push({fn,us:r.microTime,event:fields.event});yield* own(r,fn,type,fields);};return at;}

test('SPI: ra_spi_memory runs on the interpreter — SPI1 writes 0x2A at 0x10 of the SPI memory and reads it back with SSL0 low; SCI9 prints it, LED2 lights',()=>{
 const {session,log}=open(example('ra_spi_memory')),calls=spyCallbacks(session),ssl=[];
 const own=session.buses.spiRespond.bind(session.buses);session.buses.spiRespond=(v,r)=>{ssl.push(session.result.voltage('signal:P103')<.8);return own(v,r);};
 run(session,1200);
 assert.equal(session.readVariable('matched'),1);assert.equal(session.readVariable('readback'),0x2a);
 assert.equal(session.buses.received.get('term'),'SPI1 read 0x2A\r\n');assert.equal(high(session,'P407'),1,'LED2 on');
 assert.deepEqual(log.trace.filter(t=>t.protocol==='SPI').map(t=>t.message),['SPI1 · 3 × 8비트 · TX 02 10 2A · RX 00 00 00','SPI1 · 3 × 8비트 · TX 03 10 00 · RX 00 00 2A']);
 assert.deepEqual(ssl,[true,true,true,true,true,true],'SSL0 (P103, D10) low while each byte is exchanged');
 assert.equal(high(session,'P103'),1,'SSL0 high again after the transfer');assert.equal(session.runtime.gpio.P102.mode,'OUTPUT');assert.equal(session.runtime.gpio.P100.mode,'INPUT');
 assert.deepEqual(calls.map(c=>[c.fn,c.event]),[['spi1_callback',1],['spi1_callback',1]]);
 // LED1 toggles every 500 ms from the end of the SPI and UART calls (a fraction of a millisecond after reset).
 assert.deepEqual(edges(session,'P408',2200).slice(1),[[1501,0],[2001,1]],'LED1 blinks');
});

test('SPI: a transfer takes its bus time — another call meanwhile is FSP_ERR_IN_USE, TRANSFER_COMPLETE comes 24 µs later at 1 MHz; Close drops the transfer and its callback',()=>{
 const p=example('ra_spi_memory');
 p.code=program('volatile uint32_t calls = 0;\nuint32_t calls_after_write = 99;\nfsp_err_t first = 99;\nfsp_err_t second = 99;\nfsp_err_t read_busy = 99;\nfsp_err_t closed = 99;\nfsp_err_t reopened = 99;\nfsp_err_t not_open = 99;\nuint32_t calls_after_close = 99;\nuint8_t data[3] = { 0x02, 0x20, 0x55 };\nuint8_t rx[3];\nvoid spi1_callback(spi_callback_args_t *p_args)\n{\n    if (SPI_EVENT_TRANSFER_COMPLETE == p_args->event)\n    {\n        calls++;\n    }\n}\nvoid user_uart9_callback(uart_callback_args_t *p_args)\n{\n    (void) p_args;\n}',
  ['    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    first = R_SPI_Write(&g_spi1_ctrl, data, 3, SPI_BIT_WIDTH_8_BITS);','    calls_after_write = calls;','    second = R_SPI_Write(&g_spi1_ctrl, data, 3, SPI_BIT_WIDTH_8_BITS);','    read_busy = R_SPI_Read(&g_spi1_ctrl, rx, 3, SPI_BIT_WIDTH_8_BITS);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);',
   '    R_SPI_Write(&g_spi1_ctrl, data, 3, SPI_BIT_WIDTH_8_BITS);','    closed = R_SPI_Close(&g_spi1_ctrl);','    not_open = R_SPI_Write(&g_spi1_ctrl, data, 3, SPI_BIT_WIDTH_8_BITS);','    reopened = R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);','    calls_after_close = calls;','    while (1)\n    {\n    }'].join('\n'),p.mcu).code;
 const {session,log}=open(p),calls=spyCallbacks(session);run(session,40);
 assert.deepEqual(['first','calls_after_write','second','read_busy','closed','not_open','reopened','calls_after_close'].map(n=>session.readVariable(n)),[0,0,8,8,0,7,0,1]);
 const start=log.trace.find(t=>t.protocol==='SPI').micros;
 assert.equal(calls.length,1);assert.ok(Math.abs(calls[0].us-start-24)<1e-6,`3 frames of 8 bits at 1 MHz: ${calls[0].us-start} µs`);
 assert.equal(high(session,'P103'),1,'Close leaves SSL0 high');
});

test('SPI: SPI1 3-wire LSB first in 16- and 32-bit frames and SCI9 simple SPI loop back through the circuit; SCI SPI takes 8-bit frames only',()=>{
 const code=program('static volatile uint32_t sci_done = 0;\nstatic volatile uint32_t spi_done = 0;\nvolatile uint32_t sci_ok = 0;\nvolatile uint32_t spi_ok = 0;\nfsp_err_t wide = 99;\nfsp_err_t odd_width = 99;\nuint32_t sci_cb_channel = 0;\nvoid sci_spi9_callback(spi_callback_args_t *p_args)\n{\n    sci_cb_channel = p_args->channel;\n    if (SPI_EVENT_TRANSFER_COMPLETE == p_args->event)\n    {\n        sci_done++;\n    }\n}\nvoid spi1_callback(spi_callback_args_t *p_args)\n{\n    if (SPI_EVENT_TRANSFER_COMPLETE == p_args->event)\n    {\n        spi_done++;\n    }\n}',
  ['    static const uint8_t tx[4] = { 0x9A, 0x01, 0x80, 0x55 };','    static uint8_t rx[4];','    static const uint16_t tx16[2] = { 0x1234, 0xABCD };','    static uint16_t rx16[2];','    static const uint32_t tx32[1] = { 0xDEADBEEF };','    static uint32_t rx32[1];',
   '    R_SCI_SPI_Open(&g_sci_spi9_ctrl, &g_sci_spi9_cfg);','    wide = R_SCI_SPI_Write(&g_sci_spi9_ctrl, tx, 2, SPI_BIT_WIDTH_16_BITS);','    R_SCI_SPI_WriteRead(&g_sci_spi9_ctrl, tx, rx, sizeof(tx), SPI_BIT_WIDTH_8_BITS);','    while (sci_done < 1)\n    {\n    }',
   '    sci_ok = (rx[0] == 0x9A) && (rx[1] == 0x01) && (rx[2] == 0x80) && (rx[3] == 0x55);',
   '    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    odd_width = R_SPI_Write(&g_spi1_ctrl, tx16, 1, SPI_BIT_WIDTH_28_BITS);','    R_SPI_WriteRead(&g_spi1_ctrl, tx16, rx16, 2, SPI_BIT_WIDTH_16_BITS);','    while (spi_done < 1)\n    {\n    }','    R_SPI_WriteRead(&g_spi1_ctrl, tx32, rx32, 1, SPI_BIT_WIDTH_32_BITS);','    while (spi_done < 2)\n    {\n    }',
   '    spi_ok = (rx16[0] == 0x1234) && (rx16[1] == 0xABCD) && (rx32[0] == 0xDEADBEEF);','    while (1)\n    {\n    }'].join('\n'),spiLoopMcu());
 const {session,log}=open({...code,wires:LOOP_WIRES}),wire=[];
 const own=session.buses.spiRespond.bind(session.buses);session.buses.spiRespond=(v,r)=>{wire.push([session.buses.spiId,v]);return own(v,r);};
 run(session,40);assert.deepEqual(log.warn,[]);
 assert.deepEqual(['wide','odd_width','sci_ok','spi_ok','sci_cb_channel'].map(n=>session.readVariable(n)),[6,1,1,1,9],'FSP_ERR_UNSUPPORTED, FSP_ERR_ASSERTION, both loops');
 // On the wire: SCI9 MSB first; SPI1 LSB first, so 0x1234 goes out as 0x2C48 (MSB byte first), 0xDEADBEEF as 0xF77DB57B.
 assert.deepEqual(wire.filter(w=>w[0]==='SCI9').map(w=>w[1]),[0x9a,0x01,0x80,0x55]);
 assert.deepEqual(wire.filter(w=>w[0]==='SPI1').map(w=>w[1].toString(16)),['2c','48','b3','d5','f7','7d','b5','7b']);
 assert.equal(session.runtime.gpio.P111.mode,'OUTPUT');assert.equal(high(session,'P111'),1,'SCK9 idles high (CPOL 1)');
 assert.equal(session.runtime.gpio.P103?.mode,undefined,'3-wire: the RSPI drives no SSL0');
 // r_spi 4 MHz from PCLKA 100 MHz: SPBR 12 → 3.846 MHz, 16 bits in 4.16 µs; SCI 2 MHz: CKS 0, BRR 12 → 1.923 MHz.
 const t=log.trace.filter(x=>x.protocol==='SPI').map(x=>x.message);
 assert.deepEqual(t,['SCI9 · 4 × 8비트 · TX 9A 01 80 55 · RX 9A 01 80 55','SPI1 · 2 × 16비트 · TX 1234 ABCD · RX 1234 ABCD','SPI1 · 1 × 32비트 · TX DEADBEEF · RX DEADBEEF']);
});

test('SPI: R_SPI_CallbackSet replaces the Stacks callback and passes its context; the prelude declares the SPI instances of both drivers',()=>{
 const code=program('volatile uint32_t mine = 0;\nvolatile uint32_t stacks = 0;\nuint32_t token = 7;\nuint32_t seen = 0;\nspi_callback_args_t cb_memory;\nvoid spi1_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n    stacks++;\n}\nvoid sci_spi9_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n}\nvoid my_callback(spi_callback_args_t *p_args)\n{\n    seen = *(uint32_t *) p_args->p_context;\n    mine++;\n}',
  ['    static uint8_t b[2] = { 1, 2 };','    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_SPI_CallbackSet(&g_spi1_ctrl, my_callback, &token, &cb_memory);','    R_SPI_Write(&g_spi1_ctrl, b, 2, SPI_BIT_WIDTH_8_BITS);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);','    while (1)\n    {\n    }'].join('\n'),spiLoopMcu());
 const {session}=open({...code,wires:LOOP_WIRES});run(session,20);
 assert.deepEqual(['mine','stacks','seen'].map(n=>session.readVariable(n)),[1,0,7]);
 const prelude=fspPrelude(validateRaMcu(spiLoopMcu()));
 for(const name of ['g_spi1_ctrl','g_spi1_ext_cfg','g_spi1_cfg','g_spi1','g_sci_spi9_ctrl','g_sci_spi9_cfg_extend','g_sci_spi9_cfg','g_sci_spi9'])assert.match(prelude,new RegExp(`\\b${name} =|\\b${name};`),name);
 assert.match(prelude,/\.spi_clksyn = SPI_SSL_MODE_CLK_SYN/);assert.match(prelude,/\.bit_order = SPI_BIT_ORDER_LSB_FIRST/);assert.doesNotMatch(prelude,/g_uart9/,'SCI9 in SPI mode is not a UART');
});

// ---- Feature 32 review fixes (the interpreter's SPI against r_spi.c / r_sci_spi.c).
const SPI_CBS='void spi1_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n}\nvoid sci_spi9_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n}\n';
const spiLoop=(globals,lines,mcu=spiLoopMcu())=>{const {session,log}=open({...program(globals,[...lines,'    while (1)\n    {\n    }'].join('\n'),mcu),wires:LOOP_WIRES});run(session,20);return {session,log,spi:log.trace.filter(t=>t.protocol==='SPI').map(t=>t.message)};};

test('SPI review 2: parameter checks in the drivers\' order — WriteRead needs both buffers, r_sci_spi checks width and buffers before the open state, CallbackSet(NULL) is FSP_ERR_ASSERTION',()=>{
 const {session,spi}=spiLoop(SPI_CBS+'fsp_err_t e[8] = { 99, 99, 99, 99, 99, 99, 99, 99 };\nuint8_t tx[2] = { 1, 2 };\nuint8_t rx[2];\n',[
  '    e[0] = R_SCI_SPI_Write(&g_sci_spi9_ctrl, NULL, 2, SPI_BIT_WIDTH_8_BITS);','    e[1] = R_SCI_SPI_Write(&g_sci_spi9_ctrl, tx, 2, SPI_BIT_WIDTH_16_BITS);','    e[2] = R_SPI_Write(&g_spi1_ctrl, NULL, 2, SPI_BIT_WIDTH_8_BITS);','    e[3] = R_SPI_CallbackSet(&g_spi1_ctrl, NULL, NULL, NULL);',
  '    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_SCI_SPI_Open(&g_sci_spi9_ctrl, &g_sci_spi9_cfg);',
  '    e[4] = R_SPI_WriteRead(&g_spi1_ctrl, tx, NULL, 2, SPI_BIT_WIDTH_8_BITS);','    e[5] = R_SCI_SPI_WriteRead(&g_sci_spi9_ctrl, NULL, rx, 2, SPI_BIT_WIDTH_8_BITS);','    e[6] = R_SCI_SPI_Read(&g_sci_spi9_ctrl, NULL, 2, SPI_BIT_WIDTH_8_BITS);','    e[7] = R_SPI_Write(&g_spi1_ctrl, tx, 0, SPI_BIT_WIDTH_8_BITS);']);
 // ASSERTION before NOT_OPEN (r_sci_spi), UNSUPPORTED first, NOT_OPEN before the buffer (r_spi common), then the open
 // channel's NULL buffers and length 0 — and none of them transfers anything.
 assert.deepEqual(Array.from({length:8},(_,i)=>session.readVariable(`e[${i}]`)),[1,6,7,1,1,1,1,1]);
 assert.deepEqual(spi,[]);
});

test('SPI review 3: frames are read and written through the driver\'s uint8/16/32 pointer — a uint8_t buffer holds 16-bit frames little-endian, a uint32_t buffer four 8-bit frames',()=>{
 const {session,spi}=spiLoop(SPI_CBS+'uint8_t tx8[4] = { 0x34, 0x12, 0xCD, 0xAB };\nuint8_t rx8[4];\nuint32_t tx32[1] = { 0x44332211 };\nuint32_t rx32[1];\nuint16_t tx16[1] = { 0xBEEF };\nuint8_t rx16[2];\n',[
  '    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_SPI_WriteRead(&g_spi1_ctrl, tx8, rx8, 2, SPI_BIT_WIDTH_16_BITS);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);',
  '    R_SPI_WriteRead(&g_spi1_ctrl, tx32, rx32, 4, SPI_BIT_WIDTH_8_BITS);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);','    R_SPI_WriteRead(&g_spi1_ctrl, tx16, rx16, 2, SPI_BIT_WIDTH_8_BITS);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);']);
 // SPI1 is LSB first here; the trace shows the frame values.
 assert.deepEqual(spi,['SPI1 · 2 × 16비트 · TX 1234 ABCD · RX 1234 ABCD','SPI1 · 4 × 8비트 · TX 11 22 33 44 · RX 11 22 33 44','SPI1 · 2 × 8비트 · TX EF BE · RX EF BE']);
 assert.deepEqual([0,1,2,3].map(i=>session.readVariable(`rx8[${i}]`)),[0x34,0x12,0xcd,0xab]);
 assert.equal(session.readVariable('rx32[0]'),0x44332211);assert.deepEqual([0,1].map(i=>session.readVariable(`rx16[${i}]`)),[0xef,0xbe]);
 // A buffer too small for the frames stops with the interpreter's range error, as an out-of-bounds access does.
 assert.throws(()=>spiLoop(SPI_CBS+'uint8_t small[3];\n',['    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_SPI_Write(&g_spi1_ctrl, small, 2, SPI_BIT_WIDTH_16_BITS);']),/범위/);
});

test('SPI review 4: the callback gets p_cfg->p_context of the configuration Open was given; SSL0 follows ssl_polarity (active high)',()=>{
 const mcu=raExample('ra_spi_memory').mcu();
 const p=program('uint32_t token = 7;\nuint32_t seen = 0;\nvolatile uint32_t done = 0;\nspi_cfg_t my_cfg;\nspi_extended_cfg_t my_ext;\nuint8_t b[2] = { 1, 2 };\nvoid spi1_callback(spi_callback_args_t *p_args)\n{\n    if (p_args->p_context != NULL)\n    {\n        seen = *(uint32_t *) p_args->p_context;\n    }\n    done++;\n}\nvoid user_uart9_callback(uart_callback_args_t *p_args)\n{\n    (void) p_args;\n}',
  ['    my_ext = g_spi1_ext_cfg;','    my_ext.ssl_polarity = SPI_SSLP_HIGH;','    my_cfg = g_spi1_cfg;','    my_cfg.p_context = &token;','    my_cfg.p_extend = &my_ext;','    R_SPI_Open(&g_spi1_ctrl, &my_cfg);','    R_BSP_SoftwareDelay(5, BSP_DELAY_UNITS_MILLISECONDS);','    R_SPI_Write(&g_spi1_ctrl, b, 2, SPI_BIT_WIDTH_8_BITS);','    R_BSP_SoftwareDelay(1, BSP_DELAY_UNITS_MILLISECONDS);','    while (1)\n    {\n    }'].join('\n'),mcu);
 const {session}=open(p),during=[];const own=session.buses.spiRespond.bind(session.buses);session.buses.spiRespond=(v,r)=>{during.push(high(session,'P103'));return own(v,r);};
 run(session,2,undefined,1);assert.equal(high(session,'P103'),0,'SSL0 idles low when active high');
 run(session,20);
 assert.deepEqual(['seen','done'].map(n=>session.readVariable(n)),[7,1]);
 assert.deepEqual(during,[1,1],'SSL0 high (active) while the bytes are exchanged');assert.equal(high(session,'P103'),0,'inactive again');
});

test('SPI review 5 and 6: 9-bit frames take 9 bit times on the bus and the logic analyzer (no overlap), loop back whole; LSB first is decoded LSB first',()=>{
 const mcu=spiLoopMcu();mcu.peripherals.SPI1.bitrate=1000000;
 const globals='volatile uint32_t done = 0;\nvoid spi1_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n    done++;\n}\nvoid sci_spi9_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n}\nuint16_t tx[3] = { 0x1FF, 0x101, 0x0AA };\nuint16_t rx[3];\nuint8_t lsb[2] = { 0x01, 0xA5 };\n';
 const {session,log}=open({...program(globals,['    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_SPI_WriteRead(&g_spi1_ctrl, tx, rx, 3, SPI_BIT_WIDTH_9_BITS);','    while (done == 0)\n    {\n    }','    R_BSP_SoftwareDelay(2, BSP_DELAY_UNITS_MILLISECONDS);','    R_SPI_Write(&g_spi1_ctrl, lsb, 2, SPI_BIT_WIDTH_8_BITS);','    while (1)\n    {\n    }'].join('\n'),mcu),wires:LOOP_WIRES});
 const calls=spyCallbacks(session),decoded=from=>session.signalRecorder.decode('SPI1.SCK').filter(f=>!f.error&&f.startUs>=from).map(f=>[f.value,f.answer]);
 run(session,1,undefined,1);
 assert.deepEqual([0,1,2].map(i=>session.readVariable(`rx[${i}]`)),[0x1ff,0x101,0x0aa],'whole 9-bit frames through the loopback');
 const start=log.trace.find(t=>t.protocol==='SPI').micros;assert.ok(Math.abs(calls[0].us-start-27)<1e-6,`3 x 9 bits at 1 MHz: ${calls[0].us-start}`);
 const sck=session.signalRecorder.samples('SPI1.SCK',start,start+30),rising=sck.filter((e,i)=>i&&e[1]===1&&sck[i-1][1]===0);
 assert.equal(rising.length,27,'27 clocks for 27 bits');assert.ok(rising.at(-1)[0]<start+27);
 assert.deepEqual(decoded(start),[[0x1ff,0x1ff],[0x101,0x101],[0xaa,0xaa]],'decoded in 9-bit frames');
 run(session,20);
 // Each transfer keeps its own frame width on the analyzer: the 9-bit frames still read as 9 bits after the 8-bit ones.
 assert.deepEqual(decoded(0).map(f=>f[0]),[0x1ff,0x101,0x0aa,0x01,0xa5],'9-bit frames, then LSB first decoded LSB first');
});

test('SPI re-check 11: an 8-bit command then 16-bit data — the analyzer decodes each transfer with its own width and bit order',()=>{
 const mcu=spiLoopMcu();mcu.peripherals.SPI1.bitOrder='MSB';
 const globals='volatile uint32_t done = 0;\nvoid spi1_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n    done++;\n}\nvoid sci_spi9_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n}\nuint8_t cmd[2] = { 0x12, 0x34 };\nuint16_t data[1] = { 0xABCD };\n';
 const {session}=open({...program(globals,['    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_SPI_Write(&g_spi1_ctrl, cmd, 2, SPI_BIT_WIDTH_8_BITS);','    while (done == 0)\n    {\n    }','    R_SPI_Write(&g_spi1_ctrl, data, 1, SPI_BIT_WIDTH_16_BITS);','    while (1)\n    {\n    }'].join('\n'),mcu),wires:LOOP_WIRES});
 run(session,20);
 assert.deepEqual(session.signalRecorder.decode('SPI1.SCK').map(f=>f.label),['MOSI 0x12 / MISO 0x12','MOSI 0x34 / MISO 0x34','MOSI 0xABCD / MISO 0xABCD']);
});

test('SPI re-check 12: the circuit noise reaches the RA SPI as it does the STM32 SPI — bit errors in the received data and on the lines, clock glitches; none without noise',()=>{
 const mcu=raDefaultMcu(),peripheral=signal=>({function:'Peripheral',signal});
 Object.assign(mcu.pins,{P100:peripheral('SPI1_MISO'),P101:peripheral('SPI1_MOSI'),P102:peripheral('SPI1_RSPCK')});mcu.peripherals={SPI1:{enabled:true,bitrate:1000000,callback:'spi1_callback',priority:10}};
 const p=noise=>({...program('volatile uint32_t done = 0;\nuint32_t wrong = 0;\nvoid spi1_callback(spi_callback_args_t *p_args)\n{\n    (void) p_args;\n    done++;\n}\nuint8_t tx[64];\nuint8_t rx[64];\n',
  ['    for (int i = 0; i < 64; i++)\n    {\n        tx[i] = (uint8_t) i;\n    }','    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);','    R_SPI_WriteRead(&g_spi1_ctrl, tx, rx, 64, SPI_BIT_WIDTH_8_BITS);','    while (done == 0)\n    {\n    }','    for (int i = 0; i < 64; i++)\n    {\n        if (rx[i] != tx[i])\n        {\n            wrong++;\n        }\n    }','    while (1)\n    {\n    }'].join('\n'),mcu),
  wires:[{id:'w_spi',from:'board:J1:4',to:'board:J1:5',color:'#0090ff'}],simulation:{stepMs:1,pwmWaveform:false,noise}});
 const noisy=open(p({enabled:true,bitErrorRate:0.2,glitchRate:0.1,jitterNs:50})).session;run(noisy,20);
 assert.ok(noisy.noise.counts.bitErrors>0&&noisy.noise.counts.glitches>0,JSON.stringify(noisy.noise.counts));
 assert.ok(noisy.readVariable('wrong')>0,'bit errors reach the receive buffer');
 assert.ok(noisy.signalRecorder.decode('SPI1.SCK').some((f,i)=>f.error||f.value!==i),'and the analyzer');
 const clean=open(p({enabled:false,bitErrorRate:0.2,glitchRate:0.1,jitterNs:50})).session;run(clean,20);
 assert.deepEqual(clean.noise.counts,{bitErrors:0,glitches:0});assert.equal(clean.readVariable('wrong'),0);
 assert.deepEqual(clean.signalRecorder.decode('SPI1.SCK').map(f=>f.value),Array.from({length:64},(_,i)=>i));
});
