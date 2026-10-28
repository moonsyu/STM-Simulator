import {CATALOG_DEFS,catalogType} from './catalog-defs.js';
import {holeInfo,breadboardPrefix} from './pins.js';
import {localTerminals} from './components.js';
import {partVector} from './geometry.js';
import {findMount,applyMount} from './placement.js';
import {DEVBOARD_MODELS,devboardPins,boardFileKey} from './devboards.js';
import {defineScenario} from './fixed-run.js';
import {startProject,validateProject} from './project.js';
import {halExampleFor} from './hal-examples.js';

// SSAFY embedded-track lecture circuits on ESP32 and Raspberry Pi boards (the lecture schematics site lists the board
// pins and parts of each). The same board pins, parts and connections are built here on this app's breadboards; hole
// positions follow this app's layout. Board programs are this app's own short examples of what each lab does: ESP32
// sketches run in the interpreter (esp32-sketch.js), Raspberry Pi programs as fixed-run scenarios (fixed-run.js), and
// the STM32 in FW-09 runs its HAL code.
const COLORS={red:'#e53935',black:'#263238',yellow:'#f6c026',green:'#2e9d4f',blue:'#1e88e5',orange:'#fb8c00',gray:'#8d8d8d',sky:'#4fc3f7',purple:'#8e44ad'};
const hole=(letter,row)=>`bb:${letter}:${row}`,rail=(side,sign,n)=>`rail:${side}:${sign}:${n}`;
const fullHole=(bb,letter,col)=>`${breadboardPrefix(bb)}bb:${letter}:${col}`,fullRail=(bb,side,sign,n)=>`${breadboardPrefix(bb)}rail:${side}:${sign}:${n}`;

function base({stm32=false,breadboard=true}={}){
 const p=startProject();p.surfaces={board:{hidden:!stm32},breadboard:{hidden:!breadboard}};return p;
}
const pos=(p,id)=>{const h=holeInfo(id,p.components,p.surfaces)||devboardPins(p.components.find(c=>id.startsWith(`devboard:${c.id}:`))||{}).find(x=>x.id===id);if(!h)throw new Error('예제 위치를 찾지 못했습니다: '+id);return h;};
function part(p,{id,type,name,props={}}){const t=catalogType(type);return {id,type:t,name,x:0,y:0,rotation:0,...structuredClone(CATALOG_DEFS[t].defaults),...props};}
// Two-lead parts sit between their two holes.
function twoPin(p,spec,from,to){const q=part(p,spec),a=pos(p,from),b=pos(p,to);Object.assign(q,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,rotation:((Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)+360)%360,span:Math.hypot(b.x-a.x,b.y-a.y),attachA:from,attachB:to});p.components.push(q);return q;}
// Multi-pin parts (and ESP32 boards): placed so terminal `key` lands on `at`, then plugged into the holes under them.
function plugged(p,q,key,at){
 const t=localTerminals({...q,rotation:0}).find(t=>t.key===key),v=partVector({rotation:q.rotation},t.x,t.y),h=pos(p,at);q.x=h.x-v.x;q.y=h.y-v.y;
 if(!applyMount(q,findMount(q,p.components,4,p.surfaces,p.wires)))throw new Error(`${q.name}: 예제 위치의 구멍에 꽂지 못했습니다.`);p.components.push(q);return q;
}
function wire(p,from,to,color){p.wires.push({id:'w'+(p.wires.length+1),from,to,color:COLORS[color]??color});}
function devboard(p,{id,model,name,scenario,code,x=0,y=0,rotation=0}){return {id,type:'devboard',model,name,x,y,rotation,code,scenario};}
const rpiPin=(id,n)=>`devboard:${id}:P${n}`;
function esp32Pin(model,signal){return DEVBOARD_MODELS[model].pins.find(p=>p.signal===signal).key;}

// --- Board programs (this app's own examples) -------------------------------------------------------------------
const PY_LED_POWER='# RPI-01 · 이 실습은 코드 없이 3.3V(1번 핀) 전원으로 LED를 켭니다.\n# LED 긴 다리(+)를 3.3V 쪽, 짧은 다리(−)를 220Ω 저항 쪽에 꽂습니다.\n';
const PY_LED_BLINK='# RPI-02 · GPIO17(11번 핀)의 LED를 1초마다 켜고 끕니다.\nfrom gpiozero import LED\nfrom time import sleep\n\nled = LED(17)\nwhile True:\n    led.on()\n    print("LED ON")\n    sleep(1)\n    led.off()\n    print("LED OFF")\n    sleep(1)\n';
const PY_PWM='# RPI-03 · GPIO17 LED 밝기를 PWM으로 0% → 100%까지 천천히 올립니다.\nfrom gpiozero import PWMLED\nfrom time import sleep\n\nled = PWMLED(17)\nwhile True:\n    for step in range(11):\n        led.value = step / 10\n        print(f"밝기 {step * 10}%")\n        sleep(0.2)\n';
const PY_BUTTON='# RPI-04 · GPIO27(13번 핀) Tact 스위치를 내부 풀업으로 읽습니다.\nfrom gpiozero import Button\nfrom signal import pause\n\nbutton = Button(27)  # 내부 풀업: 누르면 LOW\nbutton.when_pressed = lambda: print("눌림")\nbutton.when_released = lambda: print("떼어짐")\npause()\n';
const PY_TWO_BUTTONS='# RPI-05 · GPIO27은 내부 풀업, GPIO22는 외부 10kΩ 풀업으로 스위치 두 개를 읽습니다.\nfrom gpiozero import Button\nfrom signal import pause\n\ninner = Button(27)                                 # 내부 풀업\nouter = Button(22, pull_up=None, active_state=False)  # 외부 풀업(3.3V–10kΩ)\ninner.when_pressed = lambda: print("GPIO27 눌림")\nouter.when_pressed = lambda: print("GPIO22 눌림")\npause()\n';
const KERNEL_LED='// KER-01 · GPIO20 LED를 커널 타이머로 1초마다 켜고 끄는 드라이버(요약)\n#include <linux/module.h>\n#include <linux/gpio/consumer.h>\n#include <linux/timer.h>\n\nstatic struct gpio_desc *led;\nstatic struct timer_list blink;\nstatic int on;\n\nstatic void blink_fn(struct timer_list *t) {\n    on = !on;\n    gpiod_set_value(led, on);\n    pr_info("led_driver: LED %s\\n", on ? "ON" : "OFF");\n    mod_timer(&blink, jiffies + HZ);\n}\n\n/* probe: led = gpiod_get(dev, "led", GPIOD_OUT_LOW);  (GPIO20)\n *        timer_setup(&blink, blink_fn, 0); mod_timer(&blink, jiffies + HZ); */\nMODULE_LICENSE("GPL");\n';
const KERNEL_BUTTON='// KER-02 · GPIO2 Tact 스위치 인터럽트로 GPIO20 LED를 켜고 끄는 드라이버(요약)\n#include <linux/module.h>\n#include <linux/gpio/consumer.h>\n#include <linux/interrupt.h>\n\nstatic struct gpio_desc *button, *led;\n\nstatic irqreturn_t button_isr(int irq, void *data) {\n    int pressed = !gpiod_get_value(button);   /* 풀업: 누르면 LOW */\n    gpiod_set_value(led, pressed);\n    pr_info("button_driver: %s\\n", pressed ? "pressed" : "released");\n    return IRQ_HANDLED;\n}\n\n/* probe: button = gpiod_get(dev, "button", GPIOD_IN);  (GPIO2, 보드 1.8kΩ + 외부 10kΩ 풀업)\n *        led = gpiod_get(dev, "led", GPIOD_OUT_LOW);   (GPIO20)\n *        request_irq(gpiod_to_irq(button), button_isr, IRQF_TRIGGER_RISING | IRQF_TRIGGER_FALLING, ...); */\nMODULE_LICENSE("GPL");\n';
const INO_BLINK='// FW-08 · ESP32 GPIO2 LED를 0.5초마다 켜고 끕니다(보드 내장 파란 LED도 같은 핀).\nconst int LED_PIN = 2;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  Serial.println("LED ON");\n  delay(500);\n  digitalWrite(LED_PIN, LOW);\n  Serial.println("LED OFF");\n  delay(500);\n}\n';
const INO_IO='// IOT-01 · LED(GPIO17), Tact 스위치(GPIO18, 외부 10kΩ 풀업), 가변저항(GPIO36 = VP), DHT11(GPIO13)\n#include <DHT.h>\n\nDHT dht(13, DHT11);\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(17, OUTPUT);\n  pinMode(18, INPUT);\n  dht.begin();\n}\n\nvoid loop() {\n  bool pressed = digitalRead(18) == LOW;   // 누르면 LOW\n  digitalWrite(17, pressed ? HIGH : LOW);\n  int raw = analogRead(36);               // 12비트 0~4095\n  Serial.printf("가변저항 %d (%.2f V)\\n", raw, raw * 3.3 / 4095);\n  Serial.printf("온도 %.1f C, 습도 %.0f %%\\n", dht.readTemperature(), dht.readHumidity());\n  delay(1000);\n}\n';
const INO_I2C='// FW-09 · ESP32를 I2C 슬레이브(주소 0x08)로: STM32가 보낸 1/0으로 GPIO2 LED를 켜고 끕니다.\n#include <Wire.h>\n\nvoid receive(int count) {\n  while (Wire.available()) {\n    int value = Wire.read();\n    digitalWrite(2, value ? HIGH : LOW);\n    Serial.printf("I2C 수신 %d → LED %s\\n", value, value ? "ON" : "OFF");\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(2, OUTPUT);\n  Wire.begin(0x08);          // SDA = GPIO21, SCL = GPIO22\n  Wire.onReceive(receive);\n}\n\nvoid loop() {}\n';

// --- Fixed-run scenarios ----------------------------------------------------------------------------------------
defineScenario('lecture-rpi-power-led',{title:'3.3V 전원 LED',start(ctx){ctx.log('코드 없이 3.3V 전원으로 LED를 켜는 회로입니다.');}});
defineScenario('lecture-rpi-blink',{title:'GPIO17 LED 깜빡임',start(ctx){let on=true;ctx.output('GPIO17',1);ctx.log('LED ON');ctx.every(1000,c=>{on=!on;c.output('GPIO17',on);c.log(on?'LED ON':'LED OFF');});}});
defineScenario('lecture-rpi-pwm',{title:'GPIO17 PWM 밝기',start(ctx){let step=0;const set=c=>{c.pwm('GPIO17',step/10);c.log(`밝기 ${step*10}%`);};set(ctx);ctx.every(200,c=>{step=(step+1)%11;set(c);});}});
defineScenario('lecture-rpi-button',{title:'GPIO27 Tact 스위치',start(ctx){ctx.input('GPIO27','up',(c,level)=>c.log(level?'떼어짐':'눌림'));}});
defineScenario('lecture-rpi-two-buttons',{title:'내부·외부 풀업 스위치 두 개',start(ctx){ctx.input('GPIO27','up',(c,level)=>{if(!level)c.log('GPIO27 눌림');});ctx.input('GPIO22',null,(c,level)=>{if(!level)c.log('GPIO22 눌림');});}});
defineScenario('lecture-kernel-led',{title:'커널 타이머 LED',start(ctx){let on=false;ctx.output('GPIO20',0);ctx.log('led_driver: 모듈을 적재했습니다 (GPIO20)');ctx.every(1000,c=>{on=!on;c.output('GPIO20',on);c.log(`led_driver: LED ${on?'ON':'OFF'}`);});}});
defineScenario('lecture-kernel-button',{title:'커널 인터럽트 스위치·LED',start(ctx){ctx.output('GPIO20',0);ctx.log('button_driver: 모듈을 적재했습니다 (스위치 GPIO2, LED GPIO20)');ctx.input('GPIO2',null,(c,level)=>{c.output('GPIO20',!level);c.log(`button_driver: ${level?'released':'pressed'}`);});}});

// --- Circuits -----------------------------------------------------------------------------------------------------
const RPI={x:330,y:270};
function rpiProject(name,scenario,code){const p=base();p.name=name;p.components.push(devboard(p,{id:'rpi',model:'rpi5',name:'RPI-1',scenario,code,...RPI}));return p;}
// LED (+ at column e, − at column f across the channel) and its 220 Ω resistor to the right − rail.
function ledRow(p,row,{id='LED1',rid='R1'}={}){twoPin(p,{id,type:'led-tht-2',name:'LED1',props:{color:'red'}},hole('e',row),hole('f',row));twoPin(p,{id:rid,type:'resistor-axial-2',name:rid,props:{value:220}},hole('j',row),rail('R','-',row+(row>5?1:0)));}
// Tact switch on the left half, rotated so its always-joined pairs lie along rows `row` and `row+2`.
function tactSwitch(p,row,{id='SW1',name='SW1'}={}){return plugged(p,{...part(p,{id,type:'button-4',name}),rotation:90},'p3',hole('c',row));}

function rpi01(){const p=rpiProject('RPI-01 라즈베리파이5 LED — 3.3V 전원','lecture-rpi-power-led',PY_LED_POWER);
 wire(p,rpiPin('rpi',1),rail('L','+',2),'red');wire(p,rpiPin('rpi',6),rail('R','-',3),'black');wire(p,rail('L','+',7),hole('a',6),'red');ledRow(p,6);return p;}
function rpi02(){const p=rpiProject('RPI-02 라즈베리파이5 LED — GPIO17','lecture-rpi-blink',PY_LED_BLINK);
 wire(p,rpiPin('rpi',6),rail('R','-',3),'black');wire(p,rpiPin('rpi',11),hole('a',6),'yellow');ledRow(p,6);return p;}
function rpi03(){const p=rpi02();p.name='RPI-03 라즈베리파이5 PWM LED — GPIO17 밝기 조절';const b=p.components.find(c=>c.id==='rpi');b.scenario='lecture-rpi-pwm';b.code=PY_PWM;return p;}
function rpi04(){const p=rpiProject('RPI-04 라즈베리파이5 Tact 스위치 입력 — GPIO27','lecture-rpi-button',PY_BUTTON);
 wire(p,rpiPin('rpi',6),rail('L','-',3),'black');tactSwitch(p,11);wire(p,rpiPin('rpi',13),hole('a',11),'green');wire(p,hole('a',13),rail('L','-',11),'black');return p;}
function rpi05(){const p=rpiProject('RPI-05 라즈베리파이5 Tact 스위치 2개 — 내부 풀업(GPIO27)·외부 풀업(GPIO22)','lecture-rpi-two-buttons',PY_TWO_BUTTONS);
 wire(p,rpiPin('rpi',1),rail('L','+',2),'red');wire(p,rpiPin('rpi',6),rail('L','-',3),'black');
 tactSwitch(p,11,{id:'SW1',name:'SW1'});wire(p,rpiPin('rpi',13),hole('a',11),'green');wire(p,hole('a',13),rail('L','-',11),'black');
 tactSwitch(p,17,{id:'SW2',name:'SW2'});wire(p,rpiPin('rpi',15),hole('a',17),'gray');twoPin(p,{id:'R1',type:'resistor-axial-2',name:'R1',props:{value:10000}},rail('L','+',16),hole('b',17));wire(p,hole('a',19),rail('L','-',17),'black');return p;}
function ker01(){const p=rpiProject('KER-01 커널 드라이버 LED — GPIO20','lecture-kernel-led',KERNEL_LED);p.components[0].code=KERNEL_LED;
 wire(p,rpiPin('rpi',6),rail('R','-',3),'black');wire(p,rpiPin('rpi',38),hole('a',17),'yellow');ledRow(p,17);return p;}
function ker02(){const p=rpiProject('KER-02 커널 드라이버 Tact 스위치(GPIO2)·LED(GPIO20)','lecture-kernel-button',KERNEL_BUTTON);
 wire(p,rpiPin('rpi',1),rail('L','+',2),'red');wire(p,rpiPin('rpi',6),rail('L','-',3),'black');wire(p,rail('L','-',24),rail('R','-',24),'black');
 tactSwitch(p,10);wire(p,rpiPin('rpi',3),hole('a',10),'green');twoPin(p,{id:'R3',type:'resistor-axial-2',name:'R3',props:{value:10000}},rail('L','+',8),hole('b',10));wire(p,hole('a',12),rail('L','-',11),'black');
 wire(p,rpiPin('rpi',38),hole('a',17),'yellow');ledRow(p,17,{rid:'R2'});return p;}

// ESP32 on the 400-point breadboard: left header in column b, right header in column i, rows 11–29.
function esp32OnBreadboard(p,{code}){const id='esp32',model='esp32-nodemcu-32s',q=devboard(p,{id,model,name:'ESP32-1',code});return plugged(p,q,'L1',hole('b',11));}
function fw08(){const p=base();p.name='FW-08 ESP32 보드 LED — GPIO2';esp32OnBreadboard(p,{code:INO_BLINK});
 wire(p,hole('a',11),rail('L','+',10),'red');wire(p,hole('j',11),rail('R','-',10),'black');wire(p,hole('j',25),hole('c',2),'yellow');ledRow(p,2);return p;}

// ESP32 across an 830-point breadboard (rotated 270°: right header in row b, left header in row i, columns 41–59).
function iot01(){
 const p=base({breadboard:false});p.name='IOT-01 ESP32 보드 입출력 종합 — LED·Tact 스위치·가변저항10k·DHT11';
 p.components.push({id:'bb1',type:'breadboard',name:'BB1',variant:'full',x:560,y:330,rotation:0});const bb='bb1',H=(l,c)=>fullHole(bb,l,c),R=(s,sign,n)=>fullRail(bb,s,sign,n);
 const model='esp32-nodemcu-32s',q=devboard(p,{id:'esp32',model,name:'ESP32-1',code:INO_IO,rotation:270});plugged(p,q,'L1',H('i',41));
 const top=signal=>q.attachments[esp32Pin(model,signal)];// the hole a header pin sits in
 wire(p,H('j',41),R('T','+',1),'red');wire(p,H('a',41),R('T','-',39),'black');wire(p,R('T','+',2),R('B','+',2),'red');wire(p,R('T','-',3),R('B','-',3),'black');
 // LED on GPIO17 across the channel at column 6, 220 Ω to the bottom − rail.
 twoPin(p,{id:'LED1',type:'led-tht-2',name:'LED1',props:{color:'red'}},H('e',6),H('f',6));twoPin(p,{id:'R1',type:'resistor-axial-2',name:'R1',props:{value:220}},H('j',6),R('B','-',6));
 wire(p,top('GPIO17').replace(':bb:b:',':bb:a:'),H('a',6),'yellow');
 // Tact switch on GPIO18 with a 10 kΩ pull-up to 3.3 V; the other side to GND.
 plugged(p,part(p,{id:'SW1',type:'button-4',name:'SW1'}),'p1',H('c',12));twoPin(p,{id:'R2',type:'resistor-axial-2',name:'R2',props:{value:10000}},R('T','+',10),H('b',12));
 wire(p,top('GPIO18').replace(':bb:b:',':bb:a:'),H('a',12),'sky');wire(p,H('d',14),R('T','-',12),'black');
 // 10 kΩ potentiometer: ends to 3.3 V / GND, wiper to GPIO36 (VP).
 plugged(p,{...part(p,{id:'VR1',type:'pot-bare-3',name:'VR1',props:{value:10000}})},'p1',H('h',20));wire(p,H('j',20),R('B','+',17),'red');wire(p,H('j',22),R('B','-',19),'black');wire(p,H('f',21),q.attachments[esp32Pin(model,'GPIO36')].replace(':bb:i:',':bb:j:'),'green');
 // DHT11 module: VCC / GND / DATA (GPIO13).
 plugged(p,part(p,{id:'U1',type:'dht11-module-3',name:'DHT11'}),'p1',H('h',28));wire(p,H('j',28),R('B','+',24),'red');wire(p,H('j',29),R('B','-',25),'black');wire(p,H('f',30),q.attachments[esp32Pin(model,'GPIO13')].replace(':bb:i:',':bb:j:'),'orange');
 return p;
}

// STM32 (I2C master, HAL code runs) and ESP32 (I2C slave 0x08, fixed run) on one breadboard.
const FW09_MAIN='  uint8_t command = 1;\n  HAL_Delay(100);  /* ESP32가 부팅해 슬레이브로 대기할 때까지 */\n  printf("STM32 I2C 마스터 · ESP32 주소 0x08\\n");\n    /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    HAL_StatusTypeDef status = HAL_I2C_Master_Transmit(&hi2c1, 0x08 << 1, &command, 1, 100);\n    printf("ESP32에 %u 보냄 (status=%d)\\n", command, status);\n    command = !command;\n    HAL_Delay(1000);\n    /* USER CODE END 3 */';
function fw09(){
 const e=halExampleFor('i2c','nucleo-f103rb'),p=base({stm32:true});p.name='FW-09 STM32 보드·ESP32 보드 I2C 통신 + LED';p.mcu=e.mcu;p.firmware=e.firmware;
 p.code=e.code.replace(/\/\* USER CODE BEGIN 2 \*\/[\s\S]*?\/\* USER CODE END 3 \*\//,'/* USER CODE BEGIN 2 */\n'+FW09_MAIN).replace(/^\/\/ I2C1 PB8.*$/m,'// FW-09 · I2C1 PB8(SCL)/PB9(SDA) 마스터 → ESP32 슬레이브 0x08, ESP32 쪽 10 kΩ 풀업');
 const model='esp32-nodemcu-32s',q=esp32OnBreadboard(p,{code:INO_I2C}),at=signal=>q.attachments[esp32Pin(model,signal)].replace(':i:',':j:');
 wire(p,hole('a',11),rail('L','+',10),'red');wire(p,hole('j',11),rail('R','-',10),'black');wire(p,'board:CN6:4',rail('L','+',2),'red');wire(p,'board:CN6:6',rail('R','-',4),'black');wire(p,rail('L','+',25),rail('R','+',25),'red');
 wire(p,'board:CN5:10',at('GPIO22'),'green');wire(p,'board:CN5:9',at('GPIO21'),'orange');
 twoPin(p,{id:'R1',type:'resistor-axial-2',name:'R1',props:{value:10000}},hole('h',13),rail('R','+',12));twoPin(p,{id:'R2',type:'resistor-axial-2',name:'R2',props:{value:10000}},hole('h',16),rail('R','+',15));
 wire(p,at('GPIO2'),hole('c',2),'yellow');ledRow(p,2,{rid:'R3'});return p;
}

export const LECTURE_EXAMPLES=Object.freeze([
 {id:'lecture-rpi-01',code:'RPI-01',title:'라즈베리파이5 LED — 3.3V 전원으로 켜기',ref:'라즈베리파이와AI Day1 p.76',build:rpi01},
 {id:'lecture-rpi-02',code:'RPI-02',title:'라즈베리파이5 LED — GPIO17',ref:'라즈베리파이와AI Day1 p.78 · Day4 p.75',build:rpi02},
 {id:'lecture-rpi-03',code:'RPI-03',title:'라즈베리파이5 PWM LED — GPIO17 밝기 조절',ref:'라즈베리파이와AI Day1 p.104',build:rpi03},
 {id:'lecture-rpi-04',code:'RPI-04',title:'라즈베리파이5 Tact 스위치 입력 — GPIO27',ref:'라즈베리파이와AI Day1 p.86',build:rpi04},
 {id:'lecture-rpi-05',code:'RPI-05',title:'라즈베리파이5 Tact 스위치 2개 — 내부·외부 풀업',ref:'라즈베리파이와AI Day1 p.95',build:rpi05},
 {id:'lecture-ker-01',code:'KER-01',title:'커널 드라이버 LED — GPIO20',ref:'리눅스커널프로그래밍 Day3 p.23',build:ker01},
 {id:'lecture-ker-02',code:'KER-02',title:'커널 드라이버 Tact 스위치·LED',ref:'리눅스커널프로그래밍 Day3 p.51',build:ker02},
 {id:'lecture-fw-08',code:'FW-08',title:'ESP32 보드 LED — GPIO2',ref:'임베디드Firmware Day4 p.55·56 · 임베디드AIoT Day4 p.90',build:fw08},
 {id:'lecture-iot-01',code:'IOT-01',title:'ESP32 보드 입출력 종합 — LED·스위치·가변저항·DHT11',ref:'임베디드AIoT Day1 p.53·54',build:iot01},
 {id:'lecture-fw-09',code:'FW-09',title:'STM32 보드·ESP32 보드 I2C 통신 + LED',ref:'임베디드Firmware Day4 p.63~84',build:fw09}
]);
export const lectureExample=id=>LECTURE_EXAMPLES.find(e=>e.id===id);
/** Example list values of lecture examples (`lecture:<id>`), next to the HAL example ids. */
export const LECTURE_PREFIX='lecture:';
export function lectureGuide(id){const e=lectureExample(id);if(!e)return '';const fw09=e.id==='lecture-fw-09';const esp32=['lecture-fw-08','lecture-iot-01'].includes(e.id);return `${e.ref} · ${fw09?'STM32 HAL 코드와 ESP32 스케치(I2C 슬레이브 0x08)를 함께 실행합니다.':esp32?'ESP32 스케치를 실행합니다. 코드를 고치면 동작도 바뀝니다.':'라즈베리파이 코드는 빌드·실행하지 않는 고정 실행입니다. 예제 시나리오대로 핀이 바뀌고 배선이 틀리면 동작하지 않습니다.'}`;}
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s_·—-]+/g,'');
export function searchLectureExamples(query){const q=normalize(query);return LECTURE_EXAMPLES.filter(e=>!q||normalize([e.code,e.title,e.ref,'강의 실습 esp32 라즈베리파이 raspberry pi'].join(' ')).includes(q));}
/** The lecture example as a new project (the editor opens the board program). */
export function applyLectureExample(id){
 const example=lectureExample(id);if(!example)throw new Error('강의 예제를 찾을 수 없습니다.');
 const project=validateProject(example.build()),board=project.components.find(p=>p.type==='devboard');
 return {project,file:board&&!example.id.includes('fw-09')?boardFileKey(board):'main.c'};
}
