import {allHalExamples,allHalGuides,halExample,SIMULATOR_ONLY_EXAMPLES} from './hal-examples.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {f1Unavailable} from './example-port.js';
const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
let index;
/** Examples matching every word of the query; `family` 'STM32F103RB' leaves out those needing F4-only peripherals. */
export function searchHalExamples(query='',family){
 const HAL_GUIDES=allHalGuides();index??=Object.entries(allHalExamples()).map(([id,name])=>{const ref=CATALOG_BY_TYPE[id],sample=halExample(id);return {id,name,native:sample.ide?.native?.target==='arm',simOnly:SIMULATOR_ONLY_EXAMPLES.has(id),f1:!f1Unavailable(sample).length,text:normalize([id,name,HAL_GUIDES[id],ref?.pin_count+'핀',ref?.pins.join(' '),sample.code].join(' '))};});
 const words=query.trim().split(/\s+/).map(normalize).filter(Boolean);return index.filter(row=>(family!=='STM32F103RB'||row.f1)&&words.every(word=>row.text.includes(word)));
}
