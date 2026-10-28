import {CATALOG_DEFS,catalogType} from './catalog-defs.js';
import {endpointInfo,breadboardPrefix,BB} from './pins.js';
import {localTerminals} from './components.js';
import {partVector} from './geometry.js';
import {findMount,applyMount} from './placement.js';
import {DEVBOARD_MODELS,devboardPins,boardFileKey} from './devboards.js';
import {defineScenario} from './fixed-run.js';
import {startProject,validateProject} from './project.js';
import {halExampleFor} from './hal-examples.js';

// SSAFY embedded-track lecture circuits on ESP32 and Raspberry Pi boards (the lecture schematics site lists the board
// pins and parts of each), and the lecture's hands-on assignments that use a circuit. The same board pins, parts and
// connections are built here on this app's breadboards; hole positions and wire routes follow this app's layout. Board
// programs are this app's own short examples of what each lab does: ESP32 sketches run in the interpreter
// (esp32-sketch.js), Raspberry Pi programs as fixed-run scenarios (fixed-run.js), and the STM32 in FW-09 runs its HAL
// code.
const COLORS={red:'#e53935',black:'#263238',yellow:'#f6c026',green:'#2e9d4f',blue:'#1e88e5',orange:'#fb8c00',gray:'#8d8d8d',sky:'#4fc3f7',purple:'#8e44ad'};
const hole=(letter,row)=>`bb:${letter}:${row}`,rail=(side,sign,n)=>`rail:${side}:${sign}:${n}`;
const fullHole=(bb,letter,col)=>`${breadboardPrefix(bb)}bb:${letter}:${col}`,fullRail=(bb,side,sign,n)=>`${breadboardPrefix(bb)}rail:${side}:${sign}:${n}`;
// Power-rail holes of the 400-point breadboard come in groups of five beside rows 1–5, 7–11, … (none beside rows 6,
// 12, 18, 24 and 30).
function railAt(side,sign,row){const i=(row-1)%6;if(i===5)throw new Error(`${row}번 줄 옆에는 전원 레일 구멍이 없습니다.`);return rail(side,sign,Math.floor((row-1)/6)*5+i+1);}

function base({stm32=false,breadboard=true}={}){
 const p=startProject();p.surfaces={board:{hidden:!stm32},breadboard:{hidden:!breadboard}};return p;
}
const pos=(p,id)=>{const h=endpointInfo(id,p.components,p.surfaces);if(!h)throw new Error('예제 위치를 찾지 못했습니다: '+id);return h;};
function part(p,{id,type,name,props={}}){const t=catalogType(type);return {id,type:t,name,x:0,y:0,rotation:0,...structuredClone(CATALOG_DEFS[t].defaults),...props};}
// Two-lead parts sit between their two holes.
function twoPin(p,spec,from,to){const q=part(p,spec),a=pos(p,from),b=pos(p,to);Object.assign(q,{x:(a.x+b.x)/2,y:(a.y+b.y)/2,rotation:((Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)+360)%360,span:Math.hypot(b.x-a.x,b.y-a.y),attachA:from,attachB:to});p.components.push(q);return q;}
// Multi-pin parts (and ESP32 boards): placed so terminal `key` lands on `at`, then plugged into the holes under them.
function plugged(p,q,key,at){
 const t=localTerminals({...q,rotation:0}).find(t=>t.key===key),v=partVector({rotation:q.rotation},t.x,t.y),h=pos(p,at);q.x=h.x-v.x;q.y=h.y-v.y;
 if(!applyMount(q,findMount(q,p.components,4,p.surfaces,p.wires)))throw new Error(`${q.name}: 예제 위치의 구멍에 꽂지 못했습니다.`);p.components.push(q);return q;
}
function wire(p,from,to,color,points){p.wires.push({id:'w'+(p.wires.length+1),from,to,color:COLORS[color]??color,...(points?{points}:{})});}
// A wire that runs between the holes: out of `from` half a row up (side −1) or down (+1), across, and into `to`, which
// is level with `from` or one row further on that side.
function jumper(p,from,to,color,side=-1){const a=pos(p,from),b=pos(p,to),y=a.y+7*side;if(Math.abs(Math.abs(b.y-y)-7)>.5)throw new Error(`예제 배선 ${from} → ${to}: 반 줄 옆으로 지나갈 수 없습니다.`);wire(p,from,to,color,[{x:a.x,y},{x:b.x,y}]);}
function devboard(p,{id,model,name,scenario,code,x=0,y=0,rotation=0}){return {id,type:'devboard',model,name,x,y,rotation,code,scenario};}
const rpiPin=(id,n)=>`devboard:${id}:P${n}`;
function esp32Pin(model,signal){return DEVBOARD_MODELS[model].pins.find(p=>p.signal===signal).key;}

// --- Board programs (this app's own examples) -------------------------------------------------------------------
const PY_LED_POWER='# 코드 없이 3.3V(1번 핀) 전원으로 LED를 켭니다.\n# LED 긴 다리(+)를 3.3V 쪽, 짧은 다리(−)를 220Ω 저항 쪽에 꽂습니다.\n';
const PY_LED_BLINK='# GPIO17(11번 핀)의 LED를 1초마다 켜고 끕니다.\nfrom gpiozero import LED\nfrom time import sleep\n\nled = LED(17)\nwhile True:\n    led.on()\n    print("LED ON")\n    sleep(1)\n    led.off()\n    print("LED OFF")\n    sleep(1)\n';
const PY_PWM='# GPIO17 LED 밝기를 PWM으로 0% → 100%까지 천천히 올립니다.\nfrom gpiozero import PWMLED\nfrom time import sleep\n\nled = PWMLED(17)\nwhile True:\n    for step in range(11):\n        led.value = step / 10\n        print(f"밝기 {step * 10}%")\n        sleep(0.2)\n';
const PY_BUTTON='# GPIO27(13번 핀) Tact 스위치를 내부 풀업으로 읽습니다.\nfrom gpiozero import Button\nfrom signal import pause\n\nbutton = Button(27)  # 내부 풀업: 누르면 LOW\nbutton.when_pressed = lambda: print("눌림")\nbutton.when_released = lambda: print("떼어짐")\npause()\n';
const PY_TWO_BUTTONS='# GPIO27은 내부 풀업, GPIO22는 외부 10kΩ 풀업으로 스위치 두 개를 읽습니다.\nfrom gpiozero import Button\nfrom signal import pause\n\ninner = Button(27)                                 # 내부 풀업\nouter = Button(22, pull_up=None, active_state=False)  # 외부 풀업(3.3V–10kΩ)\ninner.when_pressed = lambda: print("GPIO27 눌림")\nouter.when_pressed = lambda: print("GPIO22 눌림")\npause()\n';
const KERNEL_LED='// GPIO20 LED를 커널 타이머로 1초마다 켜고 끄는 드라이버(요약)\n#include <linux/module.h>\n#include <linux/gpio/consumer.h>\n#include <linux/timer.h>\n\nstatic struct gpio_desc *led;\nstatic struct timer_list blink;\nstatic int on;\n\nstatic void blink_fn(struct timer_list *t) {\n    on = !on;\n    gpiod_set_value(led, on);\n    pr_info("led_driver: LED %s\\n", on ? "ON" : "OFF");\n    mod_timer(&blink, jiffies + HZ);\n}\n\n/* probe: led = gpiod_get(dev, "led", GPIOD_OUT_LOW);  (GPIO20)\n *        timer_setup(&blink, blink_fn, 0); mod_timer(&blink, jiffies + HZ); */\nMODULE_LICENSE("GPL");\n';
const KERNEL_BUTTON='// GPIO2 Tact 스위치 인터럽트로 GPIO20 LED를 켜고 끄는 드라이버(요약)\n#include <linux/module.h>\n#include <linux/gpio/consumer.h>\n#include <linux/interrupt.h>\n\nstatic struct gpio_desc *button, *led;\n\nstatic irqreturn_t button_isr(int irq, void *data) {\n    int pressed = !gpiod_get_value(button);   /* 풀업: 누르면 LOW */\n    gpiod_set_value(led, pressed);\n    pr_info("button_driver: %s\\n", pressed ? "pressed" : "released");\n    return IRQ_HANDLED;\n}\n\n/* probe: button = gpiod_get(dev, "button", GPIOD_IN);  (GPIO2, 보드 1.8kΩ + 외부 10kΩ 풀업)\n *        led = gpiod_get(dev, "led", GPIOD_OUT_LOW);   (GPIO20)\n *        request_irq(gpiod_to_irq(button), button_isr, IRQF_TRIGGER_RISING | IRQF_TRIGGER_FALLING, ...); */\nMODULE_LICENSE("GPL");\n';
const INO_BLINK='// ESP32 GPIO2 LED를 0.5초마다 켜고 끕니다(보드 내장 파란 LED도 같은 핀).\nconst int LED_PIN = 2;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LED_PIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_PIN, HIGH);\n  Serial.println("LED ON");\n  delay(500);\n  digitalWrite(LED_PIN, LOW);\n  Serial.println("LED OFF");\n  delay(500);\n}\n';
const INO_IO='// LED(GPIO17), Tact 스위치(GPIO18, 외부 10kΩ 풀업), 가변저항(GPIO36 = VP), DHT11(GPIO13)\n#include <DHT.h>\n\nDHT dht(13, DHT11);\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(17, OUTPUT);\n  pinMode(18, INPUT);\n  dht.begin();\n}\n\nvoid loop() {\n  bool pressed = digitalRead(18) == LOW;   // 누르면 LOW\n  digitalWrite(17, pressed ? HIGH : LOW);\n  int raw = analogRead(36);               // 12비트 0~4095\n  Serial.printf("가변저항 %d (%.2f V)\\n", raw, raw * 3.3 / 4095);\n  Serial.printf("온도 %.1f C, 습도 %.0f %%\\n", dht.readTemperature(), dht.readHumidity());\n  delay(1000);\n}\n';
const INO_I2C='// ESP32를 I2C 슬레이브(주소 0x08)로: STM32가 보낸 1/0으로 GPIO2 LED를 켜고 끕니다.\n#include <Wire.h>\n\nvoid receive(int count) {\n  while (Wire.available()) {\n    int value = Wire.read();\n    digitalWrite(2, value ? HIGH : LOW);\n    Serial.printf("I2C 수신 %d → LED %s\\n", value, value ? "ON" : "OFF");\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(2, OUTPUT);\n  Wire.begin(0x08);          // SDA = GPIO21, SCL = GPIO22\n  Wire.onReceive(receive);\n}\n\nvoid loop() {}\n';
// Assignment programs: this app's own solutions of the lecture's hands-on assignments (the lecture gives the task only).
const PY_THREE_LEDS='# LED 3개(GPIO4·GPIO17·GPIO22)를 0.5초 간격으로 함께 켜고 끕니다.\nfrom gpiozero import LEDBoard\nfrom time import sleep\n\nleds = LEDBoard(4, 17, 22)\nwhile True:\n    leds.toggle()\n    print("LED 3개", "ON" if leds.value[0] else "OFF")\n    sleep(0.5)\n';
const PY_LED_SHELL='# LED 제어 쉘: 1·2·3을 입력하면 그 번호의 LED를 켜거나 끄고, 그 밖의 숫자를 입력하면 끝냅니다.\n# 직렬 모니터에서 RPI-1을 고르고 숫자를 보내 보세요.\nfrom gpiozero import LED\n\nleds = {1: LED(4), 2: LED(17), 3: LED(22)}\nwhile True:\n    try:\n        number = int(input("LED 번호(1~3, 그 밖의 숫자는 종료) > "))\n    except ValueError:\n        print("숫자를 입력하세요.")\n        continue\n    if number not in leds:\n        print("종료")\n        break\n    leds[number].toggle()\n    print(f"{number}번 LED", "ON" if leds[number].is_lit else "OFF")\n';
const PY_DIMMER_SHELL='# LED 밝기 쉘: 1을 입력하면 10%씩 밝게, 2를 입력하면 10%씩 어둡게(0~100%), 그 밖의 숫자는 종료합니다.\n# 직렬 모니터에서 RPI-1을 고르고 숫자를 보내 보세요.\nfrom gpiozero import PWMLED\n\nled = PWMLED(17)\nlevel = 0\nwhile True:\n    command = input("1: 밝게, 2: 어둡게 > ")\n    if command == "1":\n        level = min(100, level + 10)\n    elif command == "2":\n        level = max(0, level - 10)\n    else:\n        print("종료")\n        break\n    led.value = level / 100\n    print(f"밝기 {level}%")\n';
const PY_BUTTON_LEDS='# 버튼(GPIO26, 외부 10kΩ 풀업)을 누르고 있는 동안 LED 3개(GPIO4·GPIO17·GPIO22)를 켭니다.\nfrom gpiozero import LEDBoard, Button\nfrom signal import pause\n\nleds = LEDBoard(4, 17, 22)\nbutton = Button(26, pull_up=None, active_state=False)  # 외부 풀업: 누르면 LOW\nbutton.when_pressed = leds.on\nbutton.when_released = leds.off\npause()\n';
const PY_SOFT_PWM='# PWM 직접 구현: 500 Hz(주기 2 ms)마다 LED(GPIO17)를 듀티비만큼 켜고 나머지 시간은 끕니다.\n# 버튼1(GPIO5)을 누르고 있으면 밝기가 올라가고(최대 90%), 버튼2(GPIO21)를 누르고 있으면 내려갑니다(최소 10%).\nfrom gpiozero import LED, Button\nfrom time import perf_counter\n\nled = LED(17)\nup = Button(5, pull_up=None, active_state=False)     # 외부 10kΩ 풀업\ndown = Button(21, pull_up=None, active_state=False)\nPERIOD = 1 / 500\nduty = 0.5\n\ndef wait(seconds):\n    end = perf_counter() + seconds\n    while perf_counter() < end:\n        pass\n\nlast = perf_counter()\nwhile True:\n    if perf_counter() - last >= 0.1:   # 0.1초마다 5%씩\n        last = perf_counter()\n        if up.is_pressed and duty < 0.9:\n            duty = round(duty + 0.05, 2)\n            print(f"밝기 {duty:.0%}")\n        if down.is_pressed and duty > 0.1:\n            duty = round(duty - 0.05, 2)\n            print(f"밝기 {duty:.0%}")\n    led.on()\n    wait(PERIOD * duty)\n    led.off()\n    wait(PERIOD * (1 - duty))\n';
const PY_TREE='# 크리스마스 트리: 버튼(GPIO26, 외부 10kΩ 풀업)을 누를 때마다 모드가 바뀝니다.\n# 모드 1: 홀수 번째와 짝수 번째 LED를 번갈아 깜빡임, 모드 2: LED 5개를 함께 깜빡임\nfrom gpiozero import LEDBoard, Button\nfrom time import sleep\n\nleds = LEDBoard(4, 17, 22, 10, 11)\nbutton = Button(26, pull_up=None, active_state=False)\nmode = 1\n\ndef change():\n    global mode\n    mode = 2 if mode == 1 else 1\n    print(f"모드 {mode}")\n\nbutton.when_pressed = change\non = False\nwhile True:\n    on = not on\n    if mode == 1:\n        leds.value = (on, not on, on, not on, on)\n    else:\n        leds.value = (on,) * 5\n    sleep(0.5)\n';
const KERNEL_PWM='// 커널 PWM: 앱이 보낸 10~90(%)을 듀티비로 삼아 커널 스레드가 GPIO20 LED를 10 ms 주기로 켜고 끕니다.\n// 앱(app.c)은 10~90 사이의 숫자를 입력받아 장치 파일에 write하고, 그 밖의 값이면 0을 보내(LED 꺼짐) 끝냅니다.\n// 직렬 모니터에서 RPI-1을 고르고 숫자를 보내 보세요(앱 입력).\n#include <linux/module.h>\n#include <linux/kthread.h>\n#include <linux/delay.h>\n#include <linux/gpio/consumer.h>\n#include <linux/fs.h>\n#include <linux/uaccess.h>\n\nstatic struct gpio_desc *led;\nstatic struct task_struct *worker;\nstatic int duty;   /* 0 = 꺼짐, 10~90 = 켜 두는 시간 비율(%) */\n\nstatic int pwm_fn(void *data) {\n    while (!kthread_should_stop()) {\n        int on = READ_ONCE(duty);\n        if (on) {\n            gpiod_set_value(led, 1);\n            usleep_range(on * 100, on * 100 + 10);\n        }\n        gpiod_set_value(led, 0);\n        usleep_range((100 - on) * 100, (100 - on) * 100 + 10);\n    }\n    return 0;\n}\n\nstatic ssize_t pwm_write(struct file *f, const char __user *buf, size_t len, loff_t *off) {\n    char text[8] = {0};\n    int value;\n    if (copy_from_user(text, buf, min(len, sizeof(text) - 1))) return -EFAULT;\n    if (kstrtoint(strim(text), 10, &value)) return -EINVAL;\n    WRITE_ONCE(duty, value >= 10 && value <= 90 ? value : 0);\n    pr_info("pwm_led: duty %d%%\\n", READ_ONCE(duty));\n    return len;\n}\n\n/* probe: led = gpiod_get(dev, "led", GPIOD_OUT_LOW);  (GPIO20)\n *        worker = kthread_run(pwm_fn, NULL, "pwm_led");   장치 파일 write → pwm_write */\nMODULE_LICENSE("GPL");\n';
const KERNEL_TWO_TIMERS='// 커널 타이머 2개로 LED 2개를 다른 주기로 깜빡입니다: GPIO20 LED는 5초, GPIO12 LED는 7초마다 바뀝니다.\n// 두 LED의 상태는 구조체 하나에 담아 read로 앱에 보냅니다.\n#include <linux/module.h>\n#include <linux/gpio/consumer.h>\n#include <linux/timer.h>\n#include <linux/fs.h>\n#include <linux/uaccess.h>\n\nstruct led_state {\n    int led1;   /* GPIO20 */\n    int led2;   /* GPIO12 */\n};\n\nstatic struct led_state state;\nstatic struct gpio_desc *led1, *led2;\nstatic struct timer_list timer1, timer2;\n\nstatic void blink1(struct timer_list *t) {\n    state.led1 = !state.led1;\n    gpiod_set_value(led1, state.led1);\n    mod_timer(&timer1, jiffies + 5 * HZ);\n}\n\nstatic void blink2(struct timer_list *t) {\n    state.led2 = !state.led2;\n    gpiod_set_value(led2, state.led2);\n    mod_timer(&timer2, jiffies + 7 * HZ);\n}\n\nstatic ssize_t led_read(struct file *f, char __user *buf, size_t len, loff_t *off) {\n    if (len < sizeof(state)) return -EINVAL;\n    return copy_to_user(buf, &state, sizeof(state)) ? -EFAULT : sizeof(state);\n}\n\n/* probe: led1 = gpiod_get(dev, "led1", GPIOD_OUT_LOW);  (GPIO20)\n *        led2 = gpiod_get(dev, "led2", GPIOD_OUT_LOW);  (GPIO12)\n *        timer_setup(&timer1, blink1, 0); mod_timer(&timer1, jiffies + 5 * HZ);\n *        timer_setup(&timer2, blink2, 0); mod_timer(&timer2, jiffies + 7 * HZ); */\nMODULE_LICENSE("GPL");\n';

// --- Fixed-run scenarios ----------------------------------------------------------------------------------------
defineScenario('lecture-rpi-power-led',{title:'3.3V 전원 LED',start(ctx){ctx.log('코드 없이 3.3V 전원으로 LED를 켜는 회로입니다.');}});
defineScenario('lecture-rpi-blink',{title:'GPIO17 LED 깜빡임',start(ctx){let on=true;ctx.output('GPIO17',1);ctx.log('LED ON');ctx.every(1000,c=>{on=!on;c.output('GPIO17',on);c.log(on?'LED ON':'LED OFF');});}});
defineScenario('lecture-rpi-pwm',{title:'GPIO17 PWM 밝기',start(ctx){let step=0;const set=c=>{c.pwm('GPIO17',step/10);c.log(`밝기 ${step*10}%`);};set(ctx);ctx.every(200,c=>{step=(step+1)%11;set(c);});}});
defineScenario('lecture-rpi-button',{title:'GPIO27 Tact 스위치',start(ctx){ctx.input('GPIO27','up',(c,level)=>c.log(level?'떼어짐':'눌림'));}});
defineScenario('lecture-rpi-two-buttons',{title:'내부·외부 풀업 스위치 두 개',start(ctx){ctx.input('GPIO27','up',(c,level)=>{if(!level)c.log('GPIO27 눌림');});ctx.input('GPIO22',null,(c,level)=>{if(!level)c.log('GPIO22 눌림');});}});
defineScenario('lecture-kernel-led',{title:'커널 타이머 LED',start(ctx){let on=false;ctx.output('GPIO20',0);ctx.log('led_driver: 모듈을 적재했습니다 (GPIO20)');ctx.every(1000,c=>{on=!on;c.output('GPIO20',on);c.log(`led_driver: LED ${on?'ON':'OFF'}`);});}});
defineScenario('lecture-kernel-button',{title:'커널 인터럽트 스위치·LED',start(ctx){ctx.output('GPIO20',0);ctx.log('button_driver: 모듈을 적재했습니다 (스위치 GPIO2, LED GPIO20)');ctx.input('GPIO2',null,(c,level)=>{c.output('GPIO20',!level);c.log(`button_driver: ${level?'released':'pressed'}`);});}});
const THREE_LEDS=['GPIO4','GPIO17','GPIO22'],TREE_LEDS=['GPIO4','GPIO17','GPIO22','GPIO10','GPIO11'];
defineScenario('assignment-rpi-three-leds',{title:'LED 3개 깜빡임',start(ctx){let on=false;const set=c=>{for(const pin of THREE_LEDS)c.output(pin,on);c.log(`LED 3개 ${on?'ON':'OFF'}`);};on=true;set(ctx);ctx.every(500,c=>{on=!on;set(c);});}});
// Shell programs read lines from the serial monitor (`input` scenarios; see FixedRunDriver.receive).
defineScenario('assignment-rpi-led-shell',{title:'LED 제어 쉘',input:true,start(ctx){
 const on=[false,false,false];let done=false;for(const pin of THREE_LEDS)ctx.output(pin,0);ctx.log('LED 번호(1~3, 그 밖의 숫자는 종료) >');
 return {line(c,text){if(done)return;const n=Number(text.trim());if(!text.trim()||!Number.isInteger(n)){c.log('숫자를 입력하세요.');return;}if(n<1||n>3){done=true;c.log('종료');return;}on[n-1]=!on[n-1];c.output(THREE_LEDS[n-1],on[n-1]);c.log(`${n}번 LED ${on[n-1]?'ON':'OFF'}`);}};
}});
defineScenario('assignment-rpi-dimmer-shell',{title:'LED 밝기 쉘',input:true,start(ctx){
 let level=0,done=false;ctx.pwm('GPIO17',0);ctx.log('1: 밝게, 2: 어둡게 >');
 return {line(c,text){if(done)return;const command=text.trim();if(command==='1')level=Math.min(100,level+10);else if(command==='2')level=Math.max(0,level-10);else{done=true;c.log('종료');return;}c.pwm('GPIO17',level/100);c.log(`밝기 ${level}%`);}};
}});
defineScenario('assignment-rpi-button-leds',{title:'버튼 LED',start(ctx){for(const pin of THREE_LEDS)ctx.output(pin,0);ctx.input('GPIO26',null,(c,level)=>{for(const pin of THREE_LEDS)c.output(pin,!level);c.log(level?'버튼 뗌 → LED 3개 OFF':'버튼 누름 → LED 3개 ON');});}});
defineScenario('assignment-rpi-soft-pwm',{title:'PWM 직접 구현',start(ctx){
 let duty=.5;ctx.pwm('GPIO17',duty,500);ctx.input('GPIO5',null);ctx.input('GPIO21',null);ctx.log('PWM 500 Hz · 밝기 50%');
 ctx.every(100,c=>{const before=duty;if(c.read('GPIO5')===0)duty=Math.min(.9,Math.round((duty+.05)*100)/100);if(c.read('GPIO21')===0)duty=Math.max(.1,Math.round((duty-.05)*100)/100);if(duty!==before){c.pwm('GPIO17',duty,500);c.log(`밝기 ${Math.round(duty*100)}%`);}});
}});
defineScenario('assignment-rpi-tree',{title:'크리스마스 트리',start(ctx){
 let mode=1,on=false;const show=c=>TREE_LEDS.forEach((pin,i)=>c.output(pin,mode===1?(i%2?!on:on):on));
 ctx.input('GPIO26',null,(c,level)=>{if(level)return;mode=mode===1?2:1;c.log(`모드 ${mode}`);show(c);});
 ctx.log('모드 1');ctx.every(500,c=>{on=!on;show(c);});show(ctx);
}});
defineScenario('assignment-kernel-pwm',{title:'커널 PWM',input:true,start(ctx){
 ctx.output('GPIO20',0);ctx.log('pwm_led: 모듈을 적재했습니다 (GPIO20) · 앱: 10~90 입력, 그 밖의 값은 종료');let done=false;
 return {line(c,text){if(done)return;const value=Number(text.trim());if(Number.isInteger(value)&&value>=10&&value<=90){c.pwm('GPIO20',value/100,100);c.log(`pwm_led: duty ${value}%`);return;}done=true;c.output('GPIO20',0);c.log('app: 종료 · pwm_led: duty 0% (LED 꺼짐)');}};
}});
defineScenario('assignment-kernel-two-timers',{title:'커널 타이머 LED 2개',start(ctx){
 const state={led1:0,led2:0};ctx.output('GPIO20',0);ctx.output('GPIO12',0);ctx.log('led_driver: 모듈을 적재했습니다 (GPIO20 5초, GPIO12 7초)');
 const report=c=>c.log(`state = {led1: ${state.led1}, led2: ${state.led2}}`);
 ctx.every(5000,c=>{state.led1^=1;c.output('GPIO20',state.led1);report(c);});ctx.every(7000,c=>{state.led2^=1;c.output('GPIO12',state.led2);report(c);});
}});

// --- Raspberry Pi circuits ----------------------------------------------------------------------------------------
// The Raspberry Pi stands turned 90° left of the breadboard. Its header pitch is the hole pitch, so pins 2k−1 and 2k
// are level with breadboard row k+1. A wire leaves its pin half a row aside (odd pins down, even pins up, between the
// neighbouring pins) and runs straight across in that gap, past the power-rail holes, into its row.
const rpiRow=n=>Math.ceil(n/2)+1;
function rpiProject(name,scenario,code){
 const p=base(),q=devboard(p,{id:'rpi',model:'rpi5',name:'RPI-1',scenario,code,rotation:90}),pins=devboardPins({...q,x:0,y:0});
 const pin1=pins.find(x=>x.key==='P1'),pin2=pins.find(x=>x.key==='P2');
 // Even pins 32.5 units left of the breadboard edge; pin 1 level with row 2.
 q.x=BB.x-32.5-pin2.x;q.y=BB.startY+(rpiRow(1)-1)*BB.step-pin1.y;
 p.name=name;p.components.push(q);return p;
}
// Pin `n` to `to` (a hole or rail hole beside the gap). `turnX` sends the wire down/up to the gap of another row first.
function rpiWire(p,n,to,color,turnX=null){
 const a=pos(p,rpiPin('rpi',n)),b=pos(p,to),lane=a.y+(n%2?7:-7),points=[{x:a.x+7,y:lane}];
 if(turnX!=null){const gap=b.y+(b.y>lane?-7:7);points.push({x:turnX,y:lane},{x:turnX,y:gap},{x:b.x,y:gap});}
 else{if(Math.abs(Math.abs(b.y-lane)-7)>.5)throw new Error(`예제 배선: ${n}번 핀에서 ${to}까지 곧게 갈 수 없습니다.`);points.push({x:b.x,y:lane});}
 wire(p,rpiPin('rpi',n),to,color,points);
}
// LED from column e (+) across the channel to column f (−), and its 220 Ω resistor from column j to the right − rail.
function ledRow(p,row,{id='LED1',rid='R1',color='red'}={}){twoPin(p,{id,type:'led-tht-2',name:id,props:{color}},hole('e',row),hole('f',row));twoPin(p,{id:rid,type:'resistor-axial-2',name:rid,props:{value:220}},hole('j',row),railAt('R','-',row));}
// Tact switch on the left half, rotated so its always-joined pairs lie along rows `row` and `row+2`.
function tactSwitch(p,row,{id='SW1',name='SW1'}={}){return plugged(p,{...part(p,{id,type:'button-4',name}),rotation:90},'p3',hole('c',row));}
// A switch from `row` (the GPIO) to GND via row+2. With `pullup`, a 10 kΩ resistor in column b from row−2, whose row
// is joined to the left + rail (3.3 V).
function switchRows(p,row,{id='SW1',rid='R1',pullup=false,gnd=+1,vcc=-1}={}){
 tactSwitch(p,row,{id,name:id});jumper(p,hole('a',row+2),railNear('L','-',row+2,gnd),'black',gnd);
 if(pullup){twoPin(p,{id:rid,type:'resistor-axial-2',name:rid,props:{value:10000}},hole('b',row-2),hole('b',row));jumper(p,hole('a',row-2),railNear('L','+',row-2,vcc),'red',vcc);}
}
// The rail hole level with `row`, or the one a row further on `side` when that row has none.
function railNear(side,sign,row,dir){try{return railAt(side,sign,row);}catch{return railAt(side,sign,row+dir);}}
// The left − rail is joined to the right − rail under the breadboard's last row.
function groundBridge(p){const a=railAt('L','-',29),b=railAt('R','-',29),y=BB.startY+29*BB.step+9;wire(p,a,b,'black',[{x:pos(p,a).x,y},{x:pos(p,b).x,y}]);}
// 3.3 V (pin 1) to the left + rail and GND (pin 6) to the left − rail.
function rpiPower(p,{vcc=true,gnd=6}={}){if(vcc)rpiWire(p,1,railAt('L','+',2),'red');rpiWire(p,gnd,gnd%2?railAt('L','-',rpiRow(gnd)+1):railAt('L','-',rpiRow(gnd)),'black');}
const LED_COLORS=['red','green','yellow','green','red'];

function rpi01(){const p=rpiProject('라즈베리파이 3.3V LED','lecture-rpi-power-led',PY_LED_POWER);rpiPower(p);jumper(p,railAt('L','+',9),hole('a',9),'red');ledRow(p,9);groundBridge(p);return p;}
function rpi02(){const p=rpiProject('라즈베리파이 LED 깜빡이기','lecture-rpi-blink',PY_LED_BLINK);rpiPower(p,{vcc:false});rpiWire(p,11,hole('a',7),'yellow');ledRow(p,7);groundBridge(p);return p;}
function rpi03(){const p=rpi02();p.name='라즈베리파이 PWM LED';const b=p.components.find(c=>c.id==='rpi');b.scenario='lecture-rpi-pwm';b.code=PY_PWM;return p;}
function rpi04(){const p=rpiProject('라즈베리파이 Tact 스위치','lecture-rpi-button',PY_BUTTON);rpiPower(p,{vcc:false});rpiWire(p,13,hole('a',8),'green');switchRows(p,8);return p;}
function rpi05(){const p=rpiProject('라즈베리파이 풀업 스위치 2개','lecture-rpi-two-buttons',PY_TWO_BUTTONS);rpiPower(p);
 rpiWire(p,13,hole('a',8),'green');switchRows(p,8,{id:'SW1'});
 rpiWire(p,15,hole('a',13),'gray',BB.x-4.5);switchRows(p,13,{id:'SW2',rid:'R1',pullup:true,vcc:+1});return p;}
function ker01(){const p=rpiProject('라즈베리파이 커널 드라이버 LED','lecture-kernel-led',KERNEL_LED);rpiPower(p,{vcc:false});rpiWire(p,38,hole('a',20),'yellow');ledRow(p,20);groundBridge(p);return p;}
function ker02(){const p=rpiProject('라즈베리파이 커널 드라이버 Tact 스위치','lecture-kernel-button',KERNEL_BUTTON);rpiPower(p,{gnd:9});
 rpiWire(p,3,hole('a',3),'green');switchRows(p,3,{rid:'R3',pullup:true,vcc:-1});rpiWire(p,38,hole('a',20),'yellow');ledRow(p,20,{rid:'R2'});groundBridge(p);return p;}
// Assignments.
function threeLeds(name,scenario,code){const p=rpiProject(name,scenario,code);rpiPower(p,{vcc:false});[[7,5],[11,7],[15,9]].forEach(([pin,row],i)=>{rpiWire(p,pin,hole('a',row),'yellow');ledRow(p,row,{id:'LED'+(i+1),rid:'R'+(i+1),color:LED_COLORS[i]});});groundBridge(p);return p;}
function asgThreeLeds(){return threeLeds('라즈베리파이 LED 3개 깜빡이기','assignment-rpi-three-leds',PY_THREE_LEDS);}
function asgLedShell(){return threeLeds('라즈베리파이 LED 제어 쉘','assignment-rpi-led-shell',PY_LED_SHELL);}
function asgDimmerShell(){const p=rpi02();p.name='라즈베리파이 LED 밝기 쉘';const b=p.components.find(c=>c.id==='rpi');b.scenario='assignment-rpi-dimmer-shell';b.code=PY_DIMMER_SHELL;return p;}
function asgButtonLeds(){const p=threeLeds('라즈베리파이 버튼 LED','assignment-rpi-button-leds',PY_BUTTON_LEDS);rpiWire(p,1,railAt('L','+',2),'red');rpiWire(p,37,hole('a',20),'green');switchRows(p,20,{id:'SW1',rid:'R4',pullup:true,vcc:-1});return p;}
function asgSoftPwm(){const p=rpiProject('라즈베리파이 버튼 PWM 밝기','assignment-rpi-soft-pwm',PY_SOFT_PWM);rpiPower(p);
 rpiWire(p,11,hole('a',7),'yellow');ledRow(p,7);
 rpiWire(p,29,hole('a',16),'green');switchRows(p,16,{id:'SW1',rid:'R2',pullup:true,vcc:-1});
 rpiWire(p,40,hole('a',21),'gray');switchRows(p,21,{id:'SW2',rid:'R3',pullup:true,vcc:+1});groundBridge(p);return p;}
function asgTree(){const p=rpiProject('라즈베리파이 크리스마스 트리','assignment-rpi-tree',PY_TREE);rpiPower(p);
 [[7,5],[11,7],[15,9],[19,11],[23,13]].forEach(([pin,row],i)=>{rpiWire(p,pin,hole('a',row),'yellow');ledRow(p,row,{id:'LED'+(i+1),rid:'R'+(i+1),color:LED_COLORS[i]});});
 rpiWire(p,37,hole('a',20),'green');switchRows(p,20,{id:'SW1',rid:'R6',pullup:true,vcc:-1});groundBridge(p);return p;}
function asgKernelPwm(){const p=ker01();p.name='라즈베리파이 커널 PWM LED';const b=p.components.find(c=>c.id==='rpi');b.scenario='assignment-kernel-pwm';b.code=KERNEL_PWM;return p;}
function asgKernelTimers(){const p=rpiProject('라즈베리파이 커널 타이머 LED 2개','assignment-kernel-two-timers',KERNEL_TWO_TIMERS);rpiPower(p,{vcc:false});
 rpiWire(p,32,hole('a',17),'yellow');ledRow(p,17,{id:'LED2',rid:'R2',color:'green'});rpiWire(p,38,hole('a',20),'yellow');ledRow(p,20);groundBridge(p);return p;}

// --- ESP32 circuits -----------------------------------------------------------------------------------------------
// ESP32 on the 400-point breadboard: left header in column b, right header in column i, rows 9–27 (its USB end then
// leaves rows 29–30 free). Only holes a and j
// beside the headers stay free, so wires run in the gaps beside the columns and between the rows.
const ESP32_MODEL='esp32-nodemcu-32s',espPin=signal=>`devboard:esp32:${esp32Pin(ESP32_MODEL,signal)}`;
function esp32OnBreadboard(p,{code}){const q=devboard(p,{id:'esp32',model:ESP32_MODEL,name:'ESP32-1',code});return plugged(p,q,'L1',hole('b',9));}
// ESP32 3.3 V (row 9) to the left + rail and GND (left header, row 22) to the left − rail.
function esp32Power(p){jumper(p,hole('a',9),railAt('L','+',9),'red');jumper(p,hole('a',22),railAt('L','-',21),'black');}
// GPIO2 (right header, row 23) down the gap right of column j to row 30, where the LED crosses the channel (+ on the
// right) and its 220 Ω resistor goes to the left − rail.
function gpio2Led(p,rid){
 const a=pos(p,hole('j',23)),b=pos(p,hole('j',30)),x=a.x+20;wire(p,hole('j',23),hole('j',30),'yellow',[{x,y:a.y},{x,y:b.y}]);
 twoPin(p,{id:'LED1',type:'led-tht-2',name:'LED1',props:{color:'red'}},hole('f',30),hole('e',30));twoPin(p,{id:rid,type:'resistor-axial-2',name:rid,props:{value:220}},hole('a',30),railAt('L','-',29));
}
function fw08(){const p=base();p.name='ESP32 LED 깜빡이기';esp32OnBreadboard(p,{code:INO_BLINK});esp32Power(p);gpio2Led(p,'R1');return p;}

// ESP32 across an 830-point breadboard (rotated 270°: right header in row b, left header in row i, columns 22–40). The
// LED and switch sit right of the board in the top half, the potentiometer left and the DHT11 right in the bottom half.
function iot01(){
 const p=base({breadboard:false});p.name='ESP32 LED·스위치·가변저항·DHT11';
 p.components.push({id:'bb1',type:'breadboard',name:'BB1',variant:'full',x:560,y:330,rotation:0});const bb='bb1',H=(l,c)=>fullHole(bb,l,c);
 // Rail holes come in groups of five from column 3 (none beside columns 8, 14, 20, …).
 const rail=(side,sign,col)=>{const m=col-3;if(m<0||m%6===5)throw new Error(`${col}번 열 옆에는 전원 레일 구멍이 없습니다.`);return fullRail(bb,side,sign,m-Math.floor(m/6)+1);};
 const q=devboard(p,{id:'esp32',model:ESP32_MODEL,name:'ESP32-1',code:INO_IO,rotation:270});plugged(p,q,'L1',H('i',22));
 const col=signal=>Number(q.attachments[signal==='GND'?'R1':esp32Pin(ESP32_MODEL,signal)].split(':').at(-1));// GND: the right header's first pin
 const X=c=>pos(p,H('a',c)).x,Y=l=>pos(p,H(l,1)).y,yT=pos(p,rail('T','-',3)).y,yB=pos(p,rail('B','+',3)).y;
 // Along a gap: points at height `y` above/below the start and end columns.
 const along=(from,to,color,y,c1,c2)=>wire(p,from,to,color,[{x:X(c1),y},{x:X(c2),y}]);
 // To the outer rail between the inner rail's holes: out half a column, across the inner rail, back in.
 const outer=(from,c,side,sign,color)=>{const top=side==='T',a=pos(p,from),r=pos(p,rail(side,sign,c)),inner=pos(p,rail(side,top?'-':'+',c)).y,y1=(a.y+inner)/2,y2=(inner+r.y)/2,x=r.x+7;wire(p,from,rail(side,sign,c),color,[{x:a.x,y:y1},{x,y:y1},{x,y:y2},{x:r.x,y:y2}]);};
 // GND (right header, column 22) to the top − rail; 3.3 V (left header, column 22) to the bottom + rail.
 wire(p,H('a',col('GND')),rail('T','-',col('GND')),'black');wire(p,H('j',col('3V3')),rail('B','+',col('3V3')),'red');
 // + rails joined at the left end, − rails at the right end, outside the rail holes.
 {const a=pos(p,rail('T','+',3)),b=pos(p,rail('B','+',3)),x=X(1)+7;wire(p,rail('T','+',3),rail('B','+',3),'red',[{x,y:a.y},{x,y:b.y}]);}
 {const a=pos(p,rail('T','-',61)),b=pos(p,rail('B','-',61)),x=X(62)+7;wire(p,rail('T','-',61),rail('B','-',61),'black',[{x,y:a.y},{x,y:b.y}]);}
 const gapTop1=yT+13,gapTop2=Y('a')-13,gapBottom=Y('j')+10;
 // LED on GPIO17 across the channel at column 55, 220 Ω to the bottom − rail.
 along(H('a',col('GPIO17')),H('a',55),'yellow',gapTop2,col('GPIO17'),55);
 twoPin(p,{id:'LED1',type:'led-tht-2',name:'LED1',props:{color:'red'}},H('e',55),H('f',55));twoPin(p,{id:'R1',type:'resistor-axial-2',name:'R1',props:{value:220}},H('j',55),rail('B','-',55));
 // Tact switch on GPIO18 (columns 57 and 59): GND side to the top − rail, 10 kΩ pull-up from column 60 (top + rail).
 along(H('a',col('GPIO18')),H('a',57),'sky',gapTop1,col('GPIO18'),57);
 plugged(p,part(p,{id:'SW1',type:'button-4',name:'SW1'}),'p1',H('c',57));wire(p,H('a',59),rail('T','-',59),'black');
 twoPin(p,{id:'R2',type:'resistor-axial-2',name:'R2',props:{value:10000}},H('b',60),H('b',57));outer(H('a',60),60,'T','+','red');
 // 10 kΩ potentiometer (3.3 V end in column 13, wiper 14, GND end 15); wiper to GPIO36 (VP). The parts' bodies stand
 // towards the channel, so the GND end's wire and the board's 3.3 V wire cross the wiper's.
 plugged(p,part(p,{id:'VR1',type:'pot-bare-3',name:'VR1',props:{value:10000}}),'p2',H('h',14));
 along(H('j',col('GPIO36')),H('j',14),'green',gapBottom,col('GPIO36'),14);wire(p,H('j',13),rail('B','+',13),'red');outer(H('j',15),15,'B','-','black');
 // DHT11 module (VCC in column 46, GND 47, DATA 48; its body clears the ESP32); DATA to GPIO13 under the VCC and GND
 // wires.
 plugged(p,part(p,{id:'U1',type:'dht11-module-3',name:'DHT11'}),'p1',H('h',46));
 along(H('j',col('GPIO13')),H('j',48),'orange',gapBottom,col('GPIO13'),48);wire(p,H('j',46),rail('B','+',46),'red');outer(H('j',47),47,'B','-','black');
 return p;
}

// STM32 (I2C master, HAL code runs) and ESP32 (I2C slave 0x08, sketch runs) on one breadboard. The I2C wires go over
// the breadboard's top edge and come in from the right to the ESP32 pins; the pull-ups sit in the pins' free holes.
const FW09_MAIN='  uint8_t command = 1;\n  HAL_Delay(100);  /* ESP32가 부팅해 슬레이브로 대기할 때까지 */\n  printf("STM32 I2C 마스터 · ESP32 주소 0x08\\n");\n    /* USER CODE END 2 */\n  while (1) {\n    /* USER CODE BEGIN 3 */\n    HAL_StatusTypeDef status = HAL_I2C_Master_Transmit(&hi2c1, 0x08 << 1, &command, 1, 100);\n    printf("ESP32에 %u 보냄 (status=%d)\\n", command, status);\n    command = !command;\n    HAL_Delay(1000);\n    /* USER CODE END 3 */';
function fw09(){
 const e=halExampleFor('i2c','nucleo-f103rb'),p=base({stm32:true});p.name='STM32·ESP32 I2C 통신';p.mcu=e.mcu;p.firmware=e.firmware;
 p.code=e.code.replace(/\/\* USER CODE BEGIN 2 \*\/[\s\S]*?\/\* USER CODE END 3 \*\//,'/* USER CODE BEGIN 2 */\n'+FW09_MAIN).replace(/^\/\/ I2C1 PB8.*$/m,'// I2C1 PB8(SCL)/PB9(SDA) 마스터 → ESP32 슬레이브 0x08, ESP32 쪽 10 kΩ 풀업');
 esp32OnBreadboard(p,{code:INO_I2C});esp32Power(p);gpio2Led(p,'R3');
 // + rails joined just above row 1; 10 kΩ pull-ups from GPIO22 / GPIO21 (column j) to the right + rail.
 {const a=pos(p,railAt('L','+',1)),b=pos(p,railAt('R','+',1)),y=a.y-7;wire(p,railAt('L','+',1),railAt('R','+',1),'red',[{x:a.x,y},{x:b.x,y}]);}
 twoPin(p,{id:'R1',type:'resistor-axial-2',name:'R1',props:{value:10000}},hole('j',11),railAt('R','+',11));twoPin(p,{id:'R2',type:'resistor-axial-2',name:'R2',props:{value:10000}},hole('j',14),railAt('R','+',14));
 // STM32 3.3 V (CN6) under the board to the left + rail; GND from the Arduino header (CN5) to the left − rail.
 {const v=pos(p,'board:CN6:4'),r=pos(p,railAt('L','+',28)),y=r.y+7;wire(p,'board:CN6:4',railAt('L','+',28),'red',[{x:v.x+7,y:v.y+7},{x:v.x+42,y:v.y+7},{x:v.x+42,y},{x:r.x,y}]);}
 {const g=pos(p,'board:CN5:7'),r=pos(p,railAt('L','-',10)),y=r.y-7,x=BB.x-44.5;wire(p,'board:CN5:7',railAt('L','-',10),'black',[{x,y:g.y},{x,y},{x:r.x,y}]);}
 // SCL / SDA: right between the CN10 pins, up past the breadboard's top edge, down its right side, in above the pins.
 const route=(from,signal,color,x1,top,x2)=>{const a=pos(p,from),b=pos(p,espPin(signal)),y=b.y-7;wire(p,from,espPin(signal),color,[{x:x1,y:a.y},{x:x1,y:top},{x:x2,y:top},{x:x2,y},{x:b.x,y}]);};
 route('board:CN5:10','GPIO22','green',BB.x-74.5,BB.y-24,BB.x+BB.w+24);route('board:CN5:9','GPIO21','orange',BB.x-60.5,BB.y-12,BB.x+BB.w+12);
 return p;
}

// Example categories: an example is listed under every kind of board it uses.
export const EXAMPLE_BOARDS=Object.freeze([{id:'rpi',label:'Raspberry Pi'},{id:'stm32',label:'STM32'},{id:'esp32',label:'ESP32'}]);
const RPI=['rpi'],ESP32=['esp32'];
// `code` / `ref` stay for search and the guide line; the list shows the title only.
export const LECTURE_EXAMPLES=Object.freeze([
 {id:'lecture-rpi-01',code:'RPI-01',kind:'실습',boards:RPI,title:'라즈베리파이 3.3V LED',ref:'라즈베리파이와AI Day1 p.76',build:rpi01},
 {id:'lecture-rpi-02',code:'RPI-02',kind:'실습',boards:RPI,title:'라즈베리파이 LED 깜빡이기',ref:'라즈베리파이와AI Day1 p.78 · Day4 p.75',build:rpi02},
 {id:'lecture-rpi-03',code:'RPI-03',kind:'실습',boards:RPI,title:'라즈베리파이 PWM LED',ref:'라즈베리파이와AI Day1 p.104',build:rpi03},
 {id:'lecture-rpi-04',code:'RPI-04',kind:'실습',boards:RPI,title:'라즈베리파이 Tact 스위치',ref:'라즈베리파이와AI Day1 p.86',build:rpi04},
 {id:'lecture-rpi-05',code:'RPI-05',kind:'실습',boards:RPI,title:'라즈베리파이 풀업 스위치 2개',ref:'라즈베리파이와AI Day1 p.95',build:rpi05},
 {id:'lecture-ker-01',code:'KER-01',kind:'실습',boards:RPI,title:'라즈베리파이 커널 드라이버 LED',ref:'리눅스커널프로그래밍 Day3 p.23',build:ker01},
 {id:'lecture-ker-02',code:'KER-02',kind:'실습',boards:RPI,title:'라즈베리파이 커널 드라이버 Tact 스위치',ref:'리눅스커널프로그래밍 Day3 p.51',build:ker02},
 {id:'assignment-rpi-1',code:'RPI 도전 1',kind:'과제',boards:RPI,title:'라즈베리파이 LED 3개 깜빡이기',ref:'라즈베리파이와AI Day1 p.124',build:asgThreeLeds},
 {id:'assignment-rpi-2',code:'RPI 도전 2',kind:'과제',boards:RPI,title:'라즈베리파이 LED 제어 쉘',ref:'라즈베리파이와AI Day1 p.125',build:asgLedShell},
 {id:'assignment-rpi-3',code:'RPI 도전 3',kind:'과제',boards:RPI,title:'라즈베리파이 LED 밝기 쉘',ref:'라즈베리파이와AI Day1 p.126',build:asgDimmerShell},
 {id:'assignment-rpi-4',code:'RPI 도전 4',kind:'과제',boards:RPI,title:'라즈베리파이 버튼 LED',ref:'라즈베리파이와AI Day1 p.127',build:asgButtonLeds},
 {id:'assignment-rpi-5',code:'RPI 도전 5',kind:'과제',boards:RPI,title:'라즈베리파이 버튼 PWM 밝기',ref:'라즈베리파이와AI Day1 p.128',build:asgSoftPwm},
 {id:'assignment-rpi-6',code:'RPI 도전 6',kind:'과제',boards:RPI,title:'라즈베리파이 크리스마스 트리',ref:'라즈베리파이와AI Day1 p.129',build:asgTree},
 {id:'assignment-ker-2',code:'KER 도전 2',kind:'과제',boards:RPI,title:'라즈베리파이 커널 PWM LED',ref:'리눅스커널프로그래밍 Day3 p.103',build:asgKernelPwm},
 {id:'assignment-ker-3',code:'KER 도전 3',kind:'과제',boards:RPI,title:'라즈베리파이 커널 타이머 LED 2개',ref:'리눅스커널프로그래밍 Day3 p.104',build:asgKernelTimers},
 {id:'lecture-fw-09',code:'FW-09',kind:'실습',boards:['stm32','esp32'],title:'STM32·ESP32 I2C 통신',ref:'임베디드Firmware Day4 p.63~84',build:fw09},
 {id:'lecture-fw-08',code:'FW-08',kind:'실습',boards:ESP32,title:'ESP32 LED 깜빡이기',ref:'임베디드Firmware Day4 p.55·56 · 임베디드AIoT Day4 p.90',build:fw08},
 {id:'lecture-iot-01',code:'IOT-01',kind:'실습',boards:ESP32,title:'ESP32 LED·스위치·가변저항·DHT11',ref:'임베디드AIoT Day1 p.53·54',build:iot01}
]);
export const lectureExample=id=>LECTURE_EXAMPLES.find(e=>e.id===id);
/** Example list values of lecture examples (`lecture:<id>`), next to the HAL example ids. */
export const LECTURE_PREFIX='lecture:';
export function lectureGuide(id){
 const e=lectureExample(id);if(!e)return '';
 const how=e.id==='lecture-fw-09'?'STM32 HAL 코드와 ESP32 스케치(I2C 슬레이브 0x08)를 함께 실행합니다.':e.boards.includes('esp32')?'ESP32 스케치를 실행합니다. 코드를 고치면 동작도 바뀝니다.':'라즈베리파이 코드는 빌드·실행하지 않는 고정 실행입니다. 예제 시나리오대로 핀이 바뀌고 배선이 틀리면 동작하지 않습니다.';
 const input=e.build===asgLedShell||e.build===asgDimmerShell||e.build===asgKernelPwm?' 직렬 모니터에서 RPI-1을 고르고 숫자를 보내 입력합니다.':'';
 return `${e.kind==='과제'?'강의 과제':'강의 실습'} · ${e.ref} · ${how}${input}`;
}
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s_·—-]+/g,'');
const BOARD_WORDS={rpi:'라즈베리파이 raspberry pi rpi',stm32:'stm32 nucleo',esp32:'esp32'};
export function searchLectureExamples(query){const q=normalize(query);return LECTURE_EXAMPLES.filter(e=>!q||normalize([e.code,e.title,e.ref,e.kind,'강의',...e.boards.map(b=>BOARD_WORDS[b])].join(' ')).includes(q));}
/** The lecture example as a new project (the editor opens the board program). */
export function applyLectureExample(id){
 const example=lectureExample(id);if(!example)throw new Error('강의 예제를 찾을 수 없습니다.');
 const project=validateProject(example.build()),board=project.components.find(p=>p.type==='devboard');
 return {project,file:board&&!example.boards.includes('stm32')?boardFileKey(board):'main.c'};
}
