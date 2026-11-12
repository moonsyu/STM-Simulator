import {generateHal} from './mcu-config.js';
import {stdioUart} from './hal-generator.js';
import {cFunctions} from './c-source-edit.js';
import {raHalEntry} from './ra-generator.js';
import {expandC} from './c-format.js';
import {validateProject} from './project.js';

export function resetMainCode(original){
 const project=structuredClone(original);
 // An FSP project (Renesas RA) goes back to e² studio's empty hal_entry() template.
 if(project.firmware?.mode==='fsp')project.code=raHalEntry();
 else if(project.firmware?.mode!=='hal')project.code='void setup() {\n}\n\nvoid loop() {\n}\n';
 else if(project.ide?.native?.target==='host')project.code='int main(void) {\n    return 0;\n}\n';
 else{
  let code=generateHal(project.mcu,{minimal:true});
  // The minimal code has no stdio functions; with USART2 on, the generated _write / _read are kept (printf / scanf go
  // to the ST-LINK virtual COM port, as in a new project).
  if(stdioUart(project.mcu)){const full=cFunctions(generateHal(project.mcu)).filter(f=>f.name==='_write'||f.name==='_read').map(f=>f.text).join('\n\n');const at=code.indexOf('/* USER CODE BEGIN 4 */');if(full&&at>=0)code=code.slice(0,at)+full+'\n\n'+code.slice(at);}
  project.code=expandC(code);
 }
 // A later Docs apply starts from the selected device, not all previous examples.
 delete project.deviceDocs;
 if(project.ide?.breakpoints)project.ide.breakpoints=project.ide.breakpoints.filter(p=>p.file!=='main.c');
 return validateProject(project);
}
