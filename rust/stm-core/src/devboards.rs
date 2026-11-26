//! More STM32 boards placed next to the main board (component type 'devboard'), centred on the component position.
//! Their pins are wire endpoints `devboard:<id>:<key>`; the supply pins join the common 3V3 / 5V / GND nets, every
//! other pin is the board's own net `signal:<id>.<signal>`. Each board keeps its own main.c, pin settings and
//! sources; editing one swaps it with the main board. Renesas RA boards are main boards only.
//!
//! Moved here from `src/devboards.js` (feature 62). What draws (the LD2 of each board) stays on the JavaScript side.

use crate::geom::{least, matrix_of, most, vector};
use crate::mcu::js_display;
use crate::raconfig::{out, to_num};
use serde_json::{json, Value};

pub const MAX_DEVBOARDS: usize = 8;
/// Main-board nets every STM32 board shares (fixed supplies); the rest of a board's signals are its own.
const STM32_COMMON: [&str; 7] = ["3V3", "5V", "GND", "VDD", "AVDD", "IOREF", "U5V"];
const POWER: [&str; 3] = ["3V3", "5V", "GND"];
const NOTES: [(&str, &str); 6] = [
    ("PA5", "LD2 사용자 LED (보드 내장)"),
    ("PC13", "B1 USER 버튼 (보드 내장, 누르면 LOW)"),
    ("PA2", "USART2 TX — ST-LINK 가상 COM 포트"),
    ("PA3", "USART2 RX — ST-LINK 가상 COM 포트"),
    ("PA13", "SWDIO — ST-LINK 디버그 연결"),
    ("PA14", "SWCLK — ST-LINK 디버그 연결"),
];
/// What a header pin behind an open solder bridge is (`bridgeNote` of pins.js).
fn bridge_note(bridge: &str, mcu: &str) -> String {
    let what = match mcu {
        "PA2" | "PA3" => " (ST-LINK 가상 COM 포트 전용)",
        "PC14" | "PC15" => " (32.768 kHz 수정 X2)",
        _ => " (ST-LINK 8 MHz MCO 입력)",
    };
    format!("{bridge} 열림(기본) — {mcu}에 연결되지 않음{what}")
}
/// The header pins of an STM32 board as a board part has them: places from the board's centre (`cx`, `cy`).
pub fn model_pins(board_id: &str, cx: f64, cy: f64) -> Vec<Value> {
    let tables = crate::pins::tables();
    let list = tables["BOARD_PINS"].get(board_id).or_else(|| {
        if board_id == "fpb-ra6e1" {
            tables.get("FPB_PINS")
        } else {
            tables.get("NUCLEO_PINS")
        }
    });
    list.and_then(Value::as_array)
        .into_iter()
        .flatten()
        .map(|p| {
            let text = |k: &str| p[k].as_str().unwrap_or("");
            let signal = text("signal");
            let notes = if let Some((_, note)) = NOTES.iter().find(|(k, _)| *k == signal) {
                json!([{"text": note, "warn": signal == "PA13" || signal == "PA14"}])
            } else if !text("bridge").is_empty() {
                json!([{"text": bridge_note(text("bridge"), text("mcu")), "warn": true}])
            } else if signal == "NC" {
                json!([{"text": "연결 없음"}])
            } else {
                json!([])
            };
            json!({
                "key": format!("{}:{}", text("header"), js_display(p.get("number"))),
                "label": format!("{}-{} {}", text("header"), js_display(p.get("number")), text("label")),
                "signal": if signal == "AGND" { "GND" } else { signal },
                "header": p["header"], "number": p["number"],
                "x": out(to_num(p.get("x")) - cx), "y": out(to_num(p.get("y")) - cy),
                "notes": notes,
            })
        })
        .collect()
}
/// The net a board pin belongs to: its own net, a common power net, or none (NC).
pub fn net(stm32: bool, part_id: &str, signal: &str) -> Option<String> {
    if POWER.contains(&signal) {
        return Some(format!("signal:{signal}"));
    }
    // STM32 boards: the board supply pins are the main board's 3.3 V / 5 V nets, every other pin (GPIO, NRST, BOOT0,
    // E5V …) is the board's own net, as `<signal>` is on the main board.
    if !stm32 || signal == "NC" {
        return None;
    }
    Some(if STM32_COMMON.contains(&signal) {
        format!("signal:{signal}")
    } else {
        format!("signal:{part_id}.{signal}")
    })
}
/// (rotation, scaleX, scaleY) of a board part: its turn, and the size of an STM32 board that was the (resized) main
/// board. A board part has no skew.
fn frame(part: &Value) -> (f64, f64, f64) {
    let field = |key: &str| {
        part.get(key)
            .filter(|v| !v.is_null())
            .map(|v| to_num(Some(v)))
    };
    let both = field("scale").unwrap_or(1.0);
    (
        field("rotation").unwrap_or(0.0),
        field("scaleX").unwrap_or(both),
        field("scaleY").unwrap_or(both),
    )
}
/// Where the pins of a board part are in the workspace (x, y pairs in the order of `pins`) and what each is called
/// there: `<part name> · <pin label>`, with ` / <signal>` when the label does not say it.
pub fn part_pins(part: &Value, pins: &[Value]) -> Value {
    let (rotation, sx, sy) = frame(part);
    let m = matrix_of(rotation, sx, sy, 0.0);
    let (px, py, name) = (
        to_num(part.get("x")),
        to_num(part.get("y")),
        js_display(part.get("name")),
    );
    let mut places = Vec::with_capacity(pins.len() * 2);
    let mut labels = Vec::with_capacity(pins.len());
    for p in pins {
        let q = vector(m, to_num(p.get("x")), to_num(p.get("y")));
        places.push(out(px + q.0));
        places.push(out(py + q.1));
        let (label, signal) = (js_display(p.get("label")), js_display(p.get("signal")));
        let more = if signal != label && !label.ends_with(&signal) {
            format!(" / {signal}")
        } else {
            String::new()
        };
        labels.push(json!(format!("{name} · {label}{more}")));
    }
    json!({"places": places, "labels": labels})
}
/// Axis-aligned bounds of a board part `w` × `h`: (left, right, top, bottom).
pub fn bounds(part: &Value, w: f64, h: f64) -> (f64, f64, f64, f64) {
    let (rotation, sx, sy) = frame(part);
    let m = matrix_of(rotation, sx, sy, 0.0);
    let (px, py) = (to_num(part.get("x")), to_num(part.get("y")));
    let corners = [(-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0)].map(|(a, b)| {
        let v = vector(m, a * w / 2.0, b * h / 2.0);
        (px + v.0, py + v.1)
    });
    let (xs, ys) = (corners.map(|c| c.0), corners.map(|c| c.1));
    (least(xs), most(xs), least(ys), most(ys))
}
/// A board name not used yet: STM32-1, STM32-2 …
pub fn next_name(names: &[Value], short: &str) -> String {
    let mut n = 1;
    while names
        .iter()
        .any(|x| x.as_str() == Some(format!("{short}-{n}").as_str()))
    {
        n += 1;
    }
    format!("{short}-{n}")
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let v = |i: usize| args.get(i).unwrap_or(&null);
    let text = |i: usize| js_display(args.get(i));
    let n = |i: usize| to_num(args.get(i));
    let items = |i: usize| v(i).as_array().map_or(&[][..], Vec::as_slice);
    Some(match name {
        "devboard_tables" => Ok(
            json!({"MAX_DEVBOARDS": MAX_DEVBOARDS, "POWER_SIGNALS": {"3V3": "signal:3V3", "5V": "signal:5V", "GND": "signal:GND"}, "STM32_COMMON": STM32_COMMON}),
        ),
        // [board id, BOARD.x, BOARD.y, BOARD.w, BOARD.h] → the model's pins, from the board's centre
        "devboard_model_pins" => Ok(json!(model_pins(
            &text(0),
            n(1) + n(3) / 2.0,
            n(2) + n(4) / 2.0
        ))),
        "devboard_net" => {
            Ok(net(v(0) == &json!(true), &text(1), &text(2)).map_or(Value::Null, |net| json!(net)))
        }
        "devboard_part_pins" => Ok(part_pins(v(0), items(1))),
        "devboard_bounds" => {
            let b = bounds(v(0), n(1), n(2));
            Ok(json!({"left": out(b.0), "right": out(b.1), "top": out(b.2), "bottom": out(b.3)}))
        }
        "devboard_next_name" => Ok(json!(next_name(items(0), &text(1)))),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nets_names_and_pins() {
        assert_eq!(net(true, "b1", "PA5").unwrap(), "signal:b1.PA5");
        assert_eq!(net(true, "b1", "VDD").unwrap(), "signal:VDD");
        assert_eq!(net(false, "b1", "GND").unwrap(), "signal:GND");
        assert!(net(true, "b1", "NC").is_none() && net(false, "b1", "PA5").is_none());
        assert_eq!(
            next_name(&[json!("STM32-1"), json!("LED"), json!("STM32-3")], "STM32"),
            "STM32-2"
        );
        let pins = model_pins("nucleo-f446re", 45.0 + 385.83 / 2.0, 48.0 + 454.72 / 2.0);
        assert_eq!(pins.len(), 108);
        let d1 = pins.iter().find(|p| p["key"] == "CN9:2").unwrap();
        assert_eq!(d1["notes"][0]["warn"], true);
        assert_eq!(d1["label"], "CN9-2 D1");
    }
}
