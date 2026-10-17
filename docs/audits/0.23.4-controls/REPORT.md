# 0.23.4 화면 정리·보드 초기화 검증

상태: 공개 EXE 검증 완료.

- 요청한 디버그 5개 버튼/크기 복원 버튼·문구/코드 상단 설명·검색 버튼/배선 버튼/패널 이동 드롭다운이 DOM에서 제거되었음을 확인했다.
- Ctrl+F/R와 Esc, W로 실제 배선 추가, V 선택, Alt+0 기본 크기, 제목 우클릭과 Shift+F10의 패널 이동 및 재시작 후 배치 유지가 통과했다.
- 보드 구성 초기화의 취소/Esc/기본 취소 포커스, main과 보조 파일 보존, 회로·MCU 설정 제거, undo/redo와 재시작 후 저장 상태를 대조했다. 실행 중 초기화 금지를 확인했다.
- 실제 시뮬레이터에서 Ctrl+Shift+F5 시작, F11의 helper 인수 3, F10 후 doubled=6, Shift+F11 반환 후 counter=7, F6 일시정지, Shift+F5 정지를 확인했다. 유휴 상태·모달·Shift+F10에서는 잘못된 단계 실행이 발생하지 않았다.
- Windows GCC/GDB에서도 같은 단계 실행 단축키와 정지, 변수 3/6을 확인했다. 물리 STM32 보드 실행 검증은 아니다.
- 단위/모델 검사 312개 및 전체 Windows CI 성공. Dark/White와 1024px 화면은 별도 headless 시각 검사로 대조했다. 숨김 Electron의 화면 캡처 지연 때문에 기능/로그 검증과 시각 검사를 분리했다.

첫 공개 GDB 검사에서는 이전 명령 처리 중 다음 단축키를 보내 대기 초과가 발생했다. 기존 버튼 클릭 검사는 disabled 해제를 기다렸으므로, 단축키 검사에도 실행 컨트롤의 처리 완료 대기를 추가하고 같은 공개 EXE를 재실행했다. 실제 변수값·호출 스택·정지를 다시 확인해 통과했다. 제품 코드와 배포 자산은 변경하지 않았다.

## 배포

- Release: https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.4
- Windows CI: https://github.com/moonsyu/STM-Simulator/actions/runs/39013524275
- 빌드 커밋: `69ab8d988a347559f7d54f7c30cafcb006ff260f`
- EXE SHA-256: `c5117ac8e5c31a560af81847c742d8d5dddcad9cc535abdccb4f10869476d61e`
- EXE/ZIP/SHA256.txt/BUILD-INFO.json/update-manifest.json, ZIP 내부 실행 파일명과 해시, 버전/태그/최신 Release 선택 일치.

## 재현

`node scripts/controls-reset-check.cjs`는 격리된 개발 Electron을 사용한다. `LAB_EXE`에 공개 EXE 경로를 설정하면 그 파일을 실행한다. `CONTROLS_NATIVE=1`은 설정된 Windows GCC/GDB 도구로 네이티브 검사를 추가한다. 사용자 앱은 조작하지 않는다.

파일 로그는 work/test-results/controls-reset-public.json, controls-reset-dev.json 및 controls-reset-unit.log에 저장했다. 실제 앱의 board.reset/debug.command/debug.paused와 simulation.state를 포함한다. 공개 결과 요약은 results.json, 상세 수정 위치는 FIX-LOCATIONS.md에 저장했다.
