# 0.23.5 미사용 핀 별칭 제거

- 원인: HAL main은 실제 GPIO 상수를 쓰면서 핀 라벨 매크로를 무조건 생성했다. 코드 초기화도 해당 생성기를 호출했다.
- 수정: HAL main 및 신규 프로젝트 main.h에서 별칭 자동 생성을 제거. Pinout 라벨과 기존 사용자 헤더는 보존.
- 단위/모델 314개 통과. 구버전 LD2 정의 제거·라벨 보존·생성 HAL 점멸 포함.
- 독립 Electron 14개 검사 통과. 초기화 LED OFF 0 A, Docs WritePin 재적용 ON 약 3.93 mA. main.c 별칭 제거, 새 프로젝트 main.c/main.h 확인. 취소/Esc/undo/redo/파일 보존 및 스테퍼/L298N 실행도 유지.
- 원본 로그: work/test-results/pin-alias-unit.log, pin-alias-dev.log, code-reset-dev.json. 실제 사용자 회로는 조작하지 않음.
- ARM 링크·Windows CI·공개 배포 검증은 진행 중. 시뮬레이터 실행과 실물 보드 검증을 구분한다.
