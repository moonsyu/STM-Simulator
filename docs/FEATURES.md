# 구현할 기능 목록

구현해야 하는 기능을 적어 두고, 옆에 구현 상태를 적는다. 구현 계획은 기능마다 다른 파일에 쓰고, 그 위치를 **구현 계획** 칸에 적는다. 진행 기록과 검증은 [작업 로그](WORKLOG.md)에 둔다.

상태: `미착수` · `계획` · `진행 중` · `완료 (버전)` · `보류`

| # | 기능 | 상태 | 구현 계획 | 비고 |
|---|---|---|---|---|
| 1 | ADC 연속 변환: Pinout 설정, 생성 코드, 실행 중 값 반영 | 완료 (1.21.0) | [docs/ADC-CONTINUOUS-PLAN.md](ADC-CONTINUOUS-PLAN.md) |  |
| 2 | FPB-RA6E1(Renesas) 보드 추가 | 진행 중 | [docs/RA6E1-PLAN.md](RA6E1-PLAN.md) | 완료 (1.20.0): 1·2단계(FSP 설치·빌드, RA6E1 에뮬레이터, 보드·핀·그림). 완료 (1.22.0): 3단계 주변장치(SCI UART·GPT·AGT·ADC12·IIC), 4단계 Pins·Clocks·Stacks 설정과 예제 7개. 완료 (1.23.0): 5단계 FSP 정의 이동·자동완성, 6단계 앱 쪽(J-Link 기록·디버그). 남음: 6단계 실물 확인(SEGGER J-Link 소프트웨어 설치 필요) |
| 3 | CubeMX와 다른 점 메우기 | 진행 중 | [docs/CUBEMX-GAPS.md](CUBEMX-GAPS.md) | 완료 (1.21.0): ADC Continuous Conversion. 완료 (1.23.0): USART·SPI Parameter Settings. 완료 (1.24.0): TIM PWM 채널별 Pulse·극성·PWM mode, I2C1 주소·Duty·No Stretch. 남음: 클록 트리(ADC Prescaler 포함), ADC1 Sampling Time 선택(지금 F103 239.5·F446 480 Cycles 고정), TIM Output Compare·Counter mode, TIM6/7·RTC·DAC 등(목록 순서) |
| 4 | CubeIDE의 printf 실수 출력 설정(Use float with printf from newlib-nano, `-u _printf_float`) | 미착수 | (작성 전) | 2026-11-06 실물 안내문 대조. 지금은 ARM GCC 빌드(시뮬레이터·실물 모두)가 `-u _printf_float`를 늘 넣고(`native-build.cjs` linkFlags), 해석기도 `%f`를 늘 출력한다. CubeIDE 새 프로젝트는 이 칸이 꺼져 있어 `printf("%.2f")`가 빈칸으로 나온다. 그래서 시뮬레이터에서 되던 코드가 실물에서 안 된다. 할 일: 프로젝트 설정(MCU/MPU Settings)에 CubeIDE와 같은 이름·기본값의 선택 칸을 두고 두 빌드와 해석기에 적용한다. 꺼진 채 `%f`를 쓰면 출력 탭에 한 번 안내한다 |
| 5 | STM32 핀 과전압 경고(3.3 V 초과 입력, 5 V 비허용 핀) | 미착수 | (작성 전) | 2026-11-06 실물 안내문 대조("입력 전압이 3.3 V를 넘으면 안 됨, 5 V에 연결하면 핀 손상"). 지금은 ADC 입력을 0~3.3 V로 조용히 자르고(`emu/stm32f446/adc.js` `convert`), GPIO·ADC 핀에 VDD를 넘는 전압이 걸려도 경고가 없다(Raspberry Pi 핀 안내에만 "3.3 V 전용"). 할 일: 핀 종류별 한계(FT 5 V 허용, TT·아날로그 핀은 VDD + 0.3 V)를 회로 해석 경고로 내고, 실행 중이면 출력 탭에 표시한다 |
| 6 | CubeIDE에서 생기는 인터럽트 핸들러 중복 정의 안내 | 미착수 | (작성 전) | 2026-11-06 실물 안내문 대조("stm32f1xx_it.c에 ADC1_2_IRQHandler가 있으면 main.c의 것을 지움"). 앱은 main.c에 쓴 핸들러를 it.c에서 빼고 빌드한다(`build-environment.js`). 그래서 Pinout NVIC를 켠 채 main.c에 `ADC1_2_IRQHandler` 등을 써도 시뮬레이터에서는 되지만, CubeIDE 코드 생성 뒤에는 multiple definition 링크 오류가 난다. 할 일: NVIC가 켜진 인터럽트의 핸들러를 main.c에 직접 쓰면 문제 탭에 "CubeIDE에서는 it.c와 중복"이라고 알리고, HAL 콜백(`HAL_ADC_ConvCpltCallback` 등)을 쓰라고 안내한다 |
