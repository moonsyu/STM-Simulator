import {exampleProject} from './project.js';
import {validateMcu,generateHal} from './mcu-config.js';
import {boardPin} from './pins.js';
import {EXAMPLE_TIMER_CLOCK_HZ} from './mcu-defaults.js';
export const L298_EXAMPLES={l298n:'HAL · L298N 듀얼 DC 모터 제어'};
export const L298_GUIDES={l298n:'외부 12 V→VM · 5V 입력·공통 GND · PA0/PA1(TIM2 CH1/2)→ENA/ENB · PB4/PB5/PB6/PB7→IN1~4 · OUT1/2·OUT3/4→모터 · ENA/ENB·5V-EN 점퍼 제거'};
const pin=fn=>({function:fn,pull:'NOPULL',edge:'RISING',initial:0,label:''});
export function l298Example(){
 const p=exampleProject();p.name=L298_EXAMPLES.l298n;p.mcu.timerClockHz=EXAMPLE_TIMER_CLOCK_HZ;
 p.components=[{id:'driver',name:'L298N1',type:'l298n',x:775,y:350,rotation:0},{id:'supply',name:'12 V 전원',type:'dc_supply',x:775,y:155,rotation:0,span:98,voltage:12},{id:'motorA',name:'모터 A',type:'dc_motor',x:590,y:350,rotation:90,span:70},{id:'motorB',name:'모터 B',type:'dc_motor',x:970,y:350,rotation:90,span:70}];
 const wire=(from,to,color='#23a68a')=>p.wires.push({id:'l298-wire-'+p.wires.length,from,to,color});
 wire('part:supply:a','part:driver:p1','#dd654c');wire('part:supply:b','part:driver:p2','#4e647b');
 wire(boardPin('GND'),'part:driver:p2','#4e647b');wire(boardPin('5V'),'part:driver:p3','#dd654c');
 for(const [signal,n]of [['PA0',4],['PB4',5],['PB5',6],['PB6',7],['PB7',8],['PA1',9]])wire(boardPin(signal),`part:driver:p${n}`);
 for(const [id,a,b]of [['motorA',10,11],['motorB',12,13]]){wire(`part:driver:p${a}`,`part:${id}:a`,'#8064d8');wire(`part:driver:p${b}`,`part:${id}:b`,'#2786d7');}
 p.mcu.pins={PA0:pin('TIM2_CH1'),PA1:pin('TIM2_CH2'),PB4:pin('GPIO_Output'),PB5:pin('GPIO_Output'),PB6:pin('GPIO_Output'),PB7:pin('GPIO_Output')};
 p.mcu.peripherals={TIM2:{enabled:true,prescaler:83,period:999,mode:'pwm'}};p.mcu.nvic={};
 p.mcu=validateMcu(p.mcu);p.simulation={stepMs:1,pwmWaveform:true};
 p.code=generateHal(p.mcu);
 const init=`  /* External 12 V to VM; shared GND; regulated 5 V to logic input.
     Remove ENA, ENB and 5V-EN jumpers on a compatible L298N module. */
  __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 0);
  __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, 0);
  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1);
  HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_2);`;
 const loop=`    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_SET);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 750);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, 400);
    printf("L298N: A forward 75%%, B reverse 40%% (1 kHz)\\n");
    HAL_Delay(2000);

    /* Both enables LOW: let the motors coast before reversing. */
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 0);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, 0);
    printf("L298N: coast before direction change\\n");
    HAL_Delay(1000);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_5, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_7, GPIO_PIN_RESET);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 500);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, 1000);
    printf("L298N: A reverse 50%%, B forward 100%%\\n");
    HAL_Delay(2000);

    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 0);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, 0);
    HAL_GPIO_WritePin(GPIOB, GPIO_PIN_4 | GPIO_PIN_5 | GPIO_PIN_6 | GPIO_PIN_7, GPIO_PIN_RESET);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 1000);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, 1000);
    printf("L298N: brake (EN HIGH, both inputs LOW)\\n");
    HAL_Delay(1000);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 0);
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_2, 0);
    printf("L298N: coast (EN LOW)\\n");
    HAL_Delay(1000);`;
 for(const [section,text]of [[2,init],[3,loop]])p.code=p.code.replace(new RegExp('/\\* USER CODE BEGIN '+section+' \\*/[\\s\\S]*?/\\* USER CODE END '+section+' \\*/'),`/* USER CODE BEGIN ${section} */\n${text}\n    /* USER CODE END ${section} */`);
 return p;
}
