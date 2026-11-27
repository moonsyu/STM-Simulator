// The board's settings back to how a new project starts. The code is in Rust (rust/stm-core/src/ptools.rs; feature 62).
import {rustExact} from './rust-core.js';

// The pin and peripheral defaults are those of the project's own board (an F103RB project resets to F1 settings).
// main.c is reset too, to the code generated from those defaults (as a new project starts); the other source files
// the user added are kept.
export const resetBoardConfiguration=original=>rustExact('reset_board_configuration',original);
