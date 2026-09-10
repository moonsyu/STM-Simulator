export const DEFAULT_BOARD_ID='nucleo-f446re';
export const BOARD_CATALOG=Object.freeze([
 Object.freeze({id:DEFAULT_BOARD_ID,name:'NUCLEO-F446RE',mcu:'STM32F446RE',family:'STM32F4',description:'Cortex-M4 · 3.3 V · Arduino / Morpho'})
]);
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
export const getBoard=id=>BOARD_CATALOG.find(board=>board.id===id);
export function searchBoards(query){const text=normalize(query);return BOARD_CATALOG.filter(board=>normalize([board.name,board.mcu,board.family,board.description].join(' ')).includes(text));}
