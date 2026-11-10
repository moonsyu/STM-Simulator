// Error cases of feature 13 found by probing random pinouts: a pin that is not on the board headers, many parts at
// once (more breadboards are added), and nothing to build.
import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestCircuit,buildCircuit} from '../../src/ioc-circuit.js';
import {blankProject,validateProject} from '../../src/project.js';
import {validateMcu} from '../../src/mcu-config.js';

const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0,...extra});

test('a pin without a header terminal (PA2 on a NUCLEO) is listed with the reason and not wired',()=>{
 const p=blankProject();p.mcu.pins={PA2:pin('ADC1_IN2'),PA4:pin('ADC1_IN4')};p.mcu.peripherals={ADC1:{enabled:true}};p.mcu=validateMcu(p.mcu);
 const list=suggestCircuit(p.mcu),by=Object.fromEntries(list.map(s=>[s.key,s]));
 assert.match(by.PA2.skipped,/PA2은 보드 헤더에 나와 있지 않아 배선할 수 없습니다/);assert.ok(!by.PA4.skipped);
 const built=validateProject(buildCircuit(p,list));
 assert.equal(built.components.filter(c=>c.type!=='breadboard').length,1,'only the potentiometer on PA4');
 assert.ok(built.wires.every(w=>typeof w.from==='string'&&typeof w.to==='string'));
});

test('sixteen outputs and inputs still give a valid circuit (more breadboards when one is full); nothing chosen gives no parts',()=>{
 const p=blankProject(),pins=['PA8','PA9','PA10','PB0','PB1','PB4','PB5','PB6','PC0','PC1','PC2','PC3','PC4','PC5','PC6','PC7'];
 p.mcu.pins=Object.fromEntries(pins.map((q,i)=>[q,i%2?pin('GPIO_Input',{pull:'PULLUP'}):pin('GPIO_Output')]));p.mcu=validateMcu(p.mcu);
 const list=suggestCircuit(p.mcu);assert.equal(list.filter(s=>!s.skipped).length,16);
 const built=validateProject(buildCircuit(p,list)),parts=built.components.filter(c=>c.type!=='breadboard');
 assert.equal(parts.length,24,'8 LEDs with resistors and 8 buttons');assert.ok(parts.every(c=>c.attachments||c.attachA),'all placed');
 assert.equal(buildCircuit(p,[]).components.length,0);
 assert.deepEqual(suggestCircuit(validateMcu({...blankProject().mcu,pins:{}})),[]);
});
