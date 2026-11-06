# FPB-RA6E1 추가 계획

작성 2026-11-06. 상태: **계획(구현 전)**. 아래 "0단계 결정"이 정해지면 1단계부터 버전을 나눠 진행한다.

앱의 지금 목표는 "CubeMX + CubeIDE + STM 보드 시뮬레이터"이고 보드는 NUCLEO-F446RE·NUCLEO-F103RB다. FPB-RA6E1은 Renesas 보드라 MCU·SDK·설정 도구가 모두 달라서, F103RB를 더할 때(0.32.0·0.33.0, F4 모델을 대부분 공유)와 달리 **새 플랫폼을 하나 더 만드는 규모**다. 이 문서는 확인한 사실, 지금 앱과의 차이, 단계별 계획, 미확인 사항을 정리한다.

## 1. 확인한 사실 (2026-11-06)

출처: Renesas FPB-RA6E1 보드 페이지, FPB-RA6E1 v1 User's Manual(R20UT4960EG0100 Rev.1.00), Quick Start Guide(R20QS0025EG0101 Rev.1.01), RA6E1 제품 페이지, 핀 목록 정정 문서(TN-RA*-A0039A/E), SEGGER·Zephyr 보드 문서, renesas/fsp GitHub.

| 항목 | 내용 |
|---|---|
| MCU | R7FA6E10F2CFP (RA6E1), Arm Cortex-M33(TrustZone, FPU), 200 MHz, LQFP100, 2.7~3.6 V |
| 메모리 | Code Flash 1 MB, Data Flash 8 KB, SRAM 256 KB |
| 디버거 | SEGGER J-Link OB(SWD), Micro USB J9(전원 겸용). e² studio 설정: Debug hardware `J-Link (ARM)`, Target `R7FA6E10F` |
| 가상 COM | 매뉴얼에 J-Link OB의 USB-시리얼 연결이 없다(Zephyr 콘솔도 SCI0). NUCLEO의 ST-LINK VCP(USART2) 같은 내장 터미널이 실물에는 없는 것으로 본다 |
| 사용자 LED | LED1 = P408, LED2 = P407 (녹색, High 켜짐, 트레이스 컷 E10·E9로 분리 가능). Zephyr dts는 led1=P407, led2=P408로 이름이 반대 |
| 스위치 | S1 사용자 = P205(IRQ1, 누르면 Low, E29), S2 = RESET# |
| 클록 | 32.768 kHz 서브 크리스털 장착, 24 MHz 메인 크리스털 미장착(E12·E13 열림) → 기본은 내부 HOCO |
| 전원 | USB 5 V 또는 CN2(미장착) → LDO 3.3 V(최대 2 A) |
| Arduino Uno R3 | A0~A5 = P000·P001·P002·P003·P004·P008(AN000~AN008) / D0 P110(RXD9) · D1 P109(TXD9) · D2 P409(IRQ6) · D3 P104(IRQ1/GTIOC1B) · D4 P107 · D5 P105(GTIOC1A) · D6 P303(GTIOC7B) · D7 P113 · D8 P402 · D9 P302(GTIOC4A) · D10 P103(SSLB0/GTIOC2A) · D11 P101(MOSIB/GTIOC5A) · D12 P100(MISOB) · D13 P102(RSPCKB) / SDA P401(SDA0) · SCL P400(SCL0), 2.2 kΩ 풀업(E7·E8) / IOREF 3.3 V, RESET 핀은 P014로 표기, AREF = VREFH0 |
| Pmod1 | Type 2A/3A 기본(SPI0/SCI0: P103·P101·P100·P102, GPIO P015(IRQ13)·P014·P105·P106), 전원 기본 5 V(E2). Type 6A(I2C P400/P401)로 바꿀 수 있음 |
| Pmod2 | SCI9/SPI: P301(SS9/CTS9)·P109(TXD9)·P110(RXD9)·P111(SCK9), P304(IRQ9)·P112·P410·P303, 3.3 V |
| 기타 | 크기 55 × 95 mm, MCU 핀 헤더 J3·J4 2×50(미장착, 빵판을 걸칠 수 있는 간격), 부트 모드 J7(P201/MD), 전류 측정 R3·CN1 |
| SDK | Renesas FSP(GitHub renesas/fsp, 현재 v6.6.0, e² studio 2026-07 필요). 설정·코드 생성은 e² studio 또는 RA Smart Configurator(RASC). 기본 BSP·드라이버는 BSD-3-Clause, 일부 모듈은 Renesas Open License(Renesas 칩에서만 사용) |
| 정정 문서 | TN-RA*-A0039A/E(2021-10-07): 하드웨어 매뉴얼 Rev.1.00의 1.7 Pin Lists(66~67쪽)와 19.6 Peripheral Select Settings(464~468쪽) 정정. 표가 그림이라 이 PC에서 내용은 아직 읽지 못함 |

## 2. 지금 앱과의 차이

| 영역 | STM 보드(지금) | FPB-RA6E1 |
|---|---|---|
| 코드 API | STM32 HAL(`HAL_GPIO_WritePin` 등), CubeMX식 main.c | FSP(`R_IOPORT_PinWrite`, `R_SCI_UART_Open`, `R_GPT_Open`, `R_BSP_SoftwareDelay` 등), `hal_entry.c`가 사용자 코드, `ra_gen/`(hal_data.c·pin_data.c·vector_data.c·common_data.c)·`ra_cfg/`는 생성 파일 |
| 설정 도구 | CubeMX식 Pinout(`pinout-ui.js`, `mcu-family.js`, `hal-generator.js`) | RASC/e² studio FSP Configurator(Pins·Clocks·Stacks·Interrupts·Event Links) |
| 주변장치 | GPIO/EXTI·USART·TIM·ADC·I2C·SPI·DMA | PORT/PFS(PmnPFS)·ICU(IRQn, IELSR로 이벤트→NVIC 연결)·GPT/AGT·SCI(UART/간이 SPI/I2C)·IIC·SPI·ADC12·DMAC/DTC·ELC |
| 해석 실행 | `hal.js` 등 HAL 어댑터(STM 전용) | 새 FSP 어댑터가 필요 |
| 에뮬레이터 | `src/emu/stm32f446`(18파일 약 3,200줄), `stm32f103`(F4 상속 약 650줄), CPU는 Cortex-M3/M4 | 새 SoC 모델(`src/emu/ra6e1`) 전체. CPU는 M33 전용 레지스터(MSPLIM·PSPLIM 등)를 더해야 함(FPU·MRS/MSR은 있음) |
| 빌드 | ARM GCC + STM32Cube SDK(`native-build.cjs`의 `SDKS[family]`) | ARM GCC + FSP(`-mcpu=cortex-m33 -mfpu=fpv5-sp-d16 -mfloat-abi=hard`), FSP 링커 스크립트·memory_regions |
| 실물 보드 | ST-LINK + OpenOCD | J-Link(SEGGER J-Link 소프트웨어, GDB Server) |
| 터미널 | ST-LINK VCP(USART2) | 내장 VCP 없음 → D0/D1(SCI9)에 USB-UART 부품을 연결해 쓰는 방식 |

## 3. 단계별 계획

각 단계는 버전 하나(또는 둘)로 게시한다. 앞 단계가 끝나야 다음 단계를 시작한다.

### 0단계 — 결정 (사용자)

1. **목표 범위 확장:** 앱 목표를 "STM + Renesas RA 보드"로 넓힐지, 앱·저장소 이름(STM Simulator)은 그대로 둘지.
2. **실행 방식:** 추천은 **에뮬레이터 전용**(실제 FSP를 ARM GCC로 빌드해 RA6E1 모델에서 실행). FSP 동작을 레지스터 수준에서 그대로 따르므로 FSP API를 해석기로 다시 만드는 일이 없다. 대신 RA 보드는 ARM GCC와 FSP가 항상 필요하다. 해석 실행 지원은 나중에 필요할 때 검토.
3. **설정 화면 범위:** RASC처럼 Pins·Clocks·Stacks를 앱 안에서 만들지, 첫 단계는 e² studio에서 만든 프로젝트(ra_gen 포함)를 가져와 실행하는 것부터 할지.
4. **실물 보드:** J-Link로 기록·디버그까지 할지(SEGGER J-Link 소프트웨어 설치 필요).
5. **수업 자료:** 수업에서 쓰는 FSP·e² studio 버전과 예제 프로젝트(있으면)를 받아 기준으로 삼는다.

### 1단계 — FSP 빌드 기반 (가져온 프로젝트 빌드)

- 보드 카탈로그에 `fpb-ra6e1`(mcuFamily `R7FA6E10F`, vendor `renesas`)을 넣되, STM 전용 기능(CubeMX Pinout, HAL 예제, 해석 실행)은 이 보드에서 숨기거나 안내한다.
- 개발 도구 설치에 FSP를 추가: 고정 버전, 필요한 파일만(BSP, CMSIS 장치 헤더, r_ioport·r_icu·r_sci_uart·r_gpt·r_agt·r_adc·r_iic_master 등), 파일별 SHA-256 매니페스트(`tool-manifest-ra.json`), Renesas Open License 모듈은 제외.
- `native-build.cjs`에 RA 빌드 계획: M33 플래그, FSP 링커 스크립트, `ra_gen`/`ra_cfg`/`src` 구성. e² studio 프로젝트 폴더(또는 zip)를 가져와 빌드하는 경로부터.
- 완료 기준: e² studio의 FPB-RA6E1 blinky 프로젝트를 앱에서 빌드해 ELF가 나온다. 단위(빌드 계획)·toolchain 시험.

### 2단계 — RA6E1 에뮬레이터 (blinky·버튼)

- CPU: M33 레지스터(MSPLIM/PSPLIM MSR·MRS, 스택 한계 검사는 최소), 필요한 ARMv8-M 명령 확인.
- SoC 모델 `src/emu/ra6e1/`: 메모리 맵(Code Flash 0x0000_0000, SRAM 0x2000_0000, 주변장치 0x4000_0000~), SYSTEM(PRCR 보호, CGC: HOCO·MOCO·LOCO·SOSC·PLL, SCKDIVCR), MSTP(모듈 정지), PORT/PFS(입출력·풀업·기능 선택), ICU(IRQ 핀 엣지, IELSR → NVIC), SysTick. 레지스터 주소·비트는 하드웨어 매뉴얼과 FSP CMSIS 헤더(`R7FA6E10F.h`)·SVD로 맞춘다.
- 보드 그림(55 × 95 mm, Arduino 헤더, LED1·LED2·S1·S2·J9)과 회로 핀(Arduino·Pmod 매핑, I2C 풀업) — 회로 엔진은 핀 이름만 바뀌면 그대로 쓴다.
- 완료 기준: FSP blinky가 LED1·LED2를 깜빡이고, S1(P205 IRQ1) 인터럽트가 LED를 바꾼다. `tests/fixtures/firmware-ra6e1/`(고정 ELF)과 펌웨어 시험, E2E.

### 3단계 — 주변장치 (UART·타이머·ADC·I2C)

- SCI(UART 모드, SCI9 = D0/D1, SCI0 = Pmod1), GPT(주기·PWM·입력 캡처), AGT, ADC12(A0~A5), IIC0(P400/P401), 필요하면 SPI·DTC/DMAC.
- 직렬 모니터: 실물처럼 D0/D1에 USB-UART 부품을 연결해 송수신(내장 VCP 없음).
- 로직 분석기·파형·변수 그래프는 에뮬레이터 공통 경로라 그대로 동작해야 한다(확인).
- 완료 기준: FSP 예제(UART echo, GPT PWM으로 LED 밝기, ADC로 가변저항, I2C 센서)가 회로와 함께 동작.

### 4단계 — 앱 안 FSP 설정(RASC식)

- Pins(포트·PFS 기능), Clocks(HOCO/PLL 분주), Stacks(모듈 추가와 속성), Interrupts(IELSR 할당)를 앱 화면으로 만들고 `ra_gen`·`ra_cfg`를 생성한다(CubeMX식 Pinout과 별도 화면).
- 새 RA 프로젝트 템플릿(`hal_entry.c`), 예제 목록(보드 LED·버튼·UART·PWM·ADC·I2C).
- 완료 기준: e² studio 없이 앱에서 설정 → 생성 → 빌드 → 에뮬레이터 실행. 생성 파일은 같은 설정의 RASC 출력과 비교해 맞춘다.

### 5단계 — IDE 연결

- 정의로 이동·자동완성의 SDK 색인을 FSP로(지금 `desktop/sdk-index.cjs`는 STM32Cube 기준), Core·Startup 묶음에 `ra_gen` 생성 파일과 FSP startup을 읽기 전용으로.
- 완료 기준: `R_IOPORT_PinWrite` Ctrl+클릭으로 FSP 원본, 자동완성에 FSP 이름.

### 6단계(선택) — 실물 보드

- SEGGER J-Link GDB Server로 기록·디버그, 보드 선택(J-Link 시리얼). 실물 FPB-RA6E1이 있어야 검증할 수 있다.

## 4. 위험과 미확인 사항

- **정정 문서 내용:** 핀 기능 표 정정이 그림이라 아직 못 읽었다. 핀·기능 표를 만들기 전에 정정이 반영된 최신 하드웨어 매뉴얼을 기준으로 하거나, PDF를 그림으로 볼 도구(poppler `pdftoppm`, 사용자 승인 필요)로 확인한다.
- **회로도(Design Package ZIP):** 아직 받지 않았다(다운로드 승인 필요). 보드 그림·핀 헤더·풀업·LED 저항 값을 맞추려면 필요하다.
- **하드웨어 매뉴얼:** 수백 쪽이라 단계마다 필요한 장(CGC, I/O Ports, ICU, GPT, SCI, ADC12, IIC)만 읽는다.
- **FSP 생성 코드 의존:** FSP 드라이버는 `ra_gen`의 설정 구조체에 의존한다. 4단계 생성기는 RASC 출력과 비교 시험이 필요하다.
- **라이선스:** BSD-3 모듈만 받는다. Renesas Open License 모듈(Renesas 칩에서만 사용)은 RA6E1 시뮬레이션 용도로도 넣지 않는 것을 기본으로 한다.
- **보드 LED 이름:** 매뉴얼(LED1=P408)과 Zephyr(led1=P407)가 다르다. 실물 실크 기준인 매뉴얼을 따른다.
- **J-Link:** 실물 단계에는 SEGGER 소프트웨어 설치와 라이선스 조건 확인이 필요하다.

## 5. 설치·다운로드가 필요한 것 (모두 사용자 승인 후)

| 무엇 | 언제 | 용도 |
|---|---|---|
| FPB-RA6E1 Design Package ZIP | 2단계 전 | 회로도·보드 배치 |
| RA6E1 하드웨어 매뉴얼 PDF(정정 반영본) | 2단계 전 | 레지스터 모델 |
| FSP 소스(고정 버전, 필요한 파일만) | 1단계 | 빌드·에뮬레이터 시험 |
| poppler(pdftoppm) | 필요 시 | 그림으로 된 표 확인 |
| SEGGER J-Link 소프트웨어 | 6단계 | 실물 보드 |
