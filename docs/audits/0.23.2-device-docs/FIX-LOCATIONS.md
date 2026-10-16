# 결함 수정 위치 — 0.23.2

사용자 응답에는 코드 위치를 나열하지 않고 여기에 보관합니다. 이전 실패 증거는 `../2026-10-17-device-docs/`에 유지합니다.

| ID | 수정 위치 | 수정과 회귀 기준 |
|---|---|---|
| DOCS-101 | src/c-inline.js:8,22; tests/docs-runtime-regressions.test.js | 반환 임시 변수/지역 이름/호출부 식별자의 충돌 방지. 21×2=42, DS18B20 10℃/45℃, SD OCR=40ff8000 실제 출력. |
| DOCS-102 | src/catalog-examples.js:20 | 합쳐진 버튼 접점의 원래 빵판 연결을 추가 선으로 유지. 두 버튼의 눌림/해제와 재배선 후 출력 확인. |
| DOCS-103 | src/device-docs-data.js:8; src/catalog-examples.js:11 | 기존 timer_encoder 레시피 사용. TIM4 하드웨어 계수 12→4 에지/3→1칸, main 대기 중에도 보존. 추가 함수/파일 없음. |
| DOCS-104 | src/hal-examples.js:33 | TIM2 mode=pwm 명시. 세 커패시터 PWM_Init 카드의 실제 HAL_OK 반환, 전체 예제의 충전 전압 검사. |
| DIAG-101 | src/diagnostics.js:5; desktop/diagnostics.cjs:7,29; tests/diagnostics.test.js | 렌더러의 typed array를 일반 배열로 보존한 뒤 메인 프로세스에서 전체 SHA-256+길이+nonzero+표본 기록. IPC 전달을 포함한 TFT 로그 검사가 CI에 추가됨. |

단위 검사에서 메인 프로세스에 원본 배열을 직접 전달하는 것만으로는 충분하지 않았습니다. 첫 로컬 EXE 재검사에서 렌더러 JSON 변환이 typed array를 숫자 키 객체로 바꾸는 문제가 드러났습니다. 회귀 검사를 실제 renderer snapshot→sink 경로로 바꾸고, 숨긴 Electron 앱 및 최종 공개 EXE의 파일 로그로 재확인합니다.

## 검증 진입점

- scripts/docs-audit/audit.mjs: 114개 동작/손상 복구, 모든 개별 HAL 카드 호출/반환.
- scripts/docs-audit/migration.mjs: 이전 버전의 독립 회로 10개 재적용.
- scripts/docs-audit/packaged.cjs: 실제 Docs 버튼/입력 UI/실행/진단 파일. `--dev`는 개발 Electron, 기본은 EXE.
- scripts/docs-audit/verify.mjs: 모든 항목과 카드의 누락·중복·실패 검사. `--public`은 공개 EXE 해시 대조.
- .github/workflows/build-windows.yml: 전체 Windows 검사 후 게시. TFT/UART의 Electron 로그 회귀 포함.

새 버전 설치만으로 이미 생성된 main 코드를 덮어쓰지 않습니다. 기존 회로는 Docs를 재적용하여 갱신합니다. 사용자가 직접 편집한 관리 영역은 기존 보호 규칙을 따릅니다.
