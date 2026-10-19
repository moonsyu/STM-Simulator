# 작업 화면 · 장치 모델 반복 검수

2026-10-19. **배포 대상은 0.25.0 예정이며 아직 공개하지 않았습니다.** 기존 단일 NUCLEO-F446RE 학습 IDE를 유지하고, 사용자가 제공한 Tinkercad 이미지/탭의 부품 식별성과 배선 표현을 자체 SVG에 적용했습니다. Windows 밝은/어두운 테마를 참고하고 System은 운영체제 모드 변경을 따릅니다. 아래 결과는 독립 프로필에서 수행한 로컬 소스 검증입니다. 새 테마 importer의 scope 변환 결함을 발견해 2차 CI를 게시 전에 취소했고, 수정과 로컬 재검사는 완료했습니다. 새 Windows CI·공개 릴리스 검증은 pending입니다.

후속 3차 CI는 패널 헤더 우클릭의 테스트 대상 오류로 실패했습니다. Release는 게시되지 않았으며, 제품 변경 없이 해당 검사 보완과 재실행을 진행합니다.

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

## 검증 경계

- 독립 프로필만 사용했습니다. 사용자 Tinkercad 회로, 현재 앱과 저장 데이터를 변경하지 않았습니다.
- Windows 참고 UI와 등록 코드 colorscheme를 분리했습니다. Electron nativeTheme 알림의 dark→light→dark 및 수동 White 고정이 통과했습니다. 사용자 OS 설정은 변경하지 않았습니다.
- 122개 HAL 프로젝트를 실제 ST HAL/CMSIS·ARM GCC로 컴파일·링크했습니다. 실물 보드 실행을 뜻하지 않습니다.
- HAL GPIO/USART2/버튼 검사는 시뮬레이터 실제 실행의 JSONL 전압·전류·송수신 바이트로 판정했습니다.
- 자동 수치 검사가 통과해도 PNG 직접 검토에서 찾은 문제를 남겨 수정했습니다. 최초 실패/중간 검사를 성공으로 덮어쓰지 않았습니다. 상세 순서는 [단계 로그](LOG.md), [검사 기록](CHECKLOG.md)에 있습니다.
- API 카드 호출/반환, 장치 전체 동작, 단선별 연결 상태, 손상 회로 복구 후 실행은 별도 기준으로 판정합니다. 개발 앱114개 검증을 공개 EXE114개 검증으로 확대하지 않습니다. 공개용 집계와 재현 명령은 [증거 안내](evidence/README.md)에 있습니다.

## 게시와 최종 수렴

기능 브랜치에서 계획525f174, 모델9e6ac70, UI d22658e로 분리 커밋했습니다. 후속 모델·표시 수정의 로컬 최종 화면/모델 검사와 네이티브 UI 재검사는 완료했습니다. **0.25.0의 전체 Windows CI, Release 게시, 공개 5자산의 버전·커밋·해시/latest, 공개 EXE/ZIP 실행·복원·자동 업데이트 검증은 pending**입니다. 이 보고서는 0.25.0의 게시·배포 완료를 주장하지 않습니다.

게시 전 추가 검사에서 JSON/Java 등 특정 언어의 세부 scope가 C의 공통 `type`·`number`·`delimiter` 규칙을 덮는 코드 테마 importer 결함을 확인했습니다. 이를 포함한 산출물의 게시를 막기 위해 [2차 CI39211377769](https://github.com/moonsyu/STM-Simulator/actions/runs/39211377769)를 취소했고 HTTP 202 접수 이후 취소 완료를 확인했습니다. **이 실행은 검사 실패가 아닌 의도한 취소**입니다. importer와 저장된 기본 테마의 알려진 변환 오류 교정을 완료하고, 실제 코드 토큰·사용자 설정 보존·전체397개 단위·System 영향 재검사를 통과했습니다. 새 CI 및 공개 자산 검증은 별도입니다.

순수 빨강/초록이 표시된 것 같다는 최초 의심은 PNG 픽셀 검사에서 `#ff0000`·`#00ff00` 각각 0개로 해소됐습니다. 실제 색은 원본 GitHub 테마의 `#cf222e`·`#116329`였습니다. 확정된 문제는 색의 임의 변경이 아니라 언어별 scope 변환 범위입니다. 다른 기능의 완료 검증은 유지하되, 기존 System 전환 성공을 importer 정확성의 근거로 확대하지 않습니다.

[3차 CI39212542491](https://github.com/moonsyu/STM-Simulator/actions/runs/39212542491)는 기존 HAL·카탈로그까지 통과한 뒤 `controls-reset-check.cjs:28:90`에서 실패했습니다. Shift+F10 패널 이동·터미널 도킹·재시작 복원은 성공했지만 코드 `.dock-heading` 중앙 우클릭이 탭/버튼에 닿아 이동 dialog가 열리지 않았습니다. interactive 자식에서 패널 메뉴를 열지 않는 가드는 유지해야 하므로, 실제 `.dock-grab` 우클릭 성공과 탭 우클릭 차단을 구분하도록 테스트만 최소 수정 중입니다. **Release 미게시이며 수정 후 재검사 대기**입니다. 앞선 의도한 CI 취소와 이번 검사 실패를 구분합니다.
