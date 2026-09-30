# 현재 검증 기록 — 0.13.0 (L298N 듀얼 모터 제어)

- 검증일: 2026-09-30.
- 환경: Windows x64, Node.js 24.19.0, Electron 44.2.0, Playwright 1.58.2.

## 변경

- L298N 듀얼 H 브리지, 별도 2핀 DC 모터, 6~24 V 외부 DC 전원 추가. 총 부품 35종·HAL 예제 32개.
- L298N의 VM·GND·5V·ENA·IN1~4·ENB·OUT1~4를 독립 단자로 제공. 두 모터와 외부 전원은 실제 연결망을 통해 계산.
- ENA/ENB PWM, 정역회전, 동일 입력 제동, EN LOW 고임피던스·자유 정지 및 회전/rpm 표시.
- 전원 누락, 공통 GND, 잘못된 TTL 입력, 출력·전원 2 A 초과 진단.
- HAL 예제: 외부 12 V·별도 논리 5 V, PA0/PA1 TIM2 1 kHz, PB4~PB7 방향 제어. 모터별 듀티·방향 전환·제동·자유 정지 자동 반복.
- 기존 전체 검사에 남아 있던 부품/예제 개수 기대값 및 자동 저장 전 배선 접근 대기 조건 수정.

## 검증 결과

- 모델 테스트: 178개 전체 통과. L298N 전용 8개 포함.
- L298N 모델: 부품 검색·저장·회전 단자, 두 채널 전체 방향 진리표, 출력 고임피던스, 누락 전원·공통 GND, TTL 중간 레벨, 단락 전류, 전원 부하 전류, 배선 반전/단절, PWM 듀티·방향 전환·제동·0/100% 검증.
- Electron UI: 전체 13개 스크립트 통과. 부품 검색·배치, 예제 로드, 회로 편집·저장, 통신·센서·타이머, 파형, 수동 부저, L298N 화면·속성·방향 전환·전원 누락 포함.
- 실제 ARM GCC 14.3/ST STM32CubeF4 V1.28.3: 기본 main.c와 HAL 예제 32개, 총 33개 컴파일·링크 통과.
- 빌드: Windows x64 portable 생성 및 build:artifact 검증 통과. 신규 모듈 원본/패키지 바이트 일치, EXE·아이콘·Electron/Chromium 라이선스·패키지 제외 항목 확인.
- 배포 EXE: L298N 전용 UI 및 기존 portable smoke 전체 통과. EXE 추출·시작, 모터 방향·제동·자유 정지, 전원 속성 저장/복원, 전원 누락, LED·LCD·UART·I²C·SPI·PWM·DMA 확인.
- 실물 STM32 보드·L298N·모터 실행은 미실시. 모델 한계는 [HAL API](HAL-API.md)의 L298N 항목 참조.

## 배포 파일

- EXE: outputs/artifact/STM-Simulator-0.13.0-win-x64.exe.
- EXE 크기: 101636787 bytes.
- EXE SHA-256: b994eb40341f46538877557fb4aa7c52987952d88cedc97e21247ccee424f390.
- ZIP: outputs/STM-Simulator-0.13.0-Windows-x64.zip. EXE·설명 문서·라이선스·체크섬 포함.
- 게시 대상: moonsyu/STM-Simulator의 v0.13.0 GitHub Release.

## 로컬 증거

- work/test-results/model-tests.log, ui-tests.log, main-c-check.json, build.log.
- work/test-results/l298n-electron-smoke.json, l298n-portable-smoke.json, portable-smoke.json.
- work/test-results/l298n-electron.png, l298n-portable.png.
- 게시 후 원격 릴리즈·자산 검증 기록: work/test-results/release-proof.json.
