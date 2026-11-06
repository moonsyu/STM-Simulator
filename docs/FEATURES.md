# 구현할 기능 목록

구현해야 하는 기능을 적어 두고, 옆에 구현 상태를 적는다. 구현 계획은 기능마다 다른 파일에 쓰고, 그 위치를 **구현 계획** 칸에 적는다. 진행 기록과 검증은 [작업 로그](WORKLOG.md)에 둔다.

상태: `미착수` · `계획` · `진행 중` · `완료 (버전)` · `보류`

| # | 기능 | 상태 | 구현 계획 | 비고 |
|---|---|---|---|---|
| 1 | ADC 연속 변환: Pinout 설정, 생성 코드, 실행 중 값 반영 | 완료 (1.21.0) | [docs/ADC-CONTINUOUS-PLAN.md](ADC-CONTINUOUS-PLAN.md) |  |
| 2 | FPB-RA6E1(Renesas) 보드 추가 | 진행 중 | [docs/RA6E1-PLAN.md](RA6E1-PLAN.md) | 완료 (1.20.0): 1·2단계(FSP 설치·빌드, RA6E1 에뮬레이터, 보드·핀·그림). 완료 (1.22.0): 3단계 주변장치(SCI UART·GPT·AGT·ADC12·IIC), 4단계 Pins·Clocks·Stacks 설정과 예제 7개. 완료 (1.23.0): 5단계 FSP 정의 이동·자동완성, 6단계 앱 쪽(J-Link 기록·디버그). 남음: 6단계 실물 확인(SEGGER J-Link 소프트웨어 설치 필요) |
| 3 | CubeMX와 다른 점 메우기 | 진행 중 | [docs/CUBEMX-GAPS.md](CUBEMX-GAPS.md) | 완료 (1.21.0): ADC Continuous Conversion. 완료 (1.23.0): USART·SPI Parameter Settings. 남음: 클록 트리, TIM 채널별 설정·Output Compare, TIM6/7·RTC·DAC 등(목록 순서) |
| 4 |  |  |  |  |
| 5 |  |  |  |  |
