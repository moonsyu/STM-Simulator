import {test,describe} from 'node:test';
import assert from 'node:assert/strict';
import {HAL_EXAMPLES,HAL_GUIDES,applyHalExample,halExample} from '../../src/hal-examples.js';
import {SimulationSession} from '../../src/session.js';
import {blankProject,validateProject} from '../../src/project.js';
import {setSerialEnabled} from '../../src/serial-config.js';
import {generateHal} from '../../src/mcu-config.js';
import {close} from './helpers/circuit.js';

/** Applies a HAL example to a blank project and starts a session that records printf and bus traces. */
function start(kind){
  const project=applyHalExample(blankProject(),kind),out=[],trace=[],uart=[];
  const session=new SimulationSession(project,{print:v=>out.push(String(v)),trace:e=>trace.push(e.message),uart:e=>uart.push(e)});
  session.tick(0);return {project,session,out,trace,uart};
}
const run=(session,end,step=10)=>{for(let t=Math.ceil(session.runtime.time/step)*step;t<=end;t+=step)session.tick(t);return session;};

describe('applyHalExample',()=>{
  test('keeps the current project name and produces a valid HAL project',()=>{
    const base=blankProject();base.name='수업 1';const p=applyHalExample(base,'blink');
    assert.equal(p.name,'수업 1');assert.equal(p.firmware.mode,'hal');assert.ok(p.mcu);
    assert.deepEqual(validateProject(p),validateProject(validateProject(p)),'validation is idempotent');
    assert.match(p.code,/#include "main\.h"/);assert.ok(p.code.includes(HAL_GUIDES.blink),'guide comment at the top of main.c');
  });
  test('unknown examples are rejected',()=>{
    assert.throws(()=>halExample('does-not-exist'),/HAL 예제/);
  });
  test('every example has a guide and a title',()=>{
    const missing=Object.keys(HAL_EXAMPLES).filter(k=>!HAL_EXAMPLES[k]||!HAL_GUIDES[k]);
    assert.deepEqual(missing,[]);
  });
});

describe('GPIO',()=>{
  test('blink toggles PA5 every 500 ms and the LED follows the pin voltage',()=>{
    const {session,out}=start('blink');
    const samples=[];for(const t of [100,400,600,900,1100]){run(session,t);samples.push([session.result.parts.led1.on,session.result.voltage('signal:PA5')]);}
    assert.deepEqual(samples.map(s=>s[0]),[true,true,false,false,true]);
    assert.ok(samples[0][1]>3&&samples[2][1]<0.1,`PA5 voltages ${samples.map(s=>s[1]?.toFixed(2))}`);
    assert.deepEqual(out.slice(0,3),['PA5=1','PA5=0','PA5=1']);
  });
  test('polled button lights the LED only while pressed',()=>{
    const {session,out}=start('button');run(session,150);
    assert.equal(session.result.parts.led1.on,false);assert.equal(out.at(-1),'button=0');
    session.setPressed({b1:true});run(session,400);assert.equal(session.result.parts.led1.on,true);assert.equal(out.at(-1),'button=1');
    session.setPressed({});run(session,600);assert.equal(session.result.parts.led1.on,false);
  });
  test('USER button EXTI callback toggles the LED once per press',()=>{
    const {session,out}=start('exti');run(session,20);assert.equal(session.result.parts.led1.on,false);
    session.setPressed({USER:true});run(session,40);assert.equal(session.result.parts.led1.on,true);assert.deepEqual(out,['EXTI PC13']);
    run(session,80);assert.deepEqual(out,['EXTI PC13'],'holding the button does not retrigger');
    session.setPressed({});run(session,100);session.setPressed({USER:true});run(session,120);
    assert.equal(session.result.parts.led1.on,false);assert.equal(out.length,2);
  });
  test('a disabled EXTI line does not call the callback until re-enabled',()=>{
    const project=applyHalExample(blankProject(),'exti');
    project.code=project.code.replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n  HAL_NVIC_DisableIRQ(EXTI15_10_IRQn);');
    const session=new SimulationSession(project);run(session,10);
    session.setPressed({USER:true});run(session,30);assert.equal(session.result.parts.led1.on,false);
    session.hal.call('HAL_NVIC_EnableIRQ',['EXTI15_10_IRQn'],session.runtime);run(session,50);assert.equal(session.result.parts.led1.on,true,'pending interrupt delivered');
  });
});

describe('UART',()=>{
  test('USART2 VCP prints the banner and echoes injected bytes via the RX interrupt',()=>{
    const {project,session,uart}=start('uart');run(session,30);
    assert.deepEqual(project.components,[],'onboard ST-LINK VCP needs no parts');
    assert.equal(session.buses.vcpOutput,'HAL UART ready\r\n');
    assert.equal(uart[0].instance,'USART2');assert.equal(uart[0].direction,'TX');assert.equal(String.fromCharCode(...uart[0].bytes),'HAL UART ready\r\n');
    assert.equal(session.inject('hi\r\n','USART2'),4);run(session,80);
    assert.equal(session.buses.vcpOutput,'HAL UART ready\r\nhi\r\n');
  });
  test('injection is refused before init and on instances without a device',()=>{
    const p=blankProject();p.mcu=setSerialEnabled(p.mcu,'USART2',true);p.code=generateHal(p.mcu);
    const s=new SimulationSession(p);assert.equal(s.inject('early','USART2'),0);run(s,30);
    assert.match(s.buses.vcpOutput,/HAL ready/);assert.equal(s.inject('A','USART2'),1);
    assert.equal(s.inject('B','USART2:external'),0,'no external part wired');assert.equal(s.inject('B','USART3'),0);
  });
  test('the sketch-style Serial buffer is bounded',()=>{
    const s=new SimulationSession(blankProject());
    assert.equal(s.inject('x'.repeat(300),'Serial'),256,'at most 256 bytes per injection');
    for(let i=0;i<15;i++)s.inject('y'.repeat(256),'Serial');
    assert.throws(()=>s.inject('z'.repeat(256),'Serial'),/수신 버퍼가 가득/);
  });
  test('external UART example only accepts input when powered, wired and baud-matched',()=>{
    const {session}=start('uart_external');run(session,30);
    assert.match(session.buses.received.get('demo'),/HAL UART ready/);
    assert.equal(session.inject('ext','USART2:external'),3);run(session,60);assert.match(session.buses.received.get('demo'),/ext$/);
    const bad=applyHalExample(blankProject(),'uart_external');bad.components[0].baud=115200;
    const s=new SimulationSession(bad);run(s,30);assert.equal(s.inject('bad','USART2:external'),0);
  });
});

describe('timers and PWM',()=>{
  test('TIM2 update interrupt fires every 100 ms',()=>{
    const {session,out}=start('timer');run(session,550);
    assert.deepEqual(out,['TIM2 tick=100','TIM2 tick=200','TIM2 tick=300','TIM2 tick=400','TIM2 tick=500']);
  });
  test('TIM2 PWM drives PA5 at 50 % duty and charges the RC filter toward 1.65 V',()=>{
    const {session,out,project}=start('pwm');assert.equal(project.simulation.pwmWaveform,true);run(session,100);
    assert.deepEqual(out,['TIM2 PWM: 100 Hz, duty 50%']);
    let high=0,count=0;for(let t=100;t<120;t+=0.25){session.tick(t);count++;if(session.runtime.gpio.PA5?.value>1.65)high++;}
    close(high/count,0.5,0.05,'duty cycle');
    const v=session.result.parts.demo.voltage;assert.ok(v>0.8&&v<2.5,`RC voltage ${v}`);
  });
  test('multiple timers drive a servo and a DC motor',()=>{
    const {session,out}=start('timer_multi');run(session,300);
    assert.match(out[0],/TIM2 servo=0 deg \(50 Hz\), TIM3 motor=75% \(1000 Hz\)/);
    assert.equal(session.result.parts.servo2.pulse,1000);assert.ok(session.result.parts.demoMotor.rpm>0,'the DC motor on the L298N turns');
  });
  test('ultrasonic echo timing measured with a free-running timer',()=>{
    const {session,out}=start('ultrasonic');run(session,200);assert.ok(out.length>0);assert.ok(out.every(l=>l==='distance=100.0 cm'),out.join('|'));
  });
});

describe('ADC',()=>{
  test('voltage divider reads mid-scale',()=>{
    const {session,out}=start('adc');run(session,600);assert.ok(out.length>=2);
    for(const line of out)assert.ok(Math.abs(Number(line)-2048)<=2,line);
  });
  test('potentiometer position changes the converted value',()=>{
    const {session,out,project}=start('potentiometer');run(session,300);assert.match(out.at(-1),/^ADC=204[78], voltage=1\.65\d V$/);
    project.components.find(c=>c.type==='ref_pot_bare_3').position=25;run(session,900);
    assert.match(out.at(-1),/^ADC=102[34], voltage=0\.82\d V$/);
  });
  test('TMP36 temperature conversion',()=>{
    const {session,out,project}=start('temperature');run(session,600);assert.equal(out[0],'TMP36=25.0 C');
    project.components.find(c=>c.type==='ref_tmp36_to92_3').temperature=60;run(session,1600);assert.equal(out.at(-1),'TMP36=60.0 C');
  });
  test('sampling into an array prints eight samples',()=>{
    const {session,out}=start('samples');run(session,200);
    assert.deepEqual(out.slice(0,8).map(l=>l.replace(/=\d+$/,'')),Array.from({length:8},(_,i)=>`sample[${i}]`));
  });
});

describe('I2C, SPI and displays',()=>{
  test('I2C memory write then read returns the byte with ACK traces',()=>{
    const {session,out,trace}=start('i2c');run(session,50);
    assert.deepEqual(out,['I2C write=0 read=0','42']);assert.ok(trace.some(t=>/0x50 READ 1 B · ACK/.test(t)));
    assert.equal(session.result.parts.demo.memory[0x10],42);
  });
  test('I2C to a wrong address NACKs (HAL_ERROR)',()=>{
    const p=applyHalExample(blankProject(),'i2c');p.components.find(c=>c.type==='ref_i2c_eeprom_8').address=81;const out=[];const s=new SimulationSession(p,{print:v=>out.push(v)});run(s,50);
    assert.match(out[0],/write=1 read=1/);
  });
  test('I2C memory without power does not respond',()=>{
    const p=applyHalExample(blankProject(),'i2c');delete p.components.find(c=>c.type==='ref_i2c_eeprom_8').attachments.p8;const out=[];const s=new SimulationSession(p,{print:v=>out.push(v)});run(s,50);
    assert.doesNotMatch(out[0],/write=0 read=0/);
  });
  test('SPI memory round-trip under chip select',()=>{
    const {session,out,trace}=start('spi');run(session,50);assert.deepEqual(out,['42']);assert.deepEqual(trace.slice(0,2),['TX 06 · RX 00','TX 02 · RX 00'],'write enable, then write');
    const p=applyHalExample(blankProject(),'spi');delete p.components.find(c=>c.type==='ref_spi_eeprom_8').attachments.p1;const o2=[];run(new SimulationSession(p,{print:v=>o2.push(v)}),50);
    assert.deepEqual(o2,['255'],'unconnected CS: MISO floats high');
  });
  test('LCD 1602 in 4-bit mode shows text',()=>{
    const {session}=start('lcd');run(session,300);const lcd=session.result.parts.demo.lcd;
    assert.equal(lcd.powered,true);assert.equal(lcd.visible,true);assert.equal(lcd.lines.length,2);
    assert.ok(lcd.lines.every(l=>l.length===16));assert.match(lcd.lines[1],/^HAL 4-bit LCD/);assert.ok(lcd.lines[0].trim().length>0);
  });
  test('seven-segment and RGB examples light the expected channels',()=>{
    const seg=start('sevenseg');run(seg.session,600);assert.ok(seg.out[0]==='digit=0');assert.equal(seg.session.result.parts.demo.on,true);
    const rgb=start('rgb');run(rgb.session,100);assert.equal(Object.values(rgb.session.result.parts.demo.channels).filter(c=>c.on).length>=1,true);
  });
  test('language example exercises structs, pointers and arrays',()=>{
    const {session,out}=start('language');run(session,20);assert.deepEqual(out,['average=25']);
  });
});

describe('all HAL examples',()=>{
  test('every HAL_EXAMPLES entry applies, validates and runs 50 ms without throwing',()=>{
    const failures=[];
    for(const kind of Object.keys(HAL_EXAMPLES)){
      try{
        const project=validateProject(applyHalExample(blankProject(),kind));
        if(project.firmware?.mode!=='hal')throw new Error('not a HAL project');
        const session=new SimulationSession(project);
        for(let t=0;t<=50;t+=10)session.tick(t);
        if(session.result?.fault)throw new Error('circuit fault: '+session.result.warnings.join('; '));
      }catch(error){failures.push(`${kind}: ${error.message}`);}
    }
    assert.deepEqual(failures,[],`${failures.length} of ${Object.keys(HAL_EXAMPLES).length} examples failed:\n${failures.join('\n')}`);
  });
});
