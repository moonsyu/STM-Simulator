# 클록 트리(Clock Configuration) 구현 계획

작성 2026-11-06. [기능 목록](FEATURES.md) 3번(CubeMX와 다른 점 메우기)의 첫 남은 항목. 근거는 이 PC의 CubeMX 6.18 데이터베이스(`%LOCALAPPDATA%\Programs\STM32CubeMX\db`)다.
- 한계: `mcu/IP/RCC-STM32F446-rcc_v1_0_Modes.xml`, `RCC-STM32F102_rcc_v1_0_Modes.xml`(F103도 이 파일)
- 보드 기본값: `plugins/boardmanager/boards/A42_…F446RE_Board.ioc`, `A10_…F103RB_Board.ioc`

## 지금

- 클록 설정은 숫자 하나(`mcu.timerClockHz`, APB1 타이머 클록)다.
- 생성기는 이 값으로 HSI PLL을 고른다(`clockPlan`, `clockPlanF1`). 그래서 F446은 90 MHz, F103은 64 MHz까지이고, HSE는 쓰지 못한다.
- `.ioc`의 HSE·72 MHz·180 MHz 설정은 가져올 때 가까운 HSI 값으로 바뀐다.
- ADC 분주는 F4가 `/4`로 고정, F1은 14 MHz 이하가 되는 가장 작은 값이다.

## 할 것

1. **모델**(`src/clock-tree.js`): 프로젝트 `mcu.clock`(선택).
   - F446: `sysclkSource`(HSI/HSE/PLLCLK), `pllSource`(HSI/HSE), `pllM` 2~63, `pllN` 50~432, `pllP` 2/4/6/8, `pllQ` 2~15, `ahb`, `apb1`, `apb2`, `adcPrescaler` 2/4/6/8.
   - F103: `sysclkSource`, `pllSource`(HSI = HSI/2, HSE), `hsePrediv` 1/2, `pllMul` 2~16, `ahb`, `apb1`, `apb2`, `adcPrescaler`.
   - HSE는 NUCLEO의 ST-LINK MCO 8 MHz(BYPASS)로 고정한다.
   - 주파수 계산과 한계 검사:
     - F446: VCO 입력 0.95~2.1 MHz, VCO 출력 100~432 MHz, PLLCLK 24~180 MHz, SYSCLK·HCLK 180 MHz, APB1 45 MHz, APB2 90 MHz, ADC 36 MHz.
     - F103: PLL·SYSCLK·HCLK·APB2 72 MHz, APB1 36 MHz, ADC 14 MHz.
   - Flash latency, F446 전압 스케일·Over-drive(HCLK > 168 MHz)도 계산한다.
2. **호환**: `clock`이 없는 프로젝트는 지금과 같은 코드를 생성한다. `clock`이 있으면 `timerClockHz`를 APB1 타이머 클록으로 맞춰 해석기·예제가 그대로 쓴다.
3. **생성 코드**: `SystemClock_Config`(HSE BYPASS, PLL, 분주, latency, F446 전압 스케일·`HAL_PWREx_EnableOverDrive`), ADC 분주(F4 `ClockPrescaler`, F1 `AdcClockSelection`).
4. **.ioc 가져오기**: `RCC.SYSCLKSource`, `PLLSourceVirtual`, `PLLM/N/P/Q`, `PLLMUL`, `HSEDivPLL`, `AHB/APB1/APB2CLKDivider`, `ADC1.ClockPrescaler`, `RCC.ADCPresc`. 생략된 키는 CubeMX 기본값이다(PLLM 16, PLLN 192, PLLP 2, PLLQ 2, PLLMUL 2, 원본 HSI).
5. **Pinout 화면**: 오른쪽 탭에 **Clock**을 둔다. 원본·PLL·분주를 고르면 각 클록 주파수와 한계 오류가 바로 보인다. **APB1 타이머 입력 클록** 칸은 트리를 쓰면 계산값만 보인다.
6. **해석기**: `HAL_RCC_GetPCLK1Freq`, 타이머(APB2 타이머는 APB2 기준), DMA, F1 ADC 시간이 트리 값을 쓴다.
7. **시험**:
   - 단위: 주파수·한계·생성 코드·.ioc.
   - 툴체인: F446 HSE 180 MHz, F103 HSE 72 MHz를 ARM GCC로 빌드하고 에뮬레이터에서 `SystemCoreClock`, UART 115200 출력, ADC 분주를 확인.
   - E2E: Clock 탭에서 바꾸면 주파수·코드가 바뀌는지.

## 하지 않는 것(이번)

LSE·LSI·RTC 클록 원본, MCO 출력 설정, PLLI2S·PLLSAI, PLLR로 SYSCLK, USB 분주(F1), CSS. 화면은 CubeMX 그림 대신 표 형식으로 둔다.
