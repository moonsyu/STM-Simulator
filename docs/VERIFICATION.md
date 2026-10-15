# 검증 기록 — 0.21.0 공개 릴리스

검증일: 2026-10-15. Windows x64 / Electron 44.2.0 / Monaco 0.57.0.

## 게시와 실행 파일

- [공개 Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.21.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38700043749). GitHub latest는 v0.21.0입니다.
- 빌드 커밋/공개 태그: `835ba6c7897f314fac2804aca51735a248dffeb4`. Git 작성자·커미터 및 푸시/검증 인증은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.21.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 EXE/ZIP을 재다운로드하여 크기·SHA-256·ZIP 내부 EXE·두 JSON·태그 커밋·커밋된 README/HAL/업데이트 문서와 대조했습니다. 로컬 `outputs/artifact/`도 검증한 공개 ZIP 내용으로 갱신했습니다.
- EXE: 102,732,432 bytes / SHA-256 `8b7d123965d0f87b3ef08a722f58f58544ad3ecb4b3c0b517401385e328dd9c1`.
- ZIP SHA-256: `a3b2fb188a06951cacf46d63c73c07d9b827645f4f6c6ec3d5f25d220056da8b`.
- 공개 증거: `work/test-results/release-0.21.0-proof.json`. 실제 공개 EXE 증거: `work/test-results/portable-smoke.json`.

## 완료한 검사

| 검사 | 결과 |
| --- | --- |
| 모델 | 로컬 및 전체 Windows CI 269/269 통과 |
| 새 부품 미리보기 | 113종 전수 SVG decode·작은/확대 이미지 일치·회로 선택자 격리·hover로 부품 추가 없음·검색·실행 중 미리보기·키보드/Esc·좁은 창·밝은/어두운 테마 통과 |
| 공개 EXE 미리보기 | 실제 다운로드한 포터블 EXE에서 113종 전수 미리보기와 Esc 시 회로 유지 통과 |
| 기존 크기 조절/회로 UI | CI의 113종 가장자리 조절, 기본 표면, 기존 IDE/HAL/카탈로그/UART 검사 통과 |
| 공개 EXE 기존 동작 | 보드·빵판·LED 크기 조절, 독립 축·Undo/Redo·재열기·핀 검색, LED/LCD/거리/UART/I2C/SPI/DMA/PWM/RC와 부품 없는 USART2 송수신 통과 |
| 로컬 실제 개발 도구 | GCC/C++ 빌드와 실행, GDB 중단점·스텝·watch·메모리·레지스터, clangd hover/definition·오류, ARM GCC+ST HAL/CMSIS 링크, 빌드 취소/실패 후 산출물 차단 통과 |
| 로컬 IDE/설정 | 프로젝트 생성·정상 파일 저장·파일 이름 변경·검색/바꾸기·시뮬레이터 디버깅·패널 배치/복원·colorscheme 파일 등록 통과 |
| 업데이트 | 업데이트 UI·저장 후 재시작, Windows 실제 EXE 교체/롤백 및 패키지/포터블 도우미 CI 통과 |

시각 확인은 데스크톱/좁은 창을 묶어서 확인하고, 핀 수 중복 문구를 정리한 뒤 어두운/밝은 테마를 한 번 더 확인했습니다. 정적 디자인 검사에서 숨겨진 초기 img의 src 부재 경고 1건은 표시 전 실제 src 할당 및 113종 decode 검사로 오탐임을 확인했습니다.

## 재현했지만 이번에는 수정하지 않은 문제

`docs/NON-DEVICE-AUDIT.md`와 `scripts/audits/non-device-repro.cjs`에 원인·코드 위치·재현·후속 수정 조건을 보관했습니다. 코드 위치는 사용자 응답에 나열하지 않습니다.

1. P1: 파일 교체 실패 시 프로젝트 파일 일부만 저장되고 재시도도 차단됩니다. 독립 프로젝트에서 EACCES 1회 주입으로 확인했습니다.
2. P1: 저장 직후 1초 이내 다시 편집하면 미저장 경고 없이 새 프로젝트로 전환되어 수정 내용이 사라질 수 있습니다.
3. P2: 새 미저장 프로젝트의 터미널이 이전 프로젝트 폴더에서 시작합니다. 첫 cmd 출력의 한국어 경로 깨짐도 부가 기록했습니다.
4. P2: 마지막 입력 직후 약 200ms 이내 정상 창 닫기를 하면 마지막 자동 저장 전 상태가 복원됩니다.

성공 경로 검사 통과가 위 경계 조건의 해결을 의미하지 않습니다. 감사 스크립트는 결함이 재현되는지를 검증하므로 CI 정상 회귀 검사에 포함하지 않았습니다.

실제 STM32 보드 연결/OpenOCD 디버깅은 이번에 실행하지 않았습니다. GitHub 공개 이전 버전에서 최신 버전으로 자동 다운로드·교체하는 전체 경로도 이번에 새로 실행하지 않았으며, 공개 자산 무결성 및 업데이트 도우미/롤백 검사와 구분합니다. 0.19.0 이하에서 고정 EXE 이름으로 전환하려면 0.20.0 이상을 한 번 수동 다운로드해야 합니다. 실제 ARM 펌웨어의 회로 내 CPU 실행은 기존 미지원 범위입니다.
