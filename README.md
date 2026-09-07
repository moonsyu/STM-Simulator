# STM Emulator

NUCLEO-F446RE 보드와 400홀 빵판을 연결하고 GPIO 스케치를 실행하는 Windows 데스크톱 회로 실습 앱입니다.

## 편집기 너비 / UART·USART 핀 활성화

- 회로와 **코드 / 속성·측정** 사이의 세로 경계선을 드래그해 패널 너비를 조절합니다. 너비는 로컬에 저장되며 두 번 클릭하면 기본값 440px로 돌아갑니다. 경계선에 포커스를 둔 뒤 방향키(20px), Shift+방향키(50px), Home/End도 사용할 수 있습니다.
- F446RE LQFP64의 USART1/2/3/6, UART4/5를 켜면 사용 가능한 TX/RX를 자동 배정합니다. 실제 대체 핀만 선택할 수 있고 다른 용도의 핀은 덮어쓰지 않습니다. 비활성화하면 해당 핀과 IRQ를 해제합니다.
- 포트별 HAL 핸들, AF7/AF8, baud, NVIC와 독립 송수신을 지원합니다. 하단 통신 탭에서 입력할 포트를 선택합니다. 지원 모드는 비동기 8N1입니다.

## Pinout & Configuration / HAL 소스

- 왼쪽 **Pinout & Configuration**에서 GPIO/EXTI와 UART/USART 6개·I²C1·SPI1·ADC1·TIM2 핀을 활성화하고 pull·AF·NVIC·주변장치 설정을 구성합니다.
- `.ioc`와 `main.c` 및 필요한 `.c/.h`를 가져오거나 Cube 프로젝트 폴더를 선택합니다. 소스 파일을 전환해 편집하고, 설정에서 HAL 초기화 코드를 생성할 수 있습니다.
- `main(void)`에서 HAL GPIO, UART blocking/IT, EXTI callback, TIM2 주기/PWM, ADC, I²C/SPI 메모리 전송을 회로와 연결해 실행합니다. HAL 예제 7개가 포함됩니다.
- HAL 모드는 **구현된 HAL API를 회로 모델에 연결하는 소스 인터프리터**입니다. ST HAL 드라이버 전체를 컴파일하는 환경이나 ELF/BIN 실행기는 아닙니다. 지원 함수·문법·타이밍 제한은 [HAL API](docs/HAL-API.md)를 확인하세요.
- 기존 스케치와 회로 파일을 유지합니다. HAL 소스·핀 설정도 `.stm32lab`에 함께 저장합니다.

빠른 시작: **HAL 예제 선택 → HAL · UART 수신 인터럽트 → 시뮬레이션 시작 → 통신 탭에서 입력**. 직접 설정할 때는 핀과 NVIC를 지정하고 **설정으로 HAL 코드 생성**을 누르세요. `HAL · …`로 표시한 7개 예제는 HAL API를 사용합니다. 기존 스케치 예제는 `setup/loop` 환경이며, HAL ADC/I²C/SPI 예제의 `Serial.println`은 결과 확인용 시뮬레이터 로그입니다.

**개발 이어가기:** [작업 인계 문서 — 구현 현황·코드 구조·검증·남은 작업](https://github.com/moonsyu/STM-Emulator/blob/main/HANDOFF.md)

STMicroelectronics와 제휴·후원 관계가 없는 비공식 학습용 프로젝트입니다. 권리 확인이 끝나지 않은 참고 자료가 있어 저장소는 **Private**으로 운영합니다. [저작권·상표 검토 결과](docs/COPYRIGHT-REVIEW.md)를 확인하세요.

## EXE 다운로드 / 실행

**[Windows EXE 빌드·다운로드 열기](https://github.com/moonsyu/STM-Emulator/actions/workflows/build-windows.yml)**

1. 위 링크에서 초록색 체크가 있는 최신 **Build Windows EXE** 실행을 선택하세요.
2. 실행 화면 아래 **Artifacts → STM-Emulator-Windows-x64**를 눌러 ZIP을 다운로드하세요. 빌드 Summary의 **Download EXE bundle** 링크로도 받을 수 있습니다.
3. ZIP을 풀고 `STM-Emulator-<버전>-win-x64.exe`를 실행하세요. 로컬 개발 버전은 0.5.1이며 원격 Artifact는 해당 실행의 버전을 확인하세요.

**Windows x64용**이며 별도 Node.js 설치가 필요 없습니다. 첫 화면의 **시뮬레이션 시작** 버튼으로 LED 깜빡이기 예제를 실행합니다. macOS/Linux용 실행파일은 현재 제공하지 않습니다. 코드 서명 인증서는 적용하지 않았습니다.

Private 저장소이므로 GitHub 로그인과 저장소 읽기 권한이 필요합니다. Artifacts는 90일 보관하며, 만료되면 해당 Actions 페이지의 **Run workflow**로 다시 빌드할 수 있습니다(실행 권한 필요). 다운로드 방법은 [GitHub 공식 안내](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)를 참고하세요.

ZIP에는 EXE, `SHA256.txt`, `BUILD-INFO.json`, README와 제3자 라이선스 고지가 들어 있습니다. 라이선스 고지도 함께 보관하세요. 체크섬은 PowerShell의 `Get-FileHash .\STM-Emulator-*-win-x64.exe -Algorithm SHA256` 결과와 비교할 수 있습니다. `BUILD-INFO.json`에서 빌드한 커밋과 Actions 실행 링크를 확인할 수 있습니다. 로컬 실행 묶음은 `dist/artifact/`에 최신 결과만 유지합니다.

## 회로·통신 실습

- LCD 1602의 4/8비트 명령·문자 출력·커서·사용자 문자.
- UART 터미널, I²C 메모리, SPI 메모리 부품과 전원·배선 기반 송수신. **총 16종 부품**입니다.
- 사용자 함수·배열·구조체·범위 검사 포인터, for/do 반복문, 비트 연산.
- Timer 콜백, GPIO 에지 인터럽트, ADC/PWM 배열 전송용 DMA 모델.
- 4채널 파형, 평균/PWM 전환, 0.1~20 ms 계산 간격, CSV 저장.

왼쪽 **LCD · 통신 · 파형 실습**에서 9가지 기능 예제를 여세요. 하단 **로그 / 파형 / 통신** 탭으로 동작을 확인할 수 있습니다. [스케치 API와 모델 범위](docs/SKETCH-API.md)에 함수·기본 핀·제약을 정리했습니다.

## 사용

1. 보드 핀 또는 빵판 구멍을 클릭한 다음 다른 연결점을 클릭하면 점퍼선이 연결됩니다.
2. 저항·LED·커패시터·다이오드·부저는 구멍 두 곳을 클릭해 설치합니다. LED·다이오드는 첫 점이 A, 두 번째가 K이며 부저는 +, − 순서입니다. 빈 공간 클릭으로 자유 배치할 수도 있습니다.
3. 다핀 부품은 추가 버튼을 누르면 모형이 생깁니다. 모형을 끌어서 모든 다리에 초록색 표시가 나타나는 위치에 놓으세요. 필요하면 90°/270°로 세워 각 다리를 서로 다른 행에 넣으세요. 한 행 A–E 또는 F–J에 여러 신호 다리를 꽂으면 내부적으로 단락됩니다.
4. 부품을 선택하면 오른쪽에서 값을 바꿀 수 있습니다. `R` 또는 회전 버튼은 매번 45°씩 회전합니다. 드래그·회전 시 다리가 맞는 위치에 다시 장착되며, 맞지 않으면 자유 배치 상태가 됩니다. 이미 다른 부품이 꽂힌 구멍에는 중복 장착하지 않습니다.
5. 코드를 작성하고 실행하세요. 실행 중 버튼은 누르는 동안 연결됩니다. 핀·부품을 선택하면 전압·전류를 측정합니다.
6. **파일 저장**으로 `.stm32lab` 파일을 만들고 **불러오기**로 다시 엽니다. 마지막 작업 회로는 앱의 로컬 저장소에도 자동 저장합니다.
7. 보드 핀 검색에 `PC 13`, `PA 8`, `D13` 등을 입력하세요. 공백과 대소문자를 무시하며 같은 GPIO의 Arduino·Morpho 위치를 함께 표시합니다. 결과 클릭 또는 Enter로 해당 핀을 확대하고 **선택한 물리 핀 하나를 파란 표식·핀 이름으로 강조**합니다. 목록의 선택 행도 함께 표시되며 다른 검색 결과는 노란색으로 남습니다.
8. 왼쪽 아래 **부품별 실행 예제**에서 추가 부품 12종 각각의 완성 회로와 코드를 열 수 있습니다. 실행 중 가변저항·스위치·온도·거리를 오른쪽 속성에서 바꾸세요. 능동 부저 소리는 상단 **소리 꺼짐** 버튼을 눌러 켭니다.

단축키: `W` 배선, `V` 선택, `Esc` / `Delete` 선택한 부품·배선 삭제, `R` 45° 회전, `Ctrl+Z` 취소, `Ctrl+Y` 재실행, `Ctrl+S` 파일 저장. 연결 중 Esc는 연결 취소이며, 코드·입력칸 편집 중에는 부품을 삭제하지 않습니다. 마우스 휠로 확대하고 빈 공간을 끌어 이동합니다.

배선은 초록·빨강·검정·보라·파랑·노랑·주황·분홍·갈색·흰색 10가지를 제공합니다. 배선을 선택한 뒤 색을 누르면 기존 선의 색도 변경됩니다. 빵판 구멍과 겹친 부품 몸체는 구멍보다 먼저 선택됩니다.

회로 파일은 JSON 스키마 version 2를 사용하며, version 1 파일과 자동 저장도 읽어 변환합니다. 기존 버튼의 두 연결점은 유지하며, 새로 추가하는 버튼은 네 다리를 모두 장착합니다. 새 부품·문법·시뮬레이션 설정을 사용하는 회로는 구형 앱에서 동일하게 동작하지 않을 수 있습니다.

## 추가 부품 12종

| 부품 | 동작 및 조절 |
|---|---|
| UART 터미널 | 4핀, 기본 9600 baud. TX/RX를 교차 연결하고 Serial1 송수신. 하단 통신 탭으로 입력 |
| I²C 메모리 | 4핀, 기본 0x50, 256바이트 RAM. 내장 풀업, 주소·ACK/NACK·순차 읽기/쓰기 |
| SPI 메모리 | 6핀, 256바이트 RAM. CS 제어 및 0x02 쓰기/0x03 읽기 명령 |
| 가변저항 | 3핀, 기본 10 kΩ. 1–3 전체 저항과 2번 가변 접점, 0–100% 위치를 조절하며 부하까지 반영한 분압 계산 |
| 슬라이드 스위치 | 3핀 SPDT. COM↔A/B 연결 유지. 실행 중 몸체 클릭 또는 속성으로 전환 |
| RGB LED | R/K/G/B 4핀 공통 음극. 채널별 전류와 혼합색 표시, 외부 직렬 저항 필요 |
| 커패시터 | 비극성 2핀, 0.001–100,000 µF. 초기 0 V에서 선택한 0.1~20 ms 간격의 RC 충·방전 |
| 다이오드 | A/K 2핀. 순방향 0.7 V와 1 Ω 동적 저항, 역방향 차단 모델 |
| 능동 부저 | +/− 2핀. 2 V 이상 동작, 1 kΩ 부하 모델. 2.3 kHz 합성음 켜기/끄기 |
| 7세그먼트 | 10핀 공통 음극, a–g와 dp의 독립 점등. K1/K2 내부 연결, 각 세그먼트에 저항 필요 |
| 온도 센서 | TMP36 전달식, −40~125°C 조절. 유효 전원 2.7–5.5 V일 때 VOUT = 0.5 + 0.01 × °C |
| 초음파 센서 | HC-SR04 프로토콜 모델, 2–400 cm 조절. 5 V 전원, 10 µs 이상 TRIG 후 ECHO에서 `pulseIn(pin, HIGH, timeout)` 결과 = cm × 58 µs |

## 구현한 범위

- 보드 핀 108개: Morpho CN7/CN10, Arduino CN5/CN6/CN8/CN9. Arduino 이름과 MCU 포트 이름은 같은 전기적 노드로 처리합니다.
- 정확히 400개인 빵판 구멍: 30행 × 10개 일반 구멍, 4개 전원 레일 × 25개 구멍.
- 같은 행 A–E와 F–J 각각 연결, 중앙 홈 양쪽 분리. 각 전원 레일은 세로 전체가 연결되어 있으며 네 레일은 독립적입니다.
- 저항, LED(빨강·초록·파랑·노랑), 4핀 순간 버튼. 버튼 A1–A2와 B1–B2는 각각 내부 연결이며, 누를 때 두 쪽이 연결됩니다.
- LCD 1602의 16핀 배치·배선과 명령·문자 출력. VSS/VDD/VO/RS/RW/E/DB0–DB7/A/K 단자에 배선을 연결할 수 있습니다.
- GPIO 출력/입력/풀업/풀다운, 12비트 ADC 값, 평균 전압 또는 시간별 HIGH/LOW 방식 PWM.
- 저항 및 LED DC 해석, 전원 단락 시 정지, GPIO·LED 과전류 및 저항 전력 경고.
- LED, 외부 버튼, 전압 분배 예제.
- 코드 실행 시간, Serial 텍스트 출력, 전압·전류 측정, 실행 취소·재실행, 프로젝트 파일 저장.

## 코드 문법

이 앱은 **GPIO 스케치 일부를 자체 인터프리터로 실행**합니다. 일반 C/C++ 컴파일러 또는 ARM CPU 에뮬레이터가 아닙니다.

```cpp
void setup() {
  pinMode(D13, OUTPUT);  // PA5와 동일
}

void loop() {
  digitalWrite(D13, HIGH);
  delay(500);
  digitalWrite(D13, LOW);
  delay(500);
}
```

기존 GPIO·시간·Serial API에 LiquidCrystal, Serial1, Wire, SPI, Timer, GPIO 인터럽트, DMA를 추가했습니다. 사용자 함수·배열·구조체·단일 포인터·for/while/do 반복문을 지원하며, 실행 및 메모리 사용 한도와 인덱스·포인터 유효성 검사를 적용합니다.

외부 헤더를 컴파일하는 방식은 아니며 허용된 include는 내장 API를 사용한다는 표시입니다. 일반 C/C++ 전체의 자료형·문법·ABI와 일치하지 않습니다. 정확한 지원 함수와 인수는 [스케치 API](docs/SKETCH-API.md)를 확인하세요.

## 모델의 한계

- LCD는 쓰기 측 명령·ASCII·사용자 문자 8개를 지원합니다. busy-flag 읽기, 모든 폰트 ROM과 전원 상승 시퀀스는 미지원입니다.
- 부품 회전은 45° 간격입니다. 모든 다리가 빈 구멍에 맞을 때만 장착하며 접점은 구멍의 정확한 좌표를 사용합니다. 시각적 다리 굽힘을 허용하는 배치 모델로, 실제 부품의 기계 치수·충돌 전체를 검증하는 CAD는 아닙니다.
- **CubeIDE에서 만든 ELF/BIN 펌웨어는 실행할 수 없습니다.** Cortex-M4 명령과 STM32 주변장치 레지스터를 에뮬레이션하지 않습니다. HAL 소스 모드의 API 일부와 기존 스케치 API를 지원하며 전체 HAL/주변장치 재현은 아닙니다.
- 화면은 약 20 ms마다 갱신하고, 회로는 선택한 0.1~20 ms 간격과 GPIO 전환 시점에 계산합니다. 실제 MCU 클록 또는 명령 실행 시간과 일치하지 않습니다. PWM 파형 모드는 기본 꺼짐이며 파형 탭에서 켤 수 있습니다.
- UART/I²C/SPI는 트랜잭션 모델입니다. UART 8N1 수신 바이트 시간과 I²C/SPI 전송 시간은 반영하지만, 각 통신선의 비트 에지·노이즈·중재·clock stretching·SPI 모드 전체는 미지원입니다. 타이머·DMA 콜백도 실제 CPU 선점/주변장치 우선순위 모델은 아닙니다.
- 커패시터는 후진 오일러 방식이며 매우 짧은 RC 시정수·고속 펄스의 정밀 파형에는 적합하지 않습니다. 실행 중 같은 시간의 전압을 반복해서 읽어도 충전 시간이 추가로 진행되지 않습니다.
- TMP36 출력은 100 Ω 출력 저항으로 단순화했습니다. HC-SR04는 전원과 연결, TRIG 호출 간격을 검사하는 모델입니다. `delayMicroseconds`는 스케치의 펄스 간격을 기록하고 `pulseIn(HIGH)`는 준비된 ECHO의 길이를 반환합니다. µs 단위 CPU 실행, 실제 대기 시간, 임의 GPIO의 펄스 측정, 센서 노이즈·재질·반사 환경은 구현하지 않습니다. 이 버전의 `pulseIn`은 ECHO와 입력 핀이 도선으로 같은 노드에 연결되어야 하며 저항 분압을 거친 펄스 측정은 지원하지 않습니다. ECHO는 5 V 모델입니다.
- LED는 고정 순방향 전압과 12 Ω 동적 저항을 사용하며 GPIO 출력 저항은 40 Ω로 단순화합니다. 이 값들은 학습용 모델이며 칩 전기적 특성의 보증값이 아닙니다.
- 전원은 USB가 공급되는 상태로 모델링합니다. 3.3 V/5 V 등 전원 핀은 이상적 전압원이고 VIN/E5V/VBAT 전원 공급, 실제 점퍼·솔더 브리지·ST-LINK 동작은 구현하지 않았습니다. A4/A5는 기본 PC1/PC0 매핑입니다.
- 보드 USER 버튼의 PC13 입력과 LD2/PA5 표시는 동작 모델입니다. 보드 전체 회로의 모든 수동소자 부하를 계산하지 않습니다.
- LED 전류, 소비 전력과 경고는 모델 계산 결과입니다. 코일, 반도체 항복, 온도에 따른 부품 특성 변화, 실제 부품 손상은 계산하지 않습니다. 센서 온도는 사용자가 지정하는 환경 입력값입니다.

## 개발 / 빌드

Node.js 22.12 이상이 필요합니다. 현재 검증 환경은 Node.js 24.18.0입니다.

```powershell
npm ci
node node_modules/electron/install.js
npm start
npm test
npm run test:ui
npm run build
npm run build:artifact
```

EXE는 `dist/`에, 다운로드 묶음은 `dist/artifact/`에 생성됩니다. `build:artifact`는 버전·참고 이미지 제외·Electron/Chromium 라이선스 원문 보존을 검사합니다. `dist/artifact/`가 비어 있지 않으면 중단하므로 재생성 전에 해당 생성 결과를 지웁니다. 과거 소스와 문서는 Git 이력으로 관리하며, 버전별 백업 폴더·이전 EXE·검증 문서 사본을 남기지 않습니다. 현재 검증은 [VERIFICATION.md](docs/VERIFICATION.md)에 갱신합니다.

GitHub Actions는 `main`에 push하거나 수동 실행할 때 Windows에서 의존성 설치 → 회로 모델 테스트 → EXE 빌드 → 패키지 검사 → Artifact 업로드를 수행합니다. 소스 저장소에 대용량 EXE나 `node_modules`를 커밋하지 않습니다. 워크플로 정의는 [build-windows.yml](.github/workflows/build-windows.yml)입니다.

`npm run dev:web`은 개발 확인용 로컬 웹 서버를 `http://127.0.0.1:4173`에 띄웁니다. 데스크톱 앱은 웹 서버 없이 동작합니다.

UI 검증은 `npm run test:ui`로 편집·부품·통신·HAL·레이아웃 등 6개 스크립트를 실행합니다. `PLAYWRIGHT_MODULE` 환경 변수로 별도 설치된 Playwright 패키지 경로를 지정할 수 있습니다. `LAB_EXE`는 패키징된 `win-unpacked` 앱 본체 경로입니다. 단일 EXE 검증은 `node scripts/portable-smoke.cjs`입니다. 결과는 `test-results/`의 동일 파일에 최신 실행 결과로 갱신하고 테스트 전용 프로필은 검증 후 제거합니다.

구조: `src/pins.js` 핀 좌표와 검색, `src/components.js` 부품 다리 구조, `src/placement.js` 장착 계산, `src/engine.js` 회로 해석, `src/program.js` 인터프리터, `src/project.js` 프로젝트/예제/검증, `src/render.js` 벡터 그림, `src/app.js` 편집과 실행 UI, `desktop/` 실행파일 호스트.

## 참고

사용자 제공 핀맵을 [ST UM1724 Rev 17](https://www.st.com/resource/en/user_manual/um1724-stm32-nucleo64-boards-mb1136-stmicroelectronics.pdf)의 Figure 24, Table 19, Table 29와 대조했습니다. 실제 클릭 좌표와 기능 그림은 자체 SVG 코드로 그립니다. 참고 사진·핀맵·생성 이미지는 저장소와 EXE에서 제외합니다.

STM32·NUCLEO 및 ST 관련 상표는 각 권리자에게 있습니다. Electron 등 포함된 소프트웨어의 이용 조건은 [제3자 고지](THIRD_PARTY_NOTICES.md)를 참고하세요. 이번 업로드는 프로젝트 전체에 별도의 오픈소스 라이선스를 부여하지 않습니다.

데스크톱 패키징: [Electron 공식 문서](https://www.electronjs.org/docs/latest/tutorial/application-distribution).

LCD 단자 명칭: [Winstar WH1602A 데이터시트](https://www.winstar.com.tw/uploads/files/7dbd3015ddf41b06f3f8c89aa4c5fb03.pdf). 앱 그림과 제어기는 범용 16핀 학습용 모형입니다. 특정 LCD 제조사의 전기 특성 보증이 아닙니다.

가변저항 구조는 [Bourns 3386 데이터시트](https://www.bourns.com/data/global/pdfs/3386.pdf), RGB의 공통 단자 구성은 [Kingbright RGB 제품 안내](https://www.kingbrightusa.com/lobbyRGB.asp), 표시기 단자 구성은 [Kingbright SC56-21GWA](https://www.kingbrightusa.com/images/catalog/spec/sc56-21gwa.pdf)를 참고했습니다. 범용 모형이며 실제 부품의 기계 치수 전체를 복제한 것은 아닙니다.

온도 전달식과 전원 범위는 [Analog Devices TMP36](https://www.analog.com/en/products/tmp36.html), 초음파 단자·트리거·거리 환산은 [HC-SR04 데이터시트](https://cdn.sparkfun.com/datasheets/Sensors/Proximity/HCSR04.pdf)를 참고했습니다. 모델의 구체적인 단순화는 위 표와 한계에 명시했습니다.
