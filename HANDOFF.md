# STM Simulator — 개발 인계

현재 버전: **1.37.0**. 정리일: **2026-11-10**. NUCLEO-F446RE·NUCLEO-F103RB 또는 Renesas FPB-RA6E1(1.20.0, FSP·에뮬레이터 전용)과 빵판을 연결하고 HAL C 소스를 해석 실행하거나, ARM GCC로 빌드한 ELF를 Cortex-M 에뮬레이터(STM32F446·STM32F103 모델)에서 실행하는 Windows 학습용 IDE다. 사용자에게는 한국어 존댓말로 응답한다. 공개 릴리스와 로컬 구현 버전을 구분한다.

## 1.37.0 해석기 C 문법 2차·HAL 관용구, 소스 이름 충돌, CI 묶음 균형

1.36.0 뒤의 오류 탐색(관용구 103개, RTC·DAC 무작위 설정 394개, .ioc 무작위 왕복 4,751개, 끌어다 놓기·이름 변경 경계 사례)에서 찾은 것을 고쳤다.

- **해석기 C 문법(`parser.js`·`hal-source.js`·`runtime.js`)**
  - 쉼표 연산자: `sequence()`가 식 문장과 for의 초기·증감식에서만 `{type:'sequence',exprs}`를 만든다(인자·초기값 목록의 쉼표는 그대로 구분자). 값은 마지막 식.
  - `#if` 식과 `#elif`: `hal-source.js` `evalCondition(text, definitions)` — `defined(X)`/`defined X`, 매크로 값(빈 매크로는 1, 모르는 이름은 0), 정수 리터럴과 정수 연산자(`?:` 포함). 건너뛰는 블록 안의 조건은 계산하지 않는다. 조건 스택의 `yes`는 "이 #if에서 이미 한 가지를 골랐다"는 뜻이다.
  - 구조체: 필드 다중 선언(`int x, y;`), 포인터 필드(`const char *name;` `uint8_t *buf;` `In *in;` — 셀 `dataType:'pointer'`, 크기 4). 포인터 배열 필드는 안내 오류.
  - `GPIO_TypeDef *`: 포트는 이름(문자열 `'GPIOA'`)이라 `spec()`이 `{type:'uint32_t', port:true}`를 돌려주고 `declarator`가 `*`(와 `*const`)를 삼켜 보통 4바이트 값으로 선언한다. 변수·표·매개변수·구조체 필드·반환형에 쓸 수 있고 `==`로 비교된다. `포트->레지스터`는 `reference()`가 "레지스터 직접 접근은 지원하지 않습니다"로 알린다.
  - 매크로: 본문이 `do`·`{`·`if`·`for`·`while`·`switch`·`return`으로 시작하면 괄호 없이 붙인다(문장형). 줄 끝 `\`는 다음 줄과 잇고, 이어진 줄은 빈 줄로 남겨 줄 번호를 지킨다.
  - `inline`(무시), `<stdlib.h>`(`atoi`·`atol`·`rand`·`srand` — `hal.js`), `__HAL_GPIO_EXTI_GET_IT/GET_FLAG/CLEAR_IT/CLEAR_FLAG`(`extiPending`), `HAL_DAC_IRQHandler`(`hal-dac.js` `invoke`, 하는 일 없음).
  - 고친 계산: 포인터 배열 `sizeof`(요소 4바이트 × 개수, `expressionType`의 `pointerElements`), 포인터와 배열의 `==`(배열을 첫 요소 포인터로), 포인터 값으로 둔 문자열 리터럴의 인덱싱(`cmds[i].name[1]` — `pointerCell`이 리터럴마다 문자 배열 하나를 둔다).
  - 여전히 안내 오류: 다차원 배열, union, goto, 함수 포인터, 지정 초기화, `uint64_t`/`int64_t`, 레지스터 직접 접근.
- **소스 이름 충돌(`source-files.js` `nameClash(names, name)`)**: `'main'`(어느 폴더·대소문자의 main.c), `'same'`(대소문자 무시), `'folder'`(파일 이름이 다른 소스의 폴더이기도 함). `changeSourceFile`·`planDrop`(겹치는 것은 `skipped`로)·`importFirmware`(경고)·`validateProject`가 같은 함수를 쓴다. 이름 변경·삭제는 `resolveInclude`로 그 파일을 가리키는 `#include`만 바꾸거나 센다(`Core/Inc/app.h`와 `Drivers/app.h`).
- **.ioc 내보내기**: 꺼 둔 NVIC 줄도 `false:우선순위:…`로 쓰고, F103RB RTC 요일을 쓴다.
- **CI**: 툴체인 시험을 `scripts/toolchain-shard.mjs <n>`의 3묶음으로 실행한다(1.36.0 측정 시간으로 균형: 162·159·150초. `--test-shard`는 196·99·182초였다). 새 툴체인 시험 파일은 이 목록에 넣어야 하며, 빠지면 `tests/unit/toolchain-shards.test.js`가 실패한다. 1.36.0 전체 5.0분(1.35.0 6.6분).
- 시험: 해석기 `c-idioms-2`·`c-idioms-3`·`probe-regressions`, 단위 `source-name-clash`·`toolchain-shards`.

## 1.36.0 .ioc 내보내기, 해석기 C 문법 보강, CI 추가 분할

- **.ioc 내보내기(`src/ioc-export.js` `exportIoc(mcu)`)**: `importIoc`의 역방향. Mcu.*·핀 Signal과 GPIO 속성(Label·PuPd·EXTI 모드·PinState·Speed·Open Drain)·주변장치 매개변수(UART·I2C·SPI·TIM 채널/모드/TRGO/One Pulse/Repetition/DeadTime·ADC Rank/트리거·IWDG·WWDG·RTC·DAC)·DMA·NVIC·RCC(클록 트리)를 CubeMX 키 이름으로 쓴다(키의 공백·`#`와 값의 `:`는 Java properties 방식으로 이스케이프). `desktop/main.cjs` `firmware:export-ioc`는 저장 전에 그 텍스트를 `importIoc`로 읽어 본다. Pinout `#pinout-export-ioc`. 검증: `importIoc(exportIoc(v)).config`가 `v`와 같은지(모든 종류를 넣은 설정 1건, 두 보드 무작위 유효 설정 120건). **CubeMX에서 실제로 여는 것은 확인하지 못했다**(빌드 PC에 CubeMX 없음): 핀 이름은 `PA0-WKUP` 같은 CubeMX 고유 표기 대신 `PA0`을 쓰고, Project Manager 구역과 계산된 `*Freq_Value`는 타이머 클록만 쓴다.
  - 가져오기 쪽: CubeMX는 Rank마다 채널을 늘 쓰므로, 기본 순서(ADC 핀 채널 오름차순)와 같은 `ranks`는 저장하지 않는다.
- **해석기 C 문법(관용구 25개 검사)**: `parser.js` `typedef struct { … } Name;`·`typedef struct Tag { … } Name;`·`typedef struct Tag Name;`(Tag와 Name이 같은 구조체). `hal-source.js` `expandMacros`: 함수형 매크로를 뒤따르는 줄에서 글자대로 전개(문자열·멤버 접근 `s.NAME(`는 건드리지 않음, 중첩 20회까지, `#`/`##`와 가변 인자는 오류 안내). `runtime.js` `MATH_FUNCTIONS`와 `c-expression-type.js`: `<math.h>` 함수와 `f` 접미 실수형, 반환형을 double/float로 인식(이전에는 모르는 함수를 int로 보아 `sqrtf(a)+fabsf(b)`가 정수로 잘렸다). 아직 안 되는 것(안내 오류): 다차원 배열, union, goto, 함수 포인터, 지정 초기화(`.x = 1`).
- **CI**: ESP32 스케치 빌드를 2조각으로(`ESP32_SHARD=n/m`, 스케치별 시간 출력). 1.33.0 8.0분 → 1.35.0 6.6분(가장 긴 작업 ESP32 5.8분, 컴파일 캐시는 시간을 줄이지 못함: 스케치마다 라이브러리를 다시 컴파일).
- 시험: 단위 `ioc-export`, 해석기 `c-idioms`, E2E `ioc-export`.

## 1.35.0 기능 목록 10~13번: 폴더 구조, 드래그 앤 드롭, 모든 파일 수정, .ioc로 회로 초안

- **10번 폴더 구조(`src/source-files.js`)**: 소스 이름 = 파일 이름 또는 폴더 여섯 단계까지의 경로(`SOURCE_PATH`, 점으로 시작하는 폴더·`..` 불가). `MAX_SOURCE_FILES` 120·`MAX_SOURCE_BYTES` 1 MB(이전 40개·300 KB). `resolveInclude(names, include, from)`: 같은 폴더 → 루트 기준 경로 → 경로 끝 일치 → 이름 순. `firmware.mainFolder`(가져온 main.c가 있던 폴더, 예 `Core/Src`)는 표시와 빌드 배치에 쓴다(내부 키는 그대로 `main.c`).
  - 가져오기(`desktop/main.cjs` firmware:import 폴더): 루트부터 6단계까지 걸으며 `.c/.h`(루트는 `.ioc`도)를 상대 경로로 읽는다. 제외: Drivers·Middlewares·Debug·Release·build·Startup·점 폴더, `syscalls.c`·`sysmem.c`·`system_stm32*.c`(앱이 넣음; 사용자가 원하면 11번의 복사로 가져온다). `firmware-import.js`가 `Core/Src/main.c`를 주 소스로 삼는다.
  - 빌드(`native-build.cjs`): 파일을 경로대로 쓰고 폴더마다 `-I`. `*_hal_conf.h`·`main.h`·`system_*.c` 유무는 파일 이름(basename)으로 본다. 컴파일러·GDB는 폴더 없는 이름을 돌려주므로 `native-ide-ui.js` `projectFileName`이 프로젝트 경로로 되돌린다. GDB 파일 목록은 basename으로 준다.
  - 해석기(`hal-source.js`): include를 `resolveInclude`로 찾고, ARM 전용 파일(`Drivers/`·`Middlewares/` 아래, syscalls·sysmem·system_stm32*)은 프로그램에서 뺀다.
- **12번 드래그 앤 드롭(`src/file-drop.js`)**: `readDropped`(DataTransfer, 폴더는 `webkitGetAsEntry`로 걸음)와 순수 함수 `planDrop(dropped, project)` → `open`(.stm32lab 하나) / `import`(.ioc나 main.c 포함: 한 폴더를 놓으면 그 폴더가 루트) / `add`(소스 추가, 같은 이름은 교체). 실행 중에는 받지 않는다. `app.js`가 처리기를 건다. 끄는 동안 `body.file-drop-target` 표시.
- **11번 모든 파일 수정**: 읽기 전용 보기(앱이 넣는 `Core/Src/stm32xxxx_it.c`·`syscalls.c`·`sysmem.c`, SDK 소스·헤더)의 경로 줄에 `#copy-to-project` 단추(`ide-ui.js` `copyToProject`). 복사본은 같은 경로의 프로젝트 파일이 된다. `buildEnvironment`는 사용자 소스에 있는 핸들러를 건너뛰고 시스템 호출은 weak이므로 복사본이 이긴다. SDK 소스 복사본이 있으면 `native-build.cjs`가 그 모듈의 SDK 파일을 빼고 복사본을 컴파일한다(헤더는 프로젝트 폴더 include가 앞). 빌드 파일 목록은 복사한 파일을 더 보여 주지 않는다. main.c의 이름 변경·삭제와 실행 중 편집 잠금은 그대로 둔다(주 소스 키, 실행 중인 프로그램과의 불일치 방지). 어셈블리(startup .s)와 링커 스크립트는 복사 대상이 아니다.
  - `code-editor.js`를 바꾸면 `npm run build:editor`로 번들을 다시 만들어야 앱에 반영된다.
- **13번 .ioc로 회로 초안(`src/ioc-circuit.js`·`ioc-circuit-ui.js`)**: `suggestCircuit(mcu)` → 제안 목록(출력→LED+330 Ω, 라벨 BUZZ→부저, 입력·EXTI→버튼(Pull-down이면 3.3 V 쪽), ADC→가변저항, PWM 채널→LED·라벨 SERVO→서보, I2C→메모리·라벨에 OLED가 있으면 OLED, SPI→메모리+라벨이 CS/NSS로 끝나는 출력, UART→터미널). 보드 내장(PA5 LD2·PC13 B1·PA2/PA3 ST-LINK)과 제어 핀(라벨이 CS·DC·RST 등으로 끝남)은 이유와 함께 목록에만 둔다. `buildCircuit(project, chosen)`은 모델 부품과 넷(부품 단자 배선)을 만들고 `physicalExample` + `arrangeExampleOnBreadboards`가 배치·배선한다. 회로가 없는 프로젝트에 .ioc를 가져오면 대화상자가 뜨고, Pinout의 `#pinout-circuit`으로 언제든 연다(기존 회로는 교체, Ctrl+Z).
- **오류 탐색에서 고친 것**: 무작위 Pinout 설정을 생성 → 해석기 실행(800개), ARM GCC 빌드 → 에뮬레이터 실행(220개) 검사. ① 워치독이 수 ms 안에 계속 리셋되면 "실행 한도" 오류 → 원인 안내(`hal-wdg.js` expire). ② CHxN 핀만 잡은 채널의 `ConfigChannel` 누락(`hal-generator.js`), 해석기의 CHxN 단독·`HAL_TIMEx_OCN_Start` 지원(`hal-timers.js` `mainPin`). ARM 쪽은 220개 모두 빌드·실행.
- **CI**: 툴체인 시험 3조각·E2E 4조각·ESP32 빌드 캐시(1.34.0 커밋). 1.33.0 8.0분 → 1.34.0은 ESP32 캐시를 새로 만드는 첫 실행이라 8.5분(나머지 작업은 4.7분 안), 1.35.0에서 효과를 확인.
- 시험: 단위 `source-paths`·`file-drop`, 해석기 `ioc-circuit`, 툴체인 `source-folders`·`copied-files`, E2E `folder-import`·`file-drop`·`copy-to-project`·`ioc-circuit`.

## 1.34.0 ADC 다채널·외부 트리거, 타이머 TRGO·One Pulse, NRST, 에뮬레이터 안내

- **ADC1 정규 그룹(`src/adc-config.js`)**: `ADC1.conversions`(Number Of Conversion 1~16, 2 이상이면 Scan), `ranks`(Rank별 채널, 없으면 ADC 핀 채널 오름차순), `trigger`(`T2_TRGO`·`T3_TRGO`·`T8_TRGO`, F103은 `T3_TRGO`). `adcRanks(config)`·`adcGroupProblems`(Rank 채널에 핀이 없음, 트리거 타이머가 꺼졌거나 TRGO가 Update가 아님)·`adcGroupFromIoc`. 생성: ScanConvMode·NbrOfConversion·Rank마다 `HAL_ADC_ConfigChannel`, 트리거면 `ExternalTrigConv`(+F4 `ExternalTrigConvEdge = RISING`). 해석기(`hal.js`): 트리거가 있으면 `HAL_ADC_Start_IT`가 그 타이머의 갱신 주기마다 그룹을 변환(콜백은 변환마다). 폴링 `HAL_ADC_Start`는 안내 오류.
- **타이머**: `trgo`를 모든 타이머에 허용(이전에는 TIM6/7만), `onePulse`(엔코더 제외) → `HAL_TIM_OnePulse_Init(&htimX, TIM_OPMODE_SINGLE)`. 해석기 `hal-timers.js` `onePulse()`: 다음 갱신에서 인터럽트를 한 번 내고 카운터를 0에서 멈춘다(PWM1 출력은 CNT<CCR 수준). .ioc: `TIMx.TIM_MasterOutputTrigger`, `VP_TIMx_VS_OPM.Mode`.
- **NRST**: `engine.js`가 NRST 헤더 핀에 배선이 있으면 내장 풀업(40 kΩ)을 넣고, 두 세션의 `checkNrst()`가 틱 끝에 `signal:NRST` 전압이 0.8 V 아래면 리셋한다(해석기 `runtime.restart()`·`resetCause=26`, 에뮬레이터 `soc.systemReset('PIN')`: CSR에 PINRSTF만). LOW인 동안은 틱마다 다시 리셋된다.
- **에뮬레이터 안내**: `machine.describeFault`가 `describeAddress`(SoC `addressHint`)로 주소 설명을 붙인다. `stm32f446/soc.js` `MISSING`(USB_OTG_FS/HS·FMPI2C1·SAI·SPDIFRX·CEC·QUADSPI·FMC·BKPSRAM), F103은 USB. `emu/bus.js` `BusF103`: 플래시 128 KB·RAM 20 KB 밖 접근은 BusFault(`firmware-session.js`가 F103 프로젝트에 사용).
- 시험: 해석기 `adc-group`·`timer-opm`·`nrst`, 툴체인 `adc-group`(스캔+TIM3 트리거, One Pulse, 두 보드)·`emu-accuracy`(없는 주변장치·F103 RAM 한도·NRST), E2E `adc-group`. 예제 271개 ARM 빌드·실행은 F103 메모리 한도를 넣은 뒤에도 통과.
- 남음: 버튼 채터링, STOP/Standby, FLASH Latency 검사, ADC 트리거의 폴링·DMA(해석기), Injected 채널.

## 1.33.0 다시 생성할 때 사용자 코드 유지(기능 9번), TIM1·TIM8

- **다시 생성(`src/c-source-edit.js`)**: `topLevelItems(source)`가 USER CODE 구역 밖의 최상위 항목(함수·선언·전처리 줄, 바로 위 주석과 같은 줄 뒤 주석 포함)을 나누고, `adoptOutsideCode(previous, generated, previousDefault)`가 생성기가 쓰지 않는 항목(같은 이름의 함수·같은 선언이 생성 코드에 없는 것)을 구역 안으로 옮긴다: `#include` → Includes, main 앞 선언·`#define`·타입 → PV, main 앞 함수 → 0, main 뒤 → 4. 생성기와 같은 이름의 콜백·핸들러라도 안에 USER CODE 구역이 없으면 사용자가 쓴 것으로 보고 옮기고, `dropShadowedCallbacks`가 생성된 쪽을 뺀다. `regenerateMain(previous, generated, previousDefault, others)` = 옮기기 + `keepUserCode` + 중복 핸들러·콜백 제거, `{code, moved}`를 돌려준다. Pinout 코드 버튼(`pinout-ui.js` commit → `app.js` apply가 `moved`를 경고로 기록)과 .ioc 가져오기(`firmware-import.js`)가 이것을 쓴다. PV·4 구역이 없는 직접 쓴 main.c는 건드리지 않는다.
- **예제**: `hal-examples.js`의 `tidyExampleSource`가 적용할 때 같은 함수로 예제의 보조 함수·전역을 구역 안에 넣는다(예제 260개를 다시 생성해도 함수 손실 0, 이전 69개).
- **Pinout 코드 생성**: `app.js` apply가 `firmware.files`를 비우던 것을 HAL 프로젝트면 유지하게 했다.
- **TIM1·TIM8(`timer-config.js`)**: `TIMER_ROUTES`에 TIM1(PA8~PA11, CHxN PA7/PB13·PB0/PB14·PB1/PB15, AF1)·TIM8(PC6~PC9, CHxN PA5/PA7·PB0/PB14·PB1/PB15, AF3). `isAdvancedTimer`, `timerIrq(id, f1)`(갱신: F4 `TIM1_UP_TIM10_IRQn`·`TIM8_UP_TIM13_IRQn`, F1 `TIM1_UP_IRQn`), `timerCcIrq(id)`(`TIMx_CC_IRQn`, 다른 타이머는 같은 줄), `timerOfIrq`는 세 이름 모두 인식. F103은 `F1_REMAPS.TIM1`(부분 리맵이 CHxN만 PA7/PB0/PB1로 옮김).
- 설정: 타이머에 `repetition`(RCR 0~255)·`deadTime`(DTG 0~255), 0이 아니면 저장. CHxN 핀은 PWM·출력 비교 모드에서만. 생성: `RepetitionCounter`, 채널의 `OCNPolarity`·`OCIdleState`·`OCNIdleState`, `HAL_TIMEx_ConfigBreakDeadTime`(Break 꺼짐), 예제 시작 줄에 `HAL_TIMEx_PWMN_Start`/`OCN_Start`. 채널 인터럽트 시작(`_IT`)은 `timerCcIrq` 줄이 켜졌을 때.
- 해석기(`hal-timers.js`): 갱신 인터럽트는 Repetition + 1 주기마다, 캡처/비교는 CC 줄 대기열. `HAL_TIM_IRQHandler`는 실행 중인 핸들러의 줄을 비운다. `HAL_TIMEx_PWMN_Start/Stop`은 CHxN 핀에 채널 PWM의 반전을 낸다(데드타임 구간은 그리지 않고 한 번 안내, Break 입력은 오류 안내). `hal-nvic.js`에 TIM1/TIM8 줄 번호와 빠져 있던 `I2C3_EV/ER_IRQn`(72·73)을 넣었다.
- 시험: 단위 `regenerate`·`tim-advanced`, 해석기 `timer-advanced`, 툴체인 `tim-advanced`(실제 HAL, 두 보드: RCR·BDTR MOE·데드타임·CC1E/CC1NE·듀티 25 %/75 %, TIM8 CC 인터럽트), E2E `tim-advanced`·`ioc-import`(구역 밖 함수 유지).
- 남음: Break 입력·데드타임 파형(해석기), TIM9~14, One Pulse, 채널별 OCN 극성 설정.

## 1.32.0 I2C2·SPI2 (두 보드), I2C3·SPI3 (F446RE)

- `src/bus-config.js`: `I2C_IDS`·`SPI_IDS`, `isI2c`·`isSpi`, `i2cOf`·`spiOf`(핀 기능 → 인스턴스), `busHandle`(hi2c2·hspi3), 보드 헤더에 있는 핀만 담은 경로 `F4_BUS_ROUTES`·`F1_BUS_ROUTES`, F446 AF `busAf(fn, pin)`(I2C AF4, SPI1·2 AF5, SPI3 AF6, 예외: PC1 SPI2_MOSI AF7 / SPI3_MOSI AF5, PB0·PB2 SPI3_MOSI AF7). ST 공개 핀 데이터(STM32_open_pin_data, GPIO-STM32F446_gpio_v1_0_Modes.xml)와 대조했다. F103의 I2C2(PB10/PB11)·SPI2(PB13~15)는 리맵이 없다.
- `I2C1`·`SPI1`로 고정돼 있던 곳을 인스턴스 공통으로 바꿨다: `mcu-config.js`(검사·필수 핀·.ioc), `hal-generator.js`(핸들·AF·Init), `irq-handlers.js`(I2Cx_EV/ER, SPIx), `gpio-config.js`(I2C는 AF_OD, F1 SPI MISO는 입력), `pinout-ui.js`(매개변수 입력에 `data-i2c`·`data-spi`로 인스턴스 표시).
- 해석기(`hal.js`): 회로 쪽 I2C·SPI 엔진은 하나라서, `requireHandle`이 I2C·SPI 핸들을 볼 때 `selectBus(type, id)`가 그 인스턴스의 핀·속도로 엔진을 옮긴다(`busState`, `activeBus`, 신호 채널 이름 `buses.i2cId`·`spiId`). 전송이 순서대로 일어나므로 인스턴스마다 자기 핀의 부품만 보인다. I2C 슬레이브는 I2C1만(다른 인스턴스는 안내 오류), SD 카드 SPI 모드도 SPI1 핀만.
- 에뮬레이터(`stm32f446/tables.js`): PC1의 SPI2_MOSI·SPI3_MOSI AF가 뒤바뀌어 있었고 PC12 I2C2_SDA(AF4)·PB0 SPI3_MOSI(AF7)가 없었다.
- 시험: 단위 `bus-config`, 해석기 `bus-instances`, 툴체인 `bus-instances`(실제 HAL로 6개 조합: F446 I2C2·I2C3·SPI2·SPI3, F103 I2C2·SPI2), E2E `bus-instances`.
- 남음: I2C2/3·SPI2/3의 DMA 요청, I2S, SPI 슬레이브 NSS 하드웨어 모드.

## 1.31.0 IWDG·WWDG (두 보드)

- 설정: `mcu.peripherals.IWDG = {enabled, prescaler(4~256), reload(0~4095)}`, `WWDG = {enabled, prescaler(1/2/4/8), window(64~127), counter(64~127), ewi?}`. 기본값은 CubeMX와 같다(IWDG 4 / 4095, WWDG 1 / 64 / 64). `src/wdg-config.js`가 검사·시간 계산(`iwdgTimeoutMs`, `wwdgTiming`, `pclk1Hz`, `lsiHz`: F446 32 kHz, F103 40 kHz)·생성 줄·.ioc 읽기를 맡는다. `mcu-family.js`의 두 보드 `extra`에 `IWDG:{}`·`WWDG:{}`, `irqExtra`에 `WWDG_IRQn`.
- Pinout: `src/wdg-ui.js`(`wdgFields`·`bindWdg`). 카드가 타임아웃(IWDG)과 Refresh 가능 구간·리셋 시점(WWDG)을 보여 주고, Early wakeup interrupt를 켜면 NVIC `WWDG_IRQn`도 켠다.
- 생성: `MX_IWDG_Init`에는 클록 켜기가 없다(LSI). `MX_WWDG_Init`은 `__HAL_RCC_WWDG_CLK_ENABLE` 뒤 Init. `irq-handlers.js`가 `WWDG_IRQHandler → HAL_WWDG_IRQHandler(&hwwdg)`. EWI + NVIC이면 `HAL_WWDG_EarlyWakeupCallback`(USER CODE 안에서 `HAL_WWDG_Refresh`). IWDG를 켠 새 예제 루프는 `HAL_IWDG_Refresh` 뒤 타임아웃의 절반(최대 500 ms)만 쉰다.
- 해석기: `src/hal-wdg.js`(`HalWdg`, 확장 목록 마지막). IWDG 타임아웃과 WWDG 0x40→0x3F는 예약 이벤트에서 `r.restart()`, 창 밖 `HAL_WWDG_Refresh`는 `invoke`가 `{kind:'reset'}`을 내 그 자리에서 멈춘다. EWI는 `WWDG_IRQn` 대기열 → `HAL_WWDG_IRQHandler`가 비운다. 리셋 원인은 `hal.resetFlags`(RCC_CSR 비트 번호 집합, 전원 켤 때 POR·PIN, F4는 BOR도)에 두고, 세션의 reset 훅이 새 HAL에 `inheritReset(old)`로 넘긴다(`resetCause` 없으면 SFT). `__HAL_RCC_GET_FLAG`·`__HAL_RCC_CLEAR_RESET_FLAGS`.
- 에뮬레이터에서 고친 것(`stm32f446/system.js`): `Wwdg`가 카운터 기준점을 `this.base`에 둬 SoC의 주소 필드와 겹쳤다(→ `anchor`). HAL은 CR을 쓴 뒤 CFR을 쓰는데 CFR 쓰기가 일정을 다시 잡지 않아 Prescaler·EWI가 반영되지 않았다. `Iwdg.periodUs`가 F103에서도 32 kHz였다(`soc.lsiHz` 40000). F103 리셋 때 이전 CSR 플래그를 0x74가 아닌 0x24에서 읽게 했다(`rcc.csrOffset`).
- 시험: 단위 `wdg-config`, 해석기 `wdg`, 툴체인 `wdg`(실제 HAL, 두 보드: IWDG 리셋·EWI 유지·WWDG 늦은/이른 Refresh 리셋·리셋 플래그), E2E `wdg`.
- 남음: IWDG Window(F4 HAL에 없음), STOP/Standby에서의 동작, DBGMCU 정지 설정 UI.

## 1.30.1 .ioc만 가져올 때 main.c도 생성

- 사용자 보고: CubeIDE 프로젝트(OLED, STM32F103RBT6)의 .ioc를 가져왔는데 적용이 안 되는 것 같다. 가져오기 자체는 맞았지만(SPI1·I2C1 리맵·USART2·HSE 72 MHz·핀 라벨) `firmware-import.js`가 .ioc만 있으면 `mcu`만 바꾸고 코드는 그대로 둬, main.c에 MX_*_Init이 하나도 없었다.
- 이제 C 소스 없이 .ioc만 가져오면 Pinout의 코드 버튼과 같은 `keepUserCode(현재 코드, 새 생성 코드, 이전 설정의 생성 코드)` + `dropShadowedHandlers`로 main.c를 다시 만든다(`regenerated`를 돌려주고 로그에 알림). 현재 main.c에 `/* USER CODE BEGIN` 구역이 없으면(직접 쓴 코드) 바꾸지 않고 경고로 안내한다. 생성이 안 되는 설정이면 이유를 경고로 남기고 코드는 둔다.
- 시험: 단위 `project`(USER CODE 유지·직접 쓴 코드 유지), E2E `ioc-import`(대화상자를 바꿔 .ioc 하나를 가져와 Pinout·main.c·USER CODE 확인).

## 1.30.0 DAC (NUCLEO-F446RE)

- 기능 목록 3번의 다음 항목. STM32F103RB(중밀도)에는 DAC가 없다.
- `src/dac-config.js`: 프로젝트 `mcu.peripherals.DAC.channels.OUT1|OUT2`(trigger, buffer false, wave NOISE|TRIANGLE, amplitude 0~11 = MAMP)와 `validateDac`, `dacProblems`(채널 핀 필요), `dacInitLines`, `dacFromIoc`(DAC.DAC_Trigger/DAC_Trigger2, 버퍼·파형 키). 채널은 핀 기능 `DAC_OUT1`(PA4)·`DAC_OUT2`(PA5)로 켠다(mcu-family F4 extra `DAC`). GPIO 모드는 ANALOG(gpio-config, 해석기 HAL_GPIO_Init 검사). .ioc 핀 신호는 CubeMX F4가 쓰는 `COMP_DAC1_group`. Pinout 카드 `src/dac-ui.js`.
- DMA: `DAC1`(DMA1 Stream5 CH7)·`DAC2`(Stream6 CH7), 폭 HALFWORD, `__HAL_LINKDMA(&hdac, DMA_Handle1/2, …)`. 생성 코드는 DMA 없는 채널만 `HAL_DAC_Start`(DMA는 사용자의 표로 `HAL_DAC_Start_DMA`). `TIM6_DAC_IRQn`은 TIM6과 DAC가 함께 쓰는 줄이라 핸들러가 둘 다 부르고(irq-handlers), DAC만 켜져 있어도 NVIC 검사가 통과한다.
- .ioc 가져오기 수정: CubeMX는 요청이 한 채널뿐이면 `Dma.<요청>.n.Channel`을 쓰지 않아 채널이 0으로 읽혔다(이제 요청 표에서 찾음). `Mcu.IPn=DMA`가 "실행 모델 미지원"으로 나오던 것도 고쳤다.
- 에뮬레이터 `src/emu/stm32f446/dac.js`: CR(EN·TEN·TSEL·WAVE·MAMP·DMAEN, 채널 2는 16비트 위), SWTRIGR, DHR12R/12L/8R(1·2·D), DOR, SR. 트리거는 `soc.trigger(name)`(타이머 TRGO가 이미 보내던 것)로 받고 `triggerWanted`로 타이머가 TRGO 이벤트를 계속 만들게 한다. 아날로그 모드 핀(`gpio.js` mode 3)은 `soc.analogOutput(pin)`이 있으면 그 전압의 OUTPUT으로 알린다. 빌드 모듈에 `hal_dac`·`hal_dac_ex`(native-build F4_MODULES)를 넣었다.
- 내장 해석기 `src/hal-dac.js`: 핀 전압 = DOR/4095 × 3.3 V(runtime.gpio OUTPUT). 트리거 없으면 SetValue 즉시, TRGO 트리거는 해당 타이머(TRGO Update, 동작 중)의 갱신마다, Start_DMA는 hal-dma의 `start`(itemUs = 타이머 주기)로 표를 내보내고 Half/Cplt 콜백. 회로 재계산 부담 때문에 갱신 5 kHz까지(넘으면 에뮬레이터 안내). TIM8·EXTI9 트리거는 해석기에서 미지원.
- 시험: 단위 `dac-config`(3), 해석기 `dac`(3: SetValue와 ADC 되읽기, TIM6 DMA 표·콜백·TIM7 삼각파, 오류), 툴체인 `dac`(실제 HAL·에뮬레이터: 2048 → 1.65 V, TIM6 1 kHz DMA 계단, TIM7 삼각파 0~15), E2E `dac`.
- 남음: DMA 언더런 플래그·인터럽트, 출력 버퍼의 부하 특성(지금은 40 Ω 전압원), 해석기의 TIM8·EXTI9 트리거, DAC 예제(사인파 표).

## 1.29.0 RTC (두 보드)

- 기능 목록 3번의 다음 항목. CubeMX Timers › RTC의 주요 설정을 두 보드에 넣었다.
- `src/rtc-config.js`: 프로젝트 `mcu.peripherals.RTC`(clockSource LSE|LSI, time, date, hourFormat 12(F4만), alarm{시·분·초, F4 마스크·date}, wakeUp{clock, counter}(F4만))의 검증 `validateRtc`, `rtcInitLines`(MX_RTC_Init), `rtcFromIoc`(RTC.Hours·WeekDay·Hours_A·AlarmMask*·WakeUpClock·WakeUpCounter, RCC.RTCClockSelection/RTCFreq_Value, VP_RTC_VS_*). 생성 코드는 CubeMX 기본 Data Format처럼 BCD 값과 `RTC_FORMAT_BCD`를 쓴다: F1 HAL은 BIN 형식의 월(RTC_MONTH_DECEMBER = 0x12)을 바꾸지 않아 날짜가 멈추기 때문이다(실제 HAL·에뮬레이터 시험에서 확인). MSP 부분(LSE/LSI 켜기, `HAL_RCCEx_PeriphCLKConfig` RTC, F1 PWR·BKP 클록과 백업 접근, `__HAL_RCC_RTC_ENABLE`)도 MX_RTC_Init 안에 쓴다. 프리스케일러: F4 LSE 127/255, LSI(32 kHz) 127/249, F1 `RTC_AUTO_1_SECOND`.
- 주변장치 목록(`mcu-family.js` extra `RTC:{}`)과 NVIC: F4 `RTC_Alarm_IRQn`·`RTC_WKUP_IRQn`, F1 `RTC_IRQn`·`RTC_Alarm_IRQn`. 핸들러는 `irq-handlers.js`(HAL_RTC_AlarmIRQHandler, HAL_RTCEx_WakeUpTimerIRQHandler, HAL_RTCEx_RTCIRQHandler). Pinout 카드는 `src/rtc-ui.js`(값이 틀리면 카드에 바로 표시).
- 내장 해석기 `src/hal-rtc.js`(`HalRtc`, extensions): 2000-01-01부터의 초로 달력을 세고, 프리스케일러가 1 Hz가 아니면 그 비율로 빠르거나 느리게 간다. F4 요일은 쓴 값에서 자정마다 1씩, F1 요일은 HAL처럼 날짜로 계산(일요일 0). F1에서 BIN 형식으로 10~12월 상수를 쓰면 실제처럼 멈추는 대신 이유를 알리는 오류를 낸다. `catalog-peripherals.js`의 F4 `HAL_RCCEx_PeriphCLKConfig`는 I2S 외 설정에 HAL_ERROR를 돌려줬는데, RTC 선택(`RCC_PERIPHCLK_RTC`)은 성공으로 둔다.
- 에뮬레이터: F446 `Rtc`에 알람 A/B(ALRMAR/ALRMBR, MSK1~4·WDSEL, 1 Hz 갱신마다 비교, ALRAF/ALRBF → EXTI 17)를 넣고, RTC_ISR[13:8]은 쓰기 보호 없이 지울 수 있게 했다(RM0390 22.6.4, HAL 핸들러가 잠금 없이 지움 — 전에는 WakeUp 플래그가 안 지워져 한 번만 울렸다). F103은 `src/emu/stm32f103/rtc.js`의 `RtcF1`(CRH/CRL/PRL/DIV/CNT/ALR, CNF 설정 모드, RSF, SECF/ALRF/OWF, RTCCLK = RCC_BDCR RTCSEL·RTCEN·LSERDY, PWR DBP 쓰기 보호, RTC_IRQn·EXTI 17)와 `BkpF1`(DR1~DR10, RTCCR, CR, CSR). 주의: SoC가 주변장치의 `base`를 레지스터 주소로 쓰므로 모델 안에서 그 이름을 쓰면 안 된다(처음에 카운터 기준점을 `base`로 둬서 모든 접근이 NaN 주소가 됐다).
- 시험: 단위 `rtc-config`(3), 해석기 `rtc`(3), 툴체인 `rtc`(두 보드 실제 HAL: 23:59:58 → 다음 날, 00:00:02 알람 A, F4 1 Hz WakeUp), E2E `rtc`(F103 카드·생성·실행 출력과 알람, F446 12시간·WakeUp 생성).
- 남음: RTC 출력 핀(AFO_ALARM·512 Hz), Tamper·Timestamp, Alarm B 화면, SubSeconds 마스크, Smooth calibration, 리셋 뒤 달력 유지(에뮬레이터는 리셋 때 지움), F446 에뮬레이터 달력이 프리스케일러·클록과 무관하게 1초씩 가는 점.

## 1.28.2 부품 목록 겹침

- 부품 목록(`#part-list`)은 세로 flex 목록인데 카드(`.part-card`, `shell.css`)가 기본값 `flex-shrink:1`이라, 목록이 길면 카드가 내용 높이보다 작게 눌려 접힌 이름·설명이 다음 카드 위로 넘쳤다(사용자 화면 캡처). 카드에 `flex:0 0 auto`를 줬다. `workflow.e2e`가 목록을 220px로 좁혀 넘치는 카드가 없는지 본다.
- CI: E2E·패키지 작업의 Electron 받기를 최대 4번 시도(221b3d8, 1.28.1 CI의 E2E 1/3이 GitHub 504로 시험 전에 실패).

## 1.28.1 ARM GCC 빌드 속도 · CI 분할·재시도

- 사용자가 릴리스가 너무 오래 걸린다고 해서 원인을 찾았다(2026-11-09).
- `desktop/native-build.cjs` `build`: 번역 단위를 `os.cpus()`(최대 8)개씩 동시에 컴파일한다. 각 단위의 출력은 모았다가 소스 순서대로 쓰고, 첫 실패 단위로 오류를 낸다(빌드 탭·진단 동일). DWARF 4용 `--strip-debug` libgcc.a를 빌드마다 만들던 것(10 MB, 3.3초)을 `os.tmpdir()/stm-simulator-dwarf4/<경로·크기·시각 해시>/libgcc.a`에 한 번 만들어 다시 쓴다(고유 이름으로 쓴 뒤 rename). 빌드 한 번 16초 → 2.8초(이 PC, 링크 포함).
- CI(`build-windows.yml`): E2E는 3묶음 `node --test --test-shard=i/3`(전에는 고정 목록이라 새 파일이 모두 2묶음에 들어가 5.4분 대 2.1분). 패키지 작업은 `~\AppData\Local\electron-builder\Cache`를 캐시하고 `npm run build`가 실패하면 한 번 다시 시도한다(1.28.0 CI는 NSIS 다운로드 504로 실패). `scripts/verify-release.ps1`은 게시한 파일 받기를 최대 4번(15·30·45초 간격) 시도한다(1.28.0 게시 확인이 504로 실패).
- 진행 방식: 버전 푸시 전 로컬 전체 검사(45~60분, 그중 59분이 모든 예제를 두 보드로 빌드하는 `arm-examples`)는 하지 않는다. 바뀐 부분의 시험과 패키지 검사만 돌리고 나머지는 CI가 한다.

## 1.28.0 TIM6/TIM7 기본 타이머 (NUCLEO-F446RE) · DS3231 모듈 다리·이름

- DS3231(사용자 요청, 5a21bf4·87e2617):
  - 이름: `app-circuit.js` `addPart`가 접두어+번호로 이름을 짓는데, 접두어(변형 ID 앞부분 대문자)가 숫자로 끝나면 DS32311처럼 붙어 버렸다. 숫자로 끝나는 접두어는 첫째를 접두어 그대로, 다음부터 `-2`, `-3`을 붙인다(MCP4725·ADS1115 등도 같음).
  - 다리: `ON_CONTACT_PINS` 단자를 사진의 헤더 구멍(x = -91) 위에서 기판 밖 두 칸(x = -119)으로 옮겼다. 다리는 `render.js`가 사진 패드(`part-art.js` PADS)에서 단자까지 그리므로, 단자가 패드와 같던 1.27.0에는 다리가 없었다.
  - 오른쪽 통과 핀 4개를 연결점에서 뺐다(카탈로그 핀 6개, `catalogTies`·PADS에서도 제거). 변형 ID `ds3231-zs042-10`은 저장 파일 호환을 위해 그대로 둔다. `project.js` `migrateZs042`가 1.27.0 파일의 p7~p10 배선·빵판 핀을 p3~p6으로 옮긴다(같은 선끼리 잇던 배선은 없앤다).

- 기능 목록 3번(CubeMX와 다른 점)의 다음 항목(801b15d). STM32F103RB(중밀도)에는 TIM6/7이 없어 F446RE만 해당한다. 펌웨어 에뮬레이터(`src/emu/stm32f446/timer.js`, `basic: true`)는 이미 있었고, 화면·생성·가져오기·해석기를 붙였다.
- `timer-config.js`: `TIMER_ROUTES`에 채널 없는 `TIM6:{}`·`TIM7:{}`, `isBasicTimer`, `CHANNEL_TIMER_IDS`(GPIO_AF 상수용), `timerIrq(id)`(TIM6 → `TIM6_DAC_IRQn`)·`timerOfIrq`, `TIM_TRGO`. IRQ 이름을 `id+'_IRQn'`으로 만들던 곳(mcu-family `irqNamesOf`, hal.js 드레인·PINOUT_IRQS, hal-timers 큐, hal-generator, irq-handlers, mcu-config NVIC 검사)은 이 함수로 바꿨다.
- 프로젝트 값: 기본 타이머는 `mode:'base'`만, Counter Mode·channels 불가, `trgo`('ENABLE'|'UPDATE', Reset은 저장 안 함)는 기본 타이머에서만. Pinout 카드는 동작 모드·Counter Mode 대신 Trigger Event Selection(`basicTimerField`, `data-timer-trgo`).
- 생성: Init에 ClockDivision을 쓰지 않고(CubeMX와 같음), `HAL_TIM_Base_Init` 뒤에 늘 `TIM_MasterConfigTypeDef sMasterConfig`와 `HAL_TIMEx_MasterConfigSynchronization`. 해석기는 TRGO Reset/Enable/Update·MasterSlaveMode DISABLE을 받아 두기만 한다(듣는 DAC·ADC 외부 트리거가 아직 없음). 기본 타이머의 채널·Down 카운트 호출은 오류. `hal-nvic` IRQ 번호 TIM6_DAC 54·TIM7 55.
- device-assistance의 타이머 바꾸기 후보에서 기본 타이머를 뺐고, `f1Unavailable`은 TIM6/7을 막는다.
- 시험: 단위 `tim-basic`(4), 해석기 `timer-basic`(3), 툴체인 `tim-basic`(실제 HAL·에뮬레이터, 빌드 환경의 TIM6_DAC_IRQHandler, CR2 MMS = Update), E2E `tim-basic`(F446RE로 바꾼 뒤 카드·생성·실행).
- 남음: SYS Timebase Source를 TIM으로(현재 SysTick 고정, `.ioc`의 `VP_SYS_VS_timN`은 읽지 않음), TRGO를 쓰는 DAC 트리거(DAC 없음), TIM9~14.

## 1.27.0 TIM Output Compare · Counter Mode · printf float 늘 켬 · DS3231 ZS-042 모듈

- printf float(사용자 요청): 1.25.0의 툴바 칸·실행 안내·예제 켜기와 `src/printf-float.js`를 지웠다(1a1a5c6). ARM 빌드 두 곳은 늘 `-u _printf_float`, 해석기는 늘 `%f`를 출력한다. 1.25.0~1.26.0이 저장한 `build` 칸은 `validateProject`가 버린다(`tests/unit/printf-float.test.js`).
- DS3231(사용자 요청, bc3d163):
  - 새 부품 `ds3231-zs042-10`(ZS-042: 38×22 mm 파란 기판, 왼쪽 6핀 32K·SQW·SCL·SDA·VCC·GND, 오른쪽 4핀 통과 SCL·SDA·VCC·GND). 사진은 Figma 생성(글자·로고 없음), 헤더 구멍은 `part-art.js` PADS, 핀은 `ON_CONTACT_PINS`, 오른쪽 4핀은 `catalogTies`로 왼쪽과 묶는다. 모델 단자는 `catalog-model.js`의 `[5,6,4,3,1,2]`(VCC, GND, SDA, SCL, 32K, SQW)와 `eepromAddress:0x57`.
  - 레지스터 모델 `src/ds3231.js`(기존 `ds3231-8`도 사용): 00h~06h는 쓴 값에 흐른 초를 더한다(실행 시작은 PC 지역 시각, 초를 쓰면 1초 분주 초기화). 12/24시간, 세기 비트, 요일은 자정마다 세는 카운터, 알람 1·2(마스크·DY/DT)는 상태 레지스터를 읽을 때 A1F/A2F를 세운다. 제어 CONV는 바로 끝, 상태의 OSF·A1F·A2F는 지우기만, 온도 11h·12h는 부품 속성 `temperature`(0.25 °C). 포인터는 12h 다음 00h. AT24C32: 12비트 주소, 32바이트 페이지 안에서 쓰기 순환.
  - 두 주소: `device-defs.js` `answersI2c`(인터프리터 `buses.js`·펌웨어 `firmware-session.js`), 주소를 `writeI2c/readI2c`에 넘긴다.
  - 남음: SQW/INT 핀 출력(알람 인터럽트·1 Hz 사각파)과 32K 출력은 없다.

[FEATURES.md](docs/FEATURES.md) 3번. 근거는 CubeMX 6.18 DB `TIM1_8-gptimer2_v2_x_Cube_Modes.xml`(CounterMode, OCMode_n, OCPolarity_n, Pulse, "Output Compare CHn" 모드)이다.
- 설정(`mcu-config.js`):
  - 타이머 모드에 `oc`가 있다(`timer-config.js` `TIMER_MODES`).
  - `TIM_OC_MODES`: TIMING(Frozen, CubeMX 기본)·ACTIVE·INACTIVE·TOGGLE·FORCED_ACTIVE·FORCED_INACTIVE. `timChannelParams(mode)`가 모드별 채널 값 목록이다(PWM은 PWM1/PWM2).
  - `TIM_COUNTER_MODES`: UP·DOWN·CENTERALIGNED1~3. `counterMode`는 Up이 아니면 저장한다. 엔코더 모드에서는 Up만 된다.
- 생성(`hal-generator.js`): `CounterMode`, `HAL_TIM_OC_Init`, 채널마다 OCMode·Polarity·Pulse를 다시 쓴 뒤 `HAL_TIM_OC_ConfigChannel`, `HAL_TIM_OC_Start`(NVIC가 켜지면 `_IT`와 `HAL_TIM_OC_DelayElapsedCallback` 틀).
- .ioc(`importIoc`):
  - 키의 Java properties 이스케이프(`\ `, `\#`)를 푼다(8f9cd39). 지금까지는 실제 CubeMX 파일의 `TIM2.Pulse-PWM\ Generation1\ CH1` 같은 키를 못 읽어 1.24.0의 PWM 채널별 설정이 빠졌다.
  - IPParameters의 "Output Compare n CHn"이면 `oc` 모드다. `OCMode_n`(없으면 Frozen), `OCPolarity_n`, `Pulse-Output Compare n CHn`, `CounterMode`를 읽는다.
- Pinout 화면(`src/timer-ui.js`): Counter Mode 칸, PWM Generation / Output Compare CHn 칸(Mode, Pulse, CH Polarity)과 핀 동작 안내(일치 주파수, 토글 사각파, 첫 일치 뒤 유지, 바로 고정). PWM과 OC를 바꾸면 채널 Mode는 지운다.
- 해석기(`hal-timers.js`):
  - 카운터를 한 주기 안의 위치(phase)로 둔다. Up CNT = u, Down CNT = ARR − u, Center CNT = u ≤ ARR ? u : 2·ARR − u. 주기는 Center면 2·ARR, 아니면 ARR + 1이다.
  - Center 모드는 갱신 인터럽트가 ARR 틱마다다. PWM은 타이머 클록 / 2·ARR, 듀티 CCR / ARR이다. `__HAL_TIM_IS_TIM_COUNTING_DOWN`, `__HAL_TIM_SET_COUNTER`가 방향을 따른다.
  - 출력 비교: `HAL_TIM_OC_ConfigChannel/Start/Stop(_IT)`, `__HAL_TIM_SET_COMPARE`. Toggle은 PWM처럼 그린 사각파(일치 횟수 / 2, 2000 Hz까지)이고, Active/Inactive는 다음 일치에서 핀을 바꾸며, `_IT`는 일치마다 `HAL_TIM_OC_DelayElapsedCallback`(htim->Channel)을 부른다.
- 에뮬레이터:
  - 타이머 `refreshOutputs`는 레벨뿐 아니라 채널 출력 켜기(CCxE)와 비교/캡처 전환(CCxS)이 바뀔 때도 핀 상태를 다시 알린다(1c247ff, F4·F1 공용). 앱의 생성 코드는 MX_GPIO_Init에서 타이머 핀을 AF로 둔 뒤 타이머 클록을 켜는데, 클록이 꺼진 동안 입력으로 알려진 채널 핀이 출력이 Low인 채로 켜지면 입력으로 남아 있었다. 처음 시도한 "RCC 클록 켜기 때 모든 핀 다시 알리기"는 리셋 상태(출력 비교)의 입력 캡처 핀을 Low 출력으로 알려 timer_capture·timer_encoder 펌웨어 시험을 깨뜨려 버렸다.
  - 중앙 정렬 Toggle 출력 주파수는 일치 횟수를 따른다. CCR = ARR일 때 일치를 두 번 세던 것을 한 번으로 고쳤다.
- 시험: 단위 `tests/unit/tim-oc.test.js`, 해석기 `tests/interp/timer-oc.test.js`, 툴체인(CI firmware 단계) `tests/toolchain/tim-oc.test.mjs`, E2E `tests/e2e/tim-oc.e2e.test.mjs`.

## 1.26.0 Clock Configuration(클록 트리) · ADC1 Sampling Time

[FEATURES.md](docs/FEATURES.md) 3번, [CLOCK-TREE-PLAN.md](docs/CLOCK-TREE-PLAN.md).
- 모델(`src/clock-tree.js`): 선택 항목 `mcu.clock`.
  - F446: `sysclkSource` HSI/HSE/PLLCLK, `pllSource`, `pllM/N/P/Q`.
  - F103: `pllSource`(HSI = HSI/2), `hsePrediv`, `pllMul`.
  - 공통: `ahb`, `apb1`, `apb2`, `adcPrescaler`.
  - `clockFrequencies`는 APB 분주가 1이 아니면 타이머 클록을 ×2로 계산한다.
  - `clockTreeProblems`의 한계는 CubeMX 6.18 DB 값이다(F446 VCO 입력 0.95~2.1, VCO 100~432, PLLCLK 24~180, APB1 45, APB2 90, ADC 36 MHz / F103 72·36·72, ADC 14 MHz).
  - `flashLatency`, `needsOverDrive`(HCLK > 168 MHz)도 여기서 계산한다.
  - HSE는 ST-LINK MCO 8 MHz BYPASS로 고정했다.
- 호환:
  - `clock`이 없으면 예전과 같다(`timerClockHz`, `clockPlan`/`clockPlanF1`, 생성 코드도 그대로).
  - `clock`이 있으면 `validateMcu`가 `timerClockHz`를 APB1 타이머 클록으로 맞춘다. 범위 검사(`f.clock.valid`)는 건너뛴다.
  - `treeFromTimerHz`는 예전 값이 뜻하는 HSI 트리다. Clock 탭을 켤 때 시작값으로 쓴다.
- 생성(`hal-generator.js` `treeClockLines`): 쓰는 발진기만 OscillatorType에 넣는다. HSE는 `RCC_HSE_BYPASS`(F1은 `HSEPredivValue`), PLLR = 2, Over-drive, latency, ADC `ClockPrescaler`(F4)·`AdcClockSelection`(F1)을 쓴다. 머리 주석에 각 클록이 들어간다.
- .ioc(`clockTreeFromIoc`): 설정 키(SYSCLKSource, PLLSourceVirtual, PLLM/N/P/Q, PLLMUL, HSEDivPLL, *CLKDivider, ADC1.ClockPrescaler, ADCPresc)가 있을 때만 트리를 읽는다. 생략된 키는 CubeMX 기본값(PLLM 16, PLLN 192, PLLP 2, PLLQ 2, PLLMUL 2)이다. 예전 값과 클록이 같으면(CubeMX 보드 기본 84 MHz HSI PLL 등) 트리를 두지 않는다.
- Pinout Clock 탭(`src/clock-ui.js`, `index.html` `#pinout-clock-panel`, `pinout-ui.js` `renderClock`/`syncTimerClock`):
  - 클록 트리 켜기·끄기, 프리셋(`CLOCK_PRESETS`: 보드 기본, 최대), 원본·PLL·분주 선택이 있다.
  - 주파수 표에 한계를 넘은 줄이 `clock-over`로 표시된다. 같은 오류가 `#pinout-errors`에도 나온다.
  - 트리를 쓰면 APB1 타이머 입력 클록 칸은 비활성이다.
- 해석기: `Hal.clocks`. `HAL_RCC_GetPCLK1Freq`, 타이머(TIM1/8/9/10/11은 APB2 타이머 클록), DMA HCLK, F1 ADC 시간이 트리 값을 쓴다.
- ADC1 Sampling Time(`mcu-config.js` `ADC_SAMPLING`, `adcSamplingMacro`, `peripherals.ADC1.samplingTime`):
  - 앱 기본값은 예전처럼 가장 긴 시간(480 / 239.5)이고 저장하지 않는다. CubeMX 기본은 가장 짧은 시간이다.
  - .ioc `ADC1.SamplingTime-0\#ChannelRegularConversion`을 읽고, 없으면 CubeMX 기본으로 둔다.
  - Pinout 카드는 한 번 변환 시간(샘플 + 12 / 12.5 클록 ÷ ADC 클록)을 보여 준다.
- 시험:
  - 단위: `tests/unit/{clock-tree,adc-sampling}.test.js`
  - 툴체인(CI firmware 단계): `tests/toolchain/{clock-tree,adc-sampling}.test.mjs` — 에뮬레이터 SystemCoreClock·PCLK, UART 115200, SMPR2·변환 시간
  - E2E: `tests/e2e/{clock-tree,adc-sampling}.e2e.test.mjs`
  - 180 MHz에서 에뮬레이터는 한 tick의 실제 시간 예산에 걸려 시뮬레이션 시간이 실시간보다 느리다. 시험은 정해진 시뮬레이션 시간까지 tick을 반복한다.

## 1.25.0 printf float 설정 · it.c 핸들러 중복 안내 · 핀 과전압 · 입력 중 자동완성 · DWARF 4 · FPB-RA6E1 실물 확인

[FEATURES.md](docs/FEATURES.md) 2·4~8번.
- printf float(4번, 1.27.0에서 사용자 요청으로 지움 — 지금은 늘 켜짐): 프로젝트 `build.printfFloat`(새 프로젝트 `false` = CubeIDE 기본, 이 칸이 없는 예전 프로젝트는 `true`로 봄). ARM 빌드 두 곳(`native-build.cjs`, `ra-build.cjs`)이 켜졌을 때만 `-u _printf_float`, 지문(fingerprint)에 `build` 포함. 해석기 `hal-stdio.js`는 꺼지면 `%f/%e/%g`를 빈칸(newlib-nano와 같음). `usesFloatPrintf`(printf 계열 형식 문자열, 주석 제외)가 참인데 꺼져 있으면 실행마다 출력 탭에 `PRINTF_FLOAT_NOTICE` 한 번. IDE 툴바 `#printf-float`. 예제 적용(`applyHalExample`·`applyLectureExample`·장치 Docs)은 `withExamplePrintfFloat`로 실수를 찍는 예제만 켬.
- it.c 핸들러 중복(6번, `src/irq-duplicates.js`): `irqHandlers(mcu)`(NVIC가 켜진 줄·DMA 스트림)와 `SysTick_Handler`를 main.c·추가 .c(이름이 `*_it.c`인 파일 제외)에서 찾음(주석·`#if 0` 제외, 줄 번호 유지). 생성기가 쓰는 형태(`{` 뒤 `/* USER CODE BEGIN <IRQ> 0 */`)는 제외. `circuitDiagnostics`가 경고 `irq-duplicate:<이름>`, 대상 `{type:'code',file,line}` → `focusIssue`가 그 파일·줄로 이동. 빌드는 그대로(앱은 사용자 핸들러를 씀).
- 핀 과전압(5번, `src/pin-tolerance.js`): I/O 구조 F446RE는 PA4·PA5만 TTa, F103RB는 PA0~7·PB0·PB1·PB5·PC0~5·PC13~15가 TT(그 밖 FT). 한계 FT 5.5 V, TT·TTa·ADC 모드 FT 3.6 V, 하한 −0.3 V. `circuitDiagnostics`가 헤더 핀(`signal:Pxn`)의 풀이 전압을 보고 오류 `overvoltage:<핀>`. 실행 중이면 `renderIssues`가 실행마다 핀당 한 번 출력 탭에 씀(`state.overvoltageLogged`, 실행 시작 때 비움). RA 보드·다른 보드는 제외. 핀 구조 표는 데이터시트 원문을 받지 못해(st.com 접속 실패) 알고 있던 표로 작성 — WORKLOG 남은 사항.
- 입력 중 자동완성(7번): clangd 결과의 `isIncomplete`를 Monaco에 넘김, 질의 전 `languageService.flush()`로 편집 내용 동기화(`native-ide-ui.js` `flushLanguage`), Monaco 단어 목록 끔(`wordBasedSuggestions:'off'`), 치는 중인 단어는 식별자 후보에서 뺌.
- DWARF 4(8번): ARM 빌드 `-gdwarf-4`, 툴체인 libgcc.a는 `--strip-debug` 사본(`<build>/dwarf4-libs`)으로 링크해 DWARF 5 조각이 남지 않음. `elf.js` 줄 표는 0번지에서 시작하는 시퀀스(--gc-sections로 지워진 함수)를 건너뜀.
- FPB-RA6E1 실물(2번 6단계): J-Link V9.92·J-Link-OB-S124에서 기록·검증·리셋, LED1 토글, 디버그 중단점·호출 스택·`SystemCoreClock` 확인. 보드는 32.768 kHz 수정이 있으나 E25/E26이 열려 있어 `BSP_CLOCK_CFG_SUBCLOCK_POPULATED (0)`. GDB(`gdb-mi.cjs` `aliases`)와 에뮬레이터(`firmware-session.js` `RA_MAIN`)가 main.c 중단점·프레임을 `src/hal_entry.c`와 잇는다. `JLinkGDBServerCL -nogui`(값 없음).
- 시험: `tests/unit/{printf-float,irq-duplicates,pin-tolerance}.test.js`, `tests/toolchain/{printf-float,dwarf-version}.test.mjs`(CI firmware 단계), `tests/e2e/{printf-float,irq-duplicate,pin-overvoltage,completion}.e2e.test.mjs`, `tests/firmware/firmware-ra6e1.test.js`(FSP 디버그 줄).

## 1.24.1 ARM GCC 에뮬레이터의 ADC 단일 변환 안내

- 에뮬레이터 ADC(`emu/stm32f446/adc.js` `Adc.staleRead`, F103은 `AdcF1.externalTrigger`만 다름): 정규 변환 결과를 DR에 쓰면 `fresh`. DR을 다시 읽을 때 새 변환이 없고, CONT·DMA·외부 트리거가 아니며, 채널이 하나이고, 지금 입력을 변환한 값이 DR 값과 12비트 기준 40 넘게 다르면 `soc.env.warn`으로 한 번 알린다(값은 실물처럼 그대로).
- `FirmwareSession`: `warn` 옵션(없으면 '경고' 프로토콜 기록), 같은 문구는 한 번. `app-run.js`가 두 엔진 모두에 `warn`을 넘겨 출력 탭(`log(…,'error')`)과 프로토콜 모니터에 쓴다. 전에는 해석기 안내가 프로토콜 기록에만 갔다.
- 시험: `tests/toolchain/adc-continuous.test.mjs`(두 보드 단일 모드는 안내 1번·연속 모드는 0번), `tests/e2e/adc-continuous.e2e.test.mjs`(GCC 엔진: 예제는 접점을 따라가고 안내 없음, 제보 코드는 값 고정·안내 1번).

## 1.24.0 TIM PWM 채널별 설정 · I2C1 Parameter Settings

- TIM(`mcu-config.js` `peripherals.TIMx.channels`: `CH1`~`CH4`의 pulse·polarity HIGH/LOW·ocMode PWM1/PWM2, `TIM_CHANNEL_PARAMS`, 타이머 Pulse·High·PWM1과 같은 값은 저장하지 않음): 채널 설정이 있으면 `MX_TIMx_Init`이 ConfigChannel마다 `channel.OCMode/OCPolarity/Pulse`를 다시 쓴다(없으면 예전처럼 Pulse 하나). .ioc의 `Pulse-PWM GenerationN CHN`·`OCPolarity_N`·`OCMode_PWM-PWM GenerationN CHN`. Pinout 타이머 카드에 채널별 Pulse·Mode·CH Polarity와 출력 High 비율. 내장 해석기는 PWM1·High만(`TIM_OCMODE_PWM2`·`TIM_OCPOLARITY_LOW` 상수는 추가해 안내 메시지가 나온다).
- I2C1(`ownAddress` 7비트 → `OwnAddress1 = 주소 << 1`, `dutyCycle` '16_9'은 100 kHz 초과에서만, `noStretch`): 생성 코드·.ioc(`I2C1.OwnAddress`는 OwnAddress1 값으로 보고 1비트 내림)·Pinout 카드. 해석기 상수 `I2C_DUTYCYCLE_16_9`·`I2C_NOSTRETCH_ENABLE`.
- 시험: `tests/unit/{tim-channels,i2c-params}.test.js`(+ `helpers/tim-channels.js`), `tests/toolchain/tim-channels.test.mjs`(두 보드 CH1 25 %·CH2 PWM2·Low 75 %, CI firmware 단계), `tests/e2e/peripheral-params.e2e.test.mjs`(USART·SPI·TIM·I2C Pinout → main.c; 이전 이름 uart-params).

## 1.23.0 FSP 원본 색인 · J-Link 실물 보드 · USART/SPI Parameter Settings

- FSP 원본(RA6E1-PLAN 5단계): `desktop/sdk-index.cjs` LAYOUT에 `R7FA6E10F`(도구 키 `fsp`, `walk`로 설치 폴더의 ra/·Drivers/CMSIS/Include 전체, GCC가 아닌 `cmsis_armcc`·`armclang`·`iccarm`·`tiarmclang` 제외). 정의 이동·자동완성·읽기 전용 탭은 STM과 같은 IPC(`native:sdk-*`).
- J-Link(6단계, **실물 확인 전**): `desktop/jlink.cjs` — `listJlinks`(PnP USB VID_1366, 일련번호 앞 0 제거, 보드 이름 FPB-RA6E1), `findJlink`(C:/Program Files/SEGGER/JLink*/JLink.exe), `programJlink`(J-Link Commander `-device R7FA6E10F -if SWD -speed 4000`, 명령 파일 `r h loadfile firmware.hex r g qc`), `gdbServerArgs`(JLinkGDBServerCL 127.0.0.1:2331, `-singlerun`). `native-ide.cjs`: RA 프로젝트의 실물 실행·디버그는 J-Link(`raDevice`·`startJlinkServer`, GDB 리셋 `monitor reset` — `gdb-mi.cjs` `resetCommand`), `listBoards`가 ST-LINK와 J-Link를 함께 주고(`probe`), STM 프로젝트에 J-Link를 고르면 거부. 도구 키 `jlink`(개발 도구 설정). OpenOCD는 RA 플래시 드라이버가 없어 쓰지 않는다. 이 PC에는 J-Link OB(일련번호 831363305)가 연결되어 있지만 SEGGER 소프트웨어가 없어 기록·디버그는 아직 실물로 확인하지 않았다.
- USART Parameter Settings(`mcu-config.js` `UART_PARAMS`: wordLength 8/9, parity, stopBits 1/2, direction TX_RX/TX/RX, overSampling 16/8 — F103RB는 16만): 기본값은 저장하지 않음, 생성 코드·.ioc 가져오기·Pinout 카드. 내장 해석기는 8N1만(안내 후 ARM GCC 시뮬레이터). VCP 수신은 패리티 비트를 데이터에서 뺀다(8비트+패리티 = 데이터 7비트).
- SPI1 Parameter Settings(`SPI_PARAMS`: cpol, cpha, dataSize 8/16, firstBit): 생성 코드·.ioc·Pinout 카드(SPI mode 표시). 에뮬레이터 SPI는 원래 CR1의 CPOL/CPHA/DFF/LSBFIRST를 따른다. SPI 부품 모델은 모드를 확인하지 않는다.
- 시험: `tests/unit/{uart,spi}-params.test.js`, `tests/toolchain/{uart,spi}-params.test.mjs`(CI firmware 단계), `tests/e2e/uart-params.e2e.test.mjs`, `tests/unit/jlink.test.js`, c-symbols의 FSP 색인 시험, RA E2E의 F12·자동완성.

## 1.22.0 FPB-RA6E1 주변장치(SCI·GPT·AGT·ADC12·IIC)와 Clocks·Stacks 설정

[RA6E1-PLAN.md](docs/RA6E1-PLAN.md) 3·4단계. 주변장치마다 설정 검증(`ra-config.js`) → RASC 방식 인스턴스 생성(`ra-generator.js`, `hal_data`·`vector_data`·`r_*_cfg.h`) → 에뮬레이터 모델(`src/emu/ra6e1/`) → FSP 예제(`ra-examples.js`, 고정 ELF `tests/fixtures/firmware-ra6e1/`)로 이어진다.
- 핀 기능 `Peripheral`(`signal`): `RA_PERIPHERAL_PINS`(하드웨어 매뉴얼 Table 1.16을 PDF 그림으로 확인, 텍스트 추출은 GPT/ADC 열이 어긋나 쓰지 않음)와 PSEL(`raPsel`: SCI0/2/4 = 4, SCI1/3/9 = 5, GTIOC = 3 `IOPORT_PERIPHERAL_GPT1`, IIC = 7). 핀 설정 워드는 IIC만 DRIVE_MID, 나머지 DRIVE_HIGH.
- SCI UART(`sci.js`, `g_uartN`, `sciBaudSetting`: 115200 @ PCLKA 100 MHz → ABCS·BGDM, BRR 108, 0.45 %): TXI는 TDR → 시프트 전송 때, TEI는 TEND, RXI/ERI는 `UartReceiver`. `soc.usarts.SCIn`이라 UART 부품·`session.inject(text,'SCI9')`·직렬 모니터가 STM과 같은 경로로 쓴다(보드에 VCP 없음).
- GPT(`gpt.js`, `g_timerN`, `raGptCounts`: 16비트 GPT4~7은 분주 선택): 톱니파 PWM·주기, GTSTR/GTSTP/GTCLR 공유, GTCCRC/E·GTPBR 버퍼는 주기 끝 전송(CCRSWT 즉시), GTIOA/B 레벨·OADTY 0/100 %·정지 레벨, 핀은 평균 PWM 전압과 듀티/주파수. 주기 끝 이벤트는 ICU가 연결했거나 버퍼가 기다릴 때만 예약한다. 보드 LED(`render.js` `ledShade`)는 PWM 평균 전압만큼 흐리게 보인다.
- ADC12(`adc.js`, `g_adc0`, AN000~AN008·AN012·AN013, VREFH0 3.3 V): 단일 스캔은 채널당 1 µs 뒤 ADDRn 저장·ADST 해제·ADC0_SCAN_END, 연속 스캔은 읽을 때 값을 읽는다. 분해능·정렬.
- AGT(`agt.js`, `g_agtN`, `raAgtCounts`: PCLKB /1·/2·/8 또는 LOCO /1~/128): 16비트 하강 계수, TCSTF(FSP가 기다림), 언더플로 AGTn_INT.
- IIC(`iic.js`, `g_i2c_masterN`, `raIicClock`: 50 % 듀티·상승/하강 120 ns): START/TDRE(TXI) → 주소·데이터 → TEND(TEI) → STOP(ERI), 수신은 더미 읽기·ACKBT, NACKF. 장치는 STM과 같은 `session.i2cBus` 어댑터(I²C 메모리·센서 부품).
- RA Configuration 대화상자(`ra-pinout-ui.js`): Pins(위 주변장치 신호와 채널 설정, Analog 핀의 ADC0), Clocks(HOCO·PLL·분주, `RA_CLOCK_LIMITS` ICLK 200·PCLKA 100·PCLKB 50·PCLKC 50·PCLKD 100·FCLK 4~50 MHz와 비율 검증), Stacks(생성될 인스턴스 목록, 핀 없는 AGT·주기 GPT 추가·삭제). IELSR 할당은 RASC처럼 자동(`raVectors`).
- 장치 Docs: FSP 프로젝트에서는 STM32 HAL 예제를 만들지 않고 안내만 보인다(부품 선택 시 STM 핀 설정 오류가 나던 문제).
- 아직: 로직 분석기에 IIC·GPT 파형(SCI TXD는 그림), DTC/DMAC, SPI, GPT 입력 캡처.

## 1.21.0 ADC1 Continuous Conversion Mode

- `mcu-config.js`: `peripherals.ADC1.continuous`(켜면 true만 저장), `.ioc`의 `ADC1.ContinuousConvMode=ENABLE` 가져오기. `pinout-ui.js` ADC1 카드에 CubeMX 이름의 Disabled/Enabled 선택과 설명. `hal-generator.js` 두 계열 모두 `ContinuousConvMode = ENABLE/DISABLE`.
- 해석기(`hal.js`): 연속 모드·비스캔이면 `HAL_ADC_GetValue`·`PollForConversion` 때 최신 입력을 읽는다. 단일 모드에서 Start 없이 GetValue를 반복하는데 입력이 40 LSB 넘게 바뀌면 경고 한 번(`r.warn`). 에뮬레이터는 레지스터 모델(CONT)이 원래 연속 변환을 따른다(두 보드 빌드 시험으로 확인).

## 1.20.0 Renesas FPB-RA6E1 (RA6E1 · FSP · 에뮬레이터)

계획·확인 자료는 [docs/RA6E1-PLAN.md](docs/RA6E1-PLAN.md). STM 시뮬레이터의 기본 경로(1.14.0, ARM GCC 빌드 → 펌웨어 에뮬레이터)와 같은 구조로, 해석기는 없다.
- 보드·프로젝트: `boards.js` `fpb-ra6e1`(`vendor:'renesas'`, mcuFamily `R7FA6E10F`). `src/ra-config.js`(RA6E1 LQFP100 76포트, Table 1.16의 IRQ 핀, SWD 등 잠긴 핀, 보드 LED/S1/Arduino/풀업, `raDefaultMcu`, `validateRaMcu`: 모드·심볼·IRQ 채널 중복·클록 범위). 프로젝트는 `firmware.mode:'fsp'`만 허용(vendor 교차 거부), 주 소스는 내부 키 `main.c`·화면/빌드 이름 `hal_entry.c`. 보드에 STM32 보드를 두 번째 보드로 놓지 않는다(`DEVBOARD_MODELS`에 없음).
- 코드 생성 `src/ra-generator.js`: RASC가 쓰는 `ra_cfg/fsp_cfg`(bsp_cfg·family·device·pn·ofs·pin_cfg·board_cfg, r_ioport/r_icu cfg), `ra_gen`(bsp_clock_cfg HOCO 20 MHz/2×20=200 MHz, common_data, hal_data의 `g_external_irqN`, main.c, pin_data, vector_data·`BSP_ICU_VECTOR_NUM_ENTRIES`, bsp_linker_info.h), `script/fsp.ld`·memory_regions.ld(주 스택·힙은 0으로 지우는 영역 밖). 형식은 RT-Thread가 공개한 RASC 출력(FSP 5.5/6.2)을 참고했다. `raHalEntry()`는 e² studio 템플릿.
- 빌드 `desktop/ra-build.cjs` + `native-build.cjs`: 도구 키 `fsp`(감지: `STM-Simulator-Tools/FSP`, `FSP_ROOT`), `src/hal_entry.c`, FSP BSP(all·ra6e1)·CMSIS 장치 startup/system·r_ioport·사용하는 r_* 드라이버·board(ra6e1_fpb), `-mcpu=cortex-m33 -mfpu=fpv5-sp-d16 -mfloat-abi=hard`. 진단의 `src/hal_entry.c`는 `main.c`로 바꾼다. 설치 `tool-installer.cjs` `FSP`(renesas/fsp v6.6.0 커밋 6e26753의 180개 + CMSIS Core 31개, `desktop/tool-manifest-fsp.json`, `scripts/build-tool-manifest.mjs --fsp`, 파일별 3회 재시도).
- 에뮬레이터 `src/emu/ra6e1/`: `RaBus`(Code Flash 1 MB@0, SRAM 256 KB@0x2000_0000, Data Flash 8 KB@0x0800_0000, 옵션 설정 영역은 지운 값), `Ra6e1` SoC(SYSTEM: CGC·OSCSF·OPCCR·SCKSCR/SCKDIVCR/PLLCCR로 클록 계산, PORT/PFS/PWPR: Renesas 레인 배치(16비트 +0=31:16, +2=15:0), ICU: IRQCR·IELSR(IR 비트가 NVIC 라인), FCACHEIV·RTC RCR2 자동 해제, 그 밖의 주변장치 영역은 쓴 값 유지·기록). CPU: MSPLIM/PSPLIM, `branchPenalty`(STM 2, RA 1 — FSP 지연 루프 4사이클과 일치). `Machine({bus})`. `FirmwareSession`이 `isRaFamily`로 RA 경로(VCP 없음, FSP/STM ELF 교차 확인).
- 회로·화면: `pins.js` FPB 헤더(J1/J2/J5/J6, Uno R3 간격, 55×95 mm), `setActiveBoard`가 `PINS`·`GPIO_PINS`·`BOARD` 크기를 활성 보드로 바꾼다. 엔진: S1(P205→GND, 보드 풀업 없음), LED1/LED2(P408/P407, 1 kΩ), I2C 풀업 2.2 kΩ. `render.js` `fpbBoardSvg`. RA Pins 대화상자 `src/ra-pinout-ui.js`(Pinout & Configuration이 연다). 탐색기 `ra_gen · ra_cfg` 묶음(읽기 전용, 정의 이동 대상). 예제 패널은 FSP 예제(`src/ra-examples.js`)를 보인다. 시뮬레이터 엔진 선택·내장 해석기 선택지는 숨긴다.
- 테스트: `tests/unit/ra6e1.test.js`, `tests/firmware/firmware-ra6e1.test.js`(고정 ELF `tests/fixtures/firmware-ra6e1`, `scripts/emu/build-ra6e1-fixtures.mjs`), `tests/toolchain/ra-build.test.mjs`, `tests/e2e/ra6e1.e2e.test.mjs`. CI 툴체인 액션이 앱 설치기로 FSP를 받고 `FSP_ROOT`를 쓴다.
- 남은 단계(계획 3~6): SCI UART·GPT·AGT·ADC·IIC 모델과 예제, 앱 안 Clocks/Stacks 설정, FSP 정의 이동·자동완성(SDK 색인), J-Link 실물 보드.

## 1.19.0 변수 그래프 (STM Studio 방식)

- `src/variable-graph.js`: `VariableRecorder`(변수 목록 8개까지, 시뮬레이션 시간 샘플 간격, 변수마다 점·지금 값·읽기 오류, 2만 점 순환, CSV)와 `variableChart`(SVG 꺾은선·네모 표시·눈금). `src/variable-graph-ui.js`: 하단 `변수 그래프` 탭(`data-monitor="vars"`, `#vars-panel`), 전역 변수 제안(`cSymbols`), 목록은 `project.ide.plots`(검증: 문자열 8개 이하·중복 없음, 보드별 ide에도 복사).
- 두 세션 모두 `enrich(micros)`에서 `vars.record(micros, name => readVariable(name))`를 부른다. `SimulationSession.readVariable`은 `watchExpression`(감시식 파서, 캐시)으로 만든 식을 전역 범위에서 `readExpression`으로 읽고 `numericValue`로 숫자만 받는다. `FirmwareSession.readVariable`은 기존 `evaluate`(ELF 심볼 + 소스 선언 타입, 부작용 없는 `bus.peek`)의 결과를 숫자로 바꾸며, `declaredType`은 이름별로 캐시한다.
- `c-symbols.js`: `uint32_t a, b;`처럼 한 선언의 여러 이름을 각각 변수로 낸다(전에는 마지막 이름만, 타입 글자가 깨졌다). 코드 개요와 변수 제안에 반영된다.

## 1.18.3 보드 구성 초기화가 main.c도 초기화

- `resetBoardConfiguration`(board-reset.js)이 회로·MCU 설정을 보드 기본값으로 비운 뒤 `resetMainCode`를 적용해 main.c를 기본 설정의 최소 HAL 코드로 바꾼다(main.c 중단점·Docs 기록도 지움). 보조 소스 파일은 유지한다. 전에는 코드를 보존해 핀을 지운 뒤에도 옛 예제 코드(`MX_GPIO_Init`, `HAL_GPIO_TogglePin`)가 남았다. 확인창·메뉴 툴팁·로그 문구를 맞추고 `tests/e2e/board-reset.e2e.test.mjs`를 추가했다.

## 1.18.2 자동완성에 SDK 이름

- clangd가 꺼져 있을 때의 자동완성은 `code-editor.js`의 짧은 API 목록과 프로젝트 단어뿐이라 `HAL_TIM_Base_Start`, `HAL_TIM_Base_Stop_IT` 같은 함수가 나오지 않았다. `SdkIndex.names(family,tools,prefix)`(IPC `native:sdk-names`)가 정의 색인의 이름을 대소문자 구분 없이 접두어로 찾아(정렬 목록 이분 탐색, 함수 → 매크로 → enum → typedef → 변수 순, 150개) 돌려주고, 완성 제공자는 `incomplete`로 표시해 글자를 더 칠 때 다시 묻는다. 두 글자부터 찾는다.

## 1.18.1 패널 글자 복사 · 실행 때 빌드 탭으로 바꾸지 않음

- `app-keyboard.js`: 창 전체 Ctrl+C는 회로 복사였고 항상 `preventDefault`라 패널 글자를 복사할 수 없었다. 문서에 접히지 않은 글자 선택이 있으면 Ctrl+C를 브라우저에 맡긴다. 선택이 하단 패널 안에 있으면 Ctrl+A는 그 패널(탭 패널) 글자를 선택한다.
- `desktop/main.cjs`: 모든 webContents의 `context-menu`에서 선택한 글자는 복사, 입력 칸은 잘라내기·복사·붙여넣기·모두 선택 메뉴를 띄운다(회로·Monaco처럼 자체 메뉴가 있는 곳은 이벤트를 막아 뜨지 않음).
- `native-ide-ui.js` `build(override,source,{reveal})`: 실행의 ARM 빌드(`buildElf`)는 `reveal:false`라 하단 패널을 바꾸지 않는다. `app-run.js`: 해석기 코드 검사 실패 시 빌드 탭을 열지 않고 출력에 오류 내용을 남긴다(편집기 밑줄은 그대로).

## 1.18.0 System Core › SYS (Serial Wire · SysTick)

- `pinout-ui.js`: System Core 카드의 NVIC 버튼 아래 `#sys-debug`(CubeMX Debug 모드 5가지 중 Serial Wire만 선택 가능), `#sys-timebase`(SysTick, 그 MCU의 TIMx는 비활성). 설정 값은 저장하지 않는다(보드가 SWD 고정, HAL 시간 SysTick 고정: 1.16.0의 `tickPriority`가 Time base 우선순위).
- PA13/PA14가 Reset·Reserved이면 `sysSignal`로 `SYS_JTMS-SWDIO`/`SYS_JTCK-SWCLK` 타일(`.pin-tile.sys`), 핀 메뉴는 그 신호 하나와 안내만, 핀 설정은 읽기 전용 신호와 설명(동기화 대상 아님). 다른 기능 지정은 기존 `configProblems`가 막는다.
- 남은 것: TIMx Timebase(HAL_InitTick를 TIM으로 바꾸는 생성 코드와 해석기·에뮬레이터 지원), Trace Asynchronous(PB3 SWO)·JTAG 모드. F103RB의 `__HAL_AFIO_REMAP_SWJ_NOJTAG()`는 여전히 PA15/PB3/PB4를 쓸 때만 생성한다(CubeMX는 Serial Wire면 HAL_MspInit에 항상 씀).

## 1.17.1 빌드 파일 읽기 전용 보기 (Core · Startup)

- `src/build-environment.js` `buildEnvironment(project)`: ARM 빌드가 프로젝트 소스에 더하는 코드(인터럽트 핸들러·newlib 시스템 호출·힙)를 한 곳에서 만든다. `text`는 `native-build.cjs`가 `__stm_environment.c`로 쓰는 내용이고, `files`는 같은 코드를 CubeIDE 이름(`Core/Src/stm32xxxx_it.c`, `syscalls.c`, `sysmem.c`)으로 나눈 읽기 전용 보기다. 프로젝트 소스에 있는 핸들러는 빌드에서 빠지고 it.c 보기에 "프로젝트 소스에 있어 만들지 않는 핸들러" 목록으로 나온다(이전의 `native-build.cjs` 안 코드와 같은 규칙).
- 탐색기 소스 파일 아래 `<details id="build-files">`(기본 접힘): 위 세 파일과 SDK의 `system_<prefix>.c`(프로젝트에 없을 때), `Source/Templates/gcc/startup_*.s`. 누르면 읽기 전용 탭으로 열린다. 생성 파일 탭은 `inmemory://gen/...` 모델이고 경로 줄은 `STM Simulator 빌드 › Core › Src …`, 프로젝트가 바뀌면 `refreshGenerated()`로 내용이 따라간다. 정의 찾기는 프로젝트 → 빌드 파일 → SDK 순이다. SDK 색인은 startup `.s`도 열 수 있게 목록에 넣고 심볼은 읽지 않는다.
- CubeIDE의 startup은 `startup_stm32f103rbtx.s`처럼 CubeIDE가 만든 파일이지만, 이 앱의 빌드는 SDK의 `startup_stm32f103xb.s`/`startup_stm32f446xx.s`를 쓰므로 그 이름으로 보여 준다.

## 1.17.0 정의로 이동(Ctrl+클릭·F12)과 코드 개요(Outline)

- `src/c-symbols.js` `cSymbols(text)`: 주석·문자열·전처리 줄을 가린 텍스트 스캔으로 include, 매크로, typedef(struct/enum/함수 포인터), enum 상수, 전역 변수, 함수 정의·선언을 줄·열과 함께 찾는다. `extern "C" {}`는 깊이로 세지 않는다. `outlineLabel`은 CubeIDE Outline 형식(`name(params) : ret`, `var : type`), `pickDefinitions`는 정의 > 매크로 > typedef > enum > 변수 > 선언 순으로 고른다(전처리 분기는 모두 후보).
- `desktop/sdk-index.cjs` `SdkIndex`: 프로젝트 MCU의 STM32Cube SDK(개발 도구의 `cube`/`cubeF1` 경로)에서 HAL 드라이버 Inc/Src, CMSIS Device(칩 헤더·system), CMSIS Core 헤더를 처음 요청 때 색인한다(경로별 캐시). IPC `native:sdk-definition`(이름→정의 목록), `native:sdk-file`(색인된 파일만 읽기), `native:sdk-relative`(clangd 결과 경로→색인 경로).
- `code-editor.js`: 정의 제공자가 프로젝트 파일을 먼저 보고(정의·매크로·변수 등, 프로젝트의 프로토타입만 있으면 SDK 우선), 없으면 SDK를 찾는다. SDK 파일은 `inmemory://sdk/<경로>` 모델로 열고 편집기를 읽기 전용으로 바꾼다(`external`). 그동안 textarea는 프로젝트 파일 그대로이고 `sync`는 프로젝트 모델만 갱신한다. 중단점·장식·찾기 막대는 SDK 파일에서 쓰지 않는다(Ctrl+F는 Monaco 찾기). Alt+←/→는 이동 기록. clangd가 켜져 있으면 clangd의 SDK 경로 결과도 같은 탭으로 연다.
- `ide-ui.js`: 탭에 SDK 파일(기울임, ×), `#source-path`에 SDK 경로(프로젝트 경로 줄 대신), 탐색기 소스 파일 아래 `코드 개요 (Outline)`. 파일 목록은 프로젝트 파일만이다.
- SDK가 없으면 정의가 프로젝트 파일에서만 찾아지고, 출력에 "STM32CubeF1 SDK가 없어 HAL 원본을 열 수 없습니다…"가 한 번 나온다.

## 1.16.0 CubeMX식 NVIC·GPIO·핀 클릭 메뉴

- `src/nvic-config.js`: CubeMX NVIC 이름(`irqLabel`), 주변장치별 IRQ(`peripheralIrqs`), "사용 가능한 인터럽트"(`irqAvailable`), 사용 중 DMA 스트림 강제 켜짐(`dmaForced`), 그룹별 범위 검사(`nvicProblems`). MCU 설정에 선택 필드 `nvicGroup`(0~4, 4면 저장 안 함), `tickPriority`(0~15, 15면 저장 안 함), `nvic[irq].sub`(0이면 저장 안 함)를 추가했다.
- 생성 코드: 그룹이 4가 아니면 `HAL_Init()` 바로 뒤에 `HAL_NVIC_SetPriorityGrouping(NVIC_PRIORITYGROUP_n)`, SysTick 우선순위가 15가 아니면 `HAL_InitTick(n)`(CubeMX는 HAL_MspInit·TICK_INT_PRIORITY에 쓴다). `HAL_NVIC_SetPriority(irq, pre, sub)`.
- `src/gpio-config.js`: `gpioMode`(생성기·Pinout 공용), CubeMX 기본 속도(`defaultSpeed`: 출력·TIM 채널 Low, 통신 Very High, F1 High), 신호 이름(`signalName`: Reset_State, GPIO_Analog, GPIO_EXTIn). 핀 선택 필드 `speed`, `outputType`(PP/OD). Speed는 출력과 AF에만 쓴다(입력·EXTI에는 쓰지 않음). 이전 Docs 코드 제거는 `generateMain(...,{legacyGpio:true})`로 옛 규칙과 맞춘다.
- Pinout UI(`pinout-ui.js`): 핀 타일을 누르면 `#pin-menu`(CubeMX 신호 목록, ↑/↓·Esc). 함수 변경은 `choose(pin,fn)` 한 곳에서 한다. 오른쪽 열은 핀 설정 / NVIC 탭(`#pinout-tab-*`), 왼쪽 맨 위 System Core 카드의 NVIC 버튼, 주변장치 카드의 NVIC Settings(`data-card-irq`), EXTI 핀 설정의 인터럽트 줄. 핀 설정은 기능별 CubeMX 항목만 보인다.
- `serial-config.js`: UART를 켜도 NVIC를 켜지 않는다(CubeMX와 같음, 1.15.0 동작 제거). 해석기: Pinout이 Open Drain이면 `GPIO_MODE_OUTPUT_OD`를 요구한다.
- 새 EXTI 핀의 기본 에지는 CubeMX처럼 RISING. `.ioc` 가져오기는 `GPIO_Speed`, `GPIO_ModeDefaultOutputPP`(OD), `NVIC.<irq>` 서브 우선순위, `NVIC.PriorityGroup`, `NVIC.SysTick_IRQn`을 읽는다.
- 남은 것: NVIC Code generation 탭(IRQ별 핸들러 생성·HAL 핸들러 호출 선택), EXTI Event 모드, 시스템 예외(SysTick 외) 우선순위 편집.

## 1.15.0 UART 인터럽트와 IRQ 핸들러 자동 작성

- `serial-config.js` `assignSerialPin`: 꺼져 있던 UART/USART를 켜면 `nvic[id+'_IRQn']`도 켠다(우선순위 0, 기존 값 유지). CubeMX는 NVIC Settings에서 따로 켜야 하지만, 이 앱에서는 `HAL_UART_Receive_IT`가 바로 동작하도록 함께 켠다. UART가 켜진 채로 NVIC만 끄면 그대로 꺼져 있다.
- `src/irq-handlers.js` `irqHandlers(mcu)`: DMA 스트림과 켜진 NVIC 줄마다 CubeMX `stm32xxxx_it.c`의 핸들러 본문(`HAL_UART_IRQHandler(&huart2)` 등)을 만든다. GCC 빌드(`native-build.cjs`의 `__stm_environment.c`)와 `hal-generator.js`가 같이 쓴다. 생성 main.c(minimal 아님)에는 인터프리터가 실행하는 종류(UART/USART·TIM·EXTI·DMA·DCMI·SDIO)를 `/* USER CODE BEGIN USART2_IRQn 0 */`·`1` 구간과 함께 쓴다. I2C·SPI·ADC 핸들러는 GCC 빌드의 환경 파일에만 들어간다.
- `c-source-edit.js` `dropShadowedHandlers(source,others)`: Pinout 코드 생성 때 USER CODE 구간이나 다른 소스 파일(가져온 `stm32f4xx_it.c` 등)에 사용자가 쓴 핸들러가 있으면 생성 핸들러를 뺀다(1.14.2 이전처럼 USER CODE 4에 직접 쓴 `USART2_IRQHandler`가 두 번 정의되지 않음).

## 1.14.2 닫힌 실행 대상 메뉴가 계속 그려지던 문제

- `shell.css`: `.run-target-menu{display:grid}`가 닫힌 팝오버의 기본 `display:none`을 덮어써, 메뉴가 닫힌 뒤(`:popover-open` 아님)에도 화면에 그려졌다(1.12.3부터). 표시는 `.run-target-menu:popover-open{display:grid}`로만 준다. 팝오버 요소에 `display`를 줄 때는 항상 `:popover-open`에 건다.
- E2E: 닫힌 메뉴의 크기가 0인지, 앱의 모든 닫힌 `[popover]`가 `display:none`인지 확인한다. 그전 시험은 `:popover-open` 상태만 봐서 놓쳤다.

## 1.14.1 실행 대상 메뉴 더블클릭

- `native-ide-ui.js` `runToggle.onclick`: `e.detail>1`(더블클릭의 둘째 클릭)은 무시한다. 첫 클릭이 닫은 메뉴를 둘째 클릭이 다시 열어, 빠르게 두 번 누르거나 마우스가 두 번 인식되면 ▾로 닫히지 않는 것처럼 보였다. 키보드 클릭은 detail 0. E2E는 Electron `sendInputEvent`(실제 마우스와 같은 입력 경로)로 더블클릭을 보낸다.

## 1.14.0 시뮬레이터를 ARM GCC 빌드로

- `native-ide-ui.js`: 시뮬레이터 엔진 `stm32lab.simEngine`(localStorage, 기본 `gcc`, `interpreter`). `gccSimulation()` = 실행 대상 시뮬레이터 · 엔진 gcc · 데스크톱 · HAL 프로젝트 · FatFs 헤더 없음. 이때 `emulator()`가 참이 되어 빌드(`buildElf`), 실행(FirmwareSession), 다른 STM32 보드(에뮬레이터 드라이버), 디버그, 메모리 보기가 모두 펌웨어 에뮬레이터 경로를 탄다. `#sim-engine` 선택은 실행 환경(`shell.js`가 run-config로 옮김)에 있다.
- `ensureSimTools()`: 실행 전에 `install-plan`에서 ARM GCC와 보드의 Cube SDK(`cube`/`cubeF1`)만 보고, 없으면 `#sim-tools-dialog`(설치하고 실행 · 내장 해석기로 실행 · 취소). 설치는 기존 `install-tools`와 진행 표시(`renderPlan`)를 함께 쓴다. `app-run.js` `startRun`이 부른다(`cancel`이면 실행 안 함).
- E2E 하네스는 `simEngine` 기본 `interpreter`(도구 없는 CI·빠른 실행), `sim-gcc.e2e.test.mjs`가 gcc 엔진(도구 있으면 실제 빌드, 없는 PC는 `LOCALAPPDATA`를 빈 폴더로 바꿔 설치 창 확인).

## 1.13.2 시뮬레이터 sprintf·snprintf · 빌드 실패 첫 오류

- `hal-stdio.js` `stringCall`: `sprintf`/`snprintf`(형식은 `formatPrintf`, `snprintf`는 size-1자와 0을 쓰고 전체 길이 반환), `strcpy`·`strncpy`·`strcat`·`memset`·`memcpy`·`memmove`·`memcmp`. 버퍼 쓰기는 `pointerCell`이라 배열 끝을 넘으면 오류. `hal.js`가 `strlen` 다음에 부른다. 시뮬레이터는 newlib 대신 이 목록만 지원한다.
- `native-build.cjs` `run`: 실패 메시지에 첫 `error` 진단(`파일:줄: 내용`)을 붙인다. 출력 탭만 보던 "종료 코드 1"의 이유가 로그 첫 줄에 보인다.

## 1.13.1 자동 완성 목록 색 대비

- `colorscheme.js` `widgetColors(c)`: 자동 완성(`editorSuggestWidget.*`)·툴팁(`editorHoverWidget.*`)·`editorWidget.*` 색을 테마에서 대비를 계산해 정한다. Vim 구성표의 Pmenu 회색 위에 Monaco 기본 파란 일치 글자와 흐린 설명 글자가 묻혔다. 글자 7:1 이상(못 맞추는 회색 표면이면 편집기 배경 사용), 일치 글자·선택 줄 4.5:1 이상. `editorTheme`가 항상 덮어쓴다.

## 1.13.0 NUCLEO-64 회로도(MB1136 C-04) 기본 연결 반영

- `pins.js` `OPEN_BRIDGES`: 배송 상태에서 열린 솔더 브리지 뒤의 헤더 핀(CN9-1/2·CN10-35/37 = PA3/PA2, SB62/SB63 · CN7-25/27 = PC14/PC15, SB49/SB48 · CN7-29 = PH0/PD0, SB55)은 `signal:'NC'`이고 `mcu`·`bridge`를 가진다. 두 보드 모두(`boardPins`가 F103 신호를 바꾼 뒤 적용). `GPIO_PINS`는 `mcu`도 포함해 PA2/PA3(VCP) 등 MCU 핀 이름은 그대로 쓴다. `boardPin()`은 이 핀을 돌려주지 않는다(`boardPin('PA2')`·`boardPin('D0')`은 `undefined`). `bridgeNote(pin)`이 툴팁·핀 클릭 안내·다른 STM32 보드 핀 설명에 쓰인다.
- `engine.js` `onboard()`: B1(4.7 kΩ 풀업, 누르면 R29 100 Ω으로 GND), LD2(PA5→GND, 다이오드 2.1 V·510 Ω). 주 보드와 다른 STM32 보드(`<id>.PA5`) 모두.
- 예제: 외부 UART 장치는 USART1 PA9/PA10(`uart_external`, UART 케이블 4·6선, 절연 RS485, 장치 Docs의 UART 계열), USART 동기 MAX7219는 USART1 CK PA8·TX PA9. `uart`·`dma_uart_echo`·`noise_errors`는 배선 없이 VCP라 USART2 그대로. 장치 Docs 핀 배정(`device-assistance.js`)은 부품에 배선되는 핀을 헤더가 있는 핀에서만 고른다. 직렬 모니터에서 `외부 UART 장치 → USART2` 항목을 없앴다.
- 실행 대상 ▾ 메뉴(`native-ide-ui.js`)는 `popover='manual'`로 직접 연다/닫는다: ▾, 바깥 `pointerdown`, Esc, 창 `blur`·`resize`. 페이지 밖 클릭(다른 창, 창 테두리)은 요소에 닿지 않아 브라우저 light dismiss로는 닫히지 않았다. `adoptNewBoard`는 새로 연결된 NUCLEO를 종류와 관계없이 고르고(같은 종류 우선), 종류가 다르면 로그로 보드 변경을 안내한다.
- HAL 코드 다시 생성(`pinout-ui.js` `commit(true)`)은 `keepUserCode(이전 코드, 새 코드, 이전 설정의 생성 코드)`(`c-source-edit.js`): 같은 이름의 USER CODE 구간 내용을 옮기고, 새 코드에 없는 구간은 `#if 0`으로 구간 4에 보관, 이전 설정의 생성 결과와 같은(손대지 않은) 구간은 새 기본값. 생성기(`hal-generator.js`)는 `Includes`·`PV`·`0`·`4`와 콜백 본문 구간을 추가로 만든다.
- 도움말 → 업데이트 로그: `update-log-data.js`(버전·태그 날짜·사용자용 항목, 새 버전마다 맨 위에 추가), `update-log.js`(정렬·검색·5개 페이지), `update-log-ui.js`(떠 있는 창, 제목으로 이동). 단위 테스트가 package 버전이 맨 위에 있는지 확인한다.
- 실행 중 예제 선택: 시뮬레이션은 정지하고 적용(`readyForExample`, 예제 목록은 실행 중에도 사용 가능), 빌드·보드 실행·디버그 중에는 안내만. 실행 중 읽기 전용 편집기는 Monaco `readOnlyMessage`로 정지하라고 알린다(`#code` `data-read-only-message`).
- E2E는 화면을 가리지 않는다: 하네스가 `CIRCUIT_LAB_TEST_BACKGROUND=1`을 주면(테스트 프로필일 때만) `main.cjs`가 창을 숨긴 채 다크 테마로 시작하고(`backgroundThrottling:false`), 하네스가 그 창을 z-order 맨 아래로 보낸 뒤 `showInactive()`로 보인다(실제로 그려지지만 사용자의 창 뒤, 포커스 없음. CI는 보이기만 한다). 앞에 띄우려면 `E2E_SHOW=1`.
- 테스트: D13 LED 전류는 LD2와 같은 노드로 계산(`withLd2`), RC·오픈 드레인은 D12. 펌웨어 픽스처 `uart_external`(USART1, 이 PC의 GCC 15.2.1·STM32CubeF4로 빌드) 추가, HC-06·보드 간 UART 시험은 이 픽스처로.

## 1.12.3 실행 대상 메뉴 · 실물 보드 자동 선택 · Release 기본

- `native-ide-ui.js`: 제목 표시줄 실행 버튼 옆 `#run-target-toggle`(▾)과 `#run-target-menu`(popover, `menuitemradio`)가 `#native-target`의 옵션을 그대로 보여 주고 고르면 `change()`. 셸이 실행 버튼을 옮길 때 이 단추도 함께 옮긴다(`shell.js`). `adoptNewBoard`: 앞서 없던 ST-LINK 시리얼 중 프로젝트 보드와 이름이 같은 NUCLEO(또는 이름 모를 보드 하나)가 보이면 대상이 `arm`이 아니고 실행 중이 아닐 때 그 보드로 바꾸고 로그에 알린다.
- 빌드 구성 기본값 Release(`sync`, 옵션 순서). 디버그 시작(`start`)은 항상 `configuration:'Debug'`로 요청한다(main 진입 디버그가 Debug 빌드를 요구).
- 테스트: 테스트 프로필이면 `CIRCUIT_LAB_TEST_BOARDS`(JSON)가 보드 목록이 된다(`main.cjs`, 하네스 기본 `[]`). 테스트 PC에 꽂힌 NUCLEO가 E2E를 바꾸지 않는다.

## 1.12.2 보드 기록 실패 안내

- `desktop/native-ide.cjs` `openocdHint(log)`: OpenOCD 출력에서 원인을 찾아 할 일을 붙인다(`OPENOCD_HINTS`, 구체적인 것부터: `LIBUSB_ERROR_NOT_FOUND` 드라이버 없음, `ACCESS`·`BUSY` 다른 프로그램이 사용 중, 3333 포트 사용 중, 대상 전압 0, MCU 연결 실패, `open failed` ST-LINK 없음). `program`(실행 기록)과 `startServer`(디버그 시작) 두 경로 모두 메시지 첫 줄에 넣는다. 드라이버 설치는 앱이 하지 않는다.

## 1.12.1 예제 목록 한 줄 · 예제 코드 4칸 들여쓰기

- 예제 목록(`shell.js` 항목, `shell.css` `.example-item`): 이름과 분류 태그를 한 줄에 놓는다. 긴 이름은 말줄임(…)으로 줄이고 `title`에 전체 이름을 둔다.
- 예제 코드: `c-format.js` `reindentC`가 formatC의 줄별 들여쓰기만 가져와 나머지 글자는 그대로 둔다. `lecture-examples.js` `indentExampleCode`가 강의·보드 간 통신 예제의 C(STM32 main.c·소스, ESP32 스케치, 커널 모듈)에 적용한다. Python과 HAL 예제(이미 expandC로 4칸)는 그대로다.
- ESLint 10.14.0(Dependabot PR #4와 같은 변경을 직접 커밋).

## 1.12.0 정적 검사 · ESP32 실제 빌드 · 에뮬레이터 I²C/SPI · 라즈베리파이 Python · 인터넷 · 성능 · 구조 정리

- 정적 검사: `eslint.config.js`(no-undef·중복 키·도달 못 하는 코드 등 실행을 깨는 실수만), `npm run lint`, CI 단계. 처음 돌렸을 때 1.11.0 분리에서 생긴 `inspector.js`의 `...project`(정의 안 됨)를 찾았다: 속성 패널의 부품 값이 `try/catch`에 묻혀 반영되지 않던 문제(1.11.0·1.11.1)를 고쳤다.
- CI: `tests/toolchain/esp32-sketches.test.mjs`가 예제의 ESP32 스케치를 Arduino CLI 1.5.1·esp32 3.3.12(+DHT·Adafruit Unified Sensor·PubSubClient)로 빌드한다(`ARDUINO_CLI`, `CI_REQUIRE_ESP32`). 주간 워크플로는 사용자 요청으로 지웠다(Dependabot은 유지).
- 에뮬레이터 보드 간 I²C·SPI: `emu/stm32f446/i2c.js` 슬레이브(OAR1, ADDR/TRA, RxNE와 `held`, TxE를 기다리는 마스터 읽기(`readByte` 재시도, 최대 1초), STOPF는 프로그램이 다 읽은 뒤, AF), `spi.js` `slaveExchange`(소프트웨어 NSS). `FirmwareSession.peerI2c/peerSpi`가 `boardPeers`(`stm32-boards.js` `linkFirmwareBoards`)에서 같은 넷의 슬레이브를 찾는다. `tests/toolchain/board-links.test.mjs`가 WIRE-01·02를 실제 ST HAL로 빌드해 두 보드를 함께 돌린다.
- 라즈베리파이 `src/rpi-python.js`: 들여쓰기 토크나이저·파서·제너레이터 실행기(`PythonProgram`, 문장당 2 µs, `{wait}`/`{input}`/`{pause}`), `PythonDriver`(gpiozero LED·PWMLED·Button·LEDBoard, RPi.GPIO, 버튼 콜백은 `observe`의 에지에서, 1 ms 창에서 4번 넘게 바뀐 핀은 평균 듀티의 PWM). `fixed-run.js`는 코드가 있는 main.py면 Python, 커널 모듈(C)은 시나리오. 편집기에서 main.py 편집 가능.
- 인터넷(`wireless.js`): `INTERNET` 브로커(MQTT 3.1.1)·웹 서버(HTTP/1.1) `Host`, `resolve`·`AT+CIPDOMAIN`, 직렬 모니터 `outside:broker`·`outside:web`. ESP32 `HTTPClient`·`PubSubClient`(`esp32-sketch.js` `httpCall`·`mqttCall`). 예제 WF-03.
- 성능: `engine.js`가 연결 구조(UnionFind)를 프로젝트 객체마다 구조 키(배선·장착·스위치·눌림)로 재사용한다(물리 모델은 매번 새로). 보드 4개 3초 실행 1656 ms → 208 ms.
- 구조: `src/common.js`(`$`·`esc`·`clamp`, 18개 파일의 사본 대체). app.js는 시작 연결만(28 KB) 남기고 기능별 모듈 `app-core`·`app-view`·`app-canvas`·`app-circuit`·`app-editor`·`app-examples`·`app-files`·`app-run`·`app-keyboard`로 나눴다. 상태는 `app-state.js`의 `state` 객체 하나(이전의 모듈 `let` 43개), 긴 인라인 이벤트 처리는 `onSvgPointerdown` 같은 이름 있는 함수. 나눌 때 ESLint의 espree·eslint-scope로 참조를 찾아 옮겼다.
- 저장소: MIT `LICENSE`(배포 묶음에도 포함), `package.json` license·author. `redesign` 브랜치 삭제는 권한 확인에서 막혀 남아 있다. GitHub 저장소 설명은 웹에서 바꿔야 한다.

## 1.11.1 커밋 작성자 정정 뒤 다시 게시

- 저장소 이력 전체(커밋 451개, 태그 78개, `redesign`)의 작성자·커미터를 `moonsyu <anstn0104@naver.com>`으로 바꾸고 `Co-Authored-By: Claude`·`Claude-Session` 줄을 지웠다(`docs/GIT-IDENTITY.md`, 대응표 `docs/commit-identity-map-2026-11-03.json`). 기능 변경은 없다.
- `scripts/verify-release.ps1`: Release의 BUILD-INFO 커밋과 태그 커밋이 다르면 두 커밋의 트리를 비교해 같을 때만 통과한다(작성자 정정으로 SHA만 바뀐 기존 Release). 빌드 출처 확인은 BUILD-INFO 커밋의 CI 실행으로 한다.
- 1.11.0 이전 Release 파일의 BUILD-INFO에는 정정 전 SHA가 남는다. 1.11.1부터는 정정된 이력의 커밋이다.
- 커밋 규칙: 작성자는 이 PC 기본값(naver), 메시지에 다른 작성자 줄을 넣지 않는다(AGENTS.md).

## 1.11.0 보드 간 유선 통신 · 무선 확장 · 업데이트 점검 반영

- 보드 간 I²C·SPI(인터프리터): `hal.js`의 `armSlave`·`finishSlave`와 `i2cSlaveInfo/Receive/Request`·`spiSlaveInfo/Exchange`. 슬레이브 함수(`HAL_I2C_Slave_*`, `SPI_MODE_SLAVE`의 `HAL_SPI_*`, 각 `_IT`와 완료 콜백). I²C 주소는 `Init.OwnAddress1`(HAL_I2C_Init 때 `i2cOwn`). 호출 사이에 온 바이트는 `slave.i2cHeld`/`spiHeld`에 두었다가 다음 호출이 받는다(첫 호출 전 I²C는 NACK). `stm32-boards.js` `connectStm32Drivers`의 `port(viewer,board)`가 각 보드의 `buses.boards`에 다른 보드를 그 시점의 이름(`<viewer id>.PB8`)으로 넣고, `buses.js` `i2cTarget`·`spiRespond`가 넷이 같은 슬레이브를 찾는다. 예제 WIRE-01(I²C, 4.7 kΩ 풀업)·WIRE-02(SPI)는 `wireless-examples.js` `wiredProgram`.
- 에뮬레이터 보드 간 UART: `stm32-boards.js` `linkFirmwareUarts` → `FirmwareSession.linkPeerUart`(보내는 쪽 핀을 받는 USART 설정으로 디코딩) → `peerFrame`(받는 쪽 선 `peer:<보드>:<USART>`, `lineSources`가 RX 핀으로 연결).
- 직렬 입력: `SketchDriver.receive`(`Serial.available/read`), `Stm32Driver.receive`(그 보드 세션의 USART2 `inject`). 로직 분석기 `#la-board`(드라이버 세션의 `signals`). 폴더 프로젝트는 `desktop/workspace.cjs` `boardSources`가 `board-<id>-main.c`·`board-<id>-sketch.ino` 등을 쓰고 읽는다(없으면 `.stm32lab` 값 유지).
- 무선(`wireless.js`): 모듈 속성 `airLoss`(%)와 `hub.air`(고정 시드 xorshift, 블루투스·TCP는 7회까지 재전송 지연, UDP는 손실), ESP-01 `AT+CIPMODE=1` 패스스루(`through`·20 ms 조용하면 전송·`+++`로 끝), 회로 밖 상대 `hub.router`(`STM-Router`/`stm32-router`, 192.168.1.x)·`hub.pc`(192.168.1.100:8080)·`hub.phone`, 직렬 모니터 대상 `outside:pc`·`outside:phone:<모듈 id>`(`outsideInput`/`outsideOutput`). ESP32 스케치의 `BluetoothSerial`·`WiFi`·`WiFiServer`·`WiFiClient`는 `Esp32Bluetooth`·`Esp32Wifi`(허브의 `radios`)로 같은 공중에 들어간다. 예제 WF-02·BT-03.
- 앱 구조: 속성 패널을 `src/inspector.js` `setupInspector(app)`로 분리(app.js 110 KB → 94 KB). 앱 상태는 getter, 동작은 함수로 넘긴다. 나머지(캔버스 포인터 처리·실행 시작·편집기 동기화)는 상태 변수를 직접 바꿔 그대로 두었다.
- 정리: 배선된 STM32 핀 우클릭(`app.js` 첫 `contextmenu`, `elementsFromPoint`), 문서 수치, 생성 스크립트 3개가 다시 맞음(`device-visual-references.json`이 원본, `tests/unit/device-catalog-source.test.js`), `.github/workflows/weekly-check.yml`(주간 `npm audit`·전체 예제 ST HAL 빌드)·`.github/dependabot.yml`, 권한 없는 PC의 심볼릭 링크 검사 생략, Electron 45.2.1·electron-builder 26.18.0·Playwright 1.64.1.

## 1.10.0 블루투스·Wi-Fi 모듈 · 보드 간 통신 예제

- 부품 3종 `hc05-bluetooth-6`, `hc06-bluetooth-4`, `esp01-wifi-8`(family `bluetooth`/`wifi`, 모델 타입 `wireless`). 단자 이름·크기·전압·AT 명령은 HC 매뉴얼, HC-05 수입사 데이터시트, Ai-Thinker ESP-01 데이터시트, Espressif ESP8266 AT 문서 기준(`docs/device-visual-references.json`의 출처). 사진은 Figma `generate_image`(파일 `R1mFMptxf9KRlARPYceERP`)로 만들어 배경 제거·WebP 512px로 `part-images.js`에 넣었고, 구멍·LED 위치는 사진에서 재서 `part-art.js` `PADS`·`statusLed`에 뒀다.
- `wireless.js`: 모듈(`Bluetooth`, `Wifi`)과 한 실행에 하나인 `WirelessHub`. 모델 단자는 p1 VCC, p2 GND, p3 TXD, p4 RXD, p5 EN/CH_PD, p6 STATE/RST(`catalog-model.js` `CUSTOM_MODELS`). 허브의 `primary`(주 보드 세션)가 회로를 풀 때마다 `advance`로 전원·EN·페어링·타이머를 처리한다. 다른 보드는 포트로 합류한다(`connectStm32Drivers` → `joinWireless`).
- 들어오는 쪽: 인터프리터 `buses.js` `Serial1.write`(HAL UART 포함) → `hub.transmit`, 에뮬레이터 `firmware-session.js` `listeners`의 `UartReceiver`, ESP32 `esp32-sketch.js` `serial2Call`. 나가는 쪽: `hub.emit` → 각 세션의 `wirelessRx`(인터프리터는 UART 큐, 에뮬레이터는 `uart:<id>` 선로, ESP32는 Serial2 큐). 넷과 baud가 맞아야 전달된다.
- STATE는 `catalog-electrical.js`에서 `p.linked`로 구동한다. 상태 문구와 LED는 `result.parts[id].status/led`.
- 인터프리터에 `strcmp`·`strncmp` 추가(`runtime.js`), 라이브러리 이름 `Serial2` 추가.
- 예제: `wireless-examples.js`. 한 보드 예제는 `catalog-protocol-examples.js`에서 부르고, 보드 간 예제 3개(`BT-01`, `BT-02`, `WF-01`)는 `LECTURE_EXAMPLES` 뒤에 붙는다. `how`가 있으면 `보드 간 통신`으로 표시한다. 각 보드 코드는 `tests/toolchain/arm-examples.test.mjs`에서 실제 HAL로 빌드한다.
- `device-catalog-data.js`는 3종만 추가했다. 생성 스크립트 불일치는 1.11.0에서 고쳤다(`npm run build:catalog`).

## 1.9.2 배선이 연결된 핀의 GPIO 툴팁 · GPIO19 설명

- `app.js` 캔버스 `pointermove`: 배선·배선 끝이 핀이나 구멍을 덮어도 `elementsFromPoint`로 그 아래 `[data-endpoint]`를 찾아 툴팁과 같은 넷 표시를 한다(클릭과 같은 방식). 전에는 `e.target`만 봐서 배선이 연결된 핀에는 정지 중 툴팁이 없고, 실행 중에는 `점퍼선` 전압만 나왔다. 이제 핀이 없는 배선 구간만 `점퍼선` 툴팁을 쓴다.
- `devboards.js` `RPI_FUNCTIONS`: GPIO19 설명을 `PCM FS · PWM0`으로(`pinctrl-rp1.c` 기준). GPIO13의 `PWM1`은 공식 문서 표기와 같아 유지. 40핀 배열은 공식 그림·pinout.xyz와 불일치 0개.
- 같은 원인이던 `app.js` 첫 `contextmenu`(STM32 핀 우클릭 → 핀 설정)는 1.11.0에서 고쳤다.
- `package.json` `overrides`: 권고 GHSA-g3hv-75wg-m249·GHSA-3g3m-2fjr-6pw4 때문에 `minimatch` 11.0.3, `@electron/asar` 4.3.1(그 아래 `glob` 14.0.3), `@electron/universal` 3.0.6으로 고정. 모두 빌드 도구이고 앱에는 포함되지 않는다. `electron-builder`가 이 버전들을 직접 쓰게 되면 뺀다.

## 1.9.1 ESP32 BOOT 버튼 업로드 확인 · 다운로드 모드 재부팅 안내

- 실물 확인(2026-10-29, ESP32 DevKit WROOM-32, COM4): BOOT 버튼을 누른 채 `runSketch` → esptool 연결(ESP32-D0WD-V3) → 쓰기·해시 검증 → RTS 리셋 → 직렬 모니터. 리셋 순간에도 BOOT가 눌려 있어 보드가 `boot:0x3 … waiting for download`로 다시 다운로드 대기에 들어갔고, BOOT를 뗀 뒤 리셋하자 `boot:0x13`으로 부팅해 `LED ON`/`LED OFF`를 0.5초마다 출력했다.
- `esp32-build.cjs` `monitorHint`: 직렬 출력에 `waiting for download`가 오면 BOOT를 떼고 EN(RST)을 누르라는 안내. `native-ide.cjs` `runSketch`의 모니터가 마지막 200자를 보고 한 번만 보낸다. 업로드 전 안내에 "Writing"이 나오면 손을 떼라는 문구 추가.

## 1.9.0 ESP32 실물 빌드·업로드

- `desktop/esp32-build.cjs`(새 파일): Arduino CLI 찾기(`%LOCALAPPDATA%\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe`, Program Files, PATH), ESP32 포트 목록(`Get-PnpDevice -Class Ports`, VID 10C4·1A86·0403·303A → `{port,name}`), `compileSketch`(코드 해시 폴더 `esp32-builds/<hash>/sketch/sketch.ino` → `--output-dir build`, `sketch.ino.bin`이 있으면 재사용), `uploadArgs`/`monitorArgs`(COM 포트만 허용), `sketchBaud`(`Serial.begin` 값, 없으면 115200), 실패 안내 `compileHint`(빠진 헤더 → 라이브러리 이름, esp32 코어 없음)·`uploadHint`(Wrong boot mode·Failed to connect·No serial data → BOOT 버튼, 포트 사용 중, 포트 없음). `~/.arduinoIDE/arduino-cli.yaml`이 있으면 `--config-file`로 넘겨 Arduino IDE와 같은 코어·라이브러리를 쓴다. FQBN은 두 ESP32 모델 모두 `esp32:esp32:esp32`.
- `native-build.cjs`: 도구 키 `arduinoCli`(자동 검색, 검사는 `arduino-cli version`). `native-ide.cjs`: `esp32Part`(회로의 ESP32 보드만), `buildSketch`(빌드 상태·출력·문제 이벤트는 GCC와 같은 형식, `result.target='esp32'`), `runSketch`(빌드 → 업로드(`track`으로 실행 정지 가능, `stops` 카운터로 중지와 실패 구분) → `arduino-cli monitor`를 `runProcess`로 열어 두고 `input`으로 보드에 보냄). IPC `esp32-ports`·`esp32-build`·`esp32-run`.
- `native-ide-ui.js`: 실행 대상에 `ESP32 (COMn)`(값 `esp32`, `data-port`, 연결 안 되면 `ESP32 보드 (연결 안 됨)`), 고른 포트는 `stm32lab.debugConnection.esp32Port`. ESP32 대상은 빌드 구성·레지스터 창·펌웨어 도구를 숨기고, 디버그 명령은 안내만 한다. clangd는 `arm`/`host` 대상만(`gcc()`). 문제 목록의 `sketch.ino`는 그 보드 파일(`board/<id>/sketch.ino`)로 바꾼다. `project.js`가 `ide.native.target` `esp32`를 받는다.
- 실물 확인(2026-10-28, ESP32 DevKit WROOM-32, CP210x COM4): 앱에서 COM4 대상 표시, FW-08 스케치 빌드 성공, 업로드는 이 보드가 자동 리셋으로 다운로드 모드에 들어가지 않아 BOOT 안내와 함께 실패(esptool 사용자 리셋 순서 2가지도 같음). 예제 ESP32 스케치 빌드: FW-08·FW-09·새 보드 템플릿 성공, IOT-01은 DHT sensor library가 없어 안내대로 실패. 직렬 모니터(`arduino-cli monitor`)는 같은 보드에서 부팅 출력 수신 확인.

## 1.8.1 실물 보드 확인 · 디버그 시작 상태 · 빌드 경고

- 실물 보드 확인(2026-10-28, NUCLEO-F103RB·NUCLEO-F446RE 두 대 연결): Node에서 `NativeIde`로 빌드 → OpenOCD 기록·검증 → ST-LINK 가상 COM에서 USART2 인사·에코 확인, `runOnBoards`로 두 보드 차례 기록(보드별 ST-LINK 자동 배정, 각자 실행), GDB 디버그(main 진입·중단점·`evaluate`·한 줄 실행·계속·일시정지), 앱 화면에서 실행 대상 실물 보드 → Ctrl+F5. 확인 스크립트는 저장소에 넣지 않았다(실물 보드 필요).
- `gdb-mi.cjs`: 시작 중(`state==='starting'`) OpenOCD가 보드를 멈춘 채 연결할 때 오는 이유 없는 `*stopped`(frame `??`)는 알리지 않는다. 전에는 디버그 시작 직후 "일시정지 ??"가 잠깐 보였다.
- `native-build.cjs`: `__stm_environment.c`에 newlib 시스템 함수 약한 정의(`_read`→`__io_getchar`, `_close`, `_fstat`, `_isatty`, `_lseek`, `_getpid`, `_kill`). nosys 스텁의 "not implemented" 링커 경고 7줄이 모든 ARM 빌드에 찍혔다.
- 이 PC 도구로 `tests/toolchain/arm-examples.test.mjs`(HAL 예제 전체 실제 빌드 + 에뮬레이터)를 돌리는 법: `ARM_GCC`=STM32CubeIDE의 `arm-none-eabi-gcc.exe`, `STM32CUBE_F4_ROOT`/`STM32CUBE_F1_ROOT`=`%LOCALAPPDATA%\STM-Simulator-Tools\STM32CubeF4`/`F1`. 같은 변수로 E2E 에뮬레이터 검사 2개도 건너뛰지 않는다.
- ESP32: 앱에는 실물 빌드·업로드가 없다(스케치는 해석 실행). 이 PC에는 Arduino IDE 2의 `arduino-cli`(1.5.1)와 esp32 코어 3.3.2가 있어 `arduino-cli compile --fqbn esp32:esp32:esp32`는 된다. 연결된 WROOM 보드(COM4, CP210x)는 자동 리셋 후 다운로드 모드에 들어가지 않아(`Wrong boot mode detected (0x13)`) 업로드할 때 BOOT 버튼을 눌러야 한다.

## 1.8.0 강의 예제 정리 · 강의 과제 · PWM LED 밝기 · 예제 분류

- PWM LED 밝기: PWM 출력은 GPIO 상태에 `pwm: {duty, frequency}`를 달고 `value`는 평균 전압이다(에뮬레이터 `timer.js`가 쓰던 형식을 `runtime.js` `analogWrite`·`output(pin,value,pwm)`, ESP32 `ledcWrite`, 고정 실행 `ctx.pwm`도 쓴다). `engine.js` `solveCircuit`은 평균 전압으로 한 번 풀고(모터·RC·ADC용), 회로에 LED가 있고 듀티가 0~1 사이인 PWM 핀이 있으면 핀마다 HIGH·LOW로 두 번 더 풀어 LED(단색·RGB 채널·7세그먼트) 전류를 `lo + duty × (hi − lo)`로 바꾼다(`solveOnce`가 기존 본문, `transient.pwmPhase`로 재귀 방지). 결과에 `hasLed`, LED 읽기에 `led: true`. 표시: `rgb-color.js` `ledLevel(read)`(0.12~1, √(I/6 mA))·`mixColor`, `catalog-view.js`·`catalog-render.js`·`render.js`가 렌즈 색과 빛 번짐을 밝기에 맞춘다.
- `lecture-examples.js`: 예제마다 `kind`('실습'/'과제')·`boards`(['rpi'] / ['esp32'] / ['stm32','esp32']), `EXAMPLE_BOARDS`. 이름은 무엇을 하는지만(코드 RPI-02·라즈베리파이5·GPIO 목록 없음), 코드·교재 쪽수는 검색어와 안내 줄에만. 강의 과제 8개: 라즈베리파이와AI Day1 도전 1~6, 리눅스커널프로그래밍 Day3 도전 2·3(회로 있는 것만; 답안 코드는 앱 자체 작성).
- 배선: 라즈베리파이는 90° 돌려 빵판 왼쪽(`rpiProject`), 핀 2k−1·2k = 빵판 k+1번 줄(`rpiRow`). `rpiWire`는 핀 옆 반 줄 틈(홀수 핀 아래, 짝수 핀 위)으로 곧게, 필요하면 `turnX`에서 다른 줄 틈으로. `jumper`(반 줄 틈으로 레일까지), `railAt`(400홀 레일 구멍: 6줄마다 빈 자리), `switchRows`(스위치·GND·10 kΩ 풀업), `groundBridge`(− 레일을 30번 줄 아래로). ESP32는 9~27번 줄(USB 쪽 29·30번 줄 비움), LED는 30번 줄. FW-09 I²C 선은 빵판 위로 돌아 오른쪽에서 ESP32 핀으로(핀 순서 때문에 교차 1곳). IOT-01은 830홀 22~40열, 레일 구멍이 없는 열을 피하고 바깥 레일은 `outer`로 안쪽 레일 구멍 사이를 지난다(교차 4곳, 모듈 몸체가 다른 부품을 가리지 않게 배치). `pos`는 `endpointInfo`(보드 핀 포함).
- 고정 실행 입력: 시나리오 `input: true`, `start`가 `{line(ctx,text)}`를 돌려주면 `FixedRunDriver.receive(text)`가 줄마다 `> 줄`을 출력하고 넘긴다(`acceptsInput`). `monitor.js`: 직렬 모니터 대상이 `board:<id>`이고 그 드라이버가 입력을 받으면 전송 단추를 켜고 `receive`로 보낸다(`boardDriver`).
- 예제 목록: `app.js` `filterExamples`가 `<select id="hal-example">`에 보드별 `<optgroup>`(Raspberry Pi · STM32 · ESP32, 여러 보드 예제는 묶음마다)을 만들고, `shell.js`가 묶음 제목과 항목을 그린다. 보드 단추 `[data-example-board]`(전체·rpi·stm32·esp32, `localStorage` `stm-simulator.example-board`). 활동 바·안내의 "HAL 예제"는 "예제"로.

## 1.7.0 STM32 보드 여러 개

- `devboards.js`: 보드 카탈로그의 두 NUCLEO를 `devboard` 모델(`nucleo-f446re`·`nucleo-f103rb`, kind `stm32`)로 추가. 핀은 `boardPins`를 보드 가운데 기준으로(첫 사용 때 계산, pins.js와 순환 import), 키 `CN7:1`, GPIO·NRST·BOOT0 등은 `signal:<id>.<신호>`, 공급 핀(`STM32_COMMON`: 3V3·5V·GND·VDD·AVDD·IOREF·U5V)은 주 보드와 같은 넷, AGND→GND, NC는 넷 없음. 렌더는 `render.js` `boardSvg(boardId,{prefix})`(버튼 `<id>.USER`/`<id>.RESET`, LD2 `.stm32-led`).
- `stm32-boards.js`: 다른 STM32 보드는 프로젝트 하나의 소프트웨어(`code`·`mcu`·`firmware`·`ide` 중단점/감시식·`deviceDocs`·`stlink`)를 부품에 저장. `swapStm32(project,id)`가 그 보드와 주 보드(surfaces.board)의 소프트웨어·이름·ST-LINK·자리(중심↔원점, 크기 배율)를 맞바꾸고 끝점 `board:` ↔ `devboard:<id>:`를 바꿔 적음(배선·부품 장착·catalogTies). 편집 = 주 보드로 바꾸기라 Pinout·HAL 생성·빌드·디버그·실물 기록 코드는 그대로 쓴다. `stm32View`(복사본에 swap)가 각 보드의 빌드·실행 기준, `viewMapper(id)`가 두 시점의 이름을 바꾸는 자기역함수(`signal:PA5`↔`signal:<id>.PA5`, `drive:` 동일, 공급 넷은 그대로). `promoteStm32`: 주 보드 삭제 시 다음 보드가 주 보드.
- 실행: `Stm32Driver`는 보드 시점의 `SimulationSession` 또는 `FirmwareSession`(ELF)을 회로 드라이버로 돌린다. 세션의 `circuit`을 `ViewCircuit`으로 바꿔 공유 회로를 이름만 바꿔 보게 하고, 시간 단계·출력 변화마다 주 세션의 `circuit.hold`로 모든 보드의 현재 출력을 넣어 다시 푼다(`fresh`, 자기 GPIO가 같으면 재사용). 부품 소유(`ownedParts`): 보드 핀에서 공급 넷을 빼고 신호 넷·부품을 따라 닿는 부품 중 다른 STM32 핀에서 닿지 않는 것 — 그 부품의 장치 상태(OLED·모터 등)는 `decorate`가 그 보드 세션 값으로 덮는다(`SimulationSession`/`FirmwareSession.enrich` 끝). `connectStm32Drivers(session)`: 드라이버에 주 세션 연결, 보드 간 UART(`BusDevices` `peers` 훅, `hal.uart`가 USART 버스에 전달; 같은 넷의 활성 RX·같은 baud에 바이트 전달, 에뮬레이터는 제외). `reset()`은 그 보드 세션만 새로 만든다.
- `engine.js`: STM32 보드 USER 버튼(`<id>.PC13` 4.7 kΩ 풀업, `pressed['<id>.USER']`). `fixed-run.js` `createBoardDrivers`는 STM32 보드 제외.
- `project.js`: STM32 보드 부품은 미니 프로젝트로 `validateProject`(코드·mcu·firmware·ide·deviceDocs), 회전 0, ST-LINK 시리얼, STM32 보드 3개(주 보드 포함 4개) 제한. `surfaces.board.name`·`stlink` 추가.
- `app.js`: 보드 추가(빈 HAL 프로젝트), 속성(이름·ST-LINK·**이 보드 편집**), 편집기 파일 목록 `stm32:<id>`, 주 보드 제목 `STM32-n · 편집 중`, 실행 보드 선택, 보드 RESET/USER, 에뮬레이터 보드별 ELF(`ensureBoardFirmware`, `ide.buildElf(text)`), IDE 훅 `stm32Runs`(보드별 프로젝트 JSON·시리얼). `circuit-edit.js` 붙여넣기 이름·개수.
- 실물: `native-ide.cjs` `assignStlinks`(지정 시리얼 확인·종류 일치·미확인 1개, 중복 금지)와 `runOnBoards`(시리얼 먼저 정한 뒤 보드마다 `compile` → `program`), IPC `native:run-boards`. 실물 실행 대상에서 STM32가 2개 이상이면 `native-ide-ui.js`가 이 경로로 실행. GDB 디버그는 편집 중인 보드만.

## 1.6.0 ESP32 스케치 실행

- `esp32-sketch.js` `SketchDriver`: ESP32 보드의 `sketch.ino`를 기존 C 해석기(`Runtime`)로 실행하는 회로 드라이버. 핀 번호 → `GPIO<n>`(`api.pin`, GPIO6~11·없는 핀은 오류), `analogRead` 12비트, `ledcAttach`/`ledcWrite`(2.x `ledcSetup`/`ledcAttachPin`), `Serial.printf`(`formatPrintf`), DHT(`DHT dht(pin,DHT11)`: 배선·전원이 맞는 DHT11/22 모듈 값, 아니면 NaN), `Wire` 슬레이브(`i2cSlave`/`i2cReceive`/`i2cRequest` → `onReceive`/`onRequest` 콜백). 첫 회로 해석 뒤 시작.
- `parser.js` `compile(code,{esp32:true})`: DHT 헤더·`DHT` 생성자 선언. `runtime.js`: `api.pin`, `api.constructs`. `hal-stdio.js`: `%f`의 NaN/Inf는 nan/inf.
- `fixed-run.js` `createBoardDrivers`: ESP32는 `SketchDriver`, 라즈베리파이는 시나리오/대기. 강의 ESP32 예제 3개는 시나리오 대신 스케치 실행(FW-09 STM32 코드는 `HAL_Delay(100)` 뒤 전송).
- 편집기: ESP32 스케치는 편집 가능(라즈베리파이 코드만 읽기 전용), 컴파일 오류는 실행 시작 때 `ESP32-1 · sketch.ino: n행` 형식.

## 1.5.0 ESP32·라즈베리파이 보드 · 고정 실행 · 강의 실습 예제

- `devboards.js`: 부품 종류 `devboard`(모델 `esp32-nodemcu-32s`, `esp32-devkit-wroom32`, `rpi5`). 핀 끝점 `devboard:<id>:<key>`(ESP32 `L1~L19`/`R1~R19`, 라즈베리파이 `P1~P40`), GPIO 넷 `signal:<id>.<GPIO>`, 3V3/5V/GND는 공통 넷. 핀 설명(`notes`), 보드 그림(`devboardSvg`), 내장 LED 갱신, 보드 코드 편집기 키 `board/<id>/<file>`.
- `engine.js`: 토폴로지에 보드 핀, `<id>.<GPIO>` 키의 GPIO 구동, 라즈베리파이 GPIO2/3 1.8 kΩ 풀업. `CircuitSimulation.drivers`: 다른 보드 프로그램이 회로 시간에 맞춰 GPIO를 더하고 결과를 읽음(두 세션 공통).
- ESP32는 `components.js` `rawTerminals`가 헤더 핀을 장착 단자로 내줘 `findMount`/`applyMount`로 빵판에 꽂힘(`attachments`). 라즈베리파이는 단자 없음(배선만). `terminalKeys`는 보드에서 빈 배열(part 끝점 없음).
- `fixed-run.js`: `defineScenario`, `FixedRunDriver`(타이머 `every`/`after`, `output`/`pwm`/`input`, 입력 변화 처리, `partVoltage`/`wiredTo`, I²C 슬레이브 `i2cSlave`/`onI2cReceive`/`onI2cRequest`, 출력 버퍼), `IdleDriver`, `createBoardDrivers(project,{scope})`. `buses.js` `i2cTarget`이 같은 SDA/SCL 넷의 보드 슬레이브를 찾음(`session.buses.boards`).
- `lecture-examples.js`: 강의 회로도 10개(RPI-01~05, KER-01~02, FW-08, IOT-01, FW-09)와 시나리오. 예제 목록 값 `lecture:<id>`, `applyLectureExample`. 보드 코드는 앱 자체 예시(강의 코드는 저작권 표시가 있어 넣지 않음).
- `app.js`: 보드 추가(보드 보기), 이동·90° 회전·삭제·복사, 속성·Docs, 편집기 탭(읽기 전용), 실행 보드 선택(`run-scope`), STM32 보드 없는 회로는 빈 스케치로 다른 보드만 실행, 직렬 모니터 `board:<id>`.
- 저장 형식 version 2 그대로, `devboard` 부품 추가(이전 버전에서는 열리지 않음).

## 1.4.2 나사 단자·커넥터는 직접 배선

- `catalog-defs.js` `WIRED_CONTACTS`/`isWiredContact`: 빵판에 꽂을 수 없는 단자(나사 단자, JST 커넥터, 모터 소켓, DC 모터·배터리 홀더). 이 핀은 사진의 단자 위치 그대로(격자에 맞추지 않음). `components.js` `wiredKeys`/`pluggedKeys`.
- `placement.js` `findMount`: 직접 배선 단자는 구멍을 찾지 않고, 그런 단자만 있는 모듈은 장착하지 않음. 단자 클릭으로 배선(기존 part-pin 끝점).
- `example-breadboard.js`: 예제 전체 배치에서 직접 배선 모듈은 `takeOffBoard`로 빼고 계획한 뒤 `wireOffBoard`가 빵판 옆(오른쪽 또는 아래, 연결 끝에 가까운 쪽)에 두고 각 단자를 그 넷의 빈 구멍·빈 보드 핀에 배선(필요하면 빈 줄을 허브로, 모듈끼리는 단자–단자). 헤더 핀도 있는 모듈의 단자는 `wireDirectContacts`가 같은 줄의 빈 구멍으로 배선. 그 뒤 전체 배선을 다시 경로 계산(`rerouteExampleWires`, 직접 배선 모듈은 장애물에서 제외).
- 예제 배선 검사: 직접 배선 단자는 '빵판에 꽂힘' 검사에서 제외, 교차 허용치·전체 길이 기준(.64) 조정.

## 1.4.1 모듈 핀을 사진의 단자 자리로

- `catalog-defs.js` `ON_CONTACT_PINS`: 사진에 단자가 보이는 18종의 핀 좌표(보드 아래, 단자 자리의 2.54 mm 격자). 스크래치 스크립트로 사진 u/v(`part-art.js` `PADS`)에서 계산해 넣은 값이며, 헤더·단자대는 묶음의 간격을 유지하고 사진에 없는 단자는 보드 바로 아래 한 줄. `model-geometry.js`: 이 모듈들은 몸체를 핀 쪽으로 옮기지 않고 가운데에 둠(`ON_CONTACTS`). 다리는 사진의 단자(PADS)에서 격자 핀까지 짧게 그린다.
- 남은 것: HAT의 2열 헤더는 같은 빵판 줄에 놓일 수 없어 예제에서 다리가 꺾여 꽂힌다(일반 배치). UART 케이블 두 종은 케이블 표시가 따로 있어 제외.

## 1.4.0 부품 설명 · 중복 부품 정리 · 실물 부품 예제 · 사진 단자에 맞춘 핀

- 설명: `part-datasheets.js` L298N 세 종의 이름·모델(모듈 / Multiwatt15 / PowerSO20), DS18B20 두 종, Grove SHT31, WS2812 모듈 구분. `device-catalog-data.js`의 "앱은 …" 식 옛 설명(간이 모델 기준) 20곳을 실물 부품 기준으로 고침.
- 목록: `part-library.js` `MERGED_PARTS`(간이 부품 → 핀 구성이 같은 실물 부품, 27종)는 `PART_LIBRARY`에서 빠지고 검색어는 실물 카드로 합쳐짐. `ALL_PARTS`는 문서·저장 회로용 전체. 핀이 적은 간이 7종은 `hint`에 실물 핀 수.
- 예제: `catalog-examples.js` `physicalExample`(간이 부품 → `becomePhysical`, motor/stepper → `splitPhysical`), `halExampleFor`가 적용. Docs는 선택한 부품 종류는 그대로 둔다(`keep`). `model-geometry.js` `LEGACY_PHYSICAL`은 `catalog-defs.js`로 이동, `physicalTypeOf`.
- 핀: `part-art.js` `PADS`(사진에서 잰 단자 위치 u/v) — `artPadPosition`이 다리 시작점으로 씀, 한 줄이 몸체보다 넓으면(1.27 mm IC) 가장자리에 고르게 펼침. `catalog-defs.js` L298N·릴레이·매트릭스·ULN2003·HAT·RS485·MAX98357A·CAN·URM09 I²C·Grove/옆 커넥터 모듈·PEC11 핀 재배치(단자 순서대로, 다리가 엇갈리지 않게). 간이 부품은 한 줄 핀이면 실물 위치(`components.js` `physicalPins`). DC 모터는 `dy`로 뒤쪽 단자 위에 서고 다리 4피치(`LEAD_SPANS`).
- 사진(Figma 6장): L298N 모듈(IN1~IN4 헤더), 8×8 매트릭스(양쪽 5핀), 1.3인치 OLED(8핀 라벨), 24LC02B DIP, SOT-23-5, URM09 Trig. DC 모터 사진은 단자가 아래로 오게 회전.

## 1.3.3 짧은 다리 · LED 옅은 렌즈 · 6 mm 버튼 · 보드 초기화 수정

- `components.js` `LEAD_SPANS`/`fixedLeadSpan`: led·ldr·ntc·capacitor·button(2핀) 28, resistor·diode·buzzer 42. `model-geometry.js` `LEAD_GAP=14·2/3`: 한쪽 핀 부품은 데이터시트 몸체를 핀 쪽으로 옮겨 가장자리–핀 간격 ≤ LEAD_GAP. `catalog-defs.js` `rowHalf`: 양쪽 핀 줄(DIP-8, SOT-23-5, L298P, 슬라이드 DPDT/DP3T)은 실제 몸체 폭 바로 바깥 격자.
- 버튼: `button-4`·기본 `button` 단자 ±14(2×2피치 모서리), 크기 6×6 mm(B3F-1000형), 사진 새로 생성. LED 사진 4색을 옅은(꺼진) 렌즈로 다시 생성, 켜짐 겹침 불투명도 .88.
- `board-reset.js`: 프로젝트 보드의 MCU 계열 기본값으로 초기화(F103RB에서 F446RE 기본값 때문에 실패하던 버그).

## 1.3.2 LED 3칸

- `components.js` `fixedLeadSpan(p)`: LED(`led`, family led)는 다리 간격 28(2피치, 3칸). `addPart` 기본 span과 `example-layout.js` 2핀 후보(min=max=28)에 쓴다. 기존 저장 파일의 LED span은 그대로.

## 1.3.1 LED 색별 사진

- `part-images.js`에 `led-tht-2:green|blue|yellow`(색 변형 키 `<id>:<색>`). `part-art.js` `partImageKey(p)`가 `p.color`에 맞는 사진을 고르고(없으면 기본), 기본 `led`도 `led-tht-2`로 그려지므로 같은 규칙을 탄다.

## 1.3.0 실제 크기 보드·빵판 · 부품 사진 · 시작 보드 F103RB

- 단위: 2.54 mm = 14 (1 mm = 14/2.54). `geometry.js` `BOARD` 70×82.5 mm, `BB`(400홀) 301×463(54.3×84 mm, x 644.5·y 99.5 — a1 구멍은 718,128 그대로), `FULL_BB` 910×301(BB830). 400홀 전원 레일은 a/j에서 40(2피치+여백) 바깥.
- `pins.js` 헤더: UM1724 Figure 5의 mm 좌표(`hx(mm)`), 피치 14. CN5는 morpho 줄보다 0.4피치 아래. `boardSvg`는 예전 440×532 그림을 `board-art` 그룹 행렬로 실측 외곽에 맞추고 헤더·핀은 정확한 좌표에 따로 그린다.
- `wire-router.js` `gapLanes`: 이웃한 헤더 핀 사이(간격 7.6~28) 가운데에 배선 통로를 추가(CN5와 CN10 사이 좁은 통로). `example-layout.js`: 배터리 홀더·DC 모터(2선 외부 부품)는 겹침 검사에 발자국만 쓴다(`solid`).
- 부품 사진: `part-images.js`(생성 파일, WebP base64, 512px 이하) + `part-art.js`(`ART` 겹침 보정값 u/v/r, `photoRect`, `artPadPosition`, `partArtShape`). `catalogShape`가 사진 부품이면 `partArtShape`를 돌려준다. 실제 좌표로 그리기 위해 모델 변환의 역행렬 그룹 안에 둔다. 작업 공간은 blob URL, `part-preview.js`는 독립 SVG 이미지라 data URI로 바꾼다. 사진 생성 절차·프롬프트는 작업 로그 참고(Figma `generate_image`, gpt-image-2.5, 파일 hc8dpVxaUtC6oklGHsbdpC).
- 시작 보드: `boards.js` `START_BOARD_ID='nucleo-f103rb'`, `project.js` `startProject()`. `DEFAULT_BOARD_ID`(F446RE)는 보드 기록 없는 예전 파일용으로 유지.

## 1.2.4 실측 크기 · 이름/모델명

- `PART_DATASHEETS[id]`: `name`(일반 이름, 예 "NTC 온도 센서")·`model`(데이터시트 모델, 예 "KY-013")·manufacturer·size(모든 78종; 조사에 없던 5종은 `confidence:'typical'`, `size.xy`는 그림 가로·세로에 그대로)·datasheet. `datasheetLine(id)`=모델명만.
- `datasheetScale`은 비율 제한 없이 정확히 W×H mm. 데이터시트 크기가 있으면 2핀 다리 사이 맞춤 축소도 하지 않는다(배터리 홀더 70 mm, DC 모터 27.5 mm). 교차 허용 추가: l298n·ref_dc_motor_2·ref_dc_supply_2 4, ref_l298n_module_13 7, ref_stepper_bipolar_4 2.

## 1.2.3 도움말 → 버전 정보

- `shell.js` 명령 `help.about`(도움말 메뉴)이 `#app-update`를 눌러 업데이트 창을 연다. `update-ui.js`는 창을 "버전 정보 · 업데이트"로 바꿔 `.update-facts`(현재/최신 버전, 상태 `PHASES`, 마지막 확인)를 그리고, 메뉴 항목 글자에 `(v현재 → v새 버전)`을 넣는다. `updater.cjs` 상태에 `checkedAt`(확인 시작 시각) 추가.

## 1.2.2 업데이트 버튼 표시

- 1.1.0에서 업데이트를 도움말 메뉴로 옮길 때 넣은 `shell.css`의 `#app-update{display:none!important}`가 남아, 1.1.0~1.2.1에서는 업데이트가 준비돼도 제목 표시줄 버튼이 보이지 않았다. 규칙을 지웠고 `shell.e2e`가 버튼을 표시했을 때 테마 버튼 왼쪽에 보이는지 검사한다. 이 버전들에서는 **편집 → 설정 → 업데이트 → 업데이트 확인 · 설정 열기**로 업데이트 창을 열어 적용할 수 있다.

## 1.2.1 사용 중 업데이트 감지

- `PortableUpdater`: `CHECK_INTERVAL` 30분, `WAKE_INTERVAL` 10분, `lastCheck`·`now` 주입. 자동(백그라운드) 확인이 실패하면 `idle/current/available` 상태를 유지하고 메시지만 바꾼다. 수동 확인 실패는 `error`.

## 1.2.0 부품 바로 배치 · 데이터시트 크기와 이름

- 부품 카드 클릭은 `app.js` `freeSpot()` 위치에 바로 `addPart`한다. 2핀 부품의 구멍 두 개 선택 모드(`TWO_PIN_TYPES` 분기)와 크기 조절(`resize-ui.js`, 조절점·Alt+0)은 삭제했다. `src/resize.js`는 테스트가 쓰므로 남겼다.
- `src/part-datasheets.js` `PART_DATASHEETS[catalog id]`: model·manufacturer·name·size{w,h,d mm}·datasheet·confidence. 조사 결과를 합쳐 만든 파일이며 신뢰도 low의 크기는 넣지 않았다. `UNITS_PER_MM=14/2.54`.
- 크기는 화면 전용이다. `model-geometry.js` `datasheetScale(referenceType)`·`displayModel(p,{datasheet})`이 `scaleX/scaleY/dx/dy`를 돌려주고 `modelTransform`·`modelPoint`로 그린다. 단자(`localTerminals`)는 바뀌지 않는다. 한쪽 핀 모듈은 핀 쪽 가장자리를 고정(dx/dy)한다. 기존 기본 부품(resistor, led…)은 `datasheetIdOf`로 같은 패키지의 데이터시트를 쓴다.
- 예제 배치(`example-layout.js`)는 부품끼리·보드와의 겹침에 데이터시트 크기(`box`)를, 막히는 구멍·여유 구멍·배선 경로에 그림 크기 발자국(`foot`, `datasheet:false`)을 쓴다. 자기 다리가 놓인 구멍은 본체에 덮여도 된다. 예비 배치(`example-breadboard.js` `exampleBodyBounds`)는 발자국을 쓴다. 교차 허용: 4자리 7세그 11, L298N IC 2, L298P 3.
- 이름: `catalogName(v)`(catalog-defs)가 데이터시트 이름을 `CATALOG_DEFS`·카탈로그 예제에 쓴다. 미리보기(`part-preview-ui.js`)는 `.part-preview-model`에 `datasheetLine(id)`(모델 · 제조사 · W×H×D mm)를 표시한다.

## 1.1.1 HAL 예제 배치 미리보기

- `example-preview-ui.js` `setupExamplePreviews({getBoardId})`: `#hal-example-list [data-example]` 위에 `#example-layout-preview` 팝오버. `applyHalExample`로 만든 예제 회로를 `initSvg`·`renderBreadboards`·`renderWires`·`renderParts`·`updateSurfaces`로 그리고 getBBox로 viewBox를 맞춘 뒤 레이어 id를 지운다(작업 공간 id와 겹치지 않게). 목록 스크롤은 열린 미리보기만 닫는다.

## 1.1.0 제목 표시줄 · 설정 창 · 패널 옮기기/분리 · 보드 선택

- 제목 표시줄: 이름+메뉴, `#command-palette-open`(돋보기 칸), `#run`, `#app-update`(available/downloading/ready에서만), 테마, 패널 전환, 저장. `#ide-build`·`#debug-start`·`#step`·`#native-tools`·`#native-connection`은 `#hidden-controls`에 두고 메뉴·팔레트가 클릭한다. `#project-name`은 탐색기, `#save-state`는 상태 표시줄.
- 설정 창: `shell.js` `setupSettingsDialog`. `layout.openSettings(tab)`, `showView('settings'|'keybindings')`도 이 창을 연다.
- 실행 대상: `native-ide.cjs` `listBoards()`(IPC `native:boards`). `native-ide-ui.js`는 보드마다 `value="arm"`, `data-serial` 옵션을 만들고 고른 시리얼을 `stm32lab.debugConnection.serial`에 둔다. `chooseStlink`는 고른 보드가 다른 종류면 거부한다.
- 패널: `DOCK_REGIONS`·`DOCK_UNITS`, `state.dock`(영역→단위). `showUnit`·`regionOf`가 표시·최대화를 단위 위치로 바꾼다. 분리 창은 `popout.js`로, app.js의 첫 import여야 한다(document 조회·activeElement·keydown 리스너를 분리 창과 공유). main은 `stm-unit-*` 이름의 빈 창만 연다.
- 시작 테마: `ide-settings-ui.js`가 시작 시 appearance를 `system`으로 되돌린다.

## 1.0.0 전체 기능 점검 (실물 보드 연동 제외)

- 6회차 감사로 찾은 결함을 고친 버전이다. 세부 목록은 docs/WORKLOG.md 1.0.0 항목.
- 단축키: `keybindings.js` `bindingProblem`(글자·Shift+글자 키와 `FIXED_KEYS`는 지정 불가), `conflicts`는 두 단계 키 앞부분도 충돌로 본다. 편집기 안의 Ctrl+Shift+글자는 기본값일 때만 Monaco에 양보한다. 도움말·팔레트 버튼의 키는 `[data-binding-key]`를 `keyFor`로 채운다.
- 편집기 `replaceChanged`는 `setValue` 후 바뀐 끝 위치에 커서를 둔다(모델 직접 편집은 `}` 블록 정렬을 깨뜨린다).
- Pinout: `serial-config.js` `setSerialEnabled(config,id,on,routes,remaps)`는 F1 리맵 묶음 단위로 고르고 짝 핀이 바쁘면 거부한다. `configProblems`는 꺼진 주변장치의 핀·NVIC, HAL 이름과 겹치는 라벨, SWD 핀, I2C 400 kHz 초과를 알린다. 라벨 매크로는 시뮬레이터 상수(`session.js`, 소스에 #define이 있으면 생략)와 ARM `-D` 플래그로 준다.
- `.ioc`: `evalIocNumber`(사칙·16진수), HSE·다른 PLL 클록은 경고 후 HSI로 만들 수 있는 값, DMA·동기 USART·SPI 속도·Pulse를 읽는다. Cube 폴더 가져오기는 `system_stm32*.c`·syscalls·sysmem만 빼고 `*_hal_conf.h`는 유지한다.
- Docs: `bindParts`의 `foreign`은 다른 장치와 신호선을 공유하는 부품을 재사용하지 않는다. 이미 예제대로 배선된 장치는 배치를 건드리지 않고, Docs가 추가한 배선은 `wire-ends.js` `legalizeWireEnds`로 한 칸 한 배선 규칙을 지킨다. F103에서는 Bare-metal 모드를 막는다.
- ARM 빌드: `irqBody`는 IRQ마다 해당 HAL 처리기(꺼진 주변장치는 빈 함수), 사용자 핸들러 판단은 `liveLines`(`#if 0/1`, `#else`, 중첩). SDK 소스는 `-Wall -Wextra` 없이, 링크 오류는 `diagnosticsFrom`이 목록으로.
- 에뮬레이터: `callStack`은 BL 대상과 예외 프레임(EXC_RETURN)으로 실제 호출만, `declaredType`이 소스 선언으로 부호·float·배열을 표시한다.

## 0.34.4 직렬 모니터 안내 · 고급 예제 printf

- 하단 UART 탭의 이름은 "직렬 모니터"(shell.js `bus`)다. 안내 문구에 옛 이름 "통신 탭"을 쓰지 않는다. 예제 안내에 "직렬 모니터 탭"이 있으면 적용할 때 `layout.showPanel('bus')`.
- `advanced-examples.js` `finish`는 printf를 쓰는 고급 예제에 `__io_putchar`(ITM)를 붙인다(최소 생성 코드에는 없음).

## 0.34.3 부품 다리와 배선 끝은 다른 구멍

- `placement.js` `wiredHoles(wires)`, `findMount(p,components,radius,surfaces,wires)`가 배선 끝 구멍을 제외한다(앱의 장착 호출은 `project.wires`를 넘긴다). `clickEndpoint`는 2핀 부품 배치에서 배선 끝 구멍을 거부한다.

## 0.34.2 부품 선택 범위

- 부품을 잡는 영역은 칠해진 도형과 `catalogBodyBounds` 크기의 투명 사각형뿐이다. `.led-glow`·`.rgb-glow`·`.terminal-label`·`.buzzer-*`·`.dc-rpm`은 `pointer-events:none`(style.css). `resize-ui.js` `paintedBox(body)`가 같은 요소를 빼고 테두리 범위를 잡으며 화면 여백은 3 px(최소 20 px).

## 0.34.1 배선 끝 클릭으로 옮기기

- `app.js`: 배선 끝을 움직이지 않고 클릭하면 `carry={id,end}`, 다음 `pointerdown`에서 `dropWireEnd`. `wireEndPreview`가 끌기·집기 미리보기를 함께 그린다. `CARRY_HINT`는 `refresh`와 캔버스 키보드 안내(`announce`) 모두 우선한다.

## 0.34.0 한 칸에 점퍼선 하나 · 배선 끝 옮기기

- `src/wire-ends.js`: `endpointBlocked(project,id,{ignoreWire})`(다른 배선 끝 또는 `occupiedHoles`), `endpointAt(project,point,radius=8)`(가장 가까운 핀·구멍·부품 단자), `moveWireEnd(project,wireId,end,id)`. `app.js` `clickEndpoint`가 시작·끝에서 막고, `render.js`가 배선 끝마다 `<g class="wire-end" data-wire-end data-owner-wire>`를 그려 `drag.type==='wire-end'`로 옮긴다.

## 0.33.2 실행은 항상 기록 · 다른 보드 거부

- `runOnBoard`는 연결 설정과 관계없이 `program … verify reset exit`. `connection.flash`(기본 true)는 디버그 시작의 GDB `load`에만 쓴다. `chooseStlink`는 이름이 알려진 다른 종류의 보드만 있으면 오류를 낸다(보드 이름을 모르는 단일 ST-LINK는 허용).

## 0.33.1 실물 보드 실행 후 디버거 분리

- `NativeIde.run`(ARM, OpenOCD 자동 시작)은 `runOnBoard`: OpenOCD 한 번 실행으로 `program … verify reset exit`(기록 안 함이면 `reset run; shutdown`) 후 종료한다. GDB를 붙이지 않으므로 ST-LINK 폴링과 LD1 깜빡임이 없다. `boardTarget(text, connection)`이 target 스크립트와 ST-LINK 시리얼을 정한다. 디버그 시작은 그대로 OpenOCD+GDB.

## 0.33.0 NUCLEO-F103RB 실제 빌드 · 실물 보드 · 펌웨어 에뮬레이터

- 도구: `desktop/tool-installer.cjs`에 `CUBE_F1`(STM32CubeF1 v1.8.7, `desktop/tool-manifest-f1.json` 파일별 SHA-256 201개, `%LOCALAPPDATA%/STM-Simulator-Tools/STM32CubeF1`). 매니페스트는 `node scripts/build-tool-manifest.mjs --f1 <clone>`. 도구 키 `cubeF1`(개발 도구 창 `STM32CubeF1 SDK 폴더`, 자동 감지: 설치 폴더·`~/STM32Cube/Repository/STM32Cube_FW_F1_*`·`STM32CUBE_F1_ROOT`). 시작 알림은 F103RB 프로젝트일 때만 CubeF1을 요구한다.
- 빌드(`native-build.cjs`): `SDKS[family]`가 SDK 키·폴더·접두사·CPU 플래그(`cortex-m3`, soft float, `STM32F103xB`)·startup(`startup_stm32f103xb.s`)·링커(128K/20K)·HAL 모듈을 정한다.
- 실물 보드(`native-ide.cjs`): OpenOCD target은 `OPENOCD_TARGETS[보드 계열]`(`stm32f1x`), `chooseStlink(보드 이름, 설정 시리얼)` — 설정 시리얼 > ST-LINK 1개 > STM32CubeProgrammer `-l st-link`의 Board Name 일치 > 오류(시리얼 목록). STM32CubeProgrammer가 없으면 PowerShell `Get-PnpDevice`로 시리얼만 얻는다. 보드 연결 창에 `ST-LINK 시리얼 (선택)`.
- 에뮬레이터(`src/emu/stm32f103/`): `Stm32f103 extends Stm32f446`(`resetHz` 8 MHz, `build()`가 F1 주소에 배치). F1 전용 `RccF1`, `FlashF1`, `GpioPortF1`(CRL/CRH, `moder()`로 F4식 보기 제공), `Afio`(MAPR → `signalPins`, EXTICR; `soc.syscfg`로도 노출), `DmaF1`(채널 1~7, `DMA1_REQUESTS`), `AdcF1`(F4 Adc 상속), `DbgmcuF1`, `PwrF1`. USART·I2C·SPI·TIM·EXTI·CAN·CRC·IWDG·WWDG는 F4 모델 공유(IRQ 번호 동일, TIM2만 16비트로 바꿈). 메모리 버스는 F446 크기 그대로. `firmware-session.js`는 `project.mcu.family`로 SoC와 핀 목록을 고른다.
- 테스트: `tests/firmware/firmware-f103.test.js`(고정 펌웨어 `tests/fixtures/firmware-f103/*`, `scripts/emu/build-f103-fixtures.mjs`로 다시 빌드), `tests/toolchain/arm-examples.test.mjs`가 두 보드를 모두 빌드·실행(CI는 CubeF1 고정 커밋을 받음), E2E 두 개(F103 ELF 실행, 보드 전환 후 앱에서 빌드·에뮬레이터 실행), 단위(F1 빌드 계획, OpenOCD F1·시리얼, ST-LINK 선택, 설치 매니페스트).
- 실물 확인: NUCLEO-F103RB(ST-LINK SN `0668FF544949878667173544`)에 blink·exti를 써서 PA5 토글, RCC_CFGR(PLL x16, APB1 /2), AFIO_EXTICR4·EXTI·NVIC IRQ40, SWIER로 인터럽트 처리 확인. F446RE는 건드리지 않았다.

## 0.32.0 NUCLEO-F103RB 보드 (회로 시뮬레이터)

- `src/mcu-family.js`: 계열 프로필 `FAMILIES`(STM32F446RE·STM32F103RB). 핀(`gpioPins`), UART/타이머/기타 경로, 핀 배치 방식(`pinMux` 'af'|'remap'), F1 AFIO 리맵 묶음(`F1_REMAPS`, `remapFor`), JTAG 핀, DMA 단위·요청(F1 DMA1 채널 1~7 고정), IRQ 번호, 클럭 범위, HAL 접두사·define. `mcu-config.js`의 `validateMcu`·`configProblems`(F1 리맵 묶음 검사)·`pinFunctions`·`defaultMcu`가 `family`를 받는다.
- 보드: `boards.js` 항목에 `mcuFamily`·`chip`·`core`, `projectBoard(project)`. `pins.js` `BOARD_SIGNALS`·`boardPins(boardId)`(F103RB는 CN7-29/31=PD0/PD1, CN10-18=PB11, 열린 솔더 브리지는 `OPEN_BRIDGES`), 엔진은 `ALL_GPIO_PINS`. `validateProject`는 보드와 `mcu.family`가 다르면 거부한다.
- 코드 생성(`hal-generator.js`): F1 분기(HSI/2×PLL, 대기 사이클, APB1≤36 MHz, ADC 분주≤14 MHz, AFIO 클럭·리맵·SWJ_NOJTAG, 입력 방향 AF 핀은 `GPIO_MODE_INPUT`, DMA 채널, ADC 보정).
- 인터프리터(`hal.js` 등): `HalAdapter.family/f1`, F1 상수(`halConstantsFor`), AFIO 리맵 순서 검사(`checkF1Pin`), F1 ADC 변환 시간, F1 DMA(Channel 필드 없음), NVIC 번호, CAN1 리맵 2. `hal-source.js`는 계열별 구조체와 헤더.
- 예제 이식(`src/example-port.js`): F446RE 예제를 F103RB 프로젝트에 적용하면 클럭 84→64 MHz, 빈 F1 경로로 핀 이동(배선·장착도 이동), 타이머 PSC/ARR 비례 조정, 32비트 카운터는 16비트+`(uint16_t)` 차이, DMA 스트림→채널, IRQ 이름, F4 전용 필드 제거, 생성 함수 재생성. DCMI·I2S 예제는 `f1Unavailable`로 거부하고 목록(`searchHalExamples(q, family)`)에서 뺀다. `applyHalExample`은 `보드:예제`로 캐시한다.
- UI: 보드 그림(`boardSvg(boardId)`, 보드가 바뀌면 다시 그림), 보드 카드 칩, Pinout(계열별 핀·경로·DMA 채널·IRQ·리맵 묶음, 아래 요약), 새 프로젝트 보드 선택.
- 이 버전에서는 F1 ARM 빌드를 막았다. 0.33.0에서 ARM 빌드·실물 보드·펌웨어 에뮬레이터를 지원한다.
- 테스트: `tests/unit/mcu-family.test.js`, `tests/interp/f103.test.js`, `tests/interp/f103-examples.test.js`(모든 예제를 F103RB로 이식·실행해 F446RE 출력과 비교, 약 50초).

## 0.31.0 앱 안에서 개발 도구 설치 · 시작 시 도구 확인

- `desktop/tool-installer.cjs`: `installPlan(tools)`은 빠진 항목(gcc→armGcc·armGdb, cube, openocd, clangd)을 크기·출처와 함께 돌려준다. `installTools(ids)`는 `%LOCALAPPDATA%/STM-Simulator-Tools`에 설치한다(영문 경로만). 릴리스 zip은 `setup-native-tools.ps1`과 같은 고정 SHA-256, 압축 해제는 Windows `tar.exe`(bsdtar). STM32CubeF4는 Git 없이 `codeload.github.com`의 고정 커밋 소스 압축(HAL 드라이버, CMSIS 디바이스)과 `raw.githubusercontent.com`의 CMSIS Core 헤더 30개를 받아 `desktop/tool-manifest.json`의 파일별 SHA-256(280개)으로 검증하고 필요한 파일만 둔다. 실패 시 `.partial`·작업 폴더를 지운다. 매니페스트는 `node scripts/build-tool-manifest.mjs <STM32CubeF4 clone>`으로 다시 만든다.
- `NativeIde.installPlan/installTools/cancelInstall`, IPC `native:install-plan|install-tools|install-cancel`, 진행 이벤트 `tools-install`. 설치 뒤 저장된 경로 중 없는 파일은 비우고 `detectTools`로 다시 채운다.
- UI(`native-ide-ui.js`): 개발 도구 창 **필요한 도구 설치** → 목록·크기 → **설치 시작**/**설치 중지**. 시작 3초 뒤 실물 보드용 도구(clangd 제외)가 빠져 있으면 `#tools-notice`(설치·나중에·다시 묻지 않기, `stm32lab.toolsNotice.v1`). E2E 하네스는 `toolsNotice:true`가 아니면 이 알림을 끈다.
- 실제 다운로드 검증: 임시 폴더에 전체 설치 74초, GCC 15.2.1·GDB 16.3·OpenOCD·clangd 23.1.0 실행 확인, 설치한 도구만으로 LED 예제 빌드, 설치 후 약 1.6 GB.

## 0.30.1 실물 보드 실행(IDE) 수정

- `native-ide.cjs`의 `openocdArgs`: CubeIDE 플러그인 OpenOCD(ST 빌드)는 `-s …debug.openocd_*/resources/openocd/st_scripts -f interface/stlink-dap.cfg -c "transport select dapdirect_swd" -f target/stm32f4x.cfg`, 그 밖(xPack 등)은 `interface/stlink.cfg`. ST 빌드에서 예전 hla `stlink.cfg`는 `Infinite eval recursion`으로 멈춘다.
- `configure`(개발 도구 저장)는 파일에 입력값을 쓰고 사용 값은 `detectTools`로 채운다(이전에는 재시작 전까지 빈 SDK 경로).
- 보드 연결의 "시작할 때 빌드한 펌웨어를 보드에 기록"은 기본 해제(기존 펌웨어 보호)로 유지한다. 처음 쓰는 순서는 IDE 문서에 적었다.
- 실물 확인: `NativeIde`에 빈 도구 설정 저장 → 자동 감지, `run`(STM32 · ARM GCC, OpenOCD, 기록) → 빌드·플래시·실행, GDB 일시정지마다 `uwTick` 724→2908 ms, PA5 변화. 사용자 진단 로그의 실패(0.29.2 ARM GCC 미설정, 0.30.0 SDK 빈 경로)를 근거로 원인을 찾았다.

## 0.30.0 4칸 들여쓰기 · 예제/Docs 구분 · F11 연속 실행 · 찾기 창 정리 · CubeIDE 도구 감지

- **4칸 들여쓰기**: 생성기(`hal-generator.js`)는 내부 문자열 치환 기준이라 2칸 그대로 두고, 사용자에게 넘기는 지점(`blankProject`, `resetMainCode`, Pinout 코드 생성, `applyHalExample`)에서 `expandC`(기본 4칸)를 거친다. 장치 Docs 삽입은 파일의 들여쓰기 단위(`indentUnit`)를 따른다.
- **활동 바**: HAL 예제 `{ }`, 장치 Docs 책 아이콘. `VIEWS`의 `hint`를 툴팁에 붙인다(280px 줄바꿈).
- **F11 연속 실행**: `shell.js` 단축키 처리기가 `e.repeat`를 모두 버리던 것을 단계 명령(`run.over/into/out/step`)만 허용. 멈춘 상태가 아니면 단계 요청은 기존대로 무시된다.
- **찾기 창**: 편집기의 Ctrl+F·Ctrl+H·F3·Shift+F3·Ctrl+F3을 `ide-find` 이벤트로 앱 찾기 막대에 보낸다. Monaco 기본 찾기 위젯은 열리지 않는다.
- **구분선**: 코드/회로 편집기 그룹 사이 선을 글자색 30% 혼합색으로(White 약 `#c2c4c8`).
- **도구 감지**: `native-build.cjs`의 `detectTools`가 `C:/ST/STM32CubeIDE_*/STM32CubeIDE/plugins`의 GNU Tools for STM32(ARM GCC·GDB)와 OpenOCD를 찾는다. 이 PC에서는 CubeIDE 1.19.0의 GCC 13.3.1로 빈 프로젝트와 예제 126개를 모두 빌드·링크하고 에뮬레이터에서 실행했다. 실물 NUCLEO-F446RE(ST-LINK V2J48M35, STM32F446xx Rev A, 512 KB)는 STM32_Programmer_CLI 핫플러그 연결로 확인만 했고 플래시하지 않았다(사용자 선택).

## 0.29.2 코드 정렬이 문장 줄 나눔까지

- `c-format.js`: `splitStatements`(원래 줄마다 나뉜 조각 목록)와 `formatCode`(나눔 + `formatC` 들여쓰기, 원래 줄별 결과 `lines`와 `range` 지원). `expandC`는 예제용 2칸 `formatCode`. 중괄호 있는 `}` 뒤의 `else 문장;`·`else if (c) 문장;`이 같은 줄에서 끝나면 중괄호를 붙인다(`singleStatement`로 안전할 때만). 연산자 공백은 바꾸지 않는다(사용자 목표 형식).
- `code-format-ui.js`: 코드 정렬·선택 영역·`}` 블록 모두 `formatCode`. 편집은 원래 줄마다 그 줄이 된 여러 줄로 바꿔 중단점 장식이 문장을 따라간다. `}` 뒤 커서는 그 줄이 된 마지막 줄의 같은 위치로 옮긴다. `formatProjectSources`(저장 시 정렬)는 `project.ide.breakpoints`의 줄을 새 위치로 옮긴다.
- 검사: `tests/unit/c-format.test.js`(사용자 목표 형식 `tests/fixtures/format-compact.c`, else if 사슬, 범위, 중단점 이동), `tests/e2e/format-ime.e2e.test.mjs`(실제 앱 코드 정렬 결과와 중단점 `main.c:10`).

## 0.29.1 `}` 정렬 IME 수정 · 예제 코드 줄 정리

- **`}` 입력 시 블록 정렬**: `code-format-ui.js`가 keyUp의 `key==='}'`로 감지해 Windows 한글 IME(key `Process`)에서 동작하지 않았다. Monaco `editor.onDidType`(입력 명령)으로 감지해 IME 입력과 자동 닫힌 `}` 덮어쓰기(내용 변화 없음)도 처리한다. 검사 `tests/e2e/format-ime.e2e.test.mjs`(`keyboard.insertText('}')`로 IME 입력 재현).
- **예제 코드 정리**: `c-format.js`의 `expandC`가 `;`·블록 `{` `}`·`case …:` 뒤에서 줄을 나누고 `formatC`(2칸)로 다시 들여쓴다. 초기화 중괄호·`for` 헤더·문자열·주석·전처리기는 유지, 토큰 불변·멱등. `applyHalExample`이 main.c와 추가 C/H 파일에 적용한다. 예제 생성기(`halExample`)는 그대로 짧은 조각을 조합하므로 기존 문자열 치환은 영향이 없다. 장치 Docs 삽입 코드는 체크섬 영역이 있어 바꾸지 않았다.

## 0.29.0 UI 다듬기 · 기능 점검 수정

- **화면 색**: `ide-preferences.js`의 `LIGHT_UI`/`DARK_UI`를 표면 3단계(chrome < panel < background)와 모드별 파란 강조색(White `#2457d6`, Dark 버튼 `#2f63d8`·글자 `#76a8ff`)으로 바꿨다. 글자/표면 조합(foreground·muted·accent·error·warning × background·panel·chrome·hover, 선택 영역, 버튼)이 모두 WCAG AA(최소 5.15:1)다.
- **shell.css**: `--radius` 6px, `--radius-sm`, `--shadow-pop`, `--ease` 토큰. 활동 바 둥근 선택 배경과 짧은 강조선, 메뉴(28px 행·흐린 단축키·선택색 hover)·명령 팔레트·대화상자의 둥근 모서리와 그림자, 하단 패널 탭 2px 밑줄(대문자 변환 없음), 예제 태그·회로 개요 버튼 알약형, 캔버스 안내·확대 컨트롤, 직렬 모니터 빈 상태 안내. 속성 패널은 부품 종류 배지(카탈로그 인터페이스, 내부 ID는 title), 글자형 삭제 버튼, 빈 상태 카드.
- **수정한 결함**: HAL 예제 57개의 `#include <stdio.h>` 중복(예제 생성기 3곳), 회로 키보드 안내 문구 반복("PageUp/Down으로 객체를 탐색하세요 · PageUp/Down 탐색…"), 정지 후 WS2812 속성의 잘못된 전원 경고.
- 로컬 E2E를 사용자 PC에서 돌리면 테스트 창이 실제 키 입력(예: Ctrl+C)을 받을 수 있다. 0.29.0 작업 중에는 창을 비활성으로 띄워 맨 뒤로 보내는 임시 변경으로 검사했고 커밋하지 않았다.

## 0.28.0 코드 정렬 · 예제 결과 표시 점검

- **코드 정렬**: `src/c-format.js`(내장 C 정렬기: 들여쓰기·`case`·중괄호 없는 본문·괄호 연속 줄·키워드/쉼표 공백, 문자열·주석·전처리기·줄 수 보존, 멱등)와 `src/code-format-ui.js`(편집 → 코드 정렬 Alt+Shift+F·선택 영역 정렬, `}` 입력 시 그 블록 정렬, 저장 시 정렬). clangd가 켜져 있으면 clangd 서식을 쓴다. 설정 `formatOnType`(기본 켜짐)·`formatOnSave`(기본 꺼짐).
- **예제 결과 표시 점검**: HAL 예제 127개를 3초씩 실행해 출력·회로 상태·속성 패널 문구를 모두 확인했다. 결과를 볼 수 없던 예제를 고쳤다.
  - 주소지정 RGB(NeoPixel THT·FLORA·Gravity 3핀, WS2812): 예제가 거의 검은 색(G16 R8 B16) 하나만 보냈고, 렌즈는 받은 값 그대로 칠해져 꺼진 것처럼 보였으며 속성 패널은 비어 있었다. 이제 예제가 빨강→초록→파랑→흰색을 500 ms마다 보내고 `WS2812 G=.. R=.. B=..`를 출력한다. 렌즈는 받은 색상(낮은 값도 보이도록 밝기 보정)으로 켜지고 검정·미수신이면 꺼진다. 속성 패널에 받은 색(스와치·#RRGGBB)과 G/R/B 값·수신 횟수를 표시한다. 수신 값은 `src/rgb-color.js`의 `receiveWs2812`가 SPI 경로(`catalog-buses.js`)와 TIM PWM DMA 경로(`hal-dma.js`)에서 공통으로 저장한다(`device.grb`는 G,R,B, `device.color`는 R,G,B). 에뮬레이터도 같은 장치 모델을 쓴다.
  - 공통극 RGB: 속성 패널에 채널 전류와 함께 표시 색과 R/G/B 밝기(0–255)를 보인다.
  - 속성 패널 문구가 실제 동작과 달랐던 장치: ULN2003 드라이버(동작 중에도 "전원과 GND를 확인하세요 · 0 스텝" → V+와 IN1–4/M1–4 상태), 전원 핀이 없는 로터리 인코더 소자(전원 경고 제거, A/B·버튼과 사용 방법), RS485(빈 패널 → 통신 탭 안내), I²C LCD("실행 로그 확인" → 표시 중인 문자), 모터 드라이버 HAT(로그 없음 → 모터 회전으로 확인).
- 검사: `tests/interp/examples.test.js`(WS2812 3종 색 순서·G/R/B 표시, 장치 문구), `tests/e2e/workflow.e2e.test.mjs`(실제 앱에서 Gravity RGB 렌즈 색·속성 패널), `tests/unit/c-format.test.js`, `tests/e2e/format.e2e.test.mjs`.

## 0.27.0 빵판 · 예제 배선 최적화 · Docs 제거 · 단축키 · UI 정리

- **빵판**: 400홀 하프 빵판 그림을 실물 사진에 맞춰 다시 그렸다(구멍 ID·좌표 불변). 830홀 풀사이즈 빵판은 `type:'breadboard'`에 `variant:'full'`(63열 a–e/f–j, 위·아래 레일 50홀). 모델은 `pins.js`의 `BREADBOARD_VARIANTS`/`breadboardModel(part)`, 배치·경계는 `breadboards.js`(`newBreadboardFields`, `breadboardBounds`). 부품 목록 항목 `breadboard_full`.
- **예제 배선**: `src/example-layout.js`(배치 계획)·`src/wire-router.js`(경로)로 127개 예제를 다시 배선했다. 배선 1167→684개, 교차 1475→17개, 겹침 1075→0. 넷리스트·핀·코드는 그대로이며 `tests/unit/example-wiring.test.js`가 지표(`tests/fixtures/example-wiring-baseline.json`)를 지킨다. ov2640_camera, camera_tft, motor_driver_hat, matrix_10은 기존 배치 후 경로만 다시 계산한다.
- **장치 Docs**: 장치별 `/* STM-DOCS BEGIN <type>:<partId> <ROLE> */` 표식으로 삽입 영역을 추적한다. GPIO는 `MX_GPIO_Init`, 주변장치는 `MX_<P>_Init`(없으면 Cube 방식 생성). BareMetal 모드는 레지스터 예제를 적용한다. `removeDeviceExample`로 코드만/코드와 회로를 제거하며 다른 예제가 쓰는 설정은 유지한다. 영역 안을 수정해도 제거된다. 0.23~0.26 공용 영역은 변환한다.
- **단축키**: `src/keybindings.js`(기본값·저장 `stm32lab.keybindings.v1`·두 단계 키). `shell.js`의 단일 캡처 리스너가 처리한다. 기본 Ctrl+F5 실행, F10 디버그 시작(멈춤 시 계속), F11 한 줄 실행, Ctrl+F2 중지. **편집 → 단축키 설정** 보기에서 변경. 숨은 Electron 기본 메뉴가 F11·Ctrl+R·Ctrl+W를 가로채므로 `Menu.setApplicationMenu(null)`.
- **UI**: 태양/달 아이콘 하나로 Dark/White(System 기본), 설정은 편집 메뉴로 이동(활동 바 아이콘 제거), 활동 바 툴팁은 아이콘 오른쪽, 아이콘 드래그 정렬(`activityOrder` 저장), 실행 환경은 실행 및 디버그 보기 위쪽, 제목 표시줄의 프로젝트 이름·업데이트 버튼 제거(도움말 메뉴·상태 표시줄), 코드/회로 그룹 사이 1px 구분선.

## 0.26.0 VS Code형 작업 화면 · 펌웨어 에뮬레이터 · 테스트 재작성

- **작업 화면**: `src/shell.js`/`src/shell.css`가 활동 바·사이드바 보기·편집기 그룹(코드/회로)·하단 패널·속성 보조 사이드바·상태 표시줄·메뉴·명령 팔레트를 구성한다. 기존 컨트롤은 ID와 리스너를 유지한 채 재배치하며 `layout.reveal/showView/showPanel/toggle/maximize` API를 제공한다. 배치는 `stm32lab.shellLayout.v1`에 저장한다. 이전 `workspace-layout.js`/`workbench-ui.js`/`layout-model.js`는 삭제했다. 화면 팔레트는 `ide-preferences.js`의 `LIGHT_UI`/`DARK_UI`(VS Code Modern 계열)이다.
- **펌웨어 에뮬레이터**: `src/emu/`(bus·cpu·scs·elf·machine, QEMU 대조 19개 펌웨어)와 `src/emu/stm32f446/`(주변장치·soc·signals·fat), `src/firmware-session.js`(SimulationSession과 같은 인터페이스). 실행 대상 `emulator`는 `native-build.cjs`로 ARM 빌드 후 IPC `native:elf`로 ELF를 받아 실행한다. `firmware:open-elf`로 외부 ELF를 연다. 구조는 [EMULATOR.md](docs/architecture/EMULATOR.md).
- **인터프리터 확장**: NVIC 선점(`hal-nvic.js`), HAL DMA(`hal-dma.js`), USART 동기(`hal-usart.js`), DCMI/카메라(`hal-dcmi.js`, `camera.js`), SD/FatFs(`hal-storage.js`, `sdcard.js`), 비트 단위 신호·잡음(`signals.js`), 새 예제 7개(`advanced-examples.js`, `allHalExamples()`로 등록).
- **UI 연동**: 로직 분석기(`logic-analyzer.js`, `session.signals` 계약), 카메라 미리보기·SD 파일 목록(`part-media-ui.js`). SD 카드 이미지는 `part.cardImage`(SD1 형식)로 인터프리터와 에뮬레이터가 공유하며 정지 시 프로젝트에 저장한다.
- **수정한 기존 결함**: ARM 빌드 환경의 SysTick/IRQ 처리기가 weak로 생성되어 시작 파일의 weak `Default_Handler`와 충돌해 `HAL_Delay`가 멈추던 문제(사용자 정의가 없을 때 strong으로 생성), MAX98357A I2S 예제의 PLLI2SM 누락, CubeMX `.ioc`의 `S_TIMx_CHy` 핀 가져오기, 포인터 뺄셈, 터미널 첫 프롬프트의 한글 경로 깨짐(작업 폴더도 상태에 표시).
- **장치 외 점검 AUDIT-01~04**: 0.25.x 커밋 `fd53440`에서 수정되었고, 이번에 새 E2E 테스트(`tests/e2e/storage.e2e.test.mjs`)와 단위 테스트(`tests/unit/desktop.test.js`)로 다시 확인했다. [NON-DEVICE-AUDIT.md](docs/NON-DEVICE-AUDIT.md)는 해결 상태로 갱신했다.
- **테스트 재작성**: 기존 `tests/*.test.js`와 `scripts/*-smoke.cjs`·`*-check.cjs`·감사 스크립트를 삭제하고 `tests/unit`, `tests/interp`, `tests/emu`, `tests/firmware`, `tests/e2e`, `tests/toolchain`, `tests/release`로 새로 작성했다. Node 22의 `node --test`는 디렉터리 인자를 받지 않으므로 package.json은 glob을 사용한다.

## 0.25.2 빵판 예제 배치 (공개 완료)

- 공개 버전 0.25.2. 예제 부품 빵판 장착, 별도 구멍 점퍼, 신호 분리, 장애물 회피 경로를 구현했습니다. 적용은 Docs/예제 검색/새 프로젝트 템플릿 모두 포함합니다.
- 진행 상태와 내부 수정 지도는 `docs/audits/0.25.2-breadboard/REPORT.md`. 과거 공개 검증을 이번 버전의 증거로 혼용하지 않습니다.
- 114개 실제 시뮬레이션 및 1,068개 단선 복구, 120개 연결망·배치, UI 40개 예제와 여러 Docs 동시 실행을 검사했습니다. 사용자 프로필은 건드리지 않습니다.

- 공개 제품 커밋 `7b4c3fb5328c0e383a8e499f6f5c1e1aac3c65d9`, CI `39257882264`. 공개 5자산·latest·EXE/ZIP 실행·복구, 공개 UI 6장치·타이머 경유, 0.25.1→0.25.2 자동 업데이트를 확인했습니다. 세부 증거는 위 보고서에 보존합니다.

## 0.24.0 캔버스 UX (공개 완료)

- 사용자 문서 `docs/IMPROVEMENT-GUIDELINES.md`의 Step1-1~1-5 적용. 2~5단계는 후속 로드맵으로 남습니다.
- 커서 줌, Shift 영역 선택, Ctrl/Cmd+A/D, 비파괴 실시간 인스펙터, 빵판 캐시, 인스펙터 20색과 신호 배지를 추가했습니다. Esc 삭제/취소 규칙과 저장/복구를 유지합니다.
- 전체 Windows CI 및 공개 EXE/ZIP 실행·복원, 신규 UI 13범주/대비 19상태, 0.23.9→0.24.0 자동 업데이트 통과. 배포 제품 커밋은 `649d412`이며 후속 검증 문서/검사 보완은 릴리스를 덮어쓰지 않습니다.
- source 상태/검사/공개 배포 여부는 `docs/audits/0.24.0-canvas/REPORT.md` 참조. 후속 작업에서도 사용자 실제 앱을 조작하지 않고 독립 프로필로 검증합니다.
- 0.23.9의 저장·C·Docs·의존성 결함 수정은 `docs/audits/0.23.9-fixes/REPORT.md`에 보존되어 있습니다.

## 0.23.1 WritePin 적용 및 파일 진단

- 작업 위치는 `D:\codex\project\STM-Simulator`. 현재 앱 상태 조사는 화면 조작보다 [로컬 진단 파일](docs/DIAGNOSTICS.md)을 먼저 사용한다.
- 0.23.0 LED WritePin 카드는 MX_GPIO_Init의 RESET만 보여 주고 main의 STEP은 비워 두었다. `src/device-inline-example.js`에서 실제 main용 SET 호출을 생성하며 미리 보기와 삽입 코드가 일치한다. 전체 TogglePin 예제는 그대로다.
- 당시 자동 저장 사본 두 개 중 최신 사본에는 LED GND 선도 없었다. 없어지게 된 조작은 확인되지 않았다. 기존 배선 복구 로직으로 재적용 시 GND 1개를 추가하고 정상 선은 보존함을 검증했다. 사용자 원본 프로필은 변경하지 않았다.
- `desktop/diagnostics.cjs`, `src/diagnostics.js`: 로컬 JSONL 1 MB×2, 최근 회로 사본 2 MB 이하, 코드/배선 해시 및 실행 상태 기록. 로그 외부 전송 없음. 실제 사용자 회로 사본은 ignored `work/diagnostics/`에만 보관.
- `tests/docs-gpio-operation.test.js`, `tests/diagnostics.test.js`, `scripts/docs-writepin-check.cjs`: 단독 API 실제 출력, GND 복원, 카탈로그 LED와 핀 재배정, 파일 기록/회전/오류 복구 검사. 이전 977개 카드 검사는 컴파일/형식 위주였으므로 동작 검증 완료로 해석하면 안 된다.
- 로컬 모델 287개, 별도 숨긴 Electron 프로필의 Docs 적용·SET/RESET·로그, 저장 사본 두 개의 실제 ST HAL/CMSIS ARM 링크 통과. 전체 Windows CI 및 공개 자산 검증은 아래 검증 기록의 최신 항목을 확인한다.
- [공개 v0.23.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.1), 빌드/태그 `99f8f02e578dfc1510fe06a834e111f11f9e4197`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38918319975) 성공. 다섯 공개 자산과 latest·해시·버전·커밋을 검증하고 다운로드한 EXE에서 LED 동작·GND 복원·로그 저장을 다시 확인했다. 기존 문제 회로는 업데이트 후 WritePin 카드를 재적용해야 한다. 현재 사용자 앱은 재시작하지 않았다.

## 0.23.0 빈 회로와 main 내부 예제 (공개 완료)

- 사용자 최종 결정: **보드는 1개, 기존 실행/Pinout 방식 유지**. 다중 보드·다중 펌웨어는 범위에서 제외. 빵판은 검색으로 여러 개(8개까지) 추가.
- `project.js`: 새 프로젝트 `surfaces.board.hidden/breadboard.hidden=true`. 표시 플래그가 없는 구버전 프로젝트는 두 기본 표면 유지. 기존 샘플 생성기는 `exampleProject()`로 명시적 보드/빵판 사용.
- `surfaces.js`, `pins.js`, `engine.js`, `circuit-edit.js`: 숨긴 표면의 접점/내부 버스 제거, 삭제 시 배선·장착 해제. app의 검색 보드 추가는 단일 표면 재사용. 기존 MCU 설정은 유지.
- `device-inline-example.js`와 `c-inline.js`: Docs 전용 main 예제, UART/EXTI 폴링, 보조 함수의 인자·지역 변수·반환·분기·반복문을 C 블록으로 전개. 함수 정의를 추가하지 않음. 원본 HAL 예제 메뉴는 유지.
- `device-code-insertion.js`: 기존 MX 초기화 함수 보완, 없는 초기화는 main에 본문 삽입, 사용자 코드 보존, HEADERS/DECLARATIONS/INIT/STEP/MX_* 영역 체크섬. 예전 Docs 콜백 연결 코드만 제거하고 사용자 콜백 본문 보존.
- `hal.js`: UART 폴링의 소수 시간 누적에 따른 0에 가까운 반복 yield 방지. `hal-source.js`: main 소스 한도를 프로젝트 한도와 동일한 300 KB로 정리.
- 배치 공간의 고정 제목/설명 제거. 부품 검색 114개(단일 보드 포함), 배선 기본 10 + 파스텔 10.
- 새 검사: `tests/empty-workspace-inline.test.js`, `scripts/empty-workspace-ui.cjs`; CI도 실행. 회귀 테스트는 예전 기본 표면 가정을 명시적 fixture로 바꿈. [공개 v0.23.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.0), 빌드/태그 `81fe66f6753a25221b05dba91cc711d02d49af2f`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38850545260) 성공. 모델 280개·114개 검색 항목의 HAL 카드 977개·ARM 예제 381개 검증. 공개 EXE/ZIP 재다운로드 및 실제 공개 EXE 기능/12상태 대비를 확인했습니다. 해시·증거는 `docs/VERIFICATION.md` 참고.

## 0.22.0 화면 테마 분리와 자유 배치 (공개 완료)

- 화면은 `ide-preferences.js`의 System/Dark/White, 코드는 모드별 Jellybeans/GitHub Light Default로 분리했습니다. `ide-settings-ui.js` 상단 토글·System 복귀·설정 선택, OS media 변경을 반영합니다. colorscheme 등록/수정은 `--code-*`와 Monaco에만 영향을 줍니다.
- GitHub Theme 6.3.5 원본/해시/MIT/선정 근거는 `src/themes/github-light/`에 있습니다. 빌드 시 두 원본 테마를 해시 검증 후 변환합니다. 기본 Tab은 스페이스 4칸, 구버전 환경설정은 v2 스키마로 호환 이전합니다.
- `surface-move.js`, `app.js`: 기본 보드·빵판 몸체 드래그, 장착 부품과 내부 경유점 이동, 한 번의 Undo/Redo, Esc·포커스 이탈 취소. 가장자리 크기 조절과 핀 배선 우선순위는 유지합니다.
- `app.js` 우클릭은 진행 중 배선 전체를 취소하며 GPIO에서 누를 때도 Pinout 창을 열지 않습니다. 기존 완성 배선은 보존합니다.
- `project.js`, `resize.js`, `circuit-edit.js`, `wire-draft.js` 좌표 상한 제거. 음수·6000 초과 배치/저장, 무제한 줌아웃·팬, 전체 보기 경유점 포함. 부품 수/배선 수/배율의 수치 검증은 유지합니다.
- `tests/appearance-canvas.test.js`와 `scripts/appearance-canvas-ui.cjs`: 테마 분리·시스템 변경·4칸 입력·실제 드래그·취소·Undo·재시작·우클릭·먼 좌표 배치 검사를 추가했습니다. 기존 테마/미리보기/대비 검사도 화면 테마를 명시하도록 변경했습니다.
- 기존 비장치 감사 4건은 이번 범위에서 수정하지 않았으며 `docs/NON-DEVICE-AUDIT.md`에 유지합니다. 코드 위치는 사용자 응답에 나열하지 않습니다.

- [공개 v0.22.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.22.0), 빌드/태그 `3e9b3e40059b6ebf98a2f7f7667d2e1e1db9ba48`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38709544798) 성공. 모델 273개·52상태 대비·113종 크기·카탈로그 UI를 통과했고 공개 EXE/ZIP 재다운로드 및 실제 공개 EXE의 새 기능/12상태 대비까지 확인했습니다. 최신 `outputs/artifact/STM-Simulator.exe`와 `docs/VERIFICATION.md`를 확인하세요.

## 0.21.2 검색 카드 강조 상태 보완

- 0.21.1 공개 EXE 검사에서 부품 카드 hover 설명의 대비 4.31:1을 추가로 발견했습니다. 기존 `:is()` 그룹에 포함된 ID 선택자의 우선순위 때문에 hover 보조 글자색 규칙이 적용되지 않았습니다.
- 부품 카드 hover/활성화, 보드 카드/검색 결과 hover, 핀 검색 hover/선택의 보조 글자를 선택 배경과 함께 적용합니다. F4 아이콘의 고유 배경/글자색은 보존합니다.
- `npm run test:contrast:ui`를 두 테마 52개 상태로 확대하여 통과했습니다. 부품 확대 미리보기·키보드 초점·배치 모드·보드/핀 검색 상태가 포함됩니다.
- [공개 v0.21.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.2), 빌드/태그 `a932f0595854d8e22d53dfe069a5ea25d744b4e9`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38705485223) 성공. 공개 EXE/ZIP의 해시·버전·커밋 일치와 실제 공개 EXE의 두 테마 대비 검사를 통과했습니다. 최신 로컬 파일은 `outputs/artifact/STM-Simulator.exe`이며 상세 검증은 `docs/VERIFICATION.md`에 있습니다.

## 0.21.1 UI 글자 대비 수정

- 사용자 제보 이미지의 상단 버튼 hover, Pinout 핀 카드/하단 고정 바가 밝은 글자와 밝은 배경을 혼용하던 문제를 수정했습니다. 같은 패턴의 검색/바꾸기·터미널·보드 선택·설정/도움말·보조 라벨/placeholder도 테마 쌍을 일치시켰습니다. Jellybeans 원본과 Monaco 코드 팔레트는 변경하지 않았습니다.
- `src/preferences.css`에 테마 누락 영역과 hover/선택/비활성 상태를 보완했습니다. `npm run test:contrast:ui`는 Jellybeans/STM Light 38개 화면 상태에서 UI 텍스트의 계산된 대비 4.5:1을 확인합니다. 소스 토큰/장치 SVG는 제외합니다. CI에 포함합니다.
- `docs/NON-DEVICE-AUDIT.md`에 원인/코드 위치/재현과 수정 범위를 기록했습니다. 앞서 발견한 저장/터미널 문맥/종료 4건은 이번 범위에서 수정하지 않았습니다.
- [공개 v0.21.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.1), 빌드/태그 `97b26659c5b13b7e2b556bc5d008d7b97f70b681`, [Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38703166675) 성공. 공개 EXE/ZIP의 버전·커밋·해시는 확인했습니다. 공개 EXE의 추가 hover 검사에서 발견한 잔여 대비 문제는 위 0.21.2에서 보완합니다.

## 0.21.0 부품 검색 이미지와 장치 외 기능 점검

- 기존 검색 카드와 추가 방식은 유지하고 113개 항목에 실제 장치 렌더러 기반 작은 이미지/확대 미리보기를 적용했습니다. `part-preview.js`, `part-preview-ui.js`, `part-preview.css`가 담당합니다.
- 마우스와 키보드 초점, Esc로 미리보기만 닫기, 검색/클릭/스크롤 시 닫기, 좁은 화면 위치 보정, 실행 중 미리보기, 밝은/어두운 테마를 검사했습니다. `npm run test:part-previews:ui`를 Windows CI에 추가했습니다.
- 장치 외 기능의 실패 경로 4건을 재현했으며 이번 범위에서는 수정하지 않았습니다. **후속 수정은 `docs/NON-DEVICE-AUDIT.md`부터 읽으세요.** 원인·코드 위치·재현 절차·우선순위·수정 방향이 있습니다. 사용자 응답에는 코드 위치를 나열하지 않습니다.
- 장치 외 점검 AUDIT-01~04(저장 트랜잭션·dirty 판단·터미널 문맥·종료 자동 저장)는 해결되었다. 재현 스크립트는 삭제했고 회귀 검사는 `tests/unit/desktop.test.js`와 `tests/e2e/storage.e2e.test.mjs`가 맡는다.
- 로컬 전체 모델 269개, 실제 GCC/GDB/clangd 및 ARM HAL 링크, IDE 프로젝트·파일·검색·디버그·패널, colorscheme 등록, 업데이트 UI 검사를 통과했습니다. 실제 보드 디버깅은 미검증입니다.
- [공개 v0.21.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.0), 빌드/태그 `835ba6c7897f314fac2804aca51735a248dffeb4`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38700043749) 성공. 공개 EXE/ZIP 재다운로드·해시·커밋 문서 일치와 실제 공개 EXE의 113종 미리보기/기존 기능 검사를 통과했습니다. 최신 배포는 `outputs/artifact/STM-Simulator.exe`이며 상세 증거는 `docs/VERIFICATION.md`에 있습니다.

## 0.20.0 가장자리 크기 조절 (공개 완료)

- `resize-ui.js`: 선택한 장치의 네 변·네 모서리에서 실제 포인터로 크기 조절. 백분율 입력 제거, 장치 선택 목록은 위치 찾기용으로 유지합니다. Shift 비율 유지, 방향키 미세 조절, Alt+방향키 10배 간격, Esc/창 포커스 이탈 취소, 한 번의 Undo/Redo를 지원합니다.
- `geometry.js`, `resize.js`: 독립 `scaleX/scaleY`, 표면 원점 이동과 회전·비균등 변형을 공유합니다. 기존 `scale` 파일은 호환됩니다. 장착 부품은 전체 좌표 변환을 받아 핀과 구멍이 일치하고 배선 ID를 보존합니다. `project.js`가 새 좌표와 크기를 검증·저장합니다.
- 기존 10~400% 제한을 제거하고 연속 조절합니다. 수치 오류를 막는 양수 배율과 프로젝트 작업 공간 검증은 유지합니다. 실행 중에는 조절점과 편집을 비활성화합니다.
- 로컬 검사: 전체 모델 269개, 113종 실제 드래그 UI, 두 기본 표면·회전·독립 축·취소·Undo/Redo·키보드·저장 복원, 기존 외형/설정 UI 통과. `npm run test:resize:ui`가 CI에도 포함됩니다.
- 실행 파일은 `STM-Simulator.exe`, ZIP 내부 이름과 두 검증 JSON의 filename도 동일합니다. 0.19.0 이하 배포본은 0.20.0을 한 번 수동 다운로드해야 합니다. 버전만 올린 이전 이름의 호환 EXE를 별도로 배포하지 않습니다.
- [공개 v0.20.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.20.0), 빌드/태그 `a5f1b2dd9d8939ec96f536d5ad99a4387f1bd8b4`, [Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38695514691) 성공. 공개 EXE/ZIP 재다운로드·해시·문서 일치와 실제 공개 EXE의 크기 조절/기존 기능 검사를 통과했습니다. 당시 배포 증거는 v0.20.0 이후 문서 커밋에서 확인할 수 있습니다. 현재 로컬 배포는 상단 최신 버전을 따릅니다.

## 0.19.0 장치 조사 적용

- `docs/device-visual-references.json`의 80항목 → `scripts/build-device-catalog.mjs` → `src/device-catalog-data.js`. 원본 사진은 배포하지 않고 독립 SVG를 사용합니다. 4자리 12핀으로 분류됐던 Adafruit 813은 도면상 14핀으로 정정했으며 내부 ID는 기존 참조 호환을 위해 유지합니다. HAT은 외부·나사·Pi 커넥터 51접점으로 구분합니다.
- `catalog-defs/render/view/model/topology/electrical/motion/buses/singlewire/peripherals`가 물리 핀, 외형, 기존 모델 투영과 새 버스 동작을 분리합니다. 기존 35종 보존 + 78개 변형 = 부품 메뉴 113항목. 보드·빵판 포함 HAL 예제 120개.
- `device-code-insertion.js` 및 `device-assistance.js`: 선언·초기화·반복 코드를 main.c에 직접 삽입, 함수별 필요한 호출까지 선택, 이전 생성 파일 이동, 재적용/사용자 수정 보호/정상 배선 보존과 단락 보완.
- `device-register-setup.js`: 레지스터 초기화·대기·SPI 송수신·I2C ACK/수신. 기존 main의 시스템 초기화는 유지합니다.
- `hal-example-search.js`: 이름·핀 수·인터페이스·실제 HAL API 검색. `wire-draft.js`: 바닥 연속 클릭 경유점, Backspace·Esc, 완료 시에만 연결 생성.
- 80개 조사 항목의 기본 예제는 회로 모델에서 실행합니다. 단선 센서는 GPIO 에지/응답, CAN은 내부 루프백, I2S는 PCM 전송, 카메라는 SCCB ID까지입니다. 카메라/SD 등 예제 범위는 `docs/DEVICE-DOCS.md`, `docs/DEVICE-CATALOG.md`에 명시합니다. 80개 모두가 완전한 주변장치 에뮬레이션이라는 주장을 해서는 안 됩니다.
- 검증: 전체 모델 260/260, 조사 80개 원본/삽입 HAL 160건 ARM 컴파일·링크, 패키지 카탈로그 UI, 단일 포터블 EXE 실행 모두 통과했습니다. `npm test`, `npm run test:catalog:ui`, `npm run test:catalog:arm`, `node scripts/portable-smoke.cjs`로 재검사합니다. ARM 검사에는 ARM GCC·STM32CubeF4가 필요합니다. 정확한 파일 해시와 한계는 `docs/VERIFICATION.md`에 있습니다.
- USART2 PA2/PA3는 HAL 초기화 후 내장 ST-LINK VCP로 하단 통신 탭에서 바로 송수신합니다. 기본 UART 예제는 부품 0개/배선 0개이며 `uart_external`과 UART 부품 Docs/4·6핀 변형은 USART1 PA9/PA10 외부 배선 연습용입니다(PA2/PA3는 SB62/SB63이 열려 헤더에 없음). 외부 입력 경로는 내장 VCP로 우회하지 않습니다.
- USART2 변경 검증: 전체 모델 260/260, UART/Docs 레지스터 예제 실제 ARM 링크 12건, 내장/외부 UART UI 통과.
- 사용자 요청에 따라 앞으로 버전 상승은 Release 게시까지 포함합니다. `AGENTS.md`와 `docs/UPDATES.md`의 게시 절차를 따릅니다. 0.18.0 보충 게시와 0.19.0 main CI 자동 게시가 완료됐습니다. 0.19.0 빌드 커밋은 `23708264e9c77671630466b3abb1d0f4b0f996e5`, CI는 `38667438539`입니다. 두 공개 버전의 EXE/ZIP 재다운로드·해시 대조와 최신 공개 EXE 실행을 통과했습니다.
- 공개 0.17.2 → 0.19.0 자동 업데이트 시험은 GitHub 비인증 API 요청 한도로 완료하지 못했습니다. 다운로드·교체 성공으로 보고하지 않습니다. API 한도 회복 후 재검사할 때 `scripts/release-update-check.cjs`를 사용하며 상세 증거는 `docs/VERIFICATION.md`에 있습니다.

## 저장소 관리 원칙

- 2026-10-15 이후 배포 EXE 이름은 `STM-Simulator.exe`로 고정합니다. 빌드·게시·검증·업데이터가 같은 이름을 사용하며, 0.19.0 이하의 이미 배포된 파일은 유지합니다. 고정 이름으로 전환되는 첫 배포본의 수동 다운로드 안내는 `docs/UPDATES.md`를 참고합니다.
- Git 작성자·커미터·푸시 인증은 `moonsyu`를 사용합니다. 2026-10-15 작성자 정정으로 커밋 11개와 태그 7개의 SHA가 바뀌었으며 소스 트리는 동일합니다. 기존 공개 실행 파일과 빌드 SHA는 보존합니다. 대응표와 설정은 `docs/GIT-IDENTITY.md` 및 `docs/commit-identity-map.json`을 참고합니다.
- 작업 저장소: 현재 Git 체크아웃, 원격 `moonsyu/STM-Simulator`, 기본 브랜치 `main`.
- 과거 버전은 **Git 커밋 이력**으로만 관리한다. 버전별 백업 폴더·이전 실행 파일·옛 검증 문서 사본을 남기지 않는다.
- 최신 배포 묶음은 `outputs/artifact/`, 최신 검증 문서는 `docs/VERIFICATION.md`, 최신 실행 증거는 `work/test-results/`에 갱신한다. 테스트가 만든 임시 프로필은 종료 후 제거한다.
- 사용자 다운로드 공간은 GitHub Releases의 Assets다. README는 프로젝트 소개·현재 기능·빌드 방법·Releases 다운로드 링크만 유지한다. 게시 요청 시 원격 README 반영과 검증한 실행 파일 업로드까지 완료한다.
- 별도 빌드 작업 폴더를 쓰면 검증이 끝난 생성물 중복과 임시 파일도 정리한다. 사용자 회로·소스·자동 저장은 생성물 정리 대상이 아니다.
- 현재 기능 및 정리 변경을 커밋한다. 원격 게시 여부는 사용자 요청에 따른다. 저장소 이름은 STM-Simulator이며 원격 URL과 문서 링크도 이 이름을 사용한다.
- `dist/`, `work/`, `outputs/`, `node_modules/`, `work/test-results/`, `.cache/`, 참고 미디어는 Git에서 제외한다.

## 0.17.2 공개 자동 업데이트 재현 검사

- 도우미를 수정한 공개 v0.17.1을 출발점으로, 공개 v0.17.2를 대상으로 검사한다. 두 버전의 실행 파일에 같은 수정이 들어가며 이 버전은 공개 버전 간 검증과 절차를 완성하는 릴리스다.
- `release-update-check.cjs`에서 수동 확인/다운로드 호출을 제거했다. 실제 앱에서 자동 확인 설정을 켜고 원본 스케줄러가 GitHub 감지·다운로드·해시 검증을 끝낼 때까지 기다린 뒤 저장 후 재시작 버튼을 누른다.
- 새 앱의 실제 asar 버전·프로세스 생존·EXE 해시·기존 코드, Jellybean/글꼴 크기·장치 크기·자동 확인 설정 보존까지 확인한다. 성공 파일은 통과했을 때만 작성한다. 게시 후 실행 결과와 증거 URL은 해당 릴리스의 UPDATE-VERIFICATION.json/md를 기준으로 확인한다.
- 실제 실행 결과(2026-10-14 10:15:51 UTC): 공개 v0.17.1→v0.17.2 자동 업데이트 통과. 새 EXE SHA-256은 `f0f2c55b90ea6e8894b92c672d9ae26febb74090cf524494265da88a735d6479`. 도우미가 실행한 새 main의 asar 버전 0.17.2와 실행 유지, 재열기 후 코드·글꼴 17·보드 125%·Jellybean·자동 설정 보존을 확인했다. [공개 검증 JSON](https://github.com/moonsyu/STM-Simulator/releases/download/v0.17.2/UPDATE-VERIFICATION.json), [검증 설명](https://github.com/moonsyu/STM-Simulator/releases/download/v0.17.2/UPDATE-VERIFICATION.md)을 업로드하고 다시 내려받아 일치를 확인했다.
- 공개 EXE 빌드/태그 커밋 `fa56d116be7b2f39f25f53ee541e9ee69767c4ec`, 태그 CI `38547037000` 성공. 게시 뒤 main에는 이 검증 기록과 시험의 비동기 대기 처리만 보완했다. 앱 런타임 소스와 패키지 버전은 공개 태그와 동일하다.

## 0.17.1 업데이트 GUI 실행 수정

- 실제 공개 v0.16.1→v0.17.0 검사에서 다운로드/해시 검증 뒤 `spawn EPERM`으로 교체 도우미 시작에 실패했다. Node 콘솔의 교체 시험만으로 실제 패키징 GUI 경로를 보장할 수 없었다. 기존 앱/코드는 유지됐다.
- `desktop/start-update.ps1`을 추가하고 중첩 인코딩 명령 대신 `-File`과 JSON 구성 파일로 도우미를 시작한다. 기존 독립 숨김 콘솔과 준비 확인, 해시 검증, 원자적 교체/복원은 유지한다.
- `scripts/update-gui-helper-check.cjs`는 실제 Electron main에서 긴 한글/특수문자 경로로 도우미를 실행하고 GUI 부모 종료 뒤 교체·재실행을 확인한다. CI의 패키지 생성 후/게시 전 검사로 추가했다.
- 0.16.1~0.17.0에서 해당 오류가 발생하면 수정된 최신 EXE를 한 번 직접 다운로드해야 한다. 최종 공개 버전 간 업그레이드 결과는 릴리스 UPDATE-VERIFICATION.json을 확인한다.

## 0.17.0 장치 크기와 IDE 설정

- 사용자가 GitHub 푸시·릴리스 게시와 공개 EXE의 실제 자동 업데이트 검증을 승인했다. 먼저 v0.16.1을 게시하고 공개 EXE/매니페스트/커밋을 검증했다. v0.16.0의 첫 CI 실패 원인은 1024px 창에서 `.edition` 규칙이 업데이트 버튼을 숨기는 것이었으며, `#app-update` 규칙과 좁은 창 검사로 수정했다.
- `geometry.js`, `resize.js`: 당시 부품 `scale`, 루트 `surfaces.board/breadboard.scale`의 10~400% 범위였으며, 0.20.0에서 독립 축 연속 조절로 대체했습니다. 보드·구멍·단자·배선·검색 강조가 같은 좌표를 쓴다. 보드/빵판 확대 시 그 표면에 모든 다리가 연결된 부품도 위치와 배율을 따른다. 개별 장착 부품은 연결점을 유지한다. 잘못된 복합 확대는 원자적으로 거부한다.
- `resize-ui.js`: 시뮬레이터 위 장치 목록·백분율·100% 복원. 루트 표면과 모든 35종 부품을 지원하고 실행 중에는 잠근다. 회로 파일에 저장하고 실행 취소·재실행, 추가 빵판 이동·회전·복사와 결합한다.
- `ide-preferences.js`, `ide-settings-ui.js`, `preferences.css`, `code-editor.js`: 기본 Jellybean/STM Light와 사용자 테마, 코드·UI·터미널 글꼴/크기·줄 높이·들여쓰기·줄 바꿈·줄 번호·미니맵·괄호색·구문/강조색. 테마 복사/이름/편집/삭제/초기화 및 JSON 가져오기/내보내기. 회로와 독립적인 프로필 키 `stm32lab.idePreferences.v1`에 저장한다. 코드 패널 설정 탭과 Ctrl+,로 연다.
- 설정 내보내기는 검증된 JSON을 Electron 저장 대화상자로 저장한다. 사용자 테마/글꼴 입력은 제한된 색상·문자·범위만 허용한다. 장치 온도·회전·기본 물성은 기존 속성/측정에 남긴다.
- 검증 명령: `node --test tests/appearance.test.js`, `npm run test:appearance:ui`, 기존 전체 모델/UI. 실제 공개 업데이트 검사는 `scripts/release-update-check.cjs`이며 네트워크/업데이트 main IPC를 대체하지 않는다. 공개 EXE 다운로드·업데이트·교체·도우미 재실행·새 asar 버전·소스 보존을 확인한다. 결과는 해당 릴리스의 `UPDATE-VERIFICATION.json`과 로컬 `work/test-results/release-update-proof.json`을 확인한다.

## 0.16.0 포터블 자동 업데이트

- `desktop/updater.cjs`: 고정 GitHub 공개 저장소의 정식 릴리스, 버전·업로드 완료·SHA-256 매니페스트 검증, 자동 확인/다운로드, 진행률, 설정 저장. 시작 8초 후, 실행 중 30분 간격, 창 포커스(`browser-window-focus`)·절전 해제(`powerMonitor` resume) 때 `wake()`로 10분 경과 시 확인. 다운로드 완료 후 사용자가 재시작을 선택한다.
- `desktop/apply-update.ps1`: 별도 숨김 프로세스가 현재 앱 종료와 포터블 EXE 잠금 해제를 기다려 원본 백업/원자적 교체/재실행. 시작 실패 시 복원 시도. 준비 확인을 받아야 앱을 종료한다. `detached:true` PowerShell은 연결 끊긴 Windows 세션에서 명령을 실행하지 않고 종료하며, 일반 자식은 부모 종료 시 함께 종료되는 현상이 재현되어 `Start-Process -WindowStyle Hidden` 부트스트랩으로 독립 실행한다.
- `src/update-ui.js`: 상태·자동 확인 설정·수동 확인/다운로드·저장 후 재시작. `src/app.js`는 설치 요청 직전 현재 회로/전체 코드를 동기식 자동 저장하고 열린 폴더에도 저장한다. 실패 시 앱을 닫지 않는다. 기존 사용자 프로필을 유지한다.
- `build:artifact`가 `update-manifest.json`을 실제 EXE에서 생성한다. CI는 `main`에서 빌드만 수행하고 `v<package.version>` 태그에서 검증된 같은 실행의 산출물로 초안 릴리스를 만든 뒤 모든 파일을 업로드하고 공개한다. 기존 릴리스는 덮어쓰지 않는다.
- 사용법·제한·구조·배포/검증 명령은 [UPDATES.md](docs/UPDATES.md). 기존 0.15.2 이하 사용자는 처음 한 번 새 EXE를 직접 받아야 한다. 설치형 NSIS로 전환하지 않았다.
- 태그 게시 CI는 v0.16.1에서 성공했으며 공개 EXE의 해시·빌드 커밋을 다시 검증했다. 공개된 두 버전의 실제 업그레이드 증거는 위 검증 스크립트와 릴리스 첨부 검증 JSON을 기준으로 확인한다.
- 검증: 전체 모델 209개와 기존 UI 15개 스크립트, 업데이트 UI, 실제 Windows 잠금/교체/복원/부모 종료 후 재실행, 실제 포터블 EXE의 업데이트 활성화·설정 저장·공개 GitHub 확인이 통과했다. [VERIFICATION.md](docs/VERIFICATION.md)에 로컬 EXE 해시와 증거를 기록했다.

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
- 실제 Windows GCC/GDB/clangd, ARM GCC/ST HAL, ARM GDB 원격 검증(QEMU STM32F405 Cortex-M4)을 수행했다. QEMU는 Cortex-M4 코어의 대조 검증 도구이며, 제품의 F446 에뮬레이터는 0.26.0의 `src/emu`다. 연결된 ST-LINK는 확인되지 않아 실물 플래시·디버그는 검증하지 않았다.
- 검증 명령은 아래 "개발과 검증"을 따른다(0.26.0에서 `test:ui`·`test:native` 계열 스크립트는 `npm run test:e2e`, `npm run test:toolchain`으로 대체).
- IDE 구현은 0.15.0에서 추가했다. 게시할 때는 main과 릴리즈 태그, 성공한 Actions 빌드의 커밋을 일치시키고 다운로드 자산의 해시를 확인한다. 원격 게시 증거는 `work/test-results/release-proof.json`에 기록한다.

## 현재 구현

- 장치 외형 조사(2026-10-14): [DEVICE-VISUAL-REFERENCES.md](docs/DEVICE-VISUAL-REFERENCES.md), [사진·핀 수 검색 자료집](docs/device-reference-gallery.html), 원본 `docs/device-visual-references.json`. 현재 부품 35종 전부를 80개 외형·핀 구성과 연결하고 MCU 내부 기능 24분류를 별도로 정리했다. 핀 수는 주요 외부 접점 기준이며 제어/부하/중복 커넥터·점퍼를 나눠 기록한다. 메모리 패키지와 7세그먼트 일부는 사진 대신 제조사 외형도를 연결한다. 사진은 원본 URL이며 앱 배포 자산에 포함하지 않는다. `node scripts/build-device-reference.mjs`로 현재 소스의 35종과 단자 일치를 확인하고 문서·HTML을 다시 생성한다. 실제 부품 추가 시 이 자료의 시뮬레이터 단순화·공통극·통신 방식 차이를 먼저 확인한다. 자료집 검증: 현재 소스 35종·단자 대조, 2/3핀 필터·LCD 4/16핀 구분·검색·표 전환·390px 모바일 표시, 사진 73항목 로드 및 제조사 도면 7항목 연결을 확인했다. 실행 증거는 `work/test-results/device-reference-check.json`과 `device-reference-*.png`다.

- VS Code형 작업 화면(활동 바·사이드바·편집기 그룹·하단 패널·속성 패널·상태 표시줄·명령 팔레트). 경계선 크기 조절, 코드/회로 위치 바꾸기·분할 방향·최대화, 배치는 `stm32lab.shellLayout.v1`에 저장한다.
- 폴더 프로젝트 생성·열기·저장, C/H 추가·이름 변경·삭제와 include 갱신, 외부 파일 변경 시 덮어쓰기 거부. 기존 `.stm32lab`과 프로필은 유지한다. 자동 복구된 프로젝트는 폴더 연결 없이 복구하므로 원래 폴더를 다시 열어야 한다.
- Monaco 0.57.0 로컬 번들: 구문 강조·기본 완성·함수 정의 찾기·다중 커서·접기. ARM/Windows 대상에 clangd의 의미 분석·완성·호버·정의/참조·인수 안내·서식 정리를 연결한다. `npm ci`의 postinstall과 빌드에서 `src/generated/`를 생성한다. 이 폴더는 Git에 넣지 않는다.
- 지원 소스 빌드·원본 파일 오류 위치, 중단점·일시정지·step into/over/out·변수·호출 스택·읽기 전용 감시식. 인터럽트 콜백은 우선순위 선점이 가능한 별도 실행 문맥이며 콜백 내부 중단점·호출 스택을 지원한다. 실행 대상이 ARM/Windows일 때는 실제 GCC 및 GDB를 사용한다. 사용자 사용법·한계는 [IDE 문서](docs/IDE.md).

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
- 회로 시뮬레이터의 HAL은 지원 API를 회로에 연결하는 소스 해석 모델이다. 실제 ST HAL로 빌드한 ARM ELF는 펌웨어 에뮬레이터(`src/emu`, `src/firmware-session.js`)가 Cortex-M4 명령어와 STM32F446 레지스터 단위로 실행해 같은 회로 모델에 연결한다. 세부 범위는 [HAL API](docs/HAL-API.md)와 [EMULATOR.md](docs/architecture/EMULATOR.md)를 따른다.

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
| `src/hal-generator.js`, `tests/toolchain/` | 이식 가능한 main.c 생성·ST HAL ARM 빌드 후 에뮬레이터 실행 검증 |
| `src/pins.js`, `src/components.js`, `src/placement.js` | 핀·부품·다리·별칭·구멍 장착 |
| `src/boards.js`, `src/board-picker.js` | 보드 카탈로그·검색·초기화 확인 |
| `src/app.js`, `src/app-*.js`, `src/app-state.js`, `src/common.js` | 시작 연결, 기능별 모듈, 공유 상태, 공통 함수 |
| `src/rpi-python.js` | 라즈베리파이 main.py Python 해석기·보드 드라이버 |
| `src/breadboards.js` | 추가 빵판 이동·회전·삭제와 연결 보존 |
| `src/part-library.js` | 전체 부품 카탈로그·한글/영문 검색 |
| `src/project.js`, `src/hal-examples.js`, `src/hal-circuits.js` | 빈 HAL 프로젝트·파일 검증·HAL 예제 코드/회로 |
| `src/parser.js`, `src/runtime.js`, `src/program.js` | 문법·실행기·API 진입점 |
| `src/mcu-config.js`, `src/serial-config.js` | MCU 설정·IOC·HAL 생성·실제 직렬 핀맵 |
| `src/hal-source.js`, `src/hal.js`, `src/hal-stdio.js`, `src/firmware-import.js` | HAL 소스/전처리·호환 API·printf·가져오기 |
| `src/session.js`, `src/engine.js` | 실행기/회로 연결·DC/RC 계산 |
| `src/lcd.js`, `src/buses.js`, `src/sensors.js` | 부품·버스 모델 |
| `src/wireless.js`, `src/wireless-examples.js` | HC-05·HC-06·ESP-01 모델·허브와 예제 |
| `src/device-defs.js`, `src/device-buses.js`, `src/device-motion.js` | 확장 센서·화면·구동·입력 모델과 핀 구성 |
| `src/device-examples.js`, `src/device-ui.js` | 확장 14종 HAL 회로/코드, 속성·실시간 픽셀/회전 표시 |
| `src/passive-buzzer.js`, `src/passive-buzzer-example.js`, `src/buzzer-audio.js` | 수동 부저 파형 측정·HAL 멜로디·부저별 음향 |
| `src/trace.js`, `src/monitor.js` | 파형·통신·로그 |
| `src/editor-search.js` | 현재 소스 찾기·바꾸기와 검색 패널 |
| `src/app.js`, `src/pinout-ui.js` | 편집/실행·핀 설정 |
| `src/ide-ui.js`, `src/code-editor.js`, `src/ide.css` | IDE 도구·프로젝트 UI·Monaco 연결 |
| `src/shell.js`, `src/shell.css` | VS Code형 작업 화면·메뉴·명령 팔레트·배치 저장 |
| `src/logic-analyzer.js`, `src/signals.js`, `src/part-media-ui.js` | 로직 분석기·선로 잡음·카메라/SD 속성 |
| `src/emu/`, `src/emu/stm32f446/`, `src/firmware-session.js` | Cortex-M4 에뮬레이터·STM32F446 주변장치·회로 연동 |
| `src/hal-nvic.js`, `src/hal-dma.js`, `src/hal-usart.js`, `src/hal-dcmi.js`, `src/hal-storage.js` | 인터프리터 NVIC 선점·DMA·USART 동기·카메라·SD |
| `src/debug-tools.js`, `src/parser.js`, `src/runtime.js`, `src/hal-source.js` | 소스 위치·실행 중단·변수·감시식 |
| `src/source-files.js`, `desktop/workspace.cjs` | C/H 파일 편집·폴더 저장·충돌 방지 |
| `scripts/build-editor.mjs` | 로컬 편집기 번들 |
| `src/render.js`, `src/part-render.js`, `src/part-controls.js` | SVG·부품 속성/측정 |
| `desktop/` | Electron·파일/폴더 가져오기·저장 IPC |
| `tests/unit`, `tests/interp`, `tests/emu`, `tests/firmware`, `tests/e2e`, `tests/toolchain`, `tests/release` | 모델·에뮬레이터·실제 Electron UI·ARM 빌드·EXE 검증 |
| `.github/workflows/build-windows.yml` | 병렬 작업: checks(정적 검사·단위·업데이트 도우미), firmware(ST HAL 예제 ARM 빌드·에뮬레이터), esp32(Arduino CLI 스케치, `.cache/arduino` 캐시), e2e 2묶음(측정한 시간으로 나눈 파일 목록, 2묶음은 나머지 전부), package(포터블 EXE·패키지 검사·Artifact) → 모두 통과하면 release |
| `.github/actions/arm-toolchain` | ARM GCC 14.2.1과 STM32CubeF4/F1 드라이버 설치(firmware, e2e가 함께 씀) |

GPIO 변경 전 `beforeChange`로 이전 출력의 시간 구간을 적분하고, 변경 후 `changed`로 같은 시점의 회로를 다시 계산한다. 같은 시간의 재측정에서 커패시터를 다시 충전하면 안 된다.

## 데이터와 실행 규칙

- appId `local.stm32.circuitlab`, 사용자 데이터 폴더 `STM32 Circuit Lab`, 확장자 `.stm32lab`, JSON format `stm32-circuit-lab`, 스키마 version 2를 유지한다.
- 자동 저장 키 `stm32lab.project.v2`와 v1 읽기 지원은 사용자 회로 보존을 위한 현재 기능이다. 새 기본값을 이유로 기존 자동 저장 회로를 덮어쓰지 않는다.
- `tests/fixtures/emu`, `tests/fixtures/firmware`는 에뮬레이터 검증용 사전 빌드 ELF와 회로다(`npm run build:fixtures`로 재생성). 앱에서 가져오지 않으며 EXE에 포함하지 않는다. 제공 HAL 예제는 `src/hal-examples.js`와 `src/hal-circuits.js`에서 구성한다.
- `simulation`, `mcu`, `firmware`, `ide`는 선택적 필드다. `ide`는 검증된 소스 파일별 중단점과 감시식을 저장한다. main.c는 `project.code`, 보조 소스는 `firmware.files`에 저장한다.
- 두 핀 부품의 `attachA/attachB`와 다핀 `attachments`는 헬퍼로 처리한다.
- renderer의 contextIsolation/sandbox를 유지하고 nodeIntegration을 켜지 않는다.
- UI 테스트는 `CIRCUIT_LAB_TEST_PROFILE`로 분리한다. 실제 사용자의 자동 저장 폴더는 건드리지 않는다.

## 개발과 검증

Node.js 24 계열, Electron 45.2.1, electron-builder 26.18.0, Playwright 1.64.1. 의존성은 lockfile을 따른다.

```powershell
npm ci
node node_modules/electron/install.js
npm start
npm test                 # unit + interp + emu + firmware
npm run test:e2e         # 실제 Electron 앱
npm run test:toolchain   # ARM_GCC, STM32CUBE_F4_ROOT 필요 (EXAMPLES로 범위 지정)
npm run build
npm run build:artifact
npm run test:release     # Windows: 패키지 앱·업데이트 도우미·포터블 EXE
```

`npm run build`는 `scripts/clean-build.cjs`로 이전 EXE·배포 묶음·win-unpacked를 먼저 정리한다. 실행 파일이 잠겼으면 아무 파일도 지우기 전에 중단하고 앱 종료를 안내한다. 패키지 검사에는 Electron/Chromium/Monaco 라이선스 원문과 참고 자료 제외 검증이 포함된다.

Windows CI는 `npm test` → ARM GCC(xPack)·ST HAL 드라이버 설치 후 대표 예제 빌드·에뮬레이터 실행 → E2E → 업데이트 도우미 → EXE 빌드·패키지 검증 순서로 실행한다. 실패한 실행의 로그는 Actions의 `Windows-test-diagnostics`에 14일 보관한다. `main` 푸시 후에는 해당 커밋의 GitHub Actions 결과까지 확인한다. E2E는 `CIRCUIT_LAB_TEST_PROFILE`로 사용자 프로필과 분리하고, 파일 대화상자는 main 프로세스의 `dialog`를 스텁한다. 현재 검증 결과와 한계는 [VERIFICATION.md](docs/VERIFICATION.md)를 확인한다.

## 권리와 모델 범위

저장소는 2026-09-16 소유자 요청으로 Public으로 전환했으며 [저작권 검토](docs/COPYRIGHT-REVIEW.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)를 유지한다. ST 드라이버/CubeMX XML, 참고 사진·참고 자료에 기반한 생성 이미지를 앱에 넣지 않는다. 자체 앱 아이콘은 desktop/icons에 두며 제작 정보는 docs/APP-ICON.md에 기록한다. 프로젝트 전체에 라이선스를 임의로 부여하지 않는다. README에 권리 관련 문제 또는 법적 문제가 확인되면 저장소를 삭제 조치한다는 안내를 유지한다.

회로 시뮬레이터 대상은 NVIC 선점, HAL DMA, 동기식 USART, 비트 단위 통신 파형/노이즈, 카메라 DCMI, SD 카드/FatFs를 지원한다([HAL API](docs/HAL-API.md)). MCU UART 간 직접 배선 전송, 전체 C/C++·CPU·레지스터 재현은 미지원이다. 모델을 정밀 하드웨어 에뮬레이션으로 설명하지 않는다.

다음 작업은 Git 상태와 이 문서, README/API 문서를 확인한 뒤 사용자 요청 범위에서 진행한다. 변경에 맞는 검증을 수행하고 현재 문서만 갱신한다.

## 0.18.0 장치 Docs와 colorscheme 등록

- 로컬 구현 0.18.0, 최신 공개 릴리스는 0.17.2다. 이번 변경은 아직 원격으로 게시하지 않았다.
- `basic-hal-examples.js`: 누락된 7종을 추가하여 HAL 예제 39개. LCD 실제 4비트 초기화/문자, RGB/7세그먼트 각각 직렬 저항, ADC/스위치/능동 부저/다이오드 회로를 검증한다.
- `device-docs-data.js`, `device-docs-ui.js`, `device-docs.css`: 35종 부품 + 보드/빵판의 개요·핀 연결표·HAL 호출·레지스터 예제. 선택 장치가 바뀌면 Docs도 전환한다.
- `device-assistance.js`, `c-source-edit.js`: 현재 사용자 소스를 보존해 stm_device_docs.c/.h와 main 초기화/반복 호출을 연결한다. 함수 버튼은 해당 함수를 사용하는 장치 예제와 의존성을 함께 적용한다. 정상 연결 보존, 부족한 부품/선 추가, 선택 주변 오접속 분리, GPIO/ADC/타이머/UART 배정, I2C 주소 충돌 거부, 생성 소스 편집 보호, 저장/재적용 멱등성, 원자적 실행 취소를 지원한다.
- Bare-metal 버튼은 HAL 초기화 + 직접 레지스터 동작의 학습 예제이며 ARM 대상으로 전환한다. 전체 HAL을 제거한 드라이버나 가상 ARM CPU 실행이 아니다. SPI/I2C 항목은 상태 레지스터 관찰이다. docs/DEVICE-DOCS.md에 동작 범위와 제약을 기록했다.
- Jellybeans는 직접 지정 팔레트 대신 Git 원본(ef83bf4) 기반 변환·등록으로 변경했다. 원본·SHA-256·MIT 헤더는 src/themes/jellybeans에 포함하며 원본 .vim은 Git 줄 끝 변환을 금지한다.
- `colorscheme.js`: 데이터 전용 Monaco/VS Code JSON, 정적 Vim import. 동적 Vimscript는 실행하지 않는다. 원본 규칙·이탤릭체·세부 토큰·출처를 보존하고 사용자 색상 수정과 기존 설정 마이그레이션을 지원한다.
- 설정의 Colorscheme 등록 / 테마 JSON 내보내기와 기존 설정 전체 가져오기는 별도 동작이다.
- 검증 증거: work/test-results/device-docs-arm.json(118개 ARM 컴파일·링크), device-docs-arm-followup.json(추가 10개), device-docs-smoke.json, colorscheme-smoke.json, docs-full-tests.log. 최종 결과는 docs/VERIFICATION.md를 확인한다.

- 최종 결과: 모델 235/235, 기존 UI 15종, 새 UI 2종과 패키징 앱의 새 UI 2종 모두 통과. 로컬 포터블 EXE 0.18.0 생성 및 asar/라이선스/소스 일치 검증 완료. 런타임 커밋 82a7454, EXE SHA-256 c76f5881759b8f4619a9fe8352af267c654c4b5b95f30af50925e735d1c64a9d.
