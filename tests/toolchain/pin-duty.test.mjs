// Feature 57 on the emulator (ARM GCC builds): the program of the report — NUCLEO-F103RB, PA5 written LOW and HIGH in
// a loop without a delay once B1 was pressed. On a board LD2 stays lit, a little dimmer; the app showed the level PA5
// had at the instant of each frame, so LD2 flickered at random. Each frame now shows the pin's duty. The same for LED1
// of an FPB-RA6E1; a 500 ms blink stays a blink.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {projectForBoard,validateProject} from '../../src/project.js';
import {generateHal,validateMcu} from '../../src/mcu-config.js';
import {expandC} from '../../src/c-format.js';
import {RA_EXAMPLES} from '../../src/ra-examples.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';
const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'RISING',label:'',initial:0,...extra});
const elfOf=async(project,root)=>new Uint8Array(await fs.readFile((await build(await prepareBuild({project,tools,root,target:'arm',configuration:'Release'}))).elf));

function buttonProject(){
 const base=projectForBoard('nucleo-f103rb'),mcu=validateMcu({...base.mcu,pins:{...base.mcu.pins,PA5:pin('GPIO_Output'),PC13:pin('GPIO_EXTI')},nvic:{EXTI15_10_IRQn:{enabled:true,priority:0}}});
 let code=expandC(generateHal(mcu));const put=(marker,text)=>{assert.ok(code.includes(marker),marker);code=code.replace(marker,()=>marker+'\n'+text);};
 put('/* USER CODE BEGIN PV */','volatile uint8_t btn_flag = 0;');
 put('/* USER CODE BEGIN EXTI_Callback */','    if (GPIO_Pin == GPIO_PIN_13) btn_flag = !btn_flag;');
 code=code.replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,(_,a,b)=>a+'\n    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, 0);\n    while (btn_flag == 0) {}\n    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, 1);\n    '+b);
 assert.match(code,/while \(btn_flag == 0\) \{\}/);
 return validateProject({...base,mcu,code});
}

test('NUCLEO-F103RB: PA5 toggled without a delay shows LD2 steadily lit at the pin\'s duty, not flickering',{skip,timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pin-duty-'));
 try{
  const p=buttonProject(),s=new FirmwareSession(p,{elf:await elfOf(p,root)}),shown=[];
  for(let t=20;t<=600;t+=20){
   if(t===100)s.setPressed({USER:true});if(t===160)s.setPressed({});
   const r=s.tick(t);assert.ok(!r.fault);shown.push([t,r.voltage('signal:PA5')]);
  }
  // Before the button: PA5 LOW, LD2 off.
  for(const [t,v]of shown.filter(([t])=>t<100))assert.ok(v<0.1,`${t} ms: ${v} V`);
  // After it (the flag is set on the rising edge, when B1 is released): PA5 switches all the time.
  const after=shown.filter(([t])=>t>=240).map(([,v])=>v);
  const low=Math.min(...after),high=Math.max(...after);
  assert.ok(low>0.3,`LD2 never goes dark: ${after.map(v=>v.toFixed(2)).join(' ')}`);
  assert.ok(high<3.0,`LD2 is dimmer than a steady HIGH: ${high} V`);
  assert.ok(high-low<0.15,`the same brightness in every frame: ${low.toFixed(3)}..${high.toFixed(3)} V`);
  // The firmware reads the circuit as it is.
  assert.ok(s.result.voltage('signal:PA5')<0.2||s.result.voltage('signal:PA5')>1.5);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('FPB-RA6E1: LED1 HIGH 100 µs of every 400 µs is shown at its duty; the 500 ms blink stays a blink',{skip:skip||(!tools.fsp&&!process.env.CI_REQUIRE_TOOLCHAIN&&'Renesas FSP not installed'),timeout:600000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pin-duty-ra-'));
 try{
  const ra=RA_EXAMPLES.find(e=>e.id==='ra_blink'),project=code=>validateProject({...projectForBoard('fpb-ra6e1'),mcu:ra.mcu(),code});
  const shown=async(code,end)=>{const p=project(code),s=new FirmwareSession(p,{elf:await elfOf(p,root)}),out=[];for(let t=20;t<=end;t+=20)out.push(s.tick(t).voltage('signal:P408'));return out;};
  const slow=await shown(ra.code,1200),high=Math.max(...slow);
  for(const v of slow)assert.ok(v<0.1||Math.abs(v-high)<0.05,`500 ms blink: ${v} V`);
  assert.ok(slow.some(v=>v<0.1)&&high>2.5);
  const fast=(await shown(ra.code.replace('R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','R_BSP_SoftwareDelay(100, BSP_DELAY_UNITS_MICROSECONDS);').replace('R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);','R_BSP_SoftwareDelay(300, BSP_DELAY_UNITS_MICROSECONDS);'),400)).slice(3);
  for(const v of fast)assert.ok(v>high*0.2&&v<high*0.3,`LED1 pin shown at ${v} V of ${high} V`);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
