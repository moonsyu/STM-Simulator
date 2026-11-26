// The boards a project can be for. `mcuFamily` selects the MCU profile: mcu-family.js for the STM32 boards (both the
// MB1136 NUCLEO-64 layout), ra-config.js for the Renesas RA boards (`vendor: 'renesas'`, FSP projects, emulator only).
// The table and the search are in Rust (rust/stm-core/src/boards.rs, feature 62); this file is the JavaScript side.
import {rustTable,rustFn} from './rust-core.js';

/** DEFAULT_BOARD_ID: the board of projects saved before board selection. START_BOARD_ID: the board a new circuit or
 *  project starts with (first launch, 새 회로, the new-project dialog). */
export const {DEFAULT_BOARD_ID,START_BOARD_ID,BOARD_CATALOG}=rustTable('board_tables');
export const getBoard=id=>BOARD_CATALOG.find(board=>board.id===id);
/** The board of a project (projects saved before board selection are NUCLEO-F446RE). */
export const projectBoard=project=>getBoard(project?.boardId??DEFAULT_BOARD_ID);
export const boardForFamily=family=>BOARD_CATALOG.find(board=>board.mcuFamily===family);
export function searchBoards(query){const ids=rustFn('search_boards',String(query).normalize('NFKC'));return BOARD_CATALOG.filter(board=>ids.includes(board.id));}
