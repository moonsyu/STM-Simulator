# STM32 장치 외형과 핀 구성 자료집

확인일: 2026-10-14. 기준 소스: `a24bc19`. 현재 부품 라이브러리 **35종 전체**, 외형·핀 구성 **80항목**, MCU 내부 주변장치 **24분류**를 연결한다.

[사진과 핀 수로 찾아보기](device-reference-gallery.html) · [구조화된 원본 목록](device-visual-references.json)

## 핀을 세는 기준

핀 수는 선정한 제품의 주요 외부 연결 접점 수다. 릴레이 제어 헤더와 접점, 모터 드라이버 제어와 모터 출력처럼 역할이 다른 단자는 나눠 기록한다. 중복 I²C 커넥터·점퍼·지지 탭은 별도 표기한다. 빵판은 구멍 수, 보드는 MCU 패키지 핀과 헤더 접점을 구분한다. 핀 목록은 신호 구성이고, 실제 좌우 순서는 해당 모델의 도면·실크 기준이다.

이 목록은 아래 제조사 모델을 구분한 자료다. 같은 이름의 모든 시판 리비전을 하나의 핀맵으로 묶지 않는다. 사진은 원본 URL로 표시하며 애플리케이션 배포 이미지로 포함하지 않는다.

## 현재 구현된 부품 35종

| 앱 타입 | 부품 | 현재 앱 단자 | 실제 외형과 변형 |
|---|---|---|---|
| `resistor` | 저항 | 2단자: A, B | [축형 저항 2핀](#resistor-axial-2) |
| `led` | LED | 2단자: A (+), K (−) | [5mm 단색 LED 2핀](#led-tht-2) |
| `button` | 푸시 버튼 | 4단자: A1, B1, A2, B2 | [2핀 순간 버튼](#button-2)<br>[4핀 택트 버튼](#button-4)<br>[KY-004 버튼 모듈 3핀](#button-module-3) |
| `lcd` | LCD 1602 | 16단자: 1 · VSS, 2 · VDD, 3 · VO, 4 · RS, 5 · R/W, 6 · E, 7 · DB0, 8 · DB1, 9 · DB2, 10 · DB3, 11 · DB4, 12 · DB5, 13 · DB6, 14 · DB7, 15 · A, 16 · K | [LCD 1602 병렬형 16핀](#lcd-parallel-16)<br>[LCD1602 I²C 모듈 4핀](#lcd-i2c-4) |
| `breadboard` | 빵판 | 400홀, 외부 핀 없음 | [400홀 빵판](#breadboard-400) |
| `ldr` | 조도 센서 · LDR | 2단자: A, B | [CdS 광저항 소자 2핀](#ldr-bare-2)<br>[KY-018 광저항 분압 모듈 3핀](#ldr-module-3)<br>[광저항 AO/DO 비교기 모듈 4핀](#ldr-comparator-4) |
| `ntc` | NTC 서미스터 | 2단자: A, B | [NTC 서미스터 2핀](#ntc-bare-2)<br>[KY-013 NTC 분압 모듈 3핀](#ntc-module-3) |
| `sht31` | SHT31 온습도 센서 | 4단자: VCC, GND, SDA, SCL | [Grove SHT31 4핀](#sht31-grove-4)<br>[Adafruit SHT31-D 헤더 7핀](#sht31-breakout-7) |
| `mpu6050` | MPU6050 가속도·자이로 | 4단자: VCC, GND, SDA, SCL | [SEN-MPU6050 8핀](#mpu6050-8) |
| `pir` | PIR 움직임 센서 | 3단자: VCC, GND, OUT | [PIR 감지 모듈 3핀](#pir-3) |
| `oled` | OLED · SSD1306 | 4단자: VCC, GND, SDA, SCL | [SSD1306 I²C OLED 4핀](#oled-i2c-4)<br>[Waveshare 0.96 OLED 헤더 7핀](#oled-configurable-7)<br>[Adafruit 구형 128×64 OLED 8핀](#oled-configurable-8) |
| `tft` | TFT · ST7735 | 7단자: VCC, GND, CS, SCK, MOSI, DC, RST | [ST7735S 1.8인치 TFT 8핀](#st7735-8) |
| `matrix` | LED 매트릭스 · MAX7219 | 5단자: VCC, GND, LOAD, CLK, DIN | [MAX7219 8×8 매트릭스 입력5+출력5](#matrix-10) |
| `servo` | RC 서보 모터 | 3단자: VCC, GND, PWM | [RC 마이크로 서보 3선](#servo-3)<br>[위치 피드백 RC 서보 4선](#servo-feedback-4) |
| `motor` | DC 모터 + H 브리지 | 5단자: VM, GND, PWM, IN1, IN2 | [모터와 드라이버를 분리한 실물 구성](#motor-driver-hat)<br>[브러시 DC 모터 2단자](#dc-motor-2)<br>[L298N 모듈 주요 외부 단자 13개](#l298n-module-13) |
| `stepper` | 스테퍼 모터 + 드라이버 | 6단자: VM, GND, IN1, IN2, IN3, IN4 | [바이폴라 스테퍼 4선](#stepper-bipolar-4)<br>[28BYJ-48 모터 5선](#stepper-unipolar-5)<br>[ULN2003 모듈 제어4+전원2+모터5](#stepper-driver-11) |
| `relay` | 릴레이 모듈 | 6단자: VCC, GND, IN, COM, NO, NC | [릴레이 모듈 제어3+접점3](#relay-module-6) |
| `joystick` | 조이스틱 | 5단자: VCC, GND, VRX, VRY, SW | [KY-023 조이스틱 5핀](#joystick-module-5) |
| `encoder` | 로터리 인코더 | 5단자: VCC, GND, A, B, SW | [누름 기능 로터리 인코더 소자 5접점](#encoder-bare-5)<br>[KY-040 인코더 모듈 5핀](#encoder-module-5) |
| `l298n` | L298N 모터 드라이버 | 13단자: VM, GND, 5V, ENA, IN1, IN2, IN3, IN4, ENB, OUT1, OUT2, OUT3, OUT4 | [L298N 모듈 주요 외부 단자 13개](#l298n-module-13)<br>[L298N 나형 드라이버 IC 15핀](#l298n-bare-15)<br>[L298P PowerSO20 드라이버 IC 20핀](#l298p-bare-20) |
| `dc_motor` | DC 모터 · 2핀 | 2단자: A, B | [브러시 DC 모터 2단자](#dc-motor-2)<br>[모터와 드라이버를 분리한 실물 구성](#motor-driver-hat) |
| `dc_supply` | 외부 DC 전원 | 2단자: +, − | [배터리 팩 외부 전원 2선](#dc-supply-2) |
| `uart` | UART 터미널 | 4단자: VCC, GND, TX, RX | [USB–TTL 시리얼 케이블 4선](#uart-cable-4)<br>[FTDI TTL 시리얼 케이블 6접점](#uart-cable-6) |
| `i2c` | I²C 메모리 | 4단자: VCC, GND, SDA, SCL | [24LC02B I²C EEPROM PDIP8](#i2c-eeprom-8)<br>[24LC02B SOT-23-5 패키지](#i2c-eeprom-5) |
| `spi` | SPI 메모리 | 6단자: VCC, GND, CS, SCK, MOSI, MISO | [25LC020A SPI EEPROM 8핀](#spi-eeprom-8) |
| `potentiometer` | 가변저항 | 3단자: 1, 2 · WIPER, 3 | [10kΩ 트리머 가변저항 3핀](#pot-bare-3)<br>[회전 가변저항 센서 모듈 3핀](#pot-module-3) |
| `slide` | 슬라이드 스위치 | 3단자: A, COM, B | [SPDT 슬라이드 스위치 3핀](#slide-spdt-3)<br>[C&K JS202011JCQN DPDT 6핀](#slide-dpdt-6)<br>[C&K JS203011JAQN DP3T 8핀](#slide-dp3t-8) |
| `rgb` | RGB LED | 4단자: R (+), K (−), G (+), B (+) | [공통 양극 RGB LED 4핀](#rgb-common-anode-4)<br>[KY-016 공통 음극 RGB 모듈 4핀](#rgb-common-cathode-4)<br>[주소지정 NeoPixel THT 4핀](#rgb-neopixel-4)<br>[FLORA NeoPixel 연결 패드 4개](#rgb-neopixel-flora-4)<br>[Gravity 디지털 RGB 모듈 3핀](#rgb-gravity-3) |
| `capacitor` | 커패시터 | 2단자: A, B | [세라믹 커패시터 2핀](#capacitor-ceramic-2)<br>[알루미늄 전해 커패시터 2핀](#capacitor-electrolytic-2) |
| `diode` | 다이오드 | 2단자: A (+), K (−) | [1N4001 축형 다이오드 2핀](#diode-axial-2) |
| `buzzer` | 능동 부저 | 2단자: +, − | [발진기 내장 능동 부저 2핀](#buzzer-active-2)<br>[KY-012 능동 부저 모듈 3핀](#buzzer-active-module-3) |
| `passive_buzzer` | 수동 부저 | 2단자: +, − | [외부 구동 피에조 부저 2핀](#buzzer-passive-2)<br>[KY-006 수동 부저 모듈 3핀](#buzzer-passive-module-3) |
| `sevenseg` | 7세그먼트 | 10단자: e, d, K1, c, dp, b, a, K2, f, g | [SC56-11EWA 공통 음극 10핀](#sevenseg-common-cathode-10)<br>[SA56-11EWA 공통 양극 10핀](#sevenseg-common-anode-10)<br>[나형 4자리 7세그먼트 12핀](#sevenseg-4digit-12)<br>[TM1637 4자리 표시 모듈 4핀](#sevenseg-tm1637-4) |
| `temperature` | 온도 센서 | 3단자: VS, VOUT, GND | [TMP36 아날로그 온도 센서 3핀](#tmp36-to92-3)<br>[DS18B20 디지털 온도 센서 3핀](#ds18b20-to92-3)<br>[방수 DS18B20 프로브 3선](#ds18b20-probe-3) |
| `ultrasonic` | 초음파 센서 | 4단자: VCC, TRIG, ECHO, GND | [HC-SR04 초음파 4핀](#hcsr04-4)<br>[URM09 Trig 초음파 3핀](#urm09-trig-3)<br>[URM09 I²C 초음파 4핀](#urm09-i2c-4) |

## 모델별 사진과 단자

### NUCLEO-F446RE

<a id="nucleo-f446re"></a>
#### NUCLEO-F446RE 보드

- 외형: 흰색 PCB 상단 ST-LINK, 중앙 MCU, 양쪽 Arduino/Morpho 헤더. [사진](https://a.allegroimg.com/original/1131a1/bd4caa2543e88d68cc0e2b339dae/STM32-NUCLEO-F446RE-STM32F446RE-ARM-Cortex-M4)
- 주요 핀: 보드·기구 또는 회로도 별도 확인
- 연결 방식: 보드
- 별도 접점: 보드 커넥터는 보드 핀맵 기준; 부품용 핀 수 필터에서 제외
- 구분점: MCU 패키지 64핀과 보드 헤더 접점 수는 서로 다른 수입니다. 보드 헤더의 핀·전원·NC를 별도로 구분합니다.
- 근거: [ST NUCLEO-F446RE 공식 보드 페이지](https://www.st.com/en/evaluation-tools/nucleo-f446re.html) · [ST STM32F446RE 공식 MCU 페이지](https://www.st.com/en/microcontrollers-microprocessors/stm32f446re.html)

### 저항

<a id="resistor-axial-2"></a>
#### 축형 저항 2핀

- 외형: 색띠가 있는 원통형 몸체 양끝에 리드. [사진](https://cdn-shop.adafruit.com/970x728/2780-00.jpg)
- 주요 핀: 2접점 — R1, R2
- 연결 방식: 수동 소자
- 구분점: 출처 제품은 220Ω입니다. 앱 기본 330Ω과 값이 다르지만 동일한 축형 외형 참고입니다.
- 근거: [Through-Hole Resistors - 220 ohm 5% 1/4W - Pack of 25 : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/2780)

### LED

<a id="led-tht-2"></a>
#### 5mm 단색 LED 2핀

- 외형: 둥근 렌즈와 길이가 다른 두 다리. 케이스 평면과 캐소드 표시 확인. [사진](https://cdn-shop.adafruit.com/970x728/297-00.jpg)
- 주요 핀: 2접점 — A, K
- 연결 방식: GPIO/PWM
- 근거: [Super Bright Red 5mm LED (25 pack) : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/297)

### 푸시 버튼

<a id="button-2"></a>
#### 2핀 순간 버튼

- 외형: 작은 누름 몸체에 두 전기 단자. 누를 때 연결. [사진](https://cdn-shop.adafruit.com/970x728/3101-00.jpg)
- 주요 핀: 2접점 — SW1, SW2
- 연결 방식: GPIO/EXTI
- 근거: [Soft Tactile Button (8mm) x 10 : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/3101)

<a id="button-4"></a>
#### 4핀 택트 버튼

- 외형: 사각 플라스틱 몸체와 금속 덮개, 양쪽 두 다리. [사진](https://cdn-shop.adafruit.com/970x728/1119-03.jpg)
- 주요 핀: 4접점 — A1, B1, A2, B2
- 연결 방식: GPIO/EXTI
- 구분점: 4핀은 독립 스위치 네 개가 아닙니다. 같은 측 접점 쌍의 내부 연결은 제조사 도면으로 확인합니다.
- 근거: [Tactile Switch Buttons (12mm square, 6mm tall) x 10 pack : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/1119)

<a id="button-module-3"></a>
#### KY-004 버튼 모듈 3핀

- 외형: 택트 스위치가 작은 PCB 위에 있고 한쪽에 3핀 헤더. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-004/KY-004.png)
- 주요 핀: 3접점 — S, +V, GND
- 연결 방식: GPIO/EXTI
- 근거: [KY-004 Button - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-004)

### LCD 1602

<a id="lcd-parallel-16"></a>
#### LCD 1602 병렬형 16핀

- 외형: 긴 문자 LCD와 한 줄 16개 패드·헤더. [사진](https://cdn-shop.adafruit.com/970x728/181-06.jpg)
- 주요 핀: 16접점 — VSS, VDD, VO, RS, R/W, E, D0, D1, D2, D3, D4, D5, D6, D7, A, K
- 연결 방식: GPIO 병렬
- 구분점: 4비트 모드로 사용해도 물리 핀은 16개입니다. 현재 앱은 이 형태입니다.
- 근거: [Standard LCD 16x2 + extras [white on blue] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/181)

<a id="lcd-i2c-4"></a>
#### LCD1602 I²C 모듈 4핀

- 외형: 문자 LCD에 I²C 변환 보드가 결합된 형태. [사진](https://www.waveshare.com/w/upload/9/9e/LCD1602_RGB_Module011.jpg)
- 주요 핀: 4접점 — VCC, GND, SCL, SDA
- 연결 방식: I²C
- 구분점: 외부 인터페이스는 4핀입니다. LCD 본체의 16핀과 합쳐 세지 않습니다. 현재 병렬 LCD와 구동 코드가 다릅니다.
- 근거: [LCD1602 I2C Module - Waveshare Wiki](https://www.waveshare.com/wiki/LCD1602_I2C_Module)

### 빵판

<a id="breadboard-400"></a>
#### 400홀 빵판

- 외형: 중앙 홈 양옆의 접점과 두 쌍의 전원 레일. [사진](https://cdn-shop.adafruit.com/970x728/64-06.jpg)
- 주요 핀: 보드·기구 또는 회로도 별도 확인
- 연결 방식: 배선
- 별도 접점: 400홀; 내부 버스 연결은 레일 분리 여부까지 확인
- 구분점: 400은 구멍 수입니다. 400핀 IC로 분류하지 않습니다.
- 근거: [Half Sized Premium Breadboard - 400 Tie Points : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/64)

### 조도 센서 · LDR

<a id="ldr-bare-2"></a>
#### CdS 광저항 소자 2핀

- 외형: 원형 감광 면 위 지그재그 패턴과 두 리드. [사진](https://cdn-shop.adafruit.com/970x728/161-00.jpg)
- 주요 핀: 2접점 — R1, R2
- 연결 방식: ADC 분압
- 근거: [Photo cell (CdS photoresistor) : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/161)

<a id="ldr-module-3"></a>
#### KY-018 광저항 분압 모듈 3핀

- 외형: 광저항과 고정 저항이 작은 PCB에 실장됨. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-018/KY-018.png)
- 주요 핀: 3접점 — S, +V, GND
- 연결 방식: ADC
- 근거: [KY-018 Photoresistor - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-018)

<a id="ldr-comparator-4"></a>
#### 광저항 AO/DO 비교기 모듈 4핀

- 외형: 광저항, 임계값 조절 트리머, 비교기 칩이 있는 PCB. [사진](https://docs.sunfounder.com/projects/umsk/en/latest/_images/11_photoresistor_module.png)
- 주요 핀: 4접점 — VCC, GND, AO, DO
- 연결 방식: ADC/GPIO
- 구분점: AO 아날로그 출력과 DO 임계값 출력은 별도 신호입니다.
- 근거: [Photoresistor Module — SunFounder Universal Maker Sensor Kit  documentation](https://docs.sunfounder.com/projects/umsk/en/latest/01_components_basic/11-component_photoresistor.html)

### NTC 서미스터

<a id="ntc-bare-2"></a>
#### NTC 서미스터 2핀

- 외형: 작은 에폭시 비드 센서와 두 리드·케이블. [사진](https://cdn-shop.adafruit.com/970x728/372-01.jpg)
- 주요 핀: 2접점 — R1, R2
- 연결 방식: ADC 분압
- 근거: [10K Precision Epoxy Thermistor [3950 NTC] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/372)

<a id="ntc-module-3"></a>
#### KY-013 NTC 분압 모듈 3핀

- 외형: 서미스터와 분압 저항이 붙은 3핀 PCB. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-013/KY-013.png)
- 주요 핀: 3접점 — S, +V, GND
- 연결 방식: ADC
- 근거: [KY-013 Temperature sensor (NTC) - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-013)

### SHT31 온습도 센서

<a id="sht31-grove-4"></a>
#### Grove SHT31 4핀

- 외형: 작은 센서 칩과 Grove 4핀 소켓. [사진](https://files.seeedstudio.com/wiki/Grove-TempAndHumi_Sensor-SHT31/img/main_new.jpg)
- 주요 핀: 4접점 — VCC, GND, SDA, SCL
- 연결 방식: I²C
- 구분점: 현재 4신호 모델과 인터페이스가 대응합니다. 커넥터 배치·기구는 앱 그림과 다릅니다.
- 근거: [Grove - Temp and Humi Sensor(SHT31)  /  Seeed Studio Wiki](https://wiki.seeedstudio.com/Grove-TempAndHumi_Sensor-SHT31/)

<a id="sht31-breakout-7"></a>
#### Adafruit SHT31-D 헤더 7핀

- 외형: 센서 칩, 주소 점퍼, 추가 신호를 꺼낸 PCB. [사진](https://cdn-shop.adafruit.com/970x728/2857-03.jpg)
- 주요 핀: 7접점 — VIN, GND, SCL, SDA, ADR, RST, ALR
- 연결 방식: I²C
- 별도 접점: STEMMA QT판은 중복 I²C 커넥터 4접점×2 추가
- 구분점: 주소·리셋·알림 세 신호가 4핀형과의 차이입니다.
- 근거: [Pinouts  /  Adafruit SHT31-D Temperature & Humidity Sensor Breakout  /  Adafruit Learning System](https://learn.adafruit.com/adafruit-sht31-d-temperature-and-humidity-sensor-breakout/pinouts) · [Adafruit Sensirion SHT31-D [Temperature & Humidity Sensor] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/2857)

### MPU6050 가속도·자이로

<a id="mpu6050-8"></a>
#### SEN-MPU6050 8핀

- 외형: MCU와 작은 레귤레이터, 장착홀, 한 줄 8핀 헤더. [사진](https://www.joy-it.net/files/files/Produkte/SEN-MPU6050/SEN-MPU6050_1.png)
- 주요 핀: 8접점 — VCC, GND, SCL, SDA, XDA, XCL, AD0, INT
- 연결 방식: I²C
- 구분점: 앱은 VCC/GND/SDA/SCL 네 단자만 표현합니다. 보조 I²C·주소·인터럽트 핀은 표현되지 않습니다.
- 근거: [Motion sensor MPU6050 (Gyroscope)  /  Joy-IT](https://www.joy-it.net/en/products/SEN-MPU6050)

### PIR 움직임 센서

<a id="pir-3"></a>
#### PIR 감지 모듈 3핀

- 외형: 흰색 프레넬 렌즈가 센서 위를 덮고 하부에 PCB가 있음. [사진](https://cdn-shop.adafruit.com/970x728/189-04.jpg)
- 주요 핀: 3접점 — VCC, OUT, GND
- 연결 방식: GPIO/EXTI
- 구분점: 전면 방향만 보고 3핀 순서를 추정하지 않고 PCB 실크를 확인합니다.
- 근거: [PIR (motion) sensor : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/189)

### OLED · SSD1306

<a id="oled-i2c-4"></a>
#### SSD1306 I²C OLED 4핀

- 외형: 작은 검은 유리 표시창과 4핀 헤더가 있는 PCB. [사진](https://www.joy-it.net/files/files/Produkte/SBC-OLED01/SBC-OLED01-1b.png)
- 주요 핀: 4접점 — VCC, GND, SCL, SDA
- 연결 방식: I²C
- 근거: [0,96" OLED display  /  Joy-IT](https://www.joy-it.net/en/products/SBC-OLED01)

<a id="oled-configurable-7"></a>
#### Waveshare 0.96 OLED 헤더 7핀

- 외형: 작은 OLED 뒤쪽에 통신 선택 저항과 추가 제어 핀. [사진](https://www.waveshare.com/w/upload/4/4a/0.96inch_OLED_Module.jpg)
- 주요 핀: 7접점 — VCC, GND, DIN, CLK, CS, DC, RES
- 연결 방식: SPI/I²C 선택
- 구분점: 현재 제품 문서는 SSD1315를 명시합니다. SSD1306과 같은 칩으로 취급하지 않습니다. I²C 선택 시에도 물리 헤더는 7핀입니다.
- 근거: [0.96inch OLED Module - Waveshare Wiki](https://www.waveshare.com/wiki/0.96inch_OLED_Module)

<a id="oled-configurable-8"></a>
#### Adafruit 구형 128×64 OLED 8핀

- 외형: 전원 핀 둘과 데이터·제어 핀을 한 줄로 꺼낸 OLED PCB. [사진](https://cdn-learn.adafruit.com/guides/images/000/000/039/medium800/938-17.jpg)
- 주요 핀: 8접점 — GND, 3V3, VIN, D0, D1, RST, DC, CS
- 연결 방식: SPI/I²C 선택
- 구분점: 가이드에서 8핀 헤더를 확인했습니다. 신형 리비전과 핀 구성이 다를 수 있습니다.
- 근거: [Wiring 128x64 OLEDs  /  Monochrome OLED Breakouts  /  Adafruit Learning System](https://learn.adafruit.com/monochrome-oled-breakouts/wiring-128x64-oleds)

### TFT · ST7735

<a id="st7735-8"></a>
#### ST7735S 1.8인치 TFT 8핀

- 외형: 컬러 표시창과 8핀 케이블 인터페이스. [사진](https://www.waveshare.com/w/upload/a/ae/1.8inch-LCD-Module-1.jpg)
- 주요 핀: 8접점 — VCC, GND, DIN, CLK, CS, DC, RST, BL
- 연결 방식: SPI
- 구분점: 앱 7핀 모델에는 BL 백라이트 제어 단자가 없습니다. 실제 모듈의 화면 원점·컨트롤러도 확인해야 합니다.
- 근거: [1.8inch LCD Module - Waveshare Wiki](https://www.waveshare.com/wiki/1.8inch_LCD_Module)

### LED 매트릭스 · MAX7219

<a id="matrix-10"></a>
#### MAX7219 8×8 매트릭스 입력5+출력5

- 외형: 큰 8×8 LED 블록 뒤에 드라이버 PCB와 양쪽 5핀 헤더. [사진](https://docs.sunfounder.com/projects/raphael-kit/en/latest/_images/max7219_module.jpg)
- 주요 핀: 10접점 — VCC-IN, GND-IN, DIN, CS/LOAD-IN, CLK-IN, VCC-OUT, GND-OUT, DOUT, CS/LOAD-OUT, CLK-OUT
- 연결 방식: 직렬/SPI 유사
- 구분점: 앱의 5핀은 입력 측만 모델링합니다. 체인 출력 다섯 접점은 별도입니다.
- 근거: [LED Matrix Module — SunFounder Ulimate Raphael Kit for Raspberry Pi  documentation](https://docs.sunfounder.com/projects/raphael-kit/en/latest/_shared/component/cpn_max7219_module.html)

### RC 서보 모터

<a id="servo-3"></a>
#### RC 마이크로 서보 3선

- 외형: 작은 기어박스, 회전축·혼, 3선 케이블. [사진](https://cdn-shop.adafruit.com/970x728/169-06.jpg)
- 주요 핀: 3접점 — VCC, GND, PWM
- 연결 방식: TIM PWM
- 근거: [Micro servo [TowerPro SG92R] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/169)

<a id="servo-feedback-4"></a>
#### 위치 피드백 RC 서보 4선

- 외형: 일반 서보와 비슷하지만 위치 전압 피드백 선이 하나 더 있음. [사진](https://cdn-shop.adafruit.com/970x728/1449-05.jpg)
- 주요 핀: 4접점 — VCC, GND, PWM, FEEDBACK
- 연결 방식: TIM PWM + ADC
- 구분점: 추가 선은 두 번째 PWM 입력이 아닙니다. 현재 앱은 피드백 출력이 없는 3선형입니다.
- 근거: [Analog Feedback Micro Servo - Plastic Gear : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/1449)

### DC 모터 · 2핀

<a id="dc-motor-2"></a>
#### 브러시 DC 모터 2단자

- 외형: 금속 원통, 회전축, 두 전원 단자. [사진](https://cdn-shop.adafruit.com/970x728/711-06.jpg)
- 주요 핀: 2접점 — M+, M-
- 연결 방식: 외부 드라이버
- 구분점: 앱의 별도 DC 모터 및 모터+브리지 통합 부품의 모터 외형 참고입니다.
- 근거: [DC Toy / Hobby Motor - 130 Size : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/711)

### DC 모터 + H 브리지

<a id="motor-driver-hat"></a>
#### 모터와 드라이버를 분리한 실물 구성

- 외형: 모터는 2단자이고 별도 드라이버 보드에 제어·전원·출력이 모임. [사진](https://www.waveshare.com/w/upload/9/9e/Motor-Driver-HAT-intro.JPG)
- 주요 핀: 보드·기구 또는 회로도 별도 확인
- 연결 방식: 모터 드라이버
- 별도 접점: HAT 연결 수는 해당 보드 회로도 기준; 앱의 추상 5핀과 별도
- 구분점: 현재 motor의 VM/GND/PWM/IN1/IN2 5핀 통합 모델과 정확히 일치하는 실물 제품으로 간주하지 않습니다. 사진은 드라이버 HAT 예시입니다.
- 근거: [Motor Driver HAT - Waveshare Wiki](https://www.waveshare.com/wiki/Motor_Driver_HAT)

### 스테퍼 모터 + 드라이버

<a id="stepper-bipolar-4"></a>
#### 바이폴라 스테퍼 4선

- 외형: 사각 금속 모터와 4선 케이블. [사진](https://cdn-shop.adafruit.com/970x728/324-03.jpg)
- 주요 핀: 4접점 — A+, A-, B+, B-
- 연결 방식: 스테퍼 드라이버
- 구분점: 1.8°/스텝의 4선 모터입니다. 모터 4선은 IN1~IN4 논리 입력과 다릅니다.
- 근거: [Stepper motor - NEMA-17 size - 200 steps/rev, 12V 350mA : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/324)

<a id="stepper-unipolar-5"></a>
#### 28BYJ-48 모터 5선

- 외형: 둥근 기어 모터, 평평한 출력축과 5핀 케이블. [사진](https://www.joy-it.net/files/files/Produkte/SBC-Moto1/SBC-Moto1_01.png)
- 주요 핀: 5접점 — COMMON, COIL1, COIL2, COIL3, COIL4
- 연결 방식: ULN2003 구동
- 구분점: 4선 NEMA 모터와 코일 구성·기어비가 다릅니다. 앱의 1.8° 모델과 동일한 회전각으로 취급하지 않습니다.
- 근거: [Moto1 Stepper motor controller  /  Joy-IT](https://www.joy-it.net/en/products/SBC-Moto1)

<a id="stepper-driver-11"></a>
#### ULN2003 모듈 제어4+전원2+모터5

- 외형: 드라이버 칩, 상태 LED, 모터 소켓이 있는 PCB. [사진](https://www.joy-it.net/files/files/Produkte/SBC-Moto1/SBC-Moto1_01.png)
- 주요 핀: 11접점 — IN1, IN2, IN3, IN4, V+, GND, M-COM, M1, M2, M3, M4
- 연결 방식: 4상 논리 입력
- 구분점: 앱의 6핀은 제어4+전원2만 표현합니다. 모터 소켓의 5접점은 별도로 셉니다.
- 근거: [Moto1 Stepper motor controller  /  Joy-IT](https://www.joy-it.net/en/products/SBC-Moto1)

### 릴레이 모듈

<a id="relay-module-6"></a>
#### 릴레이 모듈 제어3+접점3

- 외형: 파란 릴레이 블록, 3핀 제어 헤더, 3개 나사 단자. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-019/KY-019.png)
- 주요 핀: 6접점 — VCC, GND, IN, COM, NO, NC
- 연결 방식: GPIO
- 구분점: 3핀 릴레이 모듈이라는 이름은 제어 측만 가리킵니다. 접점까지 포함하면 6단자입니다.
- 근거: [KY-019 5V Relais - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-019)

### 조이스틱

<a id="joystick-module-5"></a>
#### KY-023 조이스틱 5핀

- 외형: 검은 스틱과 두 가변저항, 누름 스위치가 있는 PCB. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-023/KY-023.png)
- 주요 핀: 5접점 — VCC, GND, VRX, VRY, SW
- 연결 방식: ADC×2 + GPIO
- 근거: [KY-023 Joystick (X-Y-Axis) - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-023)

### 로터리 인코더

<a id="encoder-bare-5"></a>
#### 누름 기능 로터리 인코더 소자 5접점

- 외형: 금속 회전축과 본체, 회전 접점 3개와 버튼 접점 2개. [사진](https://cdn-shop.adafruit.com/970x728/377-02.jpg)
- 주요 핀: 5접점 — A, COMMON, B, SW1, SW2
- 연결 방식: TIM Encoder/EXTI
- 구분점: 지지용 금속 탭은 전기 핀 수에서 제외합니다. 5핀이어도 모듈형의 VCC/GND 핀 배치와 다릅니다.
- 근거: [Rotary Encoder + Extras : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/377)

<a id="encoder-module-5"></a>
#### KY-040 인코더 모듈 5핀

- 외형: 회전축과 노브, 저항이 실장된 PCB와 5핀 헤더. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-040/KY-040.png)
- 주요 핀: 5접점 — VCC, GND, CLK/A, DT/B, SW
- 연결 방식: TIM Encoder/EXTI
- 근거: [KY-040 Rotary encoder - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-040)

### L298N 모터 드라이버

<a id="l298n-module-13"></a>
#### L298N 모듈 주요 외부 단자 13개

- 외형: 빨간 PCB, 큰 검은 방열판, 나사 단자 세 묶음과 제어 헤더. [사진](https://www.joy-it.net/files/files/Produkte/SBC-MotorDriver2/SBC-Motodriver2-1neu.png)
- 주요 핀: 13접점 — VM, GND, 5V, ENA, IN1, IN2, IN3, IN4, ENB, OUT1, OUT2, OUT3, OUT4
- 연결 방식: TIM PWM/GPIO
- 별도 접점: ENA/ENB/5V-EN 점퍼 접점은 주요 외부 단자 13개와 별도
- 구분점: 현재 앱은 ENA/ENB와 5V-EN 점퍼를 제거한 구성입니다. 5V가 입력인지 출력인지는 점퍼·보드 회로를 확인합니다.
- 근거: [MotoDriver2 DC motor control  /  Joy-IT](https://www.joy-it.net/en/products/SBC-Motodriver2)

<a id="l298n-bare-15"></a>
#### L298N 나형 드라이버 IC 15핀

- 외형: 금속 방열 탭이 있는 Multiwatt15 패키지와 한쪽으로 나온 15개 리드. [외형도 원문](https://www.st.com/resource/en/datasheet/l298.pdf)
- 주요 핀: 15접점 — SENSE-A, OUT1, OUT2, VS, IN1, ENA, IN2, GND, VSS, IN3, ENB, IN4, OUT3, OUT4, SENSE-B
- 연결 방식: GPIO/구동
- 별도 접점: 방열 탭은 GND에 연결되며 별도 제어 핀으로 세지 않습니다.
- 구분점: 앱의 L298N 모듈 외부 13단자와 칩 자체의 15핀은 다릅니다. 전류 감지·전원 등의 칩 핀까지 확인합니다.
- 근거: [ST L298 Multiwatt15 및 PowerSO20 데이터시트](https://www.st.com/resource/en/datasheet/l298.pdf)

<a id="l298p-bare-20"></a>
#### L298P PowerSO20 드라이버 IC 20핀

- 외형: 양쪽에 리드가 나온 PowerSO20 표면실장 패키지. [외형도 원문](https://www.st.com/resource/en/datasheet/l298.pdf)
- 주요 핀: 20접점 — NC1, SENSE-A, OUT1, OUT2, VS, IN1, ENA, IN2, GND1, GND2, GND3, GND4, VSS, IN3, ENB, IN4, OUT3, OUT4, SENSE-B, NC20
- 연결 방식: GPIO/구동
- 구분점: 같은 L298 계열이라도 Multiwatt15와 패키지 핀 수·기구가 다릅니다. 패키지별 도면을 사용합니다.
- 근거: [ST L298 Multiwatt15 및 PowerSO20 데이터시트](https://www.st.com/resource/en/datasheet/l298.pdf)

### 외부 DC 전원

<a id="dc-supply-2"></a>
#### 배터리 팩 외부 전원 2선

- 외형: 배터리 홀더와 양·음극 2선. [사진](https://cdn-shop.adafruit.com/970x728/830-07.jpg)
- 주요 핀: 2접점 — +, -
- 연결 방식: 전원
- 구분점: 외형 참고는 AA 홀더입니다. 이 제품이 앱의 기본 12V 전원이라는 뜻은 아닙니다.
- 근거: [4 x AA Battery Holder with On/Off Switch : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/830)

### UART 터미널

<a id="uart-cable-4"></a>
#### USB–TTL 시리얼 케이블 4선

- 외형: USB 플러그와 끝이 갈라진 4선 케이블. [사진](https://cdn-shop.adafruit.com/970x728/954-02.jpg)
- 주요 핀: 4접점 — USB-5V, GND, TXD, RXD
- 연결 방식: UART
- 구분점: 출처의 전원 선은 USB 5V입니다. 앱의 3.3V 전원 터미널과 전원 전압이 다릅니다.
- 근거: [USB to TTL Serial Cable - Debug / Console Cable for Raspberry Pi : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/954)

<a id="uart-cable-6"></a>
#### FTDI TTL 시리얼 케이블 6접점

- 외형: USB 플러그와 1×6 소켓. [사진](https://cdn-shop.adafruit.com/970x728/70-03.jpg)
- 주요 핀: 6접점 — GND, CTS, VCC, TXD, RXD, RTS
- 연결 방식: UART + 흐름 제어
- 구분점: 4선 케이블에 CTS/RTS 흐름 제어가 추가된 형식입니다. 3.3V/5V 제품을 구분합니다.
- 근거: [FTDI Serial TTL-232 USB Cable : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/70)

### I²C 메모리

<a id="i2c-eeprom-8"></a>
#### 24LC02B I²C EEPROM PDIP8

- 외형: 검은 DIP8 패키지와 방향을 나타내는 홈. [사진](https://product.hstatic.net/200000551749/product/24_7f79743fbdb945058afcb92c43f4f153_grande.png)
- 주요 핀: 8접점 — NC1, NC2, NC3, VSS, SDA, SCL, WP, VCC
- 연결 방식: I²C
- 구분점: 이 24LC02B의 1~3번은 NC입니다. 24LC256 같은 다른 EEPROM의 주소 핀 설명을 그대로 적용하면 안 됩니다. 앱 4핀 메모리는 칩의 부가 핀을 단순화한 범용 모델입니다.
- 근거: [Microchip 24AA02/24LC02B 데이터시트](https://ww1.microchip.com/downloads/en/devicedoc/21709j.pdf)

<a id="i2c-eeprom-5"></a>
#### 24LC02B SOT-23-5 패키지

- 외형: 작은 표면실장 패키지의 다섯 접점. [외형도 원문](https://ww1.microchip.com/downloads/en/devicedoc/21709j.pdf)
- 주요 핀: 5접점 — SCL, VSS, SDA, VCC, WP
- 연결 방식: I²C
- 구분점: PDIP8과 같은 계열의 패키지 변형입니다. 핀 번호는 데이터시트 SOT-23 도면 기준입니다.
- 근거: [24LC02B SOT-23-5 외형도](https://ww1.microchip.com/downloads/en/devicedoc/21709j.pdf)

### SPI 메모리

<a id="spi-eeprom-8"></a>
#### 25LC020A SPI EEPROM 8핀

- 외형: DIP8/SOIC8 패키지와 방향 표시. [외형도 원문](https://ww1.microchip.com/downloads/en/DeviceDoc/21833G.pdf)
- 주요 핀: 8접점 — CS, SO, WP, VSS, SI, SCK, HOLD, VCC
- 연결 방식: SPI
- 구분점: 앱 6핀 모델은 WP/HOLD를 노출하지 않습니다. 실제 칩 연결 시에는 이 부가 핀의 고정 상태가 필요합니다.
- 근거: [Microchip 25AA020A/25LC020A 데이터시트](https://ww1.microchip.com/downloads/en/DeviceDoc/21833G.pdf)

### 가변저항

<a id="pot-bare-3"></a>
#### 10kΩ 트리머 가변저항 3핀

- 외형: 조절 슬롯이 있는 작은 회전 트리머와 3개 리드. [사진](https://cdn-shop.adafruit.com/970x728/356-03.jpg)
- 주요 핀: 3접점 — END1, WIPER, END2
- 연결 방식: ADC 분압
- 구분점: 물리 3핀 중 2개만 써서 가변저항처럼 사용할 수 있지만 2핀 패키지로 재분류하지 않습니다.
- 근거: [Breadboard trim potentiometer [10K] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/356)

<a id="pot-module-3"></a>
#### 회전 가변저항 센서 모듈 3핀

- 외형: 손잡이와 PCB, 3핀 센서 커넥터. [사진](https://dfimg.dfrobot.com/enshop/DFR0054/DFR0054_Main_01.jpg)
- 주요 핀: 3접점 — VCC, GND, SIGNAL
- 연결 방식: ADC
- 구분점: 3핀이지만 나형 가변저항의 END/WIPER 명칭 대신 전원·신호 단자로 표시됩니다.
- 근거: [Gravity: Analog Rotation Potentiometer Sensor for Arduino - Rotation 300° - DFRobot](https://www.dfrobot.com/product-87.html)

### 슬라이드 스위치

<a id="slide-spdt-3"></a>
#### SPDT 슬라이드 스위치 3핀

- 외형: 옆으로 움직이는 손잡이와 일렬 3핀. [사진](https://cdn-shop.adafruit.com/970x728/805-03.jpg)
- 주요 핀: 3접점 — A, COM, B
- 연결 방식: GPIO/전원 선택
- 구분점: 두 핀만 사용하면 ON/OFF 용도로 쓸 수 있어도 물리 핀은 3개입니다.
- 근거: [Breadboard-friendly SPDT Slide Switch : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/805)

<a id="slide-dpdt-6"></a>
#### C&K JS202011JCQN DPDT 6핀

- 외형: 두 회로를 동시에 바꾸는 슬라이드 스위치의 6개 전기 단자. [외형도 원문](https://www.ckswitches.com/media/1422/js.pdf)
- 주요 핀: 6접점 — A1, COM1, B1, A2, COM2, B2
- 연결 방식: 접점 선택
- 별도 접점: 기구 고정 탭은 전기 접점 수에서 제외합니다.
- 구분점: 제조사 JS Series의 DPDT 모델입니다. 3핀 SPDT와 별도 모델로 취급합니다. 단자별 위치는 부품 번호의 도면을 따릅니다.
- 근거: [C&K JS Series 슬라이드 스위치 데이터시트](https://www.ckswitches.com/media/1422/js.pdf)

<a id="slide-dp3t-8"></a>
#### C&K JS203011JAQN DP3T 8핀

- 외형: 세 위치를 선택하며 두 회로를 함께 전환하는 슬라이드 스위치. [외형도 원문](https://www.ckswitches.com/media/1422/js.pdf)
- 주요 핀: 8접점 — A1, B1, C1, COM1, A2, B2, C2, COM2
- 연결 방식: 접점 선택
- 별도 접점: 고정용 금속 탭과 실제 전기 접점을 구분합니다.
- 구분점: 제조사 JS Series의 DP3T 모델입니다. 3핀·6핀형과 내부 연결표 및 선택 위치 수가 다릅니다.
- 근거: [C&K JS Series 슬라이드 스위치 데이터시트](https://www.ckswitches.com/media/1422/js.pdf)

### RGB LED

<a id="rgb-common-anode-4"></a>
#### 공통 양극 RGB LED 4핀

- 외형: 단색 LED와 비슷한 렌즈에 다리 네 개. [사진](https://cdn-shop.adafruit.com/970x728/159-02.jpg)
- 주요 핀: 4접점 — R, COMMON-A, G, B
- 연결 방식: PWM×3
- 구분점: 앱은 공통 음극입니다. 공통 양극형은 공통 전원 연결과 논리가 반대입니다.
- 근거: [Diffused RGB (tri-color) LED [Common Anode] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/159)

<a id="rgb-common-cathode-4"></a>
#### KY-016 공통 음극 RGB 모듈 4핀

- 외형: 4리드 RGB LED를 작은 PCB와 저항에 실장한 형태. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-016/KY-016.png)
- 주요 핀: 4접점 — R, G, B, COMMON-K
- 연결 방식: PWM×3
- 구분점: 앱의 나형 LED와 PCB 외형은 다릅니다. 공통 음극과 세 색 입력을 비교하는 자료입니다.
- 근거: [KY-016 RGB 5mm LED - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-016)

<a id="rgb-neopixel-4"></a>
#### 주소지정 NeoPixel THT 4핀

- 외형: 일반 RGB LED처럼 4리드 렌즈이지만 내부 드라이버가 있음. [사진](https://cdn-shop.adafruit.com/970x728/1938-01.jpg)
- 주요 핀: 4접점 — VDD, GND, DIN, DOUT
- 연결 방식: 단선 디지털 프로토콜
- 구분점: 핀 수만 보고 공통극 RGB LED와 호환시키면 안 됩니다.
- 근거: [NeoPixel Diffused 5mm Through-Hole LED - 5 Pack : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/1938)

<a id="rgb-neopixel-flora-4"></a>
#### FLORA NeoPixel 연결 패드 4개

- 외형: 원형 PCB 중앙의 주소지정 LED와 바느질용 패드. [사진](https://cdn-shop.adafruit.com/970x728/1260-09.jpg)
- 주요 핀: 4접점 — V+, GND, DIN, DOUT
- 연결 방식: 단선 디지털 프로토콜
- 구분점: 한 개 구동에 쓰는 입력 3신호와 실제 패드 4개를 구분합니다. DOUT은 다음 LED 연결용입니다.
- 근거: [Flora RGB Smart NeoPixel version 3 - Pack of 4 : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/1260)

<a id="rgb-gravity-3"></a>
#### Gravity 디지털 RGB 모듈 3핀

- 외형: 주소지정 RGB LED와 3핀 Gravity 커넥터가 있는 PCB. [사진](https://dfimg.dfrobot.com/enshop/DFR0605/DFR0605_Main_01_1200x630.jpg.webp)
- 주요 핀: 3접점 — VCC, GND, DATA
- 연결 방식: 단선 디지털 프로토콜
- 별도 접점: 제조사 핀 표의 DO는 별도 체인 출력 패드입니다. 3핀 커넥터와 따로 기록합니다.
- 구분점: 3핀 입력 인터페이스를 쓰는 DFR0605입니다. 일반 R/G/B 채널 LED와 구분합니다.
- 근거: [Gravity: Digital RGB LED Module - Easy LED Solutions  /  DFRobot Wiki](https://wiki.dfrobot.com/dfr0605/)

### 커패시터

<a id="capacitor-ceramic-2"></a>
#### 세라믹 커패시터 2핀

- 외형: 작은 원판·덩어리 몸체와 두 리드. 극성 표시 없음. [사진](https://cdn-shop.adafruit.com/970x728/753-02.jpg)
- 주요 핀: 2접점 — C1, C2
- 연결 방식: 수동 소자
- 구분점: 사진의 0.1µF와 앱 기본 용량은 서로 다른 값입니다.
- 근거: [0.1uF ceramic capacitors - 10 pack : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/753)

<a id="capacitor-electrolytic-2"></a>
#### 알루미늄 전해 커패시터 2핀

- 외형: 원통형 캔과 음극 줄무늬, 두 리드. [사진](https://cdn-shop.adafruit.com/970x728/2193-00.jpg)
- 주요 핀: 2접점 — +, -
- 연결 방식: 수동 소자
- 구분점: 앱 커패시터는 비극성 모델입니다. 실제 전해형의 극성·정격 전압을 동일하게 재현하지 않습니다.
- 근거: [100uF 16V Electrolytic Capacitors - Pack of 10 : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/2193)

### 다이오드

<a id="diode-axial-2"></a>
#### 1N4001 축형 다이오드 2핀

- 외형: 검은 원통 몸체 한쪽에 캐소드 띠, 양끝 리드. [사진](https://cdn-shop.adafruit.com/970x728/755-03.jpg)
- 주요 핀: 2접점 — A, K
- 연결 방식: 수동 소자
- 근거: [1N4001 Diode - 10 pack : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/755)

### 능동 부저

<a id="buzzer-active-2"></a>
#### 발진기 내장 능동 부저 2핀

- 외형: 윗면에 소리 구멍이 있는 원통형 케이스. [사진](https://cdn-shop.adafruit.com/970x728/1536-06.jpg)
- 주요 핀: 2접점 — +, -
- 연결 방식: DC/GPIO
- 구분점: DC를 인가하면 자체 발진으로 소리 납니다. 외형만으로 수동형과 구별하지 않습니다.
- 근거: [Buzzer 5V - Breadboard friendly : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/1536)

<a id="buzzer-active-module-3"></a>
#### KY-012 능동 부저 모듈 3핀

- 외형: 능동 부저와 3핀 헤더가 달린 PCB. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-006/KY-006.png)
- 주요 핀: 3접점 — S, +V(미사용), GND
- 연결 방식: GPIO
- 구분점: 이 제조사 배선 예제는 +V에 연결하지 않고 S/GND를 사용합니다. 다른 3핀 부저의 독립 전원+신호 회로와 구분합니다.
- 근거: [KY-012 Active Piezo-Buzzer - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-012)

### 수동 부저

<a id="buzzer-passive-2"></a>
#### 외부 구동 피에조 부저 2핀

- 외형: 원통형 피에조 케이스와 두 리드. [사진](https://cdn-shop.adafruit.com/970x728/160-01.jpg)
- 주요 핀: 2접점 — P1, P2
- 연결 방식: TIM PWM
- 구분점: 연속음에는 외부 교류·사각파가 필요합니다. 출처 제품의 공진대역과 앱 20~2000Hz 범위는 다릅니다.
- 근거: [Piezo Buzzer [PS1240] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/160)

<a id="buzzer-passive-module-3"></a>
#### KY-006 수동 부저 모듈 3핀

- 외형: 수동 피에조와 3핀 PCB. [사진](https://sensorkit.joy-it.net/files/files/sensors/KY-006/KY-006.png)
- 주요 핀: 3접점 — S, +V(미사용), GND
- 연결 방식: TIM PWM
- 구분점: 같은 3핀이라도 미사용 단자를 포함할 수 있습니다. 제조사 배선도에 따라 S/GND를 연결합니다.
- 근거: [Passive Piezo-Buzzer - SensorKit](https://sensorkit.joy-it.net/en/sensors/ky-006)

### 7세그먼트

<a id="sevenseg-common-cathode-10"></a>
#### SC56-11EWA 공통 음극 10핀

- 외형: 단일 숫자 표시창과 위·아래 두 줄의 다리. [사진](https://static.rapidonline.com/catalogueimages/product/57/01/s57-0127p01wl.jpg)
- 주요 핀: 10접점 — e, d, K1, c, dp, b, a, K2, f, g
- 연결 방식: GPIO/PWM
- 구분점: 단자 구성은 앱과 대응합니다. 도면의 위에서 본 방향과 핀1 위치를 확인합니다.
- 근거: [Kingbright SC56-11EWA 데이터시트](https://www.kingbrightusa.com/images/catalog/spec/sc56-11ewa.pdf)

<a id="sevenseg-common-anode-10"></a>
#### SA56-11EWA 공통 양극 10핀

- 외형: 공통 음극형과 유사한 단일 숫자 패키지. [외형도 원문](https://www.kingbrightusa.com/images/catalog/spec/sa56-11ewa.pdf)
- 주요 핀: 10접점 — e, d, A1, c, dp, b, a, A2, f, g
- 연결 방식: GPIO/PWM
- 구분점: 생김새·핀 수가 같아도 공통극이 반대입니다. 사진 대신 제조사 외형도·회로도를 연결했습니다.
- 근거: [Kingbright SA56-11EWA 데이터시트](https://www.kingbrightusa.com/images/catalog/spec/sa56-11ewa.pdf)

<a id="sevenseg-4digit-12"></a>
#### 나형 4자리 7세그먼트 12핀

- 외형: 숫자 네 자리가 하나의 긴 패키지에 있음. [사진](https://cdn-shop.adafruit.com/970x728/813-06.jpg)
- 주요 핀: 12접점 — a, b, c, d, e, f, g, dp, DIG1, DIG2, DIG3, DIG4
- 연결 방식: GPIO 멀티플렉싱
- 구분점: 핀 구성 목록은 논리 신호입니다. 실제 패키지 핀 순서는 제품 도면을 확인합니다. 콜론 연결이 있는 제품은 회로를 함께 확인합니다.
- 근거: [Green 7-segment clock display - 0.56 digit height : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/813)

<a id="sevenseg-tm1637-4"></a>
#### TM1637 4자리 표시 모듈 4핀

- 외형: 4자리 표시창 뒤에 드라이버 PCB와 Grove 커넥터. [사진](https://files.seeedstudio.com/wiki/Grove-4-Digit_Display/img/Grove-4_digit_display.jpg)
- 주요 핀: 4접점 — VCC, GND, CLK, DIO
- 연결 방식: TM1637 전용 2선
- 구분점: 표시 소자는 12핀이나 외부 연결은 4핀입니다. CLK/DIO는 I²C SDA/SCL과 같은 프로토콜이 아닙니다.
- 근거: [Grove - 4-Digit Display  /  Seeed Studio Wiki](https://wiki.seeedstudio.com/Grove-4-Digit_Display/)

### 온도 센서

<a id="tmp36-to92-3"></a>
#### TMP36 아날로그 온도 센서 3핀

- 외형: 검은 TO-92 반원형 몸체와 세 다리. [사진](https://cdn-shop.adafruit.com/970x728/165-02.jpg)
- 주요 핀: 3접점 — VS, VOUT, GND
- 연결 방식: ADC
- 구분점: DS18B20과 비슷하게 보여도 출력은 아날로그 전압입니다.
- 근거: [TMP36 - Analog Temperature sensor [TMP36] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/165)

<a id="ds18b20-to92-3"></a>
#### DS18B20 디지털 온도 센서 3핀

- 외형: TMP36과 비슷한 TO-92 패키지. [사진](https://cdn-shop.adafruit.com/970x728/374-01.jpg)
- 주요 핀: 3접점 — GND, DQ, VDD
- 연결 방식: 1-Wire
- 구분점: 동일한 3핀 외형이어도 TMP36과 핀 기능·통신 방식이 다릅니다. 앱은 TMP36 전달식을 사용합니다.
- 근거: [DS18B20 Digital temperature sensor + extras : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/374)

<a id="ds18b20-probe-3"></a>
#### 방수 DS18B20 프로브 3선

- 외형: 스테인리스 튜브 센서와 길게 나온 3선 케이블. [사진](https://cdn-shop.adafruit.com/970x728/381-01.jpg)
- 주요 핀: 3접점 — VDD, GND, DQ
- 연결 방식: 1-Wire
- 구분점: 선 색상만으로 신호를 단정하지 않고 해당 제품 배선 설명을 확인합니다.
- 근거: [Waterproof 1-Wire DS18B20 Digital temperature sensor : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/381)

### 초음파 센서

<a id="hcsr04-4"></a>
#### HC-SR04 초음파 4핀

- 외형: 두 원형 초음파 소자가 나란히 있는 PCB와 4핀 헤더. [사진](https://cdn-shop.adafruit.com/970x728/3942-00.jpg)
- 주요 핀: 4접점 — VCC, TRIG, ECHO, GND
- 연결 방식: GPIO/TIM Capture
- 근거: [HC-SR04 Ultrasonic Sonar Distance Sensor + 2 x 10K resistors : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/3942)

<a id="urm09-trig-3"></a>
#### URM09 Trig 초음파 3핀

- 외형: 초음파 소자와 3핀 Gravity 커넥터. [사진](https://dfimg.dfrobot.com/enshop/image/data/SEN0388/SEN0388_251022 (1)_1200x630.jpg.webp)
- 주요 핀: 3접점 — VCC, GND, TRIG-ECHO
- 연결 방식: GPIO 양방향
- 구분점: Trig/Echo 공유 한 신호를 쓰므로 앱의 분리 4핀 HC-SR04와 다르게 구현해야 합니다.
- 근거: [Gravity: URM09 Ultrasonic Distance Sensor (2～500cm, Trig)  /  DFRobot Wiki](https://wiki.dfrobot.com/sen0388/)

<a id="urm09-i2c-4"></a>
#### URM09 I²C 초음파 4핀

- 외형: 초음파 센서와 I²C 커넥터. [사진](https://dfimg.dfrobot.com/enshop/image/data/SEN0304/SEN0304_Main_01.jpg)
- 주요 핀: 4접점 — VCC, GND, SDA, SCL
- 연결 방식: I²C
- 구분점: 4핀이라는 점만 같고 HC-SR04의 TRIG/ECHO와 기능이 다릅니다.
- 근거: [Gravity: URM09 Ultrasonic Distance Sensor (2～500cm, I2C) - DFRobot](https://www.dfrobot.com/product-1832.html)

### 외부 ADC

<a id="ads1115-10"></a>
#### ADS1115 외부 ADC 메인 헤더 10핀

- 외형: ADC 칩과 아날로그 입력 핀을 꺼낸 PCB. [사진](https://cdn-shop.adafruit.com/970x728/1085-10.jpg)
- 주요 핀: 10접점 — VIN, GND, SCL, SDA, ADDR, ALRT, A0, A1, A2, A3
- 연결 방식: I²C
- 별도 접점: QT판은 중복 I²C 커넥터 4접점×2 추가
- 구분점: MCU 내부 ADC1/2/3과 다른 외부 칩입니다. 실제 사진의 보드 리비전을 확인합니다.
- 근거: [Pinouts  /  Adafruit 4-Channel ADC Breakouts  /  Adafruit Learning System](https://learn.adafruit.com/adafruit-4-channel-adc-breakouts/pinouts) · [ADS1115 16-Bit ADC - 4 Channel with Programmable Gain Amplifier [STEMMA QT / Qwiic] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/1085)

### 외부 DAC

<a id="mcp4725-6"></a>
#### MCP4725 외부 DAC 메인 헤더 6핀

- 외형: DAC 칩과 아날로그 출력이 있는 작은 PCB. [사진](https://cdn-shop.adafruit.com/970x728/935-11.jpg)
- 주요 핀: 6접점 — VIN, GND, SCL, SDA, A0, VOUT
- 연결 방식: I²C
- 별도 접점: QT판은 중복 I²C 커넥터 4접점×2 및 VOUT/GND 단자 옵션
- 구분점: MCU 내부 DAC의 외형이 아니라 외부 I²C DAC 예시입니다.
- 근거: [Pinouts  /  MCP4725 12-Bit DAC Tutorial  /  Adafruit Learning System](https://learn.adafruit.com/mcp4725-12-bit-dac-tutorial/pinouts) · [MCP4725 Breakout Board - 12-Bit DAC with I2C Interface [STEMMA QT / qwiic] : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/935)

### CAN 트랜시버

<a id="can-transceiver-6"></a>
#### SN65HVD230 CAN 보드 주요 6단자

- 외형: CAN 트랜시버 PCB에 논리 측 4핀 헤더와 버스 측 2단자. [사진](https://www.waveshare.com/w/upload/9/92/SN65HVD230-CAN-Board_l.jpg)
- 주요 핀: 6접점 — 3V3, GND, CAN-TX, CAN-RX, CANH, CANL
- 연결 방식: MCU CAN ↔ CAN 버스
- 구분점: 제조사 회로도에서 Header4 + Header2를 확인했습니다. CANH/CANL은 MCU GPIO에 직접 연결하는 선이 아닙니다.
- 근거: [Waveshare CAN Board 회로도 Header4 + Header2](https://files.waveshare.com/upload/c/c5/SN65HVD230-CAN-Board-Schematic.pdf) · [SN65HVD230 CAN Board - Waveshare Wiki](https://www.waveshare.com/wiki/SN65HVD230_CAN_Board) · [SN65HVD230 CAN Board Accessory board used for connecting MCUs to the CAN network, 3.3V, ESD protection](https://www.waveshare.com/product/sn65hvd230-can-board.htm)

### RS485 모듈

<a id="isolated-rs485"></a>
#### DFR0845 절연 RS485 모듈 총 10접점

- 외형: 절연 전원과 버스 단자가 있는 통신 변환 PCB. [사진](https://dfimg.dfrobot.com/enshop/DFR0845/DFR0845_Main_01.jpg)
- 주요 핀: 10접점 — TX, RX, GND-UART, VCC, 12V-OUT, GND-485, A, B, 12V-IN, GND-IN
- 연결 방식: UART ↔ RS485
- 별도 접점: UART 4 + RS485 4 + 외부 전원 2
- 구분점: 제조사 핀 표에서 UART 4핀, RS485 4단자, 외부 전원 입력 2단자를 구분합니다.
- 근거: [DFRobot DFR0845 핀 구성](https://wiki.dfrobot.com/dfr0845/) · [Active Isolated RS485 to UART Signal Adapter Module - DFRobot](https://www.dfrobot.com/product-2392.html)

### 외부 RTC

<a id="ds3231-8"></a>
#### DS3231 RTC 메인 헤더 8핀

- 외형: RTC 칩과 코인셀 홀더를 함께 실장한 보드. [사진](https://cdn-shop.adafruit.com/970x728/3013-06.jpg)
- 주요 핀: 8접점 — VIN, GND, SCL, SDA, BAT, 32K, SQW, RST
- 연결 방식: I²C
- 별도 접점: QT판은 중복 I²C 커넥터 4접점×2 추가
- 구분점: 내부 RTC 주변장치와 별개인 외부 RTC입니다.
- 근거: [Pinouts  /  Adafruit DS3231 Precision RTC Breakout  /  Adafruit Learning System](https://learn.adafruit.com/adafruit-ds3231-precision-rtc-breakout/pinouts) · [Adafruit DS3231 Precision RTC Breakout : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/3013)

### SD 카드

<a id="sd-storage-board"></a>
#### Micro SD Storage Board 9핀

- 외형: microSD 소켓과 한 줄 9핀 헤더가 있는 PCB. [사진](https://www.waveshare.com/w/upload/3/31/Micro-SD-Storage-Board_l.jpg)
- 주요 핀: 9접점 — 3V3, D0, D1, D2, D3, CMD, CLK, GND, CD
- 연결 방식: SPI/SDIO
- 구분점: 제조사 회로도 P1은 Header9입니다. SD카드 자체 8접점, 소켓의 검출 접점과 외부 헤더를 구분합니다.
- 근거: [Waveshare Micro SD Storage Board 회로도 P1 Header 9](https://files.waveshare.com/upload/8/83/Micro-SD-Storage-Board-Schematic.pdf) · [Micro SD Storage Board - Waveshare Wiki](https://www.waveshare.com/wiki/Micro_SD_Storage_Board) · [Micro SD Storage Board Micro SD card module](https://www.waveshare.com/product/micro-sd-storage-board.htm)

### 디지털 오디오

<a id="max98357a-9"></a>
#### MAX98357A 모노 앰프 입력7+스피커2

- 외형: 작은 앰프 PCB와 두 개의 스피커 나사 단자. [사진](https://cdn-shop.adafruit.com/970x728/3006-04.jpg)
- 주요 핀: 9접점 — VIN, GND, DIN, BCLK, LRC, GAIN, SD, SPK+, SPK-
- 연결 방식: I²S
- 구분점: I²S 디지털 오디오용입니다. I²C 제어장치 또는 피에조 부저와 다른 장치입니다.
- 근거: [Pinouts - Mono  /  Adafruit MAX98357 I2S Class-D Amps - Stereo and Mono  /  Adafruit Learning System](https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts) · [Adafruit I2S 3W Class D Amplifier Breakout - MAX98357A : Adafruit Industries, Unique & fun DIY electronics and kits](https://www.adafruit.com/product/3006)

### 카메라

<a id="ov2640-camera"></a>
#### OV2640 Camera Board 18핀

- 외형: 작은 렌즈가 올라간 카메라 PCB와 9×2 병렬 신호 헤더. [사진](https://www.waveshare.com/w/upload/8/81/OV2640-Camera-Board_l.jpg)
- 주요 핀: 18접점 — 3V3, GND, SIO_CLK, SIO_DAT, VSYNC, HREF, PCLK, XCLK, Y9, Y8, Y7, Y6, Y5, Y4, Y3, Y2, RESET, PWDN
- 연결 방식: DCMI/DVP + SCCB
- 구분점: 제조사 회로도 P1은 Header 9×2입니다. 센서 자체 24핀과 외부 헤더 18핀을 혼동하지 않습니다. F446RE에서의 사용 가능 핀 조합은 별도 검토 대상입니다.
- 근거: [Waveshare OV2640 Camera Board 회로도 P1 Header 9×2](https://files.waveshare.com/upload/9/99/OV2640-Camera-Board-Schematic.pdf) · [OV2640 Camera Board - Waveshare Wiki](https://www.waveshare.com/wiki/OV2640_Camera_Board) · [OV2640 Camera Board Camera module, 2 Megapixel](https://www.waveshare.com/product/ov2640-camera-board.htm)

### DHT11

<a id="dht11-module-3"></a>
#### DHT11 센서 모듈 3핀

- 외형: 구멍이 있는 센서 케이스가 소형 PCB에 장착됨. [사진](https://www.waveshare.com/w/upload/f/f4/Temperature-Humidity-Sensor_l.jpg)
- 주요 핀: 3접점 — VCC, GND, DATA
- 연결 방식: 단선 전용
- 구분점: 나형 DHT11의 4핀에는 NC가 포함됩니다. 모듈 외부 3핀과 나형 4핀을 구분합니다.
- 근거: [DHT11 Temperature-Humidity Sensor - Waveshare Wiki](https://www.waveshare.com/wiki/DHT11_Temperature-Humidity_Sensor)

### DHT22

<a id="dht22-module-3"></a>
#### DHT22 센서 모듈 3핀

- 외형: 환기 구멍이 있는 케이스와 PCB·3핀 커넥터. [사진](https://www.waveshare.com/w/upload/5/52/DHT22-Temperature-Humidity-Sensor-1.jpg)
- 주요 핀: 3접점 — VCC, GND, DATA
- 연결 방식: 단선 전용
- 구분점: 나형 DHT22의 4핀과 구분합니다. SHT31의 I²C 통신과도 다릅니다.
- 근거: [DHT22 Temperature-Humidity Sensor - Waveshare Wiki](https://www.waveshare.com/wiki/DHT22_Temperature-Humidity_Sensor)

## MCU 내부 주변장치와 외부 부품의 관계

TIM·ADC·DAC·DMA·RCC 등은 MCU 안에 있는 기능 블록으로, 각각 독립적인 실물 부품 외형이 있는 것은 아니다. 외부 ADC·DAC·RTC 모듈 사진은 해당 내부 기능의 사진으로 사용하지 않는다. F446 시리즈 기능과 F446RE 64핀 패키지에서 실제 연결 가능한 신호는 데이터시트·AF 표·보드 회로도로 대조한다. [ST STM32F446RE 공식 MCU 페이지](https://www.st.com/en/microcontrollers-microprocessors/stm32f446re.html) · [STM32F446xC/E DS10693 데이터시트](https://www.st.com/resource/en/datasheet/stm32f446mc.pdf)

| 내부 기능 | 현재 구현 범위 | 외형·배선 확인 사항 |
|---|---|---|
| GPIO/EXTI | 일부 구현 | 입출력·Pull·외부 인터럽트. 물리 외형은 MCU 핀과 보드 헤더입니다. |
| TIM1/TIM8 | 미구현 | 고급 제어 타이머. 보완 출력·데드타임 등의 기능은 별도 모델 대상입니다. |
| TIM2/TIM5 | 부분 구현 | 32비트 카운터·IRQ·PWM·입력 캡처·엔코더 지원 범위 확인. |
| TIM3/TIM4 | 부분 구현 | 16비트 카운터·IRQ·PWM·입력 캡처·엔코더 지원 범위 확인. |
| TIM6/TIM7 | 미구현 | 기본 타이머. 자체 부품 외형은 없습니다. |
| TIM9~TIM14 | 미구현 | 추가 타이머. 실제 채널 핀은 F446RE 패키지 AF 표에서 확인. |
| ADC1/ADC2/ADC3 | ADC1 일부 | 내부 ADC는 독립 센서가 아닙니다. 분압·온도 센서 등이 입력 예시입니다. |
| DAC | 미구현 | 내부 아날로그 출력. 외부 MCP4725와 별개입니다. |
| USART1/2/3/6 및 UART4/5 | 일부 구현 | TX/RX·포트별 처리. RS485 같은 물리 계층은 외부 트랜시버를 구분합니다. |
| I²C 및 FMPI2C | I2C1 일부 | 기타 인스턴스·FMPI2C는 별도. 데이터시트의 패키지별 핀 확인. |
| SPI/I²S | SPI1 일부 | SPI 메모리·표시장치와 I²S 오디오 장치는 별도 프로토콜입니다. |
| SAI1/SAI2 | 미구현 | 직렬 오디오. 보드에서 사용할 수 있는 신호 조합 확인. |
| CAN1/CAN2 | 미구현 | CAN 컨트롤러는 MCU 내부이며 외부 트랜시버·버스 단자가 필요합니다. |
| USB OTG FS/HS | 미구현 | MCU 사용자 USB와 보드의 ST-LINK USB를 구분합니다. HS는 PHY 구성도 확인. |
| SDIO | 미구현 | SD 카드·소켓은 외부 부품, SDIO는 내부 인터페이스입니다. |
| DCMI | 미구현 | 카메라 병렬 신호와 실제 64핀 패키지의 사용 가능 핀 대조. |
| QUADSPI | 미구현 | 외부 플래시 패키지와 별개인 내부 메모리 인터페이스입니다. |
| FMC | 미구현/패키지 검토 | 시리즈 공통 기능을 64핀 보드에 곧바로 사용 가능하다고 간주하지 않습니다. |
| SPDIFRX/CEC | 미구현 | 외부 오디오·HDMI 연결 회로가 별도로 필요합니다. |
| RTC/Backup | 미구현 | 내부 RTC와 외부 DS3231 모듈을 구분합니다. |
| DMA1/DMA2 | 소스 해석 모델 일부 | 실제 DMA 스트림·채널·버스 동작 전체와는 구분합니다. |
| IWDG/WWDG/SysTick | HAL Tick 일부 | 감시 타이머·코어 타이머. 외형은 MCU 자체입니다. |
| RCC/PWR/FLASH/SYSCFG/CRC | 부분 설정 또는 미구현 | 클록·전원·플래시·시스템 설정·CRC는 내부 블록입니다. |
| NVIC/Core Debug | IRQ/외부 GDB 일부 | NVIC·코어 기능과 ST-LINK 같은 외부 디버거의 외형을 구분합니다. |

## 추가 구현에서 먼저 분리할 모델

- 2핀 소자와 전원·신호를 따로 받는 3핀 모듈. 3핀에 NC가 있는 부저 모듈도 별도로 구분한다.
- LCD 병렬 16핀과 I²C 4핀, OLED 4/7/8핀, TFT 백라이트 단자 유무.
- 공통 양극·공통 음극 RGB 4핀과 주소지정 LED의 DIN/DOUT 4핀, TM1637 전용 통신과 I²C.
- 현재 MPU6050 4단자와 실제 8핀 보드, 현재 메모리의 단순화된 4/6단자와 실제 EEPROM 패키지.
- 릴레이 제어3+접점3, L298N 주요 외부13+점퍼, 스테퍼 모터4/5선과 드라이버 입력4.

단일 핀 수로 부품을 식별하지 않고 모델명·커넥터 묶음·통신 방식·공통극을 함께 사용한다.
