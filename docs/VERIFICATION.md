# 현재 검증 기록 — 0.8.0

2026-09-07, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 변경

- HAL 예제를 선택하면 확인 창 없이 회로·배선·코드·핀·계산 설정을 즉시 적용한다. 회로 이름을 유지하고 Undo/Redo로 이전 작업을 복원한다. 적용 직후 회로 영역으로 포커스를 옮겨 Ctrl+Z도 바로 사용할 수 있다.
- 16종 부품을 검색 가능한 하나의 목록으로 통합했다. 한글·영문 이름·종류·설명으로 검색하며 빈 문자열과 공백만 입력하면 모두 표시한다.
- 부품 목록만 세로 스크롤하며 검색창과 예제·핀 설정은 제자리에 유지한다. 결과가 없으면 안내하고 실행 중에는 부품 추가를 막는다.
- README를 프로젝트 소개·기능·빌드 방법·GitHub Releases 다운로드 안내로 갱신했다.

## 모델 및 화면 검증

- npm test: **111개 통과**, 실패 없음. 회로·HAL·UART·인터럽트·파일 호환 및 빌드 정리 검증을 포함한다.
- npm run test:ui: **7개 스크립트 통과**, 렌더러 오류 없음.
- 검색 초기화/별칭/결과 없음, 최소 창 1120×760에서 목록 스크롤, 검색·핀 설정 위치 유지, 필터된 부품 추가와 실행 중 추가 방지를 검사했다.
- 13개 HAL 예제 즉시 적용, 회로·코드·핀·계산 설정과 이름 보존, Undo/Redo를 검사했다. 선택 직후 Ctrl+Z 포커스 수정을 적용한 뒤 HAL 예제 UI를 다시 실행해 전체 회로 복원을 확인했다.

## 실행 파일 검증

- npm run build 및 npm run build:artifact 통과. 패키지 버전·이름·참고 자료 제외·Electron/Chromium 라이선스 원문 검사를 통과했다.
- 패키지 앱에서 부품 UI와 HAL 예제 UI 두 스크립트를 다시 실행해 통과했다.
- portable-smoke.cjs로 단일 EXE를 직접 실행했다. HAL 회로·UART RX/TX 로그·Pinout, LED·센서·LCD·UART/I²C/SPI·파형 및 기존 사용자 파일 기능을 확인했고 렌더러 오류는 없었다.
- 지정 저장소·빌드 소스·app.asar의 소스/UI/문서 **38개 파일 바이트 일치**, package.json 주요 메타데이터 일치. 새 부품 카탈로그 모듈 포함을 확인했다.
- EXE: STM-Simulator-0.8.0-win-x64.exe, **100,160,445 bytes**.
- EXE SHA-256: 813d0b57e1f265cc1fcfffe9610d141699921ecef20b4262fbfe24de9397da78.
- 빌드 소스 커밋: e07f46276be0bf81c9964a2bd5934737b249908e.

## 게시와 정리

- [GitHub Releases v0.8.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.8.0)에 EXE, Windows x64 ZIP, SHA256.txt를 게시했다. Release ID: 383804555.
- ZIP의 내부 파일 목록과 EXE 체크섬을 검사했다. 실행 파일·README·라이선스·API 문서·빌드 정보·체크섬을 포함한다.
- ZIP: STM-Simulator-0.8.0-Windows-x64.zip, **102,853,371 bytes**.
- ZIP SHA-256: 48a10dd41396714248578c11c5fdfa689f615609715c41479eaa38d38946417d.
- GitHub가 보고한 세 Assets의 SHA-256·크기가 업로드 원본과 일치한다. 최신 Release 링크와 v0.8.0 태그의 빌드 커밋, 원격 main의 README 내용을 확인했다. 저장소는 기존 Private 설정을 유지한다.
- 소스: C:/Users/SSAFY/Desktop/ct/STM-Simulator. 최신 로컬 배포: dist/artifact/.
- 사용자 앱이 종료된 것을 확인한 뒤 이전 배포 파일 10개·폴더 2개를 자동 정리했다. 실제 저장소 dist에는 0.8.0 EXE 하나만 남겼다.
- 현재 JSON·PNG·CSV 증거는 test-results/에 유지한다. 별도 빌드 폴더의 중복 출력 85개·폴더 5개와 테스트 임시 프로필을 정리했다. 사용자 회로·자동 저장은 변경하지 않았다.

## 범위

지원 HAL API를 회로에 연결하는 소스 인터프리터이며 전체 ST 드라이버·ARM/ELF/BIN 실행기는 아니다. HAL DMA, 동기식 USART, MCU UART 간 직접 배선 전송, 실제 NVIC 선점은 미지원이다.
