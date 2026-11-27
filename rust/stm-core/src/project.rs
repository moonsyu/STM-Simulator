//! A project (circuit file): the empty projects a board starts with, and the check every project goes through when it
//! is opened, pasted or changed — it answers a clean copy (version 2, sources with \n line ends) or the reason the
//! project cannot be used.
//!
//! Moved here from `src/project.js` (feature 62). The project comes exactly as the JavaScript side has it
//! (`rustExact`: a setting that is `undefined` or not a number is told apart from one that is missing or null), so
//! each check refuses what it refused before, with the same message.

use crate::csedit::{name_clash, normalize_text, MAX_SOURCE_BYTES, MAX_SOURCE_FILES, SOURCE_PATH};
use crate::devboards::MAX_DEVBOARDS;
use crate::js_re;
use crate::jsre::trim;
use crate::mcu::{js_number, DEFAULT_FAMILY};
use crate::raconfig::{num, out, show, there, to_num, truthy, NF};
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

type R<T> = Result<T, String>;
const FORMAT: &str = "stm32-circuit-lab";
/// What the JavaScript threw on its own when it read a property of something that is not there.
pub(crate) const BROKEN: &str = "Cannot read properties of undefined";
const ZS042: &str = "ref_ds3231_zs042_10";
const QUARTERS: [f64; 4] = [0.0, 90.0, 180.0, 270.0];
const LED_COLORS: [&str; 4] = ["red", "green", "blue", "yellow"];

// ---------- values as JavaScript sees them ----------

pub(crate) fn undefined() -> Value {
    json!({NF: "undefined"})
}
/// `v[key]`: none when the property is missing or `undefined` (and for a value that has no properties).
pub(crate) fn get<'a>(v: &'a Value, key: &str) -> Option<&'a Value> {
    there(v.get(key))
}
/// The value itself, `undefined` kept.
pub(crate) fn raw(v: Option<&Value>) -> Value {
    v.cloned().unwrap_or_else(undefined)
}
pub(crate) fn text(v: Option<&Value>) -> Option<&str> {
    v.and_then(Value::as_str)
}
/// `Number.isFinite(v)`.
fn finite(v: Option<&Value>) -> Option<f64> {
    v.and_then(num).filter(|n| n.is_finite())
}
/// `Number.isInteger(v)`.
fn integer(v: Option<&Value>) -> Option<f64> {
    finite(v).filter(|n| n.fract() == 0.0)
}
/// `typeof v === 'object'` of a value that is not null: an object or a list (a number that came as a marker is not).
fn is_object(v: &Value) -> bool {
    there(Some(v)).is_some() && ((v.is_object() && num(v).is_none()) || v.is_array())
}
/// An object that is not a list.
fn plain(v: Option<&Value>) -> Option<&Map<String, Value>> {
    there(v)
        .filter(|x| num(x).is_none())
        .and_then(Value::as_object)
}
/// `text.length`: UTF-16 code units.
pub(crate) fn units(s: &str) -> usize {
    if s.is_ascii() {
        s.len()
    } else {
        s.encode_utf16().count()
    }
}
/// `a === b` of two values of a project: lists and objects are never the same one.
fn same(a: Option<&Value>, b: Option<&Value>) -> bool {
    match (a, b) {
        (None, None) => true,
        (Some(x), Some(y)) => match (x, y) {
            (Value::Number(_), Value::Number(_)) => x.as_f64() == y.as_f64(),
            (Value::Object(_) | Value::Array(_), _) => false,
            _ => x == y,
        },
        _ => false,
    }
}
/// `Object.entries(v)` of an object or a list.
pub(crate) fn entries(v: &Value) -> Vec<(String, &Value)> {
    match v {
        Value::Object(o) => o.iter().map(|(k, x)| (k.clone(), x)).collect(),
        Value::Array(items) => items
            .iter()
            .enumerate()
            .map(|(i, x)| (i.to_string(), x))
            .collect(),
        _ => Vec::new(),
    }
}
/// The value as `JSON.stringify` carries it: without the properties that are `undefined`, null for what is not a
/// number (the functions that were called with plain JSON before get it so).
pub(crate) fn as_json(v: &Value) -> Value {
    if there(Some(v)).is_none() {
        return Value::Null;
    }
    match v {
        Value::Object(_) if num(v).is_some() => Value::Null,
        Value::Object(o) => Value::Object(
            o.iter()
                .filter(|(_, x)| there(Some(x)).is_some())
                .map(|(k, x)| (k.clone(), as_json(x)))
                .collect(),
        ),
        Value::Array(items) => Value::Array(items.iter().map(as_json).collect()),
        other => other.clone(),
    }
}
fn safe(s: &str) -> bool {
    (1..=64).contains(&s.len())
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
}
/// An id of a part, a wire or a Docs binding: 1 – 64 letters, digits, `_` and `-`.
fn safe_id(v: Option<&Value>) -> bool {
    text(v).is_some_and(safe)
}
fn fail<T>(message: impl Into<String>) -> R<T> {
    Err(message.into())
}

// ---------- tables ----------

static BOARDS: LazyLock<Value> = LazyLock::new(crate::boards::catalog);
/// `getBoard(id)`.
pub(crate) fn board(id: Option<&Value>) -> Option<&'static Value> {
    let id = text(id)?;
    BOARDS
        .as_array()?
        .iter()
        .find(|b| b["id"].as_str() == Some(id))
}
fn board_text(board: &Value, key: &str) -> String {
    board[key].as_str().unwrap_or("").to_string()
}
/// The boards a circuit can hold as a part (DEVBOARD_MODELS): the STM32 ones, each with the keys of its pins.
static MODELS: LazyLock<HashMap<String, HashSet<String>>> = LazyLock::new(|| {
    BOARDS
        .as_array()
        .into_iter()
        .flatten()
        .filter(|b| b.get("vendor").and_then(Value::as_str) != Some("renesas"))
        .filter_map(|b| b["id"].as_str())
        .map(|id| {
            let keys = crate::devboards::model_pins(id, 0.0, 0.0)
                .iter()
                .filter_map(|p| p["key"].as_str().map(String::from))
                .collect();
            (id.to_string(), keys)
        })
        .collect()
});
/// `Object.hasOwn(DEVBOARD_MODELS, model)`.
fn model_of(model: Option<&Value>) -> Option<&'static HashSet<String>> {
    MODELS.get(&show(model))
}
/// Every header pin of the boards, by id: where it is on the board's own drawing.
static BOARD_PINS: LazyLock<HashMap<String, (f64, f64)>> = LazyLock::new(|| {
    let tables = crate::pins::tables();
    ["FPB_PINS", "NUCLEO_PINS"]
        .iter()
        .flat_map(|key| tables[*key].as_array().cloned().unwrap_or_default())
        .filter_map(|p| {
            Some((
                p["id"].as_str()?.to_string(),
                (p["x"].as_f64()?, p["y"].as_f64()?),
            ))
        })
        .collect()
});
/// (TWO_PIN_TYPES, MULTI_PIN_TYPES).
static KINDS: LazyLock<(HashSet<String>, HashSet<String>)> = LazyLock::new(|| {
    let tables = crate::parts::tables();
    let set = |key: &str| {
        tables[key]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|k| k.as_str().map(String::from))
            .collect()
    };
    (set("TWO_PIN_TYPES"), set("MULTI_PIN_TYPES"))
});
fn terminal_keys(kind: &str) -> Vec<String> {
    crate::parts::terminal_keys(&json!({"type": kind}))
}
/// `isRaFamily(family)`.
fn is_ra(family: Option<&Value>) -> bool {
    family.is_some_and(|f| truthy(f) && show(Some(f)) == crate::raconfig::FAMILY_ID)
}

// ---------- the small checks of other modules ----------

/// A checked copy of the noise settings of a simulation (`validateNoise` of signals.js); null is the defaults.
pub fn validate_noise(value: &Value) -> R<Value> {
    if value.is_null() {
        return Ok(json!({"enabled": false, "bitErrorRate": 0, "glitchRate": 0, "jitterNs": 0}));
    }
    if plain(Some(value)).is_none() {
        return fail("노이즈 설정을 확인하세요.");
    }
    let or = |key: &str, default: Value| match get(value, key) {
        Some(v) if !v.is_null() => v.clone(),
        _ => default,
    };
    let enabled = or("enabled", json!(false));
    if !enabled.is_boolean() {
        return fail("noise.enabled는 true/false입니다.");
    }
    let mut noise = Map::new();
    noise.insert("enabled".into(), enabled);
    for key in ["bitErrorRate", "glitchRate"] {
        let v = or(key, json!(0));
        if !finite(Some(&v)).is_some_and(|n| (0.0..=1.0).contains(&n)) {
            return fail(format!("noise.{key}: 0~1 범위의 숫자가 필요합니다."));
        }
        noise.insert(key.into(), v);
    }
    let jitter = or("jitterNs", json!(0));
    if !finite(Some(&jitter)).is_some_and(|n| (0.0..=1e6).contains(&n)) {
        return fail("noise.jitterNs: 0~1000000 ns 범위의 숫자가 필요합니다.");
    }
    noise.insert("jitterNs".into(), jitter);
    Ok(Value::Object(noise))
}
const BASE64: fn(u8) -> bool = |b| b.is_ascii_alphanumeric() || matches!(b, b'+' | b'/' | b'=');
/// An SD card's saved contents (`validCardImage` of sdcard.js): '' or `SD1:<size>:<base64>` of at most 4 MB.
pub fn valid_card_image(v: Option<&Value>) -> bool {
    let Some(s) = text(v) else { return false };
    s.is_empty()
        || s.len() <= 4 * 1024 * 1024
            && s.strip_prefix("SD1:")
                .and_then(|rest| {
                    ["64:", "128:", "256:"]
                        .iter()
                        .find_map(|size| rest.strip_prefix(size))
                })
                .is_some_and(|data| data.bytes().all(BASE64))
}
/// A camera's picture (`validCameraImage` of camera.js): '' or an image data URL of at most 1.5 MB.
pub fn valid_camera_image(v: Option<&Value>) -> bool {
    let Some(s) = text(v) else { return false };
    s.is_empty()
        || s.len() <= 1_500_000
            && s.strip_prefix("data:image/")
                .and_then(|rest| {
                    ["png", "jpeg", "gif", "webp", "bmp", "x-ms-bmp"]
                        .iter()
                        .find_map(|kind| {
                            rest.strip_prefix(kind)
                                .and_then(|r| r.strip_prefix(";base64,"))
                        })
                })
                .is_some_and(|data| !data.is_empty() && data.bytes().all(BASE64))
}
const DATA_FLASH_SIZE: f64 = 8192.0;
const DATA_FLASH_UNIT: f64 = 4.0;
/// A checked copy of a project's saved RA data flash contents (`validateDataFlash` of ra-data-flash.js): the
/// programmed 4-byte units as `[{at, hex}]`, runs that touch joined into one. Null is none.
pub fn validate_data_flash(runs: &Value) -> R<Option<Vec<Value>>> {
    if runs.is_null() {
        return Ok(None);
    }
    let bad = || "저장된 데이터 플래시 내용이 올바르지 않습니다.".to_string();
    let list = runs
        .as_array()
        .filter(|l| l.len() as f64 <= DATA_FLASH_SIZE / DATA_FLASH_UNIT)
        .ok_or_else(bad)?;
    let mut end = 0.0;
    let mut joined: Vec<(f64, String)> = Vec::new();
    for run in list {
        let at = integer(get(run, "at"))
            .filter(|at| at % DATA_FLASH_UNIT == 0.0)
            .ok_or_else(bad)?;
        let hex = text(get(run, "hex"))
            .filter(|h| {
                !h.is_empty()
                    && h.len() % 8 == 0
                    && h.bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
            .ok_or_else(bad)?;
        let bytes = hex.len() as f64 / 2.0;
        if at < end || at + bytes > DATA_FLASH_SIZE {
            return Err(bad());
        }
        match joined.last_mut() {
            Some(last) if at == end => last.1.push_str(hex),
            _ => joined.push((at, hex.to_string())),
        }
        end = at + bytes;
    }
    Ok(Some(
        joined
            .into_iter()
            .map(|(at, hex)| json!({"at": out(at), "hex": hex}))
            .collect(),
    ))
}

// ---------- new projects ----------

/// The settings a new project of `family` starts with.
pub fn new_project_settings(family: &str) -> R<Value> {
    let mcu = crate::family::new_project_mcu(family)
        .ok_or_else(|| format!("지원하지 않는 MCU입니다: {family}"))?;
    let mut settings = json!({
        "family": mcu.family,
        "pins": {},
        "peripherals": {},
        "nvic": {},
        "timerClockHz": mcu.timer_clock_hz,
    });
    if mcu.couple_files {
        settings["coupleFiles"] = json!(true);
    }
    Ok(settings)
}
/// An example's console: USART2 on PA2 / PA3 (the ST-LINK virtual COM port, 115200 8N1) added to the settings unless
/// they already use USART2 or one of the two pins (`consoleUart` of mcu-config.js).
fn console_uart(mut mcu: Value) -> R<Value> {
    let asked = json!({
        "family": mcu["family"],
        "pins": {"PA2": mcu["pins"]["PA2"], "PA3": mcu["pins"]["PA3"]},
        "peripherals": Value::Object(mcu["peripherals"].as_object().into_iter().flatten()
            .map(|(id, p)| (id.clone(), if id == "USART2" { p.clone() } else { json!(true) })).collect()),
    });
    let Some(add) = crate::ioc::console_uart(&asked)? else {
        return Ok(mcu);
    };
    if let (Some(pins), Some(more)) = (mcu["pins"].as_object_mut(), add["pins"].as_object()) {
        for (pin, setting) in more {
            pins.insert(pin.clone(), setting.clone());
        }
    }
    let ordered: Map<String, Value> = add["order"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(|id| {
            let p = if id == "USART2" {
                add["usart"].clone()
            } else {
                mcu["peripherals"][id].clone()
            };
            (id.to_string(), p)
        })
        .collect();
    mcu["peripherals"] = Value::Object(ordered);
    Ok(mcu)
}
// The generator's own UART greeting is left out: the new project's main.c says hello once, with printf.
const GREETING: [&str; 1] = [r#"uint8_t message[] = "HAL ready\r\n";"#];
const GREETING_SENT: [&str; 4] = [
    "HAL_UART_Transmit(&huart2, message, sizeof(message) - 1, 100);",
    "HAL_UART_Transmit(&huart2, message, sizeof(message)- 1, 100);",
    "HAL_UART_Transmit(&huart2, message, sizeof(message) -1, 100);",
    "HAL_UART_Transmit(&huart2, message, sizeof(message)-1, 100);",
];
/// The text without its first line that is one of `lines` (after spaces and tabs, with its line end).
fn without_line(text: &str, lines: &[&str]) -> String {
    let mut out = String::with_capacity(text.len());
    let mut found = false;
    for line in text.split_inclusive('\n') {
        let is = !found
            && line.strip_suffix('\n').is_some_and(|l| {
                let l = l.strip_suffix('\r').unwrap_or(l);
                lines.contains(&l.trim_start_matches([' ', '\t']))
            });
        if is {
            found = true;
        } else {
            out.push_str(line);
        }
    }
    out
}
fn hidden_surfaces() -> Value {
    json!({"board": {"hidden": true}, "breadboard": {"hidden": true}})
}
fn hal_blank(mcu: Value) -> R<Value> {
    let generated = crate::pfiles::generate_hal(&mcu, false, false)?;
    let quiet = without_line(&without_line(&generated, &GREETING), &GREETING_SENT);
    let hello = quiet.replacen(
        "/* USER CODE BEGIN 2 */",
        "/* USER CODE BEGIN 2 */\n  printf(\"HAL ready\\n\");",
        1,
    );
    let code = crate::cformat::format_code(&hello, 4.0, None).0;
    Ok(
        json!({"format": FORMAT, "version": 2, "name": "새 회로", "components": [], "wires": [], "surfaces": hidden_surfaces(),
            "mcu": mcu, "firmware": {"mode": "hal", "files": []}, "code": code}),
    )
}
/// An empty project of an MCU family (the default family when none is given).
pub fn blank_project(family: Option<&Value>) -> R<Value> {
    // A Renesas RA board starts as e² studio's FSP template: the board's pins (LEDs, S1) and an empty hal_entry().
    if is_ra(family) {
        return Ok(
            json!({"format": FORMAT, "version": 2, "name": "새 회로", "components": [], "wires": [], "surfaces": hidden_surfaces(),
                "mcu": crate::raconfig::default_mcu(family)?, "firmware": {"mode": "fsp", "files": []}, "code": crate::ragen::hal_entry(false)}),
        );
    }
    // A new STM32 project prints on the UART (feature 44, 2026-11-12 user decision "기본값도 UART로"): USART2 on PA2 /
    // PA3 (the ST-LINK virtual COM port, 115200 8N1) is on, and the generated _write / _read carry printf / scanf.
    let family = match family {
        None | Some(Value::Null) => DEFAULT_FAMILY,
        Some(Value::String(f)) => f,
        Some(_) => return fail("new_project_mcu: family가 필요합니다."),
    };
    hal_blank(console_uart(new_project_settings(family)?)?)
}
/// What an example circuit starts from: without the UART console (an example sets its own pins) and with the main
/// board and the built-in breadboard shown.
pub fn example_project() -> R<Value> {
    let mut mcu = crate::mcuconfig::default_mcu(DEFAULT_FAMILY)?;
    mcu["pins"] = json!({});
    let mut project = hal_blank(mcu)?;
    if let Some(o) = project.as_object_mut() {
        o.shift_remove("surfaces");
    }
    Ok(project)
}
/// An empty circuit on the start board (NUCLEO-F103RB); the board itself is added from the empty-circuit guide.
pub fn start_project() -> R<Value> {
    let start = board(Some(&json!(crate::boards::START_BOARD_ID))).ok_or(BROKEN)?;
    let mut project = blank_project(start.get("mcuFamily"))?;
    project["boardId"] = start["id"].clone();
    Ok(project)
}
/// An empty project of a board, with the board shown.
pub fn project_for_board(id: Option<&Value>) -> R<Value> {
    let default = json!(crate::boards::DEFAULT_BOARD_ID);
    let id = id.unwrap_or(&default);
    let Some(chosen) = board(Some(id)) else {
        return fail("지원하지 않는 보드입니다.");
    };
    let mut project = blank_project(chosen.get("mcuFamily"))?;
    project["boardId"] = id.clone();
    project["surfaces"] = json!({"board": {"hidden": false}, "breadboard": {"hidden": true}});
    Ok(project)
}

// ---------- projects saved by earlier versions ----------

/// `part:<id>:p7` … `p10` of a ZS-042 → the left pin of the same signal (p3 … p6).
fn zs042_moved(id: Option<&Value>, parts: &[Option<&Value>]) -> Value {
    let moved = text(id).and_then(|s| {
        let (owner, pin) = s.strip_prefix("part:")?.split_once(':')?;
        let n = match pin {
            "p7" => 3,
            "p8" => 4,
            "p9" => 5,
            "p10" => 6,
            _ => return None,
        };
        (!owner.is_empty() && parts.iter().any(|p| text(*p) == Some(owner)))
            .then(|| json!(format!("part:{owner}:p{n}")))
    });
    moved.unwrap_or_else(|| raw(id))
}
/// 1.27.0 ZS-042 DS3231 (ref_ds3231_zs042_10) had 4 pass-through pins p7..p10 tied to p3..p6; they were removed in
/// 1.28.0, so their wires and breadboard pins move to the left pin of the same signal. None: nothing to move.
fn migrate_zs042(data: &Value) -> R<Option<Value>> {
    let Some(components) = get(data, "components").and_then(Value::as_array) else {
        return Ok(None);
    };
    let parts: Vec<Option<&Value>> = components
        .iter()
        .filter(|p| text(get(p, "type")) == Some(ZS042))
        .map(|p| get(p, "id"))
        .collect();
    if parts.is_empty() {
        return Ok(None);
    }
    let has = |id: Option<&Value>| parts.iter().any(|p| same(*p, id));
    let mut moved_parts = Vec::with_capacity(components.len());
    for p in components {
        if !has(get(p, "id")) {
            moved_parts.push(p.clone());
            continue;
        }
        if p.is_null() || there(Some(p)).is_none() {
            return fail(BROKEN);
        }
        let Some(attached) = get(p, "attachments").filter(|a| truthy(a) && is_object(a)) else {
            moved_parts.push(p.clone());
            continue;
        };
        let mut a = Map::new();
        for (k, v) in entries(attached) {
            let n = match k.as_str() {
                "p7" => "p3".to_string(),
                "p8" => "p4".to_string(),
                "p9" => "p5".to_string(),
                "p10" => "p6".to_string(),
                _ => k.clone(),
            };
            if !a.contains_key(&n) || n == k {
                a.insert(n, v.clone());
            }
        }
        let mut q = p.clone();
        q["attachments"] = Value::Object(a);
        moved_parts.push(q);
    }
    let wires = match get(data, "wires").and_then(Value::as_array) {
        None => raw(get(data, "wires")),
        Some(wires) => Value::Array(
            wires
                .iter()
                .filter_map(|w| {
                    if !truthy(w) {
                        return Some(w.clone());
                    }
                    // Anything else that is not an object has no ends: `undefined !== undefined` drops it.
                    let o = plain(Some(w))?;
                    let (from, to) = (
                        zs042_moved(get(w, "from"), &parts),
                        zs042_moved(get(w, "to"), &parts),
                    );
                    if same(there(Some(&from)), there(Some(&to))) {
                        return None;
                    }
                    let mut q = o.clone();
                    q.insert("from".into(), from);
                    q.insert("to".into(), to);
                    Some(Value::Object(q))
                })
                .collect(),
        ),
    };
    let mut next = data.as_object().cloned().unwrap_or_default();
    next.insert("components".into(), Value::Array(moved_parts));
    next.insert("wires".into(), wires);
    Ok(Some(Value::Object(next)))
}
/// ESP32 / Raspberry Pi boards are no longer supported (feature 49): a project saved with them opens without those
/// boards, the wires to their pins and the parts' legs plugged into their pins, and an ESP32 run target becomes the
/// simulator. → (the project without them, what went) or none when nothing was taken out.
pub fn strip_unsupported_boards(data: &Value) -> Option<(Value, Value)> {
    let components = get(data, "components").and_then(Value::as_array);
    let gone: Vec<usize> = components
        .into_iter()
        .flatten()
        .enumerate()
        .filter(|(_, p)| {
            text(get(p, "type")) == Some("devboard") && model_of(get(p, "model")).is_none()
        })
        .map(|(i, _)| i)
        .collect();
    let native = get(data, "ide").and_then(|ide| get(ide, "native"));
    let target = native.and_then(|n| text(get(n, "target"))) == Some("esp32");
    if gone.is_empty() && !target {
        return None;
    }
    let all = components.map_or(&[][..], Vec::as_slice);
    let prefixes: Vec<String> = gone
        .iter()
        .map(|i| format!("devboard:{}:", show(get(&all[*i], "id"))))
        .collect();
    let on_board =
        |id: Option<&Value>| text(id).is_some_and(|s| prefixes.iter().any(|p| s.starts_with(p)));
    let mut removed_wires = 0;
    let wires = match get(data, "wires").and_then(Value::as_array) {
        None => raw(get(data, "wires")),
        Some(wires) => {
            let kept: Vec<Value> = wires
                .iter()
                .filter(|w| {
                    !(truthy(w)
                        && is_object(w)
                        && (on_board(get(w, "from")) || on_board(get(w, "to"))))
                })
                .cloned()
                .collect();
            removed_wires = wires.len() - kept.len();
            Value::Array(kept)
        }
    };
    let mut detached = 0;
    let kept = match components {
        None => raw(get(data, "components")),
        Some(list) => Value::Array(
            list.iter()
                .enumerate()
                .filter(|(i, _)| !gone.contains(i))
                .map(|(_, p)| {
                    let Some(o) = plain(Some(p)) else {
                        return p.clone();
                    };
                    let mut q = o.clone();
                    let mut changed = false;
                    for key in ["attachA", "attachB"] {
                        if on_board(there(q.get(key))) {
                            q.shift_remove(key);
                            changed = true;
                        }
                    }
                    let plugged: Option<Vec<(String, Value)>> = there(q.get("attachments"))
                        .filter(|a| truthy(a) && is_object(a))
                        .filter(|a| entries(a).iter().any(|(_, id)| on_board(there(Some(id)))))
                        .map(|a| {
                            entries(a)
                                .into_iter()
                                .filter(|(_, id)| !on_board(there(Some(id))))
                                .map(|(k, id)| (k, id.clone()))
                                .collect()
                        });
                    if let Some(left) = plugged {
                        if left.is_empty() {
                            q.shift_remove("attachments");
                        } else {
                            q.insert(
                                "attachments".into(),
                                Value::Object(left.into_iter().collect()),
                            );
                        }
                        changed = true;
                    }
                    if changed {
                        detached += 1;
                        Value::Object(q)
                    } else {
                        p.clone()
                    }
                })
                .collect(),
        ),
    };
    let mut next = data.as_object().cloned().unwrap_or_default();
    next.insert("components".into(), kept);
    next.insert("wires".into(), wires);
    if target {
        let mut ide = get(data, "ide")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        let mut n = native
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        n.insert("target".into(), json!("simulator"));
        ide.insert("native".into(), Value::Object(n));
        next.insert("ide".into(), Value::Object(ide));
    }
    let boards: Vec<Value> = gone
        .iter()
        .map(|i| {
            let p = &all[*i];
            json!({"id": raw(get(p, "id")), "name": raw(get(p, "name")), "model": raw(get(p, "model"))})
        })
        .collect();
    Some((
        Value::Object(next),
        json!({"boards": boards, "wires": removed_wires, "attachments": detached, "target": target}),
    ))
}
/// The notice for a project opened without its ESP32 / Raspberry Pi boards (`removed` of strip_unsupported_boards).
pub fn removed_boards_message(removed: &Value) -> R<String> {
    let boards = get(removed, "boards")
        .and_then(Value::as_array)
        .ok_or(BROKEN)?;
    let mut names = Vec::with_capacity(boards.len());
    for b in boards {
        if b.is_null() || there(Some(b)).is_none() {
            return fail(BROKEN);
        }
        names.push(match get(b, "name") {
            None | Some(Value::Null) => String::new(),
            name => show(name),
        });
    }
    let count = |key: &str| {
        get(removed, key)
            .filter(|v| truthy(v))
            .map(|v| show(Some(v)))
    };
    let wires = count("wires").map_or(String::new(), |n| format!("와 그 보드에 연결된 배선 {n}개"));
    let parts = count("attachments").map_or(String::new(), |n| {
        format!(" 그 보드 핀에 직접 꽂혀 있던 부품 {n}개는 떼어 두었습니다.")
    });
    Ok(format!(
        "이 버전은 ESP32·라즈베리파이 보드를 지원하지 않습니다. 보드 {}개({}){wires}를 빼고 열었습니다. STM32·FPB-RA6E1 보드와 나머지 부품은 그대로입니다.{parts}",
        boards.len(),
        names.join(", ")
    ))
}

// ---------- the check ----------

fn stlink_serial(value: Option<&Value>, name: &str) -> R<Option<Value>> {
    let Some(value) = value else { return Ok(None) };
    let fine = value.as_str().is_some_and(|s| {
        (8..=40).contains(&s.len()) && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
    });
    if fine {
        Ok(Some(value.clone()))
    } else {
        fail(format!("{name}: ST-LINK 시리얼을 확인하세요."))
    }
}
/// A scale a part or a surface may have: the value as it came.
fn scale(value: &Value) -> R<Value> {
    crate::geom::valid_scale(Some(value)).map(|_| value.clone())
}
/// The ranges of a catalog part's settings by its family: what the editor lets a user set.
fn family_ranges(family: &str, kind: &str) -> Vec<(String, f64, f64)> {
    let own: &[(&str, f64, f64)] = match family {
        "resistor" => &[("value", 1.0, 1e7)],
        "potentiometer" => &[("value", 1.0, 1e7), ("position", 0.0, 100.0)],
        "capacitor" => &[("value", 0.001, 100_000.0)],
        "slide" if kind.contains("dp3t") => &[("position", 0.0, 2.0)],
        "slide" => &[("position", 0.0, 1.0)],
        "temperature" => &[("temperature", -40.0, 125.0)],
        "ultrasonic" => &[("distance", 2.0, 400.0)],
        "dc_supply" => &[("voltage", 6.0, 24.0)],
        "uart" | "rs485" => &[("baud", 300.0, 2_000_000.0)],
        "dht11" => &[("temperature", 0.0, 50.0), ("humidity", 20.0, 90.0)],
        "dht22" => &[("temperature", -40.0, 80.0), ("humidity", 0.0, 100.0)],
        _ => &[],
    };
    let mut ranges: Vec<(String, f64, f64)> = own
        .iter()
        .map(|(k, low, high)| ((*k).to_string(), *low, *high))
        .collect();
    for (key, low, high) in device_ranges(family) {
        match ranges.iter_mut().find(|r| r.0 == key) {
            Some(r) => (r.1, r.2) = (low, high),
            None => ranges.push((key, low, high)),
        }
    }
    ranges
}
/// `DEVICE_RANGES[kind]` as (setting, least, most).
fn device_ranges(kind: &str) -> Vec<(String, f64, f64)> {
    crate::devdefs::tables()["DEVICE_RANGES"]
        .get(kind)
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .map(|(key, range)| {
            (
                key.clone(),
                range[0].as_f64().unwrap_or(f64::NAN),
                range[1].as_f64().unwrap_or(f64::NAN),
            )
        })
        .collect()
}
/// `DEVICE_ADDRESSES[kind]`.
fn device_addresses(kind: &str) -> Option<Vec<f64>> {
    crate::devdefs::tables()["DEVICE_ADDRESSES"]
        .get(kind)
        .and_then(Value::as_array)
        .map(|list| list.iter().filter_map(Value::as_f64).collect())
}
/// The fields of an STM32 board component checked as the project it becomes when edited (code, mcu, firmware …).
fn stm32_software(p: &Value, version: &Value, name: &str) -> R<Vec<(&'static str, Value)>> {
    if !get(p, "rotation")
        .and_then(num)
        .is_some_and(|r| QUARTERS.contains(&r))
    {
        return fail(format!("{name}: STM32 보드는 90° 단위로 회전합니다."));
    }
    let mut asked = Map::new();
    asked.insert("format".into(), json!(FORMAT));
    asked.insert("version".into(), version.clone());
    asked.insert("name".into(), json!("board"));
    asked.insert("code".into(), raw(get(p, "code")));
    asked.insert("components".into(), json!([]));
    asked.insert("wires".into(), json!([]));
    asked.insert("boardId".into(), raw(get(p, "model")));
    asked.insert("mcu".into(), raw(get(p, "mcu")));
    asked.insert("firmware".into(), raw(get(p, "firmware")));
    for key in ["ide", "deviceDocs"] {
        if let Some(v) = get(p, key) {
            asked.insert(key.into(), v.clone());
        }
    }
    let own = validate_project(&Value::Object(asked))?;
    let mut fields = vec![
        ("model", raw(get(p, "model"))),
        ("code", own["code"].clone()),
    ];
    if let Some(serial) = stlink_serial(get(p, "stlink"), name)? {
        fields.push(("stlink", serial));
    }
    for key in ["mcu", "firmware", "deviceDocs"] {
        if let Some(v) = own.get(key) {
            fields.push((key, v.clone()));
        }
    }
    if let Some(ide) = own.get("ide") {
        let mut kept = Map::new();
        for key in ["breakpoints", "watches", "plots"] {
            if let Some(v) = ide.get(key) {
                kept.insert(key.into(), v.clone());
            }
        }
        fields.push(("ide", Value::Object(kept)));
    }
    for key in ["scale", "scaleX", "scaleY"] {
        if let Some(v) = get(p, key) {
            fields.push((key, scale(v)?));
        }
    }
    Ok(fields)
}

/// What a wire end or a leg can be attached to in one circuit: a header pin of the main board (unless it is hidden),
/// a breadboard hole, a pin of another board.
struct Anchors<'a> {
    components: &'a [Value],
    board_hidden: bool,
    breadboard_hidden: bool,
}
impl Anchors<'_> {
    fn has(&self, id: Option<&Value>) -> bool {
        let Some(id) = text(id) else { return false };
        (!self.board_hidden && BOARD_PINS.contains_key(id))
            || crate::place::hole_exists(id, self.components, self.breadboard_hidden)
            || self.on_board_part(id)
    }
    fn on_board_part(&self, id: &str) -> bool {
        let Some((owner, key)) = id
            .strip_prefix("devboard:")
            .and_then(|rest| rest.split_once(':'))
            .filter(|(owner, _)| !owner.is_empty())
        else {
            return false;
        };
        self.components
            .iter()
            .find(|p| text(get(p, "id")) == Some(owner) && text(get(p, "type")) == Some("devboard"))
            .and_then(|p| model_of(get(p, "model")))
            .is_some_and(|keys| keys.contains(key))
    }
    /// Where a version 1 file's anchor is: a header pin on the board's own drawing, or a hole.
    fn place(&self, id: &str) -> R<(f64, f64)> {
        BOARD_PINS
            .get(id)
            .copied()
            .or_else(|| crate::place::hole_place(id, self.components))
            .ok_or_else(|| BROKEN.to_string())
    }
}

fn component(p: &Value, version: &Value, anchors: &Anchors, ids: &mut HashSet<String>) -> R<Value> {
    if p.is_null() || there(Some(p)).is_none() {
        return fail(BROKEN);
    }
    let v1 = version.as_f64() == Some(1.0);
    let id = text(get(p, "id")).filter(|s| safe(s) && !ids.contains(*s));
    let Some(id) = id else {
        return fail("부품 ID가 중복되거나 올바르지 않습니다.");
    };
    ids.insert(id.to_string());
    let kind = text(get(p, "type")).filter(|k| {
        KINDS.0.contains(*k) || KINDS.1.contains(*k) || *k == "breadboard" || *k == "devboard"
    });
    let name = text(get(p, "name")).filter(|n| units(n) <= 80);
    let (Some(kind), Some(name)) = (kind, name) else {
        return fail("지원하지 않는 부품입니다.");
    };
    let placed = (
        finite(get(p, "x")),
        finite(get(p, "y")),
        finite(get(p, "rotation")),
    );
    let turn = match placed {
        (Some(_), Some(_), Some(r)) if v1 && (r == 0.0 || r == 1.0) => out(r * 90.0),
        (Some(_), Some(_), Some(r)) if !v1 && (0.0..360.0).contains(&r) => raw(get(p, "rotation")),
        _ => return fail("부품 좌표 또는 회전 각도가 올바르지 않습니다."),
    };
    let mut q = Map::new();
    for key in ["id", "name", "type", "x", "y"] {
        q.insert(key.into(), raw(get(p, key)));
    }
    q.insert("rotation".into(), turn);
    if kind == "breadboard" {
        if let Some(variant) = get(p, "variant") {
            if variant.as_str() != Some("full") {
                return fail("지원하지 않는 빵판 종류입니다.");
            }
            q.insert("variant".into(), json!("full"));
        }
    }
    if kind == "devboard" {
        if model_of(get(p, "model")).is_none() {
            return fail(format!("{name}: 지원하지 않는 보드입니다."));
        }
        // Another STM32 board keeps the software of a whole project: main.c, pin settings, sources, Docs, debug
        // points.
        for (key, value) in stm32_software(p, version, name)? {
            q.insert(key.into(), value);
        }
        return Ok(Value::Object(q));
    }
    for key in ["scale", "scaleX", "scaleY"] {
        if let Some(v) = get(p, key) {
            q.insert(key.into(), scale(v)?);
        }
    }
    if let Some(skew) = get(p, "skewX") {
        if !finite(Some(skew)).is_some_and(|s| s.abs() < 90.0) {
            return fail("장치 변형 정보를 확인하세요.");
        }
        q.insert("skewX".into(), skew.clone());
    }
    if let Some(def) = crate::catalog::all()["CATALOG_DEFS"].get(kind) {
        for (key, value) in def["defaults"].as_object().into_iter().flatten() {
            let input = get(p, key).filter(|v| !v.is_null()).unwrap_or(value);
            let bad = match value {
                Value::Number(_) => !finite(Some(input)).is_some_and(|n| n.abs() <= 1e7),
                Value::String(_) => !input.is_string(),
                _ => false,
            };
            if bad {
                return fail(format!("{name}: {key} 값을 확인하세요."));
            }
            q.insert(key.clone(), input.clone());
        }
        let family = crate::catalog::entry(kind)
            .and_then(|v| v.get("family"))
            .and_then(Value::as_str)
            .unwrap_or("");
        for (key, low, high) in family_ranges(family, kind) {
            let v = to_num(q.get(&key));
            if v < low || v > high {
                return fail(format!(
                    "{name}: {key} 범위는 {}~{}입니다.",
                    js_number(low),
                    js_number(high)
                ));
            }
        }
        if family == "slide" && integer(q.get("position")).is_none() {
            return fail("스위치 위치는 정수입니다.");
        }
        if family == "i2c" && !integer(q.get("address")).is_some_and(|a| (8.0..=119.0).contains(&a))
        {
            return fail("I2C 주소를 확인하세요.");
        }
        if let Some(allowed) = device_addresses(family) {
            if !q
                .get("address")
                .and_then(num)
                .is_some_and(|a| allowed.contains(&a))
            {
                return fail(format!("{name}: 지원하지 않는 I2C 주소입니다."));
            }
        }
        if family == "led" && !text(q.get("color")).is_some_and(|c| LED_COLORS.contains(&c)) {
            return fail("LED 색상을 확인하세요.");
        }
        if family == "sd"
            && !(q
                .get("sizeMB")
                .and_then(num)
                .is_some_and(|s| [64.0, 128.0, 256.0].contains(&s))
                && valid_card_image(there(q.get("cardImage"))))
        {
            return fail(format!(
                "{name}: SD 카드 용량(64/128/256 MB) 또는 카드 이미지(4 MB 이하)를 확인하세요."
            ));
        }
        if family == "dcmi"
            && !(text(q.get("pattern"))
                .is_some_and(|k| ["colorbars", "gradient", "ball", "image"].contains(&k))
                && valid_camera_image(there(q.get("image"))))
        {
            return fail(format!(
                "{name}: 카메라 패턴 또는 이미지(data URL, 1.5 MB 이하)를 확인하세요."
            ));
        }
    }
    if KINDS.0.contains(kind) {
        let span = get(p, "span")
            .filter(|v| !v.is_null())
            .cloned()
            .unwrap_or(json!(70));
        if !finite(Some(&span)).is_some_and(|s| (4.0..=1000.0).contains(&s)) {
            return fail("부품 다리 간격이 올바르지 않습니다.");
        }
        q.insert("span".into(), span);
        for key in ["attachA", "attachB"] {
            if let Some(anchor) = get(p, key).filter(|v| !v.is_null()) {
                if !anchors.has(Some(anchor)) {
                    return fail("존재하지 않는 부품 연결점입니다.");
                }
                q.insert(key.into(), anchor.clone());
            }
        }
        let (a, b) = (text(q.get("attachA")), text(q.get("attachB")));
        if a.is_some() && a == b {
            return fail("두 다리를 같은 구멍에 꽂을 수 없습니다.");
        }
        if let (true, Some(a), Some(b)) = (v1, a, b) {
            let (a, b) = (anchors.place(a)?, anchors.place(b)?);
            let (dx, dy) = (b.0 - a.0, b.1 - a.1);
            q.insert("x".into(), out((a.0 + b.0) / 2.0));
            q.insert("y".into(), out((a.1 + b.1) / 2.0));
            q.insert("span".into(), out(crate::jsmath::hypot(dx, dy)));
            let angle = crate::jsmath::atan2(dy, dx) * 180.0 / std::f64::consts::PI;
            q.insert(
                "rotation".into(),
                out(crate::parts::stm_normalize_angle(angle)),
            );
        }
    } else {
        let map: Vec<(String, &Value)> = if v1 {
            [("a", "attachA"), ("b", "attachB")]
                .iter()
                .filter_map(|(key, field)| {
                    get(p, field)
                        .filter(|v| truthy(v))
                        .map(|v| ((*key).to_string(), v))
                })
                .collect()
        } else {
            match get(p, "attachments").filter(|v| truthy(v)) {
                None => Vec::new(),
                Some(map) if plain(Some(map)).is_some() => entries(map),
                Some(_) => return fail("부품 핀 연결 정보가 올바르지 않습니다."),
            }
        };
        let keys = terminal_keys(kind);
        let mut used: Vec<&str> = Vec::new();
        let mut clean = Map::new();
        for (key, anchor) in map {
            let anchor = there(Some(anchor));
            let free = text(anchor).is_some_and(|s| !used.contains(&s));
            if !keys.contains(&key) || !anchors.has(anchor) || !free {
                return fail("다핀 부품 연결점이 중복되거나 올바르지 않습니다.");
            }
            used.extend(text(anchor));
            clean.insert(key, raw(anchor));
        }
        if !clean.is_empty() {
            q.insert("attachments".into(), Value::Object(clean));
        }
    }
    // The basic parts: their settings are checked one by one.
    let color = text(get(p, "color")).filter(|c| LED_COLORS.contains(c));
    if kind == "resistor" {
        if !finite(get(p, "value")).is_some_and(|v| (1.0..=10_000_000.0).contains(&v)) {
            return fail("저항 범위는 1 Ω~10 MΩ입니다.");
        }
        q.insert("value".into(), raw(get(p, "value")));
    }
    if kind == "led" {
        if color.is_none() {
            return fail("LED 색상이 올바르지 않습니다.");
        }
        q.insert("color".into(), raw(get(p, "color")));
    }
    let mut number = |key: &str, low: f64, high: f64| -> R<()> {
        if !finite(get(p, key)).is_some_and(|v| v >= low && v <= high) {
            return fail(format!(
                "{name}: {key} 범위는 {}~{}입니다.",
                js_number(low),
                js_number(high)
            ));
        }
        q.insert(key.into(), raw(get(p, key)));
        Ok(())
    };
    match kind {
        "dc_supply" => number("voltage", 6.0, 24.0)?,
        "capacitor" => number("value", 0.001, 100_000.0)?,
        "potentiometer" => {
            number("value", 1.0, 1e7)?;
            number("position", 0.0, 100.0)?;
        }
        "slide" => {
            if !get(p, "position")
                .and_then(num)
                .is_some_and(|v| v == 0.0 || v == 1.0)
            {
                return fail("스위치 위치가 올바르지 않습니다.");
            }
            number("position", 0.0, 1.0)?;
        }
        "temperature" => number("temperature", -40.0, 125.0)?,
        "ultrasonic" => number("distance", 2.0, 400.0)?,
        "uart" => {
            number("baud", 300.0, 2_000_000.0)?;
            if integer(get(p, "baud")).is_none() {
                return fail("UART 속도는 정수여야 합니다.");
            }
        }
        "i2c" => {
            number("address", 8.0, 119.0)?;
            if integer(get(p, "address")).is_none() {
                return fail("I²C 주소는 정수여야 합니다.");
            }
        }
        _ => {}
    }
    for (key, low, high) in device_ranges(kind) {
        number(&key, low, high)?;
        let whole = key == "switch" || key == "motion" || (kind == "encoder" && key == "position");
        if whole && integer(get(p, &key)).is_none() {
            return fail(format!("{name}: 정수 값을 입력하세요."));
        }
    }
    if let Some(allowed) = device_addresses(kind) {
        if !get(p, "address")
            .and_then(num)
            .is_some_and(|a| allowed.contains(&a))
        {
            return fail(format!("{name}: 지원하지 않는 I²C 주소입니다."));
        }
        q.insert("address".into(), raw(get(p, "address")));
    }
    Ok(Value::Object(q))
}

/// `/^part:([^:]+):([a-d]|p\d+)$/`: (part id, terminal key).
fn part_end(id: &str) -> Option<(&str, &str)> {
    let (owner, key) = id.strip_prefix("part:")?.split_once(':')?;
    let shaped = matches!(key, "a" | "b" | "c" | "d")
        || key
            .strip_prefix('p')
            .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()));
    (!owner.is_empty() && shaped).then_some((owner, key))
}
fn wire(w: &Value, anchors: &Anchors, components: &[Value], ids: &mut HashSet<String>) -> R<Value> {
    if w.is_null() || there(Some(w)).is_none() {
        return fail(BROKEN);
    }
    let end = |id: Option<&Value>| {
        // The expression read the end as a text, as JavaScript does (a list of one text reads as that text).
        let shown = show(id);
        anchors.has(id)
            || part_end(&shown).is_some_and(|(owner, key)| {
                components
                    .iter()
                    .find(|p| p["id"].as_str() == Some(owner))
                    .is_some_and(|p| {
                        terminal_keys(p["type"].as_str().unwrap_or(""))
                            .iter()
                            .any(|k| k == key)
                    })
            })
    };
    let (id, from, to, color) = (get(w, "id"), get(w, "from"), get(w, "to"), get(w, "color"));
    let shown = show(color);
    let coloured = shown.len() == 7
        && shown.starts_with('#')
        && shown[1..].bytes().all(|b| b.is_ascii_hexdigit());
    if !safe_id(id)
        || text(id).is_some_and(|s| ids.contains(s))
        || !end(from)
        || !end(to)
        || same(from, to)
        || !coloured
    {
        return fail("배선 정보가 올바르지 않습니다.");
    }
    let mut q = Map::new();
    for (key, value) in [("id", id), ("from", from), ("to", to), ("color", color)] {
        q.insert(key.into(), raw(value));
    }
    if let Some(points) = get(w, "points") {
        let fine = points.as_array().filter(|list| {
            list.len() <= 32
                && list.iter().all(|p| {
                    truthy(p) && finite(get(p, "x")).is_some() && finite(get(p, "y")).is_some()
                })
        });
        let Some(list) = fine else {
            return fail("배선 꺾임점은 유효한 좌표로 32개까지 지원합니다.");
        };
        q.insert(
            "points".into(),
            list.iter()
                .map(|p| json!({"x": p["x"], "y": p["y"]}))
                .collect(),
        );
    }
    ids.extend(text(id).map(String::from));
    Ok(Value::Object(q))
}

fn surfaces(given: &Value) -> R<Value> {
    const SIZE: &str = "보드 크기 설정을 확인하세요.";
    if plain(Some(given)).is_none() {
        return fail(SIZE);
    }
    let mut clean = Map::new();
    for key in ["board", "breadboard"] {
        let Some(source) = get(given, key) else {
            continue;
        };
        if plain(Some(source)).is_none() {
            return fail(SIZE);
        }
        let mut surface = Map::new();
        if let Some(hidden) = get(source, "hidden") {
            if !hidden.is_boolean() {
                return fail("장치 표시 설정을 확인하세요.");
            }
            surface.insert("hidden".into(), hidden.clone());
        }
        for field in ["scale", "scaleX", "scaleY"] {
            if let Some(v) = get(source, field) {
                surface.insert(field.into(), scale(v)?);
            }
        }
        for field in ["x", "y"] {
            if let Some(v) = get(source, field) {
                if finite(Some(v)).is_none() {
                    return fail("보드 위치를 확인하세요.");
                }
                surface.insert(field.into(), v.clone());
            }
        }
        if key == "board" {
            // The main board's turn in quarter turns (absent = 0°, as in every file saved before 1.48.0).
            if let Some(turn) = get(source, "rotation") {
                let Some(r) = num(turn).filter(|r| QUARTERS.contains(r)) else {
                    return fail("보드 회전 각도를 확인하세요 (0, 90, 180, 270).");
                };
                if r != 0.0 {
                    surface.insert("rotation".into(), turn.clone());
                }
            }
            // The main STM32 board's name (STM32-1) and ST-LINK serial, kept with it when another board is edited.
            if let Some(name) = get(source, "name") {
                if !name
                    .as_str()
                    .is_some_and(|n| !trim(n).is_empty() && units(n) <= 80)
                {
                    return fail("보드 이름을 확인하세요.");
                }
                surface.insert("name".into(), name.clone());
            }
            if let Some(serial) = stlink_serial(get(source, "stlink"), "보드")? {
                surface.insert("stlink".into(), serial);
            }
        }
        clean.insert(key.into(), Value::Object(surface));
    }
    Ok(Value::Object(clean))
}

js_re!(SOURCE, SOURCE_PATH);
/// (the checked sources, their names) of a project's `firmware`.
fn firmware(given: Option<&Value>, code: &str, mcu: Option<&Value>) -> R<Value> {
    let mode = given
        .filter(|f| truthy(f))
        .and_then(|f| text(get(f, "mode")))
        .filter(|m| ["sketch", "hal", "fsp"].contains(m));
    let files = given
        .and_then(|f| get(f, "files"))
        .and_then(Value::as_array)
        .filter(|l| l.len() <= MAX_SOURCE_FILES);
    let (Some(given), Some(mode), Some(files)) = (given, mode, files) else {
        return fail("펌웨어 소스 설정이 올바르지 않습니다.");
    };
    let mut names: Vec<String> = Vec::new();
    let (mut size, mut sdk_size) = (units(code), 0);
    let mut clean = Vec::with_capacity(files.len());
    // Feature 45: a file that started as a generated one (origin 'gen') or an STM32Cube SDK file (origin 'sdk', of:
    // its path in the SDK) is an edited copy of it. Edited SDK files (HAL, CMSIS) have their own 4 MB beside the 1 MB.
    for f in files {
        let name = text(get(f, "name")).filter(|n| {
            SOURCE.is_match(n) && {
                let taken: Vec<&str> = names.iter().map(String::as_str).collect();
                name_clash(&taken, n).is_empty()
            }
        });
        let (Some(name), Some(body)) = (name.filter(|_| truthy(f)), text(get(f, "text"))) else {
            return fail("소스 파일 이름/내용을 확인하세요.");
        };
        names.push(name.to_lowercase());
        let origin = get(f, "origin");
        let from = text(origin).filter(|o| *o == "gen" || *o == "sdk");
        if origin.is_some() && from.is_none() {
            return fail(format!("{name}: 파일 출처를 확인하세요."));
        }
        let of = get(f, "of");
        if of.is_some()
            && !(from == Some("sdk")
                && text(of).is_some_and(|path| {
                    (1..=200).contains(&path.len())
                        && path.bytes().all(|b| {
                            b.is_ascii_alphanumeric() || matches!(b, b'_' | b'.' | b'/' | b'-')
                        })
                        && !path.split('/').any(|part| part == "..")
                }))
        {
            return fail(format!("{name}: SDK 파일 경로를 확인하세요."));
        }
        // base: the generated text an edited generated file started from (the baseline when it is generated again).
        let base = get(f, "base");
        if base.is_some()
            && !(from == Some("gen") && text(base).is_some_and(|b| units(b) <= 300_000))
        {
            return fail(format!("{name}: 생성 원본을 확인하세요."));
        }
        if from == Some("sdk") {
            sdk_size += units(body);
        } else {
            size += units(body);
        }
        let mut file = Map::new();
        file.insert("name".into(), json!(name));
        file.insert("text".into(), json!(normalize_text(body)));
        if let Some(from) = from {
            file.insert("origin".into(), json!(from));
        }
        if let Some(path) = text(of) {
            file.insert("of".into(), json!(path));
        }
        if let Some(b) = text(base) {
            file.insert("base".into(), json!(normalize_text(b)));
        }
        clean.push(Value::Object(file));
    }
    if size > MAX_SOURCE_BYTES {
        return fail("소스 전체는 1 MB 이하로 선택하세요.");
    }
    if sdk_size > 4_000_000 {
        return fail("고친 SDK 파일은 모두 합쳐 4 MB 이하로 두세요.");
    }
    // Where main.c sits in an imported CubeIDE project (Core/Src): the build puts it there so its relative includes
    // work.
    let folder = get(given, "mainFolder");
    if folder.is_some()
        && !text(folder).is_some_and(|path| SOURCE.is_match(&format!("{path}/main.c")))
    {
        return fail("main.c 폴더 경로를 확인하세요.");
    }
    if mode == "hal" && mcu.is_none() {
        return fail("HAL 프로젝트에는 핀 설정이 필요합니다.");
    }
    // FSP projects are the Renesas RA boards' only mode (and only theirs).
    let ra = is_ra(mcu.and_then(|m| get(m, "family")));
    if (mode == "fsp") != ra {
        return fail(if ra {
            "Renesas RA 보드는 FSP 프로젝트로 작성합니다."
        } else {
            "FSP 프로젝트는 Renesas RA 보드에서만 씁니다."
        });
    }
    let mut out = Map::new();
    out.insert("mode".into(), json!(mode));
    out.insert("files".into(), Value::Array(clean));
    if let Some(path) = text(folder).filter(|p| !p.is_empty()) {
        out.insert("mainFolder".into(), json!(path));
    }
    Ok(Value::Object(out))
}

fn simulation(given: &Value) -> R<Value> {
    let step = get(given, "stepMs")
        .and_then(num)
        .filter(|s| [0.1, 0.5, 1.0, 5.0, 20.0].contains(s));
    let waveform = get(given, "pwmWaveform").filter(|w| w.is_boolean());
    let (true, Some(_), Some(waveform)) = (truthy(given) && is_object(given), step, waveform)
    else {
        return fail("시뮬레이션 시간 설정이 올바르지 않습니다.");
    };
    let mut clean = Map::new();
    clean.insert("stepMs".into(), raw(get(given, "stepMs")));
    clean.insert("pwmWaveform".into(), waveform.clone());
    if let Some(noise) = get(given, "noise") {
        clean.insert("noise".into(), validate_noise(noise)?);
    }
    // Button contact bounce (button-bounce.js): how long a press or release chatters, in ms. Absent or 0: clean
    // buttons.
    if let Some(bounce) = get(given, "bounceMs") {
        let Some(ms) = num(bounce).filter(|ms| [0.0, 2.0, 5.0, 10.0, 20.0].contains(ms)) else {
            return fail("버튼 채터링 시간이 올바르지 않습니다.");
        };
        if ms != 0.0 {
            clean.insert("bounceMs".into(), bounce.clone());
        }
    }
    Ok(Value::Object(clean))
}

/// A watch or a plotted variable: a text of at most 250 with something in it.
fn expression(v: &Value) -> bool {
    v.as_str()
        .is_some_and(|w| !trim(w).is_empty() && units(w) <= 250)
}
fn ide(given: &Value, sources: Option<&Value>) -> R<Value> {
    let lists = (
        get(given, "breakpoints")
            .and_then(Value::as_array)
            .filter(|l| l.len() <= 1000),
        get(given, "watches")
            .and_then(Value::as_array)
            .filter(|l| l.len() <= 20),
    );
    let (true, Some(breakpoints), Some(watches)) = (truthy(given), lists.0, lists.1) else {
        return fail("디버그 설정을 확인하세요.");
    };
    let mut names: HashSet<&str> = HashSet::from(["main.c"]);
    names.extend(
        sources
            .and_then(|f| f["files"].as_array())
            .into_iter()
            .flatten()
            .filter_map(|f| f["name"].as_str()),
    );
    let stops = breakpoints.iter().all(|b| {
        truthy(b)
            && text(get(b, "file")).is_some_and(|f| names.contains(f))
            && integer(get(b, "line")).is_some_and(|l| (1.0..=50000.0).contains(&l))
    });
    if !stops || !watches.iter().all(expression) {
        return fail("중단점 또는 감시식이 올바르지 않습니다.");
    }
    let mut clean = Map::new();
    clean.insert(
        "breakpoints".into(),
        breakpoints
            .iter()
            .map(|b| json!({"file": b["file"], "line": b["line"]}))
            .collect(),
    );
    clean.insert("watches".into(), Value::Array(watches.clone()));
    if let Some(plots) = get(given, "plots") {
        let fine = plots.as_array().filter(|list| {
            list.len() <= 8
                && list.iter().all(expression)
                && list
                    .iter()
                    .filter_map(Value::as_str)
                    .collect::<HashSet<_>>()
                    .len()
                    == list.len()
        });
        let Some(list) = fine else {
            return fail("변수 그래프 목록이 올바르지 않습니다.");
        };
        clean.insert("plots".into(), Value::Array(list.clone()));
    }
    if let Some(native) = get(given, "native") {
        let target = text(get(native, "target"))
            .filter(|t| ["simulator", "emulator", "arm", "host"].contains(t));
        let configuration =
            text(get(native, "configuration")).filter(|c| ["Debug", "Release"].contains(c));
        let (true, Some(target), Some(configuration)) = (truthy(native), target, configuration)
        else {
            return fail("IDE 실행 대상 설정을 확인하세요.");
        };
        let mut run = Map::new();
        run.insert("target".into(), json!(target));
        run.insert("configuration".into(), json!(configuration));
        // Feature 54: the optimisation level of each build configuration (only what is not -O0 is stored).
        if let Some(levels) = get(native, "optimization") {
            let stored = crate::build_level::settings(&as_json(levels))?;
            if !stored.is_empty() {
                run.insert("optimization".into(), Value::Object(stored));
            }
        }
        clean.insert("native".into(), Value::Object(run));
    }
    Ok(Value::Object(clean))
}

fn id_map(v: Option<&Value>) -> R<Value> {
    plain(v)
        .filter(|o| o.len() <= 100 && o.iter().all(|(k, x)| safe(k) && safe_id(there(Some(x)))))
        .map(|o| Value::Object(o.clone()))
        .ok_or_else(|| "장치 Docs 매핑을 확인하세요.".to_string())
}
fn device_docs(given: &Value) -> R<Value> {
    const IDS: &str = "장치 Docs 식별자를 확인하세요.";
    const RECORD: &str = "장치 Docs 기록을 확인하세요.";
    let bindings = get(given, "bindings")
        .and_then(Value::as_array)
        .filter(|l| truthy(given) && l.len() <= 100);
    let Some(bindings) = bindings else {
        return fail("장치 Docs 연결 정보를 확인하세요.");
    };
    let mut keys: HashSet<&str> = HashSet::new();
    let mut clean = Vec::with_capacity(bindings.len());
    for b in bindings {
        let key = text(get(b, "key")).filter(|k| safe(k) && !keys.contains(k));
        let api = text(get(b, "api")).filter(|a| units(a) <= 100);
        let (true, Some(key), true, Some(api)) = (truthy(b), key, safe_id(get(b, "type")), api)
        else {
            return fail(IDS);
        };
        keys.insert(key);
        let mode = if text(get(b, "mode")) == Some("baremetal") {
            "baremetal"
        } else {
            "hal"
        };
        let mut binding = Map::new();
        binding.insert("key".into(), json!(key));
        binding.insert("type".into(), raw(get(b, "type")));
        binding.insert("api".into(), json!(api));
        binding.insert("mode".into(), json!(mode));
        for field in ["parts", "pins", "peripherals"] {
            binding.insert(field.into(), id_map(get(b, field))?);
        }
        // slot: stable name prefix of inserted globals; added: what Docs itself created, restored on removal.
        if let Some(slot) = get(b, "slot") {
            if !integer(Some(slot)).is_some_and(|s| (0.0..=999.0).contains(&s)) {
                return fail(IDS);
            }
            binding.insert("slot".into(), slot.clone());
        }
        if let Some(added) = get(b, "added") {
            if plain(Some(added)).is_none() {
                return fail(RECORD);
            }
            let mut record = Map::new();
            for field in ["pins", "peripherals", "nvic", "parts", "boards", "wires"] {
                let list = match get(added, field).filter(|v| !v.is_null()) {
                    None => Vec::new(),
                    Some(list) => list
                        .as_array()
                        .filter(|l| l.len() <= 500 && l.iter().all(|v| safe_id(there(Some(v)))))
                        .ok_or(RECORD)?
                        .clone(),
                };
                record.insert(field.into(), Value::Array(list));
            }
            binding.insert("added".into(), Value::Object(record));
        }
        clean.push(Value::Object(binding));
    }
    let mut docs = Map::new();
    docs.insert("bindings".into(), Value::Array(clean));
    for key in ["checksum", "headerChecksum", "inlineChecksum"] {
        if let Some(sum) = get(given, key) {
            let fine = sum.as_str().is_some_and(|s| {
                (1..=8).contains(&s.len())
                    && s.bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            });
            if !fine {
                return fail("장치 Docs 소스 정보를 확인하세요.");
            }
            docs.insert(key.into(), sum.clone());
        }
    }
    Ok(Value::Object(docs))
}

/// A clean copy of a project (version 2), or the reason it cannot be used.
pub fn validate_project(given: &Value) -> R<Value> {
    let stripped = strip_unsupported_boards(given).map(|(data, _)| data);
    let data = stripped.as_ref().unwrap_or(given);
    let migrated = migrate_zs042(data)?;
    let data = migrated.as_ref().unwrap_or(data);
    let version =
        get(data, "version").filter(|v| matches!(num(v), Some(n) if n == 1.0 || n == 2.0));
    let (true, Some(FORMAT), Some(version)) = (truthy(data), text(get(data, "format")), version)
    else {
        return fail("지원하지 않는 회로 파일 형식입니다.");
    };
    let name = text(get(data, "name")).filter(|n| units(n) <= 120);
    let code = text(get(data, "code")).filter(|c| units(c) <= 300_000);
    let (Some(name), Some(code)) = (name, code) else {
        return fail("회로 이름 또는 코드가 올바르지 않습니다.");
    };
    let parts = get(data, "components")
        .and_then(Value::as_array)
        .filter(|l| l.len() <= 100);
    let wires = get(data, "wires")
        .and_then(Value::as_array)
        .filter(|l| l.len() <= 500);
    let (Some(parts), Some(wires)) = (parts, wires) else {
        return fail("부품 100개, 배선 500개까지 지원합니다.");
    };
    let board_id = get(data, "boardId");
    if board_id.is_some() && board(board_id).is_none() {
        return fail("지원하지 않는 보드입니다.");
    }
    let of_kind = |kind: &str| {
        parts
            .iter()
            .filter(|p| text(get(p, "type")) == Some(kind))
            .count()
    };
    if of_kind("breadboard") > 8 {
        return fail("추가 빵판은 8개까지 지원합니다.");
    }
    if of_kind("devboard") > MAX_DEVBOARDS {
        return fail(format!("보드는 {MAX_DEVBOARDS}개까지 추가할 수 있습니다."));
    }
    let boards = parts
        .iter()
        .filter(|p| text(get(p, "type")) == Some("devboard") && model_of(get(p, "model")).is_some())
        .count();
    if boards > 3 {
        return fail("STM32 보드는 한 회로에 4개까지 놓을 수 있습니다.");
    }
    let shown = get(data, "surfaces");
    let hidden = |surface: &str| {
        shown
            .and_then(|s| get(s, surface))
            .and_then(|s| get(s, "hidden"))
    };
    let anchors = Anchors {
        components: parts,
        board_hidden: hidden("board") == Some(&Value::Bool(true)),
        breadboard_hidden: hidden("breadboard").is_some_and(truthy),
    };
    let mut ids = HashSet::new();
    let mut components = Vec::with_capacity(parts.len());
    for p in parts {
        components.push(component(p, version, &anchors, &mut ids)?);
    }
    let mut wire_ids = HashSet::new();
    let mut joined = Vec::with_capacity(wires.len());
    for w in wires {
        joined.push(wire(w, &anchors, &components, &mut wire_ids)?);
    }
    // Sources are kept with \n line ends (a project saved before 1.43.0 may hold a CubeIDE file with \r\n).
    let mut project = Map::new();
    project.insert("format".into(), json!(FORMAT));
    project.insert("version".into(), json!(2));
    project.insert("name".into(), json!(name));
    project.insert("code".into(), json!(normalize_text(code)));
    project.insert("components".into(), Value::Array(components));
    project.insert("wires".into(), Value::Array(joined));
    if let Some(id) = board_id {
        project.insert("boardId".into(), id.clone());
    }
    if let Some(given) = shown {
        project.insert("surfaces".into(), surfaces(given)?);
    }
    if let Some(given) = get(data, "mcu") {
        let clean = if is_ra(get(given, "family")) {
            crate::raconfig::validate_ra_mcu(given)?
        } else {
            crate::mcuconfig::validate_mcu(&as_json(given))?
        };
        let default = json!(crate::boards::DEFAULT_BOARD_ID);
        let on = board(board_id.or(Some(&default))).ok_or(BROKEN)?;
        if clean.get("family") != on.get("mcuFamily") {
            return fail(format!(
                "{} 보드에는 {} 핀 설정이 필요합니다 ({}).",
                board_text(on, "name"),
                board_text(on, "mcuFamily"),
                show(clean.get("family"))
            ));
        }
        project.insert("mcu".into(), clean);
    }
    let ra = is_ra(project.get("mcu").and_then(|m| get(m, "family")));
    // What runs left in the RA data flash (feature 39, ra-data-flash.js): the programmed 4-byte units as
    // [{at, hex}]. It is not in `mcu` (the build's input), and an earlier app version opens the file without it.
    if let (Some(runs), true) = (get(data, "dataFlash"), ra) {
        if let Some(runs) = validate_data_flash(runs)?.filter(|r| !r.is_empty()) {
            project.insert("dataFlash".into(), Value::Array(runs));
        }
    }
    if let Some(given) = get(data, "firmware") {
        let clean = firmware(Some(given), code, project.get("mcu"))?;
        project.insert("firmware".into(), clean);
    }
    if let Some(given) = get(data, "simulation") {
        project.insert("simulation".into(), simulation(given)?);
    }
    if let Some(given) = get(data, "ide") {
        let clean = ide(given, project.get("firmware"))?;
        project.insert("ide".into(), clean);
    }
    if let Some(given) = get(data, "deviceDocs") {
        project.insert("deviceDocs".into(), device_docs(given)?);
    }
    Ok(Value::Object(project))
}

/// `JSON.stringify` of a value with the keys of every object in order: what two projects are compared by.
fn stable(v: &Value, text: &mut String) {
    match v {
        Value::Object(_) if num(v).is_some() => text.push_str("null"),
        Value::Object(o) => {
            let mut keys: Vec<&String> = o
                .iter()
                .filter(|(_, x)| there(Some(x)).is_some())
                .map(|(k, _)| k)
                .collect();
            keys.sort();
            text.push('{');
            for (i, key) in keys.iter().enumerate() {
                if i > 0 {
                    text.push(',');
                }
                text.push_str(&Value::String((*key).clone()).to_string());
                text.push(':');
                stable(&o[*key], text);
            }
            text.push('}');
        }
        Value::Array(items) => {
            text.push('[');
            for (i, item) in items.iter().enumerate() {
                if i > 0 {
                    text.push(',');
                }
                if there(Some(item)).is_some() {
                    stable(item, text);
                } else {
                    text.push_str("null");
                }
            }
            text.push(']');
        }
        Value::Number(n) => text.push_str(&js_number(n.as_f64().unwrap_or(f64::NAN))),
        other => text.push_str(&other.to_string()),
    }
}
/// Whether a project is more than the empty project of its board. It compares document contents, not the file-save
/// flag: saving does not make a circuit blank.
pub fn has_board_changes(project: &Value) -> R<bool> {
    let default = json!(crate::boards::DEFAULT_BOARD_ID);
    let normal = |p: &Value| -> R<String> {
        let mut q = validate_project(p)?;
        if q.get("boardId").is_none_or(Value::is_null) {
            q["boardId"] = default.clone();
        }
        if q.get("simulation").is_none_or(Value::is_null) {
            q["simulation"] = json!({"stepMs": 1, "pwmWaveform": false});
        }
        let mut text = String::new();
        stable(&q, &mut text);
        Ok(text)
    };
    let current = normal(project)?;
    let on = get(project, "boardId").filter(|id| !id.is_null());
    for base in [
        blank_project(None)?,
        start_project()?,
        project_for_board(on)?,
    ] {
        if current == normal(&base)? {
            return Ok(false);
        }
    }
    Ok(true)
}

/// One of this module's functions by name, with its arguments in order (`src/rust-core.js` `rustExact`).
pub fn call(name: &str, args: &[Value]) -> Option<Result<Value, String>> {
    let null = Value::Null;
    let a = |i: usize| there(args.get(i));
    let v = |i: usize| a(i).unwrap_or(&null);
    Some(match name {
        "blank_project" => blank_project(a(0)),
        "example_project" => example_project(),
        "start_project" => start_project(),
        "project_for_board" => project_for_board(a(0)),
        "validate_project" => validate_project(v(0)),
        // → {data, removed} when something was taken out, else {removed: null} (the project is as it was)
        "strip_unsupported_boards" => Ok(match strip_unsupported_boards(v(0)) {
            Some((data, removed)) => json!({"data": data, "removed": removed}),
            None => json!({"removed": null}),
        }),
        "removed_boards_message" => removed_boards_message(v(0)).map(|text| json!(text)),
        "has_board_changes" => has_board_changes(v(0)).map(|changed| json!(changed)),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_projects_pass_their_own_check() {
        for project in [
            blank_project(None).unwrap(),
            project_for_board(Some(&json!("nucleo-f103rb"))).unwrap(),
            project_for_board(Some(&json!("fpb-ra6e1"))).unwrap(),
            start_project().unwrap(),
            project_for_board(None).unwrap(),
            example_project().unwrap(),
        ] {
            let clean = validate_project(&project).unwrap();
            assert_eq!(clean["code"], project["code"]);
            assert_eq!(clean["mcu"]["family"], project["mcu"]["family"]);
        }
        let blank = blank_project(None).unwrap();
        assert!(blank["code"]
            .as_str()
            .unwrap()
            .contains("printf(\"HAL ready\\n\");"));
        assert!(!blank["code"]
            .as_str()
            .unwrap()
            .contains("uint8_t message[]"));
        assert_eq!(blank["mcu"]["peripherals"]["USART2"]["baud"], 115200);
        assert!(!has_board_changes(&blank).unwrap());
        assert!(!has_board_changes(&start_project().unwrap()).unwrap());
    }

    #[test]
    fn parts_and_wires_are_checked() {
        let mut project = project_for_board(None).unwrap();
        project["surfaces"]["breadboard"]["hidden"] = json!(false);
        project["components"] = json!([
            {"id": "r1", "type": "resistor", "name": "R1", "x": 700, "y": 200, "rotation": 0, "value": 330, "attachA": "bb:a1", "attachB": "bb:a5"},
            {"id": "led", "type": "led", "name": "LED", "x": 720, "y": 260, "rotation": 90, "color": "red"},
        ]);
        let hole = crate::pins::half_holes()[0]["id"]
            .as_str()
            .unwrap()
            .to_string();
        project["components"][0]["attachA"] = json!(hole);
        project["components"][0]
            .as_object_mut()
            .unwrap()
            .shift_remove("attachB");
        project["wires"] =
            json!([{"id": "w1", "from": "part:led:a", "to": "board:CN7:1", "color": "#23a68a"}]);
        let clean = validate_project(&project).unwrap();
        assert_eq!(clean["components"][0]["span"], 70);
        assert_eq!(clean["wires"][0]["to"], "board:CN7:1");
        assert!(has_board_changes(&project).unwrap());
        project["wires"][0]["to"] = json!("part:led:z");
        assert_eq!(
            validate_project(&project).unwrap_err(),
            "배선 정보가 올바르지 않습니다."
        );
        project["wires"] = json!([]);
        project["components"][1]["color"] = json!("pink");
        assert_eq!(
            validate_project(&project).unwrap_err(),
            "LED 색상이 올바르지 않습니다."
        );
    }

    #[test]
    fn unsupported_boards_leave_with_their_wires() {
        let mut project = project_for_board(None).unwrap();
        project["components"] = json!([
            {"id": "e1", "type": "devboard", "model": "esp32-devkit", "name": "ESP32-1", "x": 0, "y": 0, "rotation": 0},
            {"id": "led", "type": "led", "name": "LED", "x": 720, "y": 260, "rotation": 90, "color": "red", "attachA": "devboard:e1:GPIO2"},
        ]);
        project["wires"] = json!([{"id": "w1", "from": "devboard:e1:GND", "to": "part:led:b", "color": "#000000"}]);
        let (data, removed) = strip_unsupported_boards(&project).unwrap();
        assert_eq!(data["components"].as_array().unwrap().len(), 1);
        assert!(data["components"][0].get("attachA").is_none());
        assert_eq!(
            removed,
            json!({"boards": [{"id": "e1", "name": "ESP32-1", "model": "esp32-devkit"}], "wires": 1, "attachments": 1, "target": false})
        );
        assert!(removed_boards_message(&removed)
            .unwrap()
            .contains("보드 1개(ESP32-1)와 그 보드에 연결된 배선 1개를"));
        assert!(validate_project(&project).is_ok());
        assert!(strip_unsupported_boards(&blank_project(None).unwrap()).is_none());
    }

    #[test]
    fn the_small_checks() {
        assert!(
            valid_card_image(Some(&json!(""))) && valid_card_image(Some(&json!("SD1:64:AAA=")))
        );
        assert!(!valid_card_image(Some(&json!("SD1:32:AAA="))) && !valid_card_image(None));
        assert!(valid_camera_image(Some(&json!(
            "data:image/png;base64,AAAA"
        ))));
        assert!(!valid_camera_image(Some(&json!("data:image/png;base64,"))));
        assert_eq!(
            validate_data_flash(&json!([{"at": 0, "hex": "00112233"}, {"at": 4, "hex": "44556677"}, {"at": 16, "hex": "ffffffff"}])).unwrap().unwrap(),
            vec![json!({"at": 0, "hex": "0011223344556677"}), json!({"at": 16, "hex": "ffffffff"})]
        );
        assert!(validate_data_flash(&json!([{"at": 2, "hex": "00112233"}])).is_err());
        assert_eq!(validate_noise(&Value::Null).unwrap()["jitterNs"], 0);
        assert!(validate_noise(&json!({"glitchRate": 2})).is_err());
    }
}
