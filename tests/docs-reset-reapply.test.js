import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,execute} from '../scripts/docs-audit/runtime.mjs';
import {assess} from '../scripts/docs-audit/oracles.mjs';
import {applyDeviceExample} from '../src/device-assistance.js';
import {resetMainCode} from '../src/code-reset.js';
for(const type of ['board','breadboard','button','ref_button_2','ref_button_4','ref_button_module_3'])test('Docs reapply preserves custom labels and existing '+type+' circuit',()=>{
 const f=fixture(type),first=applyDeviceExample(f.project,f.target).project;
 for(const [pin,c]of Object.entries(first.mcu.pins))if(c.label)c.label='Custom_'+pin;
 const reset=resetMainCode(first),next=applyDeviceExample(reset,f.target).project;
 assert.deepEqual(next.components,first.components);assert.deepEqual(next.wires,first.wires);assert.deepEqual(next.mcu,first.mcu);
 const checks=assess(type,execute(next,{end:3500}));assert.ok(checks.passed,JSON.stringify(checks));
});
