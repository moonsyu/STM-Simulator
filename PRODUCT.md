# STM Simulator

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron 기반 Windows 데스크톱 앱입니다. 네트워크 없이 로컬에서 사용합니다.

## Product Purpose

STM32 학습 프로젝트를 생성하고 C/H C/C++ 코드를 작성·컴파일·디버그·실행하면서 NUCLEO-F446RE와 빵판 회로의 동작을 함께 확인합니다. VS Code형 IDE를 기본 작업 화면으로 두고 회로 시뮬레이터와 펌웨어 에뮬레이터를 통합합니다.

## Operating Context

프로젝트 생성 → 코드 및 회로 편집 → 시뮬레이터용 빌드 → 실행 및 디버깅. 코드, 시뮬레이터, 터미널 패널을 이동·크기 조절·접기·최대화하고 개인 배치를 복원할 수 있어야 합니다.

## Capabilities and Constraints

기존 HAL/C 소스 인터프리터와 전기 회로 모델을 확장합니다. ARM GCC / ST HAL·CMSIS로 펌웨어를 빌드하고 GDB·OpenOCD 또는 외부 GDB 서버로 실물 보드를 디버그합니다. Windows GCC·GDB 실행 대상, clangd 의미 분석, 명령 터미널을 제공합니다. 컴파일된 ARM 펌웨어는 내장 Cortex-M4·STM32F446 에뮬레이터로 가상 빵판에서 실행합니다. 기존 `.stm32lab` 회로, 자동 저장, 부품·배선 편집을 보존합니다.

## Brand Commitments

제품명 STM Simulator와 한국어 인터페이스를 유지합니다. 화면은 System을 기본으로 Dark/White를 전환합니다. 코드 colorscheme는 편집기 내부에만 적용하고 화면 팔레트와 분리합니다. Dark의 기본 코드는 Jellybeans, White는 GitHub Light Default입니다. IDE 정보는 파일·소스·오류·실행 상태 중심으로 구성합니다.

## Evidence on Hand

현재 기능과 기술 범위는 HANDOFF.md, README.md, docs/HAL-API.md, docs/architecture/EMULATOR.md 및 구현 소스를 기준으로 합니다. 사용자 지시로 프로젝트 생성 및 IDE 중심 구성, 터미널을 포함한 패널 배치 조절을 추가합니다.

## Product Principles

- 코드와 회로를 같은 프로젝트로 저장합니다.
- 빌드·실행·일시정지 상태와 그 결과를 명확히 구분합니다.
- 작은 패널은 접거나 최대화할 수 있고, 배치 변경으로 사용자 작업을 잃지 않습니다.
- 시뮬레이터용 빌드(C 해석)와 실제 ARM 펌웨어 빌드(에뮬레이터·실물 보드)를 구분해 표시합니다.
