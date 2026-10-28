# STM Simulator

STM Simulator는 **NUCLEO-F446RE·NUCLEO-F103RB 회로 시뮬레이터와 Cortex-M 펌웨어 에뮬레이터를 통합한 Windows 학습용 IDE**입니다. 두 보드 모두 회로 시뮬레이터, 실제 ARM 빌드, 실물 보드 실행·디버그, 펌웨어 에뮬레이터를 쓸 수 있습니다. 프로젝트 생성, C/C++ 코드 작성, 실제 GCC 빌드·GDB 디버그, 가상 빵판 회로 실습을 VS Code와 같은 한 화면에서 진행합니다.

## 실행 대상

| 실행 대상 | 동작 | 필요한 도구 |
|---|---|---|
| **회로 시뮬레이터** | 컴파일 없이 HAL C 소스를 해석해 회로와 함께 바로 실행 | 없음 |
| **펌웨어 에뮬레이터 · ARM ELF** | ARM GCC로 실제 ST HAL·CMSIS를 빌드한 ELF를 Cortex-M4(FPU·DSP 포함) 명령어 단위로 실행하고 STM32F446 또는 STM32F103 주변장치를 가상 빵판에 연결 | 빌드: ARM GCC + STM32CubeF4(F446RE) / STM32CubeF1(F103RB) · 이미 만든 ELF 실행: 없음 |
| **STM32 · ARM GCC** | 실물 보드에 ELF/BIN/HEX를 기록하고 ST-LINK·OpenOCD·GDB로 디버그(여러 보드를 연결하면 보드 이름으로 ST-LINK 선택) | ARM GCC, STM32CubeF4 또는 STM32CubeF1, ARM GDB, OpenOCD |
| **Windows · C/C++** | PC용 C/C++ 프로그램 빌드·실행·디버그 | GCC, GDB |

## 주요 기능

### 작업 화면 (VS Code 스타일)
- **활동 바와 사이드바**: 탐색기(소스 파일·회로 개요), 부품, HAL 예제, 보드·핀 설정, 실행 및 디버그(실행 환경 선택 포함), 장치 Docs. 아이콘은 끌어서 순서를 바꿀 수 있습니다.
- **편집기 영역**: 소스 탭이 있는 Monaco 코드 편집기와 회로 시뮬레이터 그룹. 위치 바꾸기, 가로/세로 분할, 최대화, 경계선 크기 조절을 지원하고 배치를 기억합니다.
- **하단 패널**: 문제 · 출력 · 터미널 · 직렬 모니터 · 파형 · 로직 분석기 · 빌드.
- **속성 패널(보조 사이드바)**: 선택한 핀·배선·부품의 속성과 실시간 전압·전류, 카메라 프레임 미리보기, SD 카드 파일 목록.
- **메뉴와 명령 팔레트**: 파일·편집·보기·실행·터미널·도움말 메뉴, Ctrl+Shift+P 명령 팔레트, Ctrl+P 파일 이동, Ctrl+B/J/Alt+B 패널 전환. 편집 메뉴에 설정과 단축키 설정이 있습니다.
- **코드 정렬**: 편집 → 코드 정렬(Alt+Shift+F). clangd가 없어도 내장 정렬기로 동작하고, `}`를 입력하면 그 블록을 바로 정렬합니다. 저장 시 자동 정렬도 설정할 수 있습니다.
- **단축키**: Ctrl+F5 실행, F10 디버그 시작, F11 한 줄 실행, Ctrl+F2 중지가 기본이며 **편집 → 단축키 설정**에서 모두 바꿀 수 있습니다.
- **상태 표시줄**: 실행 상태(실행 중에는 파란색), 실행 대상, 문제 수, 실행 시간, 최대 전류, 빌드 상태, 커서 위치, clangd.
- **테마**: 화면은 System 기본으로 태양/달 아이콘으로 Dark/White 전환(VS Code Modern 계열, WCAG AA 대비). 코드 colorscheme는 화면과 독립(Dark: Jellybeans, White: GitHub Light Default)이며 Monaco·VS Code JSON·Vim colorscheme를 등록할 수 있습니다.

### 펌웨어 에뮬레이터
- **Cortex-M4 코어**: ARMv7E-M Thumb/Thumb-2 전체, DSP·포화·병렬 연산, FPv4-SP 단정밀 FPU(반올림 모드·FMA·반정밀도 변환), 예외 진입/복귀·tail-chaining·NVIC 우선순위 선점·BASEPRI/PRIMASK, SysTick, DWT, ITM(SWV printf), WFI 슬립 시간 건너뛰기. QEMU와 바이트 단위로 대조 검증했습니다.
- **STM32F446 주변장치**: RCC/FLASH/PWR/SYSCFG/EXTI, GPIOA~H, TIM1~14(PWM·입력 캡처·엔코더), USART/UART 6개(비동기·동기), I²C1~3, SPI1~4, ADC1~3, DMA1/2(일반·순환·더블 버퍼), DCMI 카메라, SDIO/SPI SD 카드(FAT32), CAN1/2, IWDG/WWDG, RTC, CRC.
- **STM32F103 주변장치**: RCC(HSI/2·HSE PLL), FLASH, AFIO 리맵·EXTI, GPIOA~E(CRL/CRH), TIM1~4(16비트), USART1~3, I²C1/2, SPI1/2, ADC1/2(보정·온도센서), DMA1 채널 1~7, CAN1, IWDG/WWDG, CRC. F446RE용 HAL 예제는 F103RB 프로젝트에서 F1 클럭·핀 리맵·DMA 채널로 자동 이식됩니다(DCMI·I2S 예제 제외).
- **회로 연동**: GPIO·PWM·통신이 기존 빵판 회로와 장치 모델(LED, 버튼, LCD, OLED/TFT, 센서, 모터, 서보, 부저, 메모리 등)에 그대로 연결됩니다.
- **디버그**: ELF의 DWARF 줄 정보로 소스 줄 중단점, 한 줄/함수 안/밖 실행, 호출 스택, 전역 변수, 레지스터, 메모리, 감시식. HardFault는 원인을 한국어로 보여 줍니다.
- **ELF 열기**: CubeIDE 등에서 빌드한 ELF를 **파일 → 펌웨어 ELF 열기**로 바로 실행합니다.

### 회로 시뮬레이터 (C 인터프리터)
- **NVIC 선점**: `HAL_NVIC_SetPriority`·우선순위 그룹·BASEPRI/PRIMASK에 따라 높은 우선순위 인터럽트가 실행 중인 콜백을 중간에 선점합니다. 콜백 안 중단점과 ISR 표시가 있는 호출 스택을 지원합니다.
- **HAL DMA**: UART(ReceiveToIdle 포함)·ADC 스캔·SPI·I²C·TIM PWM DMA와 메모리 간 DMA, Half/Complete 콜백, 순환 모드. Pinout에서 DMA 설정과 `MX_DMA_Init` 생성을 지원합니다.
- **USART 동기 모드**: `HAL_USART_*`로 CK 클록을 내보내 시프트 레지스터형 장치를 구동합니다.
- **카메라·SD 카드**: OV2640 SCCB 설정에 맞는 프레임(컬러 바·움직이는 패턴·불러온 이미지)을 DCMI DMA로 받고, SD 카드는 프로젝트에 저장되는 FAT32 이미지와 FatFs API(`f_mount`, `f_open`, `f_printf` 등)로 동작합니다.

### 통신 파형과 잡음
- **로직 분석기**: UART TX/RX, I²C SDA/SCL, SPI SCK/MOSI/MISO/NSS, USART CK, 1-Wire를 비트 단위 파형으로 표시하고 바이트·ACK/NACK·오류를 해석합니다.
- **선로 잡음**: 비트 오류율·글리치·지터를 설정하면 수신기가 잡음 섞인 파형을 다시 샘플링해 프레이밍/패리티 오류, I²C NACK, 손상된 SPI 바이트가 실제로 발생합니다.

### 회로와 코드
- **회로 편집**: 빈 회로에서 보드 한 개와 빵판 여러 개(최대 8개)를 추가하고, 배선 20색·꺾임점·다중 선택·복제·복사/붙여넣기·무제한 배치 공간·커서 중심 확대를 사용합니다. 모든 장치는 가장자리를 끌어 크기를 조절합니다.
- **부품 113종(보드 제외)**: 저항·LED·버튼·LCD·OLED·TFT·LED 매트릭스·센서(TMP36, 초음파, LDR, NTC, SHT31, MPU6050, PIR 등)·서보·DC 모터·스테퍼·릴레이·L298N·수동 부저·카메라·SD 카드 등.
- **HAL 예제 127개**: 장치명·핀 수·인터페이스·함수명으로 검색하며 회로·배선·코드·핀 설정을 한 번에 적용하고 빵판에 자동 배치·배선합니다.
- **장치 Docs와 main.c 삽입**: 배선표, HAL 함수, 레지스터 예제를 확인하고 기존 `main.c`와 초기화 함수에 직접 삽입합니다(누락 배선·핀 보완, 사용자 코드 보존, 실행 취소).
- **Pinout & Configuration**: GPIO, EXTI, NVIC, UART/USART 6개(동기 모드 포함), I²C1, SPI1, ADC1, TIM2~5, DMA 설정과 HAL 초기화 코드 생성. `.ioc`·`main.c`·Cube 프로젝트 폴더 가져오기.
- **회로 검사**: 전원 단락·전원/GND 누락·신호 미연결·I²C 주소 중복·과전류를 찾아 위치로 이동합니다.
- **IDE 프로젝트**: 폴더 프로젝트 생성·열기, C/C++/H 파일 관리, clangd 의미 분석, ARM/Windows GCC Debug·Release 빌드, GDB 디버그, Windows 명령 프롬프트 터미널.
- **저장**: `.stm32lab` 파일과 프로젝트 폴더(저널·롤백으로 여러 파일을 원자적으로 저장), 자동 저장, 종료 직전 편집 보존, 실행 취소/재실행.
- **STM32 보드 여러 개**: NUCLEO-F446RE·F103RB를 한 회로에 4개까지 놓고 보드마다 `main.c`·핀 설정·소스를 따로 둡니다. 편집할 보드를 고르면 편집기·Pinout·빌드·디버그가 그 보드를 대상으로 하고, 실행 한 번에 모든 보드가 같은 회로에서 함께 동작합니다(GPIO·EXTI, 보드 간 UART, 펌웨어 에뮬레이터). 실물 보드는 보드마다 빌드해 각자의 ST-LINK에 차례로 기록합니다. [사용법](docs/IDE.md#stm32-보드-여러-개).
- **ESP32·라즈베리파이 보드와 강의 실습 예제**: STM32 옆에 NodeMCU-32S(ESP-32S)·ESP32 DevKit(WROOM-32)·Raspberry Pi 5를 놓고 배선합니다. ESP32는 빵판에 꽂힙니다. ESP32 스케치(`setup`/`loop`, GPIO 번호, ADC·LEDC PWM·Serial.printf·DHT·Wire 슬레이브)는 해석 실행하고, 라즈베리파이는 강의 예제의 **고정 실행**(예제 시나리오대로 핀·출력 재현)으로 STM32와 같은 시간축에서 동작합니다. 강의 회로도 10개와 회로가 있는 강의 과제 8개를 예제로 불러올 수 있고, 예제 목록은 Raspberry Pi · STM32 · ESP32로 나뉩니다. [사용법](docs/IDE.md#esp32라즈베리파이-보드와-강의-실습-예제)
- **자동 업데이트**: 포터블 EXE에서 GitHub Release의 새 버전을 확인·다운로드하고 해시 검증 후 교체합니다. [업데이트 사용법](docs/UPDATES.md).

자세한 사용법은 [IDE 사용법](docs/IDE.md), 지원 API는 [HAL API](docs/HAL-API.md), 에뮬레이터 구조는 [펌웨어 에뮬레이터](docs/architecture/EMULATOR.md)를 참고하세요.

## 빌드 방법

**Windows x64와 Node.js 24** 환경에서 실행합니다.

```powershell
git clone https://github.com/moonsyu/STM-Simulator.git
cd STM-Simulator
npm ci
node node_modules/electron/install.js
npm run build
npm run build:artifact
```

- 실행 파일: `outputs/artifact/STM-Simulator.exe` (고정 파일명)
- 개발 중 실행: `npm start`
- 빌드 중간 파일: `work/build/`, 검사 결과: `work/test-results/`

## 테스트

| 명령 | 내용 |
|---|---|
| `npm test` | 단위(회로·언어·HAL·프로젝트·Docs·설정·데스크톱), 인터프리터 확장, Cortex-M4 코어(QEMU 대조 결과), STM32F446·STM32F103 펌웨어 통합 테스트 |
| `npm run test:e2e` | 실제 Electron 앱: 작업 화면·레이아웃 저장, 예제 실행·측정·디버그, 저장/종료 복구, 테마 대비, 에뮬레이터(ELF 열기·UART·로직 분석기·디버거·ARM GCC 빌드) |
| `npm run test:toolchain` | ARM GCC와 STM32CubeF4·STM32CubeF1로 모든 예제를 두 보드에 대해 앱의 실제 빌드 경로로 컴파일·링크한 뒤 에뮬레이터에서 실행 (`ARM_GCC`, `STM32CUBE_F4_ROOT`, `STM32CUBE_F1_ROOT`, 선택 `EXAMPLES`) |
| `npm run test:release` | Windows 전용: 패키지 앱·업데이트 도우미(잠긴 EXE 교체·롤백)·포터블 EXE |
| `npm run build:fixtures` | 에뮬레이터 테스트용 ELF 재생성 (ARM GCC, 선택 QEMU) |

## 다운로드

**[최신 실행 파일 다운로드 — GitHub Releases](https://github.com/moonsyu/STM-Simulator/releases/latest)**

Releases의 **Assets**에서 `STM-Simulator-<버전>-Windows-x64.zip`을 받아 압축을 풀고 EXE를 실행하세요. Node.js 설치는 필요 없습니다. 회로 시뮬레이터와 ELF 에뮬레이션은 EXE만으로 사용할 수 있고, 실제 빌드·GDB·clangd 기능에는 각 개발 도구와 SDK가 필요합니다. 설치 방법은 [IDE 사용법](docs/IDE.md)을 확인하세요.

실물 NUCLEO-F446RE·NUCLEO-F103RB 빌드·실행에 필요한 ARM GCC·STM32CubeF4/F1·OpenOCD는 STM32CubeIDE가 없어도 됩니다. 앱을 처음 실행하면 빠진 도구를 알려 주고, **실행 및 디버그 → 개발 도구 → 필요한 도구 설치**로 바로 받을 수 있습니다(약 365 MB, 설치 후 약 1.6 GB).

## 권리 관련 안내

STM Simulator는 STMicroelectronics의 공식 제품이 아닌 개인 학습 프로젝트이며, ST의 후원·승인·제휴를 주장하지 않습니다. STM32, NUCLEO 등 제품명과 상표의 권리는 각 권리자에게 있습니다.

모든 자료의 권리 관계에 대한 법률 검토가 완료된 것은 아닙니다. **저작권·상표권·라이선스 등 권리 관련 문제 또는 법적 문제가 확인되는 경우, 해당 저장소를 삭제 조치하겠습니다.** 관련 문제는 [GitHub Issues](https://github.com/moonsyu/STM-Simulator/issues)를 통해 알려 주세요.

새 프로젝트는 HSI 16 MHz(F446RE) 또는 8 MHz(F103RB)에서 시작합니다. TIM 활성화 초기값은 CubeMX 기준 PSC=0, TIM2/5 ARR=4,294,967,295, TIM3/4 ARR=65,535, PWM Pulse=0입니다. 자세한 적용 범위는 [보드 기본값](docs/MCU-DEFAULTS.md)을 참고하세요.
