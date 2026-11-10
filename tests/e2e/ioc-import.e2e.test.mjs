// File › .ioc 가져오기 with only an .ioc (NUCLEO-F103RB): the Pinout takes its pins and peripherals and main.c is generated
// from them (MX_*_Init, the 72 MHz HSE clock), the project's USER CODE sections staying, as the Pinout's code button does.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {launch} from './harness.mjs';

const IOC=['Mcu.Name=STM32F103R(8-B)Tx','Mcu.CPN=STM32F103RBT6','Mcu.IP0=I2C1','Mcu.IP1=NVIC','Mcu.IP2=RCC','Mcu.IP3=SPI1','Mcu.IP4=SYS','Mcu.IP5=USART2',
 'PA2.Signal=USART2_TX','PA3.Signal=USART2_RX','PA5.Signal=SPI1_SCK','PA6.Signal=SPI1_MISO','PA7.Signal=SPI1_MOSI','PA8.GPIO_Label=OLED_DC','PA8.Signal=GPIO_Output',
 'PB8.Signal=I2C1_SCL','PB9.Signal=I2C1_SDA','PD0-OSC_IN.Signal=RCC_OSC_IN','PD1-OSC_OUT.Signal=RCC_OSC_OUT','RCC.APB1CLKDivider=RCC_HCLK_DIV2','RCC.APB1TimFreq_Value=72000000',
 'RCC.PLLMUL=RCC_PLL_MUL9','RCC.PLLSourceVirtual=RCC_PLLSOURCE_HSE','RCC.SYSCLKSource=RCC_SYSCLKSOURCE_PLLCLK','RCC.SYSCLKFreq_VALUE=72000000','SPI1.BaudRatePrescaler=SPI_BAUDRATEPRESCALER_8',
 'SPI1.CalculateBaudRate=9.0 MBits/s','SPI1.Mode=SPI_MODE_MASTER','USART2.VirtualMode=VM_ASYNC'].join('\n');

test('.ioc import alone sets the Pinout and regenerates main.c, keeping USER CODE',{timeout:120000},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ioc-import-')),file=path.join(dir,'oled.ioc');await fs.writeFile(file,IOC);
 const s=await launch();
 try{
  const {win,app}=s,code=()=>win.evaluate(()=>document.getElementById('code').value);
  await win.evaluate(()=>{const c=document.getElementById('code');c.value=c.value.replace(/\/\* USER CODE BEGIN 3 \*\/\n/,m=>m+'        my_loop_work();\n').replace('/* USER CODE END 0 */','/* USER CODE END 0 */\nvoid outsideHelper(void) { }');c.dispatchEvent(new Event('input',{bubbles:true}));});
  await app.evaluate(({dialog},p)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[p]});},file);
  await win.evaluate(()=>document.getElementById('firmware-import').click());
  await win.waitForFunction(()=>/Pinout 설정과 main\.c를 \.ioc대로 만들었습니다/.test(document.getElementById('console-output').textContent),null,{timeout:10000});
  const c=await code();
  for(const k of ['MX_USART2_UART_Init();','MX_I2C1_Init();','MX_SPI1_Init();','RCC_PLL_MUL9','__HAL_AFIO_REMAP_I2C1_ENABLE','my_loop_work();'])assert.ok(c.includes(k),k);
  // A function outside the USER CODE sections is moved into section 0, not lost.
  assert.match(c,/\/\* USER CODE BEGIN 0 \*\/[\s\S]*void outsideHelper\(void\)[\s\S]*\/\* USER CODE END 0 \*\//);
  assert.match(await win.textContent('#console-output'),/USER CODE 구역 밖에 있던 코드를 구역 안으로 옮겨 유지했습니다: outsideHelper/);
  await win.evaluate(()=>document.getElementById('pinout-open').click());await win.waitForSelector('#pinout-dialog[open]');
  assert.equal(await win.evaluate(()=>[...document.querySelectorAll('#pinout-peripherals [data-peripheral]')].filter(e=>e.checked).map(e=>e.dataset.peripheral).sort().join(',')),'I2C1,SPI1,USART2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();await fs.rm(dir,{recursive:true,force:true});}
});
