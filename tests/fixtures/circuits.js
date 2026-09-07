// Regression circuits and compatibility programs; excluded from the application package.
import {boardPin} from "../../src/pins.js";
export const BLINK=`// D13 = PA5 · GPIO 출력으로 LED를 깜빡입니다.
void setup() {
  pinMode(D13, OUTPUT);
}

void loop() {
  digitalWrite(D13, HIGH);
  delay(500);
  digitalWrite(D13, LOW);
  delay(500);
}`;
export function blankFixture(){return {format:'stm32-circuit-lab',version:2,name:'새 회로',components:[],wires:[],code:BLINK};}
const wire=(id,from,to,color='#23a68a')=>({id,from,to,color});
export function circuitFixture(which='blink'){
  const p=blankFixture();p.name='01 · LED 깜빡이기';
  p.components=[{id:'r1',name:'R1',type:'resistor',value:330,x:795,y:226,rotation:0,span:42,attachA:'bb:e:8',attachB:'bb:f:8'},{id:'led1',name:'LED1',type:'led',color:'red',x:872,y:254,rotation:90,span:56,attachA:'bb:j:8',attachB:'bb:j:12'}];
  p.wires=[wire('w1',boardPin('D13'),'bb:a:8'),wire('w2',boardPin('GND'),'rail:R:-:1','#4e647b'),wire('w3','rail:R:-:10','bb:h:12','#4e647b')];
  if(which==='button'){
    p.name='02 · 버튼으로 LED 켜기';
    p.components.push({id:'b1',name:'SW1',type:'button',x:795,y:380,rotation:0,attachments:{a:'bb:e:18',b:'bb:f:18',c:'bb:e:20',d:'bb:f:20'}});
    p.wires.push(wire('w4',boardPin('D2'),'bb:a:18','#8064d8'),wire('w5','bb:j:18','rail:R:-:16','#4e647b'));
    p.code=`// 실행 후 빵판 위 버튼을 누르고 계세요.
void setup() {
  pinMode(D13, OUTPUT);
  pinMode(D2, INPUT_PULLUP);
}

void loop() {
  if (digitalRead(D2) == LOW) {
    digitalWrite(D13, HIGH);
  } else {
    digitalWrite(D13, LOW);
  }
  delay(20);
}`;
  }
  if(which==='divider'){
    p.name='03 · 분압과 아날로그 입력';
    p.components=[{id:'r1',name:'R1',type:'resistor',value:10000,x:795,y:226,rotation:0,span:42,attachA:'bb:e:8',attachB:'bb:f:8'},{id:'r2',name:'R2',type:'resistor',value:10000,x:872,y:275,rotation:90,span:98,attachA:'bb:j:8',attachB:'bb:j:15'}];
    p.wires=[wire('w1',boardPin('3V3'),'bb:a:8','#dd654c'),wire('w2',boardPin('GND'),'bb:h:15','#4e647b'),wire('w3',boardPin('A0'),'bb:h:8','#8064d8')];
    p.code=`// 10 kΩ / 10 kΩ 분압: 약 1.65 V, ADC 약 2048
void setup() {
  pinMode(A0, INPUT);
  Serial.begin(115200);
}

void loop() {
  Serial.println(analogRead(A0));
  delay(500);
}`;
  }
  return p;
}
