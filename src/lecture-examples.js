import {devboardModel} from './devboards.js';
import {validateProject} from './project.js';
import {consoleExample} from './hal-examples.js';
import {WIRELESS_EXAMPLES} from './wireless-examples.js';
import {reindentC} from './c-format.js';

// Examples listed next to the HAL examples under their own ids (`lecture:<id>`): the board-to-board communication
// examples of wireless-examples.js, two STM32 boards over Bluetooth, Wi-Fi, I²C or SPI.
// `code` / `ref` stay for search and the guide line; the list shows the title only.
export const LECTURE_EXAMPLES=Object.freeze([
 ...WIRELESS_EXAMPLES
]);
export const lectureExample=id=>LECTURE_EXAMPLES.find(e=>e.id===id);
/** Example list values of lecture examples (`lecture:<id>`), next to the HAL example ids. */
export const LECTURE_PREFIX='lecture:';
export function lectureGuide(id){
 const e=lectureExample(id);if(!e)return '';return `보드 간 통신 · ${e.ref} · ${e.how}`;
}
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s_·—-]+/g,'');
const BOARD_WORDS={stm32:'stm32 nucleo'};
export function searchLectureExamples(query){const q=normalize(query);return LECTURE_EXAMPLES.filter(e=>!q||normalize([e.code,e.title,e.ref,e.kind,'강의',...e.boards.map(b=>BOARD_WORDS[b])].join(' ')).includes(q));}
/** The lecture example as a new project (the editor opens main.c). */
// The C of an example (STM32 main.c and sources) is indented by 4 spaces like the HAL examples.
function indentExampleCode(project){
 const c=text=>typeof text==='string'?reindentC(text):text;
 project.code=c(project.code);for(const f of project.firmware?.files||[])if(/\.(c|h|cpp)$/i.test(f.name))f.text=c(f.text);
 for(const part of project.components.filter(p=>p.type==='devboard')){
  part.code=c(part.code);for(const f of part.firmware?.files||[])if(/\.(c|h|cpp)$/i.test(f.name))f.text=c(f.text);
 }
 return project;
}
export function applyLectureExample(id){
 const example=lectureExample(id);if(!example)throw new Error('강의 예제를 찾을 수 없습니다.');
 const project=indentExampleCode(validateProject(example.build()));
 // The STM32 programs print on USART2 (the ST-LINK virtual COM port) where it is free, as the HAL examples do.
 if(!project.surfaces?.board?.hidden)consoleExample(project);
 for(const part of project.components)if(part.type==='devboard'&&devboardModel(part)?.kind==='stm32'&&part.firmware?.mode==='hal'&&part.mcu){const view=consoleExample({firmware:part.firmware,mcu:part.mcu,code:part.code});part.mcu=view.mcu;part.code=view.code;}
 return {project,file:'main.c'};
}
