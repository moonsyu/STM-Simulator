// I2C2 / SPI2 on the ARM GCC build (real STM32Cube HAL) and the firmware emulator, both boards, plus the F446RE's
// I2C3 and SPI3: the I2C memory and SPI memory examples are rewired to the other instance's pins and read back 42 with
// the MX_I2Cx_Init / MX_SPIx_Init and GPIO alternate functions the Pinout generates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {FirmwareSession} from '../../src/firmware-session.js';
import {applyHalExample} from '../../src/hal-examples.js';
import {blankProject,projectForBoard} from '../../src/project.js';
import {generateHal} from '../../src/mcu-config.js';
import {boardPins} from '../../src/pins.js';

const require=createRequire(import.meta.url),{prepareBuild,build,detectTools}=require('../../desktop/native-build.cjs');
const tools=await detectTools({armGcc:process.env.ARM_GCC||''});
const skip=!(tools.armGcc&&tools.cube&&tools.cubeF1)&&!process.env.CI_REQUIRE_TOOLCHAIN&&'ARM GCC / STM32CubeF4·F1 not installed';
const pin=fn=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0});
const runTo=(s,us)=>{for(let t=10;s.now<us;t+=10)s.tick(t);};
// Moves the wires on the board terminals of `from` pins to the terminals of the `to` pins.
function rewire(p,map){
 const term=q=>boardPins(p.boardId).find(x=>x.signal===q).id;
 for(const [from,to]of Object.entries(map)){const a=boardPins(p.boardId).filter(x=>x.signal===from).map(x=>x.id);for(const w of p.wires)if(a.includes(w.from))w.from=term(to);}
}

test('I2C2 / SPI2 (F446RE and F103RB) and I2C3 / SPI3 (F446RE) read the example memories back on the emulator',{skip,timeout:900000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bus-'));
 try{
  const cases=[['F446RE','I2C2',{PB8:'PB10',PB9:'PB3'}],['F446RE','I2C3',{PB8:'PA8',PB9:'PC9'}],['F103RB','I2C2',{PB8:'PB10',PB9:'PB11'}],
   ['F446RE','SPI2',{PA5:'PB13',PA6:'PB14',PA7:'PB15'}],['F446RE','SPI3',{PA5:'PC10',PA6:'PC11',PA7:'PC12'}],['F103RB','SPI2',{PA5:'PB13',PA6:'PB14',PA7:'PB15'}]];
  for(const [board,id,map]of cases){
   const i2c=id.startsWith('I2C'),p=applyHalExample(board==='F446RE'?blankProject():projectForBoard('nucleo-f103rb'),i2c?'i2c':'spi'),m=p.mcu,h='h'+id.toLowerCase(),old=i2c?'I2C1':'SPI1';
   const body=p.code.split('/* USER CODE BEGIN 2 */\n')[1].split(/ *\/\* USER CODE END 2 \*\//)[0].replaceAll('&h'+old.toLowerCase(),'&'+h).replace(/printf\("%u\\n", rx\[0\]\);/,'if (rx[0] == 42) HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, GPIO_PIN_SET);').replace(/printf\([^\n]*\n/g,'');
   rewire(p,map);
   for(const [from,to]of Object.entries(map)){m.pins[to]=pin(m.pins[from].function.replace(old,id));delete m.pins[from];}
   m.pins.PC0=pin('GPIO_Output');m.peripherals[id]={...m.peripherals[old]};delete m.peripherals[old];
   p.code=generateHal(m,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+body);
   assert.match(p.code,new RegExp(`${h}\\.Instance = ${id};`),`${board} ${id}`);
   const result=await build(await prepareBuild({project:p,tools,root,target:'arm'}));
   assert.deepEqual(result.diagnostics.filter(d=>d.severity==='error'),[],`${board} ${id}`);
   const s=new FirmwareSession(p,{elf:new Uint8Array(await fs.readFile(result.elf))});
   runTo(s,300000);
   assert.equal(s.gpio.PC0?.value,3.3,`${board} ${id}: the memory answered 42 on ${Object.values(map).join(' / ')}`);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
