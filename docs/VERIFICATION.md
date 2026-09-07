# 현재 검증 기록 — 0.5.1

2026-09-07, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 변경과 근거

- 코드/속성·측정 패널 경계선을 드래그하거나 키보드로 조절. 너비 저장/복원, 기본값 복귀, 최소 창 크기에서 회로와 실행 버튼 접근성.
- USART1/2/3/6, UART4/5의 F446RE LQFP64 TX/RX 대체 핀, AF7/8, 장치 활성화 시 자동 배정, 충돌 방지, 비활성화 시 해당 핀·IRQ 해제.
- 포트별 HAL 생성·초기화·blocking/IT 송수신·NVIC·입력 대상. 기존 USART2 회로/스케치 호환 유지.
- 근거: [ST DS10693 표 10·11](https://www.st.com/resource/en/datasheet/stm32f446re.pdf), 로컬 CubeMX `STM32F446R(C-E)Tx.xml`, `GPIO-STM32F446_gpio_v1_0_Modes.xml`. 참조 XML 자체는 소스/EXE에 포함하지 않음.
- HAL 예제 7개와 기존 스케치 예제의 차이, ADC/I2C/SPI 예제의 로그 확장을 문서화.

## 모델 검증

`npm test`: **85개 통과** (기존 72 + 신규 13).

신규 검증은 전체 직렬 통신 핀 후보의 보드 존재 여부, 실제 핀 선택 제한, 사용 중인 핀 보호, 설정 실패 시 부분 변경 방지, 대체 핀 이동/해제, USART3/UART4 공유 핀 충돌, 여섯 장치 각각의 모든 TX/RX 조합에서 HAL 생성·송신·RX 인터럽트 에코·NVIC 비활성/재활성, `.ioc`의 포트별 baud/IRQ, 두 UART 동시 통신의 버퍼/busy/출력 분리, AF/baud 불일치 오류를 확인한다.

## Electron UI 검증

`npm run test:ui`: **6개 스크립트 통과** (ui/editor/parts/features/hal/layout-serial).

신규 `layout-serial-smoke.cjs`: 마우스/키보드 너비 조절, 코드/속성 간 너비 공유, 재시작 복원, 최소 창 크기와 실행 버튼 표시, 기본 너비 복귀, TX/RX 실제 후보, 자동 배정/대체 핀/비활성 해제, 핀 직접 선택 시 주변장치 활성화, 충돌 표시 및 기존 핀 보존, 여섯 통신 장치와 NVIC, HAL 생성·검사·실행, 설정 저장, 통신 입력 대상 변경.

빌드된 `dist/win-unpacked/STM Emulator.exe`에서도 `layout-serial-smoke.cjs` 통과.

스크린샷 `13-editor-min-window.png`, `14-resizable-editor.png`, `15-uart-fixed-routes.png` 및 `test-results/*-smoke.json`은 로컬 검증 자료이며 Git/배포에 포함하지 않는다. 테스트는 실제 사용자 자동 저장과 분리한 전용 프로필을 사용했다.

## 범위

비동기 8N1 HAL UART 호환 모델이다. 동기식 USART CK, RTS/CTS, HAL DMA, 서로 다른 MCU UART 간 직접 배선 전송, 전체 ST HAL 드라이버/ARM/ELF 실행은 구현하지 않았다. 원격 push/Release/Actions는 수행하지 않았다. 기능 소스는 Git 커밋 852b273에 기록했다.

## 배포 검증

- `npm run build`: 0.5.1 portable EXE 생성 완료.
- `node scripts/portable-smoke.cjs`: 단일 EXE 직접 추출/실행, 기존 회로/부품/통신/파형과 HAL UART 수신 인터럽트·Pinout 통과. 렌더러 오류 없음.
- `npm run build:artifact`: 패키지 버전/자료 제외/라이선스 고지 검사 통과.
- 빌드 소스, 지정 저장소, app.asar의 35개 소스·UI·문서 파일 바이트 일치. package.json은 빌더가 개발 필드를 제외하므로 name/version/main/type 일치로 확인.
- EXE: `STM-Emulator-0.5.1-win-x64.exe`, **100,162,248 bytes**.
- SHA-256: `1ab446e102ce6901263922ff31c5cfbd62c31037334d61461d46340ff85ef538`.
- 소스 반영 위치: `C:\Users\SSAFY\Desktop\ct\STM-Emulator`.
- 새 실행 묶음: 해당 저장소의 `dist/artifact/`. 이전 실행 파일과 버전별 폴더는 제거한다.
- 로컬 검증 자료 복사: 해당 저장소의 `test-results/`. 테스트 전용 프로필과 개인 자동 저장은 복사하지 않음.

## 저장소 정리 검증

- 버전별 검증 문서 6개를 현재 문서 하나로 통합. 과거 내용은 Git 이력에서 조회.
- README와 인계 문서를 현재 기능·고정 경로·Git 이력 관리 원칙으로 갱신. 상대 문서 링크 검사 통과.
- 프로그램 코드 변경 없이 문서를 반영해 EXE 재패키징. 최종 portable 직접 실행 및 패키지 고지 검사 통과.
- 테스트 CSV 이름을 waveform.csv로 통일. 해당 스크립트 구문 검사 통과.
