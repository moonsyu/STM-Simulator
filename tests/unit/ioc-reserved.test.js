// A pin whose CubeMX signal the model does not run (CAN, I2S, DCMI …) is imported as Reserved. It keeps the signal
// name, so exporting the settings writes the pin back; a Reserved pin with no known signal (set by an example) is
// reported instead of being dropped without a word.
import test from 'node:test';
import assert from 'node:assert/strict';
import {importIoc,validateMcu,defaultMcu} from '../../src/mcu-config.js';
import {exportIoc,unexportedPins} from '../../src/ioc-export.js';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject} from '../../src/project.js';

const IOC=['Mcu.Family=STM32F4','Mcu.Name=STM32F446R(C-E)Tx','Mcu.UserName=STM32F446RETx','Mcu.Pin0=PB8','Mcu.Pin1=PB9','Mcu.Pin2=PA5','Mcu.PinsNb=3',
 'PB8.Signal=CAN1_RX','PB8.Mode=CAN_Activate','PB9.Signal=CAN1_TX','PB9.Mode=CAN_Activate','PA5.Signal=GPIO_Output'].join('\n');

test('an unsupported signal survives import → export → import',()=>{
 const first=importIoc(IOC);
 assert.deepEqual(first.config.pins.PB8,{function:'Reserved',pull:'NOPULL',edge:'FALLING',label:'',initial:0,signal:'CAN1_RX'});
 assert.ok(first.warnings.some(w=>/PB8: CAN1_RX 실행 모델 미지원/.test(w)));
 const text=exportIoc(first.config);
 assert.match(text,/^PB8\.Signal=CAN1_RX$/m);assert.match(text,/^PB9\.Signal=CAN1_TX$/m);assert.match(text,/^Mcu\.PinsNb=3$/m);
 const second=importIoc(text);
 assert.deepEqual(Object.keys(second.config.pins),['PB8','PB9','PA5']);assert.equal(second.config.pins.PB9.signal,'CAN1_TX');
 assert.deepEqual(unexportedPins(first.config),[]);
});

test('the signal is only for Reserved pins and must be a name; a Reserved pin without one is reported',()=>{
 const pin=fn=>({function:fn,pull:'NOPULL',edge:'RISING',label:'',initial:0});
 const base=defaultMcu('STM32F446RE');
 assert.equal(validateMcu({...base,pins:{PB8:{...pin('Reserved'),signal:'CAN1_RX'}}}).pins.PB8.signal,'CAN1_RX');
 assert.throws(()=>validateMcu({...base,pins:{PA5:{...pin('GPIO_Output'),signal:'CAN1_RX'}}}),/PA5: 신호 이름을 확인하세요/);
 for(const signal of ['','bad name','1X','A=B',5])assert.throws(()=>validateMcu({...base,pins:{PB8:{...pin('Reserved'),signal}}}),/PB8: 신호 이름을 확인하세요/,String(signal));
 // The examples name the signal of their Reserved pins (CAN, I2S, MCO), so those are written too.
 const can=applyHalExample(blankProject(),'ref_can_transceiver_6').mcu;
 assert.deepEqual(unexportedPins(can),[]);assert.match(exportIoc(can),/^PB8\.Signal=CAN1_RX$/m);assert.match(exportIoc(can),/^PB9\.Signal=CAN1_TX$/m);
 // A Reserved pin set by hand has no signal: left out of the file, and named.
 assert.deepEqual(unexportedPins({...base,pins:{PB8:pin('Reserved')}}),['PB8']);assert.doesNotMatch(exportIoc({...base,pins:{PB8:pin('Reserved')}}),/^PB8\./m);
 // The debug pins are written with their system signal, as before.
 const swd={...base,pins:{PA13:pin('Reserved'),PA14:pin('Reserved')}};assert.deepEqual(unexportedPins(swd),[]);assert.match(exportIoc(swd),/^PA13\.Signal=SYS_JTMS-SWDIO$/m);
});
