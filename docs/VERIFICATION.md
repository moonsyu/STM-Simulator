# 현재 검증 기록 — 0.12.1 (수동 부저 추가)

2026-09-29, Windows x64, Node.js 24.18.0, Electron 44.2.0, Playwright 1.58.2.

## 변경

- 수동 피에조 부저(`passive_buzzer`)를 별도 2핀 부품으로 추가했다. 실제 단자 전압의 반복 전이에서 20~2000 Hz 주파수와 듀티를 측정한다.
- DC, 듀티 0%·100%, 평균 전압 PWM에서는 지속음이 나지 않는다. 배선 단절과 출력 중단 시 무음으로 전환한다.
- 부저별 Web Audio 음원으로 독립 음높이를 출력한다. 소리 버튼·시뮬레이션 정지·한 단계 실행은 음향 출력을 제어한다.
- HAL 수동 부저 PWM 멜로디 예제는 PA0(TIM2 CH1)–부저–GND 배선, 1 MHz 타이머, 50% 듀티, 도레미파솔라시도와 쉼표를 설정한다.
- 부품은 32종, HAL 예제는 31개다. 기존 카탈로그 개수 검사도 갱신했다.

## 검증 범위 및 결과

사용자 요청에 따라 기능 테스트는 수동 부저에 한정했다. 다른 부품의 전체 회귀 테스트는 실행하지 않았다.

- `npm run test:passive-buzzer`: 9개 통과. 검색·단자·저장 형식, 8개 음과 쉼표·반복, PWM 주파수·듀티·시간 간격, DC/고립 회로 무음, 단절·복구·역방향·낮은 전압, GPIO 전이, 타이머 정지·재시작, 잘못된 전이·회로 오류 초기화, 독립 부저, 음소거·정지·음원 제거를 확인했다.
- `npm run test:passive-buzzer:ui`: Electron에서 통과. 부품 검색·배치, 예제 회로·코드 검사, 주파수·듀티 표시, Web Audio 523/587 Hz 출력, 음소거·정지·한 단계 실행, DC 무음, 자동 저장 후 복원을 확인했다.
- 배포 EXE를 `LAB_PORTABLE_EXE`로 지정해 같은 수동 부저 전용 UI·음향 검사를 통과했다. 실제 portable 추출·실행과 패키징된 기능을 확인했다.
- 앞선 브라우저 렌더러 검사도 통과했다. 실제 스피커 청취나 실물 STM32 보드 실행·ARM 컴파일은 수행하지 않았다.
- 증거: `work/test-results/passive-buzzer-portable-smoke.json`, `passive-buzzer-portable-running.png`.

## 빌드

- `npm ci`, Electron 런타임 설치, `npm run build`, `npm run build:artifact` 통과.
- EXE: `outputs/artifact/STM-Simulator-0.12.1-win-x64.exe` — 101,631,200 bytes.
- EXE SHA-256: `4889a258f945ca1f3025448c414363e1c85dbe6caa1f6ff061e2dca18917528d`.
- 배포 검사에서 수동 부저 3개 모듈이 소스와 같은지, EXE 형식·아이콘·라이선스와 패키지 포함 파일이 올바른지 확인했다.
- 이번 작업은 기존 버전 번호로 빌드·Git 푸시하며 기존 GitHub Release 자산은 교체하지 않는다.

## 원격 빌드

Windows CI는 기본적으로 전체 테스트를 실행한다. 이번 푸시는 커밋 메시지의 `[test:passive-buzzer]`로 수동 부저 전용 테스트만 실행하며 EXE 빌드·패키지 검증·아티팩트 업로드는 유지한다. 수동 실행에서도 `test_scope=passive-buzzer`를 선택할 수 있다. 원격 실행 결과는 해당 커밋의 GitHub Actions와 `work/test-results/ci-proof.json`에서 확인한다.

앱은 지원 HAL API를 실행하는 소스 해석 모델이다. 상세 범위는 [HAL API](HAL-API.md)를 따른다.
