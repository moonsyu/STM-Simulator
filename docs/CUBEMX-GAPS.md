# CubeMX · 보드 시뮬레이터 차이 목록

2026-11-05 조사. 목표는 **CubeMX + CubeIDE + STM 보드 시뮬레이터**이며, 보드는 NUCLEO-F446RE·NUCLEO-F103RB만 다룹니다(새 보드는 필요할 때 하나씩). CubeIDE 쪽(편집·빌드·디버그)은 현재 기능을 유지하므로 이 목록에 없습니다.

근거:
- CubeMX 쪽: 이 PC의 CubeMX 데이터베이스입니다.
  - MCU 파일 `db/mcu/STM32F446R(C-E)Tx.xml`, `STM32F103R(8-B)Tx.xml`
  - 주변장치별 모드 파일 `db/mcu/IP/*_Modes.xml`
  - 클럭 트리 파일 `db/plugins/clock/STM32F446.xml`, `STM32F102.xml`
- 앱 쪽: 소스와 문서입니다.

크기 S/M/L은 작업량, 중요도 상/중/하는 STM32 수업에서 흔히 쓰는 정도입니다.

**구현 비용 메모:** 1.14.0부터 시뮬레이터는 기본으로 ARM GCC로 빌드해 펌웨어 에뮬레이터에서 실행합니다. 그래서 새 주변장치를 Pinout에 추가할 때는 **에뮬레이터에 레지스터 모델이 있으면** Pinout과 코드 생성만 만들면 됩니다.
- 에뮬레이터에 이미 모델이 있는 것: TIM1~14, I2C1~3, SPI1~4, ADC1~3, CAN, IWDG/WWDG, CRC, F446 RTC
- 에뮬레이터에도 없는 것: DAC, F103 RTC/BKP
- 내장 해석기는 지원 범위 밖이라고 안내하면 됩니다.

## A. CubeMX 쪽 (Pinout · 클럭 · NVIC · DMA · 코드 생성)

### A1. 지금 있는 기능의 설정 부족

| 항목 | 현재 | CubeMX | 크기 | 중요도 |
|---|---|---|---|---|
| NVIC | Pinout 오른쪽 열 아래 IRQ 목록, 우선순위 숫자 하나. 모델이 있는 주변장치 IRQ만 표시(`mcu-family.js`) | System Core → NVIC 표와 주변장치별 **NVIC Settings** 탭. Priority Group(0~4), Preemption·Sub Priority, SysTick·Fault 줄 | S~M | 상 |
| GPIO | 출력은 항상 Push-Pull, 속도는 VERY_HIGH(F1은 HIGH) 고정(`hal-generator.js:88-90`). AF 핀에 pull·속도 설정 없음. EXTI Event 모드 없음 | Output type(PP/OD), Speed, AF 핀 Pull, Event 모드, User Label | S~M | 상 |
| UART/USART | baud만 설정. 8N1·TX_RX·Oversampling 16 고정 | Word length, Parity, Stop bits, Direction, Oversampling, Half-duplex, RTS/CTS 등 | S~M | 상 |
| SPI | Master·Full-duplex·8비트·Mode 0·Soft NSS 고정, 속도만(`hal-generator.js:110`) | Slave, Half-duplex/RX-only, HW NSS, CPOL/CPHA, 16비트, LSB first, CRC | S~M | 상 |
| ADC | 생성 코드는 채널 하나, 소프트웨어 시작·단일 변환·고정 샘플링(`hal-generator.js:111-112`) | Scan(Rank), Continuous, 외부 트리거(TIM TRGO), Injected, Watchdog, 해상도, TempSens·Vrefint·Vbat | M | 상 |
| TIM | Base·PWM·Capture·Encoder, Up 카운트만. 한 타이머의 PWM 채널이 Pulse 하나를 공유 | Output Compare, One Pulse, PWM Input, 채널별 Pulse·극성, Counter mode, ARR preload, ETR·Slave·Trigger, TRGO, IC 필터 | M~L | 상 |
| I2C | 클럭만 | 주소 방식(7/10비트), Own address, Slave, SMBus | S | 중 |
| DMA | 요청별 폭·증가 고정. FIFO·Burst 없음. TIMx_UP·DAC·SPI2/3 등 요청 없음 | 요청마다 Data width, Increment, FIFO·Threshold·Burst | S~M | 중 |
| SYS | PA13/PA14 고정 잠금 | Debug(Serial Wire/JTAG/Trace/No Debug), Timebase Source(SysTick/TIMx) | S | 중 |

### A2. 클럭 설정 (L, 상)

- **현재:** 클럭 트리 화면이 없습니다. HSI만 쓰고(`hal-generator.js:18-33`) 최대 클럭도 낮습니다(F446 90 MHz, F103 64 MHz). Pinout에 숫자로 입력하는 칸은 **APB1 타이머 입력 클록**뿐이고, `.ioc`의 HSE 설정은 가져올 때 HSI 값으로 바꾸며 경고합니다.
- **CubeMX:** 클럭 트리 화면에서 다음을 설정합니다.
  - HSE Bypass(NUCLEO는 ST-LINK MCO 8 MHz)
  - LSE·LSI
  - PLL M/N/P/Q/R, PLLI2S·PLLSAI
  - AHB·APB 분주, Over-drive로 180 MHz(F1은 HSE로 72 MHz)
  - MCO1/2, RTC 클럭 원본
  - ADC·USB 분주(F1)
- 에뮬레이터는 RCC 설정을 그대로 따르므로(baud·I2C·SPI·TIM이 버스 클럭 기준) 화면과 코드 생성만 만들면 됩니다.

### A3. Pinout에 없는 주변장치

| 주변장치 | 에뮬레이터 | 크기 | 중요도 |
|---|---|---|---|
| TIM1(두 보드)·TIM8(F446) 고급 타이머(CHxN·Dead-time·Break) | 있음(Dead-time·Break 입력은 부족, B2) | M | 상 |
| TIM6/7(기본 타이머, Timebase·DAC 트리거)·TIM9~14 | 있음 | S~M | 상 |
| RTC(달력, Alarm A/B, WakeUp) | F446만 있음(알람 미동작, B2). F103 없음 | M | 상 |
| DAC OUT1/OUT2(F446) | **없음** | M | 상 |
| I2C2(두 보드)·I2C3(F446), SPI2(두 보드)·SPI3(F446), I2S | 있음 | M | 중~상 |
| ADC2/3(F446). 가져올 때 ADC1로 합쳐짐(`mcu-config.js:113`) | 있음 | M | 중 |
| IWDG·WWDG·CRC | 있음 | S | 중 |
| CAN1/2 | 있음 | M | 하~중 |
| USB OTG/USB FS, QUADSPI, SAI, SPDIFRX, HDMI-CEC, FMC | 없음 | L | 하 |

### A4. 코드 생성과 프로젝트 구조 (M~L, 상)

- **현재 생성 파일:** `main.c` 하나뿐입니다.
- **CubeMX 생성 파일:**
  - `main.h`(핀 라벨 `LD2_Pin`·`LD2_GPIO_Port` define)
  - `stm32xxxx_it.c/.h`(IRQ 핸들러)
  - `stm32xxxx_hal_msp.c`(`HAL_MspInit`·`HAL_xxx_MspInit`의 클럭·AF·NVIC 설정)
  - `stm32xxxx_hal_conf.h`, `system_*.c`, `syscalls.c`/`sysmem.c`, startup `.s`, 링커 `.ld`
  - CubeIDE 프로젝트 파일(`.project`·`.cproject`·`.mxproject`)
- **앱의 현재 방식:**
  - 핀 라벨은 빌드할 때 `-D`로 대신 넣습니다(`native-build.cjs:79-80`).
  - MSP 파일은 SDK 템플릿을 복사하고, 클럭 활성화와 AF 설정은 `MX_xxx_Init`·`MX_GPIO_Init`에 들어갑니다.
- **CubeMX Project Manager에 있고 앱에 없는 옵션:** 주변장치별 `.c/.h` 분리, HAL/LL 선택, 함수 호출 생성 여부, 툴체인(CubeIDE/Makefile/CMake), Heap·Stack 크기.

### A5. .ioc 내보내기 (M, 상)

`.ioc`는 가져오기만 됩니다(`mcu-config.js:100` `importIoc`). 앱에서 만든 설정을 CubeMX나 CubeIDE에서 다시 열 수 없습니다.

### A6. 미들웨어 (L)

- **현재:** Pinout에 미들웨어가 없습니다. FatFs는 내장 해석기에서만 동작하고(`hal-storage.js`) 설정 화면이 없습니다.
- **CubeMX 제공 목록:**
  - F446: FREERTOS(CMSIS v1/v2), FATFS, USB_DEVICE/HOST 등
  - F103: FREERTOS, FATFS, USB_DEVICE
- **FreeRTOS(상):**
  - 에뮬레이터 코어에 필요한 기능은 있습니다: SVC·PendSV·SysTick, MSP/PSP, BASEPRI, FPU 스택 프레임.
  - 빌드 경로에 `Middlewares/FreeRTOS`가 없습니다(`native-build.cjs:6-7`).
  - 시험도 없습니다. CubeIDE에서 빌드한 FreeRTOS ELF를 **펌웨어 ELF 열기**로 실행하는 것도 확인하지 않았습니다.

### A7. CubeMX 화면 구성 (중~상)

| 항목 | 크기 | 중요도 |
|---|---|---|
| LQFP64 칩 그림 Pinout(지금은 알파벳순 핀 타일, `pinout-ui.js:60`) | M | 상 |
| 핀 색(초록·주황·빨강)과 핀을 누르면 나오는 대체 신호 목록 | S~M | 중 |
| Pinout 안 핀·신호 검색 | S | 중 |
| 분류 트리(System Core·Analog·Timers·Connectivity·Middleware)와 주변장치별 Parameter·NVIC·DMA·GPIO 탭 | M | 중 |
| User Constants, 보고서 생성, 소비 전력 계산 | S~M | 하 |

### A8. 일부러 CubeMX와 다르게 만든 부분 (유지 여부 결정 필요)

- **UART NVIC 자동 켜기:** UART를 켜면 NVIC 전역 인터럽트도 켜집니다(1.15.0, `serial-config.js:23-25`).
- **주변장치 자동 켜기:** 핀에 주변장치 신호를 고르면 그 주변장치가 켜집니다(`pinout-ui.js:67`).
- **클럭:** 항상 HSI로 둡니다. ST-LINK MCO나 HSE 점퍼 상태에 흔들리지 않게 하려는 것입니다.
- **생성 main.c의 예시 코드:** CubeMX에는 없는 코드가 들어갑니다(`hal-generator.js:50-58,132-136`).
  - "HAL ready" UART 송신, 첫 출력 핀 토글 + `HAL_Delay(500)`, `HAL_TIM_*_Start`
  - 빈 콜백, ITM으로 보내는 `__io_putchar`
- **IRQ 핸들러 위치:** `_it.c`가 아니라 main.c에 씁니다.
- **EXTI 기본 에지:** FALLING입니다. CubeMX 기본값은 RISING입니다(`mcu-config.js:116`).
- **NVIC 우선순위:** Group 4를 가정한 Preemption 값입니다.
- **F1 SWJ 리맵:** `__HAL_AFIO_REMAP_SWJ_NOJTAG()`를 PA15/PB3/PB4를 쓸 때만 넣습니다. CubeMX는 Serial Wire를 고르면 `HAL_MspInit`에 넣습니다.

### A9. 새 프로젝트 기본값: CubeMX Board Selector와 비교

CubeMX가 NUCLEO 보드를 고를 때 쓰는 기본 설정 파일(`db/plugins/boardmanager/boards/A42_Nucleo_NUCLEO-F446RE_STM32F446RE_Board*.ioc`, `A10_Nucleo_NUCLEO-F103RB_STM32F103RB_Board*.ioc`)과 앱의 새 프로젝트(`docs/MCU-DEFAULTS.md`)를 비교했다.

| 항목 | CubeMX Board Selector (NUCLEO) | 앱 새 프로젝트 |
|---|---|---|
| F446 클럭 | HSI → PLL(N=336, P=/4) 84 MHz, APB1 /2(42 MHz, TIM 84 MHz), APB2 /1, Flash latency 2 | HSI 16 MHz, PLL OFF, 분주 1, latency 0 |
| F103 클럭 | HSI/2 × PLL16 = 64 MHz, APB1 /2(32 MHz, TIM 64 MHz) | HSI 8 MHz(예제는 64 MHz) |
| 핀 | PA5 `LD2 [Green Led]` 출력, PC13 `B1 [Blue PushButton]` EXTI 하강, PA2/PA3 USART2(Asynchronous), PA13/PA14 Serial Wire, PB3 SWO, PC14/PC15 LSE, PH0/PH1(F1은 PD0/PD1) HSE | 할당 없음 |
| NVIC | SysTick·Fault 줄 표시. Priority Group 4(F103 파일), "모든 주변장치 기본 모드로 초기화" 파일은 SysTick 켜짐 | Priority Group 선택 없음, SysTick 줄 없음 |

앱의 새 프로젝트는 CubeMX의 **MCU Selector**(칩만 고른 상태: HSI 16 MHz, 핀 없음)와 같고, **Board Selector**(NUCLEO 보드 기본값)와는 다르다. 앱은 NUCLEO 보드를 전제로 하므로 Board Selector 기본값을 따를지 결정이 필요하다.

CubeMX를 화면 없이(`-q` 스크립트) 실행해 실제 생성 코드를 받으려 했으나, 이 PC의 `STM32Cube/Repository`에 펌웨어 패키지(STM32Cube_FW_F4/F1)가 없어 보드 설정을 읽은 뒤 진행하지 않았다(생성에는 패키지가 필요).

### A10. CubeMX 화면 확인 (NVIC, STM32F103RBTx)

사용자가 띄워 둔 CubeMX 창(MCU Selector로 만든 STM32F103RBTx 프로젝트)을 포커스 없이 창만 캡처해 확인했다.

- **상단 탭:** Pinout & Configuration · Clock Configuration · Project Manager · Tools. Pinout & Configuration 아래에 Software Packs·Pinout 메뉴가 있고, 오른쪽 위에 **GENERATE CODE**가 있다.
- **왼쪽 분류 트리:** Categories / A->Z 전환과 검색 칸이 있다.
  - 분류: System Core(DMA·GPIO·IWDG·NVIC·RCC·SYS·WWDG), Analog, Timers, Connectivity, Computing, Middleware and Software Packs.
  - 설정한 항목에는 초록 체크가 붙는다.
- **가운데 NVIC 화면:** Mode와 Configuration 영역으로 나뉘고, Configuration에 **NVIC**·**Code generation** 탭이 있다.
  - **NVIC 탭의 위쪽 도구:** Priority Group 선택, Preemption·Sub Priority 정렬, 이름 정렬, 검색, 표시 범위(available interrupts), Force DMA channels.
  - **NVIC 탭의 표:** 열은 Add(켜기), Preemption Priority, Sub Priority다.
    - 고정 행: NMI, Hard fault, Memory management, Prefetch fault(BusFault), Undefined instruction(UsageFault), SVC, Debug monitor, PendSV, **Time base: System tick timer(우선순위 15)**.
    - 켜고 끌 수 있는 행: PVD(EXTI16), Flash, RCC.
    - 맨 아래에서 고른 행의 Preemption·Sub Priority를 바꾼다.
  - **Code generation 탭:** IRQ 핸들러 생성 여부와 HAL 핸들러 호출 여부를 IRQ마다 정한다. 앱의 1.15.0 핸들러 생성은 이 선택 없이 켜진 IRQ마다 만든다.
- **오른쪽:** Pinout view / System view 전환, LQFP64 칩 그림(핀마다 이름 칸, 설정된 핀은 색 표시), 확대·축소·회전·검색 도구.
- **앱과 비교:** 앱의 NVIC는 Pinout 창 오른쪽 열 아래의 목록 하나로, 우선순위 숫자 하나만 있다. Priority Group, Sub Priority, 시스템 예외 행(SysTick 등), 검색·정렬, Code generation 탭이 없다(A1 NVIC 행).

### A11. CubeMX 직접 조작 확인 (2026-11-05, Computer use, STM32F103RBTx)

사용자가 켜 둔 CubeMX 6.18의 MCU Selector 프로젝트에서 화면을 직접 눌러 확인했다. 확인하려고 바꾼 USART2·PA5 설정은 원래대로 되돌렸다. 저장과 코드 생성은 하지 않았다.

- **NVIC Priority Group:** 기본값은 4비트 preemption(그룹 4)이다.
- **NVIC Code generation 탭:** IRQ마다 네 열이 있다.
  - Select for init sequence ordering
  - Generate Enable in Init
  - Generate IRQ handler: 기본 체크
  - Call HAL handler: SysTick에서 체크됨
- **Interrupt unmasking ordering table:** "인터럽트 초기화 코드를 모든 주변장치 초기화 뒤로 옮김" 순서 표가 있다.
- **USART2:**
  - **Mode 목록:** Disable, Asynchronous, Synchronous, Single Wire (Half-Duplex), Multiprocessor Communication, IrDA, LIN, SmartCard, SmartCard with Card Clock. Hardware Flow Control(RS232) 선택이 따로 있다.
  - **Asynchronous를 고르면** 탭이 생긴다: Reset Configuration 단추와 User Constants·NVIC Settings·DMA Settings·GPIO Settings·Parameter Settings.
  - **Parameter Settings:** Basic(Baud 115200, Word Length 8 Bits, Parity None, Stop Bits 1), Advanced(Data Direction Receive and Transmit, Over Sampling 16).
  - **NVIC Settings:** "USART2 global interrupt" 한 줄이 Add·Preemption·Sub Priority 열과 함께 나오고, **기본은 꺼져 있다**. 그래서 앱의 1.15.0 자동 켜기는 CubeMX와 다르다(A8).
  - **GPIO Settings:** PA2 USART2_TX(Alternate Function Push Pull, 속도 High), PA3 USART2_RX(Input mode, No pull).
  - **DMA Settings:** Add/Delete로 요청을 더하는 빈 표(DMA Request·Channel·Direction·Priority).
- **TIM2 Mode:** Slave Mode, Trigger Source, Clock Source, Channel1~4, Combined Channels, Use ETR as Clearing Source, XOR activation, One Pulse Mode.
- **핀 클릭 메뉴(PA5):** Reset_State, ADC1_IN5, ADC2_IN5, SPI1_SCK, GPIO_Input, GPIO_Output, GPIO_Analog, EVENTOUT, GPIO_EXTI5. 고른 신호 이름은 칩 그림의 핀 옆에 표시된다.
- **GPIO 설정:** Group By Peripherals 보기와 주변장치별 탭(GPIO·USART)이 있고, 표의 열은 Pin Name, Signal, Output level, Mode, Pull, Maximum output speed, User Label, Modified다. 핀을 고르면 아래에 상세 설정이 나오고 여러 핀을 함께 고를 수 있다.
  - **GPIO_Output 기본값:** Output level Low, Output Push Pull, No pull, **Maximum output speed Low**. 앱은 VERY_HIGH(F1은 HIGH)로 고정이라 다르다.
- **Clock Configuration (F103, MCU Selector 기본):**
  - 기본은 HSI 8 MHz를 바로 SYSCLK로 쓰고 모든 분주가 /1이다. 앱의 F103 새 프로젝트와 같다.
  - 화면 구성:
    - RTC Clock Mux(HSE/128·LSE·LSI 40 kHz), To IWDG
    - PLL Source Mux(HSI/2, HSE /1·/2)와 PLLMul, USB Prescaler
    - System Clock Mux와 Enable CSS
    - AHB·APB1(36 MHz max 표시)·APB2·ADC 분주, Cortex System timer 분주
    - MCO source Mux(PLLCLK/2·HSI·HSE·SYSCLK)
  - 위쪽 도구: 되돌리기·다시 하기, Resolve Clock Issues, 확대·축소, 검색. 주파수 칸에 값을 바로 넣을 수 있다.
- **Project Manager:**
  - **Project:** Project Name·Location, Application Structure(Advanced/Basic), Do not generate the main(), Toolchain/IDE(기본 EWARM), Min Version, Generate Under Root.
  - **Project의 나머지 설정:** Linker Settings(Heap 0x200, Stack 0x400), Thread-safe Settings, Firmware Package(STM32Cube FW_F1 V1.8.7, 기본 위치 `STM32Cube/Repository`).
  - **Code Generator:** 라이브러리 복사 방식 3가지, 주변장치별 `.c/.h` 분리, 재생성 시 백업, Keep User Code(기본 켬), 쓰지 않는 생성 파일 삭제(기본 켬), 빈 핀을 Analog로, Full Assert, 생성 전후 실행할 사용자 명령, 템플릿 설정.
  - **Advanced Settings:**
    - Driver Selector: 주변장치마다 HAL/LL
    - Generated Function Calls 표: Rank 순서, Do Not Generate Function Call, Visibility(Static)
    - Register CallBack: 주변장치마다 ENABLE/DISABLE
- **Tools 탭:** Compare Projects, PCC(소비 전력 계산), CAD.
- **Middleware and Software Packs (F103):** FATFS, FREERTOS, USB_DEVICE(USB를 켜야 선택 가능).

## B. 보드 시뮬레이터 쪽 (실물과 같은지)

에뮬레이터의 Cortex-M4 코어는 QEMU와 대조했고, GPIO·EXTI·RCC·TIM·USART·I2C·SPI·ADC·DMA·CAN·IWDG/WWDG·CRC·SDIO·DCMI는 레지스터 단위 모델입니다.

### B1. 없는 주변장치

| 항목 | 근거 | 크기 | 중요도 |
|---|---|---|---|
| DAC1/2(F446): 매핑 없음, 빌드 모듈에 `hal_dac` 없음, 해석기에도 없음 | `stm32f446/soc.js:29-40`, `native-build.cjs:6` | M | 상 |
| F103 RTC·BKP: 주소 표에는 있으나 매핑 안 됨. `hal_rtc`는 빌드되므로 `HAL_RTC_*`가 BusFault | `stm32f103/soc.js` | M | 상 |
| 매핑 안 된 주소 접근이 "잘못된 메모리 접근"으로만 보이고 "이 주변장치는 에뮬레이터에 없음" 안내가 없음 | `machine.js` | S | 상 |
| USB OTG/FS, BKPSRAM, FMPI2C, SAI, SPDIF, CEC, QUADSPI, FMC | `rcc.js`에 클럭 비트만 있음 | L | 하~중 |

### B2. 일부만 있는 주변장치

| 항목 | 빠진 것 | 크기 | 중요도 |
|---|---|---|---|
| PWR 저전력 | WFI/WFE는 Sleep만. STOP이 Sleep처럼 동작(깨어날 때 HSI 복귀 없음. `SystemClock_Config()` 재호출을 빠뜨려도 시뮬레이터에선 동작함), Standby·WKUP·PVD 없음(`cpu.js:712-718`, `scs.js:247`) | M | 상 |
| RTC(F446) | Alarm A/B 플래그가 서지 않음, PREDIV·LSE/LSI와 무관하게 1초씩, DBP 쓰기 보호 없음, Tamper 없음(`system.js:198-265`) | M | 상 |
| FLASH | Program/Erase가 HAL_OK만 돌려주고 쓰지 않음, Option byte 없음, Latency 값을 무시(잘못된 wait state·Over-drive 없는 180 MHz도 동작) | M | 중 |
| 고급 타이머 | Dead-time 무시(CHxN은 반전만), BKIN 없음, 타이머 간 ITR 동기화 없음, ETR·입력 필터 없음(`timer.js`) | M | 중 |
| USART | RTS/CTS·LIN·IrDA·SmartCard·Half-duplex 없음 | M | 하~중 |
| ADC | Dual/Triple·Discontinuous 없음, VREF 3.3 V 고정 | M | 하~중 |
| I2C / SPI·I2S / DMA / MPU | 10비트·OAR2·SMBus 없음 / I2S는 마스터 송신만 / 전송이 즉시 완료되고 우선순위 중재 없음 / MPU 보호 미적용 | S~M | 하 |
| F103 메모리 한도 | F446 크기(512 KB/128 KB)를 써서 실제 128 KB/20 KB를 넘어도 동작(스택 넘침이 안 보임) | S | 중 |

### B3. 전반적인 정확도

- **시간:** 명령마다 근사 사이클을 씁니다. 84 MHz에서 실제 시간의 약 0.6~0.7배로 돌고, 입력을 빠르게 폴링하는 펌웨어는 0.1~0.2배까지 느려집니다.
- **클럭 트리:** 에뮬레이터는 RCC를 그대로 따릅니다. 단 HSE는 8 MHz 고정이고 CSS는 없습니다.
- **전기적 특성:** 논리 판정이 1.65 V 고정입니다(VIL/VIH·히스테리시스 없음). 그 밖에 빠진 것:
  - OSPEEDR 무시
  - 5 V 허용 핀 구분과 칩 전체 전류 한도 없음
- **리셋:** NRST·IWDG·`NVIC_SystemReset` 때 RTC 달력과 백업 레지스터까지 지워집니다. 실제로는 유지됩니다. BOOT0과 메모리 리맵도 없습니다.

### B4. NUCLEO 보드

- **되어 있는 것(1.13.0):** LD2, B1, 솔더 브리지(SB62/63/48/49/55), ST-LINK VCP, MCO.
- **없는 것:**
  - 헤더의 NRST·BOOT0·VBAT·VIN·E5V가 전기적으로 연결되지 않습니다. 회로에서 NRST를 LOW로 당겨도 리셋되지 않습니다(S, 중).
  - 버튼·스위치 채터링(바운스)과 C15 RC 필터가 없습니다. 디바운스가 왜 필요한지 보이지 않습니다(S, 중).

### B5. 두 실행 엔진의 차이

- **해석기의 범위:** 내장 해석기는 HAL API 수준만 실행합니다. TIM1/8·CAN·RTC·IWDG·PWR·FLASH·DAC가 없고 레지스터 직접 접근 코드도 실행하지 않습니다.
- **해석기로 실행되는 경우:** FatFs 프로젝트와 ARM GCC가 없는 PC는 해석기로 돌아가서, 같은 코드가 다르게 동작할 수 있습니다.
- **Pinout과 소스가 다를 때:** 해석기는 멈추고 에뮬레이터는 그대로 실행합니다.

## C. 우선순위 제안

1. **NVIC를 CubeMX처럼:** Priority Group·Sub Priority, 주변장치별 NVIC 탭, SysTick 줄을 넣습니다. GPIO의 Output type·Speed와 AF 핀 Pull도 함께 넣습니다(S~M).
2. **기존 주변장치 설정 채우기:** UART 형식, SPI 모드, ADC 다채널·트리거, TIM 채널별 Pulse·OC·One Pulse(M). 에뮬레이터가 이미 지원하므로 UI와 생성만 만들면 됩니다.
3. **클럭 트리 화면:** HSE Bypass·PLL·분주, 180/72 MHz(L).
4. **주변장치 추가:** TIM1·TIM6/7, IWDG/WWDG, I2C2·SPI2, RTC(F103 에뮬레이터 포함), DAC(F446 에뮬레이터 포함)(M).
5. **시뮬레이터 정확도:**
   - 없는 주변장치 접근 안내(S)
   - F103 메모리 한도(S)
   - RTC 알람(M)
   - STOP/Standby(M)
   - FLASH Latency 검사(S~M)
   - NRST 핀·버튼 바운스(S)
6. **코드 생성 구조:** `main.h`·`_it.c`·`_hal_msp.c` 분리와 `.ioc` 내보내기(M~L). A8의 예시 코드를 유지할지 먼저 정해야 합니다.
7. **나중에:** FreeRTOS(빌드 경로·Pinout·시험), LQFP64 칩 그림 Pinout, 고급 타이머 Dead-time/Break, USB 등.
