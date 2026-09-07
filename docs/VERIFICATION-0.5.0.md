# 0.5.0 검증 기록

2026-09-07, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 소스/모델

`node --test tests/*.test.js`: **72개 통과** (기존 53 + HAL 19).

- 기존 회로/스케치/배치/통신/LCD/파형 테스트 유지.
- HAL 예제 7종의 파일 검증·생성 코드·회로 실행.
- HAL_GPIO 초기화·LED·delay, EXTI callback mask/NVIC 비활성 pending, 공유 EXTI handler의 pending 검사.
- UART 연속 RX/재등록, 동시 TX/RX 완료, RX timeout·busy, 만료된 수신 버퍼 오류.
- TIM2 PSC/ARR 기반 callback, HAL PWM 평균 출력, ADC 실제 분압 측정, I2C/SPI 메모리 왕복과 timeout.
- 핀/신호/EXTI 충돌, 설정 불일치, 미지원 HAL 오류, IOC MCU 검증 및 미지원 주변장치 경고.
- 선택한 C/헤더 전처리, include guard/extern/RCC 초기화 구조체, 기본 C 정수·cast·static 스칼라, main 반복의 협력적 진행.

## 실제 Electron UI

`npm run test:ui`: ui/editor/parts/features/hal smoke **5종 통과**.
마지막 UI 표시와 폴더 가져오기 변경 후 `node scripts/hal-smoke.cjs` 재실행 통과.

HAL smoke: 핀/EXTI/NVIC 설정 → HAL 코드 생성 → 문법 검사 → 실행, UART 인터럽트 터미널 왕복, 네이티브 파일 선택/IPC를 통한 .ioc+main.c+main.h 가져오기, 헤더 편집, 회로 저장/재열기, Cube 폴더 가져오기 및 시스템 파일 제외, 실행 중 설정 비활성.

검증 결과는 `test-results/*-smoke.json`, `11-pinout-hal.png`, `12-hal-uart.png`에 있습니다. 테스트는 별도 프로필을 사용했습니다. 이 로컬 결과와 스크린샷은 Git에서 제외합니다.

첫 샌드박스 UI 시도는 GPU 프로세스가 종료되었습니다. 일반 사용자 실행 환경의 테스트 전용 프로필에서 재실행해 통과했습니다. 숨겨진 창의 스크린샷 대기는 테스트 창을 showInactive로 표시해 해결했습니다.

## 열려 있던 CubeMX 프로젝트

창 목록에서 `STM32CubeMX interrupt_hard.ioc: STM32F446RETx NUCLEO-F446RE`를 확인했습니다. 화면 캡처 호출은 앱 승인 시간 초과로 완료하지 못했습니다. 따라서 CubeMX 화면을 시각적으로 검증했다고 주장하지 않습니다.

해당 로컬 `interrupt_hard.ioc`를 읽고 PA5/PC5/PC6/PC8 출력, PC2/PC3/PC13 풀업 falling EXTI, PA2/PA3 USART2, EXTI NVIC를 확인했습니다. 새 importer에서 경고 없이 읽고, 해당 설정으로 생성한 HAL 소스 파싱을 확인했습니다. CubeMX의 프로젝트 설정과 원본 소스는 변경하지 않았습니다.

## 배포

0.5.0은 로컬 변경입니다. 원격 push/Release/Actions 실행은 하지 않았습니다. `BUILD-INFO.json`에 commit/workflow가 null이면 로컬 빌드임을 뜻합니다. 기존 0.4.0 원격 배포 해시를 이 버전의 검증으로 사용하지 않습니다.

실행 및 패키지 검증 결과는 아래에 기록합니다.

- `npm run build`: 최종 0.5.0 portable EXE 생성 완료.
- 패키징된 `win-unpacked/STM Emulator.exe`로 `hal-smoke.cjs` 통과.
- `node scripts/portable-smoke.cjs`: 최종 단일 EXE 직접 실행, 기존 회로/LCD/통신/파형 및 HAL UART 수신 인터럽트·Pinout 검증 통과.
- `npm run build:artifact`: 패키지 파일/버전/라이선스/참고 자료 제외 검사 통과.
- 빌드 소스, 사용자 지정 저장소, 패키징된 앱의 29개 모듈 바이트 일치 확인. index.html/HAL API 문서도 패키지와 일치.
- EXE: `STM-Emulator-0.5.0-win-x64.exe`, 100,159,394 bytes.
- SHA-256: `052a765cd5ab3dd4df7d7f378b705b578d08ebb207f55a4bb2affc56225d1660`.
- 결과는 사용자가 지정한 `C:\Users\SSAFY\Desktop\ct\STM-Emulator`에 반영. 실행 묶음은 `dist/artifact/`.
