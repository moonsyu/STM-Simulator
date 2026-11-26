// Name, datasheet model, maker and package size of each catalog part
// (size: width × height of the part seen from above, d: height off the board, in mm; confidence 'typical' is the
// usual size of the series where the datasheet research found none).
// The workspace draws 1 mm as 14/2.54 units, the breadboard pitch, so every part keeps its real size next to the breadboard.
// The data is rust/stm-core/src/data/part_datasheets.json (feature 62).
import {CATALOG_TABLES} from './catalog-tables.js';
export const {UNITS_PER_MM,PART_DATASHEETS}=CATALOG_TABLES;
export function datasheetLine(id){return PART_DATASHEETS[id]?.model||'';}
