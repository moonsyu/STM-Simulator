// I2C1 Parameter Settings (CubeMX): Primary Address (own 7-bit slave address), Fast Mode Duty Cycle, Clock No Stretch
// Mode in the Pinout configuration, the generated MX_I2C1_Init, and .ioc import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {validateMcu,generateHal,importIoc} from '../../src/mcu-config.js';

const i2c=(base=blankProject(),params={})=>{const p=applyHalExample(base,'i2c');Object.assign(p.mcu.peripherals.I2C1,params);return p;};

test('I2C1 parameters: own address, 16/9 duty in fast mode, no stretch; defaults not stored; generated on both boards',()=>{
 for(const base of [blankProject(),projectForBoard('nucleo-f103rb')]){
  const v=validateMcu(i2c(base,{clock:400000,ownAddress:0x3c,dutyCycle:'16_9',noStretch:true}).mcu).peripherals.I2C1;
  assert.deepEqual([v.ownAddress,v.dutyCycle,v.noStretch],[0x3c,'16_9',true]);
  const src=generateHal(i2c(base,{clock:400000,ownAddress:0x3c,dutyCycle:'16_9',noStretch:true}).mcu);
  for(const line of ['hi2c1.Init.ClockSpeed = 400000;','hi2c1.Init.DutyCycle = I2C_DUTYCYCLE_16_9;','hi2c1.Init.OwnAddress1 = 0x78;','hi2c1.Init.NoStretchMode = I2C_NOSTRETCH_ENABLE;'])assert.ok(src.includes(line),line);
  assert.deepEqual(Object.keys(validateMcu(i2c(base,{ownAddress:0,dutyCycle:'2',noStretch:false}).mcu).peripherals.I2C1).sort(),['clock','enabled']);
 }
 assert.throws(()=>validateMcu(i2c(blankProject(),{dutyCycle:'16_9'}).mcu),/100 kHz보다 빠를 때만/);
 assert.throws(()=>validateMcu(i2c(blankProject(),{ownAddress:0x80}).mcu),/7비트 주소/);
 const ioc='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nMcu.IP0=I2C1\nPB8.Signal=I2C1_SCL\nPB9.Signal=I2C1_SDA\nI2C1.ClockSpeed=400000\nI2C1.DutyCycle=I2C_DUTYCYCLE_16_9\nI2C1.OwnAddress=120\nI2C1.NoStretchMode=I2C_NOSTRETCH_ENABLE\nI2C1.IPParameters=ClockSpeed,DutyCycle,OwnAddress,NoStretchMode\n';
 const c=importIoc(ioc).config.peripherals.I2C1;
 assert.deepEqual([c.clock,c.dutyCycle,c.ownAddress,c.noStretch],[400000,'16_9',0x3c,true]);
});
