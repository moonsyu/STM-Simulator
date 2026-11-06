// CubeMX USART Parameter Settings in the Pinout dialog: Word Length, Parity, Stop Bits, Data Direction (and Over
// Sampling on the F446RE; the F103RB's USART has only 16) of USART2 reach the generated MX_USART2_UART_Init.
import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const pick=async(win,values)=>{for(const [key,value]of values)if(await win.locator(`[data-uart-param="USART2"][data-key="${key}"]`).count())await win.selectOption(`[data-uart-param="USART2"][data-key="${key}"]`,value);};
async function generate(win){
 await win.evaluate(()=>document.getElementById('hal-generate').click());
 if(await win.evaluate(()=>document.getElementById('hal-replace-dialog').open))await win.click('#hal-replace-confirm');
}

test('USART2 Parameter Settings (9 bits, even parity, 2 stop bits, TX only) are generated into main.c and can go back to 8N1',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  const usart=win.locator('#pinout-peripherals [data-peripheral="USART2"]');
  if(!await usart.isChecked())await usart.check();
  const over=await win.locator('[data-uart-param="USART2"][data-key="overSampling"]').count()>0,f103=/F103/.test(await win.textContent('#pinout-dialog'));
  assert.equal(over,!f103,'Over Sampling only where the USART has OVER8');
  await pick(win,[['wordLength','9'],['parity','EVEN'],['stopBits','2'],['direction','TX'],['overSampling','8']]);
  assert.equal(await win.inputValue('[data-uart-param="USART2"][data-key="parity"]'),'EVEN');
  await generate(win);
  await win.waitForFunction(()=>/huart2\.Init\.Parity = UART_PARITY_EVEN;/.test(document.getElementById('code').value),null,{timeout:10000});
  const c=await code();
  for(const line of ['huart2.Init.WordLength = UART_WORDLENGTH_9B;','huart2.Init.StopBits = UART_STOPBITS_2;','huart2.Init.Mode = UART_MODE_TX;',over?'huart2.Init.OverSampling = UART_OVERSAMPLING_8;':'huart2.Init.OverSampling = UART_OVERSAMPLING_16;'])assert.ok(c.includes(line),line);
  if(!await win.evaluate(()=>document.getElementById('pinout-dialog').open)){await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');}
  await pick(win,[['wordLength','8'],['parity','NONE'],['stopBits','1'],['direction','TX_RX'],['overSampling','16']]);
  await generate(win);
  await win.waitForFunction(()=>/huart2\.Init\.Parity = UART_PARITY_NONE;/.test(document.getElementById('code').value),null,{timeout:10000});
  assert.match(await code(),/huart2\.Init\.WordLength = UART_WORDLENGTH_8B;[\s\S]*huart2\.Init\.Mode = UART_MODE_TX_RX;/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('SPI1 Parameter Settings (CPOL High, CPHA 2 Edge, 16 bits, LSB first) show SPI mode 3 and are generated into main.c',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  // The SPI memory example routes SPI1 (PA5/PA6/PA7) and enables it.
  await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');
  await win.selectOption('#hal-example','spi');await win.waitForFunction(()=>/MX_SPI1_Init/.test(document.getElementById('code').value));
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.locator('#pinout-peripherals [data-peripheral="SPI1"]').isChecked(),true);
  assert.match(await win.textContent('#pinout-peripherals'),/SPI mode 0 · Full-Duplex Master/);
  for(const [key,value]of [['cpol','HIGH'],['cpha','2EDGE'],['dataSize','16'],['firstBit','LSB']])await win.selectOption(`[data-spi-param="${key}"]`,value);
  assert.match(await win.textContent('#pinout-peripherals'),/SPI mode 3 · Full-Duplex Master/);
  await generate(win);
  await win.waitForFunction(()=>/hspi1\.Init\.CLKPolarity = SPI_POLARITY_HIGH;/.test(document.getElementById('code').value),null,{timeout:10000});
  const c=await code();
  for(const line of ['hspi1.Init.CLKPhase = SPI_PHASE_2EDGE;','hspi1.Init.DataSize = SPI_DATASIZE_16BIT;','hspi1.Init.FirstBit = SPI_FIRSTBIT_LSB;'])assert.ok(c.includes(line),line);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
