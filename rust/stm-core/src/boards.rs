//! The boards a project can be for. `mcuFamily` selects the MCU profile: the STM32 families for the STM32 boards
//! (both the MB1136 NUCLEO-64 layout), `raconfig` for the Renesas RA boards (`vendor: "renesas"`, FSP projects,
//! emulator only).
//!
//! Moved here from `src/boards.js` (feature 62).

use crate::jsre::is_space;
use serde_json::{json, Value};

pub const DEFAULT_BOARD_ID: &str = "nucleo-f446re";
/// The board a new circuit or project starts with (first launch, 새 회로, the new-project dialog).
pub const START_BOARD_ID: &str = "nucleo-f103rb";

pub fn catalog() -> Value {
    json!([
        {"id": DEFAULT_BOARD_ID, "name": "NUCLEO-F446RE", "mcu": "STM32F446RE", "mcuFamily": "STM32F446RE", "family": "STM32F4", "chip": "F4", "core": "Cortex-M4",
            "description": "Cortex-M4 · 180 MHz · 512 KB · 3.3 V · Arduino / Morpho"},
        {"id": START_BOARD_ID, "name": "NUCLEO-F103RB", "mcu": "STM32F103RB", "mcuFamily": "STM32F103RB", "family": "STM32F1", "chip": "F1", "core": "Cortex-M3",
            "description": "Cortex-M3 · 72 MHz · 128 KB · 3.3 V · Arduino / Morpho"},
        {"id": "fpb-ra6e1", "name": "FPB-RA6E1", "mcu": "R7FA6E10F2CFP", "mcuFamily": "R7FA6E10F", "family": "RA6E1", "chip": "RA6E1", "core": "Cortex-M33", "vendor": "renesas",
            "description": "Renesas RA6E1 · Cortex-M33 · 200 MHz · 1 MB · 3.3 V · Arduino / Pmod"},
    ])
}
/// A text for comparing: lower case, without spaces, `_` and `-`. (The caller has already made it NFKC.)
fn plain(text: &str) -> String {
    text.to_lowercase()
        .chars()
        .filter(|c| !is_space(*c) && *c != '_' && *c != '-')
        .collect()
}
/// The ids of the boards whose name, MCU, family or description has the query in it.
pub fn search(query: &str) -> Vec<String> {
    let wanted = plain(query);
    catalog()
        .as_array()
        .into_iter()
        .flatten()
        .filter(|board| {
            let text = ["name", "mcu", "family", "description"]
                .map(|key| board[key].as_str().unwrap_or(""))
                .join(" ");
            plain(&text).contains(&wanted)
        })
        .filter_map(|board| board["id"].as_str().map(String::from))
        .collect()
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    Some(match name {
        "board_tables" => Ok(
            json!({"DEFAULT_BOARD_ID": DEFAULT_BOARD_ID, "START_BOARD_ID": START_BOARD_ID, "BOARD_CATALOG": catalog()}),
        ),
        "search_boards" => Ok(json!(search(
            args.first().and_then(Value::as_str).unwrap_or("")
        ))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn search_ignores_case_spaces_and_dashes() {
        assert_eq!(search("nucleo f1"), ["nucleo-f103rb"]);
        assert_eq!(search("RA_6E1"), ["fpb-ra6e1"]);
        assert_eq!(search("3.3V").len(), 3);
        assert_eq!(search("").len(), 3);
        assert!(search("esp32").is_empty());
    }
}
