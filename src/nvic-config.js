// NVIC settings as CubeMX shows them (System Core > NVIC, and each peripheral's NVIC Settings tab): a priority group,
// preemption and sub priority per interrupt, the fixed Cortex-M system exceptions and the HAL time base (SysTick).
import {irqNamesOf} from './mcu-family.js';
export const NVIC_GROUP_DEFAULT=4,TICK_PRIORITY_DEFAULT=15;
// Cortex-M3/M4 system exceptions in CubeMX order; only the time base is edited here (TICK_INT_PRIORITY).
export const SYSTEM_IRQS=[['NonMaskableInt_IRQn','Non maskable interrupt'],['HardFault_IRQn','Hard fault interrupt'],['MemoryManagement_IRQn','Memory management fault'],
  ['BusFault_IRQn','Pre-fetch fault, memory access fault'],['UsageFault_IRQn','Undefined instruction or illegal state'],['SVCall_IRQn','System service call via SWI instruction'],
  ['DebugMonitor_IRQn','Debug monitor'],['PendSV_IRQn','Pendable request for system service'],['SysTick_IRQn','Time base: System tick timer']];
export const nvicGroup=config=>config?.nvicGroup??NVIC_GROUP_DEFAULT;
export const tickPriority=config=>config?.tickPriority??TICK_PRIORITY_DEFAULT;
// NVIC_PRIORITYGROUP_n: n preemption bits and 4-n sub priority bits (STM32: 4 priority bits).
export const priorityLimits=group=>({preempt:(1<<group)-1,sub:(1<<(4-group))-1});
export function irqLabel(irq){
  let m;
  if((m=/^EXTI(\d)_IRQn$/.exec(irq)))return `EXTI line${m[1]} interrupt`;
  if(irq==='EXTI9_5_IRQn')return 'EXTI line[9:5] interrupts';if(irq==='EXTI15_10_IRQn')return 'EXTI line[15:10] interrupts';
  if((m=/^(I2C\d)_(EV|ER)_IRQn$/.exec(irq)))return `${m[1]} ${m[2]==='EV'?'event':'error'} interrupt`;
  if(irq==='ADC_IRQn')return 'ADC1, ADC2 and ADC3 global interrupts';if(irq==='ADC1_2_IRQn')return 'ADC1 and ADC2 global interrupts';
  if((m=/^(DMA\d)_(Stream|Channel)(\d)_IRQn$/.exec(irq)))return `${m[1]} ${m[2].toLowerCase()}${m[3]} global interrupt`;
  return irq.replace(/_IRQn$/,'')+' global interrupt';
}
// The interrupts a Pinout peripheral owns (its NVIC Settings tab).
export const peripheralIrqs=(family,id)=>irqNamesOf(family).filter(irq=>irq===id+'_IRQn'||(irq.startsWith(id+'_')&&!/^DMA/.test(irq))||(id==='ADC1'&&/^ADC(1_2)?_IRQn$/.test(irq)));
const extiLines=irq=>{if(irq==='EXTI9_5_IRQn')return [5,6,7,8,9];if(irq==='EXTI15_10_IRQn')return [10,11,12,13,14,15];const m=/^EXTI(\d)_IRQn$/.exec(irq);return m?[Number(m[1])]:null;};
// CubeMX "available interrupts": enabled ones, and those of configured EXTI pins, enabled peripherals and used DMA streams.
export function irqAvailable(config,irq){
  if(config.nvic[irq]?.enabled)return true;
  const lines=extiLines(irq);if(lines)return Object.entries(config.pins).some(([pin,p])=>p.function==='GPIO_EXTI'&&lines.includes(Number(pin.slice(2))));
  if(/^DMA\d_(Stream|Channel)\d_IRQn$/.test(irq))return Object.values(config.dma||{}).some(d=>d.stream+'_IRQn'===irq);
  return Object.entries(config.peripherals).some(([id,p])=>p.enabled&&peripheralIrqs(config.family,id).includes(irq));
}
// DMA stream interrupts are always enabled for the streams in use (CubeMX "Force DMA channels Interrupts").
export const dmaForced=(config,irq)=>/^DMA\d_(Stream|Channel)\d_IRQn$/.test(irq)&&Object.values(config.dma||{}).some(d=>d.stream+'_IRQn'===irq);
export function nvicProblems(config){
  const group=nvicGroup(config),{preempt,sub}=priorityLimits(group),errors=[];
  for(const [irq,n]of Object.entries(config.nvic||{}))if(n.enabled||dmaForced(config,irq)){
    if(n.priority>preempt)errors.push(`${irq}: NVIC_PRIORITYGROUP_${group}에서 선점 우선순위(Preemption)는 0~${preempt}입니다.`);
    if((n.sub??0)>sub)errors.push(`${irq}: NVIC_PRIORITYGROUP_${group}에서 서브 우선순위(Sub)는 0~${sub}입니다.`);
  }
  if(tickPriority(config)>preempt)errors.push(`SysTick_IRQn(Time base): NVIC_PRIORITYGROUP_${group}에서 선점 우선순위는 0~${preempt}입니다.`);
  return errors;
}
