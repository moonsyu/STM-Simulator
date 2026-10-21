import {boardPin} from './pins.js';
import {makeCatalogProject} from './catalog-examples.js';
const analogRead=`HAL_ADC_Start(&hadc1);
 if (HAL_ADC_PollForConversion(&hadc1, 20) == HAL_OK) {
  uint32_t raw = HAL_ADC_GetValue(&hadc1);
  printf("ADC=%lu voltage=%.3f V\\n", raw, raw * 3.3 / 4095.0);
 }
 HAL_Delay(100);`;
const tx=(address,buffer,count)=>`HAL_I2C_Master_Transmit(&hi2c1, ${address} << 1, ${buffer}, ${count}, 100)`;
const rx=(address,buffer,count)=>`HAL_I2C_Master_Receive(&hi2c1, ${address} << 1, ${buffer}, ${count}, 100)`;
export function protocolExample(v){
 const b=makeCatalogProject(v),{p,pin,connect,power,i2c,spi,adc,finish}=b,id=v.id;
 if(['ldr-module-3','ntc-module-3','ldr-comparator-4'].includes(id)){
  power(id.includes('comparator')?1:2,id.includes('comparator')?2:3);adc(id.includes('comparator')?3:1);
  if(id.includes('comparator')){pin('PA10','GPIO_Input');connect(4,'PA10');}
  return finish('',analogRead+(id.includes('comparator')?'\nprintf("threshold=%u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10));':''));
 }
 if(id==='encoder-bare-5'){
  connect(2,'GND');connect(5,'GND');for(const [n,s]of [[1,'PA0'],[3,'PA1'],[4,'PA10']]){pin(s,'GPIO_Input','PULLUP');connect(n,s);}
  return finish('',`uint32_t state = HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0) * 2U + HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_1);
 if (state != prior) { printf("A/B=%lu button=%u\\n", state, HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10)); prior=state; }
 HAL_Delay(1);`,'','uint32_t prior=3;');
 }
 if(id.startsWith('slide-dp')){
  const triple=id.includes('dp3t'),common=triple?[4,8]:[2,5];
  common.forEach((n,i)=>{pin('PA'+i,'ADC1_IN'+i);p.mcu.peripherals.ADC1={enabled:true};connect(n,'PA'+i);});
  if(triple){for(const n of [1,5])connect(n,'GND');for(const n of [3,7])connect(n,'3V3');for(const n of [2,6]){const name='mid'+n;p.components.push({id:name+'a',type:'resistor',name:'10k',value:10000,x:650,y:500+n*5,rotation:0,span:70},{id:name+'b',type:'resistor',name:'10k',value:10000,x:790,y:500+n*5,rotation:0,span:70});p.wires.push({id:name+'1',from:boardPin('3V3'),to:`part:${name}a:a`,color:'#23a68a'},{id:name+'2',from:`part:${name}a:b`,to:`part:demo:p${n}`,color:'#23a68a'},{id:name+'3',from:`part:demo:p${n}`,to:`part:${name}b:a`,color:'#23a68a'},{id:name+'4',from:`part:${name}b:b`,to:boardPin('GND'),color:'#23a68a'});}}
  else {connect(1,'GND');connect(3,'3V3');connect(4,'GND');connect(6,'3V3');}
  return finish('',`for (uint32_t channel=0;channel<2;channel++) {
 ADC_ChannelConfTypeDef input={0}; input.Channel=channel; input.Rank=1; input.SamplingTime=ADC_SAMPLETIME_3CYCLES;
 HAL_ADC_ConfigChannel(&hadc1,&input); HAL_ADC_Start(&hadc1);
 if(HAL_ADC_PollForConversion(&hadc1,10)==HAL_OK) printf("pole %lu=%lu\\n",channel+1,HAL_ADC_GetValue(&hadc1));
 } HAL_Delay(100);`);
 }
 if(['ads1115-10','mcp4725-6','ds3231-8','urm09-i2c-4','lcd-i2c-4'].includes(id)){
  power(1,2);i2c(id==='urm09-i2c-4'?3:4,id==='urm09-i2c-4'?4:3);
  if(id==='ads1115-10'){
   connect(5,'GND');connect(7,'3V3');connect(8,'GND');connect(9,'GND');connect(10,'GND');
   return finish('',`uint8_t config[3]={1,0xC3,0x83}; uint8_t pointer[1]={0}; uint8_t data[2]={0};
 if(${tx('0x48','config',3)}==HAL_OK) { HAL_Delay(10);
 if(${tx('0x48','pointer',1)}==HAL_OK && ${rx('0x48','data',2)}==HAL_OK) {
 int16_t raw=(int16_t)((data[0]<<8)|data[1]); printf("AIN0=%.4f V\\n",raw*4.096/32768.0); }
 } HAL_Delay(200);`);
  }
  if(id==='mcp4725-6'){
   connect(5,'GND');adc(6);
   return finish('',`uint16_t value=2048; uint8_t frame[2]={(value>>8)&15,value&255};
 if(${tx('0x62','frame',2)}!=HAL_OK) printf("DAC NACK\\n");
 `+analogRead);
  }
  if(id==='ds3231-8')return finish('',`uint8_t data[7]={0};
 if(HAL_I2C_Mem_Read(&hi2c1,0x68<<1,0,I2C_MEMADD_SIZE_8BIT,data,7,100)==HAL_OK) {
 printf("RTC %02u:%02u:%02u\\n",bcd(data[2]&63),bcd(data[1]),bcd(data[0])); }
 HAL_Delay(1000);`,'uint32_t bcd(uint8_t value) { return (value>>4)*10+(value&15); }');
  if(id==='urm09-i2c-4')return finish('',`uint8_t measure[1]={1},data[2]={0};
 if(HAL_I2C_Mem_Write(&hi2c1,0x11<<1,8,I2C_MEMADD_SIZE_8BIT,measure,1,100)==HAL_OK) { HAL_Delay(100);
 if(HAL_I2C_Mem_Read(&hi2c1,0x11<<1,3,I2C_MEMADD_SIZE_8BIT,data,2,100)==HAL_OK) printf("distance=%u cm\\n",(data[0]<<8)|data[1]); }
 HAL_Delay(200);`);
  if(id==='lcd-i2c-4')return finish(`HAL_Delay(50); lcdCommand(0x38); lcdCommand(0x0C); lcdCommand(1); HAL_Delay(5);`,
   `lcdCommand(0x80); uint8_t text[13]={0x40,'S','T','M',' ','E','m','u','l','a','t','o','r'};
 if(${tx('0x3E','text',13)}!=HAL_OK) printf("LCD NACK\\n"); HAL_Delay(1000);`,
   `void lcdCommand(uint8_t value){uint8_t command[2]={0,value}; ${tx('0x3E','command',2)}; HAL_Delay(2);}`);
 }
 if(id==='oled-configurable-7'||id==='oled-configurable-8'){
  const eight=id.endsWith('-8');power(eight?3:1,eight?1:2);spi(eight?5:3,eight?4:4,eight?8:5);pin('PB7');connect(eight?7:6,'PB7');pin('PC7','GPIO_Output','NOPULL',1);connect(eight?6:7,'PC7');
  return finish(`HAL_GPIO_WritePin(GPIOC,GPIO_PIN_7,GPIO_PIN_RESET); HAL_Delay(5); HAL_GPIO_WritePin(GPIOC,GPIO_PIN_7,GPIO_PIN_SET); HAL_Delay(5);
 uint8_t init[25]={0xAE,0xD5,0x80,0xA8,0x3F,0xD3,0,0x40,0x8D,0x14,0x20,2,0xA1,0xC8,0xDA,0x12,0x81,0x7F,0xD9,0xF1,0xDB,0x40,0xA4,0xA6,0xAF}; oledSend(0,init,25);`,
 `uint8_t pixels[128]={0}; for(uint32_t x=0;x<128;x++) pixels[x]=(x/8)%2?0xAA:0x55;
 for(uint32_t page=0;page<8;page++){uint8_t position[3]={0xB0+page,0,0x10};oledSend(0,position,3);oledSend(1,pixels,128);HAL_Delay(1);} HAL_Delay(500);`,
 `void oledSend(uint32_t data,uint8_t *bytes,uint16_t count){HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_RESET);HAL_GPIO_WritePin(GPIOB,GPIO_PIN_7,data?GPIO_PIN_SET:GPIO_PIN_RESET);HAL_SPI_Transmit(&hspi1,bytes,count,100);HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_SET);}`);
 }
 if(['rgb-neopixel-4','rgb-neopixel-flora-4','rgb-gravity-3'].includes(id)){
  power(1,2);spi(3,0,0);p.mcu.timerClockHz=84000000;p.mcu.peripherals.SPI1.clock=2625000;
  // SPI at 2.625 MHz sends three bits per WS2812 bit (110 = 1, 100 = 0); colours are GRB words.
  return finish('',`uint8_t frame[9]={0}; uint32_t grb=ws2812Colors[ws2812Index%4];
 for(uint32_t bit=0;bit<24;bit++){uint32_t symbol=(grb&(1UL<<(23-bit)))?6:4;for(uint32_t b=0;b<3;b++){uint32_t offset=bit*3+b;if(symbol&(1U<<(2-b)))frame[offset/8]|=1U<<(7-offset%8);}}
 HAL_SPI_Transmit(&hspi1,frame,9,100);HAL_Delay(1);
 printf("WS2812 G=%lu R=%lu B=%lu\\n",(grb>>16)&0xFFUL,(grb>>8)&0xFFUL,grb&0xFFUL);
 ws2812Index++;HAL_Delay(500);`,'',`/* GRB: red, green, blue, white */
const uint32_t ws2812Colors[4]={0x004000,0x400000,0x000040,0x202020};
uint32_t ws2812Index=0;`);
 }
 return advancedProtocolExample(v,b);
}
import {advancedProtocolExample} from './catalog-advanced-examples.js';
