# 현재 검증 기록 — 0.14.0 (IDE와 이동 가능한 패널)

- 검증일: 2026-10-07.
- 환경: Windows x64, Node.js 24, Electron 44.2.0, Monaco Editor 0.57.0, Playwright 1.58.2.

## 변경

- IDE 중심으로 프로젝트·코드·시뮬레이터·터미널을 배치하고 네 패널 모두 크기 조절·도킹·접기·최대화·로컬 배치 저장 지원.
- 과거 코드 300px, 시뮬레이터 470px, 터미널 255px 이상의 고정 최소 크기 제한 제거. 분할 비율 1~99%, 접기로 완전 숨김.
- 폴더 프로젝트 생성·열기·저장, C/H 파일 추가·이름 변경·삭제, include 갱신, 외부 파일 수정 시 덮어쓰기 차단.
- Monaco 로컬 번들, C/H 구문 강조·기본 완성·함수 정의 이동·파일별 편집 상태.
- 지원 소스 빌드·원래 파일 오류 위치, 중단점·일시정지·함수 진입/복귀·한 줄 실행·변수·호출 스택·읽기 전용 감시식.
- 편집 시 중단점 줄 이동, 찾기/바꾸기·프로젝트 Undo/Redo 연결.
- 일시정지·단계 실행 후에도 릴레이 접점 등 동적 부품 그림을 계산 결과와 동기화.

## 검증 결과

- GitHub Windows 러너에서 정적 버튼이 먼저 나타나 초기화 전에 클릭하던 UI 테스트 대기 조건을 수정했다. 이제 Monaco 편집기 생성이 끝난 뒤 조작을 시작하며, 재로드 시에도 같은 조건을 사용한다.

- 전체 모델 테스트 **186/186 통과**. 기존 178개와 IDE 모델 8개.
- IDE 모델은 도킹 트리의 모든 이동 방향, step into/over/out의 실제 실행 순서·변수·시간, 반복문 중단점 재진입, 다중 파일 원본 줄, 감시식 부작용 차단, C/H 관리, 디버그 설정 검증, 폴더 저장 충돌을 검사.
- 전체 Electron UI **14개 스크립트 통과** (`npm run test:ui`). 이전 부품·통신·센서·타이머·저장·검색·수동 부저·L298N 회귀 검증 포함.
- IDE UI는 실제 키보드 편집, 네이티브 폴더 저장/재열기, 오류 파일 이동, 디버그 단계·감시식·중단점, 줄 삽입 시 중단점 이동, 100px 미만 가로 축소, 터미널 세로 축소, 터미널 재배치와 재시작 유지, 제목 드래그 도킹, 접기·복원·최대화를 검사.
- 창 1024×640에서 문서 전체 가로 넘침 없음. 데스크톱/작은 창 스크린샷을 확인. 큰 내용을 볼 때는 패널 스크롤 또는 최대화를 사용.
- Impeccable 수동 탐지 1회 실행. 새 IDE 기능 글씨는 11px 이상으로 보완. 디버그 화살표의 삼각형 테두리와 Monaco 진행 표시를 장식 카드·자동 스크롤로 판단한 항목은 적용 대상이 아니다. 기존 회로 화면의 작은 라벨·색상 전체 재설계는 이번 변경 범위 밖이다.
- Windows x64 portable 빌드 및 패키지 검사 통과. IDE/실행기/편집기/워커 원본과 asar 바이트 일치, 앱 아이콘, Electron/Chromium/Monaco 라이선스 원문, 참고 자료·테스트 파일 제외 검증.
- 패키지된 `win-unpacked/STM Simulator.exe`에서도 IDE UI 시나리오 전체 통과. 개발 소스 파일 경로에 의존하지 않고 폴더 저장과 Monaco를 실행.

- 단일 portable EXE 추출·시작과 LED·LCD·UART/I²C/SPI·언어·DMA·파형·HAL UART/Pinout 검증 통과. `work/test-results/portable-smoke.json`과 `portable-tests.log`에 기록.
- 테스트 임시 프로필 일괄 삭제는 자동 승인 검토에서 차단되어 생략했다. 해당 폴더는 Git과 EXE에서 제외된다.

## 범위와 한계

- 앱의 빌드는 지원 소스 해석기용이다. 실제 ARM ELF/BIN 생성·실행, clangd, GDB/ST-LINK, 전체 C/C++ 지원은 포함하지 않는다.
- 인터럽트·주변장치 콜백 내부 중단점과 한 줄 실행은 지원하지 않는다.
- 실제 ARM GCC/ST HAL 컴파일·링크 검사와 실물 보드 검증은 이번 변경에서 실행하지 않았다. 생성 HAL 코드·회로 모델 한계는 [HAL API](HAL-API.md), IDE 조작은 [IDE 사용법](IDE.md) 참조.

## 배포 파일

- EXE: `outputs/artifact/STM-Simulator-0.14.0-win-x64.exe`.
- 크기: 102562796 bytes.
- SHA-256: `45c0b5b4e60508eb1bd067239d0fe6c58e49f80256c4400e7cef450b4244f077`.
- ZIP: `outputs/STM-Simulator-0.14.0-Windows-x64.zip` (EXE·문서·라이선스·체크섬).
- 실행 파일과 고지 문서를 `outputs/artifact/`에 제공한다. 게시 대상은 `moonsyu/STM-Simulator`의 `v0.14.0` Release이며, 업로드한 파일의 해시와 태그 커밋·Actions 결과는 `work/test-results/release-proof.json`에 기록한다.

## 로컬 증거

- `work/test-results/model-tests.log`, `ui-tests.log`, `ide-model-tests.log`, `build.log`.
- `work/test-results/ide-smoke.json`, `ide-packaged-smoke.json`, `design-detect.json`.
- `work/test-results/ide-desktop.png`, `ide-compact.png`.
