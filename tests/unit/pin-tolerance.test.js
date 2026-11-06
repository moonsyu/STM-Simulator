// STM32 pin over-voltage: 5 V on a pin that is not 5 V tolerant (TT/TTa), more than 5.5 V on an FT pin, or an FT pin
// in analog mode above VDDA + 0.3 V is a circuit error in the 문제 tab, as the board guides warn ("5 V에 연결하면 핀 손상").
import test from 'node:test';
import assert from 'node:assert/strict';
import {pinStructure,pinLimit,overVoltagePins} from '../../src/pin-tolerance.js';
import {circuitDiagnostics} from '../../src/circuit-diagnostics.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {PINS,setActiveBoard} from '../../src/pins.js';

const header=signal=>PINS.find(p=>p.signal===signal).id;
const wired=(board,signal,supply='5V')=>{setActiveBoard(board);const p=projectForBoard(board);p.wires=[{id:'w1',from:header(supply),to:header(signal),color:'#d04040'}];return validateProject(p);};
const over=p=>circuitDiagnostics(p).filter(i=>i.id.startsWith('overvoltage:'));

test('I/O structure: F446RE pins are FT except PA4/PA5 (TTa); F103RB analog-capable ports and PB5/PC13-15 are not FT',()=>{
 assert.equal(pinStructure('STM32F446RE','PA0'),'FT');assert.equal(pinStructure('STM32F446RE','PA5'),'TTa');assert.equal(pinStructure('STM32F446RE','PC13'),'FT');
 assert.equal(pinStructure('STM32F103RB','PA0'),'TT');assert.equal(pinStructure('STM32F103RB','PB5'),'TT');assert.equal(pinStructure('STM32F103RB','PA9'),'FT');assert.equal(pinStructure('STM32F103RB','PB6'),'FT');
 assert.equal(pinStructure('R7FA6E10F','P000'),null);assert.equal(pinStructure('STM32F446RE','5V'),null);
 assert.equal(pinLimit({family:'STM32F446RE',pins:{}},'PA0').max,5.5);
 assert.equal(pinLimit({family:'STM32F446RE',pins:{PA0:{function:'ADC1_IN0'}}},'PA0').max,3.6,'FT in analog mode');
});

test('5 V wired to a TT pin is an error at that pin; on an FT pin it is allowed',()=>{
 const f103=over(wired('nucleo-f103rb','PA0'));
 assert.equal(f103.length,1);assert.equal(f103[0].severity,'error');assert.equal(f103[0].target.type,'endpoint');
 assert.match(f103[0].message,/^PA0\(A0\): 5\.00 V가 걸려 있습니다\. 5 V 비허용\(TT\) 핀이라 VDD \+ 0\.3 V = 3\.6 V까지 허용되어 핀이 손상될 수 있습니다/);
 assert.equal(over(wired('nucleo-f446re','PA5')).length,1,'PA5 (D13) is TTa on the F446RE');
 assert.deepEqual(over(wired('nucleo-f446re','PA0')),[],'PA0 is FT on the F446RE');
 assert.deepEqual(over(wired('nucleo-f103rb','PA9')),[],'PA9 is FT on the F103RB');
 assert.deepEqual(over(wired('nucleo-f103rb','PA0','3V3')),[],'3.3 V is fine on any pin');
 setActiveBoard('nucleo-f446re');
});

test('an FT pin used as an ADC input takes only 3.6 V',()=>{
 setActiveBoard('nucleo-f446re');const p=projectForBoard('nucleo-f446re');p.mcu.pins.PA0={function:'ADC1_IN0',pull:'NOPULL',edge:'FALLING',label:'',initial:0};
 const pins=[{id:'x',signal:'PA0',label:'A0'}];
 const [o]=overVoltagePins(p,pins,()=>5);assert.match(o.message,/아날로그\(ADC\) 모드에서는 5 V 허용\(FT\) 핀도 VDDA \+ 0\.3 V = 3\.6 V까지/);
 assert.match(overVoltagePins(p,pins,()=>-1)[0].message,/VSS - 0\.3 V/);
 assert.deepEqual(overVoltagePins(projectForBoard('fpb-ra6e1'),pins,()=>5),[]);
});
