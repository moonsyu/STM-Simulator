# 수정 위치

- src/hal-generator.js: generateMain — 미사용 핀 라벨 별칭 생성 제거.
- src/ide-ui.js: project-form submit — 신규 main.h의 같은 자동 정의 제거.
- tests/code-reset.test.js: 구버전 매크로 제거, MCU/사용자 헤더 보존, GPIO 실행 회귀.
- scripts/code-reset-check.cjs: LD2가 있는 구버전 입력, 초기화/재적용/새 프로젝트의 별칭 부재와 실제 상태 로그.
- scripts/check-main-c.mjs: 검증용 main.h에도 별칭을 넣지 않아 숨은 의존성 방지. 검증용 드라이버 목록에 CAN/I2S/USART를 추가해 실제 빌드 목록과 정합.
