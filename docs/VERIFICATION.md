# 검증 기록

## 0.25.0 작업 화면·장치 모델 — 게시 검증 진행 중

2026-10-19. Windows 참고 White/Dark 팔레트, System 자동 추종, 적응형 작업 공간, 접근성, 실제 장치 모델/접점 및 둥근 배선을 개선했습니다. [단계별 실패·수정·재검사 보고서](audits/tinkercad-workbench/REPORT.md).

- 로컬 단위 387개, 화면 24조합·72상태·427판정, 114종 프리뷰, 실제 ARM HAL 링크122조건을 통과했습니다.
- Electron nativeTheme 알림, HAL GPIO/USART2와 입력·RESET의 실제 진단 로그, 파일/자동 저장 연속 오류와 복구, GCC/GDB/clangd 실행을 확인했습니다.
- 새 버전 Windows CI와 공개 EXE·ZIP·5개 자산·자동 업데이트 검증은 진행 중입니다. 이전 릴리스 검증을 새 버전의 증거로 사용하지 않습니다.

## 0.24.0 캔버스 UX 1단계·공개 배포

2026-10-19. 가이드 Step 1-1~1-5 적용. 커서 중심 줌, 영역 선택/복제, 실시간 인스펙터 DOM 보존, 빵판 캐시, 배선 20색/논리 상태를 구현했습니다. 후속 2~5단계는 포함하지 않습니다. [상세 보고서와 증거](audits/0.24.0-canvas/REPORT.md).

- 374 단위 검사, 기존 52상태 대비와 신규 19상태 대비, 새 UI 13범주 통과. Monaco 빌드 및 npm audit 0건.
- [Windows CI 39186362509](https://github.com/moonsyu/STM-Simulator/actions/runs/39186362509) 두 작업 전체 성공. [v0.24.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.24.0)을 최신 릴리스로 게시했습니다.
- 제품 빌드/태그 커밋 `649d412d16b3ac1174e11434d56a1b7e1790c0bb`, sourceDirty=false, CI 출처 일치. 공개 EXE·ZIP·SHA256·BUILD-INFO·update-manifest 5개 자산과 버전/커밋/해시/latest를 확인했습니다. ZIP 실행 바이너리는 `STM-Simulator.exe` 하나입니다.
- 공개 EXE SHA-256: `1cafaa7669f0782ff339ea1f4a1a2cfaaedb0e8aaef87885c4b7de80999ccf81`. EXE 102,762,858 bytes, ZIP 105,640,391 bytes. 비인증 다운로드와 ZIP 내부 EXE/메타데이터/배포 문서를 대조했습니다.
- 내려받은 공개 EXE에서 13개 통합 범주, 19개 대비 상태(9,962텍스트), Dark/White 2해상도 화면을 통과했습니다. renderer 오류와 저대비 0건. 파일 진단 로그의 버전/종류/해시는 `evidence/public-runtime-log.json`에 보존합니다.
- 단독 EXE와 ZIP 속 EXE 각각 C 의미 7조건 및 편집 직후 종료→재실행 복원을 통과했습니다.
- 공개 0.23.9 EXE의 실제 자동 스케줄러에서 새 릴리스 검색→다운로드→SHA-256 검증→저장/교체→새 버전 재실행을 확인했습니다. 코드, Jellybean, 글꼴 17, 장치 배율 1.25, 자동 업데이트 설정을 보존했습니다. 사용자 앱/프로필은 조작하지 않았습니다.
- 첫 공개 검사에서는 숨겨진 창의 requestAnimationFrame 폴링이 주기적인 GPIO 변화와 맞물려 30초 timeout이 발생했습니다. 제품 변경 없이 검사만 같은 DOM의 실제 MutationObserver 변화(5초 상한)로 수정했습니다. 시작/변화 시각과 DOM 동일성, 초기 실패 증거를 함께 보존합니다. 후속 커밋은 이 검사와 검증 문서만 보완하며 배포 제품 소스/태그/자산을 교체하지 않습니다.

## 0.23.9 감사 결함 수정·공개 배포

2026-10-18. 저장·복구를 포함한 A01~A17 수정과 실제 실행 검증을 완료했습니다. [상세 보고서와 증거](audits/0.23.9-fixes/REPORT.md).

- 365 단위 검사, 독립 GCC/ARM 대조, 114 장치·979 HAL 카드 실행, 701 단선·114 손상 회로 복구, 128 최소 코드 초기화·114 재적용 통과.
- 독립 Electron 저장 오류/빠른 편집/프로젝트 전환/종료 복원, 52 화면 대비 검사, 실제 GCC/GDB/clangd/ARM 도구와 clean npm audit 0 확인.
- [Windows CI 39128144301](https://github.com/moonsyu/STM-Simulator/actions/runs/39128144301) 전체 성공. [v0.23.9 Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.9) 최신 선택과 공개 5개 자산, ZIP 내부 포터블 EXE, 버전/해시/출처 확인. 제품 커밋 `105eab70a2f3cb2bb8151042768eacb62c93f9fc`.
- 공개 EXE/ZIP 각각 C 회귀 7개와 입력 직후 종료·재실행 복원 통과. 공개 EXE Docs 적용·실행 7종의 파일 로그, TFT 전체 픽셀, UART RX/TX 확인.
- 구버전 공개 EXE 사본에서 0.23.8→0.23.9 실제 자동 다운로드·해시 검증·교체·재실행·코드/설정 보존 통과. 사용자 앱은 조작하지 않았습니다.
- 공개 EXE SHA-256: `8aa6bc0deafe4b315242df85f2310c320bce56617bb56cdd6b811486dd18f585`. 이후 문서 커밋은 이 배포를 덮어쓰지 않습니다.

## 0.23.3 기존 HAL 예제·코드 초기화

- 소스 검증: 기존 HAL 원본 40개, 기존 Docs 36개, HAL 카드 308개, 단선 복구 204개, 교차 포트 스테퍼/L298N 실행 통과.
- 단위 검사 310개, 실제 ARM GCC 링크 46개 통과.
- 독립 Electron에서 취소/Esc/undo/redo/핀·회로·파일 보존, 초기화 LED OFF와 재적용 ON, 모터 재배선의 진단 파일 통과.
- 공개 배포 검증 완료: Windows CI [39008820868](https://github.com/moonsyu/STM-Simulator/actions/runs/39008820868) 성공. 공개 EXE Docs 36개 및 코드 초기화/재배선 실행 로그 통과. [상세 보고서](audits/0.23.3-legacy-docs/REPORT.md).
- Release: https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.3 · 빌드 커밋 `7bf2600d78fdfbf85d224969f15bf10e01e8332f`. 공개 EXE/ZIP/체크섬/빌드 정보/매니페스트 5개와 최신 릴리스 선택 확인.
- 공개 STM-Simulator.exe SHA-256: `217f07be77a159e52245390953d50e790092f1faf6e9b8df946cecbb8fb81c40`. 이후 검증 기록 커밋은 배포 코드/버전을 바꾸지 않음.

검증일: 2026-10-17. 작업 경로 `D:\codex\project\STM-Simulator`. 사용자 앱/회로를 조작하지 않고 독립 프로젝트와 숨긴 테스트 프로필을 사용했습니다.

- Docs 반환값 이름 충돌, 버튼 2종 접점 병합, 인코더 에지 누락, 커패시터 PWM 모드, TFT 상태 크기/typed array IPC 문제 수정.
- 단위 검사 299개 통과. 최종 inline·장치 동작·진단 회귀 23개 통과. 수정 관련 HAL/CMSIS 예제 47개 ARM GCC 컴파일·링크 통과. 실물 보드 실행 결과는 아닙니다.
- 전체 장치 114개와 모든 배선 누락·오접속 복구 회로 114개를 실제 시뮬레이터로 실행. 센서 값/버튼/회전 입력을 변경해 출력·통신·전류·메모리·기계 상태 판정.
- 단선 701건의 연결 복구·신호 분리 검사, HAL 카드 979개 선택 API 호출/반환 확인. API 도달과 전체 장치 동작은 별도 판정. 구버전 문제 회로 10개 재적용 후 동작·사용자 코드/함수/파일 보존 확인.
- Bare-metal 274개 삽입·ARM 대상 전환은 통과. 직접 레지스터 코드는 HAL 실행기에서 실행하지 않으며 동작 검증으로 계산하지 않습니다.
- [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38928311749) 및 [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.2) 성공. 태그/빌드 커밋 `dfdd09c86e93cb6273af66d6d6ee5308c2d0b8b2`. GitHub latest `v0.23.2` 확인.
- 공개 EXE, ZIP, SHA256.txt, BUILD-INFO.json, update-manifest.json 다섯 자산 검증. 비인증 공개 다운로드, ZIP 내부 EXE, 버전·크기·태그/빌드 커밋·해시·문서 일치 확인.
- EXE 102,751,106 bytes, SHA-256 `f39b30431204776ce37f202ce20f6265d3216baeb190da5009963732e487956b`. ZIP SHA-256 `2b1df0d632c1d6da619e75f746fa77cab407eac0495d75631ed18a1dd0bc9cbb`.
- 내려받은 공개 EXE로 114개 실제 파일 열기 → Docs 버튼 → 실행. 전부 상태 파일 기록, 소스 감사와 main 코드·배선 일치, 실행/페이지 오류 및 전기 단락 없음. 환경값 입력 UI와 UART 송신도 사용. 두 TFT의 20,480개 RGB565 픽셀 전체 해시 확인.
- DS18B20 두 모델 `25.00 → 10.00 → 45.00 C`, 인코더 두 모델 `count=3/edges=12 → count=1/edges=4`, SD `OCR=40ff8000` 실제 공개 EXE 로그 확인.
- [장치별 보고서](audits/0.23.2-device-docs/REPORT.md), results.json, hal-cards.csv와 별도 수정 위치 기록 저장. 원시 테스트 데이터는 `work/test-results/docs-audit-0.23.2` 및 `work/audit-archives/docs-audit-0.23.2.zip`에 보관합니다. 실제 사용자 진단 자료는 포함하지 않습니다.
- 기존에 삽입된 main은 자동으로 변경하지 않습니다. 업데이트 후 해당 Docs를 재적용해야 수정 코드/배선이 반영되며 직접 편집한 관리 영역은 보호합니다.

---

# 검증 기록 — 0.23.1 공개 릴리스

검증일: 2026-10-16. 작업 경로 `D:\codex\project\STM-Simulator`.

- 사용자 자동 저장 데이터의 읽기 전용 사본에서 0.23.0 WritePin 적용 후 main STEP이 비어 있음을 확인. 최신 사본에는 LED 캐소드의 GND 선도 없음. GND 선이 사라진 조작은 확인하지 못함.
- 수정 후 모델 검사 **287개 통과**. 새 회귀 검사에서 main의 SET 점등·RESET 소등, 기존 초기화/사용자 코드/함수 목록/파일 보존, 빵판 GND 누락 복구, PA5 점유 시 핀 재배정과 카탈로그 LED를 확인.
- 실제 저장 사본 두 개에 재적용해 정상 선을 그대로 유지하고 최신 사본의 GND 1개만 추가. LED 모의 전류 **3.9267 mA**, 점등 확인. 사본으로 검증했으며 현재 열린 사용자 회로는 수정하지 않음.
- 두 사본의 적용 결과를 실제 ST HAL/CMSIS와 ARM GCC로 컴파일·링크. 실물 보드 실행 검사는 아님.
- `node scripts/docs-writepin-check.cjs`: 분리된 숨긴 Electron 프로필에서 실제 Docs 카드 버튼, main 삽입, 실행 로그의 점등/소등, 재적용 GND 복구, 이벤트-회로 해시 일치 통과. 사용자 앱 프로필에 접근하지 않음.
- 로컬 진단 단위 검사: 파일 회전, 잘못된/과대 입력 거부, 디스크 실패 복구, 기록 순서와 스냅샷 시점, 웹 환경·저장 실패 시 앱 동작 유지.
- 증거: ignored `work/diagnostics/{all-tests.log,user-project-verification.json,arm-verification.json}`, `work/test-results/docs-writepin-check.json`.
- [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38918319975)와 [Release v0.23.1](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.1) 게시 성공. 빌드/태그 `99f8f02e578dfc1510fe06a834e111f11f9e4197`, Git 작성자/커미터 및 게시 인증 `moonsyu` 확인. GitHub latest는 v0.23.1.
- 공개 `STM-Simulator.exe`, `STM-Simulator-0.23.1-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 검증. EXE/ZIP 비인증 다운로드, ZIP 내부 EXE, 버전·태그·빌드 커밋·크기·해시·문서 일치 확인. 로컬 `outputs/artifact/`도 해당 ZIP으로 갱신.
- EXE 102,750,052 bytes, SHA-256 `fab499411f0d9c97f907b23ada771b111aed367aaf069acde32644d307ddcd45`. ZIP SHA-256 `c6f9c6646fc27ea414973d86fa9e36d6749f975b2083cdce54bbab7b07d1a36d`.
- 내려받은 공개 EXE를 별도의 숨긴 프로필에서 실제 실행. WritePin 카드 → main SET → 실행 로그의 LED 점등, GND 삭제 후 재적용 복원, main RESET으로 변경 후 소등, 앱 버전 0.23.1의 파일 로그 기록까지 통과. 현재 사용자 앱과 원본 회로는 변경하지 않음.
- 공개 검증 증거: `work/test-results/release-0.23.1-ci.json`, `release-0.23.1-proof.json`, `public-0231-proof.json`. 기존 회로의 빈 STEP은 자동 변경하지 않으므로 업데이트 후 WritePin 카드를 재적용해야 함.

---

# 검증 기록 — 0.23.0 공개 릴리스

검증일: 2026-10-16. Windows x64. 새 회로는 빈 공간으로 시작하고 검색으로 보드 한 개와 빵판 여러 개를 추가합니다. 코드 실행과 Pinout은 기존 단일 보드 방식입니다.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38850545260) 성공. 검증 시 GitHub latest는 v0.23.0입니다.
- 빌드 커밋과 공개 태그: `81fe66f6753a25221b05dba91cc711d02d49af2f`. 작성자·커미터·푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.23.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 비인증 다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP으로 갱신했습니다.
- EXE 102,747,334 bytes. SHA-256 `16c6d108b794f7a856b4889ffd77cb33426c295c962d28ae9de0699cbf925ab4`.
- ZIP SHA-256 `44382be573c940c0a211db705692fb14979c33ce89d4a96de4c2d8623e1bdb14`.
- 공개 EXE를 별도 임시 프로필에서 직접 실행하여 빈 화면, 검색 보드 중복 방지, 빵판 여러 개, 기존 Pinout, 배선 20색, 삭제/되돌리기/재열기, main 내부 Docs 적용 및 LCD 실행을 확인했습니다. Dark/White 12개 화면 상태에서 글자 대비 문제는 없었습니다.
- 증거: `work/test-results/release-0.23.0-proof.json`, `work/test-results/public-023/public-exe-proof.json`, `work/test-results/release-0.23.0-ci.json`.

## 기능 및 회귀 검사

- 모델 검사 **280개** 통과. **114개 검색 항목의 HAL 함수 카드 977개** 적용·미리보기에서 새 함수/파일 없음, 재적용, 기존 GPIO 설정과 사용자 main 코드 보존을 검사했습니다.
- 실제 ST HAL/CMSIS를 사용하는 **381개 HAL/레지스터 예제** ARM 컴파일·링크 통과. 마지막 초기화/이전 코드 호환 변경 후 UART·LCD·SHT31·SD 및 두 UART 사례 **16개**를 추가 컴파일·링크했습니다. 실물 보드 실행 검증은 아닙니다.
- 모든 113종 부품과 보드/기본 빵판 크기 조절, 114개 검색 미리보기, Dark/White 글자 대비, 시스템 테마, 이동/무제한 캔버스, colorscheme 등록, IDE 편집/빌드/실행, HAL 예제, 회로 편집, Docs, USART2 터미널, 자동 업데이트 회귀 검사를 통과했습니다.
- 새 회귀 검사: `tests/empty-workspace-inline.test.js`, `scripts/empty-workspace-ui.cjs`. UI 검사에는 핀 선택 후 새 프로젝트 생성도 포함됩니다.
- Docs는 main에 넣을 문장만 표시합니다. 기존 MX 초기화 함수가 있으면 보완하고 없으면 main에 초기화 본문을 넣습니다. UART/EXTI Docs는 새 콜백 없이 폴링하며, 기존 별도 HAL 예제 메뉴의 인터럽트 예제는 유지합니다.

---

# 검증 기록 — 0.22.0 공개 릴리스

검증일: 2026-10-15. Windows x64 / Electron 44.2.0 / Monaco 0.57.0.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.22.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38709544798). GitHub latest는 v0.22.0입니다.
- 빌드 커밋과 공개 태그: `3e9b3e40059b6ebf98a2f7f7667d2e1e1db9ba48`. 작성자·커미터·푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.22.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 비인증 다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP으로 갱신했습니다.
- EXE 102,742,609 bytes. SHA-256 `110eeb098c245ec0cca46250d90e005194754dbf039cc3f9aaa73c94a25462a0`.
- ZIP SHA-256 `ee0edc3cb2207ddd3a1d75db455561acec434db43c73f802d050415a7773d958`.
- 증거: `work/test-results/release-0.22.0-proof.json`, `work/test-results/public-022/public-exe-proof.json`.

## 구현과 검사 결과

| 항목 | 확인 결과 |
| --- | --- |
| 화면 테마 | 기본 System, Dark/White 직접 선택, 상단 토글 및 System 복귀. OS 색상 media 변경을 브라우저에서 재현하여 자동 전환/수동 고정/재시작 보존 확인. 실제 Windows 개인 설정은 변경하지 않음 |
| 코드 테마 | Dark 기본 Jellybeans, White 기본 GitHub Light Default 6.3.5. 모드별 코드 테마 선택, 등록/수정/내보내기/재시작과 화면 팔레트 독립 확인. 두 원본 SHA-256 및 MIT 고지 보존 |
| 들여쓰기 | 실제 Monaco 키보드 Tab으로 스페이스 4칸 확인. 모델 전환 시 옵션 적용 및 v1 설정 이전 검사 |
| 기본 보드·빵판 이동 | 실제 몸체 드래그, 장착 부품과 내부 경유점 이동, 외부 배선 끝점·핀 좌표, 한 번의 Undo/Redo, Esc 취소와 재시작 보존 |
| 배선 우클릭 취소 | 바닥과 GPIO에서 우클릭 시 작성 중 경유점/미리보기 제거, 기존 배선 보존, GPIO 설정창을 잘못 열지 않음, 취소 후 새 배선 완성 |
| 배치 공간 | 고정 좌표 상한 제거. 음수/6000 초과 보드·빵판 이동, 2핀·다핀 새 부품 배치, 가운데 버튼 팬, 전체 보기와 저장/재시작. 유한수·부품 수·배선 수 검증 유지 |
| 모델 | 전체 273개 통과. 설정 호환/모드 분리/원본 테마 해시/이동 기하 및 경유점 회귀 검사 포함 |
| 글자 대비 | Dark/White 52상태 HTML 글자/placeholder 대비 4.5:1 미만 0건. 상단 버튼·Pinout 카드/footer·검색·설정·다이얼로그·터미널·1024px 창 포함 |
| 시각 확인 | Dark/White 전체 화면, Pinout 및 작은 창 설정을 캡처 묶음으로 확인. 추가 시각 수정 없이 통과 |
| 기존 기능 | 113종 실제 크기 조절, colorscheme 등록, HAL 카탈로그·Docs·main.c 삽입·배선 로컬 UI 통과. 전체 Windows CI에서 미리보기·IDE/편집/HAL/USART2 UI와 업데이트/패키지 검증 통과 |
| 공개 EXE | 다운로드한 실제 단일 EXE에서 새 테마/이동/우클릭/넓은 배치 검사 전체 및 두 테마 12상태 대비 검사 통과. 격리된 테스트 프로필 사용 |

대비 검사는 HTML UI 대상이며 C/C++ 토큰 원본 팔레트와 장치 SVG 도색은 제외합니다. 코드 테마 변환은 지원 C/C++ TextMate 범위이며 VS Code의 전체 문맥/semanticTokenColors를 복제하지 않습니다. 실제 ARM 보드 디버깅과 이전 공개 버전에서 새 버전으로 자동 다운로드·교체하는 전체 경로를 이번 변경에서 다시 실행하지 않았습니다. CI의 포터블 업데이트 도우미/EXE 교체·롤백 검사는 통과했습니다.

## 별도 미해결 감사 항목

앞서 재현한 저장 트랜잭션 실패, 저장 직후 편집 시 미저장 경고 누락, 새 프로젝트의 터미널 경로, 종료 직전 자동 저장 지연 4건은 이번 요청 범위에 포함하지 않았습니다. `docs/NON-DEVICE-AUDIT.md`에 원인·코드 위치·재현·수정 방향을 보존했습니다.

이 게시 후 기록은 같은 버전의 문서 커밋으로 남기며 공개 태그/자산을 덮어쓰지 않습니다. 0.19.0 이하에서 고정 EXE 이름으로 전환하려면 0.20.0 이상을 한 번 수동 다운로드합니다.


## 0.23.4 지정 UI 제거·단축키·보드 초기화

- 단위/모델 312개 통과. `controls-reset-check.cjs`의 독립 Electron 프로필에서 제거된 UI, Ctrl+F/R, W 실제 배선, Alt+0 크기, 패널 이동/복원, 초기화 취소/Esc/코드 보존/undo/redo/재시작을 검증했다.
- F11의 helper 입력 3, F10 후 doubled=6, Shift+F11 반환 후 counter=7을 확인했다. F6 일시정지와 Shift+F5 정지 및 유휴/모달에서의 잘못된 실행 방지를 검사했다. 같은 단축키로 실제 Windows GCC/GDB 진입/단계 실행/종료도 검사했다.
- 파일 로그: `work/test-results/controls-reset-dev.json`, `controls-reset-unit.log`. UI 상태와 앱 `board.reset`, `debug.command`, `debug.paused` 이벤트를 보존한다.
- 시각 검사: `controls-visual-check.cjs`, Dark/White 1360×900 및 1024×640. 숨김 Electron의 모달 화면 캡처 지연은 headless 브라우저의 동일 화면 검사로 분리했다. 실제 기능 검증은 Electron에서 수행했다.
- 공개 Release/EXE 검증 완료: [0.23.4](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.4), [Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/39013524275). 공개 EXE에서도 9개 기능 검사와 실제 Windows GDB 단계 실행 통과. [보고서](audits/0.23.4-controls/REPORT.md).
- 빌드 커밋 `69ab8d988a347559f7d54f7c30cafcb006ff260f`, EXE SHA-256 `c5117ac8e5c31a560af81847c742d8d5dddcad9cc535abdccb4f10869476d61e`. 5개 배포 자산과 최신 Release 선택 검증.


## 0.23.5 미사용 핀 별칭 제거

- 단위/모델 314개, ARM 컴파일·링크 122개, 독립 Electron 14개 및 공개 EXE 동일 검사 통과.
- 초기화 후 LD2 매크로 제거, Pinout 라벨 보존, LED OFF 0 A → Docs 재적용 ON 약 3.93 mA 확인.
- Windows 전체 CI와 공개 5개 자산·태그 커밋·해시·최신 릴리스 확인. [보고서](audits/0.23.5-pin-aliases/REPORT.md).


## 0.23.6 코드 초기화 전수 정리

- 단위 322개, 초기화 모델/ARM 빌드 128개, 장치 Docs 재적용 동작·회로 보존 114개 통과.
- 개발/공개 EXE에서 초기화 128개와 기본 동작 14개 검사 통과. 로그에 무출력·고장 없음·LED OFF/ON 확인.
- Windows 전체 CI와 공개 5개 자산·버전·커밋·해시·latest 확인. [보고서](audits/0.23.6-minimal-reset/REPORT.md).
