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

test('a second STM32 board is added, edited by swapping with the main board, and runs with it',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openBoardView(win);
  // The start circuit has no board yet: put the NUCLEO-F103RB on the canvas, then add a NUCLEO-F446RE.
  await win.click('#empty-add-board');
  await win.click('#devboard-options [data-devboard-add="nucleo-f446re"]');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard="nucleo-f446re"] [data-button$=".USER"]').length),1);
  assert.equal(await win.textContent('#surface .board-title'),'STM32-1 · 편집 중');
  assert.match(await win.textContent('#inspector'),/STM32-2[\s\S]*이 보드 편집/);
  assert.match(await win.textContent('#explorer-circuit-summary'),/STM32 2개 \(편집: STM32-1\)/);
  const id=await win.evaluate(()=>document.querySelector('#devboard-layer [data-devboard="nucleo-f446re"]').dataset.part);
  assert.ok(await win.evaluate(i=>[...document.getElementById('source-file').options].some(o=>o.value==='stm32:'+i),id));
  // Editing STM32-2 makes it the main board: its F446RE main.c, its name on the board being edited.
  await win.click('#edit-board');
  await win.waitForFunction(()=>document.querySelector('#surface .board-title')?.textContent==='STM32-2 · 편집 중');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/STM32F446RE project/);
  assert.equal(await win.evaluate(()=>document.querySelector('.language-badge').textContent),'STM32-2 · STM32 HAL');
  assert.equal(await win.evaluate(()=>document.querySelector('#devboard-layer .devboard-name').textContent),'STM32-1');
  await win.evaluate(()=>{const code=document.getElementById('code');code.value=code.value.replace('printf("HAL ready\\n");','printf("board two\\n");');code.dispatchEvent(new Event('input',{bubbles:true}));});
  // Both boards run: the edited one as the main session, STM32-1 as its own session on the same circuit.
  await win.keyboard.press('Control+F5');
  await win.waitForFunction(()=>/\[STM32-1\] (\[USART2 TX\] )?HAL ready/.test(document.getElementById('console-output').textContent),null,{timeout:30000});
  const text=await logText(win);assert.match(text,/board two/);assert.match(text,/\[STM32-1\] HAL 프로그램을 시작했습니다/);
  // STM32-1's RESET restarts only that board.
  await win.locator('#devboard-layer [data-button$=".RESET"]').click({force:true});
  await win.waitForFunction(()=>/\[STM32-1\] RESET/.test(document.getElementById('console-output').textContent));
  assert.equal(await win.evaluate(()=>document.getElementById('shell').dataset.running),'true');
  await win.keyboard.press('Control+F2');await win.waitForFunction(()=>document.getElementById('shell').dataset.running==='false');
  // Switching back restores STM32-1's code; Undo returns to editing STM32-2.
  await win.selectOption('#source-file','stm32:'+id);
  await win.waitForFunction(()=>document.querySelector('#surface .board-title')?.textContent==='STM32-1 · 편집 중');
  assert.match(await win.evaluate(()=>document.getElementById('code').value),/STM32F103RB project/);
  await win.keyboard.press('Control+Z');
  await win.waitForFunction(()=>document.querySelector('#surface .board-title')?.textContent==='STM32-2 · 편집 중');
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

test('a pin of another STM32 board with a wire on it still shows its signal in the tooltip',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await win.click('#empty-add-board');await openBoardView(win);
  await win.click('#devboard-options [data-devboard-add="nucleo-f446re"]');await win.click('#zoom-reset');
  const center=async key=>{const b=await win.locator(`[data-endpoint^="devboard:"][data-endpoint$=":${key}"]`).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
  const tooltip=async key=>{const p=await center(key);await win.mouse.move(p.x,p.y);return win.evaluate(()=>{const tip=document.getElementById('tooltip');return tip.hidden?'':tip.textContent;});};
  assert.match(await tooltip('CN10:11'),/STM32-2 · CN10-11/,'a free pin');
  for(const key of ['CN7:1','CN7:2']){const p=await center(key);await win.mouse.click(p.x,p.y);}
  await win.waitForFunction(()=>document.querySelectorAll('#wire-layer [data-wire]').length===1);
  assert.match(await tooltip('CN7:1'),/STM32-2 · CN7-1 .*PC10/,'the wire start');
  assert.match(await tooltip('CN7:2'),/STM32-2 · CN7-2 .*PC11/,'the wire end');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('the parts search lists the other STM32 boards: NUCLEO is found there and added with one press',{timeout:120000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await win.click('#empty-add-board');
  await win.click('[data-activity="parts"]');if(!await win.locator('#view-parts').isVisible())await win.click('[data-activity="parts"]');
  await win.fill('#part-search','NUCLEO');
  const shown=()=>win.evaluate(()=>[...document.querySelectorAll('#part-list [data-devboard-add]')].filter(b=>!b.hidden).map(b=>b.dataset.devboardAdd).sort());
  assert.deepEqual(await shown(),['nucleo-f103rb','nucleo-f446re']);
  assert.equal(await win.locator('#part-no-results').isVisible(),false);assert.equal(await win.locator('#part-boards-heading').isVisible(),true);
  await win.click('#part-list [data-devboard-add="nucleo-f446re"]');
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard]').length),1);
  await win.fill('#part-search','뉴클레오');assert.deepEqual(await shown(),['nucleo-f103rb','nucleo-f446re']);
  await win.fill('#part-search','저항');assert.deepEqual(await shown(),[]);assert.equal(await win.locator('#part-boards-heading').isVisible(),false);
  await win.fill('#part-search','없는부품zzz');assert.equal(await win.locator('#part-no-results').isVisible(),true);
  await win.fill('#part-search','');assert.equal((await shown()).length>=2,true,'all boards listed after the parts without a search');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

// Feature 49: ESP32 / Raspberry Pi boards are not supported any more.
test('the example list has the STM32 and FPB-RA6E1 groups and no board filter; "esp" finds the ESP-01 module and no ESP32 board',{timeout:150000},async()=>{
 const s=await launch();
 try{
  const {win}=s;await openExamples(win);
  const groups=()=>win.evaluate(()=>[...document.querySelectorAll('#hal-example-list .example-group')].map(g=>g.firstChild.textContent.trim()));
  assert.equal(await win.locator('[data-example-board]').count(),0);
  assert.deepEqual(await groups(),['STM32']);
  assert.equal(await win.locator('#hal-example-list [data-example^="lecture:"]').count(),4);
  // An FPB-RA6E1 project lists its FSP examples.
  await win.evaluate(()=>document.getElementById('new').click());if(await win.evaluate(()=>document.getElementById('replace-dialog').open))await win.click('#replace-confirm');
  await win.waitForSelector('#project-dialog[open]');await win.selectOption('#new-project-board','fpb-ra6e1');await win.selectOption('#new-project-template','ra-blinky');
  await win.click('#project-create');await win.waitForFunction(()=>!document.getElementById('project-dialog').open);
  await openExamples(win);
  await win.waitForFunction(()=>[...document.querySelectorAll('#hal-example-list .example-group')].some(g=>g.firstChild.textContent.trim()==='FPB-RA6E1 · FSP'));
  assert.doesNotMatch(await win.textContent('#hal-example-list'),/ESP32|라즈베리파이/);
  await win.click('[data-activity="parts"]');if(!await win.locator('#view-parts').isVisible())await win.click('[data-activity="parts"]');
  const visible=selector=>win.evaluate(q=>[...document.querySelectorAll(q)].filter(b=>!b.hidden).map(b=>b.dataset.add??b.dataset.devboardAdd),selector);
  for(const query of ['esp','wifi','와이파이']){
   await win.fill('#part-search',query);
   assert.ok((await visible('#part-list [data-add]')).includes('ref_esp01_wifi_8'),query);assert.deepEqual(await visible('#part-list [data-devboard-add]'),[],query);
  }
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});

test('a project saved with an ESP32 board opens without it: a dialog says so, and the log keeps the same line',{timeout:120000},async()=>{
 const {projectForBoard}=await import('../../src/project.js');
 const p=projectForBoard('nucleo-f103rb');p.name='예전 회로';
 p.components.push({id:'esp',type:'devboard',model:'esp32-nodemcu-32s',name:'ESP32-1',x:900,y:300,rotation:0,code:'void setup(){}\nvoid loop(){}'});
 p.wires.push({id:'we1',from:'devboard:esp:R7',to:'board:CN7:1',color:'#23a68a'});
 const s=await launch();
 try{
  const {win}=s;
  await win.setInputFiles('#file-input',{name:'old.stm32lab',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});
  await win.waitForSelector('#removed-boards-dialog[open]');
  const message='이 버전은 ESP32·라즈베리파이 보드를 지원하지 않습니다. 보드 1개(ESP32-1)와 그 보드에 연결된 배선 1개를 빼고 열었습니다. STM32·FPB-RA6E1 보드와 나머지 부품은 그대로입니다.';
  assert.equal(await win.textContent('#removed-boards-dialog h2'),'지원하지 않는 보드를 뺐습니다');
  assert.equal(await win.textContent('#removed-boards-message'),message);
  await win.click('#removed-boards-confirm');
  await win.waitForFunction(()=>!document.getElementById('removed-boards-dialog').open);
  assert.equal(await win.evaluate(()=>document.querySelectorAll('#devboard-layer [data-devboard]').length),0);
  assert.equal(await win.evaluate(()=>document.getElementById('project-name').value),'예전 회로');
  assert.ok((await logText(win)).includes(message),'the log line');
  assert.deepEqual(s.errors,[]);
 }finally{await s.close();}
});
