// STM32F446RE, DS10693 alternate-function table. All four timers use APB1.
export const TIMER_ROUTES = {
  TIM2:{CH1:['PA0','PA5','PA15'],CH2:['PA1','PB3'],CH3:['PA2','PB10'],CH4:['PA3']},
  TIM3:{CH1:['PA6','PB4','PC6'],CH2:['PA7','PB5','PC7'],CH3:['PB0','PC8'],CH4:['PB1','PC9']},
  TIM4:{CH1:['PB6'],CH2:['PB7'],CH3:['PB8'],CH4:['PB9']},
  TIM5:{CH1:['PA0'],CH2:['PA1'],CH3:['PA2'],CH4:['PA3']}
};
export const TIMER_IDS=Object.keys(TIMER_ROUTES);
export const isTimer=id=>Object.hasOwn(TIMER_ROUTES,id);
export const timerAf=id=>id==='TIM2'?1:2;
export const timerMax=id=>['TIM2','TIM5'].includes(id)?4294967295:65535;
export const TIMER_MODES={base:'내부 클록 / 주기',pwm:'PWM 출력',capture:'입력 캡처',encoder:'엔코더 A/B'};
