import {allHalExamples,halExample,halExampleFor,halGuideFor,SIMULATOR_ONLY_EXAMPLES} from './hal-examples.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {f1Unavailable} from './example-port.js';
const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
// Comments (USER CODE markers, the printf retarget note) would make every example match words like "uart".
const codeOnly=code=>code.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/.*$/gm,' ');
const BOARD_OF={STM32F103RB:'nucleo-f103rb'};
let index;const texts=new Map();
// The board's own reference example is listed (and searched) under the board in use.
const shownName=(name,family)=>family==='STM32F103RB'?name.replace('NUCLEO-F446RE','NUCLEO-F103RB'):name;
// Search text of an example on one board: its own (ported) code, pins and guide, built when first searched.
function textOf(row,family){
 const board=BOARD_OF[family]??'nucleo-f446re',key=board+':'+row.id;
 if(!texts.has(key)){const ref=CATALOG_BY_TYPE[row.id],sample=halExampleFor(row.id,board);texts.set(key,normalize([family==='STM32F103RB'?row.id.replace('f446re','f103rb'):row.id,shownName(row.name,family),halGuideFor(row.id,board),ref?.pin_count+'핀',ref?.pins.join(' '),codeOnly(sample.code)].join(' ')));}
 return texts.get(key);
}
/** Examples matching every word of the query; `family` 'STM32F103RB' leaves out those needing F4-only peripherals. */
export function searchHalExamples(query='',family){
 index??=Object.entries(allHalExamples()).map(([id,name])=>{const sample=halExample(id);return {id,name,native:sample.ide?.native?.target==='arm',simOnly:SIMULATOR_ONLY_EXAMPLES.has(id),f1:!f1Unavailable(sample).length};});
 const words=query.trim().split(/\s+/).map(normalize).filter(Boolean),rows=index.filter(row=>family!=='STM32F103RB'||row.f1);
 const found=words.length?rows.filter(row=>{const text=textOf(row,family);return words.every(word=>text.includes(word));}):rows;
 return family==='STM32F103RB'?found.map(row=>({...row,name:shownName(row.name,family)})):found;
}
