// STM32F446RE, DS10693 alternate-function table. All six timers use APB1. TIM6/TIM7 are the basic timers (RM0390
// section 17): an up counter with no channels or pins, an update interrupt and a TRGO output (DAC / ADC trigger).
export const TIMER_ROUTES = {
  TIM2:{CH1:['PA0','PA5','PA15'],CH2:['PA1','PB3'],CH3:['PA2','PB10'],CH4:['PA3']},
  TIM3:{CH1:['PA6','PB4','PC6'],CH2:['PA7','PB5','PC7'],CH3:['PB0','PC8'],CH4:['PB1','PC9']},
  TIM4:{CH1:['PB6'],CH2:['PB7'],CH3:['PB8'],CH4:['PB9']},
  TIM5:{CH1:['PA0'],CH2:['PA1'],CH3:['PA2'],CH4:['PA3']},
  TIM6:{},TIM7:{}
};
export const TIMER_IDS=Object.keys(TIMER_ROUTES);
export const isTimer=id=>Object.hasOwn(TIMER_ROUTES,id);
export const BASIC_TIMERS=['TIM6','TIM7'];
export const isBasicTimer=id=>BASIC_TIMERS.includes(id);
// The timers whose channels reach pins (an alternate function).
export const CHANNEL_TIMER_IDS=TIMER_IDS.filter(id=>!isBasicTimer(id));
// The NVIC line of a timer: TIM6 shares its vector with the DAC underrun interrupt (TIM6_DAC_IRQn, TIM6_DAC_IRQHandler).
export const timerIrq=id=>id==='TIM6'?'TIM6_DAC_IRQn':id+'_IRQn';
/** The timer an NVIC line belongs to ('TIM6_DAC_IRQn' → 'TIM6'), or null. */
export const timerOfIrq=irq=>TIMER_IDS.find(id=>timerIrq(id)===irq)??null;
export const timerAf=id=>id==='TIM2'?1:2;
export const timerMax=id=>['TIM2','TIM5'].includes(id)?4294967295:65535;
export const TIMER_MODES={base:'내부 클록 / 주기',pwm:'PWM 출력',oc:'출력 비교 (Output Compare)',capture:'입력 캡처',encoder:'엔코더 A/B'};
// TRGO Parameters › Trigger Event Selection (TIMx_CR2 MMS): Reset (UG bit), Enable (CNT_EN), Update Event.
export const TIM_TRGO={RESET:'Reset (UG bit from TIMx_EGR)',ENABLE:'Enable (CNT_EN)',UPDATE:'Update Event'};
