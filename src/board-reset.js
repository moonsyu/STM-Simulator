import {blankProject,validateProject} from './project.js';

export function resetBoardConfiguration(original){
 const project=structuredClone(original),empty=blankProject();
 project.components=[];
 project.wires=[];
 project.surfaces=empty.surfaces;
 project.mcu=empty.mcu;
 delete project.deviceDocs;
 return validateProject(project);
}
