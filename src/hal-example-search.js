import {allHalExamples,allHalGuides,halExample} from './hal-examples.js';
import {CATALOG_BY_TYPE} from './catalog-defs.js';
const normalize=s=>String(s).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
let index;
export function searchHalExamples(query=''){
 const HAL_GUIDES=allHalGuides();index??=Object.entries(allHalExamples()).map(([id,name])=>{const ref=CATALOG_BY_TYPE[id],sample=halExample(id);return {id,name,native:sample.ide?.native?.target==='arm',text:normalize([id,name,HAL_GUIDES[id],ref?.pin_count+'핀',ref?.pins.join(' '),sample.code].join(' '))};});
 const words=query.trim().split(/\s+/).map(normalize).filter(Boolean);return index.filter(row=>words.every(word=>row.text.includes(word)));
}
