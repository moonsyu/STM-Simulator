# 현재 검증 기록 — 0.15.2 (CubeMX 활성화 초기값)

- 검증일: 2026-10-07. Windows x64, Node.js 24, Electron 44.2.0, Playwright 1.58.2.
- 기준: [NUCLEO-F446RE 기본 설정](MCU-DEFAULTS.md). 사용자 확인에 따라 CubeMX에서 TIM을 활성화할 때 사용하는 PSC=0, 비트 폭별 ARR 최댓값, Pulse=0을 적용했다.

## 이번 검사 결과

- 전체 모델 **196/196 통과**. 16 MHz 새 프로젝트, 비활성 주변장치/NVIC, TIM2/5 ARR=4294967295, TIM3/4 ARR=65535, 누락 .ioc 필드, 기존 저장값과 명시적 ARR=0 보존을 검사했다.
- 타이머 네 개의 초기 카운트와 전체 ARR 주기 인터럽트 예약을 검사했다. 초기 PWM Pulse=0 출력, 32비트 ARR에서 1 Hz 미만 PWM, 50% 듀티의 다음 에지 시각을 검사했다. 기존 ARR=0 정지/재개, 입력 캡처, PWM CCR 폭 검사도 통과했다.
- 기본값 Electron UI 검사 통과: TIM 네 개의 기본값 및 활성화, Pulse 편집, ARR=0 안내, HAL 생성·실행, 저장·재열기, 기존 84 MHz 예제. 데스크톱 및 1024×640 창의 캡처를 확인했다.
- ARM GCC 15.2.1과 ST HAL/CMSIS/startup (STM32CubeF4 v1.28.3)으로 **빈 프로젝트 + 기본 TIM PWM 네 개를 활성화한 프로젝트 + HAL 예제 32개, 총 34개**를 컴파일·링크했다. 4294967295 정수 상수를 포함하는 생성 소스를 실제 도구체인으로 확인했다.
- 패키징된 win-unpacked 앱에서도 동일한 기본값 UI 검사가 통과했다.
- 실제 단일 portable EXE를 실행해 16 MHz·PSC=0·비트 폭별 ARR 최댓값·주변장치 비활성·PLL OFF 생성 코드를 확인했다. 같은 EXE에서 Windows GCC 빌드, GDB main 중단·레지스터, 디버그 종료 후 재실행과 출력 42를 확인했다.
- git diff --check 통과.

## 로컬 배포 검사

- EXE: outputs/artifact/STM-Simulator-0.15.2-win-x64.exe
- 크기: 102585574 bytes
- SHA-256: cbbf31bd82b0e976cb8a748b497d453df22478cc5b2dae573527feabcff8eb33
- ZIP: outputs/STM-Simulator-0.15.2-Windows-x64.zip
- 크기: 104781498 bytes
- SHA-256: 0086eda5941e5c48aa77313b31abb7acce43aea2b36525ed963bc1d16892dacd
- asar의 MCU 기본값·검증기·TIM 모델·HAL 생성기·Pinout 및 네이티브 서비스·Monaco 소스 일치, 아이콘/라이선스 검사 통과. docs/MCU-DEFAULTS.md 포함. 참고 PDF·테스트·도구체인은 배포하지 않는다.
- ZIP 무결성과 기본값 문서 원본 일치를 검사했다.
- 위 크기와 해시는 로컬 검증 빌드의 기록이며 해당 BUILD-INFO.json의 commit/workflow는 null이다. GitHub 릴리즈에는 동일 버전의 성공한 Actions 빌드 결과를 게시한다. 릴리즈 자산의 실제 해시는 첨부 SHA256.txt, 빌드 커밋과 실행 링크는 ZIP의 BUILD-INFO.json을 확인한다. 원격 게시 검증 결과는 `work/test-results/release-proof.json`에 기록한다.

## 재현 명령과 증거

- npm test → work/test-results/cubemx-defaults-model.log
- npm run test:mcu-defaults:ui → cubemx-defaults-ui.log, mcu-defaults-desktop.png, mcu-defaults-compact.png
- npm run test:main-c (ARM_GCC / STM32CUBE_F4_ROOT 지정) → main-c-check.json, cubemx-defaults-arm.log
- npm run build 및 npm run build:artifact → cubemx-defaults-build.log
- LAB_EXE=win-unpacked 실행 파일로 test:mcu-defaults:ui → cubemx-defaults-packaged-ui.log, mcu-defaults-smoke.json
- node scripts/native-portable-check.cjs → native-portable-check.json, cubemx-defaults-portable.log
- ZIP 무결성 및 해시 → cubemx-defaults-zip.json

## 검증 범위

- 이번 UI 재검사는 변경된 기본값·HAL 생성·저장 경로와 실제 portable GCC/GDB 실행에 집중했다. 이전 전체 UI 검증은 100d422 커밋, 전체 네이티브 IDE/clangd/ARM 원격 GDB 기록은 eac667c 커밋의 검증 문서에 있다.
- 실제 F446RE 보드의 플래시·실물 디버그 및 전원 인가 직후 레지스터값은 이번 검사 범위에 포함하지 않는다.
- 컴파일된 ARM ELF/BIN을 가상 빵판에서 실행하는 CPU 에뮬레이션은 제공하지 않는다. 회로는 지원 HAL/C 소스 해석 모델로 동작한다.
- GCC/SDK/GDB/clangd/OpenOCD는 필요에 따라 별도 설치한다. 다른 PC의 도구 설치 상태는 검증하지 않았다.
