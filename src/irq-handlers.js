// Interrupt handlers of the enabled NVIC lines, as CubeMX writes them into stm32xxxx_it.c. The generated main.c shows the
// ones the built-in interpreter runs (UART/USART, timers, EXTI, DMA, DCMI, SDIO); the GCC build adds every missing one to
// its environment file, so a project without them (or an older main.c) still links with working interrupts.
// The code is in Rust (rust/stm-core/src/csedit.rs; feature 62): this file is what the JavaScript callers import.
import {rustFn,rustPure} from './rust-core.js';

const handleOf=rustPure('dma_handle');
export const dmaHandle=request=>handleOf(request);
// [{name, irq, body, extern, shown}] — `body` is empty for a line with nothing to serve (a peripheral that is off),
// `shown` marks handlers the generated main.c carries.
export const irqHandlers=mcu=>rustFn('irq_handlers',{peripherals:mcu?.peripherals,pins:mcu?.pins,dma:mcu?.dma,nvic:mcu?.nvic});
// CubeMX-style handler text for main.c, with its two user sections.
export const handlerText=h=>rustFn('handler_text',{name:h.name,irq:h.irq,body:h.body});
