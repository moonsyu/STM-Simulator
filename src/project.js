// A project (circuit file): the empty projects a board starts with, and the check every project goes through when it
// is opened, pasted or changed. The code is in Rust (rust/stm-core/src/project.rs; feature 62): this file is what the
// JavaScript callers import. Each answer is a new object the caller may change.
import {rustExact} from './rust-core.js';

/** An empty project of an MCU family (the default family when none is given): a Renesas RA board starts as e² studio's
 *  FSP template, an STM32 project with the UART console (USART2 on PA2 / PA3) and a main.c that says hello once. */
export const blankProject=family=>rustExact('blank_project',family);
/** What an example circuit starts from: no UART console (an example sets its own pins; it is added when the example
 *  is opened as a project, hal-examples.js consoleExample), the main board and the built-in breadboard shown. */
export const exampleProject=()=>rustExact('example_project');
/**
 * ESP32 / Raspberry Pi boards are no longer supported (feature 49): a project saved with them opens without those
 * boards, the wires to their pins and the parts' legs plugged into their pins, and an ESP32 run target becomes the
 * simulator. `removed` (null when nothing was taken out; `data` is then the project as given) says what went, for the
 * notice when the project is opened.
 */
export function stripUnsupportedBoards(data){const answer=rustExact('strip_unsupported_boards',data);return answer.removed?answer:{data,removed:null};}
/** The notice for a project opened without its ESP32 / Raspberry Pi boards (stripUnsupportedBoards' `removed`). */
export const removedBoardsMessage=removed=>rustExact('removed_boards_message',removed);
/** A checked copy of a project (version 2, sources with \n line ends); throws with the reason it cannot be used. */
export const validateProject=data=>rustExact('validate_project',data);
/** An empty circuit on the start board (NUCLEO-F103RB); the board itself is added from the empty-circuit guide. */
export const startProject=()=>rustExact('start_project');
/** An empty project of a board (the default board when none is given), with the board shown. */
export const projectForBoard=id=>rustExact('project_for_board',id);
/** Whether a project is more than the empty project of its board (document contents, not the file-save flag). */
export const hasBoardChanges=project=>rustExact('has_board_changes',project);
