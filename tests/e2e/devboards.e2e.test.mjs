import test from 'node:test';
import assert from 'node:assert/strict';
import {launch} from './harness.mjs';

const logText=win=>win.evaluate(()=>document.getElementById('console-output').textContent);
async function openBoardView(win){await win.click('[data-activity="board"]');if(!await win.locator('#view-board').isVisible())await win.click('[data-activity="board"]');}
async function openExamples(win){await win.click('[data-activity="examples"]');if(!await win.locator('#view-examples').isVisible())await win.click('[data-activity="examples"]');}
// Searches by lecture code (kept for search, not shown) and applies the first lecture example found.
async function applyLecture(win,code){
 await openExamples(win);await win.fill('#hal-example-search',code);const item=win.locator('#hal-example-list [data-example^="lecture:"]').first(),title=await item.locator('strong').textContent();await item.click();
 await win.waitForFunction(t=>document.getElementById('console-output').textContent.includes(t+' · '),title);
}

test('ESP32 and Raspberry Pi boards are added, inspected, documented and removed',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openBoardView(win);
  await win.click('[data-devboard-add="esp32-nodemcu-32s"]');await win.click('[data-devboard-add="rpi5"]');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard]').length),2);
  assert.equal(await win.evaluate(()=>document.querySelectorAll('[data-endpoint^="devboard:"]').length),78);
  assert.match(await win.textContent('#explorer-circuit-summary'),/다른 보드 2개/);
  // A pin's inspector lists its cautions; the board's Docs list the header.
  const pin=await win.evaluate(()=>document.querySelector('[data-endpoint$=":L5"]').dataset.endpoint);
  await win.locator(`[data-endpoint="${pin}"]`).click({force:true});
  assert.match(await win.textContent('#inspector'),/입력 전용/);
  await win.locator('#devboard-layer [data-devboard="rpi5"]').click({position:{x:60,y:120},force:true});
  assert.match(await win.textContent('#inspector'),/RPI-1/);
  await win.click('#open-board-code');await win.waitForFunction(()=>document.querySelector('.language-badge').textContent.includes('RPI-1'));
  // A Raspberry Pi main.py runs as Python, so it can be edited.
  assert.equal(await win.evaluate(()=>document.getElementById('code').readOnly),false);
  await win.click('[data-activity="docs"]');assert.match(await win.textContent('#device-docs-panel'),/GPIO17/);
  await win.locator('#devboard-layer [data-devboard="rpi5"]').click({position:{x:60,y:120},force:true});await win.click('#remove-part');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard]').length),1);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('right-clicking an STM32 pin opens its pin settings, with or without a wire on it',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await win.click('#empty-add-board');await win.click('#zoom-reset');
  const center=async id=>{const b=await win.locator(`[data-endpoint="${id}"]`).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
  const pins=['board:CN7:1','board:CN7:2'];// PC10, PC11
  const rightClick=async id=>{const p=await center(id);await win.mouse.click(p.x,p.y,{button:'right'});assert.equal(await win.evaluate(()=>document.getElementById('pinout-dialog').open),true,id);await win.click('#pinout-close');};
  await rightClick(pins[0]);
  for(const id of pins){const p=await center(id);await win.mouse.click(p.x,p.y);}
  await win.waitForFunction(()=>document.querySelectorAll('#wire-layer [data-wire]').length===1);
  await rightClick(pins[0]);await rightClick(pins[1]);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('boards on SPI wires: the logic analyzer lists each board and the monitor reaches the other board',{timeout:180000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'WIRE-02');await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[STM32-2\] \[USART2 TX\] byte in/.test(document.getElementById('console-output').textContent),null,{timeout:60000});
  await win.waitForFunction(()=>/slave answered/.test(document.getElementById('console-output').textContent)||/slave answered/.test(document.getElementById('uart-output').textContent),null,{timeout:60000}).catch(()=>{});
  // The other board's own recorder: the analyzer's board list appears only with more than one STM32 board.
  await win.click('[data-monitor="signals"]');
  await win.waitForFunction(()=>!document.getElementById('la-board').parentElement.hidden&&document.getElementById('la-board').options.length===2);
  assert.deepEqual(await win.evaluate(()=>[...document.getElementById('la-board').options].map(o=>o.textContent)),['주 보드','STM32-2']);
  await win.waitForFunction(()=>document.getElementById('la-svg').textContent.includes('SCK'),null,{timeout:30000});
  await win.selectOption('#la-board','stm2');await win.waitForFunction(()=>document.getElementById('la-board').value==='stm2');
  // Text sent from the monitor goes to the other board's USART2.
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','board:stm2');
  await win.waitForFunction(()=>!document.getElementById('serial-send').disabled);
  await win.fill('#serial-input','x');await win.click('#serial-send');
  assert.equal(await win.evaluate(()=>document.getElementById('serial-feedback').textContent),'');
  assert.equal(await win.evaluate(()=>document.getElementById('serial-input').value),'');
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the serial monitor reaches a phone on an ESP32 running BluetoothSerial',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'BT-03');await win.keyboard.press('Control+F5');
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','outside:phone:esp32bt:esp1');
  await win.waitForFunction(()=>!document.getElementById('serial-send').disabled);
  await win.waitForTimeout(500);await win.fill('#serial-input','1');await win.click('#serial-send');
  assert.equal(await win.evaluate(()=>document.getElementById('serial-feedback').textContent),'');
  await win.waitForFunction(()=>/LED ON/.test(document.getElementById('uart-output').textContent),null,{timeout:30000});
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a value typed in the part inspector is kept',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'BT-01');
  const select=()=>win.locator('#part-layer [data-part="hc06"]').click({force:true});
  await select();await win.fill('#extra-airLoss','30');await win.locator('#extra-airLoss').dispatchEvent('change');
  await win.locator('#part-layer [data-part="hc05"]').click({force:true});await select();
  assert.equal(await win.inputValue('#extra-airLoss'),'30');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a connected NUCLEO becomes the run target, the run button lists the targets, and builds default to Release',{timeout:120000},async()=>{
 const s=await launch({env:{CIRCUIT_LAB_TEST_BOARDS:JSON.stringify([{serial:'TEST0001F103',board:'NUCLEO-F103RB',port:'COM9'}])}});
 try{
  const {win}=s;
  await win.waitForFunction(()=>document.getElementById('native-target').value==='arm',null,{timeout:15000});
  assert.equal(await win.evaluate(()=>document.getElementById('native-target').selectedOptions[0].dataset.serial),'TEST0001F103');
  assert.match(await logText(win),/실물 보드 NUCLEO-F103RB \(COM9\)가 연결되어 실행 대상을 실물 보드로 바꿨습니다/);
  assert.equal(await win.evaluate(()=>document.getElementById('native-config').value),'Release');
  // ▾ beside the title bar's run button: the same targets, the current one checked; choosing one changes the target.
  await win.click('#run-target-toggle');await win.waitForSelector('#run-target-menu:popover-open');
  const items=await win.evaluate(()=>[...document.querySelectorAll('#run-target-menu [role=menuitemradio]')].map(b=>[b.textContent,b.getAttribute('aria-checked')]));
  assert.deepEqual(items.find(([,c])=>c==='true'),['NUCLEO-F103RB (COM9)','true']);assert.ok(items.some(([t])=>t==='시뮬레이터'));
  await win.locator('#run-target-menu [role=menuitemradio]',{hasText:'시뮬레이터'}).click();
  assert.equal(await win.evaluate(()=>document.getElementById('native-target').value),'simulator');
  assert.match(await win.getAttribute('#run-target-toggle','title'),/실행 대상: 시뮬레이터/);
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a pin with a wire on it still shows its GPIO in the tooltip',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openBoardView(win);
  await win.click('[data-devboard-add="rpi5"]');await win.click('#zoom-reset');
  const center=async key=>{const b=await win.locator(`[data-endpoint$=":${key}"]`).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
  const tooltip=async key=>{const p=await center(key);await win.mouse.move(p.x,p.y);return win.evaluate(()=>{const tip=document.getElementById('tooltip');return tip.hidden?'':tip.textContent;});};
  assert.match(await tooltip('P40'),/40번 GPIO21/,'a free pin');
  for(const key of ['P3','P11']){const p=await center(key);await win.mouse.click(p.x,p.y);}
  await win.waitForFunction(()=>document.querySelectorAll('#wire-layer [data-wire]').length===1);
  assert.match(await tooltip('P3'),/3번 GPIO2/,'the wire start');
  assert.match(await tooltip('P11'),/11번 GPIO17/,'the wire end');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a Raspberry Pi lecture example runs its main.py and shows its output in the serial monitor',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'RPI-02');
  assert.equal(await win.evaluate(()=>document.querySelector('.language-badge').textContent),'RPI-1 · Raspberry Pi · Python');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[RPI-1\] LED OFF/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  assert.match(await logText(win),/다른 보드만 실행합니다/);
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','board:rpi');
  await win.waitForFunction(()=>/RPI-1 · Serial \(USB\)[\s\S]*LED ON/.test(document.getElementById('uart-output').textContent));
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('examples are grouped by board; a shell assignment reads serial monitor input; PWM dims the LED',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openExamples(win);
  const groups=()=>win.evaluate(()=>[...document.querySelectorAll('#hal-example-list .example-group')].map(g=>g.firstChild.textContent.trim()));
  assert.deepEqual(await groups(),['Raspberry Pi','STM32','ESP32']);
  // FW-09 uses an STM32 and an ESP32: listed in both groups.
  assert.equal(await win.locator('#hal-example-list [data-example="lecture:lecture-fw-09"]').count(),2);
  assert.ok(!/RPI-0|KER-0|라즈베리파이5/.test(await win.textContent('#hal-example-list')));
  await win.click('[data-example-board="esp32"]');assert.deepEqual(await groups(),['ESP32']);assert.equal(await win.locator('#hal-example-list [data-example]').count(),7);
  await win.click('[data-example-board="rpi"]');assert.deepEqual(await groups(),['Raspberry Pi']);assert.equal(await win.locator('#hal-example-list [data-example]').count(),15);
  await win.click('[data-example-board="all"]');
  // LED 제어 쉘: the serial monitor sends lines to the Raspberry Pi program.
  await applyLecture(win,'LED 제어 쉘');await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[RPI-1\] LED 번호/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  await win.click('[data-monitor="bus"]');await win.selectOption('#serial-target','board:rpi');
  await win.waitForFunction(()=>!document.getElementById('serial-send').disabled);
  await win.fill('#serial-input','2');await win.click('#serial-send');
  await win.waitForFunction(()=>/\[RPI-1\] 2번 LED ON/.test(document.getElementById('console-output').textContent),null,{timeout:10000});
  await win.waitForFunction(()=>Number(document.querySelector('#part-layer [data-part="LED2"] .led-glow')?.getAttribute('opacity'))>0,null,{timeout:10000});
  assert.equal(Number(await win.evaluate(()=>document.querySelector('#part-layer [data-part="LED1"] .led-glow').getAttribute('opacity'))),0);
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  // PWM LED: the glow follows the brightness steps instead of only on / off.
  await applyLecture(win,'RPI-03');await win.keyboard.press('Control+F5');const seen=new Set();
  for(let i=0;i<40&&seen.size<4;i++){const v=await win.evaluate(()=>document.querySelector('#part-layer [data-part="LED1"] .led-glow')?.getAttribute('opacity'));if(Number(v)>0)seen.add(v);await win.waitForTimeout(100);}
  assert.ok(seen.size>=3,[...seen].join(','));
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('FW-09: the STM32 sends I2C commands and the ESP32 fixed-run slave switches its LED',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'FW-09');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[ESP32-1\] I2C 수신 0 → LED OFF/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  assert.match(await logText(win),/ESP32에 1 보냄 \(status=0\)/);
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('BT-01: two boards pair their Bluetooth modules and exchange commands; the module shows its link',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'BT-01');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('[data-part-image="hc05-bluetooth-6"],[data-part-image="hc06-bluetooth-4"]').length),2);
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/answer: ACK ON/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  assert.match(await logText(win),/HC-05 paired/);assert.match(await logText(win),/\[STM32-2\] \[USART2 TX\] got: LED ON/);
  await win.locator('[data-part="hc05"]').click({force:true});
  await win.waitForFunction(()=>/연결됨 · HC-06/.test(document.getElementById('inspector').textContent));
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('WF-01: a station joins the other ESP-01 access point and sends commands over TCP',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'WF-01');
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/answer: ACK/.test(document.getElementById('console-output').textContent),null,{timeout:40000});
  assert.match(await logText(win),/WIFI GOT IP/);assert.match(await logText(win),/\[STM32-2\] \[USART2 TX\] got: LED ON/);
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('an ESP32 sketch is edited and run: the board follows the changed code',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'FW-08');
  assert.equal(await win.evaluate(()=>document.getElementById('code').readOnly),false);
  await win.evaluate(()=>{const code=document.getElementById('code');code.value=code.value.replace('Serial.println("LED ON");','Serial.println("켜짐");');code.dispatchEvent(new Event('input',{bubbles:true}));});
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[ESP32-1\] 켜짐/.test(document.getElementById('console-output').textContent),null,{timeout:20000});
  assert.match(await logText(win),/\[ESP32-1\] 스케치를 실행합니다/);
  await win.keyboard.press('Control+F2');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the ESP32 run target builds the board sketch with Arduino CLI; debugging is not offered',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await applyLecture(win,'FW-08');
  await win.click('#status-target');await win.selectOption('#native-target','esp32');
  assert.match(await win.textContent('.language-badge'),/ESP32-1 · Arduino CLI/);
  assert.equal(await win.locator('#native-config').isVisible(),false);
  assert.match(await win.textContent('#build-status'),/Arduino CLI → ESP32/);
  await win.keyboard.press('F10');
  await win.waitForFunction(()=>/ESP32 보드는 디버그를 지원하지 않습니다/.test(document.getElementById('console-output').textContent));
  // The target is saved with the project like the other run targets.
  await win.waitForFunction(()=>{try{return JSON.parse(localStorage.getItem('stm32lab.project.v2')).ide.native.target==='esp32';}catch{return false;}},null,{timeout:10000});
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
