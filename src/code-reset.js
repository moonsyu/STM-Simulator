import {generateHal} from './mcu-config.js';
import {raHalEntry} from './ra-generator.js';
import {expandC} from './c-format.js';
import {validateProject} from './project.js';

export function resetMainCode(original){
 const project=structuredClone(original);
 // An FSP project (Renesas RA) goes back to e² studio's empty hal_entry() template.
 if(project.firmware?.mode==='fsp')project.code=raHalEntry();
 else if(project.firmware?.mode!=='hal')project.code='void setup() {\n}\n\nvoid loop() {\n}\n';
 else if(project.ide?.native?.target==='host')project.code='int main(void) {\n    return 0;\n}\n';
 else project.code=expandC(generateHal(project.mcu,{minimal:true}));
 // A later Docs apply starts from the selected device, not all previous examples.
 delete project.deviceDocs;
 if(project.ide?.breakpoints)project.ide.breakpoints=project.ide.breakpoints.filter(p=>p.file!=='main.c');
 return validateProject(project);
}
