//! The parts a circuit can hold and where their terminals are: geometry shared by rendering, hit testing, mounting
//! and project validation.
//!
//! Moved here from `src/components.js` (feature 62). The basic parts' own definitions are `data/basic_parts.json`.

use crate::catalog::{self, catalog_type, is_wired_contact};
use crate::devdefs;
use crate::jsmath::{cos, sin, tan};
use crate::mcu::js_display;
use crate::raconfig::{out, to_num, without_undefined};
use serde_json::{json, Map, Value};
use std::f64::consts::PI;
use std::sync::LazyLock;

static BASIC: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("data/basic_parts.json")).expect("basic_parts.json")
});
/// Every part definition: the catalog's, the modules', the L298N set's and the basic parts' own.
static PART_DEFS: LazyLock<Value> = LazyLock::new(|| {
    let mut all = Map::new();
    for table in [
        &catalog::all()["CATALOG_DEFS"],
        &devdefs::tables()["DEVICE_DEFS"],
        &catalog::all()["L298_DEFS"],
        &BASIC["BASIC_PARTS"],
    ] {
        for (k, v) in table.as_object().into_iter().flatten() {
            all.insert(k.clone(), v.clone());
        }
    }
    Value::Object(all)
});
// Lead spacing of the small two-lead parts: legs bent close to the body as on a real breadboard. Radial parts (LED,
// LDR, NTC, capacitors, 2-pin button) stand on legs two holes apart (lead, free hole, lead: three holes); axial
// resistors and diodes and the 12 mm buzzers take three pitches (four holes). A DC motor stands on the two tabs at
// its end (four pitches apart); a battery holder keeps its own spacing.
const LEAD_SPANS: [(&str, u32); 10] = [
    ("led", 28),
    ("ldr", 28),
    ("ntc", 28),
    ("capacitor", 28),
    ("button", 28),
    ("resistor", 42),
    ("diode", 42),
    ("buzzer", 42),
    ("passive_buzzer", 42),
    ("dc_motor", 56),
];
const BASIC_TWO_PIN: [&str; 10] = [
    "resistor",
    "led",
    "capacitor",
    "diode",
    "buzzer",
    "passive_buzzer",
    "ldr",
    "ntc",
    "dc_motor",
    "dc_supply",
];
const BASIC_MULTI_PIN: [&str; 12] = [
    "l298n",
    "button",
    "lcd",
    "potentiometer",
    "slide",
    "rgb",
    "sevenseg",
    "temperature",
    "ultrasonic",
    "uart",
    "i2c",
    "spi",
];

fn catalog_two_pin(kind: &str) -> bool {
    catalog::all()["CATALOG_TWO_PIN"]
        .as_array()
        .is_some_and(|list| list.iter().any(|t| t == kind))
}
fn two_pin_types() -> Vec<String> {
    let mut types: Vec<String> = catalog::all()["CATALOG_TWO_PIN"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(String::from)
        .collect();
    types.extend(BASIC_TWO_PIN.map(String::from));
    types
}
fn multi_pin_types() -> Vec<String> {
    let mut types: Vec<String> = catalog::all()["CATALOG_DEFS"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(k, _)| k.clone())
        .filter(|k| !catalog_two_pin(k))
        .collect();
    types.extend(BASIC_MULTI_PIN.map(String::from));
    types.extend(
        devdefs::tables()["DEVICE_DEFS"]
            .as_object()
            .into_iter()
            .flatten()
            .map(|(k, _)| k.clone())
            .filter(|k| k != "ldr" && k != "ntc"),
    );
    types
}
/// PART_DEFS, TWO_PIN_TYPES, MULTI_PIN_TYPES, LCD_LABELS and WIRE_COLORS.
pub fn tables() -> Value {
    json!({"TWO_PIN_TYPES": two_pin_types(), "MULTI_PIN_TYPES": multi_pin_types(), "PART_DEFS": *PART_DEFS, "LCD_LABELS": BASIC["LCD_LABELS"], "WIRE_COLORS": BASIC["WIRE_COLORS"]})
}
fn kind_of(p: &Value) -> &str {
    p.get("type").and_then(Value::as_str).unwrap_or("")
}
fn labels_of(kind: &str) -> Option<&'static Vec<Value>> {
    PART_DEFS
        .get(kind)
        .and_then(|d| d.get("labels"))
        .and_then(Value::as_array)
}
/// The lead spacing a small two-lead part always has, or none.
pub fn fixed_lead_span(kind: &str) -> Option<u32> {
    let family = catalog::entry(kind)
        .and_then(|v| v.get("family"))
        .filter(|f| !f.is_null())
        .and_then(Value::as_str)
        .unwrap_or(kind);
    LEAD_SPANS
        .iter()
        .find(|(k, _)| *k == family)
        .map(|(_, span)| *span)
}
/// The keys of a part's terminals (`p.electricalPins` when the part has its own).
pub fn terminal_keys(p: &Value) -> Vec<String> {
    if let Some(own) = p.get("electricalPins").and_then(Value::as_array) {
        return own.iter().map(|k| js_display(Some(k))).collect();
    }
    let numbered = |n: usize| (1..=n).map(|i| format!("p{i}")).collect();
    match kind_of(p) {
        "breadboard" | "devboard" => Vec::new(),
        "button" => ["a", "b", "c", "d"].map(String::from).to_vec(),
        "lcd" => numbered(16),
        kind => match labels_of(kind) {
            Some(labels) => numbered(labels.len()),
            None => ["a", "b"].map(String::from).to_vec(),
        },
    }
}
/// What a terminal is called: the label of the definition, or the conventional one of a two-lead part. None for a
/// key the part has no label for.
pub fn terminal_label(kind: &str, key: &str) -> Option<String> {
    // `Number(key.slice(1))` of "p3" is 3.
    let number = key.chars().skip(1).collect::<String>();
    let index = crate::periph::js_number_text(&number)
        .parse::<usize>()
        .ok()
        .filter(|n| *n >= 1);
    if kind == "lcd" {
        let label = index
            .and_then(|n| BASIC["LCD_LABELS"].get(n - 1))
            .map_or("undefined".to_string(), |l| js_display(Some(l)));
        return Some(format!(
            "{} · {label}",
            crate::periph::js_number_text(&number)
        ));
    }
    if kind == "button" {
        return match key {
            "a" => Some("A1".into()),
            "c" => Some("A2".into()),
            "b" => Some("B1".into()),
            "d" => Some("B2".into()),
            _ => None,
        };
    }
    if let Some(labels) = labels_of(kind) {
        return index
            .and_then(|n| labels.get(n - 1))
            .map(|l| js_display(Some(l)));
    }
    Some(if kind == "led" || kind == "diode" {
        if key == "a" { "A (+)" } else { "K (−)" }.to_string()
    } else if matches!(kind, "buzzer" | "passive_buzzer" | "dc_supply") {
        if key == "a" { "+" } else { "−" }.to_string()
    } else {
        key.to_uppercase()
    })
}
/// Pin positions of a basic multi-pin part taken from the real part it is drawn as, when the pins it uses stand in
/// one row (none otherwise: a basic part on two pin rows of a DIP keeps its own row).
pub fn physical_pins(kind: &str) -> Option<Vec<Value>> {
    let tables = catalog::all();
    let id = tables["LEGACY_PHYSICAL"]
        .get(kind)
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())?;
    let map = tables["CONTACT_MAPS"].get(id).and_then(Value::as_array)?;
    if catalog::entry(kind).is_some() {
        return None;
    }
    let terminals = tables["CATALOG_DEFS"]
        .get(catalog_type(id))
        .and_then(|d| d.get("terminals"))
        .and_then(Value::as_array)?;
    let pins: Vec<Value> = map
        .iter()
        .map(|n| {
            n.as_u64()
                .and_then(|n| terminals.get((n as usize).wrapping_sub(1)))
                .cloned()
                .unwrap_or(Value::Null)
        })
        .collect();
    let first = pins.first().and_then(|t| t.get(1)).cloned();
    pins.iter()
        .all(|t| t.get(1) == first.as_ref())
        .then_some(pins)
}
/// (key, x, y) of each terminal before the part's own scale, skew, turn and place.
fn raw_terminals(p: &Value) -> Vec<(String, f64, f64)> {
    let kind = kind_of(p);
    let span = || match p.get("span").filter(|s| !s.is_null()) {
        Some(s) => to_num(Some(s)),
        None => 70.0,
    };
    let numbered = |points: &[Value]| -> Vec<(String, f64, f64)> {
        points
            .iter()
            .enumerate()
            .map(|(i, t)| (format!("p{}", i + 1), to_num(t.get(0)), to_num(t.get(1))))
            .collect()
    };
    // A board's header takes jumper wires only.
    if kind == "breadboard" || kind == "devboard" {
        return Vec::new();
    }
    if kind == "button" {
        return vec![
            ("a".into(), -14.0, -14.0),
            ("b".into(), 14.0, -14.0),
            ("c".into(), -14.0, 14.0),
            ("d".into(), 14.0, 14.0),
        ];
    }
    if kind == "lcd" {
        return (0..16)
            .map(|i| (format!("p{}", i + 1), (f64::from(i) - 7.5) * 14.0, 44.0))
            .collect();
    }
    if catalog_two_pin(kind) {
        return vec![
            ("p1".into(), -span() / 2.0, 0.0),
            ("p2".into(), span() / 2.0, 0.0),
        ];
    }
    // A basic part with a pin map to its real part has its pins where that part's pins are.
    if let Some(real) = physical_pins(kind) {
        return numbered(&real);
    }
    let def = PART_DEFS.get(kind);
    if let Some(terminals) = def
        .and_then(|d| d.get("terminals"))
        .and_then(Value::as_array)
    {
        return numbered(terminals);
    }
    if kind == "sevenseg" {
        return terminal_keys(p)
            .into_iter()
            .enumerate()
            .map(|(i, key)| {
                (
                    key,
                    if i < 5 {
                        (i as f64 - 2.0) * 14.0
                    } else {
                        (7.0 - i as f64) * 14.0
                    },
                    if i < 5 { 35.0 } else { -35.0 },
                )
            })
            .collect();
    }
    if def
        .and_then(|d| d.get("labels"))
        .is_some_and(|l| !l.is_null())
    {
        let keys = terminal_keys(p);
        let count = keys.len() as f64;
        let y = match def.and_then(|d| d.get("pinY")).filter(|y| !y.is_null()) {
            Some(y) => to_num(Some(y)),
            None => {
                if kind == "ultrasonic" {
                    32.0
                } else {
                    28.0
                }
            }
        };
        return keys
            .into_iter()
            .enumerate()
            .map(|(i, key)| (key, (i as f64 - (count - 1.0) / 2.0) * 14.0, y))
            .collect();
    }
    let half = span() / 2.0;
    vec![("a".into(), -half, 0.0), ("b".into(), half, 0.0)]
}
/// `value?.scale ?? 1`, and the two axes' own.
fn scales(p: &Value) -> (f64, f64) {
    let field = |key: &str| p.get(key).filter(|v| !v.is_null()).map(|v| to_num(Some(v)));
    let both = field("scale").unwrap_or(1.0);
    (
        field("scaleX").unwrap_or(both),
        field("scaleY").unwrap_or(both),
    )
}
/// A point turned by `angle` degrees.
pub fn rotate_point(x: f64, y: f64, angle: f64) -> (f64, f64) {
    let r = angle * PI / 180.0;
    (x * cos(r) - y * sin(r), x * sin(r) + y * cos(r))
}
/// The places as one list of numbers (x, y, x, y, …): cheaper to send than an object for each terminal.
fn flat(list: &[(String, f64, f64)]) -> Value {
    Value::Array(
        list.iter()
            .flat_map(|(_, x, y)| [out(*x), out(*y)])
            .collect(),
    )
}
/// Everything about a part's terminals at once: their keys, where they are in the part's own frame (`local`) and in
/// the workspace (`nominal`) — as x, y pairs in the order of `at`, the keys those places belong to —, and which are
/// wired directly instead of plugged into a breadboard.
pub fn part_shape(given: &Value) -> Value {
    // A setting that is `undefined` is one the part does not have.
    let p = &without_undefined(given);
    let keys = terminal_keys(p);
    let (sx, sy) = scales(p);
    let skew = match p.get("skewX").filter(|v| !v.is_null()) {
        Some(v) => to_num(Some(v)),
        None => 0.0,
    };
    let k = tan(skew * PI / 180.0);
    let local: Vec<(String, f64, f64)> = raw_terminals(p)
        .into_iter()
        .map(|(key, x, y)| (key, x * sx + y * sy * k, y * sy))
        .collect();
    let (px, py, turn) = (
        to_num(p.get("x")),
        to_num(p.get("y")),
        to_num(p.get("rotation")),
    );
    let nominal: Vec<(String, f64, f64)> = local
        .iter()
        .map(|(key, x, y)| {
            let (vx, vy) = rotate_point(*x, *y, turn);
            (key.clone(), px + vx, py + vy)
        })
        .collect();
    // Terminal keys of the contacts that are wired directly (screw terminals, connectors), never put into a hole.
    let wired: Vec<&String> = match catalog::entry(kind_of(p)).and_then(|v| v["id"].as_str()) {
        Some(id) => keys
            .iter()
            .enumerate()
            .filter(|(i, _)| is_wired_contact(id, *i))
            .map(|(_, k)| k)
            .collect(),
        None => Vec::new(),
    };
    let plugged: Vec<&String> = keys.iter().filter(|k| !wired.contains(k)).collect();
    let at: Vec<&String> = local.iter().map(|(key, _, _)| key).collect();
    json!({"keys": keys, "at": at, "local": flat(&local), "nominal": flat(&nominal), "wired": wired, "plugged": plugged})
}
// Called while a circuit is drawn: numbers in, a number out (`src/rust-core.js` `rustNumber`). A turned point has two
// numbers: `stm_rotate` answers x and keeps y for `stm_rotate_y`, asked right after it.
thread_local! {
    static TURNED_Y: std::cell::Cell<f64> = const { std::cell::Cell::new(0.0) };
}
#[no_mangle]
pub extern "C" fn stm_rotate(x: f64, y: f64, angle: f64) -> f64 {
    let (tx, ty) = rotate_point(x, y, angle);
    TURNED_Y.with(|cell| cell.set(ty));
    tx
}
#[no_mangle]
pub extern "C" fn stm_rotate_y() -> f64 {
    TURNED_Y.with(std::cell::Cell::get)
}
/// An angle in degrees brought into 0 – 360.
#[no_mangle]
pub extern "C" fn stm_normalize_angle(n: f64) -> f64 {
    ((n % 360.0) + 360.0) % 360.0
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let text = |i: usize| args.get(i).and_then(Value::as_str).unwrap_or("");
    Some(match name {
        "part_tables" => Ok(tables()),
        "part_shape" => Ok(part_shape(v(0))),
        "part_lead_span" => Ok(json!(fixed_lead_span(text(0)))),
        "part_terminal_label" => Ok(json!(terminal_label(text(0), text(1)))),
        "part_physical_pins" => Ok(json!(physical_pins(text(0)))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_labels_and_places() {
        assert_eq!(
            terminal_keys(&json!({"type": "button"})),
            ["a", "b", "c", "d"]
        );
        assert_eq!(
            terminal_keys(&json!({"type": "uart"})),
            ["p1", "p2", "p3", "p4"]
        );
        assert_eq!(terminal_keys(&json!({"type": "resistor"})), ["a", "b"]);
        assert_eq!(terminal_label("lcd", "p4").unwrap(), "4 · RS");
        assert_eq!(terminal_label("led", "b").unwrap(), "K (−)");
        assert_eq!(terminal_label("uart", "p3").unwrap(), "TX");
        assert_eq!(fixed_lead_span("led"), Some(28));
        assert_eq!(fixed_lead_span("ref_led_tht_2"), Some(28));
        assert_eq!(fixed_lead_span("uart"), None);
        let shape =
            part_shape(&json!({"type": "resistor", "x": 100, "y": 50, "rotation": 0, "span": 42}));
        assert_eq!(shape["nominal"], json!([79, 50, 121, 50]));
        assert_eq!(shape["at"], json!(["a", "b"]));
        assert!(tables()["TWO_PIN_TYPES"]
            .as_array()
            .unwrap()
            .iter()
            .any(|t| t == "dc_supply"));
    }
}
