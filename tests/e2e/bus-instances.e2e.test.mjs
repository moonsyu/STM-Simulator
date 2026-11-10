// Pinout I2C2 / SPI2 cards (NUCLEO-F103RB, the start board): each instance has its own parameter controls, and the
// missing pins of the enabled instance are reported by name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

test('Pinout I2C2 / SPI2: own parameters per instance, missing pins reported',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.locator('[data-peripheral="I2C3"]').count(),0,'no I2C3 on the F103RB');
  await win.check('[data-peripheral="I2C2"]');await win.waitForSelector('[data-i2c="I2C2"][data-i2c-param="noStretch"]:not([disabled])');
  await win.fill('[data-peripheral-value="I2C2"][data-key="clock"]','400000');await win.dispatchEvent('[data-peripheral-value="I2C2"][data-key="clock"]','change');
  await win.selectOption('[data-i2c="I2C2"][data-i2c-param="noStretch"]','1');
  await win.waitForFunction(()=>document.querySelector('[data-i2c="I2C2"][data-i2c-param="noStretch"]')?.value==='1');
  assert.equal(await win.locator('[data-i2c="I2C1"][data-i2c-param="noStretch"]').inputValue(),'0','I2C1 keeps its own setting');
  await win.check('[data-peripheral="SPI2"]');await win.waitForSelector('[data-spi="SPI2"][data-spi-param="cpol"]:not([disabled])');
  await win.selectOption('[data-spi="SPI2"][data-spi-param="cpol"]','HIGH');
  await win.waitForFunction(()=>/SPI mode 2/.test(document.querySelector('#pinout-peripherals section.peripheral-card:has([data-peripheral="SPI2"])').textContent));
  assert.match(await win.textContent('#pinout-peripherals section.peripheral-card:has([data-peripheral="SPI1"])'),/SPI mode 0/);
  const errors=await win.textContent('#pinout-errors');
  for(const line of ['I2C2: SCL 핀을 활성화하세요.','I2C2: SDA 핀을 활성화하세요.','SPI2: SCK 핀을 활성화하세요.'])assert.ok(errors.includes(line),line+'\n'+errors);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
