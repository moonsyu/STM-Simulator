// Feature 13 — a first circuit from the Pinout: the suggestions follow pin functions and labels, and the built circuit
// really works with a program for those pins (LED lights, button reads, potentiometer converts, I2C memory answers).
import test from 'node:test';
import assert from 'node:assert/strict';
import {suggestCircuit,buildCircuit} from '../../src/ioc-circuit.js';
import {blankProject,validateProject} from '../../src/project.js';
import {generateHal,validateMcu,importIoc} from '../../src/mcu-config.js';
import {SimulationSession} from '../../src/session.js';

const pin=(fn,extra={})=>({function:fn,pull:'NOPULL',edge:'FALLING',label:'',initial:0,...extra});

test('suggestions: LED / button / potentiometer / PWM / buses by function and label; on-board and control pins are listed but not built',()=>{
 const p=blankProject();
 p.mcu.pins={PA5:pin('GPIO_Output',{label:'LD2'}),PC13:pin('GPIO_EXTI',{label:'B1'}),PA8:pin('GPIO_Output',{label:'LED_RED'}),PB5:pin('GPIO_Input',{pull:'PULLUP'}),PB4:pin('GPIO_Input',{pull:'PULLDOWN'}),PA0:pin('ADC1_IN0'),
  PB6:pin('TIM4_CH1'),PA9:pin('GPIO_Output',{label:'OLED_DC'}),PC0:pin('GPIO_Output',{label:'BUZZER'}),PB8:pin('I2C1_SCL'),PB9:pin('I2C1_SDA'),PA2:pin('USART2_TX'),PA3:pin('USART2_RX'),
  PB13:pin('SPI2_SCK'),PB14:pin('SPI2_MISO'),PB15:pin('SPI2_MOSI'),PB12:pin('GPIO_Output',{label:'FLASH_CS'}),PC10:pin('UART4_TX'),PC11:pin('UART4_RX')};
 p.mcu.peripherals={ADC1:{enabled:true},TIM4:{enabled:true,mode:'pwm',prescaler:15999,period:99,pulse:50},I2C1:{enabled:true,clock:100000},USART2:{enabled:true,baud:115200},SPI2:{enabled:true,clock:1000000},UART4:{enabled:true,baud:9600}};
 const list=suggestCircuit(validateMcu(p.mcu)),by=Object.fromEntries(list.map(s=>[s.key,s]));
 assert.equal(by.PA5.skipped,'보드에 이미 있는 부품입니다.');assert.equal(by.PC13.kind,'onboard');
 assert.equal(by.PA8.kind,'led');assert.match(by.PA8.title,/PA8 \(LED_RED\) — LED와 330 Ω 저항/);
 assert.equal(by.PB5.to,'GND');assert.equal(by.PB4.to,'3V3');assert.equal(by.PA0.kind,'pot');assert.match(by.PB6.title,/TIM4_CH1 PWM 밝기/);
 assert.equal(by.PC0.kind,'buzzer');assert.equal(by.PA9.kind,'control');assert.ok(by.PA9.skipped);
 assert.equal(by.I2C1.kind,'oled','an OLED_ label makes the I2C device an OLED');
 assert.match(by.USART2.skipped,/ST-LINK/);assert.equal(by.UART4.kind,'uart');assert.equal(by.UART4.baud,9600);
 assert.deepEqual(by.SPI2.pins,['PB13','PB14','PB15','PB12']);assert.ok(!by.PB12,'the CS output belongs to the SPI device');
});

test('the built circuit works: the LED lights, the button pulls its input low, the potentiometer converts, the I2C memory answers',()=>{
 const p=blankProject();
 p.mcu.pins={PA8:pin('GPIO_Output'),PB5:pin('GPIO_Input',{pull:'PULLUP'}),PA0:pin('ADC1_IN0'),PB8:pin('I2C1_SCL'),PB9:pin('I2C1_SDA')};
 p.mcu.peripherals={ADC1:{enabled:true},I2C1:{enabled:true,clock:100000}};p.mcu=validateMcu(p.mcu);
 const built=buildCircuit(p,suggestCircuit(p.mcu));
 assert.deepEqual(built.components.map(c=>c.name).sort(),['I2C1','LED1','R1','SW1','VR1']);
 assert.ok(built.components.every(c=>c.attachments||c.attachA),'every part sits on the breadboard');assert.equal(built.surfaces.board.hidden,false);
 built.code=generateHal(built.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n  uint8_t tx[1] = {42}, rx[1] = {0};\n  HAL_I2C_Mem_Write(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, tx, 1, 100);\n  HAL_I2C_Mem_Read(&hi2c1, 0x50 << 1, 0x10, I2C_MEMADD_SIZE_8BIT, rx, 1, 100);')
  .replace('    /* USER CODE BEGIN 3 */','    /* USER CODE BEGIN 3 */\n    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_8, GPIO_PIN_SET);\n    HAL_ADC_Start(&hadc1);\n    HAL_ADC_PollForConversion(&hadc1, 10);\n    printf("btn=%d adc=%lu mem=%u\\n", (int)HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_5), HAL_ADC_GetValue(&hadc1), rx[0]);\n    HAL_Delay(20);');
 const q=validateProject(built),out=[],s=new SimulationSession(q,{print:x=>out.push(x),warn:()=>{}});s.tick(0);for(let t=10;t<=60;t+=10)s.tick(t);
 const m=/^btn=(\d) adc=(\d+) mem=(\d+)$/.exec(out.at(-1));assert.ok(m,out.at(-1));
 assert.equal(m[1],'1','released button: pulled up');assert.ok(Number(m[2])>1800&&Number(m[2])<2300,'potentiometer at 50 %: '+m[2]);assert.equal(m[3],'42','I2C memory read back');
 const led=q.components.find(c=>c.name==='LED1');assert.ok(s.result.parts[led.id]?.on,'LED on with PA8 high');
 s.setPressed({[q.components.find(c=>c.name==='SW1').id]:true});for(let t=70;t<=120;t+=10)s.tick(t);
 assert.match(out.at(-1),/^btn=0 /,'pressed button reads 0');
});

test('an imported .ioc (OLED example of the F103RB) gives a circuit without parts for the on-board LED and control pins',()=>{
 const {config}=importIoc(['Mcu.Name=STM32F103R(8-B)Tx','Mcu.CPN=STM32F103RBT6','Mcu.IP0=I2C1','Mcu.IP1=RCC','Mcu.IP2=USART2','PA2.Signal=USART2_TX','PA3.Signal=USART2_RX','PA5.Signal=GPIO_Output','PA5.GPIO_Label=LD2 [Green Led]',
  'PA8.Signal=GPIO_Output','PA8.GPIO_Label=OLED_DC','PB8.Signal=I2C1_SCL','PB9.Signal=I2C1_SDA','PC13-TAMPER-RTC.Signal=GPXTI13','PC13-TAMPER-RTC.GPIO_Label=B1 [Blue PushButton]','USART2.VirtualMode=VM_ASYNC'].join('\n'));
 const list=suggestCircuit(config),made=list.filter(s=>!s.skipped);
 assert.deepEqual(made.map(s=>s.kind),['oled']);assert.equal(list.filter(s=>s.skipped).length,4);
 const p=blankProject('STM32F103RB');p.boardId='nucleo-f103rb';p.mcu=config;const built=buildCircuit(p,list);
 assert.equal(built.components.length,1);assert.match(built.components[0].type,/oled/);
});
