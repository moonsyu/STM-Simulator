# PIN 옵션 · HAL 코드 적용 · 실행 재검사

2026-10-19. **최종 UI 362/362 시나리오 통과, 생성 HAL 코드 실제 실행 342건 확인 완료.** 입력 검증 19개와 용도 선택 검사 1개는 실행 건수에서 제외한다.

## 검사 대상과 구버전 구분

- 작업 위치: `D:\codex\project\STM-Simulator`.
- 기준 커밋: `5b74ec9586820f082249eee935b8696c2fa7167c`. package/실제 Electron 앱 버전은 `0.25.0`이고, 이번 수정이 있는 개발 소스(`sourceDirty=true`)를 실행했다.
- 이번 검사는 공개 배포 EXE 검사가 아니며, 버전 변경·원격 게시·Release 갱신은 수행하지 않았다. 같은 버전 번호만 보고 공개 실행 파일과 동일한 소스로 판단하면 안 된다.
- 사용자 앱·회로·프로필을 사용하지 않았다. 각 실행은 새 독립 프로필을 사용하고 버전/실행 ID/소스 해시를 남겼다.
- 최종 UI 실행 시각: 2026-10-19 17:08:41–17:25:02 KST, 약 16분 22초. 시작/종료 소스 SHA-256은 `1b43991b345387c0105aac31e2b3e3eb6b11cddac11ee19b44fe1604f0363e32`로 동일했다. 이 해시는 Git 추적 대상 `src/`, `desktop/`, `package.json`의 내용이며 전체 저장소 파일을 포괄하지 않는다.
- 이전 `work/test-results/mcu-defaults-smoke.json`은 0.24.0 기록이다. SHA-256 `c60c13fea7e3f66beec148b7b4f7b233ab25e9ab366a5f47d403a37ab1bdad9f`가 검사 전후 동일함을 확인했고 파일을 덮어쓰지 않았다.

## 발견한 문제와 수정

| 재현 조건 | 문제 | 수정과 판정 근거 |
|---|---|---|
| 핀 라벨 입력 → TIM 모드 변경 | 아직 저장하지 않은 라벨 소실 | 편집 내용을 먼저 반영한 뒤 화면 갱신 |
| 핀 라벨·옵션 입력 → 충돌하는 USART 용도 선택 | 실패한 용도 변경과 함께 기존 편집 내용까지 사라짐 | 실패한 배정만 취소하고 라벨·Pull·에지·초기값 보존 |
| NVIC priority / PSC / ARR / CCR 비우기 → 적용 | 빈 값을 0으로 저장 | 빈 입력과 유효한 0을 구분하고 필드명 포함 오류 표시. 클록 빈 입력의 오류 안내도 명확화 |
| PWM CCR 빈값·소수·범위 초과 → 다른 모드 | 오류 입력란이 숨겨져 현재 화면에서 수정하기 어려움 | 전환을 차단하고 PWM·원래 입력값 유지, 오류 표시 |
| 첫 IRQ 콜백에서 다른 IRQ 비활성화 | 이미 추출한 후속 콜백이 실행되고 pending 소멸 | 매 콜백 뒤 활성 상태 재확인, 차단된 pending 보존·재개 |
| 첫 IRQ 콜백에서 전역 IRQ 차단 | 남은 콜백이 계속 실행 | 전역 마스크 재확인, 재활성화 후 나머지 실행 |
| 첫 IRQ 콜백에서 다른 pending IRQ priority 변경 | 변경 전 순서로 실행 | 매 콜백 뒤 현재 우선순위로 다음 작업 선택 |
| Analog/ADC 핀에서 Pull 설정·디지털 읽기 | 내부 Pull이 작동하고 외부 HIGH가 디지털 1로 읽힘 | 내부 Pull과 디지털 버퍼 비활성화, 디지털 읽기 0, 외부 전압/ADC 측정 경로 유지 |

Analog 기준은 [ST RM0390 Rev9 §7.3.12, p.182](https://www.st.com/resource/en/reference_manual/dm00135183.pdf)이다. 공식 PDF 검색 색인에서 해당 절·페이지와 문장을 확인했다. 원본 다운로드는 타임아웃되어 PDF 파일/원본 해시는 확보하지 못했고, [근거 기록](evidence/RM0390-source.json)에 그 상태를 명시했다.

## 결과

| 검사 | 결과 | 근거 |
|---|---|---|
| 최종 소스 전체 단위 검사 | 406/406 통과, 실패·skip 0 | [전체 출력](evidence/unit-final.log) |
| 독립 생성 HAL/SimulationSession 감사 | 수정 전 274/277 → 수정 후 277/277 | [수정 전](evidence/nvic-before.json), [최종](evidence/nvic-final.json) |
| Analog 최종 사전 UI 검사 | 11/11 통과: Analog6, ADC3, 순환 priority2 | [사전 검사](evidence/interim-probe4-analog.json), 전체 행렬 결과와 구분 |
| MCU 기본값 실제 UI | 설정·생성·실행·저장 복구 통과. TIM3 PSC=15/ARR=999/CCR=250에서 PA6 평균 출력 0.825V, fault=false | [실행 정보](evidence/mcu-defaults-final.json), [진단 로그](evidence/mcu-defaults-events.jsonl) |
| 최종 PIN UI 전체 행렬 | **362/362 통과**, 실행 342건, 용도 선택 370항목 | [최종 요약](evidence/ui-final.json), [독립 증거 검증](evidence/verification.json) |

342건의 생성/실행 코드 684파일은 각각 기록한 SHA-256과 일치했다. 실행별 JSONL 342개에서 시작 1회·상태 1회 이상·정지 1회·동일 프로젝트 해시를 확인했다. 전체 로그의 실제 시작은 342건, 주기적 상태 기록을 포함한 상태 로그는 393건이다. 저장·복구 파일 85개(실행 검사 84개와 라벨 검증 1개)의 해시도 확인했다.

Renderer 오류, 진단 대기열/기록 실패 경고, 실행 중 console 오류, 회로 fault·경고는 0건이다. 잘못된 입력을 의도적으로 거부한 console error 12건은 정상 검증 증거로 보존했다. 따라서 전체 로그에 오류 문자열이 전혀 없다는 의미는 아니다.

최종 원본 1,113파일은 [실행 증거 ZIP](evidence/ui-runtime-evidence.zip)에 보관했다. 생성/실행 C, 사례별·전체 JSONL, 저장 프로젝트, 요약을 포함하며 Electron 사용자 프로필은 제외했다. [ZIP 내용 검증](evidence/archive-verification.json)과 [증거 체크섬](evidence/SHA256.txt)으로 원본 일치 여부를 확인할 수 있다.

## 최종 UI 행렬의 판정 방식

- 실제 설정 화면의 select/fill/click으로 변경하고, 요청한 값과 저장된 MCU 설정을 직접 비교한다. 저장된 값과 생성 코드끼리만 일치한다고 통과시키지 않는다.
- GPIO 50개의 용도 후보 370개는 선택 가능 여부를 검사한다. 주변장치 모든 대체 핀의 전기적 동작 검사가 아니다.
- Reset/Input/Output/Analog/Reserved × Pull3 × 초기 LOW/HIGH를 GPIO50개에 적용한다. 30프로젝트/1,500핀 설정의 생성 코드·핀 전압·논리 읽기·실행 상태 및 파일 저장/다시 열기를 확인한다.
- EXTI 7개 IRQ 그룹의 대표 핀에서 에지3 × Pull3 × 초기값2 × priority16을 적용한다. 활성288프로젝트/2,016핀 설정, 비활성18프로젝트/126핀 설정이다. 각 그룹이 모든 priority 값을 지나도록 서로 다른 priority를 순환 배정해 실제 콜백 순서도 판정한다.
- 같은 경로에서 NVIC 차단·pending 재개·RISING/FALLING/CHANGE 콜백 수를 확인한다. 별도 3시나리오에서 콜백 중 다른 IRQ/전역 차단·우선순위 변경을 확인한다.
- ADC 3시나리오는 UI에서 ADC1_IN0을 선택하고, 3.3V 전원을 저항으로 분압한 0.33/1.65/3.0V에서 12비트 측정과 디지털 읽기 0을 확인한다.
- validation19시나리오는 라벨·전환·취소·빈 숫자·우선순위 범위·무효 설정의 코드 생성 차단 등을 확인한다.
- 생성된 초기화 코드는 보존하고 관찰용 출력/콜백을 사용자 영역에 삽입한다. 생성기의 자동 Toggle 데모는 초기값 관찰에 영향을 주지 않도록 관찰 코드에서 대기로 바꾼다. 원본 `*-generated.c`와 실제 실행한 `*-executed.c`를 따로 보관한다.
- 실행별 고유 완료 표식, `simulation.started`, 동일 `projectSha256`, 정지 메시지, `simulation.state`를 연결한다. 페이지 오류·진단 대기열 경고·회로 fault도 검사한다.
- 전체 완료는 기대 시나리오 수, 고유 ID 수, 각 범위의 실제 수행 수, 모든 판정 성공, 시작/종료 소스 해시 동일성을 확인한 뒤에만 표시한다.

## 보존한 실패·중간 결과

- [최초 입력/라벨 실패](evidence/before-validation.json), [숨은 CCR 실패](evidence/before-hidden-ccr.json), [Analog 실패](evidence/before-analog.json)를 그대로 보존했다.
- [runtime-probe2](evidence/instrumentation-queue-failure.json)는 계측 메시지를 짧은 시간에 많이 보내 기존 진단 대기열 64건 한도로 일부 로그가 빠져 실패했다. 출력은 단계별 한 줄로 묶고 실행 경계를 보강했다. 제품의 진단 용량 제한을 제거한 것이 아니다.
- [첫 전체 실행](evidence/interrupted-full-run1.json)은 Analog 명세 오류를 발견해 계획적으로 중단했다. [중단 사유](evidence/interruption.json)를 보존했고 전체 성공으로 집계하지 않는다.
- `interim-*`은 수정 과정의 부분 검사다. 최종 소스 전체 UI 결과를 대신하지 않는다.

## 범위와 재실행

실제 Electron 앱의 HAL/C 소스 시뮬레이션 검사다. 실물 STM32, ARM 명령 실행, NVIC 중첩 선점/subpriority 또는 UART/TIM의 모든 대체 핀 전기 동작을 전수검사한 결과는 아니다. Speed/AF는 생성기가 결정하며 별도 UI 선택란이 없으므로 존재하지 않는 수동 옵션까지 검사했다고 주장하지 않는다.

전체 재실행은 `npm run test:pin-options:ui`, MCU 기본값은 `npm run test:mcu-defaults:ui`를 사용한다. 기본 출력 폴더에 버전·실행 ID를 포함하므로 구버전 요약을 덮어쓰지 않는다. Windows CI에는 `PIN_OPTIONS_SCOPE=validation,callbacks,adc` 회귀 검사와 실패 증거 수집 경로를 추가했다. 원격 CI를 이번에 실행했다는 의미는 아니다.

내부 코드 위치와 후속 수정 지점은 [FIX-MAP](FIX-MAP.md), 진행 이력은 [LOG](LOG.md)에 기록한다.
