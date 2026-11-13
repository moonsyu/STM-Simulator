// Feature 32: an FPB-RA6E1 project with both SPI drivers — r_sci_spi on SCI9 (simple SPI, CPOL 1 / CPHA 1) and r_spi on
// SPI1 (3-wire, LSB first, 16- and 32-bit frames) — builds with ARM GCC and the FSP sources without a warning and runs on the
// RA6E1 emulator. MOSI and MISO of each are wired together on the Arduino header (D1–D0, D11–D12), so every frame must
// come back unchanged through the circuit; the RSPI bit order and frame width only round-trip if the model gets them right.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {raDefaultMcu} from '../../src/ra-config.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const fspSpi=!!tools.fsp&&await fs.access(path.join(tools.fsp,'ra/fsp/src/r_sci_spi/r_sci_spi.c')).then(()=>true,()=>false);
const skip=!(tools.armGcc&&fspSpi)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / Renesas FSP (r_spi, r_sci_spi) not installed';

const code=`#include "hal_data.h"

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER

static volatile uint32_t sci_done = 0;
static volatile uint32_t spi_done = 0;
volatile uint32_t sci_ok = 0;
volatile uint32_t spi_ok = 0;

void sci_spi9_callback(spi_callback_args_t *p_args)
{
    if (SPI_EVENT_TRANSFER_COMPLETE == p_args->event)
    {
        sci_done++;
    }
}

void spi1_callback(spi_callback_args_t *p_args)
{
    if (SPI_EVENT_TRANSFER_COMPLETE == p_args->event)
    {
        spi_done++;
    }
}

void hal_entry(void)
{
    static const uint8_t tx[4] = { 0x9A, 0x01, 0x80, 0x55 };
    static uint8_t rx[4];
    static const uint16_t tx16[2] = { 0x1234, 0xABCD };
    static uint16_t rx16[2];
    static const uint32_t tx32[1] = { 0xDEADBEEF };
    static uint32_t rx32[1];

    R_SCI_SPI_Open(&g_sci_spi9_ctrl, &g_sci_spi9_cfg);
    R_SCI_SPI_WriteRead(&g_sci_spi9_ctrl, tx, rx, sizeof(tx), SPI_BIT_WIDTH_8_BITS);
    while (sci_done < 1)
    {
    }
    R_SCI_SPI_Write(&g_sci_spi9_ctrl, tx, 2, SPI_BIT_WIDTH_8_BITS);
    while (sci_done < 2)
    {
    }
    sci_ok = (rx[0] == 0x9A) && (rx[1] == 0x01) && (rx[2] == 0x80) && (rx[3] == 0x55);

    R_SPI_Open(&g_spi1_ctrl, &g_spi1_cfg);
    R_SPI_WriteRead(&g_spi1_ctrl, tx16, rx16, 2, SPI_BIT_WIDTH_16_BITS);
    while (spi_done < 1)
    {
    }
    R_SPI_WriteRead(&g_spi1_ctrl, tx32, rx32, 1, SPI_BIT_WIDTH_32_BITS);
    while (spi_done < 2)
    {
    }
    spi_ok = (rx16[0] == 0x1234) && (rx16[1] == 0xABCD) && (rx32[0] == 0xDEADBEEF);

    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, LED1, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MILLISECONDS);
    }
}

void external_irq1_callback(external_irq_callback_args_t *p_args)
{
    (void) p_args;
}

void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_POST_C == event)
    {
        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}
`;
function project(){
 const mcu=raDefaultMcu(),peripheral=signal=>({function:'Peripheral',signal});
 Object.assign(mcu.pins,{P109:peripheral('SCI9_TXD'),P110:peripheral('SCI9_RXD'),P111:peripheral('SCI9_SCK'),P100:peripheral('SPI1_MISO'),P101:peripheral('SPI1_MOSI'),P102:peripheral('SPI1_RSPCK')});
 mcu.peripherals={SCI9:{enabled:true,mode:'SPI',bitrate:2000000,cpol:1,cpha:1,callback:'sci_spi9_callback',priority:10},SPI1:{enabled:true,bitrate:4000000,bitOrder:'LSB',callback:'spi1_callback',priority:10}};
 return validateProject({...projectForBoard('fpb-ra6e1'),mcu,code,components:[],wires:[
  {id:'w_sci',from:'board:J5:1',to:'board:J5:2',color:'#30a46c'},{id:'w_spi',from:'board:J1:4',to:'board:J1:5',color:'#0090ff'}]});
}

test('r_sci_spi (SCI9) and r_spi (SPI1, 16/32-bit, LSB first) build without a warning and loop their frames back through the circuit',{skip,timeout:300000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ra-spi-'));
 try{
  const p=project(),result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
  assert.deepEqual(result.diagnostics.filter(d=>d.severity!=='info'),[]);
  const session=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
  for(let ms=10;ms<=300;ms+=10)session.tick(ms);
  assert.ok(!session.fault,session.fault);
  // SCI9: PCLKA 100 MHz / (4 x 1 x 13) = 1.92 MHz, 8 bits in 4.2 µs; in full duplex r_sci_spi writes the next byte from
  // the RXI ISR, so frames follow each other 4.2 µs plus the interrupt's time apart. The write-only call sends 2 bytes.
  const sci=session.soc.scis[9].spiLog,gap=sci[1].us-sci[0].us;
  assert.deepEqual(sci.map(e=>e.tx),[0x9a,0x01,0x80,0x55,0x9a,0x01]);assert.deepEqual(sci.slice(0,4).map(e=>e.rx),[0x9a,0x01,0x80,0x55]);
  assert.ok(gap>=8/1.923077-0.01&&gap<8/1.923077+2,'SCI frame spacing '+gap);
  assert.deepEqual(session.soc.scis[9].spiMode(),{cpha:1,cpol:1,lsbFirst:false});
  assert.equal(session.readVariable('sci_ok'),1,'RXI → sci_spi_rxi_isr → buffer, TEI → callback');
  // SPI1: frames of 16, 16 and 32 bits (SPCMD0.SPB from the call's bit width), LSB first, 4 MHz (SPBR 12 → 3.85 MHz).
  const spi=session.soc.rspis[1].log;
  assert.deepEqual(spi.map(e=>[e.bits,e.tx.toString(16)]),[[16,'1234'],[16,'abcd'],[32,'deadbeef']]);
  assert.equal(session.soc.rspis[1].config().lsbFirst,true);assert.ok(Math.abs(session.soc.rspis[1].hz()-100e6/26)<1);
  assert.equal(session.readVariable('spi_ok'),1);
  assert.equal(session.gpio.P111.mode,'OUTPUT','SCK9 driven');assert.ok(session.gpio.P111.value>1.65,'SCK9 idles high (CPOL 1)');
  assert.equal(session.gpio.P408.mode,'OUTPUT');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
