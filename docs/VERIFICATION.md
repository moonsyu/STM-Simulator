# 현재 검증 기록 — 0.15.1 (문서 기준 MCU 기본값)

- 검증일: 2026-10-07. Windows x64, Node.js 24, Electron 44.2.0, Playwright 1.58.2.
- 기준: [NUCLEO-F446RE 기본 설정](MCU-DEFAULTS.md). UM1724 Rev 17, RM0390 Rev 9의 리셋 프리셋을 적용했다.

## 이번 검사 결과

- 전체 모델 **194/194 통과**. 새 프로젝트 16 MHz/미할당 GPIO/비활성 주변장치·NVIC, 누락 TIM 필드 PSC/ARR/CCR 0, 기존 저장값 유지, ARR=0 카운터 정지·IRQ 취소와 재개, 입력 캡처의 정지 카운터 래치, PWM 초기 듀티 및 CCR 폭을 검사했다.
- 기존 Electron UI **14개 스크립트 통과**, 신규 기본값 UI **1개 통과**. 기존 GPIO/통신/모터/서보/입력 캡처/부저/IDE 기능을 회귀 검사했다.
- Pinout의 기본값, 16/32비트 입력 범위, ARR=0 안내, 초기 Pulse 편집, HAL 생성·실행, 파일 저장/재개, 명시적 84 MHz 예제를 확인했다. 데스크톱 및 1024×640 캡처를 함께 확인했다.
- 실제 ARM GCC 15.2.1과 ST HAL/CMSIS/startup (STM32CubeF4 v1.28.3)으로 **빈 프로젝트 + HAL 예제 32개, 총 33개**를 컴파일·링크했다. 기본 프로젝트는 HSI 직접 연결/PLL OFF/APB 분주 1이고 예제의 84 MHz 설정도 유효하다.
- 패키징된 win-unpacked 앱에서도 신규 기본값 UI 검사가 통과했다.
- 실제 단일 portable EXE를 실행해 HSI 16 MHz·TIM PSC/ARR 0·주변장치 비활성·PLL OFF 생성 코드를 확인했다. 이어서 해당 EXE에서 Windows GCC 빌드, GDB main 정지·레지스터, 디버그 종료 후 재실행과 출력 42를 확인했다.
- git diff --check 통과.

## 배포 검사

- EXE: outputs/artifact/STM-Simulator-0.15.1-win-x64.exe
- 크기: 102584485 bytes
- SHA-256: 49af5adaddc7234914ba3f923279345dc9a5632a340ae87907c000be48329254
- ZIP: outputs/STM-Simulator-0.15.1-Windows-x64.zip
- 크기: 104780267 bytes
- SHA-256: 32491e98108810e949fc0d70716a06dd13ccf2671b7e5d7514cb9d79faa7e695
- asar의 MCU 기본값·검증기·TIM 모델·HAL 생성기·Pinout 및 기존 네이티브 서비스·Monaco 소스 일치 검사, 아이콘/라이선스 검사 통과. docs/MCU-DEFAULTS.md 포함. 참고 PDF·테스트·도구체인은 배포하지 않는다.
- ZIP 무결성과 기본값 문서 포함을 검사했다.
- 로컬 빌드다. 이번 턴에서 GitHub Release/Actions 게시 검증은 수행하지 않았다. BUILD-INFO.json의 commit/workflow는 로컬 빌드이므로 null이다.

## 재현 명령과 증거

- npm test → work/test-results/mcu-defaults-model.log
- npm run test:ui → 기존 14개 결과는 mcu-defaults-ui-regression.log, 추가 기본값 검사 결과는 mcu-defaults-ui.log. test:ui에 추가 검사를 연결했다.
- npm run test:mcu-defaults:ui → mcu-defaults-smoke.json, mcu-defaults-desktop.png, mcu-defaults-compact.png
- npm run test:main-c (ARM_GCC / STM32CUBE_F4_ROOT 지정) → main-c-check.json, mcu-defaults-arm.log
- npm run build 및 npm run build:artifact → mcu-defaults-build.log
- LAB_EXE=win-unpacked 실행 파일로 test:mcu-defaults:ui → mcu-defaults-packaged-ui.log
- node scripts/native-portable-check.cjs → native-portable-check.json, mcu-defaults-portable.log

## 검증 범위

- 실제 F446RE 보드의 ARR 리셋값 및 플래시·실물 디버그는 검증하지 않았다. ARR=0은 RM0390에 기재된 값을 채택한 프리셋이며 실리콘 전체 레지스터 모델이라는 의미가 아니다.
- 컴파일된 ARM ELF/BIN을 가상 빵판에서 실행하는 CPU 에뮬레이션은 제공하지 않는다. 회로는 기존 HAL/C 인터프리터로 동작한다.
- 0.15.0의 전체 네이티브 IDE/clangd/ARM 원격 GDB 검사 기록은 eac667c 커밋의 검증 문서에 있다. 이번에는 변경된 HAL 생성 소스의 ARM 빌드와 패키지의 Windows GCC/GDB 경로를 재검사했다.
- GCC/SDK/GDB/clangd/OpenOCD는 필요에 따라 별도 설치한다. 타인 PC의 도구 설치 상태는 검증하지 않았다.
