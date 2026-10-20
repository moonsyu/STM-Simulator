# 펌웨어 에뮬레이터 구조

컴파일한 ARM ELF를 가상 NUCLEO-F446RE에서 명령어 단위로 실행하고, GPIO·통신 신호를 빵판 회로 모델에 연결합니다. 외부 설치나 네이티브 모듈 없이 순수 JavaScript(ES module)로 동작하며 renderer의 CSP(`script-src 'self'`)를 그대로 지킵니다.

## 계층

| 경로 | 책임 |
|---|---|
| `src/emu/bus.js` | 주소 공간. Flash 512 KB(0x0800_0000, 0x0000_0000 별칭), SRAM 128 KB(0x2000_0000), 비트밴드 별칭(0x2200_0000, 0x4200_0000), 주변장치 등록·디코딩, 미매핑 접근 BusFault |
| `src/emu/cpu.js` | Cortex-M4 코어. ARMv7E-M Thumb/Thumb-2 전체, DSP 확장, FPv4-SP 단정밀 FPU, 예외 진입·복귀·tail-chaining, 우선순위·선점, WFI/WFE 슬립, BKPT, SVC |
| `src/emu/scs.js` | System Control Space(0xE000_E000). NVIC 96 IRQ(ISER/ICER/ISPR/ICPR/IABR/IPR), SCB(CPUID/ICSR/VTOR/AIRCR/SCR/CCR/SHPR/SHCSR/CFSR/HFSR/CPACR), SysTick, DWT CYCCNT, ITM 포트 0(SWV printf), CoreDebug |
| `src/emu/elf.js` | ELF32 LE 파서. PT_LOAD 세그먼트, 심볼, DWARF `.debug_line`(v2~5) 주소↔파일:줄 |
| `src/emu/machine.js` | bus + cpu + scs 조립, 사이클 기반 실행 루프, 주변장치 tick, 디버그(중단점·단계 실행) |
| `src/emu/stm32f446/` | RCC, FLASH, PWR, SYSCFG, EXTI, GPIOA~H, TIM, USART/UART(비동기·동기), I²C, SPI, ADC, DMA1/2, DCMI, SDIO 등 레지스터 모델 |
| `src/firmware-session.js` | `SimulationSession`과 같은 인터페이스로 ELF를 실행하고 회로 엔진·장치 모델에 연결 |

## 주변장치 인터페이스

```js
// bus.map(base, size, device, name)
const device = {
  read(offset, size) { /* size: 1|2|4, returns unsigned value */ },
  write(offset, value, size) {},
  tick(cycles, machine) {},   // 선택: 경과 사이클만큼 상태 진행
  reset() {},                 // 선택
};
machine.nvic.setPending(irq);        // 펄스형 인터럽트
machine.nvic.setLine(irq, active);   // 레벨형 인터럽트
machine.cycles;                      // 누적 코어 사이클
machine.clock.sysclk;                // RCC 모델이 갱신하는 Hz
```

시간은 실행한 코어 사이클로 계산합니다. CPU가 WFI/WFE로 잠들면 다음 주변장치 이벤트까지 사이클을 건너뛰어 실제 시간보다 빠르게 진행할 수 있습니다.
