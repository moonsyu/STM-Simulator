import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject} from '../src/project.js';
import {generateHal} from '../src/mcu-config.js';
import {SimulationSession} from '../src/session.js';
import {boardPin} from '../src/pins.js';
import {halExample} from '../src/hal-examples.js';

const pulls=['NOPULL','PULLUP','PULLDOWN'];
const pin=(fn,pull='NOPULL',initial=0)=>({function:fn,pull,initial,edge:'FALLING',label:''});
function start(project,body='',extra=''){
  project.code=generateHal(project.mcu,{minimal:true}).replace('  /* USER CODE BEGIN 2 */','  /* USER CODE BEGIN 2 */\n'+body)+extra;
  const output=[],session=new SimulationSession(project,{print:value=>output.push(value)});session.tick(0);
  return {session,output};
}
const close=(actual,expected,message)=>assert.ok(actual!==null&&Math.abs(actual-expected)<0.0001,`${message}: ${actual} != ${expected}`);

test('generated Analog initialization disables every internal pull but retains external PC13 pull-up voltage',()=>{
  for(const pull of pulls){
    const p=blankProject();p.surfaces.board.hidden=false;
    p.mcu.pins.PA0=pin('Analog',pull);p.mcu.pins.PC13=pin('Analog',pull);
    const {session:s,output}=start(p,'printf("%u %u %u %u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0), HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_13), digitalRead(PA0), digitalRead(PC13));');
    assert.equal(s.runtime.gpio.PA0.mode,'ANALOG');assert.equal(s.runtime.gpio.PC13.mode,'ANALOG');
    assert.equal(s.result.voltage('signal:PA0'),null,pull+' must not create a pull resistor');
    close(s.result.voltage('signal:PC13'),3.3,pull+' external board pull-up');
    assert.deepEqual(output,['0 0 0 0']);assert.equal(s.runtime.call('analogRead',['PC13']),4095);
    assert.equal(s.hal.config.pins.PA0.pull,pull);assert.match(p.code,new RegExp('GPIO_InitStruct.Pull = GPIO_'+pull+';'));
  }
});

test('externally driven Analog pins preserve high and low voltages while digital reads and edge detection stay disabled',()=>{
  for(const pull of pulls){
    const p=blankProject();p.surfaces.board.hidden=false;p.mcu.pins.PA0=pin('Analog',pull);p.mcu.pins.PB0=pin('GPIO_Output');
    p.wires.push({id:'drive',from:boardPin('PB0'),to:boardPin('PA0'),color:'#ff0000'});
    const {session:s,output}=start(p,'attachInterrupt(PA0, inputEdge, CHANGE);','\nvoid inputEdge(void) { printf("unexpected edge\\n"); }');
    for(const [i,level]of [1,0,1].entries()){
      s.hal.call('HAL_GPIO_WritePin',['GPIOB',1,level],s.runtime);s.tick(i+1);
      close(s.result.voltage('signal:PA0'),level*3.3,pull+' external drive');
      assert.equal(s.hal.call('HAL_GPIO_ReadPin',['GPIOA',1],s.runtime),0);
      assert.equal(s.runtime.call('digitalRead',['PA0']),0);assert.equal(s.runtime.call('analogRead',['PA0']),level*4095);
    }
    assert.deepEqual(output,[]);assert.equal(s.runtime.call('pulseIn',['PA0',1,100]),0);
  }
});

test('HAL ADC samples the unchanged external divider in Analog mode for all saved pull choices',()=>{
  for(const pull of pulls)for(const [top,bottom,voltage]of [[9000,1000,0.33],[5000,5000,1.65],[1000,10000,3.0]]){
    const p=halExample('adc');p.mcu.pins.PA0.pull=pull;
    p.components.find(part=>part.id==='r1').value=top;p.components.find(part=>part.id==='r2').value=bottom;
    const {session:s,output}=start(p,'HAL_ADC_Start(&hadc1); HAL_ADC_PollForConversion(&hadc1, 10); printf("%u %u %u\\n", HAL_ADC_GetValue(&hadc1), analogRead(PA0), HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0));');
    const [adc,analog,digital]=output[0].split(' ').map(Number),expected=Math.round(voltage/3.3*4095);
    assert.equal(s.runtime.gpio.PA0.mode,'ANALOG');close(s.result.voltage('signal:PA0'),voltage,pull+' ADC voltage');
    assert.ok(Math.abs(adc-expected)<=1);assert.equal(analog,adc);assert.equal(digital,0);
  }
});

test('HAL DeInit and subsequent Input initialization restore the digital path and requested pull',()=>{
  const p=blankProject();p.mcu.pins.PA0=pin('Analog','PULLDOWN');p.mcu.pins.PC13=pin('Analog');
  const {session:s,output}=start(p,`
    printf("%u\\n", HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_13));
    HAL_GPIO_DeInit(GPIOC, GPIO_PIN_13);
    printf("%u\\n", HAL_GPIO_ReadPin(GPIOC, GPIO_PIN_13));
    GPIO_InitTypeDef init = {0};
    init.Pin = GPIO_PIN_0; init.Mode = GPIO_MODE_INPUT; init.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(GPIOA, &init);
    printf("%u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0));
    HAL_Delay(10);
    init.Mode = GPIO_MODE_ANALOG; HAL_GPIO_Init(GPIOA, &init);
    HAL_Delay(10);
    init.Mode = GPIO_MODE_INPUT; init.Pull = GPIO_PULLDOWN; HAL_GPIO_Init(GPIOA, &init);
    printf("%u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0));
    HAL_Delay(10);`);
  assert.deepEqual(output,['0','1','1']);assert.equal(s.runtime.gpio.PC13.mode,'INPUT');assert.equal(s.runtime.gpio.PA0.mode,'INPUT_PULLUP');
  close(s.result.voltage('signal:PA0'),3.3,'restored pull-up');
  s.tick(10);assert.equal(s.runtime.gpio.PA0.mode,'ANALOG');assert.equal(s.result.voltage('signal:PA0'),null);
  s.tick(20);assert.equal(s.runtime.gpio.PA0.mode,'INPUT_PULLDOWN');close(s.result.voltage('signal:PA0'),0,'restored pull-down');assert.deepEqual(output,['0','1','1','0']);
});

test('existing GPIO output can enter Analog without retaining its driver and sketch Input mode restores digital reads',()=>{
  const p=blankProject();p.mcu.pins.PA0=pin('GPIO_Output','NOPULL',1);
  const {session:s,output}=start(p,`
    printf("%u\\n", HAL_GPIO_ReadPin(GPIOA, GPIO_PIN_0));
    GPIO_InitTypeDef init = {0}; init.Pin = GPIO_PIN_0; init.Mode = GPIO_MODE_ANALOG; init.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(GPIOA, &init); HAL_Delay(10);
    pinMode(PA0, INPUT_PULLUP); printf("%u\\n", digitalRead(PA0)); HAL_Delay(10);`);
  assert.deepEqual(output,['1']);assert.equal(s.runtime.gpio.PA0.mode,'ANALOG');assert.equal(s.result.voltage('signal:PA0'),null);
  assert.throws(()=>s.runtime.call('pinMode',['PA0','ANALOG']),/pinMode/);
  s.tick(10);assert.deepEqual(output,['1','1']);assert.equal(s.runtime.gpio.PA0.mode,'INPUT_PULLUP');close(s.result.voltage('signal:PA0'),3.3,'sketch input restored');
});
