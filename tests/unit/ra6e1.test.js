// FPB-RA6E1 (Renesas RA6E1): MCU settings, the RASC-style generated FSP files, board pins, the project model.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RA6E1_PORTS,RA_IRQ_PINS,raDefaultMcu,validateRaMcu,raPinName,raPortBit,FPB_RA6E1} from '../../src/ra-config.js';
import {generateRaFiles,pinCfgWord,raVectors,raHalEntry} from '../../src/ra-generator.js';
import {boardPins,boardSize,setActiveBoard,PINS,GPIO_PINS,BOARD,PIN_BY_ID,ALL_GPIO_PINS} from '../../src/pins.js';
import {projectForBoard,validateProject,blankProject} from '../../src/project.js';
import {resetMainCode} from '../../src/code-reset.js';
import {resetBoardConfiguration} from '../../src/board-reset.js';
import {getBoard} from '../../src/boards.js';
import {DEVBOARD_MODELS} from '../../src/devboards.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';

test('RA6E1 LQFP100: 76 ports, IRQ channels from Table 1.16, pin names and port/bit',()=>{
 assert.equal(RA6E1_PORTS.length,76);assert.equal(new Set(RA6E1_PORTS).size,76);
 assert.equal(RA_IRQ_PINS.P205,1);assert.equal(RA_IRQ_PINS.P409,6);assert.equal(RA_IRQ_PINS.P104,1);assert.equal(RA_IRQ_PINS.P407,undefined);
 assert.ok(Object.keys(RA_IRQ_PINS).every(p=>RA6E1_PORTS.includes(p)));
 assert.equal(raPinName('BSP_IO_PORT_04_PIN_08'),'P408');assert.equal(raPinName('p205'),'P205');
 assert.deepEqual(raPortBit('P408'),{port:4,bit:8});assert.deepEqual(raPortBit('P015'),{port:0,bit:15});
 assert.equal(FPB_RA6E1.leds.LED1,'P408');assert.equal(FPB_RA6E1.arduino.D13,'P102');assert.equal(FPB_RA6E1.arduino.SDA,'P401');
});

test('validateRaMcu checks ports, locked pins, modes, unique symbols and IRQ channels, and the clock limits',()=>{
 const ok=validateRaMcu(raDefaultMcu());assert.deepEqual(Object.keys(ok.pins).sort(),['P205','P407','P408']);
 assert.equal(ok.pins.P205.callback,'external_irq1_callback');assert.equal(ok.pins.P205.pull,'PULLUP');
 const bad=pins=>()=>validateRaMcu({family:'R7FA6E10F',pins});
 assert.throws(bad({P999:{function:'GPIO_Output'}}),/없는 핀/);
 assert.throws(bad({P300:{function:'GPIO_Output'}}),/SWCLK/);
 assert.throws(bad({P407:{function:'IRQ'}}),/IRQ\) 핀이 아닙니다/);
 assert.throws(bad({P205:{function:'IRQ'},P104:{function:'IRQ'}}),/IRQ1는 이미 P205/);
 assert.throws(bad({P408:{function:'GPIO_Output',label:'LED'},P407:{function:'GPIO_Output',label:'LED'}}),/겹치지 않는 C 식별자/);
 assert.throws(bad({P408:{function:'GPIO_Output',label:'1LED'}}),/C 식별자/);
 assert.throws(()=>validateRaMcu({...raDefaultMcu(),clock:{pllMul:30}}),/PLL 300 MHz/);
 assert.deepEqual(validateRaMcu({...raDefaultMcu(),clock:{pllMul:18}}).clock,{pllMul:18});
});

test('generated FSP files: pin table, bsp_pin_cfg symbols, IRQ1 instance, vector table and event link, linker script',()=>{
 const files=generateRaFiles(raDefaultMcu());
 for(const f of ['ra_gen/hal_data.c','ra_gen/hal_data.h','ra_gen/common_data.c','ra_gen/pin_data.c','ra_gen/vector_data.c','ra_gen/vector_data.h','ra_gen/bsp_clock_cfg.h','ra_gen/main.c','ra_gen/bsp_linker_info.h','ra_cfg/fsp_cfg/bsp/bsp_cfg.h','ra_cfg/fsp_cfg/bsp/bsp_mcu_family_cfg.h','ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h','ra_cfg/fsp_cfg/r_icu_cfg.h','script/fsp.ld','script/memory_regions.ld'])assert.ok(files[f],f);
 assert.match(files['ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h'],/#define LED1 \(BSP_IO_PORT_04_PIN_08\)/);
 assert.match(files['ra_cfg/fsp_cfg/bsp/bsp_pin_cfg.h'],/#define SW1 \(BSP_IO_PORT_02_PIN_05\)/);
 assert.match(files['ra_gen/pin_data.c'],/\.pin = BSP_IO_PORT_02_PIN_05,\s*\.pin_cfg = \(\(uint32_t\) \(uint32_t\) IOPORT_CFG_IRQ_ENABLE \| \(uint32_t\) IOPORT_CFG_PORT_DIRECTION_INPUT \| \(uint32_t\) IOPORT_CFG_PULLUP_ENABLE\)/);
 assert.match(files['ra_gen/hal_data.c'],/const external_irq_cfg_t g_external_irq1_cfg =[\s\S]*\.channel\s+= 1,[\s\S]*EXTERNAL_IRQ_TRIGGER_FALLING[\s\S]*\.p_callback\s+= external_irq1_callback/);
 assert.match(files['ra_gen/vector_data.h'],/#define VECTOR_NUMBER_ICU_IRQ1 \(\(IRQn_Type\) 0\)/);assert.match(files['ra_gen/vector_data.h'],/#define BSP_ICU_VECTOR_NUM_ENTRIES \(1\)/);
 assert.match(files['ra_gen/vector_data.c'],/\[0\] = r_icu_isr[\s\S]*\[0\] = BSP_PRV_VECT_ENUM\(EVENT_ICU_IRQ1,GROUP0\)/);
 assert.match(files['ra_gen/bsp_clock_cfg.h'],/BSP_CFG_PLL_MUL BSP_CLOCKS_PLL_MUL\(20,0\)/);
 assert.match(files['script/memory_regions.ld'],/FLASH_LENGTH = 0x00100000;[\s\S]*RAM_LENGTH|RAM_LENGTH = 0x00040000;/);
 assert.match(files['script/fsp.ld'],/__ram_main_stack\$\$[\s\S]*\*\(\.bss\.g_main_stack\)[\s\S]*__ram_zero\$\$/,'the stack is outside the zeroed range');
 assert.equal(pinCfgWord({function:'GPIO_Output',initial:1,drive:'HIGH'}),'((uint32_t) (uint32_t) IOPORT_CFG_PORT_DIRECTION_OUTPUT | (uint32_t) IOPORT_CFG_PORT_OUTPUT_HIGH | (uint32_t) IOPORT_CFG_DRIVE_HIGH)');
 assert.equal(raVectors({pins:{}}).length,0);
 assert.match(generateRaFiles({family:'R7FA6E10F',pins:{}})['ra_gen/vector_data.h'],/VECTOR_DATA_IRQ_COUNT\s+\(0\)/);
 assert.match(raHalEntry(),/void hal_entry\(void\)[\s\S]*R_IOPORT_Open \(&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME\);/);
});

test('FPB-RA6E1 board: Arduino headers on the 55 x 95 mm outline, active-board pins, no second-board model',()=>{
 const pins=boardPins('fpb-ra6e1');assert.equal(pins.length,32);
 const by=label=>pins.find(p=>p.label===label);
 assert.equal(by('D13').signal,'P102');assert.equal(by('A0').signal,'P000');assert.equal(by('D0').signal,'P110');assert.equal(by('IOREF').signal,'3V3');
 assert.equal(by('D1').y-by('D0').y,-14,'2.54 mm pitch');assert.ok(Math.abs((by('D7').y-by('D8').y)-4.064*14/2.54)<1e-6,'160 mil gap between D7 and D8');
 assert.ok(Math.abs((by('D0').x-by('A5').x)-48.26*14/2.54)<1e-6,'48.26 mm between the rows');
 assert.ok(pins.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&PIN_BY_ID.has(p.id)));
 assert.ok(ALL_GPIO_PINS.includes('P408'));
 setActiveBoard('fpb-ra6e1');
 assert.equal(PINS.length,32);assert.ok(GPIO_PINS.includes('P102'));assert.ok(Math.abs(BOARD.w-55*14/2.54)<1e-9&&Math.abs(BOARD.h-95*14/2.54)<1e-9);
 setActiveBoard('nucleo-f446re');assert.ok(PINS.length>32);assert.deepEqual({w:BOARD.w,h:BOARD.h},boardSize('nucleo-f446re'));
 assert.equal(getBoard('fpb-ra6e1').vendor,'renesas');assert.equal(DEVBOARD_MODELS['fpb-ra6e1'],undefined);
});

test('an FPB-RA6E1 project is an FSP project; resets keep it one; the vendors do not mix',()=>{
 const p=projectForBoard('fpb-ra6e1');
 assert.equal(p.firmware.mode,'fsp');assert.equal(p.mcu.family,'R7FA6E10F');assert.match(p.code,/hal_entry/);
 assert.doesNotThrow(()=>validateProject(p));
 assert.throws(()=>validateProject({...p,firmware:{mode:'hal',files:[]}}),/FSP 프로젝트로/);
 assert.throws(()=>validateProject({...blankProject(),firmware:{mode:'fsp',files:[]}}),/Renesas RA 보드에서만/);
 assert.throws(()=>validateProject({...p,boardId:'nucleo-f446re'}),/핀 설정이 필요합니다/);
 assert.match(resetMainCode({...p,code:'int x;'}).code,/void hal_entry\(void\)/);
 const reset=resetBoardConfiguration({...p,mcu:{family:'R7FA6E10F',pins:{}}});assert.deepEqual(Object.keys(reset.mcu.pins).sort(),['P205','P407','P408']);assert.equal(reset.firmware.mode,'fsp');
 for(const ex of RA_EXAMPLES)assert.doesNotThrow(()=>validateProject({...p,mcu:ex.mcu(),code:ex.code}),ex.id);
});
