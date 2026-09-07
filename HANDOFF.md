# STM Emulator — 개발 인계

현재 버전: **0.5.1**. 정리일: **2026-09-07**. NUCLEO-F446RE와 빵판을 연결하고 GPIO 스케치 또는 지원 HAL C 소스를 실행하는 Windows 회로 실습 앱이다. 사용자에게는 한국어 존댓말로 응답한다.

## 저장소 관리 원칙

- 사용자 지정 저장소: `C:\Users\SSAFY\Desktop\ct\STM-Emulator`, 원격 `moonsyu/STM-Emulator`, 기본 브랜치 `main`.
- 과거 버전은 **Git 커밋 이력**으로만 관리한다. 버전별 백업 폴더·이전 실행 파일·옛 검증 문서 사본을 남기지 않는다.
- 최신 배포 묶음은 `dist/artifact/`, 최신 검증 문서는 `docs/VERIFICATION.md`, 최신 실행 증거는 `test-results/`에 갱신한다. 테스트가 만든 임시 프로필은 종료 후 제거한다.
- 별도 빌드 작업 폴더를 쓰면 검증이 끝난 생성물 중복과 임시 파일도 정리한다. 사용자 회로·소스·자동 저장은 생성물 정리 대상이 아니다.
- 현재 기능 및 정리 변경을 커밋한다. 원격 게시 여부는 사용자 요청에 따른다.
- `dist/`, `node_modules/`, `test-results/`, `.cache/`, 참고 미디어는 Git에서 제외한다.

## 현재 구현

- 보드 커넥터 108개, 빵판 400홀, GPIO 별칭, 배선 10색, 부품 16종과 45도 회전·구멍 장착·속성/측정.
- DC/RC 회로 모델, GPIO·ADC·PWM, USER 버튼/LD2, LED·센서·LCD·UART/I²C/SPI, 파형 및 CSV.
- 스케치 함수·배열·구조체·포인터·타이머·IRQ·DMA와 실행 한도. 지원 API는 [스케치 API](docs/SKETCH-API.md)에 정리한다.
- `.ioc`, `main.c`, 사용자 `.c/.h`, Cube 프로젝트 폴더 가져오기. Pinout GPIO/EXTI·주변장치·NVIC 및 HAL 코드 생성.
- F446RE LQFP64의 USART1/2/3/6, UART4/5 실제 TX/RX·AF7/8. 자동 배정·대체 핀·충돌 방지·독립 송수신/IRQ. I2C1/SPI1/ADC1/TIM2도 지원.
- `HAL · …` 예제 7개. 일부 ADC/I2C/SPI 예제의 `Serial.println`은 결과 표시용 로그 확장이다.
- 코드/속성 패널 너비를 마우스·키보드로 조절하며 로컬에 저장한다.
- HAL은 지원 API를 회로에 연결하는 소스 해석 모델이다. 전체 ST HAL 드라이버·C ABI·ARM/ELF/BIN 실행은 구현하지 않았다. 세부 한계는 [HAL API](docs/HAL-API.md)를 따른다.

## 코드 지도

| 파일 | 담당 |
|---|---|
| `src/pins.js`, `src/components.js`, `src/placement.js` | 핀·부품·다리·별칭·구멍 장착 |
| `src/project.js`, `src/*examples.js` | 파일 검증·변환·예제 |
| `src/parser.js`, `src/runtime.js`, `src/program.js` | 문법·실행기·API 진입점 |
| `src/mcu-config.js`, `src/serial-config.js` | MCU 설정·IOC·HAL 생성·실제 직렬 핀맵 |
| `src/hal-source.js`, `src/hal.js`, `src/firmware-import.js` | HAL 소스/전처리·호환 API·가져오기 |
| `src/session.js`, `src/engine.js` | 실행기/회로 연결·DC/RC 계산 |
| `src/lcd.js`, `src/buses.js`, `src/sensors.js` | 부품·버스 모델 |
| `src/trace.js`, `src/monitor.js` | 파형·통신·로그 |
| `src/app.js`, `src/pinout-ui.js`, `src/editor-layout.js` | 편집/실행·핀 설정·패널 너비 |
| `src/render.js`, `src/part-render.js`, `src/part-controls.js` | SVG·부품 속성/측정 |
| `desktop/` | Electron·파일/폴더 가져오기·저장 IPC |
| `tests/`, `scripts/*-smoke.cjs` | 모델·실제 UI/EXE 검증 |
| `.github/workflows/build-windows.yml` | 모델/UI 테스트·Windows 빌드·Artifact |

GPIO 변경 전 `beforeChange`로 이전 출력의 시간 구간을 적분하고, 변경 후 `changed`로 같은 시점의 회로를 다시 계산한다. 같은 시간의 재측정에서 커패시터를 다시 충전하면 안 된다.

## 데이터와 실행 규칙

- appId `local.stm32.circuitlab`, 사용자 데이터 폴더 `STM32 Circuit Lab`, 확장자 `.stm32lab`, JSON format `stm32-circuit-lab`, 스키마 version 2를 유지한다.
- 자동 저장 키 `stm32lab.project.v2`와 v1 읽기 지원은 사용자 회로 보존을 위한 현재 기능이다.
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

`build:artifact` 전에 기존 `dist/artifact/` 생성 결과를 제거한다. 버전별 폴더로 옮겨 보관하지 않는다. 패키지 검사에는 Electron/Chromium 라이선스 원문과 참고 자료 제외 검증이 포함된다. `win-unpacked`는 빌드/검증 중간 결과이며 전달 후 정리할 수 있다.

`LAB_EXE`로 UI smoke에 `win-unpacked/STM Emulator.exe`를 지정할 수 있다. 단일 portable EXE는 전용 `portable-smoke.cjs`로 검증한다. 현재 검증 결과와 한계는 [VERIFICATION.md](docs/VERIFICATION.md)를 확인한다.

## 권리와 모델 범위

저장소는 Private이며 [저작권 검토](docs/COPYRIGHT-REVIEW.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)를 유지한다. ST 드라이버/CubeMX XML, 참고 사진·생성 이미지를 앱에 넣지 않는다. 프로젝트 전체에 라이선스를 임의로 부여하지 않는다.

통신 비트 파형/노이즈, 실제 NVIC 선점, 동기식 USART, HAL DMA, MCU UART 간 직접 배선 전송, 전체 C/C++·CPU·레지스터 재현은 미지원이다. 모델을 정밀 하드웨어 에뮬레이션으로 설명하지 않는다.

다음 작업은 Git 상태와 이 문서, README/API 문서를 확인한 뒤 사용자 요청 범위에서 진행한다. 변경에 맞는 검증을 수행하고 현재 문서만 갱신한다.
