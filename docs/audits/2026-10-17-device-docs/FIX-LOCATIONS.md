# 재현된 결함 수정 위치

검사 기준: 0.23.1, b17f289. 이번 작업은 감사이며 아래 생산 코드는 수정하지 않았습니다. 사용자 응답에는 코드 위치를 나열하지 않고 이 파일에 보관합니다.

| ID | 우선순위 | 대상 | 수정 시작 위치 | 확인된 원인 / 재검증 기준 |
|---|---|---|---|---|
| DOCS-101 | P1 | DS18B20 2종, SD 카드 | src/c-inline.js:20, 22, 23, 55 | 반환 임시 변수 `id_value`와 원본 지역/매개 변수 `value`의 변환 이름이 같음. 내부 블록이 반환 변수를 가려 바깥 반환값은 0. 이름 공간을 분리하고 중첩 helper도 충돌 검증. |
| DOCS-102 | P1 | 2핀 순간 버튼, KY-004 3핀 | src/catalog-examples.js:19, 20; src/catalog-defs.js:10 | 4핀 기본 모델의 장착점을 2개 접점으로 병합할 때 중복 키가 덮어써짐. 원본 회로의 PA10/GND 연결이 기준 네트에서 사라짐. 참조 예제와 Docs 모두 눌림/해제 검증 필요. |
| DOCS-103 | P1 | 기존 인코더, KY-040 | src/device-inline-example.js:18; src/device-examples.js:226; src/device-motion.js:71 | EXTI 콜백을 main 폴링으로 바꾸지만 2ms 간격의 에지를 main 루프가 놓침. 사용자 요구인 별도 함수 금지를 유지하면서 빠른 입력 처리 또는 타이머 엔코더 등 동등 동작 필요. count 3/edges12 → count1/edges4가 기준. |
| DOCS-104 | P2 | 커패시터 3종의 HAL_TIM_PWM_Init 카드 | src/hal-examples.js:33; src/device-inline-example.js:44; src/device-assistance.js의 installCode | 원본 PWM 예제의 TIM2 설정에 mode가 없어 base로 정규화됨. 초기화 재생성 시 PWM_Init 대신 Base_Init만 호출. 선택 카드 preview와 실제 삽입 호출 일치 검증. |
| DIAG-101 | P2 | TFT, ST7735S 8핀 | src/app.js:327; desktop/diagnostics.cjs:14 | 전체 framebuffer와 상태를 이벤트에 넣어 249,305자로 커짐. 65,536자 제한에 거절되고 simulation.state가 하나도 남지 않음. 픽셀 요약/해시 또는 별도 제한된 스냅샷 필요. 제한 자체를 무조건 제거하지 말 것. |

## 재현 데이터

- `work/test-results/docs-audit/core-<type>.json`: 전체 적용 및 손상 배선 복구 실행, 원본 예제 비교.
- `work/test-results/docs-audit/cards-<type>.json`: 개별 HAL 카드별 생성과 실제 호출/반환/장치 상태.
- `work/test-results/docs-audit/<type>.stm32lab`: 그대로 열어 재현할 수 있는 자동 배선 및 main 코드.
- `work/test-results/docs-audit/packaged-<type>.json`: 공개 EXE가 기록한 진단 이벤트.
- `work/test-results/docs-audit/inline-name-collision.json`: `twice(21)` 기대42 / 관측0 최소 재현 및 생성 코드.
- `work/test-results/docs-audit/diagnostic-limit.json`: TFT 두 모델의 실제 상태 크기와 저장 거부 오류.

SD의 SPI trace에는 `TX ff · RX 01`이 기록되지만 바로 `SD no card / CMD0 timeout`을 출력합니다. 배선/전원 실패로 단정하지 말고 반환값 전달을 확인해야 합니다.

## 후속 완료 기준

1. 위 기능 실패 7개와 함수 카드 미반영 3개를 각각 수정하고 같은 입력 시퀀스로 재검증.
2. 114개 전체 적용/배선 복구와 977개 HAL 카드 재실행. 구조 보존 및 기존 정상 예제 회귀 확인.
3. 공개 EXE의 TFT 상태 로그가 저장되며 픽셀 검증과 연결되는지 확인.
4. 버전을 올려 수정 배포할 경우 저장소 지침에 따라 소스·Release 및 5개 산출물 함께 게시.
