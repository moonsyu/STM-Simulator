# STM Simulator

STM Simulator는 **NUCLEO-F446RE 회로 시뮬레이터를 통합한 Windows 학습용 IDE**입니다. 프로젝트 생성, C/C++ 코드 작성, 실제 GCC 빌드·GDB 디버그와 빵판 회로 실습을 한 화면에서 진행합니다.

실행 대상에서 **회로 시뮬레이터**, **STM32 · ARM GCC**, **Windows · C/C++**를 선택합니다. 회로 시뮬레이터는 지원 HAL 소스를 회로 모델에 연결합니다. ARM 대상은 실제 ST HAL·CMSIS와 함께 ELF/BIN/HEX를 만들고 ST-LINK/GDB 서버로 실물 보드를 실행·디버그합니다. 컴파일된 ARM 펌웨어가 가상 빵판에서 실행되는 CPU 에뮬레이터는 포함하지 않습니다.

## 주요 기능

- **자동 업데이트**: Windows 포터블 EXE에서 GitHub의 새 정식 버전을 자동 확인·다운로드합니다. 상단 **업데이트 → 저장 후 재시작**으로 적용하며 회로와 코드를 먼저 저장합니다. 0.15.2 이하를 사용 중이면 이 기능이 포함된 EXE를 처음 한 번 직접 받아야 합니다. [업데이트 사용법과 게시 방법](docs/UPDATES.md).
- **이전 업데이트 실행 오류**: 0.16.1~0.17.0에서 도우미 실행 오류가 나타나면 최신 EXE를 한 번 직접 받아 실행하세요. 새 버전은 인코딩 명령줄을 중첩하는 대신 짧은 파일 실행 인자로 교체 도우미를 시작합니다.
- **공개 자동 업데이트 검증**: v0.17.1 → v0.17.2에서 자동 감지·다운로드·해시 검증·EXE 교체·새 앱 실행과 기존 코드·설정 보존을 확인했습니다. [실행 증거](https://github.com/moonsyu/STM-Simulator/releases/download/v0.17.2/UPDATE-VERIFICATION.md).
- **장치 크기 조절**: 시뮬레이터의 **장치 크기**에서 STM32 보드, 기본·추가 빵판과 35종 부품을 10~400%로 조절합니다. 보드 핀·빵판 구멍·장착 부품·배선 좌표가 함께 반영되며, 연결된 핀의 ID와 회로 계산은 유지됩니다.
- **IDE 설정과 테마**: 코드 패널의 **설정** 탭 또는 Ctrl+,에서 코드/화면/터미널 글꼴, 줄 높이, 들여쓰기, 줄 바꿈, 줄 번호, 미니맵, 괄호 색상을 설정합니다. GitHub 원본에서 변환한 Jellybeans와 STM Light를 제공하며 **Colorscheme 등록**으로 Monaco·VS Code JSON과 정적 Vim 파일을 추가·전환합니다. 테마 복사·색상 편집·삭제와 테마/전체 설정 내보내기를 지원합니다. IDE 설정은 회로 프로젝트와 별도로 저장합니다.
- **IDE 프로젝트**: 폴더 프로젝트 생성·열기, C/C++/H 파일 추가·이름 변경·삭제·저장, 파일 탐색기와 탭. Monaco 편집기의 구문 색상·괄호·접기·기본 자동 완성·함수 정의 이동. clangd 연결 시 의미 분석 오류, 멤버 자동 완성, 호버·정의·참조·함수 인수 안내·서식 정리.
- **실제 빌드와 디버그**: ARM/Windows GCC의 Debug·Release 컴파일·링크, ELF/BIN/HEX/MAP/EXE와 컴파일 데이터베이스, 파일·줄별 오류 이동. GDB 중단점·일시정지·계속 실행·함수 진입/복귀·한 줄 실행·스택·지역/전역 변수·감시식·레지스터·메모리. OpenOCD 자동 시작 또는 외부 GDB 서버 연결, 선택적으로 보드에 펌웨어 기록.
- **실행과 터미널**: Windows 프로그램 실행·출력·표준 입력, 프로젝트 위치에서 명령 프롬프트 시작·명령 입력·종료. 개발 도구 경로 자동 검색·검사·저장.
- **패널 배치**: 프로젝트·코드·시뮬레이터·터미널 모두 가로·세로 크기 조절과 위치 이동, 접기·최대화·배치 저장. 기존 코드·시뮬레이터·터미널의 고정 최소 크기 제한을 제거했습니다. [IDE 사용법과 단축키](docs/IDE.md)를 참고하세요.
- **회로 편집**: 보드 핀 검색, 부품명·종류 검색, 세로 스크롤 부품 목록, 빵판 배선, 부품 배치·회전·속성 변경. 저항·LED·버튼·LCD·UART 터미널·메모리·센서와 추가 빵판 등 35종 부품 지원. 배선과 구멍이 겹치면 배선 우선 선택. 더블클릭으로 배선 꺾임점 추가·끌어서 이동·우클릭 삭제, Shift+클릭 다중 선택과 Ctrl+C/V 복사, 연결망 전체 강조.
- **보드 선택**: 보드명·MCU 이름 검색 및 선택. 현재 NUCLEO-F446RE 한 종류를 지원하며, 기본 상태에서 변경된 작업은 보드 초기화 전에 확인.
- **추가 빵판**: 400홀 빵판 추가·이동·회전·삭제. 각 빵판의 행과 전원 레일을 독립적으로 계산하며 장착한 부품과 배선이 함께 이동.
- **핀 및 주변장치 설정**: GPIO, EXTI, NVIC, UART/USART 6개, I²C1, SPI1, ADC1, TIM2·3·4·5 설정. UART/USART는 STM32F446RE에서 사용 가능한 TX/RX 핀을 선택하고 충돌을 검사.
- **main.c 이식**: 생성 코드에 HSI PLL 클록·GPIO·주변장치 초기화와 SWV 출력 연결을 포함하고 `main.c` 저장 지원. 같은 핀·주변장치·NVIC 환경의 CubeIDE 프로젝트에 옮겨 사용. 기본 코드와 장치 Docs의 HAL·레지스터 예제를 정식 ST HAL·ARM GCC로 컴파일·링크 검증했으며, 실물 보드 실행 검증은 별도.
- **타이머**: TIM2·5 32비트, TIM3·4 16비트 카운터와 주기 인터럽트, 독립 PWM, 입력 캡처, 직교 엔코더 TI1/TI2/TI12. 서보 50 Hz + DC 모터 1 kHz, 입력 캡처 주파수 측정, 타이머 엔코더 HAL 예제 제공.
- **회로 오류 추적**: 회로 검사 탭에서 전원 단락·전원/GND 누락·신호 미연결·I²C 주소 중복·과전류를 확인하고 해당 핀이나 부품으로 이동.
- **HAL 소스 실행**: `.ioc`, `main.c`, 사용자 `.c/.h` 및 Cube 프로젝트 폴더 가져오기. 핀 설정에 맞는 HAL 초기화 코드 생성. GPIO·UART 송수신·인터럽트·타이머·PWM·ADC·I²C·SPI 실행.
- **센서·입력 부품**: TMP36·초음파 외 LDR 조도, NTC 온도, SHT31 온습도, MPU6050 가속도·자이로, PIR 움직임, 조이스틱, 로터리 인코더. 실행 중 환경·축·회전·버튼 값을 조절하고 ADC·I²C·EXTI로 확인.
- **화면·구동 부품**: LCD·7세그먼트 외 SSD1306 OLED, ST7735 컬러 TFT, MAX7219 LED 매트릭스의 실제 수신 픽셀 표시. RC 서보, PWM DC 모터, 4상 스테퍼, COM/NO/NC 접점 릴레이 모듈.
- **L298N 모터 드라이버**: 외부 DC 전원(6~24 V)과 별도 2핀 DC 모터를 배선하는 듀얼 H 브리지. `HAL · L298N 듀얼 DC 모터 제어` 예제에서 두 모터의 독립 PWM 속도·정역회전·제동·자유 정지를 확인합니다. VM 외부 12 V, 논리 5 V와 공통 GND를 구성하며 전원 누락·논리 레벨·과전류를 진단합니다.
- **수동 부저**: 2핀 피에조 부저의 PWM·GPIO 사각파 주파수(20~2000 Hz)와 듀티를 표시하고 음높이를 재현. DC·0%·100% 듀티는 무음. `HAL · 수동 부저 PWM 멜로디` 예제를 선택하면 PA0(TIM2 CH1)–부저–GND 회로와 도레미파솔라시도 코드를 구성하며, 상단 **소리 켜짐**으로 들을 수 있습니다. PWM 파형은 예제에서 자동으로 켜집니다.
- **HAL 예제 39개**: 현재 구현된 35종 부품을 모두 다루며 LCD 1602·가변저항·슬라이드 스위치·RGB LED·다이오드·능동 부저·7세그먼트 예제를 포함합니다. 선택 즉시 회로·배선·코드·핀 설정을 함께 구성하며 측정값·전송 상태·제어 명령을 로그에 표시.
- **장치 Docs**: 선택 장치의 개요·배선표·HAL 함수·레지스터 예제를 확인합니다. 현재 코드에 예제를 연결하고 핀 활성화·누락 배선·오접속을 보완하며 실행 취소를 지원합니다. 레지스터 예제는 HAL 초기화와 함께 ARM 빌드 대상으로 적용됩니다. [사용법과 지원 범위](docs/DEVICE-DOCS.md).
- **실행 결과 확인**: `printf`와 UART TX/RX 로그, 4채널 파형, CSV 내보내기, 핀 전압·부품 전류 측정, 전원 단락·과전류 경고.
- **작업 저장 및 편집**: `.stm32lab` 파일 저장·불러오기, 자동 저장, 실행 취소·재실행. Ctrl+F로 현재 파일에서 찾기, Ctrl+R로 하나씩 또는 전체 바꾸기, 대소문자 구분과 검색 결과 이동. F5로 시뮬레이션 시작·정지·계속 실행.

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

- 실행 파일: `outputs/artifact/STM-Simulator-<버전>-win-x64.exe`
- 실행 파일과 라이선스 고지를 포함한 배포 묶음: `outputs/artifact/`
- 빌드 중간 파일: `work/build/`, 검사 결과: `work/test-results/`
- 개발 중 실행: `npm start`
- 검증: `npm test`, `npm run test:ui`
- 네이티브 IDE 검증: 개발 도구 설치 후 `npm run test:native`, `npm run test:native:ui`. ARM GDB 원격 검증은 QEMU 설치 후 `npm run test:arm-gdb` (`QEMU_ARM` 경로).
- IDE 검증: `node --test tests/ide.test.js`, `npm run test:ide:ui`
- L298N만 검증: `npm run test:l298n`, `npm run test:l298n:ui`
- 수동 부저만 검증: `npm run test:passive-buzzer`, `npm run test:passive-buzzer:ui`
- 실제 ARM 컴파일·링크 검사: ARM GCC와 STM32CubeF4 설치 후 `npm run test:main-c`. 패키지 위치가 다르면 `STM32CUBE_F4_ROOT`, 컴파일러 위치는 `ARM_GCC`로 지정.

빌드 전에 이전 실행 파일과 생성 폴더를 자동 정리합니다. 앱이 실행 중이면 종료한 뒤 다시 빌드하세요.

`npm ci`와 `npm run build`는 편집기·워커를 로컬 파일로 묶습니다. 앱을 사용할 때 편집기를 인터넷에서 불러오지 않습니다.

## 다운로드

**[최신 실행 파일 다운로드 — GitHub Releases](https://github.com/moonsyu/STM-Simulator/releases/latest)**

Releases의 **Assets**에서 `STM-Simulator-<버전>-Windows-x64.zip`을 받아 압축을 풀고 EXE를 실행하세요. 실행할 때는 Node.js 설치가 필요 없습니다. 회로 시뮬레이션은 EXE만으로 사용할 수 있습니다. **실제 빌드·GDB·clangd 기능에는 각 개발 도구와 SDK가 별도로 필요합니다.** 설정·설치 방법은 [IDE 사용법](docs/IDE.md)을 확인하세요. ZIP에는 실행 파일, 라이선스 고지와 체크섬이 포함됩니다.

[GitHub Actions 빌드](https://github.com/moonsyu/STM-Simulator/actions/workflows/build-windows.yml)에서도 성공한 실행의 **Artifacts → STM-Simulator-Windows-x64**를 받을 수 있습니다. `BUILD-INFO.json`에서 빌드 커밋과 실행 링크를 확인할 수 있으며, 릴리즈는 해당 버전의 성공한 빌드 결과를 게시합니다.

## 권리 관련 안내

STM Simulator는 STMicroelectronics의 공식 제품이 아닌 개인 학습 프로젝트이며, ST의 후원·승인·제휴를 주장하지 않습니다. STM32, NUCLEO 등 제품명과 상표의 권리는 각 권리자에게 있습니다.

모든 자료의 권리 관계에 대한 법률 검토가 완료된 것은 아닙니다. **저작권·상표권·라이선스 등 권리 관련 문제 또는 법적 문제가 확인되는 경우, 해당 저장소를 삭제 조치하겠습니다.** 관련 문제는 [GitHub Issues](https://github.com/moonsyu/STM-Simulator/issues)를 통해 알려 주세요.

새 프로젝트는 HSI 16 MHz에서 시작합니다. TIM 활성화 초기값은 CubeMX 기준 PSC=0, TIM2/5 ARR=4,294,967,295, TIM3/4 ARR=65,535, PWM Pulse=0입니다. 기존 저장값과 예제의 84 MHz 설정은 유지됩니다. 자세한 적용 범위는 [보드 기본값](docs/MCU-DEFAULTS.md)을 참고하세요.
