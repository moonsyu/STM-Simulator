// The app's Rust code as WebAssembly (rust/stm-core → src/rust/stm-core.wasm.js, src/rust-core.js), and feature 53:
// the GPIO pins of an MCU family are the family's own, whichever board is on the screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {rustCall,familyGpioPins} from '../../src/rust-core.js';
import {SOURCE_HASH} from '../../src/rust/stm-core.wasm.js';
import {rustSourceHash} from '../../scripts/rust-source-hash.mjs';
import {FAMILIES,familyProfile} from '../../src/mcu-family.js';
import {setActiveBoard,boardPins,GPIO_PINS} from '../../src/pins.js';
import {validateMcu,defaultMcu,pinFunctions} from '../../src/mcu-config.js';
import {blankProject,projectForBoard,validateProject,hasBoardChanges} from '../../src/project.js';
import {resetBoardConfiguration} from '../../src/board-reset.js';
import {BOARD_CATALOG} from '../../src/boards.js';

test('the committed WebAssembly was built from the Rust sources in the tree (npm run build:rust after a Rust change)',()=>{
 assert.equal(SOURCE_HASH,rustSourceHash());
});

test('rustCall: a result, an error with the function\'s message, text beyond ASCII, many calls',()=>{
 assert.deepEqual(rustCall('families'),['STM32F446RE','STM32F103RB']);
 assert.throws(()=>rustCall('family_gpio_pins',{family:'R7FA6E10F'}),/지원하지 않는 MCU입니다: R7FA6E10F/);
 assert.throws(()=>rustCall('family_gpio_pins',{family:'보드 ✓'}),/지원하지 않는 MCU입니다: 보드 ✓/);
 assert.throws(()=>rustCall('no_such_function'),/알 수 없는 함수입니다: no_such_function/);
 for(let i=0;i<2000;i++)assert.equal(rustCall('family_gpio_pins',{family:'STM32F103RB'}).length,51);
});

test('family GPIO pins: the lists of each NUCLEO board\'s headers, frozen and not shared',()=>{
 const headers=id=>[...new Set(boardPins(id).map(p=>p.mcu??p.signal).filter(s=>/^P[A-H]\d+$/.test(s)))].sort();
 assert.deepEqual([...familyGpioPins('STM32F446RE')],headers('nucleo-f446re'));
 assert.deepEqual([...familyGpioPins('STM32F103RB')],headers('nucleo-f103rb'));
 assert.equal(FAMILIES.STM32F446RE.gpioPins.length,50);assert.equal(FAMILIES.STM32F103RB.gpioPins.length,51);
 assert.ok(Object.isFrozen(FAMILIES.STM32F446RE.gpioPins));
 assert.notEqual(FAMILIES.STM32F446RE.gpioPins,GPIO_PINS,'not the array pins.js rewrites');
 assert.notEqual(familyGpioPins('STM32F446RE'),familyGpioPins('STM32F446RE'));
});

test('feature 53: with any board on the screen every family keeps its pins, so a project of any board can be made',()=>{
 try{
  for(const board of Object.values(BOARD_CATALOG)){
   setActiveBoard(board.id);
   assert.equal(familyProfile('STM32F446RE').gpioPins.length,50,`F446RE pins while ${board.id} is shown`);
   assert.equal(familyProfile('STM32F103RB').gpioPins.length,51,`F103RB pins while ${board.id} is shown`);
   assert.ok(pinFunctions('PA2','STM32F446RE').includes('USART2_TX'));
   // PH0 is an F446RE pin and PB11 an F103RB pin, whatever board is shown.
   assert.doesNotThrow(()=>validateMcu({...defaultMcu('STM32F446RE'),pins:{PH0:{function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'',initial:0}}}));
   assert.doesNotThrow(()=>validateMcu({...defaultMcu('STM32F103RB'),pins:{PB11:{function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'',initial:0}}}));
   assert.throws(()=>validateMcu({...defaultMcu('STM32F103RB'),pins:{PH0:{function:'GPIO_Output',pull:'NOPULL',edge:'FALLING',label:'',initial:0}}}),/PH0: STM32F103RB에서 지원하지 않는 핀 기능입니다/);
   // What the board picker does before changing the board: compare the project with the default ones.
   assert.doesNotThrow(()=>blankProject());
   for(const from of Object.values(BOARD_CATALOG)){
    const project=validateProject(projectForBoard(from.id));
    assert.equal(hasBoardChanges(project),false,`${from.id} fresh, ${board.id} shown`);
    assert.equal(hasBoardChanges(resetBoardConfiguration(project)),true);
    for(const to of Object.values(BOARD_CATALOG))assert.equal(validateProject(projectForBoard(to.id)).boardId,to.id,`${from.id} → ${to.id} while ${board.id} is shown`);
   }
  }
 }finally{setActiveBoard('nucleo-f446re');}
});
