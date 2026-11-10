// I2C2 / SPI2 (and the F446RE's I2C3 / SPI3) on the built-in interpreter: each instance reaches only the devices on its
// own pins, also when the program alternates between two instances, and misuse names the instance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {run,advance,pin} from './helpers.js';
import {halExample} from '../../src/hal-examples.js';
import {generateHal} from '../../src/mcu-config.js';
import {PINS} from '../../src/pins.js';

const term=p=>PINS.find(x=>x.signal===p).id;
const withCode=(p,init)=>{p.code=generateHal(p.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+init);return p;};

test('I2C1 and I2C2 with a memory at 0x50 on each: alternating transfers stay on their own bus (F446RE)',()=>{
 const p=halExample('i2c'),first=p.components[0];
 p.components.push({...structuredClone(first),id:'second',name:'I2C2',x:first.x+120,attachments:{p1:'bb:f:22',p2:'bb:f:23',p3:'bb:f:24',p4:'bb:f:25'}});
 p.wires.push({id:'w5',from:'board:CN6:4',to:'part:second:p1',color:'#dd654c'},{id:'w6',from:'board:CN6:6',to:'part:second:p2',color:'#4e647b'},
  {id:'w7',from:term('PB3'),to:'part:second:p3',color:'#8064d8'},{id:'w8',from:term('PB10'),to:'part:second:p4',color:'#23a68a'});
 Object.assign(p.mcu.pins,{PB10:pin('I2C2_SCL'),PB3:pin('I2C2_SDA')});p.mcu.peripherals.I2C2={enabled:true,clock:400000};
 withCode(p,'  uint8_t a[1] = {11}, b[1] = {22}, ra[1] = {0}, rb[1] = {0};\n  HAL_I2C_Mem_Write(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, a, 1, 100);\n  HAL_I2C_Mem_Write(&hi2c2, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, b, 1, 100);\n'
  +'  HAL_StatusTypeDef s1 = HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, ra, 1, 100);\n  HAL_StatusTypeDef s2 = HAL_I2C_Mem_Read(&hi2c2, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, rb, 1, 100);\n  printf("i2c1=%u(%d) i2c2=%u(%d)\\n", ra[0], s1, rb[0], s2);');
 assert.match(p.code,/I2C_HandleTypeDef hi2c1;\nI2C_HandleTypeDef hi2c2;/);
 assert.match(p.code,/static void MX_I2C2_Init\(void\) \{\n  __HAL_RCC_I2C2_CLK_ENABLE\(\);\n  hi2c2\.Instance = I2C2;\n  hi2c2\.Init\.ClockSpeed = 400000;/);
 assert.match(p.code,/GPIO_InitStruct\.Pin = GPIO_PIN_10;\n  GPIO_InitStruct\.Mode = GPIO_MODE_AF_OD;[\s\S]*?GPIO_InitStruct\.Alternate = GPIO_AF4_I2C2;/);
 const {s,output}=run(p);advance(s,20);
 assert.deepEqual(output,['i2c1=11(0) i2c2=22(0)']);
 assert.deepEqual(s.signals.channels().filter(c=>c.protocol==='i2c').map(c=>c.id).sort(),['I2C1','I2C2']);
});

test('the I2C example moved to I2C3 (PA8 / PC9): the device answers there and not on an instance without it',()=>{
 const p=halExample('i2c');p.mcu.pins={PA8:pin('I2C3_SCL'),PC9:pin('I2C3_SDA'),PB10:pin('I2C2_SCL'),PB3:pin('I2C2_SDA')};p.mcu.peripherals={I2C3:{enabled:true,clock:100000},I2C2:{enabled:true,clock:100000}};
 for(const w of p.wires){if(w.from===term('PB9'))w.from=term('PC9');if(w.from===term('PB8'))w.from=term('PA8');}
 withCode(p,'  uint8_t tx[1] = {42}, rx[1] = {0};\n  HAL_StatusTypeDef w = HAL_I2C_Mem_Write(&hi2c3, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, tx, 1, 100);\n  HAL_StatusTypeDef none = HAL_I2C_Mem_Write(&hi2c2, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, tx, 1, 100);\n  HAL_I2C_Mem_Read(&hi2c3, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, rx, 1, 100);\n  printf("%d %d %u\\n", w, none, rx[0]);');
 const {s,output}=run(p);advance(s,20);assert.deepEqual(output,['0 1 42']);
});

test('the SPI example moved to SPI2 (PB13 / PB14 / PB15) and to SPI3 (PC10 / PC11 / PC12, AF6)',()=>{
 for(const [id,sck,miso,mosi,af]of [['SPI2','PB13','PB14','PB15','GPIO_AF5_SPI2'],['SPI3','PC10','PC11','PC12','GPIO_AF6_SPI3']]){
  const p=halExample('spi'),old={PA5:sck,PA6:miso,PA7:mosi},h='h'+id.toLowerCase();
  for(const w of p.wires)for(const [from,to]of Object.entries(old))if(w.from===term(from))w.from=term(to);
  const cs=p.mcu.pins.PB6;p.mcu.pins={PB6:cs,[sck]:pin(id+'_SCK'),[miso]:pin(id+'_MISO'),[mosi]:pin(id+'_MOSI')};p.mcu.peripherals={[id]:{enabled:true,clock:1000000}};
  const body=halExample('spi').code.split('/* USER CODE BEGIN 2 */\n')[1].split('  /* USER CODE END 2 */')[0].replaceAll('&hspi1','&'+h);
  withCode(p,body);
  assert.match(p.code,new RegExp(`${h}\\.Instance = ${id};[\\s\\S]*HAL_SPI_Init\\(&${h}\\);`));assert.ok(p.code.includes(`GPIO_InitStruct.Alternate = ${af};`),af);
  const {s,output}=run(p);advance(s,20);assert.deepEqual(output,['42'],id);
  assert.deepEqual(s.signals.channels().filter(c=>c.protocol==='spi').map(c=>c.group??c.id.split('.')[0]).filter((v,i,a)=>a.indexOf(v)===i),[id]);
 }
});

test('misuse names the instance: I2C2 slave calls, an I2C3 clock enable on the F103RB',()=>{
 const p=halExample('i2c');p.mcu.pins={PB10:pin('I2C2_SCL'),PB3:pin('I2C2_SDA')};p.mcu.peripherals={I2C2:{enabled:true,clock:100000}};
 withCode(p,'  uint8_t b[1];\n  HAL_I2C_Slave_Receive(&hi2c2, b, 1, 10);');
 assert.throws(()=>{const {s}=run(p);advance(s,20);},/I2C2: 내장 해석기의 I2C 슬레이브는 I2C1만 지원합니다/);
});
