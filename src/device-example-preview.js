import {exampleStatements} from './device-inline-example.js';
import {recipeFor,primaryPart} from './device-docs-data.js';
import {remapCode} from './device-assistance.js';
import {cFunctions} from './c-source-edit.js';
import {generateHal} from './mcu-config.js';
import {indentC} from './device-code-insertion.js';

export function deviceDescriptionText(text,binding){
 return text.replace(/\b(?:P[A-H]\d+|TIM\d+|USART\d+|UART\d+|ADC\d+|I2C\d+|SPI\d+)\b/g,name=>binding?.pins[name]||binding?.peripherals[name]||name);
}

// Use the same pin/handle mapping as insertion, without allocating or changing a circuit.
export function deviceExamplePreview(project,type,{api='all',binding,part}={}){
 const sample=recipeFor(type),template=primaryPart(sample,type);
 if(template?.address!==undefined&&part?.address!==undefined)sample.code=sample.code.replace(new RegExp('0x'+template.address.toString(16)+'(?=\\s*<<\\s*1)','gi'),'0x'+part.address.toString(16));
 const example=exampleStatements(sample,api);
 if(!binding)return example.preview;
 if(api!=='all'&&!example.init.trim()&&!example.step.trim()){
  const config={...project.mcu,pins:Object.fromEntries(Object.values(binding.pins).filter(pin=>project.mcu.pins[pin]).map(pin=>[pin,project.mcu.pins[pin]])),peripherals:Object.fromEntries(Object.values(binding.peripherals).filter(id=>project.mcu.peripherals[id]).map(id=>[id,project.mcu.peripherals[id]]))};
  const setup=cFunctions(generateHal(config)).find(f=>f.name!=='main'&&new RegExp('\\b'+api+'\\s*\\(').test(f.body));
  if(setup)return indentC(setup.body);
 }
 return remapCode(example.preview,binding,sample);
}
