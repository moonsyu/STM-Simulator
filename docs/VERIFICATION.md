# 검증 기록 — 0.20.0 공개 릴리스

검증일: 2026-10-15. Windows x64, Electron 44.2.0, Monaco 0.57.0.

## 게시 결과

- [최신 Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.20.0) · [전체 Windows CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38695514691).
- 빌드 커밋과 공개 태그: `a5f1b2dd9d8939ec96f536d5ad99a4387f1bd8b4`. Git 작성자와 커미터, 푸시 인증 계정은 `moonsyu`입니다.
- `STM-Simulator.exe`, `STM-Simulator-0.20.0-Windows-x64.zip`, `SHA256.txt`, `BUILD-INFO.json`, `update-manifest.json` 다섯 자산을 게시했습니다.
- 공개 주소에서 EXE와 ZIP을 다시 내려받아 크기·SHA-256·ZIP 내부 EXE·두 JSON·빌드 커밋·커밋된 README/HAL/업데이트 문서가 일치함을 확인했습니다. GitHub latest도 v0.20.0입니다.

## 기능 및 빌드 검사

| 검사 | 결과 | 증거 |
| --- | --- | --- |
| 전체 모델 | 269/269 통과. 모든 8개 조절점·45도 회전 단계·독립 축·비율 고정·기존 저장 형식·장착 부품 좌표·잘못된 변경의 원자적 거부 | `work/resize-full-test.log`, 공개 CI |
| 실제 크기 조절 UI | 113개 메뉴 장치를 실제 포인터로 조절. 보드와 기본 빵판, 회전, Undo/Redo, Esc 취소, 키보드, 저장 복원, 1024px 화면 통과 | `work/test-results/resize-ui-check.json`, 공개 CI |
| 기존 UI 회귀 | 외형/설정, 편집기·HAL·장치·IDE, 카탈로그 검색·Docs·main.c 삽입·경유점, USART2 VCP/외부 UART 전체 CI 통과 | 공개 CI |
| Windows 업데이트 도우미 | 업데이트 UI, 저장 후 재시작, 실제 EXE 파일 교체·롤백, 패키지 main과 포터블 EXE의 도우미 검사 통과 | 공개 CI |
| 빌드와 자동 게시 | 고정 파일명으로 Windows 패키징, 산출물 검증 후 main의 새 버전에서 태그/Release 자동 게시 | 공개 CI |
| 공개 EXE 실행 | 다운로드한 실제 0.20.0 포터블 실행. 보드·빵판·LED 가장자리 드래그, 독립 축·배선 유지·Undo/Redo·Esc·재열기 통과 | `work/test-results/portable-smoke.json`, `work/portable-release-020.log` |
| 공개 EXE 기존 기능 | 113개 부품, 핀 검색, LED/거리/LCD, UART/I2C/SPI, DMA, PWM/RC, 부품 없는 USART2 HAL 송수신·Pinout 통과 | 같은 공개 EXE 검사 |

첫 CI에서는 작은 버튼의 조절점이 몸체 이동을 가로채어 게시가 중단됐습니다. 조절 영역에 핀 범위와 화면상 여백을 반영하고 선택 부품의 몸체·핀 클릭 우선순위를 유지하도록 보완했습니다. 실제로 보이는 조절점을 클릭하는 113개 장치 검사와 버튼/LCD 장착·배선 우선순위 검사를 재검증한 최종 커밋만 배포했습니다.

## 최신 배포 파일

- EXE: `outputs/artifact/STM-Simulator.exe` — 102,732,171 bytes.
- EXE SHA-256: `4626235af13c72d57deca21c86cecf939a8ec8570b393013e2038eff4e6ad7bf`.
- ZIP SHA-256: `17ec77a095025debee3cf6d16ad96b0a9372a0c6fa2e759f4269bf47804ffe38`.
- 로컬 `outputs/artifact/`도 검증한 공개 ZIP 내용으로 갱신했습니다. 원본 사진과 테스트 프로필은 배포하지 않습니다.
- 공개 검증 기록: `work/test-results/release-0.20.0-proof.json`. 게시 뒤 이 문서와 HANDOFF만 후속 커밋하며 앱 코드·버전·태그·자산은 변경하지 않습니다.

## 업데이트 전환과 검증 범위

**0.19.0 이하에서는 이번 0.20.0의 `STM-Simulator.exe`를 한 번 직접 다운로드해야 합니다.** 구버전 앱은 버전별 실행 파일명만 조회합니다. 파일 이름만 바꾸어서는 업데이트 코드가 변경되지 않습니다. 새 코드가 고정 파일명을 처리하는 모델/Windows 도우미 검사는 통과했으나, 구버전 공개 EXE에서 0.20.0으로 자동 교체가 성공했다는 의미는 아닙니다. [업데이트 안내](UPDATES.md)를 참고합니다.

과거 공개 v0.17.1 → v0.17.2 성공 기록은 해당 릴리스의 UPDATE-VERIFICATION 자산에 있습니다. v0.17.2 → v0.19.0 시험은 GitHub 비인증 API 한도로 완료하지 못했으며 이전 성공을 이번 버전의 성공 증거로 재사용하지 않습니다.

과거 v0.18.0/v0.19.0의 작성자 정정 전 빌드 SHA와 현재 태그의 대응은 [작성자 정정 기록](GIT-IDENTITY.md)과 [SHA 대응표](commit-identity-map.json)에 보존했습니다. 과거 공개 바이너리를 덮어쓰지 않았습니다.

## 구현 범위

크기 조절은 화면 표시와 접점 좌표에 적용합니다. 회로의 전기적 부품 값은 바꾸지 않습니다. 기존 백분율 입력과 400% 제한을 제거했으며 수치 오류를 막는 양수 배율·프로젝트 좌표 검증은 유지합니다.

[장치 Docs](DEVICE-DOCS.md), [80개 항목 표](DEVICE-CATALOG.md), [HAL API](HAL-API.md)에 시뮬레이션 범위를 명시했습니다. 카메라는 SCCB ID, SD는 초기화/OCR, CAN은 내부 루프백, I2S는 기본 PCM 전송까지입니다. 영상 캡처·SD 파일시스템·외부 CAN 중재·실제 ARM CPU 명령 실행·실물 보드 검증을 완료한 것은 아닙니다. 이번 크기 조절 변경에서 ARM 빌드 전체를 새로 검증했다는 의미도 아닙니다.

STM32 레지스터 예제는 ARM 빌드용이며 main의 HAL/시스템 초기화는 유지합니다. VCP는 USART2의 가상 입력·출력 경로이며 솔더 브리지와 USB 전기적 동작을 재현하지 않습니다.
