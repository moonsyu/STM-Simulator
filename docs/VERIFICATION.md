# 현재 검증 기록 — 0.18.0 (로컬 구현)

검증일: 2026-10-14. Windows x64, Electron 44.2.0, Monaco 0.57.0. 최신 공개 릴리스는 v0.17.2이며 0.18.0은 아직 게시하지 않았다.

| 검사 | 확인 내용 | 증거 |
| --- | --- | --- |
| HAL 및 장치 Docs 모델 | 35종 전체 예제 결합/실행, LCD 실제 문자, RGB 채널/7세그먼트, 기존 소스/정상 배선 보존, 누락·오접속 보완, 재적용, ADC·타이머·UART 분리, 주소 충돌 거부 | tests/device-docs.test.js, tests/basic-hal-examples.test.js |
| ARM GCC + 실제 ST HAL/CMSIS | 35종의 HAL·레지스터 예제 총 118개 컴파일·링크 통과. UART 분리 등 후속 10개 추가 통과 | work/test-results/device-docs-arm.json, device-docs-arm-followup.json |
| 장치 Docs 실제 UI | 35종 Docs, 코드 결합·자동 배선·시뮬레이션, ARM 대상 전환, Ctrl+Z와 파일 이동·재시작 보존 통과 | work/test-results/device-docs-smoke.json |
| Colorscheme 실제 UI | 원본 Vim·Monaco·VS Code 등록, 실제 편집기 색상/이탤릭체, 전환·내보내기·재시작·잘못된 파일 거부 통과 | work/test-results/colorscheme-smoke.json |
| 원본 보존 | Jellybeans ef83bf4, SHA-256 791e387b998fecb14169601ee4e925b8d0991da6a235d2a4ef4c2b3225c58f8c; 원본 MIT 헤더 보존 | src/themes/jellybeans/source.json |

전체 모델 **235/235 통과**, 기존 Electron UI **15개 스크립트 통과**. 새 Colorscheme/Docs UI 2종도 통과했다. 최종 패키지 확인은 빌드 후 갱신한다.

Bare-metal은 초기화를 HAL에 맡기는 레지스터 학습 코드이며 전체 장치의 HAL 없는 드라이버를 의미하지 않는다. SPI/I2C 레지스터 항목은 상태 관찰 예제다. 실물 보드 실행은 검사하지 않았다. 가상 ARM CPU 펌웨어 실행은 포함하지 않는다.

기존 공개 v0.17.1 → v0.17.2 자동 업데이트의 감지·다운로드·교체·재실행 증거는 [공개 검증 문서](https://github.com/moonsyu/STM-Simulator/releases/download/v0.17.2/UPDATE-VERIFICATION.md)에 있다. 이번 변경은 업데이트 코드에 손대지 않았다.
