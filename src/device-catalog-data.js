// Generated from the researched device inventory. Original photographs are references, not bundled assets.
export const DEVICE_CATALOG = [
  {
    "id": "nucleo-f446re",
    "family": "board",
    "name": "NUCLEO-F446RE 보드",
    "pin_count": null,
    "pins": [],
    "interface": "보드",
    "appearance": "흰색 PCB 상단 ST-LINK, 중앙 MCU, 양쪽 Arduino/Morpho 헤더.",
    "notes": "MCU 패키지 64핀과 보드 헤더 접점 수는 서로 다른 수입니다. 보드 헤더의 핀·전원·NC를 별도로 구분합니다.",
    "additional_contacts": "보드 커넥터는 보드 핀맵 기준; 부품용 핀 수 필터에서 제외",
    "source_ids": [
      "board",
      "mcu"
    ],
    "visual_source_id": "board",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "ST NUCLEO-F446RE 공식 보드 페이지",
        "url": "https://www.st.com/en/evaluation-tools/nucleo-f446re.html"
      },
      {
        "title": "ST STM32F446RE 공식 MCU 페이지",
        "url": "https://www.st.com/en/microcontrollers-microprocessors/stm32f446re.html"
      }
    ],
    "image": "https://a.allegroimg.com/original/1131a1/bd4caa2543e88d68cc0e2b339dae/STM32-NUCLEO-F446RE-STM32F446RE-ARM-Cortex-M4"
  },
  {
    "id": "resistor-axial-2",
    "family": "resistor",
    "name": "축형 저항 2핀",
    "pin_count": 2,
    "pins": [
      "R1",
      "R2"
    ],
    "interface": "수동 소자",
    "appearance": "색띠가 있는 원통형 몸체 양끝에 리드.",
    "notes": "출처 제품은 220Ω입니다. 앱 기본 330Ω과 값이 다르지만 동일한 축형 외형 참고입니다.",
    "additional_contacts": "",
    "source_ids": [
      "resistor"
    ],
    "visual_source_id": "resistor",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Through-Hole Resistors - 220 ohm 5% 1/4W - Pack of 25 : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/2780"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/2780-00.jpg"
  },
  {
    "id": "led-tht-2",
    "family": "led",
    "name": "5mm 단색 LED 2핀",
    "pin_count": 2,
    "pins": [
      "A",
      "K"
    ],
    "interface": "GPIO/PWM",
    "appearance": "둥근 렌즈와 길이가 다른 두 다리. 케이스 평면과 캐소드 표시 확인.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "led"
    ],
    "visual_source_id": "led",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Super Bright Red 5mm LED (25 pack) : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/297"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/297-00.jpg"
  },
  {
    "id": "button-2",
    "family": "button",
    "name": "2핀 순간 버튼",
    "pin_count": 2,
    "pins": [
      "SW1",
      "SW2"
    ],
    "interface": "GPIO/EXTI",
    "appearance": "작은 누름 몸체에 두 전기 단자. 누를 때 연결.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "button2"
    ],
    "visual_source_id": "button2",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Soft Tactile Button (8mm) x 10 : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/3101"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/3101-00.jpg"
  },
  {
    "id": "button-4",
    "family": "button",
    "name": "4핀 택트 버튼",
    "pin_count": 4,
    "pins": [
      "A1",
      "B1",
      "A2",
      "B2"
    ],
    "interface": "GPIO/EXTI",
    "appearance": "사각 플라스틱 몸체와 금속 덮개, 양쪽 두 다리.",
    "notes": "4핀은 독립 스위치 네 개가 아닙니다. 같은 측 접점 쌍의 내부 연결은 제조사 도면으로 확인합니다.",
    "additional_contacts": "",
    "source_ids": [
      "button4"
    ],
    "visual_source_id": "button4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Tactile Switch Buttons (12mm square, 6mm tall) x 10 pack : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/1119"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/1119-03.jpg"
  },
  {
    "id": "button-module-3",
    "family": "button",
    "name": "KY-004 버튼 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "S",
      "+V",
      "GND"
    ],
    "interface": "GPIO/EXTI",
    "appearance": "택트 스위치가 작은 PCB 위에 있고 한쪽에 3핀 헤더.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "button3"
    ],
    "visual_source_id": "button3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-004 Button - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-004"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-004/KY-004.png"
  },
  {
    "id": "lcd-parallel-16",
    "family": "lcd",
    "name": "LCD 1602 병렬형 16핀",
    "pin_count": 16,
    "pins": [
      "VSS",
      "VDD",
      "VO",
      "RS",
      "R/W",
      "E",
      "D0",
      "D1",
      "D2",
      "D3",
      "D4",
      "D5",
      "D6",
      "D7",
      "A",
      "K"
    ],
    "interface": "GPIO 병렬",
    "appearance": "긴 문자 LCD와 한 줄 16개 패드·헤더.",
    "notes": "4비트 모드로 사용해도 물리 핀은 16개입니다.",
    "additional_contacts": "",
    "source_ids": [
      "lcd16"
    ],
    "visual_source_id": "lcd16",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Standard LCD 16x2 + extras [white on blue] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/181"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/181-06.jpg"
  },
  {
    "id": "lcd-i2c-4",
    "family": "lcd",
    "name": "LCD1602 I²C 모듈 4핀",
    "pin_count": 4,
    "pins": [
      "VCC",
      "GND",
      "SCL",
      "SDA"
    ],
    "interface": "I²C",
    "appearance": "문자 LCD에 I²C 변환 보드가 결합된 형태.",
    "notes": "외부 인터페이스는 4핀입니다. LCD 본체의 16핀과 합쳐 세지 않습니다. 현재 병렬 LCD와 구동 코드가 다릅니다.",
    "additional_contacts": "",
    "source_ids": [
      "lcd4"
    ],
    "visual_source_id": "lcd4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "LCD1602 I2C Module - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/LCD1602_I2C_Module"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/9/9e/LCD1602_RGB_Module011.jpg"
  },
  {
    "id": "breadboard-400",
    "family": "breadboard",
    "name": "400홀 빵판",
    "pin_count": null,
    "pins": [],
    "interface": "배선",
    "appearance": "중앙 홈 양옆의 접점과 두 쌍의 전원 레일.",
    "notes": "400은 구멍 수입니다. 400핀 IC로 분류하지 않습니다.",
    "additional_contacts": "400홀; 내부 버스 연결은 레일 분리 여부까지 확인",
    "source_ids": [
      "breadboard"
    ],
    "visual_source_id": "breadboard",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Half Sized Premium Breadboard - 400 Tie Points : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/64"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/64-06.jpg"
  },
  {
    "id": "ldr-bare-2",
    "family": "ldr",
    "name": "CdS 광저항 소자 2핀",
    "pin_count": 2,
    "pins": [
      "R1",
      "R2"
    ],
    "interface": "ADC 분압",
    "appearance": "원형 감광 면 위 지그재그 패턴과 두 리드.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "ldr2"
    ],
    "visual_source_id": "ldr2",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Photo cell (CdS photoresistor) : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/161"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/161-00.jpg"
  },
  {
    "id": "ldr-module-3",
    "family": "ldr",
    "name": "KY-018 광저항 분압 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "S",
      "+V",
      "GND"
    ],
    "interface": "ADC",
    "appearance": "광저항과 고정 저항이 작은 PCB에 실장됨.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "ldr3"
    ],
    "visual_source_id": "ldr3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-018 Photoresistor - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-018"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-018/KY-018.png"
  },
  {
    "id": "ldr-comparator-4",
    "family": "ldr",
    "name": "광저항 AO/DO 비교기 모듈 4핀",
    "pin_count": 4,
    "pins": [
      "VCC",
      "GND",
      "AO",
      "DO"
    ],
    "interface": "ADC/GPIO",
    "appearance": "광저항, 임계값 조절 트리머, 비교기 칩이 있는 PCB.",
    "notes": "AO 아날로그 출력과 DO 임계값 출력은 별도 신호입니다.",
    "additional_contacts": "",
    "source_ids": [
      "ldr4"
    ],
    "visual_source_id": "ldr4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Photoresistor Module — SunFounder Universal Maker Sensor Kit  documentation",
        "url": "https://docs.sunfounder.com/projects/umsk/en/latest/01_components_basic/11-component_photoresistor.html"
      }
    ],
    "image": "https://docs.sunfounder.com/projects/umsk/en/latest/_images/11_photoresistor_module.png"
  },
  {
    "id": "ntc-bare-2",
    "family": "ntc",
    "name": "NTC 서미스터 2핀",
    "pin_count": 2,
    "pins": [
      "R1",
      "R2"
    ],
    "interface": "ADC 분압",
    "appearance": "작은 에폭시 비드 센서와 두 리드·케이블.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "ntc2"
    ],
    "visual_source_id": "ntc2",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "10K Precision Epoxy Thermistor [3950 NTC] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/372"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/372-01.jpg"
  },
  {
    "id": "ntc-module-3",
    "family": "ntc",
    "name": "KY-013 NTC 분압 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "S",
      "+V",
      "GND"
    ],
    "interface": "ADC",
    "appearance": "서미스터와 분압 저항이 붙은 3핀 PCB.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "ntc3"
    ],
    "visual_source_id": "ntc3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-013 Temperature sensor (NTC) - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-013"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-013/KY-013.png"
  },
  {
    "id": "sht31-grove-4",
    "family": "sht31",
    "name": "Grove SHT31 4핀",
    "pin_count": 4,
    "pins": [
      "VCC",
      "GND",
      "SDA",
      "SCL"
    ],
    "interface": "I²C",
    "appearance": "작은 센서 칩과 Grove 4핀 소켓.",
    "notes": "Grove 커넥터의 VCC·GND·SDA·SCL 4신호로 I²C 통신합니다.",
    "additional_contacts": "",
    "source_ids": [
      "sht31four"
    ],
    "visual_source_id": "sht31four",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Grove - Temp and Humi Sensor(SHT31) | Seeed Studio Wiki",
        "url": "https://wiki.seeedstudio.com/Grove-TempAndHumi_Sensor-SHT31/"
      }
    ],
    "image": "https://files.seeedstudio.com/wiki/Grove-TempAndHumi_Sensor-SHT31/img/main_new.jpg"
  },
  {
    "id": "sht31-breakout-7",
    "family": "sht31",
    "name": "Adafruit SHT31-D 헤더 7핀",
    "pin_count": 7,
    "pins": [
      "VIN",
      "GND",
      "SCL",
      "SDA",
      "ADR",
      "RST",
      "ALR"
    ],
    "interface": "I²C",
    "appearance": "센서 칩, 주소 점퍼, 추가 신호를 꺼낸 PCB.",
    "notes": "주소·리셋·알림 세 신호가 4핀형과의 차이입니다.",
    "additional_contacts": "STEMMA QT판은 중복 I²C 커넥터 4접점×2 추가",
    "source_ids": [
      "sht31",
      "sht31product"
    ],
    "visual_source_id": "sht31product",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Pinouts | Adafruit SHT31-D Temperature & Humidity Sensor Breakout | Adafruit Learning System",
        "url": "https://learn.adafruit.com/adafruit-sht31-d-temperature-and-humidity-sensor-breakout/pinouts"
      },
      {
        "title": "Adafruit Sensirion SHT31-D [Temperature & Humidity Sensor] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/2857"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/2857-03.jpg"
  },
  {
    "id": "mpu6050-8",
    "family": "mpu6050",
    "name": "SEN-MPU6050 8핀",
    "pin_count": 8,
    "pins": [
      "VCC",
      "GND",
      "SCL",
      "SDA",
      "XDA",
      "XCL",
      "AD0",
      "INT"
    ],
    "interface": "I²C",
    "appearance": "센서 칩과 작은 레귤레이터, 장착홀, 한 줄 8핀 헤더.",
    "notes": "VCC·GND·SCL·SDA로 I²C 통신합니다. AD0를 GND에 연결하면 주소 0x68입니다. 보조 I²C(XDA·XCL)와 INT는 시뮬레이션하지 않습니다.",
    "additional_contacts": "",
    "source_ids": [
      "mpu8"
    ],
    "visual_source_id": "mpu8",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Motion sensor MPU6050 (Gyroscope) | Joy-IT",
        "url": "https://www.joy-it.net/en/products/SEN-MPU6050"
      }
    ],
    "image": "https://www.joy-it.net/files/files/Produkte/SEN-MPU6050/SEN-MPU6050_1.png"
  },
  {
    "id": "pir-3",
    "family": "pir",
    "name": "PIR 감지 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "VCC",
      "OUT",
      "GND"
    ],
    "interface": "GPIO/EXTI",
    "appearance": "흰색 프레넬 렌즈가 센서 위를 덮고 하부에 PCB가 있음.",
    "notes": "전면 방향만 보고 3핀 순서를 추정하지 않고 PCB 실크를 확인합니다.",
    "additional_contacts": "",
    "source_ids": [
      "pir"
    ],
    "visual_source_id": "pir",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "PIR (motion) sensor : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/189"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/189-04.jpg"
  },
  {
    "id": "oled-i2c-4",
    "family": "oled",
    "name": "SSD1306 I²C OLED 4핀",
    "pin_count": 4,
    "pins": [
      "VCC",
      "GND",
      "SCL",
      "SDA"
    ],
    "interface": "I²C",
    "appearance": "작은 검은 유리 표시창과 4핀 헤더가 있는 PCB.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "oled4"
    ],
    "visual_source_id": "oled4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "0,96\" OLED display | Joy-IT",
        "url": "https://www.joy-it.net/en/products/SBC-OLED01"
      }
    ],
    "image": "https://www.joy-it.net/files/files/Produkte/SBC-OLED01/SBC-OLED01-1b.png"
  },
  {
    "id": "oled-configurable-7",
    "family": "oled",
    "name": "Waveshare 0.96 OLED 헤더 7핀",
    "pin_count": 7,
    "pins": [
      "VCC",
      "GND",
      "DIN",
      "CLK",
      "CS",
      "DC",
      "RES"
    ],
    "interface": "SPI/I²C 선택",
    "appearance": "작은 OLED 뒤쪽에 통신 선택 저항과 추가 제어 핀.",
    "notes": "현재 제품 문서는 SSD1315를 명시합니다. SSD1306과 같은 칩으로 취급하지 않습니다. I²C 선택 시에도 물리 헤더는 7핀입니다.",
    "additional_contacts": "",
    "source_ids": [
      "oled7"
    ],
    "visual_source_id": "oled7",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "0.96inch OLED Module - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/0.96inch_OLED_Module"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/4/4a/0.96inch_OLED_Module.jpg"
  },
  {
    "id": "oled-configurable-8",
    "family": "oled",
    "name": "Adafruit 구형 128×64 OLED 8핀",
    "pin_count": 8,
    "pins": [
      "GND",
      "3V3",
      "VIN",
      "D0",
      "D1",
      "RST",
      "DC",
      "CS"
    ],
    "interface": "SPI/I²C 선택",
    "appearance": "전원 핀 둘과 데이터·제어 핀을 한 줄로 꺼낸 OLED PCB.",
    "notes": "가이드에서 8핀 헤더를 확인했습니다. 신형 리비전과 핀 구성이 다를 수 있습니다.",
    "additional_contacts": "",
    "source_ids": [
      "oledspi"
    ],
    "visual_source_id": "oledspi",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Wiring 128x64 OLEDs | Monochrome OLED Breakouts | Adafruit Learning System",
        "url": "https://learn.adafruit.com/monochrome-oled-breakouts/wiring-128x64-oleds"
      }
    ],
    "image": "https://cdn-learn.adafruit.com/guides/images/000/000/039/medium800/938-17.jpg"
  },
  {
    "id": "st7735-8",
    "family": "tft",
    "name": "ST7735S 1.8인치 TFT 8핀",
    "pin_count": 8,
    "pins": [
      "VCC",
      "GND",
      "DIN",
      "CLK",
      "CS",
      "DC",
      "RST",
      "BL"
    ],
    "interface": "SPI",
    "appearance": "컬러 표시창과 8핀 케이블 인터페이스.",
    "notes": "BL은 백라이트 단자로, 예제는 3V3에 연결합니다. 실제 모듈의 화면 원점·컨트롤러도 확인해야 합니다.",
    "additional_contacts": "",
    "source_ids": [
      "tft8"
    ],
    "visual_source_id": "tft8",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "1.8inch LCD Module - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/1.8inch_LCD_Module"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/a/ae/1.8inch-LCD-Module-1.jpg"
  },
  {
    "id": "matrix-10",
    "family": "matrix",
    "name": "MAX7219 8×8 매트릭스 입력5+출력5",
    "pin_count": 10,
    "pins": [
      "VCC-IN",
      "GND-IN",
      "DIN",
      "CS/LOAD-IN",
      "CLK-IN",
      "VCC-OUT",
      "GND-OUT",
      "DOUT",
      "CS/LOAD-OUT",
      "CLK-OUT"
    ],
    "interface": "직렬/SPI 유사",
    "appearance": "큰 8×8 LED 블록 뒤에 드라이버 PCB와 양쪽 5핀 헤더.",
    "notes": "왼쪽 입력 5핀으로 구동합니다. 오른쪽 출력 쪽 VCC·GND·CS·CLK는 입력과 내부 연결되고, 다음 모듈로 이어지는 DOUT은 시뮬레이션하지 않습니다.",
    "additional_contacts": "",
    "source_ids": [
      "matrix"
    ],
    "visual_source_id": "matrix",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "LED Matrix Module — SunFounder Ulimate Raphael Kit for Raspberry Pi  documentation",
        "url": "https://docs.sunfounder.com/projects/raphael-kit/en/latest/_shared/component/cpn_max7219_module.html"
      }
    ],
    "image": "https://docs.sunfounder.com/projects/raphael-kit/en/latest/_images/max7219_module.jpg"
  },
  {
    "id": "servo-3",
    "family": "servo",
    "name": "RC 마이크로 서보 3선",
    "pin_count": 3,
    "pins": [
      "VCC",
      "GND",
      "PWM"
    ],
    "interface": "TIM PWM",
    "appearance": "작은 기어박스, 회전축·혼, 3선 케이블.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "servo3"
    ],
    "visual_source_id": "servo3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Micro servo [TowerPro SG92R] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/169"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/169-06.jpg"
  },
  {
    "id": "servo-feedback-4",
    "family": "servo",
    "name": "위치 피드백 RC 서보 4선",
    "pin_count": 4,
    "pins": [
      "VCC",
      "GND",
      "PWM",
      "FEEDBACK"
    ],
    "interface": "TIM PWM + ADC",
    "appearance": "일반 서보와 비슷하지만 위치 전압 피드백 선이 하나 더 있음.",
    "notes": "추가 선은 두 번째 PWM 입력이 아닙니다. 위치 피드백 선은 각도에 비례한 전압(0~180° → 0~3.3 V)을 냅니다.",
    "additional_contacts": "",
    "source_ids": [
      "servo4"
    ],
    "visual_source_id": "servo4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Analog Feedback Micro Servo - Plastic Gear : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/1449"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/1449-05.jpg"
  },
  {
    "id": "dc-motor-2",
    "family": "dc_motor",
    "name": "브러시 DC 모터 2단자",
    "pin_count": 2,
    "pins": [
      "M+",
      "M-"
    ],
    "interface": "외부 드라이버",
    "appearance": "금속 원통, 회전축, 두 전원 단자.",
    "notes": "두 단자에 모터 드라이버 출력(L298N OUT1/OUT2 등)을 연결합니다. 전압 방향에 따라 정회전·역회전합니다.",
    "additional_contacts": "",
    "source_ids": [
      "dc2"
    ],
    "visual_source_id": "dc2",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "DC Toy / Hobby Motor - 130 Size : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/711"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/711-06.jpg"
  },
  {
    "id": "motor-driver-hat",
    "family": "motor",
    "name": "PCA9685 / TB6612 모터 Driver HAT",
    "pin_count": 51,
    "pins": [
      "5V",
      "3V3",
      "GND",
      "SDA",
      "SCL",
      "VIN",
      "A1",
      "A2",
      "B1",
      "B2",
      "PGND",
      "PI1:3V3",
      "PI2:5V",
      "PI3:SDA",
      "PI4:5V",
      "PI5:SCL",
      "PI6:GND",
      "PI7:GPIO4",
      "PI8:TXD",
      "PI9:GND",
      "PI10:RXD",
      "PI11:GPIO17",
      "PI12:GPIO18",
      "PI13:GPIO27",
      "PI14:GND",
      "PI15:GPIO22",
      "PI16:GPIO23",
      "PI17:3V3",
      "PI18:GPIO24",
      "PI19:MOSI",
      "PI20:GND",
      "PI21:MISO",
      "PI22:GPIO25",
      "PI23:SCLK",
      "PI24:CE0",
      "PI25:GND",
      "PI26:CE1",
      "PI27:ID_SD",
      "PI28:ID_SC",
      "PI29:GPIO5",
      "PI30:GND",
      "PI31:GPIO6",
      "PI32:GPIO12",
      "PI33:GPIO13",
      "PI34:GND",
      "PI35:GPIO19",
      "PI36:GPIO16",
      "PI37:GPIO26",
      "PI38:GPIO20",
      "PI39:GND",
      "PI40:GPIO21"
    ],
    "interface": "모터 드라이버",
    "appearance": "PCA9685 PWM 칩과 TB6612FNG 드라이버, 모터 나사 단자, 40핀 헤더가 있는 HAT 보드.",
    "notes": "40핀 헤더의 SDA·SCL(I²C)로 PCA9685를 제어하고, 모터는 A1/A2·B1/B2 단자, 모터 전원은 VIN/PGND에 연결합니다. 간이 부품 'DC 모터 + H 브리지'와 핀 구성이 다릅니다.",
    "additional_contacts": "HAT 연결 수는 해당 보드 회로도 기준; 앱의 추상 5핀과 별도",
    "source_ids": [
      "motor"
    ],
    "visual_source_id": "motor",
    "pin_order": "외부 제어 5핀, 전원/모터 나사 단자 6개, Raspberry Pi 40핀 커넥터를 구분한 학습용 배치. PI 번호는 Pi 헤더의 물리 핀 번호입니다.",
    "source": [
      {
        "title": "Motor Driver HAT - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/Motor_Driver_HAT"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/9/9e/Motor-Driver-HAT-intro.JPG"
  },
  {
    "id": "stepper-bipolar-4",
    "family": "stepper",
    "name": "바이폴라 스테퍼 4선",
    "pin_count": 4,
    "pins": [
      "A+",
      "A-",
      "B+",
      "B-"
    ],
    "interface": "스테퍼 드라이버",
    "appearance": "사각 금속 모터와 4선 케이블.",
    "notes": "1.8°/스텝의 4선 모터입니다. 모터 4선은 IN1~IN4 논리 입력과 다릅니다.",
    "additional_contacts": "",
    "source_ids": [
      "step4"
    ],
    "visual_source_id": "step4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Stepper motor - NEMA-17 size - 200 steps/rev, 12V 350mA : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/324"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/324-03.jpg"
  },
  {
    "id": "stepper-unipolar-5",
    "family": "stepper",
    "name": "28BYJ-48 모터 5선",
    "pin_count": 5,
    "pins": [
      "COMMON",
      "COIL1",
      "COIL2",
      "COIL3",
      "COIL4"
    ],
    "interface": "ULN2003 구동",
    "appearance": "둥근 기어 모터, 평평한 출력축과 5핀 케이블.",
    "notes": "4선 NEMA 모터와 코일 구성·기어비가 다릅니다. 앱의 1.8° 모델과 동일한 회전각으로 취급하지 않습니다.",
    "additional_contacts": "",
    "source_ids": [
      "step5"
    ],
    "visual_source_id": "step5",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Moto1 Stepper motor controller | Joy-IT",
        "url": "https://www.joy-it.net/en/products/SBC-Moto1"
      }
    ],
    "image": "https://www.joy-it.net/files/files/Produkte/SBC-Moto1/SBC-Moto1_01.png"
  },
  {
    "id": "stepper-driver-11",
    "family": "stepper",
    "name": "ULN2003 모듈 제어4+전원2+모터5",
    "pin_count": 11,
    "pins": [
      "IN1",
      "IN2",
      "IN3",
      "IN4",
      "V+",
      "GND",
      "M-COM",
      "M1",
      "M2",
      "M3",
      "M4"
    ],
    "interface": "4상 논리 입력",
    "appearance": "드라이버 칩, 상태 LED, 모터 소켓이 있는 PCB.",
    "notes": "제어 입력 4핀(IN1~IN4), 전원 2핀, 모터 소켓 5접점입니다. 모터 소켓에 28BYJ-48 같은 5선 유니폴라 모터를 연결합니다.",
    "additional_contacts": "",
    "source_ids": [
      "step5"
    ],
    "visual_source_id": "step5",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Moto1 Stepper motor controller | Joy-IT",
        "url": "https://www.joy-it.net/en/products/SBC-Moto1"
      }
    ],
    "image": "https://www.joy-it.net/files/files/Produkte/SBC-Moto1/SBC-Moto1_01.png"
  },
  {
    "id": "relay-module-6",
    "family": "relay",
    "name": "릴레이 모듈 제어3+접점3",
    "pin_count": 6,
    "pins": [
      "VCC",
      "GND",
      "IN",
      "COM",
      "NO",
      "NC"
    ],
    "interface": "GPIO",
    "appearance": "파란 릴레이 블록, 3핀 제어 헤더, 3개 나사 단자.",
    "notes": "3핀 릴레이 모듈이라는 이름은 제어 측만 가리킵니다. 접점까지 포함하면 6단자입니다.",
    "additional_contacts": "",
    "source_ids": [
      "relay"
    ],
    "visual_source_id": "relay",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-019 5V Relais - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-019"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-019/KY-019.png"
  },
  {
    "id": "joystick-module-5",
    "family": "joystick",
    "name": "KY-023 조이스틱 5핀",
    "pin_count": 5,
    "pins": [
      "VCC",
      "GND",
      "VRX",
      "VRY",
      "SW"
    ],
    "interface": "ADC×2 + GPIO",
    "appearance": "검은 스틱과 두 가변저항, 누름 스위치가 있는 PCB.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "joystick"
    ],
    "visual_source_id": "joystick",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-023 Joystick (X-Y-Axis) - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-023"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-023/KY-023.png"
  },
  {
    "id": "encoder-bare-5",
    "family": "encoder",
    "name": "누름 기능 로터리 인코더 소자 5접점",
    "pin_count": 5,
    "pins": [
      "A",
      "COMMON",
      "B",
      "SW1",
      "SW2"
    ],
    "interface": "TIM Encoder/EXTI",
    "appearance": "금속 회전축과 본체, 회전 접점 3개와 버튼 접점 2개.",
    "notes": "지지용 금속 탭은 전기 핀 수에서 제외합니다. 5핀이어도 모듈형의 VCC/GND 핀 배치와 다릅니다.",
    "additional_contacts": "",
    "source_ids": [
      "encoderbare"
    ],
    "visual_source_id": "encoderbare",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Rotary Encoder + Extras : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/377"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/377-02.jpg"
  },
  {
    "id": "encoder-module-5",
    "family": "encoder",
    "name": "KY-040 인코더 모듈 5핀",
    "pin_count": 5,
    "pins": [
      "VCC",
      "GND",
      "CLK/A",
      "DT/B",
      "SW"
    ],
    "interface": "TIM Encoder/EXTI",
    "appearance": "회전축과 노브, 저항이 실장된 PCB와 5핀 헤더.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "encoder"
    ],
    "visual_source_id": "encoder",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-040 Rotary encoder - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-040"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-040/KY-040.png"
  },
  {
    "id": "l298n-module-13",
    "family": "l298n",
    "name": "L298N 모듈 주요 외부 단자 13개",
    "pin_count": 13,
    "pins": [
      "VM",
      "GND",
      "5V",
      "ENA",
      "IN1",
      "IN2",
      "IN3",
      "IN4",
      "ENB",
      "OUT1",
      "OUT2",
      "OUT3",
      "OUT4"
    ],
    "interface": "TIM PWM/GPIO",
    "appearance": "빨간 PCB, 큰 검은 방열판, 나사 단자 세 묶음과 제어 헤더.",
    "notes": "현재 앱은 ENA/ENB와 5V-EN 점퍼를 제거한 구성입니다. 5V가 입력인지 출력인지는 점퍼·보드 회로를 확인합니다.",
    "additional_contacts": "ENA/ENB/5V-EN 점퍼 접점은 주요 외부 단자 13개와 별도",
    "source_ids": [
      "l298n"
    ],
    "visual_source_id": "l298n",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "MotoDriver2 DC motor control | Joy-IT",
        "url": "https://www.joy-it.net/en/products/SBC-Motodriver2"
      }
    ],
    "image": "https://www.joy-it.net/files/files/Produkte/SBC-MotorDriver2/SBC-Motodriver2-1neu.png"
  },
  {
    "id": "dc-supply-2",
    "family": "dc_supply",
    "name": "배터리 팩 외부 전원 2선",
    "pin_count": 2,
    "pins": [
      "+",
      "-"
    ],
    "interface": "전원",
    "appearance": "배터리 홀더와 양·음극 2선.",
    "notes": "AA 4개는 약 6 V입니다. 전압 속성(6~24 V)을 바꾸면 모터용 외부 직류 전원으로 씁니다.",
    "additional_contacts": "",
    "source_ids": [
      "dc_supply"
    ],
    "visual_source_id": "dc_supply",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "4 x AA Battery Holder with On/Off Switch : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/830"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/830-07.jpg"
  },
  {
    "id": "uart-cable-4",
    "family": "uart",
    "name": "USB–TTL 시리얼 케이블 4선",
    "pin_count": 4,
    "pins": [
      "USB-5V",
      "GND",
      "TXD",
      "RXD"
    ],
    "interface": "UART",
    "appearance": "USB 플러그와 끝이 갈라진 4선 케이블.",
    "notes": "전원 선은 USB 5V입니다. TXD는 보드 RX, RXD는 보드 TX에 엇갈려 연결합니다.",
    "additional_contacts": "",
    "source_ids": [
      "uart4"
    ],
    "visual_source_id": "uart4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "USB to TTL Serial Cable - Debug / Console Cable for Raspberry Pi : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/954"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/954-02.jpg"
  },
  {
    "id": "uart-cable-6",
    "family": "uart",
    "name": "FTDI TTL 시리얼 케이블 6접점",
    "pin_count": 6,
    "pins": [
      "GND",
      "CTS",
      "VCC",
      "TXD",
      "RXD",
      "RTS"
    ],
    "interface": "UART + 흐름 제어",
    "appearance": "USB 플러그와 1×6 소켓.",
    "notes": "4선 케이블에 CTS/RTS 흐름 제어가 추가된 형식입니다. 3.3V/5V 제품을 구분합니다.",
    "additional_contacts": "",
    "source_ids": [
      "uart6"
    ],
    "visual_source_id": "uart6",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "FTDI Serial TTL-232 USB Cable : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/70"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/70-03.jpg"
  },
  {
    "id": "i2c-eeprom-8",
    "family": "i2c",
    "name": "24LC02B I²C EEPROM PDIP8",
    "pin_count": 8,
    "pins": [
      "NC1",
      "NC2",
      "NC3",
      "VSS",
      "SDA",
      "SCL",
      "WP",
      "VCC"
    ],
    "interface": "I²C",
    "appearance": "검은 DIP8 패키지와 방향을 나타내는 홈.",
    "notes": "이 24LC02B의 1~3번은 NC입니다. 24LC256 같은 다른 EEPROM의 주소 핀 설명을 그대로 적용하면 안 됩니다. WP를 GND에 연결해야 쓸 수 있습니다.",
    "additional_contacts": "",
    "source_ids": [
      "i2c8"
    ],
    "visual_source_id": "i2c8",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Microchip 24AA02/24LC02B 데이터시트",
        "url": "https://ww1.microchip.com/downloads/en/devicedoc/21709j.pdf"
      }
    ],
    "image": "https://product.hstatic.net/200000551749/product/24_7f79743fbdb945058afcb92c43f4f153_grande.png"
  },
  {
    "id": "i2c-eeprom-5",
    "family": "i2c",
    "name": "24LC02B SOT-23-5 패키지",
    "pin_count": 5,
    "pins": [
      "SCL",
      "VSS",
      "SDA",
      "VCC",
      "WP"
    ],
    "interface": "I²C",
    "appearance": "작은 표면실장 패키지의 다섯 접점.",
    "notes": "PDIP8과 같은 계열의 패키지 변형입니다. 핀 번호는 데이터시트 SOT-23 도면 기준입니다.",
    "additional_contacts": "",
    "source_ids": [
      "i2c5"
    ],
    "visual_source_id": "i2c5",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "24LC02B SOT-23-5 외형도",
        "url": "https://ww1.microchip.com/downloads/en/devicedoc/21709j.pdf"
      }
    ],
    "image": null
  },
  {
    "id": "spi-eeprom-8",
    "family": "spi",
    "name": "25LC020A SPI EEPROM 8핀",
    "pin_count": 8,
    "pins": [
      "CS",
      "SO",
      "WP",
      "VSS",
      "SI",
      "SCK",
      "HOLD",
      "VCC"
    ],
    "interface": "SPI",
    "appearance": "DIP8/SOIC8 패키지와 방향 표시.",
    "notes": "WP와 HOLD는 3V3에 연결해 고정합니다. 쓰기 전에 WREN(0x06) 명령을 보냅니다.",
    "additional_contacts": "",
    "source_ids": [
      "spi8"
    ],
    "visual_source_id": "spi8",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Microchip 25AA020A/25LC020A 데이터시트",
        "url": "https://ww1.microchip.com/downloads/en/DeviceDoc/21833G.pdf"
      }
    ],
    "image": null
  },
  {
    "id": "pot-bare-3",
    "family": "potentiometer",
    "name": "10kΩ 트리머 가변저항 3핀",
    "pin_count": 3,
    "pins": [
      "END1",
      "WIPER",
      "END2"
    ],
    "interface": "ADC 분압",
    "appearance": "조절 슬롯이 있는 작은 회전 트리머와 3개 리드.",
    "notes": "물리 3핀 중 2개만 써서 가변저항처럼 사용할 수 있지만 2핀 패키지로 재분류하지 않습니다.",
    "additional_contacts": "",
    "source_ids": [
      "pot"
    ],
    "visual_source_id": "pot",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Breadboard trim potentiometer [10K] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/356"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/356-03.jpg"
  },
  {
    "id": "pot-module-3",
    "family": "potentiometer",
    "name": "회전 가변저항 센서 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "VCC",
      "GND",
      "SIGNAL"
    ],
    "interface": "ADC",
    "appearance": "손잡이와 PCB, 3핀 센서 커넥터.",
    "notes": "3핀이지만 나형 가변저항의 END/WIPER 명칭 대신 전원·신호 단자로 표시됩니다.",
    "additional_contacts": "",
    "source_ids": [
      "potmodule"
    ],
    "visual_source_id": "potmodule",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Gravity: Analog Rotation Potentiometer Sensor for Arduino - Rotation 300° - DFRobot",
        "url": "https://www.dfrobot.com/product-87.html"
      }
    ],
    "image": "https://dfimg.dfrobot.com/enshop/DFR0054/DFR0054_Main_01.jpg"
  },
  {
    "id": "slide-spdt-3",
    "family": "slide",
    "name": "SPDT 슬라이드 스위치 3핀",
    "pin_count": 3,
    "pins": [
      "A",
      "COM",
      "B"
    ],
    "interface": "GPIO/전원 선택",
    "appearance": "옆으로 움직이는 손잡이와 일렬 3핀.",
    "notes": "두 핀만 사용하면 ON/OFF 용도로 쓸 수 있어도 물리 핀은 3개입니다.",
    "additional_contacts": "",
    "source_ids": [
      "slide3"
    ],
    "visual_source_id": "slide3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Breadboard-friendly SPDT Slide Switch : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/805"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/805-03.jpg"
  },
  {
    "id": "rgb-common-anode-4",
    "family": "rgb",
    "name": "공통 양극 RGB LED 4핀",
    "pin_count": 4,
    "pins": [
      "R",
      "COMMON-A",
      "G",
      "B"
    ],
    "interface": "PWM×3",
    "appearance": "단색 LED와 비슷한 렌즈에 다리 네 개.",
    "notes": "공통 양극을 3V3에 연결하고 R·G·B를 LOW로 내리면 켜집니다. 공통 음극형과 논리가 반대입니다.",
    "additional_contacts": "",
    "source_ids": [
      "rgbca"
    ],
    "visual_source_id": "rgbca",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Diffused RGB (tri-color) LED [Common Anode] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/159"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/159-02.jpg"
  },
  {
    "id": "rgb-common-cathode-4",
    "family": "rgb",
    "name": "KY-016 공통 음극 RGB 모듈 4핀",
    "pin_count": 4,
    "pins": [
      "R",
      "G",
      "B",
      "COMMON-K"
    ],
    "interface": "PWM×3",
    "appearance": "4리드 RGB LED를 작은 PCB와 저항에 실장한 형태.",
    "notes": "공통 음극을 GND에, R·G·B를 각각 출력 핀에 연결하며 HIGH일 때 켜집니다.",
    "additional_contacts": "",
    "source_ids": [
      "rgbcc"
    ],
    "visual_source_id": "rgbcc",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-016 RGB 5mm LED - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-016"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-016/KY-016.png"
  },
  {
    "id": "rgb-neopixel-4",
    "family": "rgb",
    "name": "주소지정 NeoPixel THT 4핀",
    "pin_count": 4,
    "pins": [
      "VDD",
      "GND",
      "DIN",
      "DOUT"
    ],
    "interface": "단선 디지털 프로토콜",
    "appearance": "일반 RGB LED처럼 4리드 렌즈이지만 내부 드라이버가 있음.",
    "notes": "핀 수만 보고 공통극 RGB LED와 호환시키면 안 됩니다.",
    "additional_contacts": "",
    "source_ids": [
      "neopixel4"
    ],
    "visual_source_id": "neopixel4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "NeoPixel Diffused 5mm Through-Hole LED - 5 Pack : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/1938"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/1938-01.jpg"
  },
  {
    "id": "rgb-neopixel-flora-4",
    "family": "rgb",
    "name": "FLORA NeoPixel 연결 패드 4개",
    "pin_count": 4,
    "pins": [
      "V+",
      "GND",
      "DIN",
      "DOUT"
    ],
    "interface": "단선 디지털 프로토콜",
    "appearance": "원형 PCB 중앙의 주소지정 LED와 바느질용 패드.",
    "notes": "한 개 구동에 쓰는 입력 3신호와 실제 패드 4개를 구분합니다. DOUT은 다음 LED 연결용입니다.",
    "additional_contacts": "",
    "source_ids": [
      "neopixel3"
    ],
    "visual_source_id": "neopixel3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Flora RGB Smart NeoPixel version 3 - Pack of 4 : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/1260"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/1260-09.jpg"
  },
  {
    "id": "rgb-gravity-3",
    "family": "rgb",
    "name": "Gravity 디지털 RGB 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "VCC",
      "GND",
      "DATA"
    ],
    "interface": "단선 디지털 프로토콜",
    "appearance": "주소지정 RGB LED와 3핀 Gravity 커넥터가 있는 PCB.",
    "notes": "3핀 입력 인터페이스를 쓰는 DFR0605입니다. 일반 R/G/B 채널 LED와 구분합니다.",
    "additional_contacts": "제조사 핀 표의 DO는 별도 체인 출력 패드입니다. 3핀 커넥터와 따로 기록합니다.",
    "source_ids": [
      "neopixelgravity"
    ],
    "visual_source_id": "neopixelgravity",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Gravity: Digital RGB LED Module - Easy LED Solutions | DFRobot Wiki",
        "url": "https://wiki.dfrobot.com/dfr0605/"
      }
    ],
    "image": "https://dfimg.dfrobot.com/enshop/DFR0605/DFR0605_Main_01_1200x630.jpg.webp"
  },
  {
    "id": "capacitor-ceramic-2",
    "family": "capacitor",
    "name": "세라믹 커패시터 2핀",
    "pin_count": 2,
    "pins": [
      "C1",
      "C2"
    ],
    "interface": "수동 소자",
    "appearance": "작은 원판·덩어리 몸체와 두 리드. 극성 표시 없음.",
    "notes": "사진의 0.1µF와 앱 기본 용량은 서로 다른 값입니다.",
    "additional_contacts": "",
    "source_ids": [
      "capacitor"
    ],
    "visual_source_id": "capacitor",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "0.1uF ceramic capacitors - 10 pack : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/753"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/753-02.jpg"
  },
  {
    "id": "capacitor-electrolytic-2",
    "family": "capacitor",
    "name": "알루미늄 전해 커패시터 2핀",
    "pin_count": 2,
    "pins": [
      "+",
      "-"
    ],
    "interface": "수동 소자",
    "appearance": "원통형 캔과 음극 줄무늬, 두 리드.",
    "notes": "앱 커패시터는 비극성 모델입니다. 실제 전해형의 극성·정격 전압을 동일하게 재현하지 않습니다.",
    "additional_contacts": "",
    "source_ids": [
      "electrolytic"
    ],
    "visual_source_id": "electrolytic",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "100uF 16V Electrolytic Capacitors - Pack of 10 : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/2193"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/2193-00.jpg"
  },
  {
    "id": "diode-axial-2",
    "family": "diode",
    "name": "1N4001 축형 다이오드 2핀",
    "pin_count": 2,
    "pins": [
      "A",
      "K"
    ],
    "interface": "수동 소자",
    "appearance": "검은 원통 몸체 한쪽에 캐소드 띠, 양끝 리드.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "diode"
    ],
    "visual_source_id": "diode",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "1N4001 Diode - 10 pack : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/755"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/755-03.jpg"
  },
  {
    "id": "buzzer-active-2",
    "family": "buzzer",
    "name": "발진기 내장 능동 부저 2핀",
    "pin_count": 2,
    "pins": [
      "+",
      "-"
    ],
    "interface": "DC/GPIO",
    "appearance": "윗면에 소리 구멍이 있는 원통형 케이스.",
    "notes": "DC를 인가하면 자체 발진으로 소리 납니다. 외형만으로 수동형과 구별하지 않습니다.",
    "additional_contacts": "",
    "source_ids": [
      "buzzer2"
    ],
    "visual_source_id": "buzzer2",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Buzzer 5V - Breadboard friendly : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/1536"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/1536-06.jpg"
  },
  {
    "id": "buzzer-active-module-3",
    "family": "buzzer",
    "name": "KY-012 능동 부저 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "S",
      "+V(미사용)",
      "GND"
    ],
    "interface": "GPIO",
    "appearance": "능동 부저와 3핀 헤더가 달린 PCB.",
    "notes": "이 제조사 배선 예제는 +V에 연결하지 않고 S/GND를 사용합니다. 다른 3핀 부저의 독립 전원+신호 회로와 구분합니다.",
    "additional_contacts": "",
    "source_ids": [
      "buzzer3"
    ],
    "visual_source_id": "buzzer3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "KY-012 Active Piezo-Buzzer - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-012"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-006/KY-006.png"
  },
  {
    "id": "buzzer-passive-2",
    "family": "passive_buzzer",
    "name": "외부 구동 피에조 부저 2핀",
    "pin_count": 2,
    "pins": [
      "P1",
      "P2"
    ],
    "interface": "TIM PWM",
    "appearance": "원통형 피에조 케이스와 두 리드.",
    "notes": "연속음에는 외부 교류·사각파가 필요합니다. 출처 제품의 공진대역과 앱 20~2000Hz 범위는 다릅니다.",
    "additional_contacts": "",
    "source_ids": [
      "passive2"
    ],
    "visual_source_id": "passive2",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Piezo Buzzer [PS1240] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/160"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/160-01.jpg"
  },
  {
    "id": "buzzer-passive-module-3",
    "family": "passive_buzzer",
    "name": "KY-006 수동 부저 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "S",
      "+V(미사용)",
      "GND"
    ],
    "interface": "TIM PWM",
    "appearance": "수동 피에조와 3핀 PCB.",
    "notes": "같은 3핀이라도 미사용 단자를 포함할 수 있습니다. 제조사 배선도에 따라 S/GND를 연결합니다.",
    "additional_contacts": "",
    "source_ids": [
      "passive3"
    ],
    "visual_source_id": "passive3",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Passive Piezo-Buzzer - SensorKit",
        "url": "https://sensorkit.joy-it.net/en/sensors/ky-006"
      }
    ],
    "image": "https://sensorkit.joy-it.net/files/files/sensors/KY-006/KY-006.png"
  },
  {
    "id": "sevenseg-common-cathode-10",
    "family": "sevenseg",
    "name": "SC56-11EWA 공통 음극 10핀",
    "pin_count": 10,
    "pins": [
      "e",
      "d",
      "K1",
      "c",
      "dp",
      "b",
      "a",
      "K2",
      "f",
      "g"
    ],
    "interface": "GPIO/PWM",
    "appearance": "단일 숫자 표시창과 위·아래 두 줄의 다리.",
    "notes": "단자 구성은 앱과 대응합니다. 도면의 위에서 본 방향과 핀1 위치를 확인합니다.",
    "additional_contacts": "",
    "source_ids": [
      "sevencc"
    ],
    "visual_source_id": "sevencc",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Kingbright SC56-11EWA 데이터시트",
        "url": "https://www.kingbrightusa.com/images/catalog/spec/sc56-11ewa.pdf"
      }
    ],
    "image": "https://static.rapidonline.com/catalogueimages/product/57/01/s57-0127p01wl.jpg"
  },
  {
    "id": "sevenseg-common-anode-10",
    "family": "sevenseg",
    "name": "SA56-11EWA 공통 양극 10핀",
    "pin_count": 10,
    "pins": [
      "e",
      "d",
      "A1",
      "c",
      "dp",
      "b",
      "a",
      "A2",
      "f",
      "g"
    ],
    "interface": "GPIO/PWM",
    "appearance": "공통 음극형과 유사한 단일 숫자 패키지.",
    "notes": "생김새·핀 수가 같아도 공통극이 반대입니다. 공통 양극을 3V3에 연결하고 세그먼트를 LOW로 내리면 켜집니다.",
    "additional_contacts": "",
    "source_ids": [
      "sevenca"
    ],
    "visual_source_id": "sevenca",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Kingbright SA56-11EWA 데이터시트",
        "url": "https://www.kingbrightusa.com/images/catalog/spec/sa56-11ewa.pdf"
      }
    ],
    "image": null
  },
  {
    "id": "sevenseg-4digit-12",
    "family": "sevenseg",
    "name": "4자리 시계 7세그먼트 14핀 · 콜론",
    "pin_count": 14,
    "pins": [
      "e",
      "d",
      "dp",
      "c",
      "g",
      "DIG4",
      "COLON-K",
      "COLON-A",
      "b",
      "DIG3",
      "DIG2",
      "f",
      "a",
      "DIG1"
    ],
    "interface": "GPIO 멀티플렉싱",
    "appearance": "숫자 네 자리가 하나의 긴 패키지에 있음.",
    "notes": "자리 선택 4핀, 세그먼트 8핀, 콜론 2핀으로 모두 14핀입니다(BL-Q56C-43 도면).",
    "additional_contacts": "",
    "source_ids": [
      "sevenraw",
      "sevenraw-pinout"
    ],
    "visual_source_id": "sevenraw",
    "pin_order": "제품 페이지가 연결한 BL-Q56C-43 datasheet page 3의 전면도: 아래 1→7, 위 14→8.",
    "source": [
      {
        "title": "Green 7-segment clock display - 0.56 digit height : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/813"
      },
      {
        "title": "Adafruit linked BL-Q56C-43 pinout, page 3",
        "url": "https://cdn-shop.adafruit.com/datasheets/BL-Q56C-43.pdf"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/813-06.jpg"
  },
  {
    "id": "sevenseg-tm1637-4",
    "family": "sevenseg",
    "name": "TM1637 4자리 표시 모듈 4핀",
    "pin_count": 4,
    "pins": [
      "VCC",
      "GND",
      "CLK",
      "DIO"
    ],
    "interface": "TM1637 전용 2선",
    "appearance": "4자리 표시창 뒤에 드라이버 PCB와 Grove 커넥터.",
    "notes": "표시 소자는 12핀이나 외부 연결은 4핀입니다. CLK/DIO는 I²C SDA/SCL과 같은 프로토콜이 아닙니다.",
    "additional_contacts": "",
    "source_ids": [
      "seven4"
    ],
    "visual_source_id": "seven4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Grove - 4-Digit Display | Seeed Studio Wiki",
        "url": "https://wiki.seeedstudio.com/Grove-4-Digit_Display/"
      }
    ],
    "image": "https://files.seeedstudio.com/wiki/Grove-4-Digit_Display/img/Grove-4_digit_display.jpg"
  },
  {
    "id": "tmp36-to92-3",
    "family": "temperature",
    "name": "TMP36 아날로그 온도 센서 3핀",
    "pin_count": 3,
    "pins": [
      "VS",
      "VOUT",
      "GND"
    ],
    "interface": "ADC",
    "appearance": "검은 TO-92 반원형 몸체와 세 다리.",
    "notes": "DS18B20과 비슷하게 보여도 출력은 아날로그 전압입니다.",
    "additional_contacts": "",
    "source_ids": [
      "tmp36"
    ],
    "visual_source_id": "tmp36",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "TMP36 - Analog Temperature sensor [TMP36] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/165"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/165-02.jpg"
  },
  {
    "id": "ds18b20-to92-3",
    "family": "temperature",
    "name": "DS18B20 디지털 온도 센서 3핀",
    "pin_count": 3,
    "pins": [
      "GND",
      "DQ",
      "VDD"
    ],
    "interface": "1-Wire",
    "appearance": "TMP36과 비슷한 TO-92 패키지.",
    "notes": "동일한 3핀 외형이어도 TMP36과 핀 기능·통신 방식이 다릅니다. DQ 한 선으로 1-Wire 통신해 온도를 읽습니다.",
    "additional_contacts": "",
    "source_ids": [
      "ds18b20"
    ],
    "visual_source_id": "ds18b20",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "DS18B20 Digital temperature sensor + extras : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/374"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/374-01.jpg"
  },
  {
    "id": "ds18b20-probe-3",
    "family": "temperature",
    "name": "방수 DS18B20 프로브 3선",
    "pin_count": 3,
    "pins": [
      "VDD",
      "GND",
      "DQ"
    ],
    "interface": "1-Wire",
    "appearance": "스테인리스 튜브 센서와 길게 나온 3선 케이블.",
    "notes": "선 색상만으로 신호를 단정하지 않고 해당 제품 배선 설명을 확인합니다.",
    "additional_contacts": "",
    "source_ids": [
      "dsprobe"
    ],
    "visual_source_id": "dsprobe",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Waterproof 1-Wire DS18B20 Digital temperature sensor : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/381"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/381-01.jpg"
  },
  {
    "id": "hcsr04-4",
    "family": "ultrasonic",
    "name": "HC-SR04 초음파 4핀",
    "pin_count": 4,
    "pins": [
      "VCC",
      "TRIG",
      "ECHO",
      "GND"
    ],
    "interface": "GPIO/TIM Capture",
    "appearance": "두 원형 초음파 소자가 나란히 있는 PCB와 4핀 헤더.",
    "notes": "",
    "additional_contacts": "",
    "source_ids": [
      "ultrasonic4"
    ],
    "visual_source_id": "ultrasonic4",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "HC-SR04 Ultrasonic Sonar Distance Sensor + 2 x 10K resistors : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/3942"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/3942-00.jpg"
  },
  {
    "id": "urm09-trig-3",
    "family": "ultrasonic",
    "name": "URM09 Trig 초음파 3핀",
    "pin_count": 3,
    "pins": [
      "GND",
      "VCC",
      "TRIG-ECHO"
    ],
    "interface": "GPIO 양방향",
    "appearance": "초음파 소자와 3핀 Gravity 커넥터.",
    "notes": "Trig와 Echo가 한 신호선을 함께 씁니다. GPIO를 출력으로 트리거한 뒤 입력으로 바꿔 Echo 폭을 잽니다.",
    "additional_contacts": "",
    "source_ids": [
      "ultrasonic3"
    ],
    "visual_source_id": "ultrasonic3",
    "pin_order": "DFRobot SEN0388: pin 1 GND, pin 2 VCC, pin 3 D.",
    "source": [
      {
        "title": "Gravity: URM09 Ultrasonic Distance Sensor (2～500cm, Trig) | DFRobot Wiki",
        "url": "https://wiki.dfrobot.com/sen0388/"
      }
    ],
    "image": "https://dfimg.dfrobot.com/enshop/image/data/SEN0388/SEN0388_251022 (1)_1200x630.jpg.webp"
  },
  {
    "id": "urm09-i2c-4",
    "family": "ultrasonic",
    "name": "URM09 I²C 초음파 4핀",
    "pin_count": 4,
    "pins": [
      "VCC",
      "GND",
      "SDA",
      "SCL"
    ],
    "interface": "I²C",
    "appearance": "초음파 센서와 I²C 커넥터.",
    "notes": "4핀이라는 점만 같고 HC-SR04의 TRIG/ECHO와 기능이 다릅니다.",
    "additional_contacts": "",
    "source_ids": [
      "ultrasonicI2C"
    ],
    "visual_source_id": "ultrasonicI2C",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Gravity: URM09 Ultrasonic Distance Sensor (2～500cm, I2C) - DFRobot",
        "url": "https://www.dfrobot.com/product-1832.html"
      }
    ],
    "image": "https://dfimg.dfrobot.com/enshop/image/data/SEN0304/SEN0304_Main_01.jpg"
  },
  {
    "id": "ads1115-10",
    "family": "external_adc",
    "name": "ADS1115 외부 ADC 메인 헤더 10핀",
    "pin_count": 10,
    "pins": [
      "VIN",
      "GND",
      "SCL",
      "SDA",
      "ADDR",
      "ALRT",
      "A0",
      "A1",
      "A2",
      "A3"
    ],
    "interface": "I²C",
    "appearance": "ADC 칩과 아날로그 입력 핀을 꺼낸 PCB.",
    "notes": "MCU 내부 ADC1/2/3과 다른 외부 칩입니다. 실제 사진의 보드 리비전을 확인합니다.",
    "additional_contacts": "QT판은 중복 I²C 커넥터 4접점×2 추가",
    "source_ids": [
      "adc",
      "adcproduct"
    ],
    "visual_source_id": "adcproduct",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Pinouts | Adafruit 4-Channel ADC Breakouts | Adafruit Learning System",
        "url": "https://learn.adafruit.com/adafruit-4-channel-adc-breakouts/pinouts"
      },
      {
        "title": "ADS1115 16-Bit ADC - 4 Channel with Programmable Gain Amplifier [STEMMA QT / Qwiic] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/1085"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/1085-10.jpg"
  },
  {
    "id": "mcp4725-6",
    "family": "external_dac",
    "name": "MCP4725 외부 DAC 메인 헤더 6핀",
    "pin_count": 6,
    "pins": [
      "VIN",
      "GND",
      "SCL",
      "SDA",
      "A0",
      "VOUT"
    ],
    "interface": "I²C",
    "appearance": "DAC 칩과 아날로그 출력이 있는 작은 PCB.",
    "notes": "MCU 내부 DAC의 외형이 아니라 외부 I²C DAC 예시입니다.",
    "additional_contacts": "QT판은 중복 I²C 커넥터 4접점×2 및 VOUT/GND 단자 옵션",
    "source_ids": [
      "dac",
      "dacproduct"
    ],
    "visual_source_id": "dacproduct",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Pinouts | MCP4725 12-Bit DAC Tutorial | Adafruit Learning System",
        "url": "https://learn.adafruit.com/mcp4725-12-bit-dac-tutorial/pinouts"
      },
      {
        "title": "MCP4725 Breakout Board - 12-Bit DAC with I2C Interface [STEMMA QT / qwiic] : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/935"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/935-11.jpg"
  },
  {
    "id": "can-transceiver-6",
    "family": "can",
    "name": "SN65HVD230 CAN 보드 주요 6단자",
    "pin_count": 6,
    "pins": [
      "3V3",
      "GND",
      "CAN-TX",
      "CAN-RX",
      "CANH",
      "CANL"
    ],
    "interface": "MCU CAN ↔ CAN 버스",
    "appearance": "CAN 트랜시버 PCB에 논리 측 4핀 헤더와 버스 측 2단자.",
    "notes": "제조사 회로도에서 Header4 + Header2를 확인했습니다. CANH/CANL은 MCU GPIO에 직접 연결하는 선이 아닙니다.",
    "additional_contacts": "",
    "source_ids": [
      "can-schematic",
      "can",
      "canproduct"
    ],
    "visual_source_id": "can",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Waveshare CAN Board 회로도 Header4 + Header2",
        "url": "https://files.waveshare.com/upload/c/c5/SN65HVD230-CAN-Board-Schematic.pdf"
      },
      {
        "title": "SN65HVD230 CAN Board - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/SN65HVD230_CAN_Board"
      },
      {
        "title": "SN65HVD230 CAN Board Accessory board used for connecting MCUs to the CAN network, 3.3V, ESD protection",
        "url": "https://www.waveshare.com/product/sn65hvd230-can-board.htm"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/9/92/SN65HVD230-CAN-Board_l.jpg"
  },
  {
    "id": "isolated-rs485",
    "family": "rs485",
    "name": "DFR0845 절연 RS485 모듈 총 10접점",
    "pin_count": 10,
    "pins": [
      "TX",
      "RX",
      "GND-UART",
      "VCC",
      "12V-OUT",
      "GND-485",
      "A",
      "B",
      "12V-IN",
      "GND-IN"
    ],
    "interface": "UART ↔ RS485",
    "appearance": "절연 전원과 버스 단자가 있는 통신 변환 PCB.",
    "notes": "제조사 핀 표에서 UART 4핀, RS485 4단자, 외부 전원 입력 2단자를 구분합니다.",
    "additional_contacts": "UART 4 + RS485 4 + 외부 전원 2",
    "source_ids": [
      "rs485-pinout",
      "rs485"
    ],
    "visual_source_id": "rs485",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "DFRobot DFR0845 핀 구성",
        "url": "https://wiki.dfrobot.com/dfr0845/"
      },
      {
        "title": "Active Isolated RS485 to UART Signal Adapter Module - DFRobot",
        "url": "https://www.dfrobot.com/product-2392.html"
      }
    ],
    "image": "https://dfimg.dfrobot.com/enshop/DFR0845/DFR0845_Main_01.jpg"
  },
  {
    "id": "ds3231-8",
    "family": "external_rtc",
    "name": "DS3231 RTC 메인 헤더 8핀",
    "pin_count": 8,
    "pins": [
      "VIN",
      "GND",
      "SCL",
      "SDA",
      "BAT",
      "32K",
      "SQW",
      "RST"
    ],
    "interface": "I²C",
    "appearance": "RTC 칩과 코인셀 홀더를 함께 실장한 보드.",
    "notes": "내부 RTC 주변장치와 별개인 외부 RTC입니다.",
    "additional_contacts": "QT판은 중복 I²C 커넥터 4접점×2 추가",
    "source_ids": [
      "rtc",
      "rtcproduct"
    ],
    "visual_source_id": "rtcproduct",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Pinouts | Adafruit DS3231 Precision RTC Breakout | Adafruit Learning System",
        "url": "https://learn.adafruit.com/adafruit-ds3231-precision-rtc-breakout/pinouts"
      },
      {
        "title": "Adafruit DS3231 Precision RTC Breakout : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/3013"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/3013-06.jpg"
  },
  {
    "id": "sd-storage-board",
    "family": "sd",
    "name": "Micro SD Storage Board 9핀",
    "pin_count": 9,
    "pins": [
      "3V3",
      "D0",
      "D1",
      "D2",
      "D3",
      "CMD",
      "CLK",
      "GND",
      "CD"
    ],
    "interface": "SPI/SDIO",
    "appearance": "microSD 소켓과 한 줄 9핀 헤더가 있는 PCB.",
    "notes": "제조사 회로도 P1은 Header9입니다. SD카드 자체 8접점, 소켓의 검출 접점과 외부 헤더를 구분합니다.",
    "additional_contacts": "",
    "source_ids": [
      "sd-schematic",
      "sd",
      "sdproduct"
    ],
    "visual_source_id": "sd",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Waveshare Micro SD Storage Board 회로도 P1 Header 9",
        "url": "https://files.waveshare.com/upload/8/83/Micro-SD-Storage-Board-Schematic.pdf"
      },
      {
        "title": "Micro SD Storage Board - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/Micro_SD_Storage_Board"
      },
      {
        "title": "Micro SD Storage Board Micro SD card module",
        "url": "https://www.waveshare.com/product/micro-sd-storage-board.htm"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/3/31/Micro-SD-Storage-Board_l.jpg"
  },
  {
    "id": "max98357a-9",
    "family": "i2s",
    "name": "MAX98357A 모노 앰프 입력7+스피커2",
    "pin_count": 9,
    "pins": [
      "VIN",
      "GND",
      "DIN",
      "BCLK",
      "LRC",
      "GAIN",
      "SD",
      "SPK+",
      "SPK-"
    ],
    "interface": "I²S",
    "appearance": "작은 앰프 PCB와 두 개의 스피커 나사 단자.",
    "notes": "I²S 디지털 오디오용입니다. I²C 제어장치 또는 피에조 부저와 다른 장치입니다.",
    "additional_contacts": "",
    "source_ids": [
      "i2s",
      "i2sproduct"
    ],
    "visual_source_id": "i2sproduct",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Pinouts - Mono | Adafruit MAX98357 I2S Class-D Amps - Stereo and Mono | Adafruit Learning System",
        "url": "https://learn.adafruit.com/adafruit-max98357-i2s-class-d-mono-amp/pinouts"
      },
      {
        "title": "Adafruit I2S 3W Class D Amplifier Breakout - MAX98357A : Adafruit Industries, Unique & fun DIY electronics and kits",
        "url": "https://www.adafruit.com/product/3006"
      }
    ],
    "image": "https://cdn-shop.adafruit.com/970x728/3006-04.jpg"
  },
  {
    "id": "ov2640-camera",
    "family": "dcmi",
    "name": "OV2640 Camera Board 18핀",
    "pin_count": 18,
    "pins": [
      "3V3",
      "GND",
      "SIO_CLK",
      "SIO_DAT",
      "VSYNC",
      "HREF",
      "PCLK",
      "XCLK",
      "Y9",
      "Y8",
      "Y7",
      "Y6",
      "Y5",
      "Y4",
      "Y3",
      "Y2",
      "RESET",
      "PWDN"
    ],
    "interface": "DCMI/DVP + SCCB",
    "appearance": "작은 렌즈가 올라간 카메라 PCB와 9×2 병렬 신호 헤더.",
    "notes": "제조사 회로도 P1은 Header 9×2입니다. 센서 자체 24핀과 외부 헤더 18핀을 혼동하지 않습니다. F446RE에서의 사용 가능 핀 조합은 별도 검토 대상입니다.",
    "additional_contacts": "",
    "source_ids": [
      "camera-schematic",
      "camera",
      "cameraproduct"
    ],
    "visual_source_id": "camera",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "Waveshare OV2640 Camera Board 회로도 P1 Header 9×2",
        "url": "https://files.waveshare.com/upload/9/99/OV2640-Camera-Board-Schematic.pdf"
      },
      {
        "title": "OV2640 Camera Board - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/OV2640_Camera_Board"
      },
      {
        "title": "OV2640 Camera Board Camera module, 2 Megapixel",
        "url": "https://www.waveshare.com/product/ov2640-camera-board.htm"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/8/81/OV2640-Camera-Board_l.jpg"
  },
  {
    "id": "dht11-module-3",
    "family": "dht11",
    "name": "DHT11 센서 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "VCC",
      "GND",
      "DATA"
    ],
    "interface": "단선 전용",
    "appearance": "구멍이 있는 센서 케이스가 소형 PCB에 장착됨.",
    "notes": "나형 DHT11의 4핀에는 NC가 포함됩니다. 모듈 외부 3핀과 나형 4핀을 구분합니다.",
    "additional_contacts": "",
    "source_ids": [
      "dht11"
    ],
    "visual_source_id": "dht11",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "DHT11 Temperature-Humidity Sensor - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/DHT11_Temperature-Humidity_Sensor"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/f/f4/Temperature-Humidity-Sensor_l.jpg"
  },
  {
    "id": "dht22-module-3",
    "family": "dht22",
    "name": "DHT22 센서 모듈 3핀",
    "pin_count": 3,
    "pins": [
      "VCC",
      "GND",
      "DATA"
    ],
    "interface": "단선 전용",
    "appearance": "환기 구멍이 있는 케이스와 PCB·3핀 커넥터.",
    "notes": "나형 DHT22의 4핀과 구분합니다. SHT31의 I²C 통신과도 다릅니다.",
    "additional_contacts": "",
    "source_ids": [
      "dht22"
    ],
    "visual_source_id": "dht22",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "DHT22 Temperature-Humidity Sensor - Waveshare Wiki",
        "url": "https://www.waveshare.com/wiki/DHT22_Temperature-Humidity_Sensor"
      }
    ],
    "image": "https://www.waveshare.com/w/upload/5/52/DHT22-Temperature-Humidity-Sensor-1.jpg"
  },
  {
    "id": "l298n-bare-15",
    "family": "l298n",
    "name": "L298N 나형 드라이버 IC 15핀",
    "pin_count": 15,
    "pins": [
      "SENSE-A",
      "OUT1",
      "OUT2",
      "VS",
      "IN1",
      "ENA",
      "IN2",
      "GND",
      "VSS",
      "IN3",
      "ENB",
      "IN4",
      "OUT3",
      "OUT4",
      "SENSE-B"
    ],
    "interface": "GPIO/구동",
    "appearance": "금속 방열 탭이 있는 Multiwatt15 패키지와 한쪽으로 나온 15개 리드.",
    "notes": "앱의 L298N 모듈 외부 13단자와 칩 자체의 15핀은 다릅니다. 전류 감지·전원 등의 칩 핀까지 확인합니다.",
    "additional_contacts": "방열 탭은 GND에 연결되며 별도 제어 핀으로 세지 않습니다.",
    "source_ids": [
      "l298-chip"
    ],
    "visual_source_id": "l298-chip",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "ST L298 Multiwatt15 및 PowerSO20 데이터시트",
        "url": "https://www.st.com/resource/en/datasheet/l298.pdf"
      }
    ],
    "image": null
  },
  {
    "id": "l298p-bare-20",
    "family": "l298n",
    "name": "L298P PowerSO20 드라이버 IC 20핀",
    "pin_count": 20,
    "pins": [
      "GND1",
      "SENSE-A",
      "NC3",
      "OUT1",
      "OUT2",
      "VS",
      "IN1",
      "ENA",
      "IN2",
      "GND10",
      "GND11",
      "VSS",
      "IN3",
      "ENB",
      "IN4",
      "OUT3",
      "OUT4",
      "NC18",
      "SENSE-B",
      "GND20"
    ],
    "interface": "GPIO/구동",
    "appearance": "양쪽에 리드가 나온 PowerSO20 표면실장 패키지.",
    "notes": "같은 L298 계열이라도 Multiwatt15와 패키지 핀 수·기구가 다릅니다. 패키지별 도면을 사용합니다.",
    "additional_contacts": "",
    "source_ids": [
      "l298-chip"
    ],
    "visual_source_id": "l298-chip",
    "pin_order": "ST L298 datasheet Figure 2 PowerSO20 top view, pins 1–20 counterclockwise.",
    "source": [
      {
        "title": "ST L298 Multiwatt15 및 PowerSO20 데이터시트",
        "url": "https://www.st.com/resource/en/datasheet/l298.pdf"
      }
    ],
    "image": null
  },
  {
    "id": "slide-dpdt-6",
    "family": "slide",
    "name": "C&K JS202011JCQN DPDT 6핀",
    "pin_count": 6,
    "pins": [
      "A1",
      "COM1",
      "B1",
      "A2",
      "COM2",
      "B2"
    ],
    "interface": "접점 선택",
    "appearance": "두 회로를 동시에 바꾸는 슬라이드 스위치의 6개 전기 단자.",
    "notes": "제조사 JS Series의 DPDT 모델입니다. 3핀 SPDT와 별도 모델로 취급합니다. 단자별 위치는 부품 번호의 도면을 따릅니다.",
    "additional_contacts": "기구 고정 탭은 전기 접점 수에서 제외합니다.",
    "source_ids": [
      "slide-js"
    ],
    "visual_source_id": "slide-js",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "C&K JS Series 슬라이드 스위치 데이터시트",
        "url": "https://www.ckswitches.com/media/1422/js.pdf"
      }
    ],
    "image": null
  },
  {
    "id": "slide-dp3t-8",
    "family": "slide",
    "name": "C&K JS203011JAQN DP3T 8핀",
    "pin_count": 8,
    "pins": [
      "A1",
      "B1",
      "C1",
      "COM1",
      "A2",
      "B2",
      "C2",
      "COM2"
    ],
    "interface": "접점 선택",
    "appearance": "세 위치를 선택하며 두 회로를 함께 전환하는 슬라이드 스위치.",
    "notes": "제조사 JS Series의 DP3T 모델입니다. 3핀·6핀형과 내부 연결표 및 선택 위치 수가 다릅니다.",
    "additional_contacts": "고정용 금속 탭과 실제 전기 접점을 구분합니다.",
    "source_ids": [
      "slide-js"
    ],
    "visual_source_id": "slide-js",
    "pin_order": "신호 구성 목록입니다. 실제 좌우·상하 순서는 출처의 해당 모델 도면과 실크를 확인하세요.",
    "source": [
      {
        "title": "C&K JS Series 슬라이드 스위치 데이터시트",
        "url": "https://www.ckswitches.com/media/1422/js.pdf"
      }
    ],
    "image": null
  }
];
