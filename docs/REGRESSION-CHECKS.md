# 회귀 검증 기준과 점검표 (기능 목록 63번)

59번(Tauri 전환)·60번(모듈화)·61번(최적화)·62번(Rust 로직 이전)에 공통으로 적용한다. 기준 일곱 가지는 [기능 목록](FEATURES.md) 63번 행에 있다. 이 문서는 ① 기준선의 통과 수, ② 기능별 점검표, 단계마다의 결과를 적는다.

## 검사 묶음과 실행 방법

| 묶음 | 명령 | 비고 |
|---|---|---|
| Rust | `npm run test:rust` | fmt --check, clippy -D warnings, cargo test, wasm 빌드 |
| 정적 검사 | `npm run lint` | 오류 0 |
| unit · interp · emu · firmware | `npm run test:unit` 등 (`npm test`는 넷을 한 번에) | ARM GCC·CubeF1/F4·FSP 경로가 있으면 3건이 더 돈다 |
| toolchain | `node scripts/toolchain-shard.mjs 1`~`7` | ARM GCC, STM32CubeF1/F4, FSP 필요 |
| E2E | `node --test --test-concurrency=1 "tests/e2e/*.test.mjs"` | 창은 뒤, 다크 모드, 포커스 없음(하네스 기본값) |
| 패키지 | `npm run build` 뒤 `tests/release/packaged.test.mjs` | 3건 중 1건은 조건부 건너뜀 |

이 PC에서는 `%LOCALAPPDATA%\STM-Simulator-Tools\full.sh rust unit tc e2e pkg`가 위를 차례로 돌려 요약을 쓴다.

## ① 기준선

62번을 시작하기 전의 Electron 판 수치다. 단계마다 게시 전에 같은 묶음을 다시 돌려 통과 수가 이 표와 같거나 많아야 한다(④).

| 묶음 | 1.63.2 (62번 시작 전) | 1.63.3 (게시 전) |
|---|---|---|
| Rust (`npm run test:rust`) | 통과, cargo 시험 35건 | 통과, cargo 시험 40건(클록 5건 추가) |
| 정적 검사 | 오류 0 | 오류 0 |
| unit · interp · emu · firmware | 1380건: 1379 통과, 1 건너뜀 | 1382건(unit 1077 · interp 163 · emu 68 · firmware 74): 1381 통과, 1 건너뜀 |
| toolchain 묶음 1~7 | (1.63.2에서는 돌리지 않음. 1.63.1에서 전부 통과) | 392건(12 · 143 · 148 · 19 · 16 · 30 · 24): 전부 통과 |
| E2E | 137건: 136 통과, 1 건너뜀 | 137건: 136 통과, 1 건너뜀 |
| 패키지 | 3건: 2 통과, 1 건너뜀 | 3건: 2 통과, 1 건너뜀 |

- 1.63.3의 수치는 클록 트리 이전(62번 1단계 첫 모듈)이 들어간 판에서 쟀다 — 이 작업이 순서 변경(63 → 62) 전에 시작됐기 때문이다. toolchain 기준선은 1.63.3의 392건이다. 클록 쪽은 기준선 대신 1.63.2의 JavaScript 구현과 직접 비교했다(아래 단계별 결과).
- 건너뛰는 시험 3건은 조건부다: emu 1건(성능 측정, 환경 변수로 켬), E2E 1건, 패키지 1건(Release 자산이 있을 때만).
- toolchain `ra-course`의 "every FSP example builds and runs with contact bounce"는 실행 시간에 민감하다(에뮬레이터가 정해진 시간 안에 2000 ms를 못 따라가면 실패). 전체 실행 중 다른 작업(crate 내려받기)을 같이 했을 때 1번 실패했고, 조용한 상태에서 묶음 1과 그 파일을 다시 돌려 통과했다. 검사 중에는 PC에 다른 부하를 주지 않는다.

## ② 기능별 점검표

완료된 기능(38번은 보류)마다 그 기능을 확인하는 자동 검사다. 경로는 `tests/` 아래다. 여러 묶음에 걸친 기능은 대표 파일을 적었다.

| # | 기능 | 자동 검사 |
|---|---|---|
| 1 | ADC 연속 변환 | `unit/adc-continuous`, `e2e/adc-continuous`, `toolchain/adc-continuous` |
| 2 | FPB-RA6E1 보드 | `unit/ra6e1`, `unit/fpb-ra6e1-board`, `firmware/firmware-ra6e1`, `e2e/ra6e1`, `toolchain/ra-build` |
| 3 | CubeMX와 다른 점 메우기 | `unit/tim-basic`·`tim-advanced`·`tim-oc`·`tim-channels`·`dac-config`·`rtc-config`·`wdg-config`·`bus-config`·`uart-params`·`spi-params`·`i2c-params`·`adc-sampling`, `interp/adc-group`·`dma`·`timer-*`, 같은 이름의 `e2e/*`·`toolchain/*` |
| 4 | printf 실수 출력 | `unit/printf-float`, `interp/printf-formats` |
| 5 | 핀 과전압 경고 | `unit/pin-tolerance`, `e2e/pin-overvoltage` |
| 6 | 인터럽트 핸들러 중복 안내 | `unit/irq-duplicates`, `e2e/irq-duplicate` |
| 7 | 자동완성의 HAL 함수 | `e2e/completion`, `unit/c-symbols` |
| 8 | ELF의 DWARF 4 | `toolchain/dwarf-version`, `emu/elf` |
| 9 | 예제 코드를 USER CODE 구간 안에 | `unit/user-code`, `unit/regenerate`(모든 HAL 예제 다시 생성) |
| 10 | CubeIDE 프로젝트 가져오기 | `e2e/folder-import`, `unit/import-cases`·`import-startup`·`source-paths`, `toolchain/source-folders` |
| 11 | 모든 파일 수정 | `e2e/copy-to-project`, `e2e/project-structure`, `unit/project-overrides`, `toolchain/project-overrides`·`copied-files` |
| 12 | 드래그 앤 드롭 | `unit/file-drop`, `e2e/file-drop` |
| 13 | `.ioc`에서 회로 만들기 | `interp/ioc-circuit`·`ioc-circuit-edge`, `e2e/ioc-circuit`, `unit/ioc-real-files` |
| 14 | 프로젝트 전체 파일 구조 | `unit/project-structure`·`build-environment`·`explorer-tree`, `e2e/project-structure` |
| 15 | 꺼낸 탐색기가 활동 바로 돌아오기 | `e2e/shell`(side bar taken out … comes back) |
| 16 | 장치 Docs를 두 번 눌러도 유지 | `e2e/shell`(every activity pressed three times stays open), `e2e/docs` |
| 17 | 장치 더블클릭으로 속성 열기 | `e2e/shell`(double-click on a part opens its properties, double press of one part only) |
| 18 | RA6E1 강의 Day5 | `interp/course-programs`, `toolchain/ra-course`, `unit/fsp-interp` |
| 19 | RA 새 프로젝트 템플릿 | `e2e/ra-new-project` |
| 20 | RA 프로젝트의 e² studio 파일 구조 | `e2e/project-structure`(FPB-RA6E1 project shows src, ra_gen, …), `unit/build-environment` |
| 21 | RA Developer Assistance | `unit/ra-assistance`, `e2e/ra-assistance` |
| 22 | RASC와 같은 FSP 설정 화면 | `unit/ra-rasc`·`ra-names`, `e2e/ra-rasc` |
| 23 | 버튼 채터링 | `interp/button-bounce`, `toolchain/button-bounce` |
| 24 | RA6E1 도전 과제 | `toolchain/ra-course`, `unit/fsp-interp` |
| 25 | 탭 모두 닫기 | `e2e/tabs` |
| 26 | 다른 탭 닫기 | `e2e/tabs` |
| 27 | 프로젝트 트리 들여쓰기 | `e2e/project-structure`(indent one step per level) |
| 28 | 소스 파일 트리 | `e2e/project-structure`(source file list shows folders as a tree), `unit/explorer-tree` |
| 29 | 보드 회전 | `unit/board-rotation`, `e2e/board-rotation` |
| 30 | FPB-RA6E1 보드 모델 | `unit/fpb-ra6e1-board`, `unit/circuit` |
| 31 | 빌드 실패 뒤 실행 단추 | `e2e/build-failure` |
| 32 | RA SPI | `unit/ra-spi`, `emu/ra6e1-rspi`, `e2e/ra-spi`, `toolchain/ra-spi` |
| 33 | RA I2C 슬레이브 | `unit/ra-iic-slave`, `e2e/ra-iic-slave`, `toolchain/ra-iic-slave` |
| 34 | RA RTC | `unit/ra-rtc`, `e2e/ra-wdt-rtc`, `toolchain/ra-wdt-rtc` |
| 35 | RA 워치독 | `unit/ra-wdt`, `e2e/ra-wdt-rtc`, `toolchain/ra-wdt-rtc` |
| 36 | RA DMA·DTC·ELC | `unit/ra-transfer`, `e2e/ra-transfer`, `toolchain/ra-transfer` |
| 37 | RA 저전력 모드 | `unit/ra-lpm`·`ra-lpm-interp`·`ra6e1-lpm`, `e2e/ra-lpm`, `toolchain/ra-lpm` |
| 39 | RA 데이터 플래시 | `unit/ra-flash`, `e2e/ra-flash`, `toolchain/ra-flash` |
| 40 | RA CAN | `unit/ra-can`, `e2e/ra-can`, `toolchain/ra-can` |
| 41 | RA USB PCDC | `unit/ra-usb`, `e2e/ra-usb`, `toolchain/ra-usb` |
| 42 | RA 내장 해석기 실행 | `unit/fsp-interp`·`fsp-prelude-values`, `e2e/ra-interpreter`, `toolchain/fsp-interp-parity` |
| 43 | 주변장치별 `.c/.h` 생성 | `unit/peripheral-files`·`regenerate-couple`, `e2e/peripheral-files`, `toolchain/peripheral-files` |
| 44 | 예제의 printf·입력을 UART로 | `unit/stdio-uart`, `interp/stdio-strings`, `e2e/stdio-uart` |
| 45 | 프로젝트 구조의 파일을 바로 고치기 | `e2e/copy-to-project`, `unit/project-overrides` |
| 46 | USER CODE 밖 줄 흐림 없음 | `e2e/copy-to-project`(never faded) |
| 47 | 생성 전 "지워질 줄" 안내 없음 | `e2e/copy-to-project`(`#hal-replace-loss` 없음, 확인 창 내용) |
| 48 | RA RTC 시작 시각 기본값 PC 시각 | `unit/ra-rtc`(default start time) |
| 49 | ESP32·라즈베리파이 삭제 | `unit/project`·`stm32-boards`·`wireless`, `e2e/stm32-boards` |
| 50 | 다시 생성 뒤 로그 없음 | `e2e/copy-to-project`(생성 로그 확인), `unit/regenerate` |
| 51 | "주변장치별 .c/.h" 기본값 | `unit/docs-couple`·`examples-couple`·`rust-core`, `e2e/peripheral-files` |
| 52 | 한 파일 → 주변장치별 전환 오류 | `unit/regenerate-couple` |
| 53 | RA → STM32 보드 전환 오류 | `e2e/board-switch` |
| 54 | 빌드 수준 탭 | `unit/build-level`, `e2e/build-level`, `toolchain/build-level` |
| 55 | 확인 창 문구 삭제 | `e2e/copy-to-project`(확인 창의 자식 요소) |
| 56 | 탐색기의 프로젝트 트리 | `unit/explorer-tree`, `e2e/project-structure`·`copy-to-project` |
| 57 | 빠르게 토글하는 핀의 듀티 표시 | `unit/pin-duty`, `toolchain/pin-duty`, cargo `duty` |
| 58 | 의존성 업데이트 | 전체 묶음(앱 소스 변경 없음), 패키지 검사 |

자동 검사가 없는 기능은 없다. 다만 다음은 자동 검사로 확인하지 못한다 — 해당 단계 게시 전에 사용자 확인을 요청한다(⑥): 실물 보드의 굽기·디버그(OpenOCD·J-Link·gdb), 앱 창을 눈으로 본 모습.

## ③ 결과 같음 비교

`tests/unit/examples-sweep`·`regenerate`(모든 예제의 생성 코드), `interp/examples`·`f103-examples`·`course-programs`(예제 실행 결과), `toolchain/arm-examples`·`ra-build`·`emu-accuracy`·`fsp-interp-parity`(빌드와 에뮬레이터 결과)가 보드 3종의 예제를 고정된 기대값과 비교한다. 62번의 각 묶음은 여기에 더해, 옮기는 모듈의 출력(생성 코드·프로젝트 파일·계산값)을 옮기기 전 JavaScript 구현의 출력과 전수 비교하는 시험을 같은 커밋에 넣는다(옮기기 전 값을 기록해 두고 비교).

## 단계별 결과

| 버전 | 단계 | 결과 같음 비교(③) | 게시 전 검사(④) |
|---|---|---|---|
| 1.63.3 | 62번 1단계: `clock-tree` → Rust `clock.rs` | 1.63.2의 `clock-tree.js`와 같은 입력 1,227,184건(F446 PLLM×PLLN×PLLP 전 범위와 분주 조합 385,337개 트리의 주파수·경고 문구, F103 전 공간, HCLK 0~200 MHz의 플래시 지연·오버드라이브, 타이머 클록 1~180 MHz, 화면 프리셋, 두 보드 예제 247개의 설정, 필드별 잘못된 값, .ioc 키 조합 36,960개): 값·키 순서·오류 문구 차이 0건. 검증하지 않은 트리 1건에서 NaN이 null로 온다(HANDOFF 1.63.3). 이 가운데 755건을 `tests/fixtures/clock-tree-1.63.2.json`으로 기록해 `tests/unit/clock-tree-recorded.test.js`가 비교한다. FPB-RA6E1의 클록은 `ra-config.js`에 있어 이번에 바뀌지 않았다 | 위 표의 1.63.3 열 |
