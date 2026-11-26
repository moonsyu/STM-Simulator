// NVIC settings as CubeMX shows them (System Core > NVIC, and each peripheral's NVIC Settings tab): a priority group,
// preemption and sub priority per interrupt, the fixed Cortex-M system exceptions and the HAL time base (SysTick).
// The code is in Rust (rust/stm-core/src/mcu.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure,rustTable} from './rust-core.js';

const T=rustTable('nvic_tables');
export const NVIC_GROUP_DEFAULT=T.group,TICK_PRIORITY_DEFAULT=T.tick;
// Cortex-M3/M4 system exceptions in CubeMX order; only the time base is edited here (TICK_INT_PRIORITY).
export const SYSTEM_IRQS=T.system;
export const nvicGroup=config=>config?.nvicGroup??NVIC_GROUP_DEFAULT;
export const tickPriority=config=>config?.tickPriority??TICK_PRIORITY_DEFAULT;
const limitsOf=rustPure('priority_limits'),labelOf=rustPure('irq_label'),irqsOf=rustPure('peripheral_irqs');
// NVIC_PRIORITYGROUP_n: n preemption bits and 4-n sub priority bits (STM32: 4 priority bits).
export const priorityLimits=group=>({...limitsOf(group)});
export const irqLabel=irq=>labelOf(String(irq));
// The interrupts a Pinout peripheral owns (its NVIC Settings tab).
export const peripheralIrqs=(family,id)=>[...irqsOf(family??'STM32F446RE',String(id))];
// CubeMX "available interrupts": enabled ones, and those of configured EXTI pins, enabled peripherals and used DMA streams.
export const irqAvailable=(config,irq)=>rustFn('irq_available',{family:config.family??'STM32F446RE',nvic:{[irq]:config.nvic[irq]},pins:config.pins,dma:config.dma,peripherals:config.peripherals},irq);
// DMA stream interrupts are always enabled for the streams in use (CubeMX "Force DMA channels Interrupts").
export const dmaForced=(config,irq)=>rustFn('dma_forced',{dma:config.dma},irq);
export const nvicProblems=config=>rustFn('nvic_problems',{nvic:config.nvic,dma:config.dma,nvicGroup:config.nvicGroup,tickPriority:config.tickPriority});
