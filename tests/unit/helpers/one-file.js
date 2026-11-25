// A blank STM32 project with main.c generated as one file — the form a new project had before feature 51 and the form
// of a project whose "주변장치별 .c/.h로 생성" box is off. Made the way the app makes it: the box unticked in a new project
// and the code generated again (pinout-ui.js plan()).
import {blankProject} from '../../../src/project.js';
import {generateHal,validateMcu} from '../../../src/mcu-config.js';
import {expandC} from '../../../src/c-format.js';
import {regenerateMain} from '../../../src/c-source-edit.js';
import {generatorTexts} from '../../../src/project-overrides.js';

export function oneFileBlank(family){
 const p=blankProject(family),{coupleFiles:_on,...rest}=p.mcu,mcu=validateMcu(rest);
 const code=regenerateMain(p.code,expandC(generateHal(mcu)),expandC(generateHal(p.mcu)),[],generatorTexts(p.mcu,mcu)).code;
 return {...p,mcu,code};
}
/** The generator's one-file main.c for these settings, whatever their "주변장치별 .c/.h" option says. */
export const oneFileHal=(mcu,...rest)=>generateHal({...mcu,coupleFiles:false},...rest);
