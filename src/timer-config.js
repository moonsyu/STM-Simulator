// STM32F446RE, DS10693 alternate-function table. TIM2-TIM7 use APB1; the advanced timers TIM1 / TIM8 use APB2 and add
// complementary outputs (CHxN), a repetition counter and dead time (RM0390 section 16). TIM6/TIM7 are the basic timers (RM0390
// section 17): an up counter with no channels or pins, an update interrupt and a TRGO output (DAC / ADC trigger).
export const TIMER_ROUTES = {
  TIM1:{CH1:['PA8'],CH2:['PA9'],CH3:['PA10'],CH4:['PA11'],CH1N:['PA7','PB13'],CH2N:['PB0','PB14'],CH3N:['PB1','PB15']},
  TIM2:{CH1:['PA0','PA5','PA15'],CH2:['PA1','PB3'],CH3:['PA2','PB10'],CH4:['PA3']},
  TIM3:{CH1:['PA6','PB4','PC6'],CH2:['PA7','PB5','PC7'],CH3:['PB0','PC8'],CH4:['PB1','PC9']},
  TIM4:{CH1:['PB6'],CH2:['PB7'],CH3:['PB8'],CH4:['PB9']},
  TIM5:{CH1:['PA0'],CH2:['PA1'],CH3:['PA2'],CH4:['PA3']},
  TIM6:{},TIM7:{},
  TIM8:{CH1:['PC6'],CH2:['PC7'],CH3:['PC8'],CH4:['PC9'],CH1N:['PA5','PA7'],CH2N:['PB0','PB14'],CH3N:['PB1','PB15']}
};
export const TIMER_IDS=Object.keys(TIMER_ROUTES);
export const isTimer=id=>Object.hasOwn(TIMER_ROUTES,id);
export const BASIC_TIMERS=['TIM6','TIM7'];
export const isBasicTimer=id=>BASIC_TIMERS.includes(id);
// The timers whose channels reach pins (an alternate function).
export const CHANNEL_TIMER_IDS=TIMER_IDS.filter(id=>!isBasicTimer(id));
// The NVIC line of a timer: TIM6 shares its vector with the DAC underrun interrupt (TIM6_DAC_IRQn, TIM6_DAC_IRQHandler).
// The advanced timers have separate vectors: update (F4 TIM1_UP_TIM10 / TIM8_UP_TIM13, F1 TIM1_UP) and capture/compare.
export const ADVANCED_TIMERS=['TIM1','TIM8'];
export const isAdvancedTimer=id=>ADVANCED_TIMERS.includes(id);
/** The NVIC line of a timer's update interrupt (`f1`: STM32F1 names). */
export const timerIrq=(id,f1=false)=>id==='TIM6'?'TIM6_DAC_IRQn':id==='TIM1'?(f1?'TIM1_UP_IRQn':'TIM1_UP_TIM10_IRQn'):id==='TIM8'?'TIM8_UP_TIM13_IRQn':id+'_IRQn';
/** The NVIC line of a timer's capture / compare interrupts. */
export const timerCcIrq=(id,f1=false)=>isAdvancedTimer(id)?id+'_CC_IRQn':timerIrq(id,f1);
/** The timer an NVIC line belongs to ('TIM6_DAC_IRQn' → 'TIM6', 'TIM1_CC_IRQn' → 'TIM1'), or null. */
export const timerOfIrq=irq=>TIMER_IDS.find(id=>[timerIrq(id),timerIrq(id,true),timerCcIrq(id)].includes(irq))??null;
export const timerAf=id=>id==='TIM1'||id==='TIM2'?1:id==='TIM8'?3:2;
export const timerMax=id=>['TIM2','TIM5'].includes(id)?4294967295:65535;
export const TIMER_MODES={base:'내부 클록 / 주기',pwm:'PWM 출력',oc:'출력 비교 (Output Compare)',capture:'입력 캡처',encoder:'엔코더 A/B'};
// TRGO Parameters › Trigger Event Selection (TIMx_CR2 MMS): Reset (UG bit), Enable (CNT_EN), Update Event.
export const TIM_TRGO={RESET:'Reset (UG bit from TIMx_EGR)',ENABLE:'Enable (CNT_EN)',UPDATE:'Update Event'};
