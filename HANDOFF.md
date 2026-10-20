# STM Simulator — 개발 인계

현재 버전: **0.27.0**. 정리일: **2026-10-21**. NUCLEO-F446RE와 빵판을 연결하고 HAL C 소스를 해석 실행하거나, ARM GCC로 빌드한 ELF를 Cortex-M4 에뮬레이터에서 실행하는 Windows 학습용 IDE다. 사용자에게는 한국어 존댓말로 응답한다. 공개 릴리스와 로컬 구현 버전을 구분한다.

## 0.27.0 빵판 · 예제 배선 최적화 · Docs 제거 · 단축키 · UI 정리

- **빵판**: 400홀 하프 빵판 그림을 실물 사진에 맞춰 다시 그렸다(구멍 ID·좌표 불변). 830홀 풀사이즈 빵판은 `type:'breadboard'`에 `variant:'full'`(63열 a–e/f–j, 위·아래 레일 50홀). 모델은 `pins.js`의 `BREADBOARD_VARIANTS`/`breadboardModel(part)`, 배치·경계는 `breadboards.js`(`newBreadboardFields`, `breadboardBounds`). 부품 목록 항목 `breadboard_full`.
- **예제 배선**: `src/example-layout.js`(배치 계획)·`src/wire-router.js`(경로)로 127개 예제를 다시 배선했다. 배선 1167→684개, 교차 1475→17개, 겹침 1075→0. 넷리스트·핀·코드는 그대로이며 `tests/unit/example-wiring.test.js`가 지표(`tests/fixtures/example-wiring-baseline.json`)를 지킨다. ov2640_camera, camera_tft, motor_driver_hat, matrix_10은 기존 배치 후 경로만 다시 계산한다.
- **장치 Docs**: 장치별 `/* STM-DOCS BEGIN <type>:<partId> <ROLE> */` 표식으로 삽입 영역을 추적한다. GPIO는 `MX_GPIO_Init`, 주변장치는 `MX_<P>_Init`(없으면 Cube 방식 생성). BareMetal 모드는 레지스터 예제를 적용한다. `removeDeviceExample`로 코드만/코드와 회로를 제거하며 다른 예제가 쓰는 설정은 유지한다. 영역 안을 수정해도 제거된다. 0.23~0.26 공용 영역은 변환한다.
- **단축키**: `src/keybindings.js`(기본값·저장 `stm32lab.keybindings.v1`·두 단계 키). `shell.js`의 단일 캡처 리스너가 처리한다. 기본 Ctrl+F5 실행, F10 디버그 시작(멈춤 시 계속), F11 한 줄 실행, Ctrl+F2 중지. **편집 → 단축키 설정** 보기에서 변경. 숨은 Electron 기본 메뉴가 F11·Ctrl+R·Ctrl+W를 가로채므로 `Menu.setApplicationMenu(null)`.
- **UI**: 태양/달 아이콘 하나로 Dark/White(System 기본), 설정은 편집 메뉴로 이동(활동 바 아이콘 제거), 활동 바 툴팁은 아이콘 오른쪽, 아이콘 드래그 정렬(`activityOrder` 저장), 실행 환경은 실행 및 디버그 보기 위쪽, 제목 표시줄의 프로젝트 이름·업데이트 버튼 제거(도움말 메뉴·상태 표시줄), 코드/회로 그룹 사이 1px 구분선.

## 0.26.0 VS Code형 작업 화면 · 펌웨어 에뮬레이터 · 테스트 재작성

- **작업 화면**: `src/shell.js`/`src/shell.css`가 활동 바·사이드바 보기·편집기 그룹(코드/회로)·하단 패널·속성 보조 사이드바·상태 표시줄·메뉴·명령 팔레트를 구성한다. 기존 컨트롤은 ID와 리스너를 유지한 채 재배치하며 `layout.reveal/showView/showPanel/toggle/maximize` API를 제공한다. 배치는 `stm32lab.shellLayout.v1`에 저장한다. 이전 `workspace-layout.js`/`workbench-ui.js`/`layout-model.js`는 삭제했다. 화면 팔레트는 `ide-preferences.js`의 `LIGHT_UI`/`DARK_UI`(VS Code Modern 계열)이다.
- **펌웨어 에뮬레이터**: `src/emu/`(bus·cpu·scs·elf·machine, QEMU 대조 19개 펌웨어)와 `src/emu/stm32f446/`(주변장치·soc·signals·fat), `src/firmware-session.js`(SimulationSession과 같은 인터페이스). 실행 대상 `emulator`는 `native-build.cjs`로 ARM 빌드 후 IPC `native:elf`로 ELF를 받아 실행한다. `firmware:open-elf`로 외부 ELF를 연다. 구조는 [EMULATOR.md](docs/architecture/EMULATOR.md).
- **인터프리터 확장**: NVIC 선점(`hal-nvic.js`), HAL DMA(`hal-dma.js`), USART 동기(`hal-usart.js`), DCMI/카메라(`hal-dcmi.js`, `camera.js`), SD/FatFs(`hal-storage.js`, `sdcard.js`), 비트 단위 신호·잡음(`signals.js`), 새 예제 7개(`advanced-examples.js`, `allHalExamples()`로 등록).
- **UI 연동**: 로직 분석기(`logic-analyzer.js`, `session.signals` 계약), 카메라 미리보기·SD 파일 목록(`part-media-ui.js`). SD 카드 이미지는 `part.cardImage`(SD1 형식)로 인터프리터와 에뮬레이터가 공유하며 정지 시 프로젝트에 저장한다.
- **수정한 기존 결함**: ARM 빌드 환경의 SysTick/IRQ 처리기가 weak로 생성되어 시작 파일의 weak `Default_Handler`와 충돌해 `HAL_Delay`가 멈추던 문제(사용자 정의가 없을 때 strong으로 생성), MAX98357A I2S 예제의 PLLI2SM 누락, CubeMX `.ioc`의 `S_TIMx_CHy` 핀 가져오기, 포인터 뺄셈, 터미널 첫 프롬프트의 한글 경로 깨짐(작업 폴더도 상태에 표시).
- **장치 외 점검 AUDIT-01~04**: 0.25.x 커밋 `fd53440`에서 수정되었고, 이번에 새 E2E 테스트(`tests/e2e/storage.e2e.test.mjs`)와 단위 테스트(`tests/unit/desktop.test.js`)로 다시 확인했다. [NON-DEVICE-AUDIT.md](docs/NON-DEVICE-AUDIT.md)는 해결 상태로 갱신했다.
- **테스트 재작성**: 기존 `tests/*.test.js`와 `scripts/*-smoke.cjs`·`*-check.cjs`·감사 스크립트를 삭제하고 `tests/unit`, `tests/interp`, `tests/emu`, `tests/firmware`, `tests/e2e`, `tests/toolchain`, `tests/release`로 새로 작성했다. Node 22의 `node --test`는 디렉터리 인자를 받지 않으므로 package.json은 glob을 사용한다.

## 0.25.2 빵판 예제 배치 (공개 완료)

- 공개 버전 0.25.2. 예제 부품 빵판 장착, 별도 구멍 점퍼, 신호 분리, 장애물 회피 경로를 구현했습니다. 적용은 Docs/예제 검색/새 프로젝트 템플릿 모두 포함합니다.
- 진행 상태와 내부 수정 지도는 `docs/audits/0.25.2-breadboard/REPORT.md`. 과거 공개 검증을 이번 버전의 증거로 혼용하지 않습니다.
- 114개 실제 시뮬레이션 및 1,068개 단선 복구, 120개 연결망·배치, UI 40개 예제와 여러 Docs 동시 실행을 검사했습니다. 사용자 프로필은 건드리지 않습니다.

- 공개 제품 커밋 `7b4c3fb5328c0e383a8e499f6f5c1e1aac3c65d9`, CI `39257882264`. 공개 5자산·latest·EXE/ZIP 실행·복구, 공개 UI 6장치·타이머 경유, 0.25.1→0.25.2 자동 업데이트를 확인했습니다. 세부 증거는 위 보고서에 보존합니다.

## 0.24.0 캔버스 UX (공개 완료)

- 사용자 문서 `docs/IMPROVEMENT-GUIDELINES.md`의 Step1-1~1-5 적용. 2~5단계는 후속 로드맵으로 남습니다.
- 커서 줌, Shift 영역 선택, Ctrl/Cmd+A/D, 비파괴 실시간 인스펙터, 빵판 캐시, 인스펙터 20색과 신호 배지를 추가했습니다. Esc 삭제/취소 규칙과 저장/복구를 유지합니다.
- 전체 Windows CI 및 공개 EXE/ZIP 실행·복원, 신규 UI 13범주/대비 19상태, 0.23.9→0.24.0 자동 업데이트 통과. 배포 제품 커밋은 `649d412`이며 후속 검증 문서/검사 보완은 릴리스를 덮어쓰지 않습니다.
- source 상태/검사/공개 배포 여부는 `docs/audits/0.24.0-canvas/REPORT.md` 참조. 후속 작업에서도 사용자 실제 앱을 조작하지 않고 독립 프로필로 검증합니다.
- 0.23.9의 저장·C·Docs·의존성 결함 수정은 `docs/audits/0.23.9-fixes/REPORT.md`에 보존되어 있습니다.

## 0.23.1 WritePin 적용 및 파일 진단

- 작업 위치는 `D:\codex\project\STM-Simulator`. 현재 앱 상태 조사는 화면 조작보다 [로컬 진단 파일](docs/DIAGNOSTICS.md)을 먼저 사용한다.
- 0.23.0 LED WritePin 카드는 MX_GPIO_Init의 RESET만 보여 주고 main의 STEP은 비워 두었다. `src/device-inline-example.js`에서 실제 main용 SET 호출을 생성하며 미리 보기와 삽입 코드가 일치한다. 전체 TogglePin 예제는 그대로다.
- 당시 자동 저장 사본 두 개 중 최신 사본에는 LED GND 선도 없었다. 없어지게 된 조작은 확인되지 않았다. 기존 배선 복구 로직으로 재적용 시 GND 1개를 추가하고 정상 선은 보존함을 검증했다. 사용자 원본 프로필은 변경하지 않았다.
- `desktop/diagnostics.cjs`, `src/diagnostics.js`: 로컬 JSONL 1 MB×2, 최근 회로 사본 2 MB 이하, 코드/배선 해시 및 실행 상태 기록. 로그 외부 전송 없음. 실제 사용자 회로 사본은 ignored `work/diagnostics/`에만 보관.
- `tests/docs-gpio-operation.test.js`, `tests/diagnostics.test.js`, `scripts/docs-writepin-check.cjs`: 단독 API 실제 출력, GND 복원, 카탈로그 LED와 핀 재배정, 파일 기록/회전/오류 복구 검사. 이전 977개 카드 검사는 컴파일/형식 위주였으므로 동작 검증 완료로 해석하면 안 된다.
- 로컬 모델 287개, 별도 숨긴 Electron 프로필의 Docs 적용·SET/RESET·로그, 저장 사본 두 개의 실제 ST HAL/CMSIS ARM 링크 통과. 전체 Windows CI 및 공개 자산 검증은 아래 검증 기록의 최신 항목을 확인한다.
- [공개 v0.23.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.1), 빌드/태그 `99f8f02e578dfc1510fe06a834e111f11f9e4197`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38918319975) 성공. 다섯 공개 자산과 latest·해시·버전·커밋을 검증하고 다운로드한 EXE에서 LED 동작·GND 복원·로그 저장을 다시 확인했다. 기존 문제 회로는 업데이트 후 WritePin 카드를 재적용해야 한다. 현재 사용자 앱은 재시작하지 않았다.

## 0.23.0 빈 회로와 main 내부 예제 (공개 완료)

- 사용자 최종 결정: **보드는 1개, 기존 실행/Pinout 방식 유지**. 다중 보드·다중 펌웨어는 범위에서 제외. 빵판은 검색으로 여러 개(8개까지) 추가.
- `project.js`: 새 프로젝트 `surfaces.board.hidden/breadboard.hidden=true`. 표시 플래그가 없는 구버전 프로젝트는 두 기본 표면 유지. 기존 샘플 생성기는 `exampleProject()`로 명시적 보드/빵판 사용.
- `surfaces.js`, `pins.js`, `engine.js`, `circuit-edit.js`: 숨긴 표면의 접점/내부 버스 제거, 삭제 시 배선·장착 해제. app의 검색 보드 추가는 단일 표면 재사용. 기존 MCU 설정은 유지.
- `device-inline-example.js`와 `c-inline.js`: Docs 전용 main 예제, UART/EXTI 폴링, 보조 함수의 인자·지역 변수·반환·분기·반복문을 C 블록으로 전개. 함수 정의를 추가하지 않음. 원본 HAL 예제 메뉴는 유지.
- `device-code-insertion.js`: 기존 MX 초기화 함수 보완, 없는 초기화는 main에 본문 삽입, 사용자 코드 보존, HEADERS/DECLARATIONS/INIT/STEP/MX_* 영역 체크섬. 예전 Docs 콜백 연결 코드만 제거하고 사용자 콜백 본문 보존.
- `hal.js`: UART 폴링의 소수 시간 누적에 따른 0에 가까운 반복 yield 방지. `hal-source.js`: main 소스 한도를 프로젝트 한도와 동일한 300 KB로 정리.
- 배치 공간의 고정 제목/설명 제거. 부품 검색 114개(단일 보드 포함), 배선 기본 10 + 파스텔 10.
- 새 검사: `tests/empty-workspace-inline.test.js`, `scripts/empty-workspace-ui.cjs`; CI도 실행. 회귀 테스트는 예전 기본 표면 가정을 명시적 fixture로 바꿈. [공개 v0.23.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.0), 빌드/태그 `81fe66f6753a25221b05dba91cc711d02d49af2f`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38850545260) 성공. 모델 280개·114개 검색 항목의 HAL 카드 977개·ARM 예제 381개 검증. 공개 EXE/ZIP 재다운로드 및 실제 공개 EXE 기능/12상태 대비를 확인했습니다. 해시·증거는 `docs/VERIFICATION.md` 참고.

## 0.22.0 화면 테마 분리와 자유 배치 (공개 완료)

- 화면은 `ide-preferences.js`의 System/Dark/White, 코드는 모드별 Jellybeans/GitHub Light Default로 분리했습니다. `ide-settings-ui.js` 상단 토글·System 복귀·설정 선택, OS media 변경을 반영합니다. colorscheme 등록/수정은 `--code-*`와 Monaco에만 영향을 줍니다.
- GitHub Theme 6.3.5 원본/해시/MIT/선정 근거는 `src/themes/github-light/`에 있습니다. 빌드 시 두 원본 테마를 해시 검증 후 변환합니다. 기본 Tab은 스페이스 4칸, 구버전 환경설정은 v2 스키마로 호환 이전합니다.
- `surface-move.js`, `app.js`: 기본 보드·빵판 몸체 드래그, 장착 부품과 내부 경유점 이동, 한 번의 Undo/Redo, Esc·포커스 이탈 취소. 가장자리 크기 조절과 핀 배선 우선순위는 유지합니다.
- `app.js` 우클릭은 진행 중 배선 전체를 취소하며 GPIO에서 누를 때도 Pinout 창을 열지 않습니다. 기존 완성 배선은 보존합니다.
- `project.js`, `resize.js`, `circuit-edit.js`, `wire-draft.js` 좌표 상한 제거. 음수·6000 초과 배치/저장, 무제한 줌아웃·팬, 전체 보기 경유점 포함. 부품 수/배선 수/배율의 수치 검증은 유지합니다.
- `tests/appearance-canvas.test.js`와 `scripts/appearance-canvas-ui.cjs`: 테마 분리·시스템 변경·4칸 입력·실제 드래그·취소·Undo·재시작·우클릭·먼 좌표 배치 검사를 추가했습니다. 기존 테마/미리보기/대비 검사도 화면 테마를 명시하도록 변경했습니다.
- 기존 비장치 감사 4건은 이번 범위에서 수정하지 않았으며 `docs/NON-DEVICE-AUDIT.md`에 유지합니다. 코드 위치는 사용자 응답에 나열하지 않습니다.

- [공개 v0.22.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.22.0), 빌드/태그 `3e9b3e40059b6ebf98a2f7f7667d2e1e1db9ba48`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38709544798) 성공. 모델 273개·52상태 대비·113종 크기·카탈로그 UI를 통과했고 공개 EXE/ZIP 재다운로드 및 실제 공개 EXE의 새 기능/12상태 대비까지 확인했습니다. 최신 `outputs/artifact/STM-Simulator.exe`와 `docs/VERIFICATION.md`를 확인하세요.

## 0.21.2 검색 카드 강조 상태 보완

- 0.21.1 공개 EXE 검사에서 부품 카드 hover 설명의 대비 4.31:1을 추가로 발견했습니다. 기존 `:is()` 그룹에 포함된 ID 선택자의 우선순위 때문에 hover 보조 글자색 규칙이 적용되지 않았습니다.
- 부품 카드 hover/활성화, 보드 카드/검색 결과 hover, 핀 검색 hover/선택의 보조 글자를 선택 배경과 함께 적용합니다. F4 아이콘의 고유 배경/글자색은 보존합니다.
- `npm run test:contrast:ui`를 두 테마 52개 상태로 확대하여 통과했습니다. 부품 확대 미리보기·키보드 초점·배치 모드·보드/핀 검색 상태가 포함됩니다.
- [공개 v0.21.2](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.2), 빌드/태그 `a932f0595854d8e22d53dfe069a5ea25d744b4e9`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38705485223) 성공. 공개 EXE/ZIP의 해시·버전·커밋 일치와 실제 공개 EXE의 두 테마 대비 검사를 통과했습니다. 최신 로컬 파일은 `outputs/artifact/STM-Simulator.exe`이며 상세 검증은 `docs/VERIFICATION.md`에 있습니다.

## 0.21.1 UI 글자 대비 수정

- 사용자 제보 이미지의 상단 버튼 hover, Pinout 핀 카드/하단 고정 바가 밝은 글자와 밝은 배경을 혼용하던 문제를 수정했습니다. 같은 패턴의 검색/바꾸기·터미널·보드 선택·설정/도움말·보조 라벨/placeholder도 테마 쌍을 일치시켰습니다. Jellybeans 원본과 Monaco 코드 팔레트는 변경하지 않았습니다.
- `src/preferences.css`에 테마 누락 영역과 hover/선택/비활성 상태를 보완했습니다. `npm run test:contrast:ui`는 Jellybeans/STM Light 38개 화면 상태에서 UI 텍스트의 계산된 대비 4.5:1을 확인합니다. 소스 토큰/장치 SVG는 제외합니다. CI에 포함합니다.
- `docs/NON-DEVICE-AUDIT.md`에 원인/코드 위치/재현과 수정 범위를 기록했습니다. 앞서 발견한 저장/터미널 문맥/종료 4건은 이번 범위에서 수정하지 않았습니다.
- [공개 v0.21.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.1), 빌드/태그 `97b26659c5b13b7e2b556bc5d008d7b97f70b681`, [Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38703166675) 성공. 공개 EXE/ZIP의 버전·커밋·해시는 확인했습니다. 공개 EXE의 추가 hover 검사에서 발견한 잔여 대비 문제는 위 0.21.2에서 보완합니다.

## 0.21.0 부품 검색 이미지와 장치 외 기능 점검

- 기존 검색 카드와 추가 방식은 유지하고 113개 항목에 실제 장치 렌더러 기반 작은 이미지/확대 미리보기를 적용했습니다. `part-preview.js`, `part-preview-ui.js`, `part-preview.css`가 담당합니다.
- 마우스와 키보드 초점, Esc로 미리보기만 닫기, 검색/클릭/스크롤 시 닫기, 좁은 화면 위치 보정, 실행 중 미리보기, 밝은/어두운 테마를 검사했습니다. `npm run test:part-previews:ui`를 Windows CI에 추가했습니다.
- 장치 외 기능의 실패 경로 4건을 재현했으며 이번 범위에서는 수정하지 않았습니다. **후속 수정은 `docs/NON-DEVICE-AUDIT.md`부터 읽으세요.** 원인·코드 위치·재현 절차·우선순위·수정 방향이 있습니다. 사용자 응답에는 코드 위치를 나열하지 않습니다.
- 장치 외 점검 AUDIT-01~04(저장 트랜잭션·dirty 판단·터미널 문맥·종료 자동 저장)는 해결되었다. 재현 스크립트는 삭제했고 회귀 검사는 `tests/unit/desktop.test.js`와 `tests/e2e/storage.e2e.test.mjs`가 맡는다.
- 로컬 전체 모델 269개, 실제 GCC/GDB/clangd 및 ARM HAL 링크, IDE 프로젝트·파일·검색·디버그·패널, colorscheme 등록, 업데이트 UI 검사를 통과했습니다. 실제 보드 디버깅은 미검증입니다.
- [공개 v0.21.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.0), 빌드/태그 `835ba6c7897f314fac2804aca51735a248dffeb4`, [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38700043749) 성공. 공개 EXE/ZIP 재다운로드·해시·커밋 문서 일치와 실제 공개 EXE의 113종 미리보기/기존 기능 검사를 통과했습니다. 최신 배포는 `outputs/artifact/STM-Simulator.exe`이며 상세 증거는 `docs/VERIFICATION.md`에 있습니다.

## 0.20.0 가장자리 크기 조절 (공개 완료)

- `resize-ui.js`: 선택한 장치의 네 변·네 모서리에서 실제 포인터로 크기 조절. 백분율 입력 제거, 장치 선택 목록은 위치 찾기용으로 유지합니다. Shift 비율 유지, 방향키 미세 조절, Alt+방향키 10배 간격, Esc/창 포커스 이탈 취소, 한 번의 Undo/Redo를 지원합니다.
- `geometry.js`, `resize.js`: 독립 `scaleX/scaleY`, 표면 원점 이동과 회전·비균등 변형을 공유합니다. 기존 `scale` 파일은 호환됩니다. 장착 부품은 전체 좌표 변환을 받아 핀과 구멍이 일치하고 배선 ID를 보존합니다. `project.js`가 새 좌표와 크기를 검증·저장합니다.
- 기존 10~400% 제한을 제거하고 연속 조절합니다. 수치 오류를 막는 양수 배율과 프로젝트 작업 공간 검증은 유지합니다. 실행 중에는 조절점과 편집을 비활성화합니다.
- 로컬 검사: 전체 모델 269개, 113종 실제 드래그 UI, 두 기본 표면·회전·독립 축·취소·Undo/Redo·키보드·저장 복원, 기존 외형/설정 UI 통과. `npm run test:resize:ui`가 CI에도 포함됩니다.
- 실행 파일은 `STM-Simulator.exe`, ZIP 내부 이름과 두 검증 JSON의 filename도 동일합니다. 0.19.0 이하 배포본은 0.20.0을 한 번 수동 다운로드해야 합니다. 버전만 올린 이전 이름의 호환 EXE를 별도로 배포하지 않습니다.
- [공개 v0.20.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.20.0), 빌드/태그 `a5f1b2dd9d8939ec96f536d5ad99a4387f1bd8b4`, [Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38695514691) 성공. 공개 EXE/ZIP 재다운로드·해시·문서 일치와 실제 공개 EXE의 크기 조절/기존 기능 검사를 통과했습니다. 당시 배포 증거는 v0.20.0 이후 문서 커밋에서 확인할 수 있습니다. 현재 로컬 배포는 상단 최신 버전을 따릅니다.

## 0.19.0 장치 조사 적용

- `docs/device-visual-references.json`의 80항목 → `scripts/build-device-catalog.mjs` → `src/device-catalog-data.js`. 원본 사진은 배포하지 않고 독립 SVG를 사용합니다. 4자리 12핀으로 분류됐던 Adafruit 813은 도면상 14핀으로 정정했으며 내부 ID는 기존 참조 호환을 위해 유지합니다. HAT은 외부·나사·Pi 커넥터 51접점으로 구분합니다.
- `catalog-defs/render/view/model/topology/electrical/motion/buses/singlewire/peripherals`가 물리 핀, 외형, 기존 모델 투영과 새 버스 동작을 분리합니다. 기존 35종 보존 + 78개 변형 = 부품 메뉴 113항목. 보드·빵판 포함 HAL 예제 120개.
- `device-code-insertion.js` 및 `device-assistance.js`: 선언·초기화·반복 코드를 main.c에 직접 삽입, 함수별 필요한 호출까지 선택, 이전 생성 파일 이동, 재적용/사용자 수정 보호/정상 배선 보존과 단락 보완.
- `device-register-setup.js`: 레지스터 초기화·대기·SPI 송수신·I2C ACK/수신. 기존 main의 시스템 초기화는 유지합니다.
- `hal-example-search.js`: 이름·핀 수·인터페이스·실제 HAL API 검색. `wire-draft.js`: 바닥 연속 클릭 경유점, Backspace·Esc, 완료 시에만 연결 생성.
- 80개 조사 항목의 기본 예제는 회로 모델에서 실행합니다. 단선 센서는 GPIO 에지/응답, CAN은 내부 루프백, I2S는 PCM 전송, 카메라는 SCCB ID까지입니다. 카메라/SD 등 예제 범위는 `docs/DEVICE-DOCS.md`, `docs/DEVICE-CATALOG.md`에 명시합니다. 80개 모두가 완전한 주변장치 에뮬레이션이라는 주장을 해서는 안 됩니다.
- 검증: 전체 모델 260/260, 조사 80개 원본/삽입 HAL 160건 ARM 컴파일·링크, 패키지 카탈로그 UI, 단일 포터블 EXE 실행 모두 통과했습니다. `npm test`, `npm run test:catalog:ui`, `npm run test:catalog:arm`, `node scripts/portable-smoke.cjs`로 재검사합니다. ARM 검사에는 ARM GCC·STM32CubeF4가 필요합니다. 정확한 파일 해시와 한계는 `docs/VERIFICATION.md`에 있습니다.
- USART2 PA2/PA3는 HAL 초기화 후 내장 ST-LINK VCP로 하단 통신 탭에서 바로 송수신합니다. 기본 UART 예제는 부품 0개/배선 0개이며 `uart_external`과 UART 부품 Docs/4·6핀 변형은 외부 배선 연습용입니다. 외부 입력 경로는 내장 VCP로 우회하지 않습니다.
- USART2 변경 검증: 전체 모델 260/260, UART/Docs 레지스터 예제 실제 ARM 링크 12건, 내장/외부 UART UI 통과.
- 사용자 요청에 따라 앞으로 버전 상승은 Release 게시까지 포함합니다. `AGENTS.md`와 `docs/UPDATES.md`의 게시 절차를 따릅니다. 0.18.0 보충 게시와 0.19.0 main CI 자동 게시가 완료됐습니다. 0.19.0 빌드 커밋은 `23708264e9c77671630466b3abb1d0f4b0f996e5`, CI는 `38667438539`입니다. 두 공개 버전의 EXE/ZIP 재다운로드·해시 대조와 최신 공개 EXE 실행을 통과했습니다.
- 공개 0.17.2 → 0.19.0 자동 업데이트 시험은 GitHub 비인증 API 요청 한도로 완료하지 못했습니다. 다운로드·교체 성공으로 보고하지 않습니다. API 한도 회복 후 재검사할 때 `scripts/release-update-check.cjs`를 사용하며 상세 증거는 `docs/VERIFICATION.md`에 있습니다.

## 저장소 관리 원칙

- 2026-10-15 이후 배포 EXE 이름은 `STM-Simulator.exe`로 고정합니다. 빌드·게시·검증·업데이터가 같은 이름을 사용하며, 0.19.0 이하의 이미 배포된 파일은 유지합니다. 고정 이름으로 전환되는 첫 배포본의 수동 다운로드 안내는 `docs/UPDATES.md`를 참고합니다.
- Git 작성자·커미터·푸시 인증은 `moonsyu`를 사용합니다. 2026-10-15 작성자 정정으로 커밋 11개와 태그 7개의 SHA가 바뀌었으며 소스 트리는 동일합니다. 기존 공개 실행 파일과 빌드 SHA는 보존합니다. 대응표와 설정은 `docs/GIT-IDENTITY.md` 및 `docs/commit-identity-map.json`을 참고합니다.
- 작업 저장소: 현재 Git 체크아웃, 원격 `moonsyu/STM-Simulator`, 기본 브랜치 `main`.
- 과거 버전은 **Git 커밋 이력**으로만 관리한다. 버전별 백업 폴더·이전 실행 파일·옛 검증 문서 사본을 남기지 않는다.
- 최신 배포 묶음은 `outputs/artifact/`, 최신 검증 문서는 `docs/VERIFICATION.md`, 최신 실행 증거는 `work/test-results/`에 갱신한다. 테스트가 만든 임시 프로필은 종료 후 제거한다.
- 사용자 다운로드 공간은 GitHub Releases의 Assets다. README는 프로젝트 소개·현재 기능·빌드 방법·Releases 다운로드 링크만 유지한다. 게시 요청 시 원격 README 반영과 검증한 실행 파일 업로드까지 완료한다.
- 별도 빌드 작업 폴더를 쓰면 검증이 끝난 생성물 중복과 임시 파일도 정리한다. 사용자 회로·소스·자동 저장은 생성물 정리 대상이 아니다.
- 현재 기능 및 정리 변경을 커밋한다. 원격 게시 여부는 사용자 요청에 따른다. 저장소 이름은 STM-Simulator이며 원격 URL과 문서 링크도 이 이름을 사용한다.
- `dist/`, `work/`, `outputs/`, `node_modules/`, `work/test-results/`, `.cache/`, 참고 미디어는 Git에서 제외한다.

## 0.17.2 공개 자동 업데이트 재현 검사

- 도우미를 수정한 공개 v0.17.1을 출발점으로, 공개 v0.17.2를 대상으로 검사한다. 두 버전의 실행 파일에 같은 수정이 들어가며 이 버전은 공개 버전 간 검증과 절차를 완성하는 릴리스다.
- `release-update-check.cjs`에서 수동 확인/다운로드 호출을 제거했다. 실제 앱에서 자동 확인 설정을 켜고 원본 스케줄러가 GitHub 감지·다운로드·해시 검증을 끝낼 때까지 기다린 뒤 저장 후 재시작 버튼을 누른다.
- 새 앱의 실제 asar 버전·프로세스 생존·EXE 해시·기존 코드, Jellybean/글꼴 크기·장치 크기·자동 확인 설정 보존까지 확인한다. 성공 파일은 통과했을 때만 작성한다. 게시 후 실행 결과와 증거 URL은 해당 릴리스의 UPDATE-VERIFICATION.json/md를 기준으로 확인한다.
- 실제 실행 결과(2026-10-14 10:15:51 UTC): 공개 v0.17.1→v0.17.2 자동 업데이트 통과. 새 EXE SHA-256은 `f0f2c55b90ea6e8894b92c672d9ae26febb74090cf524494265da88a735d6479`. 도우미가 실행한 새 main의 asar 버전 0.17.2와 실행 유지, 재열기 후 코드·글꼴 17·보드 125%·Jellybean·자동 설정 보존을 확인했다. [공개 검증 JSON](https://github.com/moonsyu/STM-Simulator/releases/download/v0.17.2/UPDATE-VERIFICATION.json), [검증 설명](https://github.com/moonsyu/STM-Simulator/releases/download/v0.17.2/UPDATE-VERIFICATION.md)을 업로드하고 다시 내려받아 일치를 확인했다.
- 공개 EXE 빌드/태그 커밋 `fa56d116be7b2f39f25f53ee541e9ee69767c4ec`, 태그 CI `38547037000` 성공. 게시 뒤 main에는 이 검증 기록과 시험의 비동기 대기 처리만 보완했다. 앱 런타임 소스와 패키지 버전은 공개 태그와 동일하다.

## 0.17.1 업데이트 GUI 실행 수정

- 실제 공개 v0.16.1→v0.17.0 검사에서 다운로드/해시 검증 뒤 `spawn EPERM`으로 교체 도우미 시작에 실패했다. Node 콘솔의 교체 시험만으로 실제 패키징 GUI 경로를 보장할 수 없었다. 기존 앱/코드는 유지됐다.
- `desktop/start-update.ps1`을 추가하고 중첩 인코딩 명령 대신 `-File`과 JSON 구성 파일로 도우미를 시작한다. 기존 독립 숨김 콘솔과 준비 확인, 해시 검증, 원자적 교체/복원은 유지한다.
- `scripts/update-gui-helper-check.cjs`는 실제 Electron main에서 긴 한글/특수문자 경로로 도우미를 실행하고 GUI 부모 종료 뒤 교체·재실행을 확인한다. CI의 패키지 생성 후/게시 전 검사로 추가했다.
- 0.16.1~0.17.0에서 해당 오류가 발생하면 수정된 최신 EXE를 한 번 직접 다운로드해야 한다. 최종 공개 버전 간 업그레이드 결과는 릴리스 UPDATE-VERIFICATION.json을 확인한다.

## 0.17.0 장치 크기와 IDE 설정

- 사용자가 GitHub 푸시·릴리스 게시와 공개 EXE의 실제 자동 업데이트 검증을 승인했다. 먼저 v0.16.1을 게시하고 공개 EXE/매니페스트/커밋을 검증했다. v0.16.0의 첫 CI 실패 원인은 1024px 창에서 `.edition` 규칙이 업데이트 버튼을 숨기는 것이었으며, `#app-update` 규칙과 좁은 창 검사로 수정했다.
- `geometry.js`, `resize.js`: 당시 부품 `scale`, 루트 `surfaces.board/breadboard.scale`의 10~400% 범위였으며, 0.20.0에서 독립 축 연속 조절로 대체했습니다. 보드·구멍·단자·배선·검색 강조가 같은 좌표를 쓴다. 보드/빵판 확대 시 그 표면에 모든 다리가 연결된 부품도 위치와 배율을 따른다. 개별 장착 부품은 연결점을 유지한다. 잘못된 복합 확대는 원자적으로 거부한다.
- `resize-ui.js`: 시뮬레이터 위 장치 목록·백분율·100% 복원. 루트 표면과 모든 35종 부품을 지원하고 실행 중에는 잠근다. 회로 파일에 저장하고 실행 취소·재실행, 추가 빵판 이동·회전·복사와 결합한다.
- `ide-preferences.js`, `ide-settings-ui.js`, `preferences.css`, `code-editor.js`: 기본 Jellybean/STM Light와 사용자 테마, 코드·UI·터미널 글꼴/크기·줄 높이·들여쓰기·줄 바꿈·줄 번호·미니맵·괄호색·구문/강조색. 테마 복사/이름/편집/삭제/초기화 및 JSON 가져오기/내보내기. 회로와 독립적인 프로필 키 `stm32lab.idePreferences.v1`에 저장한다. 코드 패널 설정 탭과 Ctrl+,로 연다.
- 설정 내보내기는 검증된 JSON을 Electron 저장 대화상자로 저장한다. 사용자 테마/글꼴 입력은 제한된 색상·문자·범위만 허용한다. 장치 온도·회전·기본 물성은 기존 속성/측정에 남긴다.
- 검증 명령: `node --test tests/appearance.test.js`, `npm run test:appearance:ui`, 기존 전체 모델/UI. 실제 공개 업데이트 검사는 `scripts/release-update-check.cjs`이며 네트워크/업데이트 main IPC를 대체하지 않는다. 공개 EXE 다운로드·업데이트·교체·도우미 재실행·새 asar 버전·소스 보존을 확인한다. 결과는 해당 릴리스의 `UPDATE-VERIFICATION.json`과 로컬 `work/test-results/release-update-proof.json`을 확인한다.

## 0.16.0 포터블 자동 업데이트

- `desktop/updater.cjs`: 고정 GitHub 공개 저장소의 정식 릴리스, 버전·업로드 완료·SHA-256 매니페스트 검증, 자동 확인/다운로드, 진행률, 설정 저장. 기본 시작 8초 후/6시간 간격. 다운로드 완료 후 사용자가 재시작을 선택한다.
- `desktop/apply-update.ps1`: 별도 숨김 프로세스가 현재 앱 종료와 포터블 EXE 잠금 해제를 기다려 원본 백업/원자적 교체/재실행. 시작 실패 시 복원 시도. 준비 확인을 받아야 앱을 종료한다. `detached:true` PowerShell은 연결 끊긴 Windows 세션에서 명령을 실행하지 않고 종료하며, 일반 자식은 부모 종료 시 함께 종료되는 현상이 재현되어 `Start-Process -WindowStyle Hidden` 부트스트랩으로 독립 실행한다.
- `src/update-ui.js`: 상태·자동 확인 설정·수동 확인/다운로드·저장 후 재시작. `src/app.js`는 설치 요청 직전 현재 회로/전체 코드를 동기식 자동 저장하고 열린 폴더에도 저장한다. 실패 시 앱을 닫지 않는다. 기존 사용자 프로필을 유지한다.
- `build:artifact`가 `update-manifest.json`을 실제 EXE에서 생성한다. CI는 `main`에서 빌드만 수행하고 `v<package.version>` 태그에서 검증된 같은 실행의 산출물로 초안 릴리스를 만든 뒤 모든 파일을 업로드하고 공개한다. 기존 릴리스는 덮어쓰지 않는다.
- 사용법·제한·구조·배포/검증 명령은 [UPDATES.md](docs/UPDATES.md). 기존 0.15.2 이하 사용자는 처음 한 번 새 EXE를 직접 받아야 한다. 설치형 NSIS로 전환하지 않았다.
- 태그 게시 CI는 v0.16.1에서 성공했으며 공개 EXE의 해시·빌드 커밋을 다시 검증했다. 공개된 두 버전의 실제 업그레이드 증거는 위 검증 스크립트와 릴리스 첨부 검증 JSON을 기준으로 확인한다.
- 검증: 전체 모델 209개와 기존 UI 15개 스크립트, 업데이트 UI, 실제 Windows 잠금/교체/복원/부모 종료 후 재실행, 실제 포터블 EXE의 업데이트 활성화·설정 저장·공개 GitHub 확인이 통과했다. [VERIFICATION.md](docs/VERIFICATION.md)에 로컬 EXE 해시와 증거를 기록했다.

## 0.15.2 CubeMX 활성화 초기값

- 사용자가 원한 기준은 CubeMX에서 TIM을 켰을 때 채워지는 설정이다. [MCU-DEFAULTS.md](docs/MCU-DEFAULTS.md)에 근거와 모델 범위를 정리했다.
- 새 MCU: HSI 16 MHz, GPIO 미할당, 주변장치/NVIC 비활성. TIM PSC=0, TIM2/5 ARR=4294967295, TIM3/4 ARR=65535, PWM Pulse=0. 공통 정의는 `src/mcu-defaults.js`다.
- Pinout, 검증기, 누락 `.ioc` 필드, 생성 HAL 코드에 동일한 초기값을 적용한다. 기존 파일의 명시적 ARR=0과 사용자 코드, HAL 예제 84 MHz 설정은 보존한다.
- 32비트 ARR 기본값에서 HAL PWM의 1 Hz 미만 주파수를 허용한다. 스케치 API 1~2000 Hz와 HAL PWM 상한은 유지한다. Pulse=0 출력은 LOW이며 nonzero Pulse는 긴 주기의 에지를 예약한다.
- 명시적 ARR=0은 카운터 정지·IRQ 취소·PWM 정적 출력, 재설정 시 카운트 재개를 유지한다.
- 검증: `tests/mcu-defaults.test.js`, `scripts/mcu-defaults-smoke.cjs`, 전체 모델 검사, 기본 TIM 네 개를 포함한 실제 ARM GCC 빌드. 최신 결과와 배포 해시는 `docs/VERIFICATION.md`를 확인한다.

## 0.15.0 실제 IDE 인계

- `desktop/native-build.cjs`: GCC/g++ 실행·Debug/Release·ST HAL/CMSIS/F446 startup/링커·ELF/BIN/HEX/MAP/EXE·SHA-256·오류 파싱. 빌드마다 독립 디렉터리를 만들어 이전 결과를 잘못 실행하지 않는다.
- `desktop/gdb-mi.cjs`: 실제 GDB/MI 파서 및 프로세스, 로컬/ARM remote, 중단점/step/continue/interrupt/프레임/변수/감시식/레지스터/메모리. 감시식 부작용과 GDB 자동 로드를 차단한다.
- `desktop/clangd.cjs`: stdio JSON-RPC와 live source overlay. `desktop/native-ide.cjs`: 생명주기, 캐시, 빌드 취소, OpenOCD, 프로그램 stdin/stdout, 명령 터미널. 경로·명령은 renderer가 직접 프로세스로 실행하지 않고 IPC를 통해 검증한다.
- `src/native-ide-ui.js`와 Monaco 어댑터: 대상 선택, 도구 설정, 빌드 결과, GDB UI, clangd, 터미널. 기존 회로 시뮬레이터의 실행기는 보존했다.
- 도구 설정은 앱 데이터의 `native-tools.json`, GDB 서버 연결은 로컬 `stm32lab.debugConnection`, 실행 대상/구성은 회로 `ide.native`에 저장한다. 기존 문서는 기본 simulator로 열린다.
- 외부 도구는 EXE에 포함하지 않는다. 설치 헬퍼는 `scripts/setup-native-tools.ps1`; SHA-256 및 ST SDK 커밋을 고정했다. 기본 `%LOCALAPPDATA%/STM-Simulator-Tools`는 자동 검색한다. Windows GCC/GDB는 MSYS2/PATH에서 검색한다. SDK와 GCC는 영문 경로; 사용자 프로젝트는 한글 경로 가능.
- 빌드 작업 폴더와 언어 서버 소스 스냅샷은 앱 데이터 또는 설정한 영문 빌드 작업 폴더에 남는다. 사용자 파일과 분리하며 자동으로 재귀 삭제하지 않는다.
- 실제 Windows GCC/GDB/clangd, ARM GCC/ST HAL, ARM GDB 원격 검증(QEMU STM32F405 Cortex-M4)을 수행했다. QEMU는 Cortex-M4 코어의 대조 검증 도구이며, 제품의 F446 에뮬레이터는 0.26.0의 `src/emu`다. 연결된 ST-LINK는 확인되지 않아 실물 플래시·디버그는 검증하지 않았다.
- 검증 명령은 아래 "개발과 검증"을 따른다(0.26.0에서 `test:ui`·`test:native` 계열 스크립트는 `npm run test:e2e`, `npm run test:toolchain`으로 대체).
- IDE 구현은 0.15.0에서 추가했다. 게시할 때는 main과 릴리즈 태그, 성공한 Actions 빌드의 커밋을 일치시키고 다운로드 자산의 해시를 확인한다. 원격 게시 증거는 `work/test-results/release-proof.json`에 기록한다.

## 현재 구현

- 장치 외형 조사(2026-10-14): [DEVICE-VISUAL-REFERENCES.md](docs/DEVICE-VISUAL-REFERENCES.md), [사진·핀 수 검색 자료집](docs/device-reference-gallery.html), 원본 `docs/device-visual-references.json`. 현재 부품 35종 전부를 80개 외형·핀 구성과 연결하고 MCU 내부 기능 24분류를 별도로 정리했다. 핀 수는 주요 외부 접점 기준이며 제어/부하/중복 커넥터·점퍼를 나눠 기록한다. 메모리 패키지와 7세그먼트 일부는 사진 대신 제조사 외형도를 연결한다. 사진은 원본 URL이며 앱 배포 자산에 포함하지 않는다. `node scripts/build-device-reference.mjs`로 현재 소스의 35종과 단자 일치를 확인하고 문서·HTML을 다시 생성한다. 실제 부품 추가 시 이 자료의 시뮬레이터 단순화·공통극·통신 방식 차이를 먼저 확인한다. 자료집 검증: 현재 소스 35종·단자 대조, 2/3핀 필터·LCD 4/16핀 구분·검색·표 전환·390px 모바일 표시, 사진 73항목 로드 및 제조사 도면 7항목 연결을 확인했다. 실행 증거는 `work/test-results/device-reference-check.json`과 `device-reference-*.png`다.

- VS Code형 작업 화면(활동 바·사이드바·편집기 그룹·하단 패널·속성 패널·상태 표시줄·명령 팔레트). 경계선 크기 조절, 코드/회로 위치 바꾸기·분할 방향·최대화, 배치는 `stm32lab.shellLayout.v1`에 저장한다.
- 폴더 프로젝트 생성·열기·저장, C/H 추가·이름 변경·삭제와 include 갱신, 외부 파일 변경 시 덮어쓰기 거부. 기존 `.stm32lab`과 프로필은 유지한다. 자동 복구된 프로젝트는 폴더 연결 없이 복구하므로 원래 폴더를 다시 열어야 한다.
- Monaco 0.57.0 로컬 번들: 구문 강조·기본 완성·함수 정의 찾기·다중 커서·접기. ARM/Windows 대상에 clangd의 의미 분석·완성·호버·정의/참조·인수 안내·서식 정리를 연결한다. `npm ci`의 postinstall과 빌드에서 `src/generated/`를 생성한다. 이 폴더는 Git에 넣지 않는다.
- 지원 소스 빌드·원본 파일 오류 위치, 중단점·일시정지·step into/over/out·변수·호출 스택·읽기 전용 감시식. 인터럽트 콜백은 우선순위 선점이 가능한 별도 실행 문맥이며 콜백 내부 중단점·호출 스택을 지원한다. 실행 대상이 ARM/Windows일 때는 실제 GCC 및 GDB를 사용한다. 사용자 사용법·한계는 [IDE 문서](docs/IDE.md).

- 보드 커넥터 108개, 빵판 400홀, GPIO 별칭, 배선 10색, 부품 35종과 45도 회전·구멍 장착·속성/측정.
- DC/RC 회로 모델, GPIO·ADC·PWM, USER 버튼/LD2, LED·센서·LCD·UART/I²C/SPI, 파형 및 CSV.
- 스케치 함수·배열·구조체·포인터·타이머·IRQ·DMA와 실행 한도. 지원 API는 [스케치 API](docs/SKETCH-API.md)에 정리한다.
- `.ioc`, `main.c`, 사용자 `.c/.h`, Cube 프로젝트 폴더 가져오기. Pinout GPIO/EXTI·주변장치·NVIC 및 HAL 코드 생성.
- F446RE LQFP64의 USART1/2/3/6, UART4/5 실제 TX/RX·AF7/8. 자동 배정·대체 핀·충돌 방지·독립 송수신/IRQ. I2C1/SPI1/ADC1/TIM2·3·4·5도 지원.
- 새 프로젝트 마법사는 이름·보드·빈 HAL/예제 템플릿·상위 폴더를 선택한다. HAL 예제 32개를 선택하면 확인 창 없이 코드·핀·부품·배선·계산 설정을 즉시 교체하며 사용자가 정한 회로 이름은 유지한다. Undo/Redo로 복구할 수 있다. 별도 시리얼/스케치 예제 메뉴는 없다.
- printf/puts는 UART 배선 없이 로그에 출력한다. HAL UART TX/RX는 포트·방향별로 표시한다. 실제 수신은 전원·배선·baud 조건을 검사한다. ADC 배열은 polling, 초음파는 HAL GPIO와 TIM2 카운터 모델을 사용한다.
- 부품 검색창에서 이름·종류로 찾고, 비어 있으면 35종 전체를 세로 스크롤 목록에 표시한다.
- 배선은 선택 모드에서 빵판 구멍보다 우선한다. 배선 도구(W) 또는 연결 중에는 구멍을 선택할 수 있다. F5는 편집기에서도 실행/정지하며 열린 대화상자와 키 반복에는 실행하지 않는다.
- 앱 창·작업 표시줄·Windows EXE·웹 파비콘에는 전용 칩/신호 아이콘을 사용한다. 아이콘 재생성은 `npm run build:icon`, EXE 리소스 편집은 `signExecutable:false`로 유지한다.
- 상단바는 아이보리·초록색이며 S 아이콘은 제거했다. SVG 보드 그림의 모델명만 제거했다. 핀·헤더·기능 표시는 유지한다.
- 보드 검색/선택은 현재 NUCLEO-F446RE 한 종류만 제공한다. 기본 프로젝트와 코드·회로·핀·소스·계산 설정을 비교해 초기화 경고를 판단하므로 저장해도 경고가 유지되고 Undo로 기본 상태가 되면 경고하지 않는다.
- 추가 빵판은 components의 breadboard 타입으로 최대 8개. 고정 기본 빵판은 기존 사용자 파일 호환을 위해 유지한다. 추가 빵판의 구멍/버스 ID는 breadboard:<id>: 접두사로 분리하며 이동/회전 시 장착 부품도 변환한다. 삭제 시 해당 구멍의 배선과 장착 연결만 제거한다.
- 확장 14종: LDR, NTC, SHT31, MPU6050, PIR, SSD1306 OLED, ST7735 TFT, MAX7219, RC 서보, DC 모터/드라이버, 4상 스테퍼/드라이버, 릴레이, 조이스틱, 인코더. 각 HAL 예제와 전원·배선·프로토콜 조건 검사가 있다. 세부 명령 범위와 기계 모델 한계는 HAL-API 문서를 따른다.
- Ctrl+F로 현재 소스에서 문자 그대로 검색하고 Ctrl+R로 단일/전체 치환한다. 치환은 파일 크기 제한과 프로젝트 Undo/Redo·저장을 따르며 실행 중에는 검색만 가능하다.
- 배선 선택 시 SVG 선을 보존해 실제 더블클릭 이벤트를 유지한다. 꺾임점 크기는 화면 확대율에 맞추고 끌기는 누른 위치의 이동량을 적용한다.
- 회로 시뮬레이터의 HAL은 지원 API를 회로에 연결하는 소스 해석 모델이다. 실제 ST HAL로 빌드한 ARM ELF는 펌웨어 에뮬레이터(`src/emu`, `src/firmware-session.js`)가 Cortex-M4 명령어와 STM32F446 레지스터 단위로 실행해 같은 회로 모델에 연결한다. 세부 범위는 [HAL API](docs/HAL-API.md)와 [EMULATOR.md](docs/architecture/EMULATOR.md)를 따른다.

- 배선 꺾임점 추가/드래그/삭제/자동 정렬, Shift 다중 선택과 Ctrl+C/V, 연결망 강조, 클릭 가능한 회로 진단을 제공한다. 원본 빵판을 제외하고 부품만 복사할 때도 부품 사이의 전기적 연결을 배선으로 보존한다.
- 생성 main.c는 HSI PLL 클록과 정식 HAL 초기화를 포함하며 동일 Cube 환경으로 이식한다. `main.c 저장` IPC 및 ARM GCC/ST HAL 컴파일·링크 검사 스크립트가 있다. 실제 보드 실행은 별도이며 printf는 SWV 포트 0, nano float는 링크 옵션이 필요하다.
- TIM2/5 32비트, TIM3/4 16비트; 독립 base/IT/PWM, 입력 캡처, 엔코더. 새 HAL 회로 예제 3개가 있다. 필터 0, 내부 클록, 카운터 up/encoder 모델 범위를 문서화했다.

- 수동 부저(`passive_buzzer`)는 실제 두 단자 사이의 PWM·GPIO 전이를 측정해 20~2000 Hz 음높이와 듀티를 표시한다. DC·0/100% 듀티는 무음이며, HAL PWM 멜로디 예제가 회로·핀·파형을 함께 설정한다. 부저별 Web Audio 음원을 분리해 서로 다른 음높이를 동시에 출력한다.

- L298N 듀얼 드라이버·별도 2핀 DC 모터·6~24 V 외부 전원 및 2채널 HAL 예제 추가. 전원·출력은 회로 엔진에서 계산하며 PWM 순간 제어와 제동/자유 정지 속도 모델 적용. `src/l298n*.js`, `tests/l298n.test.js`, `scripts/l298n-smoke.cjs` 참고.

## 코드 지도

| 파일 | 담당 |
|---|---|
| `src/circuit-edit.js`, `src/circuit-diagnostics.js` | 배선 경로·복사·연결망·문제 위치 |
| `src/timer-config.js`, `src/hal-timers.js`, `src/timer-examples.js` | 실제 타이머 AF·카운터/캡처/엔코더·HAL 회로 예제 |
| `src/hal-generator.js`, `tests/toolchain/` | 이식 가능한 main.c 생성·ST HAL ARM 빌드 후 에뮬레이터 실행 검증 |
| `src/pins.js`, `src/components.js`, `src/placement.js` | 핀·부품·다리·별칭·구멍 장착 |
| `src/boards.js`, `src/board-picker.js` | 보드 카탈로그·검색·초기화 확인 |
| `src/breadboards.js` | 추가 빵판 이동·회전·삭제와 연결 보존 |
| `src/part-library.js` | 전체 부품 카탈로그·한글/영문 검색 |
| `src/project.js`, `src/hal-examples.js`, `src/hal-circuits.js` | 빈 HAL 프로젝트·파일 검증·HAL 예제 코드/회로 |
| `src/parser.js`, `src/runtime.js`, `src/program.js` | 문법·실행기·API 진입점 |
| `src/mcu-config.js`, `src/serial-config.js` | MCU 설정·IOC·HAL 생성·실제 직렬 핀맵 |
| `src/hal-source.js`, `src/hal.js`, `src/hal-stdio.js`, `src/firmware-import.js` | HAL 소스/전처리·호환 API·printf·가져오기 |
| `src/session.js`, `src/engine.js` | 실행기/회로 연결·DC/RC 계산 |
| `src/lcd.js`, `src/buses.js`, `src/sensors.js` | 부품·버스 모델 |
| `src/device-defs.js`, `src/device-buses.js`, `src/device-motion.js` | 확장 센서·화면·구동·입력 모델과 핀 구성 |
| `src/device-examples.js`, `src/device-ui.js` | 확장 14종 HAL 회로/코드, 속성·실시간 픽셀/회전 표시 |
| `src/passive-buzzer.js`, `src/passive-buzzer-example.js`, `src/buzzer-audio.js` | 수동 부저 파형 측정·HAL 멜로디·부저별 음향 |
| `src/trace.js`, `src/monitor.js` | 파형·통신·로그 |
| `src/editor-search.js` | 현재 소스 찾기·바꾸기와 검색 패널 |
| `src/app.js`, `src/pinout-ui.js` | 편집/실행·핀 설정 |
| `src/ide-ui.js`, `src/code-editor.js`, `src/ide.css` | IDE 도구·프로젝트 UI·Monaco 연결 |
| `src/shell.js`, `src/shell.css` | VS Code형 작업 화면·메뉴·명령 팔레트·배치 저장 |
| `src/logic-analyzer.js`, `src/signals.js`, `src/part-media-ui.js` | 로직 분석기·선로 잡음·카메라/SD 속성 |
| `src/emu/`, `src/emu/stm32f446/`, `src/firmware-session.js` | Cortex-M4 에뮬레이터·STM32F446 주변장치·회로 연동 |
| `src/hal-nvic.js`, `src/hal-dma.js`, `src/hal-usart.js`, `src/hal-dcmi.js`, `src/hal-storage.js` | 인터프리터 NVIC 선점·DMA·USART 동기·카메라·SD |
| `src/debug-tools.js`, `src/parser.js`, `src/runtime.js`, `src/hal-source.js` | 소스 위치·실행 중단·변수·감시식 |
| `src/source-files.js`, `desktop/workspace.cjs` | C/H 파일 편집·폴더 저장·충돌 방지 |
| `scripts/build-editor.mjs` | 로컬 편집기 번들 |
| `src/render.js`, `src/part-render.js`, `src/part-controls.js` | SVG·부품 속성/측정 |
| `desktop/` | Electron·파일/폴더 가져오기·저장 IPC |
| `tests/unit`, `tests/interp`, `tests/emu`, `tests/firmware`, `tests/e2e`, `tests/toolchain`, `tests/release` | 모델·에뮬레이터·실제 Electron UI·ARM 빌드·EXE 검증 |
| `.github/workflows/build-windows.yml` | 모델/UI 테스트·Windows 빌드·Artifact |

GPIO 변경 전 `beforeChange`로 이전 출력의 시간 구간을 적분하고, 변경 후 `changed`로 같은 시점의 회로를 다시 계산한다. 같은 시간의 재측정에서 커패시터를 다시 충전하면 안 된다.

## 데이터와 실행 규칙

- appId `local.stm32.circuitlab`, 사용자 데이터 폴더 `STM32 Circuit Lab`, 확장자 `.stm32lab`, JSON format `stm32-circuit-lab`, 스키마 version 2를 유지한다.
- 자동 저장 키 `stm32lab.project.v2`와 v1 읽기 지원은 사용자 회로 보존을 위한 현재 기능이다. 새 기본값을 이유로 기존 자동 저장 회로를 덮어쓰지 않는다.
- `tests/fixtures/emu`, `tests/fixtures/firmware`는 에뮬레이터 검증용 사전 빌드 ELF와 회로다(`npm run build:fixtures`로 재생성). 앱에서 가져오지 않으며 EXE에 포함하지 않는다. 제공 HAL 예제는 `src/hal-examples.js`와 `src/hal-circuits.js`에서 구성한다.
- `simulation`, `mcu`, `firmware`, `ide`는 선택적 필드다. `ide`는 검증된 소스 파일별 중단점과 감시식을 저장한다. main.c는 `project.code`, 보조 소스는 `firmware.files`에 저장한다.
- 두 핀 부품의 `attachA/attachB`와 다핀 `attachments`는 헬퍼로 처리한다.
- renderer의 contextIsolation/sandbox를 유지하고 nodeIntegration을 켜지 않는다.
- UI 테스트는 `CIRCUIT_LAB_TEST_PROFILE`로 분리한다. 실제 사용자의 자동 저장 폴더는 건드리지 않는다.

## 개발과 검증

Node.js 24 계열, Electron 44.2.0, electron-builder 26.15.3, Playwright 1.58.2. 의존성은 lockfile을 따른다.

```powershell
npm ci
node node_modules/electron/install.js
npm start
npm test                 # unit + interp + emu + firmware
npm run test:e2e         # 실제 Electron 앱
npm run test:toolchain   # ARM_GCC, STM32CUBE_F4_ROOT 필요 (EXAMPLES로 범위 지정)
npm run build
npm run build:artifact
npm run test:release     # Windows: 패키지 앱·업데이트 도우미·포터블 EXE
```

`npm run build`는 `scripts/clean-build.cjs`로 이전 EXE·배포 묶음·win-unpacked를 먼저 정리한다. 실행 파일이 잠겼으면 아무 파일도 지우기 전에 중단하고 앱 종료를 안내한다. 패키지 검사에는 Electron/Chromium/Monaco 라이선스 원문과 참고 자료 제외 검증이 포함된다.

Windows CI는 `npm test` → ARM GCC(xPack)·ST HAL 드라이버 설치 후 대표 예제 빌드·에뮬레이터 실행 → E2E → 업데이트 도우미 → EXE 빌드·패키지 검증 순서로 실행한다. 실패한 실행의 로그는 Actions의 `Windows-test-diagnostics`에 14일 보관한다. `main` 푸시 후에는 해당 커밋의 GitHub Actions 결과까지 확인한다. E2E는 `CIRCUIT_LAB_TEST_PROFILE`로 사용자 프로필과 분리하고, 파일 대화상자는 main 프로세스의 `dialog`를 스텁한다. 현재 검증 결과와 한계는 [VERIFICATION.md](docs/VERIFICATION.md)를 확인한다.

## 권리와 모델 범위

저장소는 2026-09-16 소유자 요청으로 Public으로 전환했으며 [저작권 검토](docs/COPYRIGHT-REVIEW.md)와 [제3자 고지](THIRD_PARTY_NOTICES.md)를 유지한다. ST 드라이버/CubeMX XML, 참고 사진·참고 자료에 기반한 생성 이미지를 앱에 넣지 않는다. 자체 앱 아이콘은 desktop/icons에 두며 제작 정보는 docs/APP-ICON.md에 기록한다. 프로젝트 전체에 라이선스를 임의로 부여하지 않는다. README에 권리 관련 문제 또는 법적 문제가 확인되면 저장소를 삭제 조치한다는 안내를 유지한다.

회로 시뮬레이터 대상은 NVIC 선점, HAL DMA, 동기식 USART, 비트 단위 통신 파형/노이즈, 카메라 DCMI, SD 카드/FatFs를 지원한다([HAL API](docs/HAL-API.md)). MCU UART 간 직접 배선 전송, 전체 C/C++·CPU·레지스터 재현은 미지원이다. 모델을 정밀 하드웨어 에뮬레이션으로 설명하지 않는다.

다음 작업은 Git 상태와 이 문서, README/API 문서를 확인한 뒤 사용자 요청 범위에서 진행한다. 변경에 맞는 검증을 수행하고 현재 문서만 갱신한다.

## 0.18.0 장치 Docs와 colorscheme 등록

- 로컬 구현 0.18.0, 최신 공개 릴리스는 0.17.2다. 이번 변경은 아직 원격으로 게시하지 않았다.
- `basic-hal-examples.js`: 누락된 7종을 추가하여 HAL 예제 39개. LCD 실제 4비트 초기화/문자, RGB/7세그먼트 각각 직렬 저항, ADC/스위치/능동 부저/다이오드 회로를 검증한다.
- `device-docs-data.js`, `device-docs-ui.js`, `device-docs.css`: 35종 부품 + 보드/빵판의 개요·핀 연결표·HAL 호출·레지스터 예제. 선택 장치가 바뀌면 Docs도 전환한다.
- `device-assistance.js`, `c-source-edit.js`: 현재 사용자 소스를 보존해 stm_device_docs.c/.h와 main 초기화/반복 호출을 연결한다. 함수 버튼은 해당 함수를 사용하는 장치 예제와 의존성을 함께 적용한다. 정상 연결 보존, 부족한 부품/선 추가, 선택 주변 오접속 분리, GPIO/ADC/타이머/UART 배정, I2C 주소 충돌 거부, 생성 소스 편집 보호, 저장/재적용 멱등성, 원자적 실행 취소를 지원한다.
- Bare-metal 버튼은 HAL 초기화 + 직접 레지스터 동작의 학습 예제이며 ARM 대상으로 전환한다. 전체 HAL을 제거한 드라이버나 가상 ARM CPU 실행이 아니다. SPI/I2C 항목은 상태 레지스터 관찰이다. docs/DEVICE-DOCS.md에 동작 범위와 제약을 기록했다.
- Jellybeans는 직접 지정 팔레트 대신 Git 원본(ef83bf4) 기반 변환·등록으로 변경했다. 원본·SHA-256·MIT 헤더는 src/themes/jellybeans에 포함하며 원본 .vim은 Git 줄 끝 변환을 금지한다.
- `colorscheme.js`: 데이터 전용 Monaco/VS Code JSON, 정적 Vim import. 동적 Vimscript는 실행하지 않는다. 원본 규칙·이탤릭체·세부 토큰·출처를 보존하고 사용자 색상 수정과 기존 설정 마이그레이션을 지원한다.
- 설정의 Colorscheme 등록 / 테마 JSON 내보내기와 기존 설정 전체 가져오기는 별도 동작이다.
- 검증 증거: work/test-results/device-docs-arm.json(118개 ARM 컴파일·링크), device-docs-arm-followup.json(추가 10개), device-docs-smoke.json, colorscheme-smoke.json, docs-full-tests.log. 최종 결과는 docs/VERIFICATION.md를 확인한다.

- 최종 결과: 모델 235/235, 기존 UI 15종, 새 UI 2종과 패키징 앱의 새 UI 2종 모두 통과. 로컬 포터블 EXE 0.18.0 생성 및 asar/라이선스/소스 일치 검증 완료. 런타임 커밋 82a7454, EXE SHA-256 c76f5881759b8f4619a9fe8352af267c654c4b5b95f30af50925e735d1c64a9d.
