// Wiring quality of every HAL example as applied to a new project.
// Baseline numbers come from commit 39e1bf3 (before the netlist layout planner), measured
// with the same helpers: tests/fixtures/example-wiring-baseline.json → [wires, length, crossings, overlaps].
import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allHalExamples,applyHalExample,halExample} from '../../src/hal-examples.js';
import {blankProject,validateProject} from '../../src/project.js';
import {circuitDiagnostics} from '../../src/circuit-diagnostics.js';
import {wiringMetrics,netlist,unmountedLeads} from './helpers/wiring-metrics.js';

const BASELINE=JSON.parse(readFileSync(new URL('../fixtures/example-wiring-baseline.json',import.meta.url),'utf8'));
// Crossings that remain because a part's lead order is fixed by its package and is the
// reverse of the header pins the example uses (seven-segment and L298 pinouts), or because
// a large module (motor driver HAT) is mounted with bent leads by the general arranger, or because a package
// drawn at its datasheet size (four-digit display, L298 chips, the 70 mm battery holder and DC motors of the L298N
// and stepper examples) leaves less room around it.
// Pins and code are kept; each entry is the maximum number of crossing wire pairs.
const CROSSING_ALLOWLIST={
 ref_motor_driver_hat:4,ref_l298n_module_13:7,ref_l298n_bare_15:2,ref_l298p_bare_20:3,
 ref_sevenseg_common_anode_10:1,ref_sevenseg_4digit_12:11,
 l298n:4,ref_dc_motor_2:4,ref_dc_supply_2:4,ref_stepper_bipolar_4:2,
 // The real NUCLEO-64 header positions (UM1724): the Arduino CN5 rows sit 0.4 pitch off the morpho rows and the
 // board is narrower, so a few short I²C/SPI/control runs cross once or twice on the way to the breadboard.
 ref_sht31_grove_4:1,ref_encoder_module_5:1,ref_spi_eeprom_8:2,ref_urm09_i2c_4:1,ref_can_transceiver_6:1,
 ref_slide_dp3t_8:1,slide:1,oled:1,matrix:1,servo:1,motor:1,timer_encoder:1,spi:3,camera_tft:2
};
const kinds=Object.keys(allHalExamples());
const results=new Map();
function measure(kind){
 if(!results.has(kind)){
  const intended=netlist(halExample(kind)),project=applyHalExample(blankProject(),kind);
  results.set(kind,{project,intended,metrics:wiringMetrics(project)});
 }
 return results.get(kind);
}

describe('example wiring',()=>{
 for(const kind of kinds)test(kind,()=>{
  const {project,intended,metrics}=measure(kind);
  assert.deepEqual(validateProject(project).wires.length,project.wires.length,'project validates');
  assert.deepEqual(unmountedLeads(project),[],'every device lead sits in a breadboard hole');
  assert.deepEqual(netlist(project),intended,'signals reach the same MCU pins and part terminals');
  assert.deepEqual(circuitDiagnostics(project).filter(i=>i.severity==='error').map(i=>i.message),[],'no circuit errors');
  assert.deepEqual(metrics.overlaps,[],'no two wires run on top of each other');
  assert.ok(metrics.crossings.length<=(CROSSING_ALLOWLIST[kind]??0),`${metrics.crossings.length} crossings: ${JSON.stringify(metrics.crossings)}`);
  const [wires,,crossings]=BASELINE.examples[kind];
  assert.ok(metrics.wires<=wires,`wires ${metrics.wires} > baseline ${wires}`);
  assert.ok(metrics.crossings.length<=Math.max(crossings,CROSSING_ALLOWLIST[kind]??0),`crossings ${metrics.crossings.length} > baseline ${crossings}`);
 });
 test('totals improve on the 39e1bf3 baseline',t=>{
  const total={wires:0,length:0,crossings:0,overlaps:0};
  for(const kind of kinds){const {metrics}=measure(kind);total.wires+=metrics.wires;total.length+=metrics.length;total.crossings+=metrics.crossings.length;total.overlaps+=metrics.overlaps.length;}
  t.diagnostic(`examples ${kinds.length}: wires ${BASELINE.total.wires}→${total.wires}, length ${BASELINE.total.length}→${total.length}, crossings ${BASELINE.total.crossings}→${total.crossings}, overlaps ${BASELINE.total.overlaps}→${total.overlaps}`);
  assert.equal(Object.keys(BASELINE.examples).length,kinds.length,'baseline covers every example');
  assert.ok(total.wires<=BASELINE.total.wires*.7,'at least 30% fewer wires');
  assert.ok(total.length<=BASELINE.total.length*.6,'at least 40% less wire length');
  assert.ok(total.crossings<=BASELINE.total.crossings*.05,'crossings almost eliminated');
  assert.equal(total.overlaps,0);
 });
});
