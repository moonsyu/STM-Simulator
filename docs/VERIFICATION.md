# 검증 기록

## 0.30.1 IDE 실물 보드 실행 수정 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `0a34222b4a64bc6e0ecd16847012dc7cbcc712c8` · [Windows CI 39542962621](https://github.com/moonsyu/STM-Simulator/actions/runs/39542962621) 성공 · [Release v0.30.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.30.1).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬) | 683개 중 680 통과(실패 2개는 로컬 심볼릭 링크 권한, CI 통과). 새 검사: CubeIDE OpenOCD 시작 인자, 도구 저장 시 빈 항목 자동 감지 |
| 실물 보드 (IDE 경로) | `NativeIde.run`(STM32 · ARM GCC, OpenOCD 자동 시작, 기록 켬)으로 빌드·플래시·실행, GDB 일시정지마다 `uwTick` 724→1454→2182→2908, PA5 변화 |
| 공개 자산 | latest=v0.30.1, 태그·BUILD-INFO 커밋 일치, 5자산. EXE SHA-256 `fb16754c487f59a596f5d1be2248cfcb961d841b37bfabf2c60c118b68965088`(102,968,843 B, MZ)이 SHA256.txt·update-manifest·ZIP 안 EXE와 일치. ZIP SHA-256 `d07f165d685da253da660974fce738be7ee31cd6f54f2ba7c68012bc9436b8c7` |

## 0.30.0 4칸 들여쓰기 · 예제/Docs 구분 · F11 연속 실행 · 찾기 창 · CubeIDE 도구 감지 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `51b7d21f4405bc3b25fda1bf054f3c3ce8672883` · [Windows CI 39540170767](https://github.com/moonsyu/STM-Simulator/actions/runs/39540170767) (빌드·릴리스 게시 모두 성공) · [Release v0.30.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.30.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows) | 681개 중 678 통과. 실패 2개는 로컬 심볼릭 링크 권한 한정, CI 통과 |
| `npm run test:e2e` (로컬) | 22 통과, 1 건너뜀. 새 검사: 찾기 키가 Monaco 찾기 위젯을 열지 않음, F11 누르고 있으면 3회 이상 단계 실행(수정 전 실패 확인) |
| `npm run test:toolchain` (로컬, 실제 ARM) | STM32CubeIDE 1.19.0의 GNU Tools for STM32 13.3.1 + STM32CubeF4 v1.28.3(`94cae6e`)으로 빈 프로젝트와 예제 126개 128/128 컴파일·링크·에뮬레이터 실행 통과(약 25분) |
| 실물 보드 | NUCLEO-F446RE ST-LINK V2-1(V2J48M35, COM6), STM32F446xx Rev A, 512 KB, 3.25 V. STM32_Programmer_CLI 핫플러그 연결 확인만, 플래시하지 않음 |
| 공개 자산 | latest=v0.30.0, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `0e18f41784b4d97ea671eeef7debc30c8825bc34dca4e1e5a32ed61c1ee836fe`(102,967,801 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `fb776dd19b9f77f6bee7554a809e6eb54586f36443eafe649d3475648ed09997` |

한계: 펌웨어를 실물 보드에 써서 실행하지는 않았습니다(사용자 선택). 기존 2칸 프로젝트는 자동 변환하지 않으며 코드 정렬로 4칸이 됩니다.

## 0.29.2 코드 정렬 문장 줄 나눔 · 저장 상태 경쟁 수정 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `292d402bbc6b36e181e88c3fae7c4a2c93cc6583` · [Windows CI 39531566516](https://github.com/moonsyu/STM-Simulator/actions/runs/39531566516) (빌드·릴리스 게시 모두 성공) · [Release v0.29.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.29.2). 첫 실행 [39530166635](https://github.com/moonsyu/STM-Simulator/actions/runs/39530166635)은 저장 상태 경쟁(자동 저장이 "파일 저장됨"을 덮어씀)으로 E2E 1건이 실패해 게시되지 않았고(태그 없음), 수정 후 같은 버전으로 게시했습니다.

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows) | 680개 중 677 통과. 실패 2개는 로컬 심볼릭 링크 권한 한정, CI 통과 |
| `npm run test:e2e` (로컬) | 21 통과, 1 건너뜀. 저장 테스트는 3회 연속 통과(저장 0.5초 뒤 상태 유지 검사 추가) |
| 코드 정렬 | 사용자 목표 형식(`tests/fixtures/format-compact.c`)과 글자 단위 일치, `else if` 사슬, 범위 정렬, 중단점 이동(편집기 `main.c:10`, 저장 시 줄 재계산) |
| 공개 자산 | latest=v0.29.2, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `4d63c5014e65277f1362e6d0fd0f61b059edfc655d52d6e2a19ca5f75adbb194`(102,967,555 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `a889b29355ee13bfdd7e5d961378e1efb62991810729e246389c5116400df5b7` |

한계: 연산자 주변 공백과 포인터 `*`/`&`는 정렬하지 않습니다(사용자 목표 형식). 중괄호는 중괄호 있는 갈래 뒤 같은 줄에서 끝나는 `else` 한 문장에만 붙입니다.

## 0.29.1 `}` 정렬 IME 수정 · 예제 코드 줄 정리 · 메뉴 표시 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `0173b64339a8e9a50a38b75c77b13d82416486bd` · [Windows CI 39528002946](https://github.com/moonsyu/STM-Simulator/actions/runs/39528002946) (빌드·릴리스 게시 모두 성공) · [Release v0.29.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.29.1). 첫 실행 [39527156197](https://github.com/moonsyu/STM-Simulator/actions/runs/39527156197)은 메뉴 단축키 경쟁 상태로 E2E 1건이 실패해 게시되지 않았고(태그 없음), 수정 후 같은 버전으로 게시했습니다.

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows) | 678개 중 675 통과. 실패 2개는 로컬 심볼릭 링크 권한 한정, CI 통과 |
| `npm run test:e2e` (로컬, 두 번 연속) | 각 20 통과, 1 건너뜀. 새 검사: IME 방식 `}` 입력(`insertText`)과 자동 닫힌 `}` 덮어쓰기 |
| 예제 코드 정리 | 127개 예제 모두 한 줄 한 문장, 원래 조각과 토큰 동일, `expandC` 멱등 |
| 공개 자산 | latest=v0.29.1, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `0bab81c7491c08fb5f90abd93d7dd8e3c397157d37859e105f99b5429523a92a`(102,967,040 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `e71b598ce2dd57ca6aa6abdbdb625bbba5e62d56faab3f7aca81daf9899d484c` |

한계: 실제 한글 IME 하드웨어 입력은 `insertText`(키 이벤트 없는 텍스트 입력)로 재현했으며 사람이 직접 입력해 확인하지는 않았습니다.

## 0.29.0 UI 다듬기 · 기능 점검 수정 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `90504af7761d3760fa43c26ca78ac8497e64e488` · [Windows CI 39524337726](https://github.com/moonsyu/STM-Simulator/actions/runs/39524337726) (빌드·릴리스 게시 모두 성공) · [Release v0.29.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.29.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows, Node 24) | 676개 중 674 통과. 실패 2개는 로컬 심볼릭 링크 권한(EPERM) 한정, CI 통과 |
| `npm run test:e2e` (로컬 실제 Electron) | 19 통과, 1 건너뜀. Dark/White WCAG AA 대비 검사 포함 |
| 색 대비 (새 팔레트) | foreground·muted·accent·error·warning × background·panel·chrome·hover, 선택 영역, 버튼 모두 AA (최소 5.15:1) |
| HAL 예제 127개 실행 감사 | 오류 0, `stdio.h` 중복 제거 전후 출력 동일 |
| 공개 자산 | latest=v0.29.0, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `8f9ff1745ac078286eee79fe5dc5b55372dbc0c86b2364e747f7227a68098d28`(102,967,771 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `01b52b497dfe2e1667acf5971b37a8bf75a4ffc344563409f43133e5b3fe2221` |

한계: 화면 디자인은 1600×900 창의 Dark/White 캡처로 확인했으며 작은 창 크기와 고배율 디스플레이는 따로 확인하지 않았습니다.

## 0.28.0 코드 정렬 · 예제 결과 표시 점검 — 공개 배포 검증 완료

2026-10-21. 제품 커밋 `536dedd37e84a3a92e651ee3f5fecbc33a16089e` · [Windows CI 39520981687](https://github.com/moonsyu/STM-Simulator/actions/runs/39520981687) (빌드·릴리스 게시 모두 성공) · [Release v0.28.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.28.0).

| 검사 | 결과 |
|---|---|
| `npm test` (로컬 Windows, Node 24) | 676개 중 674 통과. 실패 2개는 `tests/unit/desktop.test.js`의 심볼릭 링크 생성 권한(EPERM) 문제로 로컬 환경 한정이며 CI에서는 통과 |
| `npm run test:e2e` (로컬 실제 Electron) | 19 통과, 1 건너뜀. 새 검사: `}` 입력 블록 정렬·Alt+Shift+F 정렬, Gravity RGB 렌즈 색·속성 패널 G/R/B |
| 코드 정렬 | 모든 HAL 예제 main.c에서 토큰 불변·멱등·줄 수 보존. 구조체/배열 초기화, 중첩 중괄호 없는 본문, 괄호 연속 줄, `#ifdef` 줄 유지 확인 |
| 예제 결과 점검 (127개, 각 3초 실행) | 오류·전기 고장 0. 출력·회로·속성 패널 중 어디에서도 결과를 볼 수 없던 예제 없음(버저는 500 ms 토글, `exti`는 USER 버튼 입력에 반응) |
| 공개 자산 | latest=v0.28.0, 태그·BUILD-INFO 커밋 일치, 5자산 존재. EXE SHA-256 `1597e8df8dcaec6d1508eaed22b94ec44a0e9e0cb61cf2cce0f6a259e9d3dfec`(102,968,177 B, MZ 헤더)이 SHA256.txt·update-manifest·ZIP 안의 `STM-Simulator.exe`와 일치. ZIP SHA-256 `6aec401d9817e8776de4b0747da60956e4636ea0676ece13e9a5a8f724c65031` |

한계: ARM GCC 빌드는 CI의 대표 예제 11개만 검사하며, 주소지정 RGB 예제는 인터프리터와 앱 E2E에서 확인했습니다. 실물 MCU·WS2812에서의 실행 검증은 아닙니다.

## 0.27.0 빵판 · 예제 배선 · Docs 제거 · 단축키

2026-10-21. 검증 브랜치 `redesign` · [Windows CI 39451212214](https://github.com/moonsyu/STM-Simulator/actions/runs/39451212214) (전 단계 통과).

| 검사 | 결과 |
|---|---|
| `npm test` (단위·인터프리터·에뮬레이터·펌웨어, 예제 배선 지표, Docs 적용/제거 ARM 빌드 포함) | 672 통과 |
| `npm run test:e2e` (Linux xvfb, ARM GCC 포함) | 18 통과 |
| 예제 배선 지표 (127개) | 배선 1167→684, 길이 486217→231750, 교차 1475→17, 겹침 1075→0 |

## 0.26.0 VS Code형 작업 화면 · 펌웨어 에뮬레이터 · 테스트 재작성

2026-10-20. 검증 브랜치 `redesign` · [Windows CI 39380790785](https://github.com/moonsyu/STM-Simulator/actions/runs/39380790785) (전 단계 통과).

| 검사 | 결과 |
|---|---|
| `npm test` (unit 350 · interp 48 · emu 65 · firmware 42) | 505/505 통과 (Linux Node 22, Windows Node 24) |
| Cortex-M4 코어 QEMU 대조 | 펌웨어 19종 출력 바이트 일치 (`tests/emu/cpu-fixtures.test.js`), 약 34~40 MIPS |
| `npm run test:e2e` (실제 Electron) | 16/16 통과 — 작업 화면·레이아웃 저장, 예제 실행·측정·디버그, 저장 직후 편집 경고·입력 직후 종료 보존·폴더 저장 일관성, Dark/White WCAG AA, ELF 실행·UART·로직 분석기·에뮬레이터 디버거·ARM GCC 빌드 후 실행, 카메라 미리보기·SD 파일 저장 |
| `npm run test:toolchain` | 로컬: 빈 프로젝트와 예제 126개(시뮬레이터 전용 sd_logger 제외)를 앱의 ARM GCC 빌드 경로로 모두 컴파일·링크하고 에뮬레이터에서 실행 — HardFault·Error_Handler 없음, 도달한 시뮬레이션 시간에 비례해 SysTick 진행 확인. CI: 대표 11개 |
| Windows 릴리스 검사 | 업데이트 도우미(잠긴 EXE 교체·실패 시 복원·부모 종료 후 실행), 패키지 앱 실행, 포터블 EXE 업데이터 상태 통과 |

이번 검증에서 발견해 수정한 기존 결함: ARM 빌드 환경의 SysTick/IRQ 처리기 weak 충돌(`HAL_Delay` 정지), DMA 스트림 IRQ 처리기 누락(DMA 예제 정지), DCMI/SD 등 HAL 모듈 미포함, MAX98357A I2S PLLI2SM 누락, `.ioc` `S_TIMx_CHy` 가져오기, 포인터 뺄셈, 터미널 첫 프롬프트 한글 경로.

한계: 실물 MCU에서의 실행 검증은 아닙니다. 에뮬레이터는 MPU 강제·DWARF 지역 변수·일부 주변장치 모드(I²C/SPI 슬레이브, ADC 다중 모드, USART LIN/IrDA 등)를 모델링하지 않으며, 84 MHz 펌웨어는 실제 속도의 약 0.6~0.7배로 실행되며, 입력 핀을 빠르게 반복해서 읽는 회로(초음파 에코 대기, L298N 등)는 매 읽기마다 회로를 다시 계산하므로 약 0.1~0.2배로 느려집니다.


## 0.25.2 빵판 예제 배치 — 공개 배포 검증 완료

2026-10-19. [상세 보고서·원본 로그](audits/0.25.2-breadboard/REPORT.md). [Release v0.25.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.2) · [전체 Windows CI 39257882264](https://github.com/moonsyu/STM-Simulator/actions/runs/39257882264) 성공.

- Docs·예제 검색·새 프로젝트 템플릿의 모든 예제 부품을 빵판 위에 장착합니다. 다리와 점퍼의 구멍을 분리하고 몸체·접점을 피하며 전원 레일과 신호를 분리합니다.
- CI 단위 411개. 라이브러리 120개 배치/연결망 대조, Docs 114장치 실제 모델 실행·손상 복구 후 재실행, 개별 단선 1,068개 복구 통과. 개발 중 1,062개 검사와 최종 제품 소스 검사는 구분합니다.
- 초기 CI에서 발견한 배선 개수 고정 검사와 작은 화면의 크기 조절 핸들 간섭을 수정하고 실패·재검사 기록을 보존했습니다. 후속 제품 커밋 `7b4c3fb5328c0e383a8e499f6f5c1e1aac3c65d9`의 전체 CI·태그/빌드·공개5자산·해시/latest를 확인했습니다.
- 공개 단독 EXE/ZIP 각각 C 의미7조건·종료/재열기 코드 보존, 공개 UI 6장치 Docs·실행 JSONL과 타이머 빵판 경유 통과. 공개0.25.1→0.25.2 실제 자동 업데이트와 사용자 설정 보존 통과.
- EXE SHA-256 `85b1bbb5a387e3a8cdb71bee9263fd38fc15f37296aeda5ef52c1d2ce7baed1c`. 모델 114종 검사와 공개 UI 6종 검사를 구분하며 실물 MCU 실행 검증은 아닙니다. 후속 문서 커밋은 제품 태그와 자산을 덮어쓰지 않습니다.

## 0.25.1 PIN 설정·IRQ·Analog 수정 — 공개 배포 검증 완료

2026-10-19. [상세 보고서·원본 로그](audits/0.25.1-release/REPORT.md). [Release v0.25.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.1) · [Windows CI 39227299473](https://github.com/moonsyu/STM-Simulator/actions/runs/39227299473) 성공.

- 로컬/CI 단위 각406개 통과. 제품 태그·빌드 `243ecf205354e18ed4701213c117906ab6a35080`, sourceDirty=false, 공개5자산·latest·ZIP 내부 EXE·버전/커밋/해시 일치.
- 공개 단독 EXE와 ZIP 내부 EXE 각각 C 의미7조건 및 종료·재열기 최신 코드 복원 통과. 각각 PIN25개(실제 실행6회), Docs3조합(실제 실행6회)을 실제 UI·진단 JSONL·코드/배선·저장 복구로 확인했습니다.
- 공개0.25.0→0.25.1 자동 검색·다운로드/SHA·교체·새 앱 재기동·재열기 및 코드·테마·글꼴·보드 크기·자동 업데이트 설정 보존 통과.
- 이전0.25.0 개발 수정본의 PIN362/Docs독립7 검사와 공개0.25.1 검사를 별도 기록합니다. 모든 임의 장치 조합이나 실물 MCU 검증을 뜻하지 않습니다.
- EXE SHA-256 `8ab5fc812df020b4bf68b9eb8941e521be75199e0c1cc66ff1a45e08d2c58566`. 후속 문서 커밋은 제품 태그와 배포 파일을 변경하지 않습니다.


## 0.25.0 작업 화면·장치 모델 — 공개 배포 검증 완료

2026-10-19. Windows 참고 White/Dark 팔레트, System 자동 추종, 적응형 작업 공간, 접근성, 실제 장치 모델/접점 및 둥근 배선을 개선했습니다. [단계별 실패·수정·재검사 보고서](audits/tinkercad-workbench/REPORT.md).

- 로컬 단위397개, 화면24조합·72상태·427판정, 114종 프리뷰, 실제 ARM HAL 링크122조건을 통과했습니다. 코드 테마 importer와 저장 기본 테마 교정 후 원본 C 토큰·사용자 설정 보존도 확인했습니다.
- Electron nativeTheme 알림, HAL GPIO/USART2와 입력·RESET의 실제 진단 로그, 파일/자동 저장 연속 오류와 복구, GCC/GDB/clangd 실행을 확인했습니다.
- [Windows CI39214636630](https://github.com/moonsyu/STM-Simulator/actions/runs/39214636630) 전체 검사·빌드·[v0.25.0 게시](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.0) 성공. 제품 커밋 `2278c2da1a6c14ec16b1629af136172ce7a1e078`, sourceDirty=false, 공개5자산·latest·태그/빌드 커밋·ZIP 내부 대조 통과.
- 공개 `STM-Simulator.exe`는102,783,034 bytes, SHA-256 `e678a2533cd8fd7fac864b466077c9df94bca1ffe4b5bb12d43c8527319cfc35`. ZIP SHA-256 `61ad97c361c3f75f8fb55d2ba15672a83f954485fd1e0167b8ea98713caa4d1e`.
- 내려받은 공개 EXE에서429판정·74상태(기본72+추가2)·10시나리오·114모델 통과, 대비37,062건에서 저대비0·renderer 오류0. native System과 실제 C 토큰 색도 확인했습니다. 정상 크기 Dark/White와900폭·글꼴20 두 테마 화면을 직접 검토했습니다.
- 단독 공개 EXE·ZIP 내부 EXE 각각 의미론7조건과 즉시 종료·재열기 최신 코드 복원 통과. 공개 Docs는 `tft`·`ref_st7735_8`·`uart` 3종의 코드/배선/실제 실행 로그를 대조했으며 개발 앱114장치 Docs와 구분합니다.
- 원본 공개0.24.0→0.25.0의 실제 자동 검색·다운로드/SHA·EXE 교체·새 main 재기동·재열기 통과. 코드·Jellybean·글꼴17·배율1.25·자동 업데이트 설정을 보존했습니다.
- [공개 검증 집계](audits/tinkercad-workbench/evidence/public-verification.json), [화면 해시](audits/tinkercad-workbench/evidence/public-screenshots.json). CI1 실패·CI2 취소·CI3 실패와 모든 앱 검사 후 발생한 보조 manifest 저장 오류/복구는 원본 이력으로 유지합니다. 후속 문서 커밋은 제품 태그·자산을 덮어쓰지 않습니다.

## 0.24.0 캔버스 UX 1단계·공개 배포

2026-10-19. 가이드 Step 1-1~1-5 적용. 커서 중심 줌, 영역 선택/복제, 실시간 인스펙터 DOM 보존, 빵판 캐시, 배선 20색/논리 상태를 구현했습니다. 후속 2~5단계는 포함하지 않습니다. [상세 보고서와 증거](audits/0.24.0-canvas/REPORT.md).

- 374 단위 검사, 기존 52상태 대비와 신규 19상태 대비, 새 UI 13범주 통과. Monaco 빌드 및 npm audit 0건.
- [Windows CI 39186362509](https://github.com/moonsyu/STM-Simulator/actions/runs/39186362509) 두 작업 전체 성공. [v0.24.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.24.0)을 최신 릴리스로 게시했습니다.
- 제품 빌드/태그 커밋 `649d412d16b3ac1174e11434d56a1b7e1790c0bb`, sourceDirty=false, CI 출처 일치. 공개 EXE·ZIP·SHA256·BUILD-INFO·update-manifest 5개 자산과 버전/커밋/해시/latest를 확인했습니다. ZIP 실행 바이너리는 `STM-Simulator.exe` 하나입니다.
- 공개 EXE SHA-256: `1cafaa7669f0782ff339ea1f4a1a2cfaaedb0e8aaef87885c4b7de80999ccf81`. EXE 102,762,858 bytes, ZIP 105,640,391 bytes. 비인증 다운로드와 ZIP 내부 EXE/메타데이터/배포 문서를 대조했습니다.
- 내려받은 공개 EXE에서 13개 통합 범주, 19개 대비 상태(9,962텍스트), Dark/White 2해상도 화면을 통과했습니다. renderer 오류와 저대비 0건. 파일 진단 로그의 버전/종류/해시는 `evidence/public-runtime-log.json`에 보존합니다.
- 단독 EXE와 ZIP 속 EXE 각각 C 의미 7조건 및 편집 직후 종료→재실행 복원을 통과했습니다.
- 공개 0.23.9 EXE의 실제 자동 스케줄러에서 새 릴리스 검색→다운로드→SHA-256 검증→저장/교체→새 버전 재실행을 확인했습니다. 코드, Jellybean, 글꼴 17, 장치 배율 1.25, 자동 업데이트 설정을 보존했습니다. 사용자 앱/프로필은 조작하지 않았습니다.
- 첫 공개 검사에서는 숨겨진 창의 requestAnimationFrame 폴링이 주기적인 GPIO 변화와 맞물려 30초 timeout이 발생했습니다. 제품 변경 없이 검사만 같은 DOM의 실제 MutationObserver 변화(5초 상한)로 수정했습니다. 시작/변화 시각과 DOM 동일성, 초기 실패 증거를 함께 보존합니다. 후속 커밋은 이 검사와 검증 문서만 보완하며 배포 제품 소스/태그/자산을 교체하지 않습니다.

## 0.23.9 감사 결함 수정·공개 배포

2026-10-18. 저장·복구를 포함한 A01~A17 수정과 실제 실행 검증을 완료했습니다. [상세 보고서와 증거](audits/0.23.9-fixes/REPORT.md).

- 365 단위 검사, 독립 GCC/ARM 대조, 114 장치·979 HAL 카드 실행, 701 단선·114 손상 회로 복구, 128 최소 코드 초기화·114 재적용 통과.
- 독립 Electron 저장 오류/빠른 편집/프로젝트 전환/종료 복원, 52 화면 대비 검사, 실제 GCC/GDB/clangd/ARM 도구와 clean npm audit 0 확인.
- [Windows CI 39128144301](https://github.com/moonsyu/STM-Simulator/actions/runs/39128144301) 전체 성공. [v0.23.9 Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.9) 최신 선택과 공개 5개 자산, ZIP 내부 포터블 EXE, 버전/해시/출처 확인. 제품 커밋 `105eab70a2f3cb2bb8151042768eacb62c93f9fc`.
- 공개 EXE/ZIP 각각 C 회귀 7개와 입력 직후 종료·재실행 복원 통과. 공개 EXE Docs 적용·실행 7종의 파일 로그, TFT 전체 픽셀, UART RX/TX 확인.
- 구버전 공개 EXE 사본에서 0.23.8→0.23.9 실제 자동 다운로드·해시 검증·교체·재실행·코드/설정 보존 통과. 사용자 앱은 조작하지 않았습니다.
- 공개 EXE SHA-256: `8aa6bc0deafe4b315242df85f2310c320bce56617bb56cdd6b811486dd18f585`. 이후 문서 커밋은 이 배포를 덮어쓰지 않습니다.

## 0.23.3 기존 HAL 예제·코드 초기화

- 소스 검증: 기존 HAL 원본 40개, 기존 Docs 36개, HAL 카드 308개, 단선 복구 204개, 교차 포트 스테퍼/L298N 실행 통과.
- 단위 검사 310개, 실제 ARM GCC 링크 46개 통과.
- 독립 Electron에서 취소/Esc/undo/redo/핀·회로·파일 보존, 초기화 LED OFF와 재적용 ON, 모터 재배선의 진단 파일 통과.
- 공개 배포 검증 완료: Windows CI [39008820868](https://github.com/moonsyu/STM-Simulator/actions/runs/39008820868) 성공. 공개 EXE Docs 36개 및 코드 초기화/재배선 실행 로그 통과. [상세 보고서](audits/0.23.3-legacy-docs/REPORT.md).
- Release: https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.3 · 빌드 커밋 `7bf2600d78fdfbf85d224969f15bf10e01e8332f`. 공개 EXE/ZIP/체크섬/빌드 정보/매니페스트 5개와 최신 릴리스 선택 확인.
- 공개 STM-Simulator.exe SHA-256: `217f07be77a159e52245390953d50e790092f1faf6e9b8df946cecbb8fb81c40`. 이후 검증 기록 커밋은 배포 코드/버전을 바꾸지 않음.

검증일: 2026-10-17. 작업 경로 `D:\codex\project\STM-Simulator`. 사용자 앱/회로를 조작하지 않고 독립 프로젝트와 숨긴 테스트 프로필을 사용했습니다.

- Docs 반환값 이름 충돌, 버튼 2종 접점 병합, 인코더 에지 누락, 커패시터 PWM 모드, TFT 상태 크기/typed array IPC 문제 수정.
- 단위 검사 299개 통과. 최종 inline·장치 동작·진단 회귀 23개 통과. 수정 관련 HAL/CMSIS 예제 47개 ARM GCC 컴파일·링크 통과. 실물 보드 실행 결과는 아닙니다.
- 전체 장치 114개와 모든 배선 누락·오접속 복구 회로 114개를 실제 시뮬레이터로 실행. 센서 값/버튼/회전 입력을 변경해 출력·통신·전류·메모리·기계 상태 판정.
- 단선 701건의 연결 복구·신호 분리 검사, HAL 카드 979개 선택 API 호출/반환 확인. API 도달과 전체 장치 동작은 별도 판정. 구버전 문제 회로 10개 재적용 후 동작·사용자 코드/함수/파일 보존 확인.
- Bare-metal 274개 삽입·ARM 대상 전환은 통과. 직접 레지스터 코드는 HAL 실행기에서 실행하지 않으며 동작 검증으로 계산하지 않습니다.
- [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38928311749) 및 [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.2) 성공. 태그/빌드 커밋 `dfdd09c86e93cb6273af66d6d6ee5308c2d0b8b2`. GitHub latest `v0.23.2` 확인.
- 공개 EXE, ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json 다섯 자산 검증. 비인증 공개 다운로드, ZIP 내부 EXE, 버전·크기·태그/빌드 커밋·해시·문서 일치 확인.
- EXE 102,751,106 bytes, SHA-256 `f39b30431204776ce37f202ce20f6265d3216baeb190da5009963732e487956b`. ZIP SHA-256 `2b1df0d632c1d6da619e75f746fa77cab407eac0495d75631ed18a1dd0bc9cbb`.
- 내려받은 공개 EXE로 114개 실제 파일 열기 → Docs 버튼 → 실행. 전부 상태 파일 기록, 소스 감사와 main 코드·배선 일치, 실행/페이지 오류 및 전기 단락 없음. 환경값 입력 UI와 UART 송신도 사용. 두 TFT의 20,480개 RGB565 픽셀 전체 해시 확인.
- DS18B20 두 모델 `25.00 → 10.00 → 45.00 C`, 인코더 두 모델 `count=3/edges=12 → count=1/edges=4`, SD `OCR=40ff8000` 실제 공개 EXE 로그 확인.
- [장치별 보고서](audits/0.23.2-device-docs/REPORT.md), results.json, hal-cards.csv와 별도 수정 위치 기록 저장. 원시 테스트 데이터는 `work/test-results/docs-audit-0.23.2` 및 `work/audit-archives/docs-audit-0.23.2.zip`에 보관합니다. 실제 사용자 진단 자료는 포함하지 않습니다.
- 기존에 삽입된 main은 자동으로 변경하지 않습니다. 업데이트 후 해당 Docs를 재적용해야 수정 코드/배선이 반영되며 직접 편집한 관리 영역은 보호합니다.

---

# 검증 기록 — 0.23.1 공개 릴리스

검증일: 2026-10-16. 작업 경로 `D:\codex\project\STM-Simulator`.

- 사용자 자동 저장 데이터의 읽기 전용 사본에서 0.23.0 WritePin 적용 후 main STEP이 비어 있음을 확인. 최신 사본에는 LED 캐소드의 GND 선도 없음. GND 선이 사라진 조작은 확인하지 못함.
- 수정 후 모델 검사 **287개 통과**. 새 회귀 검사에서 main의 SET 점등·RESET 소등, 기존 초기화/사용자 코드/함수 목록/파일 보존, 빵판 GND 누락 복구, PA5 점유 시 핀 재배정과 카탈로그 LED를 확인.
- 실제 저장 사본 두 개에 재적용해 정상 선을 그대로 유지하고 최신 사본의 GND 1개만 추가. LED 모의 전류 **3.9267 mA**, 점등 확인. 사본으로 검증했으며 현재 열린 사용자 회로는 수정하지 않음.
- 두 사본의 적용 결과를 실제 ST HAL/CMSIS와 ARM GCC로 컴파일·링크. 실물 보드 실행 검사는 아님.
- `node scripts/docs-writepin-check.cjs`: 분리된 숨긴 Electron 프로필에서 실제 Docs 카드 버튼, main 삽입, 실행 로그의 점등/소등, 재적용 GND 복구, 이벤트-회로 해시 일치 통과. 사용자 앱 프로필에 접근하지 않음.
- 로컬 진단 단위 검사: 파일 회전, 잘못된/과대 입력 거부, 디스크 실패 복구, 기록 순서와 스냅샷 시점, 웹 환경·저장 실패 시 앱 동작 유지.
- 증거: ignored `work/diagnostics/{all-tests.log,user-project-verification.json,arm-verification.json}`, `work/test-results/docs-writepin-check.json`.
- [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38918319975)와 [Release v0.23.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.1) 게시 성공. 빌드/태그 `99f8f02e578dfc1510fe06a834e111f11f9e4197`, Git 작성자/커미터 및 게시 인증 `moonsyu` 확인. GitHub latest는 v0.23.1.
- 공개 `STM-Simulator.exe`, `STM-Simulator-0.23.1-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 검증. EXE/ZIP 비인증 다운로드, ZIP 내부 EXE, 버전·태그·빌드 커밋·크기·해시·문서 일치 확인. 로컬 `outputs/artifact/`도 해당 ZIP으로 갱신.
- EXE 102,750,052 bytes, SHA-256 `fab499411f0d9c97f907b23ada771b111aed367aaf069acde32644d307ddcd45`. ZIP SHA-256 `c6f9c6646fc27ea414973d86fa9e36d6749f975b2083cdce54bbab7b07d1a36d`.
- 내려받은 공개 EXE를 별도의 숨긴 프로필에서 실제 실행. WritePin 카드 → main SET → 실행 로그의 LED 점등, GND 삭제 후 재적용 복원, main RESET으로 변경 후 소등, 앱 버전 0.23.1의 파일 로그 기록까지 통과. 현재 사용자 앱과 원본 회로는 변경하지 않음.
- 공개 검증 증거: `work/test-results/release-0.23.1-ci.json`, `release-0.23.1-proof.json`, `public-0231-proof.json`. 기존 회로의 빈 STEP은 자동 변경하지 않으므로 업데이트 후 WritePin 카드를 재적용해야 함.

---

# 검증 기록 — 0.23.0 공개 릴리스

검증일: 2026-10-16. Windows x64. 새 회로는 빈 공간으로 시작하고 검색으로 보드 한 개와 빵판 여러 개를 추가합니다. 코드 실행과 Pinout은 기존 단일 보드 방식입니다.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38850545260) 성공. 검증 시 GitHub latest는 v0.23.0입니다.
- 빌드 커밋과 공개 태그: `81fe66f6753a25221b05dba91cc711d02d49af2f`. 작성자·커미터·푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.23.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 비인증 다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP으로 갱신했습니다.
- EXE 102,747,334 bytes. SHA-256 `16c6d108b794f7a856b4889ffd77cb33426c295c962d28ae9de0699cbf925ab4`.
- ZIP SHA-256 `44382be573c940c0a211db705692fb14979c33ce89d4a96de4c2d8623e1bdb14`.
- 공개 EXE를 별도 임시 프로필에서 직접 실행하여 빈 화면, 검색 보드 중복 방지, 빵판 여러 개, 기존 Pinout, 배선 20색, 삭제/되돌리기/재열기, main 내부 Docs 적용 및 LCD 실행을 확인했습니다. Dark/White 12개 화면 상태에서 글자 대비 문제는 없었습니다.
- 증거: `work/test-results/release-0.23.0-proof.json`, `work/test-results/public-023/public-exe-proof.json`, `work/test-results/release-0.23.0-ci.json`.

## 기능 및 회귀 검사

- 모델 검사 **280개** 통과. **114개 검색 항목의 HAL 함수 카드 977개** 적용·미리보기에서 새 함수/파일 없음, 재적용, 기존 GPIO 설정과 사용자 main 코드 보존을 검사했습니다.
- 실제 ST HAL/CMSIS를 사용하는 **381개 HAL/레지스터 예제** ARM 컴파일·링크 통과. 마지막 초기화/이전 코드 호환 변경 후 UART·LCD·SHT31·SD 및 두 UART 사례 **16개**를 추가 컴파일·링크했습니다. 실물 보드 실행 검증은 아닙니다.
- 모든 113종 부품과 보드/기본 빵판 크기 조절, 114개 검색 미리보기, Dark/White 글자 대비, 시스템 테마, 이동/무제한 캔버스, colorscheme 등록, IDE 편집/빌드/실행, HAL 예제, 회로 편집, Docs, USART2 터미널, 자동 업데이트 회귀 검사를 통과했습니다.
- 새 회귀 검사: `tests/empty-workspace-inline.test.js`, `scripts/empty-workspace-ui.cjs`. UI 검사에는 핀 선택 후 새 프로젝트 생성도 포함됩니다.
- Docs는 main에 넣을 문장만 표시합니다. 기존 MX 초기화 함수가 있으면 보완하고 없으면 main에 초기화 본문을 넣습니다. UART/EXTI Docs는 새 콜백 없이 폴링하며, 기존 별도 HAL 예제 메뉴의 인터럽트 예제는 유지합니다.

---

# 검증 기록 — 0.22.0 공개 릴리스

검증일: 2026-10-15. Windows x64 / Electron 44.2.0 / Monaco 0.57.0.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.22.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38709544798). GitHub latest는 v0.22.0입니다.
- 빌드 커밋과 공개 태그: `3e9b3e40059b6ebf98a2f7f7667d2e1e1db9ba48`. 작성자·커미터·푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.22.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 비인증 다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP으로 갱신했습니다.
- EXE 102,742,609 bytes. SHA-256 `110eeb098c245ec0cca46250d90e005194754dbf039cc3f9aaa73c94a25462a0`.
- ZIP SHA-256 `ee0edc3cb2207ddd3a1d75db455561acec434db43c73f802d050415a7773d958`.
- 증거: `work/test-results/release-0.22.0-proof.json`, `work/test-results/public-022/public-exe-proof.json`.

## 구현과 검사 결과

| 항목 | 확인 결과 |
| --- | --- |
| 화면 테마 | 기본 System, Dark/White 직접 선택, 상단 토글 및 System 복귀. OS 색상 media 변경을 브라우저에서 재현하여 자동 전환/수동 고정/재시작 보존 확인. 실제 Windows 개인 설정은 변경하지 않음 |
| 코드 테마 | Dark 기본 Jellybeans, White 기본 GitHub Light Default 6.3.5. 모드별 코드 테마 선택, 등록/수정/내보내기/재시작과 화면 팔레트 독립 확인. 두 원본 SHA-256 및 MIT 고지 보존 |
| 들여쓰기 | 실제 Monaco 키보드 Tab으로 스페이스 4칸 확인. 모델 전환 시 옵션 적용 및 v1 설정 이전 검사 |
| 기본 보드·빵판 이동 | 실제 몸체 드래그, 장착 부품과 내부 경유점 이동, 외부 배선 끝점·핀 좌표, 한 번의 Undo/Redo, Esc 취소와 재시작 보존 |
| 배선 우클릭 취소 | 바닥과 GPIO에서 우클릭 시 작성 중 경유점/미리보기 제거, 기존 배선 보존, GPIO 설정창을 잘못 열지 않음, 취소 후 새 배선 완성 |
| 배치 공간 | 고정 좌표 상한 제거. 음수/6000 초과 보드·빵판 이동, 2핀·다핀 새 부품 배치, 가운데 버튼 팬, 전체 보기와 저장/재시작. 유한수·부품 수·배선 수 검증 유지 |
| 모델 | 전체 273개 통과. 설정 호환/모드 분리/원본 테마 해시/이동 기하 및 경유점 회귀 검사 포함 |
| 글자 대비 | Dark/White 52상태 HTML 글자/placeholder 대비 4.5:1 미만 0건. 상단 버튼·Pinout 카드/footer·검색·설정·다이얼로그·터미널·1024px 창 포함 |
| 시각 확인 | Dark/White 전체 화면, Pinout 및 작은 창 설정을 캡처 묶음으로 확인. 추가 시각 수정 없이 통과 |
| 기존 기능 | 113종 실제 크기 조절, colorscheme 등록, HAL 카탈로그·Docs·main.c 삽입·배선 로컬 UI 통과. 전체 Windows CI에서 미리보기·IDE/편집/HAL/USART2 UI와 업데이트/패키지 검증 통과 |
| 공개 EXE | 다운로드한 실제 단일 EXE에서 새 테마/이동/우클릭/넓은 배치 검사 전체 및 두 테마 12상태 대비 검사 통과. 격리된 테스트 프로필 사용 |

대비 검사는 HTML UI 대상이며 C/C++ 토큰 원본 팔레트와 장치 SVG 도색은 제외합니다. 코드 테마 변환은 지원 C/C++ TextMate 범위이며 VS Code의 전체 문맥/semanticTokenColors를 복제하지 않습니다. 실제 ARM 보드 디버깅과 이전 공개 버전에서 새 버전으로 자동 다운로드·교체하는 전체 경로를 이번 변경에서 다시 실행하지 않았습니다. CI의 포터블 업데이트 도우미/EXE 교체·롤백 검사는 통과했습니다.

## 별도 미해결 감사 항목

앞서 재현한 저장 트랜잭션 실패, 저장 직후 편집 시 미저장 경고 누락, 새 프로젝트의 터미널 경로, 종료 직전 자동 저장 지연 4건은 이번 요청 범위에 포함하지 않았습니다. `docs/NON-DEVICE-AUDIT.md`에 원인·코드 위치·재현·수정 방향을 보존했습니다.

이 게시 후 기록은 같은 버전의 문서 커밋으로 남기며 공개 태그/자산을 덮어쓰지 않습니다. 0.19.0 이하에서 고정 EXE 이름으로 전환하려면 0.20.0 이상을 한 번 수동 다운로드합니다.


## 0.23.4 지정 UI 제거·단축키·보드 초기화

- 단위/모델 312개 통과. `controls-reset-check.cjs`의 독립 Electron 프로필에서 제거된 UI, Ctrl+F/R, W 실제 배선, Alt+0 크기, 패널 이동/복원, 초기화 취소/Esc/코드 보존/undo/redo/재시작을 검증했다.
- F11의 helper 입력 3, F10 후 doubled=6, Shift+F11 반환 후 counter=7을 확인했다. F6 일시정지와 Shift+F5 정지 및 유휴/모달에서의 잘못된 실행 방지를 검사했다. 같은 단축키로 실제 Windows GCC/GDB 진입/단계 실행/종료도 검사했다.
- 파일 로그: `work/test-results/controls-reset-dev.json`, `controls-reset-unit.log`. UI 상태와 앱 `board.reset`, `debug.command`, `debug.paused` 이벤트를 보존한다.
- 시각 검사: `controls-visual-check.cjs`, Dark/White 1360×900 및 1024×640. 숨김 Electron의 모달 화면 캡처 지연은 headless 브라우저의 동일 화면 검사로 분리했다. 실제 기능 검증은 Electron에서 수행했다.
- 공개 Release/EXE 검증 완료: [0.23.4](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.4), [Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/39013524275). 공개 EXE에서도 9개 기능 검사와 실제 Windows GDB 단계 실행 통과. [보고서](audits/0.23.4-controls/REPORT.md).
- 빌드 커밋 `69ab8d988a347559f7d54f7c30cafcb006ff260f`, EXE SHA-256 `c5117ac8e5c31a560af81847c742d8d5dddcad9cc535abdccb4f10869476d61e`. 5개 배포 자산과 최신 Release 선택 검증.


## 0.23.5 미사용 핀 별칭 제거

- 단위/모델 314개, ARM 컴파일·링크 122개, 독립 Electron 14개 및 공개 EXE 동일 검사 통과.
- 초기화 후 LD2 매크로 제거, Pinout 라벨 보존, LED OFF 0 A → Docs 재적용 ON 약 3.93 mA 확인.
- Windows 전체 CI와 공개 5개 자산·태그 커밋·해시·최신 릴리스 확인. [보고서](audits/0.23.5-pin-aliases/REPORT.md).


## 0.23.6 코드 초기화 전수 정리

- 단위 322개, 초기화 모델/ARM 빌드 128개, 장치 Docs 재적용 동작·회로 보존 114개 통과.
- 개발/공개 EXE에서 초기화 128개와 기본 동작 14개 검사 통과. 로그에 무출력·고장 없음·LED OFF/ON 확인.
- Windows 전체 CI와 공개 5개 자산·버전·커밋·해시·latest 확인. [보고서](audits/0.23.6-minimal-reset/REPORT.md).
