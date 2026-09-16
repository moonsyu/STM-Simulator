# STM Simulator — 개발 인계

현재 버전: **0.12.0**. 정리일: **2026-09-16**. NUCLEO-F446RE와 빵판을 연결하고 GPIO 스케치 또는 지원 HAL C 소스를 실행하는 Windows 회로 실습 앱이다. 사용자에게는 한국어 존댓말로 응답한다.

## 저장소 관리 원칙

- 사용자 지정 저장소: `D:\codex\projects\ct\STM-Simulator`, 원격 `moonsyu/STM-Simulator`, 기본 브랜치 `main`.
- 과거 버전은 **Git 커밋 이력**으로만 관리한다. 버전별 백업 폴더·이전 실행 파일·옛 검증 문서 사본을 남기지 않는다.
- 최신 배포 묶음은 `outputs/artifact/`, 최신 검증 문서는 `docs/VERIFICATION.md`, 최신 실행 증거는 `work/test-results/`에 갱신한다. 테스트가 만든 임시 프로필은 종료 후 제거한다.
- 사용자 다운로드 공간은 GitHub Releases의 Assets다. README는 프로젝트 소개·현재 기능·빌드 방법·Releases 다운로드 링크만 유지한다. 게시 요청 시 원격 README 반영과 검증한 실행 파일 업로드까지 완료한다.
- 별도 빌드 작업 폴더를 쓰면 검증이 끝난 생성물 중복과 임시 파일도 정리한다. 사용자 회로·소스·자동 저장은 생성물 정리 대상이 아니다.
- 현재 기능 및 정리 변경을 커밋한다. 원격 게시 여부는 사용자 요청에 따른다. 저장소 이름은 STM-Simulator이며 원격 URL과 문서 링크도 이 이름을 사용한다.
- `dist/`, `work/`, `outputs/`, `node_modules/`, `work/test-results/`, `.cache/`, 참고 미디어는 Git에서 제외한다.

## 현재 구현

- 보드 커넥터 108개, 빵판 400홀, GPIO 별칭, 배선 10색, 부품 31종과 45도 회전·구멍 장착·속성/측정.
- DC/RC 회로 모델, GPIO·ADC·PWM, USER 버튼/LD2, LED·센서·LCD·UART/I²C/SPI, 파형 및 CSV.
- 스케치 함수·배열·구조체·포인터·타이머·IRQ·DMA와 실행 한도. 지원 API는 [스케치 API](docs/SKETCH-API.md)에 정리한다.
- `.ioc`, `main.c`, 사용자 `.c/.h`, Cube 프로젝트 폴더 가져오기. Pinout GPIO/EXTI·주변장치·NVIC 및 HAL 코드 생성.
- F446RE LQFP64의 USART1/2/3/6, UART4/5 실제 TX/RX·AF7/8. 자동 배정·대체 핀·충돌 방지·독립 송수신/IRQ. I2C1/SPI1/ADC1/TIM2·3·4·5도 지원.
- 새 프로젝트는 빈 회로와 HAL main.c다. HAL 예제 30개를 선택하면 확인 창 없이 코드·핀·부품·배선·계산 설정을 즉시 교체하며 사용자가 정한 회로 이름은 유지한다. Undo/Redo로 복구할 수 있다. 별도 시리얼/스케치 예제 메뉴는 없다.
- printf/puts는 UART 배선 없이 로그에 출력한다. HAL UART TX/RX는 포트·방향별로 표시한다. 실제 수신은 전원·배선·baud 조건을 검사한다. ADC 배열은 polling, 초음파는 HAL GPIO와 TIM2 카운터 모델을 사용한다.
- 부품 검색창에서 이름·종류로 찾고, 비어 있으면 31종 전체를 세로 스크롤 목록에 표시한다.
- 배선은 선택 모드에서 빵판 구멍보다 우선한다. 배선 도구(W) 또는 연결 중에는 구멍을 선택할 수 있다. F5는 편집기에서도 실행/정지하며 열린 대화상자와 키 반복에는 실행하지 않는다.
- 상단바는 아이보리·초록색이며 S 아이콘은 제거했다. SVG 보드 그림의 모델명만 제거했다. 핀·헤더·기능 표시는 유지한다.
- 보드 검색/선택은 현재 NUCLEO-F446RE 한 종류만 제공한다. 기본 프로젝트와 코드·회로·핀·소스·계산 설정을 비교해 초기화 경고를 판단하므로 저장해도 경고가 유지되고 Undo로 기본 상태가 되면 경고하지 않는다.
- 추가 빵판은 components의 breadboard 타입으로 최대 8개. 고정 기본 빵판은 기존 사용자 파일 호환을 위해 유지한다. 추가 빵판의 구멍/버스 ID는 breadboard:<id>: 접두사로 분리하며 이동/회전 시 장착 부품도 변환한다. 삭제 시 해당 구멍의 배선과 장착 연결만 제거한다.
- 확장 14종: LDR, NTC, SHT31, MPU6050, PIR, SSD1306 OLED, ST7735 TFT, MAX7219, RC 서보, DC 모터/드라이버, 4상 스테퍼/드라이버, 릴레이, 조이스틱, 인코더. 각 HAL 예제와 전원·배선·프로토콜 조건 검사가 있다. 세부 명령 범위와 기계 모델 한계는 HAL-API 문서를 따른다.
- Ctrl+F로 현재 소스에서 문자 그대로 검색하고 Ctrl+R로 단일/전체 치환한다. 치환은 파일 크기 제한과 프로젝트 Undo/Redo·저장을 따르며 실행 중에는 검색만 가능하다.
- 배선 선택 시 SVG 선을 보존해 실제 더블클릭 이벤트를 유지한다. 꺾임점 크기는 화면 확대율에 맞추고 끌기는 누른 위치의 이동량을 적용한다.
- 코드/속성 패널 너비를 마우스·키보드로 조절하며 로컬에 저장한다.
- HAL은 지원 API를 회로에 연결하는 소스 해석 모델이다. 전체 ST HAL 드라이버·C ABI·ARM/ELF/BIN 실행은 구현하지 않았다. 세부 한계는 [HAL API](docs/HAL-API.md)를 따른다.

- 배선 꺾임점 추가/드래그/삭제/자동 정렬, Shift 다중 선택과 Ctrl+C/V, 연결망 강조, 클릭 가능한 회로 진단을 제공한다. 원본 빵판을 제외하고 부품만 복사할 때도 부품 사이의 전기적 연결을 배선으로 보존한다.
- 생성 main.c는 HSI PLL 클록과 정식 HAL 초기화를 포함하며 동일 Cube 환경으로 이식한다. `main.c 저장` IPC 및 ARM GCC/ST HAL 컴파일·링크 검사 스크립트가 있다. 실제 보드 실행은 별도이며 printf는 SWV 포트 0, nano float는 링크 옵션이 필요하다.
- TIM2/5 32비트, TIM3/4 16비트; 독립 base/IT/PWM, 입력 캡처, 엔코더. 새 HAL 회로 예제 3개가 있다. 필터 0, 내부 클록, 카운터 up/encoder 모델 범위를 문서화했다.

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
| `src/trace.js`, `src/monitor.js` | 파형·통신·로그 |
| `src/editor-search.js` | 현재 소스 찾기·바꾸기와 검색 패널 |
| `src/app.js`, `src/pinout-ui.js`, `src/editor-layout.js` | 편집/실행·핀 설정·패널 너비 |
| `src/render.js`, `src/part-render.js`, `src/part-controls.js` | SVG·부품 속성/측정 |
| `desktop/` | Electron·파일/폴더 가져오기·저장 IPC |
| `tests/`, `scripts/*-smoke.cjs` | 모델·실제 UI/EXE 검증 |
| `.github/workflows/build-windows.yml` | 모델/UI 테스트·Windows 빌드·Artifact |

GPIO 변경 전 `beforeChange`로 이전 출력의 시간 구간을 적분하고, 변경 후 `changed`로 같은 시점의 회로를 다시 계산한다. 같은 시간의 재측정에서 커패시터를 다시 충전하면 안 된다.

## 데이터와 실행 규칙

- appId `local.stm32.circuitlab`, 사용자 데이터 폴더 `STM32 Circuit Lab`, 확장자 `.stm32lab`, JSON format `stm32-circuit-lab`, 스키마 version 2를 유지한다.
- 자동 저장 키 `stm32lab.project.v2`와 v1 읽기 지원은 사용자 회로 보존을 위한 현재 기능이다. 새 기본값을 이유로 기존 자동 저장 회로를 덮어쓰지 않는다.
- `tests/fixtures/`는 모델·UI 회귀 검증용 물리 회로와 기존 사용자 파일 호환 프로그램이다. 앱에서 가져오지 않으며 EXE에 포함하지 않는다. 제공 HAL 예제는 `src/hal-examples.js`와 `src/hal-circuits.js`에서 구성한다.
- `simulation`, `mcu`, `firmware`는 선택적 필드다. main.c는 `project.code`, 보조 소스는 `firmware.files`에 저장한다.
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

`npm run build`는 `scripts/clean-build.cjs`로 이전 EXE·배포 묶음·win-unpacked를 먼저 정리한다. 실행 파일이 잠겼으면 아무 파일도 지우기 전에 중단하고 앱 종료를 안내한다. `build:artifact`도 이전 생성 묶음을 안전하게 교체한다. 버전별 폴더로 옮겨 보관하지 않는다. 패키지 검사에는 Electron/Chromium 라이선스 원문과 참고 자료 제외 검증이 포함된다. `work/build/win-unpacked`는 빌드/검증 중간 결과이며 전달 후 정리할 수 있다.

`main` 푸시 후에는 해당 커밋의 GitHub Actions 실행 결과까지 확인한다. 로컬 테스트 성공과 원격 빌드 성공을 구분한다. 타이머 UI 검사는 벽시계 대기 대신 단계 실행으로 시뮬레이션 시각을 고정하고, 부품 선택은 `.part-body`를 클릭한다. 파일 저장·열기는 `saveProject`/`openProject` 테스트 헬퍼로 완료 로그를 기다린 뒤 검사한다. UART의 소수 baud 시각 비교에는 ms/µs 왕복 반올림 오차를 고려해야 한다. 실패한 UI 실행의 로그·스크린샷·JSON은 Actions의 `Windows-test-diagnostics`에 14일 보관한다.

`LAB_EXE`로 UI smoke에 `win-unpacked/STM Simulator.exe`를 지정할 수 있다. 단일 portable EXE는 전용 `portable-smoke.cjs`로 검증한다. 현재 검증 결과와 한계는 [VERIFICATION.md](docs/VERIFICATION.md)를 확인한다.

## 권리와 모델 범위

저장소는 2026-09-16 소유자 요청으로 Public으로 전환했으며 [저작권 검토](docs/COPYRIGHT-REVIEW.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)를 유지한다. ST 드라이버/CubeMX XML, 참고 사진·생성 이미지를 앱에 넣지 않는다. 프로젝트 전체에 라이선스를 임의로 부여하지 않는다. README에 권리 관련 문제 또는 법적 문제가 확인되면 저장소를 삭제 조치한다는 안내를 유지한다.

통신 비트 파형/노이즈, 실제 NVIC 선점, 동기식 USART, HAL DMA, MCU UART 간 직접 배선 전송, 전체 C/C++·CPU·레지스터 재현은 미지원이다. 모델을 정밀 하드웨어 에뮬레이션으로 설명하지 않는다.

다음 작업은 Git 상태와 이 문서, README/API 문서를 확인한 뒤 사용자 요청 범위에서 진행한다. 변경에 맞는 검증을 수행하고 현재 문서만 갱신한다.
