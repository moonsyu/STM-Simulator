# 현재 검증 기록 — 0.11.0

2026-09-10, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 변경

- 배선 꺾임점 추가·이동·삭제·자동 정렬, 다중 선택·그룹 이동·복사, 연결망 강조. 원본 빵판에서 분리한 복사 부품 사이의 연결도 보존한다.
- 회로 검사 탭에서 전원 단락·전원/GND·신호 미연결·I²C 주소 중복·과전류를 찾고 해당 핀/부품으로 이동한다.
- 생성 main.c에 HSI PLL 클록, GPIO AF, 주변장치 클록, ADC·SPI 등 정식 초기화, SWV printf 연결을 포함했다. 현재 main.c를 저장하는 IPC를 추가했다.
- TIM2/5 32비트, TIM3/4 16비트 카운터·주기 인터럽트·독립 PWM·입력 캡처·직교 엔코더. HAL 예제는 독립 서보/DC 모터, 캡처 주파수 측정, 타이머 엔코더를 추가해 총 30개다. 부품은 31종이다.
- F5로 시작/정지한다. 편집기 포커스에서도 동작하고 Ctrl/Alt/Shift 수정키, 반복, 열린 모달에서는 실행하지 않는다.

## 검증

- 모델 테스트 154개 통과. 기존 HAL·부품·회로와 배선 경로 저장, 복사 연결망/빵판 ID 재배정, 진단 위치, 서로 다른 PWM, 캡처 카운터 넘침, NVIC, 엔코더 정역회전/정지, ARR 변경을 검사했다.
- Electron UI 10개 스크립트 통과: ui/editor/parts/features/hal/layout-serial/hal-examples/boards/devices/circuit-tools. 새 회로 도구, 저장·불러오기·Undo/Redo, F5, main.c 저장 IPC, 세 타이머 예제 실시간 로그를 확인했다.
- 기본 main.c + HAL 예제 30개 모두 ARM GCC 14.3.1, STM32CubeF4 V1.28.3의 정식 HAL/CMSIS/startup을 사용해 컴파일·ELF 링크 통과. 함수 선언과 포인터 불일치를 오류로 검사했다. main.c SHA-256별 기록은 test-results/main-c-check.json에 남긴다. HAL 대체 헤더를 사용하지 않는다.
- UI 증거와 구조화된 결과는 test-results에 저장한다. 사용자 자동 저장과 분리한 프로필에서 검증한다.

## 배포

- 빌드 커밋: `343bcd7b43734fc9127f7bc14038d4d1ccc82ea6`.
- 실행 파일: `dist/artifact/STM-Simulator-0.11.0-win-x64.exe` — 100,190,082 bytes.
- EXE SHA-256: `4f50c0a2cbb172f0a44a48fdab4674e300c5f23160e5013860d920ec342957c8`.
- ZIP: `STM-Simulator-0.11.0-Windows-x64.zip` — 102,888,587 bytes.
- ZIP SHA-256: `7465ae0ac4c30b87d352f1e83bf1fa781e0e81e17d0550ac3fdc9b7d12cd80c3`.
- [GitHub Release v0.11.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.11.0), release ID 386023190. EXE·ZIP·SHA256.txt 업로드 크기·서버 digest와 latest release를 확인했다. 저장소는 Private이다.
- 빌드된 win-unpacked 앱에서 새 기능 UI 검사, 단일 portable EXE의 실행·HAL UART·회로·파형 검사를 통과했다. ASAR의 소스·문서 52개를 작업 파일 및 빌드 커밋과 대조했고, ARM 검사한 main.c 31개의 해시도 현재 예제와 일치한다.
- 이전 실행 파일과 중간 빌드 출력, 테스트용 프로필, 검증에 사용한 임시 ARM 객체/ELF와 업로드 ZIP을 정리한다. 최신 실행 파일은 dist/artifact, 현재 검증 결과는 test-results에 보존한다.

실물 보드 실행은 검증하지 않았다. 실제 프로젝트에는 동일 핀·주변장치·NVIC와 Cube의 MSP/IRQ/SysTick/syscalls가 있어야 한다. printf는 SWV ITM 포트 0이며 newlib-nano의 소수 출력에는 -u _printf_float 링크 옵션이 필요하다. 앱은 전체 ST HAL/C ABI/ARM 실행기가 아니며 필터·DMA·외부 타이머 클록·NVIC 선점은 지원하지 않는다. 세부 범위는 [HAL API](HAL-API.md)를 따른다.
