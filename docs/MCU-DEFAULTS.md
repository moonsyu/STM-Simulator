# NUCLEO-F446RE · NUCLEO-F103RB 기본 설정

확인일: 2026-10-07. 대상은 NUCLEO-F446RE / STM32F446RE다. **CubeMX에서 TIM을 활성화할 때 사용하는 초기 설정**을 적용한다. 레지스터 리셋값 프리셋과는 구분한다.

## 새 프로젝트와 새 TIM 설정

| 항목 | 기본값 |
|---|---|
| SYSCLK / HCLK / PCLK1 / PCLK2 / APB1 TIM 입력 | HSI 16 MHz, PLL OFF, AHB/APB 분주 1 |
| TIM2/3/4/5 Prescaler | PSC=0, 분주 비율 1 |
| TIM2/5 Period | ARR=4,294,967,295 (32비트 최댓값) |
| TIM3/4 Period | ARR=65,535 (16비트 최댓값) |
| CNT / 초기 PWM Pulse | 0 / CCR=0 |
| 카운트 방향 / CKD / ARR preload | Up / DIV1 / Disable |
| 주변장치 / NVIC | 비활성, 우선순위 입력 초기값 0 |
| GPIO | 사용자 기능 미할당 |

Pinout에서 TIM을 활성화하면 위 PSC/ARR 설정을 사용한다. PWM Pulse는 0으로 시작하며 `초기 Pulse (CCR)`에서 설정한다. 현재 생성기는 한 TIM의 활성 PWM 채널들에 같은 초기 Pulse를 사용한다. 서로 다른 듀티는 소스의 `__HAL_TIM_SET_COMPARE()`로 설정한다.

기본 16 MHz에서 TIM2/5의 한 주기는 268.435456초, TIM3/4는 4.096 ms다. HAL 타이머의 1 Hz 미만 PWM도 처리하며, Pulse=0이면 출력은 LOW다. 기존 스케치 API의 1~2000 Hz 제한과 HAL PWM 상한 2000 Hz는 유지한다.

예: PSC=15, ARR=999이면 1 kHz이고 Pulse=250이면 PWM1 듀티는 25%다. 주파수는 `TIM clock / ((PSC+1) × (ARR+1))`로 계산한다. 사용자가 명시적으로 ARR=0을 지정하면 카운터 정지 모델을 적용한다.

## 저장값과 예제

- 저장된 클록·PSC·ARR·Pulse와 사용자 코드를 덮어쓰지 않는다. 새 프로젝트와 미지정 필드에만 기본값을 채운다. 기존 파일의 명시적 ARR=0도 유지한다.
- `.ioc`의 명시적 PSC·ARR·APB1 타이머 클록을 유지하며, 누락된 PSC/ARR은 위 초기값으로 채운다.
- 기존 HAL 예제는 84 MHz와 필요한 PSC/ARR/듀티를 명시한다. LED 100 ms, 서보 50 Hz, 모터 1 kHz, 입력 캡처 250 Hz, 부저 멜로디 설정을 보존한다.
- USART 115200 baud, I²C 100 kHz, SPI 1 MHz 등은 해당 장치 활성화 시 사용할 HAL 초기화 설정이다. 주변장치는 기본 비활성이다.
- 기본 생성 코드는 HSI 직접 연결·PLL OFF·APB 분주 1·Flash 0 wait state를 쓴다. 기존 사용자 클록은 지원되는 HSI PLL 계획을 사용한다. TIM 입력은 Pinout 값이며 임의 RCC C 코드에서 클록 트리를 역산하지 않는다.
- `src/mcu-defaults.js`가 기본값의 공통 정의다. Pinout, 검증기, `.ioc` 가져오기, 코드 생성, 실행 모델을 함께 검사한다.

## NUCLEO-F103RB (STM32F103RB)

- 새 프로젝트 클럭은 HSI 8 MHz, 예제는 HSI/2×PLL16 = 64 MHz(4 MHz 단위, 최대 64 MHz). APB1은 36 MHz 이하라 64 MHz에서 /2, 타이머 클럭은 SYSCLK와 같다. Flash 대기는 24 MHz 이하 0, 48 MHz 이하 1, 그 위 2.
- 타이머는 TIM2~4 모두 16비트이며 새 TIM의 ARR 기본값은 65535다.
- ADC 클럭은 PCLK2를 `RCC_ADCPCLK2_DIV2/4/6/8`로 나눠 14 MHz 이하로 맞추고, 샘플 시간 기본값은 239.5 사이클이다. 변환 시간은 (샘플 + 12.5) 사이클이다.
- PA15·PB3·PB4는 JTAG 핀이라 다른 용도로 쓰면 `__HAL_AFIO_REMAP_SWJ_NOJTAG()`를 넣는다. 포트 B~D의 EXTI는 AFIO 클럭이 필요하다.
- 근거: ST [RM0008](https://www.st.com/resource/en/reference_manual/rm0008-stm32f101xx-stm32f102xx-stm32f103xx-stm32f105xx-and-stm32f107xx-advanced-armbased-32bit-mcus-stmicroelectronics.pdf)(AFIO 리맵, DMA1 요청 매핑, ADC), [STM32F103RB 데이터시트](https://www.st.com/resource/en/datasheet/stm32f103rb.pdf)(128 KB Flash, 20 KB RAM, 72 MHz 최대; HSI 기반 PLL은 64 MHz까지).

## 근거와 적용 범위

- ST [AN5992](https://www.st.com/resource/en/application_note/an5992-migrating-from-stm32f446-to-stm32h523533-mcus-stmicroelectronics.pdf), STM32F446 타이머 비교표: TIM2/5는 32비트, TIM3/4는 16비트다.
- CubeMX 생성 설정 보고서 [TIM2 사례](https://community.st.com/ysqtg83639/attachments/ysqtg83639/mcu-embedded-software-forum/66725/3/HPECT-m5.pdf), [TIM3 사례](https://community.st.com/ysqtg83639/attachments/ysqtg83639/stm32-mcu-cubemx-forum/27877/2/Firmware.pdf): PSC=0, ARR은 각 비트 폭의 최댓값, Up, CKD 분주 없음, ARR preload 비활성. 사용자 확인에 따라 이 활성화 초기값을 적용했다. 모든 CubeMX 버전·보드 템플릿의 설정이 동일하다는 의미는 아니다.
- ST [STM32F446RE 제품 사양](https://www.st.com/en/microcontrollers-microprocessors/stm32f446re.html): 내부 HSI 16 MHz.
- ST [UM1724](https://www.st.com/resource/en/user_manual/um1724-stm32-nucleo64-boards-mb1136-stmicroelectronics.pdf): ST-LINK MCO의 외부 8 MHz 입력과 MCU 내부 HSI는 별개다. 실제 HSE 연결은 보드 리비전과 솔더 브리지에 따라 달라진다.

실물의 전원 인가 직후 레지스터 전체를 재현하는 모델은 아니다. 디버그 핀 리셋 AF/풀업, RCC clock gating, PLL lock 시간 등의 재현 및 실물 실행 검증은 포함하지 않는다. 회로 실행은 지원 HAL/C 소스 해석 모델을 사용한다.
