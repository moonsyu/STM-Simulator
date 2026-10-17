# 0.23.5 미사용 핀 별칭 제거

- 원인: HAL main은 실제 GPIO 상수를 쓰면서 핀 라벨 매크로를 무조건 생성했다. 코드 초기화도 해당 생성기를 호출했다.
- 수정: HAL main 및 신규 프로젝트 main.h에서 별칭 자동 생성을 제거. Pinout 라벨과 기존 사용자 헤더는 보존.
- 단위/모델 314개 통과. 구버전 LD2 정의 제거·라벨 보존·생성 HAL 점멸 포함.
- 독립 Electron 14개 검사 통과. 초기화 LED OFF 0 A, Docs WritePin 재적용 ON 약 3.93 mA. main.c 별칭 제거, 새 프로젝트 main.c/main.h 확인. 취소/Esc/undo/redo/파일 보존 및 스테퍼/L298N 실행도 유지.
- 원본 로그: work/test-results/pin-alias-unit.log, pin-alias-dev.log, code-reset-dev.json. 실제 사용자 회로는 조작하지 않음.
- 별칭 없는 main.c/main.h로 ARM 컴파일·링크 122개 통과. Windows CI·공개 배포 검증 완료. 시뮬레이터 실행과 실물 보드 검증을 구분한다.

- 독립 ARM 검사의 드라이버 목록에서 CAN/I2S/USART가 빠져 CAN 예제 링크가 중단됨. 제품의 실제 ARM 빌드와 같은 드라이버 목록으로 검증 도구를 보완한 뒤 122개 모두 통과했다.

## 공개 배포 확인

- Windows 전체 CI 성공: https://github.com/moonsyu/STM-Simulator/actions/runs/39050535848
- 공개 EXE에서 동일 14개 검사 통과. 초기화 OFF 0 A → Docs 재적용 ON 약 3.93 mA, 별칭 제거 및 새 프로젝트 검증.
- EXE/ZIP/SHA256.txt/BUILD-INFO.json/update-manifest.json, ZIP 내부 실행 파일명·해시, 최신 릴리스 v0.23.5 대조 통과.
- 빌드 커밋: `10b3b6f286991505ab28eea25a6c3e1df5fe1abb`
- EXE SHA-256: `82b2003ae13ea04cf35448ad780efc14ec30fb626bc5ae6303e2bdd1c3fb213b`
- 전체 재현 로그 묶음: `work/audit-archives/pin-aliases-0.23.5.zip`. 공개 자산과 태그는 후속 검증 기록으로 덮어쓰지 않는다.
