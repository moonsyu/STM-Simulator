# 현재 검증 기록 — 0.6.0

2026-09-07, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 변경

- 제공 예제를 HAL C 코드 13개로 통합. Serial 호출, 스케치 예제 메뉴, 완성 회로 메뉴와 제품의 회로 생성 코드를 제거했다.
- 새 프로젝트는 부품·배선 없이 HAL main.c로 시작한다. 기존 사용자 자동 저장은 계속 복원한다.
- HAL 예제 적용은 코드·MCU 설정만 교체한다. 현재 부품·배선·이름·계산 설정 유지, 적용 취소 및 실행 취소를 지원한다.
- printf/puts 디버그 로그와 HAL UART 포트별 TX/RX 로그를 지원한다. 송신 기록은 터미널 없이도 보이며 실제 수신에는 전원·배선·baud 조건이 필요하다.
- 온도·ADC 배열·초음파를 HAL API로 측정하고 printf로 출력한다. ADC 배열은 polling, 초음파는 TIM2 카운터 및 GPIO 폴링 모델이다.
- 과거 회로 프로그램은 제품에서 제거했다. `tests/fixtures/`의 회로·프로그램은 기존 사용자 파일 호환성과 전기 모델을 검사하는 테스트 입력이며 EXE에 포함하지 않는다.

## 모델 검증

`npm test`: **96개 통과**, 실패 없음.

새 검증 11개는 빈 HAL 시작, 전체 제공 예제의 HAL 실행·빈 회로·Serial 호출 부재, 적용 시 사용자 회로 보존, printf 형식·길이·인수·포인터 오류, 배선 없는 출력, UART 실제 RX 시간 및 IT 에코, busy/timeout 시 가짜 TX 방지, TMP36 25°C·ADC 약 2048·초음파 100cm·미연결 timeout, TIM 카운터의 ARR 순환·정지를 확인한다. 기존 GPIO·회로·부품·HAL·UART 여섯 장치의 핀/IRQ 및 독립 통신 검증도 통과했다.

## Electron UI 검증

`npm run test:ui`: **7개 스크립트 통과** (ui/editor/parts/features/hal/layout-serial/hal-examples).

`hal-examples-smoke.cjs`는 초기 빈 회로·HAL 환경, 제거한 메뉴 부재, 예제 13개 선택/검사/실행, 부품·배선 자동 추가 없음, 현재 회로 보존·취소·실행 취소, 실행 중 적용 방지, printf 값, UART TX/RX 문자열 합치기·로그 지우기, TMP36 측정, 새 회로·재시작 복원을 확인한다.

패키징한 `dist/win-unpacked/STM Emulator.exe`에서도 같은 HAL 예제·로그 UI 테스트를 통과했다. 제한 환경의 첫 실행은 GPU 프로세스가 시작되지 않아 종료됐으며, 일반 Windows 실행 환경에서 재검증했다. 앱 소스나 GPU 설정 변경 없이 통과했다.

`node scripts/portable-smoke.cjs`: **0.6.0 단일 EXE 직접 실행 통과**. 빈 HAL 시작, printf 출력, HAL USART2 송수신 로그·IRQ·Pinout 및 기존 회로 파일의 편집·부품·LCD·UART/I²C/SPI·파형 동작을 확인했다. 렌더러 오류 없음.

테스트는 `CIRCUIT_LAB_TEST_PROFILE`로 실제 사용자 자동 저장과 분리했다. 최신 JSON·PNG·CSV 증거만 지정 저장소의 `test-results/`에 보관하며 테스트 프로필과 빌드 작업 폴더의 중복 생성물은 검증 후 정리한다.

## 배포 검증

- `npm run build`, `npm run build:artifact` 통과.
- 패키지 버전, 테스트/회로 fixture 및 폐기 예제 모듈 제외, HAL 예제의 Serial 호출 부재, Electron/Chromium 고지 원문 보존 확인.
- 지정 저장소·빌드 소스·app.asar의 소스/UI/문서 **36개 파일 바이트 일치**. package.json의 name/version/main/type 일치, 상대 문서 링크 정상.
- EXE: `STM-Emulator-0.6.0-win-x64.exe`, **100,162,511 bytes**.
- SHA-256: `cbfc7298ffc412f24a5fa9e10ca5d489cdff0866fdd8606a9fdb1348c584961f`.
- 소스 위치: `C:\Users\SSAFY\Desktop\ct\STM-Emulator`.
- 최신 실행 묶음: 해당 저장소의 `dist/artifact/`. 과거 소스와 검증 문서는 Git 이력으로 관리한다.
- 정리 예외: 사용자가 실행 중인 `dist/artifact-0.5.1/STM-Emulator-0.5.1-win-x64.exe`는 Windows 파일 잠금으로 남아 있다. 사용자 작업을 보호하기 위해 강제 종료하지 않았다. 앱 종료 후 이전 EXE와 빈 폴더를 제거해야 한다.

## 범위

HAL 소스 인터프리터이며 전체 ST 드라이버·ARM/ELF/BIN 실행기는 아니다. 비동기 8N1 UART, 협력적 IRQ, polling ADC/타이머 모델이다. HAL DMA, 동기식 USART, MCU UART 간 직접 배선 전송, 실제 NVIC 선점은 미지원이다. printf는 앱의 디버그 출력 연결이며 실제 MCU 출력 리타게팅과 구별한다. 원격 push/Release/Actions는 수행하지 않았다.
