# 검증 기록 — 0.19.0 공개 릴리스

검증일: 2026-10-15. Windows x64, Electron 44.2.0, Monaco 0.57.0.

2026-10-15 Git 작성자 정정으로 배포 태그의 커밋 SHA가 변경됐습니다. 아래 빌드 커밋은 공개 EXE를 만든 당시 SHA이며, 현재 태그의 SHA와 파일 트리가 동일합니다. [작성자 정정 기록](GIT-IDENTITY.md)과 [SHA 대응표](commit-identity-map.json)를 함께 확인합니다. 실행 파일과 체크섬은 그대로 유지합니다.

## 게시 결과

| 버전 | 빌드 커밋 | CI 및 공개 릴리스 |
| --- | --- | --- |
| 0.18.0 | `5ff4872f0e90f68c2422ea1bb2869ea40371a266` | [태그 CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38666607669) · [누락 릴리스 보충 게시](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.18.0) |
| 0.19.0 | `23708264e9c77671630466b3abb1d0f4b0f996e5` | [main CI](https://github.com/moonsyu/STM-Simulator/actions/runs/38667438539) · [최신 Release](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.19.0) |

두 버전 모두 EXE·ZIP·SHA256.txt·BUILD-INFO.json·update-manifest.json을 게시했습니다. 공개 다운로드 주소에서 EXE와 ZIP을 다시 내려받아 크기·해시·ZIP 내부 파일·빌드 커밋·커밋된 문서 일치를 확인했습니다. `work/test-results/release-0.18.0-proof.json`, `release-0.19.0-proof.json`에 기록했습니다.

0.16.0은 과거 CI에 실패하고 0.16.1로 대체된 개발 태그이므로 실패 산출물을 신규 Release로 게시하지 않았습니다.

## 기능 및 빌드 검사

| 검사 | 결과 | 증거 |
| --- | --- | --- |
| 전체 모델 | 260/260 통과: 80개 조사 항목, 기존 35종 호환, main.c 삽입·보존, 배선 보완, 검색·경유점, HAL·디버거·업데이트 회귀 | `work/uart-full-test.log`, 공개 CI |
| 카탈로그 ARM 빌드 | 카탈로그 구현 시 원본 HAL 80개와 main.c 삽입 결과 80개, 총 160건 컴파일·링크 통과 | `work/test-results/catalog-arm.json` |
| UART 후속 ARM 빌드 | 기본/외부 UART main.c 2개, UART 및 4/6핀 장치 HAL·레지스터 9개, UART 두 인스턴스 1개: 총 12건 통과 | `work/uart-arm.log`, `work/test-results/device-docs-arm-followup.json` |
| 실제 UI | 기존 UI 전체, 78개 장치 Docs·접점, 검색, main.c 직접 삽입, 바닥 경유점, 센서/화면/구동, 저장 복원 통과 | 공개 CI, `work/release-ui-followup.log`, `work/uart-ui-regression.log` |
| USART2 VCP | 별도 부품·배선 없이 HAL 초기화와 인터럽트 에코. 외부 경로의 부품 누락·전원·TX/RX·baud 검사, 4/6핀 변형, 다른 포트 분리 통과 | `tests/uart-vcp.test.js`, `work/test-results/uart-vcp-ui.json`, 공개 CI |
| 공개 단일 EXE | 실제 공개 파일 압축 해제·실행, 0.19.0 버전, 부품/배선 0개의 USART2 송수신, LED/거리/LCD, UART/I2C/SPI, DMA, PWM/RC, Pinout 통과 | `work/test-results/portable-smoke.json`, `work/portable-release-019.log` |
| 자동 게시 | 새 package 버전으로 main 푸시 → 전체 검사·빌드 → 태그 및 Release 자동 생성 성공 | 위 0.19.0 main CI의 release 작업 |

CI 첫 시도는 예제 수의 고정 기대값 때문에 실패했습니다. 120개 예제와 선택 안내 항목을 실제 HAL 목록에 맞춰 검사하도록 수정한 뒤 전체 CI가 통과했습니다. 앱 소스는 최초 0.19.0 기능 커밋과 같습니다.

## 자동 업데이트 검증의 구분

CI에서는 업데이트 UI·저장 후 재시작, 실제 Windows 파일 잠금 해제·교체·롤백, 패키지/포터블 EXE의 업데이트 도우미 검사가 통과했습니다.

**공개 0.17.2 → 0.19.0 전체 업데이트 시험은 완료하지 못했습니다.** 원본 공개 0.17.2 EXE의 자동 스케줄러를 실행했지만 검증 PC의 GitHub 비인증 API 한도 60회가 소진되어 요청 한도 오류를 표시했습니다. 다운로드·교체·재시작·작업 보존까지 이번 공개 경로에서 통과했다고 주장하지 않습니다. 증거는 `work/release-update-019.log`와 `work/test-results/release-update-019.json`입니다. 당시 API 응답의 한도 초기화 시각은 2026-10-15 02:32:53 UTC였습니다.

이전 버전의 성공한 공개 업데이트 기록을 이번 버전의 성공 증거로 재사용하지 않습니다. 공개 EXE 직접 다운로드 및 실행 검사는 위와 같이 별도로 통과했습니다.

## 최신 파일

- EXE: `outputs/artifact/STM-Simulator-0.19.0-win-x64.exe` — 102,728,271 bytes.
- EXE SHA-256: `35bc530857105f76c77496630df30b2298c71b581fa44d78ff5fe8fff7ece775`.
- ZIP SHA-256: `dd7bffd5ab50017ee7ac6e6951f7e1e5fbf4da2c5049af9551232b1fa84541dc`.
- 빌드 커밋: `23708264e9c77671630466b3abb1d0f4b0f996e5`.
- 로컬 `outputs/artifact/`도 공개 ZIP의 내용으로 갱신했습니다. 원본 사진이나 테스트 프로필은 배포하지 않습니다.
- 게시 뒤 검증 기록만 후속 커밋하며 앱 코드·패키지 버전·공개 태그·배포 자산을 변경하지 않습니다.

## 구현 범위

[장치 Docs](DEVICE-DOCS.md), [80개 항목 표](DEVICE-CATALOG.md), [HAL API](HAL-API.md)에 범위를 명시했습니다. 80개는 외형·핀 변형을 구분한 조사 항목입니다. 카메라는 SCCB ID, SD는 초기화/OCR, CAN은 내부 루프백, I2S는 기본 PCM 전송까지입니다. 영상 캡처·SD 파일시스템·외부 CAN 중재·실제 ARM CPU 명령 실행·실물 보드 검증을 완료한 것은 아닙니다.

STM32 레지스터 예제는 ARM 빌드용이며 main의 HAL/시스템 초기화는 유지합니다. VCP는 USART2의 가상 입력·출력 경로이며 솔더 브리지와 USB 전기적 동작을 재현하지 않습니다.
