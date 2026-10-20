// Cortex-M4 NVIC model for the HAL interpreter: 4 priority bits (STM32F4), PRIGROUP split into
// preemption (group) and sub priority, PRIMASK/BASEPRI masking, pending/active state and SysTick.
const names=(prefix,from,count)=>Array.from({length:count},(_,i)=>`${prefix}${i}_IRQn`);
export const IRQ_NUMBERS={WWDG_IRQn:0,PVD_IRQn:1,TAMP_STAMP_IRQn:2,RTC_WKUP_IRQn:3,FLASH_IRQn:4,RCC_IRQn:5,EXTI0_IRQn:6,EXTI1_IRQn:7,EXTI2_IRQn:8,EXTI3_IRQn:9,EXTI4_IRQn:10,
 ...Object.fromEntries(names('DMA1_Stream',0,7).map((n,i)=>[n,11+i])),ADC_IRQn:18,CAN1_TX_IRQn:19,CAN1_RX0_IRQn:20,CAN1_RX1_IRQn:21,CAN1_SCE_IRQn:22,EXTI9_5_IRQn:23,
 TIM2_IRQn:28,TIM3_IRQn:29,TIM4_IRQn:30,I2C1_EV_IRQn:31,I2C1_ER_IRQn:32,I2C2_EV_IRQn:33,I2C2_ER_IRQn:34,SPI1_IRQn:35,SPI2_IRQn:36,USART1_IRQn:37,USART2_IRQn:38,USART3_IRQn:39,EXTI15_10_IRQn:40,
 DMA1_Stream7_IRQn:47,SDIO_IRQn:49,TIM5_IRQn:50,SPI3_IRQn:51,UART4_IRQn:52,UART5_IRQn:53,...Object.fromEntries(names('DMA2_Stream',0,5).map((n,i)=>[n,56+i])),
 DMA2_Stream5_IRQn:68,DMA2_Stream6_IRQn:69,DMA2_Stream7_IRQn:70,USART6_IRQn:71,DCMI_IRQn:78};
export const SYSTICK='SysTick_IRQn';
// HAL NVIC_PRIORITYGROUP_x register values -> number of preemption bits.
export const PRIORITY_GROUPS={7:0,6:1,5:2,4:3,3:4};
export const NVIC_CONSTANTS={NVIC_PRIORITYGROUP_0:7,NVIC_PRIORITYGROUP_1:6,NVIC_PRIORITYGROUP_2:5,NVIC_PRIORITYGROUP_3:4,NVIC_PRIORITYGROUP_4:3,TICK_INT_PRIORITY:15,__NVIC_PRIO_BITS:4,
 SysTick_IRQn:SYSTICK,...Object.fromEntries(Object.keys(IRQ_NUMBERS).map(n=>[n,n]))};
const int=(value,min,max,label)=>{if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${label}: ${min}~${max} 범위의 정수가 필요합니다.`);return value;};
export class Nvic{
 constructor(hal){this.hal=hal;this.preemptBits=4;this.encoded=new Map();this.active=[];this.basepri=0;this.tickEncoded=15;this.tick={lost:0,blockedAt:null,frozen:0};}
 isIrq(irq){return Object.hasOwn(IRQ_NUMBERS,irq);}
 encode(pre,sub){const pb=this.preemptBits,sb=4-pb;return ((pre&((1<<pb)-1))<<sb)|(sub&((1<<sb)-1));}
 groupOfValue(p){return p>>(4-this.preemptBits);}
 encodedOf(irq){if(irq===SYSTICK)return this.tickEncoded;if(this.encoded.has(irq))return this.encoded.get(irq);const cfg=this.hal.config.nvic[irq]?.priority??0;return this.encode(cfg,0);}
 group(irq){return this.groupOfValue(this.encodedOf(irq));}
 setGrouping(value){if(!Object.hasOwn(PRIORITY_GROUPS,value))throw new Error('NVIC_PRIORITYGROUP_0~4를 사용하세요.');this.preemptBits=PRIORITY_GROUPS[value];}
 setPriority(irq,pre,sub){
  if(irq!==SYSTICK&&!this.isIrq(irq))throw new Error(`미지원 IRQ: ${irq}`);int(pre,0,15,'IRQ preemption priority');int(sub,0,15,'IRQ sub priority');
  const value=this.encode(pre,sub);if(irq===SYSTICK)this.tickEncoded=value;else this.encoded.set(irq,value);
 }
 // Current execution priority as a group value; Infinity = thread mode without masking.
 exec(r){let g=Infinity;for(const irq of this.active)g=Math.min(g,this.group(irq));if(this.basepri)g=Math.min(g,this.groupOfValue(this.basepri>>4));if(!r.interruptsEnabled)g=-1;return g;}
 canPreempt(irq,r){return this.group(irq)<this.exec(r);}
 order(a,b){return this.encodedOf(a)-this.encodedOf(b)||(IRQ_NUMBERS[a]??99)-(IRQ_NUMBERS[b]??99);}
 tickBlocked(r){return !this.canPreempt(SYSTICK,r);}
 // SysTick cannot run while masked: HAL_GetTick() freezes and only one pending tick survives.
 updateTick(r){
  const blocked=this.tickBlocked(r),ms=Math.floor(r.microTime/1000);
  if(blocked&&this.tick.blockedAt==null){this.tick.blockedAt=ms;this.tick.frozen=ms-this.tick.lost;}
  else if(!blocked&&this.tick.blockedAt!=null){const missed=ms-this.tick.lost-this.tick.frozen;if(missed>1)this.tick.lost+=missed-1;this.tick.blockedAt=null;}
 }
 now(r){this.updateTick(r);return (this.tick.blockedAt!=null?this.tick.frozen:Math.floor(r.microTime/1000)-this.tick.lost)>>>0;}
 activeName(){return this.active.at(-1);}
 ipsr(){const irq=this.active.at(-1);return irq?IRQ_NUMBERS[irq]+16:0;}
}
