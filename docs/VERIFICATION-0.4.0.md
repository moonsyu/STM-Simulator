# STM Emulator 0.4.0 검증 기록

2026-09-06, Windows x64 / Node.js 24.19.0 / Electron 44.2.0.

## 구현 및 검증 범위

- LCD의 4/8비트 쓰기·표시 명령, ASCII와 사용자 문자, 실제 전원·RS/E/RW/데이터 배선 검사.
- UART 터미널·I²C 메모리·SPI 메모리 추가. 총 16종 부품.
- 사용자 함수·배열·구조체·단일 포인터·for/do 반복문·비트 연산, 지연 후 함수 재개, 범위·수명·재귀·실행/메모리 한도.
- Timer, GPIO 에지 인터럽트, ADC/PWM 버퍼 전송 모델.
- 0.1~20 ms RC 계산 간격, 실제 GPIO PWM 전환, 4채널 전압 파형, 기록 한도, CSV 파일 저장.
- 새로운 기능 예제 9개 및 저장 가능한 시뮬레이션 설정.

## 모델 테스트

`npm test`: **53개 통과**.

- 기존 회로·배치·파일·부품·센서: 31개. 추가 부품 카탈로그 크기와 예제 검사를 16종 구성에 맞게 갱신.
- 확장 스케치·타이머·인터럽트·DMA·PWM·메모리 보호: 11개.
- 실제 회로에 연결한 LCD/통신·콜백·PWM/RC·CSV 모델: 11개.

정상 경로뿐 아니라 LCD 전원/Enable/RW 누락, UART 속도·전원 불일치, I²C 주소·전원·버스 단락, SPI CS/전원 누락, 잘못된 배열·const·지역 포인터·재귀·구조체 확장도 확인했습니다.

## 실제 앱 UI

- `scripts/ui-smoke.cjs`: 기존 배선, LED, 버튼, ADC, 무한 루프 중단, 실제 IPC 저장/불러오기 통과.
- `scripts/editor-smoke.cjs`: 구멍 정렬, 회전, 10색 배선, Esc, 다핀 배치, 저장, 검색 통과.
- `scripts/parts-smoke.cjs`: 이전 추가 부품 9종의 실시간 조작 및 음향 그래프·파일 복원 통과.
- `scripts/features-smoke.cjs`: 16종 목록, LCD 문자, UART 왕복 입력, I²C/SPI 읽기, 함수/배열/구조체, DMA 완료, 타이머, 버튼 인터럽트, 4채널 PWM/RC 파형, 실제 CSV 저장, 설정 저장/복원 통과.

스크립트 오류는 없었습니다. 화면과 원시 결과는 Git에서 제외한 `test-results/`에 있습니다. 스피커 청취·타 OS 실행·실제 STM32 보드/펌웨어 동등성을 검증한 것은 아닙니다.

## 배포

- 소스 커밋: [`112497923e7805882b49319d740c2fd4e5ddfc36`](https://github.com/moonsyu/STM-Emulator/commit/112497923e7805882b49319d740c2fd4e5ddfc36).
- [GitHub Actions 실행 34039203704](https://github.com/moonsyu/STM-Emulator/actions/runs/34039203704): **성공**. 모델 테스트·Windows portable 빌드·패키지 내용과 원문 라이선스 비교·Artifact 업로드 완료.
- [다운로드 Artifact 9991195856](https://github.com/moonsyu/STM-Emulator/actions/runs/34039203704/artifacts/9991195856): `STM-Emulator-Windows-x64`, ZIP **102,286,300 bytes**. 검사 당시 만료일 2026-12-05 UTC.
- EXE: `STM-Emulator-0.4.0-win-x64.exe`, **100,139,303 bytes**.
- ZIP SHA-256: `90d1016a6fb446cdd7281455ad5ae8a16d63fad60f7be085e0b569abc1d3e0e6`. GitHub Artifact digest와 일치.
- EXE SHA-256: `36fbad3891f6d828ff913f2a5a06361e332f151beda51d9a8bb0c1c8e79d2f48`. 다운로드 안의 BUILD-INFO.json/SHA256.txt와 일치. 빌드 정보의 버전·소스 커밋·파일 크기도 확인.

GitHub에서 받은 해당 EXE를 `scripts/portable-smoke.cjs`로 별도 프로필에서 직접 실행했습니다. 자체 압축 해제·실행, 400홀, 16종 부품, 선택 핀 강조, LED·HC-SR04, LCD 실시간 문자, UART 왕복 입력, I²C/SPI 메모리 읽기, 확장 문법 예제, ADC DMA 완료, 4채널 PWM/RC 파형이 **모두 통과**했습니다. 페이지 스크립트 오류는 0건입니다.

로컬 기록: `test-results/portable-smoke.json`, `test-results/portable-app.png`, `test-results/portable-waveform.png`. EXE는 `dist/STM-Emulator-0.4.0-win-x64.exe`에 보관했습니다. 이는 이 Windows 환경에서의 검증이며 깨끗한 다른 PC/다른 OS 검증을 뜻하지 않습니다. 저장소 Private 상태도 확인했습니다.

이 배포 결과를 덧붙인 후속 문서 커밋은 `[skip ci]`로 게시합니다. 배포 바이너리의 소스 커밋은 위 `1124979`이며, 문서만 갱신된 저장소 HEAD와 구분합니다.

## 범위

통신은 트랜잭션, 타이머/인터럽트/DMA는 스케치 스케줄러 모델입니다. 정밀 SPICE·C/C++ 전체 호환·STM32 CPU/레지스터·ELF/BIN은 포함하지 않습니다. 실제 지원 API와 각 모델의 생략은 [SKETCH-API.md](SKETCH-API.md)를 기준으로 확인합니다. 이번 버전은 Windows 실습 기능 확장 범위이며 타 OS 배포·코드 서명·자동 업데이트는 완료 항목이 아닙니다.
