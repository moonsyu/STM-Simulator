import {blankProject,example} from './project.js';
import {boardPin} from './pins.js';
import {PART_DEFS} from './components.js';
import {findMount,applyMount} from './placement.js';
export const FEATURE_EXAMPLES={lcd:'LCD 문자 출력',uart:'UART 터미널 송수신',i2c:'I²C 메모리 읽기/쓰기',spi:'SPI 메모리 읽기/쓰기',timer:'타이머로 LED 제어',interrupt:'버튼 인터럽트',dma:'ADC 버퍼 전송',language:'함수·배열·구조체',pwm:'PWM 파형과 RC 필터'};
export function featureExample(type){
  if(!Object.hasOwn(FEATURE_EXAMPLES,type))throw new Error('지원하지 않는 기능 예제입니다.');
  const p=['timer','interrupt','pwm'].includes(type)?example(type==='interrupt'?'button':'blink'):type==='dma'?example('divider'):blankProject();p.name=FEATURE_EXAMPLES[type];
  let id=100;const wire=(from,to,color='#23a68a')=>p.wires.push({id:'f'+id++,from,to,color});
  const pin=n=>'part:demo:p'+n,power=(n,name)=>wire(boardPin(name),pin(n),name==='GND'?'#4e647b':'#dd654c');
  if(type==='lcd'){
    p.components.push({id:'demo',name:'LCD1',type:'lcd',x:810,y:645,rotation:0});
    power(1,'GND');power(2,'5V');power(3,'GND');power(5,'GND');power(15,'5V');power(16,'GND');
    [[4,'D2'],[6,'D3'],[11,'D4'],[12,'D5'],[13,'D6'],[14,'D7']].forEach(([n,name])=>wire(boardPin(name),pin(n)));
    p.code=`#include <LiquidCrystal.h>
LiquidCrystal lcd(D2, D3, D4, D5, D6, D7);
void setup() {
  lcd.begin(16, 2);
  lcd.print("STM Emulator");
}
void loop() {
  lcd.setCursor(0, 1);
  lcd.print("Time: ");
  lcd.print(millis() / 1000);
  lcd.print(" s     ");
  delay(250);
}`;
  }
  if(['uart','i2c','spi'].includes(type)){
    const part={id:'demo',type,name:PART_DEFS[type].prefix+'1',x:844,y:303,rotation:90,...PART_DEFS[type].defaults};applyMount(part,findMount(part));p.components.push(part);power(1,'3V3');power(2,'GND');
  }
  if(type==='uart'){
    wire(pin(3),boardPin('PA3'));wire(boardPin('PA2'),pin(4));
    p.code=`// 하단 통신 탭의 UART 입력으로 글자를 보내세요.
void setup() { Serial.begin(115200); Serial1.begin(9600); Serial1.println("UART ready"); }
void loop() {
  while (Serial1.available() > 0) {
    int value = Serial1.read();
    Serial.write(value);
    Serial1.write(value);
  }
  delay(5);
}`;
  }
  if(type==='i2c'){
    wire(boardPin('PB9'),pin(3));wire(boardPin('PB8'),pin(4));
    p.code=`#include <Wire.h>
void setup() {
  Wire.begin();
  Wire.beginTransmission(0x50);
  Wire.write(0x10); // 메모리 위치
  Wire.write(42);
  Serial.println(Wire.endTransmission()); // 0: ACK, 2: NACK
}
void loop() {
  Wire.beginTransmission(0x50);
  Wire.write(0x10);
  Wire.endTransmission(false);
  Wire.requestFrom(0x50, 1);
  if (Wire.available()) Serial.println(Wire.read());
  delay(500);
}`;
  }
  if(type==='spi'){
    [[3,'D10'],[4,'PA5'],[5,'PA7'],[6,'PA6']].forEach(([n,name])=>wire(boardPin(name),pin(n)));
    p.code=`#include <SPI.h>
void setup() {
  pinMode(D10, OUTPUT);
  digitalWrite(D10, HIGH);
  SPI.begin();
  digitalWrite(D10, LOW);
  SPI.transfer(0x02); // WRITE
  SPI.transfer(0x10);
  SPI.transfer(42);
  digitalWrite(D10, HIGH);
}
void loop() {
  digitalWrite(D10, LOW);
  SPI.transfer(0x03); // READ
  SPI.transfer(0x10);
  Serial.println(SPI.transfer(0));
  digitalWrite(D10, HIGH);
  delay(500);
}`;
  }
  if(type==='timer')p.code=`int level = LOW;
void blink() { level = !level; digitalWrite(D13, level); }
void setup() { pinMode(D13, OUTPUT); Timer.every(250, blink); }
void loop() { delay(1000); } // 대기 중에도 콜백 실행`;
  if(type==='interrupt')p.code=`volatile int count = 0;
void pressed() { count++; digitalWrite(D13, count & 1); }
void setup() {
  pinMode(D13, OUTPUT);
  pinMode(D2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(D2), pressed, FALLING);
}
void loop() { Serial.println(count); delay(500); }`;
  if(type==='dma')p.code=`int samples[8];
void complete() {
  for (int i = 0; i < 8; i++) Serial.println(samples[i]);
}
void setup() { pinMode(A0, INPUT); DMA.start(A0, samples, 8, 10, complete); }
void loop() { delay(1000); }`;
  if(type==='language')p.code=`struct Reading { int total; int count; };
int average(int data[], int count) {
  Reading result = {0, count};
  Reading *p = &result;
  for (int i = 0; i < count; i++) p->total += data[i];
  return result.total / result.count;
}
void setup() { int samples[] = {10, 20, 30, 40}; Serial.println(average(samples, 4)); }
void loop() { delay(1000); }`;
  if(type==='pwm'){
    p.components=[{id:'r1',name:'R1',type:'resistor',value:1000,x:795,y:226,rotation:0,span:42,attachA:'bb:e:8',attachB:'bb:f:8'},{id:'demo',name:'C1',type:'capacitor',value:10,x:872,y:275,rotation:90,span:98,attachA:'bb:j:8',attachB:'bb:j:15'}];
    p.wires=[];wire(boardPin('D13'),'bb:a:8');wire(boardPin('GND'),'bb:h:15','#4e647b');wire(boardPin('A0'),'bb:h:8','#8064d8');p.simulation={stepMs:.1,pwmWaveform:true};
    p.code='void setup() {\n  pinMode(D13, OUTPUT);\n  pinMode(A0, INPUT);\n  analogWriteFrequency(D13, 100);\n  analogWrite(D13, 128);\n}\nvoid loop() { delay(100); }';
  }
  return p;
}
