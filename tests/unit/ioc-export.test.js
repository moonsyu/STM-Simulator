// .ioc export (ioc-export.js): importing what was exported gives the same settings back, over hand-picked settings of
// every peripheral and over several hundred random configurations of both boards; the file has CubeMX's key forms.
import test from 'node:test';
import assert from 'node:assert/strict';
import {exportIoc} from '../../src/ioc-export.js';
import {importIoc,validateMcu,configProblems,defaultMcu} from '../../src/mcu-config.js';
import {routesOf,irqNamesOf} from '../../src/mcu-family.js';

// The app's default edge of a pin that is not an EXTI input is FALLING (what an import gives too).
const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:fn==='GPIO_EXTI'?'RISING':'FALLING',label:'',initial:0,...extra});
const roundTrip=mcu=>{const v=validateMcu(mcu),text=exportIoc(v),back=importIoc(text);return {v,text,back};};

test('every kind of setting survives export → import (F446RE)',()=>{
 const mcu={...defaultMcu(),
  pins:{PA5:pin('GPIO_Output',{label:'LD2',initial:1,speed:'HIGH',outputType:'OD'}),PC13:pin('GPIO_EXTI',{pull:'PULLUP',edge:'FALLING',label:'B1'}),PB5:pin('GPIO_Input',{pull:'PULLDOWN'}),PC2:pin('GPIO_EXTI',{edge:'CHANGE'}),
   PA0:pin('ADC1_IN0'),PA1:pin('ADC1_IN1'),PA4:pin('DAC_OUT1'),PA9:pin('USART1_TX'),PA10:pin('USART1_RX'),PB8:pin('I2C1_SCL'),PB9:pin('I2C1_SDA'),PB13:pin('SPI2_SCK'),PB14:pin('SPI2_MISO'),PB15:pin('SPI2_MOSI'),
   PA8:pin('TIM1_CH1'),PB6:pin('TIM4_CH1'),PB7:pin('TIM4_CH2'),PC6:pin('TIM3_CH1'),PA7:pin('TIM1_CH1N')},
  peripherals:{USART1:{enabled:true,baud:57600,wordLength:9,parity:'EVEN',stopBits:2,direction:'TX',overSampling:8},I2C1:{enabled:true,clock:400000,ownAddress:0x30,dutyCycle:'16_9',noStretch:true},
   SPI2:{enabled:true,clock:2000000,cpol:'HIGH',cpha:'2EDGE',dataSize:16,firstBit:'LSB'},ADC1:{enabled:true,continuous:true,samplingTime:84,conversions:2,ranks:[1,0],trigger:'T3_TRGO'},
   TIM1:{enabled:true,prescaler:15,period:999,pulse:250,mode:'pwm',repetition:3,deadTime:20,counterMode:'CENTERALIGNED1',channels:{CH1:{polarity:'LOW',ocMode:'PWM2'}}},
   TIM3:{enabled:true,prescaler:15999,period:99,pulse:0,mode:'capture',trgo:'UPDATE'},TIM4:{enabled:true,prescaler:0,period:65535,pulse:0,mode:'encoder'},TIM6:{enabled:true,prescaler:83,period:999,trgo:'UPDATE',onePulse:true},
   DAC:{enabled:true,channels:{OUT1:{trigger:'T6_TRGO',buffer:false,wave:'TRIANGLE',amplitude:11}}},IWDG:{enabled:true,prescaler:64,reload:1999},WWDG:{enabled:true,prescaler:8,window:100,counter:127,ewi:true},
   RTC:{enabled:true,clockSource:'LSI',hourFormat:12,time:{hours:11,minutes:59,seconds:58,pm:true},date:{weekDay:4,month:12,date:31,year:26},alarm:{enabled:true,hours:12,minutes:0,seconds:2,date:1,maskDateWeekDay:true},wakeUp:{enabled:true,clock:'CK_SPRE_16BITS',counter:4}}},
  dma:{USART1_RX:{stream:'DMA2_Stream2',channel:4,mode:'circular',priority:'high'},DAC1:{stream:'DMA1_Stream5',channel:7,mode:'circular',priority:'medium'}},
  nvic:{EXTI15_10_IRQn:{enabled:true,priority:3,sub:1},USART1_IRQn:{enabled:true,priority:5},TIM1_CC_IRQn:{enabled:true,priority:2},WWDG_IRQn:{enabled:true,priority:0},DMA2_Stream2_IRQn:{enabled:true,priority:1},DMA1_Stream5_IRQn:{enabled:true,priority:1}},
  nvicGroup:3,tickPriority:7};
 const {v,text,back}=roundTrip(mcu);
 assert.deepEqual(configProblems(v),[]);assert.deepEqual(back.warnings,[]);assert.deepEqual(back.config,v);
 for(const line of ['#MicroXplorer Configuration settings - do not modify','Mcu.Name=STM32F446R(C-E)Tx','Mcu.CPN=STM32F446RET6','PC13.Signal=GPXTI13','PA8.Signal=S_TIM1_CH1','PA0.Signal=ADCx_IN0','PA4.Signal=COMP_DAC1_group',
  'TIM1.Pulse-PWM\\ Generation1\\ CH1\\ CH1N=250','ADC1.Channel-0\\#ChannelRegularConversion=ADC_CHANNEL_1','NVIC.EXTI15_10_IRQn=true\\:3\\:1\\:false\\:false\\:true\\:true\\:true\\:true','NVIC.PriorityGroup=NVIC_PRIORITYGROUP_3','PA5.GPIO_Label=LD2'])
  assert.ok(text.split('\n').includes(line),line);
});

test('clock tree and F103RB settings survive too',()=>{
 const f1={...defaultMcu('STM32F103RB'),pins:{PB10:pin('I2C2_SCL'),PB11:pin('I2C2_SDA'),PA8:pin('TIM1_CH1'),PA7:pin('TIM1_CH1N'),PA0:pin('ADC1_IN0')},
  peripherals:{I2C2:{enabled:true,clock:100000},TIM1:{enabled:true,prescaler:71,period:999,pulse:500,mode:'pwm'},ADC1:{enabled:true,samplingTime:239.5,trigger:'T3_TRGO'},TIM3:{enabled:true,prescaler:7199,period:99,trgo:'UPDATE'},RTC:{enabled:true,clockSource:'LSE',time:{hours:1,minutes:2,seconds:3},date:{weekDay:1,month:5,date:6,year:27},alarm:{enabled:true,hours:1,minutes:2,seconds:5}}},
  clock:{sysclkSource:'PLLCLK',pllSource:'HSE',hsePrediv:1,pllMul:9,ahb:1,apb1:2,apb2:1,adcPrescaler:6},nvic:{TIM1_UP_IRQn:{enabled:true,priority:1}}};
 const a=roundTrip(f1);assert.deepEqual(configProblems(a.v),[]);assert.deepEqual(a.back.warnings,[]);assert.deepEqual(a.back.config,a.v);
 assert.ok(a.text.includes('Mcu.Name=STM32F103R(8-B)Tx')&&a.text.includes('RCC.PLLMUL=RCC_PLL_MUL9'));
 const f4={...defaultMcu(),pins:{PA5:pin('GPIO_Output')},peripherals:{},clock:{sysclkSource:'PLLCLK',pllSource:'HSE',pllM:4,pllN:180,pllP:2,pllQ:4,ahb:1,apb1:4,apb2:2,adcPrescaler:4}};
 const b=roundTrip(f4);assert.deepEqual(b.back.config,b.v);
});

test('random configurations of both boards: export → import gives the same settings (the valid ones) and never throws',()=>{
 let seed=20261110;const rnd=n=>{seed=(seed*1103515245+12345)&0x7fffffff;return (seed>>>9)%n;};
 let same=0,total=0;
 for(const family of ['STM32F446RE','STM32F103RB'])for(let i=0;i<250;i++){
  const routes=routesOf(family),mcu={...defaultMcu(family),pins:{},peripherals:{},nvic:{}};
  for(const id of Object.keys(routes).filter(()=>rnd(6)===0)){
   const p={enabled:true};
   if(/^TIM/.test(id)){p.prescaler=rnd(2)?15999:0;p.period=[99,999,65535][rnd(3)];p.mode=['base','pwm','oc','capture','encoder'][/TIM[67]/.test(id)?0:rnd(5)];if(rnd(3)===0&&p.mode!=='encoder')p.onePulse=true;if(rnd(3)===0)p.trgo=['UPDATE','ENABLE'][rnd(2)];if(/TIM[18]/.test(id)&&rnd(2)){p.repetition=1+rnd(5);p.deadTime=1+rnd(40);}if(p.mode==='encoder')p.prescaler=0;else if(rnd(3)===0&&!/TIM[67]/.test(id))p.counterMode=['DOWN','CENTERALIGNED2'][rnd(2)];if(['pwm','oc'].includes(p.mode))p.pulse=rnd(90);}
   if(id==='ADC1'){if(rnd(2))p.conversions=1+rnd(4);if(rnd(2))p.continuous=true;}
   if(id==='IWDG'){p.prescaler=[4,32,256][rnd(3)];p.reload=rnd(4096);}
   if(id==='WWDG'){p.prescaler=[1,2,4,8][rnd(4)];p.window=64+rnd(64);p.counter=64+rnd(64);if(rnd(2))p.ewi=true;}
   if(/^US?ART/.test(id)){p.baud=[9600,115200][rnd(2)];if(rnd(2))p.parity=['EVEN','ODD'][rnd(2)];if(rnd(2))p.stopBits=2;}
   if(/^SPI/.test(id)){p.clock=[1000000,500000,125000][rnd(3)];if(rnd(2))p.cpol='HIGH';if(rnd(2))p.firstBit='LSB';}
   if(/^I2C/.test(id)){p.clock=[100000,400000][rnd(2)];if(rnd(2))p.ownAddress=1+rnd(126);}
   mcu.peripherals[id]=p;
   for(const [sig,options]of Object.entries(routes[id])){if(!options.length||/N$/.test(sig)&&!['pwm','oc'].includes(p.mode)||rnd(4)===0&&/CH[34]|N$|IN[2-9]|IN1\d|OUT2|^CK$/.test(sig)&&!/SDIO/.test(id))continue;const free=options.find(q=>!mcu.pins[q]);if(free)mcu.pins[free]=pin(id+'_'+sig,{pull:['NOPULL','PULLUP'][rnd(2)]});}
  }
  for(const q of ['PC0','PC1','PC4','PB12'])if(!mcu.pins[q]&&rnd(3)===0)mcu.pins[q]=rnd(2)?pin('GPIO_Output',{label:'OUT_'+q,initial:rnd(2)}):pin('GPIO_Input',{pull:['PULLUP','PULLDOWN','NOPULL'][rnd(3)]});
  for(const irq of irqNamesOf(family))if(rnd(6)===0&&!/^DMA/.test(irq))mcu.nvic[irq]={enabled:true,priority:rnd(16)};
  let v;try{v=validateMcu(mcu);}catch{continue;}
  total++;const text=exportIoc(v),back=importIoc(text);
  // Settings the Pinout itself reports as a problem (a pin missing, an interrupt without its peripheral) may come back
  // changed; the valid ones must be identical.
  if(configProblems(v).length)continue;
  assert.deepEqual(back.config,v,`${family} #${i}\n${text}`);assert.deepEqual(back.warnings,[],`${family} #${i}`);same++;
 }
 assert.ok(total>300&&same>100,`${same} of ${total} configurations compared`);
});
