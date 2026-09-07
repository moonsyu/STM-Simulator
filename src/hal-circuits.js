import {boardPin} from './pins.js';
import {PART_DEFS} from './components.js';
import {findMount,applyMount} from './placement.js';

// The circuit and HAL source are one example. Each call creates a fresh document.
export function configureHalCircuit(project,kind){
  project.components=[];project.wires=[];project.simulation={stepMs:1,pwmWaveform:false};
  let nextWire=0;
  const wire=(from,to,color='#23a68a')=>project.wires.push({id:'w'+(++nextWire),from,to,color});
  const power=(to,name)=>wire(boardPin(name),to,name==='GND'?'#4e647b':'#dd654c');
  const resistor=(id,value,row,endRow)=>({id,name:id.toUpperCase(),type:'resistor',value,x:endRow?872:795,y:170+14*(row-4)+(endRow?7*(endRow-row):0),rotation:endRow?90:0,span:endRow?14*(endRow-row):42,attachA:`bb:${endRow?'j':'e'}:${row}`,attachB:`bb:${endRow?'j':'f'}:${endRow??row}`});
  if(['blink','button','exti','timer'].includes(kind)){
    project.components.push(resistor('r1',330,8),{id:'led1',name:'LED1',type:'led',color:'red',x:872,y:254,rotation:90,span:56,attachA:'bb:j:8',attachB:'bb:j:12'});
    wire(boardPin('PA5'),'bb:a:8');power('rail:R:-:1','GND');wire('rail:R:-:10','bb:h:12','#4e647b');
    if(kind==='button'){
      project.components.push({id:'b1',name:'SW1',type:'button',x:795,y:380,rotation:0,attachments:{a:'bb:e:18',b:'bb:f:18',c:'bb:e:20',d:'bb:f:20'}});
      wire(boardPin('PA10'),'bb:a:18','#8064d8');wire('bb:j:18','rail:R:-:16','#4e647b');
    }
  }
  if(['adc','samples','pwm'].includes(kind)){
    project.components.push(resistor('r1',kind==='pwm'?1000:10000,8));
    project.components.push(kind==='pwm'?{id:'demo',name:'C1',type:'capacitor',value:10,x:872,y:275,rotation:90,span:98,attachA:'bb:j:8',attachB:'bb:j:15'}:resistor('r2',10000,8,15));
    if(kind==='pwm'){wire(boardPin('PA5'),'bb:a:8');project.simulation={stepMs:.1,pwmWaveform:true};}
    else power('bb:a:8','3V3');
    power('bb:h:15','GND');wire(boardPin('PA0'),'bb:h:8','#8064d8');
  }
  if(['uart','i2c','spi','temperature','ultrasonic'].includes(kind)){
    const def=PART_DEFS[kind],part={id:'demo',name:def.prefix+'1',type:kind,x:kind==='ultrasonic'?848:844,y:kind==='temperature'?310:303,rotation:90,...def.defaults};
    applyMount(part,findMount(part));project.components.push(part);
    const terminal=n=>'part:demo:p'+n;
    power(terminal(1),kind==='ultrasonic'?'5V':'3V3');power(terminal(kind==='temperature'?3:kind==='ultrasonic'?4:2),'GND');
    if(kind==='uart'){wire(terminal(3),boardPin('PA3'),'#8064d8');wire(boardPin('PA2'),terminal(4));}
    if(kind==='i2c'){wire(boardPin('PB9'),terminal(3),'#8064d8');wire(boardPin('PB8'),terminal(4));}
    if(kind==='spi')for(const [n,pin]of [[3,'PB6'],[4,'PA5'],[5,'PA7'],[6,'PA6']])wire(boardPin(pin),terminal(n));
    if(kind==='temperature')wire(terminal(2),boardPin('PA0'),'#8064d8');
    if(kind==='ultrasonic'){
      wire(boardPin('PC7'),terminal(2));
      // Reduce the sensor's 5 V ECHO to approximately 3.3 V at the MCU input.
      project.components.push(resistor('r1',1000,24),resistor('r2',2000,24,30));
      wire(terminal(3),'bb:a:24','#8064d8');wire('bb:h:24',boardPin('PA9'),'#8064d8');power('bb:h:30','GND');
      project.simulation={stepMs:.1,pwmWaveform:false};
    }
  }
  return project;
}
