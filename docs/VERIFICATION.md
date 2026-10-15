# 현재 검증 기록 — 0.19.0 (로컬 구현)

검증일: 2026-10-15. Windows x64, Electron 44.2.0, Monaco 0.57.0. 0.18.0 보충 게시 및 0.19.0 CI 게시를 진행하며 공개 자산 검증 결과는 완료 후 갱신합니다.

| 검사 | 확인 내용 | 증거 |
| --- | --- | --- |
| 전체 모델 | 260/260 통과. 80항목의 접점·예제, 기존 35종 호환, main.c 삽입/보존, 정상 배선 보존·단락 보완, 저장 복원, 검색, 경유점, 기존 HAL/디버거/업데이트 회귀 검사 | `work/uart-full-test.log`, `tests/catalog.test.js`, `tests/catalog-peripherals.test.js` |
| 추가 통신 모델 | DS18B20 변환·부호·CRC·실시간 온도, DHT 온습도/체크섬, URM09 거리, 전원/신호 단선, CAN 루프백·ID 필터·ACK 오류, I2S 프레임/주파수·정지, OV2640 뱅크 ID 및 XCLK/리셋 실패 | `tests/catalog-peripherals.test.js` |
| 실제 ARM GCC + ST HAL/CMSIS | 조사 80개 HAL 예제와 각각의 main.c 삽입 결과, **160건 컴파일·링크 통과** | `work/test-results/catalog-arm.json`, `work/catalog-arm-final.log` |
| 레지스터 코드 | GPIO·ADC·PWM·UART·SPI·I2C 초기화/동작 대표 18건, 변형 장치·UART 분리 후속 11건 ARM 컴파일·링크 통과 | `work/baremetal-arm.log`, `work/variant-register-arm.log`, `work/test-results/device-docs-arm-followup.json` |
| 실제 Electron UI | 78개 부품 Docs/접점, HAL 검색, 바닥 경유점·Backspace·Undo/Redo, 2핀 설치와 Esc 삭제, MCP4725 main.c 삽입·배선·1.650 V 실행, 저장 복원, TM1637 표시, DS18B20/DHT22 측정, CAN 루프백, 카메라 ID, I2S 1 kHz 프레임 표시 | `work/test-results/catalog-ui.json` |
| 기존 UI 회귀 | 기존 UI 15종 통과 후 HAL·HAL 예제·Docs를 최종 통신 모델로 재검사하여 통과 | `work/ui-current.log`, `work/ui-followup.log`, `work/ui-last.log`, `work/ui-regression-final.log` |
| 외형 검수 | 참고 자료를 바탕으로 작성한 SVG, 보드·빵판 포함 80개 갤러리와 OLED 변형, 장치 Docs/실행 화면 확인. 원본 사진은 URL 참조만 제공 | `work/test-results/catalog-gallery-top.png`, `catalog-gallery-oled.png`, `catalog-docs-main.png`, `catalog-display-run.png` |
| 패키지 정리/접점 후속 검사 | 29/29 통과 | `work/catalog-package-final.log` |

DS18B20과 DHT22를 같은 프로젝트에 순차 적용하여 PA0/PA1, TIM2/TIM5에 배정한 뒤 두 측정값이 출력되는 통합 실행도 확인했습니다.

## 구현 범위

[장치 Docs](DEVICE-DOCS.md)와 [80개 항목 표](DEVICE-CATALOG.md)에 기능별 범위를 기록했습니다. 80개는 조사한 외형·핀 변형 항목이며, 기본 실행 예제를 제공한다는 뜻입니다. 카메라는 SCCB ID 확인까지, SD는 초기화/OCR까지, CAN은 내부 루프백까지입니다. I2S 소리는 측정 주파수의 시험음이며 음악 재생·스피커 전력 모델은 아닙니다. 영상 캡처, SD 파일시스템, 외부 CAN 중재는 구현하지 않았습니다.

레지스터 예제는 추가되는 GPIO·주변장치 초기화/동작을 CMSIS로 수행하지만 기존 main의 HAL/시스템 클록 초기화는 유지합니다. 실제 ARM CPU의 명령 실행과 실물 보드 검증은 포함하지 않습니다.

## USART2 내장 터미널 후속 검사

- 기본 UART 예제의 부품·배선 0개, HAL 초기화 전 입력 거절, 초기화 후 TX/RX·인터럽트 에코, 외부 장치의 전원·단선·baud 검사, 다른 UART 포트 분리를 확인했습니다. `tests/uart-vcp.test.js`와 전체 모델 260/260 통과.
- 내장/외부 경로 전환, 외부 부품 누락과 baud 불일치 거절, 6핀 변형 에코 및 기본 예제 복원: `work/test-results/uart-vcp-ui.json`.
- 실제 ARM 컴파일·링크 12건: 기본/외부 UART main.c 2개, UART 및 4/6핀 변형의 HAL/레지스터 예제 9개, 두 UART 인스턴스 1개. `work/uart-arm.log`.

## 게시 준비

최신 USART2 수정 전의 로컬 EXE 검증 기록은 공개 빌드 증거로 사용하지 않습니다. 게시된 0.19.0 EXE·ZIP·매니페스트의 버전/커밋/해시를 확인한 뒤 이 구역에 기록합니다.

## 이전 로컬 실행 검사 (USART2 수정 전)

- 실행 파일: `outputs/artifact/STM-Simulator-0.19.0-win-x64.exe` (102,727,699 bytes).
- SHA-256: `1491b0b39ac53f864c594ec699ca1f7edf123d953e1c395081532d557fbf670b`.
- `prepare-artifact.cjs`: 패키지의 모든 src 파일과 현재 소스의 바이트 일치, 버전·아이콘·라이선스·문서·EXE 형식 검사 통과. 아직 커밋하지 않은 로컬 빌드이므로 BUILD-INFO의 commit은 null입니다.
- 패키지 앱(`work/build/win-unpacked/STM Simulator.exe`)에서 카탈로그 UI 전체 검사 통과. `catalog-ui.json`의 version=0.19.0, packaged=true를 확인했습니다.
- **단일 포터블 EXE 실행 검사 통과**: 압축 해제·시작·편집기, 핀 검색, LED/거리/LCD, UART/I2C/SPI, DMA, PWM/RC 및 HAL UART 인터럽트. 증거: `work/test-results/portable-smoke.json`, `work/portable-final.log`.
- `git diff --check` 통과. GitHub 업로드 및 0.19.0 공개 자동 업데이트 시험은 수행하지 않았습니다.
- 테스트용 `catalog-ui-*` 임시 프로필 일괄 삭제는 자동 승인 검토에서 차단되어 남겨뒀습니다. 저장소 추적 대상이 아니며 실제 사용자 프로필은 사용하지 않았습니다.
