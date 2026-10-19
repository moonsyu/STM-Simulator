# 실제 화면·동작 회귀 검사 계획

배포 대상은 **0.25.0 예정이며 미공개**입니다. 이 계획의 로컬 검사 결과와 새 Windows CI/공개 릴리스 검증을 구분합니다. CI와 공개 검증 상태는 아직 pending입니다.

- 담당: UI regression agent. 실행 스크립트: `scripts/workbench-review-check.cjs`.
- 사용자 앱·프로필·파일을 사용하지 않습니다. 독립 Electron 프로필에서 실제 UI와 파일 입력을 사용합니다. 저장/열기 실패는 테스트 경로와 깨진 JSON으로 만들고 정상 파일 재시도까지 확인합니다.
- Electron 실행은 부모 에이전트와 조율해 한 번에 한 검사만 진행합니다. 제품 구현 전 기준 증거는 `work/ui-design-audit-0240`의 기존 21개 화면과 측정값을 사용합니다.

| 범위 | 조합과 판정 |
|---|---|
| UI-01 글꼴 | 900×560, 1024×640, 1366×768, 1540×1020 × 화면 글꼴11/13/20 × Dark/White. 대표 레이블·버튼·핀 상태 실제 computed font가13→20 설정에서 확대되는지 확인 |
| UI-02 상단 | 회로이름 입력과 작업 버튼이 겹치지 않고 문서 전체 가로·세로 overflow가 없어야 함 |
| UI-03 저장 상태 | 모든 창·폰트·테마 및 실제 저장실패·자동저장 quota실패에서 저장 상태가 화면에 남아야 함. 실패를 role=alert로 읽을 수 있고 재시도가 성공해야 함 |
| UI-04 부품 목록 | 바깥 library에 스크롤이 없고 목록 자체가 스크롤. 최초 뷰에서 목록 높이96px 이상 |
| UI-05 조작 크기 | 모든 배선색 버튼의 실제 클릭영역24×24px 이상. 접힌 메뉴는 실제 클릭해 열어서 검사 |
| UI-06 코드 공간 | 기본 배치에서 코드 실영역 높이176px 이상(기본 코드 줄높이22px로8줄), 로그 실영역의 실제 두 log-line 높이+padding 이상. 화면 글꼴을 바꿔도 코드 글꼴14px 유지, 타임스탬프는 터미널 본문 글꼴 상속 |
| 접근성 | 탭 role/aria-selected/aria-controls, 방향키·Home/End·Enter. 회로 부품/핀/배선·꺾임점 키보드 조작과 undo, 확대/축소 포커스 보존, 드래그 중 선택 변경/실행 중 구조 변경 차단. Space 버튼 유지/해제·포커스 이탈·USER EXTI·RESET 반복 방지·슬라이드 전환과 실제 HAL 로그 |
| 작은 화면 경계 | 모니터 탭 컨테이너와 상태/지우기 버튼 겹침0, 마지막 탭 키보드 접근 가능. Pinout 타일 간 겹침0, 핀명/상태 글자의 실제 glyph 영역이 타일 안에 존재 |
| System 테마 | Windows가 밝으면 White, 어두우면 Dark. Electron nativeTheme dark→light→dark 알림에서 코드 테마 기본 전환과 수동 White 고정 유지 확인. 사용자 OS 설정은 바꾸지 않음 |
| 모델·배선 | 114항목 실제 검색·hover/디코딩, 모든 일반 부품 모델의 회전/비등방 크기 적용 접점과 프리뷰 body 일치, 보드108핀·빵판400홀, 연속 경유점/우클릭 취소/꺾임점 편집/저장복원, HAL GPIO 및 USART2 실행 상태 파일 로그 |
| 대비 | 새 측정 상태별 기존 실제 computed contrast 검사. 저대비0건 |

계측은 기능·좌표·초점·실제 저장 결과를 검사합니다. 수치 통과만으로 외형이 참고 이미지와 동일하다고 판단하지 않으며, 대표 장치 화면은 별도로 시각 확인합니다. 실패 원본과 수정 후 결과는 덮어쓰지 않고 검수 라운드별로 보존합니다.

## 실행 결과와 남은 단계 — 2026-10-19

| 범위 | 현재 결과 | 증거/남은 조건 |
|---|---|---|
| UI-01~06·작은 화면·대비 | 로컬 완료:24조합·72상태·427판정 통과 | `work/test-results/workbench-review-final-layout/summary.json`, 최종 PNG. 대비36,228건 저대비0, 실제 두 로그행·타임스탬프 폰트 확인 |
| 모델·접점 | 로컬 완료:114종 프리뷰,112모델·637접점·보드108핀·빵판400홀 통과 | `work/test-results/workbench-review-final-models/summary.json`, `model-pin-parity.json` |
| 기능·저장·실행 로그 | 로컬 완료:Round7 성공9시나리오+Round8 저장 재검사 통과 | 각 `workbench-review-round7-functional` / `workbench-review-round8-save`의 summary 및 실제 진단 JSONL. Round7 전체 파일의 실패 상태는 보존 |
| 전체 단위 검사 | 로컬 완료:387/387 통과 | `work/test-results/workbench-unit-release.log` |
| System/수동 테마 | 로컬 완료 | `work/test-results/appearance-native-theme.json`:native 알림3단계·수동 고정·OS 설정 미변경 |
| 기존 UI 8개 최종 묶음 | 로컬 완료 | boards/devices/circuit-tools/editor-tools/passive-buzzer/l298n/ide/mcu-defaults 각각의 `workbench-final-*-smoke.cjs.log` |
| 네이티브 백엔드 | 로컬 완료, 실물 실행 아님 | `work/test-results/native-ide-check.json`, hardwareRun=false |
| 네이티브 UI | 로컬 재검사 완료 | `work/test-results/workbench-native-ui-recheck.log`, `native-ide-smoke.json`:실제 빌드·GDB·실행·터미널·clangd·오류 보호·화면 통과. 첫 timeout은 테스트 동기화 원인으로 별도 보존 |
| Windows CI·0.25.0 Release | pending | 전체 CI 성공, 새 버전 공개5자산·커밋/해시/latest·공개 EXE/ZIP 동작/복원·자동 업데이트 확인 필요 |
