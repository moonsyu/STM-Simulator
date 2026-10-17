# 0.23.3 기존 HAL 예제·Docs·코드 초기화 검증

상태: 공개 Release EXE 검증 완료.

## 수정 내용

- Docs 미리보기를 실제 배정 GPIO·타이머·I²C 주소·클록 값에 맞춤. 원본의 낡은 핀 설명 주석은 미리보기에 포함하지 않음.
- 복합 GPIO 비트 마스크와 동적 스테퍼 위상 마스크를 여러 포트에 맞게 변환. 마스크·출력 식은 한 번만 평가하며 0인 포트 마스크는 호출하지 않음.
- main 폴링으로 바꾼 입력 예제의 최초 상태를 가짜 이벤트로 보고하지 않고 RISING/FALLING/CHANGE 조건을 지킴. PIR·엔코더 설명 보완.
- 코드 초기화: main만 기본 코드로 교체. 회로·배선·핀 설정·보조 파일 유지, 취소/Esc/되돌리기/재적용 지원, 실행 중 사용 제한, 진단 로그 저장.

## 검증 결과

| 검사 | 결과 |
|---|---|
| 기존 HAL 원본 예제 | 40/40 실제 실행·출력 판정 |
| 기존 장치 + 보드 Docs | 36/36 전체 예제·입력 반응·손상 배선 복구 실행 |
| 기존 Docs 개별 HAL 카드 | 308/308 적용 후 선택 API 호출·반환 확인 |
| 선 하나씩 제거·복구 | 204개 연결/분리 검사 |
| 다른 포트에 재배선 | 스테퍼 정·역회전, L298N 양방향 회전 통과 |
| ARM GCC + ST HAL/CMSIS | 원본 40 + 초기화 4 + 재배선 2 = 46개 링크 |
| 코드 초기화 앱 로그 | 12개 확인, LED OFF 0 A → 재적용 ON 약 3.93 mA |
| 공개 EXE | 36개 Docs + 초기화·재배선 앱 로그 대조 통과 |

공개 EXE는 36개 장치의 출력 값도 대조했다. 버튼 누름/해제와 RGB 모든 채널은 촘촘한 소스 실행 로그로 확인했으며, 공개 자동 실행에서는 버튼의 초기 상태와 RGB 점등을 확인했다. 매트릭스·서보·릴레이는 앱의 스텝 버튼으로 구간별 상태를 추가 기록했다. MPU6050의 데스크톱 입력은 슬라이더 0.1 g 간격에 맞춰 0.75가 0.8 g로 반올림된다.

기존 원본 예제는 Docs 레시피로 대체하지 않고 직접 실행했다. 원본 EXTI 엔코더, USER 버튼, 내장 USART2 VCP, TIM 인터럽트/입력 캡처/독립 PWM, ADC 배열, 함수·구조체 예제를 포함한다.

개별 카드의 API 호출 도달은 장치 전체 동작 판정과 구분했다. 모든 단선 위치마다 동작을 반복한 것은 아니며, 전체 누락·오접속 복구에는 실제 실행을 포함했다. 실제 STM32 보드 실행이 아닌 시뮬레이터 실행이다. ARM 링크는 빌드 검사이며 실물 동작 검증이 아니다. Bare-metal의 실행 지원 범위는 변경하지 않았다.

## 기존 원본 예제 목록

| ID | 예제 | 결과 |
|---|---|---|
| potentiometer | HAL · 가변저항 ADC | 통과 |
| slide | HAL · 슬라이드 스위치 | 통과 |
| rgb | HAL · RGB LED | 통과 |
| lcd | HAL · LCD 1602 4비트 | 통과 |
| diode | HAL · 다이오드 순방향 전압 | 통과 |
| buzzer | HAL · 능동 부저 | 통과 |
| sevenseg | HAL · 7세그먼트 숫자 | 통과 |
| l298n | HAL · L298N 듀얼 DC 모터 제어 | 통과 |
| passive_buzzer | HAL · 수동 부저 PWM 멜로디 | 통과 |
| ldr | HAL · 조도 센서 · LDR | 통과 |
| ntc | HAL · NTC 서미스터 | 통과 |
| sht31 | HAL · SHT31 온습도 센서 | 통과 |
| mpu6050 | HAL · MPU6050 가속도·자이로 | 통과 |
| pir | HAL · PIR 움직임 센서 | 통과 |
| oled | HAL · OLED · SSD1306 | 통과 |
| tft | HAL · TFT · ST7735 | 통과 |
| matrix | HAL · LED 매트릭스 · MAX7219 | 통과 |
| servo | HAL · RC 서보 모터 | 통과 |
| motor | HAL · DC 모터 + H 브리지 | 통과 |
| stepper | HAL · 스테퍼 모터 + 드라이버 | 통과 |
| relay | HAL · 릴레이 모듈 | 통과 |
| joystick | HAL · 조이스틱 | 통과 |
| encoder | HAL · 로터리 인코더 | 통과 |
| timer_multi | HAL · 독립 타이머 서보·DC 모터 | 통과 |
| timer_capture | HAL · TIM4 입력 캡처 | 통과 |
| timer_encoder | HAL · TIM4 엔코더 모드 | 통과 |
| blink | HAL · GPIO LED | 통과 |
| button | HAL · GPIO 버튼 입력 | 통과 |
| exti | HAL · USER 버튼 EXTI | 통과 |
| uart | HAL · USART2 내장 터미널 (ST-LINK VCP) | 통과 |
| uart_external | HAL · 외부 UART 장치 배선 연습 | 통과 |
| timer | HAL · TIM2 주기 인터럽트 | 통과 |
| adc | HAL · ADC 입력 | 통과 |
| temperature | HAL · TMP36 온도 | 통과 |
| samples | HAL · ADC 배열 샘플링 | 통과 |
| i2c | HAL · I²C 메모리 | 통과 |
| spi | HAL · SPI 메모리 | 통과 |
| language | HAL · 함수·배열·구조체 | 통과 |
| pwm | HAL · TIM2 PWM | 통과 |
| ultrasonic | HAL · 초음파 거리 측정 | 통과 |

## 기존 장치 Docs 목록

| 장치 | HAL 카드 | 단선 복구 | 결과 |
|---|---|---|---|
| NUCLEO-F446RE 보드 (board) | 8 | 3 | 통과 |
| 저항 (resistor) | 10 | 4 | 통과 |
| LED (led) | 8 | 3 | 통과 |
| 푸시 버튼 (button) | 7 | 5 | 통과 |
| LCD 1602 (lcd) | 6 | 13 | 통과 |
| 빵판 (breadboard) | 8 | 2 | 통과 |
| 조도 센서 · LDR (ldr) | 10 | 4 | 통과 |
| NTC 서미스터 (ntc) | 10 | 4 | 통과 |
| SHT31 온습도 센서 (sht31) | 8 | 4 | 통과 |
| MPU6050 가속도·자이로 (mpu6050) | 8 | 4 | 통과 |
| PIR 움직임 센서 (pir) | 8 | 3 | 통과 |
| OLED · SSD1306 (oled) | 7 | 4 | 통과 |
| TFT · ST7735 (tft) | 8 | 7 | 통과 |
| LED 매트릭스 · MAX7219 (matrix) | 8 | 5 | 통과 |
| RC 서보 모터 (servo) | 9 | 3 | 통과 |
| DC 모터 + H 브리지 (motor) | 10 | 5 | 통과 |
| 스테퍼 모터 + 드라이버 (stepper) | 6 | 6 | 통과 |
| 릴레이 모듈 (relay) | 8 | 7 | 통과 |
| 조이스틱 (joystick) | 11 | 5 | 통과 |
| 로터리 인코더 (encoder) | 9 | 5 | 통과 |
| L298N 모터 드라이버 (l298n) | 10 | 14 | 통과 |
| DC 모터 · 2핀 (dc_motor) | 10 | 14 | 통과 |
| 외부 DC 전원 (dc_supply) | 10 | 14 | 통과 |
| 외부 UART 터미널 (uart) | 9 | 4 | 통과 |
| I²C 메모리 (i2c) | 8 | 4 | 통과 |
| SPI 메모리 (spi) | 9 | 6 | 통과 |
| 가변저항 (potentiometer) | 10 | 3 | 통과 |
| 슬라이드 스위치 (slide) | 6 | 3 | 통과 |
| RGB LED (rgb) | 6 | 7 | 통과 |
| 커패시터 (capacitor) | 8 | 4 | 통과 |
| 다이오드 (diode) | 11 | 4 | 통과 |
| 능동 부저 (buzzer) | 7 | 2 | 통과 |
| 수동 부저 (passive_buzzer) | 12 | 2 | 통과 |
| 7세그먼트 (sevenseg) | 6 | 17 | 통과 |
| 온도 센서 (temperature) | 10 | 3 | 통과 |
| 초음파 센서 (ultrasonic) | 9 | 7 | 통과 |

## 재현과 증거

- 실행 스크립트: scripts/docs-audit/README.md 참고. 원본/Docs/수리/카드/재배선 로그: work/test-results/docs-audit-0.23.3/.
- 초기화 앱 파일 로그: work/test-results/code-reset-public.json. 격리 프로필을 사용하며 사용자 앱은 조작하지 않았다.
- 상세 수정 위치는 FIX-LOCATIONS.md에 별도로 기록.
- 공개 Release: https://github.com/moonsyu/STM-Simulator/releases/tag/v0.23.3
- 빌드 커밋: 7bf2600d78fdfbf85d224969f15bf10e01e8332f
- STM-Simulator.exe SHA-256: 217f07be77a159e52245390953d50e790092f1faf6e9b8df946cecbb8fb81c40
