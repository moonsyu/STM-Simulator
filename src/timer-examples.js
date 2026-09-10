import {blankProject} from './project.js';
import {deviceExample} from './device-examples.js';
import {validateMcu,generateHal} from './mcu-config.js';
import {boardPin} from './pins.js';
export const TIMER_EXAMPLES={timer_multi:'HAL · 독립 타이머 서보·DC 모터',timer_capture:'HAL · TIM4 입력 캡처',timer_encoder:'HAL · TIM4 엔코더 모드'};
export const TIMER_GUIDES={timer_multi:'TIM2 PA5: 서보 50 Hz · TIM3 PA6: DC 모터 1 kHz · PB6/PB7 방향 제어',timer_capture:'TIM3 CH1 PA6 (250 Hz) → TIM4 CH1 PB6 입력 캡처 · TIM4 1 MHz, NVIC 활성',timer_encoder:'엔코더 A→TIM4 CH1 PB6, B→CH2 PB7, SW→PA10 · 하드웨어 TI12 직교 카운터'};
const pin=fn=>({function:fn,pull:'NOPULL',edge:'RISING',initial:0,label:''});
export function timerExample(kind){
  const p=kind==='timer_multi'?deviceExample('motor'):kind==='timer_encoder'?deviceExample('encoder'):blankProject();p.name=TIMER_EXAMPLES[kind];
  const m=p.mcu;let globals='',init='',loop='',callback='';
  if(kind==='timer_multi'){
    m.pins.PA6=pin('TIM3_CH1');m.peripherals.TIM2={enabled:true,prescaler:83,period:19999,mode:'pwm'};m.peripherals.TIM3={enabled:true,prescaler:83,period:999,mode:'pwm'};
    p.wires.find(w=>w.to==='part:demo:p3').from=boardPin('PA6');p.components[0].y=380;
    p.components.push({id:'servo2',type:'servo',name:'SERVO1',x:780,y:180,rotation:0});
    for(const [i,signal]of ['5V','GND','PA5'].entries())p.wires.push({id:'servo-wire-'+i,from:boardPin(signal),to:`part:servo2:p${i+1}`,color:i===1?'#4e647b':'#23a68a'});
    globals='uint32_t position = 0;\n';init='  __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 1000);\n  __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, 750);\n  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);\n  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);';
    loop='    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 1000 + position*500);\n    printf("TIM2 servo=%lu deg (50 Hz), TIM3 motor=75%% (1000 Hz)\\n", position*90);\n    position = (position+1)%3;\n    HAL_Delay(1200);';
    p.simulation={stepMs:1,pwmWaveform:true};
  }
  if(kind==='timer_capture'){
    m.pins={PA6:pin('TIM3_CH1'),PB6:pin('TIM4_CH1')};m.peripherals={TIM3:{enabled:true,prescaler:83,period:3999,mode:'pwm'},TIM4:{enabled:true,prescaler:83,period:65535,mode:'capture'}};m.nvic={TIM4_IRQn:{enabled:true,priority:1}};
    p.wires=[{id:'capture-signal',from:boardPin('PA6'),to:boardPin('PB6'),color:'#8064d8'}];p.simulation={stepMs:.1,pwmWaveform:true};
    globals='volatile uint32_t capturePrevious = 0, capturePeriod = 0, captureReady = 0;\nuint32_t captureSeen = 0;\n';
    init='  HAL_TIM_IC_Start_IT(&htim4, TIM_CHANNEL_1);\n  HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);';
    loop='    if (captureReady && capturePeriod > 0) {\n      printf("TIM4 capture: period=%lu us frequency=%lu Hz\\n", capturePeriod, 1000000 / capturePeriod);\n      captureReady = 0;\n    }\n    HAL_Delay(100);';
    callback='  if (htim->Instance == TIM4 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_1) {\n    uint32_t now = HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1);\n    if (captureSeen) { capturePeriod = (now - capturePrevious) & 65535; captureReady = 1; }\n    capturePrevious = now; captureSeen = 1;\n  }';
  }
  if(kind==='timer_encoder'){
    delete m.pins.PA0;delete m.pins.PA1;m.pins.PB6=pin('TIM4_CH1');m.pins.PB7=pin('TIM4_CH2');m.peripherals={TIM4:{enabled:true,prescaler:0,period:65535,mode:'encoder'}};m.nvic={};
    p.wires.find(w=>w.to==='part:demo:p3').from=boardPin('PB6');p.wires.find(w=>w.to==='part:demo:p4').from=boardPin('PB7');
    init='  HAL_TIM_Encoder_Start(&htim4, TIM_CHANNEL_ALL);';
    loop='    int16_t edges = (int16_t)__HAL_TIM_GET_COUNTER(&htim4);\n    printf("TIM4 encoder: count=%d edges=%d pressed=%u\\n", edges/4, edges, !HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_10));\n    HAL_Delay(100);';
  }
  p.mcu=validateMcu(m);p.code=generateHal(p.mcu).replace('int main(void) {',globals+'\nint main(void) {');
  for(const [section,text]of [[2,init],[3,loop]])p.code=p.code.replace(new RegExp('/\\* USER CODE BEGIN '+section+' \\*/[\\s\\S]*?/\\* USER CODE END '+section+' \\*/'),`/* USER CODE BEGIN ${section} */\n${text}\n    /* USER CODE END ${section} */`);
  if(callback)p.code=p.code.replace('  /* Read HAL_TIM_ReadCapturedValue(htim, TIM_CHANNEL_1). */',callback);
  return p;
}
