# 화면·동작 검사 로그

현재 배포 상태: **0.25.0 구현·공개·EXE/ZIP·자동 업데이트 검증 완료**. 아래 공개0.24.0 기준선과 개발 소스 검사, CI1 실패·CI2 취소·CI3 실패는 당시 이력으로 보존합니다. 수정 후 4차 CI39214636630의 전체 검사·빌드·Release 게시가 성공했으며 최종 결과는 [공개 검증 집계](evidence/public-verification.json)와 마지막 절에 기록합니다.

3차 CI39212542491 당시에는 패널 헤더 우클릭의 검사 대상 오류로 실패해 Release가 게시되지 않았습니다. 제품 변경 없이 실제 손잡이와 탭의 우클릭을 구분하도록 테스트를 보완했고 로컬 재검사 및 4차 CI가 통과했습니다.

## 기준 검수 — 공개0.24.0

- 기존 독립 Electron 계측21상태: `work/ui-design-audit-0240/metrics.json`.
- 화면폰트13→20 설정에도 주요 버튼11.5px·설정 레이블12px·핀 상태8.5px 유지.
- 900×560 회로이름 입력 x188..338과 Dark/System 버튼 x241..347 겹침.
- 1024/900 저장 상태 숨김. 일반 배선색 클릭영역11×11px.
- library와 part-list 이중 스크롤. 900×560에서 목록 시작 y630으로 최초 화면 밖.
- 실제 코드영역: 1366×768 높이303px, 1024×640 높이211px, 900×560 높이129px.
- 신규 회귀 스크립트는 이 결함들을 실패로 유지하며 제품 수정 후 재검사합니다. 아직 새 구현의 완료 증거가 아닙니다.

## 1차 기능 검사 — 2026-10-19

- 독립 프로필, `work/test-results/workbench-review-round1-functional/summary.json` 및 `runtime-events.jsonl` 보존.
- 탭과 소스 탭 키보드/포커스, 자동저장 quota 오류와 복구, 바닥 경유점·우클릭 취소·둥근 경로·Undo/Redo·파일 저장·재시작 복구 통과.
- HAL GPIO LED의 켜짐/꺼짐과 전류, USART2의 RX/TX 바이트를 실제 진단 JSONL에서 확인했습니다.
- 테스트 가정 3건 발견: 열기 오류 문구 정규식 불일치, 실행 중 숨기는 편집점에 포커스를 시도함, 지연 생성되는 썸네일을 검색/표시 전에 읽음. 제품 결함으로 분류하지 않았습니다.
- 오류 배너의 semantic scope, 실행 중 편집점 비노출과 변경 차단, 모든 카드를 실제 검색·hover한 뒤 이미지 비교로 테스트를 수정했습니다. 기존 1차 증거는 덮어쓰지 않았습니다.
- 숨긴 도구를 강제 실행하지 않도록 공용 opener helper와 기존 회귀 스크립트를 실제 메뉴/summary 클릭 방식으로 갱신했습니다.

## 2차 화면·기능 검사 — 2026-10-19

- `work/test-results/workbench-review-round2/summary.json`: 화면24조합·74상태, 기존355개 자동 판정은 통과했습니다. 실제 저장/열기 실패·복구와 키보드·배선·HAL 로그 등 기능6시나리오도 통과했습니다.
- 별도 사람 관점 시각 검토에서 900×560/글꼴20의 모니터 탭과 실행 상태 버튼 겹침, Pinout 상태 글자가 다음 타일 행에 덮이는 문제를 발견했습니다. 수치 통과만으로 완료하지 않고 CSS 수정과 전용 회귀 검사를 추가했습니다.
- 프리뷰 반복 검사는 검색 API 입력이 포인터를 이동하지 않아 동일 좌표에서 새 카드의 pointerover가 발생하지 않은 테스트 문제였습니다. 카드 밖으로 실제 마우스를 이동한 다음 검색·hover하는 기존 검사 방식으로 교정했습니다.
- 추가 독립 코드 검토의 확대/축소 후 꺾임점 포커스 손실, 그룹 드래그 중 키보드 탐색/선택 변경 경로도 실제 회귀에 포함했습니다. 해당 수정 후 최종 라운드를 실행합니다.

## 3차 화면·기능 검사 — 2026-10-19

- `work/test-results/workbench-review-round3/summary.json`과 실패 화면·실제 진단 JSONL을 보존했습니다.
- 작은 창의 모니터 탭/실행 상태 겹침과 Pinout 상태 글자 덮임은 수정 후 전용 범위 검사에서 통과했습니다. 마지막 모니터 탭을 키보드로 초점 이동했을 때 수평 스크롤이 충분하지 않은 2건은 별도로 남겨 명시적 스크롤 수정 후 재검사합니다.
- 확대/축소 후 꺾임점 포커스 유지·해당 점만 삭제·Undo, 그룹 드래그 중 PageDown/Enter의 선택 변경 차단을 실제 입력으로 확인했습니다.
- 푸시버튼 Space 누름/떼기/포커스 이탈 시 PA10 전압 3.300 V↔0.000 V와 LED 상태·전류, USER 버튼의 EXTI 한 번 발생은 진단 로그로 확인했습니다.
- RESET은 실제 결함이었습니다. 실행 중 RESET이 재초기화하면서 빌드를 호출했으나, 실행 중 수동 빌드 가드가 null을 반환하여 `status:error`로 바뀌었습니다. pointer/keyboard 공통 재초기화 수정 후 키 반복·마우스 클릭·일시정지 상태를 다시 검사합니다.
- 114종 프리뷰 반복은 `ref_servo_feedback_4`에서 실패했습니다. 실패 PNG의 실제 창 크기는 1039×605로 요청 크기와 달랐으며, 현재 증거만으로 제품/테스트 원인을 단정하지 않았습니다. 카드 위치·hit target·hover 상태·팝업 디코딩·resize/blur 이벤트를 기록하는 관찰 코드만 검사에 추가했습니다.

## 영향 재검사 — 2026-10-19

- `work/test-results/workbench-review-round4-models/preview-hover-failure.json`: 카드가 화면 안에 있고 hit target도 정확하지만 pointerover 25ms 후 pointerout이 발생해 160ms 프리뷰 타이머가 취소된 것을 확인했습니다. 이미지 디코딩 실패와 분리했고, 독립 테스트 창에만 native mouse 입력 무시를 설정하여 작업자의 OS 포인터와 CDP 포인터가 섞이지 않게 했습니다. 실제 CDP 검색·hover·키보드 입력은 그대로 사용하며 제품 재시도는 넣지 않았습니다.
- `work/test-results/workbench-review-round7-functional/summary.json`: 114종 검색/hover/디코딩과 키보드 프리뷰·Escape·검색결과 없음, 일반부품112종의 형상/접점과 보드108핀·빵판400홀 비교가 통과했습니다. 프리뷰와 실제 캔버스 모두 동일한 idle 후처리를 적용해 동적 표시 속성을 별도 생성 시점과 혼동하지 않았습니다. 해당 라운드 이후의 표시 geometry 보완은 최종 모델 전용 재검사로 확인합니다.
- 같은 라운드에서 메뉴7종 Enter→첫 컨트롤 초점·Escape→opener 복귀, 회로 키보드와 확대/축소·드래그 가드, 배선 저장/복원, 실제 HAL GPIO/USART2 로그가 통과했습니다.
- 최신 RESET 재검사는 키 반복 초기화1회, 마우스 RESET 후 시간 재시작/실행 상태 유지, paused RESET 시간0 유지와 F5 계속 실행까지 통과했습니다. 푸시버튼 전압3.300 V↔0.000 V, LED 전류0↔약3.927 mA, keyup/포커스이탈 해제, USER EXTI1회, slide1→0도 같은 실제 진단 로그에 있습니다.
- 저장 시나리오 끝에서 정상 파일 재열기 직후 자동저장 완료 전 `saved`를 즉시 비교한 테스트 대기 누락을 교정했습니다. `work/test-results/workbench-review-round8-save/summary.json`에서 파일저장실패→quota실패→자동저장복구 시 파일실패 상태 유지→정상 파일저장 해제→깨진 파일 열기 실패/정상 재열기 전 과정을 다시 통과했습니다.
- `work/test-results/workbench-review-round4-layout/summary.json`: 24조합·72화면 상태의 403개 판정 통과, 대비 텍스트36,228건에서 저대비0건. 900×560/글꼴20에서도 마지막 모니터 탭 키보드 이동·핀 타일 경계·저장 상태·코드182.6px·목록161px을 확인했습니다.
- 그러나 위 최종 PNG를 직접 확인하면서 타임스탬프만 UI 글꼴에 따라 커져 터미널 두 번째 줄이 잘리는 결함을 추가 발견했습니다. 자동 판정이 부모의 line-height만 읽던 한계도 함께 고쳤습니다. timestamp의 터미널 글꼴 상속 복구 후 실제 두 log-line 높이와 타임스탬프/본문 글꼴까지 판정하여 레이아웃을 다시 검사합니다.

## 최종 영향 검사 — 2026-10-19

- `work/test-results/workbench-review-final-layout/summary.json`: 최신 소스의 24조합·72상태·427개 판정 전부 통과, 대비 텍스트36,228건에서 저대비0건, renderer 오류0건입니다. 900×560/화면 글꼴20에서도 본문과 타임스탬프가 모두 터미널 글꼴12px을 유지하고 두 실제 로그행이 표시되는 최종 PNG를 직접 확인했습니다.
- `work/test-results/workbench-review-final-models/summary.json` 및 `model-pin-parity.json`: 최신 리드/몸체 연결·접점 노출·보드 실크 정리를 포함한 새 Electron 프로세스에서 114종 전체 검색/hover/이미지 디코딩을 완료했습니다. 112개 일반 모델의 실제 배치·회전·비등방 변환 및 idle 본체 동등성, 637개 전기 접점의 표시·hit 좌표/접근성 이름, 보드108핀과 빵판400홀을 확인했습니다. 키보드 프리뷰·Escape·검색결과 없음도 통과했고 renderer 오류0건입니다.
- 기능 완료 증거는 Round7의 성공9시나리오와 좁은 Round8 저장 재검사를 함께 사용합니다. 실패 라운드를 성공으로 덮어쓰지 않았으며, 공개 릴리스 검증은 별도 단계입니다.

## 통합 전 로컬 검증 상태 — 2026-10-19

- `work/test-results/workbench-unit-release.log`: 최종 전체 단위387개 통과, 실패·취소·건너뜀0개입니다. 이전385개 결과를 삭제하지 않았습니다.
- `work/test-results/appearance-native-theme.json`: Electron nativeTheme의 dark→light→dark 알림에서 System 화면/코드 테마 전환을 확인했고 수동 White 고정도 유지됐습니다. `windowsSettingsChanged=false`이며 사용자 OS 설정을 바꾸지 않았습니다.
- 최종 기존 UI 8개(boards, devices, circuit-tools, editor-tools, passive-buzzer, l298n, ide, mcu-defaults)가 각각 `work/test-results/workbench-final-<검사명>-smoke.cjs.log`에서 통과했습니다. 그보다 앞선 editor/parts/features/HAL/layout-serial/HAL-examples 재검사도 별도 기존 검사 로그에 보존합니다.
- `work/test-results/native-ide-check.json`: Windows GCC 실행, GDB 중단점·step·감시·메모리·레지스터, clangd hover/정의, C/C++ 링크/실행, ST HAL/CMSIS ARM 산출물, 빌드실패·취소 보호가 통과했습니다. `hardwareRun=false`로 실물 보드 검증과 구분합니다.
- `work/test-results/workbench-final-native-ide-smoke.cjs.log`: 첫 네이티브 UI 검사는 빌드 성공 후 waitForFunction에서30초 timeout으로 끝났습니다. 초기화 전 지역변수의 임의값에 `6`이 포함되면 F10 완료로 잘못 판정해, 아직 작업 중인 GDB에 다음 명령을 보내던 테스트 동기화 문제였습니다. 실패 로그는 보존합니다.
- `work/test-results/workbench-native-ui-recheck.log` 및 `native-ide-smoke.json`: 제품 변경 없이 실제 helper 정지 프레임·다음 명령 가능 상태를 기다린 뒤 `doubled=6`을 정확하게 확인하도록 테스트를 보강했습니다. 최종 네이티브 UI의 실제 GCC Debug/Release 빌드, GDB into/over/out·감시·레지스터, 실행 stdout, cmd 터미널, clangd, 컴파일 오류 이동/실패 후 이전 산출물 보호, 데스크톱/작은 화면이 모두 통과했고 renderer 오류0건입니다.
- **당시 게시 상태 pending:** 이 통합 전 기록 시점에는0.25.0 버전 게시와 새 Windows CI, Release5자산·공개 해시/커밋/latest·실제 EXE/ZIP 실행/복원·자동 업데이트의 완료 근거가 없었습니다. 기존0.24.0 공개 검증을 새 버전의 성공으로 대체하지 않았습니다. 최종 결과는 아래4차 CI·공개 검증 절에 기록합니다.

## 게시 전 추가 발견 — 코드 테마 scope 변환

- 확정 결함: JSON/Java 등 언어별 세부 scope를 가져오는 과정에서 C의 공통 `type`·`number`·`delimiter`에 규칙이 덮여 적용됐습니다. importer와 저장된 기본 테마의 이전 변환 오류 교정을 완료했습니다. 사용자 테마 선택·가져온 테마·직접 지정한 색은 유지합니다.
- 원색 의심 분리: 문제가 제기된 PNG에서 `#ff0000`·`#00ff00` 픽셀은 각각 0개였습니다. 실제 색은 원본 GitHub 테마의 `#cf222e`·`#116329`로 확인했습니다. 색 자체가 원본과 다르다는 주장은 채택하지 않고, 재현된 scope 범위 변환만 제품 결함으로 기록합니다.
- [CI39211377769](https://github.com/moonsyu/STM-Simulator/actions/runs/39211377769) 게시 전 취소 요청 HTTP 202 접수 후 취소 완료 확인. **취소이며 CI 검사 실패가 아닙니다.** 새 CI로 게시를 재개합니다.
- 기존 모델·레이아웃·저장·실행·Docs 등의 완료 증거는 유지합니다. System 자동 전환/수동 테마 선택의 기존 성공 결과도 importer의 언어별 scope 정확성을 검증한 것으로 확대하지 않습니다.
- 수정 후 관련 단위27개와 실제 Electron colorscheme 검사를 통과했습니다. 원본 GitHub/Jellybeans C 토큰 색, 구버전 저장 fixture 재로드 후 정상 색, import/export·사용자 색 유지가 포함됩니다(`work/test-results/workbench-colorscheme-final.log`, `colorscheme-smoke.json`).
- 최종 전체 단위 **397/397 통과**: `work/test-results/workbench-unit-color-final.log`. appearance-canvas, Electron nativeTheme System과 실제 편집기 토큰 검사도 통과했습니다(`workbench-appearance-color-final.log`, `appearance-native-theme.json`, `editor-theme-tokens.json`). 이전387개 결과는 당시 검사 이력으로 유지합니다.

## 3차 CI 실패 — 패널 이동 우클릭 검사 대상

- [CI39212542491](https://github.com/moonsyu/STM-Simulator/actions/runs/39212542491)는 기존 HAL·카탈로그까지 통과한 뒤 `controls-reset-check.cjs:28:90`에서 코드 `.dock-heading` 중앙 우클릭 후 이동 dialog가 열리지 않아 실패했습니다. **Release 미게시** 상태를 유지합니다.
- 동일 검사에서 Shift+F10 패널 이동·터미널 도킹·재시작 복원은 성공했습니다. 합쳐진 헤더 중앙은 탭/버튼일 수 있으며, interactive 자식 우클릭은 제품 가드가 정상적으로 차단해야 합니다. 이 실패는 이동 손잡이와 탭을 구분하지 않은 테스트 대상 오류입니다.
- 3차 CI 실패 시점에는 `.dock-grab` 우클릭 성공과 탭 우클릭 차단을 각각 검사하도록 최소 보완 중이었고 재검사 결과는 pending이었습니다. 제품 소스 변경은 없었으며 최초 실패를 성공으로 덮어쓰지 않습니다. 이후 결과는 다음 절에 기록합니다.

## 4차 CI·공개 실행 파일 검증 — 2026-10-19

- 위 3차 실패 시점의 pending은 이후 `controls-reset-ci3-recheck.log`의 실제 hit target/도킹/초기화/단축키 재검사와 [4차 CI39214636630](https://github.com/moonsyu/STM-Simulator/actions/runs/39214636630) 전체 성공으로 해소됐습니다. 최초 실패 기록은 보존합니다.
- [v0.25.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.0) 공개5자산·latest·태그/빌드 커밋·ZIP 내부 대조 통과. 커밋 `2278c2da1a6c14ec16b1629af136172ce7a1e078`, `sourceDirty=false`입니다.
- `STM-Simulator.exe`: 102,783,034 bytes, SHA-256 `e678a2533cd8fd7fac864b466077c9df94bca1ffe4b5bb12d43c8527319cfc35`. ZIP SHA-256 `61ad97c361c3f75f8fb55d2ba15672a83f954485fd1e0167b8ea98713caa4d1e`.
- `work/test-results/workbench-public-0.25.0/summary.json`: 429판정·74상태(기본72+추가2)·10시나리오·114모델 통과, 대비37,062건에서 저대비0·renderer 오류0. `workbench-appearance-public-0.25.0/`의 native System 및 실제 C 토큰 색도 통과했습니다.
- 공개 단독 EXE·ZIP 내부 EXE 각각 의미론7조건과 즉시 종료·재열기의 최신 코드 복원 통과. `workbench-docs-public-0.25.0/`의 공개 Docs는 `tft`·`ref_st7735_8`·`uart` 3종의 코드·배선·실제 실행 로그를 대조했습니다. 개발114장치 Docs와 별도 범위입니다.
- 자동 업데이트 완료: 원본 공개0.24.0→0.25.0의 실제 스케줄러 검색·다운로드·SHA 검증·EXE 교체·새 main 재기동·재열기를 통과했습니다. 코드·Jellybean·글꼴17·장치 배율1.25·자동 업데이트 설정을 보존했습니다. WB-05 및 이번 작업 범위를 완료로 판정합니다.
- 정상 크기 Dark/White와 900폭·글꼴20 두 테마 화면을 직접 검토해 추가 문제 없음. [공개 화면](evidence/public-screenshots.json)과 [공개 검증 집계](evidence/public-verification.json)에 EXE/증거 해시를 기록했습니다.
- 보조 수집기는 모든 앱 검사 성공 후 `File.Replace(...,$null)`의 .NET 빈 경로 오류로 최초 manifest 저장에 실패했습니다. 원본8증거 SHA·EXE 해시를 재대조하고 같은 runId의 임시 manifest를 Python `os.replace`로 저장 복구한 후 수집기 검증을 통과했습니다. 제품 수정·앱 재실행 없이 처리했고 원본 실패 manifest를 별도 보존했습니다.
