# Tinkercad 참고 작업 화면 UI 계획

- 승인 근거: 사용자 제공 이미지와 Codex 브라우저의 Tinkercad 표현을 참고해 적용하라는 명시적 지시. 기존 IDE 정보 구조와 테마를 유지하는 개선입니다.
- 편집 가능한 시안: `ui/mockups/src/tinkercad-workbench.html`, 검토 화면: `ui/mockups/rendered/tinkercad-workbench-*.png`.
- 주요 화면: 기존 프로젝트/코드/시뮬레이터/터미널 도킹. 프로젝트 작업, 보조 코드 도구, 배선 팔레트는 명명된 메뉴로 묶고 파일 선택·저장 상태는 계속 노출합니다. 장치 목록의 스크롤은 하나로 정리합니다.
- 반응형: 900/1024/1366/1540 폭, UI 폰트11/13/20, Dark/White를 검증합니다. UI 설정은 코드·터미널 폰트에 영향을 주지 않습니다.
- 모델: 자체 SVG 표현으로 보드·빵판·장치의 접점/금속 다리/식별성을 개선합니다. 전기 핀 위치와 실제 연결 좌표는 보존합니다. 배선/선택/미리보기는 공통 둥근 경로입니다.
- 상태: 빈 회로 유지, 접힌 보조 도구, 실행 중 구조 편집 차단, 저장/열기 실패의 지속 알림과 로그 접근, 성공 후 해당 오류 해제. 기존 초기화 확인과 권한 흐름 유지.
- 접근성: 탭 role/selected/controls와 방향키 이동, 동적 소스 탭 focus 유지. 회로는 단일 Tab 진입 후 PageUp/Down 객체 탐색, P 핀 탐색, 방향키 이동, Enter 선택/연결. 선택 꺾임점 Delete는 점만 삭제합니다. 기존 Esc 삭제·배선 취소 동작은 보존합니다.
- 추가 승인: Windows의 White/Dark를 참고하라는 사용자 지시에 따라 기존 녹색 기운 UI 표면을 중성 회색/흰색과 파란 강조색으로 변경합니다. 코드 colorscheme는 독립 유지합니다. [근거/정책](audits/tinkercad-workbench/WINDOWS-THEMES.md).
- 범위/로그/검증: [PLAN](audits/tinkercad-workbench/PLAN.md), [LOG](audits/tinkercad-workbench/LOG.md). 신규 모바일 배포나 보드 종류 변경은 없습니다.

## 이전 완료 UI 계획 — 0.24.0

사용자 요청: 2026-10-19 `IMPROVEMENT-GUIDELINES.md` 적용. 해당 문서 Step 1-1~1-5의 명확한 UI 명세를 구현 승인 범위로 사용합니다. 기존 IDE/시뮬레이터/터미널 도크, 테마와 셀렉터를 유지합니다.

- 대상: Windows 데스크톱, 1366×768 / 1024×640, Dark/White.
- 탐색/구조: 기존 속성/측정 탭 유지. 배선 선택 시 현재 카드에 20색 팔레트와 전압 옆 상태 배지를 추가합니다. 새 모달/탭/내비게이션 없음.
- 선택: Shift+빈 공간 드래그는 점선 박스, 기존 선택에 합산. 취소는 Esc, 완료한 선택의 Esc는 삭제. Ctrl/Cmd+A 전체 부품·배선, D 복제, undo로 복구.
- 상태: 편집 중 색상 변경/초점 링/선택 테두리; 실행 중 색상 disabled 및 값만 갱신. HIGH≥2.0, LOW≤0.8, 그 사이 ANALOG, 해가 없는 노드는 부유. 실행 전 측정값은 미측정.
- 빈 화면: 기존 빈 인스펙터 안내 유지. 오류/저장 실패/삭제 동작은 기존 경로 유지. 신규 권한/로딩/확인 화면 없음.
- 접근성: 배지는 텍스트 병기, 스와치는 이름/title/aria-pressed, disabled 대비 유지. 실시간 값만 부분 교체하여 컨트롤 focus/scroll 보존. 색 transition 없음.
- 디자인: 기존 --ide-* 토큰과 Segoe UI, 측정값 tabular-nums. 시안은 `ui/mockups/src/canvas-ux.html`, 검토 이미지는 `ui/mockups/rendered/`.
- 모바일은 Windows 배포 대상이 아니며 새 모바일 흐름은 추가하지 않습니다. 좁은 데스크톱에서는 기존 패널 크기 조절/스크롤을 유지합니다.
