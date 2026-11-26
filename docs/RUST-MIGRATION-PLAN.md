# Rust 마이그레이션 계획 (기능 목록 62번)

2026-11-26 사용자 지시 "이거 프로젝트 Base 언어를 Rust로 마이그레이션 하자". 범위와 진행 방식은 사용자가 골랐다.

- **범위**: "로직 전부 Rust" — Electron과 화면(HTML·CSS·DOM을 다루는 코드)은 그대로 두고, 화면이 아닌 로직(시뮬레이션·에뮬레이터·인터프리터·코드 생성·회로 계산 등)을 모두 Rust(`rust/stm-core`, WebAssembly)로 옮긴다. JavaScript에는 화면과, Rust를 부르는 얇은 층만 남긴다.
- **진행 방식**: "모듈별로 옮기며 계속 게시" — 한 묶음씩 옮기고, 기존 시험이 통과하면 버전을 올려 게시한다. 앱은 항상 동작하는 상태로 남는다.

## 규모 (1.63.2 기준)

- `src`의 JavaScript 255개 파일, 약 6.1 MB. 이 중 `part-images.js`(부품 그림 데이터, 2.8 MB)와 화면 코드(약 0.7 MB: `app*.js`, `shell.js`, `*-ui.js`, `inspector.js`, `monitor.js`, `code-editor.js` 등)를 빼면 옮길 로직은 약 2.6 MB다.
- Rust는 9개 모듈(약 4,800줄)에서 시작한다.

## 옮기는 방법

- 옮긴 모듈의 JavaScript 파일은 지우지 않고, 같은 이름의 export로 Rust를 부르는 얇은 파일로 바꾼다. 부르는 쪽(화면, 아직 안 옮긴 모듈, 시험)은 그대로 둔다. 한 묶음의 모듈이 모두 Rust 안에서 서로를 직접 부르게 되면 그 사이의 JavaScript 파일은 화면이 쓰는 것만 남긴다.
- 경계: 설정·검증·코드 생성처럼 가끔 부르는 것은 JSON(`rustCall`), 실행 중 매번 부르는 것(CPU 명령 실행, 회로 풀이, 핀 쓰기)은 WebAssembly의 숫자 export와 공유 메모리로 한다.
- 동작은 바꾸지 않는다. 기존 단위·툴체인·E2E 시험이 그대로 통과해야 하고, 옮긴 모듈마다 cargo 시험을 둔다. 옮기면서 달라지는 점이 있으면 그 버전의 HANDOFF에 적는다.
- 옮기는 중에 들어오는 기능 요청은 지금처럼 Rust로 구현한다(고치는 기능이 아직 JavaScript이면 그 기능부터 옮긴다).

## 순서

의존하는 것이 적은 모듈부터, 화면에 가까운 쪽을 나중에 한다. 상태는 이 표와 기능 목록 59번에 적는다.

| 단계 | 묶음 | 대상(주요 파일) | 상태 |
|---|---|---|---|
| 1 | 설정 계산 | `clock-tree`, `adc-config`, `dac-config`, `rtc-config`, `timer-config`, `wdg-config`, `nvic-config`, `gpio-config`, `serial-config`, `bus-config`, `pin-tolerance`, `mcu-family`, `mcu-defaults` | 진행 중 — `clock-tree`(1.63.3) |
| 2 | C 소스 도구 | `parser`, `c-format`, `c-symbols`, `c-types`, `c-inline`, `c-struct-fields`, `c-expression-type`, `c-source-edit`, `hal-source`, `source-files`, `irq-handlers`, `irq-duplicates` | 미착수 |
| 3 | 코드 생성·가져오기 | `mcu-config`, `hal-generator`, `peripheral-files`, `build-environment`, `ioc-export`, `ioc-circuit`, `firmware-import`, `ra-config`, `ra-generator`, `ra-usb-descriptor`, `ra-lpm`, `ra-data-flash` | 미착수 |
| 4 | 회로 | `engine`(회로 풀이), `pins`, `components`, `breadboards`, `geometry`, `wire-router`, `wire-*`, `circuit-*`, `catalog-*`(그림 제외), `devboards`, `l298n`, `placement`, `project`, `project-overrides` | 미착수 |
| 5 | 에뮬레이터 | `emu/cpu`, `emu/bus`, `emu/machine`, `emu/scs`, `emu/elf`, `emu/stm32f446/*`, `emu/stm32f103/*`, `emu/ra6e1/*` | 미착수 |
| 6 | 인터프리터 | `runtime`, `hal`, `hal-*`(타이머·DMA·RTC·저장장치 등), `fsp-interp`, `fsp-*` | 미착수 |
| 7 | 세션·부품 모델 | `session`, `firmware-session`, `buses`, `device-buses`, `signals`, `wireless`, `sdcard`, `lcd`, `ds3231`, `sensors`, `camera`(계산), `logic-analyzer`(계산), `variable-graph`, `trace`, `debug-tools` | 미착수 |
| 8 | 예제·부품 자료 | `*-examples`, `example-*`(배치·배선), `device-*`(Docs·예제), `part-datasheets`, `device-catalog-data`, `update-log-data` | 미착수 |
| 9 | 데스크톱 쪽 로직 | `desktop/*.cjs`(빌드·디버그 도구 실행, 작업 공간, 도구 설치, 진단, 업데이트) | 기능 목록 59번(Tauri 전환)에서 Rust(Tauri 명령)로 옮긴다 |

남기는 것(화면): `app*.js`, `shell.js`, `*-ui.js`, `inspector.js`, `monitor.js`, `code-editor.js`, `editor-search.js`, `render.js`·`part-render.js`·`part-art.js`·`catalog-render.js`(캔버스·SVG 그리기), `popout.js`, `file-drop.js`, `keybindings.js`, 테마, `part-images.js`(그림 데이터), Electron 주 프로세스의 창·메뉴·파일 대화상자.

## 확인할 것

- 실행 중 경로(5~7단계)는 옮긴 뒤 속도를 잰다 — WebAssembly 경계를 넘는 횟수가 많으면 오히려 느려지므로, 한 프레임의 일을 한 번의 호출로 묶는다.
- `src/rust/stm-core.wasm.js`의 크기(1.63.3에서 약 0.43 MB의 WebAssembly)가 단계마다 얼마나 늘어나는지 적는다.
