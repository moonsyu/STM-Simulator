//! The catalog of real parts a circuit can hold: the researched device inventory (`data/device_catalog.json`), the
//! datasheet facts of each part (`data/part_datasheets.json`), the L298N module and the wireless modules' defaults,
//! and what is derived from them — the part type of each catalog entry, its contact map, where its pins stand and
//! the definition (`CATALOG_DEFS`) the editor places a part from.
//!
//! Moved here from `src/catalog-defs.js`, `src/device-catalog-data.js`, `src/part-datasheets.js` and the tables of
//! `src/l298n.js` and `src/wireless.js` (feature 62). The data files are those modules' tables as they were.

use crate::devdefs;
use crate::mcu::{js_display, number};
use serde_json::{json, Map, Value};
use std::sync::LazyLock;

fn parse(text: &str, name: &str) -> Value {
    serde_json::from_str(text).unwrap_or_else(|e| panic!("{name}: {e}"))
}
static DEVICE_CATALOG: LazyLock<Value> = LazyLock::new(|| {
    parse(
        include_str!("data/device_catalog.json"),
        "device_catalog.json",
    )
});
static DATASHEETS: LazyLock<Value> = LazyLock::new(|| {
    parse(
        include_str!("data/part_datasheets.json"),
        "part_datasheets.json",
    )
});
static L298: LazyLock<Value> = LazyLock::new(|| parse(include_str!("data/l298.json"), "l298.json"));
static WIRELESS: LazyLock<Value> =
    LazyLock::new(|| parse(include_str!("data/wireless.json"), "wireless.json"));
static OWN: LazyLock<Value> = LazyLock::new(|| {
    parse(
        include_str!("data/catalog_tables.json"),
        "catalog_tables.json",
    )
});
/// The workspace draws 1 mm as 14/2.54 units, the breadboard pitch, so every part keeps its real size next to the
/// breadboard.
pub const UNITS_PER_MM: f64 = 14.0 / 2.54;
const BROKEN: &str = "Cannot read properties of undefined";

/// The part type of a catalog id: `ref_` and the id with `_` for `-`.
pub fn catalog_type(id: &str) -> String {
    format!("ref_{}", id.replace('-', "_"))
}
fn datasheet(id: &str) -> Option<&'static Value> {
    DATASHEETS["PART_DATASHEETS"].get(id)
}
/// The catalog entries a part can be made from (not the boards and breadboards), by part type.
fn by_type() -> Vec<(String, &'static Value)> {
    DEVICE_CATALOG["DEVICE_CATALOG"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|v| !matches!(v["family"].as_str(), Some("board" | "breadboard")))
        .map(|v| (catalog_type(v["id"].as_str().unwrap_or("")), v))
        .collect()
}
/// Simulator-model contacts mapped to the physical variant's contact numbers: `{p1: "p3", …}` or `{a: "p1", …}`;
/// null for a type without a map.
pub fn catalog_map(kind: &str) -> Value {
    let Some((_, v)) = by_type().into_iter().find(|(t, _)| t == kind) else {
        return Value::Null;
    };
    match OWN["CONTACT_MAPS"].get(v["id"].as_str().unwrap_or("")) {
        Some(Value::Array(list)) => Value::Object(
            list.iter()
                .enumerate()
                .map(|(i, n)| {
                    (
                        format!("p{}", i + 1),
                        json!(format!("p{}", js_display(Some(n)))),
                    )
                })
                .collect(),
        ),
        Some(Value::Object(map)) => Value::Object(
            map.iter()
                .map(|(k, n)| (k.clone(), json!(format!("p{}", js_display(Some(n))))))
                .collect(),
        ),
        _ => Value::Null,
    }
}
fn point(x: f64, y: f64) -> Value {
    json!([number(x), number(y)])
}
/// `count` pins in a row at `y`, one pitch (14 units) apart, centred on `start`.
fn row(count: f64, y: f64, start: f64) -> Vec<Value> {
    (0..count.max(0.0).floor() as usize)
        .map(|i| point((i as f64 - (count - 1.0) / 2.0) * 14.0 + start, y))
        .collect()
}
/// Two rows of a dual in-line package `h` high: the lower one left to right, the upper one back.
fn dip(count: f64, h: f64) -> Vec<Value> {
    let mut pins = row((count / 2.0).ceil(), h / 2.0 + 14.0, 0.0);
    let mut upper = row((count / 2.0).floor(), -h / 2.0 - 14.0, 0.0);
    upper.reverse();
    pins.extend(upper);
    pins
}
/// The drawing size of a catalog part's package and where its pins stand, in units from its centre.
pub fn catalog_geometry(v: &Value) -> Result<Value, String> {
    let Some(pins) = v.get("pins").and_then(Value::as_array) else {
        return Err(BROKEN.into());
    };
    let n = pins.len() as f64;
    let id = v.get("id").and_then(Value::as_str).ok_or(BROKEN)?;
    let family = v.get("family").and_then(Value::as_str).unwrap_or("");
    let mut body = ((n * 14.0 + 12.0).max(56.0), 56.0);
    // Two pin rows on either side of a small package sit just outside its real (datasheet) width, on the 2.54 mm
    // grid: DIP-8 rows 7.62 mm apart, SOT-23 rows one pitch apart, as the parts plug into a breadboard.
    let row_half = datasheet(id)
        .and_then(|d| d.get("size"))
        .filter(|s| !s.is_null())
        .map(|s| {
            let side = |k: &str| s.get(k).and_then(Value::as_f64).unwrap_or(f64::NAN);
            let (w, h) = (side("w"), side("h"));
            let least = if w.is_nan() || h.is_nan() {
                f64::NAN
            } else {
                w.min(h)
            };
            ((least * UNITS_PER_MM / 2.0 + 2.0) / 7.0).ceil() * 7.0
        });
    let terminals: Vec<Value>;
    if n == 2.0 {
        body = (64.0, 46.0);
        terminals = vec![point(-35.0, 0.0), point(35.0, 0.0)];
    } else if id == "button-4" {
        // 6 × 6 mm tactile switch: its four pins at the corners, two holes apart each way.
        body = (42.0, 28.0);
        terminals = vec![
            point(-14.0, -14.0),
            point(14.0, -14.0),
            point(-14.0, 14.0),
            point(14.0, 14.0),
        ];
    } else if id == "i2c-eeprom-5" {
        let r = row_half.unwrap_or(28.0);
        body = (42.0, 28.0);
        terminals = vec![
            point(-14.0, r),
            point(0.0, r),
            point(14.0, r),
            point(14.0, -r),
            point(-14.0, -r),
        ];
    } else if id.contains("eeprom-8") || id.contains("l298p-bare-20") {
        body = (n / 2.0 * 14.0 + 14.0, 42.0);
        terminals = dip(n, row_half.map_or(42.0, |r| 2.0 * (r - 14.0)));
    } else if id == "ov2640-camera" {
        body = (140.0, 98.0);
        terminals = (0..18)
            .map(|i| {
                point(
                    (f64::from(i / 2) - 4.0) * 14.0,
                    56.0 + f64::from(i % 2) * 14.0,
                )
            })
            .collect();
    } else if id.starts_with("slide-dp") {
        let r = row_half.unwrap_or(28.0);
        body = (n / 2.0 * 14.0 + 14.0, 28.0);
        terminals = row(n / 2.0, -r, 0.0)
            .into_iter()
            .chain(row(n / 2.0, r, 0.0))
            .collect();
    } else if family == "sevenseg" && n >= 10.0 {
        body = (if n >= 12.0 { 168.0 } else { 70.0 }, 70.0);
        terminals = dip(n, 70.0);
    } else if id == "ds18b20-probe-3" {
        // A probe's three wires leave its cable end.
        terminals = vec![point(91.0, -14.0), point(91.0, 0.0), point(91.0, 14.0)];
    } else if id == "encoder-bare-5" {
        // PEC11: the A/C/B contacts on one side, the push switch's two on the other.
        terminals = row(3.0, 42.0, 0.0)
            .into_iter()
            .chain([point(-14.0, -42.0), point(14.0, -42.0)])
            .collect();
    } else if let Some(on_contacts) = OWN["ON_CONTACT_PINS"].get(id).and_then(Value::as_array) {
        // Modules on pins under their own contacts: only the package drawing size is set here.
        body = match id {
            "motor-driver-hat" => (294.0, 168.0),
            "matrix-10" => (112.0, 112.0),
            "ds3231-zs042-10" => (210.0, 122.0),
            "l298n-module-13" => (140.0, 112.0),
            "relay-module-6" => (98.0, 70.0),
            "stepper-driver-11" => (126.0, 84.0),
            "urm09-i2c-4" => (126.0, 56.0),
            _ => body,
        };
        terminals = on_contacts.clone();
    } else {
        if matches!(family, "lcd" | "oled" | "tft" | "sevenseg") {
            body = (
                if family == "lcd" { 242.0 } else { 144.0 },
                if family == "tft" { 182.0 } else { 84.0 },
            );
        }
        if matches!(family, "servo" | "dc_motor" | "stepper") {
            body = (100.0, 84.0);
        }
        if family == "ultrasonic" {
            body = (126.0, 56.0);
        }
        if id == "l298n-bare-15" {
            body = (224.0, 70.0);
        }
        terminals = row(n, body.1 / 2.0 + 14.0, 0.0);
    }
    Ok(
        json!({"body": {"width": number(body.0), "height": number(body.1)}, "terminals": terminals, "pinY": number(body.1 / 2.0 + 14.0)}),
    )
}
/// The settings a part of a family starts with, before those of its module definition.
fn family_defaults() -> Value {
    json!({"resistor": {"value": 330}, "led": {"color": "red"}, "button": {"switch": 0}, "potentiometer": {"value": 10000, "position": 50}, "slide": {"position": 0},
        "capacitor": {"value": 100}, "uart": {"baud": 9600}, "rs485": {"baud": 9600}, "i2c": {"address": 80}, "temperature": {"temperature": 25}, "external_rtc": {"temperature": 25},
        "ultrasonic": {"distance": 100}, "dc_supply": {"voltage": 12}, "sd": {"sizeMB": 64, "cardImage": ""}, "dcmi": {"pattern": "colorbars", "image": ""}})
}
fn merge(into: &mut Map<String, Value>, from: Option<&Value>) {
    for (k, v) in from.and_then(Value::as_object).into_iter().flatten() {
        into.insert(k.clone(), v.clone());
    }
}
fn truthy_object(v: Option<&Value>) -> Option<&Value> {
    v.filter(|x| x.is_object())
}
/// The definition the editor places each catalog part from, by part type.
fn catalog_defs() -> Result<Value, String> {
    let own_defaults = family_defaults();
    let devices = &devdefs::tables()["DEVICE_DEFS"];
    let mut defs = Map::new();
    for (kind, v) in by_type() {
        let id = v["id"].as_str().unwrap_or("");
        let family = v["family"].as_str().unwrap_or("");
        let mut defaults = Map::new();
        merge(&mut defaults, own_defaults.get(family));
        let module =
            truthy_object(devices.get(family).and_then(|d| d.get("defaults"))).or_else(|| {
                truthy_object(
                    L298["L298_DEFS"]
                        .get(family)
                        .and_then(|d| d.get("defaults")),
                )
            });
        merge(&mut defaults, module);
        if family == "dht11" || family == "dht22" {
            defaults.insert("temperature".into(), json!(25));
            defaults.insert("humidity".into(), json!(50));
        }
        if family == "slide" {
            defaults.insert("position".into(), json!(0));
        }
        merge(&mut defaults, WIRELESS["WIRELESS_DEFAULTS"].get(id));
        // The datasheet name of a catalog part (the catalog's own name when no datasheet was found).
        let name = datasheet(id)
            .and_then(|d| d.get("name"))
            .filter(|n| !n.is_null())
            .unwrap_or(&v["name"]);
        let count = v
            .get("pin_count")
            .filter(|c| !c.is_null())
            .map_or("조립".to_string(), |c| js_display(Some(c)));
        let mut def = Map::new();
        def.insert("name".into(), name.clone());
        def.insert(
            "prefix".into(),
            json!(id.split('-').next().unwrap_or("").to_uppercase()),
        );
        def.insert("icon".into(), json!("▦"));
        def.insert(
            "hint".into(),
            json!(format!("{count}핀 · {}", js_display(v.get("interface")))),
        );
        def.insert("labels".into(), v["pins"].clone());
        def.insert("defaults".into(), Value::Object(defaults));
        def.insert(
            "help".into(),
            json!(format!(
                "{} {}",
                js_display(v.get("appearance")),
                js_display(v.get("notes"))
            )),
        );
        merge(&mut def, Some(&catalog_geometry(v)?));
        defs.insert(kind, Value::Object(def));
    }
    Ok(Value::Object(defs))
}
/// Every table of the catalog, by the name the JavaScript modules export it under.
pub fn tables() -> Result<Value, String> {
    let types = by_type();
    let two_pin: Vec<&String> = types
        .iter()
        .filter(|(_, v)| v["pins"].as_array().is_some_and(|p| p.len() == 2))
        .map(|(t, _)| t)
        .collect();
    let mut all = Map::new();
    all.insert(
        "DEVICE_CATALOG".into(),
        DEVICE_CATALOG["DEVICE_CATALOG"].clone(),
    );
    all.insert(
        "PART_DATASHEETS".into(),
        DATASHEETS["PART_DATASHEETS"].clone(),
    );
    all.insert("UNITS_PER_MM".into(), json!(UNITS_PER_MM));
    merge(&mut all, Some(&L298));
    merge(&mut all, Some(&WIRELESS));
    merge(&mut all, Some(&OWN));
    all.insert(
        "CATALOG_BY_TYPE".into(),
        Value::Object(
            types
                .iter()
                .map(|(t, v)| (t.clone(), (*v).clone()))
                .collect(),
        ),
    );
    all.insert("CATALOG_TWO_PIN".into(), json!(two_pin));
    all.insert("CATALOG_DEFS".into(), catalog_defs()?);
    Ok(Value::Object(all))
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustFn`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    Some(match name {
        "catalog_tables" => tables(),
        "catalog_map" => Ok(catalog_map(&js_display(args.first()))),
        "catalog_geometry" => catalog_geometry(v(0)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn types_maps_and_geometry() {
        assert_eq!(catalog_type("led-tht-2"), "ref_led_tht_2");
        assert_eq!(catalog_map("ref_led_tht_2"), json!({"a": "p1", "b": "p2"}));
        assert_eq!(
            catalog_map("ref_pir_3"),
            json!({"p1": "p1", "p2": "p3", "p3": "p2"})
        );
        assert!(catalog_map("ref_nothing").is_null());
        let all = tables().unwrap();
        let led = &all["CATALOG_DEFS"]["ref_led_tht_2"];
        assert_eq!(led["body"], json!({"width": 64, "height": 46}));
        assert_eq!(led["terminals"], json!([[-35, 0], [35, 0]]));
        assert_eq!(led["defaults"], json!({"color": "red"}));
        assert!(all["CATALOG_BY_TYPE"].get("ref_nucleo_f446re").is_none());
        assert_eq!(all["CATALOG_DEFS"]["ref_button_4"]["pinY"], 28);
    }
}
