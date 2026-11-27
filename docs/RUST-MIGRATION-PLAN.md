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
| 1 | 설정 계산 | `clock-tree`, `adc-config`, `dac-config`, `rtc-config`, `timer-config`, `wdg-config`, `nvic-config`, `gpio-config`, `serial-config`, `bus-config`, `pin-tolerance`, `mcu-family`, `mcu-defaults` | 완료(1.63.4) — `clock-tree`(1.63.3), 나머지(1.63.4). `pin-tolerance`는 `ra-config`·`pins`에 기대므로 3·4단계에서 옮긴다 |
| 2 | C 소스 도구 | `c-format`, `c-symbols`, `c-struct-fields`, `c-source-edit`, `source-files`, `irq-handlers` | 완료(1.63.5) |
| 3 | 코드 생성·가져오기 | `mcu-config`, `hal-generator`, `peripheral-files`, `build-environment`, `ioc-export`, `ioc-circuit`, `firmware-import`, `ra-config`, `ra-generator`, `ra-usb-descriptor`, `ra-lpm`, `ra-data-flash` | 진행 중 — `hal-generator`, `mcu-config`의 표·검사·문제 목록(1.63.6), `peripheral-files`와 `mcu-config`의 나머지(generateHal, .ioc 가져오기, UART 콘솔)(1.63.7), `ioc-export`와 `build-environment`(1.63.8), `ra-config`(1.63.9), `ra-generator`(1.63.10). 3단계에서 옮길 것은 끝났다. `ra-usb-descriptor`(글 자료와 프로젝트에 파일을 더하는 함수)는 4단계(프로젝트)에서 함께 옮긴다. `ra-lpm`(실행 로그 클래스)과 `ra-data-flash`(에뮬레이터 버스와 메모리를 함께 쓰는 클래스)는 실행 중 상태를 가지므로 5단계(에뮬레이터)에서 엔진과 함께 옮긴다. `ioc-circuit`과 `firmware-import`는 프로젝트·회로 모듈(`project`, `boards`, `pins`, 예제 회로)에 기대므로 4단계에서 함께 옮긴다 |
| 4 | 회로 | `engine`(회로 풀이), `pins`, `components`, `breadboards`, `geometry`, `wire-router`, `wire-*`, `circuit-*`, `catalog-*`(그림 제외), `devboards`, `l298n`, `placement`, `project`, `project-overrides` | 진행 중 — `project-overrides`(1.63.11), `boards`·`device-defs`·`catalog-defs`와 자료 표(`device-catalog-data`, `part-datasheets`, `l298n`·`wireless`의 표)(1.63.12), `components`(1.63.13), `geometry`와 `pins`의 표(1.63.14), `placement`·`breadboards`(1.63.15), `devboards`(1.63.16), `project`(1.63.17). 4단계의 나머지는 7·8단계의 자료 모듈(`device-defs`, `catalog-defs` ← `device-catalog-data`·`part-datasheets`·`wireless`, `signals`, `sdcard`, `camera`)에 기대므로, 그 잎 모듈부터 올라가며 옮긴다(단계 번호보다 의존 순서를 따른다) |
| 5 | 에뮬레이터 | `emu/cpu`, `emu/bus`, `emu/machine`, `emu/scs`, `emu/elf`, `emu/stm32f446/*`, `emu/stm32f103/*`, `emu/ra6e1/*` | 미착수 |
| 6 | 인터프리터 | `runtime`, `hal`, `hal-*`(타이머·DMA·RTC·저장장치 등), `fsp-interp`, `fsp-*` | 미착수 — 인터프리터의 앞 단계인 `parser`, `c-types`, `c-expression-type`, `hal-source`, `c-inline`, `irq-duplicates`도 여기서 옮긴다(실행 중 연산마다 불리는 코드라 인터프리터와 떨어뜨리면 느려진다) |
| 7 | 세션·부품 모델 | `session`, `firmware-session`, `buses`, `device-buses`, `signals`, `wireless`, `sdcard`, `lcd`, `ds3231`, `sensors`, `camera`(계산), `logic-analyzer`(계산), `variable-graph`, `trace`, `debug-tools` | 미착수 |
| 8 | 예제·부품 자료 | `*-examples`, `example-*`(배치·배선), `device-*`(Docs·예제), `part-datasheets`, `device-catalog-data`, `update-log-data` | 미착수 |
| 9 | 데스크톱 쪽 로직 | `desktop/*.cjs`(빌드·디버그 도구 실행, 작업 공간, 도구 설치, 진단, 업데이트) | 기능 목록 59번(Tauri 전환)에서 Rust(Tauri 명령)로 옮긴다 |

남기는 것(화면): `app*.js`, `shell.js`, `*-ui.js`, `inspector.js`, `monitor.js`, `code-editor.js`, `editor-search.js`, `render.js`·`part-render.js`·`part-art.js`·`catalog-render.js`(캔버스·SVG 그리기), `popout.js`, `file-drop.js`, `keybindings.js`, 테마, `part-images.js`(그림 데이터), Electron 주 프로세스의 창·메뉴·파일 대화상자.

## 4단계부터의 경계(호출 방식)

1~3단계는 "설정이 바뀔 때 한 번" 부르는 코드라 JSON으로 주고받아도 됐다. 4단계부터는 자주 불리는 코드가 섞여 있어 호출 방식을 셋으로 나눈다(2026-11-27 구현 세션이 정함).

| 불리는 빈도 | 예 | 방식 |
|---|---|---|
| 편집할 때 한 번 | 보드 표·검색, 프로젝트 검사(`project`), 배선 위상(`circuit-topology`), 자동 배선(`wire-router`), 부품 놓기(`placement`), 회로 진단, 가져오기(`firmware-import`, `ioc-circuit`) | 지금처럼 JSON(`rustFn`·`rustExact`), 표는 `rustTable` |
| 그릴 때마다(프레임·부품마다) | `geometry`의 행렬·좌표 함수, `wire-path`, `pins`의 좌표 조회 | 숫자만 오가는 WebAssembly export(`duty`처럼). 답이 여러 숫자면 공유 메모리의 `Float64Array`에 써서 읽는다. JSON을 거치지 않는다 |
| 시뮬레이션 단계마다 | 회로 풀이(`engine`의 `solveCircuit`), 이후 5~7단계의 에뮬레이터·인터프리터·부품 모델 | Rust 쪽에 상태를 둔다: 프로젝트를 한 번 올려 핸들을 받고(`circuit_load`), 단계마다 바뀐 값(GPIO, 눌린 버튼, 시간)만 숫자로 넘겨 풀고, 결과는 필요한 것만 읽는다(전압·전류 조회). 단계마다 프로젝트 전체를 JSON으로 보내지 않는다 |

- 순서: ① 표와 편집 때 계산(`boards`, `pins`·`components`·`breadboards`·`devboards`의 표와 검사, `project`, `project-overrides`, `placement`, `circuit-topology`, `firmware-import`, `ioc-circuit`, `ra-usb-descriptor`) → ② 그리기용 숫자 함수(`geometry`, `wire-path`, `wire-ends`) → ③ 회로 풀이(`engine`, `l298n`, `catalog-electrical`·`catalog-model`, 상태를 Rust에 둠) → ④ 자동 배선·회로 편집·진단.
- ③은 풀이 결과 객체(`voltage(key)` 같은 함수를 가진 객체)를 쓰는 곳이 많다. JavaScript 층이 같은 모양의 객체를 주되, 그 함수들이 Rust의 핸들에서 값을 읽게 한다.
- 결과 같음 비교(63번 ③)는 ②③에도 같은 방법을 쓴다: 옮기기 전 함수와 같은 입력으로 불러 숫자까지 같은지 본다(부동소수 연산 순서를 그대로 옮긴다).
- 시간 측정: ②③은 옮기기 전후의 호출 시간을 재서 느려지지 않았는지 VERIFICATION에 적는다(61번의 기준선이 된다).

### 숫자를 옮길 때 지킬 것 (1.63.12~1.63.14에서 확인)

- 초월 함수(`pow`, `exp`, `sin`, `cos`, `tan`, `atan`, `atan2`, `hypot` …)는 `jsmath.rs`의 것을 쓴다. WebAssembly에서는 호스트의 `Math` 함수다. Rust 표준 라이브러리의 것은 V8과 마지막 자리가 다를 때가 있다.
- 사칙연산은 JavaScript와 같은 순서로 쓴다(IEEE 754라 같은 순서면 같은 답). `Math.round`(반은 위로), `Math.min`·`Math.max`(NaN이면 NaN), `%`(부호는 나뉘는 수), `toFixed`는 Rust의 것과 규칙이 달라 따로 쓴 함수를 쓴다(`raconfig::js_round`·`to_fixed3`, `geom`의 `least`·`most`).
- JSON으로 받는 소수는 `serde_json`의 `float_roundtrip`이 켜져 있어야 JavaScript의 값과 정확히 같다(1.63.14에서 켬).
- 숫자를 글로 찍을 때는 `mcu::js_number`(JavaScript의 `Number::toString` 규칙).
- NaN·Infinity·undefined는 JSON에 실리지 않는다. 구별해야 하는 호출은 `rustExact`를 쓴다.
- 그릴 때·풀 때마다 불리는 함수는 `rustNumber`(숫자 export)로 내거나, 부품 객체별로 답을 기억한다(`components.js`의 `shape`). Rust 호출의 고정 비용은 약 3 µs, WebAssembly 안에서 serde 객체를 많이 만들면 느리다(숫자 목록으로 보낸다).

### 남은 4단계 모듈의 설계 메모 (2026-11-27)

- `pins.js`: 헤더 핀·브레드보드 구멍 표와 보드별 차이는 Rust가 만든다. `PINS`·`GPIO_PINS`(제자리에서 바뀌는 배열), `PIN_BY_ID`·`HOLE_BY_ID`(Map), `BOARD`(보드에 맞춰 크기가 바뀜), `setActiveBoard`는 여러 화면 모듈이 객체 그대로 잡고 있어 JavaScript 층이 껍데기를 유지한다. 브레드보드 부품의 구멍 좌표(400·830개)는 부품 상태별로 Rust에 한 번 물어 숫자 목록으로 받는다.
- `endpointInfo`·`holeInfo`·`endpoints`처럼 "프로젝트의 부품 목록 + id"로 찾는 함수와 회로 풀이(`engine`)는 호출마다 프로젝트를 JSON으로 넘길 수 없다. Rust 쪽에 회로(부품·전선·표면)를 올려 두고 핸들로 묻는 구조가 필요하다. JavaScript의 프로젝트 객체는 화면 곳곳에서 제자리에서 고쳐지므로, "언제 다시 올릴지"를 정하는 것이 핵심이다: 편집 동작이 끝나는 지점(app-core의 변경 알림)에서 한 번 올리고, 그 사이의 조회는 올려 둔 것을 쓴다. 이 구조는 `project.js`(검사) → `pins`의 조회 → `circuit-topology` → `engine` 순으로 같은 핸들 위에 쌓는다.
- `l298n`의 함수, `button-bounce`, `wireless`의 클래스는 회로 풀이·세션과 한 몸이라 그때 함께 옮긴다.

## 확인할 것

- 실행 중 경로(5~7단계)는 옮긴 뒤 속도를 잰다 — WebAssembly 경계를 넘는 횟수가 많으면 오히려 느려지므로, 한 프레임의 일을 한 번의 호출로 묶는다.
- `src/rust/stm-core.wasm.js`의 WebAssembly 크기: 1.63.3 약 0.43 MB → 1.63.4 약 0.72 MB(표를 `json!`으로 만드는 코드와 preserve_order가 늘린다). → 1.63.5 약 0.92 MB(정규식 엔진 regex-lite 포함) → 1.63.6 약 1.14 MB → 1.63.7 약 1.27 MB → 1.63.8 약 1.42 MB → 1.63.9 약 1.62 MB → 1.63.10 약 1.82 MB → 1.63.11 약 1.84 MB → 1.63.12 약 2.02 MB(자료 표 JSON 약 130 KB 포함) → 1.63.13 약 2.05 MB → 1.63.14 약 2.12 MB → 1.63.15 약 2.16 MB → 1.63.16 약 2.18 MB → 1.63.17 약 2.31 MB. 61번(최적화)에서 줄일 곳으로 적어 둔다.
