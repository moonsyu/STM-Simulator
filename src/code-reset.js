import {generateHal} from './mcu-config.js';
import {validateProject} from './project.js';

export function resetMainCode(original){
 const project=structuredClone(original);
 if(project.firmware?.mode!=='hal')project.code='void setup() {\n}\n\nvoid loop() {\n    delay(10);\n}\n';
 else if(project.ide?.native?.target==='host')project.code='#include <stdio.h>\n\nint main(void) {\n    return 0;\n}\n';
 else project.code=generateHal(project.mcu)
  .replace(/(\/\* USER CODE BEGIN 2 \*\/)[\s\S]*?(\/\* USER CODE END 2 \*\/)/,'$1\n  $2')
  .replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,'$1\n    HAL_Delay(10);\n    $2');
 // A later Docs apply starts from the selected device, not all previous examples.
 delete project.deviceDocs;
 if(project.ide?.breakpoints)project.ide.breakpoints=project.ide.breakpoints.filter(p=>p.file!=='main.c');
 return validateProject(project);
}
