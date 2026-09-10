// Module pinouts are part of the simulator's public circuit format.
export const DEVICE_DEFS={
 ldr:{name:'조도 센서 · LDR',prefix:'LDR',icon:'☀',hint:'센서 · 빛에 따른 저항',defaults:{lux:100},help:'광저항 모델: R = 10 kΩ × (10 / lux)^0.7, 100 Ω~1 MΩ 제한. 10 kΩ 저항과 분압하여 ADC로 읽습니다. 속성에서 조도를 바꿀 수 있습니다.'},
 ntc:{name:'NTC 서미스터',prefix:'NTC',icon:'♨',hint:'센서 · 10 kΩ / B3950',defaults:{temperature:25},help:'25 °C에서 10 kΩ, B=3950 K인 NTC 모델입니다. 10 kΩ 저항과 분압하여 ADC로 읽습니다. 온도 범위 −40~125 °C입니다.'},
 sht31:{name:'SHT31 온습도 센서',prefix:'SHT',icon:'◌',hint:'센서 · I²C / 온도·습도',defaults:{address:68,temperature:25,humidity:50},labels:['VCC','GND','SDA','SCL'],help:'3.3 V I²C 모듈, 내부 10 kΩ 풀업. 주소 0x44/0x45. 0x2400 단발 측정 후 15 ms 대기하고 6바이트(온도·CRC·습도·CRC)를 읽습니다. 환경 값은 실행 중 조절합니다.'},
 mpu6050:{name:'MPU6050 가속도·자이로',prefix:'IMU',icon:'✣',hint:'센서 · I²C / 6축',defaults:{address:104,ax:0,ay:0,az:1,gx:0,gy:0,gz:0},labels:['VCC','GND','SDA','SCL'],help:'3.3 V I²C 모듈, 내부 10 kΩ 풀업. 주소 0x68/0x69. WHO_AM_I, 절전 해제, 가속도·자이로 범위 설정과 14바이트 측정 레지스터를 지원합니다. 물체 자세의 자동 물리 계산 대신 축별 g·°/s를 직접 조절합니다.'},
 pir:{name:'PIR 움직임 센서',prefix:'PIR',icon:'◉',hint:'센서 · 디지털 감지 출력',defaults:{motion:0},labels:['VCC','GND','OUT'],help:'5 V 전원, 3.3 V OUT을 갖는 움직임 감지 모듈 모델입니다. 속성의 감지를 켜면 HIGH, 끄면 LOW입니다. GPIO 입력 또는 EXTI로 읽습니다. 실제 렌즈·지연 회로는 모델링하지 않습니다.'},
 oled:{name:'OLED · SSD1306',prefix:'OLED',icon:'▤',hint:'화면 · I²C / 128×64',pinY:48,body:{width:144,height:88},defaults:{address:60},labels:['VCC','GND','SDA','SCL'],help:'3.3 V, 내부 I²C 풀업, 주소 0x3C/0x3D. SSD1306 명령·페이지/수평/수직 주소·1024 B 화면 메모리를 지원합니다. HAL로 전송한 픽셀을 표시합니다. 하드웨어 스크롤은 지원하지 않습니다.'},
 tft:{name:'TFT · ST7735',prefix:'TFT',icon:'▧',hint:'화면 · SPI / 128×160 RGB565',pinY:99,body:{width:144,height:183},defaults:{},labels:['VCC','GND','CS','SCK','MOSI','DC','RST'],help:'3.3 V SPI 쓰기 전용 모듈입니다. CS LOW, DC LOW 명령/HIGH 데이터, RST LOW 리셋. ST7735의 sleep out, display on, CASET/RASET/RAMWR, RGB565와 MADCTL 축 변환을 지원합니다. 보이는 영역은 128×160, 주소 원점은 (0,0)입니다.'},
 matrix:{name:'LED 매트릭스 · MAX7219',prefix:'MAT',icon:'▦',hint:'화면 · SPI / 8×8',pinY:49,body:{width:82,height:88},defaults:{},labels:['VCC','GND','LOAD','CLK','DIN'],help:'5 V 전원과 3.3 V 논리 레벨 변환기를 포함한 모듈 모델입니다. SPI로 레지스터·값 2바이트를 전송하고 LOAD를 HIGH로 올리면 반영합니다. 무디코드 모드의 8×8 픽셀, 밝기·스캔 한도·shutdown·test를 지원합니다.'},
 servo:{name:'RC 서보 모터',prefix:'SERVO',icon:'↗',hint:'구동 · 50 Hz / 1~2 ms PWM',defaults:{},labels:['VCC','GND','PWM'],help:'5 V 전원, 3.3 V 제어 입력의 RC 서보 모델입니다. 실제 펄스 폭 1~2 ms를 0~180°로 변환합니다. PWM 파형을 켜세요(예제는 자동 설정). 신호가 100 ms 이상 끊기면 제어가 해제되며 회전 속도는 360°/s로 제한합니다.'},
 motor:{name:'DC 모터 + H 브리지',prefix:'MOTOR',icon:'⟳',hint:'구동 · PWM 속도 / 정·역회전',defaults:{},labels:['VM','GND','PWM','IN1','IN2'],help:'5 V 모터 전원과 3.3 V 논리 입력을 분리한 드라이버 모듈 모델입니다. IN1/IN2로 정·역회전, 동일 값이면 정지합니다. PWM으로 목표 속도(최대 3000 rpm)를 조절하며 관성 시정수는 150 ms입니다. 모터 권선·역기전력은 계산하지 않습니다.'},
 stepper:{name:'스테퍼 모터 + 드라이버',prefix:'STEP',icon:'✥',hint:'구동 · 4상 / 1.8° 스텝',defaults:{},labels:['VM','GND','IN1','IN2','IN3','IN4'],help:'5 V 전원, 3.3 V 논리 입력의 4상 드라이버 모델입니다. 1000→0100→0010→0001 파형의 인접한 상 전환마다 1.8° 이동합니다. 역순이면 역회전합니다. 부하·탈조·가속은 모델링하지 않습니다.'},
 relay:{name:'릴레이 모듈',prefix:'RELAY',icon:'⌁',hint:'구동 · COM / NO / NC 접점',defaults:{},labels:['VCC','GND','IN','COM','NO','NC'],help:'5 V 전원, 3.3 V HIGH 활성 입력의 릴레이 모듈입니다. 전원이 있고 IN이 HIGH면 COM–NO, 아니면 COM–NC가 연결됩니다. 접점 저항 0.1 Ω, 이상적인 즉시 전환 모델입니다.'},
 joystick:{name:'조이스틱',prefix:'JOY',icon:'✛',hint:'입력 · X/Y ADC / 누름 스위치',defaults:{axisX:50,axisY:50,switch:0},labels:['VCC','GND','VRX','VRY','SW'],help:'3.3 V로 공급하는 두 개의 10 kΩ 가변저항과 누름 스위치 모델입니다. VRX/ VRY는 ADC, SW는 풀업 GPIO에 연결합니다. 실행 중 X/Y와 누름 상태를 조절합니다.'},
 encoder:{name:'로터리 인코더',prefix:'ENC',icon:'↻',hint:'입력 · A/B 직교 펄스 / 버튼',defaults:{position:0,switch:0},labels:['VCC','GND','A','B','SW'],help:'3.3 V, 내부 10 kΩ 풀업이 있는 인코더 모듈입니다. 위치를 한 칸 바꾸면 2 ms 간격의 A/B 4개 전이가 발생합니다. A/B의 양쪽 에지 EXTI 예제로 방향과 카운트를 읽습니다. 누름 스위치도 LOW 활성입니다.'}
};
export const I2C_DEVICES=['sht31','mpu6050','oled'];
export const SPI_DEVICES=['tft','matrix'];
export const MODULE_DEVICES=[...I2C_DEVICES,...SPI_DEVICES,'pir','servo','motor','stepper','relay','encoder','joystick'];
export const DEVICE_RANGES={ldr:{lux:[1,100000]},ntc:{temperature:[-40,125]},sht31:{temperature:[-40,125],humidity:[0,100]},mpu6050:{ax:[-16,16],ay:[-16,16],az:[-16,16],gx:[-2000,2000],gy:[-2000,2000],gz:[-2000,2000]},pir:{motion:[0,1]},joystick:{axisX:[0,100],axisY:[0,100],switch:[0,1]},encoder:{position:[-1000,1000],switch:[0,1]}};
export const DEVICE_ADDRESSES={sht31:[0x44,0x45],mpu6050:[0x68,0x69],oled:[0x3c,0x3d]};
export const ldrResistance=lux=>Math.max(100,Math.min(1e6,10000*Math.pow(10/lux,.7)));
export const ntcResistance=t=>10000*Math.exp(3950*(1/(t+273.15)-1/298.15));
