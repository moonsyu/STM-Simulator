import {blankProject,validateProject} from './project.js';
import {projectBoard} from './boards.js';
import {resetMainCode} from './code-reset.js';

// The pin and peripheral defaults are those of the project's own board (an F103RB project resets to F1 settings).
// main.c is reset too, to the code generated from those defaults (as a new project starts); the other source files
// the user added are kept.
export function resetBoardConfiguration(original){
 const project=structuredClone(original),empty=blankProject(projectBoard(original).mcuFamily);
 project.components=[];
 project.wires=[];
 project.surfaces=empty.surfaces;
 project.mcu=empty.mcu;
 delete project.deviceDocs;
 return resetMainCode(validateProject(project));
}
