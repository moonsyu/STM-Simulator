# PIN 옵션 수정 위치와 검사 연결표

2026-10-19 내부 후속 수정용 기록입니다. 사용자 답변에 코드 위치를 나열하는 대신 이 문서에 보관합니다. 위치는 기준 커밋 `5b74ec9586820f082249eee935b8696c2fa7167c` 위의 현재 작업 파일을 읽어 확인한 줄 번호입니다. 후속 변경으로 줄 번호가 달라지면 함수명과 검사 ID로 다시 찾습니다.

## 현재 검사 상태

| 검사 | 상태 | 근거와 범위 |
| --- | --- | --- |
| 전체 단위검사 | **406/406 통과** | [unit-final.log](evidence/unit-final.log). 이번 NVIC 4개, Analog 5개 회귀검사를 포함합니다. |
| 생성 HAL C / SimulationSession 직접 검사 | **277/277 통과** | [nvic-final.json](evidence/nvic-final.json). 실제 Electron 설정 조작과 구분합니다. Pull 전압 기록은 전압 판정 통과를 뜻하지 않습니다. |
| 실제 UI 전체 행렬 | **362/362 통과, 생성 HAL 실행 342건** | [ui-final.json](evidence/ui-final.json), [verification.json](evidence/verification.json). `completeMatrix=true`이며 용도 선택 370항목은 실행 시나리오 수와 별개입니다. |
| UI 수정 전 실패 및 중간 검사 | 보존 | [before-validation.json](evidence/before-validation.json), [before-hidden-ccr.json](evidence/before-hidden-ccr.json), [before-analog.json](evidence/before-analog.json), [interim-after-validation.json](evidence/interim-after-validation.json). 중간 성공을 전체 완료로 사용하지 않습니다. |

## 수정 위치

| ID | 현재 코드 위치 | 재현 조건과 원인 | 수정 내용 | 검사 연결 |
| --- | --- | --- | --- | --- |
| PIN-01 | `src/pinout-ui.js:37`, `:38` — 타이머 모드 변경 handler | PA5 사용자 라벨을 입력하고 TIM2 모드를 변경하면 현재 핀 입력을 동기화하지 않은 채 재렌더링해 라벨이 사라졌습니다. | 모드 변경 전 `sync()`로 현재 핀의 라벨·Pull·에지·초기 출력을 draft에 보존합니다. | `scripts/pin-options-ui-check.cjs:67`의 `validation-label-timer-mode`. |
| PIN-02 | `src/pinout-ui.js:26` — 핀 용도 변경 rollback | PA3를 GPIO_Output으로 점유한 뒤 PA2 라벨을 입력하고 USART2_TX를 선택하면 RX 충돌이 발생합니다. 이전 snapshot이 입력 동기화보다 먼저 만들어져 라벨까지 취소됐습니다. | 현재 입력을 동기화한 snapshot에 이전 function만 복원합니다. 실패 시 function·자동 배정 부작용은 되돌리되 직전 라벨·Pull·에지·초기 출력은 유지합니다. | `scripts/pin-options-ui-check.cjs:68`의 `validation-conflict-retains-edits`. |
| PIN-03 | `src/pinout-ui.js:7`, `:8`, `:19`, `:33`, `:44`, `:45`, `:47`, `:48` — 숫자 읽기·표시·commit | NVIC priority/PSC/ARR/CCR을 비우면 `Number('')`가 유효한 0으로 바뀌었습니다. IRQ 최상위 우선순위나 ARR=0 정지 설정으로 조용히 적용될 수 있었습니다. | 빈값을 NaN으로 유지하고 재렌더링에서도 빈 입력으로 표시합니다. 적용·생성 시 필드명을 포함한 숫자 입력 오류로 차단합니다. timer-clock도 같은 처리를 사용합니다. 명시적 0과 기존 정수·범위 검증은 유지합니다. | `scripts/pin-options-ui-check.cjs:69`의 `validation-empty-*`, `:70`의 `validation-priority-*`, `:74`의 `validation-generate-rejects-empty-priority`. 실제 검사 ID를 기준으로 검색합니다. |
| PIN-04 | `src/pinout-ui.js:37`–`:43` — PWM 이탈 검증 | PWM CCR에 빈값·1.5·타이머 최댓값 초과 값을 입력하고 base/capture/encoder로 바꾸면 잘못된 pulse는 draft에 남고 입력란만 숨었습니다. 이후 적용·생성을 막는 오류를 현재 화면에서 수정할 수 없었습니다. | 기존 모드가 PWM이고 CCR이 잘못됐으면 모드 선택만 PWM으로 되돌립니다. 재렌더링하지 않아 입력값과 수정 위치를 유지하며 필드명·범위 오류를 표시합니다. 실패한 encoder 전환에서는 PSC도 유지합니다. | `scripts/pin-options-ui-check.cjs:64`의 `validation-hidden-ccr-0/1/2`. 별도 순수 handler 검사 36조건: TIM2/TIM3 × 대상 모드 3종 × 빈값/소수/음수/초과/0/최댓값. |
| HAL-01 | `src/hal.js:51`, `:59`–`:69` — `HalAdapter.poll()` | 동시 pending IRQ를 한 번에 ready 목록으로 추출해 실행했습니다. 첫 콜백의 다른 IRQ 차단·전체 IRQ 차단·후속 IRQ 우선순위 변경이 남은 목록에 반영되지 않았습니다. | 각 콜백 이후 현재 NVIC/global mask와 우선순위를 다시 확인해 다음 한 건을 선택합니다. 차단된 IRQ는 pending으로 남깁니다. 콜백이 새로 추가한 작업은 다음 poll로 넘겨 같은 poll의 무한 재등록을 방지합니다. | `tests/hal-nvic-dispatch.test.js:23`, `:33`, `:42`, `:48`. UI는 `scripts/pin-options-ui-check.cjs:126`의 `callbacks-disable-other`, `callbacks-disable-global`, `callbacks-change-priority`. |
| HAL-02 | `src/hal.js:108`, `:113`, `:114` — GPIO 초기화와 Analog 전환 | Analog/ADC1 핀에 저장된 Pull이 일반 디지털 Input/Pull처럼 실행됐습니다. 외부 전압의 디지털 읽기도 살아 있어 Analog 입력 버퍼 비활성화와 달랐습니다. | Analog 전용 런타임 모드로 전환해 내부 약한 Pull과 디지털 입력을 비활성화합니다. 이미 초기화된 GPIO의 Analog/Input 전환을 허용하고 실제 회로 전압과 ADC 측정은 유지합니다. 저장된 Pull 및 생성 코드의 Pull 선택을 임의 변경하지 않습니다. | `tests/hal-analog-mode.test.js:18`, `:46`, `:57`, `:79`. UI는 `gpio-Analog-*`, `adc-analog-0/1/2`. 공식 근거는 [RM0390-source.json](evidence/RM0390-source.json). |
| RUN-01 | `src/runtime.js:183`, `:184`, `:197`, `:204`, `:213`, `:216`, `:218` — `setPinMode()`, `inputLevel()` 및 입력 API | 외부 전압이 높은 Analog 핀에서 digitalRead/HAL_GPIO_ReadPin이 1을 반환하고 에지·pulseIn 경로도 디지털 입력을 사용할 수 있었습니다. | GPIO 모드 변경을 공통화하고 Analog의 디지털 레벨을 0으로 처리합니다. 에지 감지·attachInterrupt 초기 상태·pulseIn에도 적용하되 analogRead와 물리 전압은 유지합니다. 일반 입력으로 돌아오면 디지털 경로와 요청한 Pull이 복원됩니다. | `tests/hal-analog-mode.test.js:31`, `:46`, `:57`, `:79`. UI의 Analog/ADC 전압·IDR·런타임 상태 검사와 연결합니다. |

## 보존 조건과 후속 확인 위치

- `src/pinout-ui.js:17`의 `open()`은 프로젝트 MCU를 복제해 draft를 만듭니다. 닫기/취소는 원본 MCU·코드를 변경하지 않습니다. `validation-cancel-preserves-project`가 이를 확인합니다.
- `src/pinout-ui.js:14`, `:15`, `:19`는 HAL 생성 확인 후 검증과 적용을 수행합니다. 오류 시 기존 코드·MCU를 유지하는지 `validation-generate-rejects-empty-priority`로 확인합니다.
- `src/pinout-ui.js:23`의 핀 전환은 현재 핀을 먼저 동기화합니다. `validation-label-pin-switch-save`는 핀 이동·생성·저장·재열기까지 연결합니다.
- `src/mcu-config.js:21`의 `validateMcu()`는 이번에 변경하지 않았습니다. priority 0~15 정수, GPIO 옵션, PSC/ARR/CCR 범위의 기존 검증을 유지합니다. `src/project.js:80`의 저장 복구 검증도 그대로 사용합니다.
- 실제 UI 전체 판정은 `scripts/pin-options-ui-check.cjs:138`–`:141`에 있습니다. 모든 요청값을 저장값 및 생성 코드와 비교하고, 런타임 진단 누락·renderer 오류·검사 중 소스 변경이 없는지 확인합니다. 최종 362개 완료 및 `completeMatrix=true`를 확인했습니다. 소스 동일성 해시 범위는 Git 추적 `src/`, `desktop/`, `package.json`입니다.

## 증거와 재실행

- 수정 전 NVIC 실패: [nvic-before.json](evidence/nvic-before.json). 수정 후 직접 실행: [nvic-final.json](evidence/nvic-final.json).
- 수정 내역 snapshot: [product-changes.patch](evidence/product-changes.patch). 현재 줄 번호가 달라졌을 때 함수명과 함께 대조합니다.
- 의도적으로 중단한 기존 전체 실행: [interrupted-full-run1.json](evidence/interrupted-full-run1.json), [interruption.json](evidence/interruption.json). Analog 오라클 수정 전 기록이며 전체 성공 근거가 아닙니다.
- 전체 단위검사: `npm test`. PIN UI 전체 검사: `npm run test:pin-options:ui`. 독립 프로필을 사용하는 스크립트이지만 다른 Electron 회귀검사와 실행 시간을 조율합니다.
- Windows CI 등록 범위는 `.github/workflows/build-windows.yml:110`의 `validation,callbacks,adc`입니다. 로컬 전체 362개 행렬과 구분하며, 이 문서는 이번 원격 CI 또는 새 Release 게시를 완료했다고 주장하지 않습니다.
