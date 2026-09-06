# STM Emulator 0.3.1 — 이름 변경 검증

2026-09-06, Windows x64 / Electron 44.2.0.

- 앱 상단 표시, 창 제목, 파일 선택창의 형식 이름, npm 프로젝트명, 패키지 제품명, 실행파일명을 STM Emulator로 변경했습니다.
- 자동 저장은 기존 `AppData/Roaming/STM32 Circuit Lab` 경로를 사용합니다. 기존 로컬 저장 키, 회로 파일 형식과 `.stm32lab` 확장자도 유지합니다.
- 기존 `scripts/ui-smoke.cjs`를 실행해 배선·LED·버튼·ADC·실행 한도·실제 IPC 회로 저장 및 불러오기 검증을 통과했습니다.
- 패키징된 `dist/win-unpacked/STM Emulator.exe`에서 앱 이름·창 제목·버전·화면 표시를 확인하고, 격리된 검증용 프로필에 회로를 저장한 뒤 재실행하여 자동 저장이 복원되는 것을 확인했습니다.

결과: `test-results/rename-verification.json`.
화면: `docs/stm-emulator-preview-0.3.1.png`.

최종 `STM-Emulator-0.3.1-win-x64.exe`를 직접 실행하여 압축 해제, 13종 부품, 검색 핀 강조, LED 및 초음파 예제 동작을 확인했습니다.

- 크기: 101,550,198 bytes
- SHA-256: `3520A157C1431FC10D07DD4CECFE3B9932467A1FF9EE93A61F2AB6D16EE5BA9B`
- 결과: `test-results/portable-smoke.json`
