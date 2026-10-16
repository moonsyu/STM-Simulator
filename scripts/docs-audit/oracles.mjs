import {family} from './runtime.mjs';
import {createHash} from 'node:crypto';
const tftExpectedHash=createHash('sha256').update(JSON.stringify(Array.from({length:128*160},(_,i)=>i%128<43?0xf800:i%128<86?0x07e0:0x001f))).digest('hex');

// These expectations use observable device output, not successful compilation.
export function assess(type,e){
 const checks=[],check=(name,ok,evidence)=>checks.push({name,passed:!!ok,evidence}),f=family(type);
 const text=e.printed.map(v=>v.text).join('\n'),parts=e.frames.map(v=>v.parts?.selected).filter(Boolean);
 const all=e.frames.flatMap(v=>Object.values(v.parts||{})),some=fn=>parts.some(fn),both=key=>some(p=>p[key]===true)&&some(p=>p[key]===false);
 const logs=(name,patterns)=>check(name,patterns.every(p=>p.test(text)),[...new Set(e.printed.map(v=>v.text))].slice(0,24));
 check('runtime completed without exception',!e.error,e.error);
 check('no electrical short fault',!e.frames.some(v=>v.fault),e.frames.filter(v=>v.fault).map(v=>v.atMs));
 if(['board','breadboard','led'].includes(f))check('LED lights and extinguishes',all.some(p=>p.on&&p.current>.003)&&all.some(p=>p.on===false&&p.current===0),all.map(p=>({on:p.on,current:p.current})).slice(0,12));
 else if(f==='resistor')check('divider current and ADC conversion',some(p=>p.current>0&&p.voltage>0)&&e.calls.HAL_ADC_GetValue?.count>0,{part:parts.at(-1),returns:e.calls.HAL_ADC_GetValue?.returns});
 else if(f==='button')logs('press and release read back',[/button=0/,/button=1/]);
 else if(f==='lcd')check('LCD received text',some(p=>p.lcd?.lines?.join('').includes('STM Emulator')||p.device?.lines?.join('').includes('STM Emulator'))||all.some(p=>p.lcd?.lines?.join('').includes('STM Emulator')),{last:parts.at(-1)});
 else if(f==='potentiometer')logs('ADC follows 20 and 80 percent',[/0\.660 V/,/2\.640 V/]);
 else if(f==='ldr')check('ADC reacts to illumination',Object.keys(e.calls.HAL_ADC_GetValue?.returns||{}).length>=2,{returns:e.calls.HAL_ADC_GetValue?.returns});
 else if(type==='ref_ntc_module_3')logs('NTC divider follows temperature',[/1\.094 V/,/2\.300 V/]);
 else if(['ntc','sht31','temperature','dht11','dht22'].includes(f)){
  logs('temperature changes to 10 and 45 C',[/10\.0/,/45\.0/]);
  if(['sht31','dht11','dht22'].includes(f))logs('humidity changes to 30 and 70 percent',[/30\.0/,/70\.0/]);
 }else if(f==='mpu6050')logs('accelerometer and gyro input changes',[/WHO_AM_I=0x68/,/-0\.50/,/90\.0/,/0\.75/,/-45\.0/]);
 else if(f==='pir')logs('motion rising and falling',[/motion=1/,/motion=0/]);
 else if(f==='oled')check('OLED visible with written pixels',some(p=>p.visible&&p.device?.ram?.nonzero>0),parts.at(-1)?.device?.ram);
 else if(f==='tft')check('complete RGB565 frame matches all 20480 pixels',some(p=>p.visible&&p.device?.ram?.sha256===tftExpectedHash),parts.at(-1)?.device?.ram);
 else if(f==='matrix')check('matrix visible and frame changes',some(p=>p.visible&&p.device?.ram?.some(Boolean))&&new Set(parts.map(p=>JSON.stringify(p.device?.ram))).size>2,parts.map(p=>p.device?.ram));
 else if(f==='servo')check('servo reaches 0,90,180 degrees',[0,90,180].every(n=>some(p=>Math.abs(p.angle-n)<5)),parts.map(p=>({angle:p.angle,target:p.target})));
 else if(['dc_motor','dc_supply','l298n'].includes(f))check('motor forward and reverse rotation',all.some(p=>p.rpm>500)&&all.some(p=>p.rpm< -500),all.filter(p=>'rpm'in p).map(p=>({rpm:p.rpm,direction:p.direction})));
 else if(f==='motor'&&type!=='ref_motor_driver_hat')check('motor forward and reverse rotation',some(p=>p.rpm>500)&&some(p=>p.rpm< -500),parts.map(p=>p.rpm));
 else if(type==='ref_motor_driver_hat')check('PCA9685 commands drive the attached motor',some(p=>p.device?.registers?.nonzero>0)&&all.some(p=>p.rpm>1000&&p.current>.15),all.filter(p=>'rpm'in p));
 else if(f==='stepper'){const steps=all.filter(p=>'steps'in p).map(p=>p.steps);check('stepper shaft moves',steps.some(n=>Math.abs(n)>50),steps);if(type==='stepper')check('stepper reverses',steps.some((n,i)=>i>0&&n<steps[i-1]-10),steps);}
 else if(f==='relay')check('relay NO/NC and load on/off',some(p=>p.contact==='NO')&&some(p=>p.contact==='NC')&&all.some(p=>p.on&&p.current>.003)&&all.some(p=>p.on===false),parts.map(p=>p.contact));
 else if(f==='joystick')logs('axes and switch follow inputs',[/X=102[34] Y=307[01] pressed=1/,/X=307[01] Y=102[34] pressed=0/]);
 else if(f==='encoder'){
  if(type==='ref_encoder_bare_5')logs('quadrature and push button inputs change',[/A\/B=0/,/A\/B=3/,/button=0/,/button=1/]);
  else logs('encoder counts forward and reverse edges',[/count=3 edges=12/,/count=1 edges=4/]);
 }else if(f==='uart')check('UART transmit and injected receive echo',some(p=>p.received?.includes('HAL UART ready')&&p.received.includes('Audit42')),parts.at(-1)?.received);
 else if(f==='rs485')check('serial payload transmitted',some(p=>p.received?.includes('STM')),parts.at(-1)?.received);
 else if(['i2c','spi'].includes(f))logs('EEPROM write/read returns 42',[/\b42\b/]);
 else if(f==='slide')logs('switch state changes',/dpdt|dp3t/.test(type)?[/pole 1=0/,/pole 1=(4095|2047)/]:[/switch=0/,/switch=1/]);
 else if(f==='rgb'){
  if(/neopixel|gravity/.test(type))check('addressed RGB payload received',some(p=>p.device?.color?.some(Boolean)),parts.at(-1)?.device);
  else check('all three RGB channels light', ['r','g','b'].every(k=>some(p=>p.channels?.[k]?.on)),parts.map(p=>p.channels));
 }else if(f==='capacitor')check('capacitor charges under PWM',some(p=>p.voltage>1)&&e.calls.HAL_TIM_PWM_Start?.returns?.['0']>0,parts.map(p=>p.voltage));
 else if(f==='diode')check('forward drop near 0.7V',some(p=>p.voltage>.65&&p.voltage<.8),parts.at(-1));
 else if(f==='buzzer')check('buzzer switches on and off',both('on'),parts.map(p=>p.on));
 else if(f==='passive_buzzer')check('buzzer produces tones and silence',some(p=>p.frequency>=500&&p.frequency<=1100)&&some(p=>p.frequency===0),parts.map(p=>({frequency:p.frequency,on:p.on})));
 else if(f==='sevenseg'){
  if(/4digit|tm1637/.test(type))check('display receives 1234',some(p=>JSON.stringify(p.digits)==='[6,91,79,102]'),parts.at(-1));
  else check('segment patterns change',new Set(parts.map(p=>Object.entries(p.channels||{}).filter(([,c])=>c.on).map(([k])=>k).join(''))).size>=3,parts.map(p=>Object.entries(p.channels||{}).filter(([,c])=>c.on).map(([k])=>k)));
 }else if(f==='ultrasonic'){
  const distances=[...text.matchAll(/(?:distance|URM09)[=:]\s*([\d.]+)/gi)].map(m=>+m[1]);check('distance follows 55 and 170 cm',[55,170].every(n=>distances.some(d=>Math.abs(d-n)<3)),distances);
 }else if(f==='external_adc')logs('ADS1115 measures 3.3V',[/3\.3000 V/]);
 else if(f==='external_dac')logs('MCP4725 half scale measures 1.65V',[/1\.650 V/]);
 else if(f==='can')check('CAN loopback ID and payload received',/CAN id=123 length=2/.test(text)&&some(p=>p.transmitted>0&&p.errors===0&&p.lastId===0x123),parts.at(-1));
 else if(f==='external_rtc')check('RTC advances seconds',some(p=>p.device?.registers?.first?.[0]>=3),parts.at(-1)?.device?.registers);
 else if(f==='sd')logs('SD initialized and OCR read',[/SD OCR=40ff8000/]);
 else if(f==='i2s')check('audio frames at 16kHz with 1kHz waveform',some(p=>p.frames>0&&p.rate===16000&&p.frequency===1000&&p.rms>0),parts.at(-1));
 else if(f==='dcmi')logs('camera responds with sensor ID',[/PID\/VER=26 42/]);
 else check('device-specific oracle exists',false,f);
 return {passed:checks.every(c=>c.passed),checks};
}
