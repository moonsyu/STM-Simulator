# 작업 화면 · 장치 모델 반복 검수

2026-10-19. **배포 대상은 0.25.0 예정이며 아직 공개하지 않았습니다.** 기존 단일 NUCLEO-F446RE 학습 IDE를 유지하고, 사용자가 제공한 Tinkercad 이미지/탭의 부품 식별성과 배선 표현을 자체 SVG에 적용했습니다. Windows 밝은/어두운 테마를 참고하고 System은 운영체제 모드 변경을 따릅니다. 아래 결과는 독립 프로필에서 수행한 로컬 소스 검증이며, 새 버전의 Windows CI와 공개 릴리스 검증은 pending입니다.

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
| 전체 단위 검사 | 387/387 통과, 실패0 | `work/test-results/workbench-unit-release.log` |
| 최종 화면 | 24조합·72상태·427개 판정 통과, 대비 텍스트36,228건에서 저대비0, renderer 오류0 | `work/test-results/workbench-review-final-layout/summary.json` |
| 최종 모델 | 114종 검색/hover/디코딩, 일반모델112종의 실제 변환·637접점, 보드108핀·빵판400홀 통과 | `work/test-results/workbench-review-final-models/summary.json`, `model-pin-parity.json` |
| 키보드·배선·실행 | Round7 성공9시나리오: 메뉴/탭, 회로/경유점, 드래그 가드, GPIO/UART, RESET/paused/F5 | `work/test-results/workbench-review-round7-functional/summary.json`, `runtime-events.jsonl` |
| 연속 저장 오류 복구 | Round8의 파일실패→quota실패→자동복구 시 파일실패 유지→파일복구·열기 재검사 통과 | `work/test-results/workbench-review-round8-save/summary.json` |
| System 테마 | Electron nativeTheme dark→light→dark, 수동 White 고정 통과, OS 설정 변경 없음 | `work/test-results/appearance-native-theme.json` |
| 기존 UI 최종 묶음 | boards, devices, circuit-tools, editor-tools, passive-buzzer, l298n, ide, mcu-defaults 8개 통과 | `work/test-results/workbench-final-*-smoke.cjs.log`의 해당 8개 로그 |
| 네이티브 백엔드 | 실제 GCC/GDB/clangd·ARM 산출물·실패/취소 보호 통과 | `work/test-results/native-ide-check.json` |
| 네이티브 UI | 재검사 통과:실제 Debug/Release 빌드·GDB step/watch/register·실행 stdout·터미널·clangd·오류 이동/이전 산출물 보호, renderer 오류0 | `work/test-results/workbench-native-ui-recheck.log`, `native-ide-smoke.json` |

Round7 전체 결과 파일은 당시 저장 검사 대기 누락으로 실패 상태를 유지합니다. 그 파일의 성공9시나리오와 대기 수정 후 Round8 저장 성공을 함께 판정 근거로 사용하며, 실패 기록을 성공으로 바꾸지 않았습니다. 네이티브 UI의 첫 timeout도 보존했고, 초기화 전 지역변수를 잘못 매칭하던 테스트 대기 조건을 실제 정지 프레임·다음 명령 가능 상태·정확한 변수값으로 보강한 뒤 재검사했습니다. 해당 보강은 제품 동작을 바꾸지 않았습니다.

## 검증 경계

- 독립 프로필만 사용했습니다. 사용자 Tinkercad 회로, 현재 앱과 저장 데이터를 변경하지 않았습니다.
- Windows 참고 UI와 등록 코드 colorscheme를 분리했습니다. Electron nativeTheme 알림의 dark→light→dark 및 수동 White 고정이 통과했습니다. 사용자 OS 설정은 변경하지 않았습니다.
- 122개 HAL 프로젝트를 실제 ST HAL/CMSIS·ARM GCC로 컴파일·링크했습니다. 실물 보드 실행을 뜻하지 않습니다.
- HAL GPIO/USART2/버튼 검사는 시뮬레이터 실제 실행의 JSONL 전압·전류·송수신 바이트로 판정했습니다.
- 자동 수치 검사가 통과해도 PNG 직접 검토에서 찾은 문제를 남겨 수정했습니다. 최초 실패/중간 검사를 성공으로 덮어쓰지 않았습니다. 상세 순서는 [단계 로그](LOG.md), [검사 기록](CHECKLOG.md)에 있습니다.

## 게시와 최종 수렴

기능 브랜치에서 계획525f174, 모델9e6ac70, UI d22658e로 분리 커밋했습니다. 후속 모델·표시 수정의 로컬 최종 화면/모델 검사와 네이티브 UI 재검사는 완료했습니다. **0.25.0의 전체 Windows CI, Release 게시, 공개 5자산의 버전·커밋·해시/latest, 공개 EXE/ZIP 실행·복원·자동 업데이트 검증은 pending**입니다. 이 보고서는 0.25.0의 게시·배포 완료를 주장하지 않습니다.
