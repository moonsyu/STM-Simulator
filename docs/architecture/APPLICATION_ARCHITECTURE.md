# 애플리케이션 구조

2026-10-19 작업 화면 개선 기준. 기존 Electron/정적 ES module 구조를 유지합니다. 프레임워크나 프로세스 경계는 변경하지 않습니다.

[시스템·UI·저장 흐름 그림](architecture-overview.svg)에서 모듈 의존 방향과 오류 복구 흐름을 함께 확인할 수 있습니다. [편집 가능한 원본](architecture-overview.cjs)은 외부 의존성 없이 SVG를 생성합니다.

| 영역 | 책임 | 의존 방향 |
|---|---|---|
| app.js | 프로젝트·선택·Undo·실행 상태, 사용자 입력, 저장 예약 | 모델/렌더/UI 어댑터 사용 |
| 프로젝트/배치/회로 모델 | 입력 검증, 핀·접점 계산, 이동·복제, 전기 회로 계산 | DOM에 의존하지 않음 |
| render/catalog-render | SVG 부품·표시 접점, 실행 상태 패치 | 모델 정의/geometry 사용 |
| wire-path | 저장 점을 바꾸지 않는 둥근 표시 경로 | 외부 상태 없이 계산 |
| workbench-ui/workspace-layout | 실제 컨트롤 재배치, 메뉴, 도킹·사용자 비율 보존 | 기존 DOM ID/이벤트 유지 |
| canvas-keyboard | SVG focus/객체·접점 탐색 | app의 검증된 편집 콜백 사용 |
| tab-accessibility | active 상태와 ARIA 동기화, 방향키·focus | 기존 탭 click 흐름 사용 |
| ui-feedback | 실패 지속 표시·닫기·로그 접근 | app/IDE에서 오류 scope 전달 |
| ide-preferences | Windows 참고 UI 모드와 별도 코드 theme 적용 | 기존 저장 설정 검증 |
| desktop/preload/main | 제한된 IPC, 파일/폴더 트랜잭션, 네이티브 도구·업데이트 | renderer에서 임의 Node 실행 불가 |

회로 구조 변경은 실행·drag·작성 중 배선 가드를 확인한 후 draft 검증 → checkpoint → 반영 → autosave/렌더 순서를 따릅니다. 키보드 이동도 같은 프로젝트 모델을 사용합니다. 실행 중에는 기존 측정/출력 패치를 유지하고 배선 경유점 편집을 숨깁니다.

저장 오류는 로그와 지속 알림에 표시합니다. 자동 저장과 파일 저장은 별도 오류 범위이며 파일 저장 실패를 뒤늦은 자동 저장 성공 문구로 덮지 않습니다. 실패한 열기는 현재 작업을 유지하고 성공한 재시도는 해당 오류를 해제합니다. 사용자 프로필 대신 독립 테스트 프로필에서 오류·복구·종료를 검사합니다.

설정/프로젝트 파일 포맷 변경은 없습니다. 기존 저장 패널 비율은 유지하며 새 기본 비율의 반응형 조정은 사용자가 배치를 조정하기 전까지만 동작합니다. 검증과 남은 작업은 [작업 계획](../audits/tinkercad-workbench/PLAN.md), [검사 로그](../audits/tinkercad-workbench/CHECKLOG.md)를 참조합니다.
