# 검증 기록

## 1.46.4 1·2·7·8·11번 오류 케이스 탐색, CI 측정 정정 — 로컬 검증

2026-11-11. **남아 있던 다섯 기능의 오류 탐색.**

| 기능 | 넣어 본 것 | 결과 |
|---|---|---|
| 1 ADC 연속 변환 | 해석기에서 10가지: 연속 모드 Stop 뒤 읽기·다시 Start, 단일 모드에서 Start 없이 Poll 반복, Start 전 GetValue·Poll, Start 두 번 | **오류 2건**: 연속 모드의 정지 안내가 "단일 변환 모드라…"였음. 단일 모드의 두 번째 Poll이 HAL_OK(HAL은 HAL_TIMEOUT). 수정, 단위 `adc-edge` |
| 2 FPB-RA6E1 | 핀 심볼 19가지·콜백 8가지 이름(`int`, `main`, `hal_entry`, `NULL`, `g_ioport`, `R_IOPORT_PinWrite`, `printf` …), 같은 이름을 STM32 라벨 17가지로도 | **오류**: RA는 심볼이 그대로 `#define`이라 18가지가 통과해 빌드를 깨뜨림(STM32는 `_Pin`이 붙어 무해, HAL 이름은 이미 거절). 수정, 단위 `ra-names` |
| 7 자동완성 | 15가지 문맥: HAL 함수·매크로·typedef, `hadc1.In`, `GPIO_InitStruct.Pu`, 인자 안, `uint32`, 주석·문자열 안 | **오류 2건**: `.` 뒤에 관계없는 이름(`pUART_CallbackTypeDef` 등), `uint32_t`가 안 나옴. 수정, 단위 `c-struct-fields`·E2E `completion`. 주석·문자열 안에서는 목록이 뜨지 않음(정상) |
| 8 DWARF 4 | F446RE·F103RB × Debug·Release × (libm `sin`·`pow` + `snprintf %f` + `malloc`·`qsort`, `.cpp` 소스) 8가지를 실제 빌드해 모든 컴파일 단위의 버전 확인 | 문제 없음(전부 4) |
| 11 복사한 파일 | `stm32f4xx_it.c`를 복사한 뒤 Pinout에서 EXTI를 켬(복사본에는 그 핸들러가 없음), 반대로 켰다 끔 | 문제 없음. 핸들러는 생성된 main.c에 들어가고, 어디에도 없으면 빌드 환경이 만든다. 처음에는 오류로 보았으나 탐색 스크립트의 판정이 틀렸다 |

**CI 측정 정정.** 아래 "같은 커밋 세 번"의 3.4분·3.3분은 `workflow_dispatch` 실행이고, 그 실행에서는 게시 작업이 건너뛰어진다(API로 확인: publish `skipped`). 그래서 전체 시간으로는 1.46.1과 비교할 수 없다. 게시까지 한 푸시 실행만 보면 **282초(4.7분) → 215초(3.6분)·251초(4.2분)**이고, 게시 전 "마지막 시험 작업이 끝난 시각"으로 보면 237초 → 183 · 204 · 193 · 204초다. 4.2분이었던 실행(42815651634)은 E2E 1/6이 204초(시험 153초)로 가장 늦었고 게시가 44초 걸렸다(다른 실행은 29초).

그 E2E 작업을 고쳤다. 로그에서 파일별 시간을 모으니(합 447초, 43개 파일) `--test-shard`가 devboards 53초 · workflow 38초 · adc-continuous 25초를 한 작업에 넣고 있었다. `scripts/e2e-shard.mjs`가 측정 시간으로 나눠 6개 작업이 79~84초가 된다(계산값; 실제 시간은 게시 확인에 적는다). 로컬에서 6/6 작업을 실행해 14개 시험이 도는 것을 확인.

검증: 단위·해석기·에뮬레이터·펌웨어 시험 전체, 관련 E2E, ESLint, 패키지 검사.

## 1.46.3 게시 확인과 CI 시간 — 같은 커밋 세 번

2026-11-10. 빌드 커밋 `63527db` · [Windows CI 42806440261](https://github.com/moonsyu/STM-Simulator/actions/runs/42806440261) 성공 · [Release v1.46.3](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.46.3)이 최신 릴리스, 자산 5개. 파일은 내려받지 않았다.

**CI 전체 시간: 4.7분(1.46.1) → 3.3~3.6분.** 마지막 구성(커밋 `efb8d26`)을 같은 커밋으로 세 번 돌렸다(푸시 1번, `workflow_dispatch` 2번, 모두 성공, Release는 그대로).

| 실행 | 전체 | 펌웨어 5묶음의 시험 시간 | 패키지 빌드 | 가장 늦게 끝난 시험 작업 |
|---|---|---|---|---|
| 1.46.1 [42792915183](https://github.com/moonsyu/STM-Simulator/actions/runs/42792915183) (기준, 3묶음) | 282초 = 4.7분 | 185 · 122 · 123초 | 135초 | 펌웨어 1/3 237초 |
| [42809019247](https://github.com/moonsyu/STM-Simulator/actions/runs/42809019247) | 217초 = 3.6분 | 116 · 116 · 100 · 101 · 121초 | 75초 | ESP32 183초 |
| [42809909388](https://github.com/moonsyu/STM-Simulator/actions/runs/42809909388) | 206초 = 3.4분 | 126 · 106 · 87 · 88 · 91초 | 74초 | E2E 1/6 204초 |
| [42814506681](https://github.com/moonsyu/STM-Simulator/actions/runs/42814506681) | 195초 = 3.3분 | 74 · 114 · 104 · 112 · 119초 | 83초 | E2E 1/6 193초 |

(전체는 실행의 시작~끝 시각 차이. 그 전 버전들의 전체 시간은 1.44.0 5.4분, 1.45.0 5.3분, 1.46.0 5.0분이었다.)

무엇이 줄였나:

- **패키지 작업**: 빌드 단계 133~151초 → 70~83초(다섯 번). 포터블 EXE 압축 수준 5. 이 작업이 전에는 가장 길거나 그에 가까워(213~235초), 시험 작업을 고르게 해도 전체가 줄지 않았다.
- **펌웨어 묶음**: 같은 CPU에서 잰 시간으로 5묶음. 세 번 모두 74~126초 안에 들었다(전에는 185초짜리가 있었다).
- **작업 분할**: 검사 2개(시험 60 · 88~124초), ESP32 3개(빌드 55~97초), E2E 6개.

1.46.2의 재분배가 왜 효과가 없었는지도 확인했다. 각 펌웨어 작업이 CPU와 고정 벤치마크를 출력하게 하니([42807689195](https://github.com/moonsyu/STM-Simulator/actions/runs/42807689195)), 묶음 1·3·4가 같은 CPU(AMD EPYC 7763, JavaScript 805~829 ms)에서 돌았는데 시험이 127 · 158 · 203초였다. 러너 속도는 같았으니 묶음이 고르지 않았던 것이다. 기준으로 삼은 1.46.1의 파일별 시간이 묶음마다 다른 러너(EPYC 7763 · 9V74 · 9V45, Xeon 8573C가 섞여 나온다. JavaScript 벤치마크 575~851 ms)에서 나온 값이어서, 그 숫자로 맞춘 묶음은 실제로는 맞지 않았다. 앞의 "네 번 측정한 결론"에서 설치 스크립트 생략을 의심한 것은 틀렸다 — 원인은 기준값이었다.

남은 것: 이제 가장 긴 작업은 E2E 1/6(시험 112~149초, 다른 다섯은 58~95초)과 ESP32(캐시 복원 45~64초 + 빌드)다. E2E는 `--test-shard`가 파일을 순서대로 나눠 무거운 파일이 한 작업에 몰린다. 묶음을 직접 나누면 더 줄일 수 있으나 하지 않았다.

## 1.46.3 1~13번 오류 케이스 탐색, 패키지 빌드 시간 — 로컬 검증

2026-11-10. **1~13번 오류 탐색.** 방법: 모든 HAL 예제를 두 보드에 적용한 247개 프로젝트에 기능을 엇갈려 적용하고(내보내기 → 가져오기 → 코드 생성, 재생성 두 번, 핸들러 중복 검사, 핀 설정으로 회로 만들기, 재생성한 코드를 해석기로 200 ms 실행), 이름·값의 경계(놓는 파일 이름 19가지, printf 서식 45가지, 핀 전압 16가지, 핸들러 표기 10가지)를 넣어 보았다.

| 기능 | 본 것 | 결과 |
|---|---|---|
| 3 CubeMX(.ioc 내보내기·가져오기) | 247개 프로젝트 왕복 뒤 생성 코드 비교 | **오류**: 62개에서 핀 순서가 바뀌고 2개(ref_ov2640_camera, 두 보드)는 기본 루프가 다른 핀을 토글(PC7 → PC6). 수정 후 245개가 글자 단위로 같고 2개는 핸들 선언 순서만 다름. Reserved 핀은 내보내지 않음(한계로 기록) |
| 4 printf 실수 | 서식 45가지를 C 출력과 비교 | **오류**: 동률 반올림 2가지(`%.0f` 2.5·0.5, `%.1f` 0.25). 수정. 지원하지 않는 서식 6가지는 안내 오류(그중 정밀도 9~17은 이번에 지원) |
| 5 핀 과전압 | TT·FT 핀에 3.6/3.6000001/3.61, 5.5/5.51, −0.3/−0.31, NaN·undefined·null·Infinity | 문제 없음(경계 포함, 숫자가 아닌 값은 무시) |
| 6 핸들러 중복 | 247개 예제, 표기 10가지(선언만, 주석, `#if 0`, `__weak`, static) | 문제 없음(예제는 0건, SysTick_Handler는 잡음, 켜지 않은 EXTI 선은 잡지 않음) |
| 9 USER CODE 재생성 | 247개: 같은 설정으로 재생성 → 옮긴 것 0, 두 번째 결과 동일, 실행 | 문제 없음 |
| 10·12 가져오기·드롭 | 이름 19가지(한글, 공백, `..`, 절대 경로, 대소문자만 다른 두 파일, `.s`·`.ld`) | **오류**: `.s`+`.ld`가 엉뚱한 사유로 거절. 수정. 나머지는 사유와 함께 거절되거나 건너뛴 목록에 나옴 |
| 13 .ioc로 회로 만들기 | 247개의 핀 설정으로 회로 생성 후 프로젝트 검증 | 문제 없음 |
| 1·2·7·8·11 | 이번에 따로 넣어 보지 않음 | 1(ADC 연속)·2(RA)·8(DWARF)는 기존 해석기·툴체인 시험이 통과, 7(자동완성)·11(파일 복사 수정)은 기존 E2E뿐 |

덧붙여 빌드에서 찾은 것: `npm run build`를 이어서 두 번 하면 정리 스크립트가 `electron_wer.dll`(Electron 45)을 알 수 없는 파일로 보고 멈췄다 → 허용 목록에 추가.

**패키지 빌드 시간.** CI 로그에서 패키지 작업의 빌드 단계 133초 중 125초가 포터블 EXE 압축(7-Zip)이었다. 이 PC에서 같은 소스로 잰 값: 기본 145초 / 115,632,162바이트, 수준 5 63초 / 117,558,426바이트(+1.7 %), 수준 3 17초 / 132,240,099바이트(+14 %), 수준 1 13초 / 140,144,839바이트(+21 %). 수준 5로 정했다. `npm run build` 전체는 66초(전에는 약 155초). 그 EXE로 패키지 검사 3개(풀린 앱, 업데이트 도우미, 포터블 EXE 실행) 통과.

검증: 단위·해석기·에뮬레이터·펌웨어 시험 전체 통과, ESLint, 패키지 검사.

## 1.46.2 CI 시간 — 네 번 측정한 결론

2026-11-10. 재분배 뒤의 Windows CI 네 번(모두 성공, Release v1.46.2 유지):

| 실행 | 전체 | 펌웨어 1/3 · 2/3 · 3/3 (시험 단계) | 검사(시험) | 비고 |
|---|---|---|---|---|
| 1.46.1 [42792915183](https://github.com/moonsyu/STM-Simulator/actions/runs/42792915183) (재분배 전) | 4.7분 | 185 · 122 · 123초 | 113초 | 기준 |
| [42796573092](https://github.com/moonsyu/STM-Simulator/actions/runs/42796573092) | 5.8분 | 148 · 205 · 227초 | 152초 | 설치 스크립트 생략 |
| [42797841182](https://github.com/moonsyu/STM-Simulator/actions/runs/42797841182) | 6.2분 | 164 · 200 · 239초 | 151초 | 설치 스크립트 생략 |
| [42799193749](https://github.com/moonsyu/STM-Simulator/actions/runs/42799193749) | 5.1분 | 139 · 205 · 218초 | 79초 | 설치 스크립트 생략 |
| [42800470270](https://github.com/moonsyu/STM-Simulator/actions/runs/42800470270) | 4.9분 | 163 · 211 · 152초 | 111초 | 펌웨어 작업만 설치 스크립트 되돌림 |

**CI 전체 시간은 줄지 않았다(4.7분 → 4.9~6.2분). 재분배로 빨라졌다는 실측은 없다.** 알게 된 것:

- 같은 실행 안에서도 러너마다 속도가 크게 다르다. 마지막 실행에서 같은 시험의 시간 비(1.46.1 대비) 중앙값이 묶음 1은 0.63배, 묶음 2는 약 1.6배, 묶음 3은 1.23배였다. 이 편차(0.6~1.8배)가 재분배로 맞추려던 차이(60초)보다 크다.
- 아래 "두 번째 측정"에서 원인을 러너 속도라고 적었지만, 세 번째 실행에서는 검사 작업이 빨랐는데도(79초) 펌웨어 묶음 2·3이 느렸다. 그래서 펌웨어 작업의 `--ignore-scripts`를 의심해 되돌렸고, 그 실행에서 묶음 3은 152초로 돌아왔지만 묶음 2는 211초 그대로였다. **설치 스크립트 생략이 원인인지는 가리지 못했다**(한 번의 비교, 러너 편차와 섞임). 느려질 구조도 찾지 못했다.
- 지금 상태: 묶음 재분배 유지, 펌웨어 작업은 `npm ci`(원래대로), ESP32 작업은 `npm ci --ignore-scripts`, 패키지 작업은 `build:package`. ESP32 스케치 빌드 차이는 22초 → 15~25초로 뚜렷한 변화가 없다.
- 다음에 할 때: 한 번의 실행으로 판단하지 말고 같은 커밋을 여러 번 돌려 중앙값으로 비교한다. 러너 편차를 줄일 방법(작업 수를 줄여 한 러너에서 더 많이 돌리기 등)은 시도하지 않았다.

## 1.46.2 CI 시간 — 두 번째 측정과 원인

2026-11-10. 문서 커밋 `1d72f8e`의 [Windows CI 42797841182](https://github.com/moonsyu/STM-Simulator/actions/runs/42797841182): 성공, 전체 6.2분(Release는 v1.46.2 그대로, 자산 5개). 펌웨어 1/3 208초(시험 164초), 2/3 245초(200초), 3/3 317초(239초), ESP32 207·224초(빌드 101·126초), 패키지 234초, 검사 212초. 첫 측정(5.8분)과 같은 모양이다.

원인은 러너 속도였다. 근거 두 가지. ① 검사 작업은 이번 변경과 무관한데 시험 1,214개의 합이 414초 → 552초, 300 ms 넘는 시험 134개의 시간 비 중앙값이 1.34배다. ② 그 작업의 에뮬레이터 성능 시험은 같은 명령어 24,382,934개를 실행하는데 24.0 MIPS(CPU 1,015 ms) → 20.3 MIPS(CPU 1,204 ms)였다. Node(24.22.2)와 러너 이미지(windows-2025-vs2026 20261103.298.1)는 두 실행이 같다. 펌웨어 묶음 3의 같은 시험 19개는 중앙값 1.65배였고, 컴파일이 대부분인 묶음 1(F446RE 예제 68 → 46초, FSP 예제 54 → 52초)은 느려지지 않았다 — 느려진 것은 자바스크립트 실행(에뮬레이터)이다.

결론: 재분배는 유지한다(1.46.1의 시험별 시간으로 계산하면 146/146/136초로 고르다). 다만 **이번 두 실행에서 CI 전체 시간은 줄지 않았고(4.7분 → 5.8·6.2분), 재분배의 효과는 실측으로 확인하지 못했다.** 러너가 1.46.1 때와 같은 속도일 때의 실행으로 다시 비교해야 한다. 에뮬레이터 위주의 묶음(2·3)이 러너 속도에 더 민감하다는 것도 이번에 알게 된 점이다.

## 1.46.2 채터링 2 ms, CI 시간 — 게시 확인(API)

2026-11-10. 빌드 커밋 `f2e9058` · [Windows CI 42796573092](https://github.com/moonsyu/STM-Simulator/actions/runs/42796573092) 첫 실행에서 성공. [Release v1.46.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.46.2)가 최신 릴리스이고 자산 5개. 파일은 내려받지 않았다.

**CI 시간은 이 실행에서 줄지 않았다: 전체 5.8분(1.46.1은 4.7분).** 작업 끝난 시각: 펌웨어 1/3 222초(시험 148초), 2/3 251초(205초), 3/3 282초(227초), ESP32 221·211초(빌드 124·109초), 패키지 224초, 검사 215초, E2E 151~204초, 게시 58초. 로그의 시험별 시간을 1.46.1과 비교하면 같은 시험이 묶음 2·3의 러너에서 1.5~2배 걸렸고(B1 폴링 14.6 → 29.8초, IWDG 19.6 → 32.0초, I²C 두 보드 9.2 → 12.4초), 묶음 1에서는 더 빨랐다(F446RE 예제 68 → 46초). 바뀌지 않은 작업도 느렸다(검사의 시험 113 → 152초, E2E 3/4 130 → 151초). 그래서 이 실행 하나로는 재분배의 효과를 판단할 수 없다 — 러너 속도 편차가 재분배로 얻을 차이(예상 약 40초)보다 컸다. ESP32는 빌드 시간 차이가 22초에서 15초로 줄었다. 다음 실행(이 기록의 문서 커밋)에서 한 번 더 잰다.

## 1.46.2 채터링 2 ms, CI 시간 — 로컬 검증

2026-11-10. **오류 케이스 탐색(14~19·23·24번)**. 찾은 오류 1건: 채터링 2 ms가 뒤집힘 0번 → 수정, 해석기 `button-bounce`가 목록의 모든 시간(2·5·10·20 ms)이 2번 이상 짝수로 뒤집히고 그 시간 안에 눌린 상태로 끝나는지 확인, 툴체인 `button-bounce`(STM32·RA6E1 실제 빌드) 통과. 오류가 아니었던 것: ① 새 프로젝트 창에서 RA 템플릿을 고른 뒤 STM 보드로 바꾸면 템플릿이 `blank`로 돌아가고 HAL 프로젝트가 생긴다. 반대로 HAL 예제를 고른 뒤 FPB-RA6E1로 바꾸면 `ra-minimal`이 되고 hal_entry.c가 생긴다(Electron에서 직접 실행해 확인, 콘솔 오류 없음). ② 시작 파일·링커 스크립트를 프로젝트로 복사한 뒤 보드를 바꾸는 경우: 보드 변경은 프로젝트를 그 보드의 기본 프로젝트로 바꾸므로 다른 MCU의 시작 파일이 남지 않는다(`app.js` `projectForBoard`). 확인하지 못한 것은 이전과 같다(18번 디버그 Resume, 24번 헤더 IRQ 핀 수, 22번 `RA_IRQ_DS` 표, 20번 TZ 구간의 글자 단위 대조).

**CI 시간**. 1.46.1 실행(42792915183)의 작업별 시간을 API로 읽었다: 펌웨어 1/3 235초(시험 185초), 2/3·3/3 162초, ESP32 198·219초, 패키지 201초, E2E 139~186초, 검사 169초, 게시 41초 — 전체 4.7분, 가장 긴 것이 펌웨어 1/3. 고친 것: 펌웨어 묶음 재분배(시험 146/146/136초 예상), ESP32 분배(120/122초 예상), 펌웨어·ESP32의 설치 스크립트 생략, 패키지의 편집기 재빌드 생략(약 10초). 로컬 확인: 묶음 2를 `node scripts/toolchain-shard.mjs 2`로 실행해 파일 실행 7개 + `arm-examples`의 F103RB 시험만 도는 것, `npm ci --ignore-scripts`로 설치한 새 복제본에서 툴체인 시험 파일 전부가 로드되고 5개 파일 12개 시험이 통과하는 것, `npm run build`(→ `build:package`)와 패키지 검사. 실제 CI 시간은 게시 확인에 적는다.

## 1.46.1 설정 적용 뒤 갱신, 드롭 — 게시 확인(API)

2026-11-10. 빌드 커밋 `95b0293` · [Windows CI 42792915183](https://github.com/moonsyu/STM-Simulator/actions/runs/42792915183) 첫 실행에서 성공, 전체 4.7분. [Release v1.46.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.46.1)이 최신 릴리스이고 자산 5개(STM-Simulator.exe, ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json). 파일은 내려받지 않았다.

## 1.46.1 설정 적용 뒤 갱신, 드롭 — 로컬 검증

2026-11-10. 20~22번의 오류 케이스를 찾아본 결과 두 건. ① RA Configuration에서 External IRQ를 채널 1에서 6으로 바꿔 적용한 뒤에도 Developer Assistance가 `g_external_irq1`을 보였다 → 수정 후 E2E `ra-rasc`가 `g_ioport, BSP, g_external_irq6`을 확인. ② 항목을 마우스로 끌어 편집기에 놓으면 `…OUTPUT);$0`처럼 `$0`가 붙었다 → 수정 후 E2E `ra-assistance`가 코드가 한 번만, `$0` 없이 들어가는 것을 확인. 오류가 아니었던 것: BSP 크기 극단값(스택 0x20000·힙 0, 스택 0x100·힙 0x20000)은 FSP로 빌드되어 Blinky가 동작하고, 힙 0x1000에서는 `malloc(0x800)`이 성공, 0x400에서는 NULL(툴체인 `ra-course`). 관련 E2E `ra-rasc`·`ra-assistance`·`project-structure`·`shell` 13개, 단위 833개(툴체인 환경 변수가 있으면 836개), ESLint, 패키지 검사 통과.

## 1.46.0 기능 목록 20~22번 — 게시 확인(API)

2026-11-10. 빌드 커밋 `85f5bc3` · [Windows CI 42791354778](https://github.com/moonsyu/STM-Simulator/actions/runs/42791354778) 첫 실행에서 성공, 전체 5.0분. [Release v1.46.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.46.0)이 최신 릴리스이고 자산 5개(STM-Simulator.exe, ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json). 파일은 내려받지 않았다.

## 1.46.0 기능 목록 20~22번 — 로컬 검증

2026-11-10. 20번: E2E `project-structure`(RA 프로젝트의 src·ra_gen·ra_cfg·script·ra 폴더, IRQ Stack이 있으면 r_icu가 있고 r_sci_uart는 없음, hal_entry.c만 프로젝트 파일, ra_gen/main.c·bsp_pin_cfg.h·bsp_delay.c가 읽기 전용으로 열림). 21번: 단위 `ra-assistance` 3개(보드 템플릿의 그룹·코드, 바꾼 핀 이름·콜백, 모든 예제의 Stack 그룹이 예제 코드의 인스턴스 이름과 같음), E2E `ra-assistance`(STM32 프로젝트에는 없음, 누르면 `R_IOPORT_PinCfg(…)`가 hal_entry.c에 들어감, 읽기 전용 파일이 열려 있으면 넣지 않음). 22번: 단위 `ra-rasc` 3개(IRQn-DS 이름, 같은 채널 거절 문구, BSP 크기 검사와 bsp_cfg.h), E2E `ra-rasc`(탭 다섯 개, 모드 이름, External IRQ Stack 삭제·추가·채널·핀 변경, 같은 채널 오류, BSP 크기, 생성된 bsp_cfg.h의 0x800). 단위 시험 전체 833개(툴체인 환경 변수가 있으면 836개) 통과, 기존 E2E `ra6e1`·`ra-new-project`와 툴체인 `ra-course`(FSP 실제 빌드) 12개 통과, ESLint 통과. 1.45.0 게시: 빌드 커밋 `8126ef0` · Windows CI 42788029612 성공(5.3분) · Release v1.45.0이 최신, 자산 5개(API 확인).

## 1.45.0 RA6E1 강의 Day5 실습, 버튼 채터링 — 로컬 검증

2026-11-10. ① 강의의 실습 세 가지를 슬라이드대로 작성해 FSP + ARM GCC로 빌드하고 RA6E1 에뮬레이터에서 실행: LED(`BBQ_LED`로 이름 바꾼 P408이 깜빡임), 스위치 폴링(`R_IOPORT_PinRead`, 누를 때마다 LED1 토글), 인터럽트(Rising: S1을 누르고 있을 때는 그대로, 뗄 때 LED2 토글 / LED1은 계속 깜빡임). ②에서 FSP 빌드 경고 1건을 찾아 고쳤다. ② Blinky 템플릿: LED1·LED2가 함께 켜지고 꺼짐. ③ 도전 과제: LED 4개가 0000 → 0100까지 0.1초마다 세고, 스위치 2를 누르면 멈춘 값이 0.4초 뒤에도 그대로이며 다시 누르면 다음 값부터 이어지고, 스위치 1을 누르면 0000부터 다시 센다. ④ 버튼 채터링: 해석기(EXTI 횟수 1 → 5 ms에서 여러 번 → 10 ms에서 더 많이, 30 ms 유지 디바운스로 1), 에뮬레이터(FPB-RA6E1·NUCLEO-F446RE 폴링: 깨끗한 접점 1번 토글, 10 ms 채터링에서 여러 번, 누름·뗌 100 ms 디바운스로 1번). ⑤ 새 프로젝트 창: RA 보드에서 Minimal·Blinky·예제로 생성, STM32 보드에서는 HAL 템플릿(E2E). 시험: 단위+해석기+에뮬레이터+펌웨어 1,115개(1개 건너뜀), 툴체인 `ra-course` 3개·`button-bounce` 2개·`ra-build` 2개, E2E `ra-new-project`, ESLint 통과.

## 1.44.0 기능 목록 14~17번 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `3427d1c` · [Windows CI 42783355033](https://github.com/moonsyu/STM-Simulator/actions/runs/42783355033) 첫 실행에서 모두 성공, 전체 5.4분. [Release v1.44.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.44.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,673,500바이트, STM-Simulator-1.44.0-Windows-x64.zip 116,765,484바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.44.0 기능 목록 14~17번 — 로컬 검증

2026-11-10. 14번: 단위 시험(`.s`·`.ld` 이름 검증, 생성 보기 목록, 가짜 SDK 배치로 빌드 계획 — 프로젝트의 시작 파일만 어셈블하고 `-T`가 프로젝트의 `.ld`를 가리킴, 해석기는 무시), 실제 ARM GCC 빌드(두 보드: 복사한 시작 파일에 넣은 `bl early_hook`과 256바이트 낮춘 `_estack`이 펌웨어에서 확인됨), E2E(트리의 폴더 7개, Core 열림·Drivers 접힘, Core/Src 5개 파일, `.ioc` 보기, 링커 스크립트·시작 코드 복사 → 트리에서 프로젝트 파일로 바뀜 → 수정 유지, 연 폴더 유지). 15번: 사이드바를 새 창으로 꺼낸 뒤 활동 바 단추를 누르면 본 창으로 돌아오고 그 보기가 열림(E2E). 16번: Docs 단추를 두 번 눌러도 보기가 남고 Ctrl+B로 접힘(E2E). 17번: 속성 패널을 닫은 뒤 부품을 한 번 누르면 닫힌 채, 두 번 누르면 열림(E2E). 시험: 단위+해석기+에뮬레이터+펌웨어 1,111개(1개 건너뜀), E2E `shell` 8개·`project-structure`·`definition`·`copy-to-project`·`folder-import` 통과, 툴체인 `copied-files` 2개 통과, ESLint 통과.

## 1.43.0 실제 CubeMX .ioc — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `ab167f2` · [Windows CI 42780348111](https://github.com/moonsyu/STM-Simulator/actions/runs/42780348111) 첫 실행에서 모두 성공, 전체 5.1분. [Release v1.43.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.43.0) draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,646,490바이트, STM-Simulator-1.43.0-Windows-x64.zip 116,738,216바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.43.0 실제 CubeMX .ioc 190개 — 로컬 검증

2026-11-10. ① 사용자 폴더의 CubeIDE 프로젝트 2개(CubeMX 6.18.1, NUCLEO-F103RB 보드 템플릿): `.ioc`는 경고 없이 읽히고 핀·라벨·EXTI 에지·클록(HSI/2 × 16 = 64 MHz)이 CubeMX가 생성한 `main.c`·`main.h`와 같았다. 폴더째 가져와 실행: ARM GCC 빌드와 에뮬레이터는 통과, 내장 해석기는 `PA3: HAL_GPIO_Init 모드/풀 설정과 Pinout이 다릅니다`로 멈춤 → 수정 후 통과. 다른 한 프로젝트는 원본 `main.c` 123행의 오타(`HAL_RCC _OscConfig`)로 두 엔진 모두 같은 줄에서 컴파일 오류를 냈다(앱 문제 아님). ② 공개 저장소의 실제 `.ioc` 188개(F446RE 97, F103RB 91, CubeMX 4.8~6.17)와 합쳐 190개를 가져오기 → 검증 → 코드 생성 → 회로 추천·구성 → 내보내기 → 다시 가져오기에 통과시켰다. 190개 모두 읽혔고 JS 오류는 없었다. 수정 전에는 설정 오류로 남는 항목이 SPI MISO 12, 클록 한도 약 40, 주변장치 없는 인터럽트 16, 라벨 중복·HAL 이름 26, ADC Rank 8 등이었고, 수정 후 남은 것은 모델에 없는 구성 14건(UART 반이중 6, 타이머 채널 핀 없음 4, SDIO 2, ADC 트리거 2, 엔코더 Prescaler 2)과 파일 자체가 한도를 넘는 클록 1건, SWD 핀을 GPIO로 쓰는 1건이다. 클록은 파일에 적힌 SYSCLK·HCLK·PCLK1·PCLK2와 대조해 177개 중 174개 일치(수정 전 165개). 내보내기 왕복은 SWD·오실레이터 핀을 포함해 같아졌고, 모델에 없는 신호의 예약 핀만 빠진다. ③ SPI 송신 전용: 해석기 실행(수신 0xFF), ARM GCC 빌드와 에뮬레이터 실행(두 보드, 경고 0). 시험: 단위+해석기+에뮬레이터+펌웨어 1,107개(1개 건너뜀) 통과, 관련 E2E 8개(`peripheral-params`·`bus-instances`·`folder-import`·`file-drop`·`ioc-export`) 통과, ESLint 통과.

## 1.42.0 해석기 union — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `0d99e49` · [Windows CI 42761757914](https://github.com/moonsyu/STM-Simulator/actions/runs/42761757914) 첫 실행에서 모두 성공, 전체 5.1분. [Release v1.42.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.42.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,625,333바이트, STM-Simulator-1.42.0-Windows-x64.zip 116,716,706바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.42.0 해석기 union — 로컬 검증

2026-11-10. union 사례 11개: 워드와 바이트(리틀 엔디언), float와 비트(1.0f = 0x3F800000, 0x40490FDB = 3.1416), 두 바이트와 16비트 값, 부호 있는 멤버, 첫 멤버·지정 초기화, 복사(원본 유지), 구조체 필드, 포인터 매개변수로 바이트 뒤집기, union 배열과 memset, 같은 멤버 반복 사용, 안내 오류 2가지 — 모두 기대한 출력. 시험: 단위+해석기+에뮬레이터+펌웨어 1,095개(1개 건너뜀) 통과, ESLint 통과. 1.41.0 뒤의 문서·시험 푸시(`4f1936e`)의 CI도 성공.

## 1.41.0 뒤 확인 — 실습 프로그램 통째 실행, 다시 생성과 새 문법

2026-11-10. ① 실습용 전체 프로그램 11개를 해석기에서 끝까지 실행: 작업 스케줄러(함수 포인터 표), 명령 파서(sscanf + 명령 표), ADC 평균과 보간(2차원 표), 버튼 상태 기계(enum 번호 표), PWM 페이드, 타이머 플래그 패턴 재생(포트·핀 표 + 2차원 패턴), 링 버퍼, 타이머 인터럽트 깜빡임, UART 수신 인터럽트 줄 파서, ADC 인터럽트 평균, EXTI 버튼 횟수 — 모두 기대한 출력이고 고칠 것이 없었다. 그중 5개를 회귀 시험 `tests/interp/course-programs.test.js`로 넣었다. ② 다시 생성(9번)에 새 문법(함수 포인터 typedef·표, 2차원 표, 지정 초기화, 여러 줄 매크로, `#if` 블록, 포트 표, 문자열 속 중괄호, enum 번호 표)이 든 사용자 코드를 구역 밖 앞·뒤에 두고 18가지 확인: 모두 한 번씩 남고 두 번째 생성에서 그대로였다. 함수 포인터 표 `(*const tbl[])`의 항목 이름이 `const`로 읽히는 것만 고쳤다(옮긴 항목 안내에 그 이름이 나왔다). ③ 이전의 무작위 검사(해석기 설정 653개, .ioc 왕복 787개, 관용구 56개)를 다시 돌려 결과가 그대로인 것을 확인했다. 시험: 단위+해석기+에뮬레이터+펌웨어 1,092개(1개 건너뜀) 통과.

## 1.41.0 타이머 Update 플래그, 핸들러 중복 안내 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `730b777` · [Windows CI 42760242836](https://github.com/moonsyu/STM-Simulator/actions/runs/42760242836) 첫 실행에서 모두 성공, 전체 5.0분. [Release v1.41.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.41.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,643,348바이트, STM-Simulator-1.41.0-Windows-x64.zip 116,734,559바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.41.0 타이머 Update 플래그, 핸들러 중복 안내 — 로컬 검증

2026-11-10. ① 핸들러 중복 안내(6번)에 소스 13가지(문자열 안의 `//`·`/*`, 문자 리터럴의 따옴표, `#if 0`/`#if 1 #else`/`#ifdef`/매크로 조건, 원형만·호출만, weak, 여러 핸들러, 꺼 둔 인터럽트)를 넣어 확인: 문자열 뒤의 핸들러를 놓치는 것 2건과 매크로로 끈 블록을 안내하는 것 1건을 고쳤고, 대체 콜백 이름이 `HAL 콜백`으로만 나오던 인터럽트(F446RE 3개, F103RB 3개)에 이름을 넣었다. ② 타이머 Update 플래그 폴링: 100 ms 주기 타이머에서 플래그가 100·200·300·400 ms에 한 번씩 오르고, 지우지 않으면 유지되며, 멈춘 타이머에서는 오르지 않는다. 시험: 단위+해석기+에뮬레이터+펌웨어 1,087개(1개 건너뜀) 통과, ESLint 통과.

## 1.40.0 해석기 2차원 배열·지정 초기화·함수 포인터 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `492f463` · [Windows CI 42759106748](https://github.com/moonsyu/STM-Simulator/actions/runs/42759106748) 첫 실행에서 모두 성공, 전체 4.8분. [Release v1.40.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.40.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,648,311바이트, STM-Simulator-1.40.0-Windows-x64.zip 116,739,558바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.40.0 해석기 2차원 배열·지정 초기화·함수 포인터 — 로컬 검증

2026-11-10. 세 문법을 각각 사례 묶음으로 확인했다: 지정 초기화 12개(순서·중첩·구조체 배열·HAL Init 구조체·enum 번호 표·잘못된 지정자 안내), 2차원 배열 16개(초기화 형태 4가지, 글꼴·키패드 표, 문자열 행, 행 전달, 배열 매개변수, sizeof, memset/memcpy, 범위·3차원·초기값 초과 안내), 함수 포인터 8개(핸들러 표, 재대입, NULL 비교, typedef 콜백, `&함수`·`(*fn)()`, 구조체 필드, 상태 표, NULL 호출 안내). 모두 기대한 출력. 그 과정에서 매개변수 `int a[4]`가 문법 오류였던 것을 찾아 고쳤다. 시험: 단위+해석기+에뮬레이터+펌웨어 1,083개(1개 건너뜀) 통과, ESLint 통과.

## 1.39.0 해석기 HAL 조회 함수 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `cb145a2` · [Windows CI 42757408201](https://github.com/moonsyu/STM-Simulator/actions/runs/42757408201) 첫 실행에서 모두 성공, 전체 4.9분. [Release v1.39.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.39.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,643,191바이트, STM-Simulator-1.39.0-Windows-x64.zip 116,734,254바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.39.0 해석기 HAL 조회 함수 — 로컬 검증

2026-11-10. HAL·CMSIS 호출 45개(타이머 시작·비교값, ADC 폴링, UART 수신 타임아웃, I2C 전송, 클록 조회, 리셋, 슬립, 상태 조회, 플래그 매크로)를 해석기에서 실행: 25개가 멈췄고 그중 값 조회·무동작 16개를 넣었다. 레지스터·플래그 수준 6개는 안내 오류로 남겼고, 나머지 3개는 설정이 맞지 않을 때의 올바른 안내였다. 손상된 .ioc 610개 가져오기: 593개 읽힘, 17개 한국어 안내, JS 오류 0. 시험: 단위+해석기+에뮬레이터+펌웨어 1,073개(1개 건너뜀) 통과, ESLint 통과.

## 1.38.0 해석기 문자열·메모리 관용구 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `6aba894` · [Windows CI 42756353115](https://github.com/moonsyu/STM-Simulator/actions/runs/42756353115) 첫 실행에서 모두 성공, 전체 4.4분(1.37.0 4.8분, 1.36.0 5.0분, 1.35.0 6.6분, 1.33.0 8.0분). 작업별: 툴체인 217·156·209초, E2E 4조각 190·129·197·149초, 단위 159초, 패키지 206초, ESP32 2조각 164·215초, 게시 41초. [Release v1.38.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.38.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,650,456바이트, STM-Simulator-1.38.0-Windows-x64.zip 116,741,307바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.38.0 해석기 문자열·메모리 관용구 — 로컬 검증

2026-11-10. 관용구 45개(문자열 검색·복사·비교, 숫자 변환, ctype, 명령 줄 파싱, printf 형식, 구조체 배열과 포인터 순회, memset/memcpy의 여러 요소 크기, 바이트 조립)를 해석기에서 실행해 실패 9종을 고쳤다: `strchr`·`strstr`, `strtol`·`atof`, `<ctype.h>`, `putchar`, `%e`·`%g`, 포인터 크기 비교(`d < devs + 3`), 구조체·uint16_t 배열의 memset/memcpy, `const char *p`의 `p++`, 문자열 매개변수의 `s++`(끝나지 않고 메모리 한도 오류). `sscanf`도 넣었다(`%d %i %u %x %f %s %c`, 폭, `%*`). 시험: 단위+해석기+에뮬레이터+펌웨어 1,070개(1개 건너뜀) 통과, ESLint 통과.

## 1.37.0 해석기 C 문법 2차·HAL 관용구, 소스 이름 충돌 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `b5f061e` · [Windows CI 42755356472](https://github.com/moonsyu/STM-Simulator/actions/runs/42755356472) 첫 실행에서 모두 성공, 전체 4.8분(1.36.0은 5.0분). 툴체인 3묶음의 시험 시간이 196·99·182초 → 172·155·118초로 고르게 됐고 가장 긴 툴체인 작업이 252초 → 221초가 됐다. 작업별: 툴체인 221·199·158초, E2E 4조각 190·139·206·167초, 단위 210초, 패키지 229초, ESP32 2조각 152·239초, 게시 42초 안팎. 이제 작업들이 3.5~4분에 모여 있어(가장 긴 것은 실행마다 바뀌는 ESP32·패키지) 조각을 더 나눠도 줄어드는 폭이 작다. [Release v1.37.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.37.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,695,821바이트, STM-Simulator-1.37.0-Windows-x64.zip 116,786,930바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.37.0 해석기 C 문법 2차·HAL 관용구, 소스 이름 충돌 — 로컬 검증

2026-11-10. ① C 관용구 64개(switch fall-through, do-while, 정수 래핑, 비트 연산, enum, static 지역 변수, 포인터 연산, 문자열 함수, printf 형식, 재귀, `#if`, 구조체 복사 등)를 해석기에서 실행: 실패 7종(쉼표 연산자, `#if` 식·`#elif`, 구조체 필드 다중 선언, `<stdlib.h>`, 포인터 배열 `sizeof` 8→4 계산 오류, `uint64_t`·union·지정 초기화의 뜻 모를 오류 문구)을 고치거나 안내로 바꿨다. ② HAL 관용구 39개(포트·핀 표, 포트를 받는 함수, printf 재지정, 상태 기계, 링 버퍼, 명령 표, 문장형·여러 줄 매크로 등): 실패 6종(`GPIO_TypeDef *`, 구조체 포인터 필드, `static inline`, `do { } while (0)` 매크로, 줄 이음 매크로, `__HAL_GPIO_EXTI_*`)과 계산 오류 1개(`p == buf`가 0)를 고쳤다. 레지스터 직접 접근은 안내 오류로 남겼다. ③ 끌어다 놓기·이름 변경 경계 사례 14개: `Main.c`를 놓으면 저장한 프로젝트가 검증에서 거부되어 다시 열 수 없던 것, 한 번에 놓은 대소문자 쌍·같은 파일 둘, 파일 이름이 폴더이기도 한 경로, 이름 변경이 다른 폴더의 같은 이름 헤더 `#include`를 바꾸던 것, 삭제가 막히던 것을 고쳤다. 시험: 단위+해석기+에뮬레이터+펌웨어 1,064개(1개 건너뜀) 통과, 관련 E2E 7개(`file-drop`·`folder-import`·`copy-to-project`·`definition`·`appearance`) 통과, ESLint 통과, 툴체인 3번 묶음 16개를 로컬 툴체인으로 통과(96초).

## 1.36.0 뒤 오류 탐색 — RTC·DAC 무작위 설정, .ioc 무작위 왕복

2026-11-10. ① RTC·DAC 설정 394개(F446RE·F103RB, 12/24시간·알람 마스크·WakeUp 클록·DAC 트리거/파형/버퍼·TIM6/TIM7·NVIC 조합)를 생성 코드 그대로 해석기에서 2.1초 실행하고 `.ioc`로 내보냈다가 다시 가져왔다. 찾은 오류 3개: 생성된 `TIM6_DAC_IRQHandler`의 `HAL_DAC_IRQHandler`를 해석기가 모르는 함수로 거부, 내보내기가 꺼 둔 NVIC 줄(우선순위만 정한 것)을 버림, F103RB RTC 요일을 내보내지 않음. 고친 뒤 390개 통과, 나머지 4개는 의도한 한도 안내(`RTC WakeUp: 주기가 0.1 ms보다 짧습니다`). 회귀 시험 `tests/interp/probe-regressions.test.js` 2개. ② 칩 전체 무작위 설정(타이머 모드·TRGO·One Pulse·반복 카운터·데드타임, UART 속도·패리티·정지 비트, I2C 속도, SPI 분주·극성·위상·비트 수·순서, ADC 변환 수·트리거, 워치독, GPIO 출력/입력/EXTI의 풀·라벨·초기값·Open Drain·속도, NVIC 켬/끔과 우선순위)을 시드 6개로 4,751개 왕복: 모두 같은 설정으로 돌아오고 경고 없음.

## 1.36.0 .ioc 내보내기, 해석기 C 문법, ESP32 CI 분할 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `1d14d5f` · [Windows CI 42752042601](https://github.com/moonsyu/STM-Simulator/actions/runs/42752042601) 첫 실행에서 모두 성공, 전체 5.0분(300초, 1.35.0은 6.6분, 1.33.0은 8.0분). 작업별: 툴체인 3조각 252·150·228초, E2E 4조각 210·138·186·156초, 단위 210초, 패키지 222초, ESP32 2조각 204·198초(한 작업일 때 349초), 게시 42초. 이제 가장 긴 작업은 툴체인 1번 조각(4.2분)이다. [Release v1.36.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.36.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,632,264바이트, STM-Simulator-1.36.0-Windows-x64.zip 116,723,010바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.35.0 기능 목록 10~13번 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `d5f4237` · [Windows CI 42749262745](https://github.com/moonsyu/STM-Simulator/actions/runs/42749262745) 첫 실행에서 모두 성공, 전체 6.6분(396초, 1.33.0은 8.0분). 작업별: 툴체인 3조각 204·133·143초, E2E 4조각 196·184·151·131초, 단위 199초, 패키지 208초, ESP32 349초(캐시 복원 66초 + 스케치 빌드 234초: 컴파일 캐시를 넣었지만 빌드 시간은 줄지 않았다), 게시 43초. [Release v1.35.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.35.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,625,586바이트, STM-Simulator-1.35.0-Windows-x64.zip 116,715,677바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.34.0 ADC 다채널·트리거, 타이머 TRGO·One Pulse, NRST — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `cb0b445` · [Windows CI 42743352494](https://github.com/moonsyu/STM-Simulator/actions/runs/42743352494) 첫 실행에서 모두 성공. 새 분할 구조의 첫 실행: 툴체인 시험 3조각 283·168·138초, E2E 4조각 152·199·150·178초, 단위 200초, 패키지 222초, ESP32는 캐시를 새로 만드느라 459초(설치 104초 + 빌드 266초 + 캐시 저장 45초), 전체 8.5분(1.33.0은 8.0분, ESP32를 뺀 나머지는 4.7분 안). [Release v1.34.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.34.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,598,298바이트, STM-Simulator-1.34.0-Windows-x64.zip 116,686,344바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.33.0 다시 생성할 때 사용자 코드 유지, TIM1·TIM8 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `540f34a` · [Windows CI 42740747744](https://github.com/moonsyu/STM-Simulator/actions/runs/42740747744) 첫 실행에서 모두 성공(전체 8.0분, 가장 긴 작업은 "ST HAL examples on ARM GCC" 7.2분). [Release v1.33.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.33.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,614,046바이트, STM-Simulator-1.33.0-Windows-x64.zip 116,702,338바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json). 로그인 없는 API의 `releases/latest`는 게시 직후 이전 버전을 돌려줘(캐시) 인증한 요청으로 확인했다.

## 1.32.0 I2C2·SPI2, I2C3·SPI3 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `616ddacff1541b9c231ce57323e398953b913cab` · [Windows CI 42737014075](https://github.com/moonsyu/STM-Simulator/actions/runs/42737014075) 모두 성공. 앞선 실행 [42735529391](https://github.com/moonsyu/STM-Simulator/actions/runs/42735529391)(커밋 70b9414)은 E2E `peripheral-params` 1개 실패로 게시되지 않았다: I2C1 매개변수 선택자가 새 I2C2 카드에도 걸린 시험 쪽 문제였고, 선택자를 인스턴스로 한정해 다시 올렸다(같은 버전, 태그는 처음 만들어짐). [Release v1.32.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.32.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,586,598바이트, STM-Simulator-1.32.0-Windows-x64.zip 116,674,124바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.31.0 IWDG·WWDG — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `1194f3f84e2990064021ef71a81a3ddbdaca934d` · [Windows CI 42733522293](https://github.com/moonsyu/STM-Simulator/actions/runs/42733522293) 첫 실행에서 모두 성공(전체 7.0분). [Release v1.31.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.31.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,638,867바이트, STM-Simulator-1.31.0-Windows-x64.zip 116,725,582바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.30.1 .ioc만 가져올 때 main.c도 생성 — 게시 확인(API)

2026-11-10. 태그·빌드 커밋 `1fab30c65a8f337b027be8f2884b1563188dddc3` · [Windows CI 42729233938](https://github.com/moonsyu/STM-Simulator/actions/runs/42729233938) 첫 실행에서 모두 성공(전체 6.3분). [Release v1.30.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.30.1) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,610,046바이트, STM-Simulator-1.30.1-Windows-x64.zip 116,696,237바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.30.0 DAC (NUCLEO-F446RE) — 게시 확인(API)

2026-11-09. 태그·빌드 커밋 `1b21962058194f659745ce26479933240e130022` · [Windows CI 42585975088](https://github.com/moonsyu/STM-Simulator/actions/runs/42585975088) 첫 실행에서 모두 성공(정적 검사·단위 3.1분, E2E 3묶음 3.5·3.9·2.6분, ST HAL ARM GCC 6.1분, ESP32 5.5분, 패키지 3.6분, 검증한 Release 게시 0.7분 — 전체 6.9분). [Release v1.30.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.30.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,588,565바이트, STM-Simulator-1.30.0-Windows-x64.zip 116,674,856바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.29.0 RTC (두 보드) — 게시 확인(API)

2026-11-09. 태그·빌드 커밋 `bc3155c1e113aca8d5db9c3e2587b838c0c56b87`. [Windows CI 42578874788](https://github.com/moonsyu/STM-Simulator/actions/runs/42578874788): 1차는 GitHub 다운로드 장애(504, "Increased timeouts due to surge in anonymous users")로 ARM GCC·Electron·빌드 도구 받기에서 시험 전에 실패, 2차(실패 작업 재실행)에서 정적 검사·단위, E2E 3/3, ST HAL ARM GCC, ESP32, 패키지가 모두 성공하고 Release가 게시됐으나 공개 다운로드 확인이 4번 재시도 끝에 504로 실패. 이어서 툴체인 캐시 커밋 `5ca7d4f`의 [Windows CI 42580808208](https://github.com/moonsyu/STM-Simulator/actions/runs/42580808208)(같은 버전이라 기존 Release 유지)이 2차 실행에서 모두 성공했고, 그 게시 작업이 v1.29.0의 공개 다운로드·메타데이터 확인을 통과했다(툴체인 설치는 캐시로 0.1분). [Release v1.29.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.29.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,572,888바이트, STM-Simulator-1.29.0-Windows-x64.zip 116,659,597바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.28.2 부품 목록 겹침 — 게시 확인(API)

2026-11-09. 태그·빌드 커밋 `e8a615dbd3c3e93b0f83ab368d8ca4863fa3890e` · [Windows CI 42574403033](https://github.com/moonsyu/STM-Simulator/actions/runs/42574403033) 첫 실행에서 모두 성공(정적 검사·단위 3.2분, E2E 3묶음 3.2·3.3·4.2분, ST HAL ARM GCC 6.3분, ESP32 5.8분, 패키지 4.0분, 검증한 Release 게시 0.7분 — 전체 7.0분). [Release v1.28.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.28.2) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,561,004바이트, STM-Simulator-1.28.2-Windows-x64.zip 116,647,781바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.28.1 ARM GCC 빌드 속도 · CI 분할·재시도 — 게시 확인(API)

2026-11-09. 태그·빌드 커밋 `f165888b9ee39c834a3262d1b1b88f030b589e66` · [Windows CI 42572633464](https://github.com/moonsyu/STM-Simulator/actions/runs/42572633464): 1차는 E2E 1/3이 Electron 다운로드 504(GitHub 장애)로 실패, 2차(실패 작업 재실행) 성공(정적 검사·단위, E2E 3/3, ST HAL ARM GCC 5.1분, ESP32, 패키지, 검증한 Release 게시). [Release v1.28.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.28.1) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,590,919바이트, STM-Simulator-1.28.1-Windows-x64.zip 116,678,154바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json).

## 1.28.0 TIM6/TIM7 기본 타이머 · DS3231 모듈 다리·이름 — 게시 확인(API)

2026-11-09. 태그·빌드 커밋 `4f21d044985ad0e04650e3f885ce25b8a0d1201d` · [Windows CI 42569610685](https://github.com/moonsyu/STM-Simulator/actions/runs/42569610685): 1차는 패키지 작업이 electron-builder의 NSIS 다운로드 504로 실패, 2차(실패 작업 재실행)에서 정적 검사·단위, E2E 2/2, ST HAL ARM GCC, ESP32, 패키지가 모두 성공하고 Release가 게시됐으나 게시 작업 마지막의 공개 다운로드 확인(`verify-release.ps1`)이 GitHub 504로 실패, 3차도 같은 이유로 실패. [Release v1.28.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.28.0)은 API로 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,588,043바이트, STM-Simulator-1.28.0-Windows-x64.zip 116,675,198바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json)를 확인했다. 확인 다운로드 재시도는 1.28.1에 넣었다.

## 1.27.0 TIM Output Compare · Counter Mode · printf float 늘 켬 · DS3231 ZS-042 모듈 — 게시 확인(API)

2026-11-09. 태그·빌드 커밋 `99c13a874bb08a338757c79fec047a79087d633b` · [Windows CI 42546243234](https://github.com/moonsyu/STM-Simulator/actions/runs/42546243234) 성공(정적 검사·단위, E2E 2/2(이 PC에서 클립보드 고장으로 실패한 `copy.e2e` 포함), ST HAL ARM GCC, ESP32 스케치, Windows x64 포터블의 패키지 검사, 검증한 Release 게시) · [Release v1.27.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.27.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,584,735바이트, STM-Simulator-1.27.0-Windows-x64.zip 116,669,920바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json). 로컬 검사는 [작업 로그](WORKLOG.md) 1.27.0 항목.

## 1.26.0 Clock Configuration(클록 트리) · ADC1 Sampling Time — 게시 확인(API)

2026-11-06. 태그·빌드 커밋 `79f13fc18587ba809cb24805ba5ec87b954c9303` · [Windows CI 42201538562](https://github.com/moonsyu/STM-Simulator/actions/runs/42201538562) 성공(정적 검사·단위, E2E 2/2, ST HAL ARM GCC, ESP32 스케치, Windows x64 포터블의 패키지 검사, 검증한 Release 게시) · [Release v1.26.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.26.0) 최신 릴리스, draft/prerelease 아님, 자산 5개(STM-Simulator.exe 115,549,233바이트, STM-Simulator-1.26.0-Windows-x64.zip 116,631,937바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json). 로컬 검사는 [작업 로그](WORKLOG.md) 1.26.0 항목.

## 1.25.0 printf float · it.c 핸들러 중복 · 핀 과전압 · 입력 중 자동완성 · DWARF 4 · FPB-RA6E1 실물 — 게시 확인(API)

2026-11-06. 태그·빌드 커밋 `2f67d3b0080d0eb00b1255aa22e86250bd145817` · [Windows CI 42183657414](https://github.com/moonsyu/STM-Simulator/actions/runs/42183657414) 성공(정적 검사·단위, E2E 2/2, ST HAL ARM GCC, ESP32 스케치, Windows x64 포터블의 패키지 검사, 검증한 Release 게시) · [Release v1.25.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.25.0) 최신 릴리스, 자산 5개(STM-Simulator.exe 115,543,301바이트, STM-Simulator-1.25.0-Windows-x64.zip 116,625,232바이트, SHA256.txt, BUILD-INFO.json, update-manifest.json). 로컬 검사는 [작업 로그](WORKLOG.md) 1.25.0 항목.

## 1.23.0 FSP 원본 색인·J-Link·USART/SPI 설정 — 게시 확인(API)

2026-11-06. 태그·빌드 커밋 `8685030d86b411b40791fbfbbe7656aea81d5cdf` · [Windows CI 42160908541](https://github.com/moonsyu/STM-Simulator/actions/runs/42160908541) 성공 · [Release v1.23.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.23.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.23.0-Windows-x64.zip, STM-Simulator.exe 115,566,524 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 검사: ESLint 0건, 단위 936개 중 935개 통과·1개 건너뜀, 툴체인 278개 중 277개 통과·1개 건너뜀, 패키지 검사 3개 통과, E2E 71개 중 69개 통과·1개 건너뜀·1개 실패 — 실패는 `copy.e2e` Ctrl+C 복사로, 이 PC의 Windows 클립보드를 다른 프로세스가 잡고 있어(PowerShell Set-Clipboard도 "Requested Clipboard operation did not succeed") 생긴 환경 문제다. 복사 코드는 1.22.0 이후 바뀌지 않았고 CI E2E에서 통과했다. `8685030`까지만 푸시했다(TIM·I2C 커밋 제외).

## 1.22.0 FPB-RA6E1 주변장치·Clocks·Stacks — 게시 확인(API)

2026-11-06. 태그·빌드 커밋 `dd697629fdb678e6fe08ea6257c979e7dc9f0b2c` · [Windows CI 42154435131](https://github.com/moonsyu/STM-Simulator/actions/runs/42154435131) 성공 · [Release v1.22.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.22.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.22.0-Windows-x64.zip, STM-Simulator.exe 115,530,343 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 검사: ESLint 0건, 단위·해석기·에뮬레이터 928개 중 927개 통과·1개 건너뜀, E2E 68개 중 67개 통과·1개 건너뜀(RA E2E 7개 포함), 패키지 검사 3개 통과(산출물 삭제). 그 뒤의 로컬 커밋(FSP 원본 색인, J-Link)은 이 Release에 들어가지 않도록 `dd69762`까지만 푸시했다.

## 1.21.0 ADC1 Continuous Conversion Mode — 게시 확인(API)

2026-11-06. 태그·빌드 커밋 `b9ef3e969140580273722e749b13afaa674d9b4e` · [Windows CI 42147456223](https://github.com/moonsyu/STM-Simulator/actions/runs/42147456223) 성공 · [Release v1.21.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.21.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.21.0-Windows-x64.zip, STM-Simulator.exe 115,507,852 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 검사: ESLint 0건, 단위·해석기·에뮬레이터 913개 중 912개 통과·1개 건너뜀, E2E 63개 중 62개 통과·1개 건너뜀, 패키지 검사 3개 통과(산출물 삭제).

## 1.20.0 Renesas FPB-RA6E1 — 게시 확인(API)

2026-11-06. 태그·빌드 커밋 `9fb884ea2ccab7e3b05435aeeebc33b0eba82977` · [Windows CI 42145714843](https://github.com/moonsyu/STM-Simulator/actions/runs/42145714843) 성공(툴체인 액션이 앱 설치기로 FSP를 받고 RA 빌드 시험 포함) · [Release v1.20.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.20.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.20.0-Windows-x64.zip, STM-Simulator.exe 115,506,868 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 911개 중 910개 통과·1개 건너뜀, RA 툴체인 2개 통과, E2E 62개 중 61개 통과·1개 건너뜀, ESLint 0건.

## 1.19.0 변수 그래프 (STM Studio 방식) — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `d2f7b0f0dd2f288d395f0fd40c266724ad316257` · [Windows CI 41998317827](https://github.com/moonsyu/STM-Simulator/actions/runs/41998317827) 성공 · [Release v1.19.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.19.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.19.0-Windows-x64.zip, STM-Simulator.exe 115,468,584 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 903개 중 902개 통과·1개 건너뜀, E2E 60개 중 59개 통과·1개 건너뜀(새 `variable-graph.e2e` 2개: 해석 실행 카운터, adc_dma ELF), ESLint 0건. 다크 모드 화면 캡처로 그래프가 패널 높이에 맞게 보이는지 확인했다.

## 1.18.3 보드 구성 초기화가 main.c도 초기화 — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `853bf22ed26d3b861b680f3ef47bc32d5d9c1f6c` · [Windows CI 41995236579](https://github.com/moonsyu/STM-Simulator/actions/runs/41995236579) 성공 · [Release v1.18.3](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.18.3) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.18.3-Windows-x64.zip, STM-Simulator.exe 115,465,947 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 896개 중 895개 통과·1개 건너뜀, E2E 58개 중 57개 통과·1개 건너뜀(새 `board-reset.e2e`), ESLint 0건.

## 1.18.2 SDK 이름 자동완성 — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `06dee04deca5ca049b4e1c7756cc0a36cbddfb0f` · [Windows CI 41975694054](https://github.com/moonsyu/STM-Simulator/actions/runs/41975694054) 성공(약 5분, 작업 7개 모두 성공) · [Release v1.18.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.18.2) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.18.2-Windows-x64.zip, STM-Simulator.exe 115,511,505 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 893개 중 892개 통과·1개 건너뜀, E2E 57개 중 56개 통과·1개 건너뜀, ESLint 0건.

## 1.18.1 패널 글자 복사 · 빌드 탭 자동 이동 제거 — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `58b6db9df4b8390787b1cda66ffe54a69f2782c4` · [Windows CI 41970500468](https://github.com/moonsyu/STM-Simulator/actions/runs/41970500468) 성공(약 6분, 작업 7개 모두 성공) · [Release v1.18.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.18.1) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.18.1-Windows-x64.zip, STM-Simulator.exe 115,466,014 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 893개 중 892개 통과·1개 건너뜀, E2E 57개 중 56개 통과·1개 건너뜀, ESLint 0건.

## 1.18.0 System Core › SYS — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `72cf80e16b848bc53bd21731c7ca42444255898d` · [Windows CI 41967635975](https://github.com/moonsyu/STM-Simulator/actions/runs/41967635975) 성공(약 6분, 작업 7개 모두 성공) · [Release v1.18.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.18.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.18.0-Windows-x64.zip, STM-Simulator.exe 115,460,987 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 893개 중 892개 통과·1개 건너뜀, E2E 55개 중 54개 통과·1개 건너뜀, ESLint 0건.

## 1.17.1 빌드 파일 읽기 전용 보기 — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `006e74fef0d4bbd9972ee79a3da61d9e4e6d7766` · [Windows CI 41965602109](https://github.com/moonsyu/STM-Simulator/actions/runs/41965602109) 성공(약 7분, 작업 7개 모두 성공) · [Release v1.17.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.17.1) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.17.1-Windows-x64.zip, STM-Simulator.exe 115,470,023 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 893개 중 892개 통과·1개 건너뜀, ARM GCC toolchain 273개 중 272개 통과·1개 건너뜀, E2E 55개 중 54개 통과·1개 건너뜀, ESLint 0건.

## 1.17.0 정의로 이동(Ctrl+클릭·F12)과 코드 개요 — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `6ac4aa66235f17fdd13e3e0001a03e7e48744a6c` · [Windows CI 41959142579](https://github.com/moonsyu/STM-Simulator/actions/runs/41959142579) 성공(약 7분, 작업 7개 모두 성공) · [Release v1.17.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.17.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.17.0-Windows-x64.zip, STM-Simulator.exe 115,446,687 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사 3개 통과(산출물 삭제). 로컬 검사: 단위·해석기·에뮬레이터 891개 중 890개 통과·1개 건너뜀, E2E 55개 중 54개 통과·1개 건너뜀, ESLint 0건.

## 1.16.0 CubeMX식 NVIC·GPIO·핀 클릭 메뉴 — 게시 확인(API)

2026-11-05. 태그·빌드 커밋 `96c0a87aff263e6a919603e275f3c25e1c0fa991` · [Windows CI 41954088996](https://github.com/moonsyu/STM-Simulator/actions/runs/41954088996) 성공(약 7분, 작업 7개 모두 성공: Windows x64 portable, 정적 검사·단위, E2E 1/2·2/2, ESP32 스케치, ST HAL 예제 ARM GCC·에뮬레이터, Release 게시) · [Release v1.16.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.16.0) latest, draft/prerelease 아님, 자산 5개(BUILD-INFO.json, SHA256.txt, STM-Simulator-1.16.0-Windows-x64.zip, STM-Simulator.exe 115,458,587 B, update-manifest.json). 파일은 내려받지 않고 API로만 확인했다. 푸시 전 로컬 패키지 검사(`tests/release/packaged.test.mjs`) 3개 통과, 빌드 산출물은 지웠다. 로컬 검사: 단위·해석기·에뮬레이터·펌웨어 888개 중 887개 통과·1개 건너뜀, E2E 51개 통과·3개 건너뜀, ESLint 0건.

## 1.15.0 UART 인터럽트와 IRQ 핸들러 자동 작성 — 게시 확인(API)

2026-11-04. 태그·빌드 커밋 `cc22f0d5b058a5b76758c598c7c8a764852ae145` · [Windows CI 41810410084](https://github.com/moonsyu/STM-Simulator/actions/runs/41810410084) · [Release v1.15.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.15.0). 로컬: 단위 882개 중 881개 통과·1개 건너뜀, ESLint 0건, E2E 53개 중 51개 통과·2개 건너뜀(다른 창 뒤에 띄운 다크 모드 창), 모든 HAL 예제 ARM GCC 빌드·에뮬레이터 실행 269개 통과(F446RE·F103RB), 패키지 검사 3개 통과(npm으로 빌드).
CI 1차: 검사·빌드 작업은 모두 성공했지만 게시 단계에서 `gh release upload`가 5개 중 SHA256.txt를 올리지 않은 채 종료 코드 0으로 끝나 Release가 자산 4개로 공개됐고, 이어진 `verify-release.ps1`이 "Release asset set differs"로 실패했다. 조치: GitHub가 자산마다 기록한 SHA-256(`digest`)으로 CI와 같은 형식의 SHA256.txt를 만들고(EXE 해시가 update-manifest.json의 sha256·크기와 일치함을 확인), 같은 Release에 올렸다(코드·다른 자산은 그대로). 실패한 게시 작업만 다시 실행(2차)해 `verify-release.ps1`이 공개 다운로드·체크섬·ZIP 내부 EXE까지 확인하고 성공했다. GitHub API로 latest v1.15.0과 자산 5개 확인(이 PC에는 다운로드 없음).

## 1.14.2 닫힌 실행 대상 메뉴 표시 — 게시 확인(API)

2026-11-04. 태그·빌드 커밋 `14ffe78cd6c595202217428cbd3f9935f602200f` · [Windows CI 41793294755](https://github.com/moonsyu/STM-Simulator/actions/runs/41793294755) 성공(7분) · [Release v1.14.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.14.2). 로컬: 단위 880개 중 879개 통과·1개 건너뜀, ESLint 0건, E2E 52개 중 50개 통과·2개 건너뜀(다른 창 뒤에 띄운 다크 모드 창), 패키지 검사 3개 통과(npm으로 빌드). GitHub API로 latest v1.14.2와 자산 5개 확인(다운로드 없음).

## 1.14.1 실행 대상 메뉴 더블클릭 · 병렬 CI 첫 실행 — 게시 확인(API)

2026-11-04. 태그·빌드 커밋 `5abb219bac29e151972c138108fb731c31402d85` · [Windows CI 41784815352](https://github.com/moonsyu/STM-Simulator/actions/runs/41784815352) 성공 · [Release v1.14.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.14.1). 병렬 CI 첫 실행이 9분에 끝났다(이전 구조 약 32분): 정적 검사·단위 3분, 포터블 패키징 4분, ST HAL 예제 4분, ESP32 스케치 7분(캐시가 비어 처음 설치), E2E 묶음 6분·8분, 게시 1분. 로컬: 패키지 검사 3개 통과(npm으로 빌드, 창 숨김), help E2E 통과. GitHub API로 latest v1.14.1과 자산 5개 확인(다운로드 없음).

## 1.14.0 시뮬레이터 ARM GCC 빌드 — 게시 확인(API)

2026-11-04. 태그·빌드 커밋 `b744bdab2ca8efa5da16eb477a275e11d4fa2dd8` · [Windows CI 41774956368](https://github.com/moonsyu/STM-Simulator/actions/runs/41774956368) 성공(빌드·Release 게시) · [Release v1.14.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.14.0). 첫 CI 41771623731은 패키지 검사에서 실패해 게시되지 않았다(태그 없음). 사용자 지시로 게시된 파일은 내려받지 않고 GitHub API로 latest v1.14.0과 자산 5개(EXE, ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json)만 확인했다. 파일 검사는 CI의 패키지 검사와 게시 단계 검증이 했다.

## 1.13.2 시뮬레이터 sprintf·snprintf · 빌드 실패 첫 오류 — 공개 배포 검증 완료

2026-11-04. 제품 커밋 `322ac0f1525645c19fa730994a7a9cb2b583cde7` · [Windows CI 41766819500](https://github.com/moonsyu/STM-Simulator/actions/runs/41766819500) · [Release v1.13.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.13.2). 로컬: `npm test` 880개 중 879개 통과·1개 건너뜀, ESLint 0건, 이 PC의 ARM GCC로 빌드 실패 메시지 확인. CI 전체 성공. 공개 다운로드: latest v1.13.2(자산 5개), 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `25faec39e908b6d4c13e84ed2ee7578c4f155abe744b9573b076be92bc59c2a7`(115,489,909 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `72c8a7fb5cc5797a962cd4ffc3c212712c68d3b910a4ccb46473bb50a808a5cb`.

## 1.13.1 자동 완성 목록 색 대비 — 공개 배포 검증 완료

2026-11-04. 태그·빌드 커밋 `504cef1fede7badc32731bc0ef0f522188801e14`(제품 수정 `1037d3d`, 1.13.0 검증 기록 포함) · [Windows CI 41762728719](https://github.com/moonsyu/STM-Simulator/actions/runs/41762728719) · [Release v1.13.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.13.1). 로컬: `npm test` 877개 중 876개 통과·1개 건너뜀, 화면 밖 다크 창에서 자동 완성 목록 캡처 확인. CI 전체 성공. 공개 다운로드: latest v1.13.1(자산 5개), 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `06652c55e80c8ad3dc62b9bc7c54b6817ceb383f4b5b2192f42df4948ee51e93`(115,437,302 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `f11ad4b9689b5d9cc48806643cde87258435d9a4201acd044462aed3c6bf5243`.

## 1.13.0 NUCLEO-64 회로도 기본 연결 · 실행 대상 메뉴 · USER CODE 유지 · 업데이트 로그 — 공개 배포 검증 완료

2026-11-04. 제품 커밋 `5cc758f6779c3d4c22586e001fc3ded40c1a9895` · [Windows CI 41759860734](https://github.com/moonsyu/STM-Simulator/actions/runs/41759860734) · [Release v1.13.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.13.0). 로컬: ESLint 0건, `npm test` 875개 중 874개 통과·1개 건너뜀, E2E(숨긴 다크 창) 50개 중 48개 통과·2개 건너뜀(ARM 도구 필요). CI 전체 성공. 공개 다운로드: latest v1.13.0(자산 5개), 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `6ccab85a457bc7aa3b2f1349e865befab3c41d6c5591255582c6d9dc4a7e509a`(115,488,210 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `44da38766edfdb320c0a9e1891ab6c5fe07f9a200dce24eb786f99acce8a233b`.

## 1.12.3 실행 대상 메뉴 · 실물 보드 자동 선택 · Release 기본 — 공개 배포 검증 완료

2026-11-04. 제품 커밋 `e8cd91e`, 태그·빌드 커밋 `5cef82d561a6573c57eb85d0d8516bafed0581ae`(1.12.2 검증 기록 포함) · [Windows CI 41751584447](https://github.com/moonsyu/STM-Simulator/actions/runs/41751584447) · [Release v1.12.3](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.12.3). 로컬: ESLint 0건, `npm test` 865개 중 864개 통과·1개 건너뜀, E2E 47개 중 45개 통과·2개 건너뜀. CI 전체 성공(Windows 빌드, Release 게시·검증). 공개 다운로드: latest v1.12.3(자산 5개), 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `92471fd742cec3c7c31237fbd6ef7ff60b42c90e6ee35903cef7e0de5cb5597e`(115,445,872 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `d3486b8b9c445a0869f428cdfff23d45a95d270bfb87fd92b5427e00df415f81`.

## 1.12.2 보드 기록 실패 안내 — 공개 배포 검증 완료

2026-11-04. 제품 커밋 `42dc86b9eb7d9beb06ca03a8e4bd97b92d56da79` · [Windows CI 41748524331](https://github.com/moonsyu/STM-Simulator/actions/runs/41748524331) · [Release v1.12.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.12.2). 로컬: 이 PC의 드라이버 없는 ST-LINK로 OpenOCD 오류를 재현해 안내가 붙는 것을 확인, ESLint 0건, `npm test` 865개 중 864개 통과·1개 건너뜀. CI 전체 성공. 공개 다운로드: 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `a350752c3776f32d5d592c309f2f7e8599a359e507333b7267ff68aa98835d0d`(115,432,470 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `18a3b176980f004a10246cff57891710131f74578cd6e9c820c3c19673760b8f`, 그 시점 latest v1.12.2.

## 1.12.1 예제 목록 한 줄 · 예제 코드 4칸 · ESLint 10.14.0 — 공개 배포 검증 완료

2026-11-04. 제품 커밋 `6d6314d3a567ba3993e8c0f0bb33d17eb9e86961` · [Windows CI 41604986513](https://github.com/moonsyu/STM-Simulator/actions/runs/41604986513) · [Release v1.12.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.12.1). 로컬: ESLint 0건, `npm test` 863개 중 862개 통과·1개 건너뜀, E2E 46개 중 44개 통과·2개 건너뜀. CI 전체 성공. 공개 다운로드: latest v1.12.1, 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `d6f700034da6489d56759e50a647a3f64118179eb08caef2495006c2768d6985`(115,431,793 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `2eeb4b779fce58a95f0d4a2291c1a64dad1d7757fd677feb314487584c14eeb1`. Dependabot PR #4는 같은 변경이 main에 들어가 자동으로 닫혔다.

## 1.12.0 정적 검사 · ESP32 실제 빌드 · 에뮬레이터 I²C/SPI · 라즈베리파이 Python · 인터넷 · 성능 · 구조 정리 — 공개 배포 검증 완료

2026-11-03. 제품 커밋 `d01ae2a9d7aa05c6abf228add8d0a0749b00e27c` · [Windows CI 41596047403](https://github.com/moonsyu/STM-Simulator/actions/runs/41596047403) · [Release v1.12.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.12.0). 로컬(임시 복제본, Node 24.22.1, Electron 45.2.1): `npm test` 863개 중 862개 통과·1개 건너뜀, ESLint 오류 0, E2E 46개 중 44개 통과·2개 건너뜀(F4 도구 필요), 이 PC의 ARM GCC·STM32CubeF1로 빌드한 WIRE-01·02 두 보드 에뮬레이터 실행 통과. CI: 정적 검사, 단위 검사, ST HAL 예제 빌드·에뮬레이터 실행(보드 간 I²C·SPI 포함), Arduino CLI 1.5.1·esp32 3.3.12로 예제 ESP32 스케치 8개 빌드, E2E, 패키징·Release 검증 모두 성공. 공개 다운로드: latest v1.12.0, 태그·BUILD-INFO 커밋 일치(작성자 naver), sourceDirty false, `STM-Simulator.exe` SHA-256 `470f2113cb20e28b0d77d43e262405a0b6035a56c0f8b350aef5168d0b599f79`(115,432,299 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `2a06d81ad66588c5bdaf78545db6fd81bc0dd188cd6f9fed5e38b36f1a21a489`, ZIP에 LICENSE 포함.

## 1.11.1 커밋 작성자 정정 뒤 다시 게시 — 공개 배포 검증 완료

2026-11-03. 제품 커밋 `fbfaa0b2c6b064850ee5b449a124e0b6c8f5c376`(작성자·커미터 `moonsyu <anstn0104@naver.com>`) · [Windows CI 41582690804](https://github.com/moonsyu/STM-Simulator/actions/runs/41582690804) · [Release v1.11.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.11.1). 기능 변경 없음(1.11.0과 같은 앱 코드, Release 검증 스크립트·문서만 변경). CI는 Windows 빌드와 Release 게시·검증 모두 성공. 공개 다운로드: latest v1.11.1, 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `1ef9210cb6dc23b5de60fd8a374e2d38695b3bf9d25b2413c6c8257297c610e4`(115,406,602 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `116d271fe23741afd1d8474fd6d051f323b858363b31fd9a9422a280006a05ce`. 이력 정정 뒤 기존 v1.11.0 Release 검증도 [CI 41576913739](https://github.com/moonsyu/STM-Simulator/actions/runs/41576913739)에서 트리 비교로 통과했다.

## 1.11.0 보드 간 유선 통신 · 무선 확장 · 업데이트 점검 반영 — 공개 배포 검증 완료

2026-11-03. 제품 커밋 `f091c744462f05cc4dae202212f135626c86b910` · [Windows CI 41566899457](https://github.com/moonsyu/STM-Simulator/actions/runs/41566899457) · [Release v1.11.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.11.0). 로컬(임시 복제본, Node 24.22.1, Electron 45.2.1): `npm test` 843개 중 842개 통과·1개 건너뜀, E2E 45개 중 43개 통과·2개 건너뜀(ARM GCC 필요), `npm audit` 0건. CI는 전체 검사와 ARM GCC 빌드(WIRE-01·WIRE-02 두 보드 포함)를 통과했다. 공개 다운로드: latest v1.11.0, 태그·BUILD-INFO 커밋 일치, sourceDirty false, `STM-Simulator.exe` SHA-256 `97e782d2ce7849e63a01f2b1e3dfd3d34846f71fa9bb2d53875d08e4ee27a066`(115,401,831 B, MZ)가 SHA256.txt·update-manifest.json·ZIP 안 EXE와 같음, ZIP SHA-256 `8889f4ee87ff6e840a70635ffe492b1e40af82ad9474a0d970c93db257c968cf`. 확인하지 못한 것: ESP32 무선 스케치의 실제 esp32 코어 빌드(이 PC에 Arduino CLI 없음), 실물 모듈·실물 보드 두 대.

## 1.10.0 블루투스·Wi-Fi 모듈 · 보드 간 통신 예제 — 공개 배포 검증 완료

2026-11-02. 제품 커밋 `9bae2a038fb578a31a4a3736a23dcc0c4816bd79` · [Windows CI 41394150711](https://github.com/moonsyu/STM-Simulator/actions/runs/41394150711) · [Release v1.10.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.10.0). 로컬(임시 복제본): `npm test` 818개 중 815 통과, 1 건너뜀, 실패 2는 로컬 symlink 권한. E2E(devboards·docs·stm32-boards) 11 통과. 통신은 시뮬레이터 모델 기준이며 실물 HC-05·HC-06·ESP-01로 시험하지 않았다. CI에서 예제 전체와 BT-01·BT-02·WF-01의 각 STM32 보드 코드를 ST HAL로 빌드해 에뮬레이터에서 실행했다. latest=v1.10.0, 태그·BUILD-INFO 커밋 `9bae2a0` 일치(sourceDirty false), 5자산. EXE SHA-256 `3fd91d7fbd674312e3227619f54d14f267c94b50d6d55399a0999b23a7f976ca`(105,377,218 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `ab82800aeb37ad4981e12ad828490c1bfc683fdd4a103970f4c9237e0e36154d`.

## 1.9.2 배선이 연결된 핀의 GPIO 툴팁 · GPIO19 설명 — 공개 배포 검증 완료

2026-11-02. 제품 커밋 `0abe726791ac8a689916cfbb6092b672b75c2343` · [Windows CI 41390167913](https://github.com/moonsyu/STM-Simulator/actions/runs/41390167913) · [Release v1.9.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.9.2). 첫 CI 41371711706(`b3dc7b0`)은 새 보안 권고로 `npm audit`에서 멈췄고 태그·Release는 만들어지지 않았다(작업 로그 참고). latest=v1.9.2, 태그·BUILD-INFO 커밋 `0abe726` 일치(sourceDirty false), 5자산. EXE SHA-256 `7d97e372569cba34beb46033a32eb2b06a3317b2aa4bc0516d564822a24c3490`(105,290,980 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `4ce9e89dbb197b8a01a3abf5e9334b64d33743092ab10db0f18ce3c83e6a8085`.

## 1.9.1 ESP32 BOOT 버튼 업로드 확인 · 다운로드 모드 재부팅 안내 — 공개 배포 검증 완료

2026-10-29. 제품 커밋 `aff737cdb897596540f5bea4d62c3bc9fddbdd1c` · [Windows CI 40787566446](https://github.com/moonsyu/STM-Simulator/actions/runs/40787566446) · [Release v1.9.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.9.1). 실물 ESP32 DevKit WROOM-32(COM4): BOOT를 누른 채 `runSketch` 업로드 성공(ESP32-D0WD-V3, 쓰기·해시 검증), BOOT를 뗀 뒤 리셋하면 `boot:0x13`으로 부팅해 `LED ON`/`LED OFF` 출력. 리셋 때 BOOT가 눌려 있으면 `waiting for download` → 새 안내(단위 검사). `tests/unit/desktop.test.js` 64 통과(로컬 권한 2 제외). latest=v1.9.1, 태그·BUILD-INFO 커밋 `aff737c` 일치(sourceDirty false), 5자산. EXE SHA-256 `11a4565f7f823f02411ab6e98f49c055253493b9b21482eba866b419d6ab059e`(105,290,730 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `937b323b2d5164421c956b4f569f7b1d8a6c1d7714adc87fe4ff33b3573facf6`.

## 1.9.0 ESP32 실물 빌드·업로드 — 공개 배포 검증 완료

2026-10-28. 제품 커밋 `ac0811f33e7ed8ce9d151ba0bc4f0f635bb602e0` · [Windows CI 40699084907](https://github.com/moonsyu/STM-Simulator/actions/runs/40699084907) · [Release v1.9.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.9.0). 실물 ESP32 DevKit WROOM-32(CP210x COM4): 앱 실행 대상에 `ESP32 (COM4)` 표시, FW-08 Arduino CLI 빌드 성공, 업로드는 보드가 자동으로 다운로드 모드에 들어가지 않아 BOOT 안내와 함께 실패(BOOT 버튼 업로드는 미확인), 직렬 모니터 부팅 출력 수신. 예제 ESP32 스케치 실제 컴파일 FW-08·FW-09·템플릿 성공, IOT-01은 DHT sensor library 없음 안내. `npm test` 796 통과(로컬 권한 2 제외), E2E 37 통과·2 건너뜀. latest=v1.9.0, BUILD-INFO 커밋 `ac0811f` 일치(sourceDirty false), 5자산. EXE SHA-256 `3b4abca6c434bd97378a6899cb8233b6dce0745be3e7dd6b94a6cddcd250cb66`(105,289,366 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `3cf3bb84adbe365cfe4fa865630ca7b3ab6e826a97136b4313b5d89c41116a9c`.

## 1.8.1 실물 보드 확인 · 디버그 시작 상태 · 빌드 경고 — 공개 배포 검증 완료

2026-10-28. 제품 커밋 `19730c9192e1c7d2ca2723a9b25b9f78afcceadd` · [Windows CI 40668107370](https://github.com/moonsyu/STM-Simulator/actions/runs/40668107370) · [Release v1.8.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.8.1). 실물: NUCLEO-F103RB·F446RE 빌드·기록·실행(USART2 인사·에코), 두 보드 동시 기록, GDB 디버그, 앱 화면 Ctrl+F5. 이 PC 도구로 HAL 예제 254/254 실제 빌드 + 에뮬레이터, 에뮬레이터 E2E 6/6. `npm test` 790 통과(로컬 권한 2 제외). latest=v1.8.1, 태그·BUILD-INFO 커밋 `19730c9` 일치(sourceDirty false), 5자산. EXE SHA-256 `381bbbae5bd62b346b1055f7e0d37891f5c7213075fa2d511cea728170d90159`(105,284,294 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `8f46f434611880e70b78373f46fe709c8de7f698933cd9f5ee7ed6ada683badb`.

## 1.8.0 강의 예제 정리·과제·PWM LED 밝기·예제 분류 — 공개 배포 검증 완료

2026-10-28. 제품 커밋 `ab104cdfaae9db90e694357aad85af17fdb9d91e` · [Windows CI 40658246506](https://github.com/moonsyu/STM-Simulator/actions/runs/40658246506) · [Release v1.8.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.8.0). `npm test` 789 통과(로컬 권한 2 제외), E2E 36 통과·2 건너뜀. latest=v1.8.0, 태그·BUILD-INFO 커밋 `ab104cd` 일치(sourceDirty false), 5자산. EXE SHA-256 `ab340057227205e342a75c79b062e3f10cf04efa430db5f25269f84871df77c8`(105,285,069 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `558ce7356843a0958572e5a8bbd23d20d92d3b2c05f336a84ff0bbd58ee9a348`.

## 1.7.0 STM32 보드 여러 개 — 공개 배포 검증 완료

2026-10-28. 제품 커밋 `575d5b97ae4a338b8f0771a2624b591c1a3bd5ea` · [Windows CI 40640636808](https://github.com/moonsyu/STM-Simulator/actions/runs/40640636808) · [Release v1.7.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.7.0). `npm test` 782 통과(로컬 권한 2 제외), E2E 35 통과·2 건너뜀. latest=v1.7.0, 태그·BUILD-INFO 커밋 `575d5b9` 일치(sourceDirty false), 5자산. EXE SHA-256 `b73ccb00b688844b83f1acc7805af1194a7ecbf6f680c1cb02304b21512ccdb2`(105,277,927 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `5a788aad33d71e3eccbf3cb9c3c8a4005330e19e58ec1b3703e19c20725ddd4a`. 실물 보드 여러 개에 차례로 기록하는 것은 실물로 확인하지 않았다(ST-LINK 배정은 단위 검사).

## 1.6.0 ESP32 스케치 실행 — 공개 배포 검증 완료

2026-10-28. 제품 커밋 `c161e4b0ebd0dbad7cf41edb404cb3fae5e6a165` · [Windows CI 40626563602](https://github.com/moonsyu/STM-Simulator/actions/runs/40626563602) · [Release v1.6.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.6.0). `npm test` 769 통과(로컬 권한 2 제외), E2E 34 통과·2 건너뜀. latest=v1.6.0, 태그·BUILD-INFO 커밋 `c161e4b` 일치(sourceDirty false), 5자산. EXE SHA-256 `cb7dfe9140a63718eefcab813058e3258f71d6ab4e1ca095c1f1e167a55ebc08`(105,268,130 B)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `2e8a95e0613ae7619689ee11503f5be03c384015bc2d9796cbf91c0f42ef9ab6`.

## 1.5.0 ESP32·라즈베리파이 보드 · 고정 실행 · 강의 실습 예제 — 공개 배포 검증 완료

2026-10-28. 제품 커밋 `f837b65cfbb0cb41c52957c7d3e489f9638e6563` · [Windows CI 40625048107](https://github.com/moonsyu/STM-Simulator/actions/runs/40625048107) · [Release v1.5.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.5.0). `npm test` 766 통과(로컬 권한 2 제외), E2E 33 통과·2 건너뜀. latest=v1.5.0, 태그·BUILD-INFO 커밋 `f837b65` 일치(sourceDirty false), 5자산. EXE SHA-256 `4bbaa4bbe77dc7f941a8b9c3d84e5666eb63c4dbcd21340834fd85883b260386`(105,267,515 B)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `2f1566a0fe2e75c7a49f6143dec01d7b18d774eac4303cd108fea1fffb62b000`.

## 1.4.2 나사 단자·커넥터 직접 배선 — 공개 배포 검증 완료

2026-10-27. 제품 커밋 `373c1c7b89647fb099911db7b458f32b78e1a787` · [Windows CI 40454210495](https://github.com/moonsyu/STM-Simulator/actions/runs/40454210495) · [Release v1.4.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.4.2). `npm test` 748 통과(로컬 권한 2 제외), E2E 30 통과·2 건너뜀. latest=v1.4.2, 태그·BUILD-INFO 커밋 `373c1c7` 일치, 5자산. EXE SHA-256 `64a65f9372f3a28c32fa0cfbc6e1b60731adfc187131248b9a436a12ca939134`(105,225,806 B)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `47f4e6a3e9274a3e8850be7a102b15a928e4f4cceb0b9b6216fcab351a56c25d`.

## 1.4.1 모듈 핀을 사진의 단자 자리로 — 공개 배포 검증 완료

2026-10-27. 제품 커밋 `907f6934069089d8e462d202057a7362080f69a3` · [Windows CI 40450446966](https://github.com/moonsyu/STM-Simulator/actions/runs/40450446966) · [Release v1.4.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.4.1). `npm test` 747 통과(로컬 권한 2 제외), E2E 30 통과·2 건너뜀. latest=v1.4.1, 태그·BUILD-INFO 커밋 `907f693` 일치, 5자산. EXE SHA-256 `4fa9e35432a3c5eb1709da5c43ac4876d354bf1a9c0076e5c5dfec08368f5990`(105,226,473 B)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `d6996f8655a06454957ec010973725dcee45fe7bfe215a1571b1dc54e8fd513a`.

## 1.4.0 부품 설명 · 중복 정리 · 실물 예제 · 핀 재배치 — 공개 배포 검증 완료

2026-10-27. 제품 커밋 `d7085b7e6391cfc0e6abe5e9a3c7319196db8ca9` · [Windows CI 40443202131](https://github.com/moonsyu/STM-Simulator/actions/runs/40443202131) · [Release v1.4.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.4.0). `npm test` 747 통과(로컬 권한 2 제외), E2E 30 통과·2 건너뜀. latest=v1.4.0, 태그·BUILD-INFO 커밋 `d7085b7` 일치, 5자산. EXE SHA-256 `8c664793fa6baf13d7f9d6b08b574c70106623a6e190794790fadd7a757f0268`(105,224,629 B)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `e76d62e503b8b08cbdf23a2cfc18dd38ad441ab96fa40d27feaac75538f8380e`.

## 1.3.3 짧은 다리 · LED 옅은 렌즈 · 6 mm 버튼 · 보드 초기화 수정 — 공개 배포 검증 완료

2026-10-27. 제품 커밋 `75c12a224ef982460badb723027b971824f27e83` · [Windows CI 40422853429](https://github.com/moonsyu/STM-Simulator/actions/runs/40422853429) · [Release v1.3.3](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.3.3). `npm test` 746 통과(로컬 권한 2 제외), E2E 30 통과·2 건너뜀. latest=v1.3.3, 태그·BUILD-INFO 커밋 `75c12a2` 일치, 5자산. EXE SHA-256 `c1da11756aae97cca741e473daf6aabeca270ac1d2eda0c623dfd641c9ff8a7c`(105,213,450 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `3a0bf067a37eba7b08f2267b4df67de8761aa8d494c2afd4feaf93a200bdc795`.

## 1.3.2 LED 3칸 — 공개 배포 검증 완료

2026-10-27. 제품 커밋 `e8df2838c94b4d8f26b1e7a0c1723c3c939aa780` · [Windows CI 40413600270](https://github.com/moonsyu/STM-Simulator/actions/runs/40413600270) · [Release v1.3.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.3.2). `npm test` 745 통과(로컬 권한 2 제외), E2E 30 통과·2 건너뜀. latest=v1.3.2, 태그·BUILD-INFO 커밋 `e8df283` 일치, 5자산. EXE SHA-256 `7d4fabcf49b36d1a733041db4a2e4962fa8e74db0cedae69ffcd32f3d501d761`(105,189,818 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `10dc1d2a3ed4272133ad5f82523bce3bcc6a87cc3b73167c319e67e1292fc2b2`.

## 1.3.1 LED 색별 사진 — 공개 배포 검증 완료

2026-10-27. 제품 커밋 `4a12805960aa81f5bcdf4ba1df21c4398ad58eb3` · [Windows CI 40411298266](https://github.com/moonsyu/STM-Simulator/actions/runs/40411298266) · [Release v1.3.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.3.1). `npm test` 744 통과(로컬 권한 2 제외), workflow·docs E2E 11 통과. latest=v1.3.1, 태그·BUILD-INFO 커밋 `4a12805` 일치, 5자산. EXE SHA-256 `e3206602f99682a4b7141e5be63a94c96c2e5f7d9bc4573ec19afe4068bb2747`(105,188,045 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `ca03bcc079766f8916b14f9101ee6ab5047aeed595b78f75f5ba98b904aa6d20`.

## 1.3.0 실제 크기 보드·빵판 · 부품 사진 · 시작 보드 F103RB — 공개 배포 검증 완료

2026-10-27. 제품 커밋 `69dfd29708430816f3875dbd0cfb49d16a4f9999` · [Windows CI 40347506426](https://github.com/moonsyu/STM-Simulator/actions/runs/40347506426) · [Release v1.3.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.3.0)

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 743 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 `part-art.test.js`: 78종 사진(WebP)·비율 유지·외곽 안 맞춤·패드가 핀 줄과 일직선 |
| `npm run test:e2e` (로컬) | 30 통과, 2 건너뜀 |
| 예제 배선 | 127개, 전체 길이 242,624, 교차 33, 겹침 0 |
| 로컬 패키지 | `npm run build`·`build:artifact` 검증 통과 |
| 공개 자산 | latest=v1.3.0(릴리스 페이지 이동), 태그(`git ls-remote`)·BUILD-INFO 커밋 `69dfd29` 일치, 5자산. EXE SHA-256 `2d2a445d146b83f9ece7a0479a01b6e832f3fca9a2b0fc3e98c2e8ee081bf9cb`(105,114,726 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `4b4f507dfa27f95d4b122687c498ed6565be218f382c81dbc3020d37728abb9d` |

## 1.2.4 실측 크기 · 이름/모델명 — 공개 배포 검증 완료

2026-10-26. 제품 커밋 `d844f1a4f9c5707b257e23e46d978b387e2e66f6` · [Windows CI 40297082512](https://github.com/moonsyu/STM-Simulator/actions/runs/40297082512) · [Release v1.2.4](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.2.4)

| 검사 | 결과 |
|---|---|
| 실측 크기 | 78종 모두 그린 크기가 데이터시트 W×H와 0.05 mm 이내(`part-datasheets.test.js`) |
| `npm test` (로컬) | 739 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| `npm run test:e2e` (로컬) | 30 통과, 2 건너뜀 |
| 공개 자산 | latest=v1.2.4(릴리스 페이지 이동 확인), 태그(`git ls-remote`)·BUILD-INFO 커밋 `d844f1a` 일치, 5자산. EXE SHA-256 `a18f47120bb3f31396548f9ca4e6930b050e089eae6efc5834ecb6b7efe326a6`(103,174,723 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `7489d5b63a97b7498df0d3f7f107620650c289b08c4ca787548012c114d98d35`. GitHub API 호출 한도가 다 되어 CI 상태는 공개 Release 게시(성공 후에만 게시됨)로 확인 |

## 1.2.3 도움말 → 버전 정보 — 공개 배포 검증 완료

2026-10-26. 제품 커밋 `c64a8fadecf80dad4c57cac5eebc5bee567e6688` · [Windows CI 40293421217](https://github.com/moonsyu/STM-Simulator/actions/runs/40293421217) 첫 실행 성공 · [Release v1.2.3](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.2.3)

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 739 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| `npm run test:e2e` (로컬) | 30 통과, 2 건너뜀. 새 검사: 도움말 메뉴의 `(v버전)` 표시, 버전 정보 창의 현재 버전·상태·마지막 확인 |
| 공개 자산 | latest=v1.2.3, 태그·BUILD-INFO 커밋 `c64a8fa` 일치, 5자산. EXE SHA-256 `01bf233132cc97bcf2d6c41800bd5d0f1ddc5f4f6d3c70acfa622f5e76cee089`(103,174,598 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `180c494b5f1775eb252ba5939c3424336ba9eacee0adc919db89ecf30e84712f` |

## 1.2.2 업데이트 버튼 표시 · Electron 44.9.3 — 공개 배포 검증 완료

2026-10-26. 제품 커밋 `c40011c5fa66249c5235fa10f6b3a6a9f2aff3eb` · [Windows CI 40266369365](https://github.com/moonsyu/STM-Simulator/actions/runs/40266369365) 성공 · [Release v1.2.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.2.2). 첫 실행(`574438e`, CI 40265774599)은 새 보안 권고로 `npm audit` 단계에서 실패했고 Release·태그는 만들어지지 않았다.

| 검사 | 결과 |
|---|---|
| `npm audit --audit-level=low` | 0건 (Electron 44.5.1 → 44.9.3, undici 6.29.1/7.30.1, fast-uri 3.1.9) |
| `npm test` (로컬) | 739 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| `npm run test:e2e` (로컬) | 30 통과, 2 건너뜀. 새 검사: 업데이트 버튼이 표시되면 테마 버튼 왼쪽에 보임 |
| 로컬 패키지 | `npm run build`·`build:artifact` 검증 통과 |
| 공개 자산 | latest=v1.2.2, 태그·BUILD-INFO 커밋 `c40011c` 일치, 5자산. EXE SHA-256 `fb25ff68e6576856b8e1d3b354ba8d428baef104c6ebff422177868851181b6e`(103,174,548 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `6533819180b6ab4ee2fbbe5d3ea0dc9cd63fc99e7d24685739f68f0918295c8b` |

## 1.2.1 IDE 사용 중 업데이트 감지 — 공개 배포 검증 완료

2026-10-23. 제품 커밋 `41815914926611502bfa20038c31f2cc8bef921a` · [Windows CI 39928683255](https://github.com/moonsyu/STM-Simulator/actions/runs/39928683255) 첫 실행 성공 · [Release v1.2.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.2.1)

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 739 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 검사: 포커스 시 10분 간격 확인·자동 확인 끔, 백그라운드 확인 실패 시 찾은 업데이트 유지 |
| `npm run test:e2e` (로컬) | 30 통과, 2 건너뜀 |
| 공개 자산 | latest=v1.2.1, 태그·BUILD-INFO 커밋 `4181591` 일치, 5자산. EXE SHA-256 `c574efaef0e93e42084be5f1343e33036614e62cfa80bb154a0b1bcf6426f9de`(102,896,769 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `376e431a7902407bcaddc6669348a79b39f3c1ce8e3dab4782fb917aaf441343` |

## 1.2.0 부품 바로 배치 · 데이터시트 크기와 이름 — 공개 배포 검증 완료

2026-10-23. 제품 커밋 `53974187772511ba29fde4dbb63933720f935b5e` · [Windows CI 39922878249](https://github.com/moonsyu/STM-Simulator/actions/runs/39922878249) 성공 · [Release v1.2.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.2.0). 첫 실행(`dd8cfc3`, CI 39921155730)은 패키지 검증이 삭제한 `src/resize-ui.js`를 찾다 실패했고, Release·태그는 만들어지지 않았다.

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 737 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 `part-datasheets.test.js` 포함 |
| `npm run test:e2e` (로컬) | 30 통과, 2 건너뜀 |
| 예제 배선 | 127개 예제, 전체 길이 232,216(1.1.1 231,750), 교차 23, 겹침 0 |
| 공개 자산 | latest=v1.2.0, 태그·BUILD-INFO 커밋 `5397418` 일치, 5자산. EXE SHA-256 `b7b9495289dd9b36c890ab5b75a7fe515d51bd20bf31abbfaaef9bbbf26000b1`(102,897,052 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `45ca8bf0766970ea83eb0cbefc5290613e246683f576a7af72a31a6ff2e344a8` |

## 1.1.1 좁은 사이드바 글자 · HAL 예제 배치 미리보기 — 공개 배포 검증 완료

2026-10-23. 제품 커밋 `5422803c605c5b8465fb051e06f016a02656db29` · [Windows CI 39917526408](https://github.com/moonsyu/STM-Simulator/actions/runs/39917526408) 첫 실행 성공 · [Release v1.1.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.1.1)

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 733 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| `npm run test:e2e` (로컬) | 30 통과, 2 건너뜀. 127개 HAL 예제 모두 마우스를 올리면 배치 미리보기 표시 |
| 공개 자산 | latest=v1.1.1, 태그·BUILD-INFO 커밋 `5422803` 일치, 5자산. EXE SHA-256 `532698414a6ba62b0b9fc2ed982453f5a474b0f3fbf52e1f299641de58b28a24`(102,895,283 B)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `2502383a352f13af2891768205fbde088695f7656b40205ab531b6e068f8bffe` |

## 1.1.0 제목 표시줄 · 설정 창 · 패널 옮기기/분리 · 보드 선택 · 시작 테마 — 공개 배포 검증 완료

2026-10-23. 제품 커밋 `feb9e6633862690c90c4f350a469a0fdc2255f8b` · [Windows CI 39884746789](https://github.com/moonsyu/STM-Simulator/actions/runs/39884746789) 첫 실행 성공 · [Release v1.1.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.1.0)

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 733 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| `npm run test:e2e` (로컬) | 29 통과, 2 건너뜀(실제 도구 경로 필요). 새 검사: 설정 창·단축키 탭, 패널 이동·유지·레이아웃 초기화, 분리 창에서 편집 후 되돌리기, 시작 시 Windows 테마 |
| 보드 선택 | 가짜 보드 응답으로 "NUCLEO-F446RE (COM5)" 목록·선택 저장 확인(실물 미연결) |
| 공개 자산 | latest=v1.1.0, 태그·BUILD-INFO 커밋 `feb9e66` 일치, 5자산. EXE SHA-256 `f2066ba2bc1a898b0053eaef811d7f9f33d70f3f619437f5e6fa825c989f3d54`(102,893,381 B, MZ)이 SHA256.txt·update-manifest·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `8c1403fd4ea62bf7887da70212da310c598b99ad8c2044bebc0b58d7ce568390` |

## 1.0.0 전체 기능 점검 (실물 보드 연동 제외) — 공개 배포 검증 완료

2026-10-22. 제품 커밋 `cbd345f0cae9fe3f1e599692861e0bfaa982900d` · [Windows CI 39741156371](https://github.com/moonsyu/STM-Simulator/actions/runs/39741156371) 첫 실행 성공 · [Release v1.0.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v1.0.0)

| 검사 | 결과 |
|---|---|
| 기능 감사 | 영역별 8회차. 확인 결함 1차 48 → 2차 35 → 3차 24 → 4차 7 → 5차 4 → 6차 1 → 7차 1 → 8차 "결함 없음". 실물 보드 쓰기·OpenOCD·ST-LINK는 쓰지 않음 |
| `npm test` (로컬) | 735개 중 733 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| `npm run test:e2e` (로컬) | 28 통과, 2 건너뜀(실제 도구 경로 필요) |
| 실제 ARM GCC 툴체인 | 254/254: F446RE 128·F103RB 126 예제를 ST HAL로 빌드해 에뮬레이터에서 오류 없이 실행. HSE_VALUE 수정 뒤 부분 집합 24/24 |
| 장치 Docs 적용 | F446RE 233/236, F103RB 231/233 실행 성공(나머지는 SPI 클록·핀·타이머 충돌을 구체적으로 알리는 거부). 예제·Docs 1823건·붙여넣기에서 한 칸 한 배선·꽂힌 다리 규칙 위반 0건 |
| 공개 자산 | latest=v1.0.0, 태그·BUILD-INFO 커밋 `cbd345f` 일치, 5자산(STM-Simulator.exe, ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json). EXE SHA-256 `0c1f45a7058d925ef2053c02ad958bebe0baf8847b81c8bc55189f5c816009be`(102,888,040 B, MZ)이 SHA256.txt·update-manifest·BUILD-INFO·ZIP 안의 STM-Simulator.exe와 일치. ZIP SHA-256 `e2c870c9dba40f34e9f32d0286a31c0aa1c40fe5854745922ff08dc22cf40dfa` |

## 0.34.4 직렬 모니터 안내 · 고급 예제 printf — 공개 배포 검증 완료

2026-10-22. 제품 커밋 `eb33829f862513d6faf952be470fb31d30e440bf` · [Windows CI 39706596260](https://github.com/moonsyu/STM-Simulator/actions/runs/39706596260) 성공 · [Release v0.34.4](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.34.4). `npm test` 712개 중 709 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한), E2E 30개 중 28 통과·2 건너뜀, 실제 ARM 빌드·에뮬레이터 부분 집합 15/15(두 보드), `npm audit` 0건. latest=v0.34.4, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `dc37abea778a56b07f542cf1fc4db17a893bbf90378646776f15591546217b73`(102,868,722 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `dae92300f3119a830e43266ad7d5c2c2c3ae4299c8c76aac11cf74435bc69879`.

## 0.34.3 부품 다리와 점퍼선 끝은 다른 구멍 — 공개 배포 검증 완료

2026-10-22. 제품 커밋 `297cca43e9a277e0d3a09a9b76ce8cb4100c1d76` · [Windows CI 39701839063](https://github.com/moonsyu/STM-Simulator/actions/runs/39701839063) 성공 · [Release v0.34.3](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.34.3). `npm test` 712개 중 709 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한), E2E 29개 중 27 통과·2 건너뜀, `npm audit` 0건. latest=v0.34.3, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `b111cce0bfeb3235e27238291f18d91c66d38e5a81e6f0df1341e7959651ff39`(102,869,716 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `98a49cfbeca7ab97630a24ee43db99d3175581795d81293554104a65ee0651d1`.

## 0.34.2 부품 선택·이동 범위 · Electron 44.5.1 — 공개 배포 검증 완료

2026-10-22. 제품 커밋 `c20534a12ae9de82c8cd0320e90d68d351aec453` · [Windows CI 39697056505](https://github.com/moonsyu/STM-Simulator/actions/runs/39697056505) 성공(첫 실행 39695698010은 npm audit의 새 Electron 권고로 실패, 태그·Release 없음) · [Release v0.34.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.34.2).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 711개 중 708 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| `npm run test:e2e` (로컬, Electron 44.5.1) | 26 통과, 2 건너뜀(실제 도구 경로 필요). 새 검사: LED 빛 번짐 자리 클릭은 아래 구멍으로, 선택 테두리는 렌즈 가까이 |
| 클릭 범위 측정 | HAL 예제 부품 236개: 몸체 밖에서 부품을 잡는 면적 최대 4.25배 → 0.57배(보이는 다리 선) |
| `npm audit` | 0건 |
| 공개 자산 | latest=v0.34.2, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `25468b978a693d39f9b4c4f9f54d8c8d67d0f60c7c53a43c74f6617ef8f56f7d`(102,868,704 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `82e62a84c6e0aef59f2c23b53c89e943d36bba5515144e0c4efcb620e1b70ce9` |

## 0.34.1 배선 끝 클릭으로 옮기기 — 공개 배포 검증 완료

2026-10-22. 제품 커밋 `ccf3994e4b849c19b53fe98f6ac7c286a219cc0b` · [Windows CI 39620223862](https://github.com/moonsyu/STM-Simulator/actions/runs/39620223862) 첫 실행 성공 · [Release v0.34.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.34.1). `npm test` 711개 중 708 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한), E2E 27개 중 25 통과·2 건너뜀. latest=v0.34.1, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `7837626f986d8861756c3c7380c8c267476cd6642424269079f3b6f48eb33c1d`(103,014,939 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `0fc39d3e907cd7ab51f9e0c7c6c5bc25d0fc13fd9aa5cb0ec3bfdd3ab523e618`.

## 0.34.0 한 칸에 점퍼선 하나 · 배선 끝 옮기기 — 공개 배포 검증 완료

2026-10-22. 제품 커밋 `7ac9f149c8d7565583aca89bc33d520bde431b03` · [Windows CI 39607305813](https://github.com/moonsyu/STM-Simulator/actions/runs/39607305813) 첫 실행 성공 · [Release v0.34.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.34.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 711개 중 708 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 검사: 배선 막힘 조건·끝 이동·거부 3개 |
| `npm run test:e2e` (로컬) | 25 통과, 2 건너뜀(실제 도구 경로 필요). 새 검사: 실제 마우스로 사용 중인 핀 거부, 배선 끝 끌어 옮기기, 실행 취소 |
| 공개 자산 | latest=v0.34.0, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `756e9a35693932b7178b5cf9b9a9cb1c8118ba6482f10c6bf56a399ac8b655a4`(103,015,457 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `68648dbb6c8b7b0299f62cb5d30fe876ad29f9558bc665244fa2e915bae67a77` |

## 0.33.2 실행은 항상 보드에 기록 · 다른 보드 거부 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `46cd7f56d03760a7e09f1c50f7558c96dda6294c` · [Windows CI 39567830174](https://github.com/moonsyu/STM-Simulator/actions/runs/39567830174) 첫 실행 성공 · [Release v0.33.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.33.2).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 708개 중 705 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). ST-LINK 선택에 다른 종류 보드 거부 추가 |
| 실제 앱 화면 + 실물 F446RE | 연결 설정 없음(기본값)으로 사용자 마지막 프로젝트를 열고 Ctrl+F5: Programming Finished · Verified OK, OpenOCD 종료, 코어 실행, PA5 토글 |
| 공개 자산 | latest=v0.33.2, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `6174099ce2841b51be4c67915f386231dec3cf2983a26b0e0a6ba4f147216973`(103,016,567 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `c642a2f5063a3d6a0e04934e9341a4310b68c3be5e9530aed8876f69763ee1d6` |

## 0.33.1 실물 보드 실행 후 디버거 분리 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `206d9115f1a1c2bb18fd015df6ad3c9eb990efb0` · [Windows CI 39563744650](https://github.com/moonsyu/STM-Simulator/actions/runs/39563744650) 첫 실행 성공 · [Release v0.33.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.33.1).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 708개 중 705 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한, CI 통과) |
| 실물 보드 (F103RB) | `NativeIde.run`으로 기록·검증·리셋 후 OpenOCD 종료(프로세스 0), 디버거 없이 코어 실행, PA5 토글. 기록 안 함: 리셋 후 uwTick 0부터 증가 |
| 공개 자산 | latest=v0.33.1, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `4c5d6368951bd07e19e68f7db2afbfd42e6bdba727d6b1801d01aa51d545d6dd`(103,014,628 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `d4f79562bf1c2ae7a11ce55fd15d9f7c347e7334ac44cfb6a452a85725a275d2` |

## 0.33.0 NUCLEO-F103RB 실제 빌드 · 실물 보드 · 펌웨어 에뮬레이터 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `cc0a5e6c5c1344146d31912cd95e0c9f4c35cfb6` · [Windows CI 39554634812](https://github.com/moonsyu/STM-Simulator/actions/runs/39554634812) 첫 실행 성공(CubeF1을 받아 두 보드 예제 빌드·에뮬레이터 실행 포함) · [Release v0.33.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.33.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 708개 중 705 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 검사: F103 에뮬레이터 8개(클럭·EXTI·UART·ADC·ADC DMA·DMA UART·PWM 리맵·I2C/SPI/캡처), F1 빌드 계획, OpenOCD F1·시리얼, ST-LINK 선택, CubeF1 매니페스트 |
| 실제 빌드 (로컬) | STM32CubeF1로 F103RB 예제 125개+빈 프로젝트 모두 빌드 후 F1 에뮬레이터 실행 통과(126/126). 두 보드 CI 부분집합 22/22 |
| `npm run test:e2e` (로컬, 실제 도구) | 26개 모두 통과. 새 검사: F103 ELF를 F1 에뮬레이터로 실행, 보드 전환 후 앱에서 STM32CubeF1 빌드·실행 |
| 실물 NUCLEO-F103RB | blink: PA5 토글, RCC_CFGR PLL x16·APB1 /2. IDE 경로(`NativeIde.run`): 두 ST-LINK 중 F103RB 자동 선택·쓰기·실행. exti: EXTICR4·EXTI·NVIC IRQ40 설정, SWIER로 처리기가 PA5 토글 |
| 공개 자산 | latest=v0.33.0, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `2f6193e4157d86718576f19ebf76a517b895795bc5390ec848cdd8f6cba2eeb1`(103,013,388 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `48386217578420c4fde51be863bf6e62ec9477bd7d3dc7a9b5b3371b30e7d46a` |

한계: F1 에뮬레이터는 F446 메모리 크기를 써서 128K/20K 밖 접근을 막지 않습니다. 물리 버튼 누름은 사용자 확인이 필요합니다.

## 0.32.0 NUCLEO-F103RB 보드 (회로 시뮬레이터) — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `9aa3e9fd17d408026dbac004df4e93c681e3ba88` · [Windows CI 39550035526](https://github.com/moonsyu/STM-Simulator/actions/runs/39550035526) 첫 실행 성공 · [Release v0.32.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.32.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 697개 중 694 통과·1 건너뜀(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 검사: 계열 프로필, F103 코드 생성·인터프리터, 예제 이식(모든 예제를 F103RB로 실행해 F446RE 출력과 비교), F103 예제 목록 |
| 예제 이식 | 127개 중 125개 실행, 124개 출력 동일, 1개(ADC DMA 스캔)는 F1 ADC 변환 속도 차이, DCMI·I2S 2개는 F103RB에 없어 제외 |
| `npm run test:e2e` (로컬) | 23 통과, 1 건너뜀. 별도 화면 확인: 보드 전환(Cortex-M3 그림), Pinout(USART 3개·TIM2/3/4), 예제 125개, DMA UART 에코 실행 |
| 공개 자산 | latest=v0.32.0, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `f76f2f04a18f14ba42b0e3f2d9d27db0efc4d9029062973cd517349fd78b654d`(102,997,234 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `c86461fc3324b4bef2aad6201b2038a185206e3f9204f1837a3e74700e89a8e9` |

한계: 이 버전의 F103RB는 회로 시뮬레이터만 지원하고 ARM 빌드는 막았습니다(0.33.0에서 지원).

## 0.31.0 앱 안에서 개발 도구 설치 · 시작 시 도구 확인 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `60f2e64aa56d522e9c2fdeb59e67010f07f5e862` · [Windows CI 39544511412](https://github.com/moonsyu/STM-Simulator/actions/runs/39544511412) 성공 · [Release v0.31.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.31.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 688개 중 685 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 검사: 설치 계획, 해시 일치·불일치와 정리, STM32CubeF4 조립과 파일 변조 거부, 설치된 항목 건너뜀 |
| `npm run test:e2e` (로컬) | 23 통과, 1 건너뜀. 새 검사: 시작 알림 → 설치 목록, 다시 묻지 않기 유지 |
| 실제 다운로드 | 임시 폴더에 ARM GCC 15.2.1·STM32CubeF4(280개 파일 검증)·OpenOCD·clangd 설치 74초, 설치한 도구만으로 LED 예제 빌드, 설치 후 약 1.6 GB, 폴더 삭제 |
| 공개 자산 | latest=v0.31.0, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `5b6ea3aa59abda5a8c720a5ed06ece3b9c0cfb79aa8bbdd15056778815272984`(102,986,116 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `2d4b6a706e71ec00728381597473a81c81eaad3588f3dacd7cddb410f7315951` |

한계: ST-LINK USB 드라이버는 설치하지 않으며, CubeIDE가 없는 PC에서 드라이버 없이 보드가 잡히는지는 확인하지 못했습니다.

## 0.30.1 IDE 실물 보드 실행 수정 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `0a34222b4a64bc6e0ecd16847012dc7cbcc712c8` · [Windows CI 39542962621](https://github.com/moonsyu/STM-Simulator/actions/runs/39542962621) 성공 · [Release v0.30.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.30.1).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 683개 중 680 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 검사: CubeIDE OpenOCD 시작 인자, 도구 저장 시 빈 항목 자동 감지 |
| 실물 보드 (IDE 경로) | `NativeIde.run`(STM32 · ARM GCC, OpenOCD 자동 시작, 기록 켬)으로 빌드·플래시·실행, GDB 일시정지마다 `uwTick` 724→1454→2182→2908, PA5 변화 |
| 공개 자산 | latest=v0.30.1, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `fb16754c487f59a596f5d1be2248cfcb961d841b37bfabf2c60c118b68965088`(102,968,843 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `d07f165d685da253da660974fce738be7ee31cd6f54f2ba7c68012bc9436b8c7` |

## 0.30.0 4칸 들여쓰기 · 예제/Docs 구분 · F11 연속 실행 · 찾기 창 · CubeIDE 도구 감지 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `51b7d21f4405bc3b25fda1bf054f3c3ce8672883` · [Windows CI 39540170767](https://github.com/moonsyu/STM-Simulator/actions/runs/39540170767) (빌드·릴리스 게시 모두 성공) · [Release v0.30.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.30.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows) | 681개 중 678 통과. 실패 2개는 로컬 심볼릭 링크 권한 한정, CI 통과 |
| `npm run test:e2e` (로컬) | 22 통과, 1 건너뜀. 새 검사: 찾기 키가 Monaco 찾기 위젯을 열지 않음, F11 누르고 있으면 3회 이상 단계 실행(수정 전 실패 확인) |
| `npm run test:toolchain` (로컬, 실제 ARM) | STM32CubeIDE 1.19.0의 GNU Tools for STM32 13.3.1 + STM32CubeF4 v1.28.3(`94cae6e`)으로 빈 프로젝트와 예제 126개 128/128 컴파일·링크·에뮬레이터 실행 통과(약 25분) |
| 실물 보드 | NUCLEO-F446RE ST-LINK V2-1(V2J48M35, COM6), STM32F446xx Rev A, 512 KB, 3.25 V. STM32_Programmer_CLI 핫플러그 연결 확인만, 플래시하지 않음 |
| 공개 자산 | latest=v0.30.0, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `0e18f41784b4d97ea671eeef7debc30c8825bc34dca4e1e5a32ed61c1ee836fe`(102,967,801 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `fb776dd19b9f77f6bee7554a809e6eb54586f36443eafe649d3475648ed09997` |

한계: 펌웨어를 실물 보드에 써서 실행하지는 않았습니다(사용자 선택). 기존 2칸 프로젝트는 자동 변환하지 않으며 코드 정렬로 4칸이 됩니다.

## 0.29.2 코드 정렬 문장 줄 나눔 · 저장 상태 경쟁 수정 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `292d402bbc6b36e181e88c3fae7c4a2c93cc6583` · [Windows CI 39531566516](https://github.com/moonsyu/STM-Simulator/actions/runs/39531566516) (빌드·릴리스 게시 모두 성공) · [Release v0.29.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.29.2). 첫 실행 [39530166635](https://github.com/moonsyu/STM-Simulator/actions/runs/39530166635)은 저장 상태 경쟁(자동 저장이 "파일 저장됨"을 덮어씀)으로 E2E 1건이 실패해 게시되지 않았고(태그 없음), 수정 후 같은 버전으로 게시했습니다.

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows) | 680개 중 677 통과. 실패 2개는 로컬 심볼릭 링크 권한 한정, CI 통과 |
| `npm run test:e2e` (로컬) | 21 통과, 1 건너뜀. 저장 테스트는 3회 연속 통과(저장 0.5초 뒤 상태 유지 검사 추가) |
| 코드 정렬 | 사용자 목표 형식(`tests/fixtures/format-compact.c`)과 글자 단위 일치, `else if` 사슬, 범위 정렬, 중단점 이동(편집기 `main.c:10`, 저장 시 줄 재계산) |
| 공개 자산 | latest=v0.29.2, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `4d63c5014e65277f1362e6d0fd0f61b059edfc655d52d6e2a19ca5f75adbb194`(102,967,555 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `a889b29355ee13bfdd7e5d961378e1efb62991810729e246389c5116400df5b7` |

한계: 연산자 주변 공백과 포인터 `*`/`&`는 정렬하지 않습니다(사용자 목표 형식). 중괄호는 중괄호 있는 갈래 뒤 같은 줄에서 끝나는 `else` 한 문장에만 붙입니다.

## 0.29.1 `}` 정렬 IME 수정 · 예제 코드 줄 정리 · 메뉴 표시 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `0173b64339a8e9a50a38b75c77b13d82416486bd` · [Windows CI 39528002946](https://github.com/moonsyu/STM-Simulator/actions/runs/39528002946) (빌드·릴리스 게시 모두 성공) · [Release v0.29.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.29.1). 첫 실행 [39527156197](https://github.com/moonsyu/STM-Simulator/actions/runs/39527156197)은 메뉴 단축키 경쟁 상태로 E2E 1건이 실패해 게시되지 않았고(태그 없음), 수정 후 같은 버전으로 게시했습니다.

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows) | 678개 중 675 통과. 실패 2개는 로컬 심볼릭 링크 권한 한정, CI 통과 |
| `npm run test:e2e` (로컬, 두 번 연속) | 각 20 통과, 1 건너뜀. 새 검사: IME 방식 `}` 입력(`insertText`)과 자동 닫힌 `}` 덮어쓰기 |
| 예제 코드 정리 | 127개 예제 모두 한 줄 한 문장, 원래 조각과 토큰 동일, `expandC` 멱등 |
| 공개 자산 | latest=v0.29.1, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `0bab81c7491c08fb5f90abd93d7dd8e3c397157d37859e105f99b5429523a92a`(102,967,040 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `e71b598ce2dd57ca6aa6abdbdb625bbba5e62d56faab3f7aca81daf9899d484c` |

한계: 실제 한글 IME 하드웨어 입력은 `insertText`(키 이벤트 없는 텍스트 입력)로 재현했으며 사람이 직접 입력해 확인하지는 않았습니다.

## 0.29.0 UI 다듬기 · 기능 점검 수정 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `90504af7761d3760fa43c26ca78ac8497e64e488` · [Windows CI 39524337726](https://github.com/moonsyu/STM-Simulator/actions/runs/39524337726) (빌드·릴리스 게시 모두 성공) · [Release v0.29.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.29.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows, Node 24) | 676개 중 674 통과. 실패 2개는 로컬 심볼릭 링크 권한(EPERM) 한정, CI 통과 |
| `npm run test:e2e` (로컬 실제 Electron) | 19 통과, 1 건너뜀. Dark/White WCAG AA 대비 검사 포함 |
| 색 대비 (새 팔레트) | foreground·muted·accent·error·warning × background·panel·chrome·hover, 선택 영역, 버튼 모두 AA (최소 5.15:1) |
| HAL 예제 127개 실행 감사 | 오류 0, `stdio.h` 중복 제거 전후 출력 동일 |
| 공개 자산 | latest=v0.29.0, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `8f9ff1745ac078286eee79fe5dc5b55372dbc0c86b2364e747f7227a68098d28`(102,967,771 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `01b52b497dfe2e1667acf5971b37a8bf75a4ffc344563409f43133e5b3fe2221` |

한계: 화면 디자인은 1600×900 창의 Dark/White 캡처로 확인했으며 작은 창 크기와 고배율 디스플레이는 따로 확인하지 않았습니다.

## 0.28.0 코드 정렬 · 예제 결과 표시 점검 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `536dedd37e84a3a92e651ee3f5fecbc33a16089e` · [Windows CI 39520981687](https://github.com/moonsyu/STM-Simulator/actions/runs/39520981687) (빌드·릴리스 게시 모두 성공) · [Release v0.28.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.28.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows, Node 24) | 676개 중 674 통과. 실패 2개는 `tests/unit/desktop.test.js`의 심볼릭 링크 생성 권한(EPERM) 문제로 로컬 환경 한정이며 CI에서는 통과 |
| `npm run test:e2e` (로컬 실제 Electron) | 19 통과, 1 건너뜀. 새 검사: `}` 입력 블록 정렬·Alt+Shift+F 정렬, Gravity RGB 렌즈 색·속성 패널 G/R/B |
| 코드 정렬 | 모든 HAL 예제 main.c에서 토큰 불변·멱등·줄 수 보존. 구조체/배열 초기화, 중첩 중괄호 없는 본문, 괄호 연속 줄, `#ifdef` 줄 유지 확인 |
| 예제 결과 점검 (127개, 각 3초 실행) | 오류·전기 고장 0. 출력·회로·속성 패널 중 어디에서도 결과를 볼 수 없던 예제 없음(버저는 500 ms 토글, `exti`는 USER 버튼 입력에 반응) |
| 공개 자산 | latest=v0.28.0, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `1597e8df8dcaec6d1508eaed22b94ec44a0e9e0cb61cf2cce0f6a259e9d3dfec`(102,968,177 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `6aec401d9817e8776de4b0747da60956e4636ea0676ece13e9a5a8f724c65031` |

한계: ARM GCC 빌드는 CI의 대표 예제 11개만 검사하며, 주소지정 RGB 예제는 인터프리터와 앱 E2E에서 확인했습니다. 실물 MCU·WS2812에서의 실행 검증은 아닙니다.

## 0.27.0 빵판 · 예제 배선 · Docs 제거 · 단축키

2026-10-21. 검증 브랜치 `redesign` · [Windows CI 39451212214](https://github.com/moonsyu/STM-Simulator/actions/runs/39451212214) (전 단계 통과).

| 검사 | 결과 |
|---|---|
| `npm test` (단위·인터프리터·에뮬레이터·펌웨어, 예제 배선 지표, Docs 적용/제거 ARM 빌드 포함) | 672 통과 |
| `npm run test:e2e` (Linux xvfb, ARM GCC 포함) | 18 통과 |
| 예제 배선 지표 (127개) | 배선 1167→684, 길이 486217→231750, 교차 1475→17, 겹침 1075→0 |

## 0.26.0 VS Code형 작업 화면 · 펌웨어 에뮬레이터 · 테스트 재작성

2026-10-20. 검증 브랜치 `redesign` · [Windows CI 39380790785](https://github.com/moonsyu/STM-Simulator/actions/runs/39380790785) (전 단계 통과).

| 검사 | 결과 |
|---|---|
| `npm test` (unit 350 · interp 48 · emu 65 · firmware 42) | 505/505 통과 (Linux Node 22, Windows Node 24) |
| Cortex-M4 코어 QEMU 대조 | 펌웨어 19종 출력 바이트 일치 (`tests/emu/cpu-fixtures.test.js`), 약 34~40 MIPS |
| `npm run test:e2e` (실제 Electron) | 16/16 통과 — 작업 화면·레이아웃 저장, 예제 실행·측정·디버그, 저장 직후 편집 경고·입력 직후 종료 보존·폴더 저장 일관성, Dark/White WCAG AA, ELF 실행·UART·로직 분석기·에뮬레이터 디버거·ARM GCC 빌드 후 실행, 카메라 미리보기·SD 파일 저장 |
| `npm run test:toolchain` | 로컬: 빈 프로젝트와 예제 126개(시뮬레이터 전용 sd_logger 제외)를 앱의 ARM GCC 빌드 경로로 모두 컴파일·링크하고 에뮬레이터에서 실행 — HardFault·Error_Handler 없음, 도달한 시뮬레이션 시간에 비례해 SysTick 진행 확인. CI: 대표 11개 |
| Windows 릴리스 검사 | 업데이트 도우미(잠긴 EXE 교체·실패 시 복원·부모 종료 후 실행), 패키지 앱 실행, 포터블 EXE 업데이터 상태 통과 |

이번 검증에서 발견해 수정한 기존 결함: ARM 빌드 환경의 SysTick/IRQ 처리기 weak 충돌(`HAL_Delay` 정지), DMA 스트림 IRQ 처리기 누락(DMA 예제 정지), DCMI/SD 등 HAL 모듈 미포함, MAX98357A I2S PLLI2SM 누락, `.ioc` `S_TIMx_CHy` 가져오기, 포인터 뺄셈, 터미널 첫 프롬프트 한글 경로.

한계: 실물 MCU에서의 실행 검증은 아닙니다. 에뮬레이터는 MPU 강제·DWARF 지역 변수·일부 주변장치 모드(I²C/SPI 슬레이브, ADC 다중 모드, USART LIN/IrDA 등)를 모델링하지 않으며, 84 MHz 펌웨어는 실제 속도의 약 0.6~0.7배로 실행되며, 입력 핀을 빠르게 반복해서 읽는 회로(초음파 에코 대기, L298N 등)는 매 읽기마다 회로를 다시 계산하므로 약 0.1~0.2배로 느려집니다.


## 0.25.2 빵판 예제 배치 — 공개 배포 검증 완료

2026-10-19. [상세 보고서·원본 로그](audits/0.25.2-breadboard/REPORT.md). [Release v0.25.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.2) · [전체 Windows CI 39257882264](https://github.com/moonsyu/STM-Simulator/actions/runs/39257882264) 성공.

- Docs·예제 검색·새 프로젝트 템플릿의 모든 예제 부품을 빵판 위에 장착합니다. 다리와 점퍼의 구멍을 분리하고 몸체·접점을 피하며 전원 레일과 신호를 분리합니다.
- CI 단위 411개. 라이브러리 120개 배치/연결망 대조, Docs 114장치 실제 모델 실행·손상 복구 후 재실행, 개별 단선 1,068개 복구 통과. 개발 중 1,062개 검사와 최종 제품 소스 검사는 구분합니다.
- 초기 CI에서 발견한 배선 개수 고정 검사와 작은 화면의 크기 조절 핸들 간섭을 수정하고 실패·재검사 기록을 보존했습니다. 후속 제품 커밋 `7b4c3fb5328c0e383a8e499f6f5c1e1aac3c65d9`의 전체 CI·태그/빌드·공개5자산·해시/latest를 확인했습니다.
- 공개 단독 EXE/ZIP 각각 C 의미7조건·종료/재열기 코드 보존, 공개 UI 6장치 Docs·실행 JSONL과 타이머 빵판 경유 통과. 공개0.25.1→0.25.2 실제 자동 업데이트와 사용자 설정 보존 통과.
- EXE SHA-256 `85b1bbb5a387e3a8cdb71bee9263fd38fc15f37296aeda5ef52c1d2ce7baed1c`. 모델 114종 검사와 공개 UI 6종 검사를 구분하며 실물 MCU 실행 검증은 아닙니다. 후속 문서 커밋은 제품 태그와 자산을 덮어쓰지 않습니다.

## 0.25.1 PIN 설정·IRQ·Analog 수정 — 공개 배포 검증 완료

2026-10-19. [상세 보고서·원본 로그](audits/0.25.1-release/REPORT.md). [Release v0.25.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.1) · [Windows CI 39227299473](https://github.com/moonsyu/STM-Simulator/actions/runs/39227299473) 성공.

- 로컬/CI 단위 각406개 통과. 제품 태그·빌드 `243ecf205354e18ed4701213c117906ab6a35080`, sourceDirty=false, 공개5자산·latest·ZIP 내부 EXE·버전/커밋/해시 일치.
- 공개 단독 EXE와 ZIP 내부 EXE 각각 C 의미7조건 및 종료·재열기 최신 코드 복원 통과. 각각 PIN25개(실제 실행6회), Docs3조합(실제 실행6회)을 실제 UI·진단 JSONL·코드/배선·저장 복구로 확인했습니다.
- 공개0.25.0→0.25.1 자동 검색·다운로드/SHA·교체·새 앱 재기동·재열기 및 코드·테마·글꼴·보드 크기·자동 업데이트 설정 보존 통과.
- 이전0.25.0 개발 수정본의 PIN362/Docs독립7 검사와 공개0.25.1 검사를 별도 기록합니다. 모든 임의 장치 조합이나 실물 MCU 검증을 뜻하지 않습니다.
- EXE SHA-256 `8ab5fc812df020b4bf68b9eb8941e521be75199e0c1cc66ff1a45e08d2c58566`. 후속 문서 커밋은 제품 태그와 배포 파일을 변경하지 않습니다.


## 0.25.0 작업 화면·장치 모델 — 공개 배포 검증 완료

2026-10-19. Windows 참고 White/Dark 팔레트, System 자동 추종, 적응형 작업 공간, 접근성, 실제 장치 모델/접점 및 둥근 배선을 개선했습니다. [단계별 실패·수정·재검사 보고서](audits/tinkercad-workbench/REPORT.md).

- 로컬 단위397개, 화면24조합·72상태·427판정, 114종 프리뷰, 실제 ARM HAL 링크122조건을 통과했습니다. 코드 테마 importer와 저장 기본 테마 교정 후 원본 C 토큰·사용자 설정 보존도 확인했습니다.
- Electron nativeTheme 알림, HAL GPIO/USART2와 입력·RESET의 실제 진단 로그, 파일/자동 저장 연속 오류와 복구, GCC/GDB/clangd 실행을 확인했습니다.
- [Windows CI39214636630](https://github.com/moonsyu/STM-Simulator/actions/runs/39214636630) 전체 검사·빌드·[v0.25.0 게시](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.0) 성공. 제품 커밋 `2278c2da1a6c14ec16b1629af136172ce7a1e078`, sourceDirty=false, 공개5자산·latest·태그/빌드 커밋·ZIP 내부 대조 통과.
- 공개 `STM-Simulator.exe`는102,783,034 bytes, SHA-256 `e678a2533cd8fd7fac864b466077c9df94bca1ffe4b5bb12d43c8527319cfc35`. ZIP SHA-256 `61ad97c361c3f75f8fb55d2ba15672a83f954485fd1e0167b8ea98713caa4d1e`.
- 내려받은 공개 EXE에서429판정·74상태(기본72+추가2)·10시나리오·114모델 통과, 대비37,062건에서 저대비0·renderer 오류0. native System과 실제 C 토큰 색도 확인했습니다. 정상 크기 Dark/White와900폭·글꼴20 두 테마 화면을 직접 검토했습니다.
- 단독 공개 EXE·ZIP 내부 EXE 각각 의미론7조건과 즉시 종료·재열기 최신 코드 복원 통과. 공개 Docs는 `tft`·`ref_st7735_8`·`uart` 3종의 코드/배선/실제 실행 로그를 대조했으며 개발 앱114장치 Docs와 구분합니다.
- 원본 공개0.24.0→0.25.0의 실제 자동 검색·다운로드/SHA·EXE 교체·새 main 재기동·재열기 통과. 코드·Jellybean·글꼴17·배율1.25·자동 업데이트 설정을 보존했습니다.
- [공개 검증 집계](audits/tinkercad-workbench/evidence/public-verification.json), [화면 해시](audits/tinkercad-workbench/evidence/public-screenshots.json). CI1 실패·CI2 취소·CI3 실패와 모든 앱 검사 후 발생한 보조 manifest 저장 오류/복구는 원본 이력으로 유지합니다. 후속 문서 커밋은 제품 태그·자산을 덮어쓰지 않습니다.

## 0.24.0 캔버스 UX 1단계·공개 배포

2026-10-19. 가이드 Step 1-1~1-5 적용. 커서 중심 줌, 영역 선택/복제, 실시간 인스펙터 DOM 보존, 빵판 캐시, 배선 20색/논리 상태를 구현했습니다. 후속 2~5단계는 포함하지 않습니다. [상세 보고서와 증거](audits/0.24.0-canvas/REPORT.md).

- 374 단위 검사, 기존 52상태 대비와 신규 19상태 대비, 새 UI 13범주 통과. Monaco 빌드 및 npm audit 0건.
- [Windows CI 39186362509](https://github.com/moonsyu/STM-Simulator/actions/runs/39186362509) 두 작업 전체 성공. [v0.24.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.24.0)을 최신 릴리스로 게시했습니다.
- 제품 빌드/태그 커밋 `649d412d16b3ac1174e11434d56a1b7e1790c0bb`, sourceDirty=false, CI 출처 일치. 공개 EXE·ZIP·SHA256·BUILD-INFO·update-manifest 5개 자산과 버전/커밋/해시/latest를 확인했습니다. ZIP 실행 바이너리는 `STM-Simulator.exe` 하나입니다.
- 공개 EXE SHA-256: `1cafaa7669f0782ff339ea1f4a1a2cfaaedb0e8aaef87885c4b7de80999ccf81`. EXE 102,762,858 bytes, ZIP 105,640,391 bytes. 비인증 다운로드와 ZIP 내부 EXE/메타데이터/배포 문서를 대조했습니다.
- 내려받은 공개 EXE에서 13개 통합 범주, 19개 대비 상태(9,962텍스트), Dark/White 2해상도 화면을 통과했습니다. renderer 오류와 저대비 0건. 파일 진단 로그의 버전/종류/해시는 `evidence/public-runtime-log.json`에 보존합니다.
- 단독 EXE와 ZIP 속 EXE 각각 C 의미 7조건 및 편집 직후 종료→재실행 복원을 통과했습니다.
- 공개 0.23.9 EXE의 실제 자동 스케줄러에서 새 릴리스 검색→다운로드→SHA-256 검증→저장/교체→새 버전 재실행을 확인했습니다. 코드, Jellybean, 글꼴 17, 장치 배율 1.25, 자동 업데이트 설정을 보존했습니다. 사용자 앱/프로필은 조작하지 않았습니다.
- 첫 공개 검사에서는 숨겨진 창의 requestAnimationFrame 폴링이 주기적인 GPIO 변화와 맞물려 30초 timeout이 발생했습니다. 제품 변경 없이 검사만 같은 DOM의 실제 MutationObserver 변화(5초 상한)로 수정했습니다. 시작/변화 시각과 DOM 동일성, 초기 실패 증거를 함께 보존합니다. 후속 커밋은 이 검사와 검증 문서만 보완하며 배포 제품 소스/태그/자산을 교체하지 않습니다.

## 0.23.9 감사 결함 수정·공개 배포

2026-10-18. 저장·복구를 포함한 A01~A17 수정과 실제 실행 검증을 완료했습니다. [상세 보고서와 증거](audits/0.23.9-fixes/REPORT.md).

- 365 단위 검사, 독립 GCC/ARM 대조, 114 장치·979 HAL 카드 실행, 701 단선·114 손상 회로 복구, 128 최소 코드 초기화·114 재적용 통과.
- 독립 Electron 저장 오류/빠른 편집/프로젝트 전환/종료 복원, 52 화면 대비 검사, 실제 GCC/GDB/clangd/ARM 도구와 clean npm audit 0 확인.
- [Windows CI 39128144301](https://github.com/moonsyu/STM-Simulator/actions/runs/39128144301) 전체 성공. [v0.23.9 Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.9) 최신 선택과 공개 5개 자산, ZIP 내부 포터블 EXE, 버전/해시/출처 확인. 제품 커밋 `105eab70a2f3cb2bb8151042768eacb62c93f9fc`.
- 공개 EXE/ZIP 각각 C 회귀 7개와 입력 직후 종료·재실행 복원 통과. 공개 EXE Docs 적용·실행 7종의 파일 로그, TFT 전체 픽셀, UART RX/TX 확인.
- 구버전 공개 EXE 사본에서 0.23.8→0.23.9 실제 자동 다운로드·해시 검증·교체·재실행·코드/설정 보존 통과. 사용자 앱은 조작하지 않았습니다.
- 공개 EXE SHA-256: `8aa6bc0deafe4b315242df85f2310c320bce56617bb56cdd6b811486dd18f585`. 이후 문서 커밋은 이 배포를 덮어쓰지 않습니다.

## 0.23.3 기존 HAL 예제·코드 초기화

- 소스 검증: 기존 HAL 원본 40개, 기존 Docs 36개, HAL 카드 308개, 단선 복구 204개, 교차 포트 스테퍼/L298N 실행 통과.
- 단위 검사 310개, 실제 ARM GCC 링크 46개 통과.
- 독립 Electron에서 취소/Esc/undo/redo/핀·회로·파일 보존, 초기화 LED OFF와 재적용 ON, 모터 재배선의 진단 파일 통과.
- 공개 배포 검증 완료: Windows CI [39008820868](https://github.com/moonsyu/STM-Simulator/actions/runs/39008820868) 성공. 공개 EXE Docs 36개 및 코드 초기화/재배선 실행 로그 통과. [상세 보고서](audits/0.23.3-legacy-docs/REPORT.md).
- Release: https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.3 · 빌드 커밋 `7bf2600d78fdfbf85d224969f15bf10e01e8332f`. 공개 EXE/ZIP/체크섬/빌드 정보/매니페스트 5개와 최신 릴리스 선택 확인.
- 공개 STM-Simulator.exe SHA-256: `217f07be77a159e52245390953d50e790092f1faf6e9b8df946cecbb8fb81c40`. 이후 검증 기록 커밋은 배포 코드/버전을 바꾸지 않음.

검증일: 2026-10-17. 작업 경로 `D:\codex\project\STM-Simulator`. 사용자 앱/회로를 조작하지 않고 독립 프로젝트와 숨긴 테스트 프로필을 사용했습니다.

- Docs 반환값 이름 충돌, 버튼 2종 접점 병합, 인코더 에지 누락, 커패시터 PWM 모드, TFT 상태 크기/typed array IPC 문제 수정.
- 단위 검사 299개 통과. 최종 inline·장치 동작·진단 회귀 23개 통과. 수정 관련 HAL/CMSIS 예제 47개 ARM GCC 컴파일·링크 통과. 실물 보드 실행 결과는 아닙니다.
- 전체 장치 114개와 모든 배선 누락·오접속 복구 회로 114개를 실제 시뮬레이터로 실행. 센서 값/버튼/회전 입력을 변경해 출력·통신·전류·메모리·기계 상태 판정.
- 단선 701건의 연결 복구·신호 분리 검사, HAL 카드 979개 선택 API 호출/반환 확인. API 도달과 전체 장치 동작은 별도 판정. 구버전 문제 회로 10개 재적용 후 동작·사용자 코드/함수/파일 보존 확인.
- Bare-metal 274개 삽입·ARM 대상 전환은 통과. 직접 레지스터 코드는 HAL 실행기에서 실행하지 않으며 동작 검증으로 계산하지 않습니다.
- [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38928311749) 및 [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.2) 성공. 태그/빌드 커밋 `dfdd09c86e93cb6273af66d6d6ee5308c2d0b8b2`. GitHub latest `v0.23.2` 확인.
- 공개 EXE, ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json 다섯 자산 검증. 비인증 공개 다운로드, ZIP 내부 EXE, 버전·크기·태그/빌드 커밋·해시·문서 일치 확인.
- EXE 102,751,106 bytes, SHA-256 `f39b30431204776ce37f202ce20f6265d3216baeb190da5009963732e487956b`. ZIP SHA-256 `2b1df0d632c1d6da619e75f746fa77cab407eac0495d75631ed18a1dd0bc9cbb`.
- 내려받은 공개 EXE로 114개 실제 파일 열기 → Docs 버튼 → 실행. 전부 상태 파일 기록, 소스 감사와 main 코드·배선 일치, 실행/페이지 오류 및 전기 단락 없음. 환경값 입력 UI와 UART 송신도 사용. 두 TFT의 20,480개 RGB565 픽셀 전체 해시 확인.
- DS18B20 두 모델 `25.00 → 10.00 → 45.00 C`, 인코더 두 모델 `count=3/edges=12 → count=1/edges=4`, SD `OCR=40ff8000` 실제 공개 EXE 로그 확인.
- [장치별 보고서](audits/0.23.2-device-docs/REPORT.md), results.json, hal-cards.csv와 별도 수정 위치 기록 저장. 원시 테스트 데이터는 `work/test-results/docs-audit-0.23.2` 및 `work/audit-archives/docs-audit-0.23.2.zip`에 보관합니다. 실제 사용자 진단 자료는 포함하지 않습니다.
- 기존에 삽입된 main은 자동으로 변경하지 않습니다. 업데이트 후 해당 Docs를 재적용해야 수정 코드/배선이 반영되며 직접 편집한 관리 영역은 보호합니다.

---

# 검증 기록 — 0.23.1 공개 릴리스

검증일: 2026-10-16. 작업 경로 `D:\codex\project\STM-Simulator`.

- 사용자 자동 저장 데이터의 읽기 전용 사본에서 0.23.0 WritePin 적용 후 main STEP이 비어 있음을 확인. 최신 사본에는 LED 캐소드의 GND 선도 없음. GND 선이 사라진 조작은 확인하지 못함.
- 수정 후 모델 검사 **287개 통과**. 새 회귀 검사에서 main의 SET 점등·RESET 소등, 기존 초기화/사용자 코드/함수 목록/파일 보존, 빵판 GND 누락 복구, PA5 점유 시 핀 재배정과 카탈로그 LED를 확인.
- 실제 저장 사본 두 개에 재적용해 정상 선을 그대로 유지하고 최신 사본의 GND 1개만 추가. LED 모의 전류 **3.9267 mA**, 점등 확인. 사본으로 검증했으며 현재 열린 사용자 회로는 수정하지 않음.
- 두 사본의 적용 결과를 실제 ST HAL/CMSIS와 ARM GCC로 컴파일·링크. 실물 보드 실행 검사는 아님.
- `node scripts/docs-writepin-check.cjs`: 분리된 숨긴 Electron 프로필에서 실제 Docs 카드 버튼, main 삽입, 실행 로그의 점등/소등, 재적용 GND 복구, 이벤트-회로 해시 일치 통과. 사용자 앱 프로필에 접근하지 않음.
- 로컬 진단 단위 검사: 파일 회전, 잘못된/과대 입력 거부, 디스크 실패 복구, 기록 순서와 스냅샷 시점, 웹 환경·저장 실패 시 앱 동작 유지.
- 증거: ignored `work/diagnostics/{all-tests.log,user-project-verification.json,arm-verification.json}`, `work/test-results/docs-writepin-check.json`.
- [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38918319975)와 [Release v0.23.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.1) 게시 성공. 빌드/태그 `99f8f02e578dfc1510fe06a834e111f11f9e4197`, Git 작성자/커미터 및 게시 인증 `moonsyu` 확인. GitHub latest는 v0.23.1.
- 공개 `STM-Simulator.exe`, `STM-Simulator-0.23.1-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 검증. EXE/ZIP 비인증 다운로드, ZIP 내부 EXE, 버전·태그·빌드 커밋·크기·해시·문서 일치 확인. 로컬 `outputs/artifact/`도 해당 ZIP으로 갱신.
- EXE 102,750,052 bytes, SHA-256 `fab499411f0d9c97f907b23ada771b111aed367aaf069acde32644d307ddcd45`. ZIP SHA-256 `c6f9c6646fc27ea414973d86fa9e36d6749f975b2083cdce54bbab7b07d1a36d`.
- 내려받은 공개 EXE를 별도의 숨긴 프로필에서 실제 실행. WritePin 카드 → main SET → 실행 로그의 LED 점등, GND 삭제 후 재적용 복원, main RESET으로 변경 후 소등, 앱 버전 0.23.1의 파일 로그 기록까지 통과. 현재 사용자 앱과 원본 회로는 변경하지 않음.
- 공개 검증 증거: `work/test-results/release-0.23.1-ci.json`, `release-0.23.1-proof.json`, `public-0231-proof.json`. 기존 회로의 빈 STEP은 자동 변경하지 않으므로 업데이트 후 WritePin 카드를 재적용해야 함.

---

# 검증 기록 — 0.23.0 공개 릴리스

검증일: 2026-10-16. Windows x64. 새 회로는 빈 공간으로 시작하고 검색으로 보드 한 개와 빵판 여러 개를 추가합니다. 코드 실행과 Pinout은 기존 단일 보드 방식입니다.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38850545260) 성공. 검증 시 GitHub latest는 v0.23.0입니다.
- 빌드 커밋과 공개 태그: `81fe66f6753a25221b05dba91cc711d02d49af2f`. 작성자·커미터·푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.23.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 비인증 다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP으로 갱신했습니다.
- EXE 102,747,334 bytes. SHA-256 `16c6d108b794f7a856b4889ffd77cb33426c295c962d28ae9de0699cbf925ab4`.
- ZIP SHA-256 `44382be573c940c0a211db705692fb14979c33ce89d4a96de4c2d8623e1bdb14`.
- 공개 EXE를 별도 임시 프로필에서 직접 실행하여 빈 화면, 검색 보드 중복 방지, 빵판 여러 개, 기존 Pinout, 배선 20색, 삭제/되돌리기/재열기, main 내부 Docs 적용 및 LCD 실행을 확인했습니다. Dark/White 12개 화면 상태에서 글자 대비 문제는 없었습니다.
- 증거: `work/test-results/release-0.23.0-proof.json`, `work/test-results/public-023/public-exe-proof.json`, `work/test-results/release-0.23.0-ci.json`.

## 기능 및 회귀 검사

- 모델 검사 **280개** 통과. **114개 검색 항목의 HAL 함수 카드 977개** 적용·미리보기에서 새 함수/파일 없음, 재적용, 기존 GPIO 설정과 사용자 main 코드 보존을 검사했습니다.
- 실제 ST HAL/CMSIS를 사용하는 **381개 HAL/레지스터 예제** ARM 컴파일·링크 통과. 마지막 초기화/이전 코드 호환 변경 후 UART·LCD·SHT31·SD 및 두 UART 사례 **16개**를 추가 컴파일·링크했습니다. 실물 보드 실행 검증은 아닙니다.
- 모든 113종 부품과 보드/기본 빵판 크기 조절, 114개 검색 미리보기, Dark/White 글자 대비, 시스템 테마, 이동/무제한 캔버스, colorscheme 등록, IDE 편집/빌드/실행, HAL 예제, 회로 편집, Docs, USART2 터미널, 자동 업데이트 회귀 검사를 통과했습니다.
- 새 회귀 검사: `tests/empty-workspace-inline.test.js`, `scripts/empty-workspace-ui.cjs`. UI 검사에는 핀 선택 후 새 프로젝트 생성도 포함됩니다.
- Docs는 main에 넣을 문장만 표시합니다. 기존 MX 초기화 함수가 있으면 보완하고 없으면 main에 초기화 본문을 넣습니다. UART/EXTI Docs는 새 콜백 없이 폴링하며, 기존 별도 HAL 예제 메뉴의 인터럽트 예제는 유지합니다.

---

# 검증 기록 — 0.22.0 공개 릴리스

검증일: 2026-10-15. Windows x64 / Electron 44.2.0 / Monaco 0.57.0.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.22.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38709544798). GitHub latest는 v0.22.0입니다.
- 빌드 커밋과 공개 태그: `3e9b3e40059b6ebf98a2f7f7667d2e1e1db9ba48`. 작성자·커미터·푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.22.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 비인증 다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP으로 갱신했습니다.
- EXE 102,742,609 bytes. SHA-256 `110eeb098c245ec0cca46250d90e005194754dbf039cc3f9aaa73c94a25462a0`.
- ZIP SHA-256 `ee0edc3cb2207ddd3a1d75db455561acec434db43c73f802d050415a7773d958`.
- 증거: `work/test-results/release-0.22.0-proof.json`, `work/test-results/public-022/public-exe-proof.json`.

## 구현과 검사 결과

| 항목 | 확인 결과 |
| --- | --- |
| 화면 테마 | 기본 System, Dark/White 직접 선택, 상단 토글 및 System 복귀. OS 색상 media 변경을 브라우저에서 재현하여 자동 전환/수동 고정/재시작 보존 확인. 실제 Windows 개인 설정은 변경하지 않음 |
| 코드 테마 | Dark 기본 Jellybeans, White 기본 GitHub Light Default 6.3.5. 모드별 코드 테마 선택, 등록/수정/내보내기/재시작과 화면 팔레트 독립 확인. 두 원본 SHA-256 및 MIT 고지 보존 |
| 들여쓰기 | 실제 Monaco 키보드 Tab으로 스페이스 4칸 확인. 모델 전환 시 옵션 적용 및 v1 설정 이전 검사 |
| 기본 보드·빵판 이동 | 실제 몸체 드래그, 장착 부품과 내부 경유점 이동, 외부 배선 끝점·핀 좌표, 한 번의 Undo/Redo, Esc 취소와 재시작 보존 |
| 배선 우클릭 취소 | 바닥과 GPIO에서 우클릭 시 작성 중 경유점/미리보기 제거, 기존 배선 보존, GPIO 설정창을 잘못 열지 않음, 취소 후 새 배선 완성 |
| 배치 공간 | 고정 좌표 상한 제거. 음수/6000 초과 보드·빵판 이동, 2핀·다핀 새 부품 배치, 가운데 버튼 팬, 전체 보기와 저장/재시작. 유한수·부품 수·배선 수 검증 유지 |
| 모델 | 전체 273개 통과. 설정 호환/모드 분리/원본 테마 해시/이동 기하 및 경유점 회귀 검사 포함 |
| 글자 대비 | Dark/White 52상태 HTML 글자/placeholder 대비 4.5:1 미만 0건. 상단 버튼·Pinout 카드/footer·검색·설정·다이얼로그·터미널·1024px 창 포함 |
| 시각 확인 | Dark/White 전체 화면, Pinout 및 작은 창 설정을 캡처 묶음으로 확인. 추가 시각 수정 없이 통과 |
| 기존 기능 | 113종 실제 크기 조절, colorscheme 등록, HAL 카탈로그·Docs·main.c 삽입·배선 로컬 UI 통과. 전체 Windows CI에서 미리보기·IDE/편집/HAL/USART2 UI와 업데이트/패키지 검증 통과 |
| 공개 EXE | 다운로드한 실제 단일 EXE에서 새 테마/이동/우클릭/넓은 배치 검사 전체 및 두 테마 12상태 대비 검사 통과. 격리된 테스트 프로필 사용 |

대비 검사는 HTML UI 대상이며 C/C++ 토큰 원본 팔레트와 장치 SVG 도색은 제외합니다. 코드 테마 변환은 지원 C/C++ TextMate 범위이며 VS Code의 전체 문맥/semanticTokenColors를 복제하지 않습니다. 실제 ARM 보드 디버깅과 이전 공개 버전에서 새 버전으로 자동 다운로드·교체하는 전체 경로를 이번 변경에서 다시 실행하지 않았습니다. CI의 포터블 업데이트 도우미/EXE 교체·롤백 검사는 통과했습니다.

## 별도 미해결 감사 항목

앞서 재현한 저장 트랜잭션 실패, 저장 직후 편집 시 미저장 경고 누락, 새 프로젝트의 터미널 경로, 종료 직전 자동 저장 지연 4건은 이번 요청 범위에 포함하지 않았습니다. `docs/NON-DEVICE-AUDIT.md`에 원인·코드 위치·재현·수정 방향을 보존했습니다.

이 게시 후 기록은 같은 버전의 문서 커밋으로 남기며 공개 태그/자산을 덮어쓰지 않습니다. 0.19.0 이하에서 고정 EXE 이름으로 전환하려면 0.20.0 이상을 한 번 수동 다운로드합니다.


## 0.23.4 지정 UI 제거·단축키·보드 초기화

- 단위/모델 312개 통과. `controls-reset-check.cjs`의 독립 Electron 프로필에서 제거된 UI, Ctrl+F/R, W 실제 배선, Alt+0 크기, 패널 이동/복원, 초기화 취소/Esc/코드 보존/undo/redo/재시작을 검증했다.
- F11의 helper 입력 3, F10 후 doubled=6, Shift+F11 반환 후 counter=7을 확인했다. F6 일시정지와 Shift+F5 정지 및 유휴/모달에서의 잘못된 실행 방지를 검사했다. 같은 단축키로 실제 Windows GCC/GDB 진입/단계 실행/종료도 검사했다.
- 파일 로그: `work/test-results/controls-reset-dev.json`, `controls-reset-unit.log`. UI 상태와 앱 `board.reset`, `debug.command`, `debug.paused` 이벤트를 보존한다.
- 시각 검사: `controls-visual-check.cjs`, Dark/White 1360×900 및 1024×640. 숨김 Electron의 모달 화면 캡처 지연은 headless 브라우저의 동일 화면 검사로 분리했다. 실제 기능 검증은 Electron에서 수행했다.
- 공개 Release/EXE 검증 완료: [0.23.4](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.4), [Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/39013524275). 공개 EXE에서도 9개 기능 검사와 실제 Windows GDB 단계 실행 통과. [보고서](audits/0.23.4-controls/REPORT.md).
- 빌드 커밋 `69ab8d988a347559f7d54f7c30cafcb006ff260f`, EXE SHA-256 `c5117ac8e5c31a560af81847c742d8d5dddcad9cc535abdccb4f10869476d61e`. 5개 배포 자산과 최신 Release 선택 검증.


## 0.23.5 미사용 핀 별칭 제거

- 단위/모델 314개, ARM 컴파일·링크 122개, 독립 Electron 14개 및 공개 EXE 동일 검사 통과.
- 초기화 후 LD2 매크로 제거, Pinout 라벨 보존, LED OFF 0 A → Docs 재적용 ON 약 3.93 mA 확인.
- Windows 전체 CI와 공개 5개 자산·태그 커밋·해시·최신 릴리스 확인. [보고서](audits/0.23.5-pin-aliases/REPORT.md).


## 0.23.6 코드 초기화 전수 정리

- 단위 322개, 초기화 모델/ARM 빌드 128개, 장치 Docs 재적용 동작·회로 보존 114개 통과.
- 개발/공개 EXE에서 초기화 128개와 기본 동작 14개 검사 통과. 로그에 무출력·고장 없음·LED OFF/ON 확인.
- Windows 전체 CI와 공개 5개 자산·버전·커밋·해시·latest 확인. [보고서](audits/0.23.6-minimal-reset/REPORT.md).
