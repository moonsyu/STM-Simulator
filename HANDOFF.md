# STM Simulator — 개발 인계

현재 버전: **0.15.2**. 정리일: **2026-10-07**. NUCLEO-F446RE와 빵판을 연결하고 GPIO 스케치 또는 지원 HAL C 소스를 실행하는 Windows 학습용 IDE다. 사용자에게는 한국어 존댓말로 응답한다.

## 저장소 관리 원칙

- 작업 저장소: 현재 Git 체크아웃, 원격 `moonsyu/STM-Simulator`, 기본 브랜치 `main`.
- 과거 버전은 **Git 커밋 이력**으로만 관리한다. 버전별 백업 폴더·이전 실행 파일·옛 검증 문서 사본을 남기지 않는다.
- 최신 배포 묶음은 `outputs/artifact/`, 최신 검증 문서는 `docs/VERIFICATION.md`, 최신 실행 증거는 `work/test-results/`에 갱신한다. 테스트가 만든 임시 프로필은 종료 후 제거한다.
- 사용자 다운로드 공간은 GitHub Releases의 Assets다. README는 프로젝트 소개·현재 기능·빌드 방법·Releases 다운로드 링크만 유지한다. 게시 요청 시 원격 README 반영과 검증한 실행 파일 업로드까지 완료한다.
- 별도 빌드 작업 폴더를 쓰면 검증이 끝난 생성물 중복과 임시 파일도 정리한다. 사용자 회로·소스·자동 저장은 생성물 정리 대상이 아니다.
- 현재 기능 및 정리 변경을 커밋한다. 원격 게시 여부는 사용자 요청에 따른다. 저장소 이름은 STM-Simulator이며 원격 URL과 문서 링크도 이 이름을 사용한다.
- `dist/`, `work/`, `outputs/`, `node_modules/`, `work/test-results/`, `.cache/`, 참고 미디어는 Git에서 제외한다.

## 0.15.2 CubeMX 활성화 초기값

- 사용자가 원한 기준은 CubeMX에서 TIM을 켰을 때 채워지는 설정이다. [MCU-DEFAULTS.md](docs/MCU-DEFAULTS.md)에 근거와 모델 범위를 정리했다.
- 새 MCU: HSI 16 MHz, GPIO 미할당, 주변장치/NVIC 비활성. TIM PSC=0, TIM2/5 ARR=4294967295, TIM3/4 ARR=65535, PWM Pulse=0. 공통 정의는 `src/mcu-defaults.js`다.
- Pinout, 검증기, 누락 `.ioc` 필드, 생성 HAL 코드에 동일한 초기값을 적용한다. 기존 파일의 명시적 ARR=0과 사용자 코드, HAL 예제 84 MHz 설정은 보존한다.
- 32비트 ARR 기본값에서 HAL PWM의 1 Hz 미만 주파수를 허용한다. 스케치 API 1~2000 Hz와 HAL PWM 상한은 유지한다. Pulse=0 출력은 LOW이며 nonzero Pulse는 긴 주기의 에지를 예약한다.
- 명시적 ARR=0은 카운터 정지·IRQ 취소·PWM 정적 출력, 재설정 시 카운트 재개를 유지한다.
- 검증: `tests/mcu-defaults.test.js`, `scripts/mcu-defaults-smoke.cjs`, 전체 모델 검사, 기본 TIM 네 개를 포함한 실제 ARM GCC 빌드. 최신 결과와 배포 해시는 `docs/VERIFICATION.md`를 확인한다.

## 0.15.0 실제 IDE 인계

- `desktop/native-build.cjs`: GCC/g++ 실행·Debug/Release·ST HAL/CMSIS/F446 startup/링커·ELF/BIN/HEX/MAP/EXE·SHA-256·오류 파싱. 빌드마다 독립 디렉터리를 만들어 이전 결과를 잘못 실행하지 않는다.
- `desktop/gdb-mi.cjs`: 실제 GDB/MI 파서 및 프로세스, 로컬/ARM remote, 중단점/step/continue/interrupt/프레임/변수/감시식/레지스터/메모리. 감시식 부작용과 GDB 자동 로드를 차단한다.
- `desktop/clangd.cjs`: stdio JSON-RPC와 live source overlay. `desktop/native-ide.cjs`: 생명주기, 캐시, 빌드 취소, OpenOCD, 프로그램 stdin/stdout, 명령 터미널. 경로·명령은 renderer가 직접 프로세스로 실행하지 않고 IPC를 통해 검증한다.
- `src/native-ide-ui.js`와 Monaco 어댑터: 대상 선택, 도구 설정, 빌드 결과, GDB UI, clangd, 터미널. 기존 회로 시뮬레이터의 실행기는 보존했다.
- 도구 설정은 앱 데이터의 `native-tools.json`, GDB 서버 연결은 로컬 `stm32lab.debugConnection`, 실행 대상/구성은 회로 `ide.native`에 저장한다. 기존 문서는 기본 simulator로 열린다.
- 외부 도구는 EXE에 포함하지 않는다. 설치 헬퍼는 `scripts/setup-native-tools.ps1`; SHA-256 및 ST SDK 커밋을 고정했다. 기본 `%LOCALAPPDATA%/STM-Simulator-Tools`는 자동 검색한다. Windows GCC/GDB는 MSYS2/PATH에서 검색한다. SDK와 GCC는 영문 경로; 사용자 프로젝트는 한글 경로 가능.
- 빌드 작업 폴더와 언어 서버 소스 스냅샷은 앱 데이터 또는 설정한 영문 빌드 작업 폴더에 남는다. 사용자 파일과 분리하며 자동으로 재귀 삭제하지 않는다.
- 실제 Windows GCC/GDB/clangd, ARM GCC/ST HAL, ARM GDB 원격 검증(QEMU STM32F405 Cortex-M4)을 수행했다. QEMU는 검증 도구이며 제품의 F446 에뮬레이터가 아니다. 연결된 ST-LINK는 확인되지 않아 실물 플래시·디버그는 검증하지 않았다.
- 다음 검증 명령: `npm test`, `npm run test:ui`, `npm run test:native`, `npm run test:native:ui`, `npm run test:arm-gdb` (`QEMU_ARM` 지정 가능). 실제 도구 통합 검사는 개발 도구를 설치한 환경에서 실행한다.
- IDE 구현은 0.15.0에서 추가했으며 현재 앱 버전은 0.15.2다. 게시할 때는 main과 릴리즈 태그, 성공한 Actions 빌드의 커밋을 일치시키고 다운로드 자산의 해시를 확인한다. 원격 게시 증거는 `work/test-results/release-proof.json`에 기록한다.

## 현재 구현

- IDE 중심 화면에 프로젝트·코드·시뮬레이터·터미널 패널을 통합했다. 모든 패널은 1~99% 분할, 도킹 이동·접기·최대화를 지원한다. 과거 코드 300px/회로 470px/터미널 높이 제한은 없고 배치는 `stm32lab.workspaceLayout.v1`에 저장한다.
- 폴더 프로젝트 생성·열기·저장, C/H 추가·이름 변경·삭제와 include 갱신, 외부 파일 변경 시 덮어쓰기 거부. 기존 `.stm32lab`과 프로필은 유지한다. 자동 복구된 프로젝트는 폴더 연결 없이 복구하므로 원래 폴더를 다시 열어야 한다.
- Monaco 0.57.0 로컬 번들: 구문 강조·기본 완성·함수 정의 찾기·다중 커서·접기. ARM/Windows 대상에 clangd의 의미 분석·완성·호버·정의/참조·인수 안내·서식 정리를 연결한다. `npm ci`의 postinstall과 빌드에서 `src/generated/`를 생성한다. 이 폴더는 Git에 넣지 않는다.
- 지원 소스 빌드·원본 파일 오류 위치, 중단점·일시정지·step into/over/out·변수·호출 스택·읽기 전용 감시식. 콜백은 원자적으로 처리해 내부 중단점은 지원하지 않는다. 실행 대상이 ARM/Windows일 때는 실제 GCC 및 GDB를 사용한다. 사용자 사용법·한계는 [IDE 문서](docs/IDE.md).

- 보드 커넥터 108개, 빵판 400홀, GPIO 별칭, 배선 10색, 부품 35종과 45도 회전·구멍 장착·속성/측정.
- DC/RC 회로 모델, GPIO·ADC·PWM, USER 버튼/LD2, LED·센서·LCD·UART/I²C/SPI, 파형 및 CSV.
- 스케치 함수·배열·구조체·포인터·타이머·IRQ·DMA와 실행 한도. 지원 API는 [스케치 API](docs/SKETCH-API.md)에 정리한다.
- `.ioc`, `main.c`, 사용자 `.c/.h`, Cube 프로젝트 폴더 가져오기. Pinout GPIO/EXTI·주변장치·NVIC 및 HAL 코드 생성.
- F446RE LQFP64의 USART1/2/3/6, UART4/5 실제 TX/RX·AF7/8. 자동 배정·대체 핀·충돌 방지·독립 송수신/IRQ. I2C1/SPI1/ADC1/TIM2·3·4·5도 지원.
- 새 프로젝트 마법사는 이름·보드·빈 HAL/예제 템플릿·상위 폴더를 선택한다. HAL 예제 32개를 선택하면 확인 창 없이 코드·핀·부품·배선·계산 설정을 즉시 교체하며 사용자가 정한 회로 이름은 유지한다. Undo/Redo로 복구할 수 있다. 별도 시리얼/스케치 예제 메뉴는 없다.
- printf/puts는 UART 배선 없이 로그에 출력한다. HAL UART TX/RX는 포트·방향별로 표시한다. 실제 수신은 전원·배선·baud 조건을 검사한다. ADC 배열은 polling, 초음파는 HAL GPIO와 TIM2 카운터 모델을 사용한다.
- 부품 검색창에서 이름·종류로 찾고, 비어 있으면 35종 전체를 세로 스크롤 목록에 표시한다.
- 배선은 선택 모드에서 빵판 구멍보다 우선한다. 배선 도구(W) 또는 연결 중에는 구멍을 선택할 수 있다. F5는 편집기에서도 실행/정지하며 열린 대화상자와 키 반복에는 실행하지 않는다.
- 앱 창·작업 표시줄·Windows EXE·웹 파비콘에는 전용 칩/신호 아이콘을 사용한다. 아이콘 재생성은 `npm run build:icon`, EXE 리소스 편집은 `signExecutable:false`로 유지한다.
- 상단바는 아이보리·초록색이며 S 아이콘은 제거했다. SVG 보드 그림의 모델명만 제거했다. 핀·헤더·기능 표시는 유지한다.
- 보드 검색/선택은 현재 NUCLEO-F446RE 한 종류만 제공한다. 기본 프로젝트와 코드·회로·핀·소스·계산 설정을 비교해 초기화 경고를 판단하므로 저장해도 경고가 유지되고 Undo로 기본 상태가 되면 경고하지 않는다.
- 추가 빵판은 components의 breadboard 타입으로 최대 8개. 고정 기본 빵판은 기존 사용자 파일 호환을 위해 유지한다. 추가 빵판의 구멍/버스 ID는 breadboard:<id>: 접두사로 분리하며 이동/회전 시 장착 부품도 변환한다. 삭제 시 해당 구멍의 배선과 장착 연결만 제거한다.
- 확장 14종: LDR, NTC, SHT31, MPU6050, PIR, SSD1306 OLED, ST7735 TFT, MAX7219, RC 서보, DC 모터/드라이버, 4상 스테퍼/드라이버, 릴레이, 조이스틱, 인코더. 각 HAL 예제와 전원·배선·프로토콜 조건 검사가 있다. 세부 명령 범위와 기계 모델 한계는 HAL-API 문서를 따른다.
- Ctrl+F로 현재 소스에서 문자 그대로 검색하고 Ctrl+R로 단일/전체 치환한다. 치환은 파일 크기 제한과 프로젝트 Undo/Redo·저장을 따르며 실행 중에는 검색만 가능하다.
- 배선 선택 시 SVG 선을 보존해 실제 더블클릭 이벤트를 유지한다. 꺾임점 크기는 화면 확대율에 맞추고 끌기는 누른 위치의 이동량을 적용한다.
- 회로 시뮬레이터의 HAL은 지원 API를 회로에 연결하는 소스 해석 모델이다. ARM 대상의 실제 ST HAL 빌드·GDB 보드 실행과는 별개이며 ARM ELF를 가상 빵판에 연결하는 CPU 에뮬레이션은 구현하지 않았다. 세부 한계는 [HAL API](docs/HAL-API.md)를 따른다.

- 배선 꺾임점 추가/드래그/삭제/자동 정렬, Shift 다중 선택과 Ctrl+C/V, 연결망 강조, 클릭 가능한 회로 진단을 제공한다. 원본 빵판을 제외하고 부품만 복사할 때도 부품 사이의 전기적 연결을 배선으로 보존한다.
- 생성 main.c는 HSI PLL 클록과 정식 HAL 초기화를 포함하며 동일 Cube 환경으로 이식한다. `main.c 저장` IPC 및 ARM GCC/ST HAL 컴파일·링크 검사 스크립트가 있다. 실제 보드 실행은 별도이며 printf는 SWV 포트 0, nano float는 링크 옵션이 필요하다.
- TIM2/5 32비트, TIM3/4 16비트; 독립 base/IT/PWM, 입력 캡처, 엔코더. 새 HAL 회로 예제 3개가 있다. 필터 0, 내부 클록, 카운터 up/encoder 모델 범위를 문서화했다.

- 수동 부저(`passive_buzzer`)는 실제 두 단자 사이의 PWM·GPIO 전이를 측정해 20~2000 Hz 음높이와 듀티를 표시한다. DC·0/100% 듀티는 무음이며, HAL PWM 멜로디 예제가 회로·핀·파형을 함께 설정한다. 부저별 Web Audio 음원을 분리해 서로 다른 음높이를 동시에 출력한다.

- L298N 듀얼 드라이버·별도 2핀 DC 모터·6~24 V 외부 전원 및 2채널 HAL 예제 추가. 전원·출력은 회로 엔진에서 계산하며 PWM 순간 제어와 제동/자유 정지 속도 모델 적용. `src/l298n*.js`, `tests/l298n.test.js`, `scripts/l298n-smoke.cjs` 참고.

## 코드 지도

| 파일 | 담당 |
|---|---|
| `src/circuit-edit.js`, `src/circuit-diagnostics.js` | 배선 경로·복사·연결망·문제 위치 |
| `src/timer-config.js`, `src/hal-timers.js`, `src/timer-examples.js` | 실제 타이머 AF·카운터/캡처/엔코더·HAL 회로 예제 |
| `src/hal-generator.js`, `scripts/check-main-c.mjs` | 이식 가능한 main.c 생성·ST HAL ARM 컴파일/링크 검증 |
| `src/pins.js`, `src/components.js`, `src/placement.js` | 핀·부품·다리·별칭·구멍 장착 |
| `src/boards.js`, `src/board-picker.js` | 보드 카탈로그·검색·초기화 확인 |
| `src/breadboards.js` | 추가 빵판 이동·회전·삭제와 연결 보존 |
| `src/part-library.js` | 전체 부품 카탈로그·한글/영문 검색 |
| `src/project.js`, `src/hal-examples.js`, `src/hal-circuits.js` | 빈 HAL 프로젝트·파일 검증·HAL 예제 코드/회로 |
| `src/parser.js`, `src/runtime.js`, `src/program.js` | 문법·실행기·API 진입점 |
| `src/mcu-config.js`, `src/serial-config.js` | MCU 설정·IOC·HAL 생성·실제 직렬 핀맵 |
| `src/hal-source.js`, `src/hal.js`, `src/hal-stdio.js`, `src/firmware-import.js` | HAL 소스/전처리·호환 API·printf·가져오기 |
| `src/session.js`, `src/engine.js` | 실행기/회로 연결·DC/RC 계산 |
| `src/lcd.js`, `src/buses.js`, `src/sensors.js` | 부품·버스 모델 |
| `src/device-defs.js`, `src/device-buses.js`, `src/device-motion.js` | 확장 센서·화면·구동·입력 모델과 핀 구성 |
| `src/device-examples.js`, `src/device-ui.js` | 확장 14종 HAL 회로/코드, 속성·실시간 픽셀/회전 표시 |
| `src/passive-buzzer.js`, `src/passive-buzzer-example.js`, `src/buzzer-audio.js` | 수동 부저 파형 측정·HAL 멜로디·부저별 음향 |
| `src/trace.js`, `src/monitor.js` | 파형·통신·로그 |
| `src/editor-search.js` | 현재 소스 찾기·바꾸기와 검색 패널 |
| `src/app.js`, `src/pinout-ui.js` | 편집/실행·핀 설정 |
| `src/ide-ui.js`, `src/code-editor.js`, `src/ide.css` | IDE 도구·프로젝트 UI·Monaco 연결 |
| `src/layout-model.js`, `src/workspace-layout.js` | 분할 트리·이동·크기·로컬 배치 |
| `src/debug-tools.js`, `src/parser.js`, `src/runtime.js`, `src/hal-source.js` | 소스 위치·실행 중단·변수·감시식 |
| `src/source-files.js`, `desktop/workspace.cjs` | C/H 파일 편집·폴더 저장·충돌 방지 |
| `scripts/build-editor.mjs`, `tests/ide.test.js`, `scripts/ide-smoke.cjs` | 로컬 편집기 번들·IDE 모델/UI 검증 |
| `src/render.js`, `src/part-render.js`, `src/part-controls.js` | SVG·부품 속성/측정 |
| `desktop/` | Electron·파일/폴더 가져오기·저장 IPC |
| `tests/`, `scripts/*-smoke.cjs` | 모델·실제 UI/EXE 검증 |
| `.github/workflows/build-windows.yml` | 모델/UI 테스트·Windows 빌드·Artifact |

GPIO 변경 전 `beforeChange`로 이전 출력의 시간 구간을 적분하고, 변경 후 `changed`로 같은 시점의 회로를 다시 계산한다. 같은 시간의 재측정에서 커패시터를 다시 충전하면 안 된다.

## 데이터와 실행 규칙

- appId `local.stm32.circuitlab`, 사용자 데이터 폴더 `STM32 Circuit Lab`, 확장자 `.stm32lab`, JSON format `stm32-circuit-lab`, 스키마 version 2를 유지한다.
- 자동 저장 키 `stm32lab.project.v2`와 v1 읽기 지원은 사용자 회로 보존을 위한 현재 기능이다. 새 기본값을 이유로 기존 자동 저장 회로를 덮어쓰지 않는다.
- `tests/fixtures/`는 모델·UI 회귀 검증용 물리 회로와 기존 사용자 파일 호환 프로그램이다. 앱에서 가져오지 않으며 EXE에 포함하지 않는다. 제공 HAL 예제는 `src/hal-examples.js`와 `src/hal-circuits.js`에서 구성한다.
- `simulation`, `mcu`, `firmware`, `ide`는 선택적 필드다. `ide`는 검증된 소스 파일별 중단점과 감시식을 저장한다. main.c는 `project.code`, 보조 소스는 `firmware.files`에 저장한다.
- 두 핀 부품의 `attachA/attachB`와 다핀 `attachments`는 헬퍼로 처리한다.
- renderer의 contextIsolation/sandbox를 유지하고 nodeIntegration을 켜지 않는다.
- UI 테스트는 `CIRCUIT_LAB_TEST_PROFILE`로 분리한다. 실제 사용자의 자동 저장 폴더는 건드리지 않는다.

## 개발과 검증

Node.js 24 계열, Electron 44.2.0, electron-builder 26.15.3, Playwright 1.58.2. 의존성은 lockfile을 따른다.

```powershell
npm ci
node node_modules/electron/install.js
npm start
npm test
npm run test:ui
npm run build
npm run build:artifact
node scripts/portable-smoke.cjs
```

`npm run build`는 `scripts/clean-build.cjs`로 이전 EXE·배포 묶음·win-unpacked를 먼저 정리한다. 실행 파일이 잠겼으면 아무 파일도 지우기 전에 중단하고 앱 종료를 안내한다. `build:artifact`도 이전 생성 묶음을 안전하게 교체한다. 버전별 폴더로 옮겨 보관하지 않는다. 패키지 검사에는 Electron/Chromium/Monaco 라이선스 원문과 참고 자료 제외 검증이 포함된다. `work/build/win-unpacked`는 빌드/검증 중간 결과이며 전달 후 정리할 수 있다.

수동 부저 전용 검증은 `npm run test:passive-buzzer`와 `npm run test:passive-buzzer:ui`다. Windows CI는 기본적으로 전체 테스트를 실행한다. 사용자가 범위를 수동 부저로 제한한 작업에서는 푸시의 최신 커밋 메시지에 `[test:passive-buzzer]`를 넣거나 수동 실행의 `test_scope=passive-buzzer`를 선택한다. 해당 실행만 전용 테스트로 제한하고 EXE 빌드·패키지 검증·업로드는 그대로 수행한다.

`main` 푸시 후에는 해당 커밋의 GitHub Actions 실행 결과까지 확인한다. 로컬 테스트 성공과 원격 빌드 성공을 구분한다. 타이머 UI 검사는 벽시계 대기 대신 단계 실행으로 시뮬레이션 시각을 고정하고, 부품 선택은 `.part-body`를 클릭한다. 파일 저장·열기는 `saveProject`/`openProject` 테스트 헬퍼로 완료 로그를 기다린 뒤 검사한다. UART의 소수 baud 시각 비교에는 ms/µs 왕복 반올림 오차를 고려해야 한다. 실패한 UI 실행의 로그·스크린샷·JSON은 Actions의 `Windows-test-diagnostics`에 14일 보관한다.

`LAB_EXE`로 UI smoke에 `win-unpacked/STM Simulator.exe`를 지정할 수 있다. 단일 portable EXE는 전용 `portable-smoke.cjs`로 검증한다. 현재 검증 결과와 한계는 [VERIFICATION.md](docs/VERIFICATION.md)를 확인한다.

## 권리와 모델 범위

저장소는 2026-09-16 소유자 요청으로 Public으로 전환했으며 [저작권 검토](docs/COPYRIGHT-REVIEW.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)를 유지한다. ST 드라이버/CubeMX XML, 참고 사진·참고 자료에 기반한 생성 이미지를 앱에 넣지 않는다. 자체 앱 아이콘은 desktop/icons에 두며 제작 정보는 docs/APP-ICON.md에 기록한다. 프로젝트 전체에 라이선스를 임의로 부여하지 않는다. README에 권리 관련 문제 또는 법적 문제가 확인되면 저장소를 삭제 조치한다는 안내를 유지한다.

통신 비트 파형/노이즈, 실제 NVIC 선점, 동기식 USART, HAL DMA, MCU UART 간 직접 배선 전송, 전체 C/C++·CPU·레지스터 재현은 미지원이다. 모델을 정밀 하드웨어 에뮬레이션으로 설명하지 않는다.

다음 작업은 Git 상태와 이 문서, README/API 문서를 확인한 뒤 사용자 요청 범위에서 진행한다. 변경에 맞는 검증을 수행하고 현재 문서만 갱신한다.
