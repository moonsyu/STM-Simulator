# NUCLEO-F446RE 기본 설정

확인일: 2026-10-07. 대상은 기존 프로젝트의 **NUCLEO-F446RE / STM32F446RE**다. 요청에 적힌 F443RE는 현재 지원 보드로 해석했다.

## 기준 문서

- ST [UM1724 Rev 17](https://www.st.com/resource/en/user_manual/um1724-stm32-nucleo64-boards-mb1136-stmicroelectronics.pdf): Nucleo-64 MB1136 보드, §7.9.1 외부 클록. ST-LINK MCO의 8 MHz 입력은 MCU가 리셋 후 사용하는 HSI와 별개다. 실제 HSE 연결은 보드 리비전과 솔더 브리지에 따라 달라진다.
- ST [RM0390 Rev 9](https://www.st.com/resource/en/reference_manual/dm00135183-stm32f446xx-advanced-arm-based-32-bit-mcus-stmicroelectronics.pdf): §6.2/6.3 RCC, §17.4 TIM2–5. §17.4.10–12(p.563)는 CNT/PSC/ARR=0, §17.4.13–16은 CCR=0을 기재한다. ARR=0에서는 카운터가 정지한다.
- ST [STM32F446RE 제품 사양](https://www.st.com/en/microcontrollers-microprocessors/stm32f446re.html): 내부 HSI 16 MHz, 최대 CPU 속도와 타이머 종류. 최대 동작 속도는 초기 클록이 아니다.

## 새 프로젝트와 새 TIM 설정

| 항목 | 기본값 |
|---|---|
| SYSCLK / HCLK / PCLK1 / PCLK2 / APB1 TIM 입력 | HSI 16 MHz, PLL OFF, AHB/APB 분주 1 |
| TIM2/3/4/5 Prescaler | PSC=0, 분주 비율 1 |
| Period | ARR=0, 카운터 정지 |
| CNT / 초기 PWM Pulse | 0 / CCR=0 |
| 카운트 방향 / CKD / ARR preload | Up / DIV1 / Disable |
| 주변장치 / NVIC | 비활성, 우선순위 입력 초기값 0 |
| GPIO | 사용자 기능 미할당, PA5 LED 출력 자동 활성화 없음 |

이는 **RM0390에 기재된 값에 따른 시뮬레이터 프리셋**이다. ARR 최대 범위(TIM2/5: 32비트, TIM3/4: 16비트)를 리셋값으로 간주하지 않는다. 문서의 ARR 리셋값과 실리콘 실제값의 일치 여부는 실물에서 검증하지 않았으며, 레지스터 전체를 정확히 재현한다는 의미가 아니다. 디버그 핀의 리셋 AF/풀업, RCC clock gating, PLL lock 시간, SysTick 초기화 등은 현재 실행 모델의 범위 밖이다.

TIM을 활성화해도 ARR=0이면 주기 인터럽트나 PWM 파형이 생기지 않는다. PWM Pulse는 0으로 시작하며 Pinout의 `초기 Pulse (CCR)`에서 설정한다. 현재 생성기는 한 TIM의 활성 PWM 채널들에 같은 초기 Pulse를 사용한다. 서로 다른 듀티는 소스의 `__HAL_TIM_SET_COMPARE()`로 설정한다.

예: 기본 16 MHz에서 PSC=15, ARR=999이면 1 kHz다. Pulse=250이면 PWM1의 듀티는 25%다. ARR=0의 정지 조건을 먼저 적용하며, 양수일 때 주파수는 `TIM clock / ((PSC+1) × (ARR+1))`다.

## 저장값과 예제

- 저장된 클록·PSC·ARR와 사용자 코드는 덮어쓰지 않는다. 새 프로젝트/미지정 필드에만 기본값을 채운다. 불러온 `.ioc`의 명시적 PSC·ARR·APB1 타이머 클록도 유지한다.
- 기존 HAL 예제는 84 MHz와 필요한 PSC/ARR/듀티를 명시한다. LED 100 ms, 서보 50 Hz, 모터 1 kHz, 입력 캡처 250 Hz, 부저 멜로디의 동작을 보존한다.
- USART 115200 baud, I²C 100 kHz, SPI 1 MHz 등은 해당 장치를 활성화할 때 사용할 **HAL 초기화 설정**이다. 레지스터 리셋값이 아니다. 주변장치는 기본 비활성이다.
- 기본 HAL 생성 코드는 HSI 직접 연결·PLL OFF·APB 분주 1·Flash 0 wait state를 쓴다. 기존 사용자 클록은 지원되는 HSI PLL 계획을 사용한다. 시뮬레이션의 TIM 입력은 Pinout 값이며 임의 RCC C 코드에서 클록 트리를 역산하지 않는다.
- `src/mcu-defaults.js`가 기본값의 공통 정의다. Pinout, 검증기, `.ioc` 가져오기, 코드 생성, 실행 모델을 함께 검사한다.
