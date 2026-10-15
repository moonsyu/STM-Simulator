# 검증 기록 — 0.21.2 공개 릴리스

검증일: 2026-10-15. Windows x64 / Electron 44.2.0 / Monaco 0.57.0.

## 게시와 공개 실행 파일

- [Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.2) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38705485223). GitHub latest는 v0.21.2입니다.
- 빌드 커밋과 공개 태그: `a932f0595854d8e22d53dfe069a5ea25d744b4e9`. Git 작성자·커미터와 푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.21.2-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP 재다운로드 후 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그/빌드 커밋·커밋된 README/HAL/업데이트 문서를 대조했습니다. 로컬 `outputs/artifact/`도 같은 공개 ZIP 내용으로 갱신했습니다.
- EXE 102,734,393 bytes. SHA-256 `61852a631c5afa741d1e4de864c5005330f26c4d806ec6c050810d7adb666863`.
- ZIP SHA-256 `da2c88e4d1fe85b3a1662120552dc2e2be9da39bf4bac0090193d32e4bfa3de2`.
- 증거: `work/test-results/release-0.21.2-proof.json`, `work/test-results/public-contrast.json`.

## 사용자 제보와 수정

상단 `회로 파일 열기` hover, Pinout 핀 카드와 하단 고정 바가 밝은 글자/밝은 배경을 혼용했습니다. 앞선 0.21.0 기능 감사에서는 해당 화면 상태를 놓쳤습니다. 테마 글자색만 덮고 기존 고정 배경을 남긴 것과 일부 고정 글자색을 누락한 것이 원인입니다.

Pinout·상단 hover 외에도 찾기/바꾸기, 터미널 버튼과 입력, 보드 선택, 검색 안내/placeholder, 도움말, 디버그 상태/라벨을 보완했습니다. 비활성 컨트롤은 전체 투명도 대신 읽을 수 있는 보조 글자색과 점선 테두리를 사용합니다. 비활성 동작, Jellybeans 원본 파일, Monaco 소스 색상, 장치 모형은 유지합니다.

0.21.1 공개 EXE 최종 검사에서 부품 hover 설명의 대비 4.31:1을 추가 발견했습니다. 0.21.2에서 기존 ID 선택자 그룹의 우선순위를 고려해 부품/보드 카드와 핀 검색의 강조 보조 글자를 보완했습니다. 확대 미리보기·키보드 초점·부품 배치 모드·보드/핀 검색 상태까지 검사에 추가했습니다.

## 검사 결과

| 검사 | 확인 결과 |
| --- | --- |
| 로컬 UI 대비 | Jellybeans/STM Light 총 52개 화면 상태 통과. UI 텍스트/placeholder의 계산된 대비 4.5:1 미만 0건. 활성/선택/hover/비활성 컨트롤, Pinout/footer, 검색, 빌드 오류, 설정/도움말/업데이트/보드 선택 및 1024px 창 포함 |
| 시각 확인 | 사용자 제보와 같은 상단 hover·Pinout 카드/footer, 어두운/밝은 테마와 작은 창을 캡처하여 확인. 보완 후 확인 1회. `work/test-results/contrast-*.png` |
| 기존 설정 | 로컬 외형/설정 UI와 colorscheme 등록 검사 통과. 코드 테마의 원본 출처·구문 팔레트 변경 없음 |
| 전체 Windows CI | 모델 269개, 장치 크기 조절, 113종 미리보기, 새 52상태 대비 검사, IDE/편집/HAL/카탈로그/main.c 삽입/배선/USART2 UI 모두 통과 |
| 업데이트와 패키징 | 실제 EXE 교체/롤백, 패키지/포터블 업데이트 도우미, Windows 포터블 빌드와 게시 통과 |
| 공개 EXE | 다운로드한 실제 0.21.2에서 두 테마의 상단 hover·Pinout 활성/선택/footer·설정·터미널·보드/핀 검색 강조·부품 미리보기/초점/배치 28상태 대비 검사 통과 |

대비 검사는 HTML UI 대상입니다. 사용자 지정 colorscheme의 의도적인 C/C++ 토큰 팔레트와 장치 SVG 내부 도색은 포함하지 않습니다. 이번 변경에서 실제 보드 접속/OpenOCD 디버깅이나 이전 공개 버전에서 GitHub 자동 다운로드·교체까지의 전체 경로를 다시 실행하지 않았습니다.

## 남아 있는 별도 문제

0.21.0 감사에서 재현한 저장 트랜잭션 실패, 저장 직후 편집 시 미저장 경고 누락, 새 프로젝트의 터미널 경로, 종료 직전 자동 저장 지연 4건은 이번에 수정하지 않았습니다. 원인·코드 위치·재현·수정 방향은 `docs/NON-DEVICE-AUDIT.md`, 재현 스크립트는 `scripts/audits/non-device-repro.cjs`입니다. UI 대비 수정으로 이 네 기능 결함이 해결됐다고 보고하지 않습니다.

이 문서와 HANDOFF의 게시 후 기록은 같은 버전의 문서 커밋으로 남기며 공개 태그/자산을 덮어쓰지 않습니다. 0.19.0 이하에서 고정 EXE 이름으로 전환하려면 0.20.0 이상을 한 번 수동 다운로드합니다.
