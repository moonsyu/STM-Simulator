// Feature 41: USB PCDC (r_usb_basic g_basic0 with r_usb_pcdc) — the Stacks settings and the generated FSP files (instance,
// vectors after the others, r_usb_basic_cfg.h / r_usb_pcdc_cfg.h, PLL2 → UCLK 48 MHz; nothing changes without the stack),
// the emulator's USBFS registers, FIFO and control transfer stages, the PC's requests in order, the built-in
// interpreter's R_USB_* (return codes, events, echo), and the descriptor source a project gets with the stack.
import test from 'node:test';
import assert from 'node:assert/strict';
import {UsbFs,USBFS_EVENT,USB_HOST_LINE_CODING} from '../../src/emu/ra6e1/usbfs.js';
import {raDefaultMcu,validateRaMcu,raNameProblem,RA_USB_DEFAULTS} from '../../src/ra-config.js';
import {generateRaFiles,raVectors,raInstances,raUsbClock} from '../../src/ra-generator.js';
import {raAssistance} from '../../src/ra-assistance.js';
import {raExample} from '../../src/ra-examples.js';
import {SimulationSession} from '../../src/session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {addUsbDescriptor,RA_USB_DESCRIPTOR_FILE,RA_USB_DESCRIPTOR_C} from '../../src/ra-usb-descriptor.js';

const mcu=peripherals=>({...raDefaultMcu(),peripherals});
const USB={enabled:true};

test('USB stack settings: defaults, priorities 0-15, a callback name or none, names the generated code and FSP use',()=>{
 assert.deepEqual(validateRaMcu(mcu({USB})).peripherals.USB,{enabled:true,...RA_USB_DEFAULTS});
 assert.deepEqual(RA_USB_DEFAULTS,{callback:'',priority:12,resumePriority:12});
 assert.equal(validateRaMcu(mcu({USB:{enabled:true,callback:'usb_cb',priority:3,resumePriority:15}})).peripherals.USB.callback,'usb_cb');
 assert.throws(()=>validateRaMcu(mcu({USB:{enabled:true,priority:16}})),/USB: USBI 인터럽트 우선순위는 0~15입니다/);
 assert.throws(()=>validateRaMcu(mcu({USB:{enabled:true,resumePriority:-1}})),/USB: USBR 인터럽트 우선순위는 0~15입니다/);
 assert.throws(()=>validateRaMcu(mcu({USB:{enabled:true,callback:'1x'}})),/USB: 콜백 이름은 C 식별자로/);
 assert.throws(()=>validateRaMcu(mcu({USB:{}})),/USB: 설정을 확인하세요/);
 for(const name of ['g_basic0','g_basic0_ctrl','g_basic0_cfg'])assert.match(raNameProblem(name),/인스턴스 이름/);
 for(const name of ['usbfs_interrupt_handler','usbfs_resume_handler','usbfs_d0fifo_handler','usbfs_d1fifo_handler'])assert.match(raNameProblem(name),/ISR/);
 assert.match(raNameProblem('g_usb_on_usb'),/API 객체/);
 assert.throws(()=>validateRaMcu(mcu({USB:{enabled:true,callback:'g_basic0_ctrl'}})),/인스턴스 이름/);
 // One name for the USB callback and a UART's: two declarations of different argument types in hal_data.h.
 const m=raExample('ra_uart_echo').mcu();m.peripherals.USB={enabled:true,callback:m.peripherals.SCI9.callback};
 assert.throws(()=>validateRaMcu(m),/usb_callback_args_t/);
});

test('generated files with the USB stack: g_basic0, its vectors after the others, the cfg headers, PLL2 as the 48 MHz USB clock',()=>{
 const m=raExample('ra_uart_echo').mcu();m.peripherals.FLASH={enabled:true,bgo:true,callback:'flash_cb',readyPriority:12,errorPriority:12};
 const before=raVectors(m);m.peripherals.USB={enabled:true,priority:5,resumePriority:7,callback:'usb_cb'};
 const vectors=raVectors(m);
 assert.deepEqual(vectors.slice(0,before.length),before,'the slots before keep their numbers');
 assert.deepEqual(vectors.slice(before.length).map(v=>[v.vector,v.isr,v.event]),[['USBFS_INT','usbfs_interrupt_handler','USBFS_INT'],['USBFS_RESUME','usbfs_resume_handler','USBFS_RESUME']]);
 assert.deepEqual(raInstances(validateRaMcu(m)).usb,{...RA_USB_DEFAULTS,enabled:true,priority:5,resumePriority:7,callback:'usb_cb',name:'g_basic0'});
 const f=generateRaFiles(validateRaMcu(m));
 const h=f['ra_gen/hal_data.h'],c=f['ra_gen/hal_data.c'];
 for(const inc of ['r_usb_basic.h','r_usb_basic_api.h','r_usb_pcdc_api.h'])assert.ok(h.includes(`#include "${inc}"`),inc);
 assert.match(h,/extern const usb_instance_t g_basic0;/);assert.match(h,/extern usb_instance_ctrl_t g_basic0_ctrl;/);assert.match(h,/extern const usb_cfg_t g_basic0_cfg;/);
 assert.match(h,/extern const usb_descriptor_t g_usb_descriptor;/);assert.match(h,/void usb_cb\(usb_callback_args_t \* p_args\);/);
 for(const line of ['.usb_mode            = USB_MODE_PERI,','.usb_speed           = USB_SPEED_FS,','.type                = USB_CLASS_PCDC,','.p_usb_reg           = (usb_descriptor_t *) &g_usb_descriptor,','.irq                 = VECTOR_NUMBER_USBFS_INT,','.irq_r               = VECTOR_NUMBER_USBFS_RESUME,','.irq_d0              = FSP_INVALID_VECTOR,','.ipl                 = (5),','.ipl_r               = (7),','.ipl_d0              = (BSP_IRQ_DISABLED),','.p_usb_apl_callback  = usb_cb,','.p_transfer_tx       = NULL,','.p_api         = &g_usb_on_usb'])assert.ok(c.includes(line),line);
 assert.match(f['ra_gen/vector_data.c'],/\[\d+\] = usbfs_interrupt_handler, \/\* USBFS INT \(USBFS interrupt\) \*\//);
 const cfg=f['ra_cfg/fsp_cfg/r_usb_basic_cfg.h'];
 for(const line of ['#define USB_CFG_MODE (USB_CFG_PERI)','#define USB_CFG_PCDC_USE','#define USB_CFG_PARAM_CHECKING_ENABLE (BSP_CFG_PARAM_CHECKING_ENABLE)','#define USB_CFG_DMA (USB_CFG_DISABLE)','#define USB_CFG_DTC (USB_CFG_DISABLE)','#define USB_CFG_BC (USB_CFG_DISABLE)','#define USB_CFG_COMPLIANCE (USB_CFG_DISABLE)','#define USB_CFG_REQUEST (USB_CFG_DISABLE)'])assert.ok(cfg.includes(line),line);
 assert.ok(f['ra_cfg/fsp_cfg/r_usb_pcdc_cfg.h'].includes('#define R_USB_PCDC_CFG_H_'));
 const clock=f['ra_gen/bsp_clock_cfg.h'];
 assert.ok(clock.includes('#define BSP_CFG_PLL2_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_HOCO)'));assert.ok(clock.includes('#define BSP_CFG_PLL2_DIV (BSP_CLOCKS_PLL_DIV_2)'));
 assert.ok(clock.includes('#define BSP_CFG_PLL2_MUL BSP_CLOCKS_PLL_MUL(24,0)'));assert.ok(clock.includes('#define BSP_CFG_UCLK_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_PLL2)'));assert.ok(clock.includes('#define BSP_CFG_UCLK_DIV (BSP_CLOCKS_USB_CLOCK_DIV_5)'));
 // Without the callback: NULL and no declaration.
 const plain=generateRaFiles(validateRaMcu(mcu({USB})));assert.ok(plain['ra_gen/hal_data.c'].includes('.p_usb_apl_callback  = NULL,'));assert.ok(!/usb_callback_args_t/.test(plain['ra_gen/hal_data.h']));
});

test('UCLK 48 MHz from every HOCO: PLL2 input 8-24 MHz, output 120-240 MHz, a divider bsp_clocks.c has',()=>{
 for(const hoco of [16,18,20]){
  const u=raUsbClock(hoco),input=hoco/u.pllDiv;
  assert.ok(input>=8&&input<=24,`${hoco}: input ${input}`);assert.ok(u.pllMHz>=120&&u.pllMHz<=240,`${hoco}: ${u.pllMHz}`);
  assert.equal(u.pllMHz,input*u.pllMul);assert.equal(u.pllMHz/u.usbDiv,48);assert.ok([1,2,3,4,5,6,8,10,16].includes(u.usbDiv));
 }
 assert.deepEqual([16,18,20].map(h=>{const u=raUsbClock(h);return [u.pllDiv,u.pllMul,u.usbDiv];}),[[2,30,5],[2,16,3],[2,24,5]]);
 const f=generateRaFiles(validateRaMcu({...mcu({USB}),clock:{hocoMHz:18,pllDiv:2,pllMul:20}}))['ra_gen/bsp_clock_cfg.h'];
 assert.ok(f.includes('BSP_CLOCKS_PLL_MUL(16,0) /* PLL2 Mul x16.0 */'));assert.ok(f.includes('#define BSP_CFG_UCLK_DIV (BSP_CLOCKS_USB_CLOCK_DIV_3)'));
});

test('without the USB stack the generated files are as before (no USB header, PLL2 and UCLK off); a disabled stack is none',()=>{
 for(const m of [raDefaultMcu(),raExample('ra_uart_echo').mcu()]){
  const f=generateRaFiles(validateRaMcu(m)),off=generateRaFiles(validateRaMcu({...m,peripherals:{...(m.peripherals||{}),USB:{enabled:false}}}));
  assert.deepEqual(off,f);
  assert.ok(!Object.keys(f).some(k=>/usb/.test(k)));assert.ok(!/usb/i.test(f['ra_gen/hal_data.h']+f['ra_gen/hal_data.c']+f['ra_gen/vector_data.h']));
  const clock=f['ra_gen/bsp_clock_cfg.h'];
  for(const line of ['#define BSP_CFG_PLL2_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* PLL2 Disabled */','#define BSP_CFG_PLL2_DIV (BSP_CLOCKS_PLL_DIV_2) /* PLL2 Div /2 */','#define BSP_CFG_PLL2_MUL BSP_CLOCKS_PLL_MUL(20,0) /* PLL2 Mul x20.0 */','#define BSP_CFG_UCLK_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* UCLK Disabled */','#define BSP_CFG_UCLK_DIV (BSP_CLOCKS_USB_CLOCK_DIV_5) /* UCLK Div /5 */'])assert.ok(clock.includes(line),line);
 }
});

// A USBFS model with a scheduler of its own (as the SoC gives it time and events).
function bench(){
 const events=[],raised=[],soc={t:0,stopped:false,mstp:{peek:()=>soc.stopped?1<<11:0},nowUs:()=>soc.t,after:(us,fn)=>events.push({at:soc.t+us,fn}),raiseEvent:ev=>raised.push(ev)};
 const dev=new UsbFs(soc);
 const run=us=>{const end=soc.t+us;for(;;){events.sort((a,b)=>a.at-b.at);const e=events[0];if(!e||e.at>end)break;events.shift();soc.t=e.at;e.fn();}soc.t=end;};
 return {dev,soc,raised,run};
}
const W=(d,off,v,size=2)=>d.write(off,v,size),R=(d,off,size=2)=>d.read(off,size);

test('USBFS registers: what the driver writes reads back, status bits clear by writing 0, the module does nothing in module stop',()=>{
 const {dev,soc,raised}=bench();
 W(dev,0x00,0x0400);assert.equal(R(dev,0x00),0x0400,'SYSCFG.SCKE');
 W(dev,0x20,0x8000|0x0400|0x20|3);assert.equal(R(dev,0x20),0x8000|0x0400|0x20|3,'CFIFOSEL: RCNT, MBW, ISEL, CURPIPE');
 // VBUS since power-on: VBSTS and the VBINT it latched; INTSTS0 bits clear by 0 and stay by 1.
 assert.equal(R(dev,0x40)&0x8080,0x8080);W(dev,0x40,0xffff);assert.equal(R(dev,0x40)&0x8000,0x8000);W(dev,0x40,~0x8000&0xffff);assert.equal(R(dev,0x40)&0x8080,0x0080);
 // An enabled status raises USBFS_INT (a level: again after each write while it stands).
 W(dev,0x40,0xffff);assert.deepEqual(raised,[]);dev.setLatched(0x1000);W(dev,0x30,0x1000);assert.ok(raised.length>=1&&raised.every(e=>e===USBFS_EVENT.INT));
 const n=raised.length;W(dev,0x40,~0x1000&0xffff);assert.equal(raised.length,n,'cleared: no more requests');
 // Pipe window: PIPESEL selects what PIPECFG / PIPEMAXP show.
 W(dev,0x64,1);W(dev,0x68,0x4000|0x0200|0x0010|1);W(dev,0x6c,64);W(dev,0x64,2);W(dev,0x68,0x4000|0x0200|0x0080|2);W(dev,0x6c,64);
 W(dev,0x64,1);assert.equal(R(dev,0x68),0x4211);assert.equal(R(dev,0x6c),64);W(dev,0x64,2);assert.equal(R(dev,0x68),0x4282);
 // Transaction counter registers of pipes 1-5, the other bytes of the block keep what is written (DPUSR0R_FS).
 W(dev,0x92,3);assert.equal(R(dev,0x92),3);W(dev,0x400,0x12345678,4);assert.equal(R(dev,0x400,4),0x12345678);
 soc.stopped=true;assert.equal(R(dev,0x00),0);W(dev,0x00,0);soc.stopped=false;assert.equal(R(dev,0x00),0x0400);
});

test('USBFS FIFO: a transmit pipe takes bytes until MXPS or BVAL (two buffers with DBLB), the PC takes them; a receive pipe gives a packet, BRDY / BEMP as they fill and empty',()=>{
 const {dev}=bench();
 W(dev,0x64,1);W(dev,0x68,0x4000|0x0200|0x0010|1);W(dev,0x6c,4);W(dev,0x64,2);W(dev,0x68,0x4000|0x0200|0x0080|2);W(dev,0x6c,4);W(dev,0x64,0);
 W(dev,0x36,0x06);W(dev,0x3a,0x06);
 // Pipe 1 (IN): FRDY, 16-bit and 8-bit writes; 4 bytes end a packet, the other buffer can be written at once.
 W(dev,0x20,1);assert.equal(R(dev,0x22)&0x2000,0x2000);
 W(dev,0x14,0x6261);W(dev,0x14,0x6463);assert.equal(R(dev,0x70)&0x4000,0x4000,'INBUFM');
 W(dev,0x14,0x65,1);W(dev,0x22,0x8000);assert.equal(R(dev,0x22)&0x2000,0,'both buffers full');
 const p1=dev.pipes[1];assert.equal(dev.inPacket(p1),null,'PID NAK');W(dev,0x70,1);
 assert.deepEqual(dev.inPacket(p1),[0x61,0x62,0x63,0x64]);assert.deepEqual(dev.inPacket(p1),[0x65]);assert.equal(dev.inPacket(p1),null);
 assert.equal(R(dev,0x4a)&2,2,'BEMP: all went out');assert.equal(R(dev,0x70)&0x4000,0);
 // Pipe 2 (OUT): the PC's packets fill the buffers; a short one sets PID to NAK (SHTNAK); DTLN and 16-bit reads.
 W(dev,0x72,1);assert.equal(dev.outPacket(dev.pipes[2],[1,2,3,4]),true);assert.equal(dev.outPacket(dev.pipes[2],[5]),true);assert.equal(R(dev,0x72)&3,0,'short packet: NAK');
 assert.equal(dev.outPacket(dev.pipes[2],[6]),null);
 W(dev,0x46,0);W(dev,0x20,2);assert.equal(R(dev,0x22),0x2000|4);assert.equal(R(dev,0x14),0x0201);assert.equal(R(dev,0x14),0x0403);
 assert.equal(R(dev,0x46)&4,4,'the next packet is ready (BRDY again)');assert.equal(R(dev,0x22),0x2000|1);assert.equal(R(dev,0x14),5);assert.equal(R(dev,0x22)&0x2000,0);
 // ACLRM empties a pipe.
 W(dev,0x72,1);dev.outPacket(dev.pipes[2],[9,9]);W(dev,0x72,0x200);W(dev,0x72,0);assert.equal(R(dev,0x22)&0x2000,0);
});

test('the PC enumerates in order once the pull-up is on: bus reset, then each control transfer through its stages (SETUP, data, status) as the device answers',()=>{
 const {dev,run}=bench();
 W(dev,0x00,0x0401);W(dev,0x30,0x9d00);run(5000);assert.deepEqual(dev.host.events,[],'no pull-up, no reset');
 W(dev,0x00,0x0411);run(1500);assert.deepEqual(dev.host.events,['RESET']);assert.equal(dev.dvsq,1);assert.equal(R(dev,0x08)&7,2,'RHST: Full-Speed');
 run(10000);assert.deepEqual(dev.host.events,['RESET','GET_DESCRIPTOR(Device, 18)']);
 assert.equal(R(dev,0x40)&0x0f,0x08|1,'VALID and CTSQ 1 (control read data stage)');assert.deepEqual([0x54,0x56,0x58,0x5a].map(o=>R(dev,o)),[0x0680,0x0100,0,18]);
 // The device answers: 18 bytes into the DCP buffer (ISEL), PID BUF; the PC takes them and goes to the status stage.
 const device=[18,1,0,2,2,2,0,64,0,0,2,0,0,2,1,2,6,1];
 W(dev,0x20,0x20);for(let i=0;i<18;i+=2)W(dev,0x14,device[i]|(device[i+1]<<8));W(dev,0x22,0x8000);W(dev,0x60,1);run(100);
 assert.equal(R(dev,0x40)&7,2,'CTSQ 2: status stage');W(dev,0x60,R(dev,0x60)|4);run(100);assert.equal(R(dev,0x40)&7,0,'CCPL ends it');
 // SET_ADDRESS is the hardware's (assumed): USBADDR and the Address state, then the next request 1 ms later.
 run(1100);assert.equal(dev.host.events.at(-1),'SET_ADDRESS(1)');assert.equal(R(dev,0x50),1,'USBADDR');assert.equal(dev.dvsq,2,'Address state');
 run(1000);assert.equal(dev.host.events.at(-1),'GET_DESCRIPTOR(Device, 18)');
 // A STALL stops the PC.
 W(dev,0x60,2);run(100);assert.equal(dev.host.state,'stalled');assert.equal(dev.host.events.at(-1),'STALL');
 // The pull-up off: the device left; on again: a new enumeration.
 W(dev,0x00,0x0401);assert.equal(dev.host.state,'detached');W(dev,0x00,0x0411);run(1500);assert.equal(dev.host.events.at(-1),'RESET');
 assert.deepEqual(USB_HOST_LINE_CODING,[0x00,0xc2,0x01,0x00,0x00,0x00,0x08]);
});

// The built-in interpreter's R_USB_* with the USB stack and the template's descriptors.
function interp(code,usb={enabled:true}){
 const base=projectForBoard('fpb-ra6e1'),m=raDefaultMcu();m.peripherals={USB:usb};
 const warn=[],project=validateProject({...base,mcu:m,code:'#include "hal_data.h"\n'+code+'\nvoid external_irq1_callback(external_irq_callback_args_t *p_args){(void)p_args;}\n',firmware:{...base.firmware,files:[{name:RA_USB_DESCRIPTOR_FILE,text:RA_USB_DESCRIPTOR_C}]}});
 const session=new SimulationSession(project,{warn:w=>warn.push(w)});
 return {session,warn,run:ms=>{for(let t=Math.floor(session.time)+1;t<=ms;t++)session.tick(t);}};
}

test('interpreter: R_USB_* return codes before Open and before the PC configured the device, then the events in the driver\'s order',()=>{
 const {session,warn,run}=interp(`
volatile int32_t e[8];
volatile int32_t ev[8];
volatile int32_t nev = 0;
static uint8_t buf[7];
void hal_entry(void)
{
    usb_status_t event;
    e[0] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, 4, USB_CLASS_PCDC);
    e[1] = (int32_t) R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    e[2] = (int32_t) R_USB_Open(&g_basic0_ctrl, &g_basic0_cfg);
    e[3] = (int32_t) R_USB_Write(&g_basic0_ctrl, buf, 1, USB_CLASS_PCDC);
    e[4] = (int32_t) R_USB_Read(&g_basic0_ctrl, buf, 4, USB_CLASS_PCDCC);
    while (1)
    {
        R_USB_EventGet(&g_basic0_ctrl, &event);
        if ((USB_STATUS_NONE != event) && (nev < 8))
        {
            ev[nev++] = (int32_t) event;
        }
        if ((USB_STATUS_REQUEST == event) && (USB_PCDC_SET_LINE_CODING == (g_basic0_ctrl.setup.request_type & USB_BREQUEST)))
        {
            R_USB_PeriControlDataGet(&g_basic0_ctrl, buf, 7);
        }
    }
}`);
 run(60);
 assert.deepEqual([0,1,2,3,4].map(i=>session.readVariable(`e[${i}]`)),[1506,0,1501,1500,1506]);
 // DEFAULT, CONFIGURED, REQUEST + REQUEST_COMPLETE (SET_LINE_CODING), REQUEST (SET_CONTROL_LINE_STATE: no data stage).
 assert.deepEqual(Array.from({length:session.readVariable('nev')},(_,i)=>session.readVariable(`ev[${i}]`)),[1,3,7,8,7]);
 assert.deepEqual([0,1,2,3,4,5,6].map(i=>session.readVariable(`buf[${i}]`)),[0x00,0xc2,0x01,0x00,0x00,0x00,0x08]);
 assert.deepEqual(session.hal.usbFs.host.events,['RESET','GET_DESCRIPTOR(Device, 18)','SET_ADDRESS(1)','GET_DESCRIPTOR(Device, 18)','GET_DESCRIPTOR(Configuration, 9)','GET_DESCRIPTOR(Configuration, 67)','SET_CONFIGURATION','SET_LINE_CODING','SET_CONTROL_LINE_STATE']);
 assert.deepEqual(warn,[]);
});

test('interpreter: the USB echo example, and R_USB_* without the USB stack is an unsupported API',()=>{
 const e=raExample('ra_usb_cdc_echo'),base=projectForBoard('fpb-ra6e1');
 const session=new SimulationSession(validateProject({...base,mcu:e.mcu(),code:e.code,firmware:{...base.firmware,files:e.files()}}));
 for(let t=1;t<=60;t++)session.tick(t);
 assert.ok(session.runtime.gpio.P408.value>1.65,'LED1: configured');
 assert.equal(session.inject('Hello','usb:pcdc'),5);for(let t=61;t<=80;t++)session.tick(t);
 assert.equal(String.fromCharCode(...session.usbOutput),'Hello');assert.equal(session.readVariable('g_received'),5);
 const plain=new SimulationSession(validateProject({...base,code:'#include "hal_data.h"\nvoid hal_entry(void)\n{\n    R_USB_Open(0, 0);\n}\nvoid external_irq1_callback(external_irq_callback_args_t *p_args){(void)p_args;}\n'}));
 assert.throws(()=>{for(let t=1;t<=5;t++)plain.tick(t);},/지원하지 않는 FSP API: R_USB_Open/);
 assert.equal(plain.inject('x','usb:pcdc'),0);assert.deepEqual(plain.usbOutput,[]);
});

test('the descriptor source: added to the project with the stack when it has none, kept when it has one, the example brings it; Developer Assistance lists R_USB',()=>{
 const p={firmware:{mode:'fsp',files:[{name:'app.c',text:'int x;'}]}};
 assert.equal(addUsbDescriptor(p),true);assert.deepEqual(p.firmware.files.map(f=>f.name),['app.c',RA_USB_DESCRIPTOR_FILE]);assert.equal(p.firmware.files[1].text,RA_USB_DESCRIPTOR_C);
 const own={firmware:{mode:'fsp',files:[{name:'usb/r_usb_pcdc_descriptor.c',text:'/* mine */'}]}};
 assert.equal(addUsbDescriptor(own),false);assert.deepEqual(own.firmware.files,[{name:'usb/r_usb_pcdc_descriptor.c',text:'/* mine */'}]);
 assert.ok(RA_USB_DESCRIPTOR_C.includes('const usb_descriptor_t g_usb_descriptor ='));assert.ok(RA_USB_DESCRIPTOR_C.startsWith('/* ${REA_DISCLAIMER_PLACEHOLDER} */'));
 assert.deepEqual(raExample('ra_usb_cdc_echo').files().map(f=>f.name),[RA_USB_DESCRIPTOR_FILE]);
 const a=raAssistance(validateRaMcu(mcu({USB:{enabled:true,callback:'usb_cb'}}))).find(x=>x.name==='g_basic0');
 assert.deepEqual(a.items.map(i=>i.label),['Call R_USB_Open()','Call R_USB_EventGet()','Call R_USB_Read()','Call R_USB_Write()','Call R_USB_PeriControlDataGet()','Call R_USB_PeriControlDataSet()','Call R_USB_PeriControlStatusSet()','Call R_USB_Close()','Callback function definition']);
 assert.match(a.items.at(-1).code,/void usb_cb\(usb_callback_args_t \*p_args\)/);
 assert.equal(raAssistance(validateRaMcu(mcu({USB}))).find(x=>x.name==='g_basic0').items.length,8);
});
