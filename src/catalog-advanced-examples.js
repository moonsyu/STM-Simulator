import {boardPin} from './pins.js';
const microsecondTimer=`void delayUs(uint32_t us) { uint32_t start=__HAL_TIM_GET_COUNTER(&htim2); while((uint32_t)(__HAL_TIM_GET_COUNTER(&htim2)-start)<us) {} }
uint32_t waitLevel(uint32_t high,uint32_t limit) {uint32_t start=__HAL_TIM_GET_COUNTER(&htim2);while(HAL_GPIO_ReadPin(GPIOA,GPIO_PIN_0)==high){if((uint32_t)(__HAL_TIM_GET_COUNTER(&htim2)-start)>limit)return 0;}return 1;}
void dataMode(uint32_t output){GPIO_InitTypeDef cfg={0};cfg.Pin=GPIO_PIN_0;cfg.Mode=output?GPIO_MODE_OUTPUT_OD:GPIO_MODE_INPUT;cfg.Pull=GPIO_PULLUP;cfg.Speed=GPIO_SPEED_FREQ_HIGH;HAL_GPIO_Init(GPIOA,&cfg);}
void driveData(uint32_t high){HAL_GPIO_WritePin(GPIOA,GPIO_PIN_0,high?GPIO_PIN_SET:GPIO_PIN_RESET);}`;
const ow=`uint32_t owReset(void){dataMode(1);driveData(0);delayUs(480);driveData(1);delayUs(70);uint32_t present=!HAL_GPIO_ReadPin(GPIOA,GPIO_PIN_0);delayUs(410);return present;}
void owWrite(uint8_t value){for(uint32_t i=0;i<8;i++){driveData(0);delayUs((value&1)?6:60);driveData(1);delayUs((value&1)?64:10);value>>=1;}}
uint8_t owRead(void){uint8_t value=0;for(uint32_t i=0;i<8;i++){driveData(0);delayUs(6);driveData(1);delayUs(9);if(HAL_GPIO_ReadPin(GPIOA,GPIO_PIN_0))value|=1U<<i;delayUs(55);}return value;}
uint8_t owCrc(uint8_t *bytes,uint32_t count){uint8_t crc=0;for(uint32_t n=0;n<count;n++){uint8_t b=bytes[n];for(uint32_t bit=0;bit<8;bit++){uint8_t mix=(crc^b)&1;crc>>=1;if(mix)crc^=0x8C;b>>=1;}}return crc;}`;
export function advancedProtocolExample(v,b){
 const {p,pin,connect,power,i2c,spi,finish}=b,id=v.id;
 const timer=()=>{p.mcu.peripherals.TIM2={enabled:true,prescaler:15,period:4294967295,pulse:0,mode:'base'};};
 const pullup=n=>{p.components.push({id:'pullup',type:'resistor',name:'4.7 kΩ',value:4700,x:610,y:420,rotation:0,span:70});p.wires.push({id:'pull1',from:boardPin('3V3'),to:'part:pullup:a',color:'#dd654c'},{id:'pull2',from:'part:pullup:b',to:'part:demo:p'+n,color:'#23a68a'});};
 if(id.startsWith('ds18b20')||id.startsWith('dht')||id==='urm09-trig-3'){
  let data=3;if(id==='ds18b20-to92-3'){power(3,1);data=2;}else power(id==='urm09-trig-3'?2:1,id==='urm09-trig-3'?1:2);
  pin('PA0','GPIO_Output','PULLUP',1);connect(data,'PA0');timer();if(id!=='urm09-trig-3')pullup(data);
  if(id.startsWith('ds18b20'))return finish('HAL_TIM_Base_Start(&htim2);',`if(owReset()){owWrite(0xCC);owWrite(0x44);HAL_Delay(750);
 if(owReset()){owWrite(0xCC);owWrite(0xBE);uint8_t data[9]={0};for(uint32_t i=0;i<9;i++)data[i]=owRead();
 if(owCrc(data,8)==data[8]){int16_t raw=(int16_t)((data[1]<<8)|data[0]);printf("DS18B20=%.2f C\\n",raw/16.0);}else printf("DS18B20 CRC error\\n");}}
 else printf("DS18B20 presence timeout\\n");HAL_Delay(250);`,microsecondTimer+ow);
  if(id.startsWith('dht'))return finish('HAL_TIM_Base_Start(&htim2);HAL_Delay(2000);',`uint8_t data[5]={0};uint32_t ok=1;dataMode(1);driveData(0);HAL_Delay(${id.startsWith('dht11')?20:2});driveData(1);delayUs(30);dataMode(0);
 if(!waitLevel(1,100)||!waitLevel(0,100)||!waitLevel(1,100))ok=0;
 for(uint32_t bit=0;ok&&bit<40;bit++){if(!waitLevel(0,100)){ok=0;break;}uint32_t start=__HAL_TIM_GET_COUNTER(&htim2);if(!waitLevel(1,100)){ok=0;break;}data[bit/8]=(data[bit/8]<<1)|((uint32_t)(__HAL_TIM_GET_COUNTER(&htim2)-start)>40);}
 if(ok && (uint8_t)(data[0]+data[1]+data[2]+data[3])==data[4])printf("humidity=%.1f%% temperature=%.1f C\\n",${id.startsWith('dht11')?'data[0]+data[1]/10.0,data[2]+data[3]/10.0':'((data[0]<<8)|data[1])/10.0,(((data[2]&127)<<8)|data[3])/10.0*(data[2]&128?-1:1)'});
 else printf("DHT timeout/checksum error\\n");HAL_Delay(2000);`,microsecondTimer);
  return finish('HAL_TIM_Base_Start(&htim2);',`GPIO_InitTypeDef cfg={0};cfg.Pin=GPIO_PIN_0;cfg.Mode=GPIO_MODE_OUTPUT_PP;cfg.Pull=GPIO_NOPULL;cfg.Speed=GPIO_SPEED_FREQ_HIGH;HAL_GPIO_Init(GPIOA,&cfg);
 driveData(0);delayUs(5);driveData(1);delayUs(20);driveData(0);cfg.Mode=GPIO_MODE_INPUT;HAL_GPIO_Init(GPIOA,&cfg);
 if(waitLevel(0,30000)){uint32_t start=__HAL_TIM_GET_COUNTER(&htim2);if(waitLevel(1,30000))printf("URM09=%.1f cm\\n",(uint32_t)(__HAL_TIM_GET_COUNTER(&htim2)-start)/58.0);}HAL_Delay(100);`,microsecondTimer);
 }
 if(id==='sevenseg-tm1637-4'){
  power(1,2);pin('PB0','GPIO_Output','PULLUP',1);pin('PB1','GPIO_Output','PULLUP',1);connect(3,'PB0');connect(4,'PB1');
  return finish('',`tmStart();tmByte(0x40);tmStop();tmStart();tmByte(0xC0);tmByte(0x06);tmByte(0x5B);tmByte(0x4F);tmByte(0x66);tmStop();tmStart();tmByte(0x8F);tmStop();HAL_Delay(1000);`,
  `void tmClock(uint32_t state){HAL_GPIO_WritePin(GPIOB,GPIO_PIN_0,state?GPIO_PIN_SET:GPIO_PIN_RESET);HAL_Delay(1);}
void tmData(uint32_t state){HAL_GPIO_WritePin(GPIOB,GPIO_PIN_1,state?GPIO_PIN_SET:GPIO_PIN_RESET);HAL_Delay(1);}
void tmStart(void){tmData(1);tmClock(1);tmData(0);tmClock(0);}
void tmStop(void){tmClock(0);tmData(0);tmClock(1);tmData(1);}
void tmByte(uint8_t value){for(uint32_t bit=0;bit<8;bit++){tmClock(0);tmData(value&1);tmClock(1);value>>=1;}GPIO_InitTypeDef ack={0};ack.Pin=GPIO_PIN_1;ack.Mode=GPIO_MODE_INPUT;ack.Pull=GPIO_PULLUP;HAL_GPIO_Init(GPIOB,&ack);tmClock(0);tmClock(1);if(HAL_GPIO_ReadPin(GPIOB,GPIO_PIN_1))printf("TM1637 NACK\\n");tmClock(0);ack.Mode=GPIO_MODE_OUTPUT_PP;HAL_GPIO_Init(GPIOB,&ack);}`);
 }
 if(id==='sevenseg-4digit-12'){
  const physical=[13,9,4,2,1,12,5,3,14,11,10,6];connect(7,'GND');p.components.push({id:'colon',type:'resistor',name:'Colon 1kΩ',value:1000,x:600,y:620,rotation:0,span:70});p.wires.push({id:'colon1',from:boardPin('3V3'),to:'part:colon:a',color:'#23a68a'},{id:'colon2',from:'part:colon:b',to:'part:demo:p8',color:'#23a68a'});
  for(let n=1;n<=12;n++){const signal=n<=8?'PB'+(n-1):'PC'+(n-9);pin(signal);connect(physical[n-1],signal);}
  // Each segment needs its own resistor; digit current is switched through transistor drivers in hardware.
  for(let n=1;n<=8;n++){const w=p.wires.find(w=>w.to==='part:demo:p'+physical[n-1]);p.components.push({id:'r'+n,type:'resistor',name:'R'+n,value:1000,x:600+n*20,y:520,rotation:90,span:70});w.to='part:r'+n+':a';p.wires.push({id:'segment'+n,from:'part:r'+n+':b',to:'part:demo:p'+physical[n-1],color:'#23a68a'});}
  return finish('',`uint8_t glyph[4]={0x06,0x5B,0x4F,0x66};for(uint32_t digit=0;digit<4;digit++){for(uint32_t d=0;d<4;d++)HAL_GPIO_WritePin(GPIOC,1U<<d,GPIO_PIN_SET);for(uint32_t segment=0;segment<8;segment++)HAL_GPIO_WritePin(GPIOB,1U<<segment,(glyph[digit]&(1U<<segment))?GPIO_PIN_SET:GPIO_PIN_RESET);HAL_GPIO_WritePin(GPIOC,1U<<digit,GPIO_PIN_RESET);HAL_Delay(2);}`);
 }
 if(id==='stepper-driver-11'||id==='stepper-unipolar-5'||id==='stepper-bipolar-4'){
  const driver=id==='stepper-driver-11',bipolar=id==='stepper-bipolar-4';
  if(driver){p.components.push({id:'motor',type:'ref_stepper_unipolar_5',name:'28BYJ-48',x:1000,y:340,rotation:0});for(let n=1;n<=5;n++)p.wires.push({id:'load'+n,from:'part:demo:p'+(n+6),to:'part:motor:p'+n,color:'#23a68a'});power(5,6,'5V');for(let i=0;i<4;i++){pin('PB'+(i+3));connect(i+1,'PB'+(i+3));}}
  else {p.components.push({id:'driver',type:bipolar?'l298n':'ref_stepper_driver_11',name:bipolar?'L298N':'ULN2003',x:600,y:420,rotation:0});
   const wire=(from,to)=>p.wires.push({id:'coil'+p.wires.length,from,to,color:'#23a68a'});
   if(bipolar){p.components.push({id:'vm',type:'dc_supply',name:'12 V',voltage:12,x:500,y:600,rotation:0,span:70});wire('part:vm:a','part:driver:p1');wire('part:vm:b',boardPin('GND'));for(const n of [3,4,9])wire(boardPin('5V'),'part:driver:p'+n);wire(boardPin('GND'),'part:driver:p2');for(let i=0;i<4;i++){pin('PB'+(i+3));wire(boardPin('PB'+(i+3)),'part:driver:p'+[5,6,7,8][i]);wire('part:driver:p'+[10,11,12,13][i],'part:demo:p'+(i+1));}}
   else {wire(boardPin('5V'),'part:driver:p5');wire(boardPin('GND'),'part:driver:p6');for(let i=0;i<4;i++){pin('PB'+(i+3));wire(boardPin('PB'+(i+3)),'part:driver:p'+(i+1));wire('part:driver:p'+(i+8),'part:demo:p'+(i+2));}wire('part:driver:p7','part:demo:p1');}
  }
  return finish('',`uint8_t phases[4]={${bipolar?'5,6,10,9':'1,2,4,8'}};for(uint32_t phase=0;phase<4;phase++){for(uint32_t n=0;n<4;n++)HAL_GPIO_WritePin(GPIOB,1U<<(n+3),(phases[phase]&(1U<<n))?GPIO_PIN_SET:GPIO_PIN_RESET);HAL_Delay(8);}`);
 }
 if(id==='isolated-rs485'){
  power(4,3);pin('PA2','USART2_TX');pin('PA3','USART2_RX');p.mcu.peripherals.USART2={enabled:true,baud:9600};connect(1,'PA2');connect(2,'PA3');
  return finish('',`uint8_t bytes[5]={'S','T','M','\\r','\\n'};HAL_UART_Transmit(&huart2,bytes,5,100);HAL_Delay(500);`);
 }
 if(id==='sd-storage-board'){
  power(1,8);spi(6,7,5,2);pin('PC7','GPIO_Input','PULLUP');connect(9,'PC7');p.mcu.peripherals.SPI1.clock=250000;
  return finish(`HAL_Delay(10);HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_SET);for(uint32_t i=0;i<10;i++)sdByte(255);`,
  `uint8_t r=sdCommand(0,0,0x95);sdEnd();if(r==1){r=sdCommand(8,0x1AA,0x87);uint8_t r7[4]={0};for(uint32_t i=0;i<4;i++)r7[i]=sdByte(255);sdEnd();uint32_t ready=0;for(uint32_t n=0;n<100&&!ready;n++){sdCommand(55,0,1);sdEnd();ready=sdCommand(41,0x40000000,1)==0;sdEnd();HAL_Delay(10);}if(ready){r=sdCommand(58,0,1);uint8_t ocr[4]={0};for(uint32_t i=0;i<4;i++)ocr[i]=sdByte(255);sdEnd();printf("SD OCR=%02x%02x%02x%02x\\n",ocr[0],ocr[1],ocr[2],ocr[3]);}else printf("SD init timeout\\n");}else printf("SD no card / CMD0 timeout\\n");HAL_Delay(1000);`,
  `uint8_t sdByte(uint8_t value){uint8_t tx[1]={value},rx[1]={255};HAL_SPI_TransmitReceive(&hspi1,tx,rx,1,100);return rx[0];}
void sdEnd(void){HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_SET);sdByte(255);}
uint8_t sdCommand(uint8_t command,uint32_t argument,uint8_t crc){HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_RESET);sdByte(255);sdByte(0x40|command);sdByte(argument>>24);sdByte(argument>>16);sdByte(argument>>8);sdByte(argument);sdByte(crc);uint8_t result=255;for(uint32_t i=0;i<10;i++){result=sdByte(255);if(!(result&128))break;}return result;}`);
 }
 return hardwareProtocolExample(v,b);
}
import {hardwareProtocolExample} from './catalog-hardware-examples.js';
