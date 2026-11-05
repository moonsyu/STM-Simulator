// The firmware emulator (ARM GCC ELF) graphs globals the way STM Studio does: the ELF gives each global's address,
// the emulated RAM gives its value every sample interval.
import test from 'node:test';
import assert from 'node:assert/strict';
import {open,runUntil} from './helpers.mjs';

test('adc_dma: the ELF build graphs a callback counter and a DMA-written array element; a struct is an error',()=>{
 const {session}=open('adc_dma',{},p=>{p.ide={breakpoints:[],watches:[],plots:['fullCount','adc[0]','hadc1','no_such_global']};});
 runUntil(session,600);
 const by=name=>session.vars.series.find(x=>x.name===name),count=by('fullCount').points;
 assert.ok(count.length>=50,'about every 10 ms: '+count.length);
 assert.ok(count.every((p,i)=>i===0||p[0]-count[i-1][0]>=10000));
 for(let i=1;i<count.length;i++)assert.ok(count[i][1]>=count[i-1][1],'the counter never goes down');
 assert.ok(count.at(-1)[1]>count[0][1],'the DMA complete callback keeps counting');
 const adc=by('adc[0]');assert.equal(adc.error,'');assert.ok(adc.value>=0&&adc.value<=4095,'12-bit ADC value: '+adc.value);
 assert.match(by('hadc1').error,/숫자 하나/);assert.match(by('no_such_global').error,/알 수 없는 식/);
});
