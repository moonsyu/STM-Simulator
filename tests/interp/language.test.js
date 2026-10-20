import test from 'node:test';
import assert from 'node:assert/strict';
import {halProject,run} from './helpers.js';
import {compileHal} from '../../src/hal-source.js';

test('struct array fields, casts of arrays to integers and large HAL frame buffers',()=>{
 const p=halProject({globals:'struct Packet { uint8_t id; uint8_t data[4]; };\nuint32_t big[38400];\nstruct Packet pk = {7, {1, 2, 3, 4}};',init:'  struct Packet copy = pk; copy.data[0] = 9;\n  uint32_t addr = (uint32_t)big;\n  FILINFO info;\n  printf("%u %u %u %u %d\\n", pk.data[0], copy.data[0], (unsigned)sizeof(struct Packet), (unsigned)sizeof(info.fname), addr != 0);',loop:''});
 const {output}=run(p);assert.deepEqual(output,['1 9 5 13 1']);
 assert.throws(()=>compileHal('struct S { int a[0]; };\nint main(void){}'),/1~4096/);
});
test('FatFs/HAL typedef names parse (FRESULT, UINT, DWORD, FSIZE_t, IRQn_Type)',()=>{
 const p=halProject({globals:'FRESULT res = FR_OK; UINT n = 3; DWORD d = 4; FSIZE_t size = 5; IRQn_Type irq = TIM2_IRQn;',init:'  printf("%d %u %lu %lu\\n", res, n, d, size);',loop:''});
 assert.deepEqual(run(p).output,['0 3 4 5']);
});
