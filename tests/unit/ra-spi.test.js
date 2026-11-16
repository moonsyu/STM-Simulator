// Feature 32: SPI masters of the FPB-RA6E1 — r_spi on RSPI1 (Arduino D10-D13 / P410-P413) and r_sci_spi on SCI9 (simple
// SPI): settings and their checks, the code RASC generates for them, and the emulator models driven the way FSP drives them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {raUartChannels,raDefaultMcu,validateRaMcu,raPsel,raSpiBitrate,raSciSpiBitrate,raNameProblem,RA_PERIPHERAL_PINS,RA6E1_PORTS} from '../../src/ra-config.js';
import {generateRaFiles,raVectors} from '../../src/ra-generator.js';
import {raAssistance} from '../../src/ra-assistance.js';

const spiMcu=(over={},pins={P100:'SPI1_MISO',P101:'SPI1_MOSI',P102:'SPI1_RSPCK',P103:'SPI1_SSL0'})=>{const m=raDefaultMcu();for(const [pin,signal]of Object.entries(pins))m.pins[pin]={function:'Peripheral',signal};m.peripherals={SPI1:{enabled:true,...over}};return m;};
const sciSpiMcu=(over={})=>{const m=raDefaultMcu();Object.assign(m.pins,{P109:{function:'Peripheral',signal:'SCI9_TXD'},P110:{function:'Peripheral',signal:'SCI9_RXD'},P111:{function:'Peripheral',signal:'SCI9_SCK'},P112:{function:'GPIO_Output',initial:1,label:'SPI_CS'}});m.peripherals={SCI9:{enabled:true,mode:'SPI',...over}};return m;};

test('SPI pins: SPI1 groups A (D10-D13) and B (P410-P413) with PSEL SPI, SCI9_SCK on P111; no SPI0',()=>{
 assert.deepEqual([RA_PERIPHERAL_PINS.SPI1_MISO,RA_PERIPHERAL_PINS.SPI1_MOSI,RA_PERIPHERAL_PINS.SPI1_RSPCK,RA_PERIPHERAL_PINS.SPI1_SSL0],[['P100','P410'],['P101','P411'],['P102','P412'],['P103','P413']]);
 assert.ok(['P412','P413','P111'].every(p=>RA6E1_PORTS.includes(p)));
 assert.equal(raPsel('SPI1_RSPCK'),6);assert.equal(raPsel('SCI9_SCK'),5);
 assert.ok(!Object.keys(RA_PERIPHERAL_PINS).some(s=>s.startsWith('SPI0_')),'SPI0 pins are not confirmed');
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),peripherals:{SPI0:{enabled:false}}}),/SPI0의 핀은 아직 확인하지 못해/);
 assert.match(raNameProblem('g_spi1_ctrl'),/인스턴스/);assert.match(raNameProblem('g_sci_spi9_cfg_extend'),/인스턴스/);assert.equal(raNameProblem('spi1_callback'),'');
});

test('RSPI bit rate as R_SPI_CalculateBitrate: PCLKA / (2 x (SPBR + 1) x 2^BRDV), never faster than asked',()=>{
 assert.deepEqual(raSpiBitrate(100e6,1e6),{spbr:49,brdv:0,actual:1e6});
 assert.deepEqual(raSpiBitrate(100e6,500000),{spbr:99,brdv:0,actual:500000});
 assert.deepEqual(raSpiBitrate(100e6,50e6),{spbr:0,brdv:0,actual:50e6});
 assert.equal(raSpiBitrate(100e6,25000).brdv,3);assert.ok(raSpiBitrate(100e6,25000).actual<=25000);
 assert.ok(raSpiBitrate(100e6,3e6).actual<=3e6);
 assert.throws(()=>raSpiBitrate(100e6,20000),/최저 24415 bps/);
 // SCI clock synchronous: PCLKA / (4 x 4^CKS x (BRR + 1)), as R_SCI_SPI_CalculateBitrate without MDDR.
 assert.deepEqual(raSciSpiBitrate(100e6,1e6),{cks:0,brr:24,actual:1e6});
 assert.deepEqual(raSciSpiBitrate(100e6,10000),{cks:2,brr:156,actual:100e6/(64*157)});
 assert.throws(()=>raSciSpiBitrate(100e6,1000),/최저 1526 bps/);
});

test('SPI1 settings: defaults, SSL0 or 3-wire, bit rate range, the pins it needs',()=>{
 const v=validateRaMcu(spiMcu());
 assert.deepEqual(v.peripherals.SPI1,{enabled:true,bitrate:1000000,cpol:0,cpha:0,bitOrder:'MSB',ssl:'SSL0',callback:'spi1_callback',priority:12});
 assert.equal(validateRaMcu(spiMcu({},{P100:'SPI1_MISO',P101:'SPI1_MOSI',P102:'SPI1_RSPCK'})).peripherals.SPI1.ssl,'NONE','no SSL0 pin: CS from a GPIO');
 assert.throws(()=>validateRaMcu(spiMcu({ssl:'SSL0'},{P100:'SPI1_MISO',P101:'SPI1_MOSI',P102:'SPI1_RSPCK'})),/SSL0 핀\(P103 또는 P413\)을 정하세요/);
 assert.throws(()=>validateRaMcu(spiMcu({ssl:'NONE'})),/P103: SSL0 핀을 쓰려면/);
 assert.throws(()=>validateRaMcu(spiMcu({},{P101:'SPI1_MOSI',P103:'SPI1_SSL0'})),/RSPCK 핀과 MOSI 또는 MISO/);
 assert.throws(()=>validateRaMcu(spiMcu({bitrate:60e6})),/PCLKA\/2\(50000000 bps\)/);
 assert.throws(()=>validateRaMcu(spiMcu({bitrate:20000})),/만들 수 없는 속도/);
 assert.throws(()=>validateRaMcu(spiMcu({cpol:2})),/Clock Polarity/);
 assert.throws(()=>validateRaMcu(spiMcu({bitOrder:'msb'})),/Bit Order/);
 assert.throws(()=>validateRaMcu(spiMcu({callback:''})),/콜백 이름/);
 assert.throws(()=>validateRaMcu(spiMcu({priority:16})),/0~15/);
 // A pin set to SPI1 needs the stack on.
 assert.throws(()=>validateRaMcu({...spiMcu(),peripherals:{}}),/SPI1를 켜야/);
 // Pin group B works the same.
 assert.equal(validateRaMcu(spiMcu({},{P410:'SPI1_MISO',P411:'SPI1_MOSI',P412:'SPI1_RSPCK',P413:'SPI1_SSL0'})).peripherals.SPI1.ssl,'SSL0');
});

test('SCI9 simple SPI: mode SPI with SCK, its own callback and bit rate; SCK only in SPI mode; UART projects unchanged',()=>{
 const v=validateRaMcu(sciSpiMcu());
 assert.deepEqual(v.peripherals.SCI9,{enabled:true,mode:'SPI',bitrate:1000000,cpol:0,cpha:0,bitOrder:'MSB',callback:'sci_spi9_callback',priority:12});
 assert.throws(()=>validateRaMcu(sciSpiMcu({mode:'UART'})),/SCI9_SCK는 Simple SPI\(r_sci_spi\) 모드/);
 assert.throws(()=>validateRaMcu(sciSpiMcu({mode:'I2C'})),/UART 또는 Simple SPI/);
 assert.throws(()=>validateRaMcu(sciSpiMcu({bitrate:30e6})),/PCLKA\/4/);
 const noSck=sciSpiMcu();delete noSck.pins.P111;assert.throws(()=>validateRaMcu(noSck),/SCK 핀과 TXD\(MOSI\)/);
 const other=raDefaultMcu();other.pins.P101={function:'Peripheral',signal:'SCI0_TXD'};other.peripherals={SCI0:{enabled:true,mode:'SPI'}};
 assert.throws(()=>validateRaMcu(other),/SCK 핀이 있는 SCI9/);
 const uart=raDefaultMcu();uart.pins.P109={function:'Peripheral',signal:'SCI9_TXD'};uart.peripherals={SCI9:{enabled:true,baud:9600}};
 assert.deepEqual(validateRaMcu(uart).peripherals.SCI9,{enabled:true,baud:9600,callback:'user_uart9_callback',priority:12},'no mode key for a UART');
});

test('generated r_spi: g_spi1 with spi_extended_cfg_t (SPBR/BRDV, SSL0 or clock synchronous), four vectors after the others, PSEL SPI pins',()=>{
 const raw=spiMcu({bitrate:500000,cpol:1,cpha:1,bitOrder:'LSB',priority:5});raw.pins.P109={function:'Peripheral',signal:'SCI9_TXD'};
 raw.peripherals.SCI9={enabled:true,baud:115200,callback:'user_uart9_callback',priority:12};
 const m=validateRaMcu(raw),files=generateRaFiles(m),c=files['ra_gen/hal_data.c'],h=files['ra_gen/hal_data.h'];
 assert.ok(h.includes('#include "r_spi.h"\n')&&h.includes('#include "r_spi_api.h"\n')&&!h.includes('r_sci_spi.h'));
 assert.ok(h.includes('extern const spi_instance_t g_spi1;')&&h.includes('extern spi_instance_ctrl_t g_spi1_ctrl;')&&h.includes('void spi1_callback(spi_callback_args_t * p_args);'));
 for(const s of ['const spi_extended_cfg_t g_spi1_ext_cfg =','.spi_clksyn          = SPI_SSL_MODE_SPI,','.ssl_select          = SPI_SSL_SELECT_SSL0,','/* Actual calculated bitrate: 500000. */ .spbr = 99, .brdv = 0',
  '.burst_interframe_delay = SPI_BURST_TRANSFER_WITH_DELAY,','.channel             = 1,','.rxi_irq             = VECTOR_NUMBER_SPI1_RXI,','.tei_ipl             = (5),','.operating_mode      = SPI_MODE_MASTER,',
  '.clk_phase           = SPI_CLK_PHASE_EDGE_EVEN,','.clk_polarity        = SPI_CLK_POLARITY_HIGH,','.bit_order           = SPI_BIT_ORDER_LSB_FIRST,','.p_callback          = spi1_callback,','.p_extend            = (void *) &g_spi1_ext_cfg,','.p_api         = &g_spi_on_spi'])assert.ok(c.includes(s),s);
 // UART vectors and IRQ1 keep their numbers; SPI1 comes after them.
 assert.deepEqual(raVectors(m).map(v=>`${v.index}:${v.vector}:${v.isr}`),['0:SCI9_RXI:sci_uart_rxi_isr','1:SCI9_TXI:sci_uart_txi_isr','2:SCI9_TEI:sci_uart_tei_isr','3:SCI9_ERI:sci_uart_eri_isr','4:ICU_IRQ1:r_icu_isr','5:SPI1_RXI:spi_rxi_isr','6:SPI1_TXI:spi_txi_isr','7:SPI1_TEI:spi_tei_isr','8:SPI1_ERI:spi_eri_isr']);
 assert.ok(files['ra_gen/vector_data.c'].includes('[7] = BSP_PRV_VECT_ENUM(EVENT_SPI1_TEI,GROUP7), /* SPI1 TEI (Transmission complete event) */'));
 assert.ok(files['ra_gen/pin_data.c'].includes('.pin = BSP_IO_PORT_01_PIN_02,\n        .pin_cfg = ((uint32_t) (uint32_t) IOPORT_CFG_DRIVE_HIGH | (uint32_t) IOPORT_CFG_PERIPHERAL_PIN | (uint32_t) IOPORT_PERIPHERAL_SPI)'));
 assert.ok(files['ra_cfg/fsp_cfg/r_spi_cfg.h'].includes('#define SPI_TRANSMIT_FROM_RXI_ISR (0)')&&files['ra_cfg/fsp_cfg/r_spi_cfg.h'].includes('#define SPI_DMA_SUPPORT_ENABLE (0)'));
 // Without an SSL0 pin: 3-wire.
 assert.ok(generateRaFiles(validateRaMcu(spiMcu({},{P100:'SPI1_MISO',P101:'SPI1_MOSI',P102:'SPI1_RSPCK'})))['ra_gen/hal_data.c'].includes('.spi_clksyn          = SPI_SSL_MODE_CLK_SYN,'));
});

test('generated r_sci_spi: g_sci_spi9 instead of g_uart9, sci_spi_*_isr on the SCI9 events, CKS/BRR, r_sci_spi_cfg.h',()=>{
 const m=validateRaMcu(sciSpiMcu({bitrate:2000000,cpha:1})),files=generateRaFiles(m),c=files['ra_gen/hal_data.c'],h=files['ra_gen/hal_data.h'];
 assert.ok(h.includes('#include "r_sci_spi.h"\n')&&!h.includes('r_sci_uart.h')&&!c.includes('g_uart9'));
 assert.ok(h.includes('extern sci_spi_instance_ctrl_t g_sci_spi9_ctrl;')&&h.includes('void sci_spi9_callback(spi_callback_args_t * p_args);'));
 for(const s of ['const sci_spi_extended_cfg_t g_sci_spi9_cfg_extend =','/* Actual calculated bitrate: 1923077. */ .cks = 0, .brr = 12, .mddr = 0,','.channel             = 9,','.clk_phase           = SPI_CLK_PHASE_EDGE_EVEN,','.p_extend            = (void *) &g_sci_spi9_cfg_extend,','.p_api         = &g_spi_on_sci','.rxi_irq             = VECTOR_NUMBER_SCI9_RXI,'])assert.ok(c.includes(s),s);
 assert.deepEqual(raVectors(m).map(v=>`${v.vector}:${v.isr}`),['ICU_IRQ1:r_icu_isr','SCI9_RXI:sci_spi_rxi_isr','SCI9_TXI:sci_spi_txi_isr','SCI9_TEI:sci_spi_tei_isr','SCI9_ERI:sci_spi_eri_isr']);
 assert.ok(files['ra_gen/pin_data.c'].includes('IOPORT_PERIPHERAL_SCI1_3_5_7_9'));
 assert.ok(files['ra_cfg/fsp_cfg/r_sci_spi_cfg.h'].includes('#define SCI_SPI_DTC_SUPPORT_ENABLE (0)'));
});

test('Developer Assistance: g_spi1 and g_sci_spi9 with Open/Write/Read/WriteRead/Close and the SPI_EVENT_TRANSFER_COMPLETE callback',()=>{
 const g=raAssistance(validateRaMcu(spiMcu())),spi=g.find(x=>x.name==='g_spi1');
 assert.deepEqual(spi.items.map(i=>i.label),['Call R_SPI_Open()','Call R_SPI_Write()','Call R_SPI_Read()','Call R_SPI_WriteRead()','Call R_SPI_Close()','Callback function definition']);
 assert.equal(spi.items[0].code,'R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);');
 assert.match(spi.items[3].code,/R_SPI_WriteRead\(&g_spi1_ctrl, tx, rx, sizeof\(tx\), SPI_BIT_WIDTH_8_BITS\);/);
 assert.match(spi.items[5].code,/^void spi1_callback\(spi_callback_args_t \*p_args\)\n\{\n    if \(SPI_EVENT_TRANSFER_COMPLETE == p_args->event\)/);
 const s=raAssistance(validateRaMcu(sciSpiMcu()));
 assert.ok(!s.some(x=>x.name==='g_uart9'));
 assert.equal(s.find(x=>x.name==='g_sci_spi9').items[1].code.split('\n')[1],'R_SCI_SPI_Write(&g_sci_spi9_ctrl, tx, sizeof(tx), SPI_BIT_WIDTH_8_BITS);');
});

// A fake SoC: events, scheduled callbacks run in time order, pins of each signal, and SPI parts that answer ~byte.
function fakeSoc(){
 let now=0;const queue=[],events=[],bytes=[],changed=[];
 const pins={SPI1_RSPCK:['P102'],SPI1_MOSI:['P101'],SPI1_MISO:['P100'],SPI1_SSL0:['P103'],SCI9_SCK:['P111'],SCI9_TXD:['P109'],SCI9_RXD:['P110']};
 const line=()=>({push(){},end:0});
 const soc={clock:{pclka:100e6},nowUs:()=>now,sync(){},listens(e){return this.icu.linked?.(e)??false;},raiseEvent(e){this.icu.raise(e);},icu:{raise:e=>events.push(e)},routedPins:s=>pins[s]||[],peripheralChanged:n=>changed.push(n),
  after:(us,fn)=>{const e={t:now+us,fn,cancel(){e.dead=true;}};queue.push(e);return e;},atUs:(t,fn)=>soc.after(t-now,fn),
  spiTransfer:(name,p,byte,cfg)=>{bytes.push({name,byte,sck:p.sck,mosi:p.mosi,miso:p.miso,cpol:cfg.cpol,cpha:cfg.cpha});return ~byte&0xff;},
  signals:{receivers:new Set(),line,channel(){},annotate(){},uartFrame:(l,t)=>t}};
 const run=(until=Infinity)=>{for(;;){const e=queue.filter(x=>!x.dead&&!x.done&&x.t<=until).sort((a,b)=>a.t-b.t)[0];if(!e)return;e.done=true;now=e.t;e.fn();}};
 return {soc,events,bytes,changed,run,get now(){return now;}};
}

test('RSPI model: TXI when SPE and SPTIE are set, SPDR to the shift register, RXI per frame, CENDF/TEI at the end; SSL0 kept until SPE = 0',async()=>{
 const {Rspi,SPI_EVENT_BASE}=await import('../../src/emu/ra6e1/spi.js');
 const f=fakeSoc(),t=new Rspi(f.soc,1),ev=()=>f.events.splice(0).map(e=>e-SPI_EVENT_BASE[1]);
 // R_SPI_Open: SPSR read and cleared, SPCR without SPE, SPBR 49, SPCMD0 SSLKP, SPCR3 CENDIE.
 t.read(0x03,1);t.write(0x03,0,1);assert.equal(t.read(0x03,1)&0x20,0x20,'SPTEF stays (written 0 does not clear it)');
 t.write(0x00,0xb8,1);t.write(0x01,0,1);t.write(0x0a,49,1);t.write(0x10,0xe080,2);t.write(0x21,0x10,1);
 assert.deepEqual(ev(),[]);assert.equal(t.hz(),1e6);
 // R_SPI_Write of two bytes: frame length 8 bits (SPB 7), then SPCR |= SPTIE | SPE → TXI.
 t.write(0x0b,0x40,1);t.write(0x10,0xe780,2);t.write(0x00,0xf8,1);assert.deepEqual(ev(),[1]);
 assert.deepEqual(t.output('SSL0'),{level:1},'SSL0 idle (active low)');
 t.write(0x04,0x02,1);assert.deepEqual(ev(),[1],'the byte moved on: TXI again');assert.ok(t.read(0x03,1)&0x02,'IDLNF while shifting');
 assert.deepEqual(t.output('SSL0'),{level:0},'SSL0 asserted');assert.deepEqual(f.bytes.map(b=>b.byte),[0x02]);
 assert.deepEqual(f.bytes[0],{name:'SPI1',byte:2,sck:'P102',mosi:'P101',miso:'P100',cpol:0,cpha:0});
 t.write(0x04,0x10,1);assert.equal(t.read(0x03,1)&0x20,0,'buffer full');
 f.run(8);assert.deepEqual(ev(),[0,1],'RXI for frame 1, TXI as frame 2 starts');assert.equal(t.read(0x04,1),0xfd);
 assert.equal(t.read(0x03,1)&0x80,0,'SPRF cleared by reading SPDR');
 f.run();assert.deepEqual(ev(),[0,4],'RXI, then TEI (communication end)');assert.equal(t.read(0x04,1),0xef);
 const sr=t.read(0x03,1);assert.equal(sr&0x02,0,'idle');assert.ok(sr&0x40,'CENDF');
 assert.deepEqual(t.output('SSL0'),{level:0},'SSLKP keeps SSL0 asserted until SPE is cleared');
 t.write(0x00,0xb8,1);assert.deepEqual(t.output('SSL0'),{level:1});assert.ok(f.changed.includes('SPI1'));
 // An unread frame: OVRF and ERI.
 t.write(0x00,0xf8,1);ev();t.write(0x04,1,1);f.run();t.write(0x04,2,1);f.run();assert.ok(t.read(0x03,1)&0x01,'OVRF');assert.ok(ev().includes(3),'ERI');
 // 16-bit frames: two bytes, MSB first; 32-bit (SPB 3) four bytes; LSB first reverses the bits on the wire.
 t.write(0x00,0xb8,1);t.read(0x04,1);t.write(0x03,0,1);assert.equal(t.read(0x03,1)&0x81,0,'SPRF read, OVRF written 0');f.bytes.length=0;t.write(0x10,0xef80,2);t.write(0x00,0xf8,1);t.write(0x04,0x1234,2);f.run();
 assert.deepEqual(f.bytes.map(b=>b.byte),[0x12,0x34]);assert.equal(t.read(0x04,2),0xedcb);
 t.write(0x00,0xb8,1);f.bytes.length=0;t.write(0x10,0xe380,2);t.write(0x00,0xf8,1);t.write(0x04,0x01020304,4);f.run();
 assert.deepEqual(f.bytes.map(b=>b.byte),[1,2,3,4]);assert.equal(t.read(0x04,4),0xfefdfcfb);
 t.write(0x00,0xb8,1);f.bytes.length=0;t.write(0x10,0xf780,2);t.write(0x00,0xf8,1);t.write(0x04,0x01,1);f.run();
 assert.deepEqual(f.bytes.map(b=>b.byte),[0x80],'LSB first');assert.equal(t.read(0x04,1),0xfe);
 // 3-wire (SPMS = 1): no SSL0 output; RSPCK idles at CPOL.
 t.write(0x00,0xb9,1);t.write(0x10,0xe782,2);assert.equal(t.output('SSL0'),null);assert.deepEqual(t.output('RSPCK'),{level:1});
});

test('SCI simple SPI model: TDR exchanges a byte at PCLKA/(4x4^CKS x (BRR+1)), RXI with the answer, TEI once TEIE is set; TE+TIE request TXI',async()=>{
 const {Sci}=await import('../../src/emu/ra6e1/sci.js');
 const f=fakeSoc(),sci=new Sci(f.soc,9),ev=()=>f.events.splice(0).map(e=>e-0x1b6);
 // r_sci_spi hw_config: SCR 0, SMR CM, SCMR SDIR (MSB first), BRR 24, SPMR CKPH (mode 0).
 sci.write(0x02,0,1);sci.write(0x04,0xc4,1);sci.write(0x00,0x80,1);sci.write(0x06,0xea,1);sci.write(0x01,24,1);sci.write(0x0d,0x80,1);
 assert.equal(sci.syncHz(),1e6);assert.deepEqual(sci.spiMode(),{cpha:0,cpol:0,lsbFirst:false});
 // WriteRead: TE | RE | RIE, the first byte written at once.
 sci.write(0x02,0x70,1);assert.deepEqual(ev(),[]);assert.deepEqual(sci.output('SCK'),{level:0});
 sci.write(0x03,0xa5,1);assert.deepEqual(f.bytes.map(b=>[b.byte,b.sck,b.mosi,b.miso]),[[0xa5,'P111','P109','P110']]);
 f.run();assert.deepEqual(ev(),[0],'RXI');assert.equal(f.now,8,'8 bits at 1 MHz');assert.equal(sci.read(0x05,1),0x5a);
 sci.write(0x02,0x34,1);assert.deepEqual(ev(),[2],'TEIE after the last byte: TEI');
 // Write only: TE and TIE in one write ask for the first byte.
 sci.write(0x02,0,1);sci.write(0x02,0xa0,1);assert.deepEqual(ev(),[1]);
 // CPHA 1 / CPOL 0 is CKPH 0 with CKPOL 1; LSB first without SDIR.
 sci.write(0x0d,0x40,1);sci.write(0x06,0xe2,1);assert.deepEqual(sci.spiMode(),{cpha:1,cpol:0,lsbFirst:true});
 assert.equal(sci.uartEvent,undefined);assert.equal(sci.stats.rx,0,'no UART frames in clock synchronous mode');
});

// Feature 32 review: the serial monitor's targets of an FSP project are its SCI UARTs; SCI9 as simple SPI is not one.
test('serial monitor targets: SCI channels in UART mode only, not one switched to simple SPI',()=>{
 const uart=raDefaultMcu();uart.pins.P109={function:'Peripheral',signal:'SCI9_TXD'};uart.peripherals={SCI9:{enabled:true}};
 assert.deepEqual(raUartChannels(validateRaMcu(uart)),['SCI9']);
 assert.deepEqual(raUartChannels(validateRaMcu(sciSpiMcu())),[]);
 assert.deepEqual(raUartChannels({peripherals:{SCI9:{enabled:false},SCI3:{enabled:true},SPI1:{enabled:true}}}),['SCI3']);
 assert.deepEqual(raUartChannels(raDefaultMcu()),[]);
});
