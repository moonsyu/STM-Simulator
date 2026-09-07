# STM Simulator 0.8.0 — HAL 소스 및 핀 설정

STM32F446RE용 **HAL API 호환 회로 모델**입니다. CubeMX/CubeIDE의 `main.c`와 필요한 사용자 `.c/.h`, `.ioc`를 가져옵니다. ST HAL 드라이버 자체를 컴파일·링크하거나 ARM 명령을 실행하지 않습니다. 따라서 지원 범위 안의 생성 소스와 사용자 코드를 사용할 수 있으며, 임의 Cube 프로젝트의 전체 호환성을 보장하지 않습니다. ELF/BIN은 입력 대상이 아닙니다.

## 사용 순서

1. 왼쪽 **Pinout & Configuration**에서 핀을 선택해 GPIO/EXTI 또는 주변장치 기능을 지정합니다. GPIO pull, 초기 출력, EXTI 에지, 사용자 라벨을 설정합니다. 보드 GPIO를 우클릭해 해당 핀 설정으로 이동할 수도 있습니다.
2. UART/USART, I2C1/SPI1/ADC1/TIM2를 활성화합니다. UART/USART는 TX/RX를 실제 가능한 핀 중에서 자동 배정하며, 각 드롭다운으로 대체 핀을 선택합니다. 사용 중인 핀을 덮어쓰지 않고 충돌을 표시합니다. 비활성화하면 해당 TX/RX와 IRQ를 해제합니다. 나머지 주변장치는 필요한 신호 핀을 지정합니다. 같은 신호의 중복이나 같은 EXTI 번호의 포트 충돌도 표시합니다.
3. 인터럽트는 **NVIC**에서 활성화합니다. 숫자가 작은 priority부터 대기 콜백을 전달합니다. 실제 NVIC 선점이나 subpriority는 재현하지 않습니다.
4. **설정 적용**은 코드를 유지합니다. **설정으로 HAL 코드 생성**은 확인 후 현재 소스 묶음을 설정에 맞는 `main.c`로 교체합니다. 회로 배선은 유지하고 실행 취소로 복구할 수 있습니다.
5. 기존 코드는 편집기 **.ioc / C 소스 가져오기**에서 함께 선택합니다. C 파일 선택에는 `main.c`가 필요합니다. .ioc만 선택하면 기존 실행 모드와 코드를 유지하고 설정만 가져옵니다.
6. 데스크톱의 **Cube 프로젝트 폴더**는 루트 `.ioc`, `Core/Src`, `Core/Inc`를 읽습니다. `Drivers`, startup, syscalls, sysmem, system_stm32f4xx 및 HAL conf 구현은 가져오지 않습니다. 파일은 원본에 쓰지 않고 회로 프로젝트에 복사합니다.
7. 편집기 상단에서 `main.c`와 가져온 `.c/.h`를 전환해 수정합니다. **코드 검사**는 문법을 검사하고, 시뮬레이션 시작 시 핀·초기화·배선·지원 API를 검사합니다.

HAL 코드·회로 예제는 GPIO LED·버튼 입력·USER EXTI·UART RX 인터럽트·TIM2 인터럽트·ADC·TMP36·ADC 배열·I²C·SPI·함수/구조체·PWM·초음파의 13개입니다. 모두 HAL C를 사용하며 Serial 호출은 없습니다. 선택한 예제의 코드·MCU 설정·부품·배선·계산 설정을 함께 적용하고 회로 이름은 유지합니다. 전원과 통신/센서 배선까지 구성되며, PWM 예제는 파형 계산 설정도 적용합니다. 함수·배열 예제는 외부 부품 없이 로그로 실행합니다. 예제를 선택하는 즉시 확인 창 없이 적용하며 Ctrl+Z로 이전 작업 전체를 되돌립니다. 새 회로도 부품·배선 없이 HAL 코드로 시작합니다.

UART 예제는 USART2 PA2(TX)/PA3(RX), 9600 baud입니다. 예제에 터미널 전원·공통 GND·TX/RX 교차 배선이 포함됩니다. 하단 통신 탭에서 포트를 골라 입력합니다. ADC 배열 예제는 8회 polling으로 값을 저장하며 DMA 예제가 아닙니다. 초음파 예제는 TIM2 1 MHz 카운터와 GPIO ECHO 폴링을 사용하며 0.1 ms 협력 실행 해상도의 측정 모델입니다. 하드웨어 입력 캡처 및 CPU 명령 타이밍은 재현하지 않습니다.

편집기와 회로 사이의 세로 경계선을 드래그하면 코드 및 속성·측정 패널의 너비를 조절할 수 있습니다. 로컬에 너비를 저장하며, 두 번 클릭하면 기본값(440px)으로 돌아갑니다. 경계선의 방향키/Home/End 입력도 지원합니다.

## UART/USART 핀맵

F446RE **LQFP64** 및 보드에서 접근 가능한 핀 기준입니다. TX와 RX를 각 열의 후보에서 선택합니다.

| 장치 | TX | RX | AF | HAL 핸들 / IRQ |
|---|---|---|---|---|
| USART1 | PA9, PB6 | PA10, PB7 | 7 | huart1 / USART1_IRQn |
| USART2 | PA2 | PA3 | 7 | huart2 / USART2_IRQn |
| USART3 | PB10, PC10 | PC5, PC11 | 7 | huart3 / USART3_IRQn |
| UART4 | PA0, PC10 | PA1, PC11 | 8 | huart4 / UART4_IRQn |
| UART5 | PC12 | PD2 | 8 | huart5 / UART5_IRQn |
| USART6 | PC6 | PC7 | 8 | huart6 / USART6_IRQn |

[ST STM32F446xC/xE 데이터시트 DS10693 표 10·11](https://www.st.com/resource/en/datasheet/stm32f446re.pdf)와 로컬 CubeMX MCU/AF 정보로 대조했습니다. 큰 패키지에서 제공되는 PD5/PD6 또는 PB11은 이 보드의 후보에 포함하지 않습니다. USART도 현재는 `HAL_UART` 비동기 모드로 실행하며 동기식 CK, RTS/CTS, `HAL_USART`, DMA는 지원하지 않습니다.

## 지원 범위

| 모듈 | 지원 API 및 조건 |
|---|---|
| 기본 | `HAL_Init`, `HAL_Delay`, `HAL_GetTick`, `__disable_irq`, `__enable_irq` |
| 로그 | `<stdio.h>`의 `printf`, `puts`; 지원 형식과 한도는 아래 참고 |
| GPIO | `HAL_GPIO_Init/DeInit`, `WritePin`, `ReadPin`, `TogglePin`; INPUT/OUTPUT_PP/ANALOG/AF_PP/AF_OD, EXTI rising/falling/both. AF는 해당 UART/USART/I2C1/SPI1/TIM2 기능에 한정 |
| EXTI/NVIC | `HAL_NVIC_SetPriority/EnableIRQ/DisableIRQ`, `HAL_GPIO_EXTI_IRQHandler`, `HAL_GPIO_EXTI_Callback(uint16_t)`; EXTI0~4, EXTI9_5, EXTI15_10 |
| UART/USART 6개 | `HAL_UART_Init`, blocking `Transmit/Receive`, `Transmit_IT/Receive_IT`, `AbortReceive`, `RxCpltCallback/TxCpltCallback`; 비동기 8N1, TX/RX, HW flow 없음, oversampling 16. 포트마다 독립 버퍼·busy 상태·NVIC |
| I²C1 | `HAL_I2C_Init`, `Master_Transmit/Receive`, `Mem_Write/Read`; 7비트 주소를 `<<1`한 HAL 주소, 8비트 메모리 주소 |
| SPI1 | `HAL_SPI_Init`, `Transmit/Receive/TransmitReceive`; master, 8비트, mode 0, MSB first, software CS |
| ADC1 | `HAL_ADC_Init/ConfigChannel/Start/Stop/PollForConversion/GetValue`; 외부 단일 채널, 12비트, 오른쪽 정렬, 소프트웨어 시작 |
| TIM2 | `HAL_TIM_Base_Init/Start_IT/Stop_IT`, `HAL_TIM_PeriodElapsedCallback`; 내부 클록, up count. 주기 `(PSC+1)*(ARR+1)/timerClockHz`, 1ms 이상 |
| TIM2 카운터 | `HAL_TIM_Base_Start/Stop`, `__HAL_TIM_GET_COUNTER/SET_COUNTER`; PSC와 timerClockHz에 따른 증가, ARR에서 순환. 독립 polling 용도이며 IT/PWM과 카운터 조작을 혼합하는 타이머 레지스터 동작은 재현하지 않음 |
| TIM2 PWM | `HAL_TIM_PWM_Init/ConfigChannel/Start/Stop`, `__HAL_TIM_SET_COMPARE`; PWM1 active high, 1~2000Hz, 기본 평균 출력, 기존 파형 모드 사용 가능 |

UART 전원과 TX/RX 배선·baud, I²C 주소·전원·풀업, SPI CS·전원·배선은 기존 회로 모델로 검사합니다. UART RX 완료는 수신 바이트 도착 시간에 처리합니다. UART와 I²C/SPI timeout은 구현된 전송 시간에 기반합니다. I²C/SPI timeout이 부족하면 전송 전 HAL_TIMEOUT을 반환하는 단순 모델이며 부분 전송을 재현하지 않습니다.

콜백에 넘긴 버퍼 포인터는 유효기간과 범위를 검사합니다. IRQ가 꺼져 있으면 완료 이벤트를 대기하며, HAL_Delay 또는 UART blocking 호출을 인터럽트 콜백에서 사용하면 오류입니다. UART blocking API는 동시에 진행 중인 동일 방향 IT 전송이 있으면 HAL_BUSY를 반환합니다.

핀 설정과 소스의 GPIO 모드/pull/AF, 각 UART/USART baud, I²C 속도, TIM2 PSC/ARR가 다르면 실행을 중단합니다. STM32의 가능한 모든 AF를 표시하지 않고 구현된 주변장치의 실제 대체 핀만 제공합니다. 지원되지 않는 `.ioc` 신호는 예약 핀으로 가져오고 경고합니다. CAN, USB, RTOS, DAC, HAL DMA 등은 아직 실행하지 않습니다. UART는 외부 터미널 및 같은 포트의 TX/RX 루프백을 모델링하며 서로 다른 MCU UART 간 직접 배선 전송은 구현하지 않았습니다.

## 로그

`printf("value=%lu\n", value)`와 `puts("ready")`는 배선 없이 실행 모니터의 로그 탭에 표시됩니다. 이는 앱의 디버그 출력 연결입니다. 실제 MCU에서는 프로젝트의 `_write` 등 출력 리타게팅이 필요하며, 부동소수점 printf는 툴체인의 float 출력 설정도 필요할 수 있습니다. 앱은 syscalls 구현을 실행하지 않습니다.

`printf`는 d/i/u/x/X/o/f/c/s/%%, 부호·정렬·0 채움, 고정 폭(최대 80), 정밀도(최대 8), 정수 h/hh/l을 지원합니다. 형식은 1024자, 값은 32개, 출력은 호출당 4096자로 제한합니다. 와이드 문자, %n, 동적 폭/정밀도, 임의 가변인자 함수는 지원하지 않습니다. 잘못된 형식·누락 인수·잘못된 포인터는 실행 오류를 표시합니다. 각 호출은 로그 항목 하나이며 끝의 줄바꿈 하나를 생략하고 내부 줄바꿈을 보존합니다.

HAL UART blocking/IT 송수신은 `[USART2 TX]`, `[USART2 RX]`와 같이 실제 인스턴스 및 방향을 표시합니다. 같은 포트·방향의 바이트는 줄바꿈 또는 길이 한도까지 한 줄로 모읍니다. TX는 전송 요청이 수락됐다는 뜻이며 외부 수신 성공을 보장하지 않습니다. 전원·배선·baud가 맞아야 터미널에 도착하고 실제 수신 바이트에만 RX 로그를 남깁니다. HAL_BUSY/HAL_TIMEOUT으로 시작하지 못한 송신은 성공 로그를 남기지 않습니다. `printf`는 UART 통신선이나 터미널에 바이트를 보내지 않습니다.

## C 소스 모델

`main(void)`, 함수/프로토타입, include guard, 선택한 로컬 헤더, scalar typedef, extern 선언, 배열·구조체·단일 포인터, 기본 포인터 cast 및 `sizeof(변수)`를 지원합니다. 선택한 .c들을 하나의 프로그램으로 해석하므로 서로 다른 파일의 동일한 static 함수 이름은 지원하지 않습니다. 파일 상한은 40개 보조 소스, main.c 50,000자, 합계 300,000자입니다.

HAL 모드에서 정수 변수 대입·캐스트를 정해진 폭으로 변환하고, 스칼라 정수 나눗셈·float 변수·static 스칼라 수명을 처리합니다. 전체 C 표준의 정수 승격, 복합식 타입 추론, 부동소수점 ABI, 포인터/구조체 메모리 레이아웃을 보장하지 않습니다. 스케치 모드의 기존 숫자 동작은 유지합니다.

기본 `#ifdef/#ifndef/#if 0/1/#if defined`, `#else/#endif`, object define을 지원합니다. 복잡한 #if, 함수형 매크로, enum/switch, 구조체 typedef, 다차원 배열, 이중 포인터, 사용자 가변인자 함수, 임의 외부 라이브러리는 지원되지 않습니다. 알 수 없는 문법·헤더·HAL 함수는 오류를 표시하며 성공한 것으로 건너뛰지 않습니다.

표준 HAL handle/init 구조체는 인터프리터 내부 값으로 구성합니다. GPIO/주변장치 clock-enable, 기본 RCC OscConfig/ClockConfig/PWR 호출은 생성 소스를 수용하는 초기화 호환 호출입니다. CPU·클록 트리·전압 스케일·Flash latency의 실제 하드웨어 동작은 재현하지 않습니다. TIM2 입력 클록은 설정 화면 또는 `.ioc`의 APB1 timer clock 값을 사용합니다. SPI 전송 속도는 설정 화면의 Clock 값을 사용하고 원본 `BaudRatePrescaler`를 클록 트리로 환산하지 않습니다.

main 최상위 반복은 0.1ms씩 협력적으로 진행하므로 빈 `while(1)`에서도 인터럽트 처리가 가능합니다. 이는 명령 실행 시간 모델이 아닙니다. 내부 무한 반복/재귀/메모리/이벤트에는 기존 실행 한도가 적용됩니다. EXTI는 사용자 정의 IRQHandler가 있으면 해당 handler의 HAL_GPIO_EXTI_IRQHandler 호출을 경유합니다. UART/TIM 완료는 협력적 큐에서 HAL callback으로 전달하며 전체 USART/TIM ISR 레지스터 흐름은 구현하지 않습니다.

## 인터페이스 근거

함수/구조체 명칭은 [ST의 STM32F4 HAL GPIO 헤더](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/master/Inc/stm32f4xx_hal_gpio.h), [UART 헤더](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/master/Inc/stm32f4xx_hal_uart.h), [TIM 헤더](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/master/Inc/stm32f4xx_hal_tim.h)를 확인했습니다. 로컬 CubeMX F446RE 기종 정보와 `.ioc`도 대조했습니다. ST 드라이버 소스 및 CubeMX 데이터베이스 파일은 앱에 포함하지 않습니다.
