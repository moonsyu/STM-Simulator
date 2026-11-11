// Feature 43: CubeMX's "Generate peripheral initialization as a pair of '.c/.h' files per peripheral". The pairs
// (gpio.c/.h, i2c.c/.h, usart.c/.h …) are cut out of the one-file main.c; a main.c generated that way in CubeIDE and
// pasted into the app builds as it is, because a build adds the pairs a source includes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {splitMain,peripheralFiles,generatedSources,halFiles} from '../../src/peripheral-files.js';
import {generateHal,validateMcu,importIoc} from '../../src/mcu-config.js';
import {exportIoc} from '../../src/ioc-export.js';
import {compileHal} from '../../src/hal-source.js';
import {SimulationSession} from '../../src/session.js';
import {validateProject} from '../../src/project.js';
import {LECTURE_MAIN,lectureProject} from '../fixtures/lecture-ds3231.js';

const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});

test('the pairs hold the handles and the MX_*_Init functions; main.c keeps the calls and includes the headers',()=>{
 const p=lectureProject(),one=generateHal(p.mcu),{main,files}=splitMain(one);
 assert.deepEqual(files.map(f=>f.name),['i2c.h','i2c.c','usart.h','usart.c','gpio.h','gpio.c']);
 const text=name=>files.find(f=>f.name===name).text;
 assert.match(text('i2c.h'),/extern I2C_HandleTypeDef hi2c1;\n\nvoid MX_I2C1_Init\(void\);/);
 assert.match(text('i2c.c'),/#include "i2c\.h"\n\nI2C_HandleTypeDef hi2c1;\n\nvoid MX_I2C1_Init\(void\) \{\n {2}__HAL_RCC_I2C1_CLK_ENABLE\(\);/);
 assert.match(text('usart.h'),/extern UART_HandleTypeDef huart2;[\s\S]*void MX_USART2_UART_Init\(void\);/);
 assert.match(text('gpio.c'),/void MX_GPIO_Init\(void\) \{[\s\S]*GPIO_PIN_8/);
 // main.c: the includes after main.h, the calls, and nothing of what moved out.
 assert.match(main,/#include "main\.h"\n#include "i2c\.h"\n#include "usart\.h"\n#include "gpio\.h"\n/);
 assert.match(main,/ {2}MX_GPIO_Init\(\);\n {2}MX_I2C1_Init\(\);\n {2}MX_USART2_UART_Init\(\);/);
 assert.doesNotMatch(main,/HandleTypeDef hi2c1|static void MX_|void MX_\w+\(void\) \{/);
 // Every line of the one-file main.c is in the split main.c or in a pair (static dropped, the handle lines moved).
 const all=main+'\n'+files.map(f=>f.text).join('\n');
 for(const line of one.split('\n'))if(line.trim()&&!/^static void MX_/.test(line))assert.ok(all.includes(line),line);
 // The init bodies are the same lines.
 const body=(t,name)=>new RegExp(`void ${name}\\(void\\) \\{\\n([\\s\\S]*?)\\n\\}`).exec(t)[1];
 for(const [file,name]of [['i2c.c','MX_I2C1_Init'],['usart.c','MX_USART2_UART_Init'],['gpio.c','MX_GPIO_Init']])assert.equal(body(text(file),name),body(one,name),name);
});

test('the Pinout option: generateHal writes the split main.c, the project file keeps the option, .ioc carries it',()=>{
 const p=lectureProject();
 assert.equal(validateMcu(p.mcu).coupleFiles,undefined);
 const on=validateMcu({...p.mcu,coupleFiles:true});assert.equal(on.coupleFiles,true);
 assert.match(generateHal(on),/#include "i2c\.h"/);assert.doesNotMatch(generateHal(on),/static void MX_I2C1_Init/);
 assert.doesNotMatch(generateHal(p.mcu),/#include "i2c\.h"/);
 assert.equal(validateMcu({...p.mcu,coupleFiles:false}).coupleFiles,undefined,'off is not stored');
 assert.throws(()=>validateMcu({...p.mcu,coupleFiles:'yes'}),/주변장치별 파일/);
 const ioc=exportIoc(on);assert.match(ioc,/^ProjectManager\.CoupleFile=true$/m);
 assert.equal(importIoc(ioc).config.coupleFiles,true);
 assert.doesNotMatch(exportIoc(p.mcu),/CoupleFile/);
});

test('a build adds the pairs a source includes — not without the include, not over a project file or a defined init',()=>{
 const p=lectureProject();
 assert.deepEqual(generatedSources(p),[],'the one-file main.c needs none');
 p.code=LECTURE_MAIN;
 assert.deepEqual(generatedSources(p).map(f=>f.name),['i2c.h','i2c.c','usart.h','usart.c','gpio.h','gpio.c']);
 // Only what is included.
 const some={...p,code:LECTURE_MAIN.replace('#include "usart.h"\n','')};
 assert.deepEqual(generatedSources(some).map(f=>f.name),['i2c.h','i2c.c','gpio.h','gpio.c']);
 // A commented-out include does not count.
 assert.deepEqual(generatedSources({...p,code:'// #include "gpio.h"\nint main(void){while(1){}}\n'}),[]);
 // The project's own i2c.c wins; its header is still generated.
 const own={...p,firmware:{...p.firmware,files:[{name:'Core/Src/i2c.c',text:'#include "i2c.h"\nI2C_HandleTypeDef hi2c1;\nvoid MX_I2C1_Init(void) { }\n'}]}};
 assert.deepEqual(generatedSources(own).map(f=>f.name),['i2c.h','usart.h','usart.c','gpio.h','gpio.c']);
 assert.equal(halFiles(own).length,6);
 // An init function the project defines itself (in main.c) keeps the generated source out: no duplicate definition.
 const defined={...p,code:LECTURE_MAIN+'\nvoid MX_GPIO_Init(void) { }\n'};
 assert.deepEqual(generatedSources(defined).map(f=>f.name),['i2c.h','i2c.c','usart.h','usart.c','gpio.h']);
 // Sketch and FSP projects have no pairs.
 assert.deepEqual(generatedSources({...p,firmware:{mode:'sketch',files:[]}}),[]);
});

test('the lecture main.c (DS3231 seconds over I2C1, printf to USART2) runs on the interpreter as pasted',()=>{
 const p=lectureProject();p.code=LECTURE_MAIN;
 // Without the pairs the include is refused, as before this feature.
 assert.throws(()=>compileHal(p.code,p.firmware.files,p.mcu.family),/헤더: i2c\.h/);
 assert.doesNotThrow(()=>compileHal(p.code,halFiles(p),p.mcu.family));
 const out=[],session=new SimulationSession(validateProject(p),{print:s=>out.push(String(s)),uart:(id,text)=>out.push(String(text))});
 for(let t=50;t<=2600;t+=50)session.tick(t);
 const text=[out.join(''),JSON.stringify(session.uartLog??''),session.monitorText?.()??''].join('\n'),seconds=[...text.matchAll(/(\d+) sec/g)].map(m=>Number(m[1]));
 assert.ok(seconds.length>=3,'printed: '+text.slice(0,400));
 assert.ok(seconds.every(s=>s>=0&&s<60));
 // The DS3231 counts on: 2 s later the reading is 2 s further (modulo a minute).
 assert.ok(new Set(seconds).size>=2,'the seconds change: '+seconds.join(','));
});

test('the option on for a configuration with DMA, a timer and the ADC: every pair compiles on the interpreter',()=>{
 const p=lectureProject();
 Object.assign(p.mcu.pins,{PA0:pin('ADC1_IN0'),PA6:pin('TIM3_CH1')});
 Object.assign(p.mcu.peripherals,{ADC1:{enabled:true},TIM3:{enabled:true,mode:'pwm',prescaler:15,period:999,pulse:500}});
 const mcu=validateMcu({...p.mcu,coupleFiles:true});
 const names=peripheralFiles(mcu).map(f=>f.name);
 assert.deepEqual(names.filter(n=>n.endsWith('.h')),['adc.h','i2c.h','tim.h','usart.h','gpio.h']);
 const project={...p,mcu,code:generateHal(mcu)};
 assert.deepEqual(generatedSources(project).map(f=>f.name),names);
 assert.doesNotThrow(()=>compileHal(project.code,halFiles(project),mcu.family));
});

test('error case: the header of a peripheral the Pinout has not enabled — the message says where the file comes from',()=>{
 const p=lectureProject();p.code=LECTURE_MAIN;delete p.mcu.peripherals.USART2;delete p.mcu.pins.PA2;delete p.mcu.pins.PA3;
 assert.deepEqual(generatedSources(p).map(f=>f.name),['i2c.h','i2c.c','gpio.h','gpio.c']);
 assert.throws(()=>compileHal(p.code,halFiles(p),p.mcu.family),/헤더: usart\.h — CubeMX가 주변장치별로 만드는 파일입니다\. Pinout에서/);
 // A header that is not one of the pairs keeps the plain message.
 assert.throws(()=>compileHal('#include "nothing.h"\nint main(void){while(1){}}\n',[],p.mcu.family),/헤더: nothing\.h$/m);
});
