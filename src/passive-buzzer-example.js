import {blankProject} from './project.js';
import {validateMcu,generateHal} from './mcu-config.js';
import {boardPin} from './pins.js';
import {EXAMPLE_TIMER_CLOCK_HZ} from './mcu-defaults.js';

export const BUZZER_EXAMPLES={passive_buzzer:'HAL · 수동 부저 PWM 멜로디'};
export const BUZZER_GUIDES={passive_buzzer:'TIM2 CH1 PA0 → 수동 부저 +, − → GND · 1 MHz 타이머 / 듀티 50% · 도레미파솔라시도와 쉼표 · 상단 소리 버튼으로 듣기'};
export function passiveBuzzerExample(){
  const p=blankProject();p.name=BUZZER_EXAMPLES.passive_buzzer;p.mcu.timerClockHz=EXAMPLE_TIMER_CLOCK_HZ;
  p.components=[{id:'demo',name:'PBZ1',type:'passive_buzzer',x:780,y:300,rotation:0,span:70}];
  p.wires=[{id:'tone',from:boardPin('PA0'),to:'part:demo:a',color:'#8064d8'},
    {id:'ground',from:boardPin('GND'),to:'part:demo:b',color:'#4e647b'}];
  p.simulation={stepMs:1,pwmWaveform:true};
  p.mcu.pins={PA0:{function:'TIM2_CH1',pull:'NOPULL',edge:'RISING',initial:0,label:''}};
  p.mcu.peripherals={TIM2:{enabled:true,prescaler:83,period:1999,mode:'pwm'}};p.mcu.nvic={};
  p.mcu=validateMcu(p.mcu);
  const helper=`// TIM2 tick = 84 MHz / (83 + 1) = 1 MHz.
// Passive piezo: PA0 -> +, GND -> -. Enable the simulator sound button.
void playNote(uint32_t frequency, uint32_t duration) {
  HAL_TIM_PWM_Stop(&htim2, TIM_CHANNEL_1);
  if (frequency > 0) {
    uint32_t period = 1000000 / frequency;
    __HAL_TIM_SET_AUTORELOAD(&htim2, period - 1);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, period / 2);
    __HAL_TIM_SET_COUNTER(&htim2, 0);
    HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
    printf("Passive buzzer: %lu Hz\\n", frequency);
  } else {
    printf("Passive buzzer: rest\\n");
  }
  HAL_Delay(duration);
  HAL_TIM_PWM_Stop(&htim2, TIM_CHANNEL_1);
}
`;
  const loop=`    uint32_t notes[8] = {523, 587, 659, 698, 784, 880, 988, 1047};
    for (int i = 0; i < 8; i++) {
      playNote(notes[i], 350);
      playNote(0, 80);
    }
    playNote(0, 600);`;
  p.code=generateHal(p.mcu).replace('int main(void) {',helper+'\nint main(void) {')
    .replace(/\/\* USER CODE BEGIN 3 \*\/[\s\S]*?\/\* USER CODE END 3 \*\//,`/* USER CODE BEGIN 3 */\n${loop}\n    /* USER CODE END 3 */`);
  return p;
}
