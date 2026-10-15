import {DEVICE_CATALOG} from './device-catalog-data.js';
import {CATALOG_BY_TYPE,CATALOG_DEFS,catalogMap,catalogType,CATALOG_SCOPE} from './catalog-defs.js';
import {attachments,assignAttachments} from './components.js';
import {cFunctions} from './c-source-edit.js';
import {boardPin} from './pins.js';
import {blankProject} from './project.js';
import {defaultMcu,generateHal,validateMcu} from './mcu-config.js';
import {protocolExample} from './catalog-protocol-examples.js';
export const CATALOG_EXAMPLES=Object.fromEntries(DEVICE_CATALOG.map(v=>[catalogType(v.id),'HAL · '+v.name]));
export const CATALOG_GUIDES=Object.fromEntries(DEVICE_CATALOG.map(v=>[catalogType(v.id),v.interface+' · '+v.pins.join(' / ')+' · '+v.appearance+' '+(CATALOG_SCOPE[v.id]||'')]));
const familyRecipe={uart:'uart_external',board:'blink',breadboard:'blink',resistor:'adc',led:'blink',button:'button',capacitor:'pwm',dc_motor:'l298n',dc_supply:'l298n'};
export function catalogExample(type,baseFactory){
 const v=CATALOG_BY_TYPE[type]||DEVICE_CATALOG.find(v=>catalogType(v.id)===type),map=catalogMap(type);
 if(!v)throw new Error('장치 모델을 찾을 수 없습니다.');
 if(!map&&!['board','breadboard'].includes(v.family))return protocolExample(v);
 const p=baseFactory(familyRecipe[v.family]||v.family);p.name=CATALOG_EXAMPLES[type];
 if(['board','breadboard'].includes(v.family))return p;
 const part=p.components.find(c=>c.type===v.family);if(!part)throw new Error('예제의 주 장치가 없습니다: '+v.name);
 const old=part.id,mounts=attachments(part);part.type=type;part.name=v.name;for(const [key,value]of Object.entries(CATALOG_DEFS[type].defaults))if(part[key]===undefined)part[key]=value;
 assignAttachments(part,Object.fromEntries(Object.entries(mounts).map(([key,hole])=>[map[key],hole])));
 const endpoint=id=>{const [head,idPart,key]=id.split(':');return head==='part'&&idPart===old?'part:'+old+':'+map[key]:id;};
 p.wires=p.wires.map(w=>({...w,from:endpoint(w.from),to:endpoint(w.to)}));
 const tie=(n,signal)=>p.wires.push({id:'catalogTie'+n,from:`part:${old}:p${n}`,to:boardPin(signal),color:signal==='GND'?'#4e647b':'#dd654c'});
 const ties={ 'sht31-breakout-7':{5:'GND',6:'3V3'},'mpu6050-8':{7:'GND'},'st7735-8':{8:'3V3'},'i2c-eeprom-8':{7:'GND'},'i2c-eeprom-5':{5:'GND'},'spi-eeprom-8':{3:'3V3',7:'3V3'},'l298n-bare-15':{1:'GND',15:'GND'},'l298p-bare-20':{2:'GND',10:'GND',11:'GND',20:'GND',19:'GND'},'button-module-3':{2:'3V3'}};
 for(const [n,signal]of Object.entries(ties[v.id]||{}))tie(n,signal);
 if(v.id==='servo-feedback-4'){
  p.mcu.pins.PA0={function:'ADC1_IN0',pull:'NOPULL',initial:0,label:'Feedback',edge:'CHANGE'};p.mcu.peripherals.ADC1={enabled:true};tie(4,'PA0');
  const source=generateHal(validateMcu(p.mcu)),start=source.indexOf('static void MX_ADC1_Init(void)\n{');
  p.code=p.code.replace('int main(void)','ADC_HandleTypeDef hadc1;\n'+cFunctions(source).find(f=>f.name==='MX_ADC1_Init').text+'\nint main(void)').replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n MX_ADC1_Init();').replace('/* USER CODE BEGIN 3 */','/* USER CODE BEGIN 3 */\n HAL_ADC_Start(&hadc1); if(HAL_ADC_PollForConversion(&hadc1,10)==HAL_OK) printf("Feedback=%.2f V\\n",HAL_ADC_GetValue(&hadc1)*3.3/4095.0);');
 }
 if(v.id==='spi-eeprom-8'){
  p.code=p.code.replace('uint8_t tx[3]', 'uint8_t enable[1]={6};\n  HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_RESET); HAL_SPI_Transmit(&hspi1,enable,1,100); HAL_GPIO_WritePin(GPIOB,GPIO_PIN_6,GPIO_PIN_SET);\n  uint8_t tx[3]');
  p.code=p.code.replace('HAL_SPI_Transmit(&hspi1, readCmd, 2, 100);','HAL_SPI_Transmit(&hspi1, readCmd, 2, 100);');
  p.code=p.code.replace('HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);','HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_SET);\n  HAL_Delay(5);\n  HAL_GPIO_WritePin(GPIOB, GPIO_PIN_6, GPIO_PIN_RESET);');
 }
 if(v.id==='uart-cable-4')for(const w of p.wires)if(w.to===`part:${old}:p1`)w.from=boardPin('5V');
 if(v.id.includes('common-anode')){
  const common=v.family==='rgb'?'p2':'p3';for(const w of p.wires)if(w.from===`part:${old}:${common}`&&w.to===boardPin('GND'))w.to=boardPin('3V3');else if(w.to===`part:${old}:${common}`&&w.from===boardPin('GND'))w.from=boardPin('3V3');
  if(v.family==='sevenseg')for(const w of p.wires)if(w.to===`part:${old}:p8`&&w.from===boardPin('GND'))w.from=boardPin('3V3');
  p.code=p.code.replace(/GPIO_PIN_SET|GPIO_PIN_RESET/g,t=>t==='GPIO_PIN_SET'?'GPIO_PIN_RESET':'GPIO_PIN_SET');
 }
 p.code='// '+v.name+'\n// '+v.pins.map((pin,i)=>`${i+1}: ${pin}`).join(', ')+'\n'+p.code;
 return p;
}
export function makeCatalogProject(v){
 const p=blankProject(),type=catalogType(v.id),def=CATALOG_DEFS[type];p.name=CATALOG_EXAMPLES[type];p.mcu={...defaultMcu(),pins:{},peripherals:{},nvic:{}};p.components=[{id:'demo',type,name:v.name,x:790,y:340,rotation:0,...def.defaults}];p.simulation={stepMs:1,pwmWaveform:false};
 const pin=(signal,fn='GPIO_Output',pull='NOPULL',initial=0)=>p.mcu.pins[signal]={function:fn,pull,initial,label:'',edge:'CHANGE'};
 const connect=(n,signal)=>{if(!n)return;p.wires.push({id:'w'+(p.wires.length+1),from:boardPin(signal),to:'part:demo:p'+n,color:signal==='GND'?'#4e647b':'#23a68a'});};
 const find=label=>v.pins.indexOf(label)+1;
 const power=(vcc,gnd,voltage='3V3')=>{connect(vcc,voltage);connect(gnd,'GND');};
 const i2c=(sda,scl)=>{pin('PB9','I2C1_SDA');pin('PB8','I2C1_SCL');p.mcu.peripherals.I2C1={enabled:true,clock:100000};connect(sda,'PB9');connect(scl,'PB8');};
 const spi=(mosi,clk,cs,miso)=>{pin('PA7','SPI1_MOSI');pin('PA5','SPI1_SCK');pin('PA6','SPI1_MISO');pin('PB6','GPIO_Output','NOPULL',1);p.mcu.peripherals.SPI1={enabled:true,clock:1000000};connect(mosi,'PA7');connect(clk,'PA5');connect(cs,'PB6');connect(miso,'PA6');};
 const adc=(n,signal='PA0',channel=0)=>{pin(signal,'ADC1_IN'+channel);p.mcu.peripherals.ADC1={enabled:true};connect(n,signal);};
 const finish=(init,step,helpers='',globals='')=>{p.mcu=validateMcu(p.mcu);p.code=generateHal(p.mcu).replace('int main(void)',globals+'\n'+helpers+'\nint main(void)').replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n'+init).replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,(_,a,b)=>a+'\n'+step+'\n'+b);return p;};
 return {p,pin,connect,find,power,i2c,spi,adc,finish};
}
