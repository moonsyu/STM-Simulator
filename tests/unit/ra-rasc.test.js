// Feature 22: RASC names and flow — IRQn-DS pin names, the IRQn / IRQn-DS shared-channel check, and the BSP tab's
// stack and heap sizes; a project file written before these settings still validates and generates the same code.
import test from 'node:test';
import assert from 'node:assert/strict';
import {RA_IRQ_PINS,RA_IRQ_DS,raIrqName,raDefaultMcu,validateRaMcu,RA_BSP_DEFAULTS} from '../../src/ra-config.js';
import {generateRaFiles} from '../../src/ra-generator.js';

test('pin interrupt names as RASC lists them: one IRQn-DS pin per channel, the others IRQn',()=>{
 assert.equal(raIrqName('P205'),'IRQ1-DS');assert.equal(raIrqName('P101'),'IRQ1');assert.equal(raIrqName('P104'),'IRQ1');
 assert.equal(raIrqName('P409'),'IRQ6');assert.equal(raIrqName('P000'),'IRQ6-DS');assert.equal(raIrqName('P408'),'IRQ7');assert.equal(raIrqName('P003'),'');
 const channels=RA_IRQ_DS.map(pin=>RA_IRQ_PINS[pin]);
 assert.ok(channels.every(ch=>Number.isInteger(ch)),'every -DS pin has an IRQ channel');
 assert.equal(new Set(channels).size,channels.length,'at most one -DS pin per channel');
});

test('IRQn and IRQn-DS are one channel: using both is refused with both names',()=>{
 const m=raDefaultMcu();m.pins.P101={function:'IRQ'};
 assert.throws(()=>validateRaMcu(m),/P101: IRQ1는 이미 P205\(IRQ1-DS\)에서 씁니다\. IRQ1와 같은 채널이라 함께 쓸 수 없습니다\./);
 const n=raDefaultMcu();delete n.pins.P205;n.pins.P409={function:'IRQ'};n.pins.P000={function:'IRQ'};
 assert.throws(()=>validateRaMcu(n),/IRQ6는 이미 P409\(IRQ6\)에서 씁니다\. IRQ6-DS와 같은 채널/);
 // Different channels are fine.
 const ok=raDefaultMcu();ok.pins.P409={function:'IRQ'};assert.equal(validateRaMcu(ok).pins.P409.callback,'external_irq6_callback');
});

test('BSP stack and heap sizes: kept when set, checked, written to bsp_cfg.h; an earlier project is unchanged',()=>{
 const old=validateRaMcu(raDefaultMcu());assert.equal(old.bsp,undefined);
 const cfg=mcu=>generateRaFiles(mcu)['ra_cfg/fsp_cfg/bsp/bsp_cfg.h'];
 assert.match(cfg(old),/#define BSP_CFG_STACK_MAIN_BYTES \(0x400\)\n#define BSP_CFG_HEAP_BYTES \(0x400\)/);
 assert.deepEqual(RA_BSP_DEFAULTS,{stackBytes:0x400,heapBytes:0x400});
 const m=validateRaMcu({...raDefaultMcu(),bsp:{stackBytes:0x800,heapBytes:0x1000}});assert.deepEqual(m.bsp,{stackBytes:0x800,heapBytes:0x1000});
 assert.match(cfg(m),/#define BSP_CFG_STACK_MAIN_BYTES \(0x800\)\n#define BSP_CFG_HEAP_BYTES \(0x1000\)/);
 assert.deepEqual(validateRaMcu({...raDefaultMcu(),bsp:{heapBytes:0}}).bsp,{stackBytes:0x400,heapBytes:0});
 for(const bsp of [{stackBytes:0x801},{stackBytes:0x80},{heapBytes:-8},{heapBytes:0x40000},{stackBytes:NaN},[],'x'])assert.throws(()=>validateRaMcu({...raDefaultMcu(),bsp}),/stack size|Heap size|BSP 설정/,JSON.stringify(bsp));
});
