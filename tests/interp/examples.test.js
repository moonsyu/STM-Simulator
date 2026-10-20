import test from 'node:test';
import assert from 'node:assert/strict';
import {advance} from './helpers.js';
import {ADVANCED_EXAMPLES,ADVANCED_GUIDES} from '../../src/advanced-examples.js';
import {HAL_EXAMPLES,allHalExamples,allHalGuides,applyHalExample,halExample} from '../../src/hal-examples.js';
import {searchHalExamples} from '../../src/hal-example-search.js';
import {blankProject,validateProject} from '../../src/project.js';
import {SimulationSession} from '../../src/session.js';

const start=kind=>{const p=validateProject(applyHalExample(blankProject(),kind)),output=[],warnings=[];const s=new SimulationSession(p,{print:x=>output.push(x),warn:x=>warnings.push(x)});s.tick(0);return {p,s,output,warnings};};
test('new interpreter examples are registered, guided in Korean and found by the example search',()=>{
 assert.equal(Object.keys(ADVANCED_EXAMPLES).length,7);for(const k of Object.keys(ADVANCED_EXAMPLES)){assert.ok(allHalExamples()[k]&&allHalGuides()[k]===ADVANCED_GUIDES[k]);assert.ok(!HAL_EXAMPLES[k]);assert.match(ADVANCED_EXAMPLES[k],/^HAL · /);assert.match(ADVANCED_GUIDES[k],/[가-힣]/);}
 for(const [query,id]of [['DMA 에코','dma_uart_echo'],['ADC DMA','adc_dma_scan'],['NVIC 선점','nvic_preemption'],['USART 동기','usart_sync_matrix'],['DCMI','camera_tft'],['FatFs','sd_logger'],['노이즈','noise_errors'],['HAL_UARTEx_ReceiveToIdle_DMA','dma_uart_echo'],['f_printf','sd_logger']])assert.ok(searchHalExamples(query).some(x=>x.id===id),query);
});
test('every new example applies to a document, validates and runs without electrical faults',()=>{
 for(const k of Object.keys(ADVANCED_EXAMPLES)){const {p,s}=start(k);assert.equal(p.name,'새 회로');assert.equal(p.firmware.mode,'hal');advance(s,300,10);assert.equal(s.result.fault,false,k);assert.deepEqual(halExample(k).mcu,validateProject(halExample(k)).mcu);}
});
test('DMA UART echo, ADC DMA scan and synchronous USART examples behave as described',()=>{
 const e=start('dma_uart_echo');advance(e.s,20);e.s.inject('hello DMA','USART2');advance(e.s,40);assert.match(e.s.buses.vcpOutput,/hello DMA$/);assert.ok(e.output.some(x=>/^RX event: 9 bytes/.test(x)));
 const a=start('adc_dma_scan');advance(a.s,1100,10);assert.ok(a.output.some(x=>/^X=20\d\d Y=20\d\d/.test(x)),a.output.join('|'));
 const u=start('usart_sync_matrix');advance(u.s,300,5);const ram=u.s.result.parts.demo.device.ram;assert.ok(ram.every(v=>(v&0x81)===0x81),JSON.stringify([...ram]));assert.equal(u.s.result.parts.demo.on,true);
});
test('NVIC example: the USER button preempts the long TIM2 callback',()=>{
 const n=start('nvic_preemption');advance(n.s,108,2);n.s.setPressed({USER:true});advance(n.s,140,2);n.s.setPressed({});
 assert.ok(n.output.includes('EXTI PC13: TIM2 callback preempted'),n.output.join('|'));assert.ok(n.output.some(x=>/long work end \(preempted=1\)/.test(x)));
});
test('camera, SD logger and noise examples produce frames, files and handled errors',()=>{
 const c=start('camera_tft');advance(c.s,800,4);assert.ok(c.output.some(x=>/shown on TFT/.test(x)));assert.ok(c.s.result.parts.cam.frame.rgba.length===160*120*4);
 const d=start('sd_logger');advance(d.s,2700,10);assert.ok(d.s.storage.files('demo').some(f=>f.path==='/LOG.TXT'));assert.ok(d.output.some(x=>x.startsWith('first line: t=')));
 const z=start('noise_errors');assert.equal(z.p.simulation.noise.enabled,true);advance(z.s,30);for(let i=0;i<6;i++){z.s.inject('The quick brown fox jumps over the lazy dog 0123456789','USART2');advance(z.s,z.s.runtime.time+80);}
 advance(z.s,1100,10);assert.ok(z.output.some(x=>/^UART error:( FE| PE| NE)+$/.test(x)),z.output.slice(-5).join('|'));assert.ok(z.output.some(x=>/^I2C ok=\d+ retries=\d+/.test(x)));
});
