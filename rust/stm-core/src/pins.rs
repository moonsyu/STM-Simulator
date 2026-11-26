//! The header pins of the boards and the holes of the breadboards, with where each is drawn.
//!
//! NUCLEO-64: MB1136, UM1724 Rev 17, Figure 24 / Tables 19 and 29. Solder bridges as delivered: A4/A5 on PC1/PC0,
//! and the open bridges of `OPEN_BRIDGES` (MB1136 C-04 schematic, sheets 3 and 5) — those header pins do not reach
//! the MCU: PA2/PA3 go only to the ST-LINK virtual COM port (SB62/SB63), PC14/PC15 to the 32.768 kHz crystal X2
//! (SB48/SB49), and PH0 (PD0 on the F103) takes the ST-LINK 8 MHz MCO (SB55). Such a pin keeps its label and is `NC`;
//! `mcu` names the MCU pin behind the open bridge. Changing bridges is not modeled.
//! FPB-RA6E1: R20UT4960EG0100 Table 7, Quick Start Guide Figure 2, drawn upright with the USB at the bottom on its
//! real 55 x 95 mm outline.
//!
//! Moved here from the tables of `src/pins.js` (feature 62). What changes while the app runs (the active board's pin
//! list, the lookups by a project's parts) stays on the JavaScript side.

use crate::geom::{matrix_of, vector};
use crate::mcu::number;
use crate::raconfig::{out, PORTS};
use serde_json::{json, Map, Value};

const ALIASES: [(&str, &str); 24] = [
    ("D0", "PA3"),
    ("D1", "PA2"),
    ("D2", "PA10"),
    ("D3", "PB3"),
    ("D4", "PB5"),
    ("D5", "PB4"),
    ("D6", "PB10"),
    ("D7", "PA8"),
    ("D8", "PA9"),
    ("D9", "PC7"),
    ("D10", "PB6"),
    ("D11", "PA7"),
    ("D12", "PA6"),
    ("D13", "PA5"),
    ("D14", "PB9"),
    ("D15", "PB8"),
    ("A0", "PA0"),
    ("A1", "PA1"),
    ("A2", "PA4"),
    ("A3", "PB0"),
    ("A4", "PC1"),
    ("A5", "PC0"),
    ("LED_BUILTIN", "PA5"),
    ("USER_BUTTON", "PC13"),
];
const OPEN_BRIDGES: [(&str, &str); 7] = [
    ("board:CN9:1", "SB62"),
    ("board:CN10:37", "SB62"),
    ("board:CN9:2", "SB63"),
    ("board:CN10:35", "SB63"),
    ("board:CN7:25", "SB49"),
    ("board:CN7:27", "SB48"),
    ("board:CN7:29", "SB55"),
];
// NUCLEO-F103RB uses the same MB1136 board; UM1724 table 29 lists CN7-29/31 as PD0/PD1 (no port H on the F103) and
// CN10-18 as PB11 (VCAP1 on the F446RE, left unconnected).
const F103_SIGNALS: [(&str, &str); 3] = [
    ("board:CN7:29", "PD0"),
    ("board:CN7:31", "PD1"),
    ("board:CN10:18", "PB11"),
];
const CN7_ODD: [&str; 19] = [
    "PC10", "PC12", "VDD", "BOOT0", "NC", "NC", "PA13", "PA14", "PA15", "GND", "PB7", "PC13",
    "PC14", "PC15", "PH0", "PH1", "VBAT", "PC2", "PC3",
];
const CN7_EVEN: [&str; 19] = [
    "PC11", "PD2", "E5V", "GND", "NC", "IOREF", "NRST", "3V3", "5V", "GND", "GND", "VIN", "NC",
    "PA0", "PA1", "PA4", "PB0", "PC1", "PC0",
];
const CN10_ODD: [&str; 19] = [
    "PC9", "PB8", "PB9", "AVDD", "GND", "PA5", "PA6", "PA7", "PB6", "PC7", "PA9", "PA8", "PB10",
    "PB4", "PB5", "PB3", "PA10", "PA2", "PA3",
];
const CN10_EVEN: [&str; 19] = [
    "PC8", "PC6", "PC5", "U5V", "NC", "PA12", "PA11", "PB12", "NC", "GND", "PB2", "PB1", "PB15",
    "PB14", "PB13", "AGND", "PC4", "NC", "NC",
];
const BOARD_X: f64 = 45.0;
const BOARD_Y: f64 = 48.0;
const MM: f64 = 14.0 / 2.54;
const LETTERS: [&str; 10] = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

/// (name, number, label, signal, x, y) of one header pin.
type Pin = (&'static str, i32, &'static str, &'static str, f64, f64);
fn alias(key: &str) -> &'static str {
    ALIASES
        .iter()
        .find(|(k, _)| *k == key)
        .map_or("", |(_, v)| v)
}
/// A header: `values` are (label, signal) from the first pin, `step` apart downwards from `y`.
fn header(
    pins: &mut Vec<Pin>,
    name: &'static str,
    values: &[(&'static str, &'static str)],
    x: f64,
    y: f64,
    numbering: impl Fn(i32) -> i32,
) {
    for (i, (label, signal)) in values.iter().enumerate() {
        pins.push((
            name,
            numbering(i as i32),
            label,
            signal,
            x,
            y + i as f64 * 14.0,
        ));
    }
}
fn same(labels: &[&'static str]) -> Vec<(&'static str, &'static str)> {
    labels.iter().map(|l| (*l, *l)).collect()
}
/// The MB1136 headers. Positions in mm from the board's top-left corner (UM1724 Figure 5), 2.54 mm pitch = 14 units:
/// ST morpho CN7 at 3.26/5.80 mm and CN10 at 64.22/66.76 mm, top row 31.74 mm; Arduino CN6/CN8 at 10.87 mm and
/// CN5/CN9 at 59.13 mm (48.26 mm apart), CN5 0.4 pitch below the morpho grid and 4.06 mm (160 mil) above CN9.
fn nucleo_headers() -> Vec<Pin> {
    let hx = |mm: f64| BOARD_X + mm * MM;
    let top = BOARD_Y + 31.74 * MM;
    let mut pins = Vec::new();
    header(&mut pins, "CN7", &same(&CN7_ODD), hx(3.26), top, |i| {
        2 * i + 1
    });
    header(&mut pins, "CN7", &same(&CN7_EVEN), hx(5.80), top, |i| {
        2 * i + 2
    });
    header(&mut pins, "CN10", &same(&CN10_ODD), hx(64.22), top, |i| {
        2 * i + 1
    });
    header(&mut pins, "CN10", &same(&CN10_EVEN), hx(66.76), top, |i| {
        2 * i + 2
    });
    header(
        &mut pins,
        "CN6",
        &[
            ("NC", "NC"),
            ("IOREF", "IOREF"),
            ("RESET", "NRST"),
            ("3V3", "3V3"),
            ("5V", "5V"),
            ("GND", "GND"),
            ("GND", "GND"),
            ("VIN", "VIN"),
        ],
        hx(10.87),
        top + 4.0 * 14.0,
        |i| i + 1,
    );
    let analog: Vec<(&str, &str)> = ["A0", "A1", "A2", "A3", "A4", "A5"]
        .iter()
        .map(|k| (*k, alias(k)))
        .collect();
    header(
        &mut pins,
        "CN8",
        &analog,
        hx(10.87),
        top + 13.0 * 14.0,
        |i| i + 1,
    );
    let mut cn5 = vec![
        ("D15", "PB8"),
        ("D14", "PB9"),
        ("AREF", "AVDD"),
        ("GND", "GND"),
    ];
    cn5.extend(
        ["D13", "D12", "D11", "D10", "D9", "D8"]
            .iter()
            .map(|k| (*k, alias(k))),
    );
    header(&mut pins, "CN5", &cn5, hx(59.13), top + 0.4 * 14.0, |i| {
        10 - i
    });
    let cn9: Vec<(&str, &str)> = ["D7", "D6", "D5", "D4", "D3", "D2", "D1", "D0"]
        .iter()
        .map(|k| (*k, alias(k)))
        .collect();
    header(&mut pins, "CN9", &cn9, hx(59.13), top + 11.0 * 14.0, |i| {
        8 - i
    });
    pins
}
fn pin_json(pin: &Pin, over: &[(&str, &str)]) -> Value {
    let id = format!("board:{}:{}", pin.0, pin.1);
    let renamed = over.iter().find(|(k, _)| *k == id).map(|(_, v)| *v);
    let (label, signal) = (renamed.unwrap_or(pin.2), renamed.unwrap_or(pin.3));
    let mut p = Map::new();
    p.insert("id".into(), json!(id));
    p.insert("header".into(), json!(pin.0));
    p.insert("number".into(), json!(pin.1));
    p.insert("label".into(), json!(label));
    p.insert("signal".into(), json!(signal));
    p.insert("x".into(), number(pin.4));
    p.insert("y".into(), number(pin.5));
    if let Some((_, bridge)) = OPEN_BRIDGES.iter().find(|(k, _)| *k == id) {
        p.insert("signal".into(), json!("NC"));
        p.insert("mcu".into(), json!(signal));
        p.insert("bridge".into(), json!(bridge));
    }
    Value::Object(p)
}
/// Power J2 and analog J6 on the left, digital J5 (D0-D7) and J1 (D8-D15) on the right, at the Arduino Uno R3 spacing
/// (rows 48.26 mm apart, 160 mil between D7 and D8). Positions are mm from the board's top-left corner.
fn fpb_pins() -> Vec<Value> {
    let (p, left, d0) = (2.54, 3.3, 63.2);
    let right = left + 48.26;
    let mut pins = Vec::new();
    let mut add = |name: &str, x: f64, number: usize, label: &str, signal: &str, y: f64| {
        pins.push(json!({"id": format!("board:{name}:{number}"), "header": name, "number": number, "label": label, "signal": signal, "x": number_of(BOARD_X + x * MM), "y": number_of(BOARD_Y + y * MM)}));
    };
    for (i, (label, signal)) in [
        ("NC", "NC"),
        ("IOREF", "3V3"),
        ("RESET", "P014"),
        ("3V3", "3V3"),
        ("5V", "5V"),
        ("GND", "GND"),
        ("GND", "GND"),
        ("VIN", "NC"),
    ]
    .iter()
    .enumerate()
    {
        add(
            "J2",
            left,
            i + 1,
            label,
            signal,
            d0 - 2.0 * p - p * (7.0 - i as f64),
        );
    }
    for (i, (label, signal)) in [
        ("A0", "P000"),
        ("A1", "P001"),
        ("A2", "P002"),
        ("A3", "P003"),
        ("A4", "P004"),
        ("A5", "P008"),
    ]
    .iter()
    .enumerate()
    {
        add("J6", left, i + 1, label, signal, d0 - p * (5.0 - i as f64));
    }
    for (i, (label, signal)) in [
        ("D0", "P110"),
        ("D1", "P109"),
        ("D2", "P409"),
        ("D3", "P104"),
        ("D4", "P107"),
        ("D5", "P105"),
        ("D6", "P303"),
        ("D7", "P113"),
    ]
    .iter()
    .enumerate()
    {
        add("J5", right, i + 1, label, signal, d0 - p * i as f64);
    }
    for (i, (label, signal)) in [
        ("D8", "P402"),
        ("D9", "P302"),
        ("D10", "P103"),
        ("D11", "P101"),
        ("D12", "P100"),
        ("D13", "P102"),
        ("GND", "GND"),
        ("AREF", "AREF"),
        ("D14", "P401"),
        ("D15", "P400"),
    ]
    .iter()
    .enumerate()
    {
        add(
            "J1",
            right,
            i + 1,
            label,
            signal,
            d0 - 7.0 * p - 4.064 - p * i as f64,
        );
    }
    pins
}
fn number_of(v: f64) -> Value {
    number(v)
}
/// MCU pins of a pin list, including those behind an open solder bridge (the program still uses PA2/PA3 for the VCP).
fn gpio_of(pins: &[Value]) -> Vec<String> {
    let is_gpio = |s: &str| {
        let b = s.as_bytes();
        let stm = b.len() >= 3
            && b[0] == b'P'
            && (b'A'..=b'H').contains(&b[1])
            && b[2..].iter().all(u8::is_ascii_digit);
        let ra = b.len() == 4 && b[0] == b'P' && b[1..].iter().all(u8::is_ascii_digit);
        stm || ra
    };
    let mut names: Vec<String> = Vec::new();
    for p in pins {
        let name = p
            .get("mcu")
            .or_else(|| p.get("signal"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if is_gpio(name) && !names.iter().any(|n| n == name) {
            names.push(name.to_string());
        }
    }
    names.sort();
    names
}
const BB_X: f64 = 644.5;
const BB_START_Y: f64 = 128.0;
fn hole(id: String, label: String, x: f64, y: f64, bus: String) -> Value {
    json!({"id": id, "label": label, "x": number(x), "y": number(y), "bus": bus})
}
/// The 400-point board: 30 rows of two 5-hole strips, and a + and a − rail on each side (each rail one continuous
/// conductor, despite gaps in the holes).
fn half_holes() -> Vec<Value> {
    let mut holes = Vec::new();
    for row in 1..=30 {
        for (c, letter) in LETTERS.iter().enumerate() {
            let x = BB_X + 73.5 + c as f64 * 14.0 + if c >= 5 { 28.0 } else { 0.0 };
            holes.push(hole(
                format!("bb:{letter}:{row}"),
                format!("{}{row}", letter.to_uppercase()),
                x,
                BB_START_Y + f64::from(row - 1) * 14.0,
                format!("bb:{}:{row}", if c < 5 { "L" } else { "R" }),
            ));
        }
    }
    for side in ["L", "R"] {
        for sign in ["+", "-"] {
            for n in 1..=25 {
                let x = BB_X
                    + if side == "L" { 19.5 } else { 267.5 }
                    + if sign == "-" { 14.0 } else { 0.0 };
                let y = BB_START_Y + f64::from(n - 1) * 14.0 + f64::from((n - 1) / 5) * 14.0;
                holes.push(hole(
                    format!("rail:{side}:{sign}:{n}"),
                    format!(
                        "{} {sign} 전원 레일 {n}",
                        if side == "L" { "왼쪽" } else { "오른쪽" }
                    ),
                    x,
                    y,
                    format!("rail:{side}:{sign}"),
                ));
            }
        }
    }
    holes
}
/// The 830-point board: columns 1-63 are vertical strips (a-e top block, f-j bottom block); each of the four rail
/// lines (top/bottom, +/-) is one continuous conductor of 50 holes in groups of 5.
fn full_holes() -> Vec<Value> {
    let mut holes = Vec::new();
    for col in 1..=63 {
        for (c, letter) in LETTERS.iter().enumerate() {
            let top = c < 5;
            let y = if top { 76.5 } else { 174.5 } + (c % 5) as f64 * 14.0;
            holes.push(hole(
                format!("bb:{letter}:{col}"),
                format!("{}{col}", letter.to_uppercase()),
                21.0 + f64::from(col - 1) * 14.0,
                y,
                format!("bb:{}:{col}", if top { "T" } else { "B" }),
            ));
        }
    }
    for (side, rails) in [("T", [22.5, 36.5]), ("B", [264.5, 278.5])] {
        for (i, sign) in ["+", "-"].iter().enumerate() {
            for n in 1..=50 {
                let column = 3 + (n - 1) + (n - 1) / 5;
                holes.push(hole(
                    format!("rail:{side}:{sign}:{n}"),
                    format!(
                        "{} {sign} 전원 레일 {n}",
                        if side == "T" { "위쪽" } else { "아래쪽" }
                    ),
                    21.0 + f64::from(column - 1) * 14.0,
                    rails[i],
                    format!("rail:{side}:{sign}"),
                ));
            }
        }
    }
    holes
}
/// Every table of the module, by the name `src/pins.js` uses it under.
pub fn tables() -> Value {
    let headers = nucleo_headers();
    let nucleo: Vec<Value> = headers.iter().map(|p| pin_json(p, &[])).collect();
    let f103: Vec<Value> = headers.iter().map(|p| pin_json(p, &F103_SIGNALS)).collect();
    let gpio = gpio_of(&nucleo);
    let mut all_gpio: Vec<String> = gpio.clone();
    for name in F103_SIGNALS.iter().map(|(_, v)| *v).chain(PORTS) {
        if !all_gpio.iter().any(|n| n == name) {
            all_gpio.push(name.to_string());
        }
    }
    all_gpio.sort();
    json!({
        "ALIASES": Value::Object(ALIASES.iter().map(|(k, v)| ((*k).to_string(), json!(v))).collect()),
        "OPEN_BRIDGES": Value::Object(OPEN_BRIDGES.iter().map(|(k, v)| ((*k).to_string(), json!(v))).collect()),
        "NUCLEO_PINS": nucleo,
        "FPB_PINS": fpb_pins(),
        "BOARD_PINS": {"nucleo-f103rb": f103},
        "BOARD_SIZES": {"fpb-ra6e1": {"w": number(55.0 * MM), "h": number(95.0 * MM)}},
        "GPIO_PINS": gpio,
        "GPIO_BY_BOARD": {"nucleo-f103rb": gpio_of(&f103), "fpb-ra6e1": gpio_of(&fpb_pins())},
        "ALL_GPIO_PINS": all_gpio,
        "HOLES": half_holes(),
        "FULL_HOLES": full_holes(),
    })
}
/// Where the holes of a breadboard part are in the workspace, as x, y pairs in the order of its hole table: the
/// part's own frame is centred on the board and turned, scaled and skewed with the part.
#[allow(clippy::too_many_arguments)]
pub fn breadboard_places(
    full: bool,
    x: f64,
    y: f64,
    rotation: f64,
    scale_x: f64,
    scale_y: f64,
    skew_x: f64,
) -> Value {
    let (holes, centre) = if full {
        (full_holes(), (0.0 + 910.0 / 2.0, 0.0 + 301.0 / 2.0))
    } else {
        (half_holes(), (BB_X + 301.0 / 2.0, 99.5 + 463.0 / 2.0))
    };
    let m = matrix_of(rotation, scale_x, scale_y, skew_x);
    let mut flat = Vec::with_capacity(holes.len() * 2);
    for h in &holes {
        let q = vector(
            m,
            h["x"].as_f64().unwrap_or(f64::NAN) - centre.0,
            h["y"].as_f64().unwrap_or(f64::NAN) - centre.1,
        );
        flat.push(out(x + q.0));
        flat.push(out(y + q.1));
    }
    Value::Array(flat)
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let n = |i: usize| crate::raconfig::to_num(args.get(i));
    Some(match name {
        "pin_tables" => Ok(tables()),
        "breadboard_places" => Ok(breadboard_places(
            args.first().is_some_and(crate::raconfig::truthy),
            n(1),
            n(2),
            n(3),
            n(4),
            n(5),
            n(6),
        )),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_and_holes() {
        let t = tables();
        assert_eq!(
            t["NUCLEO_PINS"].as_array().unwrap().len(),
            76 + 8 + 6 + 10 + 8
        );
        let d1 = t["NUCLEO_PINS"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == "board:CN9:2")
            .unwrap();
        assert_eq!(
            (
                d1["label"].as_str(),
                d1["signal"].as_str(),
                d1["mcu"].as_str(),
                d1["bridge"].as_str()
            ),
            (Some("D1"), Some("NC"), Some("PA2"), Some("SB63"))
        );
        let pd0 = t["BOARD_PINS"]["nucleo-f103rb"]
            .as_array()
            .unwrap()
            .iter()
            .find(|p| p["id"] == "board:CN7:29")
            .unwrap();
        assert_eq!(
            (pd0["label"].as_str(), pd0["mcu"].as_str()),
            (Some("PD0"), Some("PD0"))
        );
        assert_eq!(t["FPB_PINS"].as_array().unwrap().len(), 32);
        assert_eq!(t["HOLES"].as_array().unwrap().len(), 400);
        assert_eq!(t["FULL_HOLES"].as_array().unwrap().len(), 830);
        assert!(t["GPIO_PINS"]
            .as_array()
            .unwrap()
            .iter()
            .any(|p| p == "PA2"));
        assert_eq!(
            breadboard_places(false, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0)
                .as_array()
                .unwrap()
                .len(),
            800
        );
    }
}
