# STM Simulator

STM Simulator는 **NUCLEO-F446RE 보드와 400홀 빵판에서 STM32 회로와 HAL C 코드를 실습하는 Windows 데스크톱 프로그램**입니다. 부품을 배치하고 배선을 연결한 뒤 코드 실행 결과를 전압·전류·로그·파형으로 확인할 수 있습니다.

지원하는 HAL API를 회로 모델에 연결해 실행합니다. 전체 ST HAL 라이브러리를 빌드하거나 ARM 명령·ELF/BIN 펌웨어를 실행하는 방식은 아닙니다.

## 주요 기능

- **회로 편집**: 보드 핀 검색, 부품명·종류 검색, 세로 스크롤 부품 목록, 빵판 배선, 부품 배치·회전·속성 변경. 저항·LED·버튼·LCD·UART 터미널·메모리·센서와 추가 빵판 등 31종 부품 지원. 배선과 구멍이 겹치면 배선 우선 선택. 더블클릭으로 배선 꺾임점 추가·끌어서 이동·우클릭 삭제, Shift+클릭 다중 선택과 Ctrl+C/V 복사, 연결망 전체 강조.
- **보드 선택**: 보드명·MCU 이름 검색 및 선택. 현재 NUCLEO-F446RE 한 종류를 지원하며, 기본 상태에서 변경된 작업은 보드 초기화 전에 확인.
- **추가 빵판**: 400홀 빵판 추가·이동·회전·삭제. 각 빵판의 행과 전원 레일을 독립적으로 계산하며 장착한 부품과 배선이 함께 이동.
- **핀 및 주변장치 설정**: GPIO, EXTI, NVIC, UART/USART 6개, I²C1, SPI1, ADC1, TIM2·3·4·5 설정. UART/USART는 STM32F446RE에서 사용 가능한 TX/RX 핀을 선택하고 충돌을 검사.
- **main.c 이식**: 생성 코드에 HSI PLL 클록·GPIO·주변장치 초기화와 SWV 출력 연결을 포함하고 `main.c` 저장 지원. 같은 핀·주변장치·NVIC 환경의 CubeIDE 프로젝트에 옮겨 사용. 기본 코드와 30개 예제를 정식 ST HAL·ARM GCC로 컴파일·링크 검증했으며, 실물 보드 실행 검증은 별도.
- **타이머**: TIM2·5 32비트, TIM3·4 16비트 카운터와 주기 인터럽트, 독립 PWM, 입력 캡처, 직교 엔코더 TI1/TI2/TI12. 서보 50 Hz + DC 모터 1 kHz, 입력 캡처 주파수 측정, 타이머 엔코더 HAL 예제 제공.
- **회로 오류 추적**: 회로 검사 탭에서 전원 단락·전원/GND 누락·신호 미연결·I²C 주소 중복·과전류를 확인하고 해당 핀이나 부품으로 이동.
- **HAL 소스 실행**: `.ioc`, `main.c`, 사용자 `.c/.h` 및 Cube 프로젝트 폴더 가져오기. 핀 설정에 맞는 HAL 초기화 코드 생성. GPIO·UART 송수신·인터럽트·타이머·PWM·ADC·I²C·SPI 실행.
- **센서·입력 부품**: TMP36·초음파 외 LDR 조도, NTC 온도, SHT31 온습도, MPU6050 가속도·자이로, PIR 움직임, 조이스틱, 로터리 인코더. 실행 중 환경·축·회전·버튼 값을 조절하고 ADC·I²C·EXTI로 확인.
- **화면·구동 부품**: LCD·7세그먼트 외 SSD1306 OLED, ST7735 컬러 TFT, MAX7219 LED 매트릭스의 실제 수신 픽셀 표시. RC 서보, PWM DC 모터, 4상 스테퍼, COM/NO/NC 접점 릴레이 모듈.
- **HAL 예제 30개**: GPIO·통신·타이머·ADC 예제와 새 부품 14종의 예제를 제공. 선택 즉시 회로·배선·코드·핀 설정을 함께 구성하며 측정값·전송 상태·제어 명령을 로그에 표시.
- **실행 결과 확인**: `printf`와 UART TX/RX 로그, 4채널 파형, CSV 내보내기, 핀 전압·부품 전류 측정, 전원 단락·과전류 경고.
- **작업 저장 및 편집**: `.stm32lab` 파일 저장·불러오기, 자동 저장, 실행 취소·재실행, 코드 편집기 너비 조절. F5로 시뮬레이션 시작·정지.

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

- 실행 파일: `dist/STM-Simulator-<버전>-win-x64.exe`
- 실행 파일과 라이선스 고지를 포함한 배포 묶음: `dist/artifact/`
- 개발 중 실행: `npm start`
- 검증: `npm test`, `npm run test:ui`
- 실제 ARM 컴파일·링크 검사: ARM GCC와 STM32CubeF4 설치 후 `npm run test:main-c`. 패키지 위치가 다르면 `STM32CUBE_F4_ROOT`, 컴파일러 위치는 `ARM_GCC`로 지정.

빌드 전에 이전 실행 파일과 생성 폴더를 자동 정리합니다. 앱이 실행 중이면 종료한 뒤 다시 빌드하세요.

## 다운로드

**[최신 실행 파일 다운로드 — GitHub Releases](https://github.com/moonsyu/STM-Simulator/releases/latest)**

Releases의 **Assets**에서 `STM-Simulator-<버전>-Windows-x64.zip`을 받아 압축을 풀고 EXE를 실행하세요. 실행할 때는 Node.js 설치가 필요 없습니다. ZIP에는 실행 파일, 라이선스 고지와 체크섬이 포함됩니다.

현재 저장소는 비공개이므로 다운로드하려면 GitHub 로그인과 저장소 접근 권한이 필요합니다.
