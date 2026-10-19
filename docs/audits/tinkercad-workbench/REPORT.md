# 작업 화면 · 장치 모델 반복 검수

2026-10-19. **0.25.0 구현·게시·공개 실행 파일·자동 업데이트 검증을 완료했습니다.** 기존 단일 NUCLEO-F446RE 학습 IDE를 유지하고, 사용자가 제공한 Tinkercad 이미지/탭의 부품 식별성과 배선 표현을 자체 SVG에 적용했습니다. Windows 밝은/어두운 테마를 참고하고 System은 운영체제 모드 변경을 따릅니다. 아래에서 로컬 소스 검사와 내려받은 공개 실행 파일 검사를 구분합니다. [공개 검증 집계](evidence/public-verification.json).

1차 CI 실패·2차 CI 취소·3차 CI 실패 기록은 보존했습니다. 필요한 수정과 재검사를 거친 4차 CI에서 전체 검사·빌드·Release 게시가 성공했습니다.

## 확인한 결함과 수정

| 문제 | 수정 | 확인 |
|---|---|---|
| 화면 글꼴 설정이 작은 고정 글꼴에 반영되지 않음 | UI 크기 토큰 적용, 코드·터미널 크기 분리 | 11/13/20 글꼴 비교 |
| 작은 창의 상단 겹침·저장 상태 숨김 | 보조 작업 메뉴와 항상 보이는 저장 상태 | 900~1540 폭, 두 테마 |
| 부품 목록 이중 스크롤·작은 코드 공간 | 보조 메뉴 분리, 적응형 초기 도크, 사용자 비율 보존 | 목록 높이·8코드줄·로그 공간 |
| 배선색 클릭 영역 부족 | 20색 각각 최소24px | 실제 열린 팔레트 측정 |
| Pinout 타일이 다음 행 글자를 덮음 | 내용에 맞는 grid row | 타일/글자 경계 겹침0 |
| 터미널 탭이 상태 버튼과 겹침·마지막 탭 포커스 잘림 | 탭 내부 수평 스크롤, 포커스 노출 | 900/20 양테마 |
| 로그 timestamp가 UI 글꼴을 따라 커져 줄이 잘림 | 터미널 본문 크기 상속 | 실제 두 로그행 높이·본문/타임스탬프 크기 재검사 통과 |
| 메뉴·탭 도킹/키보드 초점 충돌 | native popover, 초점 복원, 도킹 시작점 구분 | 7개 메뉴와 탭 실제 입력 |
| SVG 재렌더 뒤 경유점 초점 손실·전체 배선 삭제 가능 | 경유점 초점 복원, 점만 삭제 | 줌→Delete→Undo |
| 그룹 드래그 도중 키보드 선택 변경 | 드래그 중 관리 키 차단 | 실제 drag+PageDown/Enter |
| 실행 입력 키보드 경로 없음 | Space 누름/떼기, USER/RESET/스위치 | 전압·전류·EXTI 진단 로그 |
| RESET이 실행 중 빌드 가드에 막혀 오류 | 이전 실행 종료 상태 후 재초기화, 디버그 보존 | 마우스/Space/paused/F5 |
| 저장·열기 실패가 숨은 로그에만 표시 | 지속 알림, 저장 상태, 로그 접근, 실패 후 작업 유지 | 실제 파일 오류·정상 재시도 |
| 연속 파일/자동 저장 실패 후 파일 오류 표시 유실 | 오류 종류 유지, 정상 파일 저장만 해제 | 파일실패→quota→자동복구→파일복구 |
| 핀 검색 Esc가 메뉴 닫기에 가로막힘 | 입력의 기존 검색 취소 우선 | 기존 editor/parts UI 재검사 통과 |
| 프리뷰와 실제 정지 장치 색 불일치 | 같은 idle 후처리 사용 | 114종 이미지/형상 대조 |
| 일부 접점 가림·다리 단절·2열 패드 중첩 | 전기 좌표를 유지한 표시 경계/리드/패드 수정 | 최신 114종·637접점 최종 재검사 통과 |

## 확인한 로컬 검사 결과

| 검사 | 결과 | 근거 |
|---|---|---|
| 전체 단위 검사 | importer 수정 후 397/397 통과 | `work/test-results/workbench-unit-color-final.log` |
| 코드 테마 importer·저장 호환 | 관련 단위27개·실제 Electron 원본 C 토큰 색·구버전 기본 테마 교정·import/export·사용자 색 보존 통과 | `workbench-colorscheme-final.log`, `colorscheme-smoke.json` |
| 테마 영향 재검사 | appearance-canvas·native System·실제 편집기 토큰 통과 | `workbench-appearance-color-final.log`, `appearance-native-theme.json`, `editor-theme-tokens.json` |
| 최종 화면 | 24조합·72상태·427개 판정 통과, 대비 텍스트36,228건에서 저대비0, renderer 오류0 | `work/test-results/workbench-review-final-layout/summary.json` |
| 최종 모델 | 114종 검색/hover/디코딩, 일반모델112종의 실제 변환·637접점, 보드108핀·빵판400홀 통과 | `work/test-results/workbench-review-final-models/summary.json`, `model-pin-parity.json` |
| 키보드·배선·실행 | Round7 성공9시나리오: 메뉴/탭, 회로/경유점, 드래그 가드, GPIO/UART, RESET/paused/F5 | `work/test-results/workbench-review-round7-functional/summary.json`, `runtime-events.jsonl` |
| 연속 저장 오류 복구 | Round8의 파일실패→quota실패→자동복구 시 파일실패 유지→파일복구·열기 재검사 통과 | `work/test-results/workbench-review-round8-save/summary.json` |
| System 테마 | Electron nativeTheme dark→light→dark, 수동 White 고정 통과, OS 설정 변경 없음 | `work/test-results/appearance-native-theme.json` |
| 기존 UI 최종 묶음 | boards, devices, circuit-tools, editor-tools, passive-buzzer, l298n, ide, mcu-defaults 8개 통과 | `work/test-results/workbench-final-*-smoke.cjs.log`의 해당 8개 로그 |
| 네이티브 백엔드 | 실제 GCC/GDB/clangd·ARM 산출물·실패/취소 보호 통과 | `work/test-results/native-ide-check.json` |
| 네이티브 UI | 재검사 통과:실제 Debug/Release 빌드·GDB step/watch/register·실행 stdout·터미널·clangd·오류 이동/이전 산출물 보호, renderer 오류0 | `work/test-results/workbench-native-ui-recheck.log`, `native-ide-smoke.json` |
| 모든 장치 Docs·함수 카드 | 장치114·API 카드979·단선 위치701·전체 손상 회로114 복구 후 실행 통과 | [행동 판정](evidence/docs-behavior.json) |
| 개발 앱 Docs 실제 로그 | 114장치·338상태, 생성 코드/배선·입력/응답·TFT 전체 프레임·fault/error 대조 통과 | [앱 로그 판정](evidence/docs-runtime.json) |
| 초기화·외부 UART 최종 재검사 | 코드/보드 초기화·LED OFF/ON·모터 정역회전·TFT 두 모델·UART RX/TX 통과 | `code-reset-phase-recheck.log`, `controls-reset-workbench-helper-recheck.log`, `docs-workbench-helper-recheck.log`, `uart-vcp-workbench-helper-recheck.log` |

Round7 전체 결과 파일은 당시 저장 검사 대기 누락으로 실패 상태를 유지합니다. 그 파일의 성공9시나리오와 대기 수정 후 Round8 저장 성공을 함께 판정 근거로 사용하며, 실패 기록을 성공으로 바꾸지 않았습니다. 네이티브 UI의 첫 timeout도 보존했고, 초기화 전 지역변수를 잘못 매칭하던 테스트 대기 조건을 실제 정지 프레임·다음 명령 가능 상태·정확한 변수값으로 보강한 뒤 재검사했습니다. 해당 보강은 제품 동작을 바꾸지 않았습니다.

## 확인한 공개 0.25.0 검사 결과

| 검사 | 결과 | 근거 |
|---|---|---|
| Windows CI·게시 | 전체 검사·빌드·Release 게시 성공 | [CI39214636630](https://github.com/moonsyu/STM-Simulator/actions/runs/39214636630), [v0.25.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.25.0) |
| 공개 자산 무결성 | 5자산·latest·태그/빌드 커밋·ZIP 내부 대조 통과, sourceDirty=false | 제품 커밋 `2278c2da1a6c14ec16b1629af136172ce7a1e078` |
| 공개 화면·기능·모델 | 429판정·74상태(기본72+추가2)·10시나리오·114모델 통과, 대비37,062건 중 저대비0, renderer 오류0 | `work/test-results/workbench-public-0.25.0/summary.json` |
| 공개 테마 | native System·실제 C 토큰 색 통과 | `work/test-results/workbench-appearance-public-0.25.0/` |
| 단독 EXE·ZIP 내부 EXE | 각각 의미론7조건·즉시 종료 후 재열기의 최신 코드 복원 통과 | 내려받은 두 실행 파일을 독립 프로필에서 실행 |
| 공개 EXE Docs | `tft`·`ref_st7735_8`·`uart` 3종의 코드·배선·실제 실행 로그 통과 | `work/test-results/workbench-docs-public-0.25.0/` |
| 자동 업데이트 | 공개 원본0.24.0→0.25.0의 자동 검색·다운로드·SHA 검증·교체·재실행·설정 보존 통과 | [공개 검증 집계](evidence/public-verification.json)의 automaticUpdate |

공개 EXE는 `STM-Simulator.exe`, 102,783,034 bytes, SHA-256 `e678a2533cd8fd7fac864b466077c9df94bca1ffe4b5bb12d43c8527319cfc35`입니다. ZIP SHA-256은 `61ad97c361c3f75f8fb55d2ba15672a83f954485fd1e0167b8ea98713caa4d1e`입니다. EXE·ZIP·SHA256.txt·BUILD-INFO.json·update-manifest.json을 대조했습니다.

## 검증 경계

- 독립 프로필만 사용했습니다. 사용자 Tinkercad 회로, 현재 앱과 저장 데이터를 변경하지 않았습니다.
- Windows 참고 UI와 등록 코드 colorscheme를 분리했습니다. Electron nativeTheme 알림의 dark→light→dark 및 수동 White 고정이 통과했습니다. 사용자 OS 설정은 변경하지 않았습니다.
- 122개 HAL 프로젝트를 실제 ST HAL/CMSIS·ARM GCC로 컴파일·링크했습니다. 실물 보드 실행을 뜻하지 않습니다.
- HAL GPIO/USART2/버튼 검사는 시뮬레이터 실제 실행의 JSONL 전압·전류·송수신 바이트로 판정했습니다.
- 자동 수치 검사가 통과해도 PNG 직접 검토에서 찾은 문제를 남겨 수정했습니다. 최초 실패/중간 검사를 성공으로 덮어쓰지 않았습니다. 상세 순서는 [단계 로그](LOG.md), [검사 기록](CHECKLOG.md)에 있습니다.
- API 카드 호출/반환, 장치 전체 동작, 단선별 연결 상태, 손상 회로 복구 후 실행은 별도 기준으로 판정합니다. 개발 앱114개 검증을 공개 EXE114개 검증으로 확대하지 않습니다. 공개용 집계와 재현 명령은 [증거 안내](evidence/README.md)에 있습니다.

## 게시와 최종 수렴

기능 브랜치에서 계획525f174, 모델9e6ac70, UI d22658e로 분리 커밋했습니다. 후속 모델·표시 수정의 로컬 최종 화면/모델 검사와 네이티브 UI 재검사를 마치고, 제품 커밋 `2278c2da1a6c14ec16b1629af136172ce7a1e078`의 4차 CI와 0.25.0 게시를 완료했습니다. 공개 5자산·EXE/ZIP 실행·복원·실제 자동 업데이트까지 통과해 **WB-05 및 이번 작업 범위를 완료**했습니다. 이후 문서 기록은 같은 버전으로 게시하며 제품 태그·자산을 덮어쓰지 않습니다.

게시 전 추가 검사에서 JSON/Java 등 특정 언어의 세부 scope가 C의 공통 `type`·`number`·`delimiter` 규칙을 덮는 코드 테마 importer 결함을 확인했습니다. 이를 포함한 산출물의 게시를 막기 위해 [2차 CI39211377769](https://github.com/moonsyu/STM-Simulator/actions/runs/39211377769)를 취소했고 HTTP 202 접수 이후 취소 완료를 확인했습니다. **이 실행은 검사 실패가 아닌 의도한 취소**입니다. importer와 저장된 기본 테마의 알려진 변환 오류 교정을 완료하고, 실제 코드 토큰·사용자 설정 보존·전체397개 단위·System 영향 재검사를 통과했습니다. 새 CI 및 공개 자산 검증은 별도입니다.

순수 빨강/초록이 표시된 것 같다는 최초 의심은 PNG 픽셀 검사에서 `#ff0000`·`#00ff00` 각각 0개로 해소됐습니다. 실제 색은 원본 GitHub 테마의 `#cf222e`·`#116329`였습니다. 확정된 문제는 색의 임의 변경이 아니라 언어별 scope 변환 범위입니다. 다른 기능의 완료 검증은 유지하되, 기존 System 전환 성공을 importer 정확성의 근거로 확대하지 않습니다.

[3차 CI39212542491](https://github.com/moonsyu/STM-Simulator/actions/runs/39212542491)는 기존 HAL·카탈로그까지 통과한 뒤 `controls-reset-check.cjs:28:90`에서 실패했습니다. Shift+F10 패널 이동·터미널 도킹·재시작 복원은 성공했지만 코드 `.dock-heading` 중앙 우클릭이 탭/버튼에 닿아 이동 dialog가 열리지 않았습니다. interactive 자식 가드를 유지하며 실제 `.dock-grab` 우클릭 성공과 탭 우클릭 차단을 구분하도록 테스트만 최소 수정했습니다. **3차 실행에서는 Release가 게시되지 않았습니다.** 수정 후 로컬 재검사와 4차 전체 CI는 통과했으며 앞선 의도한 취소와 검사 실패 이력은 보존합니다.

자동 업데이트는 원본 공개0.24.0 EXE의 실제 스케줄러가 새 Release를 검색하고 다운로드·SHA-256 검증·EXE 교체·새 main 프로세스 재기동까지 수행했습니다. 재열기 후 코드, Jellybean, 글꼴17, 장치 배율1.25, 자동 업데이트 설정을 유지했습니다. 공개 정상 크기 Dark/White와 900폭·글꼴20 두 테마 화면을 직접 검토했고 추가 문제는 발견하지 못했습니다. [대표 화면과 해시](evidence/public-screenshots.json).

모든 앱 검사가 통과한 뒤 보조 수집기의 `File.Replace(...,$null)`에서 .NET 빈 경로 오류가 발생했습니다. 원본8개 증거의 SHA와 EXE 해시를 다시 대조하고 같은 runId의 임시 최종 manifest를 Python `os.replace`로 저장 복구한 뒤 수집기가 통과했습니다. 제품 변경이나 앱 재실행은 없었으며 최초 실패 manifest는 별도 보존했습니다. [최종 공개 집계](evidence/public-verification.json)는 개인정보 검사도 통과했습니다.
