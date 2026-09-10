# 현재 검증 기록 — 0.10.0

2026-09-10, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 변경

부품 14종을 추가해 총 31종, HAL 예제는 14개를 추가해 총 27개다. LDR, NTC, SHT31, MPU6050, PIR, SSD1306 OLED, ST7735 TFT, MAX7219 매트릭스, RC 서보, DC 모터/드라이버, 4상 스테퍼/드라이버, 릴레이, 조이스틱, 로터리 인코더를 제공한다. 각 예제는 전원·신호 배선, Pinout, HAL 코드와 로그를 함께 구성한다.

ADC 분압, I²C 주소·ACK·CRC·측정 시간·레지스터, SPI CS/DC/RST·화면 메모리, PWM 펄스, 릴레이 접점, 인코더 직교 에지를 실제 회로 모델에 연결했다. 환경·축·버튼·인코더 회전은 속성에서 실행 중 조절하며 저장·복원된다. NTC 계산에 필요한 log와 부동소수점 수학 함수의 나눗셈 타입 처리를 보완했다.

## 검증

- 모델 테스트 141개 통과: 기존 120개와 확장 모델 21개. 전원/GND/신호 누락, 주소 충돌, SHT31 CRC/변환 대기, MPU6050 절전·범위·부호·리셋, OLED 메모리 주소, TFT RGB565/리셋, MAX7219 래치, 서보 펄스·속도 한계, DC PWM/방향, 스테퍼 정역순, 릴레이 NO/NC 부하, 조이스틱 ADC 전환, 인코더 양방향 EXTI를 검사했다.
- 새 부품 UI 검사: 31종 검색, 새 14종 예제 컴파일/즉시 회로 적용, 센서 실시간 측정 로그, OLED 픽셀 변화, TFT RGB 정확한 픽셀 값, 매트릭스 점등 개수, 모터/릴레이 표시와 환경 설정 재시작 보존 통과.
- Electron UI 9개 스크립트 통과: ui/editor/parts/features/hal/layout-serial/hal-examples/boards/devices. 레이아웃 검사에서 실제 마우스 입력이 드래그 캡처에 섞이는 문제는 독립 펜 포인터로 검증하도록 수정했다. 앱의 패널 동작은 변경하지 않았다.
- 빌드된 win-unpacked 앱으로 새 부품 UI를 다시 검사했고, 단일 portable EXE의 압축 해제·시작·HAL 로그·UART/IRQ·회로·파형 기능도 통과했다. 렌더러 오류 없음.
- ASAR의 소스·문서 46개를 작업 파일 및 Git 커밋 원문과 대조했다. 패키지 버전, Electron/Chromium 고지 원문, 참고 이미지·테스트·제거한 예제 모듈 제외도 검사했다.

## 배포

- 빌드 소스와 일치하는 커밋: `8d2e8f953f4fd67c0fe4835349cbed4e8c87054b`.
- 로컬 실행 파일: `dist/artifact/STM-Simulator-0.10.0-win-x64.exe` — 100,176,259 bytes.
- EXE SHA-256: `db77a2e8a16296cd7b50f2cd6f92f7f37152e1647f2cc286c8d53ebd251e3ed2`.
- ZIP: `STM-Simulator-0.10.0-Windows-x64.zip` — 102,872,435 bytes.
- ZIP SHA-256: `61027e90819272d233838143e6d397dfc26590b0eb4afd9b4ceeb69f51a85cf2`.
- [GitHub Release v0.10.0](https://github.com/moonsyu/STM-Simulator/releases/tag/v0.10.0), release ID 385976429. ZIP·EXE·SHA256.txt 업로드 후 원격 asset 상태·크기·SHA-256, tag 커밋, latest release, 원격 README 내용까지 대조했다. 저장소는 Private을 유지한다.
- 이전 로컬 실행 파일과 빌드 생성물을 정리했다. 최신 배포 묶음은 사용자 저장소의 dist/artifact에, 검증 결과는 test-results에 보존한다. 테스트용 프로필과 별도 작업 폴더의 중복 EXE/임시 업로드 ZIP은 제거한다.

모델은 지원 HAL API와 명시한 프로토콜/기계 동작 범위의 학습용 구현이다. 토크·권선 전류·부하·탈조, 전체 C ABI/ARM 명령 실행, 미지원 센서·화면 명령은 제공하지 않는다. 범위와 공식 인터페이스 문서 링크는 [HAL API](HAL-API.md)에 정리했다.
