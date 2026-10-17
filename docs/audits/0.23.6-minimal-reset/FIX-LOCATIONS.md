# 수정 위치

- src/code-reset.js: resetMainCode — 초기화 전용 생성, 스케치/호스트 최소 코드.
- src/hal-generator.js: generateMain minimal 옵션 — 미사용 헤더·출력·콜백·빈 GPIO 제거, 활성 설정 보존.
- src/mcu-config.js: generateHal — 생성 옵션 전달.
- src/runtime.js: HAL main의 상수 참·빈 최상위 while만 유휴 처리. 이벤트·인터럽트·debug 재개 유지.
- src/device-assistance.js: bindParts — 소유 정보가 지워진 회로를 GPIO 네트로 재식별. allocatePins — 기존 라벨 보존 및 중복 방지.
- tests/reset-minimal.test.js: 최소 코드, 실제 초기 출력, 유휴 이벤트/debug, TIM/EXTI, 부품 재사용 회귀.
- scripts/reset-audit-cases.mjs: 128개 초기화 조건·미사용 코드 검사.
- scripts/code-reset-audit.mjs: 초기화 상태·114개 Docs 재적용 동작 로그.
- scripts/check-main-c.mjs --reset-only: 128개 ARM 컴파일/링크, unused 경고 오류 처리.
- scripts/code-reset-check.cjs --all-resets: 실제 Electron/공개 EXE 버튼·실행·진단 로그.
