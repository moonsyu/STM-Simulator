# 현재 검증 기록 — 0.12.0

2026-09-16, Windows x64, Node.js 24, Electron 44.2.0, Playwright 1.58.2.

## 변경

- 코드 편집기에 Ctrl+F 찾기, Ctrl+R 단일/전체 바꾸기, 대소문자 구분, 다음/이전 항목 이동을 추가했다. 현재 소스 파일에만 적용하며 실행 중에는 검색만 허용한다.
- 치환은 프로젝트 Undo/Redo·자동 저장·파일 저장을 따르고 소스 크기 제한을 검사한다. 교체 문자열은 특수 기호도 문자 그대로 처리한다.
- 배선 선택 시 SVG 선을 유지해 실제 마우스 더블클릭으로 꺾임점을 추가한다. 점을 잡은 위치를 기준으로 이동하며 확대율에 맞는 크기의 핸들을 표시한다.
- 빌드 중간 파일과 검사 결과는 work/build 및 work/test-results, 배포 묶음은 outputs/artifact에 생성한다. 기존 dist와 새 출력의 알려진 빌드 파일만 정리하며 링크·잠긴 파일·출력 안의 사용자 파일은 삭제하지 않는다.

## 로컬 검증

- 모델 테스트 161개 통과. 기존 HAL·타이머·회로·저장 모델과 문자 검색·치환·크기 제한, 새 출력 위치 및 정리 범위를 검사했다.
- Electron UI 스크립트 11개 통과: ui/editor/parts/features/hal/layout-serial/hal-examples/boards/devices/circuit-tools/editor-tools.
- 새 편집기 검사는 실제 Ctrl+F/Ctrl+R, 검색 결과 순환, 먼 줄/열로 스크롤, 단일/전체/삭제 치환, Ctrl+Z/Y, 헤더 파일 분리, IPC 저장·열기, 실행 중 잠금, 1120×760 창을 확인한다.
- 배선 검사는 합성 dblclick 이벤트 대신 실제 마우스 더블클릭과 드래그를 사용한다. 전기적 시작/끝점 보존, 우클릭 삭제, Undo/Redo, 저장·재열기, 실행 중 편집 제한을 확인한다.
- UI 검사에는 분리된 테스트 프로필을 사용한다. 결과와 스크린샷은 work/test-results에 보관한다.
- 이번 변경은 main.c 생성기와 HAL 예제 내용을 바꾸지 않았다. 정식 ST HAL/ARM GCC 컴파일·링크 검사는 기존 검증에 해당하며 이번 작업에서 재실행하지 않았다.

## 빌드와 배포

- 빌드 커밋: `8c72fba70627a62ad874e4c82a8b16ebf7468483`.
- `npm run build` 및 `npm run build:artifact` 통과. 새 빌드 전에 이전 0.11.0 실행 파일과 배포 묶음을 정리했다.
- 패키징한 소스·문서 54개를 빌드 커밋과 대조했다. package.json은 electron-builder가 제거하는 개발 설정을 제외한 실행 메타데이터를 비교했다.
- win-unpacked 앱에서 새 편집기 UI 검사, 단일 portable EXE에서 실행·회로·HAL 통신·Pinout·파형 검사를 통과했다.
- 실행 파일: `outputs/artifact/STM-Simulator-0.12.0-win-x64.exe` — 100,191,890 bytes.
- EXE SHA-256: `c0d3d7e32eff9c073afb33a17c590b3ae5fdce0a1cb973e14d19f74d71bd7bf3`.
- ZIP: `outputs/STM-Simulator-0.12.0-Windows-x64.zip` — 102,890,956 bytes.
- ZIP SHA-256: `a24fc057162615f5ee7c9306991487ceadb760f6c1c26381377121fb201a1b6e`.

- 해당 커밋의 [GitHub Actions](https://github.com/moonsyu/STM-Simulator/actions/runs/35038624651)가 성공했다. 원격 모델 테스트 161개, UI 11개, Windows EXE 빌드, 패키지 검사, 업로드까지 확인했다. 아티팩트 ID는 10424557028이다.
- [GitHub Releases v0.12.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.12.0)에 로컬 검증한 EXE·ZIP·SHA256.txt를 게시했다. 릴리스 ID는 389554596이며 업로드 크기와 GitHub 서버 SHA-256이 로컬 값과 일치한다.
- 현재 원격 증거는 work/test-results/ci-proof.json, github-actions.log, release-proof.json에 기록했다.
- 알려진 이전 실행 파일과 중간 빌드 파일 75개는 정리했다. 임시 테스트 프로필과 이전 검사 자료의 폴더 삭제는 자동 승인 검토에서 차단되어 남아 있다. 상세 차단 사유는 제공되지 않았다.

실물 보드 실행은 검증하지 않았다. 앱은 지원 HAL API를 실행하는 소스 해석 모델이며 전체 ST HAL/C ABI/ARM 실행기는 아니다. 세부 범위는 [HAL API](HAL-API.md)를 따른다.
