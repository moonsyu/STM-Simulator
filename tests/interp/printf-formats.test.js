// Feature 4 (printf with floats) — the built-in interpreter prints what C prints, so a program shows the same text as
// its ARM GCC build. Found by the error-case pass: a value exactly between two digits (2.5 with %.0f, 0.25 with %.1f)
// was rounded up, where C rounds to the even digit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pin,halProject,run,advance} from './helpers.js';
import {cFixed,cExponential} from '../../src/hal-stdio.js';

const uart={pins:{PA2:pin('USART2_TX'),PA3:pin('USART2_RX')},peripherals:{USART2:{enabled:true,baud:115200}}};
function printed(format,args){
 const p=halProject({...uart,globals:'char buf[96]; int n; int done = 0; float fx = 0.1f;',loop:`    if (!done) {\n      done = 1;\n      n = snprintf(buf, sizeof(buf), "${format}\\n"${args?', '+args:''}); HAL_UART_Transmit(&huart2, (uint8_t*)buf, n, 100);\n    }\n    HAL_Delay(100);`});
 const {s}=run(p);advance(s,150);return (s.buses.vcpOutput||'').split('\n')[0];
}

test('ties round to even as in C: %.0f, %.1f, %e and %g',()=>{
 assert.equal(cFixed(2.5,0),'2');assert.equal(cFixed(3.5,0),'4');assert.equal(cFixed(0.5,0),'0');assert.equal(cFixed(1.5,0),'2');assert.equal(cFixed(-2.5,0),'-2');
 assert.equal(cFixed(0.25,1),'0.2');assert.equal(cFixed(0.75,1),'0.8');assert.equal(cFixed(0.125,2),'0.12');assert.equal(cFixed(0.375,2),'0.38');
 // Not ties: the binary value is a little above or below, and that decides.
 assert.equal(cFixed(0.35,1),'0.3');assert.equal(cFixed(0.005,2),'0.01');assert.equal(cFixed(1.005,2),'1.00');assert.equal(cFixed(99.95,1),'100.0');assert.equal(cFixed(-0.001,2),'-0.00');
 assert.equal(cExponential(25000,0),'2e+4');assert.equal(cExponential(35000,0),'4e+4');assert.equal(cExponential(15000,0),'2e+4');
 assert.equal(cExponential(9.995,2),'9.99e+0','9.995 is below the tie in binary');assert.equal(cExponential(9.9951,2),'1.00e+1','a carry into a new digit');
 assert.equal(cExponential(1000,3),'1.000e+3');assert.equal(cExponential(0.001,1),'1.0e-3');assert.equal(cExponential(1e-7,2),'1.00e-7');assert.equal(cExponential(-12345.678,6),'-1.234568e+4');
 // Everything that is not a tie agrees with toFixed / toExponential.
 let seed=12345;const random=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
 for(let i=0;i<4000;i++){const v=(random()-0.5)*10**Math.floor(random()*12-4),p=Math.floor(random()*7);
  if(Number.isInteger(v*10**p*2))continue;
  assert.equal(cFixed(v,p),v.toFixed(p),`${v} %.${p}f`);assert.equal(cExponential(v,p),v.toExponential(p),`${v} %.${p}e`);}
});

test('a program prints the C text for widths, flags, precisions and conversions',()=>{
 for(const [format,args,want]of [
  ['%.0f %.0f %.0f','2.5, 3.5, 0.5','2 4 0'],['%.1f %.1f','0.25, 0.35','0.2 0.3'],['%.0e %.0e','25000.0, 35000.0','2e+04 4e+04'],['%.1g %.1g','2.5, 0.25','2 0.2'],
  ['%5.2f|','3.14159',' 3.14|'],['%-6d|','42','42    |'],['%05d|','-42','-0042|'],['%x %X','255, 255','ff FF'],['%08.3f|','-3.5','-003.500|'],['%+d %+d','5, -5','+5 -5'],
  ['%e','12345.678','1.234568e+04'],['%g %g %g','0.0001, 0.00001, 123456789.0','0.0001 1e-05 1.23457e+08'],['%g %g','100000.0, 1000000.0','100000 1e+06'],
  ['%c%c','65, 66','AB'],['100%%','','100%'],['%.3s|','"abcdef"','abc|'],['%10s|','"hi"','        hi|'],['%-10s|','"hi"','hi        |'],['%5.3s|','"abcdef"','  abc|'],
  ['%u','(uint32_t)-1','4294967295'],['%x','-1','ffffffff'],['%d','(int8_t)-1','-1'],['%lu %ld','(unsigned long)3000000000UL, (long)-7','3000000000 -7'],['%hhu %hd','(uint8_t)300, (int16_t)70000','44 4464'],
  ['%.2f %.2f','0.005, 1.005','0.01 1.00'],['%5.1f%%','99.95','100.0%'],['%f','0.1f','0.100000'],['%f','1.0/3.0','0.333333'],
  // More than 8 digits (once refused): a float is not 0.1, and 17 digits show a double exactly.
  ['%.10f','fx','0.1000000015'],['%.15g','0.1','0.1'],['%.17g','0.1','0.10000000000000001'],['%.12f','1.0/3.0','0.333333333333']
 ])assert.equal(printed(format,args),want,`${format} (${args})`);
 assert.throws(()=>printed('%.18f','0.1'),/정밀도는 17까지/);
});
