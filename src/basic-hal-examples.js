import {exampleProject} from './project.js';
import {PART_DEFS} from './components.js';
import {boardPin} from './pins.js';
import {generateHal,validateMcu} from './mcu-config.js';
export const BASIC_EXAMPLES={potentiometer:'HAL · 가변저항 ADC',slide:'HAL · 슬라이드 스위치',rgb:'HAL · RGB LED',lcd:'HAL · LCD 1602 4비트',diode:'HAL · 다이오드 순방향 전압',buzzer:'HAL · 능동 부저',sevenseg:'HAL · 7세그먼트 숫자'};
export const BASIC_GUIDES={potentiometer:'1→GND, 2(WIPER)→PA0 ADC1, 3→3V3 · 위치 50%에서 약 1.65 V / 2048',slide:'A→GND, COM→PA10 입력, B→3V3 · 위치에 따라 0/1 출력',rgb:'R/G/B 각각 PB3/PB4/PB5→330 Ω→애노드, 공통 K→GND · 빨강/초록/파랑 순환',lcd:'VSS/VO/RW/K→GND, VDD→5V, A→220 Ω→5V · RS PB0, E PB1, DB4~7 PB4~7 · DB0~3 미연결',diode:'PA5→1 kΩ→다이오드 A, K→GND · A→PA0 ADC · HIGH에서 약 0.7 V',buzzer:'+→PA5, −→GND · 능동 부저는 내부 발진기 사용, 0.5초 켜기/끄기',sevenseg:'PB0~7→각 1 kΩ→a/b/c/d/e/f/g/dp, K1/K2→GND · 0~9 반복'};
export function basicHalExample(kind){
 const p=exampleProject();p.name=BASIC_EXAMPLES[kind];p.simulation={stepMs:1,pwmWaveform:false};const m=p.mcu;let count=0;
 const def=PART_DEFS[kind];p.components=[{id:'demo',name:def?.prefix+'1',type:kind,x:820,y:330,rotation:0,span:70,...def?.defaults}];
 const term=(n,id='demo')=>`part:${id}:${typeof n==='number'?'p'+n:n}`,wire=(a,b)=>p.wires.push({id:'w'+(++count),from:a,to:b,color:'#23a68a'}),connect=(signal,n)=>wire(boardPin(signal),term(n));
 const pin=(name,fn,pull='NOPULL')=>m.pins[name]={function:fn,pull,edge:'FALLING',initial:0,label:''};
 const resistor=(id,value,from,to)=>{p.components.push({id,name:id.toUpperCase(),type:'resistor',value,x:1050,y:200+p.components.length*65,rotation:0,span:70});wire(from,term('a',id));wire(term('b',id),to);};
 let init='',loop='',helpers='';
 if(['potentiometer','diode'].includes(kind)){pin('PA0','ADC1_IN0');m.peripherals.ADC1={enabled:true};loop='HAL_ADC_Start(&hadc1);\n    HAL_ADC_PollForConversion(&hadc1, 10);\n    uint32_t raw = HAL_ADC_GetValue(&hadc1);\n    printf("ADC=%lu, voltage=%.3f V\\n", raw, raw * 3.3 / 4095);\n    HAL_Delay(200);';}
 if(kind==='potentiometer'){connect('GND',1);connect('PA0',2);connect('3V3',3);}
 if(kind==='diode'){pin('PA5','GPIO_Output');connect('GND','b');connect('PA0','a');resistor('r1',1000,boardPin('PA5'),term('a'));init='HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);';}
 if(kind==='slide'){connect('GND',1);connect('PA10',2);connect('3V3',3);pin('PA10','GPIO_Input');loop='printf("switch=%u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10));\n    HAL_Delay(100);';}
 if(kind==='buzzer'){pin('PA5','GPIO_Output');connect('PA5','a');connect('GND','b');loop='HAL_GPIO_TogglePin(GPIOA, GPIO_PIN_5);\n    HAL_Delay(500);';}
 if(kind==='rgb'){connect('GND',2);helpers='uint32_t rgbPhase = 0;\n';for(const [i,n]of [1,3,4].entries()){pin('PB'+(3+i),'GPIO_Output');resistor('r'+i,330,boardPin('PB'+(3+i)),term(n));loop+=`HAL_GPIO_WritePin(GPIOB, GPIO_PIN_${3+i}, rgbPhase == ${i} ? GPIO_PIN_SET : GPIO_PIN_RESET);\n    `;}loop+='rgbPhase = (rgbPhase + 1) % 3;\n    HAL_Delay(500);';}
 if(kind==='sevenseg'){
  connect('GND',3);connect('GND',8);helpers='uint8_t digit = 0;\nuint8_t digits[10] = {63,6,91,79,102,109,125,7,127,111};\n';
  for(const [i,n]of [7,6,4,2,1,9,10,5].entries()){pin('PB'+i,'GPIO_Output');resistor('r'+i,1000,boardPin('PB'+i),term(n));loop+=`HAL_GPIO_WritePin(GPIOB, GPIO_PIN_${i}, (digits[digit] & ${1<<i}) ? GPIO_PIN_SET : GPIO_PIN_RESET);\n    `;}loop+='printf("digit=%u\\n", digit);\n    digit = (digit + 1) % 10;\n    HAL_Delay(500);';
 }
 if(kind==='lcd'){
  for(const n of [1,3,5,16])connect('GND',n);connect('5V',2);resistor('backlight',220,boardPin('5V'),term(15));
  for(const [n,g]of [[4,0],[6,1],[11,4],[12,5],[13,6],[14,7]]){pin('PB'+g,'GPIO_Output');connect('PB'+g,n);}
  helpers=`void lcdNibble(uint8_t value) {
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, (value & 1) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, (value & 2) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, (value & 4) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, (value & 8) ? GPIO_PIN_SET : GPIO_PIN_RESET);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_1, GPIO_PIN_SET); HAL_Delay(1);
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_1, GPIO_PIN_RESET); HAL_Delay(1);
}
void lcdSend(uint8_t value, uint8_t data) {
  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_0, data ? GPIO_PIN_SET : GPIO_PIN_RESET);
  lcdNibble(value >> 4); lcdNibble(value & 15); HAL_Delay(2);
}
void lcdPrint(char text[]) { for (int i = 0; text[i] != 0; i++) lcdSend(text[i], 1); }
`;
  init='HAL_Delay(20);\n  lcdNibble(3); HAL_Delay(5); lcdNibble(3); lcdNibble(3); lcdNibble(2);\n  lcdSend(0x28,0); lcdSend(0x0C,0); lcdSend(0x06,0); lcdSend(0x01,0);\n  char line1[] = "STM Emulator"; char line2[] = "HAL 4-bit LCD"; lcdPrint(line1); lcdSend(0xC0,0); lcdPrint(line2);';loop='HAL_Delay(100);';
 }
 p.mcu=validateMcu(m);p.code=generateHal(p.mcu);for(const [section,text]of [[2,init],[3,loop]])p.code=p.code.replace(new RegExp(`/\\* USER CODE BEGIN ${section} \\*/[\\s\\S]*?/\\* USER CODE END ${section} \\*/`),`/* USER CODE BEGIN ${section} */\n    ${text}\n    /* USER CODE END ${section} */`);
 p.code=p.code.replace('#include <stdio.h>','#include <stdio.h>\n// '+BASIC_GUIDES[kind]+'\n'+helpers);return p;
}
