// CubeMX Clock Configuration (mcu.clock): frequencies and limits from the CubeMX 6.18 database, the APB1 timer clock
// kept in step, SystemClock_Config / ADC prescaler in the generated main.c, and the RCC values a .ioc stores.
import test from 'node:test';
import assert from 'node:assert/strict';
import {clockFrequencies,clockTreeProblems,adcClockProblem,flashLatency,needsOverDrive,treeFromTimerHz,validateClockTree,clockTreeFromIoc,defaultClockTree} from '../../src/clock-tree.js';
import {CLOCK_PRESETS} from '../../src/clock-ui.js';
import {defaultMcu,validateMcu,configProblems,generateHal,importIoc} from '../../src/mcu-config.js';
import {clockPlan,clockPlanF1} from '../../src/hal-generator.js';

const F4='STM32F446RE',F1='STM32F103RB',MHz=1e6;
const preset=(family,id)=>CLOCK_PRESETS[family].find(p=>p.id===id).tree;

test('frequencies: F446 HSE 8 MHz PLL 180 MHz and F103 HSE PLL 72 MHz, with flash latency and over-drive',()=>{
 const q=clockFrequencies(F4,preset(F4,'max'));
 assert.deepEqual([q.vcoIn,q.vco,q.sysclk,q.hclk,q.pclk1,q.tim1,q.pclk2,q.tim2,q.adc],[2*MHz,360*MHz,180*MHz,180*MHz,45*MHz,90*MHz,90*MHz,180*MHz,22.5*MHz]);
 assert.equal(flashLatency(F4,q.hclk),5);assert.equal(needsOverDrive(F4,q.hclk),true);assert.deepEqual(clockTreeProblems(F4,preset(F4,'max')),[]);
 const b=clockFrequencies(F4,preset(F4,'board'));assert.deepEqual([b.sysclk,b.pclk1,b.tim1,b.pclk2],[84*MHz,42*MHz,84*MHz,84*MHz]);assert.equal(flashLatency(F4,b.hclk),2,'CubeMX board .ioc: FLASH_LATENCY_2');assert.equal(needsOverDrive(F4,b.hclk),false);
 const f=clockFrequencies(F1,preset(F1,'max'));
 assert.deepEqual([f.sysclk,f.pclk1,f.tim1,f.pclk2,f.tim2,f.adc],[72*MHz,36*MHz,72*MHz,72*MHz,72*MHz,12*MHz]);assert.equal(flashLatency(F1,f.hclk),2);
 assert.equal(clockFrequencies(F1,{...preset(F1,'max'),hsePrediv:2}).sysclk,36*MHz,'HSE / 2 × 9');
 assert.equal(clockFrequencies(F1,preset(F1,'board')).sysclk,64*MHz,'HSI / 2 × 16');
});

test('limits as CubeMX marks them red: VCO input/output, PLLCLK, SYSCLK, APB1/APB2, and ADC only with ADC1 on',()=>{
 const t=preset(F4,'max');
 assert.match(clockTreeProblems(F4,{...t,pllM:2}).join('\n'),/VCO input\) 4 MHz: 0\.95 MHz~2\.1 MHz/);
 assert.match(clockTreeProblems(F4,{...t,pllM:8,pllN:50}).join('\n'),/VCO 출력 50 MHz: 100 MHz~432 MHz/);
 assert.match(clockTreeProblems(F4,{...t,apb1:2}).join('\n'),/APB1\(PCLK1\) 90 MHz: 최대 45 MHz/);
 assert.match(clockTreeProblems(F4,{...t,pllN:200}).join('\n'),/SYSCLK 200 MHz: 최대 180 MHz/);
 assert.match(clockTreeProblems(F1,{...preset(F1,'max'),pllMul:16}).join('\n'),/PLLCLK 128 MHz: 72 MHz 이하/);
 assert.match(adcClockProblem(F1,{...preset(F1,'max'),adcPrescaler:2}),/ADC 클록 36 MHz: 최대 14 MHz/);
 const mcu=validateMcu({...defaultMcu(F1),clock:{...preset(F1,'max'),adcPrescaler:2}});
 assert.deepEqual(configProblems(mcu),[],'ADC1 off: the ADC clock is not checked');
 assert.match(configProblems({...mcu,peripherals:{ADC1:{enabled:true}}}).join('\n'),/ADC 클록 36 MHz/);
});

test('the older single APB1 timer clock stands for the same HSI trees the generator always built',()=>{
 for(const hz of [16e6,84e6,90e6,50e6]){const p=clockPlan(hz),q=clockFrequencies(F4,treeFromTimerHz(F4,hz));assert.equal(q.tim1,hz);assert.equal(q.pclk1,p.apb1===2?hz/2:hz);}
 for(const hz of [8e6,36e6,64e6]){const p=clockPlanF1(hz),q=clockFrequencies(F1,treeFromTimerHz(F1,hz));assert.equal(q.tim1,hz);assert.equal(q.pclk1,p.apb1===2?hz/2:hz);assert.ok(q.adc<=14e6);}
 assert.deepEqual(treeFromTimerHz(F4,16e6),defaultClockTree(F4));
});

test('validateMcu: a tree sets the APB1 timer clock; bad fields are refused; projects without one are unchanged',()=>{
 const v=validateMcu({...defaultMcu(F4),clock:preset(F4,'max')});assert.equal(v.timerClockHz,90e6);assert.deepEqual(v.clock,preset(F4,'max'));
 assert.throws(()=>validateMcu({...defaultMcu(F4),clock:{...preset(F4,'max'),pllP:3}}),/PLLP: 2\/4\/6\/8/);
 assert.throws(()=>validateMcu({...defaultMcu(F1),clock:{...preset(F1,'max'),pllMul:17}}),/PLLMul: 2~16/);
 assert.throws(()=>validateClockTree(F4,'fast'),/클록 설정이 올바르지 않습니다/);
 const old=validateMcu(defaultMcu(F4));assert.equal(old.clock,undefined);assert.equal(old.timerClockHz,16e6);
});

test('generated SystemClock_Config follows the tree (HSE BYPASS, PLL, dividers, latency, over-drive, ADC prescaler)',()=>{
 const f4=validateMcu({...defaultMcu(F4),clock:preset(F4,'max')});f4.peripherals.ADC1={enabled:true};f4.pins.PA0={function:'ADC1_IN0',pull:'NOPULL',edge:'RISING',label:'',initial:0};
 const s=generateHal(validateMcu(f4));
 for(const line of ['osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;','osc.HSEState = RCC_HSE_BYPASS;','osc.PLL.PLLSource = RCC_PLLSOURCE_HSE;','osc.PLL.PLLM = 4;','osc.PLL.PLLN = 180;','osc.PLL.PLLP = RCC_PLLP_DIV2;','HAL_PWREx_EnableOverDrive()','clk.APB1CLKDivider = RCC_HCLK_DIV4;','clk.APB2CLKDivider = RCC_HCLK_DIV2;','FLASH_LATENCY_5','ADC_CLOCK_SYNC_PCLK_DIV4'])assert.ok(s.includes(line),line);
 assert.match(s,/Clock: HSE PLL, SYSCLK 180 MHz, HCLK 180 MHz, APB1 45 MHz \(timers 90 MHz\), APB2 90 MHz \(timers 180 MHz\)/);
 assert.doesNotMatch(s,/RCC_OSCILLATORTYPE_HSI/);
 const f1=validateMcu({...defaultMcu(F1),clock:{...preset(F1,'max'),hsePrediv:2,pllMul:16}});f1.peripherals.ADC1={enabled:true};f1.pins.PA0={function:'ADC1_IN0',pull:'NOPULL',edge:'RISING',label:'',initial:0};
 const g=generateHal(validateMcu(f1));
 for(const line of ['osc.HSEState = RCC_HSE_BYPASS;','osc.HSEPredivValue = RCC_HSE_PREDIV_DIV2;','osc.PLL.PLLSource = RCC_PLLSOURCE_HSE;','osc.PLL.PLLMUL = RCC_PLL_MUL16;','FLASH_LATENCY_2','periph.AdcClockSelection = RCC_ADCPCLK2_DIV6;'])assert.ok(g.includes(line),line);
 assert.doesNotMatch(g,/PWR_REGULATOR/,'no voltage scaling on the F1');
 const hsi=generateHal(validateMcu({...defaultMcu(F4),clock:defaultClockTree(F4)}));assert.match(hsi,/RCC_OSCILLATORTYPE_HSI;\n  osc.HSIState = RCC_HSI_ON;/);assert.match(hsi,/RCC_PLL_OFF/);
});

test('.ioc RCC values: an HSE tree is kept as the Clock Configuration; the CubeMX board default stays the single setting',()=>{
 const f4='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nRCC.SYSCLKSource=RCC_SYSCLKSOURCE_PLLCLK\nRCC.PLLSourceVirtual=RCC_PLLSOURCE_HSE\nRCC.PLLM=4\nRCC.PLLN=180\nRCC.PLLQ=2\nRCC.APB1CLKDivider=RCC_HCLK_DIV4\nRCC.APB2CLKDivider=RCC_HCLK_DIV2\nRCC.APB1TimFreq_Value=90000000\n';
 const a=importIoc(f4);assert.deepEqual(a.config.clock,preset(F4,'max'));assert.equal(a.config.timerClockHz,90e6);assert.doesNotMatch(a.warnings.join('\n'),/HSI로 만들 수 없어/);
 const board='Mcu.Family=STM32F4\nMcu.UserName=STM32F446RETx\nRCC.SYSCLKSource=RCC_SYSCLKSOURCE_PLLCLK\nRCC.PLLN=336\nRCC.PLLP=RCC_PLLP_DIV4\nRCC.APB1CLKDivider=RCC_HCLK_DIV2\nRCC.APB1TimFreq_Value=84000000\n';
 const b=importIoc(board);assert.equal(b.config.clock,undefined,'HSI PLL 84 MHz: same clocks as the single setting');assert.equal(b.config.timerClockHz,84e6);
 const f1='Mcu.Family=STM32F1\nMcu.UserName=STM32F103RBTx\nRCC.SYSCLKSource=RCC_SYSCLKSOURCE_PLLCLK\nRCC.PLLSourceVirtual=RCC_PLLSOURCE_HSE\nRCC.PLLMUL=RCC_PLL_MUL9\nRCC.APB1CLKDivider=RCC_HCLK_DIV2\nRCC.ADCPresc=RCC_ADCPCLK2_DIV6\nRCC.APB1TimFreq_Value=72000000\n';
 const c=importIoc(f1);assert.deepEqual(c.config.clock,preset(F1,'max'));assert.equal(c.config.timerClockHz,72e6);
 assert.equal(clockTreeFromIoc(F4,{'Mcu.Family':'STM32F4'}),null);
});
