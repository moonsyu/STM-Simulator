// A first circuit from the Pinout (feature 13): an .ioc says what each pin does and how it is labelled, not what is wired
// to it, so every pin function gets the part a beginner would wire to try it out — an LED with its resistor on an output,
// a button on an input, a potentiometer on an ADC channel, a memory module on an I2C / SPI bus, a terminal on a UART.
// suggestCircuit lists them (the user picks); buildCircuit makes the parts and nets and lets the example layout engine
// place and route them on the breadboard.
import {boardPin} from './pins.js';
import {arrangeExampleOnBreadboards} from './example-breadboard.js';
import {physicalExample} from './catalog-examples.js';

// Pins the NUCLEO boards already have a part on: no external part is made for them.
const ONBOARD={PA5:'보드의 LD2(초록 LED)',PC13:'보드의 B1(USER 버튼)',PA2:'ST-LINK 가상 COM 포트(USART2 TX)',PA3:'ST-LINK 가상 COM 포트(USART2 RX)'};
// Outputs that select or control a device rather than drive a load.
const CONTROL=/(^|_)(CS|NSS|SS|DC|RS|RST|RES|RESET|EN|WR|RD|LAT|LATCH|STB)\d*$/i;
const signalPin=(mcu,fn)=>Object.keys(mcu.pins).find(p=>mcu.pins[p].function===fn);

/** What could be wired to this Pinout: [{key, title, pins, parts, note?, skipped?}] (skipped: listed with the reason, not built). */
export function suggestCircuit(mcu){
  const out=[],pins=Object.entries(mcu.pins||{}).filter(([,p])=>!['Reset','Reserved'].includes(p.function)),per=mcu.peripherals||{},used=new Set();
  const label=pin=>mcu.pins[pin]?.label||'',name=pin=>label(pin)?`${pin} (${label(pin)})`:pin;
  // A pin without a header terminal (PA2 / PA3 on a NUCLEO-64: solder bridges SB62 / SB63 are open) cannot be wired.
  const add=s=>{const off=s.pins.filter(p=>!boardPin(p));if(off.length&&!s.skipped)s={...s,parts:[],skipped:`${off.join('·')}은 보드 헤더에 나와 있지 않아 배선할 수 없습니다.`};out.push(s);for(const p of s.pins)used.add(p);};
  // Buses first: they claim their pins and, for SPI, a chip-select output.
  for(const id of Object.keys(per).filter(i=>/^I2C\d$/.test(i)&&per[i].enabled)){
    const scl=signalPin(mcu,id+'_SCL'),sda=signalPin(mcu,id+'_SDA');if(!scl||!sda)continue;
    const oled=/OLED|SSD1306|DISPLAY/i.test(label(scl)+label(sda)+pins.map(([,p])=>p.label).join(' '));
    add({key:id,kind:oled?'oled':'i2c',title:`${id} — ${oled?'OLED 디스플레이(SSD1306, 0x3C)':'I²C 메모리 모듈(0x50)'}`,pins:[scl,sda],parts:[oled?'OLED':'I²C 메모리'],scl,sda});
  }
  for(const id of Object.keys(per).filter(i=>/^SPI\d$/.test(i)&&per[i].enabled)){
    const sck=signalPin(mcu,id+'_SCK'),miso=signalPin(mcu,id+'_MISO'),mosi=signalPin(mcu,id+'_MOSI');if(!sck||!miso||!mosi)continue;
    const cs=pins.find(([pin,p])=>p.function==='GPIO_Output'&&!used.has(pin)&&/(^|_)(CS|NSS|SS)\d*$/i.test(p.label||''))?.[0];
    if(cs)add({key:id,kind:'spi',title:`${id} — SPI 메모리 모듈 (CS ${name(cs)})`,pins:[sck,miso,mosi,cs],parts:['SPI 메모리'],sck,miso,mosi,cs});
    else add({key:id,kind:'spi',title:`${id} — SPI 장치`,pins:[sck,miso,mosi],parts:[],skipped:'CS로 쓸 GPIO 출력(라벨이 CS·NSS로 끝나는 핀)이 없어 만들지 않습니다.'});
  }
  for(const id of Object.keys(per).filter(i=>/^US?ART\d$/.test(i)&&per[i].enabled)){
    const tx=signalPin(mcu,id+'_TX'),rx=signalPin(mcu,id+'_RX');if(!tx||!rx)continue;
    if(ONBOARD[tx]&&ONBOARD[rx])add({key:id,kind:'uart',title:`${id} — ${ONBOARD[tx].replace(/\(.*/,'')}`,pins:[tx,rx],parts:[],skipped:'보드의 ST-LINK가 PC와 연결합니다. 하단 직렬 모니터를 쓰세요.'});
    else add({key:id,kind:'uart',title:`${id} — 외부 UART 터미널 (${per[id].baud??115200} baud)`,pins:[tx,rx],parts:['UART 터미널'],tx,rx,baud:per[id].baud??115200});
  }
  for(const [pin,p]of pins){
    if(used.has(pin))continue;const fn=p.function,timer=/^(TIM\d+)_CH\d$/.exec(fn)?.[1];
    if(ONBOARD[pin]&&['GPIO_Output','GPIO_Input','GPIO_EXTI'].includes(fn)){add({key:pin,kind:'onboard',title:`${name(pin)} — ${ONBOARD[pin]}`,pins:[pin],parts:[],skipped:'보드에 이미 있는 부품입니다.'});continue;}
    if(fn==='GPIO_Output'){
      if(CONTROL.test(p.label||''))add({key:pin,kind:'control',title:`${name(pin)} — 장치 제어 핀`,pins:[pin],parts:[],skipped:'CS·DC·RST 같은 제어 신호라 부품을 만들지 않습니다.'});
      else if(/BUZZ|BEEP/i.test(p.label||''))add({key:pin,kind:'buzzer',title:`${name(pin)} — 능동 부저`,pins:[pin],parts:['부저'],pin});
      else add({key:pin,kind:'led',title:`${name(pin)} — LED와 330 Ω 저항`,pins:[pin],parts:['LED','330 Ω'],pin});
    }else if(fn==='GPIO_Input'||fn==='GPIO_EXTI'){
      const down=p.pull==='PULLDOWN';
      add({key:pin,kind:'button',title:`${name(pin)} — 버튼 (누르면 ${down?'3.3 V':'GND'})`,pins:[pin],parts:['버튼'],pin,to:down?'3V3':'GND',note:p.pull==='NOPULL'?'Pinout에서 Pull-up을 켜지 않으면 버튼을 뗐을 때 입력이 떠 있습니다.':undefined});
    }else if(/^ADC1_IN\d+$/.test(fn))add({key:pin,kind:'pot',title:`${name(pin)} — 가변저항 10 kΩ (${fn})`,pins:[pin],parts:['가변저항'],pin});
    else if(timer&&per[timer]?.enabled&&per[timer].mode==='pwm'){
      if(/SERVO/i.test(p.label||''))add({key:pin,kind:'servo',title:`${name(pin)} — RC 서보 (${fn} PWM)`,pins:[pin],parts:['서보'],pin});
      else add({key:pin,kind:'led',title:`${name(pin)} — LED와 330 Ω 저항 (${fn} PWM 밝기)`,pins:[pin],parts:['LED','330 Ω'],pin});
    }
  }
  return out;
}

/** The project with the chosen suggestions as parts on the breadboard (its other circuit replaced). */
export function buildCircuit(project,suggestions){
  const p=structuredClone(project);p.components=[];p.wires=[];p.surfaces={...(p.surfaces||{}),board:{...(p.surfaces?.board||{}),hidden:false},breadboard:{...(p.surfaces?.breadboard||{}),hidden:false}};
  let wires=0,count={};
  const wire=(from,to,color='#23a68a')=>p.wires.push({id:'w'+(++wires),from,to,color});
  const power=(to,name)=>wire(boardPin(name),to,name==='GND'?'#4e647b':'#dd654c');
  const part=(type,prefix,extra={})=>{const n=count[prefix]=(count[prefix]||0)+1,c={id:(prefix+n).toLowerCase(),name:prefix+n,type,x:800,y:200+40*p.components.length,rotation:0,...extra};p.components.push(c);return t=>`part:${c.id}:${t}`;};
  for(const s of suggestions){
    if(s.skipped)continue;
    if(s.kind==='led'){const r=part('resistor','R',{value:330}),led=part('led','LED',{color:'red'});wire(boardPin(s.pin),r('a'));wire(r('b'),led('a'));power(led('b'),'GND');}
    else if(s.kind==='buzzer'){const b=part('buzzer','BZ');wire(boardPin(s.pin),b('a'));power(b('b'),'GND');}
    else if(s.kind==='button'){const b=part('button','SW');wire(boardPin(s.pin),b('a'),'#8064d8');power(b('d'),s.to);}
    else if(s.kind==='pot'){const v=part('potentiometer','VR',{value:10000,position:50});power(v('p1'),'GND');wire(boardPin(s.pin),v('p2'),'#8064d8');power(v('p3'),'3V3');}
    else if(s.kind==='servo'){const v=part('servo','SERVO');power(v('p1'),'5V');power(v('p2'),'GND');wire(boardPin(s.pin),v('p3'));}
    else if(s.kind==='i2c'||s.kind==='oled'){const m=part(s.kind,s.kind==='oled'?'OLED':'I2C',{address:s.kind==='oled'?60:80});power(m('p1'),'3V3');power(m('p2'),'GND');wire(boardPin(s.sda),m('p3'),'#8064d8');wire(boardPin(s.scl),m('p4'));}
    else if(s.kind==='spi'){const m=part('spi','SPI');power(m('p1'),'3V3');power(m('p2'),'GND');wire(boardPin(s.cs),m('p3'));wire(boardPin(s.sck),m('p4'));wire(boardPin(s.mosi),m('p5'));wire(boardPin(s.miso),m('p6'),'#8064d8');}
    else if(s.kind==='uart'){const m=part('uart','UART',{baud:s.baud});power(m('p1'),'3V3');power(m('p2'),'GND');wire(m('p3'),boardPin(s.rx),'#8064d8');wire(boardPin(s.tx),m('p4'));}
  }
  if(!p.components.length)return p;
  return arrangeExampleOnBreadboards(physicalExample(p));
}
