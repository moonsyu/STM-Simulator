// SPI1 Parameter Settings (CubeMX Full-Duplex Master): Clock Polarity, Clock Phase, Data Size and First Bit in the
// Pinout configuration, the generated MX_SPI1_Init, .ioc import, and the interpreter's mode-0 limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {validateMcu,generateHal,importIoc,SPI_PARAMS} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

const spi=(base=blankProject(),params={})=>{const p=applyHalExample(base,'spi');Object.assign(p.mcu.peripherals.SPI1,params);return p;};

test('SPI1 parameters: defaults are not stored, mode 3 / 16 bits / LSB first are generated on both boards',()=>{
 assert.deepEqual(SPI_PARAMS.cpha,['1EDGE','2EDGE']);
 for(const base of [blankProject(),projectForBoard('nucleo-f103rb')]){
  const v=validateMcu(spi(base,{cpol:'HIGH',cpha:'2EDGE',dataSize:16,firstBit:'LSB'}).mcu).peripherals.SPI1;
  assert.deepEqual([v.cpol,v.cpha,v.dataSize,v.firstBit],['HIGH','2EDGE',16,'LSB']);
  const src=generateHal(spi(base,{cpol:'HIGH',cpha:'2EDGE',dataSize:16,firstBit:'LSB'}).mcu);
  for(const line of ['hspi1.Init.CLKPolarity = SPI_POLARITY_HIGH;','hspi1.Init.CLKPhase = SPI_PHASE_2EDGE;','hspi1.Init.DataSize = SPI_DATASIZE_16BIT;','hspi1.Init.FirstBit = SPI_FIRSTBIT_LSB;'])assert.ok(src.includes(line),line);
  assert.deepEqual(Object.keys(validateMcu(spi(base,{cpol:'LOW',cpha:'1EDGE',dataSize:8,firstBit:'MSB'}).mcu).peripherals.SPI1).sort(),['clock','enabled']);
 }
 assert.throws(()=>validateMcu(spi(blankProject(),{dataSize:12}).mcu),/SPI1\.dataSize: 8 \/ 16/);
});

test('a CubeMX .ioc with SPI1 mode 3 / LSB first keeps it; the interpreter says to use the ARM GCC simulator',()=>{
 const ioc='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nMcu.IP0=SPI1\nPA5.Signal=SPI1_SCK\nPA6.Signal=SPI1_MISO\nPA7.Signal=SPI1_MOSI\nSPI1.Mode=SPI_MODE_MASTER\nSPI1.CLKPolarity=SPI_POLARITY_HIGH\nSPI1.CLKPhase=SPI_PHASE_2EDGE\nSPI1.DataSize=SPI_DATASIZE_16BIT\nSPI1.FirstBit=SPI_FIRSTBIT_LSB\nSPI1.CalculateBaudRate=1.40625 MBits/s\nSPI1.IPParameters=CLKPolarity,CLKPhase,DataSize,FirstBit,CalculateBaudRate\n';
 const c=importIoc(ioc).config.peripherals.SPI1;
 assert.deepEqual([c.cpol,c.cpha,c.dataSize,c.firstBit],['HIGH','2EDGE',16,'LSB']);
 const p=spi(blankProject(),{cpol:'HIGH'});p.code=generateHal(p.mcu);
 assert.throws(()=>{const s=new SimulationSession(p,{print(){},warn(){}});for(let t=10;t<=50;t+=10)s.tick(t);},/ARM GCC 시뮬레이터로 실행하세요/);
});
