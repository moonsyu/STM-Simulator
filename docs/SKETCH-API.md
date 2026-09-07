# STM Emulator 스케치 API

**STM32 HAL · C 소스** 모드와 Pinout 설정은 [HAL-API.md](HAL-API.md)를 확인하세요.

이 문서는 기존 사용자 회로의 스케치 실행을 위한 호환 API입니다. Arduino/STM32의 모든 라이브러리와 ABI를 구현한 것은 아닙니다. 새 프로젝트와 제공 코드 예제는 HAL을 사용합니다. 사용법은 [HAL API](HAL-API.md)를 확인하세요.

## 문법

- `setup()` / `loop()` 외 사용자 함수, 매개변수, `return`, 함수 안에서 `delay()` 후 재개.
- `int`, `float`, `double`, `bool`, `char`, `byte`, `long`, `unsigned`, `uint8_t`/`uint16_t`/`uint32_t` 등 숫자 선언 및 `String`. `const` 재대입 방지.
- `if/else`, `for`, `while`, `do/while`, `break`, `continue`, `++/--`, 복합 대입, 조건 연산자, 비교·논리·비트 연산, 16진수·2진수·문자 리터럴.
- 1차원 배열: `int samples[8];`, `int values[]={1,2,3};`. 배열 크기는 1~4096, 인덱스 범위 검사.
- 구조체 값·복사: `struct Point { int x; int y; }; Point p={1,2};`.
- 단일 포인터: `int *p=&x;`, `*p=2;`, 배열 포인터의 인덱싱·산술, 구조체 `p->field`. 지역 범위를 벗어난 포인터 사용 시 중단.
- 객체형 `#define`, `#include <Arduino.h>`, `<LiquidCrystal.h>`, `<Wire.h>`, `<SPI.h>`, `<stdint.h>`, `<math.h>`. 허용된 include는 앱의 내장 구현을 선택하는 표시이며 외부 헤더를 읽지 않습니다.
- 유틸리티: `abs`, `min`, `max`, `constrain`, `map`, `sin`, `cos`, `tan`, `sqrt`, `pow`, `floor`, `ceil`, `round`, `bitRead`, 숫자 변환과 `String`.

숫자는 내부적으로 JavaScript 유한 숫자를 사용합니다. 변수 선언만으로 실제 MCU의 정수 비트폭·오버플로·정수 나눗셈·float32 반올림을 재현하지 않습니다. 캐스트·비트 연산은 별도의 변환을 적용합니다. 일반 컴파일러, 클래스/상속/템플릿, 오버로드, 다차원 배열, 이중 포인터, 동적 메모리, typedef/enum/switch, 함수형 매크로, 구조체 내 배열·포인터 선언은 미지원입니다.

함수 호출 깊이·문장 실행·배열 및 구조체 할당·예약 이벤트 수에는 제한이 있습니다. 무한 반복이나 과도한 구조체 확장은 오류로 중단하며 호스트 JavaScript의 `eval`, 파일·네트워크 API를 스케치에 노출하지 않습니다.

## GPIO·시간·Serial

기존 `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`, `analogWrite`, `delay`, `millis`, `micros`, `delayMicroseconds`, `pulseIn`을 유지합니다. 핀은 `D13`, `PA5`, `A0` 등 이름으로 지정합니다. ADC는 0~4095, PWM 설정값은 0~255입니다.

`analogWriteFrequency(pin, hz)`는 1~2000 Hz, 기본 500 Hz입니다. **파형 탭 → PWM 파형으로 계산**을 켜면 GPIO가 시간별 HIGH/LOW로 바뀌고 실제 회로 해석에 반영됩니다. 끄면 평균 전압을 사용합니다. 설정은 실행 전에 바꾸세요.

`Serial.begin`, `Serial.print/println/write`, `Serial.available/read`는 배선 없는 USB 콘솔 모델입니다. 하단 통신 탭의 **USB 콘솔 → Serial**로 입력합니다. `Serial.print`는 현재 로그 항목 단위로 표시되며 네이티브 Arduino 터미널의 줄 편집 동작 전체를 재현하지 않습니다.

## LCD 1602

```cpp
#include <LiquidCrystal.h>
LiquidCrystal lcd(D2, D3, D4, D5, D6, D7); // RS, E, DB4~DB7
void setup() {
  lcd.begin(16, 2);
  lcd.print("STM Emulator");
  lcd.setCursor(0, 1);
  lcd.print("Hello!");
}
void loop() { delay(100); }
```

VSS=GND, VDD=5 V, VO=GND로 연결하고 RS/E/데이터 핀을 배선하세요. R/W를 생성자에서 생략하면 LCD의 R/W 핀을 GND에 연결해야 합니다. R/W를 포함한 7/11개 인수 생성자와 데이터 8개를 쓰는 10/11개 인수 생성자도 지원합니다.

| API | 동작 |
|---|---|
| `begin(16,2)` | 핀 설정 및 4/8비트 초기화 |
| `print(value[,format])`, `write(byte)` | 문자/숫자·사용자 문자 출력 |
| `setCursor(col,row)` | 열 0~15, 행 0~1 |
| `clear()`, `home()` | 문자 지우기, 주소/스크롤 복귀 |
| `display/noDisplay`, `cursor/noCursor`, `blink/noBlink` | 표시 상태 |
| `scrollDisplayLeft/Right`, `leftToRight/rightToLeft` | 표시 이동, 입력 방향 |
| `autoscroll/noAutoscroll` | 문자 입력 시 화면 이동 |
| `createChar(slot, rows)` | 0~7번 사용자 문자, 배열의 하위 5비트 × 8행 |
| `command(byte)` | 명령 직접 전송 |

내장 API는 실제 GPIO 값을 바꾸고, LCD는 연결된 E 핀의 하강 에지에서 RS/RW/데이터를 읽습니다. 따라서 코드의 핀 이름과 배선이 맞아야 합니다. ASCII 및 사용자 문자 8개를 표시하며 한글 폰트 ROM은 없습니다. 4.5~5.5 V 전원·쓰기 모드·VO 연결을 확인합니다. 논리 입력은 학습용 2.0 V HIGH / 0.8 V LOW 기준으로 모델링하며 특정 제조사 LCD의 전기 사양 보증이 아닙니다. 명령 대기 시간을 검사하지만 busy-flag 읽기와 모든 전원 상승 시퀀스는 구현하지 않았습니다.

## UART

**UART 터미널** 부품의 VCC/GND와 TX→보드 RX, RX←보드 TX를 연결합니다. 기본 보드 핀은 TX=PA2, RX=PA3입니다.

- `Serial1.setPins(rx, tx)`: 사용자 핀 지정. `begin` 전에 호출하세요.
- `Serial1.begin(baud)`: 300~2,000,000 baud. 부품의 속성과 같아야 합니다.
- `Serial1.print/println/write`, `Serial1.available/read`, `Serial1.end`.
- 하단 통신 탭 **UART 터미널 → Serial1**에서 문자를 입력합니다. 터미널 수신 창에서 보드가 보낸 내용도 봅니다.
- TX와 RX를 직접 연결하면 loopback이 됩니다.

8N1의 바이트당 10비트 시간을 수신 큐에 적용합니다. 터미널 송신 내역과 통신 이벤트는 트랜잭션 단위로 표시합니다. 선상의 start/data/stop 각 비트, parity/framing 오류·노이즈는 모델링하지 않습니다. 버퍼는 최대 4096바이트입니다.

## I²C 메모리

4핀 부품: VCC, GND, SDA, SCL. 기본 SDA=PB9, SCL=PB8, 주소=0x50. 모듈 안에 SDA/SCL용 10 kΩ 풀업을 포함합니다.

- `Wire.begin()` 또는 `Wire.begin(sda,scl)`.
- `Wire.setClock(hz)`: 1 kHz~1 MHz, 기본 100 kHz.
- `Wire.beginTransmission(address)`, `Wire.write(value)` / `Wire.write(buffer,length)`, `Wire.endTransmission([stop])`.
- `Wire.requestFrom(address,count[,stop])`, `Wire.available()`, `Wire.read()`.

범용 256바이트 RAM 모델입니다. 전송 첫 바이트는 메모리 주소, 나머지는 데이터이며 주소는 255 다음 0으로 순환합니다. 읽기는 현재 주소부터 시작합니다. 전원·배선·주소·중복 장치·SDA/SCL 단락을 확인하고, 성공은 `endTransmission()==0`, NACK는 2, 읽을 데이터가 없으면 `read()==-1`입니다.

Wire 버퍼는 최대 256바이트입니다. 전송 길이·속도로 논리 시간을 계산하지만 START/STOP의 실제 전압 에지, clock stretching, 중재, EEPROM 쓰기 지연·영구 보존은 모델링하지 않습니다. `stop` 인수는 받지만 별도 버스 소유권 상태를 만들지 않습니다.

## SPI 메모리

6핀 부품: VCC, GND, CS, SCK, MOSI, MISO. 기본 보드 핀은 SCK=PA5, MOSI=PA7, MISO=PA6. CS는 별도 OUTPUT GPIO로 제어합니다.

- `SPI.setPins(mosi,miso,sck)`, `SPI.begin()`.
- `SPI.setClock(hz)`: 1 kHz~20 MHz, 기본 1 MHz.
- `SPI.transfer(byte)`는 수신 바이트를 반환합니다. `SPI.end()`로 종료합니다.
- CS LOW → `0x02`(쓰기) / `0x03`(읽기) → 1바이트 주소 → 데이터 전송 → CS HIGH.
- 데이터는 범용 256바이트 RAM이며 주소가 순환합니다. 동시에 둘 이상의 CS가 활성화되면 오류입니다. 연결 장치가 없으면 255를 반환하고, MOSI↔MISO 배선 loopback도 지원합니다.

바이트 단위 모델입니다. CPOL/CPHA, 비트 순서, SCK 실제 에지, 임의 상용 SPI 장치 프로토콜은 미지원입니다. 메모리는 시뮬레이션 재시작 시 초기화됩니다.

## 타이머·인터럽트·DMA

| API | 동작 |
|---|---|
| `Timer.every(periodMs, callback)` | 반복 콜백, ID 반환 |
| `Timer.after(delayMs, callback)` | 한 번 콜백, ID 반환 |
| `Timer.cancel(id)` | 예약 해제 |
| `attachInterrupt(pin, callback, mode)` | `CHANGE`, `RISING`, `FALLING` GPIO 에지 |
| `digitalPinToInterrupt(pin)` | 이 모델에서는 같은 핀 식별자 반환 |
| `detachInterrupt(pin)` | 에지 콜백 해제 |
| `noInterrupts()`, `interrupts()` | GPIO 콜백 전달 차단/허용. 차단 중 에지는 핀마다 한 번 대기 |
| `DMA.start(pin, buffer, count, periodMs[,callback])` | ADC를 배열에 주기적으로 기록 |
| `DMA.write(pin, buffer, count, periodMs[,callback])` | 배열의 0~255 값을 PWM 출력으로 전송 |
| `DMA.busy(id)`, `DMA.cancel(id)` | 진행 상태, 해제 |

콜백은 인수 없는 사용자 함수입니다. `loop()`가 `delay()` 중이어도 예약된 작업은 진행합니다. 타이머는 최대 32개, DMA는 8채널, 버퍼 길이는 1~4096입니다. period는 1 ms 이상입니다. DMA에 넘긴 배열은 완료할 때까지 살아 있어야 하므로 전역 배열을 권장합니다. 콜백 안에서 `delay`·`delayMicroseconds`는 오류입니다.

이는 스케치용 스케줄러 API이며 STM32 TIM/NVIC/DMA 레지스터·우선순위·전송 경쟁·CPU 선점을 구현한 것이 아닙니다. 콜백은 협력적으로 실행되고 트랜잭션/짧은 펄스 API는 한 번의 스케치 실행 중 논리 시간을 진행할 수 있습니다. µs 정밀 CPU 실행을 주장하지 않습니다.

## 파형과 회로 계산

파형 탭에서 GPIO 채널 4개, 표시 시간 10 ms/100 ms/1 s/5 s를 고릅니다. 0.1/0.5/1/5/20 ms의 계산 간격과 PWM 모드를 실행 전에 설정하며 회로 파일에도 보존합니다. GPIO 전환 시점을 추가로 기록합니다.

회로 과도 계산은 후진 오일러 RC 모델이며 GPIO가 바뀌기 전까지 이전 출력으로 적분한 후 새 출력 상태를 계산합니다. 파형은 채널별 GND 기준 전압, 표시 축은 0~5 V이며 수치 원본은 CSV에 기록됩니다. 저장 버튼은 실제 파일 선택창으로 CSV를 내보냅니다. 최대 12,000개 샘플을 순환 보관하고, 채널을 바꾸면 이전 기록을 초기화합니다.

정밀 SPICE 엔진, 반도체 전체 동특성, 실제 기계 치수·충돌 검사는 포함하지 않습니다. 시간 간격을 작게 하면 RC 모델의 수치 오차는 줄일 수 있지만 물리 모델 자체의 생략이 없어지는 것은 아닙니다.

## 인터페이스 참고

[Arduino LiquidCrystal API](https://docs.arduino.cc/libraries/liquidcrystal/), [Wire API](https://docs.arduino.cc/language-reference/en/functions/communication/wire/), [SPI API](https://docs.arduino.cc/language-reference/en/functions/communication/SPI/), [attachInterrupt](https://docs.arduino.cc/language-reference/en/functions/external-interrupts/attachInterrupt/)를 참고해 이름·호출 방식을 정했습니다. 해당 라이브러리 구현을 이 앱에 복사하거나 링크하지 않았습니다. 실제 지원 범위와 앱 전용 API는 위 설명을 따릅니다.
