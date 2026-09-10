# STM Simulator 0.11.0 — HAL 소스 및 핀 설정

STM32F446RE용 **HAL API 호환 회로 모델**입니다. CubeMX/CubeIDE의 `main.c`와 필요한 사용자 `.c/.h`, `.ioc`를 가져옵니다. ST HAL 드라이버 자체를 컴파일·링크하거나 ARM 명령을 실행하지 않습니다. 따라서 지원 범위 안의 생성 소스와 사용자 코드를 사용할 수 있으며, 임의 Cube 프로젝트의 전체 호환성을 보장하지 않습니다. ELF/BIN은 입력 대상이 아닙니다.

## 사용 순서

1. 왼쪽 **Pinout & Configuration**에서 핀을 선택해 GPIO/EXTI 또는 주변장치 기능을 지정합니다. GPIO pull, 초기 출력, EXTI 에지, 사용자 라벨을 설정합니다. 보드 GPIO를 우클릭해 해당 핀 설정으로 이동할 수도 있습니다.
2. UART/USART, I2C1/SPI1/ADC1/TIM2·3·4·5를 활성화합니다. UART/USART는 TX/RX를 실제 가능한 핀 중에서 자동 배정하며, 각 드롭다운으로 대체 핀을 선택합니다. 사용 중인 핀을 덮어쓰지 않고 충돌을 표시합니다. 비활성화하면 해당 TX/RX와 IRQ를 해제합니다. 나머지 주변장치는 필요한 신호 핀을 지정합니다. 같은 신호의 중복이나 같은 EXTI 번호의 포트 충돌도 표시합니다.
3. 인터럽트는 **NVIC**에서 활성화합니다. 숫자가 작은 priority부터 대기 콜백을 전달합니다. 실제 NVIC 선점이나 subpriority는 재현하지 않습니다.
4. **설정 적용**은 코드를 유지합니다. **설정으로 HAL 코드 생성**은 확인 후 현재 소스 묶음을 설정에 맞는 `main.c`로 교체합니다. 회로 배선은 유지하고 실행 취소로 복구할 수 있습니다.
5. 기존 코드는 편집기 **.ioc / C 소스 가져오기**에서 함께 선택합니다. C 파일 선택에는 `main.c`가 필요합니다. .ioc만 선택하면 기존 실행 모드와 코드를 유지하고 설정만 가져옵니다.
6. 데스크톱의 **Cube 프로젝트 폴더**는 루트 `.ioc`, `Core/Src`, `Core/Inc`를 읽습니다. `Drivers`, startup, syscalls, sysmem, system_stm32f4xx 및 HAL conf 구현은 가져오지 않습니다. 파일은 원본에 쓰지 않고 회로 프로젝트에 복사합니다.
7. 편집기 상단에서 `main.c`와 가져온 `.c/.h`를 전환해 수정합니다. **코드 검사**는 문법을 검사하고, 시뮬레이션 시작 시 핀·초기화·배선·지원 API를 검사합니다.

HAL 코드·회로 예제는 GPIO·EXTI·UART·TIM2·ADC·I²C·SPI·함수/구조체·PWM·초음파와 확장 센서·화면·구동·입력 부품을 포함한 30개입니다. 모두 HAL C를 사용하며 Serial 호출은 없습니다. 선택한 예제의 코드·MCU 설정·부품·배선·계산 설정을 함께 적용하고 회로 이름은 유지합니다. 전원과 통신/센서 배선까지 구성되며, PWM 예제는 파형 계산 설정도 적용합니다. 함수·배열 예제는 외부 부품 없이 로그로 실행합니다. 예제를 선택하는 즉시 확인 창 없이 적용하며 Ctrl+Z로 이전 작업 전체를 되돌립니다. 새 회로도 부품·배선 없이 HAL 코드로 시작합니다.

UART 예제는 USART2 PA2(TX)/PA3(RX), 9600 baud입니다. 예제에 터미널 전원·공통 GND·TX/RX 교차 배선이 포함됩니다. 하단 통신 탭에서 포트를 골라 입력합니다. ADC 배열 예제는 8회 polling으로 값을 저장하며 DMA 예제가 아닙니다. 초음파 예제는 TIM2 1 MHz 카운터와 GPIO ECHO 폴링을 사용하며 0.1 ms 협력 실행 해상도의 측정 모델입니다. 입력 캡처는 별도 TIM4 예제로 제공하며 CPU 명령 타이밍은 재현하지 않습니다.

편집기와 회로 사이의 세로 경계선을 드래그하면 코드 및 속성·측정 패널의 너비를 조절할 수 있습니다. 로컬에 너비를 저장하며, 두 번 클릭하면 기본값(440px)으로 돌아갑니다. 경계선의 방향키/Home/End 입력도 지원합니다.

## main.c만 실제 프로젝트로 옮기기

편집기의 **main.c 저장**으로 현재 소스를 저장합니다. 생성 코드와 제공 예제는 STM32F446RE의 `main.h` 및 표준 ST HAL만 사용합니다. 실제 프로젝트에는 동일한 GPIO/AF·주변장치·NVIC 설정과 Cube가 생성한 MSP/IRQ 처리, SysTick, startup, syscalls가 있다고 가정합니다. 추가 사용자 드라이버 파일을 가져온 경우 그 파일까지 main.c 하나로 합치는 기능은 아닙니다.

생성 코드에는 GPIO/주변장치 클록 활성화, GPIO AF, UART·I²C·SPI·ADC·타이머 초기화, `Error_Handler`가 포함됩니다. HSI 16 MHz PLL을 사용해 HSE 점퍼에 의존하지 않으며, APB1=/2·APB2=/1로 설정합니다. 생성 가능한 타이머 입력 클록은 PLL로 정확히 만들 수 있는 12.5~90 MHz이고 기본은 84 MHz입니다. 지원하지 않는 클록은 생성 단계에서 안내합니다. SPI 목표 속도는 APB2에서 만들 수 있는 2~256 분주 중 목표 이하의 속도로 설정합니다.

기본 main.c와 예제 30개는 ARM GCC 및 STM32CubeF4의 정식 HAL·CMSIS·startup으로 컴파일·링크 검사합니다(`npm run test:main-c`). 실물 보드에서 센서·디스플레이 모듈의 세부 변형까지 시험한 것은 아닙니다. 메모리 예제는 명시된 범용 프로토콜 모델이며 특정 EEPROM 제품 드라이버를 뜻하지 않습니다.

## 회로 편집과 오류 위치

배선을 더블클릭하면 꺾임점을 추가합니다. 표시된 점을 끌어 이동하고 우클릭해 삭제합니다. 속성의 **배선 경로 자동 정렬**로 기본 경로를 복구합니다. 꺾임점은 최대 32개이며 저장·불러오기·실행 취소로 보존됩니다. 선의 교차는 접속점이 아닙니다.

Shift+클릭으로 부품·배선을 여러 개 선택하고 끌어 이동합니다. Ctrl+C/V는 선택한 부품과 내부 배선을 복사하며 원본 빵판 장착은 분리합니다. 빵판 자체를 복사하면 그 빵판에 장착된 부품도 새 빵판에 함께 복사합니다. Delete로 선택을 삭제하고 Ctrl+Z/Y로 되돌립니다.

핀이나 배선을 선택하면 연결된 보드의 동명 핀, 빵판 행, 장착 부품 다리와 배선을 금색으로 강조합니다. 회로 검사 탭은 전원 단락·전원/GND·신호 미연결·I²C 주소 중복과 전기적 경고를 표시하며 클릭하면 해당 위치로 이동합니다. F5는 코드 편집 중에도 시작/정지로 동작하고 열린 대화상자나 키 반복 중에는 실행하지 않습니다.

## 타이머 핀과 실행 모델

| 타이머 / AF | CH1 | CH2 | CH3 | CH4 | 카운터 |
|---|---|---|---|---|---|
| TIM2 / AF1 | PA0, PA5, PA15 | PA1, PB3 | PA2, PB10 | PA3 | 32비트 |
| TIM3 / AF2 | PA6, PB4, PC6 | PA7, PB5, PC7 | PB0, PC8 | PB1, PC9 | 16비트 |
| TIM4 / AF2 | PB6 | PB7 | PB8 | PB9 | 16비트 |
| TIM5 / AF2 | PA0 | PA1 | PA2 | PA3 | 32비트 |

TIM2·3·4·5는 독립 PSC/ARR/채널/NVIC 상태를 가지며 동일 APB1 입력 클록을 사용합니다. Pinout의 동작 모드에서 주기·PWM·입력 캡처·엔코더를 선택합니다. 엔코더는 CH1과 CH2가 모두 필요합니다. 캡처는 회로에서 관찰한 신호 에지를 카운터 값으로 저장합니다. PWM 파형을 꺼두면 평균 전압이므로 PWM→캡처 실습에는 파형 계산을 켜세요. 일반 외부 입력의 관찰 해상도는 회로 계산 간격을 따르며 디지털 필터·외부 클록·타이머 동기화·DMA·NVIC 선점은 포함하지 않습니다.

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
| GPIO | `HAL_GPIO_Init/DeInit`, `WritePin`, `ReadPin`, `TogglePin`; INPUT/OUTPUT_PP/ANALOG/AF_PP/AF_OD, EXTI rising/falling/both. AF는 해당 UART/USART/I2C1/SPI1/TIM2·3·4·5 기능에 한정 |
| EXTI/NVIC | `HAL_NVIC_SetPriority/EnableIRQ/DisableIRQ`, `HAL_GPIO_EXTI_IRQHandler`, `HAL_GPIO_EXTI_Callback(uint16_t)`; EXTI0~4, EXTI9_5, EXTI15_10 |
| UART/USART 6개 | `HAL_UART_Init`, blocking `Transmit/Receive`, `Transmit_IT/Receive_IT`, `AbortReceive`, `RxCpltCallback/TxCpltCallback`; 비동기 8N1, TX/RX, HW flow 없음, oversampling 16. 포트마다 독립 버퍼·busy 상태·NVIC |
| I²C1 | `HAL_I2C_Init`, `Master_Transmit/Receive`, `Mem_Write/Read`; 7비트 주소를 `<<1`한 HAL 주소, 8비트 메모리 주소 |
| SPI1 | `HAL_SPI_Init`, `Transmit/Receive/TransmitReceive`; master, 8비트, mode 0, MSB first, software CS |
| ADC1 | `HAL_ADC_Init/ConfigChannel/Start/Stop/PollForConversion/GetValue`; 외부 단일 채널, 12비트, 오른쪽 정렬, 소프트웨어 시작 |
| TIM2·3·4·5 | `HAL_TIM_Base_Init/Start_IT/Stop_IT`, `HAL_TIM_PeriodElapsedCallback`; 내부 클록, up count. 주기 `(PSC+1)*(ARR+1)/timerClockHz`, 0.1ms 이상 |
| 타이머 카운터 | `HAL_TIM_Base_Start/Stop`, `__HAL_TIM_GET_COUNTER/SET_COUNTER`; PSC와 timerClockHz에 따른 증가, ARR에서 순환. Base/IT/PWM/캡처가 주변장치별 카운터를 공유. `GET/SET_AUTORELOAD`, `SET_PRESCALER`, `IS_TIM_COUNTING_DOWN` 지원. 프리로드·레지스터 단위 동기화는 미지원 |
| 타이머 PWM | `HAL_TIM_PWM_Init/ConfigChannel/Start/Stop`, `__HAL_TIM_SET_COMPARE`; PWM1 active high, 1~2000Hz, 기본 평균 출력, 기존 파형 모드 사용 가능 |

| 입력 캡처 | `HAL_TIM_IC_Init/ConfigChannel/Start/Stop`, `Start_IT/Stop_IT`, `HAL_TIM_ReadCapturedValue`, `HAL_TIM_IC_CaptureCallback`, `__HAL_TIM_SET_CAPTUREPOLARITY`; direct TI, rising/falling/both, DIV1/2/4/8, filter 0. 콜백의 `htim->Channel`에 active channel 제공 |
| 엔코더 | `HAL_TIM_Encoder_Init/Start/Stop`, `Start_IT/Stop_IT`, `TIM_CHANNEL_ALL`; TI1/TI2/TI12, CH1=A·CH2=B, Prescaler 0, rising/direct TI/DIV1/filter 0. CNT의 증가·감소와 ARR 순환 |

UART 전원과 TX/RX 배선·baud, I²C 주소·전원·풀업, SPI CS·전원·배선은 기존 회로 모델로 검사합니다. UART RX 완료는 수신 바이트 도착 시간에 처리합니다. UART와 I²C/SPI timeout은 구현된 전송 시간에 기반합니다. I²C/SPI timeout이 부족하면 전송 전 HAL_TIMEOUT을 반환하는 단순 모델이며 부분 전송을 재현하지 않습니다.

콜백에 넘긴 버퍼 포인터는 유효기간과 범위를 검사합니다. IRQ가 꺼져 있으면 완료 이벤트를 대기하며, HAL_Delay 또는 UART blocking 호출을 인터럽트 콜백에서 사용하면 오류입니다. UART blocking API는 동시에 진행 중인 동일 방향 IT 전송이 있으면 HAL_BUSY를 반환합니다.

핀 설정과 소스의 GPIO 모드/pull/AF, 각 UART/USART baud, I²C 속도, 각 타이머 PSC/ARR가 다르면 실행을 중단합니다. STM32의 가능한 모든 AF를 표시하지 않고 구현된 주변장치의 실제 대체 핀만 제공합니다. 지원되지 않는 `.ioc` 신호는 예약 핀으로 가져오고 경고합니다. CAN, USB, RTOS, DAC, HAL DMA 등은 아직 실행하지 않습니다. UART는 외부 터미널 및 같은 포트의 TX/RX 루프백을 모델링하며 서로 다른 MCU UART 간 직접 배선 전송은 구현하지 않았습니다.

## 로그

`printf("value=%lu\n", value)`와 `puts("ready")`는 배선 없이 실행 모니터의 로그 탭에 표시됩니다. 앱에서는 디버그 출력으로 처리합니다. 생성한 main.c는 `__io_putchar`를 통해 SWV ITM 포트 0으로 출력하므로 표준 CubeIDE syscalls.c의 `_write` 연결을 사용합니다. 실제 보드에서는 디버거의 SWV를 활성화하고 생성 코드의 코어 클록에 맞추세요. newlib-nano의 소수점 printf는 프로젝트 링크 옵션 `-u _printf_float`가 필요합니다. 앱은 syscalls 구현을 실행하지 않습니다.

`printf`는 d/i/u/x/X/o/f/c/s/%%, 부호·정렬·0 채움, 고정 폭(최대 80), 정밀도(최대 8), 정수 h/hh/l을 지원합니다. 형식은 1024자, 값은 32개, 출력은 호출당 4096자로 제한합니다. 와이드 문자, %n, 동적 폭/정밀도, 임의 가변인자 함수는 지원하지 않습니다. 잘못된 형식·누락 인수·잘못된 포인터는 실행 오류를 표시합니다. 각 호출은 로그 항목 하나이며 끝의 줄바꿈 하나를 생략하고 내부 줄바꿈을 보존합니다.

HAL UART blocking/IT 송수신은 `[USART2 TX]`, `[USART2 RX]`와 같이 실제 인스턴스 및 방향을 표시합니다. 같은 포트·방향의 바이트는 줄바꿈 또는 길이 한도까지 한 줄로 모읍니다. TX는 전송 요청이 수락됐다는 뜻이며 외부 수신 성공을 보장하지 않습니다. 전원·배선·baud가 맞아야 터미널에 도착하고 실제 수신 바이트에만 RX 로그를 남깁니다. HAL_BUSY/HAL_TIMEOUT으로 시작하지 못한 송신은 성공 로그를 남기지 않습니다. `printf`는 UART 통신선이나 터미널에 바이트를 보내지 않습니다.

## C 소스 모델

`main(void)`, 함수/프로토타입, include guard, 선택한 로컬 헤더, scalar typedef, extern 선언, 배열·구조체·단일 포인터, 기본 포인터 cast 및 `sizeof(변수)`를 지원합니다. 선택한 .c들을 하나의 프로그램으로 해석하므로 서로 다른 파일의 동일한 static 함수 이름은 지원하지 않습니다. 파일 상한은 40개 보조 소스, main.c 50,000자, 합계 300,000자입니다.

HAL 모드에서 정수 변수 대입·캐스트를 정해진 폭으로 변환하고, 스칼라 정수 나눗셈·float 변수·static 스칼라 수명을 처리합니다. 전체 C 표준의 정수 승격, 복합식 타입 추론, 부동소수점 ABI, 포인터/구조체 메모리 레이아웃을 보장하지 않습니다. 스케치 모드의 기존 숫자 동작은 유지합니다.

기본 `#ifdef/#ifndef/#if 0/1/#if defined`, `#else/#endif`, object define을 지원합니다. 복잡한 #if, 함수형 매크로, enum/switch, 구조체 typedef, 다차원 배열, 이중 포인터, 사용자 가변인자 함수, 임의 외부 라이브러리는 지원되지 않습니다. 알 수 없는 문법·헤더·HAL 함수는 오류를 표시하며 성공한 것으로 건너뛰지 않습니다.

표준 HAL handle/init 구조체는 인터프리터 내부 값으로 구성합니다. GPIO/주변장치 clock-enable, 기본 RCC OscConfig/ClockConfig/PWR 호출은 생성 소스를 수용하는 초기화 호환 호출입니다. CPU·클록 트리·전압 스케일·Flash latency의 실제 하드웨어 동작은 재현하지 않습니다. APB1 타이머 입력 클록은 설정 화면 또는 `.ioc`의 APB1 timer clock 값을 사용합니다. SPI 전송 속도는 설정 화면의 Clock 값을 사용하고 원본 `BaudRatePrescaler`를 클록 트리로 환산하지 않습니다.

main 최상위 반복은 0.1ms씩 협력적으로 진행하므로 빈 `while(1)`에서도 인터럽트 처리가 가능합니다. 이는 명령 실행 시간 모델이 아닙니다. 내부 무한 반복/재귀/메모리/이벤트에는 기존 실행 한도가 적용됩니다. EXTI는 사용자 정의 IRQHandler가 있으면 해당 handler의 HAL_GPIO_EXTI_IRQHandler 호출을 경유합니다. UART/TIM 완료는 협력적 큐에서 HAL callback으로 전달하며 전체 USART/TIM ISR 레지스터 흐름은 구현하지 않습니다.

## 센서·화면·구동 부품과 HAL 예제

부품 31종, HAL 예제 30개를 제공합니다. 아래 14종은 각각 회로·핀 설정·C 코드가 함께 적용되는 예제가 있습니다. `printf`는 하단 로그에 측정값 또는 제어 명령을 표시합니다. SPI의 전송 성공은 화면의 수신 확인을 뜻하지 않으며, 전원과 CS/DC/RST 배선도 맞아야 표시됩니다.

| 부품 | 예제 연결 / 사용 HAL | 실행 중 확인 |
|---|---|---|
| LDR | 3V3–LDR–PA0–10 kΩ–GND / ADC | 조도 1~100,000 lux, ADC 전압 |
| NTC | 3V3–10 kΩ–PA0–NTC–GND / ADC, `log` | −40~125 °C, 계산 온도·저항 |
| SHT31 | 3V3/GND, PB9 SDA/PB8 SCL / I2C Master | 온습도, CRC, NACK |
| MPU6050 | 3V3/GND, PB9 SDA/PB8 SCL / I2C Mem | 6축 g·°/s, WHO_AM_I |
| PIR | 5V/GND, OUT PA10 / GPIO EXTI | 움직임 HIGH/LOW, 양쪽 에지 로그 |
| SSD1306 OLED | 3V3/GND, PB9 SDA/PB8 SCL / I2C Master | 128×64 픽셀, 움직이는 막대 |
| ST7735 TFT | 3V3/GND, PA5 SCK/PA7 MOSI, PB6 CS/PB7 DC/PC7 RST / SPI | 128×160 RGB565 컬러 바 |
| MAX7219 매트릭스 | 5V/GND, PA5 CLK/PA7 DIN/PB6 LOAD / SPI | 8×8 이동 패턴 |
| RC 서보 | 5V/GND, PA5 TIM2 CH1 / TIM PWM | 50 Hz, 1/1.5/2 ms, 0/90/180° |
| DC 모터 + H 브리지 | 5V/GND, PA5 PWM, PB6 IN1/PB7 IN2 | 정·역회전, PWM 속도, rpm |
| 4상 스테퍼 + 드라이버 | 5V/GND, PB3~PB6 IN1~IN4 / GPIO | 1.8° 스텝, 방향·상 전환 |
| 릴레이 | 5V/GND, PA5 IN, COM 3V3, NO–330 Ω–LED–GND / GPIO | COM–NO/NC 실제 회로 전환 |
| 조이스틱 | 3V3/GND, PA0/PA1 ADC, PA10 SW / ADC, GPIO | X/Y 0~100%, 버튼 |
| 로터리 인코더 | 3V3/GND, PA0 A/PA1 B EXTI, PA10 SW | 방향, 4전이/칸 카운트, 버튼 |

모듈의 핀 순서는 부품 단자 툴팁과 속성 도움말에 표시합니다. 이는 위 표에 지정한 모듈 모델의 핀 순서이며, 모든 시판 모듈의 실제 PCB 핀 순서가 같다는 뜻은 아닙니다. I²C 모듈에는 10 kΩ 풀업, MAX7219 모듈에는 3.3 V 논리 레벨 변환기를 포함합니다. SPI 화면의 CS/LOAD에는 풀업이 있어 연결이 끊기면 선택되지 않습니다. 3.3 V 모듈은 2.7~3.6 V, 5 V 모듈은 4.5~5.5 V와 보드 공통 GND가 있어야 동작합니다.

### 모델 범위

- LDR은 `10 kΩ × (10/lux)^0.7`을 100 Ω~1 MΩ로 제한한 가상 광저항, NTC는 R25=10 kΩ/B=3950 K 모델입니다. 개별 제품의 공차·열 용량은 적용하지 않습니다.
- SHT31은 주소 0x44/0x45, 단발 측정 0x2400(15 ms 뒤 6바이트), 소프트 리셋 0x30A2를 지원합니다. 온도·습도마다 CRC-8(다항식 0x31, 초기값 0xFF)을 전송합니다. 측정 전/진행 중/잘못된 주소·배선에는 NACK를 반환합니다. 주기 측정·히터·clock stretching은 지원하지 않습니다. [Sensirion 데이터시트](https://sensirion.com/media/documents/213E6A3B/63A5A569/Datasheet_SHT3x_DIS.pdf)
- MPU6050은 주소 0x68/0x69, WHO_AM_I(0x75), PWR_MGMT_1 절전/리셋, 가속도·자이로 범위 레지스터(0x1B/0x1C), 0x3B부터 14바이트 읽기를 지원합니다. ±2/4/8/16 g, ±250/500/1000/2000 °/s 범위를 적용합니다. 온도 레지스터는 25 °C 고정입니다. 샘플레이트/DLPF 설정 값은 저장하지만 필터·시간 동작, FIFO·DMP·보조 버스·DATA_READY IRQ는 모델링하지 않습니다. [TDK/InvenSense 레지스터 문서](https://invensense.tdk.com/wp-content/uploads/2015/02/MPU-6000-Register-Map1.pdf)
- SSD1306은 0x3C/0x3D, 제어 바이트 0x00/0x40, 1024바이트 RAM, 페이지·수평·수직 주소, 표시 ON/OFF·반전·전체 점등·밝기·방향·시작 행을 지원합니다. 64행 MUX와 일반 초기화 명령을 받으며, 전하펌프·클록·전기 설정의 아날로그 효과와 하드웨어 스크롤은 구현하지 않습니다. [Solomon Systech 데이터시트](https://cdn-shop.adafruit.com/datasheets/SSD1306.pdf)
- ST7735는 리셋, SLPIN/SLPOUT, DISPOFF/DISPON, INVON/INVOFF, CASET/RASET/RAMWR, MADCTL의 행·열 교환/반전/BGR, COLMOD=0x55를 지원합니다. 주소 원점 (0,0)의 128×160 영역을 표시하며, 감마·전원 시퀀스·읽기·18비트 색상은 지원하지 않습니다. 명령 대기 시간의 실제 아날로그 효과는 모델링하지 않지만 예제는 리셋과 sleep out 뒤 120 ms를 기다립니다. [Sitronix 데이터시트](https://www.crystalfontz.com/controllers/Sitronix/ST7735S/437)
- MAX7219는 LOAD 상승 시 마지막 16비트를 래치하며 digit 1~8, no-decode, intensity, scan-limit, shutdown, display-test를 지원합니다. 캐스케이드·BCD 디코드는 지원하지 않습니다. [Analog Devices 데이터시트](https://www.analog.com/media/en/technical-documentation/data-sheets/MAX7219-MAX7221.pdf)
- 서보는 실제 에지에서 1~2 ms 펄스를 읽고 최대 360°/s로 움직입니다. 100 ms 신호 누락 시 제어를 해제합니다. DC 모터는 최대 3000 rpm/시정수 150 ms의 속도 모델이며, 스테퍼는 한 상씩의 인접 전환을 셉니다. 이들은 드라이버를 포함한 학습용 모듈입니다. 모터 권선 전류·토크·부하·역기전력·탈조를 계산하지 않으며 표시 전류는 모듈의 간이 대기 부하입니다. 릴레이는 접점 0.1 Ω의 즉시 전환 모델이며 기계적 지연·바운스가 없습니다.
- 조이스틱은 두 개의 10 kΩ 가변저항과 LOW 활성 버튼입니다. 인코더는 조절한 한 칸마다 2 ms 간격의 직교 신호 4전이를 예약하며, 실제 A/B 배선을 통해 EXTI 콜백이 발생합니다. 접점 바운스는 없습니다. PIR은 속성으로 입력한 감지 상태를 3.3 V OUT으로 출력하는 모듈입니다.

새 시뮬레이션을 시작하면 화면 메모리·통신 상태·회전 상태는 초기화됩니다. 환경 설정과 회로 배선은 프로젝트에 저장됩니다. 알려지지 않은 화면 명령과 미지원 레지스터 쓰기는 오류로 표시합니다.

## HAL 인터페이스 근거

함수/구조체 명칭은 [ST의 STM32F4 HAL GPIO 헤더](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/master/Inc/stm32f4xx_hal_gpio.h), [UART 헤더](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/master/Inc/stm32f4xx_hal_uart.h), [TIM 헤더](https://github.com/STMicroelectronics/stm32f4xx-hal-driver/blob/master/Inc/stm32f4xx_hal_tim.h)를 확인했습니다. 로컬 CubeMX F446RE 기종 정보와 `.ioc`도 대조했습니다. ST 드라이버 소스 및 CubeMX 데이터베이스 파일은 앱에 포함하지 않습니다.
