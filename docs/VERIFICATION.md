# 현재 검증 기록 — 0.12.1

2026-09-22, Windows x64, Node.js 24, Electron 44.2.0, Playwright 1.58.2.

## 변경

- 참고 이미지 없이 내장 image_gen으로 앱 아이콘을 제작했다. 원본 PNG와 16/20/24/32/40/48/64/128/256px ICO를 desktop/icons에 둔다. 제작 프롬프트와 변환 방법은 [APP-ICON.md](APP-ICON.md)에 기록한다.
- 앱 창·작업 표시줄·웹 파비콘·Windows EXE에 아이콘을 연결했다. appId와 사용자 자동 저장 위치를 유지한다.
- 아이콘 리소스 편집을 허용하도록 signAndEditExecutable:false를 signExecutable:false로 변경했다. EXE 코드 서명은 수행하지 않는다.
- 패키지 검사에서 아이콘의 ASAR 포함 여부 및 portable/내부 EXE의 기본 아이콘 리소스를 ICO와 대조한다. Windows의 중첩 ASAR 경로와 256px ICO 크기 표기를 정규화했다.

## 로컬 검증

- 모델 테스트 161개 통과.
- 원본 PNG의 정사각형 크기·투명한 모서리, 패키지 내부 ICO 로딩, 앱 이름·창 제목, 파비콘 로딩·시작 검사를 통과했다.
- 패키징한 앱에서 코드 찾기·바꾸기, 실제 배선 더블클릭·드래그, 저장·열기·Undo/Redo 검사를 통과했다.
- portable EXE의 실행·회로·HAL UART 송수신·Pinout·파형 검사를 통과했다.
- Windows의 실제 EXE 아이콘 추출 결과를 확인했다. work/test-results/icon-shell.png에 증거를 남긴다.
- 패키징한 소스·문서·아이콘 57개가 커밋 c675008f8d293038360945d9deb0cd6ade14a5df와 일치한다. package.json은 electron-builder가 제거하는 개발 설정을 제외한 실행 메타데이터를 비교했다.
- HAL 모델과 main.c 생성 코드는 변경하지 않았다. 이번 작업에서 ARM 컴파일·실물 보드 검사는 재실행하지 않았다.

## 빌드와 배포

- npm run build 및 npm run build:artifact 통과.
- EXE: outputs/artifact/STM-Simulator-0.12.1-win-x64.exe — 101,629,428 bytes.
- EXE SHA-256: `42013d55f1ebcfca35c1bdfec8ea12e41f4c5ef178abc19d1747ef1c4a99170f`.
- ZIP: outputs/STM-Simulator-0.12.1-Windows-x64.zip — 104,330,021 bytes.
- ZIP SHA-256: `1f78c5a23eff3e9f5ac3c288ba7594fad538c1c52a372a5c665eab81ecc76928`.

- 커밋 c675008f8d293038360945d9deb0cd6ade14a5df의 [GitHub Actions](https://github.com/moonsyu/STM-Simulator/actions/runs/35687990966)가 성공했다. 모델 테스트 161개, UI 스크립트 11개, EXE 빌드, 실제 아이콘을 포함한 패키지 검사, 업로드까지 통과했다. 아티팩트 ID는 10678245172이다.
- [GitHub Releases v0.12.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.12.1)에 로컬 검증한 EXE·ZIP·SHA256.txt를 게시했다. 릴리스 ID는 393461876이며 업로드 파일 크기와 서버 SHA-256이 로컬 값과 일치한다.
- 원격 검증 증거는 work/test-results의 ci-proof.json, github-actions.log, release-proof.json에 남긴다.
- 이전 버전 배포 파일과 검증이 끝난 중간 빌드 파일을 정리했다. 최신 배포 파일은 outputs에 유지한다.

앱은 지원 HAL API를 실행하는 소스 해석 모델이며 전체 ST HAL/C ABI/ARM 실행기는 아니다. 세부 범위는 [HAL API](HAL-API.md)를 따른다.
