# 0.23.4 수정 위치

- src/ide-ui.js, src/debug-shortcuts.js, src/native-ide-ui.js: 버튼 제거, 단축키와 상태 제한.
- src/editor-search.js, index.html: 검색/배선/설명 UI 제거.
- src/resize-ui.js: Alt+0 크기 복원.
- src/workspace-layout.js: 제목 우클릭/Shift+F10 패널 이동.
- src/board-reset.js, src/app.js, index.html: 코드 보존 보드 초기화, 확인/이력/로그.
- scripts/controls-reset-check.cjs: dev/공개 EXE 기능 및 로그 검사; CONTROLS_NATIVE=1은 실제 Windows GDB 포함.
- scripts/controls-visual-check.cjs: 별도 시각 검사; PLAYWRIGHT_EXECUTABLE_PATH로 설치된 Chromium 지정 가능.
