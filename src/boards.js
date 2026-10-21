export const DEFAULT_BOARD_ID='nucleo-f446re';
// `mcuFamily` selects the MCU profile in mcu-family.js; both boards are the MB1136 NUCLEO-64 layout.
export const BOARD_CATALOG=Object.freeze([
 Object.freeze({id:DEFAULT_BOARD_ID,name:'NUCLEO-F446RE',mcu:'STM32F446RE',mcuFamily:'STM32F446RE',family:'STM32F4',chip:'F4',core:'Cortex-M4',description:'Cortex-M4 · 180 MHz · 512 KB · 3.3 V · Arduino / Morpho'}),
 Object.freeze({id:'nucleo-f103rb',name:'NUCLEO-F103RB',mcu:'STM32F103RB',mcuFamily:'STM32F103RB',family:'STM32F1',chip:'F1',core:'Cortex-M3',description:'Cortex-M3 · 72 MHz · 128 KB · 3.3 V · Arduino / Morpho'})
]);
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
export const getBoard=id=>BOARD_CATALOG.find(board=>board.id===id);
/** The board of a project (projects saved before board selection are NUCLEO-F446RE). */
export const projectBoard=project=>getBoard(project?.boardId??DEFAULT_BOARD_ID);
export const boardForFamily=family=>BOARD_CATALOG.find(board=>board.mcuFamily===family);
export function searchBoards(query){const text=normalize(query);return BOARD_CATALOG.filter(board=>normalize([board.name,board.mcu,board.family,board.description].join(' ')).includes(text));}
