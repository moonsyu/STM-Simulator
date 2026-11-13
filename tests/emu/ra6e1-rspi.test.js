// Feature 32 review: the RA6E1 RSPI model (src/emu/ra6e1/spi.js) with RSPCK auto-stop. r_spi sets SPCR2.SCKASE in master
// mode, so at a bit rate where a frame is shorter than the RXI ISR the master waits before the last bit of the next frame
// until SPDR is read, instead of overrunning (OVRF, SPI_EVENT_ERR_READ_OVERFLOW). Without SCKASE the overrun stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Rspi} from '../../src/emu/ra6e1/spi.js';

// A SoC with a clock, an event queue in µs and a loopback device (MISO = MOSI).
function soc(){
 const s={now:0,queue:[],raised:[],clock:{pclka:100e6},
  nowUs(){return s.now;},sync(){},after(us,fn){const e={at:s.now+us,fn,cancelled:false,cancel(){e.cancelled=true;}};s.queue.push(e);return e;},
  until(us){for(;;){s.queue.sort((a,b)=>a.at-b.at);const e=s.queue.find(x=>!x.cancelled);if(!e||e.at>us)break;s.queue.splice(s.queue.indexOf(e),1);s.now=e.at;e.fn();}s.now=us;},
  icu:{raise:k=>s.raised.push(k-0x1c9)},routedPins:()=>[],spiTransfer:(name,pins,byte)=>byte,peripheralChanged(){}};
 return s;
}
// Master, 8-bit frames at PCLKA / 2 (50 MHz: 0.16 µs a frame), RXI and ERI enabled; SCKASE as given.
function rspi(sckase){
 const s=soc(),m=new Rspi(s,1);
 m.write(0x0a,0,1);m.write(0x10,0x0700,2);m.write(0x0f,sckase?0x10:0,1);m.write(0x00,0x80|0x10|0x08|0x40,1);
 return {s,m};
}

test('RSPI master with SCKASE: frames wait for the receive buffer to be read, no overrun; reading SPDR lets the next frame end',()=>{
 const {s,m}=rspi(true);
 m.write(0x04,0x11,1);m.write(0x04,0x22,1);
 s.until(10);
 assert.equal(m.read(0x03,1)&0x01,0,'no OVRF');assert.ok(!s.raised.includes(3),'no ERI');
 assert.equal(m.read(0x03,1)&0x02,0x02,'IDLNF: the second frame is held before its last bit');
 assert.equal(m.read(0x04,1),0x11);
 assert.equal(m.read(0x03,1)&0x80,0,'SPRF cleared by the read');
 s.until(10.1);
 assert.equal(m.read(0x03,1)&0x80,0x80,'the held frame ends one bit time after the read');
 assert.equal(m.read(0x04,1),0x22);assert.equal(m.read(0x03,1)&0x43,0x40,'communication end (CENDF), no OVRF, idle');
 assert.equal(m.stats.frames,2);
});

test('RSPI without SCKASE: an unread receive buffer overruns (OVRF, ERI) as before',()=>{
 const {s,m}=rspi(false);
 m.write(0x04,0x11,1);m.write(0x04,0x22,1);
 s.until(10);
 assert.equal(m.read(0x03,1)&0x01,0x01,'OVRF');assert.ok(s.raised.includes(3),'ERI (event base + 3)');
 assert.equal(m.read(0x04,1),0x11,'the first frame stays in the buffer');
});
