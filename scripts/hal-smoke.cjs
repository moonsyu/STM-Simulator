const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {_electron}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results');await fs.mkdir(out,{recursive:true});
 const env={...process.env,CIRCUIT_LAB_SMOKE:'1',CIRCUIT_LAB_TEST_PROFILE:path.join(out,'hal-profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:process.env.LAB_EXE||path.join(root,'node_modules/electron/dist/electron.exe'),args:process.env.LAB_EXE?[]:[root],cwd:root,env});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#pinout-open');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].showInactive());
  await page.click('#pinout-open');await page.click('[data-config-pin="PC13"]');await page.selectOption('#pin-function','GPIO_EXTI');await page.selectOption('#pin-pull','PULLUP');await page.check('[data-irq="EXTI15_10_IRQn"]');
  await page.screenshot({path:path.join(out,'11-pinout-hal.png')});
  await page.click('#hal-generate');await page.click('#hal-replace-confirm');assert.equal(await page.locator('#firmware-mode').inputValue(),'hal');assert.match(await page.locator('#code').inputValue(),/HAL_GPIO_Init/);
  await page.click('#firmware-check');assert.match(await page.locator('#firmware-status').textContent(),/통과/);
  await page.click('#run');await page.waitForTimeout(80);assert.equal(await page.locator('#run-status').textContent(),'실행 중');await page.click('#run');
  const load=async kind=>{await page.selectOption('#hal-example',kind);if(await page.locator('#replace-dialog').isVisible())await page.click('#replace-confirm');};
  await load('uart');await page.click('[data-monitor="bus"]');await page.click('#run');await page.waitForTimeout(120);assert.match(await page.locator('#uart-output').textContent(),/HAL UART ready/);await page.fill('#serial-input','Hello HAL');await page.click('#serial-send');await page.waitForTimeout(180);assert.match(await page.locator('#uart-output').textContent(),/Hello HAL/);await page.screenshot({path:path.join(out,'12-hal-uart.png')});await page.click('#run');
  const nativeIoc=path.join(out,'import-smoke.ioc'),nativeMain=path.join(out,'main.c'),nativeHeader=path.join(out,'main.h');
  await fs.writeFile(nativeIoc,'Mcu.Name=STM32F446RETx\nPA5.Signal=GPIO_Output');
  await fs.writeFile(nativeMain,'#include "main.h"\nint main(void){HAL_Init();GPIO_InitTypeDef gpio={0};gpio.Pin=LED_Pin;gpio.Mode=GPIO_MODE_OUTPUT_PP;HAL_GPIO_Init(GPIOA,&gpio);while(1){HAL_GPIO_TogglePin(GPIOA,LED_Pin);HAL_Delay(100);}}');
  await fs.writeFile(nativeHeader,'#ifndef MAIN_H\n#define MAIN_H\n#define LED_Pin GPIO_PIN_5\n#endif');
  await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});},[nativeIoc,nativeMain,nativeHeader]);
  await page.click('#firmware-import');await page.waitForFunction(()=>document.querySelector('#code').value.includes('LED_Pin'));await page.selectOption('#source-file','main.h');assert.match(await page.locator('#code').inputValue(),/#define LED_Pin/);await page.fill('#code','#ifndef MAIN_H\n#define MAIN_H\n#define LED_Pin GPIO_PIN_5\n#endif\n// edited');await page.selectOption('#source-file','main.c');
  await page.click('#firmware-check');assert.match(await page.locator('#firmware-status').textContent(),/통과/);await page.click('#run');await page.waitForTimeout(70);assert.equal(await page.locator('#run-status').textContent(),'실행 중');assert.equal(await page.locator('#pinout-open').isDisabled(),true);await page.click('#run');
  const saved=path.join(out,'hal-round-trip.stm32lab');await app.evaluate(({dialog},saved)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:saved});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[saved]});},saved);
  await page.click('#save');await page.waitForTimeout(120);const data=JSON.parse(await fs.readFile(saved,'utf8'));assert.equal(data.firmware.mode,'hal');assert.equal(data.mcu.pins.PA5.function,'GPIO_Output');assert.match(data.firmware.files[0].text,/edited/);
  await page.click('#open');await page.waitForTimeout(100);assert.equal(await page.locator('#firmware-mode').inputValue(),'hal');
  const cube=path.join(out,'cube-import');await fs.mkdir(path.join(cube,'Core','Src'),{recursive:true});await fs.mkdir(path.join(cube,'Core','Inc'),{recursive:true});
  await fs.copyFile(nativeIoc,path.join(cube,'smoke.ioc'));await fs.copyFile(nativeMain,path.join(cube,'Core','Src','main.c'));await fs.copyFile(nativeHeader,path.join(cube,'Core','Inc','main.h'));await fs.writeFile(path.join(cube,'Core','Src','syscalls.c'),'EXCLUDED SYSTEM SOURCE');
  await app.evaluate(({dialog},cube)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[cube]});},cube);await page.click('#firmware-folder');await page.waitForFunction(()=>document.querySelector('#code').value.includes('LED_Pin'));await page.click('#firmware-check');assert.match(await page.locator('#firmware-status').textContent(),/통과/);assert.equal(await page.locator('#source-file option').count(),2);
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'hal-smoke.json'),JSON.stringify({passed:true,checks:['Pinout GPIO and NVIC','HAL code generation','source syntax check','HAL execution','UART interrupt terminal','native IOC C header import','multiple source editing','HAL project save/open','Cube folder import excludes system code','editing disabled while running'],errors},null,2));console.log('HAL UI smoke passed.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
